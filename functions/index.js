// 나인패밀리 서버 함수 (Firebase Cloud Functions, 서울 리전)
// polish: 채팅 글 'AI 다듬기' — 직원 로그인 확인 후 구글 Gemini(무료 등급)로 맞춤법·말투를 다듬는다.
// 키는 Firebase 비밀값(GEMINI_API_KEY)에서만 읽는다. 코드·저장소에 키를 넣지 않는다.
// 주의: Gemini 무료 등급은 구글이 보낸 글을 서비스 개선에 쓸 수 있다 → 개인정보·카드번호 같은 글은 다듬지 말 것(앱 안내문에도 적음).
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
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
    phone = (await admin.auth().verifyIdToken(m[1])).phone_number;
  } catch (e) {
    return res.status(401).json({ error: '로그인이 만료됐어요' });
  }
  const db = admin.firestore();
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

async function staffOf(req) { // 로그인 토큰 → 나인패밀리 직원 {uid, name, phones}
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return null;
  let phone;
  try {
    phone = (await admin.auth().verifyIdToken(m[1])).phone_number;
  } catch (e) {
    return null;
  }
  const db = admin.firestore();
  const ph = phone ? await db.doc('phones/' + phone).get() : null;
  if (!ph || !ph.exists || ph.get('active') !== true) return null;
  const ud = await db.doc('users/' + ph.get('uid')).get();
  let u = {};
  try {
    u = JSON.parse(ud.get('j') || '{}');
  } catch (e) {}
  const name = String(u.name || ph.get('name') || '').trim();
  const norm = (v) => { let d = String(v || '').replace(/\D/g, ''); if (d.startsWith('82')) d = '0' + d.slice(2); return /^0\d{8,10}$/.test(d) ? d : ''; };
  const phones = [...new Set([norm(phone), norm(u.tel)].filter(Boolean))]; // 로그인 번호 + 직원 정보 '연락처'
  return name && phones.length ? {uid: ph.get('uid'), name, phones} : null;
}
const npBase = () => String(NINEPASS_URL.value() || '').replace(/\/+$/, '');
const npReady = () => /^https:\/\//.test(npBase()) && NINEPASS_KEY.value().length >= 16;
async function npAsk(st) { // 나인패스 결재 대기 수 → {found, count} (실패하면 throw)
  const q = new URLSearchParams({name: st.name, phone: st.phones.join(',')});
  const r = await fetch(npBase() + '/api/external/pending?' + q, {headers: {'X-NinePass-Key': NINEPASS_KEY.value()}, signal: AbortSignal.timeout(5000)});
  if (r.status === 404) return {found: false, count: 0};
  if (r.status === 401) throw new Error('key'); // 연동 키가 나인패스 것과 다름
  if (!r.ok) throw new Error('ninepass ' + r.status);
  const j = await r.json();
  return {found: j.found !== false, count: Math.max(0, Number(j.pending) || 0)};
}
const npOpts = {region: 'asia-northeast3', secrets: [NINEPASS_KEY, NINEPASS_URL], cors: ORIGINS, maxInstances: 3, timeoutSeconds: 20};

exports.npPending = onRequest(npOpts, async (req, res) => {
  const st = await staffOf(req);
  if (!st || !npReady()) return res.json({count: 0, error: true});
  const c = npCache.get(st.uid);
  if (c && Date.now() - c.at < 15000) return res.json({count: c.count, found: c.found});
  try {
    const a = await npAsk(st);
    npCache.set(st.uid, {at: Date.now(), count: a.count, found: a.found});
    return res.json({count: a.count, found: a.found});
  } catch (e) {
    console.error('npPending', e.message); // 키·주소는 남기지 않는다
    return res.json({count: 0, error: true});
  }
});

exports.npGo = onRequest(npOpts, async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({error: 'POST 만 됩니다'});
  const st = await staffOf(req);
  if (!st) return res.status(401).json({error: '로그인이 필요해요'});
  if (!npReady()) return res.status(503).json({error: '나인패스 연동 설정이 아직 안 됐어요 (관리자 확인 필요)'});
  try {
    const a = await npAsk(st); // 먼저 직원 확인 — 안 맞으면 나인패스 403 화면 대신 우리 안내
    if (!a.found) return res.status(404).json({error: 'mismatch'});
  } catch (e) {
    console.error('npGo check', e.message);
    if (e.message === 'key') return res.status(502).json({error: '나인패스 연동 키가 맞지 않아요. 관리자가 GitHub 비밀값 NINEPASS_KEY 를 나인패스의 [복사] 버튼으로 다시 넣어야 해요'});
  }
  const next = typeof (req.body && req.body.next) === 'string' && /^\/[^/\\]/.test(req.body.next) ? req.body.next : '/';
  const phone = st.phones.join(','), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', NINEPASS_KEY.value()).update(ts + '\n' + st.name + '\n' + phone, 'utf8').digest('hex');
  const q = new URLSearchParams({name: st.name, phone, ts: String(ts), sig, next});
  return res.json({url: npBase() + '/sso?' + q});
});
