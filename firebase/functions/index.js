/**
 * Cloud Function: submitScore
 *
 * Validates a leaderboard submission and writes it to Firestore using the
 * Admin SDK. Client writes are blocked by Firestore rules; this function is
 * the only path to /scores.
 *
 * Validation strategy is documented in PRD.md §4.2 — "reasonable suspicion"
 * filter rather than 100% prevention.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// ---- Tunables (mirror src/config.js + PRD §4.2) -------------------------
const MAX_SCORE_PER_SECOND = 25;   // theoretical ceiling
const MIN_INPUTS_PER_1000_SCORE = 5;
const MAX_SCORE = 99999;
const NICK_MIN = 3;
const NICK_MAX = 12;
const RATE_LIMIT_PER_MIN = 5;       // submissions per IP per minute

// Profanity blocklist mirrors src/profanity.js
const BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick',
  'pussy', 'fag', 'nigger', 'nigga', 'retard', 'whore', 'slut',
  'admin', 'system', 'null', 'undefined',
  'ㅅㅂ', '시발', '씨발', '병신', '개새', '좆', '존나', '꺼져',
];

function isProfane(s) {
  const lower = String(s || '').toLowerCase().normalize('NFKC');
  return BLOCKLIST.some((bad) => lower.includes(bad));
}

function validateNickname(nick) {
  const v = String(nick || '').trim();
  if (v.length < NICK_MIN || v.length > NICK_MAX) {
    return { ok: false, reason: `nickname must be ${NICK_MIN}-${NICK_MAX} chars` };
  }
  if (!/^[\p{L}\p{N}_\-. ]+$/u.test(v)) {
    return { ok: false, reason: 'nickname contains disallowed characters' };
  }
  if (isProfane(v)) {
    return { ok: false, reason: 'nickname blocked by content filter' };
  }
  return { ok: true, value: v };
}

// In-memory rate limiter — resets on cold start. Adequate as a soft filter;
// for stronger control, swap in Firestore-based counters.
const ipBuckets = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const bucket = ipBuckets.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < windowMs);
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  return fresh.length <= RATE_LIMIT_PER_MIN;
}

function setCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

exports.submitScore = functions.https.onRequest(async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, reason: 'method-not-allowed' }); return; }

  try {
    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString().split(',')[0].trim();
    if (!checkRateLimit(ip)) {
      res.status(429).json({ ok: false, reason: 'rate-limited' });
      return;
    }

    const { nickname, score, durationMs, inputCount } = req.body || {};

    // Auth verification (anonymous tokens are accepted)
    let uid = null;
    const authz = req.headers.authorization || '';
    if (authz.startsWith('Bearer ')) {
      try {
        const decoded = await admin.auth().verifyIdToken(authz.slice(7));
        uid = decoded.uid;
      } catch (e) {
        res.status(401).json({ ok: false, reason: 'invalid-token' });
        return;
      }
    } else {
      // Require auth for stronger anti-abuse
      res.status(401).json({ ok: false, reason: 'auth-required' });
      return;
    }

    // Score validity
    const sc = Number(score);
    if (!Number.isFinite(sc) || sc < 0 || sc > MAX_SCORE) {
      res.status(400).json({ ok: false, reason: 'invalid-score' });
      return;
    }

    const dur = Number(durationMs);
    if (!Number.isFinite(dur) || dur < 1000) {
      res.status(400).json({ ok: false, reason: 'invalid-duration' });
      return;
    }
    const sps = sc / (dur / 1000);
    if (sps > MAX_SCORE_PER_SECOND) {
      res.status(400).json({ ok: false, reason: 'speed-too-high' });
      return;
    }

    const inputs = Number(inputCount);
    if (!Number.isFinite(inputs)) {
      res.status(400).json({ ok: false, reason: 'invalid-inputs' });
      return;
    }
    if (sc >= 1000 && inputs < (sc / 1000) * MIN_INPUTS_PER_1000_SCORE) {
      res.status(400).json({ ok: false, reason: 'too-few-inputs' });
      return;
    }

    const v = validateNickname(nickname);
    if (!v.ok) { res.status(400).json({ ok: false, reason: v.reason }); return; }

    const doc = {
      nickname: v.value,
      score: Math.floor(sc),
      durationMs: Math.floor(dur),
      inputCount: Math.floor(inputs),
      uid,
      ipHash: hashIp(ip),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const ref = await db.collection('scores').add(doc);
    res.status(200).json({ ok: true, id: ref.id });
  } catch (e) {
    console.error('submitScore failed:', e);
    res.status(500).json({ ok: false, reason: 'internal-error' });
  }
});

function hashIp(ip) {
  // Lightweight non-cryptographic hash; enough to dedupe without storing PII.
  let h = 0;
  for (let i = 0; i < ip.length; i++) {
    h = (h * 31 + ip.charCodeAt(i)) | 0;
  }
  return String(h >>> 0);
}
