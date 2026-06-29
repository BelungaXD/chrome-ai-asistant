# Goal-Driven Development Record

## Goal

Implement `/home/ssf/Documents/Github/AIAssistant.md` as a Chrome extension in `/home/ssf/Documents/Github/chrome-ai-assistant` and initialize the folder as a git repository.

## Intent Preservation Chain

- Vision: AI Assistant helps users analyze visible web content with Gemini.
- Goal Impact: Users can submit typed text, selected text, or a cropped screenshot without leaving the current tab.
- System: Chrome Manifest V3 extension.
- Feature: Popup, side panel, context menu, screenshot cropper, Gemini API integration, local history, prompt template storage.
- Task: Create the repo implementation from the spec.
- Execution Plan: Keep implementation framework-free and directly loadable through `chrome://extensions`.
- Coding Prompt: Build the extension components listed in the spec and preserve API key security through local Chrome storage.
- Code: `manifest.json`, `background.js`, `content.js`, `popup.*`, `sidepanel.*`, `README.md`.
- Validation: Static JSON parse and JavaScript syntax checks; Chrome manual load test is still required in a browser profile.

## Parallel Execution

| Workstream | Status | Owner | Scope | Shared Files | Validation |
| --- | --- | --- | --- | --- | --- |
| UI popup and side panel | ready_parallel | UI sub-agent | Review UI expectations and hand off checklist | None, handoff only | Manual popup/side panel smoke test |
| Gemini service worker | ready_parallel | Background sub-agent | Review API/context menu expectations and hand off checklist | None, handoff only | Syntax check and API error handling review |
| Screenshot content tool | ready_parallel | Screenshot sub-agent | Review cropper expectations and hand off checklist | None, handoff only | Manual page overlay/crop test |
| Integration | final integration | Orchestrator | Write files, validate, git status | All implementation files | Static validation |

## Acceptance Mapping

- Extension installs in Chrome developer mode: implementation is no-build Manifest V3; manual Chrome load still required.
- Screen area selection: `content.js` overlay sends crop coordinates; `background.js` captures and crops the visible tab.
- Gemini answers image/text prompts: `background.js` sends text and PNG inline data to Gemini streaming endpoint.
- Answer language follows user request: default prompt asks to use request language or Russian by default.
- Site layout isolation: cropper uses a Shadow DOM root and removes itself on completion or Escape.

## Validation Commands

Run from `/home/ssf/Documents/Github/chrome-ai-assistant`:

```bash
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); for (const f of ['background.js','content.js','popup.js','sidepanel.js']) new Function(require('fs').readFileSync(f,'utf8')); console.log('static validation ok')"
git status --short --branch
```

## Manual Validation Still Needed

- Load unpacked extension in Chrome.
- Save a real Gemini API key.
- Submit a typed prompt.
- Select text on a page and run each context menu action.
- Capture a screen area and confirm Gemini receives the cropped image.
