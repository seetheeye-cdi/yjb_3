// Lightweight logic tests runnable with `node tests/logic.test.mjs`.
// Avoids a test framework dependency to honor the "near-single-file" goal.

import assert from 'node:assert/strict';
import { aabb, pad } from '../src/collision.js';
import { speedFromScore, formatScore, dayNightTransition, isNightFromTransition } from '../src/score.js';
import { validateNickname, isProfane } from '../src/profanity.js';
import { CONFIG } from '../src/config.js';

let pass = 0;
function t(label, fn) {
  try {
    fn();
    console.log('  ✓', label);
    pass++;
  } catch (e) {
    console.error('  ✗', label, '\n', e?.message || e);
    process.exitCode = 1;
  }
}

console.log('collision');
t('aabb detects overlap', () => {
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }), true);
});
t('aabb rejects when touching only edge', () => {
  // Strict less-than means touching edges do NOT count.
  assert.equal(aabb({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }), false);
});
t('pad shrinks by symmetric padding', () => {
  const r = pad({ x: 0, y: 0, w: 10, h: 10 }, 2, 1);
  assert.deepEqual(r, { x: 2, y: 1, w: 6, h: 8 });
});

console.log('score');
t('formatScore pads to 5', () => {
  assert.equal(formatScore(0), '00000');
  assert.equal(formatScore(123), '00123');
  assert.equal(formatScore(99999.7), '99999');
});
t('speed clamps at MAX_SPEED', () => {
  assert.equal(speedFromScore(0), CONFIG.PHYSICS.INITIAL_SPEED);
  assert.equal(speedFromScore(1e9), CONFIG.PHYSICS.MAX_SPEED);
});
t('dayNight transitions across 700 boundary', () => {
  // At score 0 we are firmly day.
  assert.equal(isNightFromTransition(dayNightTransition(0)), false);
  // Around 1.5x interval we should be night.
  const t1 = dayNightTransition(CONFIG.SCORE.DAYNIGHT_INTERVAL + 100);
  assert.equal(isNightFromTransition(t1), true);
});

console.log('profanity / nickname');
t('rejects too short', () => {
  assert.equal(validateNickname('ab').ok, false);
});
t('rejects too long', () => {
  assert.equal(validateNickname('a'.repeat(13)).ok, false);
});
t('accepts hangul + ascii mix', () => {
  assert.equal(validateNickname('유정복3').ok, true);
});
t('blocks blocklist substring', () => {
  assert.equal(isProfane('helloFUCKworld'), true);
  assert.equal(validateNickname('shitlord').ok, false);
});

console.log(`\n${pass} test(s) passed`);
