import { state, TILE, COLS, ROWS, COLORS, NOVA_LINES, choice, randInt, voiceCache } from '../core/state.js';
import { playSfx, speakCharacter, startAlertMusic, stopMusic } from '../audio/audio.js';
import { cacheVoice } from '../audio/voice-cache.js';
import { bus } from '../core/event-bus.js';
import { addEvidence, updateIntelPanel, setObjective, setStatus, toast, emitParticles, updateParticles, showOverlay, hideOverlay, findPackedVoice } from '../ui/panels.js';
import { formatTime } from '../render/primitives.js';
import { isFloor, isVent, isHiding, canMoveTo, nearestFloor } from '../map/generator.js';
import { updateUi } from '../render/shell.js';

// Keep replay cache in sync with ElevenLabs-generated audio
bus.on('voice:cached', ({ characterId, src, text }) => {
  if (characterId && src) cacheVoice(characterId, src, text);
});

export function update(dt) {
  if (state.mode !== "playing") return;
  if (state.paused) return;

  state.timer += dt;
  state.noise = Math.max(0, state.noise - dt * 14);
  state.suspicion = Math.max(0, state.suspicion - dt * 5);
  state.cameraShake = Math.max(0, state.cameraShake - dt * 14);

  updatePlayer(dt);
  updateCrew(dt);
  updateObjectiveState();
  updateParticles(dt);
  state.scanOffset = (state.scanOffset + dt * 34) % 80;
  state.minimapPulse += dt;
  updateUi();
}

export function updatePlayer(dt) {
  let dx = 0;
  let dy = 0;

  if (state.keys.has("arrowleft") || state.keys.has("a")) dx -= 1;
  if (state.keys.has("arrowright") || state.keys.has("d")) dx += 1;
  if (state.keys.has("arrowup") || state.keys.has("w")) dy -= 1;
  if (state.keys.has("arrowdown") || state.keys.has("s")) dy += 1;

  const moving = dx || dy;
  if (!moving) return;

  const len = Math.hypot(dx, dy);
  dx /= len;
  dy /= len;

  if (Math.abs(dx) > Math.abs(dy)) state.player.face = dx > 0 ? 1 : -1;

  const sprint = state.keys.has("shift");
  const hiding =
    isHiding(state.player.x, state.player.y) && state.keys.has(" ");
  state.player.hidden = hiding;

  if (hiding) {
    state.noise = Math.max(0, state.noise - dt * 48);
    return;
  }

  const speed = state.player.speed * (sprint ? 1.45 : 1);
  const nx = state.player.px + dx * speed * TILE * dt;
  const ny = state.player.py + dy * speed * TILE * dt;

  if (canMoveTo(nx, state.player.py)) state.player.px = nx;
  if (canMoveTo(state.player.px, ny)) state.player.py = ny;

  state.player.x = Math.floor(state.player.px / TILE);
  state.player.y = Math.floor(state.player.py / TILE);

  const loud = isVent(state.player.x, state.player.y);
  state.noise = Math.min(
    100,
    state.noise + dt * ((sprint ? 38 : 18) + (loud ? 65 : 0)),
  );

  if (Math.random() < dt * 4.2) playSfx(loud ? "vent" : "step");
  if (loud && Math.random() < dt * 1.8) {
    state.cameraShake = 3;
    toast("Vent grid is loud");
  }
}

export function updateCrew(dt) {
  for (const member of state.crew) {
    const playerDist = Math.hypot(
      member.px - state.player.px,
      member.py - state.player.py,
    );

    if (member.isImpostor) {
      const canHunt =
        state.noise > 50 || state.completedTasks >= 3 || state.suspicion > 55;
      const hidden = state.player.hidden;

      if (canHunt && !hidden && playerDist < 220) {
        moveActorToward(member, state.player.px, state.player.py, dt, member.speed + 0.25);
        state.suspicion = Math.min(100, state.suspicion + dt * 10);
        if (state.suspicion > 55) startAlertMusic();

        if (playerDist < 28 && performance.now() - member.lastAttackAt > 600) {
          member.lastAttackAt = performance.now();
          loseGame(member);
        }
        continue;
      }
    }

    if (!member.target || performance.now() > member.nextMoveAt) {
      const target = choiceFreeFloor();
      member.target = target;
      member.nextMoveAt = performance.now() + randInt(1800, 4200);
    }

    const targetPx = member.target.x * TILE + TILE / 2;
    const targetPy = member.target.y * TILE + TILE / 2;
    moveActorToward(member, targetPx, targetPy, dt, member.speed);

    if (Math.hypot(member.px - targetPx, member.py - targetPy) < 8) {
      member.target = null;
    }

    if (member.isImpostor && playerDist < 180 && state.noise > 62 && !state.player.hidden) {
      state.suspicion = Math.min(100, state.suspicion + dt * 8);
    }
  }

  if (state.suspicion > 68 && Math.random() < dt * 1.2) {
    playSfx("alert");
  }
}

export function choiceFreeFloor() {
  for (let i = 0; i < 80; i += 1) {
    const room = choice(state.rooms);
    const x = randInt(room.x, room.x + room.w - 1);
    const y = randInt(room.y, room.y + room.h - 1);
    if (isFloor(x, y)) return { x, y };
  }
  return nearestFloor(randInt(1, COLS - 2), randInt(1, ROWS - 2));
}

export function moveActorToward(actor, tx, ty, dt, speed) {
  const dx = tx - actor.px;
  const dy = ty - actor.py;
  const len = Math.hypot(dx, dy);
  if (len < 1) return;

  const step = Math.min(len, speed * TILE * dt);
  const nx = actor.px + (dx / len) * step;
  const ny = actor.py + (dy / len) * step;

  if (canMoveTo(nx, actor.py)) actor.px = nx;
  if (canMoveTo(actor.px, ny)) actor.py = ny;

  actor.x = Math.floor(actor.px / TILE);
  actor.y = Math.floor(actor.py / TILE);
}

export function updateObjectiveState() {
  const nearTask = nearestTask();
  if (nearTask && !nearTask.done) {
    toast("E: " + nearTask.label);
  }

  const nearCrew = nearestCrew(82);
  if (nearCrew) {
    toast("E interrogate " + nearCrew.name + " · Q accuse");
  }

  if (state.completedTasks >= state.requiredTasks && !state.meetingUnlocked) {
    state.meetingUnlocked = true;
    setObjective("Enough evidence. Interrogate suspects and press Q near the impostor.");
    speakCharacter("nova", NOVA_LINES.ready);
  }

  if (state.exit && state.completedTasks >= state.requiredTasks && state.accusations > 0) {
    const d = Math.hypot(state.player.x - state.exit.x, state.player.y - state.exit.y);
    if (d < 1.2 && state.result === "accused") {
      winGame();
    }
  }
}

export function nearestTask() {
  let best = null;
  let bestDist = Infinity;
  for (const task of state.tasks) {
    const d = Math.hypot(task.x - state.player.x, task.y - state.player.y);
    if (d < bestDist) { best = task; bestDist = d; }
  }
  return bestDist <= 1.65 ? best : null;
}

export function nearestCrew(maxPx) {
  let best = null;
  let bestDist = Infinity;
  for (const member of state.crew) {
    const d = Math.hypot(member.px - state.player.px, member.py - state.player.py);
    if (d < bestDist && d <= maxPx) { best = member; bestDist = d; }
  }
  return best;
}

export function interact() {
  if (state.mode !== "playing") return;

  const task = nearestTask();
  if (task && !task.done && state.completedTasks < state.requiredTasks) {
    task.done = true;
    state.completedTasks += 1;
    addEvidence("Sound Trail|" + task.label + " completed in " + task.room + ".|" + formatTime(state.timer));
    state.noise = Math.min(100, state.noise + 8);
    playSfx("task");
    emitParticles(task.x * TILE + TILE / 2, task.y * TILE + TILE / 2, COLORS.amber, 30, 1.2);
    if (state.completedTasks >= state.requiredTasks) {
      setObjective("Enough evidence. Interrogate suspects and press Q near the impostor.");
    } else {
      setObjective("Evidence " + state.completedTasks + "/" + state.requiredTasks + " collected.");
    }
    speakCharacter("nova", NOVA_LINES.evidence);
    return;
  }

  const crew = nearestCrew(82);
  if (crew) {
    crew.talked = true;
    state.interrogations += 1;
    const lines = crew.isImpostor ? crew.impostorLines : crew.innocentLines;
    const line = choice(lines);
    crew.lastLine = line;
    const charId = crew.isImpostor ? "impostor" : crew.id;
    const packedSrc = findPackedVoice(charId, line);
    const cachedSrc = voiceCache.get(charId + "::" + line) || packedSrc || null;
    cacheVoice(crew.id, cachedSrc, line);
    const evLabel = crew.isImpostor ? "Broken Conversation" : "Voice Recording";
    addEvidence(evLabel + "|" + crew.name + " said: \u201c" + line + "\u201d|" + formatTime(state.timer) + "|" + crew.id);
    updateIntelPanel();
    speakCharacter(charId, line);
    return;
  }

  if (isHiding(state.player.x, state.player.y)) {
    state.player.hidden = true;
    state.noise = Math.max(0, state.noise - 25);
    setStatus("Acoustic shadow");
    return;
  }

  toast("No target nearby");
}

export function accuse() {
  if (state.mode !== "playing") return;

  const crew = nearestCrew(82);
  if (!crew) { toast("Get closer to a suspect"); return; }

  state.accusations += 1;
  crew.accused = true;
  updateIntelPanel();
  playSfx("accuse");

  if (crew.isImpostor) {
    state.result = "accused";
    state.revealedImpostor = true;
    state.suspicion = 0;
    state.cameraShake = 10;
    emitParticles(crew.px, crew.py, COLORS.red, 70, 1.7);
    state.cinematic = {
      title: "IMPOSTOR EXPOSED",
      subtitle: crew.name + " was the impostor. Reach the exit.",
      tone: "red",
      until: performance.now() + 3600,
    };
    addEvidence("Impostor Exposed|" + crew.name + " was the impostor. Evacuate now.|" + formatTime(state.timer));
    updateIntelPanel();
    setObjective("Correct accusation. Reach the green exit.");
    speakCharacter("impostor", "No. You were not supposed to hear the real voice.");
    return;
  }

  addEvidence("Wrong Accusation|" + crew.name + " is innocent. The impostor is hunting.|" + formatTime(state.timer));
  state.suspicion = 100;
  state.noise = 100;
  state.cameraShake = 8;
  emitParticles(state.player.px, state.player.py, COLORS.red, 54, 1.5);
  state.cinematic = {
    title: "WRONG CHOICE",
    subtitle: crew.name + " is innocent. The impostor is hunting.",
    tone: "red",
    until: performance.now() + 3200,
  };
  setObjective("Wrong accusation. The impostor is hunting you.");
  speakCharacter(crew.id, "That was wrong. The impostor knows you are exposed.");
  startAlertMusic();
}

export function winGame() {
  if (state.mode !== "playing") return;
  state.mode = "ended";
  state.cinematic = {
    title: "CREW SURVIVED",
    subtitle: "Impostor exposed, ship intact.",
    tone: "green",
    until: performance.now() + 4200,
  };
  stopMusic();
  emitParticles(state.player.px, state.player.py, COLORS.green, 90, 1.9);
  playSfx("win");
  speakCharacter("nova", NOVA_LINES.victory);
  showOverlay(
    "Impostor exposed",
    "Ship seed " + state.seed + ": evidence collected, accusation correct, evacuation complete.",
    "New ship",
  );
}

export function loseGame(member) {
  if (state.mode !== "playing") return;
  state.mode = "ended";
  state.cinematic = {
    title: "YOU WERE REPLACED",
    subtitle: "The impostor got close enough to copy your voice.",
    tone: "red",
    until: performance.now() + 4200,
  };
  stopMusic();
  state.cameraShake = 12;
  emitParticles(state.player.px, state.player.py, COLORS.red, 90, 2.1);
  playSfx("lose");
  speakCharacter("impostor", "Too loud. Too curious. Too late.");
  showOverlay(
    "You were replaced",
    (member ? member.name : "The impostor") + " reached you before the meeting.",
    "Another ship",
  );
}
