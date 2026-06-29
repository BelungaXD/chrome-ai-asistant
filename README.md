# Gemini AI Helper

Manifest V3 Chrome extension for analyzing web pages with Google Gemini. Send typed prompts, selected text, uploaded images, or cropped screen areas — answers stream in the side panel.

**Version:** 0.1.1

## Install

1. Clone the repo (GitHub name has a typo — `chrome-ai-asistant`):
   ```bash
   git clone https://github.com/BelungaXD/chrome-ai-asistant.git chrome-ai-assistant
   cd chrome-ai-assistant
   ```
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top right).
4. Click **Load unpacked** and select the `chrome-ai-assistant` folder.
5. Click the extension icon to open the **side panel**.
6. Open **Settings → API settings**, paste a [Gemini API key](https://aistudio.google.com/apikey), and save.

The API key is stored only in `chrome.storage.local` on your machine — never commit it.

## Features

- **Side panel chat** — streaming Gemini responses, markdown rendering, clear chat, composer with attachments.
- **Context menu** — right-click selected text: explain, translate, summarize (sends immediately).
- **Screen capture** — crop a page area (`Alt+Shift+A` or capture button); image attaches to the composer so you can add a prompt before sending.
- **Page text** — attach the current text selection from the browser window tab (not the side panel).
- **Images** — upload button or drag-and-drop onto the composer toolbar.
- **Voice input** — dictate prompts when the browser supports `SpeechRecognition`.
- **Settings hub** — API key, model picker (live list from Gemini API with static fallbacks), chat theme (dark / light / system).
- **Built-in help** — Gemini receives a system instruction with extension usage docs; ask in chat how to configure the extension.
- **Resilience** — retries and model fallbacks on 429/503; non-streaming fallback when SSE returns no text.
- **Restricted-page guards** — clear errors on `chrome://`, Web Store, and other internal tabs.
- **i18n** — Chrome `_locales/en` (English UI strings and help text).

## Usage

| Action | How |
| --- | --- |
| Open assistant | Click the extension icon |
| Send a prompt | Type in the composer and press Send (or Enter) |
| Explain / translate / summarize | Select text → right-click → Gemini action |
| Capture screen area | `Alt+Shift+A` or crop icon → drag rectangle → optional prompt → Send |
| Attach page selection | Select text on page → list icon (**Select on page**) in the composer |
| Upload image | Image icon or drag-and-drop onto the composer toolbar |
| Voice input | Microphone icon in the composer |
| Extension options page | `chrome://extensions` → **Details** → **Extension options** (`popup.html`) |
| Ask how the extension works | Type a question in chat (e.g. "How do I set the API key?") |

Page tools (capture, selection) target the active tab in the **browser window** that owns the side panel — not internal Chrome pages (`chrome://`, Web Store, etc.).

## Architecture

| File | Role |
| --- | --- |
| `manifest.json` | Manifest V3: permissions, `<all_urls>` for on-demand scripting, ES module service worker, side panel, content script, keyboard command |
| `background.js` | Context menus, Gemini streaming API, screenshot capture/crop, settings, request log, model listing, system instruction |
| `content.js` | Shadow DOM crop overlay; `GET_SELECTION` helper; injected on demand via `scripting` when needed |
| `sidepanel.*` | Chat UI, icon composer toolbar, settings hub, attachments, voice input, theme |
| `popup.*` | Standalone options page for API key and model |
| `_locales/en/` | UI strings and `extensionSystemInstruction` help text |

No build step — load the folder directly in Chrome developer mode.

## Default model

`gemini-2.5-flash`. Legacy names (`gemini-1.5-flash`, `gemini-1.5-pro`) migrate automatically. Change in **Settings → AI model** or the options page.

## Validation

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); for (const f of ['background.js','content.js','popup.js','sidepanel.js']) new Function(require('fs').readFileSync(f,'utf8')); console.log('static validation ok')"
```

Manual checks:

- Load unpacked, save a real API key.
- Send a typed prompt; confirm streaming output.
- Context menu on selected text.
- Capture area → image in composer → send with prompt.
- Image upload and voice input (if supported).
- Ask an extension-help question in chat.

See `docs/goal-driven-development.md` for spec trace and acceptance mapping.
