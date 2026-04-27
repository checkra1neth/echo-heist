import express from "express";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { createWriteStream, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const AUDIO_DIR = path.join(__dirname, "public", "audio");
const HAS_ELEVENLABS_KEY = Boolean(process.env.ELEVENLABS_API_KEY);

if (!existsSync(AUDIO_DIR)) {
  mkdirSync(AUDIO_DIR, { recursive: true });
}

const app = express();
const elevenlabs = HAS_ELEVENLABS_KEY
  ? new ElevenLabsClient({ apiKey: process.env.ELEVENLABS_API_KEY })
  : null;

app.use(express.json({ limit: "1mb" }));
app.use("/pixi.js", express.static(path.join(__dirname, "node_modules", "pixi.js", "dist")));
app.use(express.static(path.join(__dirname, "public"), {
  etag: false,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

const VOICES = {
  operator: {
    id: process.env.ELEVENLABS_OPERATOR_VOICE_ID || "pFZP5JQG7iQjIQuC4Bku",
    name: "Lily",       // female, velvety actress — mission narrator / hints
  },
  guard: {
    id: process.env.ELEVENLABS_GUARD_VOICE_ID || "pNInz6obpgDQGcFmaJgB",
    name: "Adam",       // male, dominant & firm — archive guard
  },
};

const MISSION_LINES = {
  intro:
    "[whispering] You're inside the archive. Stay quiet. Find the keycard, steal the voice core, then reach the exit.",
  keycard:
    "[calm, focused] Keycard acquired. The vault door can hear every step now.",
  core: "[urgent] Voice core secured. The archive is waking up. Move to extraction.",
  alert: "[panicked] Stop moving. The guard heard the echo.",
  victory:
    "[relieved] Extraction complete. You made it out with the voice core.",
  failure:
    "[tense] You've been detected. The archive remembers your voice now.",
};

const GUARD_LINES = [
  "Did you hear that?",
  "Scanning corridor three.",
  "Movement detected.",
  "The archive is not empty.",
  "Locking exits now.",
];

const SFX_PROMPTS = {
  keycard: "short futuristic keycard pickup chime, clean sci-fi UI sound",
  core: "glowing electric data core pickup, futuristic energy hum, short and satisfying",
  alert: "short cyberpunk alarm beep, tense but not too loud",
  door: "heavy futuristic vault door unlocking and sliding open",
};

const MUSIC_PROMPTS = {
  stealth:
    "Minimal dark synth stealth music, quiet pulse, futuristic archive, tense but controlled, 90 BPM, seamless loop, instrumental only, no vocals.",
  alert:
    "Intense cyberpunk chase music, rising percussion, urgent synth bass, cinematic tension, seamless loop, instrumental only, no vocals.",
};

const CHARACTER_VOICES = {
  nova:     process.env.ELEVENLABS_NOVA_VOICE_ID     || "EXAVITQu4vr4xnSDxMaL", // Sarah  — female, mature & reassuring  → "calm operator"
  rook:     process.env.ELEVENLABS_ROOK_VOICE_ID     || "IKne3meq5aSn9XLyUdCD", // Charlie — male, deep & energetic       → "rough engineer"
  pixel:    process.env.ELEVENLABS_PIXEL_VOICE_ID    || "cgSgspJ2msm6clMCkdW9", // Jessica — female, playful & bright     → "quick nervous"
  vega:     process.env.ELEVENLABS_VEGA_VOICE_ID     || "cjVigY5qzO86Huf0OWal", // Eric    — male, smooth & trustworthy   → "smooth pilot"
  echo:     process.env.ELEVENLABS_ECHO_VOICE_ID     || "SAz9YHcvj6GT2YYXdXww", // River   — neutral, relaxed             → "soft synthetic"
  impostor: process.env.ELEVENLABS_IMPOSTOR_VOICE_ID || "N2lVS1w4EtoT3dr4eOWO", // Callum  — male, husky trickster        → impostor
};

function safeText(value, fallback = "...") {
  const text = String(value || fallback)
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, 260) || fallback;
}

function publicAudioPath(filename) {
  return `/audio/${filename}`;
}

function absoluteAudioPath(filename) {
  return path.join(AUDIO_DIR, filename);
}

async function streamToFile(stream, filePath) {
  return new Promise(async (resolve, reject) => {
    const out = createWriteStream(filePath);

    out.on("finish", resolve);
    out.on("error", reject);

    try {
      if (stream?.pipe) {
        stream.pipe(out);
        return;
      }

      for await (const chunk of stream) {
        out.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }

      out.end();
    } catch (error) {
      out.destroy();
      reject(error);
    }
  });
}

async function safeGenerate(name, generator) {
  try {
    const result = await generator();
    return { ok: true, value: result };
  } catch (error) {
    console.warn(`[mission-audio] ${name} failed:`, error?.message || error);
    return { ok: false, error: error?.message || String(error) };
  }
}

async function generateTts({ id, text, voiceId, filename }) {
  const filePath = absoluteAudioPath(filename);
  if (existsSync(filePath)) {
    return { id, type: "voice", text, src: publicAudioPath(filename) };
  }

  const stream = await elevenlabs.textToSpeech.convert(voiceId, {
    text,
    modelId: "eleven_v3",
    voiceSettings: {
      stability: 0.45,
      similarityBoost: 0.8,
      style: 0.35,
      useSpeakerBoost: true,
      speed: 0.95,
    },
  });

  await streamToFile(stream, filePath);

  return {
    id,
    type: "voice",
    text,
    src: publicAudioPath(filename),
  };
}

async function generateSfx({ id, prompt, filename, durationSeconds = 2 }) {
  const filePath = absoluteAudioPath(filename);
  if (existsSync(filePath)) {
    return { id, type: "sfx", prompt, src: publicAudioPath(filename) };
  }

  const stream = await elevenlabs.textToSoundEffects.convert({
    text: prompt,
    durationSeconds,
    promptInfluence: 0.65,
    loop: false,
  });

  await streamToFile(stream, filePath);

  return {
    id,
    type: "sfx",
    prompt,
    src: publicAudioPath(filename),
  };
}

async function generateMusic({ id, prompt, filename, musicLengthMs = 30000 }) {
  const filePath = absoluteAudioPath(filename);
  if (existsSync(filePath)) {
    return { id, type: "music", prompt, src: publicAudioPath(filename) };
  }

  const stream = await elevenlabs.music.compose({
    prompt,
    musicLengthMs,
    forceInstrumental: true,
  });

  await streamToFile(stream, filePath);

  return {
    id,
    type: "music",
    prompt,
    src: publicAudioPath(filename),
  };
}

function fallbackMission(seed) {
  return {
    id: seed,
    mode: "fallback",
    generated: false,
    message:
      "No ElevenLabs API key was found, so Echo Impostor is running with built-in WebAudio fallback sounds.",
    voices: {
      operator: VOICES.operator.name,
      guard: VOICES.guard.name,
    },
    lines: MISSION_LINES,
    guardLines: GUARD_LINES,
    audio: {
      operator: {},
      guard: [],
      sfx: {},
      music: {},
    },
  };
}

async function generatedMission(seed) {
  const files = {
    intro: `operator-intro-${seed}.mp3`,
    keycard: `operator-keycard-${seed}.mp3`,
    core: `operator-core-${seed}.mp3`,
    alert: `operator-alert-${seed}.mp3`,
    victory: `operator-victory-${seed}.mp3`,
    failure: `operator-failure-${seed}.mp3`,
    guard0: `guard-0-${seed}.mp3`,
    guard1: `guard-1-${seed}.mp3`,
    guard2: `guard-2-${seed}.mp3`,
    guard3: `guard-3-${seed}.mp3`,
    guard4: `guard-4-${seed}.mp3`,
    sfxKeycard: `sfx-keycard-${seed}.mp3`,
    sfxCore: `sfx-core-${seed}.mp3`,
    sfxAlert: `sfx-alert-${seed}.mp3`,
    sfxDoor: `sfx-door-${seed}.mp3`,
    musicStealth: `music-stealth-${seed}.mp3`,
    musicAlert: `music-alert-${seed}.mp3`,
  };

  const operatorJobs = Object.entries(MISSION_LINES).map(([id, text]) =>
    safeGenerate(`operator:${id}`, () =>
      generateTts({
        id,
        text,
        voiceId: VOICES.operator.id,
        filename: files[id],
      }),
    ),
  );

  const guardJobs = GUARD_LINES.map((text, index) =>
    safeGenerate(`guard:${index}`, () =>
      generateTts({
        id: `guard-${index}`,
        text,
        voiceId: VOICES.guard.id,
        filename: files[`guard${index}`],
      }),
    ),
  );

  const sfxJobs = [
    safeGenerate("sfx:keycard", () =>
      generateSfx({
        id: "keycard",
        prompt: SFX_PROMPTS.keycard,
        filename: files.sfxKeycard,
        durationSeconds: 1.5,
      }),
    ),
    safeGenerate("sfx:core", () =>
      generateSfx({
        id: "core",
        prompt: SFX_PROMPTS.core,
        filename: files.sfxCore,
        durationSeconds: 2,
      }),
    ),
    safeGenerate("sfx:alert", () =>
      generateSfx({
        id: "alert",
        prompt: SFX_PROMPTS.alert,
        filename: files.sfxAlert,
        durationSeconds: 2,
      }),
    ),
    safeGenerate("sfx:door", () =>
      generateSfx({
        id: "door",
        prompt: SFX_PROMPTS.door,
        filename: files.sfxDoor,
        durationSeconds: 3,
      }),
    ),
  ];

  const musicJobs = [
    safeGenerate("music:stealth", () =>
      generateMusic({
        id: "stealth",
        prompt: MUSIC_PROMPTS.stealth,
        filename: files.musicStealth,
        musicLengthMs: 45000,
      }),
    ),
    safeGenerate("music:alert", () =>
      generateMusic({
        id: "alert",
        prompt: MUSIC_PROMPTS.alert,
        filename: files.musicAlert,
        musicLengthMs: 30000,
      }),
    ),
  ];

  const [operatorResults, guardResults, sfxResults, musicResults] =
    await Promise.all([
      Promise.all(operatorJobs),
      Promise.all(guardJobs),
      Promise.all(sfxJobs),
      Promise.all(musicJobs),
    ]);

  const operator = {};
  const failed = [];

  for (const result of operatorResults) {
    if (result.ok) {
      operator[result.value.id] = result.value.src;
    } else {
      failed.push(result.error);
    }
  }

  const guard = [];
  for (const result of guardResults) {
    if (result.ok) {
      guard.push(result.value.src);
    } else {
      failed.push(result.error);
    }
  }

  const sfx = {};
  for (const result of sfxResults) {
    if (result.ok) {
      sfx[result.value.id] = result.value.src;
    } else {
      failed.push(result.error);
    }
  }

  const music = {};
  for (const result of musicResults) {
    if (result.ok) {
      music[result.value.id] = result.value.src;
    } else {
      failed.push(result.error);
    }
  }

  return {
    id: seed,
    mode: failed.length ? "partial" : "generated",
    generated: Object.keys(operator).length > 0 || guard.length > 0,
    message: failed.length
      ? "Mission generated with partial ElevenLabs audio. Missing clips will use WebAudio fallback."
      : "Mission audio generated successfully with ElevenLabs.",
    voices: {
      operator: VOICES.operator.name,
      guard: VOICES.guard.name,
    },
    lines: MISSION_LINES,
    guardLines: GUARD_LINES,
    audio: {
      operator,
      guard,
      sfx,
      music,
    },
    failed,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "Echo Impostor",
    elevenlabs: HAS_ELEVENLABS_KEY ? "configured" : "missing-api-key",
    port: PORT,
  });
});

app.post("/api/speak", async (req, res) => {
  const seed = randomUUID().slice(0, 8);
  const character = safeText(
    req.body?.character || "nova",
    "nova",
  ).toLowerCase();
  const text = safeText(req.body?.text, "I heard something in the vents.");
  const voiceId =
    req.body?.voiceId || CHARACTER_VOICES[character] || VOICES.operator.id;

  if (!HAS_ELEVENLABS_KEY) {
    res.json({
      generated: false,
      mode: "fallback",
      character,
      text,
      message:
        "No ElevenLabs API key found. Browser speech fallback will be used.",
    });
    return;
  }

  try {
    const filename = `character-${character}-${seed}.mp3`;
    const clip = await generateTts({ id: character, text, voiceId, filename });

    res.json({
      generated: true,
      mode: "generated",
      character,
      text,
      voiceId,
      src: clip.src,
    });
  } catch (error) {
    console.warn("[speak] generation failed:", error?.message || error);
    res.status(200).json({
      generated: false,
      mode: "fallback-after-error",
      character,
      text,
      error: error?.message || String(error),
    });
  }
});

app.post("/api/cast", async (req, res) => {
  const seed = safeText(req.body?.seed || randomUUID().slice(0, 8), "cast")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 32);
  const cast = Array.isArray(req.body?.cast) ? req.body.cast.slice(0, 8) : [];

  if (!cast.length) {
    res.json({
      generated: false,
      mode: "empty",
      seed,
      clips: {},
      message: "No cast lines were provided.",
    });
    return;
  }

  if (!HAS_ELEVENLABS_KEY) {
    const clips = {};
    for (const member of cast) {
      const character = safeText(
        member.character || member.id || "nova",
        "nova",
      ).toLowerCase();
      const lines = Array.isArray(member.lines)
        ? member.lines.slice(0, 5)
        : [member.text || "I heard something in the vents."];
      clips[character] = lines.map((line) => ({
        text: safeText(line, "I heard something in the vents."),
        src: null,
      }));
    }

    res.json({
      generated: false,
      mode: "fallback",
      seed,
      clips,
      message:
        "No ElevenLabs API key found. Browser speech fallback will be used for the cast.",
    });
    return;
  }

  const clips = {};
  const failed = [];

  for (const member of cast) {
    const character = safeText(
      member.character || member.id || "nova",
      "nova",
    ).toLowerCase();
    const safeCharacter =
      character.replace(/[^a-z0-9-]/g, "").slice(0, 32) || "character";
    const voiceId =
      member.voiceId || CHARACTER_VOICES[character] || VOICES.operator.id;
    const lines = Array.isArray(member.lines)
      ? member.lines.slice(0, 5)
      : [member.text || "I heard something in the vents."];

    clips[character] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const text = safeText(lines[index], "I heard something in the vents.");
      const filename = `cast-${seed}-${safeCharacter}-${index}.mp3`;

      try {
        const clip = await generateTts({
          id: `${character}-${index}`,
          text,
          voiceId,
          filename,
        });

        clips[character].push({
          text,
          src: clip.src,
        });
      } catch (error) {
        failed.push({
          character,
          text,
          error: error?.message || String(error),
        });
        clips[character].push({
          text,
          src: null,
        });
      }
    }
  }

  res.json({
    generated: Object.values(clips).some((lines) =>
      lines.some((line) => Boolean(line.src)),
    ),
    mode: failed.length ? "partial" : "generated",
    seed,
    clips,
    failed,
  });
});

app.post("/api/mission", async (req, res) => {
  const seed = req.body?.seed
    ? String(req.body.seed).replace(/[^a-z0-9-]/gi, "").slice(0, 32) || "default"
    : randomUUID().slice(0, 8);

  if (!HAS_ELEVENLABS_KEY) {
    res.json(fallbackMission(seed));
    return;
  }

  try {
    const mission = await generatedMission(seed);
    res.json(mission);
  } catch (error) {
    console.error("[mission] unexpected failure:", error);
    res.status(200).json({
      ...fallbackMission(seed),
      mode: "fallback-after-error",
      message:
        "ElevenLabs generation failed unexpectedly. Echo Impostor is still playable with fallback audio.",
      error: error?.message || String(error),
    });
  }
});

app.post("/api/clear-audio", (req, res) => {
  const seed = req.body?.seed
    ? String(req.body.seed).replace(/[^a-z0-9-]/gi, "").slice(0, 32)
    : null;

  try {
    const files = readdirSync(AUDIO_DIR);
    let removed = 0;

    for (const file of files) {
      // If seed provided, only remove files matching that seed
      if (seed && !file.includes(seed)) continue;
      try {
        unlinkSync(path.join(AUDIO_DIR, file));
        removed++;
      } catch (_e) { /* skip */ }
    }

    res.json({ ok: true, removed, seed: seed || "all" });
  } catch (error) {
    res.json({ ok: false, error: error?.message || String(error) });
  }
});

app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Echo Impostor running at http://localhost:${PORT}`);
  console.log(
    HAS_ELEVENLABS_KEY
      ? "ElevenLabs API key detected. Mission audio generation is enabled."
      : "No ELEVENLABS_API_KEY found. Using browser fallback audio.",
  );
});
