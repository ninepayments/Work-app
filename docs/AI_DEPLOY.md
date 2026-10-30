# AI 다듬기 서버 함수 배포 (지사장님이 직접 — 한 번만)

채팅 입력줄의 ✦ 버튼이 부르는 서버 함수(`functions/index.js` 의 `polish`)입니다.
키는 Firebase 비밀값에만 넣고, 코드·저장소·채팅에는 절대 적지 않습니다.

## 준비
1. https://console.anthropic.com → API Keys → 새 키 만들기 (결제 수단 등록 필요, 사용한 만큼 과금).
2. PC 에 Node.js 22 와 Firebase CLI 설치: `npm i -g firebase-tools` → `firebase login`.
3. 저장소 받기: `git clone https://github.com/ninepayments/Work-app.git` → `cd Work-app`.

## 키 등록 (화면에 키를 붙여 넣는 건 본인만)
```
firebase functions:secrets:set ANTHROPIC_API_KEY --project nine-family
```
물어보면 키를 붙여 넣고 Enter.

## 배포
```
cd functions && npm install && cd ..
firebase deploy --only functions --project nine-family
```
끝나면 주소가 `https://asia-northeast3-nine-family.cloudfunctions.net/polish` 로 나옵니다(앱·웹은 이 주소를 씁니다).

## 확인
- 웹·앱 채팅방에서 글을 쓰고 ✦ → '다듬은 글'이 뜨면 성공.
- 직원 한 명당 하루 100번까지(`DAY_LIMIT`). 사용 기록은 Firestore `aiuse` 컬렉션(서버만 읽고 씀).
- 키를 바꿀 때: 위 `secrets:set` 을 다시 하고 `firebase deploy --only functions` 다시.
