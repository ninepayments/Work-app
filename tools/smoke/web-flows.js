// 기존 기능 회귀 점검: 데모 모드(#demo)에서 자주 쓰는 흐름을 실제로 눌러 보고, 결과가 예전과 같은지 확인한다.
// 쓰는 법: node tools/smoke/web-flows.js   (web-smoke.js 와 같이 — 웹 배포 CI 도 돌린다. 하나라도 틀리면 배포 안 됨)
// 새 기능을 넣을 때 그 기능 점검도 여기에 한 줄씩 더한다.
const http = require('http'), fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..', '..', 'web');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json'};
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream'}); r.end(b); });
});
let bad = 0, ok = 0;
const check = (name, cond, info) => { if (cond) ok++; else { bad++; console.log('✗', name, info === undefined ? '' : JSON.stringify(info)); } };
srv.listen(0, async () => {
  const b = await chromium.launch(); const p = await b.newPage({viewport: {width: 1280, height: 800}});
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:' + srv.address().port + '/#demo'); await p.waitForTimeout(1500);
  const ev = (f, a) => p.evaluate(f, a);
  const okBtn = () => p.click('#m_ok');
  try {
    // 1. 업무 요청 (서류 아님) → 저장 값·처리 이력·서류방 알림 없음
    await ev(() => ACT.newTask());
    check('업무 요청 창: 종류 기본값', await p.$eval('#f_ty', e => e.value) === '신규 설치');
    check('업무 요청 창: 2단계 숨김', await p.$eval('#f_ty2w', e => e.style.display) === 'none');
    await p.fill('#f_t1', '회귀 설치'); await p.fill('#f_c', '회귀상회'); await okBtn(); await p.waitForTimeout(200);
    let t = await ev(() => list('tasks').find(x => x.title === '회귀 설치'));
    check('업무 저장', t && t.type === '신규 설치' && t.status === '지시됨' && t.client === '회귀상회', t);
    check('업무 처리 이력', t && t.history && /업무 요청/.test(t.history[0].text), t && t.history);
    // 2. 서류 접수 + 2단계 → 저장 값 / 고르지 않으면 '서류 접수' 그대로
    await ev(() => ACT.newTask()); await p.selectOption('#f_ty', '서류 접수'); await p.selectOption('#f_ty2', '카드사신규'); await p.fill('#f_t1', '회귀 서류'); await okBtn(); await p.waitForTimeout(200);
    check('서류 접수 2단계 저장', await ev(() => (list('tasks').find(x => x.title === '회귀 서류') || {}).type) === '서류 접수 · 카드사신규');
    await ev(() => ACT.newTask()); await p.selectOption('#f_ty', '서류 접수'); await p.fill('#f_t1', '회귀 서류2'); await okBtn(); await p.waitForTimeout(200);
    check('서류 접수(2단계 없음) 저장', await ev(() => (list('tasks').find(x => x.title === '회귀 서류2') || {}).type) === '서류 접수');
    // 3. 상태 바꾸기·완료 (기존 흐름)
    await ev(id => ACT.tstatus(id + '|진행중'), t.id);
    check('진행 시작', await ev(id => byId('tasks', id).status, t.id) === '진행중');
    await ev(id => ACT.tdone(id), t.id); await p.fill('#f_m', '설치 완료'); await okBtn(); await p.waitForTimeout(200);
    t = await ev(id => byId('tasks', id), t.id);
    check('완료 처리', t.status === '완료' && t.doneMsg === '설치 완료', t.status);
    // 4. 업무 수정 → 바뀐 칸만 이력, 예전 종류 값은 2단계로 읽힘
    const old = await ev(() => { const x = create('tasks', {title: '예전 카드사', type: '카드사서류', assignee: S.uid, creator: S.uid, status: '지시됨', history: []}); put('tasks', x); return x.id; });
    await ev(id => ACT.task(id), old); check('수정 버튼 보임', !!(await p.$('[data-act="tedit"]')));
    await p.click('[data-act="tedit"]'); await p.waitForTimeout(150);
    check('예전 종류 → 2단계로 읽힘', (await p.$eval('#f_ty', e => e.value)) + '|' + (await p.$eval('#f_ty2', e => e.value)) === '서류 접수|카드사신규');
    await okBtn(); await p.waitForTimeout(150); // 아무것도 안 고치고 저장
    const t4 = await ev(id => byId('tasks', id), old);
    check('안 고치고 저장 → 예전 값 그대로', t4.type === '카드사서류' && !(t4.history || []).some(h => /내용 수정/.test(h.text)), t4);
    await ev(id => ACT.tedit(id), old); await p.waitForTimeout(150); await p.fill('#f_m', '메모 추가'); await okBtn(); await p.waitForTimeout(150);
    const t5 = await ev(id => byId('tasks', id), old);
    check('메모만 수정 → 이력에 메모만', t5.memo === '메모 추가' && t5.type === '카드사서류' && (t5.history.slice(-1)[0] || {}).text === '내용 수정: 메모', t5);
    // 5. 가맹점 수정: 저장된 계약종료일은 창을 열기만 해서는 안 바뀜, 시작일을 바꾸면 36개월
    const mid = await ev(() => { const m = list('merchants')[0]; m.cstart = '2025-01-01'; m.cend = '2027-06-30'; put('merchants', m); return m.id; });
    await ev(id => { unlockedAt = Date.now(); ACT.editMerchant(id); }, mid); await p.waitForTimeout(200);
    if (await p.$('#f_ce')) {
      check('가맹점 수정: 기존 종료일 유지', await p.$eval('#f_ce', e => e.value) === '2027-06-30');
      await okBtn(); await p.waitForTimeout(200);
      check('가맹점 저장: 종료일 그대로', await ev(id => byId('merchants', id).cend, mid) === '2027-06-30');
      await ev(id => ACT.editMerchant(id), mid); await p.waitForTimeout(200);
      await p.fill('#f_cs', '2026-01-01'); await p.$eval('#f_cs', e => e.dispatchEvent(new Event('change', {bubbles: true})));
      check('시작일 → 36개월', await p.$eval('#f_ce', e => e.value) === '2029-01-01');
      await p.click('.cmon[data-cm="48"]'); check('48개월 버튼', await p.$eval('#f_ce', e => e.value) === '2030-01-01');
      await ev(() => closeModal());
    } else check('가맹점 수정 창 열림', false, await ev(() => ($('#modal') || {}).innerText));
    // 6. 상단 메뉴: 살짝 누르면 그냥 이동(끌기와 헷갈리지 않게)
    await ev(() => { closeModal(); S.menu = false; S.tab = 'task'; S.sub = ''; render(); });
    await p.click('.pcnav [data-nk="f:merchants"]'); await p.waitForTimeout(150);
    check('상단 메뉴 클릭 이동', await ev(() => S.sub) === 'merchants');
    await p.click('.pcnav [data-nk="f:task"]'); await p.waitForTimeout(150);
    check('업무로 돌아오기', await ev(() => S.tab) === 'task');
    // 7. 채팅 보내기
    await ev(() => { const r = list('rooms')[0]; if (r) { S.room = r.id; S.tab = 'chat'; render(); } });
    if (await p.$('#msgin')) { await p.fill('#msgin', '회귀 메시지'); await ev(() => ACT.send()); await p.waitForTimeout(150);
      check('채팅 보내기', await ev(() => list('msgs').some(m => m.text === '회귀 메시지'))); }
    // 8. 나인패스 결재 대기 카드 (목록이 있을 때만)
    await ev(() => { S.room = 0; S.tab = 'task'; S.sub = ''; S.npCount = 1; S.npItems = [{id: '1', title: '회귀 결재', path: '/docs/1'}]; render(); });
    check('결재 대기 카드', await ev(() => !!document.querySelector('.npitem[data-arg="/docs/1"]')));
    await ev(() => { S.npCount = 0; S.npItems = []; render(); });
    check('결재 없으면 카드 없음', await ev(() => !document.querySelector('.npcard')));
  } catch (e) { bad++; console.log('✗ 점검 중 멈춤:', e.message); }
  check('스크립트 오류 없음', errs.length === 0, errs);
  await b.close(); srv.close();
  console.log(bad ? '문제 ' + bad + '건 (통과 ' + ok + ')' : '✓ 기존 기능 흐름 정상 (' + ok + '개 점검)');
  process.exit(bad ? 1 : 0);
});
