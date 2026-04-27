// Feature: echo-impostor-redesign — VoiceReplayCache module
// Requirements: 3.1, 3.3, 3.5

import { playVoiceSource, speakFallback, stopActiveVoice } from './audio.js';

const replayCache = new Map(); // characterId → { src, text }

/**
 * Cache a voice line for later replay.
 * @param {string} characterId
 * @param {string} src - audio source URL (may be null/empty for fallback)
 * @param {string} text - spoken text for TTS fallback
 */
export function cacheVoice(characterId, src, text) {
  if (!characterId) return;
  replayCache.set(characterId, { src: src || null, text: text || '' });
}

/**
 * Retrieve cached voice entry for a character.
 * @param {string} characterId
 * @returns {{ src: string|null, text: string } | undefined}
 */
export function getVoice(characterId) {
  return replayCache.get(characterId);
}

/**
 * Replay the last cached voice for a character.
 * Cascade: playVoiceSource → speakFallback (beep is handled inside speakFallback).
 * Stops any currently playing voice first (Req 3.5).
 * @param {string} characterId
 */
export function replayVoice(characterId) {
  const entry = replayCache.get(characterId);
  if (!entry) return;

  stopActiveVoice();

  if (entry.src) {
    playVoiceSource(entry.src, entry.text, characterId);
  } else {
    speakFallback(entry.text, characterId);
  }
}

/**
 * Check whether a cached voice exists for a character.
 * @param {string} characterId
 * @returns {boolean}
 */
export function hasVoice(characterId) {
  return replayCache.has(characterId);
}

/**
 * Clear the entire replay cache (called on new run).
 */
export function clearCache() {
  replayCache.clear();
}
