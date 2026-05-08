import { CONFIG } from './config.js';

export function loadHiScore() {
  try {
    const v = localStorage.getItem(CONFIG.SCORE.HISCORE_KEY);
    return v ? Math.max(0, parseInt(v, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

export function saveHiScore(score) {
  try {
    localStorage.setItem(CONFIG.SCORE.HISCORE_KEY, String(Math.floor(score)));
  } catch {
    /* localStorage unavailable; silently ignore */
  }
}

export function loadNickname() {
  try { return localStorage.getItem(CONFIG.SCORE.NICK_KEY) || ''; }
  catch { return ''; }
}

export function saveNickname(nick) {
  try { localStorage.setItem(CONFIG.SCORE.NICK_KEY, nick); } catch {}
}

export function formatScore(n) {
  return String(Math.floor(n)).padStart(5, '0');
}

export function speedFromScore(score) {
  const s = CONFIG.PHYSICS.INITIAL_SPEED + score * CONFIG.PHYSICS.SPEED_RAMP_PER_SCORE;
  return Math.min(CONFIG.PHYSICS.MAX_SPEED, s);
}

// Returns night transition value 0..1 based on score (smooth pulse).
export function dayNightTransition(score) {
  const interval = CONFIG.SCORE.DAYNIGHT_INTERVAL;
  const period = interval * 2;
  const t = ((score % period) + period) % period;
  if (t < interval) {
    // ramp up over last 80 points before flipping
    const ramp = 80;
    if (t < interval - ramp) return 0;
    return (t - (interval - ramp)) / ramp;
  } else {
    const local = t - interval;
    const ramp = 80;
    if (local < interval - ramp) return 1;
    return 1 - (local - (interval - ramp)) / ramp;
  }
}

export function isNightFromTransition(transition) {
  return transition > 0.5;
}
