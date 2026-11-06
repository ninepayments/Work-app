// 나인패밀리 서버 함수 (Firebase Cloud Functions, 서울 리전)
// polish: 채팅 글 'AI 다듬기' — 직원 로그인 확인 후 구글 Gemini(무료 등급)로 맞춤법·말투를 다듬는다.
// 키는 Firebase 비밀값(GEMINI_API_KEY)에서만 읽는다. 코드·저장소에 키를 넣지 않는다.
// 주의: Gemini 무료 등급은 구글이 보낸 글을 서비스 개선에 쓸 수 있다 → 개인정보·카드번호 같은 글은 다듬지 말 것(앱 안내문에도 적음).
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {initializeApp} = require('firebase-admin/app'); // firebase-admin 14: 예전 getAuth()·getFirestore() 방식은 없어짐 → 모듈별로 불러온다
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

initializeApp();
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
// 모델 이름은 구글이 자주 바꾼다 → 앞에서부터 시도하고 없는 모델(404)이면 다음 것. 환경변수 GEMINI_MODEL 로 맨 앞에 넣을 수 있다
const MODELS = [process.env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-flash-latest'].filter(Boolean);
const DAY_LIMIT = 100; // 직원 한 명 하루 사용 횟수
const ORIGINS = ['https://ninepayments.github.io'];

const SYSTEM = '너는 회사 사내 메신저의 글 다듬기 도우미다. 직원이 쓴 메시지를 받으면 뜻은 그대로 두고 맞춤법·띄어쓰기를 고치고, 동료에게 보내기 좋은 공손하고 자연스러운 한국어로 다듬는다. 길이는 원문과 비슷하게, 새로운 내용·인사말을 지어내지 않는다. 이름·상호·숫자·전화번호·주소는 바꾸지 않는다. 다듬은 메시지 한 개만 답하고 설명·따옴표는 붙이지 않는다.';

exports.polish = onRequest({ region: 'asia-northeast3', secrets: [GEMINI_API_KEY], cors: ORIGINS, maxInstances: 3, timeoutSeconds: 60 }, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 만 됩니다' });
  // 1) 로그인한 직원인지 (Firebase 로그인 토큰 + phones 문서 active)
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return res.status(401).json({ error: '로그인이 필요해요' });
  let phone;
  try {
    phone = (await getAuth().verifyIdToken(m[1])).phone_number;
  } catch (e) {
    return res.status(401).json({ error: '로그인이 만료됐어요' });
  }
  const db = getFirestore();
  const ph = phone ? await db.doc('phones/' + phone).get() : null;
  if (!ph || !ph.exists || ph.get('active') !== true) return res.status(403).json({ error: '등록된 직원만 쓸 수 있어요' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: '다듬을 글이 없어요' });
  if (text.length > 2000) return res.status(400).json({ error: '2000자까지 다듬을 수 있어요' });
  // 2) 하루 사용 한도 (서버 전용 컬렉션 aiuse — 앱에서는 읽고 쓸 수 없음)
  const day = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const ref = db.doc('aiuse/' + ph.get('uid') + '_' + day);
  const over = await db.runTransaction(async (t) => {
    const n = ((await t.get(ref)).get('n') || 0) + 1;
    if (n > DAY_LIMIT) return true;
    t.set(ref, { n, uid: ph.get('uid'), day, u: Date.now() });
    return false;
  });
  if (over) return res.status(429).json({ error: '오늘 다듬기 횟수(' + DAY_LIMIT + '번)를 다 썼어요' });
  // 3) Gemini 호출
  if (!/^[A-Za-z0-9_\-]{20,}$/.test(GEMINI_API_KEY.value())) return res.status(503).json({error: 'AI 키가 아직 등록되지 않았어요 (관리자 확인 필요)'});
  try {
    for (const model of MODELS) {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY.value()},
        body: JSON.stringify({systemInstruction: {parts: [{text: SYSTEM}]}, contents: [{role: 'user', parts: [{text}]}], generationConfig: {maxOutputTokens: 2048}}),
        signal: AbortSignal.timeout(30000),
      });
      if (r.status === 404) continue; // 없어진 모델 → 다음 후보
      if (r.status === 429) return res.status(503).json({error: '무료 사용량이 잠시 꽉 찼어요. 조금 뒤에 다시 눌러 주세요'});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { console.error('gemini', model, r.status, JSON.stringify(j).slice(0, 300)); return res.status(502).json({error: 'AI 연결이 잠시 안 돼요'}); }
      const c = (j.candidates || [])[0];
      if (!c || c.finishReason === 'SAFETY' || (j.promptFeedback && j.promptFeedback.blockReason)) return res.status(422).json({error: '이 글은 다듬을 수 없어요'});
      const out = ((c.content && c.content.parts) || []).map((p) => p.text || '').join('').trim();
      if (!out) return res.status(502).json({error: '다듬기 결과가 비었어요'});
      return res.json({text: out});
    }
    console.error('gemini: 쓸 수 있는 모델이 없음', MODELS.join(','));
    return res.status(502).json({error: 'AI 모델을 찾지 못했어요 (관리자 확인 필요)'});
  } catch (e) {
    console.error(e);
    return res.status(500).json({error: '다듬기에 실패했어요'});
  }
});

// ---------- 나인패스(전자결재) 연동 — docs 의 연동 규격서대로. 키·주소는 비밀값 NINEPASS_KEY · NINEPASS_URL 에서만 읽는다 ----------
// npGo: 로그인한 직원의 1회용 자동 로그인 주소를 만들어 돌려준다(화면이 새 창으로 연다). 직원 정보가 나인패스와 안 맞으면 mismatch.
// npPending: 결재 대기 수 {count}. 실패는 {count:0, error:true} (화면은 숫자만 숨김). 같은 직원 15초 캐시, 나인패스 응답 5초 제한.
const crypto = require('crypto');
const NINEPASS_KEY = defineSecret('NINEPASS_KEY');
const NINEPASS_URL = defineSecret('NINEPASS_URL');
const npCache = new Map(); // uid → {at, count, found}

async function staffOf(req) { // 로그인 토큰 → 나인패밀리 직원 {uid, name, phones}. 실패하면 {fail: 이유} (기록에는 이유만, 번호·토큰은 남기지 않음)
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return {fail: 'no-token'};
  let phone;
  try {
    phone = (await getAuth().verifyIdToken(m[1])).phone_number;
  } catch (e) {
    return {fail: 'token ' + (e.code || e.message)};
  }
  if (!phone) return {fail: 'token-no-phone'};
  const db = getFirestore();
  const ph = await db.doc('phones/' + phone).get();
  if (!ph.exists) return {fail: 'no-phones-doc'};
  if (ph.get('active') !== true) return {fail: 'phones-inactive'};
  const ud = await db.doc('users/' + ph.get('uid')).get();
  let u = {};
  try {
    u = JSON.parse(ud.get('j') || '{}');
  } catch (e) {}
  const name = String(u.name || ph.get('name') || '').trim();
  const norm = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('82')) d = '0' + d.slice(2); return /^0\d{8,10}$/.test(d) ? d : ''; };
  const phones = [...new Set([norm(phone), norm(u.tel)].filter(Boolean))]; // 로그인 번호 + 직원 정보 '연락처'
  if (!name) return {fail: 'no-name' + (ud.exists ? '' : ' (users 문서 없음)')};
  if (!phones.length) return {fail: 'no-phone-digits'};
  return {uid: ph.get('uid'), name, phones};
}
const npBase = () => String(NINEPASS_URL.value() || '').replace(/\/+$/, '');
const npReady = () => /^https:\/\//.test(npBase()) && NINEPASS_KEY.value().length >= 16;
const hmac = (msg) => crypto.createHmac('sha256', NINEPASS_KEY.value()).update(msg, 'utf8').digest('hex');
const FN_BASE = 'https://asia-northeast3-nine-family.cloudfunctions.net/';
// 직원 찾기 값: 계정 연결(nplink)이 있으면 fid, 없으면 이름+연락처 (나인패스 규격 v0.0.20)
async function withLink(st) {
  const d = await getFirestore().doc('nplink/' + st.uid).get();
  st.fid = String(st.uid); st.linked = d.exists && d.get('linked') === true; st.npname = d.exists ? d.get('name') || '' : '';
  return st;
}
const idq = (st) => st.linked ? {fid: st.fid} : {name: st.name, phone: st.phones.join(',')};
async function npGet(path, st, extra) { // 서버 → 나인패스 GET (헤더 키). 401 → throw 'key'
  const q = new URLSearchParams(Object.assign({}, st ? idq(st) : {}, extra || {}));
  const r = await fetch(npBase() + path + (String(q) ? '?' + q : ''), {headers: {'X-NinePass-Key': NINEPASS_KEY.value()}, signal: AbortSignal.timeout(8000)});
  if (r.status === 401) throw new Error('key');
  if (r.status === 404) return {found: false};
  if (!r.ok) throw new Error('ninepass ' + r.status);
  return r.json();
}
async function npAsk(st) { // 결재 대기 수 → {found, count}
  const j = await npGet('/api/external/pending', st);
  return {found: j.found !== false, count: Math.max(0, Number(j.pending) || 0)};
}
function ssoUrl(st, next) { // 1회용 자동 로그인 주소 (연결돼 있으면 fid 방식)
  const ts = Math.floor(Date.now() / 1000);
  if (st.linked) return npBase() + '/sso?' + new URLSearchParams({fid: st.fid, ts: String(ts), sig: hmac(ts + '\n' + 'fid:' + st.fid), next});
  const phone = st.phones.join(',');
  return npBase() + '/sso?' + new URLSearchParams({name: st.name, phone, ts: String(ts), sig: hmac(ts + '\n' + st.name + '\n' + phone), next});
}
const okPath = (v) => typeof v === 'string' && /^\/[A-Za-z0-9_\-./?=&%]*$/.test(v) && !v.startsWith('//') ? v : '/';
const npOpts = {region: 'asia-northeast3', secrets: [NINEPASS_KEY, NINEPASS_URL], cors: ORIGINS, maxInstances: 3, timeoutSeconds: 30};
async function npStaff(req, res) { // 공통: 직원 확인 + 설정 확인. 실패면 응답하고 null
  const st = await staffOf(req);
  if (st.fail) { console.error(req.path, 'staff', st.fail); res.status(401).json({error: '나인패밀리 직원 확인에 실패했어요 (' + st.fail + ') — 관리자에게 이 문구를 알려 주세요'}); return null; }
  if (!npReady()) { res.status(503).json({error: '나인패스 연동 설정이 아직 안 됐어요 (관리자 확인 필요)'}); return null; }
  return withLink(st);
}
const KEY_ERR = '나인패스 연동 키가 맞지 않아요 (관리자 확인 필요)';

exports.npPending = onRequest(npOpts, async (req, res) => {
  const st = await staffOf(req);
  if (st.fail) { console.error('npPending staff', st.fail); return res.json({count: 0, error: true}); }
  if (!npReady()) return res.json({count: 0, error: true});
  await withLink(st);
  const c = npCache.get(st.uid);
  if (c && Date.now() - c.at < 15000) return res.json({count: c.count, found: c.found, items: c.items, linked: st.linked});
  try {
    // 결재 대기 문서 목록도 같이 → 업무 화면 '나인패스 결재 대기' 카드 (목록을 못 받으면 수만)
    let a = null, items = [];
    try {
      const j = await npGet('/api/external/pending/list', st);
      if (j && Array.isArray(j.items)) {
        items = j.items.filter((x) => x && x.id != null).slice(0, 30).map((x) => ({id: String(x.id), title: String(x.title || '').slice(0, 120), kind: String(x.kind || '').slice(0, 30), drafter: String(x.drafter || '').slice(0, 30), at: String(x.submittedAt || '').slice(0, 25), path: okPath(x.path)}));
        a = {found: j.found !== false, count: Math.max(0, Number(j.pending) || items.length)};
      }
    } catch (e) { if (e.message === 'key') throw e; }
    if (!a) a = await npAsk(st);
    npCache.set(st.uid, {at: Date.now(), count: a.count, found: a.found, items});
    return res.json({count: a.count, found: a.found, items, linked: st.linked});
  } catch (e) {
    console.error('npPending', e.message); // 키·주소는 남기지 않는다
    return res.json({count: 0, error: true, linked: st.linked});
  }
});

exports.npGo = onRequest(npOpts, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error: 'POST 만 됩니다'});
  const st = await npStaff(req, res); if (!st) return;
  try {
    const a = await npAsk(st); // 먼저 직원 확인 — 안 맞으면 나인패스 403 화면 대신 우리 안내
    if (!a.found) return res.status(404).json({error: st.linked ? 'unlinked' : 'mismatch'});
  } catch (e) {
    console.error('npGo check', e.message);
    if (e.message === 'key') return res.status(502).json({error: KEY_ERR});
  }
  return res.json({url: ssoUrl(st, okPath(req.body && req.body.next))});
});

// 계정 연결: 시작 주소(1회용, 새 창) → 나인패스 로그인·확인 → npLinkBack 으로 돌아옴
exports.npLinkStart = onRequest(npOpts, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error: 'POST 만 됩니다'});
  const st = await npStaff(req, res); if (!st) return;
  const ts = Math.floor(Date.now() / 1000), back = FN_BASE + 'npLinkBack';
  return res.json({url: npBase() + '/link?' + new URLSearchParams({fid: st.fid, ts: String(ts), back, sig: hmac(ts + '\n' + 'link' + '\n' + st.fid + '\n' + back)})});
});
const page = (title, msg, ok) => '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title><body style="font-family:system-ui,sans-serif;background:#f7f6f2;color:#1d1b16;display:flex;min-height:90vh;align-items:center;justify-content:center;margin:0;padding:16px"><div style="background:#fff;border-radius:16px;padding:28px 24px;max-width:420px;text-align:center;box-shadow:0 6px 20px rgba(0,0,0,.08)"><div style="font-size:40px">' + (ok ? '✅' : '⚠️') + '</div><h2 style="margin:8px 0">' + title + '</h2><p style="color:#6a655a;line-height:1.6">' + msg + '</p><p style="color:#6a655a;font-size:13px">이 창은 닫아도 돼요.</p></div>';
exports.npLinkBack = onRequest({region: 'asia-northeast3', secrets: [NINEPASS_KEY, NINEPASS_URL], maxInstances: 3, timeoutSeconds: 20}, async (req, res) => {
  const fid = String(req.query.fid || ''), ts = Number(req.query.ts || 0), sig = String(req.query.sig || '');
  res.set('Cache-Control', 'no-store');
  if (!/^\d{1,20}$/.test(fid)) return res.status(400).send(page('연결하지 못했어요', '잘못된 주소예요.', false));
  if (String(req.query.ok) !== '1') {
    const why = {cancel: '연결을 취소했어요.', expired: '시간이 지났거나 이미 쓴 연결 주소예요. 나인패밀리에서 다시 [나인패스 계정 연결]을 눌러 주세요.', badsig: '연동 설정이 맞지 않아요. 관리자에게 알려 주세요.'}[String(req.query.reason)] || '연결하지 못했어요.';
    return res.send(page('연결하지 못했어요', why, false));
  }
  const good = sig.length === 64 && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(hmac(ts + '\n' + 'linked' + '\n' + fid))) && Math.abs(Date.now() / 1000 - ts) <= 600;
  if (!good) { console.error('npLinkBack badsig'); return res.status(400).send(page('연결하지 못했어요', '확인 값이 맞지 않아요. 나인패밀리에서 다시 시도해 주세요.', false)); }
  let name = '';
  try { const j = await npGet('/api/external/link', null, {fid}); name = j && j.linked ? String(j.name || '') : ''; } catch (e) { console.error('npLinkBack check', e.message); }
  await getFirestore().doc('nplink/' + fid).set({linked: true, name, u: Date.now()});
  npCache.delete(Number(fid)); npCache.delete(fid);
  return res.send(page('나인패스 계정을 연결했어요', (name ? '나인패스 <b>' + name.replace(/[<>&"]/g, '') + '</b> 계정과 연결됐어요. ' : '') + '이제 나인패밀리에서 나인패스가 자동으로 로그인되고, 결재 요청이 채팅으로 와요.', true));
});
exports.npUnlink = onRequest(npOpts, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error: 'POST 만 됩니다'});
  const st = await npStaff(req, res); if (!st) return;
  try {
    const r = await fetch(npBase() + '/api/external/link?' + new URLSearchParams({fid: st.fid}), {method: 'DELETE', headers: {'X-NinePass-Key': NINEPASS_KEY.value()}, signal: AbortSignal.timeout(8000)});
    if (r.status === 401) return res.status(502).json({error: KEY_ERR});
  } catch (e) { console.error('npUnlink', e.message); }
  await getFirestore().doc('nplink/' + st.fid).delete();
  return res.json({ok: true});
});

// 결재 양식 완성본 → 나인패스 내 계정 임시저장 문서로 첨부 → 그 작성 화면을 자동 로그인으로 연다
let kindsCache = {at: 0, list: []};
exports.npKinds = onRequest(npOpts, async (req, res) => {
  const st = await npStaff(req, res); if (!st) return;
  try {
    if (Date.now() - kindsCache.at > 600000) { const j = await npGet('/api/external/kinds', null); kindsCache = {at: Date.now(), list: Array.isArray(j) ? j : []}; }
    return res.json({kinds: kindsCache.list});
  } catch (e) {
    console.error('npKinds', e.message);
    return res.status(502).json({error: e.message === 'key' ? KEY_ERR : '나인패스 문서 종류를 받지 못했어요'});
  }
});
exports.npDraft = onRequest(Object.assign({}, npOpts, {memory: '512MiB', timeoutSeconds: 60}), async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error: 'POST 만 됩니다'});
  const st = await npStaff(req, res); if (!st) return;
  const b = req.body || {}, title = String(b.title || '').trim().slice(0, 72), mime = String(b.mime || '');
  if (!title) return res.status(400).json({error: '제목을 적어 주세요'});
  if (!/^(application\/pdf|image\/png|image\/jpeg)$/.test(mime)) return res.status(415).json({error: 'PDF·PNG·JPG 만 보낼 수 있어요'});
  const buf = Buffer.from(String(b.file || ''), 'base64');
  if (!buf.length) return res.status(400).json({error: '파일이 비었어요'});
  if (buf.length > 10 * 1024 * 1024) return res.status(413).json({error: '10MB 까지 보낼 수 있어요'});
  const fd = new FormData();
  Object.entries(idq(st)).forEach(([k, v]) => fd.append(k, v));
  fd.append('title', title);
  if (b.kind) fd.append('kind', String(b.kind));
  if (b.memo) fd.append('memo', String(b.memo).slice(0, 4000));
  fd.append('file', new Blob([buf], {type: mime}), String(b.fname || (mime === 'application/pdf' ? 'document.pdf' : 'document.' + (mime === 'image/png' ? 'png' : 'jpg'))).replace(/[\\/]/g, '_'));
  try {
    const r = await fetch(npBase() + '/api/external/drafts', {method: 'POST', headers: {'X-NinePass-Key': NINEPASS_KEY.value()}, body: fd, signal: AbortSignal.timeout(40000)});
    const j = await r.json().catch(() => ({}));
    if (r.ok && j.ok) return res.json({ok: true, id: j.id, url: ssoUrl(st, okPath(j.path))});
    const why = {400: '제목·파일·문서 종류를 확인해 주세요', 401: KEY_ERR, 403: '나인패스에서 기안 권한이 없는 계정이에요', 404: st.linked ? 'unlinked' : 'mismatch', 413: '10MB 까지 보낼 수 있어요', 415: '파일 형식이 맞지 않아요 (PDF·PNG·JPG)'}[r.status] || '나인패스에 보내지 못했어요 (' + r.status + ')';
    console.error('npDraft', r.status);
    return res.status(r.status === 404 ? 404 : 502).json({error: why});
  } catch (e) {
    console.error('npDraft', e.message);
    return res.status(502).json({error: '나인패스에 보내지 못했어요 (연결)'});
  }
});

// 결재 알림: 5분마다 직원별로 결재할 문서 목록을 물어 새 문서만 본인 '📝 나인패스 결재' 채팅방에 메시지로 보낸다
const {onSchedule} = require('firebase-functions/v2/scheduler');
const nowKst = () => new Date(Date.now() + 9 * 3600000).toISOString().replace('T', ' ').slice(0, 16);
const rid = () => 1 + Math.floor(Math.random() * 2e9);
async function npRoom(db, uid, phone, stt) { // 본인만 보이는 비공개 방 (prooms, mem = 본인 번호)
  if (stt.room) { const d = await db.doc('prooms/' + stt.room).get(); if (d.exists) return stt.room; }
  const id = rid(), o = {id, name: '📝 나인패스 결재', grp: true, np: true, members: [uid], mem: [phone], by: uid, created: nowKst()};
  await db.doc('prooms/' + id).set({j: JSON.stringify(o), u: Date.now(), mem: [phone], by: uid});
  return id;
}
async function npPost(db, room, phone, text, path) {
  const id = rid(), o = {id, room, who: 0, wname: '📝 나인패스', text, ts: Date.now(), mem: [phone]};
  if (path) o.np = {path};
  await db.doc('pmsgs/' + id).set({j: JSON.stringify(o), u: Date.now(), mem: [phone], who: 0, s: FieldValue.serverTimestamp()});
}
const itemText = (x) => '📝 결재 요청이 왔어요\n' + (x.title || '(제목 없음)') + (x.kind ? ' · ' + x.kind : '') + '\n기안 ' + (x.drafter || '-') + (x.submittedAt ? ' · ' + String(x.submittedAt).slice(5, 16).replace('T', ' ') : '');
exports.npNotify = onSchedule({schedule: 'every 5 minutes', region: 'asia-northeast3', timeZone: 'Asia/Seoul', secrets: [NINEPASS_KEY, NINEPASS_URL], timeoutSeconds: 120, maxInstances: 1}, async () => {
  if (!npReady()) return;
  const db = getFirestore();
  const phs = await db.collection('phones').where('active', '==', true).get();
  for (const ph of phs.docs) {
    try {
      const uid = ph.get('uid'); if (!uid) continue;
      const ud = await db.doc('users/' + uid).get(); let u = {};
      try { u = JSON.parse(ud.get('j') || '{}'); } catch (e) {}
      if (u.deleted || u.active === false) continue;
      const norm = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('82')) d = '0' + d.slice(2); return /^0\d{8,10}$/.test(d) ? d : ''; };
      const st = await withLink({uid, name: String(u.name || ph.get('name') || '').trim(), phones: [...new Set([norm(ph.id), norm(u.tel)].filter(Boolean))]});
      if (!st.linked && (!st.name || !st.phones.length)) continue;
      const j = await npGet('/api/external/pending/list', st);
      if (!j || j.found === false || !Array.isArray(j.items)) continue;
      const sref = db.doc('npstate/' + uid), sd = await sref.get(), stt = sd.exists ? sd.data() : {};
      const seen = new Set(stt.seen || []), fresh = j.items.filter((x) => x && x.id != null && !seen.has(String(x.id)));
      const ids = j.items.map((x) => String(x.id)).slice(0, 200);
      if (fresh.length) {
        const room = await npRoom(db, uid, ph.id, stt); stt.room = room;
        if (!sd.exists && fresh.length > 1) await npPost(db, room, ph.id, '📝 지금 결재할 문서가 ' + (j.pending || fresh.length) + '건 있어요\n' + fresh.slice(0, 5).map((x) => '· ' + (x.title || '') + ' (' + (x.drafter || '-') + ')').join('\n'), '/');
        else if (fresh.length > 5) await npPost(db, room, ph.id, '📝 결재 요청이 ' + fresh.length + '건 새로 왔어요\n' + fresh.slice(0, 5).map((x) => '· ' + (x.title || '') + ' (' + (x.drafter || '-') + ')').join('\n'), '/');
        else for (const x of fresh) await npPost(db, room, ph.id, itemText(x), okPath(x.path));
      }
      await sref.set({seen: ids, room: stt.room || null, u: Date.now()});
    } catch (e) {
      console.error('npNotify', ph.get('uid'), e.message);
      if (e.message === 'key') return; // 키가 틀리면 모두 실패하니 이번 회차는 그만
    }
  }
});
