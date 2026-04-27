import { state, canvas, ui, COLORS, cellCenter } from '../core/state.js';
import { resumeAudio } from '../audio/audio.js';
import { update, interact, accuse } from '../game/update.js';
import { startNewRun, startDemoRun, replaySeed, copySeed, updateSeedButtons } from '../game/session.js';
import { buildProceduralMap, spawnCrew } from '../map/generator.js';
import { initUi } from '../ui/dom.js';
import { updateIntelPanel, setObjective, setStatus, addEvidence, emitParticles, updateParticles } from '../ui/panels.js';
import { updateUi } from '../render/shell.js';
import { showPause, showInventory, hideOverlayPanel, isOverlayOpen } from '../ui/overlays.js';
import { buildScene } from '../render/pixi-map.js';

export function loop(now) {
  const time = now / 1000;
  const dt = Math.min(0.05, time - (state.lastTime || time));
  state.lastTime = time;

  update(dt);
  requestAnimationFrame(loop);
}

function normalizeKey(event) {
  const byCode = {
    ArrowUp: "arrowup", ArrowDown: "arrowdown",
    ArrowLeft: "arrowleft", ArrowRight: "arrowright",
    KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d",
    KeyE: "e", KeyQ: "q", KeyR: "r", KeyP: "p", KeyC: "c",
    Space: " ", Enter: "enter",
    ShiftLeft: "shift", ShiftRight: "shift",
    Escape: "escape",
  };
  return byCode[event.code] || event.key.toLowerCase();
}

export function bindInput() {
  window.addEventListener("keydown", (event) => {
    const key = normalizeKey(event);
    if (["arrowup","arrowdown","arrowleft","arrowright"," ","w","a","s","d","e","q","r","p","c","tab"].includes(key)) {
      event.preventDefault();
    }
    resumeAudio();
    state.keys.add(key);
    if (key === "e" && !event.repeat) interact();
    if (key === "q" && !event.repeat) accuse();
    if (key === "r" && !event.repeat) startNewRun();
    if (key === "p" && !event.repeat) replaySeed();
    if (key === "c" && !event.repeat) copySeed();
    if (key === "enter" && state.mode === "menu") startNewRun();
    if (key === "escape" && !event.repeat) {
      if (isOverlayOpen()) hideOverlayPanel();
      else if (state.mode === "playing") showPause();
    }
    if (key === "tab" && !event.repeat) {
      event.preventDefault();
      showInventory();
    }
  });
  window.addEventListener("keyup", (event) => {
    state.keys.delete(normalizeKey(event));
  });
  window.addEventListener("pointerdown", resumeAudio, { passive: true });
}

export function primeReferenceInterface() {
  const start = buildProceduralMap(11072025);
  const pos = cellCenter(start);

  state.mode = "playing";
  state.demoMode = true;
  state.player.x = start.x;
  state.player.y = start.y;
  state.player.px = pos.px;
  state.player.py = pos.py;
  state.player.hidden = false;
  state.noise = 0;
  state.suspicion = 0;
  state.completedTasks = 1;
  state.requiredTasks = 3;
  state.interrogations = 0;
  state.accusations = 0;
  state.timer = 462;
  state.result = null;
  state.meetingUnlocked = false;
  state.cameraShake = 0;
  state.lastTime = 0;
  state.lastSeed = state.seed;
  state.evidenceLog = [
    "Voice recording|Someone was in the Engine Bay during the blackout.|02:31",
    "Sound trail|Heavy footsteps in the vents near Medbay.|04:12",
    "Broken conversation|...he said he would go to Data Storage.|05:48",
    "Find 1 more clue|Accusation access improves with more evidence.|--:--",
  ];

  if (state.tasks[0]) state.tasks[0].done = true;
  spawnCrew(start);

  for (const member of state.crew) {
    member.target = { x: member.x, y: member.y };
    member.nextMoveAt = performance.now() + 90000;
  }

  if (ui.overlay) ui.overlay.classList.remove("active");
  setObjective("Collect 3 clues, interrogate suspects, and accuse the impostor.");
  setStatus("Collecting evidence");
  updateSeedButtons();
  updateIntelPanel();
  updateUi();
  buildScene();
}
