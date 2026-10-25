# 나인패밀리 — 작업 규칙

**작업을 시작하기 전에 이 파일과 `DECISIONS.md` 를 먼저 읽는다.** 결정이 새로 생기거나 바뀌면 `DECISIONS.md` 맨 아래에 한 줄씩 추가한다(지우지 않고, 바뀐 결정은 새 줄에 "← 이전 결정 대체"로 적는다).
자세한 내력·구현 메모는 `HANDOFF.md`, 기능 목록은 `FEATURES.md`, 할 일은 `BACKLOG.md`·`ROADMAP.md`, 버전 규칙은 `VERSIONING.md`.

## 사용자
- 양문희 지사장 ((주)나인페이먼츠). 이 앱은 **본사** 사내 앱(지사용 아님), 직원 약 10명, 무료로 운영.
- 답은 **한국어로 짧게**. "너가 다 진행해" 방식 — 결정이 필요한 것만 묻는다.
- 배포가 끝나면 항상 **APK 받기 링크**와 **웹 주소**를 알려 준다.

## 지켜야 할 값 (바꾸지 말 것)
| 항목 | 값 |
|---|---|
| Firebase 프로젝트 ID | `nine-family` (Spark 무료 요금제) |
| Firebase 안드로이드 앱 ID | `1:48232341344:android:1f92f90d8572379ba34805` (`Cloud.java`) |
| 안드로이드 패키지명(applicationId·namespace) | `kr.todanjeon.workapp` |
| 앱 서명 | `app/debug.keystore` 고정 (SHA-1 `8F:F0:BE:53:90:51:33:D2:5A:58:ED:82:00:B7:87:5C:13:D4:41:F6`). 바꾸면 기존 설치 폰에서 업데이트가 실패한다 |
| 저장소 | `ninepayments/Work-app` (공개 저장소), 기본 브랜치 `main` 에 바로 푸시 |
| 웹 주소 | `https://ninepayments.github.io/Work-app/` (GitHub Pages, Actions 배포) |
| APK 받기 | `https://github.com/ninepayments/Work-app/releases/download/v<버전>-test/WorkApp_v<버전>.apk` |
| PC 설치 파일 | `https://github.com/ninepayments/Work-app/releases/latest/download/NineFamily-Setup.exe` |
| 보안 규칙 | `firestore.rules` (콘솔 게시는 사용자가 직접) |

## 데이터 구조 (Firestore)
- 문서 형식: `{j: JSON 문자열, u: 시각}` (+ 서버 규칙용 필드: 비공개 대화 `mem`, 계약·보고 `who`, 프로필 `who`). 웹은 `ser()` 로 같은 모양을 쓴다.
- 일반 컬렉션(앱 `Store.COLLS` = 웹 `COLLS`): `users, tasks, notices, projects, contracts, events, merchants, stock, rooms, msgs, reports, profiles, costs, contacts, deposits, library, mlogs, config`
- 그 밖: `phones/{+8210…}`(로그인 허용·권한: uid, active, admin, perf, report), `prooms`·`pmsgs`(1:1 비공개, 참가자 번호 `mem`), `blobs`(사진·파일 600KB 조각), `audit`(모든 변경 기록, 관리자만 읽기).
- **삭제는 항상 소프트 삭제**(`deleted: true`). 서버 규칙이 실제 삭제를 막는다.
- 저장된 값은 화면 글을 바꿔도 그대로 둔다: 업무 status `지시됨`(화면엔 '미확인'), stock status `설치완료`+`gone`(엑셀로 올린 가맹점 설치 장비는 gone `기존 설치`+merchant), profiles `memos`(PC 메모), config key `merchant_lock`·`req_quick`·`products`(상품 목록 {items:[{code,name}]}), 재고·요청 품목의 `model`(상품명)+`code`(상품코드).
- 기기 설정 키 — 앱 prefs `workapp`: `voice`(업무 소리), `voiceChat`(채팅 소리), `bgNotify`(화면 꺼짐 알림), `session`. 채팅방 음소거 prefs `chatprefs` `mute_<내id>_<방id>`. 웹 localStorage: `snd_<uid>`, `sndc_<uid>`, `mute_<uid>`.

## 수정할 때 꼭 (사용자 지시: "항상 수정 전에 기존 코드 기억하고 수정")
1. **고치기 전에 읽는다**: 바꿀 함수와 그 함수를 부르는 곳, 같은 자료를 쓰는 곳을 grep 으로 다 찾아 읽고 지금 무엇을 하는지 먼저 정리한다.
2. **기존 동작은 그대로**: 요청받은 부분만 바꾼다. 없앤 메뉴·기능은 다른 곳으로 옮겨졌는지 확인한다.
3. **웹 ↔ 앱 같이**: 웹(`web/app.js`)에 넣은 기능은 안드로이드(`MainActivity.java`)에도 같은 방식으로 넣는다(반대도).
4. **고친 뒤 점검**: `node tools/smoke/web-smoke.js`(웹 모든 화면 오류 점검 — 웹 배포 때 CI 도 돌림, 실패하면 배포 안 됨), 바꾼 기능은 데모(`#demo`)로 직접 눌러 본다. 앱은 CI 빌드 성공과 릴리스 업로드를 확인한다.
5. **배포마다**: 웹 `VERSION` +1 · `WEB_CHANGES` · `WEB_MANUAL` / 앱 `versionName`·`versionCode` +1 · `CHANGELOG`(없으면 CI 실패) · `MANUAL` / `RELEASE_NOTES.md`. 버전은 끝자리 1씩(`VERSIONING.md`), versionCode 는 절대 줄이지 않는다.

## 보안·비밀
- **로그인 테스트 번호·인증번호는 저장소·채팅 어디에도 적지 않는다.**
- 비밀번호·인증번호 입력, 보안 규칙 게시, GitHub 비밀값(`FIREBASE_SERVICE_ACCOUNT`, `BACKUP_PASSWORD`) 등록은 사용자가 직접.
- 공개 저장소이므로 백업은 반드시 암호화(`backup.yml`).

## 화면·코드 습관
- 입력칸 있는 팝업: 앱은 `Dlg`(바깥 터치로 안 닫힘), 웹은 `formModal`.
- 한글 검색은 초성 포함(앱 `Kor.match`, 웹 `kmatch`). 웹은 한글 조합 중에 다시 그리지 않는다.
- 안 본 개수는 빨간 동그라미 숫자(앱 `Ui.dot`, 웹 `.badge`).
- 이미지에 방사형 햇살 무늬 금지(욱일기 연상).
