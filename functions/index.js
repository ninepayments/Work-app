// 나인패밀리 서버 함수 (Firebase Cloud Functions, 서울 리전)
// polish: 채팅 글 'AI 다듬기' — 직원 로그인 확인 후 Claude 로 맞춤법·말투를 다듬는다.
// 키는 Firebase 비밀값(ANTHROPIC_API_KEY)에서만 읽는다. 코드·저장소에 키를 넣지 않는다.
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Anthropic = require('@anthropic-ai/sdk');

admin.initializeApp();
const ANTHROPIC_API_KEY = defineSecret('ANTHROPIC_API_KEY');
const DAY_LIMIT = 100; // 직원 한 명 하루 사용 횟수
const ORIGINS = ['https://ninepayments.github.io'];

const SYSTEM = '너는 회사 사내 메신저의 글 다듬기 도우미다. 직원이 쓴 메시지를 받으면 뜻은 그대로 두고 맞춤법·띄어쓰기를 고치고, 동료에게 보내기 좋은 공손하고 자연스러운 한국어로 다듬는다. 길이는 원문과 비슷하게, 새로운 내용·인사말을 지어내지 않는다. 이름·상호·숫자·전화번호·주소는 바꾸지 않는다. 다듬은 메시지 한 개만 답하고 설명·따옴표는 붙이지 않는다.';

exports.polish = onRequest({ region: 'asia-northeast3', secrets: [ANTHROPIC_API_KEY], cors: ORIGINS, maxInstances: 3, timeoutSeconds: 60 }, async (req, res) => {
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
  // 3) Claude 호출
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
    const r = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 4000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: text }],
    });
    if (r.stop_reason === 'refusal') return res.status(422).json({ error: '이 글은 다듬을 수 없어요' });
    const out = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!out) return res.status(502).json({ error: '다듬기 결과가 비었어요' });
    return res.json({ text: out });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return res.status(503).json({ error: '잠시 후 다시 눌러 주세요' });
    if (e instanceof Anthropic.APIError) {
      console.error('anthropic', e.status, e.message);
      return res.status(502).json({ error: 'AI 연결이 잠시 안 돼요' });
    }
    console.error(e);
    return res.status(500).json({ error: '다듬기에 실패했어요' });
  }
});
