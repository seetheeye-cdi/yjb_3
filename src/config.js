// Tunable game parameters (60Hz reference, normalized via delta time at runtime)
export const CONFIG = Object.freeze({
  WORLD: {
    WIDTH: 900,
    HEIGHT: 240,
    GROUND_Y: 200, // y of ground line
  },
  PHYSICS: {
    GRAVITY: 0.6,
    JUMP_VY: -12,
    FAST_FALL_MULT: 2.4,
    INITIAL_SPEED: 6,
    MAX_SPEED: 12,
    SPEED_RAMP_PER_SCORE: 0.0014, // applied per score point
  },
  SCORE: {
    PER_FRAME: 0.1,
    DAYNIGHT_INTERVAL: 700,
    PTERO_UNLOCK: 700,
    HISCORE_KEY: 'trex_hi_score',
    NICK_KEY: 'trex_nickname',
  },
  SPAWN: {
    BASE_INTERVAL_FRAMES: 80,
    MIN_GAP_FRAMES: 38,
    JITTER_FRAMES: 60,
  },
  DINO: {
    X: 50,
    WIDTH: 44,
    HEIGHT: 48,
    DUCK_WIDTH: 60,
    DUCK_HEIGHT: 28,
    HITBOX_PAD_X: 4,
    HITBOX_PAD_Y: 4,
  },
  CACTUS: {
    SMALL: { w: 12, h: 24 },
    MEDIUM: { w: 18, h: 30 },
    LARGE: { w: 24, h: 36 },
  },
  PTERO: {
    WIDTH: 30,
    HEIGHT: 18,
    HEIGHTS: [120, 150, 178], // y-top of three altitude bands
  },
  LEADERBOARD: {
    TOP_N: 10,
    NEW_BADGE_MS: 24 * 60 * 60 * 1000,
  },
});
