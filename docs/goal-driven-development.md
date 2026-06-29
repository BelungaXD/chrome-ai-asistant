# Goal-Driven Development Record

## Goal

Chrome Manifest V3 extension **Gemini AI Helper** — analyze visible web content with Google Gemini from a side panel.

## Intent Preservation Chain

- Vision: AI assistant for fast page and screenshot analysis without leaving the tab.
- Goal Impact: Typed prompts, page selection, images, and cropped screenshots reach Gemini in one side panel.
- System: Manifest V3 extension (no bundler).
- Feature: Side panel chat, context menu, screen cropper, image upload/drag-drop, voice input, settings hub, Gemini streaming, local request log, built-in extension help.
- Code: `manifest.json`, `background.js`, `content.js`, `sidepanel.*`, `popup.*`, `_locales/en/`, `README.md`.
- Validation: Static syntax checks + manual Chrome smoke tests.

## Acceptance Mapping

| Requirement | Implementation |
| --- | --- |
| Loads in Chrome developer mode | No-build MV3 folder; `chrome://extensions` → Load unpacked |
| Screen area selection | `content.js` Shadow DOM overlay → crop coords → `background.js` captures visible tab and crops |
| Crop attaches before send | `AI_ASSISTANT_ATTACHMENT_READY` → side panel composer; user sends via `AI_ASSISTANT_TEXT_PROMPT` |
| Gemini text/image prompts | `background.js` → `streamGenerateContent` SSE with non-streaming fallback |
| Answer language | `respondInPromptLanguage` prepended to user prompt |
| Layout isolation | Cropper in closed Shadow DOM; removed on complete or Escape |
| Context menu actions | Explain / translate / summarize on selection → immediate Gemini call |
| API key security | `chrome.storage.local` only; never in repo |
| Model resilience | Legacy model map, fallback model list, 429/503 retries |
| Extension help in chat | `extensionSystemInstruction` in `_locales/en` sent as Gemini system instruction |
| Restricted pages | i18n errors for `chrome://`, Web Store, `about:` tabs |
| Content script on old tabs | `ensureContentScript` via `chrome.scripting.executeScript` + `<all_urls>` |
| Page selection | `content.js` `AI_ASSISTANT_GET_SELECTION`; side panel passes browser-window tab id |
| Composer UI | Icon toolbar (crop, page text, upload, voice) with drag-drop zone |
| i18n | `_locales/en` only |

## Validation Commands

From project root:

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); for (const f of ['background.js','content.js','popup.js','sidepanel.js']) new Function(require('fs').readFileSync(f,'utf8')); console.log('static validation ok')"
git status --short --branch
```

## Manual Validation

- Load unpacked extension in Chrome.
- Save a Gemini API key in Settings → API settings.
- Send a typed prompt; confirm streaming.
- Context menu on selected text (all three actions).
- Capture screen area → image in composer → send with prompt.
- Upload/drop image; voice input if supported.
- Ask "How do I change the model?" — answer should match extension UI.
