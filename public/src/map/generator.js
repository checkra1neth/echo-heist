import { state, TILE, COLS, ROWS, CREW_TEMPLATES, TASK_LABELS, ROOM_NAMES, mulberry32, randInt, choice, keyOf, cellCenter, roomForCell } from '../core/state.js';

/* ── Room name pool & hue palette ─────────────────────────── */

const ROOM_HUES = [174, 176, 182, 186, 188, 194, 198, 202, 210];

/* ── BSP-lite room placement ──────────────────────────────── */

function generateRooms() {
  const count = randInt(7, 9);
  const rooms = [];
  const names = [...ROOM_NAMES];

  // Shuffle names deterministically
  for (let i = names.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [names[i], names[j]] = [names[j], names[i]];
  }

  const minW = 4, maxW = 7;
  const minH = 3, maxH = 5;
  const pad = 1; // gap between rooms

  for (let attempt = 0; attempt < 400 && rooms.length < count; attempt++) {
    const w = randInt(minW, maxW);
    const h = randInt(minH, maxH);
    const x = randInt(1, COLS - w - 2);
    const y = randInt(1, ROWS - h - 2);

    // Check overlap with existing rooms (including padding)
    let overlaps = false;
    for (const r of rooms) {
      if (
        x < r.x + r.w + pad &&
        x + w + pad > r.x &&
        y < r.y + r.h + pad &&
        y + h + pad > r.y
      ) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const name = names[rooms.length % names.length];
    const hue = ROOM_HUES[rooms.length % ROOM_HUES.length];
    rooms.push({
      name,
      x, y, w, h,
      hue,
      cx: Math.floor(x + w / 2),
      cy: Math.floor(y + h / 2),
    });
  }

  return rooms;
}

/* ── Corridor generation (connect rooms via L-shaped paths) ── */

function generateCorridors(rooms) {
  const corridors = [];
  if (rooms.length < 2) return corridors;

  // Build a minimum spanning tree so every room is reachable
  const connected = new Set([0]);
  const remaining = new Set(rooms.map((_, i) => i));
  remaining.delete(0);

  while (remaining.size > 0) {
    let bestDist = Infinity;
    let bestFrom = 0;
    let bestTo = 0;

    for (const ci of connected) {
      for (const ri of remaining) {
        const d = Math.hypot(
          rooms[ci].cx - rooms[ri].cx,
          rooms[ci].cy - rooms[ri].cy,
        );
        if (d < bestDist) {
          bestDist = d;
          bestFrom = ci;
          bestTo = ri;
        }
      }
    }

    connected.add(bestTo);
    remaining.delete(bestTo);

    const a = rooms[bestFrom];
    const b = rooms[bestTo];

    // L-shaped corridor: horizontal then vertical, or vice versa
    if (state.rng() < 0.5) {
      corridors.push([[a.cx, a.cy], [b.cx, a.cy], [b.cx, b.cy]]);
    } else {
      corridors.push([[a.cx, a.cy], [a.cx, b.cy], [b.cx, b.cy]]);
    }
  }

  // Add 1-2 extra corridors for loops
  const extras = randInt(1, 2);
  for (let i = 0; i < extras; i++) {
    const ai = randInt(0, rooms.length - 1);
    let bi = randInt(0, rooms.length - 1);
    if (bi === ai) bi = (bi + 1) % rooms.length;
    const a = rooms[ai];
    const b = rooms[bi];
    if (state.rng() < 0.5) {
      corridors.push([[a.cx, a.cy], [b.cx, a.cy], [b.cx, b.cy]]);
    } else {
      corridors.push([[a.cx, a.cy], [a.cx, b.cy], [b.cx, b.cy]]);
    }
  }

  return corridors;
}

/* ── Carve map from rooms + corridors ─────────────────────── */

function carveMap(rooms, corridors) {
  const map = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => "#"),
  );

  function safe(x, y) {
    return x > 0 && y > 0 && x < COLS - 1 && y < ROWS - 1;
  }

  // Carve rooms
  for (const room of rooms) {
    for (let yy = room.y; yy < room.y + room.h; yy++) {
      for (let xx = room.x; xx < room.x + room.w; xx++) {
        if (safe(xx, yy)) map[yy][xx] = ".";
      }
    }
  }

  // Carve corridors (1-tile wide)
  for (const path of corridors) {
    for (let i = 0; i < path.length - 1; i++) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];

      if (y1 === y2) {
        // Horizontal segment
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        for (let x = minX; x <= maxX; x++) {
          if (safe(x, y1)) map[y1][x] = ".";
        }
      } else {
        // Vertical segment
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        for (let y = minY; y <= maxY; y++) {
          if (safe(x1, y)) map[y][x1] = ".";
        }
      }
    }
  }

  return map;
}

/* ── Place objects on floor tiles inside rooms ────────────── */

function collectFloors(map) {
  const floors = [];
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (map[y][x] === ".") floors.push({ x, y });
    }
  }
  return floors;
}

function pickInRoom(room, map, used) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const x = randInt(room.x + 1, room.x + room.w - 2);
    const y = randInt(room.y + 1, room.y + room.h - 2);
    const key = keyOf(x, y);
    if (map[y] && map[y][x] === "." && !used.has(key)) {
      used.add(key);
      return { x, y };
    }
  }
  // Fallback: any floor in room
  for (let yy = room.y; yy < room.y + room.h; yy++) {
    for (let xx = room.x; xx < room.x + room.w; xx++) {
      const key = keyOf(xx, yy);
      if (map[yy] && map[yy][xx] === "." && !used.has(key)) {
        used.add(key);
        return { x: xx, y: yy };
      }
    }
  }
  return { x: room.cx, y: room.cy };
}

function pickFloorAnywhere(floors, used) {
  for (let i = 0; i < 80; i++) {
    const cell = choice(floors);
    const key = keyOf(cell.x, cell.y);
    if (!used.has(key)) {
      used.add(key);
      return cell;
    }
  }
  return floors[0];
}

/* ── Main entry point ─────────────────────────────────────── */

function isInsideAnyRoom(x, y, rooms) {
  for (const r of rooms) {
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return true;
  }
  return false;
}

export function buildProceduralMap(seed) {
  state.seed = seed || Math.floor(Math.random() * 1000000000);
  state.rng = mulberry32(state.seed);

  // Generate rooms
  const rooms = generateRooms();

  // Generate corridors
  const corridors = generateCorridors(rooms);

  // Carve the tile map
  const map = carveMap(rooms, corridors);
  const floors = collectFloors(map);
  const used = new Set();

  // Pick start position (center of first room)
  const startRoom = rooms[0];
  const start = { x: startRoom.cx, y: startRoom.cy };
  used.add(keyOf(start.x, start.y));

  // Pick exit — bottom-center of the room farthest from start
  const exitRoom = rooms.reduce((best, r) => {
    const d = Math.hypot(r.cx - start.x, r.cy - start.y);
    const bestD = Math.hypot(best.cx - start.x, best.cy - start.y);
    return d > bestD ? r : best;
  }, rooms[rooms.length - 1]);
  const exit = {
    x: exitRoom.cx,
    y: exitRoom.y + exitRoom.h - 1,
  };
  used.add(keyOf(exit.x, exit.y));

  // Place tasks in different rooms (skip start & exit rooms)
  const taskRooms = rooms.filter((r, i) => i !== 0 && i !== rooms.length - 1);
  // Shuffle task rooms
  for (let i = taskRooms.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [taskRooms[i], taskRooms[j]] = [taskRooms[j], taskRooms[i]];
  }
  const taskCount = Math.min(3, taskRooms.length);
  const tasks = [];
  for (let i = 0; i < taskCount; i++) {
    const cell = pickInRoom(taskRooms[i], map, used);
    tasks.push({
      id: "task-" + i,
      x: cell.x,
      y: cell.y,
      label: TASK_LABELS[i % TASK_LABELS.length],
      room: taskRooms[i].name,
      done: false,
    });
  }

  // Place vents in corridors only (not inside rooms)
  const corridorFloors = floors.filter(f => !isInsideAnyRoom(f.x, f.y, rooms));
  const ventCount = randInt(4, 7);
  const vents = [];
  for (let i = 0; i < ventCount && corridorFloors.length > 0; i++) {
    const idx = randInt(0, corridorFloors.length - 1);
    const cell = corridorFloors[idx];
    const key = keyOf(cell.x, cell.y);
    if (!used.has(key)) {
      used.add(key);
      vents.push(cell);
      corridorFloors.splice(idx, 1);
    }
  }

  // Place hiding spots (inside rooms)
  const hideCount = randInt(4, 6);
  const hiding = [];
  for (let i = 0; i < hideCount; i++) {
    const room = rooms[randInt(0, rooms.length - 1)];
    const cell = pickInRoom(room, map, used);
    hiding.push(cell);
  }

  // Place security doors at corridor-room boundaries
  const securityDoors = [];
  const doorUsed = new Set();

  for (const corridor of corridors) {
    // Walk along each segment and find where it crosses a room edge
    for (let seg = 0; seg < corridor.length - 1; seg++) {
      const [x1, y1] = corridor[seg];
      const [x2, y2] = corridor[seg + 1];

      const stepX = x1 === x2 ? 0 : (x2 > x1 ? 1 : -1);
      const stepY = y1 === y2 ? 0 : (y2 > y1 ? 1 : -1);
      let cx = x1, cy = y1;

      while (cx !== x2 || cy !== y2) {
        const prevInRoom = isInsideAnyRoom(cx, cy, rooms);
        cx += stepX;
        cy += stepY;
        const currInRoom = isInsideAnyRoom(cx, cy, rooms);

        // Transition: inside room → corridor (or vice versa) = door position
        if (prevInRoom !== currInRoom && map[cy] && map[cy][cx] === '.') {
          const key = cx + ',' + cy;
          if (!doorUsed.has(key)) {
            doorUsed.add(key);
            const orientation = stepY === 0 ? 'vertical' : 'horizontal';
            securityDoors.push({ x: cx, y: cy, orientation });
          }
        }
      }
    }
    if (securityDoors.length >= 8) break;
  }

  // Store everything in state
  state.map = map;
  state.rooms = rooms;
  state.corridors = corridors;
  state.tasks = tasks;
  state.exit = exit;
  state.vents = vents;
  state.hiding = hiding;
  state.securityDoors = securityDoors;

  return start;
}

export function spawnCrew(start) {
  const templates = CREW_TEMPLATES.map((c) => ({ ...c }));
  const impostorIndex = randInt(0, templates.length - 1);
  state.impostorId = templates[impostorIndex].id;

  state.crew = templates.map((template, index) => {
    const room = state.rooms[(index + 2) % state.rooms.length] || {
      cx: start.x + index + 2,
      cy: start.y + 1,
    };
    const spawn = nearestFloor(room.cx, room.cy);
    const pos = cellCenter(spawn);
    return {
      ...template,
      x: spawn.x,
      y: spawn.y,
      px: pos.px,
      py: pos.py,
      target: null,
      speed: template.id === state.impostorId ? 2.75 : 1.55,
      isImpostor: template.id === state.impostorId,
      suspicion: 0,
      talked: false,
      nextMoveAt: 0,
      lastAttackAt: 0,
      roomName: room.name || "Unknown",
      lastLine: "Not interrogated",
      accused: false,
    };
  });
}

export function nearestFloor(x, y) {
  if (isFloor(x, y)) return { x, y };
  let best = null;
  let bestD = Infinity;
  for (let yy = 1; yy < ROWS - 1; yy++) {
    for (let xx = 1; xx < COLS - 1; xx++) {
      if (!isFloor(xx, yy)) continue;
      const d = Math.hypot(xx - x, yy - y);
      if (d < bestD) {
        bestD = d;
        best = { x: xx, y: yy };
      }
    }
  }
  return best || { x: 1, y: 1 };
}

export function isFloor(x, y) {
  return state.map && state.map[y] && state.map[y][x] === ".";
}

export function isWall(x, y) {
  return !isFloor(x, y);
}

export function isVent(x, y) {
  return state.vents.some((v) => v.x === x && v.y === y);
}

export function isHiding(x, y) {
  return state.hiding.some((h) => h.x === x && h.y === y);
}

export function isSecurityDoor(x, y) {
  return state.securityDoors.some((door) => door.x === x && door.y === y);
}

export function canMoveTo(px, py) {
  const margin = 12;
  const points = [
    [px - margin, py - margin],
    [px + margin, py - margin],
    [px - margin, py + margin],
    [px + margin, py + margin],
  ];
  return points.every(([x, y]) => {
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    return !isWall(cx, cy);
  });
}
