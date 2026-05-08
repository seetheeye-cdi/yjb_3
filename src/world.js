import { CONFIG } from './config.js';

// Background: ground line, scrolling pebbles, clouds, stars/moon at night.

export class Background {
  constructor() {
    this.scroll = 0;
    this.clouds = [];
    this.stars = [];
    this.bumps = [];
    for (let i = 0; i < 24; i++) {
      this.bumps.push({
        x: Math.random() * CONFIG.WORLD.WIDTH,
        y: CONFIG.WORLD.GROUND_Y + 4 + Math.random() * 18,
        w: 2 + Math.random() * 6,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.clouds.push({
        x: Math.random() * CONFIG.WORLD.WIDTH,
        y: 30 + Math.random() * 40,
        speed: 0.4 + Math.random() * 0.3,
        w: 40 + Math.random() * 30,
      });
    }
    for (let i = 0; i < 25; i++) {
      this.stars.push({
        x: Math.random() * CONFIG.WORLD.WIDTH,
        y: 10 + Math.random() * 100,
        twinkle: Math.random(),
      });
    }
  }

  reset() { this.scroll = 0; }

  update(dt, speed) {
    this.scroll = (this.scroll + speed * dt) % 50;
    for (const b of this.bumps) {
      b.x -= speed * dt;
      if (b.x < -10) {
        b.x = CONFIG.WORLD.WIDTH + Math.random() * 60;
        b.y = CONFIG.WORLD.GROUND_Y + 4 + Math.random() * 18;
        b.w = 2 + Math.random() * 6;
      }
    }
    for (const c of this.clouds) {
      c.x -= c.speed * dt;
      if (c.x + c.w < 0) {
        c.x = CONFIG.WORLD.WIDTH + Math.random() * 200;
        c.y = 20 + Math.random() * 50;
      }
    }
    for (const s of this.stars) {
      s.twinkle += dt * 0.05;
    }
  }

  draw(ctx, transition) {
    // transition: 0 (full day) → 1 (full night)
    const dayBg = '#ffffff';
    const nightBg = '#10131a';
    const dayFg = '#535b66';
    const nightFg = '#e8eaed';
    const bg = blend(dayBg, nightBg, transition);
    const fg = blend(dayFg, nightFg, transition);

    ctx.save();
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, CONFIG.WORLD.WIDTH, CONFIG.WORLD.HEIGHT);

    // Stars (visible only during night transition)
    if (transition > 0.05) {
      ctx.globalAlpha = transition;
      ctx.fillStyle = '#fff';
      for (const s of this.stars) {
        const tw = 0.5 + 0.5 * Math.sin(s.twinkle);
        const size = 1 + tw * 1.4;
        ctx.fillRect(s.x, s.y, size, size);
      }
      // Moon
      ctx.beginPath();
      ctx.fillStyle = '#f8f9fa';
      ctx.arc(CONFIG.WORLD.WIDTH - 80, 50, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(CONFIG.WORLD.WIDTH - 73, 46, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      // Clouds (day only)
      ctx.fillStyle = '#dadce0';
      for (const c of this.clouds) {
        ctx.fillRect(c.x, c.y, c.w, 6);
        ctx.fillRect(c.x + 6, c.y - 4, c.w - 12, 6);
      }
    }

    // Ground line
    ctx.fillStyle = fg;
    ctx.fillRect(0, CONFIG.WORLD.GROUND_Y, CONFIG.WORLD.WIDTH, 1);

    // pebbles
    ctx.fillStyle = fg;
    for (const b of this.bumps) {
      ctx.fillRect(b.x, b.y, b.w, 2);
    }
    ctx.restore();
  }
}

function blend(c1, c2, t) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bb = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bb})`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const v = parseInt(h.length === 3
    ? h.split('').map(c => c + c).join('')
    : h, 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}
