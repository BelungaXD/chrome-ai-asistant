let overlayState = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'AI_ASSISTANT_PING') {
    sendResponse({ ok: true });
    return false;
  }
  if (message?.type === 'AI_ASSISTANT_GET_SELECTION') {
    sendResponse({
      ok: true,
      text: window.getSelection()?.toString()?.trim() || ''
    });
    return false;
  }
  if (message?.type === 'AI_ASSISTANT_START_CAPTURE') {
    startCapture(message.prompt || '');
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === 'AI_ASSISTANT_CAPTURE_DONE') {
    cleanup();
    sendResponse({ ok: true });
    return true;
  }
  return false;
});

function startCapture(prompt) {
  cleanup();

  const root = document.createElement('div');
  root.id = 'ai-assistant-capture-root';
  const shadow = root.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      cursor: crosshair;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .veil {
      position: fixed;
      inset: 0;
      background: rgba(11, 18, 32, 0.28);
      backdrop-filter: saturate(0.85);
    }
    .selection {
      position: fixed;
      border: 2px solid #22c55e;
      background: rgba(34, 197, 94, 0.12);
      box-shadow: 0 0 0 9999px rgba(11, 18, 32, 0.36);
      display: none;
    }
    .toolbar {
      position: fixed;
      left: 16px;
      top: 16px;
      display: flex;
      gap: 8px;
      align-items: center;
      padding: 10px 12px;
      color: #f8fafc;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.28);
      border-radius: 8px;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28);
      font-size: 13px;
      line-height: 1.4;
      user-select: none;
    }
    button {
      appearance: none;
      border: 1px solid rgba(248, 250, 252, 0.22);
      border-radius: 6px;
      color: #f8fafc;
      background: transparent;
      padding: 5px 8px;
      font: inherit;
      cursor: pointer;
    }
    button:hover {
      background: rgba(248, 250, 252, 0.12);
    }
  `;

  const veil = document.createElement('div');
  veil.className = 'veil';
  const selection = document.createElement('div');
  selection.className = 'selection';
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = '<span>Drag to select an area. Press Esc to cancel.</span><button type="button">Cancel</button>';
  toolbar.querySelector('button').addEventListener('click', cleanup);

  shadow.append(style, veil, selection, toolbar);
  document.documentElement.append(root);

  overlayState = {
    root,
    selection,
    prompt,
    startX: 0,
    startY: 0,
    active: false
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('pointermove', onPointerMove, true);
  root.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('keydown', onKeyDown, true);
}

function onPointerDown(event) {
  if (!overlayState) return;
  event.preventDefault();
  overlayState.active = true;
  overlayState.startX = event.clientX;
  overlayState.startY = event.clientY;
  drawSelection(event.clientX, event.clientY);
}

function onPointerMove(event) {
  if (!overlayState?.active) return;
  event.preventDefault();
  drawSelection(event.clientX, event.clientY);
}

async function onPointerUp(event) {
  if (!overlayState?.active) return;
  event.preventDefault();
  overlayState.active = false;
  const rect = getNormalizedRect(overlayState.startX, overlayState.startY, event.clientX, event.clientY);
  if (rect.width < 8 || rect.height < 8) {
    cleanup();
    return;
  }

  const prompt = overlayState.prompt;
  cleanup();
  await chrome.runtime.sendMessage({
    type: 'AI_ASSISTANT_CROP_READY',
    prompt,
    rect,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio
    }
  });
}

function onKeyDown(event) {
  if (event.key === 'Escape') {
    cleanup();
  }
}

function drawSelection(currentX, currentY) {
  const rect = getNormalizedRect(overlayState.startX, overlayState.startY, currentX, currentY);
  Object.assign(overlayState.selection.style, {
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  });
}

function getNormalizedRect(x1, y1, x2, y2) {
  return {
    left: Math.max(0, Math.min(x1, x2)),
    top: Math.max(0, Math.min(y1, y2)),
    width: Math.min(window.innerWidth, Math.max(x1, x2)) - Math.max(0, Math.min(x1, x2)),
    height: Math.min(window.innerHeight, Math.max(y1, y2)) - Math.max(0, Math.min(y1, y2))
  };
}

function cleanup() {
  if (!overlayState) return;
  overlayState.root.remove();
  document.removeEventListener('keydown', onKeyDown, true);
  overlayState = null;
}
