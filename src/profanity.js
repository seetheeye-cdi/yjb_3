// Minimal profanity filter — defense in depth, not a safety guarantee.
// The same list is referenced in firebase/functions/index.js for parity.

const BLOCKLIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'dick',
  'pussy', 'fag', 'nigger', 'nigga', 'retard', 'whore', 'slut',
  'admin', 'system', 'null', 'undefined',
  'ㅅㅂ', '시발', '씨발', '병신', '개새', '좆', '존나', '꺼져',
];

export function isProfane(input) {
  if (!input) return false;
  const lower = input.toLowerCase().normalize('NFKC');
  return BLOCKLIST.some((bad) => lower.includes(bad));
}

export function validateNickname(input) {
  const nick = String(input || '').trim();
  if (nick.length < 3 || nick.length > 12) {
    return { ok: false, reason: '닉네임은 3-12자여야 해요.' };
  }
  // Allow letters, digits, hangul, common symbols
  if (!/^[\p{L}\p{N}_\-. ]+$/u.test(nick)) {
    return { ok: false, reason: '사용할 수 없는 문자가 포함되어 있어요.' };
  }
  if (isProfane(nick)) {
    return { ok: false, reason: '부적절한 단어가 포함되어 있어요.' };
  }
  return { ok: true, value: nick };
}
