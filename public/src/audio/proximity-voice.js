import { state } from '../core/state.js';
import { speakCharacter, ensureAudio, resumeAudio } from './audio.js';
import { setStatus } from '../ui/panels.js';

// Proximity Voice System
// Context-aware voice hints triggered by game state

const PROXIMITY_HINTS = {
  near_impostor: [
    "[whispered] I can feel the temperature dropping. The impostor is close. Do not run. Do not make a sound.",
    "[tense] Something is wrong. The air pressure changed. The impostor is in this sector.",
  ],
  impostor_hunting: [
    "[urgent] The impostor is hunting. Find a hiding spot immediately. The acoustic shadows can mask your breathing.",
    "[panicked] It knows where you are. Move to the nearest locker or vent shaft. Now.",
  ],
  low_tasks_remaining: [
    "[focused] Only one more piece of evidence needed. The truth is within reach. Stay cautious.",
    "[calm] You are close to unlocking the accusation phase. Do not rush. Collect carefully.",
  ],
  high_noise_warning: [
    "[warning] Your noise level is critical. The impostor can hear you across the ship. Stop moving. Hide.",
    "[urgent] Too loud. The impostor's sensors are tracking your location. Find cover.",
  ],
  near_exit_unlocked: [
    "[hopeful] The exit is accessible, but only after the correct accusation. Do not leave an innocent crew member behind.",
    "[cautious] The evacuation route is open. Make sure you accuse the right person before you leave.",
  ],
  wrong_accusation_aftermath: [
    "[grave] The impostor is loose now. The ship's defenses have been compromised. Run or hide — those are your only options.",
    "[dark] You accused the wrong person. The impostor now has full access to the ship's systems. Survival is not guaranteed.",
  ],
  correct_accusation_aftermath: [
    "[relieved] The impostor is exposed. But the ship is still dangerous. Reach the exit before secondary systems fail.",
    "[hopeful] You found the truth. Now make it to the exit. The impostor's backup protocols may still be active.",
  ],
  near_task_reminder: [
    "[focused] There is evidence nearby. Complete the task to add it to your log.",
    "[calm] A data fragment is close. Collect it to build your case against the impostor.",
  ],
};

let lastHintTime = 0;
let lastHintType = null;
const HINT_COOLDOWN = 15000; // 15 seconds between hints
let proximityPack = null;

export function initProximityVoice(pack) {
  lastHintTime = 0;
  lastHintType = null;
  proximityPack = pack || null;
}

export function updateProximityVoice() {
  if (state.mode !== 'playing') return;

  const now = performance.now();
  if (now - lastHintTime < HINT_COOLDOWN) return;

  const hint = determineHint();
  if (!hint) return;

  lastHintTime = now;
  lastHintType = hint.type;

  ensureAudio();
  resumeAudio();

  const hintId = 'prox-' + hint.type;
  if (proximityPack && proximityPack[hintId]) {
    speakCharacter('operator', hint.text, null, proximityPack[hintId]);
  } else {
    speakCharacter('operator', hint.text);
  }

  setStatus('Hint: ' + hint.type.replace(/_/g, ' '));
}

function determineHint() {
  // Check for impostor hunting
  if (state.suspicion > 80) {
    const texts = PROXIMITY_HINTS.impostor_hunting;
    return { type: 'impostor_hunting', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  // Check for wrong accusation aftermath
  if (state.result === 'wrong' || (state.accusations > 0 && state.suspicion > 90)) {
    const texts = PROXIMITY_HINTS.wrong_accusation_aftermath;
    return { type: 'wrong_accusation_aftermath', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  // Check for correct accusation
  if (state.result === 'accused' && state.revealedImpostor) {
    const texts = PROXIMITY_HINTS.correct_accusation_aftermath;
    return { type: 'correct_accusation_aftermath', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  // Check for near impostor
  const nearImpostor = isNearImpostor(120);
  if (nearImpostor) {
    const texts = PROXIMITY_HINTS.near_impostor;
    return { type: 'near_impostor', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  // Check for high noise
  if (state.noise > 75) {
    const texts = PROXIMITY_HINTS.high_noise_warning;
    return { type: 'high_noise_warning', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  // Check for near exit with tasks done
  if (state.completedTasks >= state.requiredTasks && state.meetingUnlocked && isNearExit()) {
    const texts = PROXIMITY_HINTS.near_exit_unlocked;
    return { type: 'near_exit_unlocked', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  // Check for low tasks remaining
  if (state.completedTasks === state.requiredTasks - 1) {
    const texts = PROXIMITY_HINTS.low_tasks_remaining;
    return { type: 'low_tasks_remaining', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  // Check for near task
  const nearTask = isNearTask();
  if (nearTask && state.completedTasks < state.requiredTasks) {
    const texts = PROXIMITY_HINTS.near_task_reminder;
    return { type: 'near_task_reminder', text: texts[Math.floor(state.rng() * texts.length)] };
  }

  return null;
}

function isNearImpostor(range) {
  const impostor = state.crew.find((m) => m.isImpostor);
  if (!impostor) return false;

  const dist = Math.hypot(impostor.px - state.player.px, impostor.py - state.player.py);
  return dist < range;
}

function isNearExit() {
  if (!state.exit) return false;
  const dist = Math.hypot(state.exit.x - state.player.x, state.exit.y - state.player.y);
  return dist < 3;
}

function isNearTask() {
  for (const task of state.tasks) {
    if (task.done) continue;
    const dist = Math.hypot(task.x - state.player.x, task.y - state.player.y);
    if (dist < 2) return true;
  }
  return false;
}

export async function generateProximityPack(seed) {
  if (!seed) return null;

  const cast = [];
  const hintMap = {};

  for (const [type, texts] of Object.entries(PROXIMITY_HINTS)) {
    const text = texts[0];
    const id = 'prox-' + type;
    cast.push({
      character: 'operator',
      lines: [text],
    });
    hintMap[id] = text;
  }

  try {
    const response = await fetch('/api/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: 'prox-' + seed, cast }),
    });

    if (!response.ok) throw new Error('proximity voice endpoint failed');

    const data = await response.json();
    if (data.generated && data.clips) {
      const pack = {};
      let index = 0;
      for (const [character, clips] of Object.entries(data.clips)) {
        if (clips[0] && clips[0].src) {
          const id = Object.keys(hintMap)[index];
          if (id) {
            pack[id] = clips[0].src;
          }
          index++;
        }
      }
      proximityPack = pack;
      return pack;
    }
  } catch (error) {
    console.warn('[proximity pack]', error);
  }

  return null;
}

export function getProximityPack() {
  return proximityPack;
}
