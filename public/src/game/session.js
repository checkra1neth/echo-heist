import { state, COLORS, canvas, ui, voiceCache, voiceBufferCache, cellCenter, NOVA_LINES } from '../core/state.js';
import { ensureAudio, resumeAudio, stopActiveVoice, stopMusic, generateAudioPack, speakCharacter, startMusic } from '../audio/audio.js';
import { clearCache } from '../audio/voice-cache.js';
import { buildProceduralMap, spawnCrew } from '../map/generator.js';
import { updateIntelPanel, setObjective, setStatus, addEvidence, hideOverlay, emitParticles, setMissionButtonText } from '../ui/panels.js';
import { buildScene } from '../render/pixi-map.js';

export async function startNewRun(seedOverride = null) {
  ensureAudio();
  resumeAudio();
  if (seedOverride === null) state.demoMode = false;

  const seed =
    seedOverride === null
      ? Math.floor(Math.random() * 1000000000)
      : Number(seedOverride);
  const start = buildProceduralMap(seed);
  const pos = cellCenter(start);

  state.mode = "loading";
  state.player.x = start.x;
  state.player.y = start.y;
  state.player.px = pos.px;
  state.player.py = pos.py;
  state.player.hidden = false;
  state.noise = 0;
  state.suspicion = 0;
  state.completedTasks = 0;
  state.requiredTasks = 3;
  state.interrogations = 0;
  state.accusations = 0;
  state.timer = 0;
  state.result = null;
  state.meetingUnlocked = false;
  state.cameraShake = 0;
  state.lastTime = 0;
  state.evidenceLog = [];
  state.voicePack = {};
  voiceCache.clear();
  voiceBufferCache.clear();
  stopActiveVoice();
  stopMusic();
  clearCache();
  state.revealedImpostor = false;
  state.lastSeed = state.seed;
  state.cinematic = {
    title: "GENERATING VOICES",
    subtitle:
      "Seed " + state.seed + " · Preparing crew, music and SFX.",
    tone: "cyan",
    until: performance.now() + 100000,
  };
  state.particles = [];
  emitParticles(state.player.px, state.player.py, COLORS.cyan, 34, 2.2);
  updateSeedButtons();

  spawnCrew(start);
  buildScene();
  updateIntelPanel();
  setObjective("Generating ElevenLabs voices, music and sound effects...");
  setStatus("Preparing audio");
  addEvidence(
    "Ship Manifest|Seed " +
      state.seed +
      " · Rooms: " +
      state.rooms
        .map((room) => room.name)
        .slice(0, 5)
        .join(", ") +
      ".|0:00",
  );

  if (ui.overlay) {
    ui.overlay.classList.add("active");
    ui.overlay.innerHTML =
      "<div><h2>Generating voices</h2><p>ElevenLabs is preparing crew lines, impostor dialogue, mission music and SFX.</p></div>";
  }

  await generateAudioPack({ silent: true });

  state.mode = "playing";
  state.cinematic = {
    title: state.demoMode ? "DEMO READY" : "SHIP READY",
    subtitle: "Voices loaded · Seed " + state.seed + " · Find the impostor.",
    tone: "cyan",
    until: performance.now() + 2600,
  };
  hideOverlay();
  setObjective(
    "Collect 3 clues, interrogate crew and press Q near the impostor.",
  );
  setStatus("Seed " + state.seed + " · Voices ready");
  startMusic();
  speakCharacter("nova", NOVA_LINES.intro);
  canvas.focus();
}

export async function startDemoRun() {
  state.demoMode = true;
  await startNewRun(11072025);
  addEvidence("Demo Mode|Seed configured for quick recording.|0:00");
  setObjective(
    "Demo mode: collect clues, interrogate suspects and catch the reveal moment.",
  );
}

export async function replaySeed() {
  if (!state.lastSeed) {
    await startDemoRun();
    return;
  }

  state.demoMode = false;
  await startNewRun(state.lastSeed);
  addEvidence("Replay|Replaying seed " + state.lastSeed + ".|0:00");
}

export async function copySeed() {
  const seed = state.lastSeed || state.seed;
  const text = String(seed);

  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text);
    }
    setStatus("Seed copied: " + text);
  } catch (_error) {
    setStatus("Seed " + text);
  }
}

export async function regenAudio() {
  if (!state.seed) {
    setStatus("Start a ship first");
    return;
  }

  setStatus("Clearing audio cache...");
  try {
    await fetch("/api/clear-audio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: String(state.seed) }),
    });
  } catch (_e) { /* ignore */ }

  setStatus("Regenerating audio...");
  await generateAudioPack({ silent: false });
  setStatus("Audio regenerated for seed " + state.seed);
}

export function updateSeedButtons() {
  if (ui.replaySeedBtn) {
    ui.replaySeedBtn.disabled = !state.lastSeed;
  }

  if (ui.copySeedBtn) {
    ui.copySeedBtn.disabled = !state.lastSeed;
  }
}
