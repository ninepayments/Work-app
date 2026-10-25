# 나인패밀리 인수인계 (새 작업 세션용)

> 먼저 `CLAUDE.md`(규칙·지켜야 할 값)와 `DECISIONS.md`(합의한 결정)를 읽는다. 이 파일은 자세한 내력·구현 메모. 둘이 다르면 DECISIONS.md 가 우선.

사용자: 양문희 지사장((주)나인페이먼츠). (주)나인페이먼츠 본사 사내 앱(지사용 아님). 직원 약 10명이 쓰는 무료 앱. 답변은 한국어, 짧게. "너가 다 진행해" 방식 (Firebase·GitHub 설정도 크롬으로 직접 진행, 단 비밀번호·인증번호·보안 규칙 게시 버튼은 사용자가 직접).

## 구성
- 안드로이드 앱: 순수 Java, 코드로 UI 구성 (`app/`), minSdk 26 / targetSdk 34. 거의 전부 `MainActivity.java`.
- 웹앱(PWA): `web/` (바닐라 JS, Firebase compat SDK). PC 설치형 + 아이폰 홈 화면 추가. GitHub Pages 배포(`.github/workflows/web.yml`). 웹 버전은 `web/app.js` 의 `VERSION`, 웹 변경 내역·사용설명서는 같은 파일의 `WEB_CHANGES`·`WEB_MANUAL`.
- 웹 화면 구성(웹 0.0.3~): 폭 900px 미만(아이폰)은 안드로이드 앱과 같은 화면(아래 탭 업무·프로젝트·채팅·일정·전체, 나머지는 전체 탭). 900px 이상(PC)은 토스포스 방식(위쪽 가로줄 주 메뉴 업무·채팅·일정·가맹점·응대 기록, 왼쪽 위 ☰ = 계정·회사·일·관리자 전체 메뉴, 로고 = 홈 '오늘 현황'). 시안: claude.ai 아티팩트 '나인패밀리 웹앱 화면 시안'.
- 서버: Firebase 프로젝트 `nine-family` (Spark 요금제). Firestore + 전화번호 인증. 보안 규칙은 `firestore.rules` (콘솔에서 사용자가 게시).
- PC 프로그램: `pc/` (Electron 33, 웹앱 주소를 창으로 띄움). `.github/workflows/pc.yml` 이 windows-latest 에서 NSIS 설치 파일을 만들어 `pc-v버전` 릴리스(최신)로 올림. 받기 주소 `https://github.com/ninepayments/Work-app/releases/latest/download/NineFamily-Setup.exe` (APK 릴리스는 prerelease 라 latest 가 아님). 서명 인증서가 없어 첫 실행 때 SmartScreen 경고. 프로그램 자체를 바꿀 때만 `pc/package.json` version 을 올림.
- 빌드: `.github/workflows/build.yml` 이 main 푸시 때 APK 빌드 후 `vX-test` 시험판 릴리스에 올림 (웹 변경만이면 건너뜀).
- 저장소: `ninepayments/Work-app` (2026-10-24 huraimuni 에서 이전). 웹앱 주소 `https://ninepayments.github.io/Work-app/` (Pages Source = GitHub Actions). Firebase 로그인 허용 도메인에 `ninepayments.github.io` 추가됨.

## 데이터 구조
- `Store.java` 가 전체 DB를 JSON 으로 SharedPreferences 에 두고 Firestore 와 실시간 동기화. 문서 = `{j: JSON문자열, u: 시각}` (+ 일부 추가 필드: 비공개 대화 `mem`, 계약·보고 `who/date`, 프로필 `who`).
- 컬렉션: users, tasks, notices, projects, contracts, events, merchants, stock, rooms, msgs, reports, profiles, costs, contacts, deposits, library, mlogs, config. 삭제는 항상 소프트 삭제, 변경 기록(audit) 별도 저장.
- 1:1 비공개 대화는 prooms/pmsgs (참가자 번호 `mem`), DM id = 1500000000 + ((lo*1000003+hi) % 400000000).
- 웹앱은 같은 문서 형식(`ser()` 로 org.json 모양 직렬화), `#demo` 주소 뒤에 붙이면 가짜 데이터 데모 모드.

## 지켜야 할 규칙
- 배포마다: 버전(앱 `app/build.gradle` versionName·versionCode, 웹 `web/app.js` VERSION), 앱 안 사용설명서(MANUAL)·업데이트 내역(CHANGELOG), `RELEASE_NOTES.md` 갱신. 화면에 버전 표시. 버전은 0.0.1 에서 시작해 끝자리 1씩 (VERSIONING.md).
- 입력칸 있는 팝업은 `Dlg` (바깥 터치로 안 닫힘, `Ui.warn` 으로 확인 거부).
- 전체 메뉴 구역 순서: 계정 → 회사 → 일 → 관리자.
- 한글 검색은 초성 포함(`Kor.match` / 웹 `kmatch`). 웹에서 한글 입력 조합 중에는 다시 그리지 않음 (compositionstart/end 는 `addEventListener` 로 걸 것).
- 이미지 만들 때 방사형 햇살 무늬 금지(욱일기 연상).

## 지금까지 된 것 (v0.0.2 기준)
- 앱: 업무·프로젝트·채팅(1:1·그룹·반응·답장·스티커·사진·파일)·일정(한국 달력)·가맹점·재고(바코드)·계약·단체 문자·실적·보고·자료실·공지·직원/권한·백업.
- 가맹점: 상호/사업자번호/전화/휴대폰/이메일/주소/VAN사/계약구분(임대 월 CMS·판매 금액)/추가 조건/메모. 수정은 '가맹점 등록·수정' 권한(관리자 포함) + 관리자가 정한 암호(해시, `config` 문서, 5분 동안 재입력 없음). 암호는 화면 잠금이며 서버 규칙이 강제하지는 않음.
- 응대 기록: 가맹점 찾기(상호·초성·사업자번호) → 기록 조회·추가·수정(요청사항/처리결과, 종류 방문A/S·원격A/S·전화응대·기타, 수정자 기록).
- 웹앱(웹 0.0.4): 업무·프로젝트·채팅·일정·가맹점(목록·PC 표·등록·수정·삭제)·응대 기록·공지·사용설명서·버전 내역 + 재고·계약 관리·신규 계약·입금 확인. 전체 메뉴 항목·순서는 앱과 같고, 아직 웹에 없는 기능은 '앱에서' 표시 후 안내만.
- 웹 재고·계약은 앱과 같은 자료 형식(stock/contracts/costs/deposits, 출고는 앱 Store.takeStock 과 같은 방식). 단가(costs)는 실적 권한자만 받고, 계약은 실적 권한이 없으면 who==내 번호로만 받음(서버 규칙과 같음).
- 바코드(웹): PC는 USB·블루투스 스캐너(키보드 입력+Enter), 휴대폰은 카메라 — BarcodeDetector 가 없으면 `web/vendor/zxing-0.21.3.min.js`(@zxing/library, MIT)를 그때 불러옴.
- 웹 0.0.5 사용성: 뒤로가기(history 한 칸을 걸어 두고 popstate 때 한 단계씩 닫음), Firestore enablePersistence(기기 보관), 열어 둔 동안 알림(소리·진동·PC 브라우저 Notification·탭 제목 숫자), 채팅 사진·파일 보기·보내기(앱과 같은 blobs 600KB 조각), 채팅 읽음 위치를 내 profiles 문서의 rd{방:시각}에 저장해 웹 기기끼리 맞춤(안드로이드 앱은 아직 기기별), 공휴일(Holidays.java 와 같은 목록), 확인 창 askConfirm.
- 한글 검색(웹): 자모 단위 비교라 치는 중인 글자('사', '삼영ㅍ')도 걸림, 초성·번호(- 없이) 지원. 검색칸은 다시 그리지 않고 결과(`.qres`)만 바꿔서 IME 조합 중에도 바로 걸러짐.

## 웹앱 목표: 안드로이드 앱과 기능 동일 (사용자 요청, 웹만 먼저)
- 이번 방침: 아이폰용 네이티브 앱은 만들지 않고 웹앱을 채운다(나중에 필요하면 웹앱을 감싸서 출시). 안드로이드 앱은 당분간 손대지 않음.
- 진행: 웹 0.0.4~0.0.10 으로 안드로이드 앱 전체 메뉴 기능을 웹에 모두 옮김(남은 세부 차이는 FEATURES.md). 직원 추가·권한 변경 시 웹도 phones 문서를 같이 씀(syncPhone).
- 단체 문자: 나중에 안드로이드·웹 모두 '알리고' 연동 예정(Blaze 필요). 웹 문자 화면은 알리고로 붙일 수 있게 만들 것.

## 백업 (자료 보호 — 사용자: "모든 자료는 이중삼중 백업 중요")
1. 서버: 보안 규칙이 삭제를 막음(삭제는 deleted 표시만). 모든 변경은 audit 컬렉션에 남음(관리자만 읽기).
2. 바깥 자동 백업: `.github/workflows/backup.yml` 이 매일 한국 시간 03:07 에 Firestore 전체(하위 컬렉션 포함)를 `tools/backup/export.js` 로 받아 gzip + AES-256(openssl, pbkdf2 200000회) 암호화 후 Actions 아티팩트로 90일 보관. 저장소가 공개라 반드시 암호화. 필요한 비밀값(사용자가 직접 넣음): `FIREBASE_SERVICE_ACCOUNT`(Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 새 비공개 키 생성 JSON 전체), `BACKUP_PASSWORD`. 없으면 경고만 남기고 건너뜀. 공개 저장소의 예약 작업은 60일 동안 커밋이 없으면 GitHub 이 멈추므로, 멈추면 Actions 에서 다시 켜기.
   - 복구용 풀기: `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in nine-family_YYYYMMDD_HHMM.json.gz.enc -out backup.json.gz && gunzip backup.json.gz`
3. 관리자 기기: 안드로이드 앱은 폰 안에 하루 한 번 14일치(auto_), 가맹점 일괄 작업 전 스냅샷(snap_ 30개). 웹은 관리자가 열면 이 PC 의 IndexedDB(nine-backup)에 하루 한 번 14일치. 둘 다 자료가 비었거나 줄었으면 덮지 않음.
4. 수동: 앱·웹 모두 관리자 → 데이터 백업 내려받기(JSON). 한 달에 한 번 이상 드라이브 등 바깥에 보관 권장.
5. 나중(Blaze 전환 후): Firestore 자체 예약 백업·PITR 켜기.
- 재고(웹 0.0.14~): 입고·출고(계약 없이: 반품·불량·A/S 교체·분실·기타)·수량 정정(재고 조사)·이력. 이력은 각 stock 문서의 `log` 배열 {d, by, k, q, m}. 계약 없이 나간 것은 status '설치완료' + `gone`(사유) — 안드로이드 0.0.2 에서도 목록·수익에서 빠지게 하려고 새 상태를 만들지 않음. 안드로이드 앱도 v0.0.3 부터 같은 화면(Store.slog, showStockOut, showStockAdjust, renderStockLog). APK 는 앱을 열 때 GitHub 릴리스(v*-test 의 .apk)를 보고 새 버전 받기 안내(checkAppUpdate).
- 업무↔응대 기록(웹 0.0.15~): 업무에 `merchant`(가맹점 id)·`req`(가맹점 요청사항). 완료 때 처리결과(doneMsg)와 함께 mlogs 문서를 만들거나 고치고 업무에 `mlog`, 기록에 `task` 를 서로 적음. 안드로이드 앱도 v0.0.3 부터 같은 방식(askComplete).
- 보관지·물품요청(웹 0.0.22 / 앱 v0.0.10~): stock.loc 본사|광주지사(없으면 본사), 보관지 바꾸면 log '이동'. 물품요청은 tasks(type '물품요청') + preq {to, items[{model,qty}], stage 요청|주문함|발송함|입고완료|반려, ship}. 입고 확인 때 받는 보관지 재고에 입고(log '물품요청 입고'). 발송되면 요청자 업무 숫자·알림.
- 알림 음성(웹 0.0.23 / 앱 v0.0.11): 웹 speechSynthesis, 앱 TextToSpeech. 업무 "업무가 배정되었습니다", 채팅 "나인톡", 물품요청·발송·공지. 앱은 prefs workapp/voice 로 끄기.
- 채팅 읽음 숫자: 각자 profiles.rd{방: 시각}로 방 사람 중 안 읽은 사람 수 (웹·앱 v0.0.4 이상이 rd 씀).
- 전체 메뉴 묶음(웹·앱 같음): 내 계정·설정 · 업무 · 가맹점 · 계약·재고 · 실적 · 보고 · 회사 · 관리자. 사용설명서도 이 순서(MAN_GROUPS).
- 직원 noPerf(실적 제외), 가맹점 cstart/cend(만료 필터), mlogs 종류에 용지신청, VAN 목록 정리.
- 기능 소개서: docs/intro (claude.ai 아티팩트 '나인패밀리 기능 소개서'에도 게시).
- 웹 업데이트: sw.js 가 같은 주소 파일을 항상 no-cache 로 받아 새로고침·PC 프로그램 재시작이면 새 버전. 앱이 10분마다·화면 돌아올 때 서버 app.js 의 VERSION 을 비교해 '지금 업데이트' 띠를 띄움. VERSION 을 꼭 올려야 띠가 뜸.
- 가맹점 실시간: 앱·웹 모두 Firestore 실시간 동기화. 웹은 저장 상태 띠(저장 중/인터넷 끊김·저장 대기)와 가맹점 동시 수정 경고(창을 연 뒤 다른 곳에서 저장되면 바뀐 항목을 보여 주고 한 번 더 확인)가 있음. 안드로이드 앱에는 아직 동시 수정 경고 없음(마지막 저장 우선).

## 남은 일 (사용자 결정·준비 대기 포함)
- (완료 2026-10-24) Firebase 보안 규칙 `config` 추가분 게시 — 사용자가 콘솔에서 게시, 저장소 `firestore.rules` 와 같음.
- 실제 폰·PC에서 확인: 웹앱 로그인과 앱 동기화, 가맹점 수정 화면과 암호, 웹앱 설치.
- Blaze 요금제 전환 → 실제 문자 인증, 테스트 번호 삭제(Firebase 콘솔), SMS 지역 제한, App Check, 정기 백업, 1.0.0 선언.
- 알리고 단체 문자 연동(가입·발신번호 사용자), 이카운트 가맹점 엑셀 가져오기(내보내기 샘플 필요), 보고서 양식(샘플 필요), 파일 3MB 초과(Storage), 푸시 알림(FCM).
- 웹앱에 없는 기능: 재고·계약·실적·문자·자료실·사진/파일, 채팅 푸시. 웹 읽음 표시는 기기별.
- 알려진 한계: 같은 문서 동시 수정은 마지막 저장 우선(웹 가맹점은 경고 후 확인), 그룹방 '나가기' 없음.
- 로그인 테스트 번호 3개가 Firebase 콘솔에 있음(문자 없이 로그인됨). 공개 저장소에 코드를 적지 말 것.

앱 기능·권한 전체 정리와 웹 현황(남은 차이)은 `FEATURES.md`. 자세한 사용법은 앱 안 사용설명서, 앞으로 할 일은 `BACKLOG.md`·`ROADMAP.md`.
- 화면 꺼짐 알림(앱 v0.0.16): FCM(유료) 대신 상시 알림 서비스 NotifyService(foregroundServiceType remoteMessaging, START_STICKY, 부팅·앱 교체 때 다시 시작) + 배터리 최적화 예외 요청. Store 는 Store.get() 하나를 앱 화면·서비스가 같이 씀(서버 읽기 중복 없음). 알림·음성은 Alerts.java(채널 work2 중요도 높음, 소리는 res/raw 음성). 설정: prefs bgNotify / voice(업무) / voiceChat(채팅).
- 용어: 화면 글은 '업무 요청'(예전 '업무 지시'). 저장 값 status '지시됨'은 그대로(화면엔 '미확인').
- 빠른 선택 버튼(가맹점 요청사항): config 문서 key 'req_quick' {items:[...]}, 없으면 ['용지신청']. 관리자 메뉴에서 편집(웹·앱). 직원 이름은 이름만 — 직원과 권한 화면을 관리자가 열면 직함 접미사 자동 제거(stripTitle).
- 회귀 점검: tools/smoke/web-smoke.js (데모로 모든 화면 열기, web.yml 배포 전 자동 실행 — 실패하면 배포 안 됨). 작업 규칙은 CLAUDE.md.
- 상품 목록(웹 0.0.30 / 앱 v0.0.19): config key 'products' {items:[{code,name}]}. stock·preq.items 에 model(이름) + code. 관리자가 상품 목록을 처음 열면 기존 이름에 P0001… 자동 부여(seedProducts). 이름 바꾸면 같은 이름 재고도 바뀜.
- 엑셀 양식·재고 일괄 등록(웹 0.0.31 / 앱 v0.0.20): 양식은 브라우저 xlsxOf(zip 저장 방식)·앱 MerchantImport.xlsx 로 만듦(안내 줄 + 머리글 + '(예시)' 줄, 가져올 때 예시 줄 건너뜀). 재고 일괄 등록은 관리자만, 시작 때 seedProducts. 가맹점 설치 장비는 status 설치완료·gone '기존 설치'·merchant·mname, log k '기존 설치' q 0. PC 메모는 웹만(NAVPC 'memo', profiles.memos [{id,t,u,pin}]).
- 물품요청 새 물품(웹 0.0.32 / 앱 v0.0.21): preq.items 에 code '' + fresh:true 허용. 관리자가 주문함·발송함·입고완료로 바꿀 때 preqCodeUp 이 상품 목록 등록·코드 부여.
