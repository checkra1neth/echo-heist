import { state, ui } from '../core/state.js';
import { updateProgressPanel, noiseLabel, setStatus } from '../ui/panels.js';
import { formatTime } from './primitives.js';

export function updateUi() {
  const ambientNoise = state.mode === "playing" ? 42 : 0;
  const alertLevel = Math.max(state.noise, state.suspicion, ambientNoise);

  if (ui.noiseFill) {
    ui.noiseFill.style.width = Math.round(alertLevel) + "%";
  }
  if (ui.noiseReadout) {
    ui.noiseReadout.textContent = noiseLabel(alertLevel);
  }
  if (ui.missionClock) {
    ui.missionClock.textContent = formatTime(state.timer);
  }

  updateProgressPanel();

  if (state.mode !== "playing") return;
  if (state.suspicion > 70) setStatus("IMPOSTOR HUNTING");
  else if (state.noise > 65) setStatus("Too loud");
  else if (state.player.hidden) setStatus("Hidden");
  else setStatus("Collecting evidence");
}
