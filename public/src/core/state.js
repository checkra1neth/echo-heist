export const TILE = 40;
export const COLS = 24;
export const ROWS = 16;
export const WIDTH = COLS * TILE;
export const HEIGHT = ROWS * TILE;

export const COLORS = {
  bg: "#05070d",
  floor: "#101828",
  floor2: "#0d1422",
  wall: "#2b3554",
  wallEdge: "#53658d",
  grid: "rgba(255,255,255,0.035)",
  player: "#69ffb1",
  impostor: "#ff496d",
  cyan: "#55ffe2",
  blue: "#7aa7ff",
  pink: "#ff4fd8",
  red: "#ff496d",
  amber: "#ffd166",
  purple: "#9b6cff",
  green: "#72ff8b",
  text: "#eefcff",
  muted: "#8fa5bd",
  black: "#030711",
};

export const CREW_TEMPLATES = [
  {
    id: "nova",
    name: "Nova",
    color: "#55ffe2",
    voiceHint: "calm operator voice",
    innocentLines: [
      "I was calibrating oxygen near the blue corridor.",
      "I heard vent metal, but it came from the reactor side.",
      "Pixel looked nervous when the lights flickered.",
    ],
    impostorLines: [
      "I stayed in navigation the whole time. Nobody saw me because the door was locked.",
      "The vents? No, I definitely did not hear any vents.",
      "You should stop asking questions and finish your tasks.",
    ],
  },
  {
    id: "rook",
    name: "Rook",
    color: "#ff9f6e",
    voiceHint: "rough engineer voice",
    innocentLines: [
      "I fixed the lower engine. The sabotage came after I left.",
      "Someone ran past me without footsteps. That means vents.",
      "Vega was alone near comms for too long.",
    ],
    impostorLines: [
      "I am just an engineer. Trust me, I know the ship better than anyone.",
      "If there was sabotage, it was probably a sensor glitch.",
      "Do not waste time on meetings. Keep moving.",
    ],
  },
  {
    id: "pixel",
    name: "Pixel",
    color: "#ff4fd8",
    voiceHint: "quick nervous voice",
    innocentLines: [
      "I saw a red shadow near storage and then the door sealed.",
      "My scanner caught a voice print, but it was scrambled.",
      "Echo was with me for a second, then vanished.",
    ],
    impostorLines: [
      "I panic a lot, okay? That does not make me suspicious.",
      "The voice print is probably yours. The ship is confused.",
      "If you accuse wrong, the impostor wins. Remember that.",
    ],
  },
  {
    id: "vega",
    name: "Vega",
    color: "#9b6cff",
    voiceHint: "smooth pilot voice",
    innocentLines: [
      "Navigation was clean. The impostor avoided cameras.",
      "I heard a low laugh from the left vent grid.",
      "Rook passed me, but he was walking normally.",
    ],
    impostorLines: [
      "I charted the escape route. You need me alive.",
      "Everyone sounds suspicious on a broken intercom.",
      "The quickest vote is usually the safest vote.",
    ],
  },
  {
    id: "echo",
    name: "Echo",
    color: "#72ff8b",
    voiceHint: "soft synthetic voice",
    innocentLines: [
      "The ship recorded two heartbeats in the same room, then one disappeared.",
      "The impostor voice has compression artifacts.",
      "Nova never left the med bay while I was scanning.",
    ],
    impostorLines: [
      "My logs were erased. That is convenient for someone else.",
      "The archive can fake any voice. You cannot trust audio.",
      "Maybe the impostor is the one collecting evidence.",
    ],
  },
];

export const TASK_LABELS = [
  "Recover voice fragment",
  "Stabilize oxygen",
  "Decrypt corrupted log",
  "Restart comms",
  "Scan vent trail",
  "Fix reactor echo",
];

export const ROOM_NAMES = [
  "Hangar",
  "Engine Bay",
  "Medbay",
  "Central Hall",
  "Cafeteria",
  "Laboratory",
  "Data Storage",
  "Server Room",
  "Quarters",
];

export const ROOM_BLUEPRINTS = [
  { name: "Hangar", x: 9, y: 1, w: 6, h: 4, hue: 188 },
  { name: "Engine Bay", x: 3, y: 3, w: 5, h: 3, hue: 198 },
  { name: "Medbay", x: 18, y: 3, w: 4, h: 3, hue: 182 },
  { name: "Central Hall", x: 8, y: 6, w: 8, h: 4, hue: 186 },
  { name: "Cafeteria", x: 2, y: 7, w: 4, h: 3, hue: 174 },
  { name: "Laboratory", x: 18, y: 7, w: 4, h: 3, hue: 194 },
  { name: "Data Storage", x: 3, y: 11, w: 4, h: 3, hue: 176 },
  { name: "Server Room", x: 10, y: 11, w: 5, h: 3, hue: 188 },
  { name: "Quarters", x: 18, y: 11, w: 4, h: 3, hue: 202 },
];

export const CREW_ROLES = {
  nova: "Engineer",
  rook: "Security Officer",
  pixel: "Technician",
  vega: "Scientist",
  echo: "Comms Officer",
};

export const NOVA_LINES = {
  intro:
    "Emergency protocol active. One crew member is not human. Collect voice evidence and listen carefully.",
  evidence:
    "Voice evidence recovered. The impostor pattern is becoming clearer.",
  ready:
    "Enough evidence collected. Interrogate suspects and accuse carefully.",
  victory: "Evacuation complete. The impostor has been exposed.",
};

export const state = {
  mode: "menu",
  seed: Date.now(),
  rng: null,
  map: null,
  rooms: [],
  corridors: [],
  player: {
    x: 1,
    y: 1,
    px: TILE * 1.5,
    py: TILE * 1.5,
    speed: 4.6,
    face: 1,
    hidden: false,
  },
  crew: [],
  impostorId: null,
  tasks: [],
  exit: null,
  vents: [],
  hiding: [],
  securityDoors: [],
  noise: 0,
  suspicion: 0,
  completedTasks: 0,
  requiredTasks: 3,
  interrogations: 0,
  accusations: 0,
  timer: 0,
  result: null,
  keys: new Set(),
  lastTime: 0,
  cameraShake: 0,
  missionAudio: null,
  audioMode: "fallback",
  musicStarted: false,
  meetingUnlocked: false,
  lastToastAt: 0,
  evidenceLog: [],
  voicePack: {},
  revealedImpostor: false,
  lastSeed: null,
  demoMode: false,
  cinematic: null,
  particles: [],
  scanOffset: 0,
  minimapPulse: 0,
  paused: false,
  activeOverlay: null,
  masterVolume: 0.18,
};

export let canvas;
export let ctx;
export let ui;
export let audioCtx;
export let masterGain;
export let stealthMusic;
export let alertMusic;
export const sfx = new Map();
export const voiceCache = new Map();
export const voiceBufferCache = new Map();
export let activeVoiceSource = null;

export function $(selector) {
  return document.querySelector(selector);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(min, max) {
  return Math.floor(state.rng() * (max - min + 1)) + min;
}

export function choice(list) {
  return list[Math.floor(state.rng() * list.length)];
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function keyOf(x, y) {
  return x + "," + y;
}

export function distance(a, b) {
  return Math.hypot(a.px - b.px, a.py - b.py);
}

export function distCells(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function cellCenter(cell) {
  return {
    px: cell.x * TILE + TILE / 2,
    py: cell.y * TILE + TILE / 2,
  };
}

export function roomForCell(cell, rooms = state.rooms) {
  let best = rooms[0] || { name: "Unknown", cx: cell.x, cy: cell.y };
  let bestD = Infinity;

  for (const room of rooms) {
    const d = Math.hypot(cell.x - room.cx, cell.y - room.cy);
    if (d < bestD) {
      bestD = d;
      best = room;
    }
  }

  return best;
}


export function setCanvas(v) { canvas = v; }
export function setCtx(v) { ctx = v; }
export function setUi(v) { ui = v; }
export function setAudioCtx(v) { audioCtx = v; }
export function setMasterGain(v) { masterGain = v; }
export function setStealthMusic(v) { stealthMusic = v; }
export function setAlertMusic(v) { alertMusic = v; }
export function setActiveVoiceSource(v) { activeVoiceSource = v; }
