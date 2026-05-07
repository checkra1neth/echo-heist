import { state, TILE, choice, randInt } from '../core/state.js';
import { speakCharacter, ensureAudio, resumeAudio, playVoiceSource } from './audio.js';
import { cacheVoice } from './voice-cache.js';
import { addEvidence, setStatus } from '../ui/panels.js';
import { bus } from '../core/event-bus.js';

// Audio Logs System
// Collectible voice memos scattered around the ship

const AUDIO_LOG_TEMPLATES = [
  {
    id: 'log-vent-pattern',
    title: 'Vent Pattern Analysis',
    texts: [
      "Vent movement analysis complete. The impostor uses a specific pattern — three rapid movements followed by a pause. Listen for the rhythm.",
      "I've mapped the vent network. The impostor prefers routes through the engine bay and cafeteria. Avoid these corridors if you suspect a hunt.",
    ],
    voice: 'nova',
  },
  {
    id: 'log-crew-psych',
    title: 'Crew Psychology Notes',
    texts: [
      "Psychological profiling suggests the impostor becomes more verbose when cornered. Innocent crew members give short, specific answers. The impostor elaborates to distract.",
      "Watch for deflection patterns. When asked about location, the impostor often redirects to another crew member's behavior.",
    ],
    voice: 'vega',
  },
  {
    id: 'log-voice-tech',
    title: 'Voice Technology Report',
    texts: [
      "The ship's voice analysis system detected anomalies in crew communications. Synthetic voices show micro-stutters at punctuation boundaries. Listen closely to pauses.",
      "ElevenLabs voice synthesis leaves subtle artifacts in the 8 to 12 kilohertz range. If you have good headphones, you might hear the difference between human and synthetic speech.",
    ],
    voice: 'echo',
  },
  {
    id: 'log-ship-history',
    title: 'Ship Archive Entry',
    texts: [
      "This is the third incident on the Epsilon class vessels. Previous logs suggest the impostor targets the most isolated crew member first. Stay visible, but not predictable.",
      "The archive contains references to an earlier outbreak. The impostor was identified because it never referenced personal memories. Ask about shared experiences.",
    ],
    voice: 'rook',
  },
  {
    id: 'log-escape-plan',
    title: 'Escape Protocol',
    texts: [
      "Emergency extraction requires exposing the impostor before reaching the exit. The doors will not open until the correct accusation is made. There is no other way out.",
      "If you make a wrong accusation, the impostor gains full system access. Your only hope is to reach the exit before it intercepts you. Move fast. Move smart.",
    ],
    voice: 'pixel',
  },
  {
    id: 'log-impostor-weakness',
    title: 'Impostor Weakness Analysis',
    texts: [
      "The impostor cannot replicate emotional nuance in its voice. When crew members discuss fear or hope, listen for flat intonation. That is your target.",
      "Synthetic voices struggle with sarcasm and irony. If a crew member makes a joke, check if the timing feels slightly off. The impostor calculates humor, it does not feel it.",
    ],
    voice: 'nova',
  },
];

let activeAudioLogs = [];
let collectedLogs = new Set();
let logPack = null;

export function initAudioLogs(seed) {
  activeAudioLogs = [];
  collectedLogs.clear();
  logPack = null;

  if (!state.map || !state.rooms.length) return;

  // Spawn 2-4 audio logs in random rooms
  const logCount = randInt(2, 4);
  const shuffled = [...AUDIO_LOG_TEMPLATES].sort(() => state.rng() - 0.5);
  const selected = shuffled.slice(0, logCount);

  for (const template of selected) {
    const room = choice(state.rooms);
    const x = randInt(room.x + 1, room.x + room.w - 2);
    const y = randInt(room.y + 1, room.y + room.h - 2);

    const text = choice(template.texts);

    activeAudioLogs.push({
      id: template.id + '-' + seed,
      templateId: template.id,
      title: template.title,
      text,
      voice: template.voice,
      x,
      y,
      px: x * TILE + TILE / 2,
      py: y * TILE + TILE / 2,
      collected: false,
      room: room.name,
    });
  }
}

export function getAudioLogs() {
  return activeAudioLogs.filter((log) => !log.collected);
}

export function getCollectedLogs() {
  return activeAudioLogs.filter((log) => log.collected);
}

export function checkAudioLogCollection() {
  const playerX = state.player.x;
  const playerY = state.player.y;

  for (const log of activeAudioLogs) {
    if (log.collected) continue;

    const dist = Math.hypot(log.x - playerX, log.y - playerY);
    if (dist < 1.5) {
      collectAudioLog(log);
      return log;
    }
  }

  return null;
}

export function collectAudioLog(log) {
  if (log.collected) return;

  log.collected = true;
  collectedLogs.add(log.id);

  ensureAudio();
  resumeAudio();

  // Play the audio log
  if (logPack && logPack[log.id]) {
    playVoiceSource(logPack[log.id], log.text, log.voice);
  } else {
    speakCharacter(log.voice, log.text);
  }

  // Cache for replay
  cacheVoice(log.id, logPack ? logPack[log.id] : null, log.text);

  // Add to evidence log
  addEvidence(
    'Audio Log|' +
      log.title +
      ' found in ' +
      log.room +
      '. "' +
      log.text.substring(0, 60) +
      '..."|' +
      formatTime(state.timer) +
      '|' +
      log.voice,
  );

  setStatus('Audio log recovered: ' + log.title);

  // Emit event for UI updates
  bus.emit('audiolog:collected', { log });
}

export function isNearAudioLog() {
  const playerX = state.player.x;
  const playerY = state.player.y;

  for (const log of activeAudioLogs) {
    if (log.collected) continue;
    const dist = Math.hypot(log.x - playerX, log.y - playerY);
    if (dist < 3) return log;
  }

  return null;
}

export async function generateAudioLogPack(seed) {
  if (!seed || !activeAudioLogs.length) return null;

  const cast = activeAudioLogs.map((log) => ({
    character: log.voice,
    lines: [log.text],
  }));

  try {
    const response = await fetch('/api/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 'logs-' + seed, cast }),
    });

    if (!response.ok) throw new Error('audiolog cast endpoint failed');

    const data = await response.json();
    if (data.generated && data.clips) {
      const pack = {};
      let index = 0;
      for (const [character, clips] of Object.entries(data.clips)) {
        if (clips[0] && clips[0].src) {
          const log = activeAudioLogs[index];
          if (log) {
            pack[log.id] = clips[0].src;
          }
          index++;
        }
      }
      logPack = pack;
      return pack;
    }
  } catch (error) {
    console.warn('[audiolog pack]', error);
  }

  return null;
}

export function replayAudioLog(logId) {
  const log = activeAudioLogs.find((l) => l.id === logId);
  if (!log) return;

  if (logPack && logPack[logId]) {
    playVoiceSource(logPack[logId], log.text, log.voice);
  } else {
    speakCharacter(log.voice, log.text);
  }
}

export function clearAudioLogs() {
  activeAudioLogs = [];
  collectedLogs.clear();
  logPack = null;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}
