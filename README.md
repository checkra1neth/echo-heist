# Echo Impostor

> **Hackathon Submission for #ElevenHacks**
> Built with [ElevenLabs](https://elevenlabs.io) voice AI + [v0](https://v0.dev) generative UI.
> Tags: `@elevenlabsio` `@v0`

A procedural social stealth game where **ElevenLabs-generated voices turn every crew member into a suspect**. Voice isn't background noise — it's the core mechanic.

[🎮 Play the Game](https://echo-heist.vercel.app) · [📹 Watch the Demo](https://x.com/checkra1ndev/status/2049135485352583201) · [🐦 Share on X](https://twitter.com/intent/tweet?text=Echo+Impostor+%E2%80%94+a+voice-driven+stealth+game+built+with+%40elevenlabsio+for+%23ElevenHacks)

---

## The Problem

Most browser games treat audio as decoration: a music loop, a few SFX, nothing that changes how the player thinks or makes decisions. Voice AI is usually an afterthought.

## The Solution

**Echo Impostor makes voice the deduction loop.**

Every run generates a new spaceship with procedurally placed rooms, vents, crew members, and one hidden impostor. The player collects evidence, interrogates AI-voiced suspects, listens for vocal contradictions, and accuses the right character before the impostor hunts them down.

Innocent crew members give useful clues. The impostor manipulates, misdirects, and becomes more dangerous as evidence piles up.

---

## What We Reimagined

We picked the classic "social deduction" genre and rebuilt it around **voice as a gameplay mechanic** rather than just narrative dressing. Then we pushed it further:

- **Terminalcore UI** — monospace typography, cyan-on-black telemetry, command-line aesthetics
- **Glassmorphism panels** — frosted HUD layers, scan-line overlays, depth-based UI
- **Fully voice-driven** — no reading required; every clue, warning, and story beat is spoken

---

## ElevenLabs APIs Used

### Text-to-Speech (TTS)
- **Crew voices** — 5 unique characters + 1 impostor, each with a distinct ElevenLabs voice
- **Operator narration** — mission intro, alerts, victory, failure, room descriptions
- **Voice-guided tutorial** — contextual spoken hints triggered by player actions
- **Collectible audio logs** — lore-filled voice memos from previous crew members
- **Proximity voice alerts** — dynamic warnings when the impostor is near or noise is critical
- **Room narration** — atmospheric voice descriptions when entering each area

### Sound Effects
- Keycard pickup, data core extraction, alert pulses, vent noises, footsteps

### Music Generation
- **Stealth ambience** — procedural dark-synth loop during exploration
- **Alert music** — rising cyberpunk chase score during hunt phase

### Conversational AI (Design)
- Interrogations simulate conversation: the player "talks" to crew by pressing `E`, and each character responds with AI-generated voice lines that vary per run

---

## New Audio Features

| Feature | What It Does |
|---|---|
| **Voice-Guided Tutorial** | 9 contextual voice steps teach movement, hiding, tasks, interrogation, accusation, noise management |
| **Collectible Audio Logs** | 2-4 logs spawn per run with lore and impostor-behavior hints; played via ElevenLabs TTS |
| **Dynamic Room Narration** | Entering a room triggers a unique atmospheric voice description (9 rooms × 2 variants) |
| **Proximity Voice Hints** | Context-aware warnings: impostor hunting, wrong accusation, low tasks remaining, high noise |
| **Audio Log Replay Panel** | UI panel to re-listen to discovered logs at any time |

---

## Gameplay

- Procedurally generated spaceship every run (seed-based)
- Explore rooms: Hangar, Engine Bay, Medbay, Central Hall, Cafeteria, Laboratory, Data Storage, Server Room, Quarters
- Complete 3 evidence tasks to unlock accusation
- Interrogate crew with `E` — listen to ElevenLabs-generated voices
- Track suspects in the crew intelligence panel with replayable voice clips
- Watch the noise meter — vents and sprinting attract the impostor
- Press `Q` to accuse. Correct = escape. Wrong = the impostor hunts you.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Code Editor** | [Zed](https://zed.dev) |
| **Voice AI** | [ElevenLabs](https://elevenlabs.io) — TTS, SFX, Music |
| **Backend** | Node.js + Express |
| **Frontend** | Vanilla JavaScript, PixiJS, HTML5 Canvas |
| **UI Redesign** | v0-inspired terminalcore / glassmorphism aesthetic |
| **Deployment** | Vercel-ready static + server setup |

---

## Quick Start

```bash
npm install
cp .env.example .env
```

Add your ElevenLabs API key to `.env`:

```
ELEVENLABS_API_KEY=your_key_here
```

Start the game:

```bash
npm start
```

Open [http://localhost:3001](http://localhost:3001)

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ELEVENLABS_API_KEY` | Optional for fallback, required for generated audio | ElevenLabs API key |
| `PORT` | No | Server port, defaults to `3001` |

---

## Fallback Mode

Echo Impostor is **fully playable without an ElevenLabs API key**. The frontend uses browser-based `speechSynthesis` and WebAudio oscillators as fallback. Generated ElevenLabs audio is the intended full experience.

---

## Hackathon Tags

`#ElevenHacks` `@elevenlabsio` `@v0`

---

## License

MIT
