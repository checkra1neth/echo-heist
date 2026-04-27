import { state, ui, masterGain } from '../core/state.js';
import { escapeHtml } from './panels.js';

export function showSettings() {
  if (!ui.overlay) return;
  const vol = Math.round((state.masterVolume ?? 0.18) * 100);
  state.activeOverlay = 'settings';
  ui.overlay.innerHTML =
    '<div>' +
      '<h2>Settings</h2>' +
      '<label style="display:block;margin:18px 0 8px;color:#b7c9d2;font-size:14px;">Volume</label>' +
      '<input id="overlay-volume" type="range" min="0" max="100" value="' + vol + '" style="width:100%;accent-color:#28e8f2;cursor:pointer;" />' +
      '<span id="overlay-vol-label" style="color:var(--text);font-size:13px;">' + vol + '%</span>' +
      '<div style="margin-top:22px;"><button id="overlay-fullscreen" class="eh-secondary" type="button">Fullscreen</button></div>' +
      '<div style="margin-top:18px;"><button id="overlay-close" class="eh-primary" type="button">Close</button></div>' +
    '</div>';
  ui.overlay.classList.add('active');
  const slider = ui.overlay.querySelector('#overlay-volume');
  const label  = ui.overlay.querySelector('#overlay-vol-label');
  const fsBtn  = ui.overlay.querySelector('#overlay-fullscreen');
  const closeBtn = ui.overlay.querySelector('#overlay-close');
  if (slider) {
    slider.addEventListener('input', () => {
      const v = Number(slider.value) / 100;
      state.masterVolume = v;
      if (masterGain && masterGain.gain) masterGain.gain.value = v;
      if (label) label.textContent = slider.value + '%';
    });
  }
  if (fsBtn) {
    fsBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      else document.exitFullscreen().catch(() => {});
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', () => hideOverlayPanel());
}

export function showInventory() {
  if (!ui.overlay) return;
  state.activeOverlay = 'inventory';
  let items = '';
  if (!state.evidenceLog.length) {
    items = '<p style="color:#8fa5bd;">No evidence yet.</p>';
  } else {
    items = state.evidenceLog.map((entry) => {
      const parts = String(entry).split('|');
      if (parts.length >= 3) {
        return '<div style="text-align:left;margin:8px 0;padding:8px 12px;border-left:2px solid #28e8f2;background:rgba(40,232,242,0.06);border-radius:3px;">' +
          '<strong style="color:var(--text);">' + escapeHtml(parts[0]) + '</strong>' +
          '<time style="float:right;color:#8fa5bd;font-size:12px;">' + escapeHtml(parts[parts.length - 1]) + '</time>' +
          '<p style="margin:4px 0 0;color:#b7c9d2;font-size:13px;">' + escapeHtml(parts.slice(1, -1).join('|')) + '</p></div>';
      }
      return '<div style="text-align:left;margin:8px 0;padding:8px 12px;border-left:2px solid #28e8f2;background:rgba(40,232,242,0.06);border-radius:3px;">' +
        '<p style="margin:0;color:#b7c9d2;font-size:13px;">' + escapeHtml(entry) + '</p></div>';
    }).join('');
  }
  ui.overlay.innerHTML =
    '<div><h2>Inventory</h2>' +
    '<div style="max-height:320px;overflow-y:auto;margin:14px 0;">' + items + '</div>' +
    '<button id="overlay-close" class="eh-primary" type="button">Close</button></div>';
  ui.overlay.classList.add('active');
  const closeBtn = ui.overlay.querySelector('#overlay-close');
  if (closeBtn) closeBtn.addEventListener('click', () => hideOverlayPanel());
}

export function showPause() {
  if (!ui.overlay) return;
  state.activeOverlay = 'pause';
  state.mode = 'paused';
  ui.overlay.innerHTML =
    '<div><h2>PAUSED</h2>' +
    '<p style="color:#b7c9d2;">Game paused</p>' +
    '<button id="overlay-resume" class="eh-primary" type="button">Resume</button></div>';
  ui.overlay.classList.add('active');
  const resumeBtn = ui.overlay.querySelector('#overlay-resume');
  if (resumeBtn) resumeBtn.addEventListener('click', () => hideOverlayPanel());
}

export function hideOverlayPanel() {
  if (!ui.overlay) return;
  const wasPaused = state.activeOverlay === 'pause';
  ui.overlay.classList.remove('active');
  state.activeOverlay = null;
  if (wasPaused) state.mode = 'playing';
}

export function isOverlayOpen() {
  return state.activeOverlay !== null;
}
