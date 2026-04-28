/**
 * pixi-map.js — PixiJS v8 ship map renderer for Echo Impostor.
 *
 * Replaces the Canvas 2D map drawing with a GPU-accelerated PixiJS scene.
 * Uses Application, Container, Graphics, Text, and ticker-based animation.
 *
 * Usage:
 *   import { initPixiMap, buildScene, refreshDynamic, destroyPixiMap } from './pixi-map.js';
 *   await initPixiMap(document.getElementById('game-canvas'));
 */

import { Application, Container, Graphics, Text, TextStyle, FillGradient, BlurFilter, NoiseFilter, ColorMatrixFilter, Filter } from '/lib/pixi.min.mjs';
import {
  state, TILE, COLS, ROWS, WIDTH, HEIGHT, COLORS,
  roomForCell, clamp,
} from '../core/state.js';
import { formatTime } from './primitives.js';
import {
  buildFovLayer, refreshFov,
  buildTrailLayer, updateTrail,
  buildVoicePulseLayer, updateVoicePulses,
  buildGlitchLayer, refreshGlitch,
  getStageFilter, updateStageFilter,
} from './effects.js';

/* ── Module state ──────────────────────────────────────────── */

let app = null;
let mapLayer = null;
let corridorLayer = null;
let roomLayer = null;
let fixtureLayer = null;
let labelLayer = null;
let objectLayer = null;
let crewLayer = null;
let playerLayer = null;
let effectLayer = null;
let particleLayer = null;
let lightingLayer = null;
let minimapLayer = null;
let cinematicLayer = null;
let noiseRingGfx = null;
let interactionLayer = null;
let fovLayer = null;
let trailLayer = null;
let voicePulseLayer = null;
let glitchLayer = null;
let scannerLayer = null;

/* No hardcoded ROUTES — corridors come from state.corridors */

/* ── Custom glow filter (GLSL) ─────────────────────────────── */

function createGlowFilter(color = 0x3cc8dc, strength = 4, quality = 2) {
  // Emulate glow by blurring and adding to original
  const blur = new BlurFilter({ strength, quality });
  return blur;
}

/* ── Helpers ───────────────────────────────────────────────── */

function tc(x, y) {
  return { x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 };
}

function hslHex(h, s, l) {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)));
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}

function bevelPts(x, y, w, h, c) {
  return [
    x + c, y, x + w - c, y, x + w, y + c,
    x + w, y + h - c, x + w - c, y + h, x + c, y + h,
    x, y + h - c, x, y + c,
  ];
}

/* ── Backdrop (grid, rings, diagonals) ─────────────────────── */

function buildBackdrop() {
  const container = new Container({ label: 'backdrop' });
  const g = new Graphics();

  // ═══ Dark base ═══
  g.rect(0, 0, WIDTH, HEIGHT).fill(0x040912);

  // ═══ Subtle grid ═══
  g.setStrokeStyle({ width: 1, color: 0x0e1e2e, alpha: 0.28 });
  for (let x = 0; x <= WIDTH; x += TILE) {
    g.moveTo(x, 0).lineTo(x, HEIGHT).stroke();
  }
  for (let y = 0; y <= HEIGHT; y += TILE) {
    g.moveTo(0, y).lineTo(WIDTH, y).stroke();
  }

  // ═══ Diagonal tech lines ═══
  g.setStrokeStyle({ width: 1, color: 0x0e1e2e, alpha: 0.06 });
  for (let x = -HEIGHT; x < WIDTH; x += 200) {
    g.moveTo(x, 0).lineTo(x + HEIGHT, HEIGHT).stroke();
    g.moveTo(x + 100, 0).lineTo(x + 100 - HEIGHT, HEIGHT).stroke();
  }

  container.addChild(g);

  // ═══ RADAR — large concentric rings at map center ═══
  const cx = WIDTH / 2, cy = HEIGHT / 2;
  const radarG = new Graphics();

  // Outer rings (fading out)
  for (let r = 30; r < 320; r += 22) {
    const a = Math.max(0.005, 0.06 - r * 0.00018);
    radarG.circle(cx, cy, r).stroke({ width: 1, color: 0x2bdff2, alpha: a });
  }

  // Crosshair lines
  radarG.setStrokeStyle({ width: 1, color: 0x2bdff2, alpha: 0.04 });
  radarG.moveTo(cx - 300, cy).lineTo(cx + 300, cy).stroke();
  radarG.moveTo(cx, cy - 300).lineTo(cx, cy + 300).stroke();

  // Diagonal crosshairs
  radarG.setStrokeStyle({ width: 1, color: 0x2bdff2, alpha: 0.02 });
  for (let angle = Math.PI / 8; angle < Math.PI * 2; angle += Math.PI / 4) {
    radarG.moveTo(cx, cy)
      .lineTo(cx + Math.cos(angle) * 300, cy + Math.sin(angle) * 300)
      .stroke();
  }

  // Center dot
  radarG.circle(cx, cy, 3).fill({ color: 0x2bdff2, alpha: 0.08 });
  radarG.circle(cx, cy, 1).fill({ color: 0x2bdff2, alpha: 0.15 });

  container.addChild(radarG);

  // ═══ Radar glow (blurred) ═══
  const radarGlow = new Graphics();
  radarGlow.circle(cx, cy, 60).fill({ color: 0x2bdff2, alpha: 0.03 });
  radarGlow.circle(cx, cy, 120).stroke({ width: 2, color: 0x2bdff2, alpha: 0.04 });
  radarGlow.filters = [new BlurFilter({ strength: 8, quality: 2 })];
  container.addChild(radarGlow);

  return container;
}

/* ── Corridors ─────────────────────────────────────────────── */

function traceRoute(g, route) {
  const p0 = tc(route[0][0], route[0][1]);
  g.moveTo(p0.x, p0.y);
  for (let i = 1; i < route.length; i++) {
    const p = tc(route[i][0], route[i][1]);
    g.lineTo(p.x, p.y);
  }
}

function offsetLine(g, pts, offset, color, alpha, width) {
  g.setStrokeStyle({ width, color, alpha, cap: 'round', join: 'round' });
  for (let i = 0; i < pts.length; i++) {
    const p = tc(pts[i][0], pts[i][1]);
    let nx = 0, ny = 0;
    if (i < pts.length - 1) {
      const n = tc(pts[i + 1][0], pts[i + 1][1]);
      const dx = n.x - p.x, dy = n.y - p.y, l = Math.hypot(dx, dy) || 1;
      nx = -dy / l;
      ny = dx / l;
    } else if (i > 0) {
      const pr = tc(pts[i - 1][0], pts[i - 1][1]);
      const dx = p.x - pr.x, dy = p.y - pr.y, l = Math.hypot(dx, dy) || 1;
      nx = -dy / l;
      ny = dx / l;
    }
    if (i === 0) g.moveTo(p.x + nx * offset, p.y + ny * offset);
    else g.lineTo(p.x + nx * offset, p.y + ny * offset);
  }
  g.stroke();
}

function buildCorridors() {
  // Corridors are rendered by the unified tile map.
  // This layer only adds subtle center-pipe accents along corridor paths.
  const container = new Container({ label: 'corridors' });
  const routes = state.corridors || [];
  if (!routes.length) return container;

  const g = new Graphics();

  // Subtle center pipe along corridor paths
  for (const route of routes) {
    g.setStrokeStyle({ width: 1, color: 0x2a5868, alpha: 0.15, cap: 'round', join: 'round' });
    traceRoute(g, route);
    g.stroke();
  }

  container.addChild(g);
  return container;
}

/* ── Unified floor & walls from tile map ───────────────────── */

function buildUnifiedMap() {
  const container = new Container({ label: 'unified-map' });
  if (!state.map) return container;

  // ═══ Floor tiles ═══
  const floorG = new Graphics();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (state.map[y][x] !== '.') continue;
      floorG.rect(x * TILE, y * TILE, TILE, TILE).fill(0x0a1420);
    }
  }
  container.addChild(floorG);

  // ═══ Wall structure (dark fill for wall tiles adjacent to floor) ═══
  const wallFillG = new Graphics();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (state.map[y][x] !== '#') continue;
      const adj = (
        (y > 0 && state.map[y-1][x] === '.') ||
        (y < ROWS-1 && state.map[y+1][x] === '.') ||
        (x > 0 && state.map[y][x-1] === '.') ||
        (x < COLS-1 && state.map[y][x+1] === '.')
      );
      if (!adj) continue;
      wallFillG.rect(x * TILE, y * TILE, TILE, TILE).fill(0x0e1a28);
    }
  }
  container.addChild(wallFillG);

  // ═══ Wall edge lines (bright, thin, crisp) ═══
  const edgeG = new Graphics();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (state.map[y][x] !== '.') continue;
      const px = x * TILE, py = y * TILE;

      if (y === 0 || state.map[y-1][x] === '#') {
        edgeG.moveTo(px, py).lineTo(px + TILE, py)
          .stroke({ width: 2, color: 0x4ad8ec, alpha: 0.7 });
      }
      if (y === ROWS-1 || state.map[y+1][x] === '#') {
        edgeG.moveTo(px, py + TILE).lineTo(px + TILE, py + TILE)
          .stroke({ width: 2, color: 0x4ad8ec, alpha: 0.7 });
      }
      if (x === 0 || state.map[y][x-1] === '#') {
        edgeG.moveTo(px, py).lineTo(px, py + TILE)
          .stroke({ width: 2, color: 0x4ad8ec, alpha: 0.7 });
      }
      if (x === COLS-1 || state.map[y][x+1] === '#') {
        edgeG.moveTo(px + TILE, py).lineTo(px + TILE, py + TILE)
          .stroke({ width: 2, color: 0x4ad8ec, alpha: 0.7 });
      }
    }
  }
  container.addChild(edgeG);

  // ═══ Second wall line (inner, darker — creates double-wall effect) ═══
  const innerEdgeG = new Graphics();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (state.map[y][x] !== '.') continue;
      const px = x * TILE, py = y * TILE;

      if (y === 0 || state.map[y-1][x] === '#') {
        innerEdgeG.moveTo(px, py + 4).lineTo(px + TILE, py + 4)
          .stroke({ width: 1, color: 0x2a6878, alpha: 0.5 });
      }
      if (y === ROWS-1 || state.map[y+1][x] === '#') {
        innerEdgeG.moveTo(px, py + TILE - 4).lineTo(px + TILE, py + TILE - 4)
          .stroke({ width: 1, color: 0x2a6878, alpha: 0.5 });
      }
      if (x === 0 || state.map[y][x-1] === '#') {
        innerEdgeG.moveTo(px + 4, py).lineTo(px + 4, py + TILE)
          .stroke({ width: 1, color: 0x2a6878, alpha: 0.5 });
      }
      if (x === COLS-1 || state.map[y][x+1] === '#') {
        innerEdgeG.moveTo(px + TILE - 4, py).lineTo(px + TILE - 4, py + TILE)
          .stroke({ width: 1, color: 0x2a6878, alpha: 0.5 });
      }
    }
  }
  container.addChild(innerEdgeG);

  // ═══ ADDITIVE GLOW layer (key technique from blend-modes skill) ═══
  const glowG = new Graphics();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (state.map[y][x] !== '.') continue;
      const px = x * TILE, py = y * TILE;
      if (y === 0 || state.map[y-1][x] === '#') {
        glowG.moveTo(px, py).lineTo(px + TILE, py)
          .stroke({ width: 6, color: 0x2090a8, alpha: 0.4 });
      }
      if (y === ROWS-1 || state.map[y+1][x] === '#') {
        glowG.moveTo(px, py + TILE).lineTo(px + TILE, py + TILE)
          .stroke({ width: 6, color: 0x2090a8, alpha: 0.4 });
      }
      if (x === 0 || state.map[y][x-1] === '#') {
        glowG.moveTo(px, py).lineTo(px, py + TILE)
          .stroke({ width: 6, color: 0x2090a8, alpha: 0.4 });
      }
      if (x === COLS-1 || state.map[y][x+1] === '#') {
        glowG.moveTo(px + TILE, py).lineTo(px + TILE, py + TILE)
          .stroke({ width: 6, color: 0x2090a8, alpha: 0.4 });
      }
    }
  }
  glowG.blendMode = 'add';
  glowG.filters = [new BlurFilter({ strength: 4, quality: 2 })];
  container.addChild(glowG);

  return container;
}

/* ── Rooms ─────────────────────────────────────────────────── */

function buildRooms() {
  const container = new Container({ label: 'rooms' });
  let roomIdx = 0;
  for (const room of (state.rooms || [])) {
    const rx = room.x * TILE, ry = room.y * TILE;
    const rw = room.w * TILE, rh = room.h * TILE;
    const g = new Graphics();
    const hue = room.hue || 188;
    const accent = hslHex(hue, 50, 40);
    const accentBright = hslHex(hue, 65, 55);
    const accentDim = hslHex(hue, 35, 18);
    const accentGlow = hslHex(hue, 70, 60);
    const bev = Math.min(28, Math.min(rw, rh) * 0.2);

    // ═══ LAYER 1: Outer glow (blurred bright outline) ═══
    const glowContainer = new Container();
    const glowG = new Graphics();
    glowG.poly(bevelPts(rx - 14, ry - 14, rw + 28, rh + 28, bev + 6), true)
      .stroke({ width: 3, color: accentGlow, alpha: 0.3 });
    glowG.blendMode = 'add';
    glowG.filters = [new BlurFilter({ strength: 6, quality: 2 })];
    glowContainer.addChild(glowG);
    container.addChild(glowContainer);

    // ═══ LAYER 2: Outer frame (subtle, not thick) ═══
    g.poly(bevelPts(rx - 10, ry - 10, rw + 20, rh + 20, bev + 4), true)
      .stroke({ width: 1.5, color: accentBright, alpha: 0.3 });

    // ═══ LAYER 3: Inner frame ═══
    g.poly(bevelPts(rx - 4, ry - 4, rw + 8, rh + 8, bev + 1), true)
      .stroke({ width: 1, color: accent, alpha: 0.2 });

    // ═══ LAYER 4: Inner floor with gradient + depth ═══
    // Floor is already drawn by unified map — just add gradient overlay
    g.poly(bevelPts(rx, ry, rw, rh, bev), true)
      .fill({ color: hslHex(hue, 15, 9), alpha: 0.4 });
    g.poly(bevelPts(rx, ry, rw, rh, bev), true)
      .stroke({ width: 2, color: accentBright, alpha: 0.55 });

    // ═══ Inner shadow (dark edges inside room = depth) ═══
    g.poly(bevelPts(rx + 4, ry + 4, rw - 8, rh - 8, bev - 2), true)
      .stroke({ width: 3, color: 0x000000, alpha: 0.3 });

    // ═══ Center radial glow (brighter center) ═══
    const cxR = rx + rw / 2, cyR = ry + rh / 2;
    const radialGlow = new FillGradient({
      type: 'radial',
      center: { x: cxR, y: cyR },
      innerRadius: 0,
      outerCenter: { x: cxR, y: cyR },
      outerRadius: Math.max(rw, rh) * 0.4,
      colorStops: [
        { offset: 0, color: accent },
        { offset: 0.5, color: accentDim },
        { offset: 1, color: 0x000000 },
      ],
    });
    g.circle(cxR, cyR, Math.max(rw, rh) * 0.4)
      .fill({ fill: radialGlow, alpha: 0.08 });

    // ═══ Floor grid (subtle) ═══
    g.setStrokeStyle({ width: 1, color: accent, alpha: 0.03 });
    for (let yy = ry + TILE; yy < ry + rh; yy += TILE) {
      g.moveTo(rx + bev, yy).lineTo(rx + rw - bev, yy).stroke();
    }
    for (let xx = rx + TILE; xx < rx + rw; xx += TILE) {
      g.moveTo(xx, ry + bev).lineTo(xx, ry + rh - bev).stroke();
    }

    // ═══ Wall pipes (all 4 sides) ═══
    const pi = bev + 4;
    g.setStrokeStyle({ width: 3, color: accent, alpha: 0.15 });
    g.moveTo(rx + pi, ry + 7).lineTo(rx + rw - pi, ry + 7).stroke();
    g.moveTo(rx + pi, ry + rh - 7).lineTo(rx + rw - pi, ry + rh - 7).stroke();
    g.moveTo(rx + 7, ry + pi).lineTo(rx + 7, ry + rh - pi).stroke();
    g.moveTo(rx + rw - 7, ry + pi).lineTo(rx + rw - 7, ry + rh - pi).stroke();

    // Pipe flanges
    g.setStrokeStyle({ width: 1.5, color: accentBright, alpha: 0.2 });
    for (let xx = rx + TILE; xx < rx + rw - 10; xx += TILE) {
      g.moveTo(xx, ry + 4).lineTo(xx, ry + 10).stroke();
      g.moveTo(xx, ry + rh - 10).lineTo(xx, ry + rh - 4).stroke();
    }
    for (let yy = ry + TILE; yy < ry + rh - 10; yy += TILE) {
      g.moveTo(rx + 4, yy).lineTo(rx + 10, yy).stroke();
      g.moveTo(rx + rw - 10, yy).lineTo(rx + rw - 4, yy).stroke();
    }

    // ═══ Corner brackets (greebles) ═══
    const s = 18, n = 5;
    g.setStrokeStyle({ width: 2.5, color: accentBright, alpha: 0.6 });
    // Top-left
    g.moveTo(rx + n, ry + n + s).lineTo(rx + n, ry + n).lineTo(rx + n + s, ry + n).stroke();
    // Top-right
    g.moveTo(rx + rw - n - s, ry + n).lineTo(rx + rw - n, ry + n).lineTo(rx + rw - n, ry + n + s).stroke();
    // Bottom-left
    g.moveTo(rx + n, ry + rh - n - s).lineTo(rx + n, ry + rh - n).lineTo(rx + n + s, ry + rh - n).stroke();
    // Bottom-right
    g.moveTo(rx + rw - n - s, ry + rh - n).lineTo(rx + rw - n, ry + rh - n).lineTo(rx + rw - n, ry + rh - n - s).stroke();

    // ═══ Glowing corner dots ═══
    g.circle(rx + n + 1, ry + n + 1, 2).fill({ color: accentGlow, alpha: 0.55 });
    g.circle(rx + rw - n - 1, ry + n + 1, 2).fill({ color: accentGlow, alpha: 0.55 });
    g.circle(rx + n + 1, ry + rh - n - 1, 2).fill({ color: accentGlow, alpha: 0.55 });
    g.circle(rx + rw - n - 1, ry + rh - n - 1, 2).fill({ color: accentGlow, alpha: 0.55 });

    // ═══ Interior terminals (greeble details) ═══
    const termCount = Math.min(3, Math.floor((room.w * room.h) / 10));
    const ts = roomIdx * 7 + 3;
    for (let t = 0; t < termCount; t++) {
      const tx = rx + bev + 16 + ((ts + t * 41) % Math.max(1, rw - bev * 2 - 32));
      const ty = ry + bev + 16 + ((ts + t * 59) % Math.max(1, rh - bev * 2 - 32));
      g.rect(tx - 3, ty - 3, 6, 6).fill({ color: accent, alpha: 0.1 });
      g.rect(tx - 3, ty - 3, 6, 6).stroke({ width: 0.5, color: accentBright, alpha: 0.18 });
      g.circle(tx, ty, 1).fill({ color: accentGlow, alpha: 0.3 });
    }

    // ═══ Tech lines along walls (micro highlights) ═══
    g.setStrokeStyle({ width: 0.5, color: accentBright, alpha: 0.08 });
    // Horizontal tech lines near top/bottom
    g.moveTo(rx + bev + 20, ry + 14).lineTo(rx + bev + 50, ry + 14).stroke();
    g.moveTo(rx + rw - bev - 50, ry + rh - 14).lineTo(rx + rw - bev - 20, ry + rh - 14).stroke();

    container.addChild(g);
    roomIdx++;
  }
  return container;
}

/* ── Labels ────────────────────────────────────────────────── */

function buildLabels() {
  const container = new Container({ label: 'labels' });
  const baseStyle = new TextStyle({
    fontFamily: 'Orbitron, Inter, system-ui, sans-serif',
    fontWeight: '800',
    fontSize: 11,
    fill: 0xe0f0f8,
    align: 'center',
    letterSpacing: 1.5,
  });
  for (const room of (state.rooms || [])) {
    const cx = room.x * TILE + (room.w * TILE) / 2;
    const cy = room.y * TILE + (room.h * TILE) / 2;
    const label = new Text({
      text: room.name.toUpperCase(),
      style: baseStyle.clone(),
      anchor: 0.5,
      x: cx,
      y: cy,
      alpha: 0.82,
    });
    label.label = 'room-label-' + room.name;
    container.addChild(label);
  }
  return container;
}

/* ── Fixtures (doors, vents, hiding spots) ─────────────────── */

function buildFixtures() {
  const g = new Graphics();

  // ── Security doors — thick red/brown bars with flanges ──
  for (const door of (state.securityDoors || [])) {
    const p = tc(door.x, door.y);
    const vert = door.orientation === 'vertical';
    const len = 18;

    // Door housing (dark background)
    if (vert) {
      g.rect(p.x - 6, p.y - len, 12, len * 2).fill({ color: 0x1a0808, alpha: 0.8 });
    } else {
      g.rect(p.x - len, p.y - 6, len * 2, 12).fill({ color: 0x1a0808, alpha: 0.8 });
    }

    // Main door bar
    g.moveTo(p.x + (vert ? 0 : -len), p.y + (vert ? -len : 0))
      .lineTo(p.x + (vert ? 0 : len), p.y + (vert ? len : 0))
      .stroke({ width: 6, color: 0x8b3a2a, alpha: 0.85, cap: 'butt' });

    // Inner highlight
    g.moveTo(p.x + (vert ? 0 : -len + 2), p.y + (vert ? -len + 2 : 0))
      .lineTo(p.x + (vert ? 0 : len - 2), p.y + (vert ? len - 2 : 0))
      .stroke({ width: 2, color: 0xd45a3a, alpha: 0.5, cap: 'butt' });

    // Flanges at ends
    if (vert) {
      g.rect(p.x - 5, p.y - len - 1, 10, 3).fill({ color: 0xd45a3a, alpha: 0.4 });
      g.rect(p.x - 5, p.y + len - 2, 10, 3).fill({ color: 0xd45a3a, alpha: 0.4 });
    } else {
      g.rect(p.x - len - 1, p.y - 5, 3, 10).fill({ color: 0xd45a3a, alpha: 0.4 });
      g.rect(p.x + len - 2, p.y - 5, 3, 10).fill({ color: 0xd45a3a, alpha: 0.4 });
    }

    // Center lock indicator
    g.circle(p.x, p.y, 2.5).fill({ color: 0xff6b4a, alpha: 0.7 });
  }

  // ── Vents — small grate markers in corridors ──
  for (const vent of (state.vents || [])) {
    const p = tc(vent.x, vent.y);
    g.rect(p.x - 5, p.y - 5, 10, 10).fill({ color: 0x180808, alpha: 0.6 });
    g.rect(p.x - 5, p.y - 5, 10, 10).stroke({ width: 1, color: 0xff496d, alpha: 0.4 });
    // Grate lines
    g.setStrokeStyle({ width: 0.5, color: 0xff496d, alpha: 0.3 });
    g.moveTo(p.x - 3, p.y - 3).lineTo(p.x + 3, p.y + 3).stroke();
    g.moveTo(p.x + 3, p.y - 3).lineTo(p.x - 3, p.y + 3).stroke();
  }

  // ── Hiding spots — purple camera/system icons ──
  for (const hide of (state.hiding || [])) {
    const p = tc(hide.x, hide.y);
    // Outer frame
    g.rect(p.x - 6, p.y - 6, 12, 12).fill({ color: 0x0e0818, alpha: 0.7 });
    g.rect(p.x - 6, p.y - 6, 12, 12).stroke({ width: 1.5, color: 0x9b6cff, alpha: 0.5 });
    // Inner screen
    g.rect(p.x - 3, p.y - 3, 6, 6).fill({ color: 0x9b6cff, alpha: 0.2 });
    // Indicator dot
    g.circle(p.x, p.y, 1.5).fill({ color: 0xc49bff, alpha: 0.7 });
  }

  return g;
}

/* ── Task objects & exit ───────────────────────────────────── */

function buildObjects() {
  const container = new Container({ label: 'objects' });
  for (const task of (state.tasks || [])) {
    if (task.done) continue;
    const p = tc(task.x, task.y);
    const group = new Container({ label: 'task-' + task.x + '-' + task.y, x: p.x, y: p.y });

    // Glow ring
    const glow = new Graphics();
    glow.circle(0, 0, 14).stroke({ width: 1.5, color: 0xffd166, alpha: 0.2 });
    group.addChild(glow);

    // Diamond outline
    const outline = new Graphics();
    outline.rect(-10, -10, 20, 20).stroke({ width: 1, color: 0xffd166, alpha: 0.3 });
    outline.rotation = Math.PI / 4;
    group.addChild(outline);

    // Diamond fill
    const diamond = new Graphics();
    diamond.rect(-6, -6, 12, 12).fill({ color: 0xffd166, alpha: 0.9 });
    diamond.rotation = Math.PI / 4;
    group.addChild(diamond);

    // Center dot
    const dot = new Graphics();
    dot.circle(0, 0, 2).fill({ color: 0xffffff, alpha: 0.6 });
    group.addChild(dot);

    container.addChild(group);
  }
  if (state.exit) {
    const p = tc(state.exit.x, state.exit.y);
    const exitGroup = new Container({ label: 'exit', x: p.x, y: p.y });

    // Glow background
    const glow = new Graphics();
    glow.roundRect(-44, -18, 88, 36, 6).fill({ color: 0x72ff8b, alpha: 0.08 });
    glow.roundRect(-44, -18, 88, 36, 6).stroke({ width: 1.5, color: 0x72ff8b, alpha: 0.3 });

    const txt = new Text({
      text: 'EXIT',
      style: new TextStyle({
        fontFamily: 'Orbitron, Inter, system-ui, sans-serif',
        fontWeight: '900',
        fontSize: 12,
        fill: 0x72ff8b,
        letterSpacing: 2,
      }),
      anchor: 0.5,
    });
    exitGroup.addChild(glow, txt);
    container.addChild(exitGroup);
  }
  return container;
}

/* ── Crew & player sprites (Graphics-based) ────────────────── */

function makeCrewGraphics(colorHex) {
  const c = typeof colorHex === 'string' ? parseInt(colorHex.replace('#', ''), 16) : colorHex;
  const g = new Graphics();
  g.circle(0, 0, 19).stroke({ width: 1, color: c, alpha: 0.22 });
  g.circle(0, 0, 11).fill(c);
  g.circle(0, 0, 6).fill({ color: 0x02080d, alpha: 0.58 });
  g.circle(-4, -2, 2.5).fill(0xe6fcff);
  g.circle(4, -2, 2.5).fill(0xe6fcff);
  g.circle(0, 0, 14).stroke({ width: 1, color: 0xffffff, alpha: 0.55 });
  return g;
}

function makePlayerGraphics() {
  const g = new Graphics();
  g.circle(0, 0, 28).stroke({ width: 2, color: 0x69ffb1, alpha: 0.34 });
  g.circle(0, 0, 15).fill(0x69ffb1);
  g.circle(0, 0, 10).fill({ color: 0x02080d, alpha: 0.58 });
  g.circle(-4, -2, 2.5).fill(0x55ffe2);
  g.circle(4, -2, 2.5).fill(0x55ffe2);
  g.circle(0, 0, 18).stroke({ width: 2, color: 0xffffff, alpha: 0.55 });
  return g;
}

/* ── Interaction rings (near task / crew) ───────────────────── */

function buildInteractionLayer() {
  return new Container({ label: 'interactions' });
}

function refreshInteractionRings() {
  if (!interactionLayer) return;
  interactionLayer.removeChildren().forEach(c => c.destroy());

  // Interaction ring around nearest task
  for (const task of (state.tasks || [])) {
    if (task.done) continue;
    const d = Math.hypot(task.x - state.player.x, task.y - state.player.y);
    if (d > 1.65) continue;
    const p = tc(task.x, task.y);
    const g = new Graphics();
    const pulse = 0.5 + Math.sin(performance.now() / 200) * 0.2;
    g.circle(p.x, p.y, 22).stroke({ width: 2, color: 0xffd166, alpha: pulse });
    interactionLayer.addChild(g);
  }

  // Interaction ring around nearest crew
  for (const member of (state.crew || [])) {
    const d = Math.hypot(member.px - state.player.px, member.py - state.player.py);
    if (d > 82) continue;
    const g = new Graphics();
    const c = typeof member.color === 'string' ? parseInt(member.color.replace('#', ''), 16) : member.color;
    const pulse = 0.4 + Math.sin(performance.now() / 250) * 0.2;
    g.circle(member.px, member.py, 26).stroke({ width: 1.5, color: c, alpha: pulse });
    interactionLayer.addChild(g);
  }
}

/* ── Noise ring around player ──────────────────────────────── */

function buildNoiseRing() {
  return new Graphics();
}

function refreshNoiseRing() {
  if (!noiseRingGfx) return;
  noiseRingGfx.clear();
  if (state.noise <= 4) return;

  const alpha = Math.min(0.35, state.noise / 170);
  const color = state.noise > 65 ? 0xff496d : 0xffd166;
  const radius = 20 + state.noise * 1.3;
  noiseRingGfx.circle(state.player.px, state.player.py, radius)
    .stroke({ width: 2, color, alpha });
}

/* ── Particle layer ────────────────────────────────────────── */

function buildParticleLayer() {
  return new Container({ label: 'particles' });
}

function refreshParticles() {
  if (!particleLayer) return;
  particleLayer.removeChildren().forEach(c => c.destroy());
  for (const p of state.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha <= 0) continue;
    const c = typeof p.color === 'string' ? parseInt(p.color.replace('#', ''), 16) : p.color;
    const g = new Graphics();
    g.circle(0, 0, p.size * alpha).fill({ color: c, alpha });
    g.x = p.x;
    g.y = p.y;
    particleLayer.addChild(g);
  }
}

/* ── Lighting (vignette + alert) ───────────────────────────── */

function buildLightingLayer() {
  return new Container({ label: 'lighting' });
}

function refreshLighting() {
  if (!lightingLayer) return;
  lightingLayer.removeChildren().forEach(c => c.destroy());
  if (!state.map) return;

  // Player glow
  const bright = new Graphics();
  bright.circle(state.player.px, state.player.py, 160)
    .fill({ color: 0x55ffe2, alpha: 0.015 });
  bright.circle(state.player.px, state.player.py, 80)
    .fill({ color: 0x55ffe2, alpha: 0.025 });
  lightingLayer.addChild(bright);

  // Alert overlay
  if (state.suspicion > 55) {
    const alertAlpha = 0.1 + Math.sin(performance.now() / 90) * 0.04;
    const alert = new Graphics();
    alert.rect(0, 0, WIDTH, HEIGHT).fill({ color: 0xff496d, alpha: alertAlpha });
    lightingLayer.addChild(alert);
  }
}

/* ── Minimap ───────────────────────────────────────────────── */

function buildMinimapLayer() {
  return new Container({ label: 'minimap' });
}

function refreshMinimap() {
  if (!minimapLayer) return;
  minimapLayer.removeChildren().forEach(c => c.destroy());
  if (!state.map) return;

  const scale = 4;
  const pad = 14;
  const w = COLS * scale;
  const h = ROWS * scale;
  const x0 = WIDTH - w - pad;
  const y0 = HEIGHT - h - pad;

  const bg = new Graphics();
  bg.roundRect(x0 - 10, y0 - 26, w + 20, h + 36, 14).fill({ color: 0x030711, alpha: 0.92 });
  bg.roundRect(x0 - 10, y0 - 26, w + 20, h + 36, 14).stroke({ width: 1, color: 0x2bdff2, alpha: 0.2 });
  minimapLayer.addChild(bg);

  // Label
  const label = new Text({
    text: 'MAP',
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: '900',
      fontSize: 9,
      fill: 0x8fa5bd,
    }),
    x: x0,
    y: y0 - 20,
  });
  minimapLayer.addChild(label);

  // Map tiles
  const tiles = new Graphics();
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const isWall = state.map[y][x] === '#';
      tiles.rect(x0 + x * scale, y0 + y * scale, scale - 1, scale - 1)
        .fill({ color: isWall ? 0xffffff : 0x55ffe2, alpha: isWall ? 0.08 : 0.18 });
    }
  }
  minimapLayer.addChild(tiles);

  // Tasks
  const taskGfx = new Graphics();
  for (const task of state.tasks) {
    if (task.done) continue;
    taskGfx.rect(x0 + task.x * scale - 1, y0 + task.y * scale - 1, scale + 1, scale + 1)
      .fill(0xffd166);
  }
  minimapLayer.addChild(taskGfx);

  // Crew
  const crewGfx = new Graphics();
  for (const member of state.crew) {
    const c = member.isImpostor && state.revealedImpostor
      ? 0xff496d
      : (typeof member.color === 'string' ? parseInt(member.color.replace('#', ''), 16) : member.color);
    crewGfx.rect(x0 + member.x * scale - 1, y0 + member.y * scale - 1, scale + 1, scale + 1)
      .fill(c);
  }
  minimapLayer.addChild(crewGfx);

  // Player
  const playerGfx = new Graphics();
  playerGfx.rect(x0 + state.player.x * scale - 2, y0 + state.player.y * scale - 2, scale + 3, scale + 3)
    .fill(0x69ffb1);
  minimapLayer.addChild(playerGfx);

  // Exit
  if (state.exit) {
    const exitGfx = new Graphics();
    exitGfx.rect(x0 + state.exit.x * scale - 2, y0 + state.exit.y * scale - 2, scale + 4, scale + 4)
      .stroke({ width: 1, color: 0x69ffb1 });
    minimapLayer.addChild(exitGfx);
  }
}

/* ── Cinematic overlay ─────────────────────────────────────── */

function buildCinematicLayer() {
  return new Container({ label: 'cinematic' });
}

function refreshCinematic() {
  if (!cinematicLayer) return;
  cinematicLayer.removeChildren().forEach(c => c.destroy());
  if (!state.cinematic) return;

  const remaining = state.cinematic.until - performance.now();
  if (remaining <= 0) {
    state.cinematic = null;
    return;
  }

  const alpha = Math.min(1, remaining / 700);
  const toneMap = { green: 0x72ff8b, cyan: 0x55ffe2, red: 0xff496d };
  const tone = toneMap[state.cinematic.tone] || 0xff496d;

  // Tinted overlay
  const overlay = new Graphics();
  overlay.rect(0, 0, WIDTH, HEIGHT).fill({ color: tone, alpha: 0.24 * alpha });
  cinematicLayer.addChild(overlay);

  // Title
  const title = new Text({
    text: state.cinematic.title,
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: '950',
      fontSize: 46,
      fill: 0xeefcff,
      align: 'center',
      dropShadow: { color: tone, blur: 26, alpha: 0.8 },
    }),
    anchor: { x: 0.5, y: 0.5 },
    x: WIDTH / 2,
    y: HEIGHT * 0.42,
    alpha,
  });
  cinematicLayer.addChild(title);

  // Subtitle
  const subtitle = new Text({
    text: state.cinematic.subtitle,
    style: new TextStyle({
      fontFamily: 'Inter, system-ui, sans-serif',
      fontWeight: '800',
      fontSize: 16,
      fill: 0x8fa5bd,
      align: 'center',
    }),
    anchor: { x: 0.5, y: 0.5 },
    x: WIDTH / 2,
    y: HEIGHT * 0.42 + 48,
    alpha,
  });
  cinematicLayer.addChild(subtitle);
}

/* ── Scanline effect ───────────────────────────────────────── */

function buildScanlines() {
  const container = new Container({ label: 'screen-fx' });

  // Scanlines (CRT)
  const lines = new Graphics();
  for (let y = 0; y < HEIGHT; y += 3) {
    lines.rect(0, y, WIDTH, 1).fill({ color: 0x000000, alpha: 0.06 });
  }
  container.addChild(lines);

  // Noise dots
  const noise = new Graphics();
  for (let i = 0; i < 200; i++) {
    const nx = (i * 137 + 41) % WIDTH;
    const ny = (i * 97 + 23) % HEIGHT;
    noise.rect(nx, ny, 1, 1).fill({ color: 0x2bdff2, alpha: 0.01 + (i % 5) * 0.005 });
  }
  container.addChild(noise);

  // Screen vignette (blurred dark edges)
  const vig = new Graphics();
  vig.rect(0, 0, WIDTH, 50).fill({ color: 0x000000, alpha: 0.18 });
  vig.rect(0, HEIGHT - 50, WIDTH, 50).fill({ color: 0x000000, alpha: 0.18 });
  vig.rect(0, 0, 50, HEIGHT).fill({ color: 0x000000, alpha: 0.15 });
  vig.rect(WIDTH - 50, 0, 50, HEIGHT).fill({ color: 0x000000, alpha: 0.15 });
  vig.rect(0, 0, 120, 90).fill({ color: 0x000000, alpha: 0.12 });
  vig.rect(WIDTH - 120, 0, 120, 90).fill({ color: 0x000000, alpha: 0.12 });
  vig.rect(0, HEIGHT - 90, 120, 90).fill({ color: 0x000000, alpha: 0.12 });
  vig.rect(WIDTH - 120, HEIGHT - 90, 120, 90).fill({ color: 0x000000, alpha: 0.12 });
  vig.filters = [new BlurFilter({ strength: 12, quality: 2 })];
  container.addChild(vig);

  return container;
}

/* ── Central scanner (hero element) ─────────────────────────── */

function buildScannerLayer() {
  const container = new Container({ label: 'scanner' });
  const cx = WIDTH / 2, cy = HEIGHT / 2;

  // Static rings
  const rings = new Graphics();
  rings.circle(cx, cy, 50).stroke({ width: 1, color: 0x2bdff2, alpha: 0.08 });
  rings.circle(cx, cy, 30).stroke({ width: 1, color: 0x2bdff2, alpha: 0.1 });
  rings.circle(cx, cy, 10).stroke({ width: 1, color: 0x2bdff2, alpha: 0.12 });
  // Center bright dot
  rings.circle(cx, cy, 3).fill({ color: 0x2bdff2, alpha: 0.2 });
  rings.circle(cx, cy, 1.5).fill({ color: 0x55ffe2, alpha: 0.35 });
  container.addChild(rings);

  // Rotating ring 1
  const ring1 = new Graphics();
  ring1.circle(0, 0, 42).stroke({ width: 1.5, color: 0x2bdff2, alpha: 0.06 });
  // Arc segment (partial ring)
  ring1.arc(0, 0, 42, 0, Math.PI * 0.4).stroke({ width: 2, color: 0x55ffe2, alpha: 0.15 });
  ring1.x = cx;
  ring1.y = cy;
  ring1.label = 'scanner-ring-1';
  container.addChild(ring1);

  // Rotating ring 2 (opposite direction)
  const ring2 = new Graphics();
  ring2.circle(0, 0, 58).stroke({ width: 1, color: 0x2bdff2, alpha: 0.04 });
  ring2.arc(0, 0, 58, 0, Math.PI * 0.3).stroke({ width: 1.5, color: 0x55ffe2, alpha: 0.1 });
  ring2.x = cx;
  ring2.y = cy;
  ring2.label = 'scanner-ring-2';
  container.addChild(ring2);

  // Sweep line
  const sweep = new Graphics();
  sweep.moveTo(0, 0).lineTo(65, 0).stroke({ width: 1, color: 0x55ffe2, alpha: 0.12 });
  sweep.x = cx;
  sweep.y = cy;
  sweep.label = 'scanner-sweep';
  container.addChild(sweep);

  // Glow
  const glow = new Graphics();
  glow.circle(cx, cy, 40).fill({ color: 0x2bdff2, alpha: 0.04 });
  glow.filters = [new BlurFilter({ strength: 10, quality: 2 })];
  container.addChild(glow);

  return container;
}

/* ── Ticker animations ─────────────────────────────────────── */

function setupAnimations() {
  if (!app) return;

  // Pulse task diamonds
  app.ticker.add((ticker) => {
    if (!objectLayer) return;
    const pulse = Math.sin(performance.now() / 190) * 2;
    for (const child of objectLayer.children) {
      if (child.label && child.label.startsWith('task-')) {
        child.scale.set(1 + pulse * 0.02);
      }
    }
  });

  // Sweep scanline
  app.ticker.add((ticker) => {
    if (!effectLayer) return;
    const sweep = effectLayer.getChildByLabel('sweep');
    if (sweep) sweep.y = (performance.now() / 18) % HEIGHT - 40;

    // Rotate scanner rings
    if (scannerLayer) {
      const r1 = scannerLayer.getChildByLabel('scanner-ring-1');
      const r2 = scannerLayer.getChildByLabel('scanner-ring-2');
      const sw = scannerLayer.getChildByLabel('scanner-sweep');
      const t = performance.now() / 1000;
      if (r1) r1.rotation = t * 0.4;
      if (r2) r2.rotation = -t * 0.25;
      if (sw) sw.rotation = t * 0.6;
    }
  });

  // Sync crew positions from game state
  app.ticker.add((ticker) => {
    if (!crewLayer) return;
    const sprites = crewLayer.children;
    for (let i = 0; i < state.crew.length && i < sprites.length; i++) {
      sprites[i].x = state.crew[i].px;
      sprites[i].y = state.crew[i].py;
    }
    if (playerLayer && playerLayer.children[0]) {
      playerLayer.children[0].x = state.player.px;
      playerLayer.children[0].y = state.player.py;
    }

    // Hide completed task diamonds
    if (objectLayer) {
      for (const child of objectLayer.children) {
        if (child.label && child.label.startsWith('task-')) {
          const task = (state.tasks || []).find(
            (t) => 'task-' + t.x + '-' + t.y === child.label,
          );
          child.visible = task ? !task.done : false;
        }
      }
    }
  });

  // Highlight current room label
  app.ticker.add((ticker) => {
    if (!labelLayer || !state.rooms.length) return;
    const cur = roomForCell(state.player);
    for (const lbl of labelLayer.children) {
      const isCur = lbl.label === 'room-label-' + (cur && cur.name);
      lbl.alpha = isCur ? 0.95 : 0.72;
      if (lbl.style) lbl.style.fill = isCur ? 0xeefcff : 0xdbf1f7;
    }
  });

  // Refresh dynamic overlays every frame
  app.ticker.add((ticker) => {
    refreshInteractionRings();
    refreshNoiseRing();
    refreshParticles();
    refreshLighting();
    refreshMinimap();
    refreshCinematic();
    // FX layers
    const dt = ticker.deltaMS / 1000;
    updateTrail(dt);
    updateVoicePulses(dt);
    refreshFov();
    refreshGlitch();
    updateStageFilter();
  });
}

/* ── Public API ────────────────────────────────────────────── */

/**
 * Initialize the PixiJS map renderer on an existing or new canvas.
 * @param {HTMLCanvasElement} [canvasEl] existing canvas to reuse
 */
export async function initPixiMap(canvasEl) {
  if (app) return;

  app = new Application();

  const opts = {
    width: WIDTH,
    height: HEIGHT,
    background: 0x05070d,
    antialias: true,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
    preference: 'webgl',
  };
  if (canvasEl) opts.canvas = canvasEl;

  await app.init(opts);

  // Responsive: fit canvas into its container while keeping aspect ratio
  if (canvasEl && canvasEl.parentElement) {
    const frame = canvasEl.parentElement;
    const fitCanvas = () => {
      const fw = frame.clientWidth;
      const fh = frame.clientHeight;
      if (fw <= 0 || fh <= 0) return;
      const scale = Math.min(fw / WIDTH, fh / HEIGHT);
      canvasEl.style.width = Math.floor(WIDTH * scale) + 'px';
      canvasEl.style.height = Math.floor(HEIGHT * scale) + 'px';
    };
    // Initial fit after layout settles
    requestAnimationFrame(() => { fitCanvas(); requestAnimationFrame(fitCanvas); });
    new ResizeObserver(fitCanvas).observe(frame);
  }

  buildScene();
  setupAnimations();
}

/** Build the full scene graph from current game state. */
export function buildScene() {
  if (!app) return;
  // Destroy old scene to prevent memory leaks
  app.stage.removeChildren().forEach(c => c.destroy({ children: true }));

  mapLayer = new Container({ label: 'map' });

  const backdrop = buildBackdrop();
  mapLayer.addChild(backdrop);

  scannerLayer = buildScannerLayer();
  mapLayer.addChild(scannerLayer);

  // Unified floor + wall edges from tile map (single structure)
  const unifiedMap = buildUnifiedMap();
  // Add subtle noise texture to floor for depth
  const floorNoise = new NoiseFilter({ noise: 0.06, seed: state.seed || 42 });
  const floorTint = new ColorMatrixFilter();
  floorTint.brightness(0.95, false);
  unifiedMap.filters = [floorNoise, floorTint];
  unifiedMap.cacheAsTexture(true);
  mapLayer.addChild(unifiedMap);

  corridorLayer = buildCorridors();
  corridorLayer.label = 'corridors';
  mapLayer.addChild(corridorLayer);

  roomLayer = buildRooms();
  mapLayer.addChild(roomLayer);

  fixtureLayer = buildFixtures();
  fixtureLayer.label = 'fixtures';
  mapLayer.addChild(fixtureLayer);

  objectLayer = buildObjects();
  mapLayer.addChild(objectLayer);

  labelLayer = buildLabels();
  mapLayer.addChild(labelLayer);

  crewLayer = new Container({ label: 'crew' });
  for (const member of (state.crew || [])) {
    const sprite = makeCrewGraphics(member.color);
    sprite.x = member.px;
    sprite.y = member.py;
    sprite.label = 'crew-' + member.id;
    crewLayer.addChild(sprite);
  }
  mapLayer.addChild(crewLayer);

  playerLayer = new Container({ label: 'player' });
  const ps = makePlayerGraphics();
  ps.x = state.player.px;
  ps.y = state.player.py;
  ps.label = 'player-sprite';
  playerLayer.addChild(ps);
  mapLayer.addChild(playerLayer);

  noiseRingGfx = buildNoiseRing();
  noiseRingGfx.label = 'noise-ring';
  mapLayer.addChild(noiseRingGfx);

  interactionLayer = buildInteractionLayer();
  mapLayer.addChild(interactionLayer);

  particleLayer = buildParticleLayer();
  mapLayer.addChild(particleLayer);

  effectLayer = new Container({ label: 'effects' });
  effectLayer.addChild(buildScanlines());
  const sweep = new Graphics();
  sweep.rect(0, 0, WIDTH, 80).fill({ color: 0x55ffe2, alpha: 0.04 });
  sweep.label = 'sweep';
  sweep.alpha = 0.24;
  effectLayer.addChild(sweep);
  mapLayer.addChild(effectLayer);

  lightingLayer = buildLightingLayer();
  mapLayer.addChild(lightingLayer);

  // --- FX layers ---
  trailLayer = buildTrailLayer();
  // Insert trail just before the player layer
  const playerIdx = mapLayer.children.indexOf(playerLayer);
  mapLayer.addChildAt(trailLayer, playerIdx >= 0 ? playerIdx : mapLayer.children.length);

  voicePulseLayer = buildVoicePulseLayer();
  mapLayer.addChild(voicePulseLayer);

  fovLayer = buildFovLayer();
  mapLayer.addChild(fovLayer);

  glitchLayer = buildGlitchLayer();
  mapLayer.addChild(glitchLayer);

  // HUD layers — on top of all FX
  minimapLayer = buildMinimapLayer();
  mapLayer.addChild(minimapLayer);

  cinematicLayer = buildCinematicLayer();
  mapLayer.addChild(cinematicLayer);

  // Apply stage filter for suspicion color grading
  const filter = getStageFilter();
  mapLayer.filters = [filter];

  app.stage.addChild(mapLayer);
}

/** Rebuild only dynamic layers (fixtures, objects, crew). */
export function refreshDynamic() {
  if (!app || !mapLayer) return;

  const fixIdx = mapLayer.children.indexOf(fixtureLayer);
  if (fixtureLayer) { mapLayer.removeChild(fixtureLayer); fixtureLayer.destroy(); }
  fixtureLayer = buildFixtures();
  fixtureLayer.label = 'fixtures';
  mapLayer.addChildAt(fixtureLayer, fixIdx >= 0 ? fixIdx : 3);

  const objIdx = mapLayer.children.indexOf(objectLayer);
  if (objectLayer) { mapLayer.removeChild(objectLayer); objectLayer.destroy({ children: true }); }
  objectLayer = buildObjects();
  mapLayer.addChildAt(objectLayer, objIdx >= 0 ? objIdx : 4);

  const crewIdx = mapLayer.children.indexOf(crewLayer);
  if (crewLayer) { mapLayer.removeChild(crewLayer); crewLayer.destroy({ children: true }); }
  crewLayer = new Container({ label: 'crew' });
  for (const member of (state.crew || [])) {
    const sprite = makeCrewGraphics(member.color);
    sprite.x = member.px;
    sprite.y = member.py;
    sprite.label = 'crew-' + member.id;
    crewLayer.addChild(sprite);
  }
  mapLayer.addChildAt(crewLayer, crewIdx >= 0 ? crewIdx : 6);
}

/** Tear down the PixiJS application and free GPU resources. */
export function destroyPixiMap() {
  if (!app) return;
  app.destroy(
    { removeView: false },
    { children: true, texture: true, textureSource: true },
  );
  app = null;
  mapLayer = corridorLayer = roomLayer = fixtureLayer = null;
  labelLayer = objectLayer = crewLayer = playerLayer = effectLayer = null;
  particleLayer = lightingLayer = minimapLayer = cinematicLayer = null;
  noiseRingGfx = interactionLayer = null;
  fovLayer = trailLayer = voicePulseLayer = glitchLayer = scannerLayer = null;
}

/** Expose the Application instance for external ticker/renderer access. */
export function getPixiApp() {
  return app;
}
