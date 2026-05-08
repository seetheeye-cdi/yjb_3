import { CONFIG } from './config.js';
import { Dino, DINO_STATE } from './dino.js';
import { Spawner } from './obstacles.js';
import { Background } from './world.js';
import { aabb } from './collision.js';
import {
  loadHiScore, saveHiScore, loadNickname, saveNickname,
  formatScore, speedFromScore, dayNightTransition, isNightFromTransition,
} from './score.js';
import { validateNickname } from './profanity.js';
import {
  submitScore, subscribeTopScores, fetchMyRank,
  isConfigured, isSubmitConfigured, isNewBadge,
} from './leaderboard.js';

// ---- Canvas + DPR --------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: true });

function fitForDpr() {
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const cssW = CONFIG.WORLD.WIDTH;
  const cssH = CONFIG.WORLD.HEIGHT;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.aspectRatio = `${cssW} / ${cssH}`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
fitForDpr();
window.addEventListener('resize', fitForDpr, { passive: true });

// ---- Game state ---------------------------------------------------------
const STATE = Object.freeze({ READY: 'ready', RUN: 'run', GAMEOVER: 'gameover' });

const dino = new Dino();
const spawner = new Spawner();
const bg = new Background();
let obstacles = [];

let state = STATE.READY;
let score = 0;
let hiScore = loadHiScore();
let inputCount = 0;
let runStartTs = 0;
let runEndedAt = 0;
let lastSubmitResult = null;

// ---- Overlay UI ---------------------------------------------------------
const overlayEl = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlaySub = document.getElementById('overlay-sub');
const nicknameForm = document.getElementById('nickname-form');
const nicknameInput = document.getElementById('nickname-input');
const nicknameSubmitBtn = document.getElementById('nickname-submit');
const nicknameSkipBtn = document.getElementById('nickname-skip');
const nicknameError = document.getElementById('nickname-error');

const lbStatusEl = document.getElementById('lb-status');
const lbListEl = document.getElementById('lb-list');
const lbMyRankEl = document.getElementById('lb-myrank');

function showOverlay(title, sub) {
  overlayTitle.textContent = title;
  overlaySub.textContent = sub || '';
  overlayEl.classList.remove('hidden');
}
function hideOverlay() {
  overlayEl.classList.add('hidden');
  nicknameForm.classList.add('hidden');
  nicknameError.textContent = '';
}

// ---- Leaderboard live binding ------------------------------------------
let topRows = [];
let lbReady = false;

if (isConfigured()) {
  lbStatusEl.textContent = 'Connecting…';
  subscribeTopScores(CONFIG.LEADERBOARD.TOP_N, (snap) => {
    if (!snap.ok) {
      lbStatusEl.textContent = `Leaderboard offline (${snap.reason}).`;
      return;
    }
    lbReady = true;
    topRows = snap.rows;
    lbStatusEl.textContent = topRows.length === 0
      ? '아직 등록된 점수가 없어요. 첫 도전자가 되어보세요!'
      : '';
    renderLeaderboard();
  });
} else {
  lbStatusEl.textContent =
    'Leaderboard offline — set Firebase config in src/leaderboard.js to enable.';
}

function renderLeaderboard() {
  lbListEl.innerHTML = '';
  const myNick = loadNickname();
  for (let i = 0; i < topRows.length; i++) {
    const r = topRows[i];
    const li = document.createElement('li');
    li.classList.add(`rank-${i + 1}`);
    if (myNick && r.nickname === myNick) li.classList.add('me');
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `#${i + 1}`;
    const nick = document.createElement('span');
    nick.className = 'nick';
    nick.textContent = r.nickname;
    const sc = document.createElement('span');
    sc.className = 'score';
    sc.textContent = formatScore(r.score);
    const newBadge = document.createElement('span');
    if (isNewBadge(r.createdAt)) {
      newBadge.className = 'new';
      newBadge.textContent = 'NEW';
    }
    li.append(rank, nick, sc, newBadge);
    lbListEl.appendChild(li);
  }
}

// ---- Input --------------------------------------------------------------
const pressed = new Set();

function onJump() {
  if (state === STATE.READY) start();
  else if (state === STATE.RUN) {
    inputCount++;
    dino.jump();
  } else if (state === STATE.GAMEOVER) {
    // Allow restart only after the nickname dialog has been resolved.
    if (nicknameForm.classList.contains('hidden')) restart();
  }
}

function onDuckStart() {
  if (state !== STATE.RUN) return;
  inputCount++;
  dino.startDuck();
}

function onDuckEnd() {
  dino.endDuck();
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    onJump();
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    onDuckStart();
  }
  pressed.add(e.code);
}, { passive: false });

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown') {
    onDuckEnd();
  }
  pressed.delete(e.code);
});

// Mouse + touch
canvas.addEventListener('mousedown', (e) => { e.preventDefault(); onJump(); });
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  onJump();
}, { passive: false });

// Nickname form handlers
nicknameSubmitBtn.addEventListener('click', handleNicknameSubmit);
nicknameInput.addEventListener('keydown', (e) => {
  if (e.code === 'Enter') {
    e.preventDefault();
    handleNicknameSubmit();
  }
});
nicknameSkipBtn.addEventListener('click', () => {
  nicknameForm.classList.add('hidden');
  showOverlay('GAME OVER', 'Press SPACE to restart');
});

async function handleNicknameSubmit() {
  const v = validateNickname(nicknameInput.value);
  if (!v.ok) { nicknameError.textContent = v.reason; return; }
  nicknameError.textContent = '';
  saveNickname(v.value);
  nicknameSubmitBtn.disabled = true;
  nicknameSubmitBtn.textContent = '제출 중…';

  const payload = {
    nickname: v.value,
    score: Math.floor(score),
    durationMs: runEndedAt - runStartTs,
    inputCount,
  };
  if (isSubmitConfigured()) {
    lastSubmitResult = await submitScore(payload);
  } else {
    lastSubmitResult = { ok: false, reason: 'leaderboard-offline' };
  }
  nicknameSubmitBtn.disabled = false;
  nicknameSubmitBtn.textContent = '제출';

  nicknameForm.classList.add('hidden');
  if (lastSubmitResult.ok) {
    showOverlay('등록 완료!', `점수 ${formatScore(payload.score)} · Press SPACE to restart`);
    // Refresh my rank lazily
    fetchMyRank(payload.score).then((r) => {
      if (r.ok) {
        lbMyRankEl.textContent = `내 순위: ${r.rank} / ${r.total}`;
      }
    });
  } else if (lastSubmitResult.reason === 'leaderboard-offline') {
    showOverlay('GAME OVER',
      'Firebase 설정 전이라 글로벌 등록을 건너뛰었어요. Press SPACE to restart');
  } else {
    showOverlay('등록 실패',
      `${lastSubmitResult.reason} · Press SPACE to restart`);
  }
}

// ---- Lifecycle ----------------------------------------------------------
function start() {
  hideOverlay();
  dino.reset();
  spawner.reset();
  bg.reset();
  obstacles = [];
  score = 0;
  inputCount = 0;
  runStartTs = performance.now();
  state = STATE.RUN;
  dino.start();
}

function restart() {
  start();
}

function gameOver() {
  state = STATE.GAMEOVER;
  runEndedAt = performance.now();
  dino.kill();
  if (Math.floor(score) > hiScore) {
    hiScore = Math.floor(score);
    saveHiScore(hiScore);
  }
  // Decide whether to show nickname form
  const min10 = topRows.length >= CONFIG.LEADERBOARD.TOP_N
    ? topRows[topRows.length - 1].score
    : 0;
  const qualifies = lbReady &&
    (topRows.length < CONFIG.LEADERBOARD.TOP_N || Math.floor(score) > min10) &&
    Math.floor(score) > 0;

  if (qualifies && isSubmitConfigured()) {
    showOverlay('GAME OVER', `점수 ${formatScore(score)} · Top ${CONFIG.LEADERBOARD.TOP_N}!`);
    nicknameForm.classList.remove('hidden');
    const last = loadNickname();
    nicknameInput.value = last;
    setTimeout(() => nicknameInput.focus(), 30);
  } else {
    const note = !isConfigured()
      ? 'Leaderboard offline — set Firebase config to enable.'
      : 'Press SPACE to restart';
    showOverlay('GAME OVER', note);
  }
}

// ---- Game loop ----------------------------------------------------------
let lastTs = 0;
function frame(ts) {
  if (!lastTs) lastTs = ts;
  const dtMs = Math.min(64, ts - lastTs); // clamp big pauses
  lastTs = ts;
  const dt = dtMs / (1000 / 60); // 60Hz frame units

  update(dt);
  render();

  requestAnimationFrame(frame);
}

function update(dt) {
  const speed = state === STATE.RUN ? speedFromScore(score) : CONFIG.PHYSICS.INITIAL_SPEED;

  bg.update(dt, state === STATE.RUN ? speed : 0);
  dino.update(dt);

  if (state !== STATE.RUN) return;

  score += dt * CONFIG.SCORE.PER_FRAME * 6; // ~0.6 per frame (matches Chrome's ~0.1 per render @ 60fps × 6 multiplier feels close)
  // The PRD says ~0.1/frame but that ramps slowly; we keep score readable.

  const newOb = spawner.step(dt, speed, score);
  if (newOb) obstacles.push(newOb);
  for (const o of obstacles) o.update(dt, speed);
  obstacles = obstacles.filter((o) => !o.isOffscreen());

  // Collisions
  const myBox = dino.hitbox();
  for (const o of obstacles) {
    if (aabb(myBox, o.hitbox())) {
      gameOver();
      break;
    }
  }
}

function render() {
  const trans = dayNightTransition(score);
  const isNight = isNightFromTransition(trans);

  // Clear with bg color via Background draw
  bg.draw(ctx, trans);

  // Obstacles
  for (const o of obstacles) o.draw(ctx, isNight);
  // Dino
  dino.draw(ctx, isNight);

  // HUD: HI <hiScore>   <currentScore>
  ctx.save();
  ctx.fillStyle = isNight ? '#e8eaed' : '#202124';
  ctx.font = '600 16px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'right';
  const padR = 16;
  ctx.fillText(`HI ${formatScore(hiScore)}    ${formatScore(score)}`, CONFIG.WORLD.WIDTH - padR, 24);

  if (state === STATE.READY) {
    ctx.textAlign = 'center';
    ctx.font = '600 18px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillText('PRESS SPACE TO START', CONFIG.WORLD.WIDTH / 2, CONFIG.WORLD.HEIGHT / 2);
  }
  ctx.restore();
}

// Initial state: show ready overlay too (in addition to canvas hint)
showOverlay('PRESS SPACE TO START', 'Space/↑ jump · ↓ duck · click/tap also jumps');
requestAnimationFrame(frame);

// Expose tiny debug surface (read-only) for manual smoke testing in browser.
window.__trex = Object.freeze({
  getState: () => state,
  getScore: () => score,
  getHi: () => hiScore,
  getDinoState: () => dino.state,
  isLeaderboardConfigured: isConfigured,
});
