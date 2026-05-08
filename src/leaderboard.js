// Firebase global leaderboard module.
// All Firebase IO is gated behind isConfigured() so the game still runs
// (in local-only mode) when the developer has not set their own config.

import { CONFIG } from './config.js';

// ---- Configuration ------------------------------------------------------
// Replace these placeholders with your real Firebase project config to
// enable the global leaderboard. See README.md for setup steps.
export const FIREBASE_CONFIG = {
  apiKey: 'TODO_FIREBASE_API_KEY',
  authDomain: 'TODO.firebaseapp.com',
  projectId: 'TODO_PROJECT_ID',
  storageBucket: 'TODO.appspot.com',
  messagingSenderId: 'TODO',
  appId: 'TODO',
};

// Cloud Function endpoint (HTTPS callable or rewrite). Set to a real URL
// (e.g. https://us-central1-<project>.cloudfunctions.net/submitScore) to
// enable server-side validation.
export const SUBMIT_SCORE_URL = 'TODO_SUBMIT_SCORE_FUNCTION_URL';

const SDK_BASE = 'https://www.gstatic.com/firebasejs/10.12.4';

let _firebase = null; // lazily-initialized handle
let _initPromise = null;

export function isConfigured() {
  return (
    !FIREBASE_CONFIG.apiKey.startsWith('TODO') &&
    !FIREBASE_CONFIG.projectId.startsWith('TODO')
  );
}

export function isSubmitConfigured() {
  return !SUBMIT_SCORE_URL.startsWith('TODO');
}

async function ensureInitialized() {
  if (!isConfigured()) return null;
  if (_firebase) return _firebase;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    const [{ initializeApp }, authMod, firestoreMod] = await Promise.all([
      import(`${SDK_BASE}/firebase-app.js`),
      import(`${SDK_BASE}/firebase-auth.js`),
      import(`${SDK_BASE}/firebase-firestore.js`),
    ]);
    const app = initializeApp(FIREBASE_CONFIG);
    const auth = authMod.getAuth(app);
    const db = firestoreMod.getFirestore(app);
    // Anonymous sign-in (best-effort)
    try {
      await authMod.signInAnonymously(auth);
    } catch (e) {
      console.warn('[leaderboard] anonymous auth failed:', e?.message || e);
    }
    _firebase = { app, auth, db, authMod, firestoreMod };
    return _firebase;
  })();

  try {
    return await _initPromise;
  } catch (e) {
    console.warn('[leaderboard] init failed:', e?.message || e);
    _initPromise = null;
    return null;
  }
}

// ---- Public API ---------------------------------------------------------

/**
 * Submit a score via the Cloud Function endpoint. Falls back to a no-op
 * resolved Promise when not configured.
 *
 * @param {{nickname:string, score:number, durationMs:number, inputCount:number}} payload
 * @returns {Promise<{ok:boolean, reason?:string, rank?:number}>}
 */
export async function submitScore(payload) {
  if (!isSubmitConfigured()) {
    return { ok: false, reason: 'leaderboard-offline' };
  }
  try {
    const fb = await ensureInitialized();
    const idToken = fb?.auth?.currentUser
      ? await fb.auth.currentUser.getIdToken()
      : null;
    const headers = { 'Content-Type': 'application/json' };
    if (idToken) headers['Authorization'] = `Bearer ${idToken}`;

    const res = await fetch(SUBMIT_SCORE_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, reason: `http-${res.status}`, message: text };
    }
    const data = await res.json().catch(() => ({}));
    return { ok: true, ...data };
  } catch (e) {
    return { ok: false, reason: e?.message || 'submit-failed' };
  }
}

/**
 * Subscribe to the realtime top-N leaderboard.
 * @param {number} limitN
 * @param {(rows: Array) => void} callback
 * @returns {() => void} unsubscribe
 */
export function subscribeTopScores(limitN, callback) {
  if (!isConfigured()) {
    callback({ ok: false, reason: 'not-configured', rows: [] });
    return () => {};
  }

  let unsub = () => {};
  let cancelled = false;
  ensureInitialized().then((fb) => {
    if (!fb || cancelled) {
      callback({ ok: false, reason: 'init-failed', rows: [] });
      return;
    }
    const { db, firestoreMod } = fb;
    const { collection, query, orderBy, limit, onSnapshot } = firestoreMod;
    const q = query(
      collection(db, 'scores'),
      orderBy('score', 'desc'),
      orderBy('createdAt', 'asc'),
      limit(limitN),
    );
    unsub = onSnapshot(
      q,
      (snap) => {
        const rows = [];
        snap.forEach((doc) => {
          const d = doc.data();
          rows.push({
            id: doc.id,
            nickname: d.nickname || 'anon',
            score: Number(d.score) || 0,
            createdAt: d.createdAt?.toMillis ? d.createdAt.toMillis() : Date.now(),
            uid: d.uid || null,
          });
        });
        callback({ ok: true, rows });
      },
      (err) => {
        callback({ ok: false, reason: err?.code || 'listen-failed', rows: [] });
      },
    );
  });

  return () => {
    cancelled = true;
    try { unsub(); } catch {}
  };
}

/**
 * Returns my rank among all scores. Cheap rank by counting docs with
 * higher score (acceptable up to a few thousand entries — matches the PRD
 * Spark Plan target of ≈1k DAU).
 */
export async function fetchMyRank(myScore) {
  if (!isConfigured()) return { ok: false, reason: 'not-configured' };
  try {
    const fb = await ensureInitialized();
    if (!fb) return { ok: false, reason: 'init-failed' };
    const { db, firestoreMod } = fb;
    const { collection, query, where, getCountFromServer, getDocs } = firestoreMod;
    const aboveQ = query(collection(db, 'scores'), where('score', '>', myScore));
    const totalQ = collection(db, 'scores');
    const [aboveSnap, totalSnap] = await Promise.all([
      getCountFromServer(aboveQ),
      getCountFromServer(totalQ),
    ]).catch(async () => {
      // Fallback for SDKs without count aggregations: a (best-effort) plain read.
      const all = await getDocs(totalQ);
      let above = 0;
      all.forEach((d) => { if ((d.data().score || 0) > myScore) above++; });
      return [{ data: () => ({ count: above }) }, { data: () => ({ count: all.size }) }];
    });
    const rank = (aboveSnap.data().count || 0) + 1;
    const total = totalSnap.data().count || 0;
    return { ok: true, rank, total };
  } catch (e) {
    return { ok: false, reason: e?.message || 'rank-failed' };
  }
}

export function isNewBadge(createdAtMs) {
  if (!createdAtMs) return false;
  return Date.now() - createdAtMs < CONFIG.LEADERBOARD.NEW_BADGE_MS;
}
