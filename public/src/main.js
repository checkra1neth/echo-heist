import { $ } from './core/state.js';
import { initUi } from './ui/dom.js';
import { bindInput, loop } from './input/boot.js';
import { startDemoRun } from './game/session.js';
import { initPixiMap } from './render/pixi-map.js';

async function boot() {
  try {
    initUi();
    const canvas = $('#game-canvas');
    await initPixiMap(canvas);
    bindInput();
    await startDemoRun();
    requestAnimationFrame(loop);
  } catch (err) {
    console.error('[Echo Impostor] Module loading error:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
