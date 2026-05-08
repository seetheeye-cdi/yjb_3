import { CONFIG } from './config.js';
import { pad } from './collision.js';

export const DINO_STATE = Object.freeze({
  IDLE: 'idle',
  RUN: 'run',
  JUMP: 'jump',
  DUCK: 'duck',
  DEAD: 'dead',
});

export class Dino {
  constructor() {
    this.x = CONFIG.DINO.X;
    this.w = CONFIG.DINO.WIDTH;
    this.h = CONFIG.DINO.HEIGHT;
    this.vy = 0;
    this.state = DINO_STATE.IDLE;
    this.runFrame = 0;
    this.fastFall = false;
    this.y = this.groundY();
  }

  groundY() {
    return CONFIG.WORLD.GROUND_Y - this.h;
  }

  isOnGround() {
    return Math.abs(this.y - this.groundY()) < 0.5 && this.vy >= 0;
  }

  jump() {
    if (this.state === DINO_STATE.DEAD) return;
    if (!this.isOnGround()) return;
    this.vy = CONFIG.PHYSICS.JUMP_VY;
    this.state = DINO_STATE.JUMP;
    this.fastFall = false;
  }

  startDuck() {
    if (this.state === DINO_STATE.DEAD) return;
    if (this.state === DINO_STATE.JUMP) {
      this.fastFall = true;
      return;
    }
    if (this.isOnGround()) {
      this.state = DINO_STATE.DUCK;
      const oldBottom = this.y + this.h;
      this.w = CONFIG.DINO.DUCK_WIDTH;
      this.h = CONFIG.DINO.DUCK_HEIGHT;
      this.y = oldBottom - this.h;
    }
  }

  endDuck() {
    if (this.state === DINO_STATE.DUCK) {
      const oldBottom = this.y + this.h;
      this.w = CONFIG.DINO.WIDTH;
      this.h = CONFIG.DINO.HEIGHT;
      this.y = oldBottom - this.h;
      this.state = DINO_STATE.RUN;
    }
    this.fastFall = false;
  }

  reset() {
    this.x = CONFIG.DINO.X;
    this.w = CONFIG.DINO.WIDTH;
    this.h = CONFIG.DINO.HEIGHT;
    this.vy = 0;
    this.state = DINO_STATE.RUN;
    this.runFrame = 0;
    this.fastFall = false;
    this.y = this.groundY();
  }

  kill() {
    this.state = DINO_STATE.DEAD;
    this.vy = 0;
  }

  start() {
    this.state = DINO_STATE.RUN;
  }

  // dt is in "frames at 60Hz" units (1.0 = one 60Hz frame).
  update(dt) {
    if (this.state === DINO_STATE.DEAD) return;

    const g = CONFIG.PHYSICS.GRAVITY * (this.fastFall ? CONFIG.PHYSICS.FAST_FALL_MULT : 1);
    this.vy += g * dt;
    this.y += this.vy * dt;

    if (this.y >= this.groundY()) {
      this.y = this.groundY();
      this.vy = 0;
      this.fastFall = false;
      if (this.state === DINO_STATE.JUMP) {
        this.state = DINO_STATE.RUN;
      }
    }

    if (this.state === DINO_STATE.RUN || this.state === DINO_STATE.DUCK) {
      this.runFrame += dt * 0.18;
    }
  }

  hitbox() {
    return pad(
      { x: this.x, y: this.y, w: this.w, h: this.h },
      CONFIG.DINO.HITBOX_PAD_X,
      CONFIG.DINO.HITBOX_PAD_Y,
    );
  }

  // Cute pixel-art-ish vector dino so we don't need an external sprite sheet.
  draw(ctx, isNight) {
    const color = isNight ? '#f1f3f4' : '#202124';
    ctx.save();
    ctx.fillStyle = color;
    if (this.state === DINO_STATE.DUCK) {
      this.#drawDuck(ctx);
    } else {
      this.#drawStand(ctx);
    }
    ctx.restore();
  }

  #drawStand(ctx) {
    const { x, y, w, h } = this;
    // body
    ctx.fillRect(x + 8, y + 6, w - 14, h - 18);
    // head
    ctx.fillRect(x + 18, y, w - 18, 18);
    // eye (cutout)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.restore();
    ctx.fillStyle = ctx.fillStyle; // (no-op, keep style)
    // Tail
    ctx.fillRect(x, y + 10, 10, 6);
    // Legs animate by runFrame phase
    const phase = Math.floor(this.runFrame) % 2;
    if (this.state === DINO_STATE.JUMP) {
      ctx.fillRect(x + 12, y + h - 10, 6, 10);
      ctx.fillRect(x + 22, y + h - 10, 6, 10);
    } else if (phase === 0) {
      ctx.fillRect(x + 12, y + h - 10, 6, 10);
      ctx.fillRect(x + 22, y + h - 6, 6, 6);
    } else {
      ctx.fillRect(x + 12, y + h - 6, 6, 6);
      ctx.fillRect(x + 22, y + h - 10, 6, 10);
    }
    // White eye dot
    const eye = '#ffffff';
    const prev = ctx.fillStyle;
    ctx.fillStyle = eye;
    ctx.fillRect(x + w - 8, y + 4, 3, 3);
    ctx.fillStyle = prev;
  }

  #drawDuck(ctx) {
    const { x, y, w, h } = this;
    // long flat body when ducking
    ctx.fillRect(x, y + 4, w - 6, h - 8);
    ctx.fillRect(x + w - 14, y, 14, h - 8);
    // legs
    const phase = Math.floor(this.runFrame) % 2;
    if (phase === 0) {
      ctx.fillRect(x + 8, y + h - 6, 6, 6);
      ctx.fillRect(x + 26, y + h - 4, 6, 4);
    } else {
      ctx.fillRect(x + 8, y + h - 4, 6, 4);
      ctx.fillRect(x + 26, y + h - 6, 6, 6);
    }
  }
}
