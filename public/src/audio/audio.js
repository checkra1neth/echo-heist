import { state, audioCtx, masterGain, sfx, voiceCache, voiceBufferCache, activeVoiceSource, stealthMusic, alertMusic, ui, setAudioCtx, setMasterGain, setStealthMusic, setAlertMusic, setActiveVoiceSource } from '../core/state.js';
import { setMissionButtonText, setStatus, findPackedVoice, preGenerateCastVoices } from '../ui/panels.js';
import { bus } from '../core/event-bus.js';

export function ensureAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  const ctx = new AC();
  setAudioCtx(ctx);
  const gain = ctx.createGain();
  gain.gain.value = 0.18;
  gain.connect(ctx.destination);
  setMasterGain(gain);
}

export function resumeAudio() {
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
}

export function beep(freq, duration, type, volume) {
  if (!audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type || "sine";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume || 0.08, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    audioCtx.currentTime + duration,
  );
  osc.connect(gain);
  gain.connect(masterGain);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

export function playSfx(name) {
  const clip = sfx.get(name);
  if (clip) {
    const clone = clip.cloneNode();
    clone.volume = clip.volume;
    clone.play().catch(() => fallbackSfx(name));
    return;
  }
  fallbackSfx(name);
}

export function fallbackSfx(name) {
  const presets = {
    task: [880, 0.1, "triangle", 0.08],
    accuse: [260, 0.22, "sawtooth", 0.1],
    vent: [90, 0.18, "sawtooth", 0.08],
    step: [74, 0.035, "sine", 0.035],
    alert: [620, 0.12, "square", 0.09],
    win: [740, 0.12, "triangle", 0.08],
    lose: [130, 0.28, "sawtooth", 0.11],
  };
  const p = presets[name] || [330, 0.08, "sine", 0.06];
  beep(p[0], p[1], p[2], p[3]);
}

export function speakFallback(text, character) {
  stopActiveVoice();

  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = character === "impostor" ? 0.82 : 0.96;
    utterance.pitch = character === "impostor" ? 0.62 : 1.02;
    utterance.volume = 0.72;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    return;
  }
  beep(320, 0.09, "triangle", 0.07);
  setTimeout(() => beep(380, 0.08, "triangle", 0.06), 140);
  setTimeout(() => beep(260, 0.12, "triangle", 0.06), 290);
}

export function stopActiveVoice() {
  if (!activeVoiceSource) return;

  try {
    activeVoiceSource.stop();
  } catch (_error) {
    // The source may have already ended.
  }

  setActiveVoiceSource(null);
}

export async function loadVoiceBuffer(src) {
  ensureAudio();
  resumeAudio();

  if (!audioCtx) throw new Error("WebAudio is unavailable");
  if (!src) throw new Error("Voice source is missing");

  if (!voiceBufferCache.has(src)) {
    voiceBufferCache.set(
      src,
      fetch(src)
        .then((response) => {
          if (!response.ok) throw new Error("voice file failed to load");
          return response.arrayBuffer();
        })
        .then((buffer) => audioCtx.decodeAudioData(buffer)),
    );
  }

  return voiceBufferCache.get(src);
}

export function primeVoiceBuffer(src) {
  if (!src) return;
  loadVoiceBuffer(src).catch((error) => {
    console.warn("[voice preload]", src, error);
    voiceBufferCache.delete(src);
  });
}

export function playVoiceBuffer(buffer, volume = 0.92) {
  if (!audioCtx || !masterGain) return false;

  stopActiveVoice();

  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();
  source.buffer = buffer;
  gain.gain.value = volume;
  source.connect(gain);
  gain.connect(masterGain);
  source.onended = () => {
    if (activeVoiceSource === source) setActiveVoiceSource(null);
  };
  source.start(0);
  setActiveVoiceSource(source);
  return true;
}

export async function playVoiceSource(src, text, character) {
  try {
    const buffer = await loadVoiceBuffer(src);
    if (playVoiceBuffer(buffer)) return true;
    throw new Error("voice playback failed");
  } catch (error) {
    console.warn("[voice playback]", error);
    voiceBufferCache.delete(src);
    speakFallback(text, character);
    return false;
  }
}

export async function speakCharacter(character, text, voiceId) {
  ensureAudio();
  resumeAudio();

  // Emit voice event for visual pulse effect
  bus.emit('voice:play', { characterId: character, text });

  const cacheKey = character + "::" + text;
  if (voiceCache.has(cacheKey)) {
    const src = voiceCache.get(cacheKey);
    bus.emit('voice:cached', { characterId: character, src, text });
    playVoiceSource(src, text, character);
    return;
  }

  const packed = findPackedVoice(character, text);
  if (packed) {
    voiceCache.set(cacheKey, packed);
    bus.emit('voice:cached', { characterId: character, src: packed, text });
    playVoiceSource(packed, text, character);
    return;
  }

  setStatus("Generating voice: " + character);
  try {
    const response = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character, text, voiceId }),
    });

    if (!response.ok) throw new Error("voice endpoint failed");
    const data = await response.json();

    if (data.src) {
      voiceCache.set(cacheKey, data.src);
      bus.emit('voice:cached', { characterId: character, src: data.src, text });
      await playVoiceSource(data.src, text, character);
      setStatus("ElevenLabs voice: " + character);
    } else {
      speakFallback(text, character);
      setStatus("Fallback voice: " + character);
    }
  } catch (error) {
    console.warn("[voice]", error);
    speakFallback(text, character);
    setStatus("Fallback voice: " + character);
  }
}

export async function generateAudioPack({ silent = false } = {}) {
  ensureAudio();
  resumeAudio();

  const includeCast = state.crew.length > 0;

  if (!silent && ui.missionBtn) {
    ui.missionBtn.disabled = true;
    setMissionButtonText("Generating");
  }

  setStatus(
    includeCast
      ? "Generating crew voices and mission audio..."
      : "Generating mission audio...",
  );

  try {
    const [mission, cast] = await Promise.all([
      generateMissionAudio({ silent: true }),
      includeCast ? preGenerateCastVoices() : Promise.resolve(null),
    ]);

    const castReady =
      includeCast &&
      Object.values(state.voicePack).some((clips) =>
        clips.some((clip) => Boolean(clip.src)),
      );

    setStatus(
      mission?.generated || castReady
        ? includeCast
          ? "Crew voices ready"
          : "Mission audio ready"
        : "Fallback audio ready",
    );

    return { mission, cast };
  } catch (error) {
    console.warn("[audio pack]", error);
    setStatus("Fallback audio ready");
    return { mission: null, cast: null };
  } finally {
    if (!silent && ui.missionBtn) {
      ui.missionBtn.disabled = false;
      setMissionButtonText(includeCast ? "Refresh voices" : "Voices");
    }
  }
}

export async function generateMissionAudio({ silent = false } = {}) {
  ensureAudio();
  resumeAudio();

  if (!silent && ui.missionBtn) {
    ui.missionBtn.disabled = true;
    setMissionButtonText("Generating");
  }

  setStatus("Generating mission audio...");

  try {
    const response = await fetch("/api/mission", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mission: "echo-impostor", procedural: true, seed: String(state.seed) }),
    });

    if (!response.ok) throw new Error("mission endpoint failed");
    const mission = await response.json();
    state.missionAudio = mission;
    hydrateMissionAudio(mission);
    state.audioMode = mission.generated ? mission.mode : "fallback";
    setStatus(
      mission.generated ? "Mission audio ready" : "Fallback audio ready",
    );
    return mission;
  } catch (error) {
    console.warn("[mission audio]", error);
    state.audioMode = "fallback";
    setStatus("Fallback audio ready");
    return null;
  } finally {
    if (!silent && ui.missionBtn) {
      ui.missionBtn.disabled = false;
      setMissionButtonText(state.crew.length ? "Refresh voices" : "Voices");
    }
  }
}

export function hydrateMissionAudio(mission) {
  const audio = mission && mission.audio ? mission.audio : {};
  const make = (src, loop, volume) => {
    if (!src) return null;
    const clip = new Audio(src);
    clip.loop = Boolean(loop);
    clip.volume = volume;
    clip.preload = "auto";
    return clip;
  };

  if (audio.music) {
    setStealthMusic(make(audio.music.stealth, true, 0.34));
    setAlertMusic(make(audio.music.alert, true, 0.44));
  }

  sfx.clear();
  if (audio.sfx) {
    if (audio.sfx.keycard)
      sfx.set("task", make(audio.sfx.keycard, false, 0.8));
    if (audio.sfx.core) sfx.set("win", make(audio.sfx.core, false, 0.8));
    if (audio.sfx.alert) sfx.set("alert", make(audio.sfx.alert, false, 0.8));
    if (audio.sfx.door) sfx.set("vent", make(audio.sfx.door, false, 0.8));
  }
}

export function startMusic() {
  if (state.musicStarted) return;
  state.musicStarted = true;
  tryPlayMusic();
}

function tryPlayMusic() {
  if (stealthMusic) {
    stealthMusic.currentTime = 0;
    stealthMusic.play().catch(() => {
      // Autoplay blocked — retry on next user interaction
      const retry = () => {
        if (stealthMusic && stealthMusic.paused) {
          stealthMusic.play().catch(() => {});
        }
        window.removeEventListener('pointerdown', retry);
        window.removeEventListener('keydown', retry);
      };
      window.addEventListener('pointerdown', retry, { once: true, passive: true });
      window.addEventListener('keydown', retry, { once: true });
    });
  } else {
    startDrone();
  }
}

export function startAlertMusic() {
  if (alertMusic && alertMusic.paused) {
    if (stealthMusic) stealthMusic.volume = 0.12;
    alertMusic.currentTime = 0;
    alertMusic.play().catch(() => {});
  }
}

export function stopMusic() {
  [stealthMusic, alertMusic].forEach((clip) => {
    if (!clip) return;
    clip.pause();
    clip.currentTime = 0;
  });
  state.musicStarted = false;
}

export function startDrone() {
  if (!audioCtx || !masterGain) return;
  const osc = audioCtx.createOscillator();
  const filter = audioCtx.createBiquadFilter();
  const gain = audioCtx.createGain();
  osc.type = "sawtooth";
  osc.frequency.value = 56;
  filter.type = "lowpass";
  filter.frequency.value = 360;
  gain.gain.value = 0.018;
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterGain);
  osc.start();
  setTimeout(() => {
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 1);
    osc.stop(audioCtx.currentTime + 1.1);
  }, 90000);
}
