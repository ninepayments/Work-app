# 나인패스(전자결재) 연동 — 설정과 확인

## 바꾼 파일
| 파일 | 하는 일 |
|---|---|
| `functions/index.js` | 서버 기능 `npGo`(1회용 자동 로그인 주소 만들기), `npPending`(결재 대기 수, 15초 기억·5초 제한) |
| `functions/.env.example` | 설정값 이름만 적은 예시 (실제 값은 GitHub 비밀값에) |
| `.github/workflows/functions.yml` | 서버 함수 배포 — GitHub 비밀값을 Firebase 비밀값으로 옮겨 넣고 배포 |
| `web/app.js`, `web/style.css`, `web/ninepass-logo-64.png` | PC 위쪽 메뉴 ‘메모’ 오른쪽 (로고) 나인패스 + 빨간 숫자, 휴대폰 웹은 ☰ → 회사 |
| `MainActivity.java` | 앱: 전체 → 회사 → 나인패스 + 숫자 |

직원 맞추기: 이름 = 직원 정보의 **이름**, 연락처 = **로그인 번호** + 직원 정보의 **연락처**(둘이 다르면 둘 다, 쉼표로).
나인패스의 연락처1·2 중 하나라도 같고 이름이 같아야 같은 사람으로 봐요.

## 지사장님이 할 일
1. 나인패스 관리자 → 외부 연동 → **연동 키 새로 발급** (예전 키는 화면 사진에 보였으니 꼭 새로).
2. GitHub 저장소 → Settings → Secrets and variables → Actions → **New repository secret** 으로 두 개 등록:
   - `NINEPASS_URL` = `https://approval.ninepayments.co.kr`
   - `NINEPASS_KEY` = 새로 받은 연동 키 (채팅에 붙여 넣지 말 것)
   - (AI 다듬기도 쓰려면) `GEMINI_API_KEY`
3. 저에게 "등록했어" → 서버 함수 배포를 돌립니다. (직접 하려면 Actions → Deploy server functions → Run workflow)
4. 나인패스에 직원들 이름·연락처가 나인패밀리와 같은지 확인.

## 눈으로 확인
- (가) PC 위쪽 메뉴 ‘메모’ 오른쪽에 로고 + 나인패스가 보이는지
- (나) 누르면 새 창에서 로그인 없이 나인패스가 열리는지
- (다) 열린 창의 주소를 복사해 다시 열면 막히는 게 정상(1회용)
- (라) 나인패스에서 나를 결재선에 넣은 문서를 올리면 30초 안에 빨간 숫자가 생기는지

## 안 될 때 먼저 볼 것
1. "직원 정보와 일치하지 않습니다" → 나인패스에 등록된 이름·연락처를 나인패밀리 직원 정보와 똑같이.
2. "연동 설정이 아직 안 됐어요" → GitHub 비밀값 이름(`NINEPASS_URL`·`NINEPASS_KEY`) 확인 후 서버 함수 배포 다시.
3. 숫자가 안 뜸 → 키를 다시 발급했는지(새 키를 받으면 예전 키는 바로 무효) 확인하고 비밀값 바꾼 뒤 배포 다시.

## 되돌리기(백업)
나인패스 작업 전 상태는 main 의 커밋 `4f3c6c2` 입니다. 직원 자료(Firestore)는 이 작업에서 바꾸지 않았어요.
