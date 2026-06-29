# AI Assistant Chrome Extension

Manifest V3 Chrome extension for sending text selections, typed prompts, and cropped page screenshots to Gemini.

## Install

1. Clone the repo (or use this folder after `git pull`):
   ```bash
   git clone https://github.com/BelungaXD/chrome-ai-asistant.git chrome-ai-assistant
   cd chrome-ai-assistant
   ```
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `chrome-ai-assistant` folder.
5. Click the extension icon to open the side panel, go to **Settings**, add a [Gemini API key](https://aistudio.google.com/apikey), and save.

> **Note:** The GitHub repo name is `chrome-ai-asistant` (typo in the URL). The extension stores your API key locally in Chrome — never commit it.

## Features

- Popup with prompt input, API key/model settings, and screen-area capture.
- Context menu actions for selected text: explain, translate, summarize.
- Side panel response view with streaming Gemini output.
- Cropped screenshot capture through an isolated content-script overlay.
- Local request history, limited to the latest 30 items.
- Prompt template storage scaffold in `chrome.storage.local`.

## Architecture

- `manifest.json` configures Manifest V3 permissions, popup, service worker, side panel, content script, and keyboard command.
- `background.js` owns context menus, side panel opening, Gemini calls, screenshot capture, image cropping, streaming, settings, and history.
- `content.js` owns the page overlay and crop rectangle UX in a Shadow DOM root.
- `popup.*` owns API key/model settings and prompt submission.
- `sidepanel.*` owns streamed answer rendering, copy action, and history display.

## Intent Preservation

- Vision: Chrome AI assistant for fast page and screenshot analysis.
- Goal Impact: Reduce friction when asking Gemini about selected text or visual page regions.
- System: Manifest V3 extension with popup, content script, service worker, side panel, and local storage.
- Feature: Text prompts, context-menu actions, screen-area capture, Gemini responses, local history.
- Task: Implement the MVP from `/home/ssf/Documents/Github/AIAssistant.md` in `chrome-ai-assistant`.
- Execution Plan: Build a no-bundler extension so the repo folder is directly loadable in Chrome developer mode.
- Coding Prompt: Implement files with isolated UI, local key storage, Gemini API calls, and validation notes.
- Code: This repository.
- Validation: See `docs/goal-driven-development.md`.

## Notes

The default model is `gemini-1.5-flash` because the source specification names it as the example MVP model. The model field is editable in the popup so it can be changed if Google updates the preferred free Gemini model.
