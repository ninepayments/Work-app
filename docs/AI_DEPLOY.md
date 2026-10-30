# AI 다듬기 서버 함수 배포 (지사장님이 직접 — 한 번만)

채팅 입력줄의 ✦ 버튼이 부르는 서버 함수(`functions/index.js` 의 `polish`)입니다. **구글 Gemini 무료 등급**을 씁니다.
키는 Firebase 비밀값에만 넣고, 코드·저장소·채팅에는 절대 적지 않습니다.

> 주의: Gemini 무료 등급은 구글이 보낸 글을 서비스 개선에 쓸 수 있어요. 가맹점 주민번호·카드번호 같은 개인정보가 든 글은 다듬지 마세요.
> 하루 무료 횟수를 넘기면 "무료 사용량이 잠시 꽉 찼어요"가 뜨고, 다음 날 다시 돼요(요금은 나가지 않아요).

## 준비
1. https://aistudio.google.com → 구글 계정으로 로그인 → **Get API key → Create API key** (결제 등록 필요 없음).
2. PC 에 Node.js 22 와 Firebase CLI 설치: `npm i -g firebase-tools` → `firebase login`.
3. 저장소 받기: `git clone https://github.com/ninepayments/Work-app.git` → `cd Work-app`.

## 키 등록 (화면에 키를 붙여 넣는 건 본인만)
```
firebase functions:secrets:set GEMINI_API_KEY --project nine-family
```
물어보면 키를 붙여 넣고 Enter.

## 배포
```
cd functions && npm install && cd ..
firebase deploy --only functions --project nine-family
```
끝나면 주소가 `https://asia-northeast3-nine-family.cloudfunctions.net/polish` 로 나옵니다(앱·웹은 이 주소를 씁니다).
(Cloud Functions 자체는 Blaze 요금제의 무료 사용량 안에서 돌아요 — 직원 10명이 쓰는 정도면 0원.)

## 확인
- 웹·앱 채팅방에서 글을 쓰고 ✦ → '다듬은 글'이 뜨면 성공.
- 직원 한 명당 하루 100번까지(`DAY_LIMIT`). 사용 기록은 Firestore `aiuse` 컬렉션(서버만 읽고 씀).
- 구글이 모델 이름을 바꿔서 "AI 모델을 찾지 못했어요"가 뜨면: `functions/index.js` 의 `MODELS` 목록에 새 모델 이름을 넣고 다시 배포.
