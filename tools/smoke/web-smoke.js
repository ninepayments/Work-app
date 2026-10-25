// 웹앱 회귀 점검: 데모 모드(#demo)로 모든 화면을 휴대폰·PC 크기로 열어 보고 스크립트 오류가 없는지 본다.
// 쓰는 법: node tools/smoke/web-smoke.js   (Playwright 필요 — 수정 후 배포 전에 꼭 돌린다)
const http = require('http'), fs = require('fs'), path = require('path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..', '..', 'web');
const types = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.json': 'application/json', '.svg': 'image/svg+xml'};
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, {'Content-Type': types[path.extname(f)] || 'application/octet-stream'}); r.end(b); });
});
srv.listen(0, async () => {
  const url = 'http://localhost:' + srv.address().port + '/#demo';
  const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const subs = [...new Set([...src.matchAll(/case '([a-z]+)': return/g)].map(m => m[1]))];
  const b = await chromium.launch(); let bad = 0;
  for (const [w, h] of [[400, 800], [1280, 800]]) {
    const p = await b.newPage({viewport: {width: w, height: h}});
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(url); await p.waitForTimeout(1500);
    for (const k of subs) {
      const before = errs.length;
      await p.evaluate(k => { S.menu = false; S.room = 0; if (['task', 'project', 'calendar', 'chat', 'all'].includes(k)) { S.tab = k; S.sub = ''; } else { S.tab = 'all'; S.sub = k; } render(); }, k);
      await p.waitForTimeout(80);
      const txt = await p.evaluate(() => document.body.innerText.length);
      if (errs.length > before || txt < 20) { bad++; console.log('✗', w + 'px', k, errs.slice(before).join(' | ') || '빈 화면'); }
    }
    // 자주 쓰는 창도 열어 본다
    for (const a of ['newTask', 'newPreq', 'reqQuickEdit']) {
      const before = errs.length;
      await p.evaluate(a => { try { ACT[a] && ACT[a](); } finally { setTimeout(() => window.closeModal && closeModal(), 50); } }, a);
      await p.waitForTimeout(120);
      if (errs.length > before) { bad++; console.log('✗', w + 'px', 'ACT.' + a, errs.slice(before).join(' | ')); }
    }
    await p.close();
  }
  await b.close(); srv.close();
  console.log(bad ? '문제 ' + bad + '건' : '✓ 모든 화면 정상 (' + subs.length + '개 화면 × 2 크기)');
  process.exit(bad ? 1 : 0);
});
