'use strict';
/* firestore.rules 를 nine-family 에 게시한다 — .github/workflows/rules.yml 에서 손으로(Run workflow) 실행.
 * 서비스 계정 키는 환경변수 FIREBASE_SERVICE_ACCOUNT 로만 받는다(백업과 같은 비밀값).
 * 게시 전 점검: 최고관리자(phones.super) 표시가 없으면 게시하지 않는다(게시 후엔 아무도 super 를 켤 수 없게 되므로).
 * 최근 2시간 안에 만든 사람(who) 표시 없이 올라온 글이 있으면 옛 버전 앱이 남아 있다는 뜻 → 경고만 한다. */
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
admin.initializeApp({credential: admin.credential.cert(sa), projectId: sa.project_id});
const db = admin.firestore();

(async () => {
  const sup = await db.collection('phones').where('super', '==', true).get();
  const names = sup.docs.map(d => d.get('name') || ('직원 ' + d.get('uid')));
  console.log('최고관리자 표시: ' + (names.join(', ') || '없음'));
  if (!sup.size) { console.error('::error::최고관리자 표시(phones.super)가 아직 없습니다. 지사장님이 새 버전으로 한 번 로그인한 뒤 다시 실행하세요.'); process.exit(1); }
  const since = Date.now() - 2 * 3600 * 1000;
  for (const c of ['msgs', 'tasks']) {
    const s = await db.collection(c).where('u', '>=', since).get();
    const old = s.docs.filter(d => !('who' in d.data()) && !String(d.get('j') || '').includes('"deleted":true'));
    console.log(c + ': 최근 2시간 ' + s.size + '건, who 없음 ' + old.length + '건');
    if (old.length) console.log('::warning::' + c + ' 에 옛 버전 앱으로 올린 듯한 글이 ' + old.length + '건 있어요. 규칙 게시 후 그 기기는 업데이트해야 글을 올릴 수 있어요.');
  }
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
  const rs = await admin.securityRules().releaseFirestoreRulesetFromSource(src);
  console.log('게시 완료: ' + rs.name + ' (' + rs.createTime + ')');
})().catch(e => { console.error('::error::' + (e && e.message || e)); process.exit(1); });
