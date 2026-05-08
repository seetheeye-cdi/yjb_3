// Supabase global leaderboard module.
//
// Reads happen client-side via the publishable (anon) key; writes go through
// the Vercel serverless function /api/submit-score, which uses the service
// role key (server-only).

import { CONFIG } from './config.js';

// ---- Configuration ------------------------------------------------------
// Publishable / anon key — safe to embed in client bundles. RLS on the
// `scores` table prevents this key from writing.
export const SUPABASE_URL = 'https://vbxvedsnylxwdmzybcbq.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_i89A1_q_C3t0kQkcfas0Sw_PS3FEXhf';

// Submission endpoint — Vercel serverless function (relative path keeps it
// on the same origin → no CORS preflight).
export const SUBMIT_SCORE_URL = '/api/submit-score';

const ESM_BASE = 'https://esm.sh/@supabase/supabase-js@2.45.4';
let _client = null;
let _initPromise = null;
let _sessionId = null;

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function isSubmitConfigured() {
  return Boolean(SUBMIT_SCORE_URL);
}

async function ensureClient() {
  if (_client) return _client;
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const mod = await import(ESM_BASE);
    const client = mod.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      realtime: { params: { eventsPerSecond: 5 } },
    });
    // Anonymous sign-in is best-effort; insertions go through /api anyway.
    try {
      const { data } = await client.auth.signInAnonymously();
      _sessionId = data?.user?.id || null;
    } catch (e) {
      // Project may not have anonymous sign-in enabled — that's fine.
    }
    _client = client;
    return client;
  })();
  try { return await _initPromise; }
  catch (e) {
    console.warn('[leaderboard] init failed:', e?.message || e);
    _initPromise = null;
    return null;
  }
}

export async function submitScore(payload) {
  if (!isSubmitConfigured()) return { ok: false, reason: 'leaderboard-offline' };
  try {
    const res = await fetch(SUBMIT_SCORE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, sessionId: _sessionId }),
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) {
      return { ok: false, reason: data.reason || `http-${res.status}`, message: data.detail };
    }
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, reason: e?.message || 'submit-failed' };
  }
}

/**
 * Subscribe to top-N scores in realtime.
 * Combines an initial fetch + a postgres_changes channel listener.
 *
 * @param {number} limitN
 * @param {(snap:{ok:boolean, rows?:Array, reason?:string}) => void} cb
 * @returns {() => void} unsubscribe
 */
export function subscribeTopScores(limitN, cb) {
  if (!isConfigured()) {
    cb({ ok: false, reason: 'not-configured', rows: [] });
    return () => {};
  }
  let cancelled = false;
  let channel = null;

  ensureClient().then(async (client) => {
    if (!client || cancelled) {
      cb({ ok: false, reason: 'init-failed', rows: [] });
      return;
    }
    const refresh = async () => {
      const { data, error } = await client
        .from('scores')
        .select('id, nickname, score, created_at')
        .order('score', { ascending: false })
        .order('created_at', { ascending: true })
        .limit(limitN);
      if (cancelled) return;
      if (error) {
        cb({ ok: false, reason: error.code || 'fetch-failed', rows: [] });
        return;
      }
      const rows = (data || []).map((r) => ({
        id: r.id,
        nickname: r.nickname,
        score: Number(r.score) || 0,
        createdAt: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
      }));
      cb({ ok: true, rows });
    };

    await refresh();
    channel = client
      .channel('public:scores:top')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scores' },
        () => { refresh(); })
      .subscribe();
  });

  return () => {
    cancelled = true;
    if (channel) { try { channel.unsubscribe(); } catch {} }
  };
}

export async function fetchMyRank(myScore) {
  if (!isConfigured()) return { ok: false, reason: 'not-configured' };
  try {
    const client = await ensureClient();
    if (!client) return { ok: false, reason: 'init-failed' };
    const [{ count: above, error: e1 }, { count: total, error: e2 }] = await Promise.all([
      client.from('scores').select('id', { count: 'exact', head: true })
        .gt('score', Math.floor(myScore)),
      client.from('scores').select('id', { count: 'exact', head: true }),
    ]);
    if (e1 || e2) return { ok: false, reason: (e1 || e2).code || 'rank-failed' };
    return { ok: true, rank: (above || 0) + 1, total: total || 0 };
  } catch (e) {
    return { ok: false, reason: e?.message || 'rank-failed' };
  }
}

export function isNewBadge(createdAtMs) {
  if (!createdAtMs) return false;
  return Date.now() - createdAtMs < CONFIG.LEADERBOARD.NEW_BADGE_MS;
}
