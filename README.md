# Echo Impostor

A procedural social stealth game where ElevenLabs-generated voices turn every crew member into a suspect.

Built with [Zed](https://zed.dev) and [ElevenLabs](https://elevenlabs.io) APIs for [#ElevenHacks](https://hacks.elevenlabs.io).

## The Problem

Most small games use audio as a static background layer. Music loops, sound effects play, and nothing changes how the player thinks or makes decisions.

## The Solution

Echo Impostor makes voice part of the deduction loop.

Every run generates a new spaceship with rooms, vents, crew members, and one hidden impostor. The player completes evidence tasks, interrogates AI-voiced suspects, listens for contradictions, and accuses the right character before the impostor hunts them down.

Innocent crew members give useful clues. The impostor manipulates, misdirects, and becomes more dangerous as evidence piles up.

## Gameplay

- Procedurally generated spaceship every run
- Explore rooms: Medbay, Reactor, Comms, Storage, Navigation, Oxygen, Security, Engine, Records, Cafeteria
- Complete evidence tasks to unlock the accusation phase
- Interrogate crew members with ElevenLabs-generated voices
- Track suspects in the crew intelligence panel
- Watch the noise meter — vents and sprinting attract the impostor
- Accuse the correct suspect and escape, or get hunted

## ElevenLabs APIs Used

### Text-to-Speech

- Crew interrogation lines
- Impostor manipulation dialogue
- Operator narration (mission intro, alerts, victory, failure)

### Sound Effects

- Keycard pickup, data core extraction, alert pulses, vault doors

### Music

- Stealth ambience during exploration
- Alert music during the hunt phase

## Built With

- [Zed](https://zed.dev) — AI-powered code editor
- [ElevenLabs](https://elevenlabs.io) — Text-to-Speech, Sound Effects, Music Generation
- Node.js + Express
- PixiJS
- Vanilla JavaScript

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

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | Optional for fallback, required for generated audio | ElevenLabs API key |
| `PORT` | No | Server port, defaults to 3001 |

## Fallback Mode

Echo Impostor is fully playable without an ElevenLabs API key. The frontend uses browser-based fallback audio so the game can be tested and demonstrated without API access. Generated ElevenLabs audio is the intended full experience.

## License

MIT
