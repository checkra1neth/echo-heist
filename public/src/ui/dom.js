import { state, WIDTH, HEIGHT, $, setCanvas, setUi, ui } from '../core/state.js';
import { showSettings, showInventory, showPause } from './overlays.js';
import { setObjective, setStatus, updateIntelPanel } from './panels.js';
import { resumeAudio } from '../audio/audio.js';
import { startNewRun, replaySeed, copySeed, regenAudio, updateSeedButtons } from '../game/session.js';
import { interact, accuse } from '../game/update.js';
import { updateUi } from '../render/shell.js';

export function initUi() {
  let localCanvas = $("#game-canvas");
  if (!localCanvas) {
    const root = $("#app") || document.body;
    root.innerHTML =
      '<section class="eh-topbar"><section class="eh-brand-panel eh-panel"><div class="eh-wave-mark"><i></i><i></i><i></i><i></i><i></i></div><div><h1 id="game-title">Echo Impostor</h1><p class="eh-subtitle">Listen. Compare. Accuse.</p></div></section>' +
      '<section class="eh-telemetry-strip"><div class="eh-panel eh-telemetry"><span class="eh-label">Objective</span><strong id="objective"></strong></div><div class="eh-panel eh-telemetry"><span class="eh-label">Noise level</span><div class="eh-noise-row"><div class="eh-speaker" aria-hidden="true"><i></i><i></i></div><div class="eh-meter"><i id="noise-fill"></i></div><strong id="noise-readout">Quiet</strong></div></div><div class="eh-panel eh-telemetry"><span class="eh-label">Status</span><div class="eh-status-row"><strong id="status"></strong><time id="mission-clock">0:00</time></div></div></section></section>' +
      '<section class="eh-cockpit-grid"><aside class="eh-sidebar eh-sidebar--left"><section class="eh-panel eh-progress-panel"><h2>Progress</h2><div class="eh-progress-row"><div><span>Evidence</span><strong id="task-count">0 / 3</strong></div><div class="eh-progress-track"><i id="task-progress-fill"></i><span class="eh-dot"></span><span class="eh-dot"></span><span class="eh-dot"></span></div></div><div class="eh-progress-row"><div><span>Interrogations</span><strong id="talk-count">0 / 5</strong></div><div class="eh-progress-track"><i id="talk-progress-fill"></i><span class="eh-dot"></span><span class="eh-dot"></span><span class="eh-dot"></span><span class="eh-dot"></span><span class="eh-dot"></span></div></div></section><section class="eh-panel eh-evidence-panel"><h2>Evidence log</h2><div id="evidence-list" class="eh-evidence-list"></div></section></aside>' +
      '<section class="eh-map-column"><section class="eh-panel eh-map-panel"><header class="eh-map-header"><h2>Ship map</h2></header><div class="eh-canvas-frame"><canvas id="game-canvas" data-echo-heist="true"></canvas><div id="overlay" class="eh-overlay active"><div><h2>Echo Impostor</h2><p>Collect evidence, interrogate crew and accuse the impostor.</p><button id="start-btn" class="eh-primary" type="button">Start ship</button></div></div></div></section></section>' +
      '<aside class="eh-sidebar eh-sidebar--right"><section class="eh-panel eh-suspects-panel"><h2>Suspects</h2><div id="suspect-list" class="eh-suspect-list"></div></section></aside></section>' +
      '<footer class="eh-command-bar"><div class="eh-command-group eh-command-group--utility"><button id="new-ship-btn" class="eh-secondary" type="button"><kbd>R</kbd> New ship</button><button id="regen-audio-btn" class="eh-secondary" type="button">Regen</button><button id="replay-seed-btn" class="eh-secondary" type="button"><kbd>P</kbd> Replay</button><button id="copy-seed-btn" class="eh-secondary" type="button"><kbd>C</kbd> Seed</button></div><div class="eh-command-group eh-command-group--primary"><button id="interact-btn" class="eh-primary" type="button"><kbd>E</kbd> Interrogate</button><button id="accuse-btn" class="eh-danger" type="button"><kbd>Q</kbd> Accuse</button></div></footer>';
    localCanvas = $("#game-canvas");
  }

  localCanvas.width = WIDTH;
  localCanvas.height = HEIGHT;
  setCanvas(localCanvas);
  localCanvas.tabIndex = 0;

  setUi({
    replaySeedBtn: $("#replay-seed-btn"),
    copySeedBtn: $("#copy-seed-btn"),
    regenAudioBtn: $("#regen-audio-btn"),
    settingsBtn: $("#settings-btn"),
    inventoryBtn: $("#inventory-btn"),
    pauseBtn: $("#pause-btn"),
    interactBtn: $("#interact-btn"),
    accuseBtn: $("#accuse-btn"),
    newShipBtn: $("#new-ship-btn"),
    startBtn: $("#start-btn"),
    objective: $("#objective"),
    status: $("#status"),
    noiseFill: $("#noise-fill"),
    noiseReadout: $("#noise-readout"),
    missionClock: $("#mission-clock"),
    taskCount: $("#task-count"),
    talkCount: $("#talk-count"),
    taskProgressFill: $("#task-progress-fill"),
    talkProgressFill: $("#talk-progress-fill"),
    overlay: $("#overlay"),
    suspectList: $("#suspect-list"),
    evidenceList: $("#evidence-list"),
    audiologList: $("#audiolog-list"),
    title: $("#game-title"),
    subtitle: $(".eh-subtitle"),
  });

  if (ui.title) ui.title.textContent = "Echo Impostor";
  if (ui.subtitle) {
    ui.subtitle.textContent = "Listen. Compare. Accuse.";
  }

  if (ui.replaySeedBtn) {
    ui.replaySeedBtn.addEventListener("click", replaySeed);
  }

  if (ui.copySeedBtn) {
    ui.copySeedBtn.addEventListener("click", copySeed);
  }

  if (ui.regenAudioBtn) {
    ui.regenAudioBtn.addEventListener("click", regenAudio);
  }

  if (ui.settingsBtn) {
    ui.settingsBtn.addEventListener("click", () => showSettings());
  }

  if (ui.inventoryBtn) {
    ui.inventoryBtn.addEventListener("click", () => showInventory());
  }

  if (ui.pauseBtn) {
    ui.pauseBtn.addEventListener("click", () => showPause());
  }

  if (ui.interactBtn) {
    ui.interactBtn.addEventListener("click", interact);
  }

  if (ui.accuseBtn) {
    ui.accuseBtn.addEventListener("click", accuse);
  }

  if (ui.newShipBtn) {
    ui.newShipBtn.addEventListener("click", () => startNewRun());
  }

  updateSeedButtons();

  if (ui.startBtn) {
    ui.startBtn.textContent = "Start ship";
    ui.startBtn.addEventListener("click", () => startNewRun());
  }

  setObjective("Collect 3 clues, interrogate suspects and accuse the impostor.");
  setStatus("Ready");
  updateUi();

  // Guide panel collapse/expand toggle
  const guidePanel = document.querySelector('.eh-guide-panel');
  if (guidePanel) {
    guidePanel.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      guidePanel.classList.toggle('expanded');
    });
  }
}
