# 유정복 게임_3 — T-Rex Runner Clone

Chrome 오프라인 공룡 게임의 웹 복제판 + **글로벌 리더보드**.
HTML5 Canvas + Vanilla JS + Firebase Firestore. 외부 빌드 없이 `index.html` 하나로 실행됩니다.

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
| `↓` (점프 중) | 빠른 하강 (variable jump height) |
| 마우스 클릭 / 터치 | 점프 |

### 3. 로직 테스트 (선택)

프레임워크 없이 `node`만으로 도는 자그마한 단위 테스트:

```bash
node tests/logic.test.mjs
```

---

## 프로젝트 구조

```
.
├── index.html              # 진입점 (canvas + leaderboard panel)
├── style.css
├── src/
│   ├── main.js             # 게임 루프, 입력, UI 바인딩
│   ├── config.js           # 모든 튜닝값 (PRD §5)
│   ├── dino.js             # Dino 클래스 (점프/숙이기/그리기)
│   ├── obstacles.js        # Cactus, Pterodactyl, Spawner
│   ├── world.js            # 배경, 낮/밤 블렌딩, 별/달
│   ├── collision.js        # AABB
│   ├── score.js            # 점수, 하이스코어(localStorage), 낮/밤 곡선
│   ├── profanity.js        # 닉네임 검증 + 블록리스트
│   └── leaderboard.js      # Firebase Firestore 통합
├── firebase/
│   ├── firestore.rules     # 읽기 공개, 쓰기는 CF 전용
│   └── functions/
│       ├── index.js        # submitScore — 서버 검증, 부정행위 필터
│       └── package.json
├── firebase.json           # Hosting + Functions + Firestore 설정
├── tests/logic.test.mjs    # node로 도는 로직 테스트
└── PRD.md
```

---

## Firebase 글로벌 리더보드 활성화

Firebase 설정이 비어 있을 때(`TODO_*`) 게임은 **로컬 모드**로 정상 동작하며, 리더보드 패널만 “Leaderboard offline”으로 표시됩니다.
글로벌 리더보드를 켜려면:

1. [Firebase Console](https://console.firebase.google.com/) 에서 프로젝트 생성 (Spark 무료 플랜으로 충분).
2. Authentication → Anonymous 활성화.
3. Firestore Database 생성 (Native mode).
4. `src/leaderboard.js` 의 `FIREBASE_CONFIG` 객체와 `SUBMIT_SCORE_URL` 을 자기 프로젝트 값으로 교체:

   ```js
   export const FIREBASE_CONFIG = {
     apiKey: '...',
     authDomain: '<project>.firebaseapp.com',
     projectId: '<project>',
     storageBucket: '<project>.appspot.com',
     messagingSenderId: '...',
     appId: '...',
   };
   export const SUBMIT_SCORE_URL =
     'https://us-central1-<project>.cloudfunctions.net/submitScore';
   ```

5. 보안 규칙과 Cloud Function 배포:

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use --add        # 프로젝트 선택
   cd firebase/functions && npm install && cd ../..
   firebase deploy --only firestore:rules,functions
   ```

6. (옵션) Hosting 까지 같이 배포:

   ```bash
   firebase deploy --only hosting
   ```

---

## Cloud Function — `submitScore` 계약

요청 (POST `application/json`, `Authorization: Bearer <Firebase ID token>`):

```json
{
  "nickname": "yujungbok",
  "score": 12345,
  "durationMs": 90234,
  "inputCount": 137
}
```

응답 (성공):

```json
{ "ok": true, "id": "<firestore-doc-id>" }
```

응답 (실패) 예시:

```json
{ "ok": false, "reason": "speed-too-high" }
```

서버가 거부하는 케이스(요약):

| reason | 의미 |
|---|---|
| `auth-required` / `invalid-token` | Firebase ID token 누락/위조 |
| `invalid-score` / `invalid-duration` / `invalid-inputs` | 형식·범위 오류 |
| `speed-too-high` | `score / duration` 이 25점/초 초과 |
| `too-few-inputs` | 1000점당 입력 수 5회 미만 |
| `nickname …` | 닉네임 길이/문자/욕설 필터 위반 |
| `rate-limited` | 동일 IP 분당 5회 초과 |
| `internal-error` | 알 수 없는 서버 오류 |

검증 전략의 근거는 PRD §4.2 — 100% 방지가 아니라 **합리적 의심 필터**.

---

## 배포 (Firebase Hosting)

```bash
firebase deploy --only hosting
```

`firebase.json` 의 `rewrites` 가 `/api/submitScore` 를 Cloud Function 으로 라우팅하므로,
원한다면 `SUBMIT_SCORE_URL` 을 동일 도메인의 `/api/submitScore` 로 잡아 CORS preflight 를 줄일 수 있습니다.

---

## 라이선스

이 저장소는 학습/포트폴리오 목적의 단일 개발자 프로젝트입니다.
원본 Chrome dino 게임 자체의 저작권은 The Chromium Authors 에게 있습니다.
