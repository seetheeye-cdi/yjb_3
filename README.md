# 유정복 게임_3 — T-Rex Runner Clone

Chrome 오프라인 공룡 게임의 웹 복제판 + **글로벌 리더보드**.
HTML5 Canvas + Vanilla JS, 백엔드는 **Supabase + Vercel `/api`**. 외부 빌드 없이 `index.html` 하나로 실행됩니다.

▶ **라이브 데모**: https://yjb-3.vercel.app
세부 기획은 [`PRD.md`](./PRD.md) 참조.

---

## 빠른 시작

### 1. 로컬에서 실행

```bash
# 옵션 A: 그냥 더블클릭
open index.html

# 옵션 B: 정적 서버 (모듈 import 안전)
npx serve .          # 또는 python3 -m http.server 8080
```

브라우저에서 열면 `PRESS SPACE TO START` 화면이 뜹니다.

### 2. 조작

| 입력 | 동작 |
|---|---|
| `Space` 또는 `↑` | 점프 / 게임 시작 / 재시작 |
| `↓` (지상) | 숙이기 |
| `↓` (점프 중) | 빠른 하강 |
| 마우스 클릭 / 터치 | 점프 |

### 3. 로직 테스트

```bash
node tests/logic.test.mjs
```

---

## 프로젝트 구조

```
.
├── index.html, style.css
├── src/                       # 게임 코어 (config/dino/obstacles/world/score/collision/profanity/leaderboard/main)
├── api/submit-score.js        # Vercel 서버리스 — 검증 + Supabase 인서트 (service role)
├── supabase/
│   ├── config.toml
│   └── migrations/0001_scores.sql
├── tests/logic.test.mjs
├── vercel.json
└── PRD.md
```

---

## 백엔드: Supabase 셋업

### A. 한 번만 — 스키마 적용

```bash
# 1) 로그인 (브라우저 열림)
supabase login

# 2) 프로젝트 연결
supabase link --project-ref vbxvedsnylxwdmzybcbq

# 3) 마이그레이션 푸시
supabase db push
```

이게 `public.scores` 테이블 + RLS(읽기 공개, 쓰기 거부) + 실시간 publication 을 깔아줍니다.

### B. Vercel 환경변수 등록

Vercel 프로젝트 설정 → Environment Variables 에 두 개:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://vbxvedsnylxwdmzybcbq.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (Supabase 대시보드 → Project Settings → API → `service_role` 키 복사) |

CLI로도 가능:

```bash
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel deploy --prod --yes
```

> ⚠️ `service_role` 키는 **절대 클라이언트 코드에 두지 말 것**. RLS를 우회하므로 leak 시 임의 쓰기/읽기가 가능합니다.

### C. 클라이언트는 publishable key만 사용

`src/leaderboard.js` 상단의 `SUPABASE_PUBLISHABLE_KEY` 가 anon/publishable 키이며, 클라이언트에 그대로 노출되어도 안전합니다 (RLS가 막아줌).

---

## `/api/submit-score` 계약

**요청** (POST `application/json`):

```json
{
  "nickname": "yujungbok",
  "score": 12345,
  "durationMs": 90234,
  "inputCount": 137
}
```

**응답 (성공)**: `{ "ok": true, "id": "<uuid>" }`

**거부 사유**:

| reason | 의미 |
|---|---|
| `service-not-configured` | Vercel 환경변수 미설정 |
| `invalid-score` / `invalid-duration` / `invalid-inputs` | 형식·범위 오류 |
| `speed-too-high` | `score / duration` 이 25점/초 초과 |
| `too-few-inputs` | 1000점당 입력 수 5회 미만 |
| `nickname …` | 닉네임 길이/문자/욕설 필터 |
| `rate-limited` | 동일 IP 분당 5회 초과 |
| `db-insert-failed` / `internal-error` | 서버/DB 오류 |

검증 전략은 PRD §4.2 — 100% 방지가 아닌 **합리적 의심 필터**.

---

## 배포 (Vercel)

```bash
vercel deploy --prod --yes
```

`vercel.json` 의 `cleanUrls`, JS MIME 헤더, 보안 헤더가 적용됩니다.
`/api/submit-score.js` 는 Vercel이 자동으로 서버리스 함수로 인식.

---

## 라이선스

학습/포트폴리오 목적 단일 개발자 프로젝트.
원본 Chrome dino 게임의 저작권은 The Chromium Authors.
