const chat = document.querySelector('#chat');
const chatView = document.querySelector('#chatView');
const settingsView = document.querySelector('#settingsView');
const settingsHub = document.querySelector('#settingsHub');
const settingsButton = document.querySelector('#settingsButton');
const clearButton = document.querySelector('#clearButton');
const apiKeyInput = document.querySelector('#apiKeyInput');
const modelInput = document.querySelector('#modelInput');
const themeInput = document.querySelector('#themeInput');
const saveApiButton = document.querySelector('#saveApiButton');
const saveModelButton = document.querySelector('#saveModelButton');
const settingsMessage = document.querySelector('#settingsMessage');
const promptInput = document.querySelector('#promptInput');
const sendButton = document.querySelector('#sendButton');
const composerForm = document.querySelector('#composerForm');
const captureButton = document.querySelector('#captureButton');
const selectionButton = document.querySelector('#selectionButton');
const pageTextPreview = document.querySelector('#pageTextPreview');
const pageTextSnippet = document.querySelector('#pageTextSnippet');
const pageTextRemove = document.querySelector('#pageTextRemove');
const attachmentPreview = document.querySelector('#attachmentPreview');
const attachmentThumb = document.querySelector('#attachmentThumb');
const attachmentLabel = document.querySelector('#attachmentLabel');
const attachmentRemove = document.querySelector('#attachmentRemove');
const voiceButton = document.querySelector('#voiceButton');

let currentAnswer = '';
let activeRequestId = '';
let activeAssistantBubble = null;
let loadingBubble = null;
let pageText = null;
let pendingAttachment = null;
let isSending = false;
let settingsOpen = false;
let settingsSection = 'hub';
let hasApiKey = false;
let isListening = false;
let voiceBaseText = '';
let speechRecognition = null;
const DEFAULT_MODEL_FALLBACK = 'gemini-2.5-flash';

function t(key, substitutions) {
  return chrome.i18n.getMessage(key, substitutions) || key;
}

function applyI18n() {
  const uiLanguage = chrome.i18n.getUILanguage().split('-')[0];
  document.documentElement.lang = uiLanguage;
  document.title = t('extName');

  document.querySelector('#appTitle').textContent = t('extName');
  clearButton.setAttribute('aria-label', t('clearChat'));
  settingsButton.setAttribute('aria-label', t('settingsButtonLabel'));
  document.querySelector('#navApiLabel').textContent = t('settingsApiSection');
  document.querySelector('#navModelLabel').textContent = t('settingsModelSection');
  document.querySelector('#navThemeLabel').textContent = t('settingsThemeSection');
  document.querySelectorAll('.settings-back').forEach((button) => {
    button.textContent = t('backToSettingsHub');
  });
  document.querySelector('#settingsApiTitle').textContent = t('settingsApiSection');
  document.querySelector('#settingsModelTitle').textContent = t('settingsModelSection');
  document.querySelector('#settingsThemeTitle').textContent = t('settingsThemeSection');
  document.querySelector('#settingsIntro').textContent = t('settingsIntro');
  document.querySelector('#modelSectionIntro').textContent = t('modelSectionIntro');
  document.querySelector('#themeSectionIntro').textContent = t('themeSectionIntro');
  document.querySelector('#apiKeyLabel').textContent = t('apiKeyLabel');
  document.querySelector('#getApiKeyLink').textContent = t('getApiKeyLink');
  document.querySelector('#modelLabel').textContent = t('modelLabel');
  document.querySelector('#themeLabel').textContent = t('themeLabel');
  saveApiButton.textContent = t('saveSettings');
  saveModelButton.textContent = t('saveSettings');
  apiKeyInput.placeholder = t('apiKeyPlaceholder');
  themeInput.querySelector('option[value="dark"]').textContent = t('themeDark');
  themeInput.querySelector('option[value="light"]').textContent = t('themeLight');
  themeInput.querySelector('option[value="system"]').textContent = t('themeSystem');
  captureButton.textContent = t('selectOnPage');
  selectionButton.textContent = t('textFromPage');
  promptInput.placeholder = t('promptPlaceholder');
  sendButton.textContent = t('send');
  voiceButton.setAttribute('aria-label', t('voiceInput'));
  document.querySelector('#pageTextLabel').textContent = t('pageTextLabel');
  pageTextRemove.textContent = t('remove');
  attachmentRemove.textContent = t('remove');
}

applyI18n();
initSpeechRecognition();
initPanel();

async function initPanel() {
  await loadStoredSettings();
  await refreshKeyStatus();
  if (!hasApiKey) {
    openSettingsView('api');
  } else {
    promptInput.focus();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    stopVoiceInput();
  }
  if (document.visibilityState === 'visible' && !settingsOpen) {
    promptInput.focus();
    refreshKeyStatus();
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'AI_ASSISTANT_ATTACHMENT_READY') {
    setAttachment(message);
    appendChatAttachment(message.imageDataUrl);
    return;
  }

  if (message?.type === 'AI_ASSISTANT_STREAM_START') {
    hideLoading();
    activeRequestId = message.requestId;
    currentAnswer = '';
    if (!message.skipUserBubble) {
      const prompt = message.prompt?.trim();
      if (prompt && prompt !== '[Screenshot only]') {
        appendMessage('user', prompt);
      }
    }
    activeAssistantBubble = appendMessage('assistant', '');
  }

  if (message?.type === 'AI_ASSISTANT_STREAM_CHUNK' && message.requestId === activeRequestId) {
    currentAnswer += message.text;
    if (activeAssistantBubble) {
      activeAssistantBubble.innerHTML = formatMarkdown(currentAnswer);
      scrollChatToBottom();
    }
  }

  if (message?.type === 'AI_ASSISTANT_STREAM_END' && message.requestId === activeRequestId) {
    activeAssistantBubble = null;
    hideLoading();
    setSending(false);
  }

  if (message?.type === 'AI_ASSISTANT_ERROR') {
    removeEmptyAssistantBubble();
    hideLoading();
    setSending(false);
    appendMessage('error', message.error);
    if (message.error === t('missingApiKey') || /API key/i.test(message.error)) {
      openSettingsView('api');
    }
    return;
  }

  if (message?.type === 'AI_ASSISTANT_STREAM_ABORT' && message.requestId === activeRequestId) {
    removeEmptyAssistantBubble();
  }
});

composerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await sendPrompt();
});

promptInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendPrompt();
  }
});

voiceButton.addEventListener('click', () => {
  toggleVoiceInput();
});

document.querySelector('#clearButton').addEventListener('click', () => {
  currentAnswer = '';
  activeAssistantBubble = null;
  pageText = null;
  clearAttachment();
  updatePageTextUI();
  chat.querySelectorAll('.msg').forEach((node) => node.remove());
});

document.querySelector('#settingsButton').addEventListener('click', () => {
  if (settingsOpen) {
    closeSettingsView();
  } else {
    openSettingsView('hub');
  }
});

document.querySelectorAll('.settings-nav-item').forEach((button) => {
  button.addEventListener('click', () => {
    showSettingsSection(button.dataset.section);
  });
});

document.querySelectorAll('.settings-back').forEach((button) => {
  button.addEventListener('click', () => {
    showSettingsSection('hub');
  });
});

saveApiButton.addEventListener('click', () => savePartialSettings({ geminiApiKey: apiKeyInput.value.trim() }));
saveModelButton.addEventListener('click', () => savePartialSettings({ geminiModel: modelInput.value || DEFAULT_MODEL_FALLBACK }));

themeInput.addEventListener('change', () => {
  applyTheme(themeInput.value);
  savePartialSettings({ chatTheme: themeInput.value });
});

apiKeyInput.addEventListener('change', async () => {
  if (settingsOpen) {
    await populateModelSelect(modelInput.value || DEFAULT_MODEL_FALLBACK);
  }
});

async function savePartialSettings(partial) {
  settingsMessage.textContent = '';
  settingsMessage.classList.remove('success');

  try {
    const current = await chrome.runtime.sendMessage({ type: 'AI_ASSISTANT_GET_SETTINGS' });
    const response = await chrome.runtime.sendMessage({
      type: 'AI_ASSISTANT_SAVE_SETTINGS',
      settings: {
        geminiApiKey: partial.geminiApiKey ?? current.settings?.geminiApiKey ?? '',
        geminiModel: partial.geminiModel ?? current.settings?.geminiModel ?? DEFAULT_MODEL_FALLBACK,
        chatTheme: partial.chatTheme ?? current.settings?.chatTheme ?? 'dark',
        customPrompts: []
      }
    });
    if (!response?.ok) {
      throw new Error(response?.error || t('unableToSend'));
    }
    settingsMessage.textContent = t('settingsSaved');
    settingsMessage.classList.add('success');
    await refreshKeyStatus();
  } catch (error) {
    settingsMessage.textContent = error.message;
  }
}

function openSettingsView(section = 'hub') {
  settingsOpen = true;
  settingsView.classList.remove('hidden');
  settingsButton.classList.add('active');
  settingsButton.setAttribute('aria-label', t('backToChat'));
  showSettingsSection(section);
  loadSettingsForm();
}

function closeSettingsView() {
  settingsOpen = false;
  settingsSection = 'hub';
  settingsView.classList.add('hidden');
  settingsButton.classList.remove('active');
  settingsButton.setAttribute('aria-label', t('settingsButtonLabel'));
  settingsMessage.textContent = '';
  settingsMessage.classList.remove('success');
  showSettingsSection('hub');
  promptInput.focus();
}

function showSettingsSection(section) {
  settingsSection = section;
  const isHub = section === 'hub';
  settingsHub.classList.toggle('hidden', !isHub);
  settingsView.classList.toggle('settings-dropdown-detail', !isHub);
  document.querySelector('#settingsSectionApi').classList.toggle('hidden', section !== 'api');
  document.querySelector('#settingsSectionModel').classList.toggle('hidden', section !== 'model');
  document.querySelector('#settingsSectionTheme').classList.toggle('hidden', section !== 'theme');

  if (section === 'api') {
    apiKeyInput.focus();
  } else if (section === 'model') {
    populateModelSelect(modelInput.value || DEFAULT_MODEL_FALLBACK);
  }
}

async function loadStoredSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'AI_ASSISTANT_GET_SETTINGS' });
  if (!response?.ok) {
    return;
  }
  applyTheme(response.settings?.chatTheme || 'dark');
}

async function loadSettingsForm() {
  const response = await chrome.runtime.sendMessage({ type: 'AI_ASSISTANT_GET_SETTINGS' });
  if (!response?.ok) {
    settingsMessage.textContent = response?.error || t('unableToSend');
    return;
  }
  const { settings } = response;
  apiKeyInput.value = settings.geminiApiKey || '';
  themeInput.value = settings.chatTheme || 'dark';
  applyTheme(themeInput.value);
  await populateModelSelect(settings.geminiModel || DEFAULT_MODEL_FALLBACK);
}

function applyTheme(theme) {
  document.body.setAttribute('data-theme', theme || 'dark');
}

async function populateModelSelect(selectedModel) {
  const modelsResponse = await chrome.runtime.sendMessage({
    type: 'AI_ASSISTANT_LIST_MODELS',
    apiKey: apiKeyInput.value.trim()
  });
  const models = modelsResponse?.ok ? modelsResponse.models : [];
  const options = [...new Set(models)];
  if (selectedModel && !options.includes(selectedModel)) {
    options.unshift(selectedModel);
  }

  modelInput.textContent = '';
  for (const model of options) {
    const option = document.createElement('option');
    option.value = model;
    option.textContent = model;
    option.selected = model === selectedModel;
    modelInput.append(option);
  }

  if (!modelInput.value && options.length) {
    modelInput.value = options.includes(DEFAULT_MODEL_FALLBACK) ? DEFAULT_MODEL_FALLBACK : options[0];
  }
}

async function refreshKeyStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'AI_ASSISTANT_GET_SETTINGS' });
  if (!response?.ok) {
    return;
  }
  hasApiKey = Boolean(response.settings?.hasGeminiApiKey);
}

captureButton.addEventListener('click', async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const response = await chrome.runtime.sendMessage({
      type: 'AI_ASSISTANT_CAPTURE_AREA',
      tabId: tab?.id
    });
    if (!response?.ok) {
      throw new Error(response?.error || t('unableToSend'));
    }
  } catch (error) {
    appendMessage('error', error.message);
  }
});

selectionButton.addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'AI_ASSISTANT_GET_PAGE_SELECTION' });
    if (!response?.ok) {
      throw new Error(response?.error || t('noSelection'));
    }
    pageText = response.text;
    updatePageTextUI();
  } catch (error) {
    appendMessage('error', error.message);
  }
});

pageTextRemove.addEventListener('click', () => {
  pageText = null;
  updatePageTextUI();
});

attachmentRemove.addEventListener('click', () => {
  clearAttachment();
  chat.querySelectorAll('.msg-attach-draft').forEach((node) => node.closest('.msg')?.remove());
});

async function sendPrompt() {
  if (isSending) {
    appendMessage('error', t('waitPreviousRequest'));
    return;
  }

  stopVoiceInput();

  const prompt = promptInput.value.trim();
  if (!prompt && !pageText && !pendingAttachment) {
    return;
  }

  let composedPrompt = prompt;
  if (pageText) {
    const block = `[${t('pageTextBlock')}]\n${pageText}`;
    composedPrompt = composedPrompt ? `${composedPrompt}\n\n${block}` : block;
  }

  const imageDataUrl = pendingAttachment?.imageDataUrl || '';
  chat.querySelectorAll('.msg-attach-draft').forEach((node) => node.closest('.msg')?.remove());
  appendUserMessage(composedPrompt, imageDataUrl);

  setSending(true);
  promptInput.value = '';
  pageText = null;
  clearAttachment();
  updatePageTextUI();
  showLoading();

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_ASSISTANT_TEXT_PROMPT',
      prompt: composedPrompt,
      imageDataUrl,
      source: 'sidepanel'
    });
    if (!response?.ok) {
      hideLoading();
      setSending(false);
      return;
    }
  } catch (error) {
    hideLoading();
    setSending(false);
    appendMessage('error', error.message);
  }
}

function setAttachment(attachment) {
  pendingAttachment = attachment;
  updateAttachmentUI();
}

function clearAttachment() {
  pendingAttachment = null;
  updateAttachmentUI();
}

function updateAttachmentUI() {
  if (!pendingAttachment) {
    attachmentPreview.classList.add('hidden');
    return;
  }

  attachmentPreview.classList.remove('hidden');
  attachmentThumb.src = pendingAttachment.imageDataUrl;
  attachmentLabel.textContent = t('regionSelected', [
    String(pendingAttachment.width),
    String(pendingAttachment.height)
  ]);
}

function setSending(value) {
  isSending = value;
  sendButton.disabled = value;
  promptInput.disabled = value;
  captureButton.disabled = value;
  selectionButton.disabled = value;
  voiceButton.disabled = value;
  if (value) {
    stopVoiceInput();
  }
}

function getSpeechRecognitionLocale() {
  const ui = chrome.i18n.getUILanguage();
  if (ui.startsWith('ru')) {
    return 'ru-RU';
  }
  if (ui.startsWith('cs')) {
    return 'cs-CZ';
  }
  if (ui.startsWith('en')) {
    return 'en-US';
  }
  return ui;
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceButton.disabled = true;
    voiceButton.title = t('voiceNotSupported');
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.continuous = true;
  speechRecognition.interimResults = true;
  speechRecognition.lang = getSpeechRecognitionLocale();

  speechRecognition.onstart = () => {
    isListening = true;
    voiceButton.classList.add('listening');
    voiceButton.setAttribute('aria-pressed', 'true');
    voiceButton.setAttribute('aria-label', t('voiceListening'));
  };

  speechRecognition.onend = () => {
    isListening = false;
    voiceButton.classList.remove('listening');
    voiceButton.setAttribute('aria-pressed', 'false');
    voiceButton.setAttribute('aria-label', t('voiceInput'));
  };

  speechRecognition.onerror = (event) => {
    if (event.error === 'aborted' || event.error === 'no-speech') {
      return;
    }
    if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
      appendMessage('error', t('voicePermissionDenied'));
      return;
    }
    appendMessage('error', t('voiceError'));
  };

  speechRecognition.onresult = (event) => {
    let interim = '';
    let final = '';

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) {
        final += transcript;
      } else {
        interim += transcript;
      }
    }

    if (final) {
      const spacer = voiceBaseText && !voiceBaseText.endsWith(' ') ? ' ' : '';
      voiceBaseText = `${voiceBaseText}${spacer}${final}`.trimStart();
    }

    const interimSpacer = voiceBaseText && interim && !voiceBaseText.endsWith(' ') ? ' ' : '';
    promptInput.value = `${voiceBaseText}${interim ? `${interimSpacer}${interim}` : ''}`;
  };
}

function toggleVoiceInput() {
  if (!speechRecognition || isSending) {
    return;
  }

  if (isListening) {
    stopVoiceInput();
    return;
  }

  voiceBaseText = promptInput.value.trim();
  speechRecognition.lang = getSpeechRecognitionLocale();

  try {
    speechRecognition.start();
  } catch {
    stopVoiceInput();
    appendMessage('error', t('voiceError'));
  }
}

function stopVoiceInput() {
  if (!speechRecognition || !isListening) {
    return;
  }

  try {
    speechRecognition.stop();
  } catch {
    isListening = false;
    voiceButton.classList.remove('listening');
    voiceButton.setAttribute('aria-pressed', 'false');
    voiceButton.setAttribute('aria-label', t('voiceInput'));
  }
}

function showLoading() {
  hideLoading();
  loadingBubble = document.createElement('div');
  loadingBubble.className = 'msg msg-loading';
  loadingBubble.textContent = t('thinking');
  chat.append(loadingBubble);
  scrollChatToBottom();
}

function hideLoading() {
  loadingBubble?.remove();
  loadingBubble = null;
}

function removeEmptyAssistantBubble() {
  if (activeAssistantBubble && !activeAssistantBubble.textContent.trim()) {
    activeAssistantBubble.remove();
  }
  activeAssistantBubble = null;
}

function appendChatAttachment(imageDataUrl) {
  appendUserMessage('', imageDataUrl, true);
}

function appendUserMessage(text, imageDataUrl = '', isDraft = false) {
  const message = document.createElement('div');
  message.className = 'msg msg-user';

  if (imageDataUrl) {
    const img = document.createElement('img');
    img.className = isDraft ? 'msg-attach msg-attach-draft' : 'msg-attach';
    img.src = imageDataUrl;
    img.alt = t('analyzeImagePrompt');
    message.append(img);
  }

  if (text) {
    const content = document.createElement('div');
    content.textContent = text;
    message.append(content);
  }

  chat.append(message);
  scrollChatToBottom();
}

function appendMessage(role, text) {
  const message = document.createElement('div');
  if (role === 'user') {
    message.className = 'msg msg-user';
    message.textContent = text;
  } else if (role === 'error') {
    message.className = 'msg msg-error';
    message.textContent = text;
  } else {
    message.className = 'msg msg-assistant';
    message.innerHTML = formatMarkdown(text);
  }

  chat.append(message);
  scrollChatToBottom();
  return message;
}

function formatMarkdown(text) {
  if (!text) {
    return '';
  }

  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function scrollChatToBottom() {
  chat.scrollTop = chat.scrollHeight;
}

function updatePageTextUI() {
  if (!pageText) {
    pageTextPreview.classList.add('hidden');
    return;
  }

  pageTextPreview.classList.remove('hidden');
  const snippet = pageText.length > 200 ? `${pageText.slice(0, 200)}…` : pageText;
  pageTextSnippet.textContent = snippet;
}
