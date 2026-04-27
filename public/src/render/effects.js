/**
 * effects.js — Visual FX layer for Echo Impostor.
 *
 * 1. FOV (fog of war) — dark mask with a radial hole around the player
 * 2. Player trail — fading circles behind the player when moving
 * 3. Voice pulse — expanding rings around a speaking crew member
 * 4. Glitch overlay — chromatic-style distortion at high suspicion
 */

import { Graphics, Container, Text, TextStyle, BlurFilter, ColorMatrixFilter } from '/lib/pixi.min.mjs';
import { state, TILE, WIDTH, HEIGHT } from '../core/state.js';
import { bus } from '../core/event-bus.js';

/* ── FOV (Fog of War) ──────────────────────────────────────── */

let fovGfx = null;
const FOV_RADIUS_BASE = 200;
const FOV_SOFT_EDGE = 120;

export function buildFovLayer() {
  fovGfx = new Container({ label: 'fov' });
  fovGfx.eventMode = 'none';
  return fovGfx;
}

export function refreshFov() {
  if (!fovGfx) return;
  fovGfx.removeChildren().forEach(c => c.destroy());

  const px = state.player.px;
  const py = state.player.py;

  // Suspicion shrinks the visible radius
  const suspicionFactor = state.suspicion > 50 ? 1 - (state.suspicion - 50) / 100 : 1;
  const radius = FOV_RADIUS_BASE * suspicionFactor;

  // Draw 4 dark rectangles around the player circle area
  // Top
  const dark = new Graphics();

  // We draw a full dark overlay, then cut a gradient hole.
  // Since we can't do real radial gradient masks easily with Graphics alone,
  // we draw concentric rings from outside-in, each slightly less opaque.
  const maxR = Math.max(WIDTH, HEIGHT);
  const steps = 16;
  const baseAlpha = 0.78;

  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const innerR = radius + FOV_SOFT_EDGE * t;
    const outerR = radius + FOV_SOFT_EDGE * (t + 1 / steps);
    const alpha = baseAlpha * t * t; // quadratic ramp up

    // Draw a ring (annulus) using a thick stroke
    const midR = (innerR + outerR) / 2;
    const thickness = outerR - innerR;
    dark.circle(px, py, midR)
      .stroke({ width: thickness, color: 0x020710, alpha });
  }

  // Solid dark beyond the soft edge
  const outerStart = radius + FOV_SOFT_EDGE;
  const ringThickness = maxR - outerStart;
  if (ringThickness > 0) {
    dark.circle(px, py, outerStart + ringThickness / 2)
      .stroke({ width: ringThickness + 2, color: 0x020710, alpha: baseAlpha });
  }

  fovGfx.addChild(dark);
}

/* ── Player Trail ──────────────────────────────────────────── */

const trail = [];
const MAX_TRAIL = 18;
let trailContainer = null;
let lastTrailX = 0;
let lastTrailY = 0;

export function buildTrailLayer() {
  trailContainer = new Container({ label: 'trail' });
  return trailContainer;
}

export function updateTrail(dt) {
  if (!trailContainer) return;

  const px = state.player.px;
  const py = state.player.py;
  const moved = Math.hypot(px - lastTrailX, py - lastTrailY);

  // Only add trail points when actually moving
  if (moved > 6) {
    const sprint = state.keys.has('shift');
    trail.push({
      x: px,
      y: py,
      life: 1.0,
      maxLife: sprint ? 0.5 : 0.35,
      size: sprint ? 8 : 5,
      color: sprint ? 0x55ffe2 : 0x69ffb1,
    });
    if (trail.length > MAX_TRAIL) trail.shift();
    lastTrailX = px;
    lastTrailY = py;
  }

  // Decay
  for (const p of trail) {
    p.life -= dt / p.maxLife;
  }

  // Remove dead
  while (trail.length > 0 && trail[0].life <= 0) trail.shift();

  // Redraw
  trailContainer.removeChildren().forEach(c => c.destroy());
  for (const p of trail) {
    if (p.life <= 0) continue;
    const alpha = p.life * 0.4;
    const g = new Graphics();
    g.circle(0, 0, p.size * p.life).fill({ color: p.color, alpha });
    g.x = p.x;
    g.y = p.y;
    trailContainer.addChild(g);
  }
}

/* ── Voice Pulse ───────────────────────────────────────────── */

const voicePulses = [];
let voicePulseContainer = null;

export function buildVoicePulseLayer() {
  voicePulseContainer = new Container({ label: 'voice-pulse' });

  // Listen for voice events
  bus.on('voice:play', (data) => {
    if (!data) return;
    const { characterId } = data;
    // Find the crew member
    const member = state.crew.find((m) => m.id === characterId || (m.isImpostor && characterId === 'impostor'));
    if (member) {
      spawnVoicePulse(member.px, member.py, member.color);
    } else if (characterId === 'nova') {
      // Nova speaks from the player's position (operator voice)
      spawnVoicePulse(state.player.px, state.player.py, '#55ffe2');
    }
  });

  return voicePulseContainer;
}

function spawnVoicePulse(x, y, color) {
  const c = typeof color === 'string' ? parseInt(color.replace('#', ''), 16) : color;
  // Spawn 3 staggered rings
  for (let i = 0; i < 3; i++) {
    voicePulses.push({
      x, y, color: c,
      radius: 14,
      maxRadius: 55 + i * 18,
      life: 1.0,
      delay: i * 0.15,
    });
  }
}

export function updateVoicePulses(dt) {
  if (!voicePulseContainer) return;

  for (const p of voicePulses) {
    if (p.delay > 0) {
      p.delay -= dt;
      continue;
    }
    const speed = p.maxRadius * 1.8;
    p.radius += speed * dt;
    p.life = Math.max(0, 1 - (p.radius - 14) / (p.maxRadius - 14));
  }

  // Remove dead
  for (let i = voicePulses.length - 1; i >= 0; i--) {
    if (voicePulses[i].life <= 0 && voicePulses[i].delay <= 0) {
      voicePulses.splice(i, 1);
    }
  }

  // Redraw
  voicePulseContainer.removeChildren().forEach(c => c.destroy());
  for (const p of voicePulses) {
    if (p.delay > 0 || p.life <= 0) continue;
    const g = new Graphics();
    g.circle(p.x, p.y, p.radius)
      .stroke({ width: 2.5, color: p.color, alpha: p.life * 0.6 });
    voicePulseContainer.addChild(g);
  }
}

/* ── Glitch Overlay ────────────────────────────────────────── */

let glitchContainer = null;
let glitchBars = [];

export function buildGlitchLayer() {
  glitchContainer = new Container({ label: 'glitch' });
  glitchContainer.eventMode = 'none';
  return glitchContainer;
}

export function refreshGlitch() {
  if (!glitchContainer) return;
  glitchContainer.removeChildren().forEach(c => c.destroy());

  // Only show glitch when suspicion is high
  if (state.suspicion < 45) return;

  const intensity = (state.suspicion - 45) / 55; // 0..1
  const now = performance.now();

  // Random horizontal bars
  const barCount = Math.floor(2 + intensity * 6);
  const g = new Graphics();

  for (let i = 0; i < barCount; i++) {
    const seed = Math.sin(now * 0.003 + i * 137.5) * 0.5 + 0.5;
    const y = seed * HEIGHT;
    const h = 1 + Math.random() * 4 * intensity;
    const offset = (Math.sin(now * 0.01 + i * 73) * 12) * intensity;
    const alpha = 0.08 + intensity * 0.15;

    // Red-shifted bar
    g.rect(offset, y, WIDTH, h).fill({ color: 0xff496d, alpha });
    // Cyan-shifted bar (opposite direction)
    g.rect(-offset, y + 2, WIDTH, h * 0.6).fill({ color: 0x55ffe2, alpha: alpha * 0.5 });
  }

  // Occasional full-screen flash
  if (intensity > 0.6 && Math.sin(now * 0.007) > 0.92) {
    g.rect(0, 0, WIDTH, HEIGHT).fill({ color: 0xff496d, alpha: 0.06 });
  }

  // Scan line distortion
  if (intensity > 0.3) {
    const scanY = (now * 0.4) % HEIGHT;
    g.rect(0, scanY, WIDTH, 3).fill({ color: 0xff496d, alpha: 0.12 * intensity });
  }

  glitchContainer.addChild(g);

  // Jitter text
  if (intensity > 0.7 && Math.random() < 0.08) {
    const warningText = new Text({
      text: 'DETECTED',
      style: new TextStyle({
        fontFamily: 'Orbitron, monospace',
        fontWeight: '900',
        fontSize: 14,
        fill: 0xff496d,
      }),
      alpha: 0.3 * intensity,
      x: WIDTH * 0.1 + Math.random() * WIDTH * 0.8,
      y: Math.random() * HEIGHT,
      anchor: 0.5,
    });
    glitchContainer.addChild(warningText);
  }
}

/* ── Stage filter for high suspicion (ColorMatrix) ─────────── */

let stageFilter = null;

export function getStageFilter() {
  if (!stageFilter) {
    stageFilter = new ColorMatrixFilter();
  }
  return stageFilter;
}

export function updateStageFilter() {
  if (!stageFilter) return;

  stageFilter.reset();

  if (state.suspicion > 55) {
    const t = (state.suspicion - 55) / 45; // 0..1
    // Slight red tint + desaturation
    stageFilter.saturate(-0.3 * t, false);
    // Subtle contrast boost
    stageFilter.contrast(0.08 * t, false);
  }
}
