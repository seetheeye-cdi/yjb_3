// Vercel serverless function: POST /api/submit-score
//
// Validates a leaderboard submission with the same "reasonable suspicion"
// filter described in PRD §4.2, then inserts into Supabase using the
// service role key (clients are denied write via RLS).
//
// Required env vars (Vercel project settings):
//   SUPABASE_URL                — https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   — service role / sb_secret_* key (NEVER ship to client)

import { createClient } from '@supabase/supabase-js';

const MAX_SCORE_PER_SECOND = 25;
const MIN_INPUTS_PER_1000_SCORE = 5;
const MAX_SCORE = 99999;
const NICK_MIN = 3;
const NICK_MAX = 12;
const RATE_LIMIT_PER_MIN = 5;

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

// In-memory rate limiter (resets per cold start). Adequate as a soft filter;
// for stronger control, swap in a Postgres-backed counter.
const ipBuckets = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const bucket = ipBuckets.get(ip) || [];
  const fresh = bucket.filter((t) => now - t < 60_000);
  fresh.push(now);
  ipBuckets.set(ip, fresh);
  return fresh.length <= RATE_LIMIT_PER_MIN;
}

function hashIp(ip) {
  let h = 0;
  for (let i = 0; i < ip.length; i++) h = (h * 31 + ip.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, reason: 'method-not-allowed' });
    return;
  }

  const supabase = getSupabase();
  if (!supabase) {
    res.status(503).json({ ok: false, reason: 'service-not-configured' });
    return;
  }

  try {
    const ip = String(
      req.headers['x-forwarded-for'] || req.socket?.remoteAddress || ''
    ).split(',')[0].trim();
    if (!checkRateLimit(ip)) {
      res.status(429).json({ ok: false, reason: 'rate-limited' });
      return;
    }

    const { nickname, score, durationMs, inputCount, sessionId } = req.body || {};

    const sc = Number(score);
    if (!Number.isFinite(sc) || sc < 0 || sc > MAX_SCORE) {
      res.status(400).json({ ok: false, reason: 'invalid-score' }); return;
    }
    const dur = Number(durationMs);
    if (!Number.isFinite(dur) || dur < 1000) {
      res.status(400).json({ ok: false, reason: 'invalid-duration' }); return;
    }
    const sps = sc / (dur / 1000);
    if (sps > MAX_SCORE_PER_SECOND) {
      res.status(400).json({ ok: false, reason: 'speed-too-high' }); return;
    }
    const inputs = Number(inputCount);
    if (!Number.isFinite(inputs)) {
      res.status(400).json({ ok: false, reason: 'invalid-inputs' }); return;
    }
    if (sc >= 1000 && inputs < (sc / 1000) * MIN_INPUTS_PER_1000_SCORE) {
      res.status(400).json({ ok: false, reason: 'too-few-inputs' }); return;
    }

    const v = validateNickname(nickname);
    if (!v.ok) { res.status(400).json({ ok: false, reason: v.reason }); return; }

    const { data, error } = await supabase
      .from('scores')
      .insert({
        nickname: v.value,
        score: Math.floor(sc),
        duration_ms: Math.floor(dur),
        input_count: Math.floor(inputs),
        session_id: sessionId ? String(sessionId).slice(0, 64) : null,
        ip_hash: hashIp(ip),
      })
      .select('id')
      .single();

    if (error) {
      console.error('supabase insert error:', error);
      res.status(500).json({ ok: false, reason: 'db-insert-failed', detail: error.message });
      return;
    }
    res.status(200).json({ ok: true, id: data.id });
  } catch (e) {
    console.error('submit-score failed:', e);
    res.status(500).json({ ok: false, reason: 'internal-error' });
  }
}
