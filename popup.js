const apiKeyInput = document.querySelector('#apiKey');
const modelInput = document.querySelector('#model');
const keyStatus = document.querySelector('#keyStatus');
const message = document.querySelector('#message');
const DEFAULT_MODEL = 'gemini-2.5-flash';

function t(key) {
  return chrome.i18n.getMessage(key) || key;
}

document.querySelector('#settingsIntro').textContent = t('settingsIntro');
document.querySelector('#apiKeyLabel').textContent = t('apiKeyLabel');
document.querySelector('#getApiKeyLink').textContent = t('getApiKeyLink');
document.querySelector('#modelLabel').textContent = t('modelLabel');
document.querySelector('#saveSettingsButton').textContent = t('saveSettings');
apiKeyInput.placeholder = t('apiKeyPlaceholder');

document.querySelector('#saveSettingsButton').addEventListener('click', saveSettings);
apiKeyInput.addEventListener('change', async () => {
  await populateModelSelect(modelInput.value);
});
loadSettings();

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({ type: 'AI_ASSISTANT_GET_SETTINGS' });
  if (!response?.ok) {
    message.textContent = response?.error || t('unableToSend');
    return;
  }
  const { settings } = response;
  apiKeyInput.value = settings.geminiApiKey || '';
  await populateModelSelect(settings.geminiModel || DEFAULT_MODEL);
  updateKeyStatus(settings.hasGeminiApiKey);
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
    modelInput.value = options.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : options[0];
  }
}

async function saveSettings() {
  message.textContent = '';
  message.classList.remove('success');

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_ASSISTANT_SAVE_SETTINGS',
      settings: {
        geminiApiKey: apiKeyInput.value.trim(),
        geminiModel: modelInput.value || DEFAULT_MODEL,
        customPrompts: []
      }
    });
    if (!response?.ok) {
      throw new Error(response?.error || t('unableToSend'));
    }
    message.textContent = t('settingsSaved');
    message.classList.add('success');
    await loadSettings();
  } catch (error) {
    message.textContent = error.message;
  }
}

function updateKeyStatus(ready) {
  keyStatus.textContent = ready ? t('keyStatusReady') : t('keyStatusMissing');
  keyStatus.classList.toggle('ready', ready);
}
