import { state, ui, COLORS, CREW_TEMPLATES, CREW_ROLES, NOVA_LINES, voiceCache, voiceBufferCache, $, canvas } from '../core/state.js';
import { ensureAudio, resumeAudio, stopActiveVoice, primeVoiceBuffer, speakFallback, speakCharacter, generateAudioPack as _generateAudioPack } from '../audio/audio.js';
import { hasVoice, replayVoice } from '../audio/voice-cache.js';
import { getCollectedLogs, replayAudioLog } from '../audio/audio-logs.js';
import { bus } from '../core/event-bus.js';

let suspectListenerBound = false;
let evidenceListenerBound = false;
let audiologListenerBound = false;

// Listen for audio log collection events
bus.on('audiolog:collected', () => {
  updateAudioLogPanel();
});

const EVIDENCE_TYPES = {
  interrogation: { icon: 'voice', label: 'Voice Recording', color: 'cyan' },
  conversation:  { icon: 'voice', label: 'Broken Conversation', color: 'purple' },
  task:          { icon: 'download', label: 'Sound Trail', color: 'green' },
  accusation:    { icon: 'alert', label: 'Accusation Result', color: 'red' },
  system:        { icon: 'signal', label: 'System Log', color: 'muted' },
};

function classifyEvidence(text) {
  const str = String(text);
  if (str.startsWith('Broken Conversation|')) return 'conversation';
  if (str.startsWith('Voice Recording|')) return 'interrogation';
  if (str.startsWith('Sound Trail|')) return 'task';
  if (str.startsWith('Impostor Exposed|') || str.startsWith('Wrong Accusation|')) return 'accusation';
  return 'system';
}

export function addEvidence(text) {
  state.evidenceLog.unshift(text);
  state.evidenceLog = state.evidenceLog.slice(0, 8);
  updateIntelPanel();
}

export function updateIntelPanel() {
  if (ui.suspectList) {
    if (!state.crew.length) {
      ui.suspectList.innerHTML =
        '<div class="eh-empty-state">Start a ship to open the crew manifest.</div>';
    } else {
      ui.suspectList.innerHTML = state.crew
        .map((member) => {
          const line =
            member.accused && member.isImpostor && state.revealedImpostor
              ? "Impostor exposed"
              : member.talked
                ? member.lastLine
                : "Not interrogated";
          const role = CREW_ROLES[member.id] || "Crew";
          const initial = member.name.slice(0, 1).toUpperCase();

          return (
            '<div class="eh-suspect-card ' +
            (member.isImpostor && state.revealedImpostor ? "revealed" : "") +
            '" style="--crew:' +
            member.color +
            '"><div class="eh-suspect-avatar eh-avatar--' +
            escapeHtml(member.id) +
            '" data-initial="' +
            escapeHtml(initial) +
            '"><img src="/screen/' + escapeHtml(member.id) + '.png" alt="' + escapeHtml(member.name) + '" class="eh-av-img" /></div><div class="eh-suspect-copy"><div class="eh-suspect-name">' +
            escapeHtml(member.name) +
            '</div><div class="eh-suspect-role">' +
            escapeHtml(role) +
            '</div><div class="eh-suspect-meta">' +
            escapeHtml(line) +
            '</div><div class="eh-suspect-wave" aria-hidden="true"></div></div><button class="eh-suspect-play" data-character-id="' + escapeHtml(member.id) + '"' + (hasVoice(member.id) ? '' : ' disabled') + ' type="button" aria-label="Play voice ' + escapeHtml(member.name) + '"></button></div>'
          );
        })
        .join("");

      if (!suspectListenerBound) {
        ui.suspectList.addEventListener('click', (e) => {
          const btn = e.target.closest('.eh-suspect-play');
          if (!btn || btn.disabled) return;
          const charId = btn.dataset.characterId;
          if (charId) replayVoice(charId);
        });
        suspectListenerBound = true;
      }
    }
  }

  if (ui.evidenceList) {
    if (!state.evidenceLog.length) {
      ui.evidenceList.innerHTML =
        '<div class="eh-empty-state">Complete a task or interrogate crew to unlock the first entry.</div>';
    } else {
      const cluesNeeded = Math.max(0, (state.requiredTasks || 3) - state.completedTasks);
      const items = state.evidenceLog
        .map((item, idx) => {
          const type = classifyEvidence(item);
          const parts = String(item).split("|");
          const delay = idx * 50;

          if (parts.length >= 4) {
            const charId = parts[parts.length - 1];
            const crewMember = state.crew.find(c => c.id === charId);
            const crewColor = crewMember ? crewMember.color : null;
            return (
              '<div class="eh-evidence-item eh-ev--' + type + '" style="animation-delay:' + delay + 'ms' + (crewColor ? ';--ev-crew:' + crewColor : '') + '">' +
              '<div class="eh-ev-body">' +
              '<div class="eh-evidence-head"><strong>' + escapeHtml(parts[0]) + '</strong><time>' + escapeHtml(parts[2]) + '</time></div>' +
              '<p>' + escapeHtml(parts[1]) + '</p>' +
              '</div>' +
              '<button class="eh-evidence-play eh-suspect-play" data-character-id="' + escapeHtml(charId) + '"' + (hasVoice(charId) ? '' : ' disabled') + ' type="button" aria-label="Play voice clip"></button>' +
              '</div>'
            );
          }
          if (parts.length >= 3) {
            return (
              '<div class="eh-evidence-item eh-ev--' + type + '" style="animation-delay:' + delay + 'ms">' +
              '<div class="eh-ev-body">' +
              '<div class="eh-evidence-head"><strong>' + escapeHtml(parts[0]) + '</strong><time>' + escapeHtml(parts[2]) + '</time></div>' +
              '<p>' + escapeHtml(parts.slice(1, -1).join("|")) + '</p>' +
              '</div></div>'
            );
          }

          return (
            '<div class="eh-evidence-item eh-ev--' + type + '" style="animation-delay:' + delay + 'ms">' +
            '<div class="eh-ev-body"><p>' + escapeHtml(item) + '</p></div></div>'
          );
        })
        .join("");

      const lockedCard = cluesNeeded > 0
        ? '<div class="eh-ev-locked-hint">' +
          '<strong>Find ' + cluesNeeded + ' more clue' + (cluesNeeded > 1 ? 's' : '') + '</strong>' +
          '<p>Accusation access improves with more evidence.</p>' +
          '</div>'
        : '';

      ui.evidenceList.innerHTML = items + lockedCard;

      if (!evidenceListenerBound) {
        ui.evidenceList.addEventListener('click', (e) => {
          const btn = e.target.closest('.eh-evidence-play');
          if (!btn || btn.disabled) return;
          const charId = btn.dataset.characterId;
          if (charId) replayVoice(charId);
        });
        evidenceListenerBound = true;
      }
    }
  }

  updateProgressPanel();
  updateAudioLogPanel();
}

export function updateAudioLogPanel() {
  if (!ui.audiologList) return;

  const logs = getCollectedLogs();
  if (!logs.length) {
    ui.audiologList.innerHTML =
      '<div class="eh-empty-state">Explore the ship to discover audio logs from previous crew members.</div>';
    return;
  }

  ui.audiologList.innerHTML = logs
    .map((log, idx) => {
      const delay = idx * 50;
      return (
        '<div class="eh-audiolog-item" style="animation-delay:' + delay + 'ms">' +
        '<div class="eh-ev-body">' +
        '<div class="eh-evidence-head"><strong>' + escapeHtml(log.title) + '</strong><time>' + escapeHtml(log.room) + '</time></div>' +
        '<p>' + escapeHtml(log.text.substring(0, 80)) + '...</p>' +
        '</div>' +
        '<button class="eh-audiolog-play eh-suspect-play" data-log-id="' + escapeHtml(log.id) + '" type="button" aria-label="Play audio log"></button>' +
        '</div>'
      );
    })
    .join('');

  if (!audiologListenerBound) {
    ui.audiologList.addEventListener('click', (e) => {
      const btn = e.target.closest('.eh-audiolog-play');
      if (!btn || btn.disabled) return;
      const logId = btn.dataset.logId;
      if (logId) replayAudioLog(logId);
    });
    audiologListenerBound = true;
  }
}

export function updateProgressPanel() {
  const talkedCount = state.crew.filter((member) => member.talked).length;
  const crewCount = state.crew.length || CREW_TEMPLATES.length;
  const taskTotal = state.requiredTasks || 3;

  if (ui.taskCount) {
    ui.taskCount.textContent = state.completedTasks + " / " + taskTotal;
  }

  if (ui.talkCount) {
    ui.talkCount.textContent = talkedCount + " / " + crewCount;
  }

  if (ui.taskProgressFill) {
    ui.taskProgressFill.style.width =
      Math.min(100, (state.completedTasks / taskTotal) * 100) + "%";
  }

  if (ui.talkProgressFill) {
    ui.talkProgressFill.style.width =
      Math.min(100, (talkedCount / crewCount) * 100) + "%";
  }
}

export function noiseLabel(value) {
  if (value > 72) return "High";
  if (value > 38) return "Medium";
  if (value > 8) return "Low";
  return "Quiet";
}

export function setMissionButtonText(text) {
  if (!ui.missionBtn) return;
  ui.missionBtn.innerHTML =
    '<span class="eh-btn-icon eh-btn-icon--voice"></span>' +
    escapeHtml(text);
}

export async function preGenerateCastVoices() {
  if (!state.crew.length) return null;

  voiceCache.clear();
  voiceBufferCache.clear();
  stopActiveVoice();

  const cast = state.crew.map((member) => ({
    character: member.isImpostor ? "impostor" : member.id,
    lines: (member.isImpostor
      ? member.impostorLines
      : member.innocentLines
    ).slice(0, 3),
  }));

  cast.push({
    character: "nova",
    lines: [
      NOVA_LINES.intro,
      NOVA_LINES.evidence,
      NOVA_LINES.ready,
      NOVA_LINES.victory,
    ],
  });

  try {
    const response = await fetch("/api/cast", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seed: String(state.seed), cast }),
    });

    if (!response.ok) throw new Error("cast endpoint failed");

    const data = await response.json();
    state.voicePack = {};

    for (const [character, clips] of Object.entries(data.clips || {})) {
      state.voicePack[character] = clips.map((clip) => {
        const entry = {
          text: clip.text,
          src: clip.src || null,
        };

        if (entry.src) primeVoiceBuffer(entry.src);
        return entry;
      });
    }

    setStatus(data.generated ? "Crew voices ready" : "Fallback crew ready");
    return data;
  } catch (error) {
    console.warn("[cast]", error);
    setStatus("Fallback crew ready");
    return null;
  }
}

export function findPackedVoice(character, text) {
  const clips = state.voicePack[character] || [];
  const match = clips.find((clip) => clip.text === text && clip.src);
  if (!match) return null;
  return match.src;
}

export function setObjective(text) {
  if (ui.objective) ui.objective.textContent = text;
}

export function setStatus(text) {
  if (ui.status) ui.status.textContent = text;
}

export function showOverlay(title, body, buttonText) {
  if (!ui.overlay) return;
  ui.overlay.classList.add("active");
  ui.overlay.innerHTML =
    "<div><h2>" +
    escapeHtml(title) +
    "</h2><p>" +
    escapeHtml(body) +
    '</p><button id="overlay-action" class="eh-primary" type="button">' +
    escapeHtml(buttonText || "Start new ship") +
    "</button></div>";
  const btn = $("#overlay-action");
  if (btn) btn.addEventListener("click", async () => {
    const { startNewRun } = await import('../game/session.js');
    startNewRun();
  });
}

export function hideOverlay() {
  if (ui.overlay) ui.overlay.classList.remove("active");
}

export function toast(text) {
  const now = performance.now();
  if (now - state.lastToastAt < 900) return;
  state.lastToastAt = now;
  setStatus(text);
}

export function emitParticles(x, y, color, count = 18, power = 1) {
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (28 + Math.random() * 120) * power;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.45 + Math.random() * 0.75,
      maxLife: 0.9,
      size: 1.8 + Math.random() * 3.4,
      color,
    });
  }

  state.particles = state.particles.slice(-180);
}

export function updateParticles(dt) {
  for (const particle of state.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.965;
    particle.vy *= 0.965;
    particle.vy += 12 * dt;
  }

  state.particles = state.particles.filter((particle) => particle.life > 0);
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}