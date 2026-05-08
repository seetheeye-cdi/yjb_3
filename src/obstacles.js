import { CONFIG } from './config.js';
import { pad } from './collision.js';

const CACTUS_SIZES = ['SMALL', 'MEDIUM', 'LARGE'];

export class Cactus {
  constructor(x, sizeKey) {
    const size = CONFIG.CACTUS[sizeKey];
    this.kind = 'cactus';
    this.sizeKey = sizeKey;
    this.x = x;
    this.w = size.w;
    this.h = size.h;
    this.y = CONFIG.WORLD.GROUND_Y - this.h;
    // Sometimes draw a cluster (1-3 stalks) for "large" by varying width.
    this.cluster = sizeKey === 'LARGE' && Math.random() < 0.4 ? 2 : 1;
    if (this.cluster > 1) this.w = size.w * this.cluster + 4 * (this.cluster - 1);
  }

  update(dt, speed) {
    this.x -= speed * dt;
  }

  isOffscreen() {
    return this.x + this.w < 0;
  }

  hitbox() {
    return pad({ x: this.x, y: this.y, w: this.w, h: this.h }, 2, 2);
  }

  draw(ctx, isNight) {
    ctx.save();
    ctx.fillStyle = isNight ? '#e0e3e7' : '#535b66';
    const stalkW = CONFIG.CACTUS[this.sizeKey].w;
    for (let i = 0; i < this.cluster; i++) {
      const sx = this.x + i * (stalkW + 4);
      ctx.fillRect(sx, this.y, stalkW, this.h);
      // Arms
      ctx.fillRect(sx - 3, this.y + 6, 3, this.h * 0.45);
      ctx.fillRect(sx + stalkW, this.y + 10, 3, this.h * 0.4);
    }
    ctx.restore();
  }
}

export class Pterodactyl {
  constructor(x, yIndex) {
    this.kind = 'ptero';
    this.x = x;
    this.w = CONFIG.PTERO.WIDTH;
    this.h = CONFIG.PTERO.HEIGHT;
    this.y = CONFIG.PTERO.HEIGHTS[yIndex] - this.h;
    this.flap = 0;
    // pteros move slightly faster than scroll
    this.bonus = 0.6;
  }

  update(dt, speed) {
    this.x -= (speed + this.bonus) * dt;
    this.flap += dt * 0.18;
  }

  isOffscreen() {
    return this.x + this.w < 0;
  }

  hitbox() {
    return pad({ x: this.x, y: this.y, w: this.w, h: this.h }, 3, 2);
  }

  draw(ctx, isNight) {
    ctx.save();
    ctx.fillStyle = isNight ? '#f1f3f4' : '#202124';
    const wingDown = Math.floor(this.flap) % 2 === 0;
    // body
    ctx.fillRect(this.x + 6, this.y + 6, this.w - 12, 6);
    // beak
    ctx.fillRect(this.x + this.w - 6, this.y + 4, 6, 4);
    // wing
    if (wingDown) {
      ctx.fillRect(this.x + 4, this.y + 10, this.w - 14, 6);
    } else {
      ctx.fillRect(this.x + 4, this.y - 2, this.w - 14, 6);
    }
    ctx.restore();
  }
}

export class Spawner {
  constructor() {
    this.cooldownFrames = 60;
    this.lastObstacleX = -Infinity;
  }

  reset() {
    this.cooldownFrames = 60;
    this.lastObstacleX = -Infinity;
  }

  // Returns a new obstacle (or null) given dt, current speed, and score.
  step(dt, speed, score) {
    this.cooldownFrames -= dt;
    if (this.cooldownFrames > 0) return null;

    // Difficulty: spawn intervals shorten slightly as speed grows
    const speedRatio = (speed - CONFIG.PHYSICS.INITIAL_SPEED) /
      Math.max(0.001, CONFIG.PHYSICS.MAX_SPEED - CONFIG.PHYSICS.INITIAL_SPEED);
    const base = CONFIG.SPAWN.BASE_INTERVAL_FRAMES * (1 - 0.3 * Math.min(1, speedRatio));
    const jitter = Math.random() * CONFIG.SPAWN.JITTER_FRAMES;
    this.cooldownFrames = Math.max(CONFIG.SPAWN.MIN_GAP_FRAMES, base + jitter);

    const allowPtero = score >= CONFIG.SCORE.PTERO_UNLOCK;
    const roll = Math.random();
    let obstacle;
    if (allowPtero && roll < 0.25) {
      const yIdx = Math.floor(Math.random() * CONFIG.PTERO.HEIGHTS.length);
      obstacle = new Pterodactyl(CONFIG.WORLD.WIDTH + 20, yIdx);
    } else {
      const sizeKey = CACTUS_SIZES[Math.floor(Math.random() * CACTUS_SIZES.length)];
      obstacle = new Cactus(CONFIG.WORLD.WIDTH + 20, sizeKey);
    }
    this.lastObstacleX = obstacle.x;
    return obstacle;
  }
}
