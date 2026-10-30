/**
 * 나인패밀리 — 홈페이지 서류접수·상담신청을 앱 채팅방으로 보내기 (Google Apps Script 에 붙여 넣는 코드)
 *
 * 하는 일: 기존 doPost 가 텔레그램으로 보낸 뒤 nineForward(...) 를 부르면,
 *   서류접수 → 앱 '서류접수' 채팅방에 접수 내용 + 사진(파일)마다 한 건씩
 *   상담신청 → 앱 '상담신청' 채팅방에 신청 내용
 * 을 Firebase(Firestore)에 직접 써 넣는다. 앱·PC·웹에서 바로 보이고 알림도 간다.
 *
 * 비밀값(서비스 계정 키)은 이 코드에 넣지 않는다. Apps Script → 프로젝트 설정 → 스크립트 속성에
 *   이름: NINE_SA   값: Firebase 서비스 계정 JSON 전체 (GitHub 비밀값 FIREBASE_SERVICE_ACCOUNT 와 같은 것)
 * 를 지사장님이 직접 넣는다.
 *
 * 기존 doPost 에 붙이는 법 (텔레그램 전송 다음 줄):
 *   try { nineForward(e); } catch (err) { console.error('nineForward', err); }
 * 서류접수(JSON 본문)·상담(form 값) 둘 다 e 를 그대로 넘기면 알아서 구분한다.
 *
 * 요청 확인값: 스크립트 속성 NINE_FORWARD_SECRET 과 요청에 실린 값이 같을 때만 앱으로 보낸다(값은 코드에 적지 않는다).
 *   ※ Apps Script 웹앱의 doPost 는 HTTP 헤더를 읽을 수 없다(e 에 헤더가 없음). 그래서 홈페이지 doPost 요청에 헤더 대신
 *     주소 꼬리 ?nf=<값> (또는 JSON 본문의 _nf, form 값 nf)로 실어 보낸다.
 *   ※ 이 값은 홈페이지 스크립트에 들어가므로 완전한 비밀이 아니다(페이지 소스를 보면 보임). 아무나 이 주소로 가짜 접수를 넣는 것을
 *     조금 줄이는 정도이고, 앱 데이터 보호는 서비스 계정 키(NINE_SA)를 스크립트 속성에만 두는 것으로 한다.
 */
var NINE_PROJECT = 'nine-family';
var NINE_DOC_ROOM = '서류접수';
var NINE_CONSULT_ROOM = '상담신청';
var NINE_SENDER = '📮 홈페이지 접수';
var NINE_CHUNK = 600 * 1024; // 앱과 같은 사진 조각 크기(600KB)

function nineForward(e) {
  var body = null;
  try { if (e && e.postData && e.postData.contents && /json/i.test(e.postData.type || '')) body = JSON.parse(e.postData.contents); } catch (x) {}
  if (!body && e && e.postData && e.postData.contents && e.postData.contents.charAt(0) === '{') { try { body = JSON.parse(e.postData.contents); } catch (x) {} }
  var want = PropertiesService.getScriptProperties().getProperty('NINE_FORWARD_SECRET') || '';
  var got = String((e && e.parameter && e.parameter.nf) || (body && body._nf) || '');
  if (!want || got !== want) { console.warn('nineForward: 요청 확인값이 없거나 달라서 앱으로 보내지 않음'); return; } // 텔레그램 전송은 그대로
  if (body && (body.formType || body.files)) return nineDoc_(body);
  return nineConsult_((e && e.parameter) || {});
}

// ---------- 서류접수: 글 1건 + 첨부마다 사진(또는 파일) 1건 ----------
function nineDoc_(d) {
  var tok = nineToken_(), room = nineRoom_(tok, NINE_DOC_ROOM), now = Date.now();
  var files = d.files || [];
  var lines = ['📄 홈페이지 서류접수' + (d.formType ? ' (' + d.formType + ')' : '')];
  nineLine_(lines, '업종', d.bizCategory); nineLine_(lines, '상호', d.shopName); nineLine_(lines, '대표자', d.repName);
  nineLine_(lines, '전화', d.landline); nineLine_(lines, '휴대폰', d.mobile); nineLine_(lines, '이메일', d.email);
  nineLine_(lines, '접수 시각', d.submittedAt); lines.push('첨부 ' + files.length + '건');
  nineMsg_(tok, {room: room, text: lines.join('\n'), ts: now});
  for (var i = 0; i < files.length; i++) {
    var f = files[i]; if (!f || !f.base64) continue;
    var bytes = Utilities.base64Decode(String(f.base64).replace(/^data:[^,]*,/, ''));
    var mime = f.mimeType || 'application/octet-stream', isImg = /^image\//.test(mime);
    var label = (f.label || f.shortName || '첨부 ' + (i + 1));
    var name = ((d.shopName || '접수') + '_' + label).replace(/[\\/:*?"<>|\s]+/g, '_') + (isImg ? '.jpg' : nineExt_(f.name));
    var up = nineBlob_(tok, bytes, mime, name);
    nineMsg_(tok, {room: room, text: isImg ? '📎 ' + label : name, ts: now + i + 1, kind: isImg ? 'img' : 'file', blob: up.blob, chunks: up.chunks, fname: name, size: bytes.length});
  }
}

// ---------- 상담신청: 글 1건 ----------
function nineConsult_(p) {
  var tok = nineToken_(), room = nineRoom_(tok, NINE_CONSULT_ROOM);
  var lines = ['💬 홈페이지 상담신청' + (p.type ? ' (' + p.type + ')' : '')];
  nineLine_(lines, '상호', p.shopName); nineLine_(lines, '사업자번호', p.bizNumber); nineLine_(lines, '연락처', p.phone);
  nineLine_(lines, '매장 형태', p.storeType); nineLine_(lines, '희망 일시', [p.preferredDate, p.preferredTime].filter(String).join(' '));
  nineLine_(lines, '문의 내용', p.message); nineLine_(lines, '마케팅 동의', p.marketing); nineLine_(lines, '신청 시각', p.submittedAt);
  nineMsg_(tok, {room: room, text: lines.join('\n'), ts: Date.now()});
}

function nineLine_(a, k, v) { if (v != null && String(v).trim() !== '') a.push(k + ': ' + String(v).trim()); }
function nineExt_(n) { var m = /\.[A-Za-z0-9]{1,5}$/.exec(n || ''); return m ? m[0] : ''; }

// ---------- Firestore 쓰기 (앱과 같은 모양: {j: JSON 글자, u: 시각}) ----------
function nineId_() { return 1 + Math.floor(Math.random() * 2e9); }
function nineJ_(o) { return JSON.stringify(o).replace(/\//g, '\\/'); }
function nineNowStr_() { return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); }

function nineMsg_(tok, o) {
  var m = {id: nineId_(), created: nineNowStr_(), who: 0, wname: NINE_SENDER};
  for (var k in o) m[k] = o[k];
  nineSet_(tok, 'msgs', m.id, {j: {stringValue: nineJ_(m)}, u: {integerValue: String(Date.now())}, s: {timestampValue: new Date().toISOString()}});
}

function nineBlob_(tok, bytes, mime, name) {
  var id = nineId_(), n = Math.max(1, Math.ceil(bytes.length / NINE_CHUNK));
  for (var i = 0; i < n; i++) {
    var part = bytes.slice(i * NINE_CHUNK, (i + 1) * NINE_CHUNK);
    nineSet_(tok, 'blobs', id + '_' + i, {d: {stringValue: Utilities.base64Encode(part)}, mime: {stringValue: mime}, name: {stringValue: name},
      i: {integerValue: String(i)}, n: {integerValue: String(n)}, u: {integerValue: String(Date.now())}, by: {integerValue: '0'}});
  }
  return {blob: String(id), chunks: n};
}

// 이름이 같은 단체 채팅방을 찾고, 없으면 만든다 (앱의 postToRoom 과 같은 방식)
function nineRoom_(tok, name) {
  var cache = CacheService.getScriptCache(), key = 'nine_room_' + name, hit = cache.get(key);
  if (hit) return Number(hit);
  var url = 'https://firestore.googleapis.com/v1/projects/' + NINE_PROJECT + '/databases/(default)/documents/rooms?pageSize=300', found = 0, page = '';
  do {
    var r = JSON.parse(UrlFetchApp.fetch(url + (page ? '&pageToken=' + encodeURIComponent(page) : ''), {headers: {Authorization: 'Bearer ' + tok}}).getContentText());
    (r.documents || []).forEach(function (doc) {
      try { var o = JSON.parse(doc.fields.j.stringValue); if (!found && o.name === name && !o.deleted && !(o.mem && o.mem.length)) found = o.id; } catch (x) {}
    });
    page = r.nextPageToken || '';
  } while (page && !found);
  if (!found) {
    var room = {id: nineId_(), created: nineNowStr_(), name: name, by: 0};
    nineSet_(tok, 'rooms', room.id, {j: {stringValue: nineJ_(room)}, u: {integerValue: String(Date.now())}});
    found = room.id;
  }
  cache.put(key, String(found), 21600);
  return found;
}

function nineSet_(tok, coll, id, fields) {
  var url = 'https://firestore.googleapis.com/v1/projects/' + NINE_PROJECT + '/databases/(default)/documents/' + coll + '/' + encodeURIComponent(String(id));
  var res = UrlFetchApp.fetch(url, {method: 'patch', contentType: 'application/json', headers: {Authorization: 'Bearer ' + tok}, payload: JSON.stringify({fields: fields}), muteHttpExceptions: true});
  if (res.getResponseCode() >= 300) throw new Error('Firestore ' + coll + ' ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
}

// ---------- 서비스 계정으로 접근 토큰 받기 (55분 보관) ----------
function nineToken_() {
  var cache = CacheService.getScriptCache(), t = cache.get('nine_tok');
  if (t) return t;
  var sa = JSON.parse(PropertiesService.getScriptProperties().getProperty('NINE_SA') || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('스크립트 속성 NINE_SA(서비스 계정 JSON)가 없어요.');
  var now = Math.floor(Date.now() / 1000);
  var b64 = function (o) { return Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, ''); };
  var head = b64({alg: 'RS256', typ: 'JWT'});
  var claim = b64({iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600});
  var sig = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(head + '.' + claim, sa.private_key)).replace(/=+$/, '');
  var r = JSON.parse(UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {method: 'post', payload: {grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig}}).getContentText());
  cache.put('nine_tok', r.access_token, 3300);
  return r.access_token;
}

/** 붙인 뒤 한 번 실행해서 확인: 앱 '서류접수' 방에 시험 글이 올라오면 성공 */
function nineTest() {
  nineDoc_({formType: '시험', shopName: '연결 시험', repName: '테스트', mobile: '010-0000-0000', submittedAt: nineNowStr_(), files: []});
}
