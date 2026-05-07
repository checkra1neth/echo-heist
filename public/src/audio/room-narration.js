import { state, TILE } from '../core/state.js';
import { speakCharacter, ensureAudio, resumeAudio } from './audio.js';
import { setStatus } from '../ui/panels.js';

// Room Narration System
// Provides dynamic voice descriptions when entering rooms

const ROOM_NARRATIONS = {
  'Hangar': [
    "The hangar bay is vast and cold. Fuel vapors linger in the air. The main airlock is sealed, but secondary maintenance hatches remain accessible.",
    "Engines of docked shuttles hum with residual power. The impostor might have passed through here — the ventilation shafts connect to every major corridor.",
  ],
  'Engine Bay': [
    "The engine bay roars with contained fury. Radiation shielding creates dead zones in the ship's sensors. The impostor knows these blind spots well.",
    "Coolant lines snake across the walls like veins. The noise here masks footsteps. Stay alert. The impostor uses this cover to move undetected.",
  ],
  'Medbay': [
    "Medbay smells of antiseptic and ozone. The biometric scanners are offline, which means the impostor could have tampered with the medical records.",
    "Stasis pods line the walls, their occupants frozen in time. A perfect place to hide. Check behind every curtain.",
  ],
  'Central Hall': [
    "The central hall is the heart of the ship. Every corridor connects here, making it the most dangerous and the most revealing location.",
    "Echoes carry strangely in this space. Voices from adjacent corridors blend together. Listen carefully — the impostor's voice might leak through the vents.",
  ],
  'Cafeteria': [
    "The cafeteria is quiet now. Empty trays and half-finished meals suggest a hasty evacuation. Or something worse.",
    "Food processors hum with low-frequency vibrations. These frequencies can distort voice recordings. Be skeptical of any evidence collected near the kitchen vents.",
  ],
  'Laboratory': [
    "The laboratory contains sensitive equipment. The impostor may have accessed the voice synthesis database here. Check the terminals for unauthorized access logs.",
    "Chemical fumes cloud the air. The ventilation system struggles to keep up. If you smell ozone mixed with copper, the impostor was here recently.",
  ],
  'Data Storage': [
    "Data storage is warm with spinning drives. The hum creates a natural white noise that masks subtle sounds. The impostor could be breathing right behind you.",
    "Server racks stretch into the darkness. Emergency lighting flickers in patterns that match the ship's distress signal. Or is it a code?",
  ],
  'Server Room': [
    "The server room controls all ship communications. If the impostor accessed the voice modulation systems, this is where the forgery happened.",
    "Cooling fans scream at maximum speed. The previous engineer overclocked the processors to crack an encryption key. The key is still missing.",
  ],
  'Quarters': [
    "Crew quarters are personal spaces. Each bunk tells a story. Look for signs of struggle — displaced items, torn photographs, blood traces under UV light.",
    "The sleeping pods are sealed tight. Some crew members chose to hide rather than evacuate. Their last voice messages are stored in the bedside terminals.",
  ],
};

let lastRoom = null;
let roomEnterTime = 0;
let narrationPack = null;
let cooldownUntil = 0;
const NARRATION_COOLDOWN = 12000; // 12 seconds between narrations

export function initRoomNarration(pack) {
  lastRoom = null;
  roomEnterTime = 0;
  narrationPack = pack || null;
  cooldownUntil = 0;
}

export function updateRoomNarration() {
  if (state.mode !== 'playing') return;

  const currentRoom = getCurrentRoom();
  if (!currentRoom) return;

  if (currentRoom !== lastRoom) {
    lastRoom = currentRoom;
    roomEnterTime = performance.now();

    // Only narrate after a short delay to avoid spam when quickly passing through
    setTimeout(() => {
      if (lastRoom === currentRoom && state.mode === 'playing') {
        narrateRoom(currentRoom);
      }
    }, 800);
  }
}

function narrateRoom(roomName) {
  const now = performance.now();
  if (now < cooldownUntil) return;

  const narrations = ROOM_NARRATIONS[roomName];
  if (!narrations || !narrations.length) return;

  const text = narrations[Math.floor(state.rng() * narrations.length)];
  const narrationId = 'room-' + roomName.toLowerCase().replace(/\s+/g, '-');

  ensureAudio();
  resumeAudio();

  if (narrationPack && narrationPack[narrationId]) {
    speakCharacter('operator', text, null, narrationPack[narrationId]);
  } else {
    speakCharacter('operator', text);
  }

  setStatus('Entered: ' + roomName);
  cooldownUntil = now + NARRATION_COOLDOWN;
}

function getCurrentRoom() {
  const px = state.player.px;
  const py = state.player.py;

  for (const room of state.rooms) {
    const rx = room.x * TILE;
    const ry = room.y * TILE;
    const rw = room.w * TILE;
    const rh = room.h * TILE;

    if (px >= rx && px < rx + rw && py >= ry && py < ry + rh) {
      return room.name;
    }
  }

  return null;
}

export async function generateRoomNarrationPack(seed) {
  if (!seed) return null;

  const cast = [];
  const narrationMap = {};

  for (const [roomName, texts] of Object.entries(ROOM_NARRATIONS)) {
    const text = texts[0]; // Use first text for generation
    const id = 'room-' + roomName.toLowerCase().replace(/\s+/g, '-');
    cast.push({
      character: 'operator',
      lines: [text],
    });
    narrationMap[id] = text;
  }

  try {
    const response = await fetch('/api/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 'rooms-' + seed, cast }),
    });

    if (!response.ok) throw new Error('room narration endpoint failed');

    const data = await response.json();
    if (data.generated && data.clips) {
      const pack = {};
      let index = 0;
      for (const [character, clips] of Object.entries(data.clips)) {
        if (clips[0] && clips[0].src) {
          const id = Object.keys(narrationMap)[index];
          if (id) {
            pack[id] = clips[0].src;
          }
          index++;
        }
      }
      narrationPack = pack;
      return pack;
    }
  } catch (error) {
    console.warn('[room narration pack]', error);
  }

  return null;
}

export function getNarrationPack() {
  return narrationPack;
}
