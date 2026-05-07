import { state, ROOM_NAMES } from '../core/state.js';
import { speakCharacter, ensureAudio, resumeAudio } from './audio.js';

// Voice-Guided Tutorial System
// Provides contextual voice hints for new players

const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    text: "Welcome aboard. I am Nova, your ship operator. This is a voice-guided tour of the Echo Impostor protocol. Listen carefully, your survival depends on it.",
    trigger: 'startup',
    character: 'nova',
  },
  {
    id: 'movement',
    text: "Use W, A, S, D or arrow keys to move through the ship. Hold shift to sprint, but be warned — sprinting creates noise that attracts the impostor.",
    trigger: 'first-move',
    character: 'nova',
  },
  {
    id: 'hiding',
    text: "Press space near lockers or vents to hide in acoustic shadows. The impostor cannot hear you while hidden. Use this wisely.",
    trigger: 'near-hideout',
    character: 'nova',
  },
  {
    id: 'tasks',
    text: "Collect evidence by completing tasks marked on your map. You need three pieces of evidence before you can safely accuse anyone.",
    trigger: 'near-task',
    character: 'nova',
  },
  {
    id: 'interrogation',
    text: "Press E near crew members to interrogate them. Listen to their voices carefully — the impostor's speech contains subtle compression artifacts that differ from human crew.",
    trigger: 'near-crew',
    character: 'nova',
  },
  {
    id: 'accusation',
    text: "Once you have enough evidence, press Q near a suspect to accuse them. Be absolutely certain — a wrong accusation triggers the impostor's hunt protocol.",
    trigger: 'meeting-unlocked',
    character: 'nova',
  },
  {
    id: 'noise',
    text: "Watch your noise meter. Moving through vents, sprinting, or making too much sound will draw the impostor to your location. Stay quiet. Stay alive.",
    trigger: 'high-noise',
    character: 'nova',
  },
  {
    id: 'replay',
    text: "You can replay any voice recording from the evidence log. Click the play button next to each entry to hear it again. Compare voices. Find the lie.",
    trigger: 'first-evidence',
    character: 'nova',
  },
  {
    id: 'audio-logs',
    text: "Scattered throughout the ship are audio logs from previous crew members. These logs contain valuable backstory and may reveal patterns in the impostor's behavior.",
    trigger: 'near-audiolog',
    character: 'nova',
  },
];

let tutorialState = {
  completed: new Set(),
  inProgress: false,
  currentStep: null,
  firstMoveTriggered: false,
  firstEvidenceTriggered: false,
};

let tutorialPack = null;
let isTutorialEnabled = true;

export function initTutorial(pack) {
  tutorialPack = pack;
  tutorialState.completed.clear();
  tutorialState.inProgress = false;
  tutorialState.currentStep = null;
  tutorialState.firstMoveTriggered = false;
  tutorialState.firstEvidenceTriggered = false;
}

export function disableTutorial() {
  isTutorialEnabled = false;
}

export function enableTutorial() {
  isTutorialEnabled = true;
}

export function isTutorialActive() {
  return isTutorialEnabled;
}

export function playTutorialStep(stepId) {
  if (!isTutorialEnabled) return;
  if (tutorialState.completed.has(stepId)) return;
  if (tutorialState.inProgress) return;

  const step = TUTORIAL_STEPS.find((s) => s.id === stepId);
  if (!step) return;

  tutorialState.inProgress = true;
  tutorialState.currentStep = stepId;

  ensureAudio();
  resumeAudio();

  // Check if we have a pre-generated tutorial voice pack
  if (tutorialPack && tutorialPack[stepId]) {
    speakCharacter(step.character, step.text, null, tutorialPack[stepId]);
  } else {
    speakCharacter(step.character, step.text);
  }

  // Mark as completed after a delay to allow re-triggering on new runs
  setTimeout(() => {
    tutorialState.completed.add(stepId);
    tutorialState.inProgress = false;
    tutorialState.currentStep = null;
  }, 8000);
}

export function triggerTutorial(event) {
  if (!isTutorialEnabled) return;

  switch (event) {
    case 'startup':
      playTutorialStep('welcome');
      break;
    case 'first-move':
      if (!tutorialState.firstMoveTriggered) {
        tutorialState.firstMoveTriggered = true;
        setTimeout(() => playTutorialStep('movement'), 2000);
      }
      break;
    case 'near-hideout':
      playTutorialStep('hiding');
      break;
    case 'near-task':
      playTutorialStep('tasks');
      break;
    case 'near-crew':
      playTutorialStep('interrogation');
      break;
    case 'meeting-unlocked':
      playTutorialStep('accusation');
      break;
    case 'high-noise':
      if (state.noise > 60) {
        playTutorialStep('noise');
      }
      break;
    case 'first-evidence':
      if (!tutorialState.firstEvidenceTriggered) {
        tutorialState.firstEvidenceTriggered = true;
        setTimeout(() => playTutorialStep('replay'), 1500);
      }
      break;
    case 'near-audiolog':
      playTutorialStep('audio-logs');
      break;
  }
}

export async function generateTutorialAudio(seed) {
  if (!seed) return null;

  try {
    const response = await fetch('/api/tutorial', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed: String(seed) }),
    });

    if (!response.ok) throw new Error('tutorial endpoint failed');

    const data = await response.json();
    if (data.generated && data.clips) {
      const pack = {};
      for (const clip of data.clips) {
        if (clip.id && clip.src) {
          pack[clip.id] = clip.src;
        }
      }
      tutorialPack = pack;
      return pack;
    }
  } catch (error) {
    console.warn('[tutorial audio]', error);
  }

  return null;
}

export function getTutorialProgress() {
  return {
    completed: Array.from(tutorialState.completed),
    total: TUTORIAL_STEPS.length,
    enabled: isTutorialEnabled,
  };
}
