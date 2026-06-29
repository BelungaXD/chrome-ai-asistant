const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';
const FALLBACK_MODELS = ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.5-flash-lite'];
const RETRYABLE_STATUSES = new Set([429, 503]);
const MAX_RETRIES_PER_MODEL = 3;
const LEGACY_MODEL_MAP = {
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro'
};
const STATIC_MODEL_OPTIONS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-flash-latest'
];
const HISTORY_LIMIT = 30;

chrome.runtime.onInstalled.addListener(async () => {
  setupContextMenus();
  await setupSidePanelBehavior();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
  setupSidePanelBehavior();
});

async function setupSidePanelBehavior() {
  if (chrome.sidePanel?.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'ai-assistant-explain',
      title: chrome.i18n.getMessage('contextExplain'),
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'ai-assistant-translate',
      title: chrome.i18n.getMessage('contextTranslate'),
      contexts: ['selection']
    });
    chrome.contextMenus.create({
      id: 'ai-assistant-summarize',
      title: chrome.i18n.getMessage('contextSummarize'),
      contexts: ['selection']
    });
  });
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'capture-area') return;
  const tab = await resolveCaptureTab();
  if (tab?.id) {
    await startAreaCapture(tab);
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !info.selectionText) return;
  const actionMap = {
    'ai-assistant-explain': 'Explain the selected text clearly.',
    'ai-assistant-translate': 'Translate the selected text. Preserve meaning and formatting.',
    'ai-assistant-summarize': 'Summarize the selected text concisely.'
  };
  await openPanel(tab);
  await sendToGemini({
    tabId: tab.id,
    prompt: `${actionMap[info.menuItemId] || 'Analyze the selected text.'}\n\n${info.selectionText}`,
    source: 'context-menu'
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === 'AI_ASSISTANT_CAPTURE_AREA') {
      const tab = await resolveCaptureTab(message.tabId);
      await startAreaCapture(tab, message.prompt);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'AI_ASSISTANT_TEXT_PROMPT') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await sendToGemini({
        tabId: tab?.id,
        prompt: message.prompt,
        imageDataUrl: message.imageDataUrl || '',
        source: message.source || 'popup'
      });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'AI_ASSISTANT_CROP_READY') {
      await handleCrop(message, sender);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'AI_ASSISTANT_GET_SETTINGS') {
      const settings = await getSettings();
      sendResponse({ ok: true, settings: sanitizeSettings(settings) });
      return;
    }

    if (message?.type === 'AI_ASSISTANT_LIST_MODELS') {
      const settings = await getSettings();
      const apiKey = message.apiKey?.trim() || settings.geminiApiKey;
      const models = await listAvailableModels(apiKey);
      sendResponse({ ok: true, models });
      return;
    }

    if (message?.type === 'AI_ASSISTANT_SAVE_SETTINGS') {
      const current = await getSettings();
      await chrome.storage.local.set({
        geminiApiKey: message.settings?.geminiApiKey ?? current.geminiApiKey,
        geminiModel: message.settings?.geminiModel ?? current.geminiModel,
        chatTheme: message.settings?.chatTheme ?? current.chatTheme,
        customPrompts: message.settings?.customPrompts ?? current.customPrompts
      });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === 'AI_ASSISTANT_GET_HISTORY') {
      const { history = [] } = await chrome.storage.local.get('history');
      sendResponse({ ok: true, history });
      return;
    }

    if (message?.type === 'AI_ASSISTANT_GET_PAGE_SELECTION') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) {
        throw new Error('No active tab is available.');
      }
      const restrictedMessage = getRestrictedTabMessage(tab.url);
      if (restrictedMessage) {
        throw new Error(restrictedMessage);
      }
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => window.getSelection()?.toString()?.trim() || ''
      });
      if (!result) {
        throw new Error(chrome.i18n.getMessage('noSelection'));
      }
      sendResponse({ ok: true, text: result });
    }
  })().catch((error) => {
    postPanelMessage({ type: 'AI_ASSISTANT_ERROR', error: error.message });
    sendResponse({ ok: false, error: error.message });
  });
  return true;
});

async function resolveCaptureTab(tabId) {
  let tab;
  if (tabId) {
    tab = await chrome.tabs.get(tabId);
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = activeTab;
  }
  if (!tab?.id) {
    throw new Error('No active tab is available.');
  }
  const restrictedMessage = getRestrictedTabMessage(tab.url);
  if (restrictedMessage) {
    throw new Error(restrictedMessage);
  }
  return tab;
}

function getRestrictedTabMessage(url = '') {
  if (!url || url.startsWith('about:')) {
    return 'Screen capture needs a normal website tab. Open a page and try again.';
  }
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('https://chromewebstore.google.com')
  ) {
    return 'Screen capture does not work on browser internal pages. Open a normal website tab first.';
  }
  return '';
}

async function ensureContentScript(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'AI_ASSISTANT_PING' });
    if (response?.ok) {
      return;
    }
  } catch {
    // Content script is not loaded on this tab yet.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
}

async function startAreaCapture(tab, prompt = '') {
  await ensureContentScript(tab.id);
  await chrome.tabs.sendMessage(tab.id, {
    type: 'AI_ASSISTANT_START_CAPTURE',
    prompt
  });
}

async function handleCrop(message, sender) {
  const windowId = sender.tab?.windowId;
  const tabId = sender.tab?.id;
  if (!windowId) throw new Error('Unable to identify the active window for screenshot capture.');
  const screenshot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const croppedImage = await cropDataUrl(screenshot, message.rect, message.viewport);
  postPanelMessage({
    type: 'AI_ASSISTANT_ATTACHMENT_READY',
    imageDataUrl: croppedImage,
    width: Math.round(message.rect.width),
    height: Math.round(message.rect.height)
  });
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: 'AI_ASSISTANT_CAPTURE_DONE' }).catch(() => {});
  }
}

async function cropDataUrl(dataUrl, rect, viewport) {
  const bitmap = await createImageBitmap(await (await fetch(dataUrl)).blob());
  const scaleX = bitmap.width / viewport.width;
  const scaleY = bitmap.height / viewport.height;
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(rect.width * scaleX)), Math.max(1, Math.round(rect.height * scaleY)));
  const context = canvas.getContext('2d');
  context.drawImage(
    bitmap,
    Math.round(rect.left * scaleX),
    Math.round(rect.top * scaleY),
    Math.round(rect.width * scaleX),
    Math.round(rect.height * scaleY),
    0,
    0,
    canvas.width,
    canvas.height
  );
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(blob);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function sendToGemini({ tabId, prompt, imageDataUrl, source }) {
  const settings = await getSettings();
  if (!settings.geminiApiKey) {
    throw new Error(chrome.i18n.getMessage('missingApiKey'));
  }

  let effectivePrompt = prompt?.trim() || '';
  if (!effectivePrompt && imageDataUrl) {
    effectivePrompt = chrome.i18n.getMessage('analyzeImagePrompt');
  }
  if (!effectivePrompt && !imageDataUrl) {
    throw new Error('Enter a question or select an area before sending.');
  }
  if (effectivePrompt) {
    effectivePrompt = `${chrome.i18n.getMessage('respondInPromptLanguage')}\n\n${effectivePrompt}`;
  }

  const requestId = crypto.randomUUID();
  const startedAt = new Date().toISOString();
  postPanelMessage({
    type: 'AI_ASSISTANT_STREAM_START',
    requestId,
    prompt: prompt?.trim() || effectivePrompt,
    source,
    startedAt,
    skipUserBubble: source === 'sidepanel'
  });

  const parts = [];
  if (effectivePrompt) parts.push({ text: effectivePrompt });
  if (imageDataUrl) {
    parts.push({
      inline_data: {
        mime_type: 'image/png',
        data: imageDataUrl.split(',')[1]
      }
    });
  }

  const requestBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      temperature: 0.3
    }
  };

  let answer = '';
  try {
    answer = await generateGeminiAnswer(settings, requestBody, requestId);
  } catch (error) {
    postPanelMessage({ type: 'AI_ASSISTANT_STREAM_ABORT', requestId });
    throw error;
  }

  if (!answer.trim()) {
    answer = '[No text response returned by Gemini.]';
    postPanelMessage({ type: 'AI_ASSISTANT_STREAM_CHUNK', requestId, text: answer });
  }

  const historyItem = {
    id: requestId,
    source,
    prompt: prompt?.trim() || effectivePrompt || '[Screenshot only]',
    answer,
    imageDataUrl: imageDataUrl || '',
    createdAt: startedAt
  };
  await appendHistory(historyItem);
  postPanelMessage({ type: 'AI_ASSISTANT_STREAM_END', requestId, historyItem });

  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: 'AI_ASSISTANT_CAPTURE_DONE' }).catch(() => {});
  }
}

async function generateGeminiAnswer(settings, requestBody, requestId) {
  const models = getModelsToTry(settings.geminiModel || DEFAULT_MODEL);
  let lastError = null;

  for (const model of models) {
    for (let attempt = 0; attempt < MAX_RETRIES_PER_MODEL; attempt++) {
      try {
        return await streamGeminiAnswer(settings.geminiApiKey, model, requestBody, requestId);
      } catch (error) {
        lastError = error;
        if (!RETRYABLE_STATUSES.has(error.status) || attempt === MAX_RETRIES_PER_MODEL - 1) {
          break;
        }
        await waitMs(1000 * (attempt + 1));
      }
    }
  }

  throw lastError || new Error(chrome.i18n.getMessage('geminiUnavailable503'));
}

function getModelsToTry(primaryModel) {
  return [...new Set([primaryModel, ...FALLBACK_MODELS])];
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function streamGeminiAnswer(apiKey, model, requestBody, requestId) {
  const streamEndpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(streamEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(formatGeminiError(response.status, errorText));
    error.status = response.status;
    throw error;
  }

  let answer = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const text = parseSseLine(line);
      if (!text) continue;
      answer += text;
      postPanelMessage({ type: 'AI_ASSISTANT_STREAM_CHUNK', requestId, text });
    }
  }

  if (!answer.trim()) {
    answer = await fetchGeminiNonStreaming(apiKey, model, requestBody);
    if (answer.trim()) {
      postPanelMessage({ type: 'AI_ASSISTANT_STREAM_CHUNK', requestId, text: answer });
    }
  }

  return answer;
}

function formatGeminiError(status, errorText) {
  if (status === 503) {
    return chrome.i18n.getMessage('geminiUnavailable503');
  }
  if (status === 429) {
    return chrome.i18n.getMessage('geminiRateLimited');
  }
  return `Gemini API error ${status}: ${errorText.slice(0, 300)}`;
}

async function fetchGeminiNonStreaming(apiKey, model, requestBody) {
  const endpoint = `${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(formatGeminiError(response.status, errorText));
    error.status = response.status;
    throw error;
  }
  const json = await response.json();
  return json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
}

function parseSseLine(line) {
  if (!line.startsWith('data:')) return '';
  const payload = line.slice(5).trim();
  if (!payload || payload === '[DONE]') return '';
  try {
    const json = JSON.parse(payload);
    return json.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '';
  } catch {
    return '';
  }
}

async function appendHistory(item) {
  const { history = [] } = await chrome.storage.local.get('history');
  await chrome.storage.local.set({
    history: [item, ...history].slice(0, HISTORY_LIMIT)
  });
}

async function listAvailableModels(apiKey) {
  if (!apiKey) {
    return [...STATIC_MODEL_OPTIONS];
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    if (!response.ok) {
      return [...STATIC_MODEL_OPTIONS];
    }

    const json = await response.json();
    const models = (json.models || [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => model.name.replace(/^models\//, ''))
      .filter((name) => !/(embedding|tts|imagen|veo|lyria|computer-use|deep-research)/i.test(name))
      .sort();

    return models.length ? models : [...STATIC_MODEL_OPTIONS];
  } catch {
    return [...STATIC_MODEL_OPTIONS];
  }
}

async function getSettings() {
  const settings = await chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'chatTheme', 'customPrompts']);
  const geminiModel = LEGACY_MODEL_MAP[settings.geminiModel] || settings.geminiModel || DEFAULT_MODEL;
  if (settings.geminiModel && geminiModel !== settings.geminiModel) {
    await chrome.storage.local.set({ geminiModel });
  }
  return {
    geminiApiKey: settings.geminiApiKey || '',
    geminiModel,
    chatTheme: settings.chatTheme || 'dark',
    customPrompts: Array.isArray(settings.customPrompts) ? settings.customPrompts : []
  };
}

function sanitizeSettings(settings) {
  return {
    ...settings,
    hasGeminiApiKey: Boolean(settings.geminiApiKey),
    geminiApiKey: settings.geminiApiKey
  };
}

async function openPanel(tab) {
  if (chrome.sidePanel?.open && tab?.windowId) {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
}

function postPanelMessage(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}
