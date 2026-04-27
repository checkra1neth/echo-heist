# Echo Impostor

A procedural impostor-style social stealth game built with Zed and ElevenLabs APIs.

In Echo Impostor, every run generates a new spaceship layout with rooms, vents, evidence tasks, hiding spots, crew members, and one hidden impostor. The player must complete evidence tasks, interrogate AI-voiced suspects, listen for contradictions, accuse the right character, and escape before the impostor hunts them down.

## Hackathon One-Liner

Echo Impostor is a procedural social stealth game where ElevenLabs-generated voices turn every crew member into a suspect.

## The Problem

Most small hackathon games use audio as a static background layer. Music loops, sound effects play, and nothing really changes how the player thinks, feels, or makes decisions.

For an impostor-style game to be memorable in a short demo video, it needs suspicion fast: a mysterious crew, contradictory dialogue, procedural replayability, and a strong “wait, the characters are AI-voiced?” moment.

## The Solution

Echo Impostor makes voice part of the deduction loop.

The player explores a procedurally generated ship, completes evidence tasks, questions crew members, and uses ElevenLabs-generated character voices to identify the impostor. Innocent crew members give useful clues, while the impostor manipulates, misdirects, and becomes more dangerous as the player collects evidence.

## Core Gameplay

- Generate a new spaceship every run.
- Explore named rooms such as Medbay, Reactor, Comms, Storage, Navigation, Oxygen, Security, Engine, Records, and Cafeteria.
- Complete evidence tasks to unlock the accusation phase.
- Interrogate crew members with ElevenLabs-generated voices.
- Track suspects in the crew intelligence panel.
- Watch the noise meter, because vents and sprinting can attract the impostor.
- Accuse the correct suspect.
- Escape through the exit after exposing the impostor.

## Why This Fits the Hackathon

This project focuses on a smaller, polished, replayable game experience rather than a large unfinished one.

The goal is to make the judges and viewers immediately understand:

- what the player wants;
- who the suspects are;
- why the voices matter;
- how ElevenLabs changes the deduction experience;
- why every procedural run can create a different story;
- why the demo is fun to watch.

## ElevenLabs APIs Used

### Text-to-Speech

Used for:

- crew interrogation lines;
- impostor manipulation lines;
- emergency operator narration;
- success and failure narration;
- emotional mission feedback.

Example character lines:

- “I was calibrating oxygen near the blue corridor.”
- “The vents? No, I definitely did not hear any vents.”
- “My scanner caught a voice print, but it was scrambled.”
- “No. You were not supposed to hear the real voice.”

### Sound Effects

Used for:

- task completion cues;
- accusation stingers;
- vent sounds;
- footsteps;
- alert pulses;
- impostor hunt cues;
- mission success/failure cues.

### Music

Used for:

- procedural ship ambience;
- impostor hunt music;
- accusation tension;
- victory music.

The music should shift the emotional state of the game: quiet suspicion at the start, panic during the hunt, and relief after a correct accusation.

## Built With

- Zed
- ElevenLabs APIs
- Node.js
- Express
- Vanilla JavaScript
- HTML Canvas
- CSS

## Project Scope

Echo Impostor is intentionally scoped as one complete procedural mission loop.

The target experience:

- procedural ship generation;
- named rooms;
- multiple crew suspects;
- one hidden impostor;
- evidence tasks;
- crew interrogation;
- suspect/evidence panel;
- generated character voices;
- fallback local speech/audio if no ElevenLabs API key is available;
- short enough to explain in a 60-second video.

## Quick Start

1. Install dependencies:

   npm install

2. Create an environment file:

   cp .env.example .env

3. Add your ElevenLabs API key:

   ELEVENLABS_API_KEY=your_key_here

4. Start the app:

   npm start

5. Open the game:

   http://localhost:3001

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| ELEVENLABS_API_KEY | Optional for local fallback, required for generated audio | ElevenLabs API key |
| PORT | No | Server port, defaults to 3001 |

## Local Fallback Mode

Echo Impostor should remain playable even without an ElevenLabs API key.

If the key is missing, the backend returns mission metadata without generated audio files. The frontend then uses simple browser-based fallback sounds so the game can still be tested, recorded, and demonstrated.

Generated ElevenLabs audio is the intended full experience.

## Planned Game Flow

1. Player clicks “Generate Mission Voices”.
2. The game creates a procedural ship seed with rooms, tasks, vents, hiding spots, crew, and one impostor.
3. Backend can pre-generate cast voice clips through `/api/cast`.
4. Individual character lines can also be generated on demand through `/api/speak`.
5. Player completes evidence tasks and interrogates suspects.
6. The suspect/evidence panel tracks who has been questioned and what they said.
7. Player accuses a suspect.
8. If correct, the impostor is exposed and the player must evacuate.
9. If wrong, the impostor begins hunting the player.

## Video Submission Strategy

The submission video should be planned early, not at the end.

Recommended length: 45–60 seconds.

### Suggested Video Structure

#### 0–3 seconds: Hook

Text on screen:

“I made a game where every suspect can talk.”

Show a procedural ship, multiple colorful crew members, and one ElevenLabs-voiced suspect saying something suspicious.

#### 3–10 seconds: Setup

Explain the idea quickly:

“Most games use audio as background. In Echo Impostor, voices are evidence.”

Show the suspect panel, evidence log, and a crew member being interrogated.

#### 10–25 seconds: Gameplay

Show:

- generating a new ship;
- completing an evidence task;
- interrogating a crew member;
- hearing a suspicious ElevenLabs voice line;
- the impostor beginning to hunt the player.

#### 25–40 seconds: ElevenLabs Moment

Show the cast voice generation and interrogation moment.

Text on screen:

“ElevenLabs gives every suspect a voice.”

#### 40–55 seconds: Climax

Show:

- accusing a suspect;
- revealing the impostor;
- hunt phase if the accusation is wrong;
- evacuation after a correct accusation.

#### 55–60 seconds: CTA

Text on screen:

“Built with Zed + ElevenLabs for #ElevenHacks”

## Submission Notes

When submitting, include:

- project name: Echo Impostor;
- short description;
- GitHub repository link;
- live demo link if deployed;
- demo video link;
- list of ElevenLabs APIs used;
- explanation of how Zed was used during development;
- social post links.

## Social Posting Checklist

Post the demo on as many platforms as possible for scoring:

- X
- LinkedIn
- Instagram
- TikTok

Each post should include:

- @zeddotdev
- @elevenlabsio
- #ElevenHacks

## Example Social Post

I built Echo Impostor — a procedural impostor-style game where every suspect can talk.

ElevenLabs generates crew voices, impostor lines, sound effects, and music. The audio is not just atmosphere; it becomes evidence.

Built with @zeddotdev + @elevenlabsio for #ElevenHacks.

Demo below.

## Judging Angle

Echo Impostor is designed around the hackathon scoring mindset:

- Real pain: small games often lack emotional characters, replayability, and cinematic audio.
- Clear user: casual players, viewers, streamers, and judges watching a short demo.
- Focused solution: one polished procedural social stealth loop.
- Strong demo: easy to understand visually, emotionally, and narratively.
- Clear differentiation: AI voices are part of the deduction mechanic.
- Why now: ElevenLabs makes high-quality character voice generation possible for solo builders and small teams.

## License

MIT
