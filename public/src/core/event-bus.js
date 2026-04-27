/**
 * EventBus — centralized event bus for inter-module communication.
 *
 * Events:
 *   voice:play, voice:stop, voice:ended,
 *   game:pause, game:resume,
 *   overlay:open, overlay:close,
 *   evidence:added, crew:interrogated
 */

const listeners = new Map();

export const bus = {
  /**
   * Subscribe to an event.
   * @param {string} event — event name
   * @param {Function} fn  — handler
   */
  on(event, fn) {
    if (!listeners.has(event)) {
      listeners.set(event, new Set());
    }
    listeners.get(event).add(fn);
  },

  /**
   * Unsubscribe from an event.
   * @param {string} event — event name
   * @param {Function} fn  — handler previously passed to on()
   */
  off(event, fn) {
    const subs = listeners.get(event);
    if (subs) {
      subs.delete(fn);
    }
  },

  /**
   * Emit an event to all subscribers.
   * Each call is wrapped in try/catch — an error in one subscriber
   * does not interrupt the others.
   * @param {string} event — event name
   * @param {*} data       — arbitrary data
   */
  emit(event, data) {
    const subs = listeners.get(event);
    if (!subs) return;
    for (const fn of subs) {
      try {
        fn(data);
      } catch (err) {
        console.error(`[EventBus] error in subscriber "${event}":`, err);
      }
    }
  },
};
