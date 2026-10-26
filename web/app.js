'use strict';
/* 나인패밀리 웹앱 — 앱과 같은 Firebase(nine-family)를 쓴다. 문서는 {j: JSON문자열, u: 시각} 형식. */
const CFG = {apiKey: 'AIzaSyCsA-M6QGGGk0owyDXzziv1X79TqF5NptI', authDomain: 'nine-family.firebaseapp.com', projectId: 'nine-family',
  storageBucket: 'nine-family.firebasestorage.app', messagingSenderId: '48232341344', appId: '1:48232341344:web:19be016c9c1c1de5a34805'};
const VERSION = '웹 0.0.60';
const DEMO = location.hash === '#demo';
const COLLS = ['users', 'tasks', 'notices', 'projects', 'events', 'merchants', 'rooms', 'msgs', 'profiles', 'mlogs', 'config', 'stock', 'contracts', 'deposits', 'costs', 'reports', 'library', 'contacts'];
const TYPES = ['신규 설치', '방문AS', '원격AS', '영업 방문', '서류 접수', '카드사 서류', '기타']; // 예전 업무의 'AS' 는 그대로 보여요
const KINDS = ['방문A/S', '원격A/S', '전화응대', '용지신청', '기타'];
// 업무 요청 '가맹점 요청사항' 빠른 선택 버튼 — 관리자가 ☰ → 관리자 → 빠른 선택 버튼에서 바꾼다 (config key 'req_quick')
const reqQuickDoc = () => list('config').find(c => c.key === 'req_quick');
const reqQuick = () => { const c = reqQuickDoc(); return c && Array.isArray(c.items) ? c.items.filter(Boolean) : ['용지신청']; };
// 직원 이름은 이름만(직함 X): '박상언 대표님' → '박상언'. 권한은 권한 설정으로 준다.
const stripTitle = n => String(n || '').trim().replace(/\s+(대표님|대표이사|대표|회장님|회장|본부장님|본부장|지사장님|지사장|부장님|부장|차장|과장|대리|주임|팀장님|팀장|실장님|실장|이사님|이사|사원)$/, '').trim();
const logKind = k => (k === 'AS' || k === '방문' || k === '방문 A/S') ? '방문A/S' : k === '원격 A/S' ? '원격A/S' : k === '전화 응대' ? '전화응대' : k;
const logReq = g => (g.req !== undefined || g.res !== undefined) ? (g.req || '') : (g.text || '');
const logRes = g => g.res || '';
const logAll = g => (g.mname || '') + ' ' + logReq(g) + ' ' + logRes(g) + ' ' + (g.text || '');
const ST = {'지시됨': '미확인', '확인함': '진행중', '진행중': '진행중', '보류': '보류', '완료': '완료'};
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

let auth, fs;
const S = {logLimit: 30, lmq: '', me: null, uid: 0, phone: '', tab: 'task', sub: '', data: {}, pushed: {}, taskFilter: 0, showAll: false, projFilter: 0,
  room: 0, dmDraft: null, calY: 0, calM: 0, calSel: '', mq: '', mlimit: 50, allQ: '', chatQ: ''};
COLLS.forEach(c => S.data[c] = new Map());

// ---------- 작은 도구 ----------
function toast(s) {
  const t = $('#toast');
  t.textContent = s; t.classList.add('on');
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('on'), 2400);
}
const pad = n => String(n).padStart(2, '0');
function nowStr() { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
const todayStr = () => nowStr().slice(0, 10);
function e164(s) { const d = String(s || '').replace(/[^0-9+]/g, ''); if (d.startsWith('+')) return d; if (d.startsWith('0')) return '+82' + d.slice(1); if (d.startsWith('82')) return '+' + d; return '+82' + d; }
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function cho(s) { let o = ''; for (const ch of s) { const c = ch.charCodeAt(0); o += c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch; } return o; }
// 한글을 자판 한 번 누르는 단위(자모)로 푼다. '삼영' → 'ㅅㅏㅁㅇㅕㅇ', '과' → 'ㄱㅗㅏ', '닭' → 'ㄷㅏㄹㄱ'
// 이렇게 비교하면 치는 중인 글자('사', '삼여', '삼영ㅍ')도 '삼영푸드'에 걸린다.
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
const JAMO2 = {'ㄳ': 'ㄱㅅ', 'ㄵ': 'ㄴㅈ', 'ㄶ': 'ㄴㅎ', 'ㄺ': 'ㄹㄱ', 'ㄻ': 'ㄹㅁ', 'ㄼ': 'ㄹㅂ', 'ㄽ': 'ㄹㅅ', 'ㄾ': 'ㄹㅌ', 'ㄿ': 'ㄹㅍ', 'ㅀ': 'ㄹㅎ', 'ㅄ': 'ㅂㅅ', 'ㅘ': 'ㅗㅏ', 'ㅙ': 'ㅗㅐ', 'ㅚ': 'ㅗㅣ', 'ㅝ': 'ㅜㅓ', 'ㅞ': 'ㅜㅔ', 'ㅟ': 'ㅜㅣ', 'ㅢ': 'ㅡㅣ'};
const jamoCache = new Map();
function jamo(s) {
  let o = jamoCache.get(s); if (o !== undefined) return o; o = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xAC00;
    if (c >= 0 && c <= 11171) o += CHO[Math.floor(c / 588)] + JUNG[Math.floor(c % 588 / 28)] + JONG[c % 28];
    else o += JAMO2[ch] || ch;
  }
  if (jamoCache.size > 20000) jamoCache.clear();
  jamoCache.set(s, o); return o;
}
function kmatch(text, q) {
  q = (q || '').trim().toLowerCase(); if (!q) return true;
  const t = String(text || '').toLowerCase();
  if (t.includes(q)) return true;
  if (/^[ㄱ-ㅎ\s]+$/.test(q)) return cho(t).includes(q.replace(/\s+/g, '')) || cho(t).includes(q); // 초성만: 'ㅅㅇㅍ'
  if (/^[0-9\-\s]+$/.test(q)) { const d = q.replace(/\D/g, ''); return !!d && t.split(/\s+/).some(w => w.replace(/\D/g, '').includes(d)); } // 번호는 '-' 없이도
  return /[가-힣ㄱ-ㅣ]/.test(q) && jamo(t).includes(jamo(q));
}
const list = c => [...S.data[c].values()].filter(o => !o.deleted);
const byId = (c, id) => S.data[c].get(Number(id));
const user = id => byId('users', id);
const uname = id => { const u = user(id); return u ? u.name : (id ? '직원' + id : ''); };
const wname = m => m.wname || uname(m.who); // 글쓴이 이름 (홈페이지 접수처럼 직원이 아닌 글은 wname)
const can = p => !!(S.me && (S.me.perms || []).includes(p));
function nextId() { for (;;) { const n = 1 + Math.floor(Math.random() * 2e9); if (!COLLS.some(c => S.data[c].has(n))) return n; } }
function wonFmt(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }

// ---------- 서버 저장 ----------
function ser(o) { return JSON.stringify(o).replace(/\//g, '\\/'); } // 앱(org.json)과 같은 글자 모양
function put(coll, o) {
  S.data[coll].set(o.id, o);
  if (DEMO) return;
  const isNew = !S.pushed[coll + '/' + o.id];
  const j = ser(o); S.pushed[coll + '/' + o.id] = j;
  const m = {j, u: Date.now()}; let target = coll, priv = false;
  if (coll === 'msgs' && isNew) m.s = firebase.firestore.FieldValue.serverTimestamp(); // 메시지 순서는 서버가 받은 시각으로 (기기 시계가 달라도 순서가 맞게)
  if ((coll === 'rooms' || coll === 'msgs') && o.mem && o.mem.length) { m.mem = o.mem; target = coll === 'rooms' ? 'prooms' : 'pmsgs'; priv = true; }
  if (coll === 'profiles') m.who = o.id;
  if (coll === 'contracts' || coll === 'reports') { m.who = o.who; m.date = o.date || ''; } // 서버 규칙이 '내 것만'을 이걸로 판단
  S.pend = (S.pend || 0) + 1; syncBadge();
  fs.collection(target).doc(String(o.id)).set(m, coll === 'msgs' ? {merge: true} : {}).then(() => { S.pend--; syncBadge(); }).catch(e => { S.pend--; syncBadge(); toast('저장하지 못했어요: ' + (e.code || e.message)); });
  if (!(priv || coll === 'msgs' || coll === 'profiles')) fs.collection('audit').add({c: coll, id: o.id, by: S.uid, u: Date.now(), j}).catch(() => {});
}
// 화면 위쪽 작은 띠: 저장 중 / 인터넷 끊김(저장 대기) — 서버에 다 들어가면 사라진다
let syncT = 0, syncSince = 0;
function syncBadge() { // 저장이 10초 넘게 안 될 때만 '저장 중'을 보인다(보통은 순식간이라 깜빡이지 않게). 인터넷 끊김은 바로
  let b = $('#syncb'); if (!b) { b = document.createElement('div'); b.id = 'syncb'; document.body.appendChild(b); }
  const off = !navigator.onLine;
  if (!(S.pend > 0)) syncSince = 0; else if (!syncSince) { syncSince = Date.now(); clearTimeout(syncT); syncT = setTimeout(syncBadge, 10100); }
  const n = S.pend > 0 && (off || Date.now() - syncSince >= 10000) ? S.pend : 0;
  b.className = off ? 'off' : n ? 'on' : '';
  b.textContent = off ? '📴 인터넷 끊김' + (n ? ' · 저장 대기 ' + n + '건 (연결되면 자동으로 저장돼요)' : ' · 기기에 받아 둔 자료로 보는 중') : n ? '⏳ 서버에 저장 중… ' + n + '건' : '';
}
window.addEventListener('online', syncBadge); window.addEventListener('offline', syncBadge);
function create(coll, extra) { const o = Object.assign({id: nextId(), created: nowStr()}, extra || {}); return o; }

// ---------- 서버 읽기 ----------
let unsubs = [], renderT = 0;
S.sts = {}; // 메시지 id → 서버가 받은 시각
const msgOrder = m => S.sts[m.id] || m.ts || 0;
function later() { clearTimeout(renderT); renderT = setTimeout(render, 200); }
function attach() {
  const srvs = COLLS.map(c => [c, c]);
  srvs.push(['rooms', 'prooms'], ['msgs', 'pmsgs']);
  srvs.forEach(([coll, srv]) => {
    const priv = srv === 'prooms' || srv === 'pmsgs';
    if (coll === 'costs' && !canPerf()) return; // 단가는 실적 권한자만
    let q = fs.collection(srv);
    if (priv) q = q.where('mem', 'array-contains', S.phone);
    if (coll === 'contracts' && !canPerf()) q = q.where('who', '==', S.uid); // 실적 권한이 없으면 내 계약만
    if (coll === 'reports' && !canReport()) q = q.where('who', '==', S.uid); // 보고 열람 권한이 없으면 내 보고만
    if (srv === 'msgs') q = q.orderBy('u', 'desc').limit(400);
    let first = true;
    unsubs.push(q.onSnapshot(snap => {
      let ch = false;
      snap.docChanges().forEach(dc => {
        if (dc.type === 'removed') return;
        const j = dc.doc.get('j'); if (!j) return;
        try {
          const o = JSON.parse(j);
          if (coll === 'msgs') { const sv = dc.doc.get('s', {serverTimestamps: 'estimate'}); if (sv && sv.toMillis) { const t = sv.toMillis(); if (S.sts[o.id] !== t) { S.sts[o.id] = t; ch = true; } } }
          if (S.pushed[coll + '/' + o.id] === j) return;
          const prev = S.data[coll].get(o.id);
          S.pushed[coll + '/' + o.id] = j; S.data[coll].set(o.id, o); ch = true;
          if (!first) watchNew(coll, o, prev);
        } catch (e) {}
      });
      first = false;
      if (coll === 'users' && !snap.metadata.fromCache) { refreshMe(); if (!S.me) return noProfile(); }
      if (ch) { S.ready = true; if (S.me === null || coll === 'users') refreshMe(); later(); }
      if (coll === 'merchants' && !snap.metadata.fromCache) { clearTimeout(S.bkT); S.bkT = setTimeout(autoBackup, 15000); }
    }, err => console.warn(srv, err.code)));
  });
}
function refreshMe() { if (S.uid) { const u = user(S.uid); if (u) S.me = u; } }


// ---------- 알림 (웹앱을 열어 둔 동안) ----------
// 화면이 꺼져 있거나 웹앱을 닫았을 때 오는 진짜 푸시 알림은 Blaze 전환 뒤 서버(FCM)가 있어야 한다.
// 그 전까지: 열어 둔 동안 새 업무·채팅·공지가 오면 소리·진동·화면 안내, PC는 다른 창을 보고 있어도 브라우저 알림, 탭 제목에 숫자.
// 알림 소리는 업무·채팅을 따로 끄고 켠다. 채팅방마다 소리 끄기도 된다(이 기기에만 기억).
const soundOn = () => LS('snd_' + S.uid) !== '0'; // 업무·물품요청·공지
const chatSndOn = () => LS('sndc_' + S.uid) !== '0'; // 채팅 “나인톡!”
const pushTaskOn = () => LS('ntask_' + S.uid) !== '0', pushChatOn = () => LS('nchat_' + S.uid) !== '0'; // 알림 받기 (끄면 알림창·소리 모두 없음)
const mutedRooms = () => (LS('mute_' + S.uid) || '').split(',').filter(Boolean).map(Number);
const roomMuted = id => mutedRooms().includes(Number(id));
let actx = null;
let lastSay = 0;
// 미리 녹음한 음성 파일(web/snd)을 튼다 — 기기에 한국어 음성이 없어도 들린다. 파일을 못 틀면 기기 음성으로 말한다.
const SND = {'업무가 배정되었습니다': 'snd/snd_task.mp3', '나인톡': 'snd/snd_talk.mp3', '물품요청이 들어왔습니다': 'snd/snd_preq.mp3', '물품이 발송되었습니다': 'snd/snd_ship.mp3', '새 공지가 있습니다': 'snd/snd_notice.mp3'};
const sndEl = {};
let audioOk = false;
function unlockAudio() { // 브라우저는 사람이 한 번 누르기 전에는 소리를 막는다 → 첫 클릭·터치 때 소리를 깨워 둔다
  if (audioOk) return; audioOk = true;
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {}
  Object.entries(SND).forEach(([k, src]) => { try { const el = new Audio(src); el.preload = 'auto'; el.muted = true; el.play().then(() => { el.pause(); el.currentTime = 0; el.muted = false; }).catch(() => { el.muted = false; }); sndEl[k] = el; } catch (e) {} });
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, unlockAudio, {capture: true, passive: true}));
function sayIt(say) {
  const ttsFallback = () => { try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(say); u.lang = 'ko-KR'; u.rate = 1.05; speechSynthesis.speak(u); } } catch (e) {} };
  const src = SND[say]; if (!src) return ttsFallback();
  try { const el = sndEl[say] || (sndEl[say] = new Audio(src)); el.currentTime = 0; el.volume = 1; const p = el.play(); if (p && p.catch) p.catch(ttsFallback); } catch (e) { ttsFallback(); }
}
function beep(say) { // 업무: '띵동' 두 음 + “업무가 배정되었습니다” / 채팅: 카톡처럼 “나인톡!”만 짧게
  if (say === '나인톡') {
    if (!chatSndOn()) return;
    if (navigator.vibrate) navigator.vibrate(80);
    if (Date.now() - lastSay > 1500) { lastSay = Date.now(); sayIt(say); }
    return;
  }
  if (!soundOn()) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
    [[988, 0], [784, 0.16]].forEach(([f, t]) => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = f; g.gain.setValueAtTime(0.18, actx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + t + 0.4); o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + 0.4); });
  } catch (e) {}
  if (navigator.vibrate) navigator.vibrate(120);
  if (say && Date.now() - lastSay > 2500) { // 연달아 오면 한 번만 말한다
    lastSay = Date.now();
    setTimeout(() => sayIt(say), 450);
  }
}
function notify(title, body, go, say) {
  beep(say);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try { const n = new Notification(title, {body, icon: 'icon-192.png', tag: title}); n.onclick = () => { window.focus(); go(); n.close(); }; return; } catch (e) {}
  }
  toast(title + ' — ' + body);
}
function watchNew(coll, o, prev) {
  if (!S.me || o.deleted) return;
  if (coll === 'msgs' && pushChatOn() && !prev && o.who !== S.uid && o.ts > Date.now() - 5 * 60000 && !(S.room === o.room && !document.hidden)) {
    const r = byId('rooms', o.room); notify('💬 ' + (r ? roomTitle(r) : '채팅'), wname(o) + ': ' + msgText(o), () => { S.tab = 'chat'; S.sub = ''; S.room = o.room; render(); }, roomMuted(o.room) ? '' : '나인톡');
  }
  if (!pushTaskOn()) return; // 아래는 업무 쪽 알림
  if (coll === 'tasks' && o.assignee === S.uid && o.status === '지시됨' && o.creator !== S.uid && (!prev || prev.assignee !== S.uid)) {
    notify('📋 새 업무', o.title + ' (' + uname(o.creator) + ')', () => { S.tab = 'task'; S.sub = ''; render(); ACT.task(o.id); }, o.preq ? '물품요청이 들어왔습니다' : '업무가 배정되었습니다');
  }
  if (coll === 'tasks' && o.preq && o.creator === S.uid && prev && prev.preq && prev.preq.stage !== '발송함' && o.preq.stage === '발송함') {
    notify('📦 물품 발송', o.preq.to + ' — ' + preqItems(o) + ' · 입고 확인을 눌러 주세요', () => ACT.preq(o.id), '물품이 발송되었습니다');
  }
  if (coll === 'notices' && !prev && o.author !== S.uid) notify('📢 새 공지', o.title, () => { S.tab = 'all'; S.sub = 'notice'; render(); ACT.notice(o.id); }, '새 공지가 있습니다');
}
function syncTitle(n) { document.title = (n ? '(' + n + ') ' : '') + '나인패밀리'; }

// ---------- 뒤로가기 (폰 뒤로가기 · 브라우저 뒤로 버튼) ----------
// 안드로이드 앱처럼 한 단계씩 닫는다: 카메라 → 팝업 → 대화방 → 전체 메뉴 → 하위 화면 → 첫 화면. 첫 화면에서 한 번 더 누르면 나간다.
let navArmed = false;
function armBack() { if (navArmed || S.exitWarn || DEMO && !S.me) return; try { history.pushState({nine: 1}, ''); navArmed = true; } catch (e) {} }
function stepBack() {
  if (window.scanStop) { window.scanStop(); return true; }
  if ($('#modal')) { closeModal(); return true; }
  if (S.room) { ACT.leave(); return true; }
  if (S.menu) { S.menu = false; render(); return true; }
  if (S.sub) { if (isWide()) ACT.home(); else { S.sub = ''; render(); } return true; }
  if (S.tab !== 'task') { ACT.home(); return true; }
  return false;
}
window.addEventListener('popstate', () => {
  navArmed = false; if (!S.me) return;
  if (stepBack()) armBack(); else { S.exitWarn = true; askConfirm('앱 종료', '나인패밀리를 종료할까요?', '종료', () => history.back()); const c = $('#modal [data-act=close]'); if (c) c.onclick = ev => { ev.stopPropagation(); closeModal(); S.exitWarn = false; armBack(); }; } // 취소하면 다시 뒤로가기를 받을 준비
});

// ---------- 로그인 ----------
let confirmation = null, verifier = null;
function loginView(step, msg) {
  const r = $('#root');
  r.innerHTML = '<div class="login"><h1>오늘도 반갑습니다.</h1><div class="sub">등록된 휴대폰 번호로 문자 인증을 해 주세요.<br>(한 번 로그인하면 계속 유지됩니다)</div>' +
    (step === 'code'
      ? '<input id="code" inputmode="numeric" maxlength="6" placeholder="문자로 받은 인증번호 6자리" autocomplete="one-time-code"><button class="btn gold full" id="go">확인</button><button class="btn full" id="again" disabled>인증번호 다시 받기</button><button class="btn full" id="back">번호 다시 입력</button>'
      : '<input id="ph" type="tel" inputmode="tel" placeholder="휴대폰 번호 (예: 01012345678)" value="' + esc(S.pendingPhone || '') + '"><button class="btn gold full" id="go">인증번호 받기</button>') +
    '<div class="sub" id="msg" style="color:#b3261e;margin-top:12px">' + esc(msg || '') + '</div><div class="sub" style="margin-top:30px">나인패밀리 ' + VERSION + '</div></div>';
  setTimeout(prepVerifier, 0);
  if (step === 'code') {
    const code = $('#code'); code.focus();
    code.oninput = () => { if (code.value.length === 6) $('#go').click(); };
    $('#go').onclick = async () => {
      const c = code.value.trim(); if (c.length < 6) return toast('인증번호 6자리를 입력해 주세요.');
      $('#go').disabled = true; $('#go').textContent = '확인하는 중…';
      try { const res = await confirmation.confirm(c); await afterLogin(res.user); } catch (e) {
        loginView('code', e.code === 'auth/invalid-verification-code' || e.code === 'auth/code-expired' ? '인증번호가 맞지 않아요. 다시 확인해 주세요.' : authMsg(e));
      }
    };
    $('#back').onclick = () => loginView('phone');
    let n = 60; const ag = $('#again');
    const tm = setInterval(() => { if (!ag.isConnected) return clearInterval(tm); n--; if (n <= 0) { clearInterval(tm); ag.disabled = false; ag.textContent = '인증번호 다시 받기'; } else ag.textContent = '인증번호 다시 받기 (' + n + '초 뒤)'; }, 1000);
    ag.textContent = '인증번호 다시 받기 (60초 뒤)';
    ag.onclick = () => sendCode(S.pendingPhone);
  } else {
    $('#go').onclick = () => {
      const raw = $('#ph').value.trim();
      if (raw.replace(/\D/g, '').length < 10) return toast('휴대폰 번호를 정확히 입력해 주세요.');
      S.pendingPhone = raw; $('#go').disabled = true; $('#go').textContent = '문자 보내는 중…'; sendCode(raw);
    };
  }
}
function authMsg(e) {
  const c = e.code || '';
  if (c.includes('too-many')) return '인증 요청이 너무 많아 잠시 막혔어요. 30분쯤 뒤에 다시 시도해 주세요.';
  if (c.includes('invalid-phone')) return '휴대폰 번호 형식이 맞지 않아요.';
  if (c.includes('network')) return '인터넷 연결이 불안정해요. 다시 시도해 주세요.';
  return '인증에 실패했어요. 잠시 뒤 다시 시도해 주세요. (' + (c || e.message) + ')';
}
// 사람 확인(보이지 않는 reCAPTCHA)은 로그인 화면이 열릴 때 미리 준비해 둔다 → '인증번호 받기'를 누른 뒤 기다리는 시간이 줄어든다
let verifierReady = null;
function prepVerifier() {
  if (DEMO || !auth || verifier) return;
  $('#recaptcha').innerHTML = '';
  verifier = new firebase.auth.RecaptchaVerifier('recaptcha', {size: 'invisible'});
  verifierReady = verifier.render().catch(() => resetVerifier());
}
function resetVerifier() { if (verifier) { try { verifier.clear(); } catch (e) {} } verifier = null; verifierReady = null; } // 한 번 쓴 확인은 다시 못 쓴다
async function sendCode(raw) {
  try {
    prepVerifier(); await verifierReady; if (!verifier) prepVerifier();
    confirmation = await auth.signInWithPhoneNumber(e164(raw), verifier);
    resetVerifier(); loginView('code');
  } catch (e) { resetVerifier(); loginView('phone', authMsg(e)); }
}
async function afterLogin(fu) {
  const phone = fu.phoneNumber; S.phone = phone;
  $('#root').innerHTML = '<div class="login"><h1>불러오는 중…</h1><div class="sub">서버에서 내 정보를 가져오고 있어요.</div></div>';
  try {
    const pd = await fs.collection('phones').doc(phone).get();
    if (!pd.exists || pd.get('active') !== true) { await auth.signOut(); return loginView('phone', '등록되지 않은 번호입니다. 관리자에게 등록을 요청해 주세요.'); }
    S.uid = Number(pd.get('uid')); S.caps = {perf: !!pd.get('perf'), admin: !!pd.get('admin'), report: !!pd.get('report')};
    attach(); render();
    setTimeout(() => { if (!S.me && !S.noProfile) { $('#root').innerHTML = '<div class="login"><h1>불러오는 중…</h1><div class="sub">인터넷이 느려서 시간이 걸리고 있어요. 잠시만 기다려 주세요.</div><button class="btn full" id="rl">다시 불러오기</button></div>'; $('#rl').onclick = () => location.reload(); } }, 12000);
  } catch (e) { toast('내 정보를 불러오지 못했어요.'); loginView('phone', '내 정보를 불러오지 못했어요. 다시 시도해 주세요.'); }
}
function noProfile() { // 서버에서 받은 직원 목록에 내가 없을 때만 (느린 인터넷을 '처음 왔다'로 오해하지 않게)
  S.noProfile = true;
  $('#root').innerHTML = '<div class="login"><h1>처음 오셨나요?</h1><div class="sub">직원 정보가 아직 없어요. 앱에서 한 번 로그인한 뒤 다시 열어 주세요.</div><button class="btn full" id="lo">로그아웃</button></div>'; $('#lo').onclick = logout;
}
async function logout() {
  unsubs.forEach(u => u()); unsubs = [];
  COLLS.forEach(c => S.data[c].clear()); S.pushed = {}; S.me = null; S.uid = 0;
  try { await auth.signOut(); } catch (e) {}
  loginView('phone');
}

// ---------- 화면 틀 ----------
// 휴대폰(아이폰)은 안드로이드 앱과 같은 화면: 아래 탭 5개(업무·프로젝트·채팅·일정·전체), 나머지 기능은 '전체' 탭 안에 있다.
// PC(넓은 화면)는 토스포스 방식: 위쪽 가로줄에 주 메뉴, 왼쪽 위 ☰ 를 누르면 영역별 전체 메뉴가 펼쳐진다.
const NAVPHONE = [['task', '업무', 'task', ''], ['project', '프로젝트', 'project', ''], ['chat', '채팅', 'chat', ''], ['calendar', '일정', 'calendar', ''], ['all', '☰', 'all', '']];
const NAVPC = [['task', '업무', 'task', ''], ['project', '프로젝트', 'project', ''], ['calendar', '일정', 'calendar', ''], ['merchants', '가맹점', 'all', 'merchants'], ['logs', '응대 기록', 'all', 'logs'], ['memo', '메모', 'all', 'memo']];
const isWide = () => window.innerWidth >= 900;
if (window.nineWin) document.documentElement.classList.add('elec'); // PC 프로그램(제목줄 없는 창): 위쪽 검은 줄을 끌어 창을 옮긴다
// PC 0.0.9 이상: 위쪽 줄 어디든(메뉴 버튼 위라도) 잡고 끌면 창이 옮겨진다. 살짝 누르기만 하면 그냥 클릭. 빈 곳을 두 번 누르면 전체 ↔ 작은 창
if (window.nineWin && window.nineWin.move) {
  document.documentElement.classList.add('jsdrag');
  let dg = null;
  document.addEventListener('pointerdown', e => { const t = e.target.closest && e.target.closest('.pctop'); if (!t || e.button !== 0) return; dg = {x: e.screenX, y: e.screenY, on: false, id: e.pointerId, el: t}; }, true);
  document.addEventListener('pointermove', e => {
    if (!dg || e.pointerId !== dg.id) return; const dx = e.screenX - dg.x, dy = e.screenY - dg.y;
    if (!dg.on) { if (Math.abs(dx) + Math.abs(dy) < 6) return; dg.on = true; try { dg.el.setPointerCapture(dg.id); } catch (er) {} }
    dg.x = e.screenX; dg.y = e.screenY; window.nineWin.move(dx, dy);
  }, true);
  const end = e => { if (!dg) return; const was = dg.on; try { dg.el.releasePointerCapture(dg.id); } catch (er) {} dg = null;
    if (was) { const stop = ev => { ev.preventDefault(); ev.stopPropagation(); }; document.addEventListener('click', stop, {capture: true, once: true}); setTimeout(() => document.removeEventListener('click', stop, true), 300); } };
  document.addEventListener('pointerup', end, true); document.addEventListener('pointercancel', end, true);
  document.addEventListener('dblclick', e => { if (!e.target.closest('.pctop') || e.target.closest('button,.logo')) return; window.nineWin.state().then(st => window.nineWin.act(st && st.full ? 'shrink' : 'full')); }, true);
}
function newTaskCount() { return list('tasks').filter(t => t.assignee === S.uid && t.status === '지시됨').length + list('tasks').filter(t => t.preq && t.preq.stage === '발송함' && t.creator === S.uid).length; } // 물품요청이 발송되면 요청한 사람에게 '입고 확인' 알림
function bodyHTML() {
  const k = S.sub || S.tab, wide = isWide();
  if (wide && S.menu) return '<div class="scroll menupg"><div class="col">' + viewMenu(true) + '</div></div>';
  if (S.tab === 'chat' && !S.sub) return viewChat();
  const main = '<div class="scroll"><div class="col">' + (!wide && (S.sub || S.tab !== 'task') ? '<button class="back" data-act="back" aria-label="뒤로가기">‹ 뒤로</button>' : '') + viewBody(k) + '</div></div>';
  const out = wide && k !== 'manual' && k !== 'about' ? '<div class="pcsplit"><aside class="pcside">' + sideHTML(k) + '<div style="height:60px"></div></aside>' + main + '</div>' : main;
  return dockOn() ? '<div class="dockwrap"><div class="dockmain">' + out + '</div><aside class="chatdock">' + viewChat(true) + '</aside></div>' : out;
}
function render() {
  if (S.comp) { later(); return; } // 글자 조합 중에는 화면을 갈아엎지 않는다
  if (!S.me) { refreshMe(); if (!S.me) return; }
  if (S.me.active === false) { toast('사용이 중지된 계정입니다.'); return logout(); }
  const root = $('#root'); const wide = isWide(); if (!wide) S.menu = false;
  if (wide && S.tab === 'chat') { LS('dock_' + S.uid, '1'); S.tab = 'task'; S.sub = ''; } // PC는 채팅 탭 대신 오른쪽 채팅창으로 (알림·프로필에서 대화 열기 등)
  const keepScroll = $('.scroll') ? $('.scroll').scrollTop : 0;
  const mb0 = $('#msgbox'), mbKeep = mb0 && S.mbRoom === S.room ? {top: mb0.scrollTop, bottom: mb0.scrollHeight - mb0.scrollTop - mb0.clientHeight < 120} : null;
  const act = document.activeElement; const focusId = act && act.id; const selPos = act && act.selectionStart; const focusVal = act && act.value;
  if (S.room && S.me) markRead(S.room); // 보고 있는 방은 읽은 것으로 먼저 (숫자가 남지 않게)
  const badges = {task: newTaskCount(), all: unreadNotices(), chat: unreadTotal()};
  syncTitle(badges.task + badges.all + badges.chat); armBack();
  const k = S.sub || S.tab;
  const on = key => wide ? !S.menu && k === key : (key === 'all' ? S.tab === 'all' : k === key);
  const btn = ([key, lb, tab, sub]) => { const n = badges[key]; return '<button data-nav="' + tab + '" data-sub="' + sub + '" class="' + (on(key) ? 'on' : '') + (lb === '☰' ? ' hm" aria-label="전체 메뉴' : '') + '"><span class="t">' + lb + '</span>' + (n ? '<span class="badge">' + n + '</span>' : '') + '</button>'; };
  const body = bodyHTML();
  if (wide) {
    const top = '<header class="pctop"><button class="hamb" data-act="menu" aria-label="' + (S.menu ? '전체 메뉴 닫기' : '전체 메뉴 열기') + '">' + (S.menu ? '✕' : '☰') + (!S.menu && badges.all ? '<span class="badge">' + badges.all + '</span>' : '') + '</button>' +
      '<div class="logo" data-act="home" title="홈으로"><img src="icon-192.png" alt="">나인패밀리</div><nav class="pcnav">' + NAVPC.map(btn).join('') + '</nav>' +
      '<button data-act="installApp" class="inst pcinst" style="display:none">PC에 설치하기</button><div class="me">' + esc(S.me.name) + ' · ' + (can('staff_manage') ? '관리자' : '직원') + '</div>' + '<button class="pcdock' + (LS('dock_' + S.uid) === '1' ? ' on' : '') + '" data-act="dockToggle" title="오른쪽 채팅창 열기·닫기">💬 채팅창' + (badges.chat ? '<span class="badge">' + badges.chat + '</span>' : '') + '</button>' + (window.nineWin ? '<button class="pcwin" data-act="pcWin" aria-label="창 메뉴">⋮</button>' : '') + '</header>';
    root.innerHTML = '<div class="app pc' + (dockOn() ? ' dockon' : '') + '">' + top + chatBarHTML() + '<div class="main">' + body + '</div></div>' + (S.menu ? '' : fab());
  } else {
    root.innerHTML = '<div class="app">' + chatBarHTML() + '<div class="main">' + body + '</div><nav class="nav">' + NAVPHONE.map(btn).join('') + '</nav></div>' + fab();
  }
  syncInstall();
  bind(root);
  const sc = $('.scroll'); if (sc) sc.scrollTop = keepScroll;
  const ms = $('#msgbox'); S.mbRoom = ms ? S.room : 0;
  if (ms) { // 처음 열면 안 읽은 첫 글부터, 그 뒤엔 맨 아래를 보고 있을 때만 새 글 따라 내려간다
    const ul = S.jumpUnread && $('#unreadline'); S.jumpUnread = false;
    const mm = ms.querySelectorAll('.m'), cnt = mm.length, lastMine = cnt > 0 && mm[cnt - 1].classList.contains('me');
    const grew = mbKeep && S.mbCnt && cnt > S.mbCnt;
    if (ul) ms.scrollTop += ul.getBoundingClientRect().top - ms.getBoundingClientRect().top - 40;
    else if (!mbKeep || mbKeep.bottom || (grew && lastMine)) { ms.scrollTop = ms.scrollHeight; S.newMsg = 0; } // 맨 아래를 보고 있거나 내가 보낸 글이면 따라 내려간다
    else { ms.scrollTop = mbKeep.top; if (grew) S.newMsg = (S.newMsg || 0) + cnt - S.mbCnt; } // 위쪽을 읽는 중 → 끌어내리지 않고 '새 메시지 ↓' 버튼
    if (!mbKeep) S.newMsg = 0;
    S.mbCnt = cnt;
    if (S.newMsg) { const nb = document.createElement('button'); nb.className = 'newmsg'; nb.textContent = '새 메시지 ' + S.newMsg + '  ↓'; nb.onclick = () => { S.newMsg = 0; nb.remove(); ms.scrollTop = ms.scrollHeight; }; ms.parentElement.appendChild(nb);
      ms.addEventListener('scroll', () => { if (ms.scrollHeight - ms.scrollTop - ms.clientHeight < 40) { S.newMsg = 0; nb.remove(); } }); }
    loadImages();
  }
  if ($('#msgin')) setTimeout(() => { const mi = $('#msgin'); if (mi && mi.value) growMsg(mi); }, 0);
  if (focusId && $('#' + focusId) && $('#' + focusId).closest('#root')) { const el = $('#' + focusId); if (focusVal != null && el.tagName !== 'SELECT') el.value = focusVal; el.focus(); try { el.setSelectionRange(selPos, selPos); } catch (e) {} }
}
// 검색칸은 그대로 두고 결과(.qres)만 바꾼다 → 한글을 치는 중(조합 중)에도 바로 걸러지고 입력이 끊기지 않는다
function refreshResults() {
  const tmp = document.createElement('div'); tmp.innerHTML = bodyHTML();
  document.querySelectorAll('#root .qres').forEach(el => { const n = tmp.querySelector('.qres[data-for="' + el.dataset.for + '"]'); if (n) el.innerHTML = n.innerHTML; });
}
function viewBody(k) {
  switch (k) {
    case 'task': return isWide() ? viewHome() : viewTasks();
    case 'project': return viewProjects();
    case 'calendar': return viewCalendar();
    case 'all': return viewMenu(false);
    case 'merchants': return viewMerchants();
    case 'notice': return viewNotices();
    case 'logs': return viewAllLogs();
    case 'stock': return viewStock();
    case 'stocklog': return viewStockLog();
    case 'products': return viewProducts();
    case 'memo': return viewMemo();
    case 'preqs': return viewPreqs();
    case 'contracts': return viewContracts();
    case 'deposit': return viewDeposits();
    case 'myperf': return viewPerf(true);
    case 'perf': return canPerf() ? viewPerf(false) : '<div class="empty">실적 보기 권한이 있어야 볼 수 있어요.</div>';
    case 'profit': return viewProfit();
    case 'history': return viewHistory();
    case 'daily': return viewDaily();
    case 'reportview': return viewReportView();
    case 'perfreport': return viewPerfReport();
    case 'library': return viewLibrary();
    case 'contacts': return viewContacts();
    case 'staff': return viewStaff();
    case 'staffinfo': return viewStaffInfo();
    case 'sound': return viewSound('task');
    case 'soundchat': return viewSound('chat');
    case 'sms': return viewSms();
    case 'manual': return viewManual();
    case 'about': return viewAbout();
    default: return viewTasks();
  }
}
function fab() {
  const k = S.sub || S.tab;
  const map = {task: 'newTask', project: 'newProject', merchants: canEditMerchant() ? 'newMerchant' : '', calendar: can('staff_manage') ? 'newEvent' : '', notice: can('notice_write') ? 'newNotice' : '', stock: 'newStock', contracts: 'newContract', deposit: 'newDeposit', library: 'newLib', contacts: 'newContact', staff: can('staff_manage') ? 'newStaff' : ''};
  return map[k] ? '<button class="fab" data-act="' + map[k] + '">+</button>' : '';
}
function bind(root) {
  root.onclick = ev => {
    S.exitWarn = false;
    const bb = ev.target.closest('.bub[data-mid]');
    if (bb && !ev.target.closest('a,[data-act]')) { clearTimeout(S.tapT); if (S.tapId === bb.dataset.mid) { S.tapId = 0; return ACT.react(bb.dataset.mid + '|❤️'); } S.tapId = bb.dataset.mid; S.tapT = setTimeout(() => { S.tapId = 0; ACT.msgMenu(bb.dataset.mid); }, 280); return; }
    const n = ev.target.closest('[data-nav]'); if (n) { S.tab = n.dataset.nav; S.sub = n.dataset.sub || ''; S.room = 0; S.menu = false; return render(); }
    const a = ev.target.closest('[data-act]'); if (a) { ACT[a.dataset.act] && ACT[a.dataset.act](a.dataset.arg, a, ev); }
  };
  // 한글은 글자를 조합하는 동안 입력칸을 다시 그리면 'ㅌㅗㅅㅡ' 처럼 쪼개진다 → 화면 전체는 조합이 끝난 뒤에만 다시 그린다
  if (root.__bound) return; root.__bound = true; // 이벤트 위임은 한 번만 건다 (render 때마다 다시 걸면 중복됨)
  const keep = t => { if (t && t.dataset && t.dataset.keep) (S.keep = S.keep || {})[t.dataset.keep] = t.value; };
  root.addEventListener('input', ev => { keep(ev.target); if (ev.target.id === 'f_sms') { const t = ev.target.value, by = smsBytes(t); $('#smscnt').textContent = t.length + '자 · ' + by + '바이트' + (by > 90 ? ' (90바이트를 넘으면 장문 문자로 나가요)' : ''); } });
  const apply = t => { if (t && t.dataset && t.dataset.q) { S[t.dataset.q] = t.value; if (t.dataset.q === 'mq') S.mlimit = 50; refreshResults(); } };
  root.addEventListener('input', ev => apply(ev.target));
  root.addEventListener('compositionstart', () => { S.comp = true; });
  root.addEventListener('compositionend', ev => { S.comp = false; apply(ev.target); });
}
const ACT = {};
// 알림 및 소리 설정: 업무 소리 · 채팅 소리를 각각 켜고 끄고 들어 본다
function viewSound(kind) { // kind: 'task' 업무 알림 및 소리 / 'chat' 채팅 알림 및 소리
  const chat = kind === 'chat';
  const np = 'Notification' in window ? Notification.permission : 'none';
  const row = (title, desc, on, tog, test) => '<div class="card"><div class="row"><div class="grow"><div class="t1">' + title + '</div><div class="t2" style="white-space:normal">' + desc + '</div></div><button class="btn ' + (on ? 'gold' : '') + '" data-act="' + tog + '" style="min-width:72px">' + (on ? '켜짐' : '꺼짐') + '</button></div>' + (test ? '<button class="btn tint full" data-act="' + test + '" style="margin-top:10px">▶ 들어 보기</button>' : '') + '</div>';
  return '<h1>' + (chat ? '채팅' : '업무') + ' 알림 및 소리 설정</h1><div class="sub">이 기기에서만 적용돼요. 소리가 안 나면 기기 볼륨을 올리고 화면을 한 번 누른 뒤 다시 들어 보세요.</div>' +
    (chat ? row('🔔 채팅 알림 받기', '채팅방마다 알림 1개만 떠요(새 글이 오면 그 방 알림이 바뀌어요) · 방 하나만 끄려면 그 방 위 🔔 (끄면 알림·소리 모두 꺼져요, 빨간 숫자는 그대로)', pushChatOn(), 'pushChatToggle') +
      row('💬 채팅 알림 소리', '카톡처럼 짧게 “나인톡!” · 채팅방 하나만 끄려면 그 방 위 🔔 를 눌러요', chatSndOn(), 'chatSndToggle', 'chatSndTest')
    : row('🔔 업무 알림 받기', '새 업무·물품요청·발송·공지를 알림으로 받아요 (끄면 알림·소리 모두 꺼져요, 빨간 숫자는 그대로)', pushTaskOn(), 'pushTaskToggle') +
      row('📋 업무 알림 소리', '‘띵동’ + “업무가 배정되었습니다” (물품요청·발송·공지도 같은 설정)', soundOn(), 'soundToggle', 'soundTest')) +
    '<div class="card" data-act="notifyOn"><div class="row"><div class="grow"><div class="t1">🔔 화면 알림 (이 기기)</div><div class="t2" style="white-space:normal">PC는 다른 창을 보고 있어도 알림이 떠요. 웹앱을 닫으면 알림이 오지 않아요.</div></div><b>' + (np === 'granted' ? '켜짐' : np === 'none' ? '소리만' : '켜기 ›') + '</b></div></div>';
}
ACT.notifyOn = () => {
  if (!('Notification' in window)) { toast('이 기기는 브라우저 알림을 못 써요. 웹앱을 열어 둔 동안 소리·진동으로 알려 드려요.'); return; }
  Notification.requestPermission().then(r => { toast(r === 'granted' ? '알림을 켰어요. 웹앱을 열어 둔 동안 새 업무·채팅·공지를 알려 드려요.' : '알림이 꺼져 있어요. 브라우저 설정에서 이 사이트 알림을 허용해 주세요.'); render(); });
};
ACT.soundTest = () => { unlockAudio(); if (!soundOn()) return toast('업무 알림 소리가 꺼져 있어요. 먼저 켜 주세요.'); lastSay = 0; beep('업무가 배정되었습니다'); };
ACT.chatSndTest = () => { unlockAudio(); if (!chatSndOn()) return toast('채팅 알림 소리가 꺼져 있어요. 먼저 켜 주세요.'); lastSay = 0; beep('나인톡'); };
ACT.pushTaskToggle = () => { LS('ntask_' + S.uid, pushTaskOn() ? '0' : '1'); toast(pushTaskOn() ? '업무 알림을 켰어요.' : '업무 알림을 껐어요.'); render(); };
ACT.pushChatToggle = () => { LS('nchat_' + S.uid, pushChatOn() ? '0' : '1'); toast(pushChatOn() ? '채팅 알림을 켰어요.' : '채팅 알림을 껐어요.'); render(); };
ACT.soundToggle = () => { LS('snd_' + S.uid, soundOn() ? '0' : '1'); toast(soundOn() ? '업무 알림 소리를 켰어요.' : '업무 알림 소리를 껐어요.'); render(); };
ACT.chatSndToggle = () => { LS('sndc_' + S.uid, chatSndOn() ? '0' : '1'); toast(chatSndOn() ? '채팅 알림 소리(나인톡)를 켰어요.' : '채팅 알림 소리를 껐어요.'); render(); };
ACT.roomMute = () => { const m = mutedRooms(), id = Number(S.room); LS('mute_' + S.uid, (m.includes(id) ? m.filter(x => x !== id) : m.concat(id)).join(',')); toast(roomMuted(id) ? '이 채팅방 알림 소리를 껐어요.' : '이 채팅방 알림 소리를 켰어요.'); render(); };

// ---------- 업무 ----------
function stColor(s) { return {'지시됨': ['#fff1db', '#8a5200'], '진행중': ['#f7efd9', '#8f6b14'], '보류': ['#ffe9e5', '#b3261e'], '완료': ['#e3f6ee', '#0b7a55']}[s] || ['#eef0f4', '#4a4f5e']; }
function viewTasks(noHero) {
  const all = list('tasks'); const today = todayStr();
  let open = 0, done = 0, fresh = 0, doing = 0, held = 0;
  all.forEach(t => { if (t.assignee !== S.uid) return; if (t.status === '완료') { if ((t.doneAt || '').startsWith(today)) done++; } else { open++; if (t.status === '지시됨') fresh++; if (t.status === '진행중' || t.status === '확인함') doing++; if (t.status === '보류') held++; } });
  const ratio = open + done ? Math.round(100 * done / (open + done)) : 0;
  const scope = all.filter(t => (S.showAll && can('task_view_all')) || t.assignee === S.uid);
  const F = ['미완료', '미확인', '진행중', '보류', '완료'], FS = ['', '지시됨', '진행중', '보류', '완료'];
  const norm = t => t.status === '확인함' ? '진행중' : t.status;
  const cnt = F.map((f, i) => scope.filter(t => i === 0 ? norm(t) !== '완료' : norm(t) === FS[i]).length);
  const rows = scope.filter(t => S.taskFilter === 0 ? norm(t) !== '완료' : norm(t) === FS[S.taskFilter]).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const exn = expiringContracts().length;
  const expCard = exn ? '<button class="expcard" data-nav="all" data-sub="contracts">⏰ 만료가 3개월 안으로 남은 계약 ' + exn + '건 <span>계약 관리 ›</span></button>' : '';
  return expCard + (noHero ? '' : '<div class="hero"><div class="row"><div class="grow">남은 업무<div class="n">' + open + '건</div></div><div style="text-align:right;font-size:12px">미확인 ' + fresh + ' · 진행 ' + doing + ' · 보류 ' + held + '<br>오늘 완료 ' + done + '</div></div><div class="bar"><i style="width:' + ratio + '%"></i></div></div>') +
    (can('task_view_all') ? '<div class="pills"><button class="pill ' + (!S.showAll ? 'on' : '') + '" data-act="scope" data-arg="0">내 업무</button><button class="pill ' + (S.showAll ? 'on' : '') + '" data-act="scope" data-arg="1">전체 업무</button></div>' : '') +
    '<div class="sub" style="margin-top:' + (noHero ? 4 : 14) + 'px;font-weight:700">상태별로 보기</div><div class="seg">' + F.map((f, i) => '<button class="' + (S.taskFilter === i ? 'on' : '') + '" data-act="tfilter" data-arg="' + i + '">' + f + '<b>' + cnt[i] + '</b></button>').join('') + '</div>' +
    (rows.length ? rows.map(taskCard).join('') : '<div class="empty">' + (S.taskFilter === 0 ? '진행 중인 업무가 없습니다.' : '\'' + F[S.taskFilter] + '\' 업무가 없습니다.') + '</div>');
}
function taskCard(t) {
  const s = ST[t.status] || t.status; const c = stColor(t.status === '확인함' ? '진행중' : t.status);
  const ty = (t.type || '기타').replace('신규 ', '').replace('영업 방문', '영업').replace('서류 접수', '서류').replace('카드사 서류', '카드').slice(0, 2);
  return '<div class="card" data-act="task" data-arg="' + t.id + '"><div class="row"><div class="tile">' + esc(ty) + '</div><div class="grow"><div class="t1">' + esc(t.title) + '</div><div class="t2">' + esc((t.client ? t.client + ' · ' : '') + uname(t.assignee) + (t.due ? ' · ' + t.due : '')) + '</div></div><span class="chip" style="background:' + c[0] + ';color:' + c[1] + '">' + s + '</span></div></div>';
}
ACT.scope = a => { S.showAll = a === '1'; render(); };
ACT.tfilter = a => { S.taskFilter = Number(a); render(); };
function tlog(t, text) { (t.history = t.history || []).push({t: nowStr(), who: S.uid, text}); }
ACT.task = id => {
  const t = byId('tasks', id); if (!t) return;
  if (t.preq) return ACT.preq(id);
  if (t.status === '지시됨' && t.assignee === S.uid && !t.seenAt) { t.seenAt = nowStr(); tlog(t, '담당자가 열어봄'); put('tasks', t); }
  const own = t.assignee === S.uid || can('staff_manage'); // 상태 변경: 담당자 본인 또는 최고관리자 (앱과 같음)
  const ln = (k, v) => v ? '<div class="line"><b>' + k + '</b><div>' + esc(v) + '</div></div>' : '';
  const ph = (t.phone || '').replace(/[^0-9+*#]/g, '');
  modal('<h3>' + esc(t.title) + '</h3><div class="sub" style="font-weight:700">' + esc(t.type) + ' · ' + (ST[t.status] || t.status) + '</div>' +
    ln('거래처', t.client) + (ph ? '<div class="line"><b>전화</b><a href="tel:' + ph + '">' + esc(t.phone) + '</a></div>' : '') + ln('주소', t.addr) + ln('기한', t.due) + ln('담당', uname(t.assignee)) + ln('요청한 사람', uname(t.creator)) + ln('열어본 시각', t.seenAt) + ln('가맹점 요청사항', t.req) + ln('메모', t.memo) + ln(t.req || t.merchant ? '처리결과' : '완료 메시지', t.doneMsg) + (t.mlog && byId('mlogs', t.mlog) ? '<div class="sub" style="color:var(--green)">✔ 가맹점 응대 기록에도 남았어요.</div>' : '') +
    '<h2>처리 이력</h2>' + (t.history || []).map(h => '<div class="hist">' + esc(h.t + '  ' + uname(h.who) + '\n' + h.text) + '</div>').join('') +
    (own && t.status !== '완료' ? '<div class="btns" style="margin-top:12px">' + (t.status !== '진행중' && t.status !== '확인함' ? '<button class="btn tint" data-act="tstatus" data-arg="' + id + '|진행중">진행 시작</button>' : '') + '<button class="btn" data-act="thold" data-arg="' + id + '">보류·연기</button><button class="btn gold" data-act="tdone" data-arg="' + id + '">완료</button></div>' : '') +
    (own && t.status === '완료' ? '<button class="btn full" data-act="tstatus" data-arg="' + id + '|진행중">진행중으로 되돌리기</button>' : '') +
    (own && t.status === '보류' ? '<button class="btn tint full" data-act="tresched" data-arg="' + id + '">일정 다시 잡기</button>' : '') +
    '<div class="btns">' + (t.creator === S.uid || can('staff_manage') ? '<button class="btn red" data-act="tdel" data-arg="' + id + '">삭제</button>' : '') + '<button class="btn" data-act="close">닫기</button></div>');
};
ACT.tdel = id => { const t = byId('tasks', id); if (!t) return; askConfirm('업무를 삭제할까요?', t.title + '\n목록과 달력에서 사라집니다.', '삭제', () => { t.deleted = true; put('tasks', t); render(); toast('삭제했어요.'); }, true); };
ACT.tstatus = a => {
  const [id, st] = a.split('|'); const t = byId('tasks', id); if (!t || t.status === st) return;
  t.status = st; tlog(t, '상태 → ' + st); put('tasks', t); closeModal(); render(); toast('바꿨어요.');
};
ACT.thold = id => formModal('보류·연기', '<div class="sub">다시 할 날짜를 정하면 일정 달력도 같이 바뀌어요. (정하지 않아도 돼요)</div><label class="fl" for="f_d">다시 할 날짜 (선택)</label><input type="date" id="f_d"><label class="fl" for="f_t">시간 (선택)</label>' + timeSel('f_t') + '', () => {
  const t = byId('tasks', id); const d = $('#f_d').value, tm = $('#f_t').value;
  t.status = '보류'; tlog(t, '상태 → 보류');
  if (d) { const nd = d + (tm ? ' ' + tm : ''); tlog(t, '일정 변경 ' + (t.due || '없음') + ' → ' + nd); t.due = nd; }
  put('tasks', t); render(); toast('보류로 바꿨어요.'); return true;
}, '보류하기');
ACT.tresched = id => formModal('일정 다시 잡기', '<label class="fl" for="f_d">날짜 (필수)</label><input type="date" id="f_d"><label class="fl" for="f_t">시간 (선택)</label>' + timeSel('f_t') + '', () => {
  const d = $('#f_d').value, tm = $('#f_t').value; if (!d) return warn('날짜를 골라 주세요.');
  const t = byId('tasks', id); const nd = d + (tm ? ' ' + tm : ''); tlog(t, '일정 변경 ' + (t.due || '없음') + ' → ' + nd); t.due = nd; put('tasks', t); render(); toast('일정을 바꿨어요.'); return true;
}, '변경');
// 업무 ↔ 응대 기록: 가맹점이 연결된 업무를 완료하면 요청사항·처리결과가 그 가맹점 응대 기록에 남는다(다시 완료하면 같은 기록을 고침)
const taskMerchant = t => (t.merchant && byId('merchants', t.merchant)) || (t.client ? list('merchants').find(m => (m.name || '').trim() === t.client.trim()) : null);
const kindOfTask = t => /용지신청/.test((t.req || '') + (t.title || '')) ? '용지신청' : /원격/.test((t.type || '') + (t.title || '')) ? '원격A/S' : /전화/.test(t.title || '') ? '전화응대' : /AS|A\/S|설치|방문/.test(t.type || '') ? '방문A/S' : '기타';
ACT.tdone = id => {
  const t0 = byId('tasks', id); const mer = t0 && taskMerchant(t0); const k0 = t0 && t0.mlog && byId('mlogs', t0.mlog) ? logKind(byId('mlogs', t0.mlog).kind) : kindOfTask(t0 || {});
  formModal('완료 처리', (t0 && t0.req ? '<div class="lb">가맹점 요청사항</div><div class="sub" style="margin-top:0;white-space:pre-wrap">' + esc(t0.req) + '</div>' : '') +
    '<label class="fl" for="f_m">처리결과 (필수)</label><textarea id="f_m" placeholder="어떻게 처리했는지 (예: 포스 프로그램 재설치, 정상 결제 확인)"></textarea>' +
    (mer ? '<label class="fl" for="f_k">응대 종류</label><select id="f_k">' + KINDS.map(k => '<option' + (k === k0 ? ' selected' : '') + '>' + k + '</option>').join('') + '</select><div class="sub">‘' + esc(mer.name) + '’ 응대 기록에도 같이 남아요.</div>' : '<div class="sub">가맹점이 연결되지 않은 업무라 응대 기록에는 남지 않아요.</div>'), () => {
    const m = $('#f_m').value.trim(); if (!m) return warn('처리결과를 입력해 주세요.');
    const t = byId('tasks', id); t.status = '완료'; t.doneMsg = m; t.doneAt = nowStr(); tlog(t, '상태 → 완료 : ' + m);
    if (mer) {
      const req = t.req || t.title; let g = t.mlog && byId('mlogs', t.mlog);
      if (!g) { g = create('mlogs', {merchant: mer.id, mname: mer.name, who: S.uid, task: t.id}); t.mlog = g.id; t.merchant = mer.id; }
      else { g.editedBy = S.uid; g.editedAt = nowStr(); g.deleted = false; }
      Object.assign(g, {date: todayStr(), kind: $('#f_k').value, req, res: m, text: req + '\n→ 처리: ' + m});
      put('mlogs', g);
    }
    put('tasks', t); render(); toast(mer ? '완료 처리하고 응대 기록에도 남겼어요.' : '완료 처리했어요.'); return true;
  }, '완료 처리');
};
ACT.newTask = draft => {
  const staff = list('users').filter(u => u.active !== false && (can('task_assign') || u.id === S.uid));
  formModal('업무 요청', '<label class="fl" for="f_t1">업무 제목 (필수)</label><input id="f_t1" placeholder="예: A마트 포스 설치"><label class="fl" for="f_ty">종류</label><select id="f_ty">' + TYPES.map(x => '<option>' + x + '</option>').join('') + '</select>' + MP_FILL +
    '<label class="fl" for="f_c">거래처 (상호)</label><input id="f_c" placeholder="가맹점을 고르면 자동으로 채워져요"><label class="fl" for="f_p">매장 전화</label><input id="f_p" type="tel" placeholder="예: 062-123-4567"><label class="fl" for="f_a">매장 주소</label><input id="f_a" placeholder="예: 광주 동구 …">' +
    '<label class="fl" for="f_rq">가맹점 요청사항 (빠른 선택 + 직접 입력 — 완료하면 처리결과와 함께 응대 기록에 남아요)</label><div class="pills" style="margin-top:4px">' + reqQuick().map(w => '<button type="button" class="pill rqq" data-w="' + w + '">＋ ' + w + '</button>').join('') + '</div><textarea id="f_rq" placeholder="예: 카드 결제가 안 된다고 함, 영수증 출력 안 됨"></textarea>' +
    '<label class="fl" for="f_d">기한 날짜 (선택 — 고르면 일정 달력에도 표시돼요)</label><input id="f_d" type="date"><label class="fl" for="f_tm">기한 시간 (선택)</label>' + timeSel('f_tm') + '<label class="fl" for="f_m">메모</label><textarea id="f_m" placeholder="메모"></textarea><label class="fl" for="f_w">담당 직원</label><select id="f_w">' + staff.map(u => '<option value="' + u.id + '"' + (u.id === S.uid ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</select>', () => {
    const ti = $('#f_t1').value.trim(); if (!ti) return warn('업무 제목을 입력해 주세요.');
    const d = $('#f_d').value, tm = $('#f_tm').value; const as = Number($('#f_w').value);
    const t = create('tasks', {title: ti, type: $('#f_ty').value, client: $('#f_c').value.trim(), phone: $('#f_p').value.trim(), addr: $('#f_a').value.trim(), due: d ? d + (tm ? ' ' + tm : '') : '', memo: $('#f_m').value.trim(), req: reqClean($('#f_rq').value), merchant: pickedMer && pickedMer.name === $('#f_c').value.trim() ? pickedMer.id : 0, assignee: as, creator: S.uid, status: '지시됨', history: []});
    tlog(t, '업무 요청 → ' + uname(as)); put('tasks', t);
    if (t.type.includes('서류')) postToRoom('서류접수', '📄 서류 업무 · ' + ti + (t.client ? ' · ' + t.client : '') + '\n담당 ' + uname(as) + ' · 요청 ' + uname(S.uid) + (t.due ? ' · 기한 ' + t.due : '')); // 앱과 같은 자동 알림
    if (d) { const p = d.split('-'); S.calY = +p[0]; S.calM = +p[1]; S.calSel = d; }
    render(); toast(uname(as) + '님에게 업무를 요청했습니다.'); return true;
  }, '요청하기');
  let pickedMer = null;
  const syncQ = () => { const v = $('#f_rq').value; document.querySelectorAll('#modal .rqq').forEach(b => b.classList.toggle('on', v.includes(b.dataset.w))); };
  document.querySelectorAll('#modal .rqq').forEach(b => b.onclick = () => { const el = $('#f_rq'); el.value = toggleWord(el.value, b.dataset.w); syncQ(); el.focus(); el.setSelectionRange(el.value.length, el.value.length); });
  $('#f_rq').addEventListener('input', syncQ);
  const pick = wireMerchantPicker(m => { pickedMer = m; const n = mNums(m); $('#f_c').value = m.name || ''; $('#f_p').value = n.phone || n.mobile || ''; $('#f_a').value = m.addr || ''; });
  const ids = ['f_t1', 'f_ty', 'f_c', 'f_p', 'f_a', 'f_rq', 'f_d', 'f_tm', 'f_m', 'f_w'];
  S.mpNew = q => { // 가맹점이 없으면 여기서 바로 등록 → 저장하면 이 업무 창으로 돌아와 자동 연결
    const d = {}; ids.forEach(k => { const el = $('#' + k); if (el) d[k] = el.value; });
    newMerchantThen(q, m => { ACT.newTask(Object.assign(d, {mer: m.id})); }, () => ACT.newTask(d));
  };
  if (draft) { ids.forEach(k => { const el = $('#' + k); if (el && draft[k] != null) el.value = draft[k]; }); syncQ(); const m = draft.mer && byId('merchants', draft.mer); if (m) pick(m); }
};

// ---------- 프로젝트 ----------
function itemCnt(p) { const it = p.items || []; return [it.filter(x => x.done).length, it.length]; }
function pctOf(p) { const [d, n] = itemCnt(p); return n ? Math.round(100 * d / n) : (p.pct || 0); }
function viewProjects() {
  const ps = list('projects'); const F = ['전체', '진행중', '완료(100%)'];
  const rows = ps.filter(p => S.projFilter === 0 || (S.projFilter === 1 ? pctOf(p) < 100 : pctOf(p) >= 100)).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return '<h1>프로젝트</h1><div class="seg">' + F.map((f, i) => '<button class="' + (S.projFilter === i ? 'on' : '') + '" data-act="pfilter" data-arg="' + i + '">' + f + '</button>').join('') + '</div>' +
    (rows.length ? rows.map(p => {
      const [d, n] = itemCnt(p); const pc = pctOf(p);
      return '<div class="card" data-act="project" data-arg="' + p.id + '"><div class="row"><div class="grow"><div class="t1">' + esc(p.title) + '</div><div class="t2">' + esc(uname(p.owner) + (p.due ? ' · 마감 ' + p.due : '') + (n ? ' · 체크리스트 ' + d + ' / ' + n : '')) + '</div></div><span class="chip">' + (pc >= 100 ? '✔ 완료' : pc + '%') + '</span></div><div class="bar" style="background:#e3e5ea"><i style="width:' + pc + '%;background:var(--gold)"></i></div></div>';
    }).join('') : '<div class="empty">프로젝트가 없습니다. 오른쪽 아래 + 로 만들어 보세요.</div>');
}
ACT.pfilter = a => { S.projFilter = Number(a); render(); };
ACT.project = id => {
  const p = byId('projects', id); if (!p) return;
  const [d, n] = itemCnt(p);
  modal('<h3>' + esc(p.title) + '</h3><div class="sub">' + esc(uname(p.owner) + (p.due ? ' · 마감 ' + p.due : '')) + '</div><div style="font-size:26px;font-weight:800;color:var(--deep);margin:8px 0">' + pctOf(p) + '%</div><div class="sub">' + (n ? '체크리스트 ' + d + ' / ' + n + ' 완료' : '체크리스트가 없어요') + '</div>' +
    (p.memo ? '<div class="sub" style="color:#14161a">' + esc(p.memo) + '</div>' : '') +
    (p.items || []).map((x, i) => '<label class="chk ' + (x.done ? 'done' : '') + '"><input type="checkbox" ' + (x.done ? 'checked' : '') + ' data-act="ptoggle" data-arg="' + id + '|' + i + '"><span class="grow">' + esc(x.t) + '</span></label>').join('') +
    '<input id="f_i" placeholder="+ 체크리스트 항목 추가"><button class="btn tint full" data-act="padd" data-arg="' + id + '">항목 추가</button>' +
    (n && pctOf(p) >= 100 ? '<button class="btn full" data-act="prevert" data-arg="' + id + '">완료 되돌리기</button>' : '') + '<button class="btn full" data-act="close">닫기</button>');
};
function psave(p) { p.pct = pctOf(p); p.check = p.pct >= 100; put('projects', p); }
ACT.ptoggle = a => { const [id, i] = a.split('|'); const p = byId('projects', id); p.items[i].done = !p.items[i].done; psave(p); ACT.project(id); render(); };
ACT.padd = id => { const v = $('#f_i').value.trim(); if (!v) return; const p = byId('projects', id); (p.items = p.items || []).push({t: v, done: false}); psave(p); ACT.project(id); render(); };
ACT.prevert = id => { const p = byId('projects', id); const it = p.items || []; for (let i = it.length - 1; i >= 0; i--) if (it[i].done) { it[i].done = false; break; } psave(p); ACT.project(id); render(); toast('진행중으로 되돌렸어요.'); };
ACT.newProject = () => {
  const staff = list('users').filter(u => u.active !== false);
  formModal('프로젝트 만들기', '<label class="fl" for="f_t1">프로젝트 이름 (필수)</label><input id="f_t1" placeholder="예: 10월 신규 가맹점 20곳"><label class="fl" for="f_d">마감일 (선택)</label><input id="f_d" type="date"><label class="fl" for="f_m">메모</label><textarea id="f_m" placeholder="메모"></textarea><label class="fl" for="f_i">체크리스트 (한 줄에 항목 하나, 선택)</label><textarea id="f_i" placeholder="예: 리스트 정리&#10;방문 10곳"></textarea><label class="fl" for="f_w">담당자</label><select id="f_w">' + staff.map(u => '<option value="' + u.id + '"' + (u.id === S.uid ? ' selected' : '') + '>' + esc(u.name) + '</option>').join('') + '</select>', () => {
    const ti = $('#f_t1').value.trim(); if (!ti) return warn('프로젝트 이름을 입력해 주세요.');
    const items = $('#f_i').value.split('\n').map(s => s.trim()).filter(Boolean).map(t => ({t, done: false}));
    const p = create('projects', {title: ti, due: $('#f_d').value, memo: $('#f_m').value.trim(), owner: Number($('#f_w').value), pct: 0, check: false, notes: []});
    if (items.length) p.items = items; put('projects', p); render(); toast('프로젝트를 만들었어요.'); return true;
  }, '만들기');
};

// ---------- 일정 ----------
// 공휴일: 앱의 Holidays.java 와 같은 목록 (2026~2028)
const HOL = {};
'2026-1-1 신정;2026-2-16 설날 연휴;2026-2-17 설날;2026-2-18 설날 연휴;2026-3-1 삼일절;2026-3-2 대체공휴일;2026-5-5 어린이날;2026-5-24 부처님오신날;2026-5-25 대체공휴일;2026-6-3 지방선거;2026-6-6 현충일;2026-8-15 광복절;2026-8-17 대체공휴일;2026-9-24 추석 연휴;2026-9-25 추석;2026-9-26 추석 연휴;2026-10-3 개천절;2026-10-5 대체공휴일;2026-10-9 한글날;2026-12-25 성탄절;2027-1-1 신정;2027-2-5 설날 연휴;2027-2-6 설날;2027-2-7 설날 연휴;2027-2-8 대체공휴일;2027-3-1 삼일절;2027-5-5 어린이날;2027-5-13 부처님오신날;2027-6-6 현충일;2027-8-15 광복절;2027-8-16 대체공휴일;2027-9-14 추석 연휴;2027-9-15 추석;2027-9-16 추석 연휴;2027-10-3 개천절;2027-10-4 대체공휴일;2027-10-9 한글날;2027-10-11 대체공휴일;2027-12-25 성탄절;2027-12-27 대체공휴일;2028-1-1 신정;2028-1-25 설날 연휴;2028-1-26 설날;2028-1-27 설날 연휴;2028-3-1 삼일절;2028-4-12 국회의원선거;2028-5-2 부처님오신날;2028-5-5 어린이날;2028-6-6 현충일;2028-8-15 광복절;2028-10-2 추석 연휴;2028-10-3 추석·개천절;2028-10-4 추석 연휴;2028-10-5 대체공휴일;2028-10-9 한글날;2028-12-25 성탄절'.split(';').forEach(x => { const [d, ...n] = x.split(' '); const [y, m, dd] = d.split('-'); HOL[y + '-' + pad(+m) + '-' + pad(+dd)] = n.join(' '); });
function viewCalendar() {
  const now = new Date();
  if (!S.calY) { S.calY = now.getFullYear(); S.calM = now.getMonth() + 1; S.calSel = todayStr(); }
  const ev = {};
  const add = (d, o) => { if (d) (ev[d] = ev[d] || []).push(o); };
  list('events').forEach(e => add(e.date, {kind: 'e', t: e.title, time: e.time, sub: e.place, who: e.who, id: e.id}));
  list('tasks').forEach(t => { if (t.due && t.status !== '완료' && (S.showAll || t.assignee === S.uid || can('task_view_all'))) add(t.due.slice(0, 10), {kind: 't', t: t.title, time: t.due.length > 10 ? t.due.slice(11, 16) : '', sub: uname(t.assignee) + ' · ' + (ST[t.status] || t.status), id: t.id}); });
  const first = new Date(S.calY, S.calM - 1, 1).getDay(); const days = new Date(S.calY, S.calM, 0).getDate();
  let cells = ''; for (let i = 0; i < first; i++) cells += '<td></td>';
  for (let d = 1; d <= days; d++) {
    const k = S.calY + '-' + pad(S.calM) + '-' + pad(d); const dow = (first + d - 1) % 7;
    cells += '<td class="' + (k === S.calSel ? 'sel ' : '') + (k === todayStr() ? 'today ' : '') + (dow === 0 || HOL[k] ? 'sun' : dow === 6 ? 'sat' : '') + '" data-act="calsel" data-arg="' + k + '"' + (HOL[k] ? ' title="' + HOL[k] + '"' : '') + '><div>' + d + (ev[k] ? '<i></i>' : '') + '</div></td>';
    if (dow === 6 && d < days) cells += '</tr><tr>';
  }
  const sel = (ev[S.calSel] || []).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  return '<div class="row" style="margin-top:18px"><button class="btn" data-act="calmove" data-arg="-1" style="margin:0" aria-label="이전 달">‹</button><div class="grow t1" style="text-align:center;font-size:19px">' + S.calY + '년 ' + S.calM + '월</div><button class="btn" data-act="caltoday" style="margin:0">오늘</button><button class="btn" data-act="calmove" data-arg="1" style="margin:0" aria-label="다음 달">›</button></div>' +
    '<table class="cal"><tr>' + ['일', '월', '화', '수', '목', '금', '토'].map(x => '<th>' + x + '</th>').join('') + '</tr><tr>' + cells + '</tr></table>' +
    (can('staff_manage') ? '' : '<div class="sub" style="margin-top:6px">일정 추가는 관리자만 할 수 있어요. (업무에 기한 날짜를 넣으면 달력에 표시돼요)</div>') +
    '<h2>' + esc(S.calSel) + (HOL[S.calSel] ? ' <span style="color:var(--red)">' + esc(HOL[S.calSel]) + '</span>' : '') + '</h2>' + (sel.length ? sel.map(o => '<div class="card" data-act="' + (o.kind === 't' ? 'task' : 'event') + '" data-arg="' + o.id + '"><div class="row"><div class="tile">' + (o.kind === 't' ? '업무' : '일정') + '</div><div class="grow"><div class="t1">' + esc(o.t) + '</div><div class="t2">' + esc((o.time ? o.time + ' · ' : '') + (o.sub || '')) + '</div></div></div></div>').join('') : '<div class="empty">이 날은 일정이 없어요.</div>') + upcoming(ev);
}
function upcoming(ev) { // 오늘부터 앞으로의 일정과 업무 기한을 날짜 순으로 (앱의 '다가오는 일정')
  const today = todayStr(); const days = Object.keys(ev).filter(d => d >= today).sort().slice(0, 14);
  const rows = []; days.forEach(d => (ev[d] || []).slice().sort((a, b) => (a.time || '').localeCompare(b.time || '')).forEach(o => rows.push([d, o])));
  return '<h2>다가오는 일정</h2>' + (rows.length ? rows.slice(0, 20).map(([d, o]) => '<div class="evl" data-act="' + (o.kind === 't' ? 'task' : 'event') + '" data-arg="' + o.id + '"><b style="width:74px">' + d.slice(5).replace('-', '/') + (o.time ? ' ' + esc(o.time) : '') + '</b><span>' + (o.kind === 't' ? '📋 ' : '📅 ') + esc(o.t) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span></div>').join('') : '<div class="empty" style="padding:16px 0">앞으로 잡힌 일정이 없어요.</div>');
}
ACT.event = id => {
  const e = byId('events', id); if (!e) return; const m = e.merchant ? byId('merchants', e.merchant) : null;
  const ln = (k, v) => v ? '<div class="line"><b>' + k + '</b><div>' + esc(v) + '</div></div>' : '';
  modal('<h3>' + esc(e.title) + '</h3>' + ln('날짜', e.date + (e.time ? ' ' + e.time : '')) + ln('장소', e.place) + ln('가맹점', m && m.name) + ln('남긴 사람', uname(e.who)) +
    '<div class="btns" style="margin-top:12px">' + (m ? '<button class="btn tint" data-act="merchant" data-arg="' + m.id + '">가맹점 정보 보기</button>' : '') + (can('staff_manage') ? '<button class="btn red" data-act="eventDel" data-arg="' + e.id + '">삭제</button>' : '') + '<button class="btn" data-act="close">닫기</button></div>');
};
ACT.eventDel = id => { const e = byId('events', id); if (!e) return; askConfirm('일정을 삭제할까요?', e.title, '삭제', () => { e.deleted = true; put('events', e); render(); toast('삭제했어요.'); }, true); };
ACT.calsel = d => { S.calSel = d; render(); };
ACT.caltoday = () => { const t = todayStr().split('-'); S.calY = +t[0]; S.calM = +t[1]; S.calSel = todayStr(); render(); };
ACT.calmove = a => { S.calM += Number(a); if (S.calM < 1) { S.calM = 12; S.calY--; } if (S.calM > 12) { S.calM = 1; S.calY++; } render(); };
ACT.newEvent = () => {
  let mer = null;
  formModal('일정 추가', '<label class="fl" for="f_t1">일정 제목 (필수)</label><input id="f_t1" placeholder="예: 본사 회의"><label class="fl" for="f_d">날짜 (필수)</label><input id="f_d" type="date" value="' + (S.calSel || todayStr()) + '"><label class="fl" for="f_tm">시간 (선택)</label>' + timeSel('f_tm') + '' + MP_FILL.replace('고르면 거래처·전화·주소가 자동으로 채워져요', '고르면 장소에 가맹점 주소가 들어가요') + '<label class="fl" for="f_p">장소·주소</label><input id="f_p" placeholder="예: 광주지사">', () => {
    const ti = $('#f_t1').value.trim(), d = $('#f_d').value; if (!ti || !d) return warn('제목과 날짜를 확인해 주세요.');
    const e = create('events', {date: d, title: ti, who: S.uid, time: $('#f_tm').value, place: $('#f_p').value.trim()}); if (mer) e.merchant = mer.id;
    put('events', e); S.calSel = d; render(); toast('일정을 남겼어요.'); return true;
  }, '추가');
  wireMerchantPicker(m => { mer = m; if (m.addr) $('#f_p').value = m.addr; });
};

// ---------- 채팅 ----------
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; };
// 읽은 위치: 이 기기(localStorage)와 내 프로필 문서(rd: {방: 시각}) 중 늦은 쪽 → PC에서 읽으면 아이폰 웹앱에서도 읽음으로 바뀐다
const myProf = () => byId('profiles', S.uid);
const readAt = r => {
  const v = Number(LS('rd_' + S.uid + '_' + r) || 0); const pr = myProf(); const sv = pr && pr.rd ? Number(pr.rd[r] || 0) : 0;
  if (v || sv) return Math.max(v, sv);
  let i = LS('rdinit_' + S.uid); if (!i) { i = Date.now(); LS('rdinit_' + S.uid, String(i)); } return Number(i);
};
let rdQ = {}, rdT = 0;
function markRead(r) {
  if (!r) return; const was = readAt(r); let mx = was; list('msgs').forEach(m => { if (m.room === r && m.ts > mx) mx = m.ts; });
  LS('rd_' + S.uid + '_' + r, String(mx));
  const pr = myProf(), sv = pr && pr.rd ? Number(pr.rd[r] || 0) : 0; // 서버에 남긴 것보다 새로 읽었으면 올린다 (상대 화면의 읽음 숫자가 줄어든다)
  if (mx > sv && !(rdQ[r] >= mx)) { rdQ[r] = mx; clearTimeout(rdT); rdT = setTimeout(flushRead, 1500); }
}
function flushRead() { // 서버에는 모아서 가끔만 쓴다
  clearTimeout(rdT); const ks = Object.keys(rdQ); if (!ks.length || DEMO || !S.uid) return;
  const pr = myProf() || {id: S.uid}; pr.rd = Object.assign({}, pr.rd || {}); ks.forEach(k => { if (!(pr.rd[k] >= rdQ[k])) pr.rd[k] = rdQ[k]; }); rdQ = {}; put('profiles', pr);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flushRead(); });
function unreadMap() { const o = {}, since = {}; list('rooms').forEach(r => since[r.id] = readAt(r.id)); list('msgs').forEach(m => { if (since[m.room] != null && m.ts > since[m.room] && m.who !== S.uid) o[m.room] = (o[m.room] || 0) + 1; }); return o; }
// 안 읽은 채팅 알림띠: 다른 화면을 보고 있어도 위쪽에 계속 떠 있고(읽을 때까지), 누르면 그 채팅방으로 간다. 알림 끈 방은 빼고 센다.
function chatBarHTML() {
  if (!S.me || (S.tab === 'chat' && !isWide()) || S.room || dockOn()) return ''; // 오른쪽 채팅창이 열려 있으면 거기서 보인다
  const mu = mutedRooms(), since = {}; list('rooms').forEach(r => { if (!mu.includes(r.id)) since[r.id] = readAt(r.id); });
  let n = 0, last = null; list('msgs').forEach(m => { if (since[m.room] != null && m.ts > since[m.room] && m.who !== S.uid) { n++; if (!last || m.ts > last.ts) last = m; } });
  if (!n) return '';
  const r = byId('rooms', last.room);
  return '<button class="chatbar" data-act="chatBar" data-arg="' + last.room + '"><span class="cb1">💬 안 읽은 채팅 <b>' + n + '</b></span><span class="cb2">' + esc((r ? roomTitle(r) + ' · ' : '') + wname(last) + ': ' + msgText(last)) + '</span><span class="cb3">보기 ›</span></button>';
}
// PC 프로그램(설치형)에서만: 오른쪽 위 ⋮ → 새로고침·다시시작·종료 / 창 최소화·창 줄이기(옮길 수 있는 작은 창)·크게보기(전체 모드) — 토스포스처럼
// 창 줄이기: 두 화살표가 가운데로 마주봄 / 크게보기: 바깥으로 (토스포스와 같은 모양)
const SV_IN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>';
const SV_OUT = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>';
ACT.pcWin = () => {
  if (!window.nineWin) return; const old = $('.pcwinpop'); if (old) { old.remove(); return; }
  const it = [['reload', '⟳', '새로고침', '#1a9e5a'], ['restart', '↻', '다시시작', '#2f6fde'], ['quit', '⏻', '종료', '#d33'], ['min', '—', '창 최소화', ''], ['shrink', SV_IN, '창 줄이기', ''], ['full', SV_OUT, '크게보기', '']];
  const p = document.createElement('div'); p.className = 'pcwinpop';
  p.innerHTML = it.map(([k, ic, lb, c]) => '<button type="button" data-k="' + k + '"><span class="ic"' + (c ? ' style="color:' + c + '"' : '') + '>' + ic + '</span>' + lb + '</button>').join('');
  document.body.appendChild(p);
  const off = e => { if (!p.contains(e.target) && !e.target.closest('.pcwin')) { p.remove(); document.removeEventListener('mousedown', off, true); } };
  document.addEventListener('mousedown', off, true);
  p.onclick = e => { const b = e.target.closest('button'); if (!b) return; p.remove(); document.removeEventListener('mousedown', off, true);
    if (b.dataset.k === 'quit') askConfirm('프로그램 종료', '나인패밀리를 완전히 종료할까요? (종료하면 새 업무·채팅 알림을 받을 수 없어요)', '종료', () => window.nineWin.act('quit'));
    else window.nineWin.act(b.dataset.k); };
};
// PC 오른쪽 채팅창(텔레그램 데스크톱처럼): 위쪽 💬 버튼으로 열고 닫는다. 다른 화면(가맹점 조회 등)을 보면서 채팅. 열림 여부는 이 PC에 기억.
const dockOn = () => !!(S.me && isWide() && !S.menu && LS('dock_' + S.uid) === '1');
ACT.dockToggle = () => { const on = LS('dock_' + S.uid) === '1'; LS('dock_' + S.uid, on ? '0' : '1'); if (on) S.room = 0; S.menu = false; render(); };
ACT.chatBar = id => { if (isWide()) { LS('dock_' + S.uid, '1'); S.menu = false; ACT.room(id); return; } /* PC: 오른쪽 채팅창에서 그 방 */ S.tab = 'chat'; S.sub = ''; S.menu = false; ACT.room(id); };
function unreadTotal() { if (!S.me) return 0; return Object.values(unreadMap()).reduce((a, b) => a + b, 0); }
function unreadNotices() { return list('notices').filter(n => !(n.readBy || []).includes(S.uid)).length; }
// 읽음 표시(카톡처럼): 이 방 사람 중 아직 안 읽은 사람 수. 각자 프로필의 rd{방: 시각}(웹·앱 v0.0.4 이상이 씀)으로 센다.
function roomMemberIds(r) { const ids = (r.members && r.members.length ? r.members : list('users').filter(u => u.active !== false).map(u => u.id)); return ids.filter(i => { const u = byId('users', i); return u && u.active !== false; }); }
function seenAt(uid, rid) { if (uid === S.uid) return Infinity; const p = byId('profiles', uid); return p && p.rd ? Number(p.rd[rid] || 0) : 0; }
function unreadOf(m, mem) { return mem.filter(i => i !== m.who && seenAt(i, m.room) < m.ts).length; }
function dmOther(r) { return (r.members || []).find(x => x !== S.uid) || 0; }
function roomTitle(r) { return r.dm ? (dmOther(r) ? uname(dmOther(r)) : '나와의 대화') : (r.name || ''); }
function lastMsg(rid) { let b = null; list('msgs').forEach(m => { if (m.room === rid && (!b || m.ts > b.ts)) b = m; }); return b; }
function msgText(m) { if (m.kind === 'img') return '📷 사진'; if (m.kind === 'stk') return '스티커 (앱에서 보여요)'; if (m.kind === 'file') return '📎 ' + (m.fname || '파일'); return m.text || ''; }
function viewChat(dock) { // dock: PC 오른쪽 채팅창(좁은 한 줄 모양)
  const rooms = list('rooms').map(r => ({r, last: lastMsg(r.id)})).filter(x => x.last || x.r.id === S.room).sort((a, b) => (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0));
  const un = unreadMap();
  const staff = list('users').filter(u => u.id !== S.uid && u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const pq = S.peopleQ || '', ps = staff.filter(u => kmatch((u.name || '') + ' ' + (u.phone || '').replace('+82', '0'), pq));
  const lst = '<div class="chatlist"><h1>채팅</h1><button class="btn gold full" data-act="newChat">+ 새 채팅</button>' +
    '<div class="sub" style="margin-top:12px;font-weight:700">직원 총 ' + (staff.length + 1) + '명 · 눌러서 1:1 대화</div>' +
    '<input id="pq" data-q="peopleQ" placeholder="👤 직원 찾기 (이름·초성·번호)" value="' + esc(pq) + '" autocomplete="off">' +
    '<div class="qres" data-for="peopleQ"><div class="avwrap"><button class="avnav" data-act="avScroll" data-arg="-1" aria-label="앞 직원">‹</button><div class="avs" id="avs">' +
    (ps.length ? ps.map(u => '<div class="av" data-act="dm" data-arg="' + u.id + '">' + avatarHTML(u.id, 52) + esc(u.name) + '</div>').join('') : '<div class="sub" style="padding:14px 4px">찾는 직원이 없어요.</div>') +
    '</div><button class="avnav" data-act="avScroll" data-arg="1" aria-label="다음 직원">›</button></div></div>' +
    '<input id="chq" data-q="chatQ" placeholder="🔍 대화방 검색 (초성 가능)" value="' + esc(S.chatQ) + '">' +
    '<div class="qres" data-for="chatQ">' + rooms.filter(x => kmatch(roomTitle(x.r), S.chatQ)).map(x => {
      const l = x.last; const c = un[x.r.id] || 0;
      return '<div class="card" data-act="room" data-arg="' + x.r.id + '"><div class="row"><div class="tile">' + esc((roomTitle(x.r) || '?').slice(0, 1)) + '</div><div class="grow"><div class="t1">' + esc(roomTitle(x.r)) + '</div><div class="t2">' + esc(l ? (l.who === S.uid ? '나' : wname(l)) + ': ' + msgText(l) : '아직 대화가 없어요') + '</div></div><div style="text-align:right;font-size:11px;color:var(--gray)">' + (l ? new Date(l.ts).toLocaleString('ko-KR', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}) : '') + (c ? '<br><span class="badge">' + c + '</span>' : '') + '</div></div></div>';
    }).join('') + '</div>' + (rooms.length ? '' : '<div class="empty">아직 채팅방이 없어요.</div>') + '<div style="height:90px"></div></div>';
  const wide = !dock && isWide();
  if (!S.room) { S.openRoom = 0; return wide ? '<div class="chatwrap">' + lst + '<div class="chatroom"><div class="empty" style="margin:auto">대화방을 골라 주세요.</div></div></div>' : lst; }
  const room = byId('rooms', S.room) || (S.dmDraft && S.dmDraft.id === S.room ? S.dmDraft : null);
  if (!room) { S.room = 0; return lst; }
  if (S.openRoom !== S.room) { S.openRoom = S.room; S.openRead = readAt(S.room); S.jumpUnread = true; } // 방을 열 때 읽었던 위치 (안 읽은 글부터 보여 주려고)
  markRead(S.room);
  const ms = list('msgs').filter(m => m.room === S.room).sort((a, b) => msgOrder(a) - msgOrder(b) || (a.ts || 0) - (b.ts || 0));
  const mem = roomMemberIds(room);
  let lastDay = '', html = '', ul = false;
  ms.forEach(m => {
    if (!ul && m.ts > S.openRead && m.who !== S.uid) { ul = true; html += '<div class="unreadline" id="unreadline"><span>여기까지 읽었어요</span></div>'; }
    const d = new Date(m.ts); const day = d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
    if (day !== lastDay) { lastDay = day; html += '<div class="day"><span>' + day + '</span></div>'; }
    const me = m.who === S.uid; const un = unreadOf(m, mem);
    html += '<div class="m ' + (me ? 'me' : '') + '"><div>' + (me || room.dm ? '' : '<div class="who">' + esc(wname(m)) + '</div>') + '<div class="bub' + (m.kind === 'img' ? ' pic' : m.kind === 'stk' ? ' pic' : '') + '" data-mid="' + m.id + '">' + (m.rto ? '<div class="rto">' + esc((uname(m.rto.who)) + ': ' + (m.rto.text || '')) + '</div>' : '') + msgBody(m) + '</div>' + reactLine(m) + '<div class="who" style="' + (me ? 'text-align:right' : '') + '">' + (un && me ? '<b class="unr">' + un + '</b> ' : '') + pad(d.getHours()) + ':' + pad(d.getMinutes()) + (un && !me ? ' <b class="unr">' + un + '</b>' : '') + '</div></div></div>';
  });
  const roomView = '<div class="chatroom"><div class="hdr"><button data-act="leave">‹</button><div class="grow t1">' + esc(roomTitle(room)) + (room.grp ? ' <span class="sub">(' + (room.members || []).length + '명)</span>' : '') + '</div><button data-act="roomMute" title="이 채팅방 알림 소리" aria-label="이 채팅방 알림 소리 ' + (roomMuted(room.id) ? '켜기' : '끄기') + '">' + (roomMuted(room.id) ? '🔕' : '🔔') + '</button></div><div class="msgs" id="msgbox">' + (html || '<div class="empty">첫 메시지를 남겨 보세요.</div>') + '</div>' + (S.replyTo ? '<div class="replybar"><span>↩ ' + esc(uname(S.replyTo.who)) + '에게 답장: ' + esc(S.replyTo.text) + '</span><button data-act="replyOff" aria-label="답장 취소">✕</button></div>' : '') + stkPanelHTML() + '<div class="send"><button class="plus" data-act="attach" aria-label="사진·파일 보내기">+</button><textarea id="msgin" rows="1" placeholder="' + (coarse() ? '메시지 입력' : '메시지 입력 (Shift+Enter 줄바꿈)') + '" autocomplete="off"></textarea><button class="plus" data-act="stkPanel" aria-label="이모지·스티커">☺</button><button data-act="send">보내기</button></div><input type="file" id="fpick" hidden></div>';
  if (dock) { // PC 오른쪽 채팅창: 텔레그램 PC처럼 왼쪽 세로줄에 대화방들, 오른쪽에 대화. 세로줄을 누르면 그 방으로 바뀐다
    const bar = '<nav class="dockbar"><button class="dtile dlist" data-act="leave" title="대화방 목록"><span class="av">☰</span><span class="nm">목록</span></button>' +
      rooms.map(x => { const r = x.r, c = un[r.id] || 0, t = roomTitle(r) || '?';
        return '<button class="dtile' + (r.id === S.room ? ' on' : '') + '" data-act="room" data-arg="' + r.id + '" title="' + esc(t) + '"><span class="av">' + (r.dm && dmOther(r) ? avatarHTML(dmOther(r), 40) : esc(t.slice(0, 1))) + '</span><span class="nm">' + esc(t.length > 4 ? t.slice(0, 4) : t) + '</span>' + (c && !roomMuted(r.id) ? '<span class="badge">' + c + '</span>' : '') + '</button>'; }).join('') + '</nav>';
    return '<div class="dockroom">' + bar + roomView + '</div>';
  }
  return wide ? '<div class="chatwrap">' + lst + roomView + '</div>' : roomView;
}
const FRIENDS = ['나인이', '복이', '호야', '깍이', '도리'];
const STK_CAPS = [["신규계약 성공!", "축하축하~!", "대단해 대단해", "아 빡쳐!!", "정신 차려!", "힘내요 우리!", "POS 설치 중", "여보세요~ 나인입니다", "현장 AS 출동!", "공부하는 대표님", "굿샷~ 접대골프", "토스단말기 어떠세요", "회의 또 회의", "사장님 수다 삼매경", "수수료 입금 완료", "OK 접수 완료"], ["복 터졌다 계약!", "복 받으세요~", "캬 대단하다", "복이도 화나!", "정신 줄 잡아요", "힘내면 복와요", "랜선 공사 중", "전화 응대 중", "단말기 도색 중", "독서 삼매경", "차에서 꿀잠", "단말기 수리 중", "서류 접수했습니다", "돈복 터졌다", "점심 뭐 먹지", "복 감사합니다"], ["어흥! 계약 따냈다", "축하 어흥~", "대단하다 어흥", "어흥 빡쳤다!!", "정신 차려 어흥", "힘내라 어흥!", "AS 출동 어흥", "랜선 깔자 어흥", "테이블오더 설치", "호야 홀인원!", "토스 영업 어흥", "서류 작성 중", "보고서 쓰는 중", "퇴근하고 싶다", "죄송합니다...", "알겠습니다 어흥"], ["깍깍! 계약 성공", "까치가 물어왔다", "깍! 대단해", "깍깍 빡쳐!!", "깍! 정신 차려", "힘내 깍깍", "깍깍 전화 중", "상담원 연결 중", "블로그 작업 중", "보고서 쓰는 중", "깍깍 회의 중", "사장님 깍깍 수다", "서류 접수 완료", "엉엉 깍깍", "감사합니다 깍", "점심은 뭐 쪼지"], ["도리 계약 땄다!", "도토리 축하~", "도리도리 대단해", "도리 빡쳐!!", "정신 차려 도리", "힘내 도리도리", "쇼핑몰 작업 중", "서류 작성 중", "공부하는 도리", "POS 설치 중", "차에서 농땡이", "도리 골프 연습", "토스 영업 중", "월요일 싫어", "도토리값 입금", "도리 반성중"]];
const REACTS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '👏'];
const EMOJIS = '😀 😁 😂 🤣 😊 😍 😘 😎 🤔 😅 😭 😡 👍 👏 🙏 💪 🔥 ❤️ 🎉 ✅ ⭕ ❌ 📞 📄 💰 🚗 ☕ 🍚'.split(' ');
const stkSrc = k => 'stk/stk_' + (String(k).startsWith('c') ? k : pad(Number(k) || 1)) + '.png';
function linkify(t) { // 글 속 웹 주소는 눌러서 열리게
  return esc(t).replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+|[a-z0-9-]+\.(?:com|net|kr|co\.kr|org|io)(?:\/[^\s<]*)?)/gi, u => '<a href="' + (/^https?:/i.test(u) ? u : 'https://' + u) + '" target="_blank" rel="noopener">' + u + '</a>');
}
function msgBody(m) {
  if (m.kind === 'stk') return '<img class="stk" src="' + stkSrc(m.blob) + '" alt="' + esc(m.text || '스티커') + '">';
  if (m.kind === 'img') return '<img class="cimg" data-blob="' + esc(m.blob) + '" data-n="' + (m.chunks || 0) + '" data-name="' + esc(m.fname || '사진.jpg') + '" alt="사진" data-act="viewImg">';
  if (m.kind === 'file') return '<button class="fbtn" data-act="openFile" data-arg="' + esc(m.blob + '|' + (m.chunks || 0) + '|' + (m.fname || '파일')) + '">📎 ' + esc(m.fname || '파일') + (m.size ? ' <small>' + Math.max(1, Math.round(m.size / 1024)) + 'KB · 눌러서 받기</small>' : '') + '</button>';
  return linkify(msgText(m));
}
function reactLine(m) {
  const r = m.react || {}; const cnt = {}; Object.values(r).forEach(e => cnt[e] = (cnt[e] || 0) + 1);
  const mine = r[String(S.uid)];
  return Object.keys(cnt).length ? '<div class="reacts">' + Object.keys(cnt).map(e => '<button class="' + (e === mine ? 'on' : '') + '" data-act="react" data-arg="' + m.id + '|' + e + '">' + e + (cnt[e] > 1 ? ' ' + cnt[e] : '') + '</button>').join('') + '</div>' : '';
}
ACT.react = a => { const [id, e] = a.split('|'); const m = byId('msgs', id); if (!m) return; m.react = Object.assign({}, m.react || {}); const k = String(S.uid); if (m.react[k] === e) delete m.react[k]; else m.react[k] = e; put('msgs', m); closeModal(); render(); };
ACT.msgMenu = id => { // 말풍선을 누르면: 반응 · 답장 · 복사 · 삭제(내 것)
  const m = byId('msgs', id); if (!m) return; const mine = m.who === S.uid;
  modal('<div class="reactbar">' + REACTS.map(e => '<button data-act="react" data-arg="' + m.id + '|' + e + '">' + e + '</button>').join('') + '</div>' +
    '<button class="mi" data-act="reply" data-arg="' + m.id + '"><span>↩ 답장</span></button>' + (m.kind ? '' : '<button class="mi" data-act="copyMsg" data-arg="' + m.id + '"><span>📋 복사</span></button>') +
    (mine ? '<button class="mi" data-act="delMsg" data-arg="' + m.id + '"><span style="color:var(--red)">🗑 삭제</span></button>' : '') + '<button class="btn full" data-act="close">닫기</button>');
};
const snippet = m => m.kind === 'img' ? '사진' : m.kind === 'stk' ? '스티커' : m.kind === 'file' ? '파일: ' + (m.fname || '') : ((m.text || '').replace(/\n/g, ' ').slice(0, 60) + ((m.text || '').length > 60 ? '…' : ''));
ACT.reply = id => { const m = byId('msgs', id); if (!m) return; S.replyTo = {id: m.id, who: m.who, text: snippet(m)}; closeModal(); render(); setTimeout(() => { const i = $('#msgin'); if (i) i.focus(); }, 0); };
ACT.replyOff = () => { S.replyTo = null; render(); };
ACT.copyMsg = id => { const m = byId('msgs', id); closeModal(); try { navigator.clipboard.writeText(m.text || ''); toast('복사했어요.'); } catch (e) { toast('복사하지 못했어요.'); } };
ACT.delMsg = id => { const m = byId('msgs', id); if (!m) return; askConfirm('이 메시지를 지울까요?', '대화에서 사라지고, 서버에는 기록이 남아요.', '삭제', () => { m.deleted = true; put('msgs', m); render(); }, true); };
ACT.stkPanel = () => { S.stkOpen = !S.stkOpen; render(); };
ACT.stkTab = i => { S.stkTab = Number(i); render(); };
ACT.emoji = e => { const i = $('#msgin'); if (!i) return; i.value += e; growMsg(i); i.focus(); };
ACT.sendStk = a => {
  const [key, cap] = a.split('|'); const room = ensureRoom(); if (!room) return;
  const m = create('msgs', {room: room.id, who: S.uid, text: cap, ts: Date.now(), kind: 'stk', blob: key, fname: '', size: 0});
  if (room.mem && room.mem.length) m.mem = room.mem.slice(); put('msgs', m); S.stkOpen = false; render();
};
function stkPanelHTML() {
  if (!S.stkOpen) return ''; const t = S.stkTab || 0;
  const tabs = '<div class="stktabs">' + ['이모지'].concat(FRIENDS).map((n, i) => '<button class="' + (i === t ? 'on' : '') + '" data-act="stkTab" data-arg="' + i + '">' + n + '</button>').join('') + '</div>';
  const body = t === 0 ? '<div class="emgrid">' + EMOJIS.map(e => '<button data-act="emoji" data-arg="' + e + '">' + e + '</button>').join('') + '</div>'
    : '<div class="stkgrid">' + STK_CAPS[t - 1].map((c, i) => { const k = 'c' + t + '_' + pad(i + 1); return '<button data-act="sendStk" data-arg="' + k + '|' + esc(c) + '" title="' + esc(c) + '"><img src="' + stkSrc(k) + '" alt="' + esc(c) + '" loading="lazy"></button>'; }).join('') + '</div>';
  return '<div class="stkpanel">' + tabs + body + '</div>';
}
// 사진·파일은 서버 보관함(blobs)에 600KB 조각(id_0, id_1 …)으로 들어 있다 — 앱과 같은 형식
const blobCache = new Map();
function fetchBlob(id, chunks) {
  if (blobCache.has(id)) return blobCache.get(id);
  const n = Math.max(1, chunks || 0); const ids = chunks > 0 ? [...Array(n).keys()].map(i => id + '_' + i) : [id];
  const pr = Promise.all(ids.map(d => fs.collection('blobs').doc(d).get())).then(docs => {
    let mime = 'application/octet-stream'; const parts = docs.map(dc => { if (!dc.exists) throw new Error('없음'); mime = dc.get('mime') || mime; const b = atob(dc.get('d')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; });
    return URL.createObjectURL(new Blob(parts, {type: mime}));
  });
  pr.catch(() => blobCache.delete(id)); blobCache.set(id, pr); return pr;
}
function loadImages() {
  if (DEMO) return;
  document.querySelectorAll('img.cimg:not([src])').forEach(im => { im.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; fetchBlob(im.dataset.blob, Number(im.dataset.n)).then(u => { im.src = u; im.classList.add('ok'); }).catch(() => { im.alt = '사진을 불러오지 못했어요'; im.classList.add('bad'); }); });
}
ACT.viewImg = (a, el) => { if (!el.classList.contains('ok')) return; modal('<img src="' + el.src + '" alt="사진" style="width:100%;border-radius:14px"><div class="btns" style="margin-top:10px"><a class="btn tint" style="text-align:center;text-decoration:none" href="' + el.src + '" download="' + esc(el.dataset.name) + '">저장</a><button class="btn" data-act="close">닫기</button></div>'); };
ACT.openFile = a => {
  if (DEMO) return toast('데모에서는 파일을 받을 수 없어요.');
  const [id, ch, name] = a.split('|'); toast('받는 중…');
  fetchBlob(id, Number(ch)).then(u => { const l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); }).catch(() => toast('파일을 받지 못했어요. 인터넷을 확인해 주세요.'));
};
function ensureRoom() {
  let room = byId('rooms', S.room);
  if (!room && S.dmDraft && S.dmDraft.id === S.room) { room = S.dmDraft; put('rooms', room); S.dmDraft = null; }
  return room;
}
ACT.attach = () => { const f = $('#fpick'); f.value = ''; f.onchange = () => { if (f.files[0]) sendFile(f.files[0]); }; f.click(); };
function b64of(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
function shrinkImage(file, max, limit, square) { // 앱과 같이 줄인다: 채팅 사진 긴 쪽 1280px·600KB, 자료실 1600px·900KB, 프로필 256px 정사각·40KB
  max = max || 1280; limit = limit || 600 * 1024;
  return new Promise((ok, no) => {
    const img = new Image(); img.onload = () => {
      const c = document.createElement('canvas'); let sx = 0, sy = 0, sw = img.width, sh = img.height;
      if (square) { const m = Math.min(sw, sh); sx = (sw - m) / 2; sy = (sh - m) / 2; sw = sh = m; }
      const k = Math.min(1, max / Math.max(sw, sh)); c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height); URL.revokeObjectURL(img.src);
      const go = q => c.toBlob(b => { if (!b) return no(new Error('jpeg')); if (b.size > limit && q > 0.35) return go(q - 0.1); b.arrayBuffer().then(x => ok(new Uint8Array(x))); }, 'image/jpeg', q);
      go(0.85);
    }; img.onerror = () => no(new Error('img')); img.src = URL.createObjectURL(file);
  });
}
async function sendFile(file) {
  if (DEMO) return toast('데모에서는 사진·파일을 보낼 수 없어요.');
  const isImg = /^image\//.test(file.type) && !/gif|svg/.test(file.type);
  if (!isImg && file.size > 3 * 1024 * 1024) return toast('파일은 3MB까지 보낼 수 있어요.');
  const room = ensureRoom(); if (!room) return;
  toast('보내는 중…');
  try {
    const data = isImg ? await shrinkImage(file) : new Uint8Array(await file.arrayBuffer());
    const d = new Date(), name = isImg ? '사진_' + pad(d.getMonth() + 1) + pad(d.getDate()) + '_' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.jpg' : file.name;
    const mime = isImg ? 'image/jpeg' : (file.type || 'application/octet-stream');
    const up = await uploadBlob(data, mime, name);
    const m = create('msgs', {room: room.id, who: S.uid, text: isImg ? '사진' : name, ts: Date.now(), kind: isImg ? 'img' : 'file', blob: up.blob, fname: name, size: data.length, chunks: up.chunks});
    if (room.mem && room.mem.length) m.mem = room.mem.slice();
    put('msgs', m); render();
  } catch (e) { toast('보내지 못했어요. 인터넷을 확인해 주세요.'); }
}
// 스크린샷 붙여넣기(Ctrl+V)·끌어다 놓기: 채팅방이 열려 있으면 미리 보고 보내기
function offerFile(file) {
  if (!file || !S.room) return;
  const isImg = /^image\//.test(file.type);
  const url = isImg ? URL.createObjectURL(file) : '';
  askConfirm(isImg ? '이 사진을 보낼까요?' : '‘' + (file.name || '파일') + '’을(를) 보낼까요?', '', '보내기', () => { if (url) URL.revokeObjectURL(url); sendFile(file); });
  if (url) { const b = document.querySelector('#modal .sub, #modal p'); const img = '<img src="' + url + '" alt="붙여 넣은 사진" style="max-width:100%;max-height:50vh;border-radius:12px;display:block;margin:8px 0">'; if (b) b.insertAdjacentHTML('afterend', img); else { const h = document.querySelector('#modal h3'); if (h) h.insertAdjacentHTML('afterend', img); } }
}
const chatOpen = () => !!(S.room && (S.tab === 'chat' || dockOn())); // 채팅방이 화면에 열려 있음 (휴대폰 채팅 탭 · PC 오른쪽 채팅창)
document.addEventListener('paste', e => {
  if (!chatOpen() || $('#modal')) return;
  const it = [...((e.clipboardData && e.clipboardData.items) || [])].find(x => x.kind === 'file');
  const f = it && it.getAsFile(); if (!f) return;
  e.preventDefault(); offerFile(f);
});
document.addEventListener('dragover', e => { if (chatOpen() && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
document.addEventListener('drop', e => { if (!chatOpen() || !e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); offerFile(e.dataTransfer.files[0]); });
ACT.room = id => { S.room = Number(id); S.dmDraft = null; render(); };
ACT.leave = () => { markRead(S.room); S.room = 0; S.dmDraft = null; render(); };
ACT.dm = uid => {
  uid = Number(uid); const lo = Math.min(uid, S.uid), hi = Math.max(uid, S.uid);
  const ex = list('rooms').find(r => r.dm && r.members && Math.min(...r.members) === lo && Math.max(...r.members) === hi);
  if (ex) { S.room = ex.id; S.dmDraft = null; return render(); }
  const other = user(uid); let id = 1500000000 + Number((BigInt(lo) * 1000003n + BigInt(hi)) % 400000000n);
  if (S.data.rooms.has(id)) id = nextId();
  const a = e164(S.phone), b = e164(other.phone || '');
  S.dmDraft = {id, created: nowStr(), name: '', dm: true, members: [lo, hi], mem: lo === S.uid ? [a, b] : [b, a]};
  S.room = id; render();
};
ACT.send = () => {
  const inp = $('#msgin'); const text = inp.value.trim(); if (!text) return;
  const room = ensureRoom(); if (!room) return;
  const m = create('msgs', {room: room.id, who: S.uid, text, ts: Date.now()});
  if (room.mem && room.mem.length) m.mem = room.mem.slice();
  if (S.replyTo) { m.rto = S.replyTo; S.replyTo = null; }
  put('msgs', m); inp.value = ''; render(); setTimeout(() => { const i = $('#msgin'); if (i) i.focus(); }, 0);
};
// PC: Enter 보내기 · Shift+Enter 줄바꿈 / 휴대폰: Enter 는 줄바꿈, 보내기 버튼으로 보냄(카톡과 같음)
const coarse = () => matchMedia('(pointer: coarse)').matches;
document.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.target.id === 'msgin' && !coarse()) { e.preventDefault(); ACT.send(); } });
const growMsg = el => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 140) + 'px'; };
document.addEventListener('input', e => { if (e.target && e.target.id === 'msgin') growMsg(e.target); });
ACT.avScroll = d => { const el = $('#avs'); if (el) el.scrollBy({left: Number(d) * Math.max(160, el.clientWidth - 60), behavior: 'smooth'}); };
// 새 채팅: 앱과 같이 '그룹 채팅방'과 '1:1 대화' 중에서 고른다
ACT.newChat = () => modal('<h3>새 채팅</h3><div class="sub" style="margin-top:0">어떤 대화를 시작할까요?</div>' +
  '<button class="btn gold full" data-act="newGroup">👥 그룹 채팅방 만들기</button><button class="btn tint full" data-act="pickDm">👤 1:1 대화 (직원 고르기)</button><button class="btn full" data-act="close">취소</button>');
ACT.pickDm = () => {
  const staff = list('users').filter(u => u.id !== S.uid && u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  modal('<h3>1:1 대화 — 직원 고르기</h3><input id="dmq" placeholder="🔍 이름·초성·번호 (예: ㄱㅌㅎ)" autocomplete="off"><div id="dml" style="max-height:50vh;overflow:auto;margin-top:6px"></div><button class="btn full" data-act="close">닫기</button>');
  const q = $('#dmq'), L = $('#dml');
  const fill = () => { const v = q.value.trim(); const hs = staff.filter(u => kmatch((u.name || '') + ' ' + (u.phone || '').replace('+82', '0'), v));
    L.innerHTML = hs.map(u => { const pr = byId('profiles', u.id); return '<button type="button" class="dmrow" data-id="' + u.id + '">' + avatarHTML(u.id, 40) + '<span><b>' + esc(u.name) + '</b>' + (pr && pr.status ? '<small>' + esc(pr.status) + '</small>' : '') + '</span></button>'; }).join('') || '<div class="sub">찾는 직원이 없어요.</div>'; };
  q.addEventListener('input', fill); L.onclick = ev => { const b = ev.target.closest('.dmrow'); if (b) { closeModal(); ACT.dm(Number(b.dataset.id)); } };
  fill(); q.focus();
};
ACT.newGroup = () => {
  const staff = list('users').filter(u => u.id !== S.uid && u.active !== false && u.phone).sort((a, b) => a.name.localeCompare(b.name));
  formModal('그룹 채팅방 만들기', '<input id="f_n" placeholder="그룹 이름 (필수)"><div class="sub" style="margin-top:10px">초대할 직원</div><input id="gq" placeholder="🔍 직원 찾기 (이름·초성)" autocomplete="off">' + staff.map(u => '<label class="chk" data-nm="' + esc(u.name) + '"><input type="checkbox" class="gm" value="' + u.id + '"><span>' + esc(u.name) + '</span></label>').join(''), () => {
    const n = $('#f_n').value.trim(); if (!n) return warn('그룹 이름을 입력해 주세요.');
    const ids = [...document.querySelectorAll('.gm:checked')].map(c => Number(c.value)); if (!ids.length) return warn('초대할 직원을 골라 주세요.');
    const mem = [e164(S.phone)]; const members = [S.uid];
    ids.forEach(i => { members.push(i); mem.push(e164(user(i).phone)); });
    const r = create('rooms', {name: n, by: S.uid, grp: true, members, mem}); put('rooms', r); S.room = r.id; render(); toast('그룹 채팅방을 만들었어요.'); return true;
  }, '만들기');
  $('#gq').addEventListener('input', e => { const v = e.target.value.trim(); document.querySelectorAll('#modal .chk[data-nm]').forEach(l => { l.style.display = kmatch(l.dataset.nm, v) || l.querySelector('input').checked ? '' : 'none'; }); });
};

// ---------- 가맹점 ----------
// 예전 앱은 연락처가 한 칸(phone)이었다 → 휴대폰 번호(010…)만 들어 있으면 휴대폰번호로 보여 준다 (수정해서 저장하면 그 칸으로 옮겨진다)
function mNums(m) { const p = m.phone || ''; return !m.mobile && /^01[016789]/.test(p.replace(/\D/g, '')) ? {phone: '', mobile: p} : {phone: p, mobile: m.mobile || ''}; }
function mHay(m) { const b = m.bizno || '', d = v => String(v || '').replace(/\D/g, ''); return [m.name, m.owner, b, d(b), m.phone, d(m.phone), m.mobile, d(m.mobile), m.addr, m.van].filter(Boolean).join(' '); } // 상호·대표자·사업자번호·전화·핸드폰(하이픈 없이도)·주소·VAN
function termsShort(m) { return m.ctype === '임대' ? '임대' + (m.camt ? ' · 월 ' + won(m.camt) : '') : m.ctype === '판매' ? '판매' + (m.camt ? ' · ' + won(m.camt) : '') : ''; }
function viewMerchants() {
  const all = list('merchants').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const today = todayStr(), ef = S.mExp || 0;
  let hits = all.filter(m => kmatch(mHay(m), S.mq));
  if (ef) { // 계약 만료 예정: 1~3 = 개월 이내, 9 = 만료됨 (계약종료일이 빈 가맹점은 여기서만 빠진다)
    hits = hits.filter(m => /^\d{4}-\d{2}-\d{2}$/.test(m.cend || '') && (ef === 9 ? m.cend < today : m.cend >= today && m.cend <= addMonths(today, ef))).sort((a, b) => a.cend.localeCompare(b.cend));
  }
  const shown = hits.slice(0, S.mlimit);
  const rows = !shown.length ? '' : isWide()
    ? '<div class="tbl"><table><thead><tr><th>상호</th><th>사업자번호</th><th>전화 / 휴대폰</th><th>VAN사</th><th>계약</th><th>계약종료</th><th>주소</th></tr></thead><tbody>' + shown.map(m => {
      const n = mNums(m), t = termsShort(m);
      return '<tr data-act="merchant" data-arg="' + m.id + '"><td class="b">' + esc(m.name) + '</td><td>' + esc(m.bizno || '') + '</td><td>' + esc([n.phone, n.mobile].filter(Boolean).join(' / ')) + '</td><td>' + esc(m.van || '') + '</td><td>' + (t ? '<span class="chip">' + esc(t) + '</span>' : '') + '</td><td>' + cendHTML(m) + '</td><td class="g">' + esc(m.addr || '') + '</td></tr>';
    }).join('') + '</tbody></table></div>'
    : shown.map(m => {
      const n = mNums(m), t = termsShort(m);
      return '<div class="card" data-act="merchant" data-arg="' + m.id + '"><div class="row"><div class="grow"><div class="t1">' + esc(m.name) + '</div><div class="t2">' + esc([m.bizno, n.phone || n.mobile, m.van].filter(Boolean).join(' · ') || '연락처 없음') + '</div>' + (m.addr ? '<div class="t2">' + esc(m.addr) + '</div>' : '') + (m.cend ? '<div class="t2">계약종료 ' + cendHTML(m) + '</div>' : '') + '</div>' + (t ? '<span class="chip">' + esc(t) + '</span>' : '') + '</div></div>';
    }).join('');
  return '<h1>가맹점</h1><div class="sub">눌러서 보고' + (canEditMerchant() ? ', 오른쪽 아래 + 로 새로 등록해요.' : '요.') + '</div><input id="mq" data-q="mq" placeholder="🔍 상호·대표자·초성·사업자번호·전화·핸드폰" value="' + esc(S.mq) + '">' +
    '<div class="pills"><span class="sub" style="align-self:center;margin:0">계약 만료 예정</span>' + [[0, '전체'], [1, '1개월 이내'], [2, '2개월 이내'], [3, '3개월 이내'], [9, '만료됨']].map(([v, lb]) => '<button class="pill ' + (ef === v ? 'on' : '') + '" data-act="mExp" data-arg="' + v + '">' + lb + '</button>').join('') + '</div>' +
    '<div class="qres" data-for="mq"><div class="sub" style="margin-top:8px;font-weight:700">' + (S.mq.trim() || ef ? '찾은 가맹점 ' : '전체 ') + hits.length + '곳' + (ef ? ' · 계약종료일 빠른 순' : '') + '</div>' + rows +
    (hits.length > shown.length ? '<button class="btn full" data-act="mmore">더 보기 (' + (hits.length - shown.length) + '곳 남음)</button>' : '') +
    (!hits.length ? '<div class="empty">' + (ef ? '조건에 맞는 가맹점이 없어요. (계약종료일을 넣은 가맹점만 걸러져요)' : S.mq.trim() ? '찾는 가맹점이 없어요.' : '등록된 가맹점이 없습니다.') + '</div>' : '') + '</div>';
}
ACT.mmore = () => { S.mlimit += 100; render(); };
ACT.mExp = v => { S.mExp = Number(v); S.mlimit = 50; render(); };
function cendHTML(m) { if (!m.cend) return ''; const d = daysLeft(m.cend); return '<span style="' + (d <= 30 ? 'color:var(--red);font-weight:700' : '') + '">' + esc(m.cend) + (d === 99999 ? '' : ' · ' + esc(dday(d))) + '</span>'; }
ACT.merchant = id => {
  const m = byId('merchants', id); if (!m) return;
  rememberMerchant(m.id);
  if (S.logMid !== m.id) { S.logMid = m.id; S.logLimit = 30; }
  if (S.logMidF !== m.id) { S.logMidF = m.id; S.logKindF = ''; S.logDateF = ''; }
  const logs = list('mlogs').filter(g => g.merchant === m.id && (!S.logKindF || logKind(g.kind) === S.logKindF) && (!S.logDateF || g.date === S.logDateF)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
  const ln = (k, v) => v ? '<div class="line"><b>' + k + '</b><div>' + esc(v) + '</div></div>' : '';
  const nm = mNums(m); const ph = nm.phone.replace(/[^0-9+*#]/g, ''); const mp = nm.mobile.replace(/[^0-9+*#]/g, '');
  const callBtn = (num, raw, lb) => num ? '<a class="btn tint full" style="display:block;text-align:center;text-decoration:none;margin-top:6px" href="tel:' + num + '">📞 ' + lb + ' ' + esc(raw) + ' 전화 걸기</a>' : '';
  modal('<h3>' + esc(m.name) + '</h3>' + ln('사업자번호', m.bizno) + ln('전화번호', nm.phone) + ln('휴대폰번호', nm.mobile) + ln('이메일', m.email) + ln('주소', m.addr) + ln('VAN사', m.van) + ln('계약조건', termsText(m)) + ln('계약기간', m.cstart || m.cend ? (m.cstart || '') + ' ~ ' + (m.cend || '') + (m.cend ? '  (' + dday(daysLeft(m.cend)) + ')' : '') : '') + ln('등급', gradeFull(m.grade)) + ln('메모', m.memo) +
    callBtn(ph, nm.phone, '전화') + callBtn(mp, nm.mobile, '휴대폰') +
    openTasksOf(m) +
    '<h2>📝 응대 기록 (' + logs.length + '건)</h2><button class="btn gold full" data-act="newLog" data-arg="' + m.id + '">+ 응대 기록 남기기</button>' +
    '<div class="pills">' + [''].concat(KINDS).map(k => '<button class="pill ' + (S.logKindF === k ? 'on' : '') + '" data-act="logKindF" data-arg="' + m.id + '|' + k + '">' + (k || '전체') + '</button>').join('') + '</div>' +
    '<div class="row" style="gap:8px"><input type="date" id="logDateF" value="' + esc(S.logDateF || '') + '" data-mid="' + m.id + '" aria-label="날짜로 찾기">' + (S.logDateF ? '<button class="btn" style="flex:none" data-act="logDateOff" data-arg="' + m.id + '">날짜 해제</button>' : '') + '</div>' +
    logs.slice(0, S.logLimit).map(g => logCard(g, 'editLog|' + g.id + '|' + m.id)).join('') + (logs.length > S.logLimit ? '<button class="btn full" data-act="logmore" data-arg="' + m.id + '">더 보기 (' + (logs.length - S.logLimit) + '건 남음)</button>' : '') +
    '<div class="btns" style="margin-top:10px">' + (canEditMerchant() ? '<button class="btn" data-act="editMerchant" data-arg="' + m.id + '">정보 수정</button><button class="btn red" data-act="delMerchant" data-arg="' + m.id + '">삭제</button>' : '') + (can('staff_manage') ? '<button class="btn" data-act="mhist" data-arg="' + m.id + '">🕘 변경 이력</button>' : '') + '<button class="btn" data-act="close">닫기</button></div>');
};
function openTasksOf(m) { // 이 가맹점에 걸린 아직 안 끝난 업무
  const ts = list('tasks').filter(t => t.status !== '완료' && (t.merchant === m.id || (!t.merchant && t.client && t.client.trim() === (m.name || '').trim())));
  return ts.length ? '<h2>📋 진행 중인 업무 (' + ts.length + '건)</h2>' + ts.map(t => '<div class="card" data-act="task" data-arg="' + t.id + '"><div class="t1">[' + esc(t.type) + '] ' + esc(t.title) + '</div><div class="t2">' + esc(uname(t.assignee) + ' · ' + (ST[t.status] || t.status) + (t.due ? ' · ' + t.due : '')) + '</div>' + (t.req ? '<div style="font-size:13px;margin-top:4px">요청: ' + esc(t.req) + '</div>' : '') + '</div>').join('') : '';
}
function logCard(g, act) {
  const [a, id, mid] = act.split('|');
  return '<div class="card" data-act="' + a + '" data-arg="' + id + '|' + mid + '"><span class="chip">' + esc(logKind(g.kind)) + '</span> <b style="font-size:13px">' + esc(g.date) + '</b>' + (logReq(g) ? '<div class="lb">요청사항</div><div style="white-space:pre-wrap">' + esc(logReq(g)) + '</div>' : '') + (logRes(g) ? '<div class="lb g">처리결과</div><div style="white-space:pre-wrap">' + esc(logRes(g)) + '</div>' : '') + '<div class="t2">' + (g.task ? '📋 업무에서 · ' : '') + esc(uname(g.who) + (g.editedBy ? ' · 수정 ' + uname(g.editedBy) + ' ' + (g.editedAt || '') : '')) + '</div></div>';
}
ACT.logKindF = a => { const [mid, k] = a.split('|'); S.logKindF = k; ACT.merchant(mid); };
ACT.logDateOff = mid => { S.logDateF = ''; ACT.merchant(mid); };
document.addEventListener('change', e => { if (e.target && e.target.id === 'logDateF') { S.logDateF = e.target.value; ACT.merchant(e.target.dataset.mid); } });
ACT.logmore = mid => { S.logLimit += 50; ACT.merchant(mid); };
ACT.editLog = a => {
  const [id, mid] = a.split('|'); const g = byId('mlogs', id); if (!g) return;
  const mine = g.who === S.uid || can('staff_manage');
  formModal('응대 기록 수정', '<div class="sub">' + esc(g.mname) + ' · 작성 ' + esc(uname(g.who)) + (g.editedBy ? ' · 마지막 수정 ' + esc(uname(g.editedBy)) + ' ' + esc(g.editedAt || '') : '') + '</div><input id="f_d" type="date" value="' + esc(g.date) + '"><select id="f_k">' + KINDS.map(k => '<option' + (k === logKind(g.kind) ? ' selected' : '') + '>' + k + '</option>').join('') + '</select><div class="lb">요청사항</div><textarea id="f_m" placeholder="고객이 요청한 내용">' + esc(logReq(g)) + '</textarea><div class="lb g">처리결과</div><textarea id="f_r" placeholder="어떻게 처리했는지">' + esc(logRes(g)) + '</textarea>' + (mine ? '<button class="btn red full" id="f_del">이 기록 지우기</button>' : ''), () => {
    const d = $('#f_d').value, t = $('#f_m').value.trim(), r = $('#f_r').value.trim(); if (!d || (!t && !r)) return warn('날짜와 요청사항(또는 처리결과)을 적어 주세요.');
    if (t !== logReq(g) || r !== logRes(g)) { g.editedBy = S.uid; g.editedAt = nowStr(); }
    g.date = d; g.kind = $('#f_k').value; g.req = t; g.res = r; g.text = t + (r ? (t ? '\n' : '') + '→ 처리: ' + r : ''); put('mlogs', g); render(); if (mid && byId('merchants', mid)) ACT.merchant(mid); toast('고쳤어요.'); return true;
  }, '저장');
  const del = $('#f_del'); if (del) del.onclick = () => needDelPw('응대 기록 삭제', () => askConfirm('이 기록을 지울까요?', '', '지우기', () => { g.deleted = true; put('mlogs', g); render(); if (mid && byId('merchants', mid)) ACT.merchant(mid); }, true));
};
ACT.newLog = mid => formModal('응대 기록', '<input id="f_d" type="date" value="' + todayStr() + '"><select id="f_k">' + KINDS.map(k => '<option>' + k + '</option>').join('') + '</select><div class="lb">요청사항</div><textarea id="f_m" placeholder="고객이 요청한 내용"></textarea><div class="lb g">처리결과</div><textarea id="f_r" placeholder="어떻게 처리했는지"></textarea>', () => {
  const d = $('#f_d').value, t = $('#f_m').value.trim(), r = $('#f_r').value.trim(); if (!d || (!t && !r)) return warn('날짜와 요청사항(또는 처리결과)을 적어 주세요.');
  const m = byId('merchants', mid); put('mlogs', create('mlogs', {merchant: m.id, mname: m.name, date: d, kind: $('#f_k').value, req: t, res: r, text: t + (r ? (t ? '\n' : '') + '→ 처리: ' + r : ''), who: S.uid})); render(); ACT.merchant(mid); toast('기록을 남겼어요.'); return true;
}, '저장');
const VANS = ['다우데이타', '다우데이타PG', 'KIS정보통신', 'KIS정보통신PG', 'NHN KCP', 'KOVAN', 'KOPAY PG']; // 취급 VAN·PG사 (그 밖은 직접 입력하면 다음부터 목록에 같이 나와요)
const won = v => { const n = String(v || '').replace(/[^0-9]/g, ''); return n ? Number(n).toLocaleString('ko-KR') + '원' : ''; };
const amtLabel = ct => ct === '임대' ? '월 CMS 금액 (원)' : ct === '판매' ? '판매 금액 (원)' : '금액 (원, 계약구분을 먼저 골라요)';
function termsText(m) {
  const p = [];
  if (m.ctype === '임대') p.push('임대' + (m.camt ? ' · 월 CMS ' + won(m.camt) : ''));
  else if (m.ctype === '판매') p.push('판매' + (m.camt ? ' · 판매 ' + won(m.camt) : ''));
  if (m.terms) p.push(m.terms);
  return p.join(' · ');
}
const mfield = (id, label, ph, v, t) => '<label class="fl" for="' + id + '">' + label + '</label><input id="' + id + '" placeholder="' + ph + '" value="' + esc(v || '') + '"' + (t ? ' type="' + t + '"' : '') + '>';
// 등급(저장 값 0~5·7): 직원들은 0~3은 '0코드'처럼 코드로, 나머지는 이름(해지가맹점·신규가맹점·협력사)으로 부른다
const GRADES = ['VAN 수수료 월 5만원 이상', '월 3만원 이상', '월 1만원 이상', '월 1만원 미만', '해지가맹점', '신규가맹점', '', '협력사'];
const gradeLabel = g => (g == null || g === '' || !GRADES[g]) ? '' : (Number(g) <= 3 ? g + '코드' : GRADES[g]); // 짧게: 목록·칩
const gradeFull = g => (g == null || g === '' || !GRADES[g]) ? '' : (Number(g) <= 3 ? g + '코드 · ' + GRADES[g] : GRADES[g]); // 고를 때·상세
function merchantForm(m) {
  m = m || {}; const nm = mNums(m);
  return mfield('f_n', '상호 (필수)', '예: 토스단말기 전문', m.name) + mfield('f_b', '사업자번호', '예: 123-45-67890', m.bizno) +
    mfield('f_p', '전화번호', '예: 062-123-4567', nm.phone, 'tel') + mfield('f_mo', '휴대폰번호', '예: 010-1234-5678', nm.mobile, 'tel') +
    mfield('f_e', '이메일', '예: name@example.com', m.email, 'email') + '<label class="fl" for="f_a">주소</label><div class="addrrow"><input id="f_a" placeholder="🔍 눌러서 주소 검색" value="' + esc(m.addr || '') + '" autocomplete="off"><button type="button" class="btn tint" id="f_asr">주소 검색</button></div>' +
    '<label class="fl" for="f_v">VAN사</label><input id="f_v" list="vanlist" placeholder="목록에서 고르거나 직접 입력" value="' + esc(m.van || '') + '"><datalist id="vanlist">' + [...new Set(VANS.concat(list('merchants').map(x => (x.van || '').trim()).filter(Boolean)))].map(v => '<option value="' + esc(v) + '">').join('') + '</datalist>' +
    '<label class="fl" for="f_ct">계약구분</label><select id="f_ct">' + ['', '임대', '판매'].map(v => '<option value="' + v + '"' + ((m.ctype || '') === v ? ' selected' : '') + '>' + (v || '(선택 안 함)') + '</option>').join('') + '</select>' +
    '<label class="fl" for="f_ca" id="f_cal">' + amtLabel(m.ctype) + '</label><input id="f_ca" inputmode="numeric" placeholder="숫자만 (예: 30000)" value="' + esc(m.camt || '') + '">' +
    mfield('f_t', '계약조건 (추가 내용)', '예: 36개월 약정, 위약금 없음', m.terms) +
    '<div class="row" style="gap:8px"><div class="grow">' + mfield('f_cs', '계약시작일', '', m.cstart, 'date') + '</div><div class="grow">' + mfield('f_ce', '계약종료일', '', m.cend, 'date') + '</div></div>' +
    '<label class="fl" for="f_g">등급 (0~3코드: 밴피 기준)</label><select id="f_g">' + GRADES.map((g, i) => g ? '<option value="' + i + '"' + (Number(m.grade == null ? 5 : m.grade) === i ? ' selected' : '') + '>' + gradeFull(i) + '</option>' : '').join('') + '</select>' +
    '<label class="fl" for="f_m">메모</label><textarea id="f_m" placeholder="메모">' + esc(m.memo || '') + '</textarea>';
}
function wireMerchantForm() {
  const ct = $('#f_ct'); if (ct) ct.onchange = () => { $('#f_cal').textContent = amtLabel(ct.value); };
  const a = $('#f_a'), b = $('#f_asr'); if (!a || !b) return;
  const go = () => addrSearch(v => { a.value = v + ' '; a.focus(); a.setSelectionRange(a.value.length, a.value.length); toast('동·호수 같은 상세 주소는 뒤에 이어 적어 주세요.'); });
  b.onclick = go; a.onclick = () => { if (!a.value.trim()) go(); }; // 빈 칸을 누르면 바로 검색, 고른 뒤에는 상세 주소를 이어 적는다
}
// ---------- 주소 검색 (인터넷 주소 검색처럼: 도로명·지번·건물명으로 찾아 고르기 — 카카오 우편번호 서비스, 무료·키 없음) ----------
let postcodeJs = null;
function loadPostcode() {
  if (window.daum && window.daum.Postcode) return Promise.resolve();
  if (!postcodeJs) postcodeJs = new Promise((ok, no) => { const sc = document.createElement('script'); sc.src = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'; sc.onload = ok; sc.onerror = () => { postcodeJs = null; no(); }; document.head.appendChild(sc); });
  return postcodeJs;
}
function addrOf(d) { const a = d.roadAddress || d.address || d.jibunAddress || ''; const x = []; if (d.bname && /[동로가]$/.test(d.bname)) x.push(d.bname); if (d.buildingName) x.push(d.buildingName); return a + (x.length ? ' (' + x.join(', ') + ')' : ''); }
function addrSearch(onPick) { // 입력 팝업 위에 따로 띄운다(가맹점 등록 창은 그대로)
  const ov = document.createElement('div'); ov.className = 'addrpop';
  ov.innerHTML = '<div class="addrbox"><div class="row"><h3 class="grow" style="margin:0">주소 검색</h3><button type="button" class="btn" id="addrx" style="margin:0">닫기</button></div><div id="addrw"><div class="sub" style="padding:30px;text-align:center">주소 검색을 불러오는 중…</div></div></div>';
  document.body.appendChild(ov);
  const close = () => ov.remove();
  ov.querySelector('#addrx').onclick = close; ov.onclick = e => { if (e.target === ov) close(); };
  loadPostcode().then(() => {
    const w = ov.querySelector('#addrw'); w.innerHTML = '';
    new window.daum.Postcode({width: '100%', height: '100%', oncomplete: d => { close(); onPick(addrOf(d), d.zonecode || ''); }}).embed(w, {autoClose: false});
  }).catch(() => { ov.querySelector('#addrw').innerHTML = '<div class="sub" style="padding:30px;text-align:center">주소 검색을 불러오지 못했어요. 인터넷 연결을 확인하거나 주소를 직접 적어 주세요.</div>'; });
}
function readMerchant(o) {
  o.name = $('#f_n').value.trim(); o.bizno = $('#f_b').value.trim(); o.phone = $('#f_p').value.trim(); o.mobile = $('#f_mo').value.trim(); o.email = $('#f_e').value.trim();
  o.addr = $('#f_a').value.trim(); o.van = $('#f_v').value.trim(); o.ctype = $('#f_ct').value; o.camt = $('#f_ca').value.replace(/[^0-9]/g, ''); o.terms = $('#f_t').value.trim(); o.grade = Number($('#f_g').value); o.memo = $('#f_m').value.trim(); o.cstart = $('#f_cs').value; o.cend = $('#f_ce').value; return o;
}
// ---------- 가맹점 수정 암호 (화면 잠금) ----------
const LOCK_MS = 5 * 60 * 1000; let unlockedAt = 0;
const lockDoc = () => list('config').filter(c => c.key === 'merchant_lock' && c.hash).sort((a, b) => (b.created || '').localeCompare(a.created || ''))[0];
const canEditMerchant = () => can('merchant_edit') || can('staff_manage');
async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
function needLock(then) {
  if (!canEditMerchant()) { toast('가맹점 수정 권한이 없어요. 관리자에게 요청해 주세요.'); return; }
  const L = lockDoc(); if (!L || Date.now() - unlockedAt < LOCK_MS) return then();
  formModal('암호 확인', '<div class="sub">가맹점 정보를 고치려면 암호가 필요해요.</div><input id="f_pw" type="password" autocomplete="off" placeholder="암호">', () => {
    const v = $('#f_pw').value; sha(L.salt + v).then(h => { if (h === L.hash) { unlockedAt = Date.now(); closeModal(); then(); } else { toast('암호가 맞지 않아요.'); } }); return false;
  }, '확인');
}
ACT.mlockSet = () => {
  if (!can('staff_manage')) return toast('관리자만 설정할 수 있어요.');
  const L = lockDoc();
  formModal('가맹점 수정 암호', '<div class="sub">' + (L ? '암호가 설정돼 있어요. 바꾸려면 현재 암호도 입력해 주세요.' : '아직 암호가 없어서 누구나(권한이 있으면) 수정할 수 있어요. 암호를 정하면 수정할 때마다 물어봐요.') + '</div>' +
    (L ? '<input id="f_old" type="password" autocomplete="off" placeholder="현재 암호">' : '') + '<input id="f_new" type="password" autocomplete="off" placeholder="새 암호 (4자 이상)"><input id="f_new2" type="password" autocomplete="off" placeholder="새 암호 한 번 더">', () => {
    const nw = $('#f_new').value; if (nw.length < 4) return warn('암호는 4자 이상으로 해 주세요.'); if (nw !== $('#f_new2').value) return warn('새 암호가 서로 달라요.');
    const done = () => { const salt = Math.random().toString(36).slice(2) + Date.now().toString(36); sha(salt + nw).then(h => { const o = L || create('config', {key: 'merchant_lock'}); o.salt = salt; o.hash = h; o.changedBy = S.uid; o.changedAt = nowStr(); put('config', o); unlockedAt = Date.now(); closeModal(); render(); toast('암호를 저장했어요.'); }); };
    if (L) sha(L.salt + $('#f_old').value).then(h => { if (h === L.hash) done(); else toast('현재 암호가 맞지 않아요.'); }); else done();
    return false;
  }, '저장');
};
ACT.mlockOff = () => {
  if (!can('staff_manage')) return; const L = lockDoc(); if (!L) return;
  formModal('암호 끄기', '<div class="sub">현재 암호를 입력하면 잠금을 꺼요. (이후 권한이 있는 직원은 암호 없이 수정해요)</div><input id="f_old" type="password" autocomplete="off" placeholder="현재 암호">', () => {
    sha(L.salt + $('#f_old').value).then(h => { if (h === L.hash) { L.salt = ''; L.hash = ''; L.key = 'merchant_lock_off'; put('config', L); closeModal(); render(); toast('암호를 껐어요.'); } else toast('현재 암호가 맞지 않아요.'); }); return false;
  }, '끄기');
};
ACT.newMerchant = () => needLock(() => { let dupOk = false; formModal('가맹점 등록', merchantForm(null), () => {
  if (!$('#f_n').value.trim()) return warn('상호를 입력해 주세요.');
  const bd = $('#f_b').value.replace(/\D/g, ''); const dup = bd.length >= 10 && list('merchants').find(m => (m.bizno || '').replace(/\D/g, '') === bd);
  if (dup && !dupOk) { dupOk = true; return warn('같은 사업자번호의 가맹점 ‘' + dup.name + '’이(가) 이미 있어요. 그래도 등록하려면 저장을 한 번 더 누르세요.'); }
  const o = readMerchant(create('merchants', {grade: 5})); put('merchants', o); render(); toast('저장했어요.'); return true;
}, '저장'); wireMerchantForm(); });
// 다른 창(업무 요청)에서 가맹점을 새로 등록하고 돌아간다 — 권한·암호 규칙은 그대로
function newMerchantThen(q, done, back) {
  if (!canEditMerchant()) { toast('가맹점 등록·수정 권한이 없어요. 관리자에게 요청해 주세요.'); return back(); }
  const pre = {}; if ((q || '').replace(/\D/g, '').length >= 10) pre.bizno = q; else pre.name = q || '';
  needLock(() => { let dupOk = false; formModal('가맹점 등록', merchantForm(pre), () => {
    if (!$('#f_n').value.trim()) return warn('상호를 입력해 주세요.');
    const bd = $('#f_b').value.replace(/\D/g, ''); const dup = bd.length >= 10 && list('merchants').find(m => (m.bizno || '').replace(/\D/g, '') === bd);
    if (dup && !dupOk) { dupOk = true; return warn('같은 사업자번호의 가맹점 ‘' + dup.name + '’이(가) 이미 있어요. 그래도 등록하려면 저장을 한 번 더 누르세요.'); }
    const o = readMerchant(create('merchants', {grade: 5})); put('merchants', o); toast('가맹점을 등록하고 업무에 연결했어요.'); setTimeout(() => done(o), 0); return true;
  }, '저장'); wireMerchantForm(); $('#m_cancel').onclick = () => { closeModal(); back(); }; });
}
function toggleWord(s, w) { // 빠른 선택: 누르면 넣고 뒤에 ', ' 를 붙여 바로 이어 쓸 수 있게, 다시 누르면 뺀다
  const parts = String(s || '').split(',').map(x => x.trim()).filter(Boolean);
  const k = parts.indexOf(w); if (k >= 0) parts.splice(k, 1); else parts.push(w);
  return parts.length ? parts.join(', ') + ', ' : '';
}
const reqClean = v => String(v || '').replace(/[\s,]+$/, '').trim(); // 끝에 남은 쉼표는 빼고 저장
ACT.delMerchant = id => needLock(() => {
  const m = byId('merchants', id); if (!m) return; needDelPw('‘' + m.name + '’ 가맹점 삭제', () => {
  const c = list('mlogs').filter(g => g.merchant === m.id).length;
  askConfirm('‘' + m.name + '’ 가맹점을 삭제할까요?', '목록에서만 지워지고, 응대 기록 ' + c + '건과 서버의 기록은 그대로 남아요. (앱의 가맹점 보호·복원에서 되살릴 수 있어요)', '삭제', () => { m.deleted = true; put('merchants', m); render(); toast('삭제했어요.'); }, true);
  });
});
const MF = {grade: '등급', name: '상호', bizno: '사업자번호', phone: '전화번호', mobile: '휴대폰번호', email: '이메일', addr: '주소', van: 'VAN사', ctype: '계약구분', camt: '금액', terms: '계약조건', cstart: '계약시작일', cend: '계약종료일', memo: '메모', deleted: '삭제'};
ACT.editMerchant = id => needLock(() => {
  const key = 'merchants/' + Number(id), base = S.pushed[key], before = JSON.stringify(byId('merchants', id)); let forced = false;
  formModal('가맹점 정보 수정', merchantForm(byId('merchants', id)) + '<div id="f_conf"></div>', () => {
    if (!$('#f_n').value.trim()) return warn('상호를 입력해 주세요.');
    const now = byId('merchants', id);
    if (!forced && (S.pushed[key] !== base || JSON.stringify(now) !== before)) { // 창을 연 사이에 다른 곳(앱·다른 PC)에서 저장됨
      const old = JSON.parse(before || '{}'); const ch = Object.keys(MF).filter(k => String(old[k] || '') !== String(now[k] || '')).map(k => MF[k]);
      $('#f_conf').innerHTML = '<div class="conf">⚠ 이 창을 연 뒤 다른 직원이 이 가맹점을 고쳤어요' + (ch.length ? ' (' + ch.join(', ') + ')' : '') + '.<br>지금 저장하면 그 내용을 내 입력으로 덮어써요. 그래도 저장하려면 <b>저장</b>을 한 번 더 누르고, 아니면 취소 후 다시 열어 최신 내용을 확인하세요.</div>';
      forced = true; return warn('다른 직원이 방금 고쳤어요. 아래 안내를 확인해 주세요.');
    }
    const o = readMerchant(now); put('merchants', o); render(); toast('저장했어요.'); return true;
  }, '저장'); wireMerchantForm();
});
function viewAllLogs() {
  const mq = (S.lmq || '').trim(); const q = S.lq || '';
  let found = '';
  if (mq) {
    const hits = list('merchants').filter(m => { const b = m.bizno || ''; return kmatch((m.name || '') + ' ' + b + ' ' + b.replace(/-/g, ''), mq); }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    found = hits.slice(0, 20).map(m => { const c = list('mlogs').filter(g => g.merchant === m.id).length; return '<div class="card" data-act="merchant" data-arg="' + m.id + '"><div class="row"><div class="grow"><div class="t1">' + esc(m.name) + '</div><div class="t2">' + esc((m.bizno || '사업자번호 없음') + ' · 응대 기록 ' + c + '건') + '</div></div><span style="color:var(--deep);font-size:22px">›</span></div></div>'; }).join('') +
      (hits.length > 20 ? '<div class="sub">더 있어요. 검색어를 더 적어 주세요.</div>' : '') + (hits.length ? '' : '<div class="empty">찾는 가맹점이 없어요. (상호·초성·사업자번호로 찾아요)</div>');
  }
  const ls = list('mlogs').filter(g => kmatch(logAll(g), q)).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || ''));
  return '<h1>가맹점 응대 기록</h1><div class="sub">상호·초성·사업자번호로 가맹점을 찾아 눌러서 기록을 보고·추가·수정해요.</div><input id="lmq" data-q="lmq" placeholder="🔍 상호·대표자·초성·사업자번호·전화" value="' + esc(S.lmq) + '"><div class="qres" data-for="lmq">' + found + '</div>' +
    '<h2>최근 기록</h2><input id="lq" data-q="lq" placeholder="가맹점·내용 검색 (초성 가능)" value="' + esc(q) + '"><div class="qres" data-for="lq"><div class="sub" style="margin-top:8px;font-weight:700">기록 ' + ls.length + '건 · 눌러서 수정</div>' +
    ls.slice(0, 100).map(g => logCard(g, 'editLog|' + g.id + '|' + g.merchant).replace('<span class="chip">' + esc(logKind(g.kind)) + '</span>', '<span class="chip">' + esc(logKind(g.kind)) + '</span> <b>' + esc(g.mname) + '</b>')).join('') + (ls.length > 100 ? '<div class="sub">최근 100건만 보여요.</div>' : '') + (ls.length ? '' : '<div class="empty">기록이 없어요.</div>') + '</div>';
}

// ---------- 바코드 스캔 ----------
// PC: USB·블루투스 바코드 스캐너는 키보드처럼 번호를 치고 Enter 를 누른다 → 입력칸에 커서를 두고 찍으면 된다.
// 휴대폰(아이폰): 카메라로 찍는다. 브라우저 기본 기능(BarcodeDetector)이 없으면 zxing(web/vendor)을 그때 불러온다.
let zxingP = null;
function loadZxing() {
  return zxingP || (zxingP = new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'vendor/zxing-0.21.3.min.js';
    s.onload = () => ok(window.ZXing); s.onerror = () => { zxingP = null; no(new Error('zxing')); }; document.head.appendChild(s);
  }));
}
async function nativeDetector() {
  try { if (!('BarcodeDetector' in window)) return null; const f = await BarcodeDetector.getSupportedFormats(); return f && f.length ? new BarcodeDetector({formats: f}) : null; } catch (e) { return null; }
}
function scanCamera(onCode) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return toast('이 브라우저는 카메라를 쓸 수 없어요. 번호를 직접 입력해 주세요.');
  const ov = document.createElement('div'); ov.className = 'scanov';
  ov.innerHTML = '<video playsinline muted autoplay></video><div class="scanbox"></div><div class="scanmsg">바코드를 네모 안에 맞춰 주세요</div><button class="btn">닫기</button>';
  document.body.appendChild(ov);
  const video = ov.querySelector('video'); let stream = null, timer = 0, reader = null, done = false;
  const stop = () => { done = true; clearInterval(timer); if (reader) { try { reader.reset(); } catch (e) {} } if (stream) stream.getTracks().forEach(t => t.stop()); ov.remove(); };
  const hit = code => { if (done || !code) return; stop(); if (navigator.vibrate) navigator.vibrate(80); onCode(String(code).trim()); };
  const fail = e => { if (done) return; stop(); toast(e && e.name === 'NotAllowedError' ? '카메라 권한이 필요해요. 설정에서 이 사이트의 카메라를 허용해 주세요.' : '카메라를 열지 못했어요. 번호를 직접 입력해 주세요.'); };
  ov.querySelector('button').onclick = stop;
  nativeDetector().then(det => {
    if (done) return;
    if (det) {
      return navigator.mediaDevices.getUserMedia({video: {facingMode: 'environment'}, audio: false}).then(s => {
        stream = s; if (done) return stop(); video.srcObject = s; video.play().catch(() => {});
        timer = setInterval(() => { if (video.readyState >= 2) det.detect(video).then(r => { if (r && r[0]) hit(r[0].rawValue); }).catch(() => {}); }, 250);
      });
    }
    return loadZxing().then(Z => { if (done) return; reader = new Z.BrowserMultiFormatReader(); return reader.decodeFromConstraints({video: {facingMode: 'environment'}}, video, r => { if (r) hit(r.getText()); }); });
  }).catch(fail);
}
ACT.scanInto = id => scanCamera(code => { const el = $('#' + id); if (!el) return; if (el.tagName === 'TEXTAREA') el.value = (el.value.trim() ? el.value.trim() + '\n' : '') + code; else el.value = code; el.dispatchEvent(new Event('input', {bubbles: true})); toast('읽었어요: ' + code); });

// ---------- 재고 ----------
// 상태: 재고 → (계약) 출고중 → 설치완료. 계약 없이 내보낸 것(반품·불량·A/S 교체·분실·정정)은 status '설치완료' + gone(사유)
// 로 둔다 → 안드로이드 앱(0.0.2)에서도 재고 목록에서 빠지고 수익 계산에도 안 들어간다.
// 입고·출고·정정 이력은 각 재고 문서의 log 배열에 남긴다 {d 시각, by 직원, k 종류, q 수량(±), m 메모}.
const canPerf = () => !!(S.caps && (S.caps.perf || S.caps.admin)); // 단가(입고·출고)는 실적 권한자만 (서버 규칙과 같음)
const costOf = sid => list('costs').find(c => c.stock === sid);
function costDoc(sid) { let c = costOf(sid); if (!c) { c = create('costs', {stock: sid, buy: 0, sell: 0}); } return c; }
// 시간 고르기: 30분 단위 (오전 9:00, 오전 9:30 …) — 값은 예전처럼 'HH:MM'
const TIME_SLOTS = Array.from({length: 48}, (_, i) => pad(Math.floor(i / 2)) + ':' + (i % 2 ? '30' : '00'));
const timeLabel = v => { const [h, m] = v.split(':').map(Number); return (h < 12 ? '오전 ' : '오후 ') + ((h % 12) || 12) + ':' + pad(m); };
function timeSel(id, val) {
  const opts = TIME_SLOTS.concat(val && !TIME_SLOTS.includes(val) ? [val] : []);
  return '<select id="' + id + '"><option value="">(시간 없음)</option>' + opts.map(v => '<option value="' + v + '"' + (v === val ? ' selected' : '') + '>' + timeLabel(v) + '</option>').join('') + '</select>';
}
const numOf = v => Number(String(v || '').replace(/[^0-9]/g, '')) || 0;
const OUT_KINDS = ['반품 (공급처로)', '불량·폐기', 'A/S 교체', '분실', '기타'];
function slog(r, k, q, m) { // 바꾸기 '전에' 부른다 — 이력 기능 전에 등록된 재고는 그때 수량을 첫 입고로 남긴다
  if (!r.log && S.data.stock.has(r.id)) r.log = [{d: r.created || '', by: 0, k: '입고', q: r.qty || 1, m: '이력 기능 전 등록'}];
  r.log = (r.log || []).concat({d: nowStr(), by: S.uid, k, q, m: m || ''}).slice(-60);
}
const inStock = () => list('stock').filter(r => r.status === '재고');
const stockModels = () => [...new Set(list('stock').map(r => (r.model || '').trim()).filter(Boolean))].sort();
// ---------- 상품 목록 (상품코드) ----------
// 재고와 물품요청이 같은 상품코드를 쓴다. 목록은 config 문서 key 'products' {items:[{code, name}]} — 등록·수정은 관리자(서버 규칙: config 는 관리자만 쓰기).
// 재고·요청에는 지금처럼 model(상품명)을 저장하고 code 도 같이 적는다 → 옛 자료도 이름으로 코드를 찾아 보여 준다.
const prodDoc = () => list('config').find(c => c.key === 'products');
const products = () => ((prodDoc() || {}).items || []).filter(p => p && p.code && p.name).slice().sort((a, b) => a.code.localeCompare(b.code));
const prodAdmin = () => !!(S.caps && S.caps.admin) || can('staff_manage');
const prodLabel = p => '[' + p.code + '] ' + p.name;
function prodFind(v) { // '[P0001] 영수증 용지' · 'P0001' · '영수증 용지' · 상품 바코드 모두 찾는다
  v = String(v || '').trim(); if (!v) return null;
  const m = v.match(/^\[([^\]]+)\]\s*(.*)$/); const code = (m ? m[1] : v).trim().toLowerCase(), name = (m ? m[2] : v).trim();
  return products().find(p => p.code.toLowerCase() === code) || products().find(p => p.name === name) || products().find(p => p.barcode && p.barcode.toLowerCase() === v.toLowerCase()) || null;
}
const barcodeOf = name => { const p = products().find(x => x.name === String(name || '').trim()); return p && p.barcode ? p.barcode : ''; };
const codeOf = name => { const p = products().find(x => x.name === String(name || '').trim()); return p ? p.code : ''; };
const withCode = name => { const c = codeOf(name); return (c ? '[' + c + '] ' : '') + (name || ''); };
function nextProdCode() { let n = 0; products().forEach(p => { const m = /^P(\d+)$/i.exec(p.code); if (m) n = Math.max(n, Number(m[1])); }); return 'P' + String(n + 1).padStart(4, '0'); }
function saveProducts(items) { const o = prodDoc() || create('config', {key: 'products'}); o.items = items; o.changedBy = S.uid; o.changedAt = nowStr(); put('config', o); }
// 입력값을 상품으로 바꾼다. 목록에 없으면 관리자는 새 코드로 바로 등록, 다른 사람은 막는다(코드가 엇갈리지 않게).
function prodResolve(v) {
  const hit = prodFind(v); if (hit) return hit;
  const name = String(v || '').replace(/^\[[^\]]*\]\s*/, '').trim(); if (!name) return null;
  if (!prodAdmin()) { warn('상품 목록에 없는 상품이에요: ' + name + '\n본사 관리자에게 상품 등록(☰ → 재고 → 상품 목록)을 요청해 주세요.'); return null; }
  const p = {code: nextProdCode(), name}; saveProducts(products().concat(p)); toast('새 상품을 등록했어요: ' + prodLabel(p)); return p;
}
const prodOptions = withStock => { // withStock: 물품요청 창 — 고를 때 보관지별 지금 재고 수를 같이 보여 준다
  const cnt = {}; if (withStock) inStock().forEach(r => { const k = (r.model || '').trim(); cnt[k] = cnt[k] || {}; cnt[k][locOf(r)] = (cnt[k][locOf(r)] || 0) + (r.qty || 1); });
  return '<datalist id="prodlist">' + products().map(p => '<option value="' + esc(prodLabel(p)) + '"' + (withStock ? ' label="' + esc('재고 ' + LOCS.map(l => l + ' ' + ((cnt[p.name] || {})[l] || 0)).join(' · ')) + '"' : '') + '>').join('') + '</datalist>';
};
// 물품요청 품목: 상품 목록에 있으면 그 코드, 없으면 적은 이름 그대로(코드 없음) — 본사가 주문·발송을 표시할 때 상품 목록에 등록하고 코드를 붙인다
function preqProd(v) {
  const p = prodFind(v); if (p) return {code: p.code, model: p.name};
  return {code: '', model: String(v || '').replace(/^\[[^\]]*\]\s*/, '').trim(), fresh: true};
}
function preqCodeUp(t) { // 관리자(본사)가 처리할 때 코드 없는 품목을 상품 목록에 올리고 코드를 붙인다
  if (!prodAdmin()) return; let ch = false;
  (t.preq.items || []).forEach(x => { if (x.code) return; const p = prodFind(x.model) || prodResolve(x.model); if (p) { x.code = p.code; x.model = p.name; delete x.fresh; ch = true; } });
  return ch;
}
// 관리자가 처음 열면 기존 재고·요청에 쓰인 이름에 코드를 붙여 목록을 만든다
function seedProducts() {
  if (!prodAdmin()) return 0;
  const have = new Set(products().map(p => p.name)), names = new Set(stockModels());
  preqs().forEach(t => (t.preq.items || []).forEach(x => x.model && names.add(String(x.model).trim())));
  const add = [...names].filter(n => n && !have.has(n)).sort(); if (!add.length) return 0;
  let items = products(); add.forEach(n => { const n0 = items.reduce((m, p) => { const k = /^P(\d+)$/i.exec(p.code); return k ? Math.max(m, Number(k[1])) : m; }, 0); items = items.concat({code: 'P' + String(n0 + 1).padStart(4, '0'), name: n}); });
  saveProducts(items); return add.length;
}
function viewProducts() {
  if (!S.prodSeeded) { S.prodSeeded = true; setTimeout(() => { const n = seedProducts(); if (n) { toast('기존 재고 상품 ' + n + '개에 상품코드를 붙였어요.'); render(); } }, 0); }
  const cnt = {}; inStock().forEach(r => { const k = (r.model || '').trim(); cnt[k] = (cnt[k] || 0) + (r.qty || 1); });
  const ps = products().filter(p => kmatch(p.code + ' ' + p.name + ' ' + (p.barcode || ''), S.pq || ''));
  return '<h1>상품 목록 (상품코드)</h1><div class="sub">재고 입고와 물품요청은 이 목록의 상품코드·상품명을 같이 써요. ' + (prodAdmin() ? '상품을 눌러 코드·이름을 고치고, ‘＋ 상품 등록’으로 추가해요.' : '새 상품은 본사 관리자가 등록해요.') + '</div>' +
    (prodAdmin() ? '<button class="btn gold full" data-act="prodEdit" data-arg="">＋ 상품 등록</button>' : '') +
    '<input id="prq" data-q="pq" placeholder="🔍 상품코드·상품명 (초성)" value="' + esc(S.pq || '') + '" autocomplete="off">' +
    '<div class="qres" data-for="pq">' + (ps.length ? ps.map(p => '<div class="card"' + (prodAdmin() ? ' data-act="prodEdit" data-arg="' + esc(p.code) + '"' : '') + '><div class="row"><span class="chip">' + esc(p.code) + '</span><div class="grow t1">' + esc(p.name) + (p.barcode ? ' <span class="sub" style="margin:0">바코드 ' + esc(p.barcode) + '</span>' : '') + '</div><span class="sub" style="margin:0">재고 ' + (cnt[p.name] || 0) + '</span></div></div>').join('') : '<div class="empty">등록된 상품이 없어요.</div>') + '</div>';
}
// ---------- 메모 (PC 위쪽 주 메뉴 맨 끝) — 업무 중 적어 둘 것. 내 profiles 문서의 memos 에 저장(다른 PC에서도 보임, 다른 직원 화면엔 안 보임) ----------
const memos = () => ((myProf() || {}).memos || []).slice().sort((a, b) => (b.pin ? 1 : 0) - (a.pin ? 1 : 0) || (b.u || 0) - (a.u || 0));
function saveMemos(ms) { const p = myProf() || {id: S.uid}; p.memos = ms; put('profiles', p); }
function viewMemo() {
  const ms = memos().filter(m => kmatch(m.t || '', S.memoQ || ''));
  const fmt = u => { const d = new Date(u || 0); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  return '<h1>메모</h1><div class="sub">업무 중에 적어 둘 것을 메모해요. 쓰는 대로 저장돼요(내 계정에만 보여요).</div>' +
    '<div class="memonew"><textarea id="memonew" placeholder="새 메모를 적고 ‘추가’ (Ctrl+Enter)"></textarea><button class="btn gold" data-act="memoAdd">＋ 추가</button></div>' +
    '<input id="memoq" data-q="memoQ" placeholder="🔍 메모 검색 (초성)" value="' + esc(S.memoQ || '') + '" autocomplete="off">' +
    '<div class="qres memogrid" data-for="memoQ">' + (ms.length ? ms.map(m => '<div class="memo' + (m.pin ? ' pin' : '') + '"><textarea id="memo_' + m.id + '" data-memo="' + m.id + '">' + esc(m.t || '') + '</textarea><div class="memobar"><span>' + fmt(m.u) + '</span><span class="grow"></span><button data-act="memoPin" data-arg="' + m.id + '" title="맨 위에 고정">' + (m.pin ? '📌 고정됨' : '📌') + '</button><button data-act="memoDel" data-arg="' + m.id + '" title="삭제">🗑 삭제</button></div></div>').join('') : '<div class="empty">메모가 없어요.</div>') + '</div>';
}
ACT.memoAdd = () => { const el = $('#memonew'), t = el ? el.value.trim() : ''; if (!t) return toast('메모 내용을 적어 주세요.'); el.value = ''; saveMemos(((myProf() || {}).memos || []).concat({id: nextId(), t, u: Date.now()})); render(); toast('메모를 추가했어요.'); };
ACT.memoDel = id => askConfirm('메모 삭제', '이 메모를 지울까요?', '삭제', () => { saveMemos(((myProf() || {}).memos || []).filter(m => String(m.id) !== String(id))); render(); toast('삭제했어요.'); }, true);
ACT.memoPin = id => { saveMemos(((myProf() || {}).memos || []).map(m => String(m.id) === String(id) ? Object.assign({}, m, {pin: !m.pin}) : m)); render(); };
let memoTimer = 0;
document.addEventListener('input', e => { // 고친 내용은 잠시 뒤 저절로 저장 (다시 그리지 않아서 쓰는 중에 커서가 안 튄다)
  const id = e.target && e.target.dataset && e.target.dataset.memo; if (!id) return;
  clearTimeout(memoTimer); const v = e.target.value;
  memoTimer = setTimeout(() => { saveMemos(((myProf() || {}).memos || []).map(m => String(m.id) === id ? Object.assign({}, m, {t: v, u: Date.now()}) : m)); }, 700);
});
document.addEventListener('keydown', e => { if (e.target && e.target.id === 'memonew' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ACT.memoAdd(); } });
ACT.prodEdit = code => {
  if (!prodAdmin()) return toast('상품 등록·수정은 관리자만 할 수 있어요.');
  const old = code ? products().find(p => p.code === code) : null;
  formModal(old ? '상품 수정' : '상품 등록', '<label class="fl" for="f_pc">상품코드</label><input id="f_pc" value="' + esc(old ? old.code : nextProdCode()) + '" placeholder="예: P0001">' +
    '<label class="fl" for="f_pn">상품명</label><input id="f_pn" value="' + esc(old ? old.name : '') + '" placeholder="예: 영수증 용지">' +
    '<label class="fl" for="f_pb">상품 바코드 (선택 — 상자에 찍힌 바코드, 같은 상품이면 모두 같음. 스캐너로 찍어도 돼요)</label><div class="row" style="gap:8px"><input id="f_pb" value="' + esc(old && old.barcode || '') + '" placeholder="예: 8801234567890" autocomplete="off"><button type="button" class="btn tint" data-act="scanInto" data-arg="f_pb" style="flex:none">📷</button></div>' +
    (old ? '<div class="sub">상품명을 바꾸면 재고에 있는 같은 상품 이름도 함께 바뀌어요.</div>' : ''), () => {
    const c = $('#f_pc').value.trim(), n = $('#f_pn').value.trim(), bc = $('#f_pb').value.trim();
    if (!c || !n) return warn('상품코드와 상품명을 모두 적어 주세요.');
    if (bc && products().some(p => p !== old && (p.barcode || '').toLowerCase() === bc.toLowerCase())) return warn('이미 다른 상품에 쓴 바코드예요: ' + bc);
    if (products().some(p => p !== old && p.code.toLowerCase() === c.toLowerCase())) return warn('이미 있는 상품코드예요: ' + c);
    if (products().some(p => p !== old && p.name === n)) return warn('이미 있는 상품명이에요: ' + n);
    saveProducts(products().filter(p => p !== old).concat(Object.assign({code: c, name: n}, bc ? {barcode: bc} : {})));
    if (old && old.name !== n) list('stock').filter(r => (r.model || '').trim() === old.name).forEach(r => { r.model = n; r.code = c; put('stock', r); });
    else if (old && old.code !== c) list('stock').filter(r => (r.model || '').trim() === n).forEach(r => { r.code = c; put('stock', r); });
    render(); toast('저장했어요: [' + c + '] ' + n); return true;
  }, '저장');
};
function viewStock() {
  let asset = '';
  if (canPerf()) {
    let sum = 0, noPrice = 0;
    inStock().forEach(r => { const c = costOf(r.id); if (!c || !c.buy) noPrice += r.qty || 1; else sum += c.buy * (r.qty || 1); });
    asset = '<div class="card flat"><div class="sub" style="margin:0">보유 재고 자산 (입고 단가 합계)</div><div class="t1" style="font-size:22px;margin-top:2px">' + wonFmt(sum) + '</div>' + (noPrice ? '<div class="sub" style="color:var(--amber)">단가 미입력 ' + noPrice + '대는 빠져 있어요.</div>' : '') + '<button class="btn tint" data-nav="all" data-sub="profit">수익 현황 보기</button></div>';
  }
  return '<h1>재고</h1><div class="sub">입고·출고·수량 정정을 하면 이력이 남아요. 계약에서 장비를 고르면 ‘출고중’이 되고, 설치 완료하면 재고에서 빠집니다. 검색칸에 바코드 스캐너로 찍으면 그 장비가 바로 열려요.</div>' +
    '<div class="pills"><span class="sub" style="align-self:center;margin:0">보관지</span>' + ['', ...LOCS].map(l => '<button class="pill ' + ((S.sloc || '') === l ? 'on' : '') + '" data-act="sloc" data-arg="' + l + '">' + (l || '전체') + '</button>').join('') + '</div>' +
    '<div class="stkacts"><button class="btn gold" data-act="newStock">＋ 입고</button><button class="btn tint" data-act="outStock">− 출고</button><button class="btn tint" data-act="adjStock">± 수량 정정</button><button class="btn" data-nav="all" data-sub="stocklog">이력</button></div>' + (prodAdmin() ? '<button class="btn full" data-act="importStock">📥 재고 일괄 등록 (엑셀)</button>' : '') + asset +
    '<div class="row" style="gap:8px"><input id="sq" data-q="sq" placeholder="🔍 상품코드·상품명·시리얼 (초성)" value="' + esc(S.sq || '') + '" autocomplete="off"><button class="btn tint" data-act="scanInto" data-arg="sq" style="flex:none" aria-label="카메라로 바코드 찍기">📷 바코드</button></div>' +
    '<div class="qres" data-for="sq">' + stockGroups() + '</div>' + preqSection();
}
ACT.sloc = l => { S.sloc = l; render(); };
function stockGroups() {
  const g = new Map();
  list('stock').filter(r => r.status !== '설치완료' && (!S.sloc || locOf(r) === S.sloc) && kmatch((r.model || '') + ' ' + codeOf(r.model) + ' ' + barcodeOf(r.model) + ' ' + (r.serial || '') + ' ' + locOf(r), S.sq || '')).sort((a, b) => (a.model || '').localeCompare(b.model || '') || (a.serial || '').localeCompare(b.serial || ''))
    .forEach(r => { if (!g.has(r.model)) g.set(r.model, []); g.get(r.model).push(r); });
  if (!g.size) return '<div class="empty">' + ((S.sq || '').trim() ? '찾는 장비가 없어요.' : '등록된 재고가 없습니다. ‘＋ 입고’로 추가해 주세요.') + '</div>';
  return [...g.entries()].map(([model, rows]) => {
    let have = 0, out = 0, safe = 0;
    const byLoc = {}; rows.forEach(r => { if (r.status === '출고중') out += r.qty || 1; else { have += r.qty || 1; byLoc[locOf(r)] = (byLoc[locOf(r)] || 0) + (r.qty || 1); } safe = Math.max(safe, r.safe || 0); });
    const low = safe > 0 && have < safe;
    return '<div class="card flat"><div class="row"><div class="grow t1">' + esc(withCode(model)) + '</div><span class="chip"' + (low ? ' style="background:#fdecea;color:var(--red)"' : '') + '>재고 ' + have + (out ? ' · 출고중 ' + out : '') + '</span></div>' + (S.sloc ? '' : '<div class="sub" style="margin:2px 0 0">' + LOCS.map(l => l + ' ' + (byLoc[l] || 0)).join(' · ') + '</div>') +
      (safe ? '<div class="sub" style="' + (low ? 'color:var(--red);font-weight:700' : '') + '">안전재고 ' + safe + '대' + (low ? ' — 부족해요!' : '') + '</div>' : '') +
      rows.map(r => '<button class="srow' + (r.status === '출고중' ? ' out' : '') + '" data-act="editStock" data-arg="' + r.id + '">' + esc((S.sloc ? '' : '[' + locOf(r) + '] ') + (r.serial ? r.serial : '시리얼 없음 · ' + (r.qty || 1) + '개')) + (r.status === '출고중' ? '<i>출고중</i>' : '') + '</button>').join('') + '</div>';
  }).join('');
}
// 스캐너로 검색칸에 시리얼을 찍으면(Enter) 그 장비를 바로 연다
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.isComposing || !e.target || e.target.id !== 'sq') return;
  const c = e.target.value.trim().toLowerCase(); if (!c) return;
  const r = list('stock').find(x => (x.serial || '').trim().toLowerCase() === c && x.status !== '설치완료');
  if (r) { e.preventDefault(); ACT.editStock(r.id); }
});
ACT.newStock = () => {
  formModal('입고 (재고 추가)',
    '<label class="fl" for="f_mo">상품 (필수 · 상품코드나 이름으로 골라요' + (prodAdmin() ? ', 목록에 없으면 새 코드로 등록돼요' : '') + ')</label><div class="row" style="gap:8px"><input id="f_mo" list="prodlist" placeholder="예: P0001 · 토스 포스 T2 · 상품 바코드" autocomplete="off"><button type="button" class="btn tint" data-act="scanInto" data-arg="f_mo" style="flex:none" aria-label="상품 바코드 찍기">📷</button></div>' + prodOptions() +
    '<label class="fl" for="f_se">시리얼 (여러 개는 한 줄에 하나 — 스캐너로 계속 찍으면 줄이 바뀌어요)</label><textarea id="f_se" placeholder="시리얼 번호"></textarea><button class="btn tint full" data-act="scanInto" data-arg="f_se">📷 카메라로 바코드 찍기</button>' +
    '<label class="fl" for="f_q">시리얼이 없는 물품의 수량 (같은 모델이 있으면 그 수량에 더해져요)</label><input id="f_q" inputmode="numeric" placeholder="예: 10">' +
    '<label class="fl" for="f_lc">보관지</label><select id="f_lc">' + LOCS.map(l => '<option' + (l === (S.sloc || '본사') ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    '<label class="fl" for="f_mm">입고처·메모 (선택)</label><input id="f_mm" placeholder="예: 토스플레이스 본사 10/24 배송분">' +
    '<label class="fl" for="f_sf">안전재고 (이 수 아래면 알려줘요, 선택)</label><input id="f_sf" inputmode="numeric" placeholder="예: 3">' +
    (canPerf() ? '<label class="fl" for="f_b">입고 단가 (1대당 산 값, 원, 선택)</label><input id="f_b" inputmode="numeric" placeholder="예: 250000">' : ''), () => {
    if (!$('#f_mo').value.trim()) return warn('상품을 골라 주세요.');
    const qn = numOf($('#f_q').value), sf = numOf($('#f_sf').value), by = canPerf() ? numOf($('#f_b').value) : 0, memo = $('#f_mm').value.trim(), lc = $('#f_lc').value;
    const ss = $('#f_se').value.split(/[\n,]+/).map(x => x.trim()).filter(Boolean);
    if (!ss.length && qn < 1) return warn('시리얼을 적거나 수량을 입력해 주세요.');
    const seen = new Set();
    for (const x of ss) { const k = x.toLowerCase(); if (seen.has(k) || list('stock').some(r => r.status !== '설치완료' && (r.serial || '').trim().toLowerCase() === k)) return warn('이미 재고에 있는 시리얼이에요: ' + x); seen.add(k); }
    const pr = prodResolve($('#f_mo').value); if (!pr) return false; const m = pr.name;
    const one = (serial, qty) => { const r = create('stock', {model: m, code: pr.code, serial, qty, safe: sf, status: '재고', loc: lc, deleted: false, log: []}); slog(r, '입고', qty, memo); put('stock', r); if (by > 0) { const c = costDoc(r.id); c.buy = by; put('costs', c); } };
    if (ss.length) ss.forEach(x => one(x, 1));
    else {
      const same = inStock().find(r => !r.serial && (r.model || '').trim() === m && locOf(r) === lc);
      if (same) { slog(same, '입고', qn, memo); same.qty = (same.qty || 1) + qn; same.code = pr.code; if (sf) same.safe = sf; put('stock', same); if (by > 0) { const c = costDoc(same.id); c.buy = by; put('costs', c); } }
      else one('', qn);
    }
    render(); toast(lc + '에 입고했어요: ' + m + ' ' + (ss.length || qn) + (ss.length ? '대' : '개')); return true;
  }, '입고');
};
// 계약 없이 내보내기 — n개만 떼어 낼 때는 takeStock 처럼 새 줄로 나눠 이력을 남긴다
function goneStock(row, n, kind, memo, merchant) {
  const all = !!row.serial || n >= (row.qty || 1); let use = row;
  if (!all) { slog(row, '출고', -n, kind + (memo ? ' · ' + memo : '')); row.qty = (row.qty || 1) - n; put('stock', row); use = create('stock', {model: row.model, serial: '', qty: n, safe: row.safe || 0, deleted: false, log: []}); }
  else slog(use, '출고', -(use.qty || 1), kind + (memo ? ' · ' + memo : ''));
  use.status = '설치완료'; use.gone = kind; use.goneAt = nowStr(); if (merchant) use.merchant = merchant; put('stock', use);
}
ACT.outStock = pre => {
  const sel = []; let mer = 0; const p0 = pre ? byId('stock', pre) : null; if (p0 && p0.status === '재고') sel.push({id: p0.id, n: 1});
  formModal('출고 (계약 없이 내보내기)',
    '<div class="sub" style="margin-top:0">가맹점에 계약으로 나가는 장비는 ‘계약’에서 고르세요. 여기는 반품·불량·A/S 교체처럼 계약 없이 나가는 것만 처리해요.</div>' +
    '<label class="fl" for="f_k">출고 사유</label><select id="f_k">' + OUT_KINDS.map(k => '<option>' + k + '</option>').join('') + '</select>' +
    '<div class="lb">나가는 장비</div><div id="osel"></div><div class="row" style="gap:8px"><input id="oq" placeholder="재고에서 찾기 (모델·시리얼 · 스캐너 가능)" autocomplete="off"><button type="button" class="btn tint" id="ocam" style="flex:none" aria-label="카메라로 바코드 찍기">📷</button></div><div id="ol" class="picks"></div>' +
    '<details class="direct"><summary>가맹점 연결 (A/S 교체 등, 선택)</summary>' + MP_HTML + '</details>' +
    '<label class="fl" for="f_mm">메모 (선택)</label><input id="f_mm" placeholder="예: 액정 불량, 토스 본사로 반품">', () => {
    if (!sel.length) return warn('나갈 장비를 골라 주세요.');
    const kind = $('#f_k').value.replace(/ \(.*\)/, ''), memo = $('#f_mm').value.trim();
    for (const e of sel) { const r = byId('stock', e.id); if (!r || r.status !== '재고') return warn('이미 나간 장비가 있어요. 다시 열어 주세요.'); if (!r.serial && !(e.n >= 1 && e.n <= (r.qty || 1))) return warn(r.model + ' 수량은 1~' + (r.qty || 1) + ' 사이로 적어 주세요.'); }
    sel.forEach(e => goneStock(byId('stock', e.id), e.n, kind, memo, mer));
    render(); toast('출고했어요 (' + kind + ').'); return true;
  }, '출고');
  const q = $('#oq'), L = $('#ol'), box = $('#osel');
  const show = () => { box.innerHTML = sel.length ? sel.map((e, i) => { const r = byId('stock', e.id); return '<div class="eqi"><span>' + esc(r.model) + (r.serial ? ' / ' + esc(r.serial) : '') + '</span>' + (r.serial ? '' : '<input type="number" min="1" max="' + (r.qty || 1) + '" value="' + e.n + '" data-i="' + i + '" class="oqn" aria-label="수량"> / ' + (r.qty || 1) + '개') + '<button type="button" data-i="' + i + '" aria-label="빼기">−</button></div>'; }).join('') : '<div class="sub">아직 고른 장비가 없어요.</div>'; };
  const avail = () => inStock().filter(r => !sel.some(e => e.id === r.id));
  const fill = () => { const v = q.value.trim(); L.innerHTML = avail().filter(r => kmatch((r.model || '') + ' ' + (r.serial || ''), v)).sort((a, b) => (a.model || '').localeCompare(b.model || '')).slice(0, 40).map(r => '<button type="button" class="pick" data-id="' + r.id + '"><b>' + esc(r.model) + '</b><span>' + esc('[' + locOf(r) + '] ') + (r.serial ? esc(r.serial) : '시리얼 없음 · ' + (r.qty || 1) + '개 보유') + '</span></button>').join('') || '<div class="sub">재고에 맞는 장비가 없어요.</div>'; };
  const add = r => { sel.push({id: r.id, n: 1}); show(); fill(); };
  const byCode = code => { const c = code.trim().toLowerCase(); if (!c) return; const r = avail().find(x => (x.serial || '').trim().toLowerCase() === c); if (r) { add(r); toast('추가: ' + r.model + ' · ' + r.serial); } else toast('재고에 없는 번호예요: ' + code); q.value = ''; fill(); };
  q.addEventListener('input', fill);
  q.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); byCode(q.value); } });
  L.onclick = ev => { const p = ev.target.closest('.pick'); if (p) add(byId('stock', p.dataset.id)); };
  box.onclick = ev => { const b = ev.target.closest('button[data-i]'); if (b) { sel.splice(Number(b.dataset.i), 1); show(); fill(); } };
  box.oninput = ev => { const t = ev.target; if (t.classList.contains('oqn')) sel[Number(t.dataset.i)].n = Math.floor(Number(t.value) || 0); };
  $('#ocam').onclick = () => scanCamera(byCode);
  wireMerchantPicker(m => { mer = m.id; });
  show(); fill();
};
// 재고 조사(실사): 실제로 센 수량을 적으면 차이만큼 정정. 시리얼 장비는 없는 것만 체크를 끈다.
ACT.adjStock = () => {
  const rows = inStock().sort((a, b) => (a.model || '').localeCompare(b.model || '') || (a.serial || '').localeCompare(b.serial || ''));
  if (!rows.length) return toast('정정할 재고가 없어요.');
  const g = new Map(); rows.forEach(r => { const k = r.model + ' · ' + locOf(r); if (!g.has(k)) g.set(k, []); g.get(k).push(r); });
  formModal('수량 정정 (재고 조사)',
    '<div class="sub" style="margin-top:0">창고에서 실제로 센 수량을 적으세요. 시리얼 장비는 실제로 없는 것만 체크를 끄면 ‘분실’로 빠져요. 바뀐 것만 이력에 남습니다.</div>' +
    '<div class="row" style="gap:8px"><input id="aqs" placeholder="시리얼 스캔하면 ‘확인’ 표시 (선택)" autocomplete="off"><button type="button" class="btn tint" id="acam" style="flex:none" aria-label="카메라로 바코드 찍기">📷</button></div>' +
    [...g.entries()].map(([model, rs]) => '<div class="adjg"><b>' + esc(model) + '</b>' + rs.map(r => r.serial
      ? '<label class="adjr"><input type="checkbox" checked data-id="' + r.id + '"><span>' + esc(r.serial) + '</span></label>'
      : '<div class="adjr"><span>시리얼 없음 · 장부 ' + (r.qty || 1) + '개 → 실제</span><input type="number" min="0" value="' + (r.qty || 1) + '" data-adj="' + r.id + '" aria-label="실제 수량"></div>').join('') + '</div>').join('') +
    '<label class="fl" for="f_mm">정정 사유 (필수)</label><input id="f_mm" placeholder="예: 10월 재고 조사, 입력 실수 바로잡기">', () => {
    const memo = $('#f_mm').value.trim(); const ch = [];
    document.querySelectorAll('#modal [data-adj]').forEach(i => { const r = byId('stock', i.dataset.adj), v = Math.floor(Number(i.value)); if (isNaN(v) || v < 0) return; if (v !== (r.qty || 1)) ch.push([r, v]); });
    document.querySelectorAll('#modal input[type=checkbox][data-id]').forEach(i => { if (!i.checked) ch.push([byId('stock', i.dataset.id), 0]); });
    if (!ch.length) return warn('바뀐 수량이 없어요.');
    if (!memo) return warn('정정 사유를 적어 주세요.');
    ch.forEach(([r, v]) => {
      if (v === 0) { slog(r, '정정', -(r.qty || 1), memo); r.status = '설치완료'; r.gone = r.serial ? '분실' : '정정'; r.goneAt = nowStr(); }
      else { slog(r, '정정', v - (r.qty || 1), memo); r.qty = v; }
      put('stock', r);
    });
    render(); toast(ch.length + '건 정정했어요.'); return true;
  }, '정정 저장');
  const hit = code => { const c = code.trim().toLowerCase(); const r = rows.find(x => (x.serial || '').trim().toLowerCase() === c); const b = r && $('#modal input[data-id="' + r.id + '"]'); if (b) { b.checked = true; b.closest('.adjr').classList.add('ok'); toast('확인: ' + r.serial); } else if (c) toast('재고 장부에 없는 번호예요: ' + code); $('#aqs').value = ''; };
  $('#aqs').addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); hit($('#aqs').value); } });
  $('#acam').onclick = () => scanCamera(hit);
};
// 이력: 각 재고의 log + 예전 자료(log 없음)는 등록일을 입고로 본다
function stockMoves() {
  const out = [];
  list('stock').forEach(r => {
    const lg = r.log || [];
    if (r.log) { lg.forEach(x => out.push(Object.assign({r}, x))); return; } // 떼어 낸 줄(log 빈 배열)은 원래 줄에 이미 남음
    if (r.serial || !r.contract) out.push({d: r.created || '', k: '입고', q: r.qty || 1, m: '', by: 0, r}); // 계약으로 떼어 낸 줄은 입고가 아님
    if (r.contract) out.push({d: '', k: '계약 출고', q: -(r.qty || 1), m: r.merchant ? (byId('merchants', r.merchant) || {}).name || '' : '', by: 0, r});
  });
  return out.sort((a, b) => (b.d || '').localeCompare(a.d || ''));
}
const MOVE_KINDS = ['전체', '입고', '출고', '정정', '이동'];
function viewStockLog() {
  const f = S.slogF || '전체';
  return '<h1>재고 이력</h1><div class="sub">입고·출고(계약 출고 포함)·수량 정정이 시간 순으로 남아요. 장비를 누르면 그 장비가 열려요.</div>' +
    '<div class="pills">' + MOVE_KINDS.map(k => '<button class="pill ' + (k === f ? 'on' : '') + '" data-act="slogF" data-arg="' + k + '">' + k + '</button>').join('') + '</div>' +
    '<input id="slq" data-q="slq" placeholder="🔍 모델·시리얼·메모·직원 (초성)" value="' + esc(S.slq || '') + '" autocomplete="off"><div class="qres" data-for="slq">' + stockLogList() + '</div>';
}
ACT.slogF = k => { S.slogF = k; render(); };
function stockLogList() {
  const f = S.slogF || '전체', q = S.slq || '';
  const ls = stockMoves().filter(x => (f === '전체' || x.k.endsWith(f)) && kmatch((x.r.model || '') + ' ' + (x.r.serial || '') + ' ' + (x.m || '') + ' ' + (x.by ? uname(x.by) : ''), q));
  if (!ls.length) return '<div class="empty">이력이 없어요.</div>';
  const col = k => k === '입고' ? 'var(--green)' : k === '정정' ? 'var(--amber)' : k === '이동' || k === '기존 설치' ? 'var(--gray)' : 'var(--red)';
  return '<div class="sub" style="font-weight:700">' + ls.length + '건</div>' + ls.slice(0, 300).map(x => '<div class="mv" data-act="editStock" data-arg="' + x.r.id + '"><span class="mvd">' + esc((x.d || '').slice(2, 16) || '예전 자료') + '</span><span class="chip" style="color:' + col(x.k) + ';background:var(--field)">' + esc(x.k) + '</span>' +
    '<span class="grow"><b>' + esc(withCode(x.r.model)) + '</b>' + (x.r.serial ? ' / ' + esc(x.r.serial) : '') + (x.m ? '<small>' + esc(x.m) + '</small>' : '') + '</span><b class="mvq" style="color:' + col(x.k) + '">' + (x.q > 0 ? '+' : '') + x.q + '</b><span class="mvb">' + esc(x.by ? uname(x.by) : '') + '</span></div>').join('');
}
const stockState = r => r.status === '설치완료' ? (r.gone ? '출고 완료 (' + r.gone + ')' : '설치 완료') : (r.status || '재고');
ACT.editStock = id => {
  const r = byId('stock', id); if (!r) return; const c = canPerf() ? costOf(r.id) : null; const mer = r.merchant ? byId('merchants', r.merchant) : null;
  const hist = (r.log || []).slice().reverse().slice(0, 8);
  formModal('재고 수정', '<label class="fl" for="f_mo">상품 (상품코드·이름)</label><input id="f_mo" list="prodlist" value="' + esc(withCode(r.model)) + '" autocomplete="off">' + prodOptions() + '<label class="fl" for="f_se">시리얼</label><input id="f_se" value="' + esc(r.serial) + '"><button class="btn tint full" data-act="scanInto" data-arg="f_se">📷 카메라로 바코드 찍기</button>' +
    (r.serial ? '' : '<div class="sub">수량은 ‘수량 정정’ 또는 ‘입고’·‘출고’로 바꿔 주세요 (지금 ' + (r.qty || 1) + '개).</div>') +
    '<label class="fl" for="f_sf">안전재고</label><input id="f_sf" inputmode="numeric" value="' + (r.safe || 0) + '">' +
    (r.status === '재고' ? '<label class="fl" for="f_lc">보관지 (바꾸면 ‘이동’으로 이력에 남아요)</label><select id="f_lc">' + LOCS.map(l => '<option' + (l === locOf(r) ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' : '') +
    (canPerf() ? '<label class="fl" for="f_b">입고 단가 (산 값, 원)</label><input id="f_b" inputmode="numeric" value="' + (c && c.buy ? c.buy : '') + '"><label class="fl" for="f_s">출고 단가 (판 값, 원)</label><input id="f_s" inputmode="numeric" value="' + (c && c.sell ? c.sell : '') + '">' : '') +
    '<div class="sub" style="margin-top:10px">상태: ' + esc(stockState(r)) + (mer ? ' · ' + esc(mer.name) : '') + '</div>' +
    (hist.length ? '<div class="lb">이 장비 이력</div>' + hist.map(x => '<div class="sub" style="margin:2px 0">' + esc((x.d || '').slice(2) + ' · ' + x.k + ' ' + (x.q > 0 ? '+' : '') + x.q + (x.m ? ' · ' + x.m : '') + (x.by ? ' · ' + uname(x.by) : '')) + '</div>').join('') : '') +
    '<div class="btns" style="margin-top:10px">' + (r.status === '재고' ? '<button class="btn tint" id="f_out">이 장비 출고</button>' : '') + '<button class="btn red" id="f_del">삭제</button></div>', () => {
    if (!$('#f_mo').value.trim()) return warn('상품을 골라 주세요.');
    const se = $('#f_se').value.trim();
    if (se && se.toLowerCase() !== (r.serial || '').trim().toLowerCase() && list('stock').some(x => x.id !== r.id && x.status !== '설치완료' && (x.serial || '').trim().toLowerCase() === se.toLowerCase())) return warn('이미 있는 시리얼이에요: ' + se);
    const pr = $('#f_mo').value.trim() === withCode(r.model) ? {name: r.model, code: codeOf(r.model) || r.code || ''} : prodResolve($('#f_mo').value); if (!pr) return false; const m = pr.name;
    if ($('#f_lc') && $('#f_lc').value !== locOf(r)) { slog(r, '이동', 0, locOf(r) + ' → ' + $('#f_lc').value); r.loc = $('#f_lc').value; }
    r.model = m; if (pr.code) r.code = pr.code; r.serial = se; r.safe = numOf($('#f_sf').value); put('stock', r);
    if (canPerf()) { const b2 = numOf($('#f_b').value), s2 = numOf($('#f_s').value); const cd = costOf(r.id) || (b2 || s2 ? costDoc(r.id) : null); if (cd) { cd.buy = b2; cd.sell = s2; put('costs', cd); } }
    render(); toast('저장했어요.'); return true;
  }, '저장');
  if ($('#f_out')) $('#f_out').onclick = () => { closeModal(); setTimeout(() => ACT.outStock(r.id), 0); };
  $('#f_del').onclick = () => needDelPw('재고 삭제', () => askConfirm('이 재고를 지울까요?', (r.model || '') + ' ' + (r.serial || '') + '\n잘못 넣은 것을 지울 때만 쓰세요. 실제로 나간 것은 ‘출고’, 수가 안 맞으면 ‘수량 정정’을 써야 이력이 남아요.', '지우기', () => { r.deleted = true; put('stock', r); render(); toast('삭제했어요.'); }, true));
};

// ---------- 재고 일괄 등록 (엑셀) — 처음 옮길 때: 상품코드/상품명 · 시리얼 · 수량 · 현재위치(본사|광주지사|가맹점 상호) ----------
// 본사·광주지사 = 우리 재고(재고 수에 들어감). 가맹점 = 이미 설치된 장비 → 기록만 남기고 재고 수에는 넣지 않는다(status 설치완료 + gone '기존 설치', merchant).
// 앞으로 가맹점에 나가는 것은 계약·출고로 처리한다.
const S_TPL_HEAD = ['상품코드', '상품명', '상품 바코드', '시리얼(장비 바코드)', '수량', '현재위치', '사업자번호', '설치일', '메모'];
ACT.sTemplate = () => saveBytes('나인패밀리_재고_업로드양식.xlsx', xlsxOf([
  '■ 재고 일괄 등록 양식 — 상품코드·상품명·상품 바코드 중 하나는 꼭 적어요(상품 목록에 없으면 새 상품코드로 등록돼요). 시리얼이 있으면 한 줄에 한 대, 없으면 수량을 적어요.',
  '■ 상품 바코드 = 상자에 찍힌 바코드(같은 상품이면 모두 같음, 용지 같은 소모품) / 시리얼(장비 바코드) = 단말기마다 다른 번호(스캐너로 찍으면 이 칸).',
  '■ 현재위치: ‘본사’ 또는 ‘광주지사’ → 우리 재고로 잡혀요 / 가맹점 상호 → 이미 설치된 장비로 기록만 하고 재고 수에는 넣지 않아요(가맹점이 앱에 등록돼 있어야 해요, 사업자번호를 적으면 더 정확해요).',
  '■ 설치일: 가맹점에 설치된 날(선택, 2026-10-01 처럼) / ‘(예시)’로 시작하는 줄은 올릴 때 건너뛰어요.'],
  S_TPL_HEAD, [['(예시) P0001', '토스 포스 T2', '', 'T2-0001', '1', '본사', '', '', ''], ['(예시)', '영수증 용지', '8801234567890', '', '30', '광주지사', '', '', '박스 단위'], ['(예시)', '토스 포스 T2', '', 'T2-0009', '1', '삼영푸드', '123-45-67890', '2025-03-02', '']],
  [12, 22, 18, 22, 8, 16, 16, 12, 20]), XLSX_MIME);
function sFieldOf(h) {
  h = normH(h); if (!h) return null;
  if (h.includes('상품코드') || h.includes('품목코드') || h === '코드') return 'code';
  if (h.includes('시리얼') || h.includes('serial') || h.includes('일련번호') || h === 'sn') return 'serial'; // '시리얼(장비 바코드)'
  if (h.includes('바코드') || h.includes('barcode')) return 'barcode';
  if (h.includes('상품명') || h.includes('품목명') || h.includes('품명') || h.includes('모델') || h.includes('제품')) return 'name';
  if (h.includes('시리얼') || h.includes('serial') || h.includes('일련번호') || h.includes('s/n') || h === 'sn') return 'serial';
  if (h.includes('수량')) return 'qty';
  if (h.includes('위치') || h.includes('보관') || h.includes('가맹점') || h.includes('설치처') || h.includes('거래처')) return 'where';
  if (h.includes('사업자')) return 'bizno';
  if (h.includes('설치일') || h.includes('날짜')) return 'date';
  if (h.includes('메모') || h.includes('비고')) return 'memo';
  return null;
}
function sHeader(rows) { for (let i = 0; i < Math.min(rows.length, 15); i++) { const m = {}; rows[i].forEach((c, j) => { const f = sFieldOf(c); if (f && !(f in m)) m[f] = j; }); if (('name' in m || 'code' in m) && 'where' in m) return [i, m]; } return null; }
// 한 줄을 해석한다 → {ok, why, kind: 'stock'|'site', prod:{code,name}|newName, serial, qty, loc, mer, date, memo}
let sFileBc = {};
function sPlanRow(r, map, seen) {
  const code = cellOf(r, map, 'code'), name = cellOf(r, map, 'name'), serial = cellOf(r, map, 'serial'), where = cellOf(r, map, 'where').replace(/\s+/g, ' '), bc = cellOf(r, map, 'barcode');
  if (isSample(code) || isSample(name) || isSample(r[0])) return {skip: true};
  if (!code && !name && !bc && !serial && !where) return {skip: true};
  const o = {serial, qty: serial ? 1 : Math.max(0, numOf(cellOf(r, map, 'qty')) || (cellOf(r, map, 'qty') ? 0 : 1)), memo: cellOf(r, map, 'memo'), date: dateCell(cellOf(r, map, 'date'))};
  o.barcode = bc;
  const nm = name || (bc && sFileBc[bc]) || ''; // 같은 파일 앞줄에서 이 바코드에 이름을 적었으면 그 상품
  o.prod = (code && prodFind(code)) || (bc && prodFind(bc)) || (nm && prodFind(nm)) || null; if (!o.prod) { if (!nm) return Object.assign(o, {why: (code ? '상품코드 ' + code : '상품 바코드 ' + bc) + '가 상품 목록에 없고 상품명도 비었어요'}); o.newName = nm; }
  if (bc && o.prod && o.prod.barcode && o.prod.barcode !== bc) return Object.assign(o, {why: '상품 바코드가 상품 목록(' + o.prod.barcode + ')과 달라요'});
  if (!serial && o.qty < 1) return Object.assign(o, {why: '시리얼도 수량도 없어요'});
  if (serial) { const k = serial.toLowerCase(); if (seen.has(k)) return Object.assign(o, {why: '파일 안에 같은 시리얼이 또 있어요'}); seen.add(k); if (list('stock').some(x => x.status !== '설치완료' && (x.serial || '').trim().toLowerCase() === k)) return Object.assign(o, {why: '이미 재고에 있는 시리얼이에요'}); }
  if (!where) return Object.assign(o, {why: '현재위치가 비었어요'});
  const loc = LOCS.find(l => l === where || l.replace('지사', '') === where.replace('지사', ''));
  if (loc) return Object.assign(o, {ok: true, kind: 'stock', loc});
  const bd = cellOf(r, map, 'bizno').replace(/\D/g, ''); const all = list('merchants');
  const mer = (bd.length === 10 && all.find(m => (m.bizno || '').replace(/\D/g, '') === bd)) || all.find(m => (m.name || '').trim() === where) || null;
  if (!mer) return Object.assign(o, {why: '가맹점 ‘' + where + '’을(를) 찾지 못했어요 (먼저 가맹점을 등록해 주세요)'});
  return Object.assign(o, {ok: true, kind: 'site', mer});
}
ACT.importStock = () => {
  if (!prodAdmin()) return toast('재고 일괄 등록은 관리자만 할 수 있어요 (상품코드를 새로 만들 수 있어서).');
  seedProducts(); // 기존 재고 이름에 코드가 먼저 붙어 있어야 파일의 상품코드와 맞춰진다
  modal('<h3>재고 일괄 등록 (엑셀)</h3><div class="sub">처음 재고를 옮길 때 써요. 양식을 받아 상품코드(또는 상품명)·시리얼·수량·현재위치를 채워 올려 주세요.<br>· 현재위치가 <b>본사·광주지사</b>면 우리 재고로 잡혀요.<br>· <b>가맹점 상호</b>면 이미 설치된 장비로 기록만 하고 재고 수에는 넣지 않아요.<br>· 앞으로 가맹점에 나가는 것은 계약·출고로 처리해요.</div><button class="btn tint full" data-act="sTemplate">📄 업로드 양식 받기 (.xlsx)</button><button class="btn gold full" id="f_pick">파일 고르기</button><input type="file" id="f_imp" accept=".xlsx,.csv,.txt" hidden><button class="btn full" data-act="close">닫기</button>');
  $('#f_pick').onclick = () => $('#f_imp').click();
  $('#f_imp').onchange = async () => {
    let rows; try { rows = await readTable($('#f_imp').files[0]); } catch (e) { return toast(e.message && e.message !== 'zip' ? e.message : '파일을 읽지 못했어요.'); }
    const hd = sHeader(rows); if (!hd) return toast('머리글에서 ‘상품명’(또는 상품코드)과 ‘현재위치’ 열을 찾지 못했어요. 양식을 받아 써 주세요.');
    const [hr, map] = hd, seen = new Set(), plan = [];
    sFileBc = {}; rows.slice(hr + 1).forEach(r => { const b2 = cellOf(r, map, 'barcode'), n2 = cellOf(r, map, 'name'); if (b2 && n2 && !isSample(n2) && !sFileBc[b2]) sFileBc[b2] = n2; });
    rows.slice(hr + 1).forEach((r, i) => { const p = sPlanRow(r, map, seen); if (!p.skip) { p.line = hr + 2 + i; plan.push(p); } });
    const ok = plan.filter(p => p.ok), bad = plan.filter(p => !p.ok), newNames = [...new Set(ok.filter(p => p.newName).map(p => p.newName))];
    const sum = k => ok.filter(p => p.kind === k).reduce((a, p) => a + p.qty, 0);
    const byLoc = LOCS.map(l => l + ' ' + ok.filter(p => p.kind === 'stock' && p.loc === l).reduce((a, p) => a + p.qty, 0)).join(' · ');
    const msg = '우리 재고로 입고: ' + sum('stock') + '개 (' + byLoc + ')\n가맹점 설치 장비(재고 수 제외): ' + sum('site') + '대 · ' + new Set(ok.filter(p => p.kind === 'site').map(p => p.mer.id)).size + '곳' +
      (newNames.length ? '\n새로 만들 상품코드: ' + newNames.length + '개 (' + newNames.slice(0, 5).join(', ') + (newNames.length > 5 ? ' …' : '') + ')' : '') +
      (bad.length ? '\n\n⚠ 올리지 않는 줄 ' + bad.length + '개:\n' + bad.slice(0, 12).map(p => p.line + '번째 줄 — ' + p.why).join('\n') + (bad.length > 12 ? '\n…' : '') : '') +
      '\n\n[읽은 열]\n' + Object.entries(map).map(([f, c]) => f + ' ← ' + rows[hr][c]).join('\n');
    if (!ok.length) return askConfirm('올릴 줄이 없어요', msg, '확인', () => {});
    askConfirm('재고 일괄 등록 미리보기', msg, ok.length + '줄 올리기', () => {
      let items = products(); const made = {};
      newNames.forEach(n => { const ex = items.find(p => p.name === n); if (ex) { made[n] = ex; return; } const n0 = items.reduce((m, p) => { const k = /^P(\d+)$/i.exec(p.code); return k ? Math.max(m, Number(k[1])) : m; }, 0); const p = {code: 'P' + String(n0 + 1).padStart(4, '0'), name: n}; items = items.concat(p); made[n] = p; });
      ok.forEach(p => { if (!p.barcode) return; const nm = (p.prod || made[p.newName] || {}).name; const t = items.find(x => x.name === nm); if (t && !t.barcode && !items.some(x => x.barcode === p.barcode)) items = items.map(x => x === t ? Object.assign({}, x, {barcode: p.barcode}) : x); });
      if (newNames.length || ok.some(p => p.barcode)) saveProducts(items);
      ok.forEach(p => {
        const pr = p.prod || made[p.newName], memo = '엑셀 일괄 등록' + (p.memo ? ' · ' + p.memo : '');
        if (p.kind === 'stock') {
          const same = !p.serial && inStock().find(r => !r.serial && (r.model || '').trim() === pr.name && locOf(r) === p.loc);
          if (same) { slog(same, '입고', p.qty, memo); same.qty = (same.qty || 1) + p.qty; same.code = pr.code; put('stock', same); }
          else { const r = create('stock', {model: pr.name, code: pr.code, serial: p.serial, qty: p.qty, safe: 0, status: '재고', loc: p.loc, deleted: false, log: []}); slog(r, '입고', p.qty, memo); put('stock', r); }
        } else {
          const r = create('stock', {model: pr.name, code: pr.code, serial: p.serial, qty: p.qty, safe: 0, status: '설치완료', gone: '기존 설치', goneAt: p.date || nowStr().slice(0, 10), merchant: p.mer.id, mname: p.mer.name, deleted: false, log: [{d: nowStr(), by: S.uid, k: '기존 설치', q: 0, m: p.mer.name + (p.date ? ' · 설치 ' + p.date : '') + ' · ' + memo}]});
          put('stock', r);
        }
      });
      render(); toast('재고 ' + ok.length + '줄을 올렸어요.');
    });
  };
};

// ---------- 보관지 · 물품요청 (지사 → 본사) ----------
// 재고 보관지는 본사·광주지사. 예전 재고(보관지 없음)는 본사로 본다.
// 물품요청은 업무(tasks)의 한 종류(type '물품요청')로 둔다 → 담당자 알림·이력·서버 규칙을 그대로 쓴다.
// t.preq = {to 받을 곳, items [{model, qty}], stage 요청|주문함|발송함|입고완료|반려, ship 발송 메모}
const LOCS = ['본사', '광주지사'];
const locOf = r => r.loc || '본사';
const PSTAGES = ['요청', '주문함', '발송함', '입고완료'];
const preqs = () => list('tasks').filter(t => t.preq).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
const preqWaiting = () => preqs().filter(t => t.preq.stage === '발송함' && (t.creator === S.uid || can('staff_manage'))); // 받는 쪽이 입고 확인할 것
const preqItems = t => (t.preq.items || []).map(x => (x.code || codeOf(x.model) ? '[' + (x.code || codeOf(x.model)) + '] ' : '(새 물품) ') + x.model + ' ' + x.qty + (x.serial ? '' : '개')).join(', ');
function preqStageHTML(st) {
  if (st === '반려') return '<span class="chip" style="background:#fdecea;color:var(--red)">반려</span>';
  const i = PSTAGES.indexOf(st);
  return '<div class="pstg">' + PSTAGES.map((s, k) => '<span class="' + (k < i ? 'done' : k === i ? 'on' : '') + '">' + s + '</span>').join('<i>›</i>') + '</div>';
}
function preqCard(t) {
  return '<div class="card" data-act="preq" data-arg="' + t.id + '"><div class="row"><div class="grow"><div class="t1">📦 ' + esc(t.preq.to) + ' ← 본사</div><div class="t2">' + esc(preqItems(t)) + '</div><div class="t2">' + esc('요청 ' + uname(t.creator) + ' · 담당 ' + uname(t.assignee) + (t.due ? ' · 희망 ' + t.due : '')) + '</div></div></div>' + preqStageHTML(t.preq.stage) + '</div>';
}
function preqSection() {
  const open = preqs().filter(t => t.preq.stage !== '입고완료' && t.preq.stage !== '반려');
  const doneN = preqs().length - open.length;
  return '<h2>📦 물품요청 (본사 ← 지사)</h2><button class="btn tint full" data-act="newPreq">＋ 본사에 물품요청</button>' +
    (open.length ? open.map(preqCard).join('') : '<div class="sub">진행 중인 요청이 없어요.</div>') +
    (doneN ? '<button class="btn full" data-nav="all" data-sub="preqs">지난 요청 보기 (' + doneN + '건)</button>' : '');
}
function viewPreqs() {
  return '<h1>물품요청</h1><div class="sub">지사가 본사에 필요한 물품을 요청 → 본사 담당자가 주문·발송 → 받는 쪽이 입고 확인하면 그 보관지 재고에 들어가요.</div><button class="btn gold full" data-act="newPreq">＋ 본사에 물품요청</button>' +
    (preqs().length ? preqs().map(preqCard).join('') : '<div class="empty">아직 요청이 없어요.</div>');
}
ACT.newPreq = () => {
  const staff = list('users').filter(u => u.active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const row = () => '<div class="row prow2" style="gap:6px"><input class="pm" list="prodlist" placeholder="재고 품목 검색 또는 새 물품 이름" style="flex:3" autocomplete="off"><input class="pq" inputmode="numeric" placeholder="수량" style="flex:1"></div>';
  formModal('본사에 물품요청', '<div class="sub" style="margin-top:0">본사 담당자에게 알림이 가요. 담당자가 주문·발송을 표시하고, 물건이 오면 ‘입고 확인’을 누르면 받은 곳 재고에 들어가요.</div>' +
    '<label class="fl" for="f_to">받을 곳</label><select id="f_to">' + LOCS.map(l => '<option' + (l === '광주지사' ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    '<div class="lb">요청 품목</div><div class="sub" style="margin:0 0 4px">칸을 누르면 재고 품목(상품코드·보관지별 재고)이 떠요. 목록에 없는 물품은 이름을 그대로 적으면 돼요 — 본사가 확인할 때 상품 목록에 올라가요.</div>' + prodOptions(true) + '<div id="prows">' + row() + row() + '</div><button type="button" class="btn full" id="paddr">＋ 품목 줄 추가</button>' +
    '<label class="fl" for="f_as">본사 담당자 (알림이 가요)</label><select id="f_as">' + staff.map(u => '<option value="' + u.id + '">' + esc(u.name) + '</option>').join('') + '</select>' +
    '<label class="fl" for="f_d">희망 도착일 (선택)</label><input id="f_d" type="date"><label class="fl" for="f_m">메모 (선택)</label><textarea id="f_m" placeholder="예: 다음 주 설치 3건 예정"></textarea>', () => {
    const raw = [...document.querySelectorAll('#prows .prow2')].map(r => ({v: r.querySelector('.pm').value.trim(), qty: numOf(r.querySelector('.pq').value)})).filter(x => x.v);
    if (!raw.length) return warn('요청할 품목을 적어 주세요.');
    if (raw.some(x => x.qty < 1)) return warn('품목마다 수량을 적어 주세요.');
    const items = raw.map(x => Object.assign(preqProd(x.v), {qty: x.qty}));
    if (items.some(x => !x.model)) return warn('품목 이름을 적어 주세요.');
    const to = $('#f_to').value, as = Number($('#f_as').value), d = $('#f_d').value;
    const t = create('tasks', {title: '물품요청 · ' + to + ' · ' + items.map(x => x.model + ' ' + x.qty).join(', '), type: '물품요청', client: to, due: d, memo: $('#f_m').value.trim(), assignee: as, creator: S.uid, status: '지시됨', history: [], preq: {to, items, stage: '요청'}});
    tlog(t, '물품요청 → ' + uname(as) + ' (' + to + ')'); put('tasks', t); render(); toast(uname(as) + '님에게 물품요청을 보냈어요.'); return true;
  }, '요청 보내기');
  $('#paddr').onclick = () => $('#prows').insertAdjacentHTML('beforeend', row());
};
function preqStage(t, st, msg) {
  if (st === '주문함' || st === '발송함' || st === '입고완료') preqCodeUp(t);
  t.preq.stage = st; tlog(t, '물품요청 → ' + st + (msg ? ' : ' + msg : ''));
  if (st === '주문함' || st === '발송함') t.status = '진행중';
  if (st === '입고완료' || st === '반려') { t.status = '완료'; t.doneAt = nowStr(); t.doneMsg = st + (msg ? ' : ' + msg : ''); }
  put('tasks', t);
}
ACT.preq = id => {
  const t = byId('tasks', id); if (!t || !t.preq) return;
  if (t.status === '지시됨' && t.assignee === S.uid && !t.seenAt) { t.seenAt = nowStr(); tlog(t, '담당자가 열어봄'); put('tasks', t); }
  const P = t.preq, st = P.stage, hq = t.assignee === S.uid || can('staff_manage'), rq = t.creator === S.uid || can('staff_manage');
  const ln = (k, v) => v ? '<div class="line"><b>' + k + '</b><div>' + esc(v) + '</div></div>' : '';
  modal('<h3>📦 물품요청 — ' + esc(P.to) + '</h3>' + preqStageHTML(st) +
    '<table class="ptbl"><tr><th>상품코드</th><th>품목</th><th>수량</th></tr>' + (P.items || []).map(x => '<tr><td>' + esc(x.code || codeOf(x.model) || '새 물품') + '</td><td>' + esc(x.model) + '</td><td>' + x.qty + '</td></tr>').join('') + '</table>' +
    ln('받을 곳', P.to) + ln('요청한 사람', uname(t.creator) + ' · ' + (t.created || '')) + ln('본사 담당', uname(t.assignee)) + ln('희망 도착일', t.due) + ln('메모', t.memo) + ln('발송 메모', P.ship) +
    '<h2>처리 이력</h2>' + (t.history || []).map(h => '<div class="hist">' + esc(h.t + '  ' + uname(h.who) + '\n' + h.text) + '</div>').join('') +
    '<div class="btns" style="margin-top:12px;flex-wrap:wrap">' +
    (hq && st === '요청' ? '<button class="btn tint" data-act="preqGo" data-arg="' + id + '|주문함">주문함</button>' : '') +
    (hq && (st === '요청' || st === '주문함') ? '<button class="btn gold" data-act="preqShip" data-arg="' + id + '">발송(발주처리)</button><button class="btn red" data-act="preqNo" data-arg="' + id + '">반려</button>' : '') +
    (rq && st === '발송함' ? '<button class="btn gold" data-act="preqIn" data-arg="' + id + '">입고 확인</button>' : '') +
    '<button class="btn" data-act="close">닫기</button></div>');
};
ACT.preqGo = a => { const [id, st] = a.split('|'); const t = byId('tasks', id); preqStage(t, st); render(); ACT.preq(id); toast(st + '(으)로 표시했어요.'); };
ACT.preqShip = id => formModal('발송 (발주처리)', '<div class="sub" style="margin-top:0">' + esc(byId('tasks', id).preq.to) + '로 보냈다고 표시해요. 받는 쪽에 ‘입고 확인’ 알림이 떠요.</div><label class="fl" for="f_s">발송 메모 (선택 — 택배사·송장번호 등)</label><input id="f_s" placeholder="예: 한진 1234-5678-9012">', () => {
  const t = byId('tasks', id); t.preq.ship = $('#f_s').value.trim(); preqStage(t, '발송함', t.preq.ship); render(); setTimeout(() => ACT.preq(id), 0); toast('발송으로 표시했어요.'); return true;
}, '발송 표시');
ACT.preqNo = id => formModal('반려', '<label class="fl" for="f_s">반려 사유 (필수)</label><textarea id="f_s" placeholder="예: 재고 부족, 다음 주 재요청"></textarea>', () => {
  const m = $('#f_s').value.trim(); if (!m) return warn('반려 사유를 적어 주세요.'); preqStage(byId('tasks', id), '반려', m); render(); toast('반려했어요.'); return true;
}, '반려');
// 입고 확인: 품목마다 받은 수량(시리얼이 있으면 한 줄에 하나)을 적으면 받는 곳 재고에 입고된다
ACT.preqIn = id => {
  const t = byId('tasks', id); const P = t.preq;
  formModal('입고 확인 — ' + P.to, '<div class="sub" style="margin-top:0">받은 그대로 적어 주세요. 시리얼이 있는 장비는 시리얼을 한 줄에 하나씩 적거나 스캐너로 찍으면 시리얼마다 입고돼요.</div>' +
    (P.items || []).map((x, i) => '<div class="adjg"><b>' + esc((x.code ? '[' + x.code + '] ' : '') + x.model) + ' (요청 ' + x.qty + ')</b><div class="row" style="gap:6px"><span class="sub" style="margin:0">받은 수량</span><input id="pi_q' + i + '" inputmode="numeric" value="' + x.qty + '" style="width:90px;margin:0"></div><textarea id="pi_s' + i + '" placeholder="시리얼 (있으면, 한 줄에 하나)" style="min-height:44px"></textarea></div>').join(''), () => {
    preqCodeUp(t); const memo = '물품요청 입고 (' + uname(t.creator) + ' 요청)';
    const plan = (P.items || []).map((x, i) => ({x, q: numOf($('#pi_q' + i).value), ss: $('#pi_s' + i).value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)}));
    for (const p of plan) for (const s of p.ss) if (list('stock').some(r => r.status !== '설치완료' && (r.serial || '').trim().toLowerCase() === s.toLowerCase())) return warn('이미 재고에 있는 시리얼이에요: ' + s);
    plan.forEach(({x, q, ss}) => {
      if (ss.length) ss.forEach(s => { const r = create('stock', {model: x.model, code: x.code || codeOf(x.model), serial: s, qty: 1, safe: 0, status: '재고', loc: P.to, deleted: false, log: []}); slog(r, '입고', 1, memo); put('stock', r); });
      else if (q > 0) {
        const same = inStock().find(r => !r.serial && (r.model || '').trim() === x.model && locOf(r) === P.to);
        if (same) { slog(same, '입고', q, memo); same.qty = (same.qty || 1) + q; put('stock', same); }
        else { const r = create('stock', {model: x.model, code: x.code || codeOf(x.model), serial: '', qty: q, safe: 0, status: '재고', loc: P.to, deleted: false, log: []}); slog(r, '입고', q, memo); put('stock', r); }
      }
    });
    preqStage(t, '입고완료', plan.map(p => p.x.model + ' ' + (p.ss.length || p.q)).join(', '));
    render(); toast(P.to + ' 재고에 입고했어요.'); return true;
  }, '입고 확인');
};

// ---------- 가맹점 고르기 · 장비 고르기 (팝업 안에서 쓰는 조각) ----------
const MP_FILL = '<div class="lb">가맹점 조회 (선택 · 고르면 거래처·전화·주소가 자동으로 채워져요)</div><div id="mpSel" class="sub" style="display:none"></div><input id="mpq" placeholder="🔍 상호·대표자·초성·사업자번호·전화" autocomplete="off"><div id="mpl" class="picks"></div>';
const MP_HTML = '<div class="lb">가맹점</div><div id="mpSel" class="sub">아직 고르지 않았어요. 아래에서 찾아 눌러 주세요.</div><input id="mpq" placeholder="🔍 상호·대표자·초성·사업자번호·전화" autocomplete="off"><div id="mpl" class="picks"></div>';
function wireMerchantPicker(onPick) {
  S.mpNew = null; // '새 가맹점 등록' 버튼은 업무 요청 창에서만 (그 창이 다시 켠다)
  const q = $('#mpq'), l = $('#mpl');
  const fill = () => { // 검색칸은 그대로 두고 목록만 바꾼다 → 한글을 치는 중에도 바로 걸러진다
    const v = q.value.trim(); if (!v) { l.innerHTML = ''; return; }
    const hits = list('merchants').filter(m => kmatch(mHay(m), v)).sort((a, b) => (a.name || '').localeCompare(b.name || '')).slice(0, 8);
    l.innerHTML = hits.map(m => { const n = mNums(m); return '<button type="button" class="pick" data-id="' + m.id + '"><b>' + esc(m.name) + '</b><span>' + esc([m.bizno, n.phone || n.mobile].filter(Boolean).join(' · ')) + '</span></button>'; }).join('') ||
      ('<div class="sub">찾는 가맹점이 없어요.</div>' + (S.mpNew ? '<button type="button" class="btn gold full" id="mpnew">＋ 새 가맹점 등록 (‘' + esc(v) + '’)</button>' : ''));
    const nb = $('#mpnew'); if (nb) nb.onclick = () => { const f = S.mpNew; S.mpNew = null; f(v); };
  };
  q.addEventListener('input', fill);
  const pick = m => { const s = $('#mpSel'); s.className = 'picked'; s.style.display = ''; s.innerHTML = '✔ <b>' + esc(m.name) + '</b>' + (m.bizno ? ' · ' + esc(m.bizno) : ''); q.value = ''; l.innerHTML = ''; onPick(m); };
  l.onclick = ev => { const p = ev.target.closest('.pick'); if (p) pick(byId('merchants', p.dataset.id)); };
  return pick;
}
const EQ_HTML = '<div class="lb">나가는 장비</div><div id="eqSel"></div><div class="row" style="gap:8px"><input id="eqq" placeholder="재고에서 찾기 (모델·시리얼)" autocomplete="off"><button type="button" class="btn tint" id="eqcam" style="flex:none" aria-label="카메라로 바코드 찍기">📷</button></div><div id="eqList" class="picks"></div>' +
  '<details class="direct"><summary>재고에 없는 장비 직접 입력</summary><input id="eqm" placeholder="모델명"><input id="eqs" placeholder="시리얼 (선택)"><button type="button" class="btn full" id="eqadd">장비 추가</button></details>';
function wireEquipPicker(sel) {
  const q = $('#eqq'), L = $('#eqList'), box = $('#eqSel');
  const showSel = () => { box.innerHTML = sel.length ? sel.map((e, i) => '<div class="eqi"><span>' + esc(e.model) + (e.serial ? ' / ' + esc(e.serial) : '') + (e.sid ? '' : ' <i>직접 입력</i>') + '</span><button type="button" data-i="' + i + '" aria-label="빼기">−</button></div>').join('') : '<div class="sub">아직 고른 장비가 없어요.</div>'; };
  const avail = () => list('stock').filter(r => r.status === '재고' && !sel.some(e => e.sid && e.sid === r.id));
  const fill = () => {
    const v = q.value.trim(); const rows = avail().filter(r => kmatch((r.model || '') + ' ' + (r.serial || ''), v)).sort((a, b) => (a.model || '').localeCompare(b.model || '')).slice(0, 40);
    L.innerHTML = rows.map(r => '<button type="button" class="pick" data-id="' + r.id + '"><b>' + esc(r.model) + '</b><span>' + esc('[' + locOf(r) + '] ') + (r.serial ? esc(r.serial) : '시리얼 없음 · ' + (r.qty || 1) + '개 보유') + '</span></button>').join('') || '<div class="sub">' + (v ? '재고에 맞는 장비가 없어요.' : '재고에 남은 장비가 없어요. 아래 ‘직접 입력’을 써 주세요.') + '</div>';
  };
  const addRow = r => { sel.push({sid: r.id, model: r.model, serial: r.serial || ''}); showSel(); fill(); };
  const byCode = code => {
    const c = code.trim().toLowerCase(); if (!c) return;
    const same = list('stock').filter(r => (r.serial || '').trim().toLowerCase() === c); const r = same.find(x => x.status === '재고') || same[0];
    if (r && r.status === '재고') { if (sel.some(e => e.sid === r.id)) toast('이미 고른 장비예요.'); else { addRow(r); toast('장비를 추가했어요: ' + r.model + ' · ' + r.serial); } }
    else if (r) toast('이미 출고된 장비예요: ' + code);
    else { const one = avail().filter(x => kmatch((x.model || '') + ' ' + (x.serial || ''), code)); if (one.length === 1) addRow(one[0]); else if (!/\s/.test(code) && code.length >= 4) { toast('재고에 없는 번호예요. 모델명을 적어 직접 입력해 주세요.'); $('.direct').open = true; $('#eqs').value = code; $('#eqm').focus(); } else return; }
    q.value = ''; fill();
  };
  q.addEventListener('input', fill);
  q.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.isComposing) { ev.preventDefault(); byCode(q.value); } });
  L.onclick = ev => { const p = ev.target.closest('.pick'); if (p) addRow(byId('stock', p.dataset.id)); };
  box.onclick = ev => { const b = ev.target.closest('button[data-i]'); if (b) { sel.splice(Number(b.dataset.i), 1); showSel(); fill(); } };
  $('#eqcam').onclick = () => scanCamera(byCode);
  $('#eqadd').onclick = () => { const m = $('#eqm').value.trim(); if (!m) return toast('모델명을 입력해 주세요.'); sel.push({sid: 0, model: m, serial: $('#eqs').value.trim()}); $('#eqm').value = ''; $('#eqs').value = ''; showSel(); };
  showSel(); fill();
}

// ---------- 계약 ----------
function daysLeft(ymd) { const a = new Date(todayStr() + 'T00:00:00'), b = new Date(String(ymd) + 'T00:00:00'); return isNaN(b) ? 99999 : Math.round((b - a) / 86400000); }
function dday(d) { return d === 99999 ? '' : d < 0 ? '만료 ' + (-d) + '일 지남' : d === 0 ? '오늘 만료' : 'D-' + d; }
function addMonths(ymd, m) { const p = String(ymd).split('-').map(Number); if (p.length < 3 || !p[0]) return ''; const d = new Date(p[0], p[1] - 1 + m, p[2]); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
const amountLabel = k => k === 'CMS' ? 'CMS 금액' : k === '렌탈' ? '월 렌탈료' : '판매금액';
const expiringContracts = () => list('contracts').filter(c => c.expire && daysLeft(c.expire) <= 90).sort((a, b) => daysLeft(a.expire) - daysLeft(b.expire));
function contractCard(c) {
  const d = c.expire ? daysLeft(c.expire) : 99999; const n = (c.equip || []).length;
  return '<div class="card" data-act="contract" data-arg="' + c.id + '"><div class="row"><div class="grow t1">' + esc(c.client) + '</div>' + (c.expire ? '<span class="chip"' + (d <= 90 ? ' style="background:#fdecea;color:var(--red)"' : ' style="background:var(--field);color:var(--gray)"') + '>' + dday(d) + '</span>' : '') + '</div>' +
    '<div class="t2">' + esc(c.kind + (c.amount ? ' ' + wonFmt(c.amount) : '') + ' · 장비 ' + n + '대 · ' + (c.installed ? '설치 완료' : '설치 대기') + ' · ' + uname(c.who)) + '</div>' + (c.expire ? '<div class="t2">만료일 ' + esc(c.expire) + '</div>' : '') + '</div>';
}
function viewContracts() {
  const exp = expiringContracts(); const all = list('contracts').sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return '<h1>계약 관리</h1><div class="sub">올린 계약을 눌러 장비를 추가하거나 ‘설치 완료’를 처리해요. 오른쪽 아래 + 로 새 계약을 올립니다.' + (canPerf() ? '' : ' (내가 올린 계약만 보여요)') + '</div>' +
    (exp.length ? '<h2 style="color:var(--red)">만료가 가까운 계약 (3개월 이내)</h2>' + exp.map(contractCard).join('') : '') +
    '<h2>전체 계약</h2>' + (all.length ? all.map(contractCard).join('') : '<div class="empty">아직 올린 계약이 없습니다.</div>');
}
function takeStock(row, merchant, contract) { // 재고 한 줄을 출고 처리 (수량 여러 개짜리는 1개만 떼어 낸다) — 앱의 Store.takeStock 과 같다
  let use = row;
  if (!row.serial && (row.qty || 1) > 1) {
    slog(row, '계약 출고', -1, ((byId('merchants', merchant) || {}).name || '') + ' (1개 떼어 냄)'); row.qty = (row.qty || 1) - 1; put('stock', row);
    use = create('stock', {model: row.model, serial: '', safe: row.safe || 0, deleted: false, log: []});
    const rc = canPerf() ? costOf(row.id) : null; if (rc) put('costs', create('costs', {stock: use.id, buy: rc.buy || 0, sell: rc.sell || 0}));
  }
  const mn = (byId('merchants', merchant) || {}).name || '';
  use.qty = 1; use.status = '출고중'; use.merchant = merchant; use.contract = contract; if (use === row) slog(use, '계약 출고', -1, mn); put('stock', use); return use;
}
function addEquip(c, sel) {
  c.equip = c.equip || [];
  sel.forEach(e => {
    const x = {sid: e.sid || 0, model: e.model, serial: e.serial || ''};
    if (x.sid) { const row = byId('stock', x.sid); if (row) { const used = takeStock(row, c.merchant, c.id); if (c.installed) { used.status = '설치완료'; put('stock', used); } x.sid = used.id; } }
    c.equip.push(x);
  });
  c.qty = Math.max(1, c.equip.length); put('contracts', c);
}
ACT.contract = id => {
  const c = byId('contracts', id); if (!c) return;
  const ln = (k, v) => v ? '<div class="line"><b>' + k + '</b><div>' + esc(v) + '</div></div>' : '';
  modal('<h3>계약 정보</h3>' + ln('가맹점', c.client) + ln('구분', c.kind) + (c.amount ? ln(amountLabel(c.kind), wonFmt(c.amount)) : '') + ln('계약일', c.date) +
    (c.expire ? ln('만료일', c.expire + '  (' + dday(daysLeft(c.expire)) + ')') : '') + ln('결제 연동', ((c.linkType || '') + ' ' + (c.company || '')).trim()) + ln('담당', uname(c.who)) +
    ln('상태', c.installed ? '설치 완료 ' + (c.installedAt || '') : '설치 대기') +
    '<h2>나간 장비</h2>' + ((c.equip || []).length ? c.equip.map(e => '<div class="bul">· ' + esc(e.model) + (e.serial ? '  /  ' + esc(e.serial) : '') + '</div>').join('') : '<div class="sub">없음</div>') + ln('장비 메모', c.memo) +
    '<div class="btns" style="margin-top:12px"><button class="btn tint" data-act="contractEquip" data-arg="' + c.id + '">장비 추가</button>' + (c.installed ? '' : '<button class="btn gold" data-act="contractDone" data-arg="' + c.id + '">설치 완료</button>') + '<button class="btn" data-act="close">닫기</button></div>');
};
ACT.contractDone = id => {
  const c = byId('contracts', id); if (!c) return;
  askConfirm('설치 완료로 처리할까요?', '나간 장비가 재고에서 빠집니다.', '설치 완료', () => contractDone(c));
};
function contractDone(c) {
  c.installed = true; c.installedAt = todayStr();
  (c.equip || []).forEach(e => { const r = byId('stock', e.sid); if (r) { r.status = '설치완료'; put('stock', r); } });
  put('contracts', c); render(); toast('설치 완료로 처리했어요.');
}
ACT.contractEquip = id => {
  const c = byId('contracts', id); if (!c) return; const sel = [];
  formModal('장비 추가 — ' + c.client, EQ_HTML, () => { if (!sel.length) return warn('추가할 장비를 골라 주세요.'); addEquip(c, sel); render(); setTimeout(() => ACT.contract(id), 0); toast('장비를 추가했어요.'); return true; }, '추가');
  wireEquipPicker(sel);
};
ACT.newContract = () => {
  let mer = null; const sel = [];
  formModal('신규 계약 올리기', MP_HTML +
    '<label class="fl" for="f_lk">결제 연동</label><select id="f_lk"><option>VAN사</option><option>PG사</option></select><input id="f_co" placeholder="VAN사·PG사 업체명 (예: 다우데이타)">' +
    '<label class="fl" for="f_k">구분 (판매 / CMS / 렌탈)</label><select id="f_k"><option>판매</option><option>CMS</option><option>렌탈</option></select>' +
    '<label class="fl" for="f_a" id="f_al">판매금액 (원)</label><input id="f_a" inputmode="numeric" placeholder="숫자만 (예: 450000)">' + EQ_HTML +
    '<label class="fl" for="f_m">장비 메모 (선택)</label><textarea id="f_m" placeholder="장비 메모"></textarea>' +
    '<label class="fl" for="f_d">계약일</label><input id="f_d" type="date" value="' + todayStr() + '"><label class="fl" for="f_e">계약 만료일 (필수)</label><input id="f_e" type="date">' +
    '<div class="pills"><button type="button" class="pill" data-m="12">+12개월</button><button type="button" class="pill" data-m="24">+24개월</button><button type="button" class="pill" data-m="36">+36개월</button></div>', () => {
    const dt = $('#f_d').value, ex = $('#f_e').value;
    if (!mer) return warn('가맹점을 골라 주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dt) || !/^\d{4}-\d{2}-\d{2}$/.test(ex)) return warn('계약일과 만료일을 골라 주세요.');
    if (ex < dt) return warn('만료일이 계약일보다 빨라요. 다시 확인해 주세요.');
    const c = create('contracts', {date: dt, who: S.uid, merchant: mer.id, client: mer.name, linkType: $('#f_lk').value, company: $('#f_co').value.trim(), kind: $('#f_k').value, amount: numOf($('#f_a').value), memo: $('#f_m').value.trim(), expire: ex, installed: false, equip: [], qty: 1});
    addEquip(c, sel); render(); toast('신규 계약을 올렸어요.'); return true;
  }, '올리기');
  wireMerchantPicker(m => { mer = m; }); wireEquipPicker(sel);
  $('#f_k').onchange = () => { $('#f_al').textContent = amountLabel($('#f_k').value) + ' (원)'; };
  document.querySelectorAll('#modal .pill[data-m]').forEach(b => b.onclick = () => { $('#f_e').value = addMonths($('#f_d').value, Number(b.dataset.m)); });
};

// ---------- 실적 · 수익 · 지난 업무 기록 (앱과 같은 계산) ----------
function perfYM() { if (!S.perfY) { const d = new Date(); S.perfY = d.getFullYear(); S.perfM = d.getMonth() + 1; } return S.perfY + '-' + pad(S.perfM); }
function monthKey(ym, off) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + off, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
function perfStats(ym, mine) { // 직원별 [대수, 판매, CMS, 렌탈, 판매금액] — 계약일 기준
  const st = {};
  list('contracts').forEach(c => {
    if (!(c.date || '').startsWith(ym) || (mine && c.who !== S.uid) || noPerf(c.who)) return; // 대표님 등 '실적 제외' 계정은 빼고 센다
    const a = st[c.who] || (st[c.who] = [0, 0, 0, 0, 0]);
    a[0] += c.qty || 1;
    if (c.kind === '판매') { a[1]++; a[4] += c.amount || 0; } else if (c.kind === 'CMS') a[2]++; else if (c.kind === '렌탈') a[3]++;
  });
  return st;
}
const activeStaff = () => list('users').filter(u => u.active !== false);
const reportStaff = () => activeStaff().filter(u => !u.noReport && !u.noPerf).sort(byPos); // 실적 '직책순' 보기
const noPerf = uid => { const u = byId('users', uid); return !!(u && u.noPerf); };
const rankedStaff = st => activeStaff().filter(u => !u.noPerf).sort((a, b) => { const x = st[a.id] || [0, 0, 0, 0, 0], y = st[b.id] || [0, 0, 0, 0, 0]; return (y[0] - x[0]) || (y[4] - x[4]); });
function growth(c, p) { if (!p) return c > 0 ? '신규' : '-'; const g = Math.round((c - p) * 100 / p); return (g > 0 ? '▲ +' : g < 0 ? '▼ ' : '') + g + '%'; }
const gcol = (c, p) => c > p ? 'var(--green)' : c < p ? 'var(--red)' : 'var(--gray)';
const pbar = (pct, color) => '<div class="pbar"><i style="width:' + Math.max(0, Math.min(100, Math.round(pct))) + '%;background:' + (color || 'var(--gold)') + '"></i></div>';
function monthNavHTML() { perfYM(); return '<div class="row" style="margin-top:12px"><button class="btn" style="margin:0" data-act="pm" data-arg="-1" aria-label="이전 달">‹</button><div class="grow t1" style="text-align:center;font-size:18px">' + S.perfY + '년 ' + S.perfM + '월</div><button class="btn" style="margin:0" data-act="pm" data-arg="1" aria-label="다음 달">›</button></div>'; }
ACT.pm = a => { S.perfM += Number(a); if (S.perfM < 1) { S.perfM = 12; S.perfY--; } if (S.perfM > 12) { S.perfM = 1; S.perfY++; } render(); };
function trendHTML(ym, mine) { // 지난달 → 이번 달, 최근 6개월
  const prev = monthKey(ym, -1), cur = perfStats(ym, mine), pre = perfStats(prev, mine);
  const sum = st => Object.values(st).reduce((s, a) => s + a[0], 0); const ct = sum(cur), pt = sum(pre);
  let h = '<h2>월별 성과 (' + Number(prev.slice(5)) + '월 → ' + Number(ym.slice(5)) + '월)</h2><div class="card flat"><div class="sub" style="margin:0">' + (mine ? '내 신규 계약' : '전체 신규 계약') + '</div><div class="t1" style="font-size:20px;color:' + gcol(ct, pt) + '">' + pt + '대 → ' + ct + '대 &nbsp; ' + growth(ct, pt) + '</div></div>';
  if (!mine) {
    let mx = 1; Object.values(cur).concat(Object.values(pre)).forEach(a => mx = Math.max(mx, a[0]));
    rankedStaff(cur).forEach(u => { const cn = (cur[u.id] || [0])[0], pn = (pre[u.id] || [0])[0]; if (!cn && !pn) return;
      h += '<div class="prow"><b>' + esc(u.name) + '</b><div class="grow">' + pbar(pn * 100 / mx, '#c8ccd6') + pbar(cn * 100 / mx) + '</div><span style="color:' + gcol(cn, pn) + '">' + pn + ' → ' + cn + '<br>' + growth(cn, pn) + '</span></div>'; });
    h += '<div class="sub">회색 막대 = 지난달, 금색 막대 = 선택한 달</div>';
  }
  const n6 = [], lb = []; let m6 = 1;
  for (let i = -5; i <= 0; i++) { const k = monthKey(ym, i); lb.push(Number(k.slice(5)) + '월'); n6.push(sum(perfStats(k, mine))); }
  n6.forEach(v => m6 = Math.max(m6, v));
  return h + '<h2>최근 6개월 신규 계약</h2>' + n6.map((v, i) => '<div class="prow"><b>' + lb[i] + '</b><div class="grow">' + pbar(v * 100 / m6) + '</div><span>' + v + '대</span></div>').join('');
}
ACT.perfSort = v => { S.perfSort = v; render(); };
function viewPerf(mine) {
  const ym = perfYM(), st = perfStats(ym, mine); let total = 0, sales = 0; Object.values(st).forEach(a => { total += a[0]; sales += a[4]; });
  let h = '<h1>' + (mine ? '내 실적' : '전체 실적·직원별 순위') + '</h1><div class="sub">' + (mine ? '나만 볼 수 있는 내 실적이에요.' : '직원별 순위는 신규 계약 대수 순, 같으면 판매금액 순이에요.') + '</div>' + monthNavHTML() +
    '<div class="hero"><div>' + (mine ? '이번 달 내 신규 계약' : '이번 달 신규 계약') + '</div><div class="n">' + total + '대</div><div style="font-size:13px">판매금액 합계 ' + wonFmt(sales) + '</div></div>' + trendHTML(ym, mine);
  if (!mine) {
    let mx = 1; Object.values(st).forEach(a => mx = Math.max(mx, a[0]));
    const byP = S.perfSort === 'pos', rows = byP ? reportStaff() : rankedStaff(st);
    h += '<div class="row" style="align-items:center"><h2 class="grow">' + (byP ? '직원별 실적 (직책순)' : '직원별 순위') + '</h2><div class="pills" style="margin:0"><button class="pill' + (byP ? '' : ' on') + '" data-act="perfSort" data-arg="">순위순</button><button class="pill' + (byP ? ' on' : '') + '" data-act="perfSort" data-arg="pos">직책순</button></div></div>' + rows.map((u, i) => { const a = st[u.id]; const n = a ? a[0] : 0;
      return '<div class="prow"><b style="width:22px;color:' + (!byP && i < 3 && n ? 'var(--deep)' : 'var(--gray)') + '">' + (byP ? '·' : i + 1) + '</b><b>' + esc(u.name) + (byP && u.pos ? ' <small style="color:var(--gray);font-weight:400">' + esc(u.pos) + '</small>' : '') + '</b><div class="grow">' + pbar(n * 100 / mx) + '</div><span>' + n + '</span></div>' +
        (a ? '<div class="sub" style="margin:-2px 0 6px 30px">판매 ' + a[1] + ' · CMS ' + a[2] + ' · 렌탈 ' + a[3] + (a[4] ? ' · 판매금액 ' + wonFmt(a[4]) : '') + '</div>' : ''); }).join('');
  }
  const month = list('contracts').filter(c => (c.date || '').startsWith(ym) && (!mine || c.who === S.uid)).sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  return h + '<h2>올라온 계약</h2>' + (month.length ? month.map(contractCard).join('') : '<div class="empty">이 달에 올라온 계약이 없습니다.</div>');
}
function sales() { // 계약으로 출고된 장비(출고중·설치완료)의 단가 — 월은 계약일 기준
  return list('stock').filter(r => r.status === '출고중' || r.status === '설치완료').map(r => {
    const c = byId('contracts', r.contract); if (!c) return null; const cd = costOf(r.id);
    const buy = cd ? cd.buy || 0 : 0, sell = cd ? cd.sell || 0 : 0;
    return {month: (c.date || '').slice(0, 7), who: c.who, buy, sell, row: r, priced: !!cd && (buy > 0 || sell > 0)};
  }).filter(Boolean);
}
function viewProfit() {
  if (!canPerf()) return '<h1>수익 현황</h1><div class="empty">실적 보기 권한이 있어야 볼 수 있어요.</div>';
  const ym = perfYM(), all = sales(); let tS = 0, tB = 0, mS = 0, mB = 0, mC = 0, miss = 0; const by = {};
  all.forEach(s => { if (!s.priced) { miss++; return; } tS += s.sell; tB += s.buy; if (s.month === ym) { mS += s.sell; mB += s.buy; mC++; if (noPerf(s.who)) return; const a = by[s.who] || (by[s.who] = [0, 0]); a[0]++; a[1] += s.sell - s.buy; } });
  const pr = [], lb = []; let mx = 1;
  for (let i = -5; i <= 0; i++) { const k = monthKey(ym, i); lb.push(Number(k.slice(5)) + '월'); let v = 0; all.forEach(s => { if (s.priced && s.month === k) v += s.sell - s.buy; }); pr.push(v); mx = Math.max(mx, Math.abs(v)); }
  return '<h1>수익 현황</h1><div class="sub">재고에 적어 둔 입고 단가(산 값)와 출고 단가(판 값)의 차이로 계산해요. 계약에 올라가 출고된 장비가 대상입니다.</div>' + monthNavHTML() +
    '<div class="hero"><div>지금까지 총 수익</div><div class="n">' + wonFmt(tS - tB) + '</div><div style="font-size:13px">매출 ' + wonFmt(tS) + ' − 매입 ' + wonFmt(tB) + '</div></div>' +
    '<div class="card flat"><div class="sub" style="margin:0">' + S.perfM + '월 수익</div><div class="t1" style="font-size:22px;color:' + (mS - mB < 0 ? 'var(--red)' : 'var(--ink)') + '">' + wonFmt(mS - mB) + '</div><div class="sub">' + mC + '대 · 매출 ' + wonFmt(mS) + ' · 매입 ' + wonFmt(mB) + '</div></div>' +
    '<h2>최근 6개월 수익</h2>' + pr.map((v, i) => '<div class="prow"><b>' + lb[i] + '</b><div class="grow">' + pbar(Math.abs(v) * 100 / mx, v < 0 ? 'var(--red)' : 'var(--gold)') + '</div><span>' + wonFmt(v) + '</span></div>').join('') +
    '<h2>' + S.perfM + '월 직원별 수익</h2>' + (Object.keys(by).length ? Object.entries(by).map(([w, a]) => '<div class="card flat row"><div class="grow t1">' + esc(uname(Number(w))) + '</div><b style="color:' + (a[1] < 0 ? 'var(--red)' : 'var(--deep)') + '">' + a[0] + '대 · ' + wonFmt(a[1]) + '</b></div>').join('') : '<div class="empty">이 달에 단가가 입력된 출고 장비가 없습니다.</div>') +
    (miss ? '<h2 style="color:var(--red)">단가를 아직 안 적은 출고 장비 ' + miss + '대</h2><div class="sub">눌러서 입고·출고 단가를 입력하면 수익에 반영돼요.</div>' + all.filter(s => !s.priced).slice(0, 30).map(s => '<div class="card row" data-act="editStock" data-arg="' + s.row.id + '"><div class="grow"><div class="t1">' + esc(s.row.model) + '</div><div class="t2">' + esc((s.row.serial || '시리얼 없음') + ' · ' + uname(s.who)) + '</div></div><span class="sub">' + esc(s.month) + '</span></div>').join('') : '');
}
function viewHistory() {
  return '<h1>지난 업무 기록</h1><div class="sub">' + (can('history_all') ? '완료된 모든 업무를 찾아봐요.' : '내가 맡아 완료한 업무를 찾아봐요.') + '</div><input id="hq" data-q="hq" placeholder="🔍 제목·거래처·담당자·완료 메시지 (초성 가능)" value="' + esc(S.hq || '') + '"><div class="qres" data-for="hq">' + historyList() + '</div>';
}
function historyList() {
  const ls = list('tasks').filter(t => t.status === '완료' && (can('history_all') || t.assignee === S.uid) && kmatch((t.title || '') + ' ' + (t.client || '') + ' ' + uname(t.assignee) + ' ' + (t.doneMsg || ''), S.hq || ''))
    .sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || ''));
  return '<div class="sub" style="font-weight:700">' + ls.length + '건</div>' + (ls.length ? ls.slice(0, 200).map(t => '<div class="card" data-act="task" data-arg="' + t.id + '"><div class="t1">[' + esc(t.type) + '] ' + esc(t.title) + '</div><div class="t2">' + esc((t.client ? t.client + ' · ' : '') + uname(t.assignee) + ' · 완료 ' + (t.doneAt || '')) + '</div>' + (t.doneMsg ? '<div style="color:var(--green);font-size:13px;margin-top:4px">' + esc(t.doneMsg) + '</div>' : '') + '</div>').join('') : '<div class="empty">완료된 업무 이력이 없습니다.</div>');
}

// ---------- 일일보고 · 실적 보고서 (앱과 같은 reports 문서: kind daily/perf, who, date, text) ----------
const canReport = () => !!(S.caps && S.caps.report); // 서버 규칙과 같은 기준(phones 문서의 report)
const findReport = (kind, who, date) => list('reports').find(r => r.kind === kind && r.who === who && r.date === date);
function addDays(ymd, n) { const d = new Date(ymd + 'T00:00:00'); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
function dailyAuto(date, who) {
  const lines = []; let n = 0, cn = 0;
  list('tasks').forEach(t => { if (t.assignee === who && (t.doneAt || '').startsWith(date)) { n++; lines.push('· 완료 업무: [' + t.type + '] ' + t.title + (t.client ? ' (' + t.client + ')' : '')); } });
  list('contracts').forEach(c => { if (c.who === who && c.date === date) { cn++; lines.push('· 신규 계약: ' + c.client + ' / ' + c.kind); } });
  return !n && !cn ? '(자동 집계: 오늘 완료한 업무·올린 계약 없음)' : '(자동 집계) 완료 업무 ' + n + '건 · 신규 계약 ' + cn + '건\n' + lines.join('\n');
}
function dateNavHTML() { if (!S.dailyDate) S.dailyDate = todayStr(); return '<div class="row" style="margin-top:12px"><button class="btn" style="margin:0" data-act="dd" data-arg="-1" aria-label="전날">‹</button><div class="grow t1" style="text-align:center;font-size:18px">' + S.dailyDate + '</div><button class="btn" style="margin:0" data-act="dd" data-arg="1" aria-label="다음 날">›</button><button class="btn" style="margin:0" data-act="dd" data-arg="0">오늘</button></div>'; }
ACT.dd = a => { S.dailyDate = Number(a) ? addDays(S.dailyDate || todayStr(), Number(a)) : todayStr(); render(); };
const keepVal = (k, def) => (S.keep && S.keep[k] != null) ? S.keep[k] : def; // 쓰는 중인 글은 화면이 다시 그려져도 남긴다
function viewDaily() {
  if (!S.dailyDate) S.dailyDate = todayStr();
  const old = findReport('daily', S.uid, S.dailyDate), k = 'daily_' + S.dailyDate;
  const mine = list('reports').filter(r => r.kind === 'daily' && r.who === S.uid).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 14);
  return '<h1>일일보고 쓰기</h1><div class="sub">오늘 한 일과 특이사항을 적어 제출해요. 위 (자동 집계)는 참고용으로 나에게만 보여요(보고에는 직접 쓴 내용만 올라가요).</div>' + dateNavHTML() +
    '<div class="card flat mtext">' + esc(dailyAuto(S.dailyDate, S.uid)) + '</div>' +
    '<label class="fl" for="f_daily">오늘 한 일 · 특이사항 · 내일 계획</label><textarea id="f_daily" data-keep="' + k + '" style="min-height:150px">' + esc(keepVal(k, old ? old.text : '')) + '</textarea>' +
    '<button class="btn gold full" data-act="dailySave">' + (old ? '수정해서 다시 제출' : '제출하기') + '</button>' +
    '<h2>내가 낸 보고</h2>' + (mine.length ? mine.map(r => '<div class="card" data-act="ddGo" data-arg="' + r.date + '"><b style="color:var(--deep);font-size:13px">' + esc(r.date) + '</b><div class="mtext" style="margin-top:2px">' + esc(r.text) + '</div></div>').join('') : '<div class="empty">아직 낸 보고가 없습니다.</div>');
}
ACT.ddGo = d => { S.dailyDate = d; render(); };
ACT.dailySave = () => {
  const t = $('#f_daily').value.trim(); if (!t) return toast('내용을 적어 주세요.');
  const r = findReport('daily', S.uid, S.dailyDate) || create('reports', {kind: 'daily', date: S.dailyDate, who: S.uid});
  r.text = t; delete r.auto; r.ts = Date.now(); put('reports', r); // 자동 집계는 쓰는 사람 화면에만 (대표님께 가는 보고에는 넣지 않음)
  if (S.keep) delete S.keep['daily_' + S.dailyDate]; render(); toast('일일보고를 제출했어요.');
};
function viewReportView() {
  if (!canReport()) return '<h1>일일보고 종합</h1><div class="empty">일일보고·실적보고 종합 보기 권한이 있어야 볼 수 있어요.</div>';
  if (!S.dailyDate) S.dailyDate = todayStr();
  const staff = activeStaff().filter(u => !u.noReport).sort(byPos); const done = staff.filter(u => findReport('daily', u.id, S.dailyDate)).length;
  return '<h1>일일보고 종합</h1><div class="sub">직원별 일일보고를 한 화면에 모아 봐요.</div>' + dateNavHTML() + '<div class="t1" style="color:var(--deep);margin-top:12px">제출 ' + done + ' / ' + staff.length + '명</div>' +
    staff.map(u => { const r = findReport('daily', u.id, S.dailyDate);
      return '<div class="card flat"><div class="row"><div class="grow t1">' + esc(u.name) + '</div><span class="chip"' + (r ? '' : ' style="background:#fdecea;color:var(--red)"') + '>' + (r ? '제출' : '미제출') + '</span></div>' + (r ? '<div class="mtext">' + esc(r.text) + '</div>' : '') + '</div>'; }).join('');
}
function perfSnapshot(ym) {
  const st = perfStats(ym, false); const total = Object.values(st).reduce((s, a) => s + a[0], 0);
  return ym + ' 신규 계약 합계 ' + total + '대\n' + rankedStaff(st).map((u, i) => { const a = st[u.id] || [0, 0, 0, 0, 0]; return (i + 1) + '위 ' + u.name + ' - ' + a[0] + '대 (판매 ' + a[1] + ' · CMS ' + a[2] + ' · 렌탈 ' + a[3] + ')' + (a[4] ? ' 판매금액 ' + wonFmt(a[4]) : ''); }).join('\n');
}
function viewPerfReport() {
  const ym = perfYM(); let h = '<h1>실적 보고서</h1>' + monthNavHTML();
  if (canPerf()) {
    const old = findReport('perf', S.uid, ym), k = 'perf_' + ym;
    h += '<div class="sub">본부장이 이달 실적을 최종 정리해서 대표님께 올리는 곳이에요. 아래 내용은 자동 집계이며 고쳐서 올릴 수 있어요.</div><label class="fl" for="f_perf">실적 보고 내용</label><textarea id="f_perf" data-keep="' + k + '" style="min-height:200px">' + esc(keepVal(k, old ? old.text : perfSnapshot(ym))) + '</textarea><button class="btn gold full" data-act="perfSave">' + (old ? '수정해서 다시 보고' : '대표님께 보고하기') + '</button>';
  }
  if (canReport()) {
    const rs = list('reports').filter(r => r.kind === 'perf' && r.date === ym);
    h += '<h2>올라온 실적 보고서</h2>' + (rs.length ? rs.map(r => '<div class="card flat"><b style="color:var(--deep);font-size:12px">' + esc(uname(r.who) + ' · ' + (r.ts ? new Date(r.ts).toLocaleString('ko-KR', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}) : '')) + '</b><div class="mtext">' + esc(r.text) + '</div></div>').join('') : '<div class="empty">이 달에 올라온 보고서가 없습니다.</div>');
  }
  return h;
}
ACT.perfSave = () => {
  const ym = perfYM(), t = $('#f_perf').value.trim(); if (!t) return;
  const r = findReport('perf', S.uid, ym) || create('reports', {kind: 'perf', date: ym, who: S.uid});
  r.text = t; r.ts = Date.now(); put('reports', r); if (S.keep) delete S.keep['perf_' + ym]; render(); toast('대표님께 보고했어요.');
};

// ---------- 자료실 (앱과 같은 library 문서, 파일은 blobs 조각) ----------
const LIB_CATS = ['양식·서식', '계약·약정', '가맹점 안내', '교육·매뉴얼', '사진·홍보물', '기타'];
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
function viewLibrary() {
  return '<h1>자료실</h1><div class="sub">양식·계약서·안내문 같은 파일을 올려 두고 직원 모두가 내려받아 쓰는 곳이에요. 오른쪽 아래 + 로 올립니다.</div>' +
    '<input id="libq" data-q="libq" placeholder="🔍 제목·설명·파일 이름 (초성 가능)" value="' + esc(S.libq || '') + '">' +
    '<div class="pills">' + [''].concat(LIB_CATS).map(c => '<button class="pill ' + ((S.libCat || '') === c ? 'on' : '') + '" data-act="libCat" data-arg="' + c + '">' + (c || '전체') + '</button>').join('') + '</div><div class="qres" data-for="libq">' + libList() + '</div>';
}
function libList() {
  const all = list('library').sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  const ls = all.filter(p => (!S.libCat || p.cat === S.libCat) && kmatch((p.title || '') + ' ' + (p.desc || '') + ' ' + (p.files || []).map(f => f.fname).join(' ') + ' ' + uname(p.who), S.libq || ''));
  return ls.length ? ls.map(p => '<div class="card" data-act="libPost" data-arg="' + p.id + '"><div class="t1">' + esc(p.title) + '</div><div class="t2">' + esc((p.cat || '') + ' · ' + uname(p.who) + ' · ' + (p.created || '')) + '</div>' + (p.desc ? '<div class="clamp2">' + esc(p.desc) + '</div>' : '') + ((p.files || []).length ? '<div style="color:var(--deep);font-weight:700;font-size:13px;margin-top:4px">📎 파일 ' + p.files.length + '개</div>' : '') + '</div>').join('') : '<div class="empty">' + (all.length ? '찾는 자료가 없어요.' : '아직 올라온 자료가 없어요. + 를 눌러 첫 자료를 올려 보세요.') + '</div>';
}
ACT.libCat = c => { S.libCat = c; render(); };
ACT.libPost = id => {
  const p = byId('library', id); if (!p) return; const own = p.who === S.uid || can('staff_manage');
  modal('<h3>' + esc(p.title) + '</h3><div class="sub">' + esc((p.cat || '') + ' · ' + uname(p.who) + ' · ' + (p.created || '')) + '</div>' + (p.desc ? '<div class="mtext" style="margin:10px 0">' + linkify(p.desc) + '</div>' : '') +
    ((p.files || []).length ? '<div class="lb">첨부 파일 (눌러서 받기)</div>' + p.files.map(f => '<button class="mi" data-act="openFile" data-arg="' + esc(f.blob + '|' + (f.chunks || 0) + '|' + f.fname) + '"><span>📎 ' + esc(f.fname) + ' <small style="color:var(--gray)">(' + kb(f.size || 0) + ')</small></span></button>').join('') : '') +
    '<div class="btns" style="margin-top:12px">' + (own ? '<button class="btn" data-act="libEdit" data-arg="' + p.id + '">수정</button><button class="btn red" data-act="libDel" data-arg="' + p.id + '">삭제</button>' : '') + '<button class="btn" data-act="close">닫기</button></div>');
};
ACT.libDel = id => { const p = byId('library', id); needDelPw('자료실 삭제', () => askConfirm('‘' + p.title + '’ 삭제할까요?', '자료실 목록에서 사라져요. 서버에는 기록이 보관됩니다.', '삭제', () => { p.deleted = true; put('library', p); render(); toast('삭제했어요.'); }, true)); };
async function uploadBlob(data, mime, name) { // 서버 보관함(blobs)에 600KB 조각으로 올린다 — 앱과 같은 형식
  const id = String(nextId()), CH = 600 * 1024, n = Math.max(1, Math.ceil(data.length / CH));
  await Promise.all([...Array(n).keys()].map(i => fs.collection('blobs').doc(id + '_' + i).set({d: b64of(data.subarray(i * CH, (i + 1) * CH)), mime, name, i, n, u: Date.now(), by: S.uid})));
  return {blob: id, chunks: n, fname: name, size: data.length};
}
function libForm(p) {
  return '<label class="fl" for="f_t1">제목 (필수)</label><input id="f_t1" placeholder="예: 가맹점 계약서 양식" value="' + esc(p ? p.title : '') + '"><label class="fl" for="f_m">설명 (선택)</label><textarea id="f_m" placeholder="설명">' + esc(p ? p.desc || '' : '') + '</textarea>' +
    '<label class="fl" for="f_c">분류</label><select id="f_c">' + LIB_CATS.map(c => '<option' + (p && p.cat === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select>';
}
ACT.libEdit = id => { const p = byId('library', id); formModal('자료 수정', libForm(p), () => { const t = $('#f_t1').value.trim(); if (!t) return warn('제목을 입력해 주세요.'); p.title = t; p.desc = $('#f_m').value.trim(); p.cat = $('#f_c').value; put('library', p); render(); toast('저장했어요.'); return true; }, '저장'); };
ACT.newLib = () => {
  const files = []; let busy = 0;
  formModal('자료 올리기', libForm(null) + '<button type="button" class="btn tint full" id="f_add">📎 파일 추가 (사진·문서, 3MB까지 · 5개까지)</button><input type="file" id="f_file" hidden multiple><div id="f_list" class="sub">첨부 파일 없음</div>', () => {
    const t = $('#f_t1').value.trim(); if (!t) return warn('제목을 입력해 주세요.'); if (busy) return warn('파일을 올리는 중이에요. 잠시 뒤 다시 눌러 주세요.');
    put('library', create('library', {title: t, desc: $('#f_m').value.trim(), cat: $('#f_c').value, who: S.uid, files: files.slice()})); render(); toast('자료를 올렸어요.'); return true;
  }, '올리기');
  const show = () => { $('#f_list').innerHTML = (files.map(f => '📎 ' + esc(f.fname) + ' (' + kb(f.size) + ')').join('<br>') || '첨부 파일 없음') + (busy ? '<br>올리는 중… ' + busy + '개' : ''); };
  $('#f_add').onclick = () => { if (DEMO) return toast('데모에서는 파일을 올릴 수 없어요.'); $('#f_file').click(); };
  $('#f_file').onchange = () => [...$('#f_file').files].forEach(async file => {
    if (files.length + busy >= 5) return toast('한 글에 파일은 5개까지 올릴 수 있어요.');
    const isImg = /^image\/(jpeg|png|webp|heic)/.test(file.type);
    if (!isImg && file.size > 3 * 1024 * 1024) return toast('파일은 3MB까지 올릴 수 있어요: ' + file.name);
    busy++; show();
    try {
      const data = isImg ? await shrinkImage(file, 1600, 900 * 1024) : new Uint8Array(await file.arrayBuffer());
      files.push(await uploadBlob(data, isImg ? 'image/jpeg' : (file.type || 'application/octet-stream'), isImg ? file.name.replace(/\.[A-Za-z0-9]+$/, '') + '.jpg' : file.name));
    } catch (e) { toast('올리지 못했어요. 인터넷을 확인해 주세요.'); }
    busy--; show();
  });
};

// ---------- 비상연락망 (contacts) ----------
function viewContacts() {
  return '<h1>비상연락망</h1><div class="sub">번호를 누르면 전화 걸기 화면이 열려요. 오른쪽 아래 + 로 추가합니다.</div><input id="cq" data-q="cq" placeholder="🔍 이름·구분·번호 (초성 가능)" value="' + esc(S.cq || '') + '"><div class="qres" data-for="cq">' + contactList() + '</div>';
}
function contactList() {
  const ls = list('contacts').filter(c => kmatch((c.name || '') + ' ' + (c.cat || '') + ' ' + (c.phone || '') + ' ' + (c.memo || ''), S.cq || '')).sort((a, b) => (a.cat || '').localeCompare(b.cat || '') || (a.name || '').localeCompare(b.name || ''));
  if (!ls.length) return '<div class="empty">' + (list('contacts').length ? '찾는 연락처가 없어요.' : '등록된 연락처가 없습니다. + 를 눌러 본사·카드사·밴사·긴급 연락처를 넣어 두세요.') + '</div>';
  let cat = null; return ls.map(c => { const head = c.cat !== cat ? '<div class="lb" style="font-size:13px;margin-top:14px">' + esc((cat = c.cat) || '기타') + '</div>' : '';
    const ph = (c.phone || '').replace(/[^0-9+*#]/g, '');
    return head + '<div class="card flat row"><div class="grow"><div class="t1">' + esc(c.name) + '</div><a href="tel:' + ph + '" class="tel">📞 ' + esc(c.phone) + '</a>' + (c.memo ? '<span class="t2"> · ' + esc(c.memo) + '</span>' : '') + '</div><button class="btn" style="flex:none;margin:0" data-act="contactEdit" data-arg="' + c.id + '">수정</button></div>'; }).join('');
}
function contactForm(c) {
  c = c || {}; return '<label class="fl" for="f_n">이름 (필수)</label><input id="f_n" placeholder="예: 본사 총무" value="' + esc(c.name || '') + '"><label class="fl" for="f_c">구분</label><input id="f_c" placeholder="예: 본사, 카드사, 밴사, 직원, 긴급" value="' + esc(c.cat || '') + '">' +
    '<label class="fl" for="f_p">전화번호 (필수)</label><input id="f_p" type="tel" placeholder="예: 062-123-4567" value="' + esc(c.phone || '') + '"><label class="fl" for="f_m">메모 (선택)</label><input id="f_m" placeholder="메모" value="' + esc(c.memo || '') + '">';
}
function contactSave(o) { const n = $('#f_n').value.trim(), ph = $('#f_p').value.trim(); if (!n || !ph) return warn('이름과 전화번호를 입력해 주세요.'); o.name = n; o.cat = $('#f_c').value.trim(); o.phone = ph; o.memo = $('#f_m').value.trim(); put('contacts', o); render(); toast('저장했어요.'); return true; }
ACT.newContact = () => formModal('연락처 추가', contactForm(null), () => contactSave(create('contacts', {})), '저장');
ACT.contactEdit = id => { const c = byId('contacts', id); formModal('연락처 수정', contactForm(c) + '<button class="btn red full" id="f_del">이 연락처 삭제</button>', () => contactSave(c), '저장'); $('#f_del').onclick = () => askConfirm('삭제할까요?', c.name, '삭제', () => { c.deleted = true; put('contacts', c); render(); }, true); };

// ---------- 프로필 (사진·상태 메시지 — 앱과 같은 profiles 문서: pic=256px JPEG base64, status) ----------
function avatarHTML(uid, size) {
  const pr = byId('profiles', uid), u = user(uid); const s = 'width:' + size + 'px;height:' + size + 'px';
  return pr && pr.pic ? '<img class="avimg" style="' + s + '" src="data:image/jpeg;base64,' + pr.pic + '" alt="">' : '<b class="avtxt" style="' + s + ';font-size:' + Math.round(size * 0.4) + 'px">' + esc(((u && u.name) || '?').slice(0, 1)) + '</b>';
}
ACT.profile = uid => {
  uid = Number(uid); const u = user(uid); if (!u) return; const pr = byId('profiles', uid) || {}; const me = uid === S.uid; const ph = (u.phone || '').replace(/[^0-9+]/g, '');
  modal('<div style="text-align:center">' + avatarHTML(uid, 96) + '<h3 style="margin-top:10px">' + esc(u.name) + '</h3><div class="sub">' + ((u.perms || []).includes('staff_manage') ? '관리자' : '직원') + '</div><div style="margin:10px 0;color:' + (pr.status ? 'var(--ink)' : 'var(--gray)') + '">' + esc(pr.status || '상태 메시지가 없어요') + '</div>' + (ph ? '<a class="tel" href="tel:' + ph + '">📞 ' + esc(u.phone) + '</a>' : '') + '</div>' +
    '<div class="btns" style="margin-top:14px">' + (me ? '<button class="btn tint" data-act="picPick">사진 변경</button><button class="btn tint" data-act="statusEdit">상태 메시지</button>' : '<button class="btn tint" data-act="dmFromProfile" data-arg="' + uid + '">1:1 대화</button>' + (ph ? '<a class="btn tint" style="text-align:center;text-decoration:none" href="tel:' + ph + '">전화하기</a>' : '')) + '<button class="btn" data-act="close">닫기</button></div><input type="file" id="f_pic" accept="image/*" hidden>');
};
ACT.myProfile = () => ACT.profile(S.uid);
ACT.dmFromProfile = uid => { closeModal(); S.tab = 'chat'; S.sub = ''; ACT.dm(uid); };
ACT.statusEdit = () => { const pr = myProf() || {id: S.uid}; formModal('상태 메시지', '<input id="f_s" placeholder="예: 외근 중, 오후 3시 복귀" value="' + esc(pr.status || '') + '">', () => { const p = myProf() || {id: S.uid}; p.status = $('#f_s').value.trim(); put('profiles', p); render(); toast('저장했어요.'); return true; }, '저장'); };
ACT.picPick = () => {
  const f = $('#f_pic'); f.onchange = async () => {
    if (!f.files[0]) return;
    try { const d = await shrinkImage(f.files[0], 256, 40 * 1024, true); const p = myProf() || {id: S.uid}; p.pic = b64of(d); put('profiles', p); closeModal(); render(); toast('사진을 바꿨어요.'); } catch (e) { toast('사진을 읽지 못했어요.'); }
  }; f.click();
};

// ---------- 직원과 권한 (최고관리자) — users 문서 + 로그인용 phones 문서를 같이 맞춘다 (앱 Store.push 와 같음) ----------
const PERMS = [['task_create', '업무 만들기'], ['task_assign', '다른 직원에게 업무 배정'], ['task_view_all', '전체 업무 보기'], ['history_all', '전체 이력 보기'], ['notice_write', '공지 작성'],
  ['perf_view', '실적 보기 (본부장·대표님)'], ['report_view', '일일보고·실적보고 종합 보기 (대표님)'], ['merchant_edit', '가맹점 등록·수정 (암호 필요)'], ['staff_view', '직원 정보 보기 (부서·직책·생년월일·연락처·주소)'], ['staff_manage', '직원 관리 (관리자 전용)']];
const PRESETS = {'영업직': ['task_create', 'task_assign', 'task_view_all', 'history_all'], '사무직': ['task_create', 'task_assign', 'task_view_all', 'history_all', 'merchant_edit'], '관리자': PERMS.map(x => x[0])};
const hasP = (u, k) => (u.perms || []).includes(k);
const adminCount = () => list('users').filter(u => u.active !== false && hasP(u, 'staff_manage')).length;
function syncPhone(u) { // 로그인 허용 번호와 서버 규칙용 권한 표시
  if (DEMO || !u.phone) return;
  fs.collection('phones').doc(u.phone).set({uid: u.id, admin: hasP(u, 'staff_manage'), perf: hasP(u, 'perf_view'), report: hasP(u, 'report_view'), active: u.active !== false, name: u.name})
    .catch(e => toast('로그인 번호를 저장하지 못했어요: ' + (e.code || e.message)));
}
// ---------- 직책 목록 (정렬 순서) — config key 'positions' {items}. 위에 있을수록 먼저 (부장급: 본부장·지사장) ----------
const POS_DEFAULT = ['대표', '이사', '본부장', '지사장', '부장', '차장', '과장', '대리', '사원'];
const posDoc = () => list('config').find(c => c.key === 'positions');
const positions = () => { const d = posDoc(); return d && Array.isArray(d.items) && d.items.length ? d.items : POS_DEFAULT; };
const posRank = u => { const i = positions().indexOf((u && u.pos) || ''); return i < 0 ? 999 : i; };
const byPos = (a, b) => posRank(a) - posRank(b) || (a.name || '').localeCompare(b.name || '');
const canStaffInfo = () => can('staff_view') || can('staff_manage');
ACT.posEdit = () => {
  if (!can('staff_manage')) return toast('관리자만 바꿀 수 있어요.');
  formModal('직책 목록 (정렬 순서)', '<div class="sub" style="margin-top:0">한 줄에 하나씩 적어요. <b>위에 있을수록 앞에</b> 보여요(직원 목록·일일보고 명단·실적 직책순). 줄을 지우면 목록에서 빠지고, 그 직책인 직원은 맨 뒤로 가요.</div><textarea id="f_pos" style="min-height:220px">' + esc(positions().join('\n')) + '</textarea>', () => {
    const items = [...new Set($('#f_pos').value.split(/[\n,]+/).map(x => x.trim()).filter(Boolean))]; if (!items.length) return warn('직책을 한 개 이상 적어 주세요.');
    const o = posDoc() || create('config', {key: 'positions'}); o.items = items; o.changedBy = S.uid; o.changedAt = nowStr(); put('config', o); render(); toast('직책 ' + items.length + '개를 저장했어요.'); return true;
  }, '저장');
};
// ---------- 삭제 비밀번호 (중요한 삭제: 직원·가맹점·재고·응대 기록·자료실) — config key 'delete_lock' {salt, hash}, 관리자가 정한다 ----------
const dlockDoc = () => list('config').find(c => c.key === 'delete_lock' && c.hash);
function needDelPw(what, then, must) { // must: 비밀번호가 아직 없으면 막는다(직원 완전 삭제)
  const L = dlockDoc();
  if (!L) { if (must) return toast(can('staff_manage') ? '먼저 ☰ → 관리자 → 삭제 비밀번호를 정해 주세요.' : '삭제 비밀번호가 아직 없어요. 관리자에게 요청해 주세요.'); return then(); }
  formModal('삭제 비밀번호', '<div class="sub" style="margin-top:0">' + esc(what) + ' — 중요한 삭제라서 관리자가 정한 삭제 비밀번호가 필요해요.</div><input id="f_dpw" type="password" autocomplete="off" placeholder="삭제 비밀번호">', () => {
    sha(L.salt + $('#f_dpw').value).then(h => { if (h === L.hash) { closeModal(); then(); } else toast('비밀번호가 맞지 않아요.'); }); return false;
  }, '확인');
}
ACT.dlockSet = () => {
  if (!can('staff_manage')) return toast('관리자만 설정할 수 있어요.');
  const L = dlockDoc();
  formModal('삭제 비밀번호', '<div class="sub" style="margin-top:0">직원 완전 삭제, 가맹점·재고·응대 기록·자료실 삭제 때 물어봐요. ' + (L ? '바꾸려면 현재 비밀번호도 입력해 주세요.' : '아직 없어요 — 정하기 전에는 직원 완전 삭제를 할 수 없어요.') + '</div>' +
    (L ? '<input id="f_old" type="password" autocomplete="off" placeholder="현재 비밀번호">' : '') + '<input id="f_new" type="password" autocomplete="off" placeholder="새 비밀번호 (4자 이상)"><input id="f_new2" type="password" autocomplete="off" placeholder="새 비밀번호 한 번 더">', () => {
    const nw = $('#f_new').value; if (nw.length < 4) return warn('비밀번호는 4자 이상으로 해 주세요.'); if (nw !== $('#f_new2').value) return warn('새 비밀번호가 서로 달라요.');
    const done = () => { const salt = Math.random().toString(36).slice(2) + Date.now().toString(36); sha(salt + nw).then(h => { const o = list('config').find(c => c.key === 'delete_lock') || create('config', {key: 'delete_lock'}); o.salt = salt; o.hash = h; o.changedBy = S.uid; o.changedAt = nowStr(); put('config', o); closeModal(); render(); toast('삭제 비밀번호를 저장했어요.'); }); };
    if (L) sha(L.salt + $('#f_old').value).then(h => { if (h === L.hash) done(); else toast('현재 비밀번호가 맞지 않아요.'); }); else done();
    return false;
  }, '저장');
};
// ---------- 직원과 권한 (관리자) — 정보 창(부서·직책·사진·생년월일·연락처·주소)과 권한 창이 따로 ----------
const staffList = () => [...S.data.users.values()].filter(u => !u.deleted);
const staffPhoto = (u, size) => u && u.photo ? '<img class="avimg" style="width:' + size + 'px;height:' + size + 'px" src="data:image/jpeg;base64,' + u.photo + '" alt="">' : avatarHTML(u.id, size);
const staffSub = u => [u.dept, u.pos].filter(Boolean).join(' · ');
function viewStaff() {
  if (!can('staff_manage')) return '<h1>직원과 권한</h1><div class="empty">최고관리자만 볼 수 있어요.</div>';
  if (!S.titlesDone) { S.titlesDone = true; setTimeout(() => { let n = 0; list('users').forEach(u => { const c = stripTitle(u.name); if (c && c !== u.name && !list('users').some(x => x.name === c)) { u.name = c; put('users', u); n++; } }); if (n) { toast('직원 이름에서 직함을 뺐어요 (이름만 표시).'); render(); } }, 0); }
  const us = staffList().sort((a, b) => (a.active === false) - (b.active === false) || byPos(a, b));
  return '<h1>직원과 권한</h1><div class="sub">직원을 누르면 <b>직원 정보</b>가 열리고, 거기서 정보 수정·<b>권한 설정</b>을 따로 해요. 직책 순서로 보여요. 오른쪽 아래 + 로 직원을 추가합니다.</div>' +
    '<div class="row" style="gap:8px"><button class="btn tint" data-act="posEdit">직책 목록 (정렬 순서)</button><button class="btn" data-act="dlockSet">삭제 비밀번호 ' + (dlockDoc() ? '바꾸기' : '정하기') + '</button></div>' +
    us.map(u => { const ps = PERMS.filter(x => hasP(u, x[0])).map(x => x[1].replace(/ \(.*\)$/, '')); return '<div class="card" data-act="staffInfo" data-arg="' + u.id + '"><div class="row">' + staffPhoto(u, 44) + '<div class="grow"><div class="t1" style="' + (u.active === false ? 'color:var(--gray)' : '') + '">' + esc(u.name) + (staffSub(u) ? ' <span class="sub" style="margin:0">' + esc(staffSub(u)) + '</span>' : '') + (u.active === false ? ' (사용 중지)' : '') + '</div><div class="t2">' + esc(u.phone || '') + (u.noPerf ? ' · 실적 제외' : '') + (u.noReport ? ' · 보고 명단 제외' : '') + '</div></div></div><div class="sub">권한: ' + esc(ps.length ? ps.join(', ') : '기본 권한(내 업무만)') + '</div></div>'; }).join('');
}
function viewStaffInfo() { // 직원 정보 보기 권한자용 명부 (권한 설정은 안 보임)
  if (!canStaffInfo()) return '<h1>직원 정보</h1><div class="empty">직원 정보 보기 권한이 있어야 볼 수 있어요.</div>';
  const us = staffList().filter(u => u.active !== false).sort(byPos);
  return '<h1>직원 정보 (명부)</h1><div class="sub">직책 순서로 보여요. 누르면 자세히 봐요.</div>' + us.map(u => '<div class="card" data-act="staffInfo" data-arg="' + u.id + '"><div class="row">' + staffPhoto(u, 44) + '<div class="grow"><div class="t1">' + esc(u.name) + (staffSub(u) ? ' <span class="sub" style="margin:0">' + esc(staffSub(u)) + '</span>' : '') + '</div><div class="t2">' + esc(u.tel || u.phone || '') + '</div></div></div></div>').join('');
}
const telFmt = p => { const d = String(p || '').replace(/^\+82/, '0').replace(/\D/g, ''); return d.length === 11 ? d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7) : d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : (p || ''); };
ACT.staffInfo = id => { // 정보 창: 보기 전용 + (관리자) 정보 수정 · 권한 설정 · 완전 삭제
  const u = byId('users', id); if (!u || u.deleted) return; if (!canStaffInfo()) return ACT.profile(id);
  const ln = (k, v) => v ? '<div class="line"><b>' + k + '</b><div>' + esc(v) + '</div></div>' : '';
  const A = can('staff_manage'), tel = u.tel || telFmt(u.phone);
  modal('<div class="row" style="gap:14px">' + staffPhoto(u, 72) + '<div class="grow"><h3 style="margin:0">' + esc(u.name) + '</h3><div class="sub" style="margin:2px 0 0">' + esc(staffSub(u) || '부서·직책 미입력') + (u.active === false ? ' · 사용 중지' : '') + '</div></div></div>' +
    ln('부서', u.dept) + ln('직책', u.pos) + ln('생년월일', u.birth) + (tel ? '<div class="line"><b>연락처</b><a href="tel:' + esc(tel.replace(/\D/g, '')) + '">' + esc(tel) + '</a></div>' : '') + ln('주소', u.addr) + ln('로그인 번호', A ? telFmt(u.phone) : '') +
    '<div class="btns" style="margin-top:12px;flex-wrap:wrap">' + (A ? '<button class="btn gold" data-act="staffInfoEdit" data-arg="' + u.id + '">정보 수정</button><button class="btn tint" data-act="staffEdit" data-arg="' + u.id + '">권한 설정</button><button class="btn red" data-act="staffDel" data-arg="' + u.id + '">완전 삭제</button>' : '') + '<button class="btn" data-act="close">닫기</button></div>');
};
ACT.staffInfoEdit = id => {
  const u = byId('users', id); if (!u || !can('staff_manage')) return; let pic = u.photo || '';
  const depts = [...new Set(staffList().map(x => (x.dept || '').trim()).filter(Boolean))];
  formModal(u.name + ' 정보', '<div class="row" style="gap:12px;align-items:center"><span id="f_pv">' + staffPhoto(u, 64) + '</span><button type="button" class="btn tint" id="f_pic">사진 고르기</button><button type="button" class="btn" id="f_picx">사진 빼기</button></div>' +
    '<label class="fl" for="f_n">이름 (직함 없이)</label><input id="f_n" value="' + esc(u.name) + '">' +
    '<div class="row" style="gap:8px"><div class="grow"><label class="fl" for="f_dp">부서</label><input id="f_dp" list="deptlist" value="' + esc(u.dept || '') + '" placeholder="예: 영업팀"><datalist id="deptlist">' + depts.map(d => '<option value="' + esc(d) + '">').join('') + '</datalist></div>' +
    '<div class="grow"><label class="fl" for="f_po">직책</label><select id="f_po"><option value="">(없음)</option>' + positions().concat(u.pos && !positions().includes(u.pos) ? [u.pos] : []).map(p => '<option' + (p === u.pos ? ' selected' : '') + '>' + esc(p) + '</option>').join('') + '</select></div></div>' +
    '<label class="fl" for="f_bd">생년월일</label><input id="f_bd" type="date" value="' + esc(u.birth || '') + '">' +
    '<label class="fl" for="f_tl">연락처 (비우면 로그인 번호)</label><input id="f_tl" type="tel" value="' + esc(u.tel || '') + '" placeholder="' + esc(telFmt(u.phone)) + '">' +
    '<label class="fl" for="f_ad">주소</label><input id="f_ad" value="' + esc(u.addr || '') + '">' +
    '<input type="file" id="f_pf" accept="image/*" hidden><div class="sub">로그인 번호(휴대폰)는 바꾸려면 직원을 새로 등록해 주세요. 사진은 관리자가 넣는 직원 명부용이에요(직원 본인 프로필 사진은 따로).</div>', () => {
    const n = stripTitle($('#f_n').value); if (!n) return warn('이름을 적어 주세요.');
    if (n !== u.name && staffList().some(x => x.id !== u.id && x.name === n)) return warn('같은 이름의 직원이 있습니다.');
    u.name = n; u.dept = $('#f_dp').value.trim(); u.pos = $('#f_po').value; u.birth = $('#f_bd').value; u.tel = $('#f_tl').value.trim(); u.addr = $('#f_ad').value.trim(); u.photo = pic;
    put('users', u); syncPhone(u); if (u.id === S.uid) refreshMe(); render(); setTimeout(() => ACT.staffInfo(u.id), 0); toast('저장했어요.'); return true;
  }, '저장');
  $('#f_pic').onclick = () => $('#f_pf').click();
  $('#f_picx').onclick = () => { pic = ''; $('#f_pv').innerHTML = avatarHTML(u.id, 64); };
  $('#f_pf').onchange = async () => { try { const d = await shrinkImage($('#f_pf').files[0], 256, 40 * 1024, true); pic = b64of(d); $('#f_pv').innerHTML = '<img class="avimg" style="width:64px;height:64px" src="data:image/jpeg;base64,' + pic + '" alt="">'; } catch (e) { toast('사진을 읽지 못했어요.'); } };
};
ACT.staffDel = id => { // 완전 삭제: 목록·명단·선택지에서 모두 빠지고 로그인도 막힌다. 서버 규칙상 기록(업무·채팅의 이름)은 남는다
  const u = byId('users', id); if (!u || !can('staff_manage')) return;
  if (u.id === S.uid) return toast('내 계정은 지울 수 없어요.');
  if (hasP(u, 'staff_manage') && adminCount() <= 1) return toast('마지막 관리자는 지울 수 없어요.');
  needDelPw(u.name + '님 완전 삭제', () => askConfirm(u.name + '님을 완전 삭제할까요?', '직원 목록·명단·담당자 고르기에서 모두 사라지고 이 번호로 로그인할 수 없어요. 되돌릴 수 없어요.\n(지난 업무·채팅에 남은 이름 기록은 그대로 보여요)', '완전 삭제', () => {
    u.deleted = true; u.active = false; u.deletedAt = nowStr(); u.deletedBy = S.uid; put('users', u); syncPhone(u); closeModal(); render(); toast(u.name + '님을 삭제했어요.');
  }, true), true);
};
ACT.reqQuickEdit = () => formModal('빠른 선택 버튼 관리', '<div class="sub" style="margin-top:0">업무 요청 창의 ‘가맹점 요청사항’ 빠른 선택 버튼이에요. 한 줄에 하나씩 적으면 그 순서대로 버튼이 생겨요. (모든 직원에게 똑같이 보여요)</div><textarea id="f_q" style="min-height:120px" placeholder="예: 용지신청">' + esc(reqQuick().join('\n')) + '</textarea>', () => {
  const items = [...new Set($('#f_q').value.split(/[\n,]+/).map(x => x.trim()).filter(Boolean))];
  const o = reqQuickDoc() || create('config', {key: 'req_quick'}); o.items = items; o.changedBy = S.uid; o.changedAt = nowStr(); put('config', o); render(); toast('빠른 선택 버튼 ' + items.length + '개를 저장했어요.'); return true;
}, '저장');
ACT.newStaff = () => formModal('직원 추가', '<label class="fl" for="f_n">직원 이름 (이름만, 직함 없이)</label><input id="f_n" placeholder="예: 김영업"><label class="fl" for="f_p">휴대폰 번호</label><input id="f_p" type="tel" placeholder="예: 01012345678">' +
  '<label class="fl" for="f_ps">권한 묶음 (추가 후 항목별로 바꿀 수 있어요)</label><select id="f_ps">' + Object.keys(PRESETS).map(k => '<option>' + k + '</option>').join('') + '</select>', () => {
  const n = stripTitle($('#f_n').value), ph = e164($('#f_p').value);
  if (!n || ph.length < 12) return warn('이름과 휴대폰 번호를 입력해 주세요.');
  if (list('users').some(u => u.name === n)) return warn('같은 이름의 직원이 있습니다.');
  if (staffList().some(u => u.phone === ph)) return warn('이미 등록된 번호입니다.');
  const u = {id: nextId(), name: n, phone: ph, active: true, perms: PRESETS[$('#f_ps').value].slice()}; put('users', u); syncPhone(u); render(); toast(n + '님을 등록했어요. 이 번호로 로그인할 수 있어요.'); return true;
}, '추가');
ACT.staffEdit = id => {
  const u = byId('users', id); if (!u) return; const active = u.active !== false;
  formModal(u.name + ' 권한 설정', PERMS.map(([k, lb]) => '<label class="chk"><input type="checkbox" class="pm" value="' + k + '"' + (hasP(u, k) ? ' checked' : '') + '><span>' + lb + '</span></label>').join('') +
    '<label class="chk" style="margin-top:8px"><input type="checkbox" id="f_np"' + (u.noPerf ? ' checked' : '') + '><span>영업 실적·순위에서 빼기 (대표님 등)</span></label>' +
    '<label class="chk"><input type="checkbox" id="f_nr"' + (u.noReport ? '' : ' checked') + '><span>일일보고·실적보고 명단에 넣기</span></label>' +
    '<button class="btn ' + (active ? 'red' : 'tint') + ' full" id="f_act">' + (active ? '사용 중지 (퇴사 등)' : '다시 사용') + '</button>', () => {
    const np = [...document.querySelectorAll('.pm:checked')].map(c => c.value);
    if (hasP(u, 'staff_manage') && !np.includes('staff_manage') && adminCount() <= 1) return warn('마지막 관리자의 직원 관리 권한은 끌 수 없습니다.');
    u.perms = np; u.noPerf = $('#f_np').checked; u.noReport = !$('#f_nr').checked; put('users', u); syncPhone(u); if (u.id === S.uid) refreshMe(); render(); toast('저장했어요.'); return true;
  }, '저장');
  $('#f_act').onclick = () => {
    if (active && hasP(u, 'staff_manage') && adminCount() <= 1) return toast('마지막 관리자는 중지할 수 없습니다.');
    askConfirm(active ? u.name + '님 사용을 멈출까요?' : u.name + '님을 다시 사용할까요?', active ? '이 번호로 더는 로그인할 수 없어요. 자료는 그대로 남아요.' : '', active ? '사용 중지' : '다시 사용', () => { u.active = !active; put('users', u); syncPhone(u); render(); }, active);
  };
};

// ---------- 가맹점 보호·복원 (최고관리자) ----------
// 되돌리기 기준점: 위험한 작업(가져오기·복원·되돌리기) 직전에 지금 가맹점 전체를 이 기기(IndexedDB)에 저장 — 저장에 실패하면 작업하지 않는다
async function snapMerchants(why) {
  if (DEMO) return true;
  try {
    const key = 'snap_' + nowStr().replace(/[-: ]/g, '') + '_' + why;
    await idbDo('readwrite', st => st.put(JSON.stringify({kind: 'merchants-snapshot', why, at: nowStr(), merchants: [...S.data.merchants.values()]}), key));
    const keys = ((await idbDo('readonly', st => st.getAllKeys())) || []).filter(k => String(k).startsWith('snap_')).sort();
    if (keys.length > 30) { const old = keys.slice(0, keys.length - 30); await idbDo('readwrite', st => old.forEach(k => st.delete(k))); }
    return true;
  } catch (e) { return false; }
}
ACT.safety = () => {
  if (!can('staff_manage')) return toast('최고관리자만 쓸 수 있어요.');
  const trash = [...S.data.merchants.values()].filter(m => m.deleted).length;
  modal('<h3>가맹점 보호·복원</h3><div class="sub">가맹점 자료는 서버에서 지울 수 없게 막혀 있고, 삭제는 숨김일 뿐이에요. 복원·되돌리기 직전에는 지금 상태를 이 기기에 자동 저장해요.</div>' +
    '<button class="mi" data-act="trash"><span>삭제한 가맹점 복원 (' + trash + '곳)</span><em>›</em></button>' +
    '<button class="mi" data-act="restoreFile"><span>백업 파일(.json)로 복원</span><em>›</em></button>' +
    '<button class="mi" data-act="pcBackups"><span>이 PC에 보관된 백업·되돌리기 기준점</span><em>›</em></button>' +
    '<button class="mi" data-act="snapNow"><span>지금 바로 기준점 만들기</span><em>›</em></button>' +
    '<div class="sub" style="margin-top:8px">가맹점 하나의 변경 이력·되돌리기는 가맹점 정보 창의 ‘🕘 변경 이력’에서 해요.</div><input type="file" id="f_rest" accept=".json,application/json" hidden><button class="btn full" data-act="close">닫기</button>');
};
ACT.snapNow = async () => toast(await snapMerchants('수동') ? '기준점을 만들었어요. (이 PC에 보관된 백업에 있어요)' : '만들지 못했어요.');
ACT.trash = () => {
  const del = [...S.data.merchants.values()].filter(m => m.deleted).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  modal('<h3>삭제한 가맹점 (' + del.length + '곳)</h3><div class="sub">눌러서 목록에 다시 살려요.</div>' + (del.length ? del.map(m => '<button class="mi" data-act="untrash" data-arg="' + m.id + '"><span>' + esc(m.name) + ' <small style="color:var(--gray)">' + esc(m.bizno || '') + '</small></span><em>복원 ›</em></button>').join('') : '<div class="empty">삭제된 가맹점이 없어요.</div>') + '<button class="btn full" data-act="close">닫기</button>');
};
ACT.untrash = id => { const m = S.data.merchants.get(Number(id)); askConfirm('‘' + m.name + '’ 가맹점을 복원할까요?', '', '복원', () => { m.deleted = false; put('merchants', m); render(); ACT.trash(); toast('복원했어요.'); }); };
function backupMerchants(j) { // 여러 백업 형식에서 가맹점 목록만 꺼낸다 (웹 백업·앱 백업·앱 되돌리기 기준점·매일 자동 백업)
  if (Array.isArray(j.merchants)) return j.merchants;
  if (j.collections && Array.isArray(j.collections.merchants)) return j.collections.merchants.map(d => { try { return JSON.parse(d.data.j); } catch (e) { return null; } }).filter(Boolean);
  return null;
}
ACT.restoreFile = () => {
  const f = $('#f_rest'); f.onchange = async () => {
    try {
      const arr = backupMerchants(JSON.parse(await f.files[0].text())); if (!arr) return toast('가맹점 자료가 든 백업 파일이 아니에요.');
      const ch = arr.filter(o => o && o.id && JSON.stringify(o) !== JSON.stringify(S.data.merchants.get(o.id)));
      const add = ch.filter(o => !S.data.merchants.has(o.id)).length;
      askConfirm('이 백업으로 가맹점을 복원할까요?', '파일 속 가맹점 ' + arr.length + '곳 중 지금과 다른 ' + ch.length + '곳(새로 생기는 곳 ' + add + ')을 파일 내용으로 되돌려요. 파일에 없는 가맹점은 그대로 둬요.\n복원 직전 상태는 이 PC에 기준점으로 저장돼요.', '복원', async () => {
        if (!await snapMerchants('복원전')) return toast('복원 전 기준점을 저장하지 못해서 멈췄어요.');
        ch.forEach(o => put('merchants', Object.assign({}, o))); render(); toast(ch.length + '곳을 복원했어요.');
      });
    } catch (e) { toast('파일을 읽지 못했어요.'); }
  }; f.click();
};
ACT.mhist = id => { // 변경 기록(audit)에서 이 가맹점의 지난 모습을 모아 고른 시점으로 되돌린다
  if (!can('staff_manage')) return; if (DEMO) return toast('데모에서는 변경 이력이 없어요.');
  toast('변경 이력을 불러오는 중…');
  fs.collection('audit').where('c', '==', 'merchants').where('id', '==', Number(id)).get().then(qs => {
    const vs = qs.docs.map(d => { try { return {u: d.get('u') || 0, by: d.get('by') || 0, o: JSON.parse(d.get('j'))}; } catch (e) { return null; } }).filter(Boolean).sort((a, b) => a.u - b.u);
    if (!vs.length) return toast('남아 있는 변경 이력이 없어요.');
    const diff = (a, b) => !a ? '처음 등록' : Object.keys(MF).filter(k => String(a[k] == null ? '' : a[k]) !== String(b[k] == null ? '' : b[k])).map(k => MF[k]).join(', ') || '변경 없음';
    S.hist = vs;
    modal('<h3>변경 이력 (' + vs.length + ')</h3><div class="sub">눌러서 그 시점으로 되돌려요.</div>' + vs.map((v, i) => ({v, i})).reverse().map(({v, i}) => '<button class="mi" data-act="mhistGo" data-arg="' + i + '"><span>' + new Date(v.u).toLocaleString('ko-KR', {month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false}) + ' · ' + esc(uname(v.by)) + '<br><small style="color:var(--gray)">' + esc(diff(i ? vs[i - 1].o : null, v.o)) + '</small></span><em>›</em></button>').join('') + '<button class="btn full" data-act="close">닫기</button>');
  }).catch(e => toast('이력을 불러오지 못했어요. (' + (e.code || e.message) + ')'));
};
ACT.mhistGo = i => {
  const ver = S.hist[Number(i)].o;
  askConfirm('이 시점으로 되돌릴까요?', [ver.name, ver.bizno, mNums(ver).phone, mNums(ver).mobile, ver.addr, termsText(ver), gradeLabel(ver.grade)].filter(Boolean).join('\n') + (ver.deleted ? '\n(이 시점엔 삭제된 상태였어요)' : ''), '되돌리기', async () => {
    if (!await snapMerchants('이력되돌리기전')) return toast('되돌리기 전 기준점을 저장하지 못해서 멈췄어요.');
    put('merchants', Object.assign({}, ver)); render(); toast('되돌렸어요.');
  });
};

// ---------- 엑셀 양식(.xlsx) 만들기 — 안내 줄 몇 개 + 머리글 + 예시 줄. 가져올 때 '(예시)'로 시작하는 줄은 건너뛴다 ----------
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_T[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function zipStore(files) { // [{name, text}] → 압축 없이 묶은 zip (Uint8Array)
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  files.forEach(f => {
    const nm = enc.encode(f.name), d = enc.encode(f.text), crc = crc32(d), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    parts.push(new Uint8Array(h.buffer), nm, d); cen.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + d.length;
  });
  const csz = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, csz, true); e.setUint32(16, off, true);
  const all = parts.concat(cen, [new Uint8Array(e.buffer)]), out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p2 = 0; all.forEach(b => { out.set(b, p2); p2 += b.length; }); return out;
}
function xlsxOf(notes, head, rows, widths) { // 글자 칸만 쓰는 단순 엑셀 (머리글은 굵게·노란 바탕)
  const x = v => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const col = i => { let n = i + 1, s2 = ''; while (n) { s2 = String.fromCharCode(65 + (n - 1) % 26) + s2; n = Math.floor((n - 1) / 26); } return s2; };
  let rn = 0; const row = (cells, st) => { rn++; return '<row r="' + rn + '">' + cells.map((v, i) => '<c r="' + col(i) + rn + '" t="inlineStr"' + (st ? ' s="' + st + '"' : '') + '><is><t xml:space="preserve">' + x(v) + '</t></is></c>').join('') + '</row>'; };
  const body = notes.map(n => row([n], 2)).join('') + row([]) + row(head, 1) + rows.map(r => row(r)).join('');
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>' + head.map((h, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + ((widths || [])[i] || 16) + '" customWidth="1"/>').join('') + '</cols><sheetData>' + body + '</sheetData></worksheet>';
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="맑은 고딕"/></font><font><b/><sz val="11"/><name val="맑은 고딕"/></font><font><sz val="10"/><color rgb="FF8F6B14"/><name val="맑은 고딕"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF7EFD9"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  return zipStore([
    {name: '[Content_Types].xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'},
    {name: '_rels/.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name: 'xl/workbook.xml', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="양식" sheetId="1" r:id="rId1"/></sheets></workbook>'},
    {name: 'xl/_rels/workbook.xml.rels', text: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'},
    {name: 'xl/worksheets/sheet1.xml', text: sheet}, {name: 'xl/styles.xml', text: styles}]);
}
function saveBytes(name, u8, mime) { const u = URL.createObjectURL(new Blob([u8], {type: mime})); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const isSample = v => /^\(?예시\)?/.test(String(v || '').trim());
function dateCell(v) { // 엑셀 날짜(숫자 45678)·2026.10.1·20261001·2026-10-01 → 2026-10-01
  v = String(v || '').trim(); if (!v) return '';
  if (/^\d{5}(\.\d+)?$/.test(v)) { const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(v)) * 86400000); return d.toISOString().slice(0, 10); }
  let m = v.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); if (m) return m[1] + '-' + pad(Number(m[2])) + '-' + pad(Number(m[3]));
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/); if (m) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}
// 가맹점 양식: 이카운트 거래처 목록 머리글과 같은 이름을 써서, 이카운트 엑셀을 그대로 올려도 되고 이 양식에 붙여 넣어도 된다
const M_TPL_HEAD = ['거래처코드', '거래처명(상호)', '사업자등록번호', '대표자명', '전화', '핸드폰', '주소', '등급', '업태', '종목', 'VAN사', '계약시작일', '계약종료일', '메모', '응대일자', '응대종류', '요청사항', '처리결과(처리완료)'];
ACT.mTemplate = () => saveBytes('나인패밀리_가맹점_업로드양식.xlsx', xlsxOf([
  '■ 가맹점 일괄 업로드 양식 — 이카운트 ‘거래처등록’ 목록을 엑셀로 내려받아 그대로 올려도 되고, 아래 머리글 밑에 붙여 넣어도 돼요.',
  '■ 거래처명(상호)은 꼭 있어야 해요. 같은 거래처코드·사업자번호·상호가 이미 있으면 새로 만들지 않고 값이 있는 칸만 바꿔요(빈 칸은 그대로).',
  '■ 등급: 0코드·1코드·2코드·3코드·해지가맹점·신규가맹점·협력사 (S·A·B·C 로 적어도 돼요) / 날짜: 2026-10-01 처럼 / ‘(예시)’로 시작하는 줄은 올릴 때 건너뛰어요(지우지 않아도 돼요).',
  '■ 응대 기록(이카운트의 요청사항·처리완료): 요청사항이나 처리결과를 적은 줄은 그 가맹점 응대 기록으로 남아요. 한 가맹점에 여러 건이면 상호만 같게 해서 줄을 여러 개 쓰면 돼요. 응대종류: 방문A/S·원격A/S·전화응대·용지신청·기타(비우면 기타), 응대일자를 비우면 올린 날로 남아요. 같은 날 같은 내용은 두 번 올라가지 않아요.'],
  M_TPL_HEAD, [['(예시) E0001', '(예시) 삼영푸드', '123-45-67890', '홍길동', '062-123-4567', '010-1234-5678', '광주 서구 상무대로 1', '1코드', '음식점', '한식', 'KIS정보통신', '2025-01-01', '2027-12-31', '포스 2대', '2026-09-15', '방문A/S', '단말기 용지 걸림', '롤러 청소 후 정상'], ['(예시) E0001', '(예시) 삼영푸드', '', '', '', '', '', '', '', '', '', '', '', '', '2026-10-02', '용지신청', '영수증 용지 2박스', '택배 발송 완료']],
  [12, 22, 16, 10, 14, 14, 30, 8, 10, 10, 14, 12, 12, 20, 12, 12, 30, 30]), XLSX_MIME);
// ---------- 가맹점 일괄 가져오기 (엑셀 .xlsx · CSV — 앱의 MerchantImport 와 같은 규칙) ----------
async function unzip(buf) { // .xlsx 는 zip — 필요한 xml 만 꺼낸다 (압축 해제는 브라우저 기본 기능)
  const v = new DataView(buf), u8 = new Uint8Array(buf); let e = buf.byteLength - 22;
  while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--; if (e < 0) throw new Error('zip');
  const cnt = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = {};
  for (let i = 0; i < cnt; i++) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (!(name === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) continue;
    const ds = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), data = u8.subarray(ds, ds + csize);
    out[name] = method === 0 ? new TextDecoder().decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}
function readCsv(s) {
  const first = s.slice(0, 2000), sep = (first.split('\t').length > first.split(',').length) ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; } else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function readTable(file) {
  const buf = await file.arrayBuffer(), b = new Uint8Array(buf);
  if (b[0] === 0x50 && b[1] === 0x4B) {
    const z = await unzip(buf); const xml = t => new DOMParser().parseFromString(t, 'application/xml');
    const ss = z['xl/sharedStrings.xml'] ? [...xml(z['xl/sharedStrings.xml']).getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
    let best = [];
    Object.keys(z).filter(n => n.startsWith('xl/worksheets/')).sort().forEach(n => {
      const rows = [...xml(z[n]).getElementsByTagName('row')].map(r => { const out = [];
        [...r.getElementsByTagName('c')].forEach(c => { const ref = c.getAttribute('r') || ''; let col = 0; for (const ch of ref) { if (ch >= 'A' && ch <= 'Z') col = col * 26 + ch.charCodeAt(0) - 64; else break; } col = col ? col - 1 : out.length;
          const t = c.getAttribute('t') || ''; let val = t === 'inlineStr' ? [...c.getElementsByTagName('t')].map(x => x.textContent).join('') : ((c.getElementsByTagName('v')[0] || {}).textContent || '');
          if (t === 's') val = ss[Number(val)] || ''; else if (!t || t === 'n') { if (/e/i.test(val) && !isNaN(Number(val))) val = BigInt(Math.round(Number(val))).toString(); else if (val.endsWith('.0')) val = val.slice(0, -2); }
          while (out.length < col) out.push(''); out[col] = val; });
        return out; });
      if (rows.length > best.length) best = rows;
    });
    if (!best.length) throw new Error('엑셀 안에서 시트를 찾지 못했어요.');
    return best;
  }
  if (b[0] === 0xD0 && b[1] === 0xCF) throw new Error('옛 엑셀(.xls) 형식이에요. 엑셀에서 ‘다른 이름으로 저장 → Excel 통합 문서(.xlsx)’ 또는 CSV 로 저장해서 올려 주세요.');
  let text; try { text = new TextDecoder('utf-8', {fatal: true}).decode(b); } catch (e) { text = new TextDecoder('euc-kr').decode(b); }
  return readCsv(text.replace(/^﻿/, ''));
}
const normH = s => String(s || '').replace(/[\s *()[\]·._/-]/g, '').toLowerCase();
function fieldOf(h) {
  h = normH(h); if (!h) return null;
  // 응대 기록 열 (가맹점 이름 열보다 먼저 본다: '가맹점 요청사항' 같은 머리글)
  if (/(응대|요청|접수|처리|완료|조치)(일자|날짜|일)$/.test(h)) return 'ldate';
  if (h.includes('응대종류') || h.includes('응대구분') || h.includes('요청구분') || h.includes('접수구분') || h === '유형') return 'lkind';
  if (h.includes('요청') || h.includes('접수내용') || h.includes('문의')) return 'lreq';
  if (h.includes('처리') || h.includes('조치') || h.includes('결과')) return 'lres';
  if (h.includes('사업자') || h === '등록번호' || h.includes('bizno')) return 'bizno';
  if (h.includes('거래처코드') || h === '코드' || h.includes('고객코드')) return 'ecode';
  if (h.includes('거래처명') || h.includes('상호') || h.includes('가맹점명') || h.includes('가맹점') || h.includes('업체명') || h.includes('회사명') || h === '거래처' || h === '이름' || h === '고객명') return 'name';
  if (h.includes('대표')) return 'owner';
  if (h.includes('핸드폰') || h.includes('휴대') || h.includes('모바일') || h.includes('mobile') || h === 'hp') return 'mobile';
  if (h.includes('전화') || h.includes('연락처') || h === 'tel') return 'phone';
  if (h.includes('주소')) return 'addr'; if (h.includes('등급')) return 'grade'; if (h.includes('업태')) return 'biztype'; if (h.includes('종목')) return 'bizitem';
  if (h.includes('van')) return 'van'; if (h.includes('계약시작') || h.includes('시작일')) return 'cstart'; if (h.includes('계약종료') || h.includes('종료일') || h.includes('만료')) return 'cend';
  if (h.includes('메모') || h.includes('비고')) return 'memo';
  return null;
}
function findHeader(rows) { for (let i = 0; i < Math.min(rows.length, 15); i++) { const m = {}; rows[i].forEach((c, j) => { const f = fieldOf(c); if (f && !(f in m)) m[f] = j; }); if ('name' in m && Object.keys(m).length >= 2) return [i, m]; } return null; }
const cellOf = (r, m, f) => (m[f] == null || m[f] >= r.length) ? '' : String(r[m[f]] || '').trim();
const bizFmt = raw => { const d = raw.replace(/\D/g, ''); return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 5) + '-' + d.slice(5) : raw.trim(); };
function gradeOf(g) {
  g = g.trim().toUpperCase(); if (!g) return -1;
  if (g.startsWith('S')) return 0; if (g.startsWith('A')) return 1; if (g.startsWith('B')) return 2; if (g.startsWith('C')) return 3;
  if (g.includes('해지')) return 4; if (g.includes('신규')) return 5; if (g.includes('협력')) return 7;
  const d = g.replace(/\D/g, ''); if (d) { const n = Number(d[0]); if (n >= 0 && n <= 7 && n !== 6) return n; } return -1;
}
function findMerchant(ec, bd, nm) {
  const all = [...S.data.merchants.values()];
  return (ec && all.find(m => m.ecode === ec)) || (bd.length === 10 && all.find(m => (m.bizno || '').replace(/\D/g, '') === bd)) || (nm && all.find(m => (m.name || '').trim() === nm)) || null;
}
ACT.importM = () => {
  if (!canEditMerchant()) return toast('가맹점 등록·수정 권한이 있어야 가져올 수 있어요.');
  needLock(() => {
    modal('<h3>가맹점 일괄 가져오기</h3><div class="sub">이카운트 ‘거래처등록’ 목록을 엑셀(.xlsx) 또는 CSV로 내려받아 골라 주세요. 머리글에 ‘거래처명’(또는 상호·가맹점명)이 있어야 해요. 사업자등록번호, 거래처코드, 대표자, 전화, 핸드폰, 주소, 등급, 업태, 종목, VAN사, 계약시작일·종료일, 메모 열이 있으면 함께 가져와요. 직접 만들 때는 양식을 받아서 채워 주세요.</div><button class="btn tint full" data-act="mTemplate">📄 업로드 양식 받기 (.xlsx)</button><button class="btn gold full" id="f_pick">파일 고르기</button><input type="file" id="f_imp" accept=".xlsx,.csv,.txt" hidden><button class="btn full" data-act="close">닫기</button>');
    $('#f_pick').onclick = () => $('#f_imp').click();
    $('#f_imp').onchange = async () => {
      let rows; try { rows = await readTable($('#f_imp').files[0]); } catch (e) { return toast(e.message && e.message !== 'zip' ? e.message : '파일을 읽지 못했어요.'); }
      const hd = findHeader(rows); if (!hd) return toast('머리글에서 ‘거래처명’(상호) 열을 찾지 못했어요.');
      const [hr, map] = hd; const data = rows.slice(hr + 1); let add = 0, upd = 0, skip = 0, nlog = 0; const seenM = new Set();
      data.forEach(r => { const nm = cellOf(r, map, 'name'); if (!nm || isSample(nm) || isSample(r[0])) { skip++; return; } if (cellOf(r, map, 'lreq') || cellOf(r, map, 'lres')) nlog++;
        const ex = findMerchant(cellOf(r, map, 'ecode'), cellOf(r, map, 'bizno').replace(/\D/g, ''), nm), k = ex ? 'id' + ex.id : 'nm' + nm; if (seenM.has(k)) return; seenM.add(k); ex ? upd++ : add++; });
      askConfirm('가져오기 미리보기', '새로 등록 ' + add + '곳\n기존 가맹점 갱신 ' + upd + '곳' + (nlog ? '\n응대 기록 ' + nlog + '건 (같은 날 같은 내용은 건너뜀)' : '') + '\n건너뜀(상호 없음·예시 줄) ' + skip + '곳\n\n[읽은 열]\n' + Object.entries(map).map(([f, c]) => f + ' ← ' + rows[hr][c]).join('\n') + '\n\n※ 같은 거래처코드·사업자번호·상호가 있으면 새로 만들지 않고, 파일에 값이 있는 칸만 덮어써요(빈 칸은 그대로).\n※ 가져오기 직전 상태는 이 PC에 기준점으로 저장돼요.', '가져오기', async () => {
        if (!await snapMerchants('가져오기전')) return toast('가져오기 전 기준점을 저장하지 못해서 멈췄어요.');
        let logAdd = 0, logSkip = 0;
        data.forEach(r => {
          const nm = cellOf(r, map, 'name'); if (!nm || isSample(nm) || isSample(r[0])) return; const biz = cellOf(r, map, 'bizno'), ec = cellOf(r, map, 'ecode');
          let m = findMerchant(ec, biz.replace(/\D/g, ''), nm); const isNew = !m; m = isNew ? create('merchants', {deleted: false}) : Object.assign({}, m);
          const set = (k, v) => { if (v) m[k] = v; };
          set('name', nm); if (biz) m.bizno = bizFmt(biz); set('ecode', ec); set('owner', cellOf(r, map, 'owner')); set('phone', cellOf(r, map, 'phone')); set('mobile', cellOf(r, map, 'mobile'));
          if (!m.phone && m.mobile) m.phone = m.mobile; set('addr', cellOf(r, map, 'addr')); set('van', cellOf(r, map, 'van')); set('cstart', dateCell(cellOf(r, map, 'cstart'))); set('cend', dateCell(cellOf(r, map, 'cend')));
          const g = gradeOf(cellOf(r, map, 'grade')); if (g >= 0) m.grade = g; else if (isNew) m.grade = 5;
          const memo = cellOf(r, map, 'memo'), bt = (cellOf(r, map, 'biztype') + ' ' + cellOf(r, map, 'bizitem')).trim();
          if (isNew) m.memo = ((memo ? memo + ' · ' : '') + (bt ? '업태/종목 ' + bt : '')).trim(); else if (memo) m.memo = memo;
          put('merchants', m);
          const lq = cellOf(r, map, 'lreq'), ls = cellOf(r, map, 'lres');
          if (lq || ls) { // 응대 기록 (이카운트 요청사항·처리완료)
            const ld = dateCell(cellOf(r, map, 'ldate')) || todayStr(); const k0 = logKind(cellOf(r, map, 'lkind').replace(/\s/g, '')), lk = KINDS.includes(k0) ? k0 : /용지/.test(lq) ? '용지신청' : '기타';
            if (list('mlogs').some(g => g.merchant === m.id && g.date === ld && logReq(g) === lq && logRes(g) === ls)) logSkip++;
            else { put('mlogs', create('mlogs', {merchant: m.id, mname: m.name, date: ld, kind: lk, req: lq, res: ls, text: lq + (ls ? (lq ? '\n' : '') + '→ 처리: ' + ls : ''), who: S.uid, src: '엑셀 가져오기'})); logAdd++; }
          }
        });
        render(); toast('가맹점 ' + add + '곳 등록, ' + upd + '곳 갱신' + (logAdd || logSkip ? ', 응대 기록 ' + logAdd + '건 추가' + (logSkip ? '(중복 ' + logSkip + '건 건너뜀)' : '') : '') + '했어요. 잘못되면 관리자 → 가맹점 보호·복원에서 되돌릴 수 있어요.');
      });
    };
  });
};

// ---------- 단체 문자 (휴대폰 문자 앱으로 한 곳씩 — 나중에 알리고 연동으로 PC·앱에서 바로 발송 예정) ----------
const mobileOf = m => { let d = (m.phone || '').replace(/\D/g, ''); if (d.startsWith('01') && d.length >= 10 && d.length <= 11) return d; d = (m.mobile || '').replace(/\D/g, ''); return d.startsWith('01') && d.length >= 10 && d.length <= 11 ? d : ''; };
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const smsBytes = t => [...t].reduce((s, c) => s + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
function viewSms() {
  S.smsSel = S.smsSel || new Set();
  if (S.smsQ) return viewSmsSend();
  const t = keepVal('sms', ''), by = smsBytes(t);
  return '<h1>단체 문자 보내기</h1><div class="sub">고른 가맹점에 한 곳씩 휴대폰의 문자 앱을 열어 드려요. 받는 분들끼리 번호가 보이지 않고, 문자 요금은 그 휴대폰 요금제로 나가요.' + (isWide() ? ' <b>PC에서는 문자 앱이 없어서 보낼 수 없어요 — 휴대폰(아이폰 웹앱·안드로이드 앱)에서 보내 주세요.</b> 알리고 연동 후에는 PC에서도 바로 보낼 수 있게 할게요.' : '') + '</div>' +
    '<label class="fl" for="f_sms">보낼 내용 ({상호} 는 가맹점 이름으로 바뀌어요)</label><textarea id="f_sms" data-keep="sms" placeholder="예: {상호} 사장님, 안녕하세요. 나인페이먼츠입니다.">' + esc(t) + '</textarea><div class="sub" id="smscnt">' + t.length + '자 · ' + by + '바이트' + (by > 90 ? ' (90바이트를 넘으면 장문 문자로 나가요)' : '') + '</div>' +
    '<h2>받는 가맹점</h2><div class="pills">' + GRADES.map((g, i) => g ? '<button class="pill" data-act="smsGrade" data-arg="' + i + '">' + gradeLabel(i) + '</button>' : '').join('') + '<button class="pill" data-act="smsAll">보이는 전체 선택</button><button class="pill" data-act="smsNone">선택 해제</button></div>' +
    '<input id="smsq" data-q="smsq" placeholder="🔍 상호·초성·번호" value="' + esc(S.smsq || '') + '"><div class="qres" data-for="smsq">' + smsList() + '</div>' +
    '<button class="btn gold full" data-act="smsStart">문자 보내기 시작 (' + S.smsSel.size + '곳)</button>';
}
function smsVisible() { return list('merchants').filter(m => kmatch(mHay(m), S.smsq || '')).sort((a, b) => (a.name || '').localeCompare(b.name || '')); }
function smsList() {
  const vs = smsVisible();
  return '<div class="sub" style="font-weight:700">선택 ' + S.smsSel.size + '곳 · 보이는 가맹점 ' + vs.length + '곳 (유선 번호만 있는 곳은 고를 수 없어요)</div>' + vs.slice(0, 300).map(m => { const mo = mobileOf(m);
    return '<label class="chk' + (mo ? '' : ' off') + '"><input type="checkbox" data-act="smsTog" data-arg="' + m.id + '"' + (S.smsSel.has(m.id) ? ' checked' : '') + (mo ? '' : ' disabled') + '><span class="grow">' + esc(m.name) + ' <small style="color:var(--gray)">' + esc(mo || '휴대폰 번호 없음') + (gradeLabel(m.grade) ? ' · ' + gradeLabel(m.grade) : '') + '</small></span></label>'; }).join('');
}
ACT.smsTog = (id, el) => { id = Number(id); if (el.checked) S.smsSel.add(id); else S.smsSel.delete(id); refreshSmsCount(); };
function refreshSmsCount() { const b = document.querySelector('[data-act=smsStart]'); if (b) b.textContent = '문자 보내기 시작 (' + S.smsSel.size + '곳)'; refreshResults(); }
ACT.smsGrade = g => { list('merchants').forEach(m => { if (Number(m.grade) === Number(g) && mobileOf(m)) S.smsSel.add(m.id); }); render(); };
ACT.smsAll = () => { smsVisible().forEach(m => { if (mobileOf(m)) S.smsSel.add(m.id); }); render(); };
ACT.smsNone = () => { S.smsSel.clear(); render(); };
ACT.smsStart = () => {
  const t = keepVal('sms', '').trim(); if (!t) return toast('보낼 내용을 적어 주세요.'); if (!S.smsSel.size) return toast('받을 가맹점을 골라 주세요.');
  S.smsQ = [...S.smsSel].filter(id => byId('merchants', id) && mobileOf(byId('merchants', id))); S.smsPos = 0; S.smsText = t; render();
};
function viewSmsSend() {
  if (S.smsPos >= S.smsQ.length) return '<h1>단체 문자</h1><div class="hero"><div>다 보냈어요</div><div class="n">' + S.smsQ.length + '곳</div><div style="font-size:13px">문자 앱의 보낸 기록에서 실제로 보내졌는지 확인해 주세요.</div></div><button class="btn full" data-act="smsStop">처음으로</button>';
  const m = byId('merchants', S.smsQ[S.smsPos]), num = mobileOf(m), body = S.smsText.replace(/\{상호\}/g, m.name || '');
  const href = 'sms:' + num + (isIOS() ? '&' : '?') + 'body=' + encodeURIComponent(body);
  return '<h1>단체 문자 (' + (S.smsPos + 1) + ' / ' + S.smsQ.length + ')</h1><div class="card flat"><div class="t1">' + esc(m.name) + '</div><div class="t2">' + esc(num) + '</div><div class="mtext" style="margin-top:8px">' + esc(body) + '</div></div>' +
    (isWide() ? '<div class="sub">PC에서는 문자 앱을 열 수 없어요. 휴대폰에서 이어서 보내 주세요. (알리고 연동 후 PC 바로 발송 예정)</div><button class="btn tint full" data-act="smsCopy">남은 번호 모두 복사</button>'
      : '<a class="btn gold full" style="display:block;text-align:center;text-decoration:none" href="' + esc(href) + '" data-act="smsNext">문자 앱 열기 → 보내고 돌아오면 다음 가맹점</a>') +
    '<div class="btns"><button class="btn" data-act="smsSkip">건너뛰기</button><button class="btn red" data-act="smsStop">중단</button></div>';
}
ACT.smsNext = () => { setTimeout(() => { S.smsPos++; render(); }, 600); };
ACT.smsSkip = () => { S.smsPos++; render(); };
ACT.smsStop = () => { S.smsQ = null; render(); };
ACT.smsCopy = () => { const nums = S.smsQ.slice(S.smsPos).map(id => mobileOf(byId('merchants', id))).join(', '); try { navigator.clipboard.writeText(nums); toast('번호를 복사했어요.'); } catch (e) { toast('복사하지 못했어요.'); } };

// ---------- 입금 확인 ----------
const DEP_KINDS = ['판매대금', '미납금', '정보변경수수료', '기타'];
function postToRoom(name, text) { // 이름이 맞는 채팅방에 알림 글을 올린다 (없으면 만든다) — 앱과 같다
  let r = list('rooms').find(x => x.name === name && !(x.mem && x.mem.length));
  if (!r) { r = create('rooms', {name, by: S.uid}); put('rooms', r); }
  put('msgs', create('msgs', {room: r.id, who: S.uid, text, ts: Date.now()}));
}
function viewDeposits() {
  const ls = list('deposits').sort((a, b) => (b.t || '').localeCompare(a.t || ''));
  const wait = ls.filter(d => !d.ok);
  return '<h1>입금 확인</h1><div class="sub">입금 내역을 올리면 ‘입금확인’ 채팅방에도 자동으로 알림이 올라가요. 오른쪽 아래 + 로 올립니다.</div>' +
    (wait.length ? '<div class="sub" style="font-weight:700;margin-top:10px">확인 전 ' + wait.length + '건 · ' + wonFmt(wait.reduce((s, d) => s + (d.amount || 0), 0)) + '</div>' : '') +
    (ls.length ? ls.map(d => '<div class="card" data-act="deposit" data-arg="' + d.id + '"><div class="t1" style="color:' + (d.ok ? 'var(--green)' : 'var(--ink)') + '">' + esc(d.kind) + '  ' + wonFmt(d.amount) + (d.ok ? '  ✔ 확인됨' : '  · 확인 전') + '</div>' +
      '<div class="t2" style="color:var(--ink)">' + esc((d.mname || '(가맹점 미지정)') + (d.memo ? ' · ' + d.memo : '')) + '</div><div class="t2">' + esc((d.t || '') + ' · 올린 사람 ' + uname(d.by) + (d.ok ? ' · 확인 ' + uname(d.okby) : '')) + '</div></div>').join('') : '<div class="empty">올라온 입금 내역이 없습니다.</div>');
}
ACT.deposit = id => {
  const d = byId('deposits', id); if (!d) return;
  const ln = (k, v) => '<div class="line"><b>' + k + '</b><div>' + esc(v || '-') + '</div></div>';
  modal('<h3>입금 내역</h3>' + ln('구분', d.kind) + ln('금액', wonFmt(d.amount)) + ln('가맹점', d.mname) + ln('메모', d.memo) + ln('올린 사람', uname(d.by) + ' · ' + (d.t || '')) + (d.ok ? ln('확인', uname(d.okby)) : '') +
    '<div class="btns" style="margin-top:12px">' + (d.ok ? '' : '<button class="btn gold" data-act="depositOk" data-arg="' + d.id + '">확인 처리</button>') + '<button class="btn" data-act="close">닫기</button></div>');
};
ACT.depositOk = id => {
  const d = byId('deposits', id); if (!d || d.ok) return;
  d.ok = true; d.okby = S.uid; put('deposits', d);
  postToRoom('입금확인', '✔ 입금 확인 완료 · ' + d.kind + ' ' + wonFmt(d.amount) + (d.mname ? ' · ' + d.mname : '') + ' (' + uname(S.uid) + ')');
  closeModal(); render(); toast('확인 처리했어요.');
};
ACT.newDeposit = () => {
  let mer = null;
  formModal('입금 올리기', '<label class="fl" for="f_k">구분</label><select id="f_k">' + DEP_KINDS.map(k => '<option>' + k + '</option>').join('') + '</select>' +
    '<label class="fl" for="f_a">금액 (원)</label><input id="f_a" inputmode="numeric" placeholder="숫자만 (예: 30000)">' + MP_HTML.replace('<div class="lb">가맹점</div>', '<div class="lb">가맹점 (어느 가맹점 입금인지, 선택)</div>') +
    '<label class="fl" for="f_m">메모 (기타일 때 내용, 입금자명 등)</label><input id="f_m" placeholder="메모">', () => {
    const a = numOf($('#f_a').value); if (a <= 0) return warn('금액을 입력해 주세요.');
    const k = $('#f_k').value, memo = $('#f_m').value.trim();
    put('deposits', create('deposits', {kind: k, amount: a, memo, merchant: mer ? mer.id : 0, mname: mer ? mer.name : '', by: S.uid, t: nowStr(), ok: false}));
    postToRoom('입금확인', '💰 입금 확인 요청 · ' + k + ' ' + wonFmt(a) + (mer ? ' · ' + mer.name : '') + (memo ? ' · ' + memo : '') + ' (' + uname(S.uid) + ')');
    render(); toast('올렸어요. ‘입금확인’ 채팅방에도 알렸습니다.'); return true;
  }, '올리기');
  wireMerchantPicker(m => { mer = m; });
};


// ---------- 백업 ----------
// 1) 서버: 삭제가 막혀 있고(지우면 표시만), 모든 변경은 변경 기록(audit)에 따로 남는다.
// 2) 바깥 자동 백업: GitHub Actions 가 매일 새벽 전체 자료를 암호화해 90일 보관 (.github/workflows/backup.yml).
// 3) 관리자 기기: 안드로이드 앱(폰 안 14일치)과 웹(이 PC 안 14일치)이 하루 한 번 저절로 보관 + 언제든 파일로 내려받기.
const BK_COLLS = ['users', 'tasks', 'notices', 'projects', 'contracts', 'events', 'merchants', 'stock', 'rooms', 'msgs', 'reports', 'profiles', 'costs', 'contacts', 'deposits', 'library', 'mlogs', 'config'];
async function buildBackup() {
  const out = {kind: 'nine-family-backup', at: nowStr(), by: S.uid, from: VERSION, skipped: []};
  for (const c of BK_COLLS) {
    if (S.data[c] && c !== 'msgs') { out[c] = [...S.data[c].values()]; continue; }
    if (DEMO) { out[c] = S.data[c] ? [...S.data[c].values()] : []; continue; }
    try { const snap = await fs.collection(c).get(); out[c] = snap.docs.map(d => { try { return JSON.parse(d.get('j')); } catch (e) { return null; } }).filter(Boolean); } catch (e) { out.skipped.push(c); }
  }
  return out;
}
const bkName = () => 'ninefamily_backup_' + nowStr().replace(/[-: ]/g, '').replace(/^(\d{8})(\d{4})$/, '$1_$2') + '.json';
function saveFile(name, text) { const u = URL.createObjectURL(new Blob([text], {type: 'application/json'})); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
ACT.backupDownload = async () => {
  if (!can('staff_manage')) return toast('관리자만 내려받을 수 있어요.');
  toast('백업 파일을 만드는 중…');
  try {
    const b = await buildBackup(); saveFile(bkName(), JSON.stringify(b, null, 1));
    toast('내려받았어요. 가맹점 ' + (b.merchants || []).length + '곳 · 업무 ' + (b.tasks || []).length + '건' + (b.skipped.length ? ' (권한 밖이라 뺀 것: ' + b.skipped.join(', ') + ')' : ''));
  } catch (e) { toast('백업 파일을 만들지 못했어요.'); }
};
// 이 PC 안(IndexedDB)에 하루 한 번 저절로 보관 — 관리자가 웹을 열면 실행, 14일치만 남긴다
function idb() { return new Promise((ok, no) => { const r = indexedDB.open('nine-backup', 1); r.onupgradeneeded = () => r.result.createObjectStore('bk'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); }); }
async function idbDo(mode, fn) { const d = await idb(); return new Promise((ok, no) => { const t = d.transaction('bk', mode); const st = t.objectStore('bk'); const r = fn(st); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); }); }
async function autoBackup() {
  try {
    if (DEMO || !can('staff_manage') || !window.indexedDB) return;
    const n = list('merchants').length; if (!n || !list('users').length) return; // 아직 다 못 받은 빈 상태는 저장하지 않는다
    const day = todayStr().replace(/-/g, ''); const prev = Number(LS('bkcnt_' + day) || -1), last = Number(LS('bkt_' + day) || 0);
    if (prev > n || (prev === n && Date.now() - last < 3 * 3600 * 1000)) return; // 오늘 더 많은 자료로 저장했으면 덮지 않는다
    const b = await buildBackup(); await idbDo('readwrite', st => st.put(JSON.stringify(b), day));
    LS('bkcnt_' + day, String(n)); LS('bkt_' + day, String(Date.now()));
    const keys = await idbDo('readonly', st => st.getAllKeys()); const old = (keys || []).filter(k => !String(k).startsWith('snap_')).sort().slice(0, -14); if (old.length) await idbDo('readwrite', st => old.forEach(k => st.delete(k)));
  } catch (e) {}
}
ACT.pcBackups = async () => {
  if (!can('staff_manage')) return;
  let keys = []; try { keys = (await idbDo('readonly', st => st.getAllKeys())) || []; } catch (e) {}
  modal('<h3>이 PC에 보관된 자동 백업</h3><div class="sub">관리자가 웹앱을 열면 하루 한 번 이 PC 안에 저절로 보관돼요(14일치). 눌러서 파일로 내려받아요.</div>' +
    (keys.length ? keys.sort().reverse().map(k => '<button class="mi" data-act="pcBackupGet" data-arg="' + k + '"><span>' + (String(k).startsWith('snap_') ? '되돌리기 기준점 · ' + String(k).slice(5).replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})_/, '$1-$2-$3 $4:$5 · ') : '자동 백업 · ' + k.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')) + '</span><em>내려받기 ›</em></button>').join('') : '<div class="empty">아직 보관된 백업이 없어요.</div>') +
    '<button class="btn full" data-act="close">닫기</button>');
};
ACT.pcBackupGet = async k => { try { const t = await idbDo('readonly', st => st.get(k)); if (t) saveFile('ninefamily_autobackup_' + k + '.json', t); } catch (e) { toast('꺼내지 못했어요.'); } };

// ---------- 공지 ----------
function viewNotices() {
  const ns = list('notices').sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.t || '').localeCompare(a.t || ''));
  return '<h1>공지사항</h1>' + (can('notice_write') ? '' : '<div class="sub">공지 작성은 권한이 있는 사람만 할 수 있어요.</div>') + (ns.length ? ns.map(n => '<div class="card" data-act="notice" data-arg="' + n.id + '"><div class="t1">' + (n.pinned ? '📌 ' : '') + esc(n.title) + (!(n.readBy || []).includes(S.uid) ? ' <span class="badge">새 글</span>' : '') + '</div><div class="t2">' + esc(uname(n.author) + ' · ' + (n.t || '')) + '</div></div>').join('') : '<div class="empty">공지가 없습니다.</div>');
}
ACT.notice = id => {
  const n = byId('notices', id); if (!n) return;
  if (!(n.readBy = n.readBy || []).includes(S.uid)) { n.readBy.push(S.uid); put('notices', n); render(); }
  modal('<h3>' + esc(n.title) + '</h3><div class="sub">' + esc(uname(n.author) + ' · ' + (n.t || '')) + '</div><div style="white-space:pre-wrap;margin:12px 0">' + esc(n.body) + '</div>' +
    (can('notice_write') || can('staff_manage') ? '<div class="sub">읽은 사람 ' + (n.readBy || []).length + '명: ' + esc((n.readBy || []).map(uname).join(', ')) + '</div>' : '') + '<button class="btn full" data-act="close">닫기</button>');
};
ACT.newNotice = () => formModal('공지 작성', '<label class="fl" for="f_t1">제목 (필수)</label><input id="f_t1" placeholder="제목"><label class="fl" for="f_m">내용</label><textarea id="f_m" placeholder="내용"></textarea><label class="chk"><input type="checkbox" id="f_pin"><span>맨 위에 고정</span></label>', () => {
  const t = $('#f_t1').value.trim(); if (!t) return warn('제목을 입력해 주세요.');
  put('notices', create('notices', {title: t, body: $('#f_m').value.trim(), pinned: $('#f_pin').checked, author: S.uid, t: nowStr(), readBy: [S.uid]})); render(); toast('공지를 올렸어요.'); return true;
}, '올리기');

// ---------- 전체 ----------
// 항목과 순서는 안드로이드 앱의 '전체' 탭과 같다. go 가 없는 항목은 아직 앱에서만 되는 기능이다.
const MENU_SECS = ['내 계정·설정', '업무', '채팅', '가맹점', '계약', '재고', '실적', '보고', '회사', '관리자'];
function menuItems() {
  // 묶음(앱과 같은 순서): 내 계정·설정 · 업무 · 가맹점 · 계약 · 재고 · 실적 · 보고 · 회사 · 관리자 — 권한이 없는 메뉴는 아예 안 보인다
  const P = can('perf_view') || can('staff_manage'), R = canReport() || can('report_view'), A = can('staff_manage');
  const nu = unreadNotices(), lk = lockDoc(); const it = [];
  const add = (sec, label, words, go, badge) => it.push({sec, label, words, go, badge});
  add('바로가기', '업무', '업무 요청 할일 설치 AS 서류', 'nav:task:'); add('바로가기', '프로젝트', '프로젝트 진행률', 'nav:project:');
  add('바로가기', '채팅', '채팅 대화 메시지 방', 'nav:chat:'); add('바로가기', '일정 (달력)', '일정 달력 캘린더 방문 약속', 'nav:calendar:');
  add('업무', '업무 요청하기', '업무 요청 새 업무 올리기', 'act:newTask');
  add('업무', '지난 업무 기록', '지난 업무 기록 이력 완료 검색', 'nav:all:history');
  add('업무', '물품요청 (본사 ← 지사)', '물품요청 구매 발주 주문 본사 지사 용지 장비 요청', 'nav:all:preqs', preqWaiting().length ? '입고 확인 ' + preqWaiting().length : '');
  add('가맹점', '가맹점', '가맹점 거래처 상호 사업자 삭제 계약 만료', 'nav:all:merchants');
  add('가맹점', '응대 기록 조회', '응대 기록 AS 전화 응대 방문 메모 이력 날짜 가맹점', 'nav:all:logs');
  add('가맹점', '단체 문자 보내기', '단체 문자 sms 발송 가맹점 문자 안내', 'nav:all:sms');
  add('가맹점', '가맹점 일괄 가져오기 (엑셀·이카운트)', '가맹점 일괄 가져오기 업로드 엑셀 csv 이카운트', 'act:importM');
  const ex = expiringContracts().length;
  add('계약', '신규 계약 올리기', '신규 계약 올리기 CMS 판매 렌탈', 'act:newContract');
  add('계약', '계약 관리 (설치 완료·만료 알림)', '계약 설치 완료 만료 알림 장비', 'nav:all:contracts', ex ? '만료 ' + ex : '');
  add('계약', '입금 확인', '입금 확인 입금 내역 미납금 판매대금 정보변경수수료', 'nav:all:deposit');
  add('재고', '재고 (입고·출고·정정)', '재고 장비 바코드 시리얼 단가 입고 출고 수량 정정 스캔 본사 광주지사 보관지', 'nav:all:stock');
  add('재고', '재고 이력', '재고 이력 입고 출고 정정 이동 실사 조사 반품 불량', 'nav:all:stocklog');
  add('재고', '상품 목록 (상품코드)', '상품 목록 상품코드 품목 코드 등록 물품요청 재고', 'nav:all:products');
  if (prodAdmin()) add('재고', '재고 일괄 등록 (엑셀 양식)', '재고 일괄 등록 엑셀 업로드 양식 옮기기 설치 가맹점', 'act:importStock');
  add('재고', '물품요청 (본사 ← 지사)', '물품요청 구매 발주 주문 본사 지사 용지 장비 요청', 'nav:all:preqs', preqWaiting().length ? '입고 확인 ' + preqWaiting().length : '');
  add('실적', '내 실적', '내 실적 월별 성장률 계약', 'nav:all:myperf');
  if (P) { add('실적', '전체 실적·직원별 순위', '전체 실적 직원별 순위 성장률', 'nav:all:perf'); add('실적', '수익 현황 (입고·출고 단가)', '수익 현황 입고 출고 단가 매출 매입', 'nav:all:profit'); }
  add('보고', '일일보고 쓰기', '일일보고 보고 오늘 한 일', 'nav:all:daily');
  if (P) add('보고', '실적 보고서 올리기 (대표님께)', '실적 보고서 올리기 대표님 본부장', 'nav:all:perfreport');
  if (R) { add('보고', '일일보고 종합 보기', '일일보고 종합 대표님 직원별', 'nav:all:reportview'); if (!P) add('보고', '실적 보고서 보기', '실적 보고서 보기 대표님', 'nav:all:perfreport'); }
  add('회사', '공지사항', '공지사항 공지 알림', 'nav:all:notice', nu ? String(nu) : '');
  add('회사', '자료실', '자료실 게시판 양식 서식 계약서 파일 문서', 'nav:all:library'); add('회사', '비상연락망 (눌러서 전화)', '비상연락망 연락처 전화 번호', 'nav:all:contacts');
  if (canStaffInfo()) add('회사', '직원 정보 (명부)', '직원 정보 명부 부서 직책 생년월일 연락처 주소 사진', 'nav:all:staffinfo');
  add('내 계정·설정', '내 프로필 (사진·상태 메시지)', '프로필 사진 상태 메시지 내 정보', 'act:myProfile');
  const np = 'Notification' in window ? Notification.permission : 'none';
  add('업무', '업무 알림 및 소리 설정', '업무 알림 소리 음성 진동 끄기 켜기 업무 배정 푸시 들어 보기 물품요청 공지', 'nav:all:sound', !pushTaskOn() ? '알림 끔' : soundOn() ? '' : '소리 끔');
  add('채팅', '채팅 알림 및 소리 설정', '채팅 알림 소리 나인톡 카톡 끄기 켜기 푸시 들어 보기 음소거', 'nav:all:soundchat', !pushChatOn() ? '알림 끔' : chatSndOn() ? '' : '소리 끔');
  add('내 계정·설정', '업데이트 확인 (새 버전 받기)', '업데이트 확인 새 버전 새로고침 최신', 'act:checkUpdate');
  add('내 계정·설정', '사용설명서', '사용설명서 매뉴얼 도움말 사용법 설치', 'nav:all:manual'); add('내 계정·설정', '버전·업데이트 내역', '버전 업데이트 내역 변경 이력', 'nav:all:about');
  if (!/Electron/.test(navigator.userAgent)) add('내 계정·설정', 'PC 프로그램 설치 파일 받기 (윈도우)', 'PC 설치 파일 다운로드 윈도우 exe 프로그램', 'act:pcSetup');
  add('내 계정·설정', '로그아웃', '로그아웃 나가기', 'act:logout');
  if (A) {
    add('관리자', '직원과 권한', '직원 권한 등록 사용 중지 관리자', 'nav:all:staff');
    add('관리자', '직책 목록 (정렬 순서)', '직책 목록 대표 이사 본부장 지사장 부장 차장 과장 대리 사원 정렬', 'act:posEdit');
    add('관리자', '업무 요청 빠른 선택 버튼', '빠른 선택 버튼 용지신청 요청사항 추가 관리', 'act:reqQuickEdit');
    add('관리자', '데이터 백업 내려받기', '데이터 백업 내려받기 저장 내보내기 json', 'act:backupDownload'); add('관리자', 'PC에 보관된 자동 백업', '자동 백업 보관 PC 복원', 'act:pcBackups'); add('관리자', '가맹점 보호·복원', '가맹점 보호 복원 되돌리기 삭제 복구 휴지통', 'act:safety');
    add('관리자', '가맹점 수정 암호', '가맹점 수정 암호 잠금 비밀번호 설정 변경', 'act:mlockSet', lk ? '설정됨' : '아직 없음');
    if (lk) add('관리자', '가맹점 수정 암호 끄기', '가맹점 수정 암호 끄기 잠금 해제', 'act:mlockOff');
    add('관리자', '삭제 비밀번호 (중요한 삭제)', '삭제 비밀번호 암호 직원 삭제 가맹점 재고 응대 기록 자료실', 'act:dlockSet', dlockDoc() ? '설정됨' : '아직 없음');
  }
  return it;
}
function menuRow(e) {
  const g = (e.go || '').split(':');
  const attr = g[0] === 'nav' ? 'data-nav="' + g[1] + '" data-sub="' + g[2] + '"' : g[0] === 'act' ? 'data-act="' + g[1] + '"' : 'data-act="appOnly" data-arg="' + esc(e.label) + '"';
  const badge = e.badge ? (/^\d+$/.test(e.badge) ? '<b class="badge">' + e.badge + '</b>' : '<i>' + esc(e.badge) + '</i>') : '';
  return '<button class="mi' + (e.go ? '' : ' off') + '" ' + attr + '><span>' + esc(e.label) + '</span>' + badge + (e.go ? '' : '<i class="app">앱에서</i>') + '<em>›</em></button>';
}
function viewMenu(wide) {
  const q = (S.allQ || '').trim(); const items = menuItems();
  const secs = (q ? ['바로가기'] : []).concat(MENU_SECS);
  const html = secs.map(sec => {
    const rows = items.filter(e => e.sec === sec && (e.go || q) && kmatch(e.label + ' ' + e.words, q));
    if (sec === '내 계정·설정' && !q) rows.push({label: '앱으로 설치하기', go: 'act:installApp'});
    return rows.length ? '<div class="msec"><h2>' + sec + '</h2>' + rows.map(e => e.label === '앱으로 설치하기' ? '<button class="mi inst" data-act="installApp" style="display:none"><span>' + (wide ? 'PC에 설치하기' : '앱으로 설치하기') + '</span><em>›</em></button>' : menuRow(e)).join('') + '</div>' : '';
  }).join('');
  const appOnly = q ? [] : items.filter(e => !e.go);
  const appSec = appOnly.length ? '<details class="msec appsec"><summary>아직 안드로이드 앱에서만 되는 기능 (' + appOnly.length + '개)</summary>' + appOnly.map(menuRow).join('') + '</details>' : '';
  const search = '<input id="aq" data-q="allQ" placeholder="🔍  기능 검색 (예: 재고, ㅈㄱ, 문자, 수익)" value="' + esc(S.allQ || '') + '">';
  const note = (wide ? '' : appSec) + '<div class="sub" style="margin-top:18px">‘앱에서’ 표시가 있는 기능은 아직 안드로이드 앱에서만 쓸 수 있어요. 웹에도 차례로 넣고 있어요.</div><div class="sub" style="text-align:center;margin:14px 0 30px">나인패밀리 ' + VERSION + '</div>';
  if (wide) return '<div class="mhead2"><h1>전체 메뉴</h1>' + search + '</div><div class="qres mgrid" data-for="allQ">' + (html || '<div class="empty">찾는 기능이 없어요.</div>') + '</div>' + appSec + note;
  return '<h1>전체</h1><div class="card row prof" data-act="myProfile">' + avatarHTML(S.uid, 48) + '<div class="grow"><div class="t1">' + esc(S.me.name) + '</div><div class="t2">' + (can('staff_manage') ? '관리자' : '직원') + '</div><div class="t2" style="font-size:11px">눌러서 프로필 사진·상태 메시지 바꾸기</div></div></div>' +
    search + '<div class="qres" data-for="allQ">' + (html || '<div class="empty">찾는 기능이 없어요.</div>') + '</div>' + note;
}
const PC_SETUP = 'https://github.com/ninepayments/Work-app/releases/latest/download/NineFamily-Setup.exe';
ACT.pcSetup = () => askConfirm('PC 프로그램 설치 파일 받기', '윈도우 PC용 나인패밀리 설치 파일(.exe)을 받아요. 받은 파일을 실행하면 바탕화면과 시작 메뉴에 ‘나인패밀리’가 생겨요.\n처음 실행할 때 ‘Windows의 PC 보호’ 창이 뜨면 ‘추가 정보’ → ‘실행’을 눌러 주세요.\n화면과 기능은 웹앱과 같고, 웹이 바뀌면 다시 설치하지 않아도 바로 바뀌어요.', '받기', () => { location.href = PC_SETUP; });
ACT.appOnly = lb => toast('‘' + lb + '’은(는) 아직 안드로이드 앱에서만 쓸 수 있어요. 웹에도 차례로 넣고 있어요.');
ACT.back = () => { if (S.sub) S.sub = ''; else S.tab = 'task'; render(); }; // 한 단계 뒤로: 하위 화면 → 그 탭 → 첫 화면(업무)
ACT.menu = () => { S.menu = !S.menu; render(); };
ACT.home = () => { S.tab = 'task'; S.sub = ''; S.room = 0; S.menu = false; render(); };
ACT.logout = () => askConfirm('로그아웃할까요?', '', '로그아웃', logout);

// ---------- PC 왼쪽 칸 (채팅처럼 넓은 화면의 왼쪽 여백을 쓰는 곁가지 목록) ----------
function recentMerchants() { try { return JSON.parse(localStorage.getItem('nf_recentM') || '[]'); } catch (e) { return []; } }
function rememberMerchant(id) { try { const r = recentMerchants().filter(x => x !== id); r.unshift(id); localStorage.setItem('nf_recentM', JSON.stringify(r.slice(0, 12))); } catch (e) {} }
const sideTask = t => '<div class="sl" data-act="task" data-arg="' + t.id + '"><b>' + esc(t.title) + '</b><small>' + esc([t.client, t.assignee !== S.uid ? uname(t.assignee) : '', t.due ? t.due.slice(5) : ''].filter(Boolean).join(' · ')) + '</small>' + (t.status !== '완료' ? '<i class="st">' + esc(ST[t.status] || t.status) + '</i>' : '') + '</div>';
const sideSec = (title, body, empty) => '<div class="ssec"><h3>' + title + '</h3>' + (body || '<div class="sub" style="margin:4px 0 0">' + empty + '</div>') + '</div>';
function sideHTML(k) {
  const today = todayStr(), open = list('tasks').filter(t => t.status !== '완료');
  const mine = open.filter(t => t.assignee === S.uid).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const late = open.filter(t => t.due && t.due.slice(0, 10) < today && (t.assignee === S.uid || can('task_view_all'))).sort((a, b) => a.due.localeCompare(b.due));
  const mnames = new Set(list('merchants').map(m => (m.name || '').trim())); const merTasks = open.filter(t => t.merchant || t.req || mnames.has((t.client || '').trim())).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
  const recentLogs = list('mlogs').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.created || '').localeCompare(a.created || '')).slice(0, 12)
    .map(g => '<div class="sl" data-act="merchant" data-arg="' + g.merchant + '"><b>' + esc(g.mname || (byId('merchants', g.merchant) || {}).name || '') + '</b><small>' + esc((g.date || '').slice(5) + ' · ' + logKind(g.kind) + ' · ' + (logReq(g) || logRes(g) || '').slice(0, 30)) + '</small></div>').join('');
  const recentM = recentMerchants().map(id => byId('merchants', id)).filter(m => m && !m.deleted).slice(0, 10)
    .map(m => '<div class="sl" data-act="merchant" data-arg="' + m.id + '"><b>' + esc(m.name) + '</b><small>' + esc(m.bizno || mNums(m).phone || mNums(m).mobile || '') + '</small></div>').join('');
  if (k === 'task') return '<h1>내 할 일</h1><button class="btn gold full" data-act="newTask">+ 업무 요청</button>' +
    (late.length ? sideSec('⏰ 기한 지난 업무 (' + late.length + ')', late.slice(0, 10).map(sideTask).join('')) : '') +
    sideSec('내가 맡은 업무 (' + mine.length + ')', mine.slice(0, 30).map(sideTask).join(''), '맡은 업무가 없어요.') +
    sideSec('최근 완료', list('tasks').filter(t => t.status === '완료' && (t.assignee === S.uid || can('task_view_all'))).sort((a, b) => (b.doneAt || '').localeCompare(a.doneAt || '')).slice(0, 5).map(sideTask).join(''), '아직 없어요.');
  if (k === 'project') {
    const ps = list('projects').sort((a, b) => pctOf(a) - pctOf(b) || (b.created || '').localeCompare(a.created || ''));
    return '<h1>프로젝트</h1><button class="btn gold full" data-act="newProject">+ 새 프로젝트</button>' +
      sideSec('진행 중 (' + ps.filter(p => pctOf(p) < 100).length + ')', ps.filter(p => pctOf(p) < 100).map(p => '<div class="sl" data-act="project" data-arg="' + p.id + '"><b>' + esc(p.title) + '</b><small>' + esc(uname(p.owner) + (p.due ? ' · 마감 ' + p.due : '')) + '</small>' + pbar(pctOf(p)) + '</div>').join(''), '진행 중인 프로젝트가 없어요.') +
      sideSec('내 업무', mine.slice(0, 10).map(sideTask).join(''), '맡은 업무가 없어요.');
  }
  if (k === 'calendar') {
    const wk = []; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() + i); wk.push(d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())); }
    const dayRows = d => list('events').filter(e => e.date === d).map(e => '<div class="sl" data-act="event" data-arg="' + e.id + '"><b>' + esc((e.time ? e.time + ' ' : '') + e.title) + '</b>' + (e.place ? '<small>' + esc(e.place) + '</small>' : '') + '</div>').join('') +
      open.filter(t => (t.due || '').startsWith(d) && (t.assignee === S.uid || can('task_view_all'))).map(sideTask).join('');
    return '<h1>이번 주</h1>' + (can('staff_manage') ? '<button class="btn gold full" data-act="newEvent">+ 일정 추가</button>' : '') +
      wk.map((d, i) => { const r = dayRows(d); const w = '일월화수목금토'[new Date(d + 'T00:00:00').getDay()]; return r || i === 0 ? sideSec((i === 0 ? '오늘 · ' : '') + Number(d.slice(5, 7)) + '/' + Number(d.slice(8)) + ' (' + w + ')', r, '일정 없음') : ''; }).join('') +
      (late.length ? sideSec('⏰ 기한 지난 업무 (' + late.length + ')', late.slice(0, 10).map(sideTask).join('')) : '');
  }
  if (k === 'merchants' || k === 'logs') return '<h1>' + (k === 'logs' ? '응대 바로가기' : '가맹점 바로가기') + '</h1>' +
    sideSec('📋 가맹점 업무 진행 중 (' + merTasks.length + ')', merTasks.slice(0, 12).map(t => sideTask(t) .replace('</small>', '</small>' + (t.req ? '<small>요청: ' + esc(t.req.slice(0, 40)) + '</small>' : ''))).join(''), '진행 중인 가맹점 업무가 없어요.') +
    sideSec('최근 연 가맹점 (이 기기)', recentM, '가맹점을 열면 여기에 쌓여요.') +
    (k === 'merchants' ? sideSec('최근 응대 기록', recentLogs, '응대 기록이 없어요.') : '');
  // 그 밖의 화면(☰ 메뉴에서 연 것): 같은 묶음의 메뉴를 왼쪽에 두고 바로 옮겨 다닌다
  const items = menuItems().filter(e => e.go && e.go.startsWith('nav:all:'));
  const cur = items.find(e => e.go === 'nav:all:' + k); const sec = cur ? cur.sec : '업무';
  return '<h1>' + esc(sec) + '</h1>' + items.filter(e => e.sec === sec).map(e => menuRow(e).replace('class="mi', 'class="mi' + (e === cur ? ' on' : ''))).join('');
}

// ---------- PC 홈 (오늘 현황) ----------
function viewHome() {
  const today = todayStr(); const mine = list('tasks').filter(t => t.assignee === S.uid && t.status !== '완료');
  const evs = list('events').filter(e => e.date === today).map(e => ({time: e.time || '', t: e.title, sub: e.place || ''}))
    .concat(list('tasks').filter(t => t.status !== '완료' && (t.due || '').startsWith(today) && (t.assignee === S.uid || can('task_view_all'))).map(t => ({time: (t.due || '').slice(11, 16), t: t.title, sub: '업무 · ' + uname(t.assignee), id: t.id})))
    .sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  const d = new Date(); const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const monStr = mon.getFullYear() + '-' + pad(mon.getMonth() + 1) + '-' + pad(mon.getDate());
  const tile = (lb, n, nav) => '<button class="kpi" ' + nav + '><span>' + lb + '</span><b>' + n + '</b></button>';
  const ns = list('notices').sort((a, b) => ((a.readBy || []).includes(S.uid) ? 1 : 0) - ((b.readBy || []).includes(S.uid) ? 1 : 0) || (b.t || '').localeCompare(a.t || '')).slice(0, 4);
  return '<div class="row" style="margin-top:22px;align-items:baseline"><h1 style="margin:0">오늘 현황</h1><span class="sub">' + d.toLocaleDateString('ko-KR', {month: 'long', day: 'numeric', weekday: 'long'}) + '</span></div>' +
    '<div class="kpis">' + tile('새 업무', newTaskCount(), 'data-act="tfilter" data-arg="1"') + tile('진행 중', mine.filter(t => t.status === '진행중' || t.status === '확인함').length, 'data-act="tfilter" data-arg="2"') +
    tile('오늘 일정', evs.length, 'data-nav="calendar" data-sub=""') + tile('안 읽은 채팅', unreadTotal(), 'data-nav="chat" data-sub=""') + tile('이번 주 응대 기록', list('mlogs').filter(g => (g.date || '') >= monStr).length, 'data-nav="all" data-sub="logs"') + '</div>' +
    '<div class="homecols"><section class="panel big"><h2>업무</h2>' + viewTasks(true) + '</section><div class="side">' +
    '<section class="panel"><h2>오늘 일정</h2>' + (evs.length ? evs.map(o => '<div class="evl"' + (o.id ? ' data-act="task" data-arg="' + o.id + '"' : '') + '><b>' + esc(o.time || '종일') + '</b><span>' + esc(o.t) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '') + '</span></div>').join('') : '<div class="empty" style="padding:16px 0">오늘은 일정이 없어요.</div>') + '</section>' +
    '<section class="panel"><h2>공지</h2>' + (ns.length ? ns.map(n => '<div class="evl" data-act="notice" data-arg="' + n.id + '"><span>' + (!(n.readBy || []).includes(S.uid) ? '<i class="new">새 글</i> ' : '') + esc(n.title) + '</span></div>').join('') : '<div class="empty" style="padding:16px 0">공지가 없어요.</div>') + '</section></div></div>';
}

// ---------- 사용설명서 · 버전 내역 (웹) ----------
const WEB_CHANGES = [
  ['웹 0.0.60', '2026-10-26', ['채팅을 보낼 때 위쪽에 ‘서버에 저장 중’이 잠깐씩 깜빡이던 것: 저장이 10초 넘게 안 될 때만 보이게 (인터넷 끊김은 바로 표시)']],
  ['웹 0.0.58', '2026-10-26', ['홈페이지 서류접수·상담신청을 앱 ‘서류접수’·‘상담신청’ 채팅방으로 받을 준비(글쓴이 ‘📮 홈페이지 접수’, 사진 함께)']],
  ['웹 0.0.57', '2026-10-26', ['PC 오른쪽 채팅창에서 스크린샷 붙여넣기(Ctrl+V)·파일 끌어 놓기가 안 되던 것 고침']],
  ['웹 0.0.56', '2026-10-26', ['대화방에서 위쪽(안 읽은 글 등)을 읽는 중에 새 글이 오면 아래에 ‘새 메시지 ↓’ 버튼 — 누르면 맨 아래로. 맨 아래를 보고 있으면 새 글을 따라 내려가요']],
  ['웹 0.0.55', '2026-10-26', ['PC 오른쪽 채팅창: 글 쓰는 칸을 한 줄 전체로 넓게(여러 줄 보임), + ☺ 보내기는 그 아래 줄로']],
  ['웹 0.0.54', '2026-10-26', ['PC 프로그램(0.0.9): 위쪽 검은 줄 어디든(메뉴 버튼 위라도) 잡고 끌면 창이 옮겨져요(다른 모니터로도). 전체 모드에서 끌면 작은 창이 되어 따라와요. 빈 곳을 두 번 누르면 전체 ↔ 작은 창']],
  ['웹 0.0.53', '2026-10-26', ['PC 프로그램 창 줄이기 때 위쪽 검은 줄(메뉴 사이 빈 곳·이름 쪽)을 끌어 다른 모니터로 옮길 수 있게 — 옮긴 뒤 ⋮ → 크게보기를 누르면 그 모니터에서 전체 모드']],
  ['웹 0.0.52', '2026-10-26', ['PC 오른쪽 채팅창을 텔레그램 PC처럼: 처음엔 대화방 목록, 방에 들어가면 왼쪽 세로줄(대화방들)·오른쪽 대화. PC 위쪽 ‘채팅’ 메뉴는 없애고 ‘💬 채팅창’ 버튼으로', '⋮ 메뉴의 창 줄이기 아이콘을 화살표가 마주보는 모양으로']],
  ['웹 0.0.51', '2026-10-26', ['전체 메뉴에 ‘채팅’ 묶음: 채팅 알림 및 소리 설정 / 업무 묶음: 업무 알림 및 소리 설정 (따로 분리)', '가맹점 찾기: 대표자명·전화번호·핸드폰번호(하이픈 없이도)로도 찾아요', 'PC(넓은 화면): 위쪽 ‘💬 채팅창’ 버튼으로 오른쪽에 채팅창을 열고 닫아요(텔레그램 데스크톱처럼) — 처음엔 대화방 목록, 방에 들어가면 왼쪽 세로줄에 대화방들·오른쪽에 대화(세로줄을 누르면 그 방으로). 위쪽 ‘채팅’ 메뉴는 없앴어요', 'PC 프로그램(0.0.8): ‘지금 업데이트’를 누르면 설치 파일을 받아 설치 창이 자동으로 열려요. 자동으로 못 받으면 ‘설치 파일 직접 받기’ 버튼']],
  ['웹 0.0.50', '2026-10-26', ['PC 프로그램 새 버전 안내가 이미 최신을 설치했는데도 뜨던 것 고침(설치된 버전을 확실히 읽어요)']],
  ['웹 0.0.49', '2026-10-26', ['업데이트는 위쪽 ‘새 버전 · 지금 업데이트’ 한 곳에서: 가벼운 업데이트는 새로고침, PC 프로그램 재설치가 필요하면 같은 버튼이 알아서 받아 덮어 설치하고 다시 켜요(PC 0.0.6부터)']],
  ['웹 0.0.48', '2026-10-26', ['PC 프로그램이 옛 버전이면 위쪽에 ‘PC 프로그램 새 버전’ 안내(눌러서 설치 파일 받기)', 'PC 프로그램(0.0.5): ⋮ → 창 최소화를 누르면 화면 구석에 바로가기 아이콘(위젯) — 끌어서 옮기고, 더블클릭하면 다시 열려요. 안 읽은 개수는 빨간 숫자']],
  ['웹 0.0.47', '2026-10-26', ['PC 프로그램(0.0.4): 윈도우 제목줄 없이 전체 모드로 실행, 창 조작은 오른쪽 위 ⋮ 메뉴로. 창 줄이기 때는 위쪽 검은 줄을 끌어 옮겨요']],
  ['웹 0.0.46', '2026-10-26', ['알림 및 소리 설정에 ‘업무 알림 받기’·‘채팅 알림 받기’ 켜기·끄기', '채팅 알림은 방마다 1개만(새 글이 오면 그 방 알림이 바뀌어요)', '대화방을 열면 안 읽은 첫 글부터 보여요(‘여기까지 읽었어요’ 줄), 위로 올려 읽는 중에는 새 글이 와도 아래로 끌려가지 않아요']],
  ['웹 0.0.45', '2026-10-26', ['안 읽은 채팅 알림띠: 다른 화면에서도 위쪽에 읽을 때까지 떠 있고, 누르면 그 채팅방으로', '가맹점 등록·수정의 주소 칸: 인터넷 주소 검색처럼 찾아서 고르기(도로명·지번·건물명), 상세 주소는 이어 적기', 'PC 프로그램(0.0.3): 오른쪽 위 ⋮ 메뉴(새로고침·다시시작·종료·창 최소화·창 줄이기·크게보기), X 를 누르면 트레이로 숨어 계속 실행']],
  ['웹 0.0.44', '2026-10-26', ['일일보고의 (자동 집계)는 쓰는 사람 화면에만 보여요. 대표님께 가는 보고(종합 보기)에는 직접 쓴 내용만 보여요']],
  ['웹 0.0.43', '2026-10-26', ['첫 화면(업무)에서 뒤로가기를 누르면 ‘종료할까요?’ 확인 창']],
  ['웹 0.0.42', '2026-10-26', ['휴대폰 화면 왼쪽 위 ‹ 뒤로 버튼: 하위 화면과 업무 외 탭에서 보이고, 아래로 내려도 위에 붙어 있어요. 누르면 한 단계씩 뒤로(하위 화면 → 전체 메뉴 → 업무)']],
  ['웹 0.0.41', '2026-10-26', ['가맹점 업로드 양식에 응대 기록 열(응대일자·응대종류·요청사항·처리결과): 이카운트의 요청사항·처리완료를 가맹점 응대 기록으로 한꺼번에 올려요. 한 가맹점 여러 건은 줄을 여러 개, 같은 날 같은 내용은 두 번 안 올라가요']],
  ['웹 0.0.40', '2026-10-26', ['업무 종류: AS 를 방문AS · 원격AS 로 나눔 (완료하면 응대 기록 종류도 방문A/S · 원격A/S 로)', '가맹점 요청사항 빠른 버튼: 누르면 뒤에 쉼표가 자동으로 붙고 커서가 끝으로 가서 바로 이어 쓸 수 있어요']],
  ['웹 0.0.39', '2026-10-26', ['채팅에 스크린샷 붙여넣기: 대화방에서 Ctrl+V 하면 사진을 미리 보여 주고 보내요. 파일을 대화방에 끌어다 놓아도 돼요']],
  ['웹 0.0.38', '2026-10-26', ['채팅 줄바꿈: PC는 Shift+Enter 로 줄을 바꾸고 Enter 로 보내요. 휴대폰은 Enter 가 줄바꿈, 보내기 버튼으로 보내요. 입력칸은 여러 줄이면 늘어나요']],
  ['웹 0.0.37', '2026-10-26', ['채팅 순서: 서버가 받은 순서대로 보여요 (폰·PC 시계가 조금 달라도 나중에 쓴 글이 아래로). 이번 버전부터 보내는 메시지에 적용돼요']],
  ['웹 0.0.36', '2026-10-26', ['상품 바코드: 상품 목록에 바코드 칸(상자에 찍힌 바코드, 스캐너·카메라로 찍기). 입고 때 상품 바코드를 찍으면 그 상품이 골라지고, 재고 검색칸에 찍으면 그 상품이 걸러져요', '재고 업로드 양식에 ‘상품 바코드’ 열 추가, 시리얼 열은 ‘시리얼(장비 바코드)’로 이름 정리']],
  ['웹 0.0.35', '2026-10-26', ['업무·일정 시간 고르기를 30분 단위로 (오전 9:00, 오전 9:30 …)']],
  ['웹 0.0.34', '2026-10-25', ['전체 메뉴: 계약과 재고를 따로 묶음(재고 묶음에 물품요청도), 순서 정리', '직원과 권한: 직원을 누르면 직원 정보 창(사진·부서·직책·생년월일·연락처·주소) — 정보 수정과 권한 설정 창이 따로', '권한 추가: 직원 정보 보기, 일일보고·실적보고 명단에 넣기', '직책 목록(관리자가 추가·수정·삭제, 위에 있을수록 앞): 직원 목록·일일보고 명단은 직책순, 전체 실적은 순위순/직책순 선택', '직원 완전 삭제(삭제 비밀번호 필요), 가맹점·재고·응대 기록·자료실 삭제도 삭제 비밀번호를 물어요 (☰ → 관리자 → 삭제 비밀번호)']],
  ['웹 0.0.33', '2026-10-25', ['가맹점 등급 표기를 직원들이 부르는 대로: 0코드·1코드·2코드·3코드, 그다음 해지가맹점·신규가맹점·협력사 (목록·단체 문자·등록 화면·업로드 양식)']],
  ['웹 0.0.32', '2026-10-25', ['물품요청: 칸을 누르면 재고 품목(상품코드·보관지별 재고 수)에서 고르고, 목록에 없는 물품은 이름만 적어도 요청돼요(‘새 물품’ 표시). 본사가 주문·발송을 표시할 때 상품 목록에 올라가고 상품코드가 붙어요']],
  ['웹 0.0.31', '2026-10-25', ['가맹점 일괄 가져오기에 업로드 양식(.xlsx) 받기 — 이카운트 거래처 머리글과 같은 이름, VAN사·계약시작일·종료일도 읽어요', '재고 일괄 등록(엑셀, 관리자): 상품코드/상품명·시리얼·수량·현재위치 — 본사·광주지사는 우리 재고, 가맹점 상호는 이미 설치된 장비로 기록만(재고 수 제외)', 'PC 위쪽 메뉴 맨 끝에 ‘메모’: 업무 중 메모 추가·수정(자동 저장)·고정·삭제']],
  ['웹 0.0.30', '2026-10-25', ['상품 목록(상품코드): 재고 입고와 물품요청이 같은 상품코드·상품명을 써요 (☰ → 재고 → 상품 목록). 관리자가 처음 열면 기존 재고 상품에 코드(P0001…)를 붙여요', '재고·재고 이력·물품요청 화면에 [상품코드] 표시, 상품코드로도 검색']],
  ['웹 0.0.29', '2026-10-25', ['☰ → 내 계정·설정 → ‘알림 및 소리 설정’ 한 곳에서 업무 소리·채팅 소리를 각각 켜고 끄고 들어 보기']],
  ['웹 0.0.28', '2026-10-25', ['업무 요청 ‘가맹점 요청사항’ 빠른 선택 버튼을 관리자가 바꿀 수 있어요 (☰ → 관리자 → 업무 요청 빠른 선택 버튼)', '직원 이름은 이름만 표시 (직함은 빼고, 권한으로 구분)', '휴대폰 아래 탭: ‘전체’를 ☰ 로']],
  ['웹 0.0.27', '2026-10-25', ['‘업무 지시’를 ‘업무 요청’으로 이름 바꿈 (요청하기·요청한 사람)']],
  ['웹 0.0.26', '2026-10-25', ['채팅 알림 음성을 밝은 여자 목소리 “나인톡!”으로 바꿈, 다른 알림 음성도 같은 목소리로']],
  ['웹 0.0.25', '2026-10-25', ['채팅 알림 소리를 카톡처럼 짧게 “나톡!”으로 바꾸고, 업무는 ‘띵동’ + “업무가 배정되었습니다”로 따로 울려요', '☰ → 내 계정·설정에 ‘업무 알림 소리’·‘채팅 알림 소리(나톡)’를 따로 켜고 끄는 칸과 각각 들어 보기', '채팅방 위 🔔 버튼으로 그 방만 알림 소리 끄기(🔕)']],
  ['웹 0.0.24', '2026-10-25', ['알림 음성이 안 나던 문제 고침: 미리 녹음한 음성 파일을 틀어서, 기기에 한국어 음성이 없어도 “업무가 배정되었습니다”·“나인톡”이 들려요. 화면을 한 번 누른 뒤부터 소리가 나요(브라우저 규칙)']],
  ['웹 0.0.23', '2026-10-25', ['알림 음성: 업무가 배정되면 “업무가 배정되었습니다”, 채팅은 “나인톡”, 물품요청·발송·공지도 소리와 음성으로 알려요 (☰ → 내 계정·설정 → 알림 소리 들어 보기)', '☰ 전체 메뉴에서 ‘내 계정·설정’을 맨 앞으로', '사용설명서를 시작하기 → 주 메뉴 → ☰ 메뉴 묶음 순서로 다시 정리, 물품요청 설명 추가']],
  ['웹 0.0.22', '2026-10-24', ['재고 보관지(본사·광주지사): 입고 때 보관지 선택, 보관지별 보기·수량, 보관지 바꾸면 ‘이동’ 이력', '물품요청(지사 → 본사): 품목·수량·받을 곳·본사 담당자 → 담당자에게 알림 → 주문함·발송(발주처리, 송장 메모)·반려 → 받는 쪽 ‘입고 확인’하면 그 보관지 재고에 자동 입고', '☰ 전체 메뉴를 업무·가맹점·계약·재고·실적·보고·회사·내 계정·설정·관리자로 나누고 넓은 화면을 다 쓰게, 권한 없는 메뉴는 숨김']],
  ['웹 0.0.21', '2026-10-24', ['채팅 읽음 표시: 카톡처럼 말풍선 옆에 아직 안 읽은 사람 수(노란 숫자)가 보이고, 다 읽으면 사라져요 (상대가 웹 또는 앱 v0.0.4 이상을 쓸 때 정확해요)']],
  ['웹 0.0.20', '2026-10-24', ['업무 지시: 가맹점 요청사항 빠른 선택 ‘용지신청’(직접 입력과 같이). 완료하면 응대 기록 종류가 ‘용지신청’으로 남아요', '업무 지시: 찾는 가맹점이 없으면 ‘새 가맹점 등록’ → 저장하면 이 업무에 자동 연결 (권한·암호 규칙 그대로)', '가맹점: 계약시작일·계약종료일 (상세에 D-day)', '가맹점 목록: 계약 만료 예정 필터 1·2·3개월 이내·만료됨, 종료일 빠른 순, 검색과 같이', 'VAN사 목록을 취급사로 정리 (다우데이타·다우데이타PG·KIS정보통신·KIS정보통신PG·NHN KCP·KOVAN·KOPAY PG), 직접 입력한 이름도 다음부터 목록에', '응대 종류에 ‘용지신청’ 추가']],
  ['웹 0.0.19', '2026-10-24', ['채팅: ‘+ 새 채팅’을 누르면 앱처럼 그룹 채팅방 / 1:1 대화 중에서 골라요 (1:1은 직원 검색해서 고르기)', '채팅: 직원 찾기 칸(이름·초성·번호)과 직원 줄 좌우 화살표 ‹ › 로 직원이 많아도 쉽게 찾기']],
  ['웹 0.0.18', '2026-10-24', ['직원과 권한: ‘영업 실적·순위에서 빼기’ 추가 — 대표님처럼 켜 둔 계정은 실적 합계·직원별 순위·월별 비교·직원별 수익에 들어가지 않아요']],
  ['웹 0.0.17', '2026-10-24', ['‘지금 업데이트’를 누르면 바로 새 버전이 열리게 고침(전에는 서버 임시 보관 때문에 최대 10분 늦게 바뀜)']],
  ['웹 0.0.16', '2026-10-24', ['PC: 채팅처럼 화면 왼쪽 칸을 씀 — 업무(기한 지난·내 업무·최근 완료), 프로젝트(진행률), 일정(오늘부터 일주일), 가맹점·응대 기록(진행 중 가맹점 업무·최근 연 가맹점·최근 응대 기록), ☰에서 연 화면은 같은 묶음 메뉴']],
  ['웹 0.0.15', '2026-10-24', ['업무 ↔ 응대 기록 연결: 업무를 올릴 때 가맹점을 고르고 ‘가맹점 요청사항’을 적으면, 완료할 때 적는 ‘처리결과’와 함께 그 가맹점 응대 기록에 자동으로 남아요(다시 완료하면 같은 기록을 고침, 응대 종류 선택)', '가맹점 화면에 그 가맹점의 진행 중인 업무가 보여요', '응대 기록에 ‘📋 업무에서’ 표시']],
  ['웹 0.0.14', '2026-10-24', ['재고: 입고(같은 모델은 수량에 더하기·입고처 메모), 출고(반품·불량·A/S 교체·분실 — 계약 없이), 수량 정정(재고 조사, 시리얼 스캔 확인), 재고 이력(입고·출고·계약 출고·정정, 날짜·직원·메모)', 'PC: ☰ 전체 메뉴 화면 바탕색을 구분하고 묶음별 카드로 정리', '업데이트: 새 버전이 나오면 위쪽에 ‘지금 업데이트’ 띠가 떠요. 새로고침·프로그램 재시작만 해도 새 버전이 바로 적용되고, 전체 → 회사 → 업데이트 확인으로 직접 확인할 수도 있어요']],
  ['웹 0.0.13', '2026-10-24', ['사용설명서 전면 정리: 앱 사용설명서와 같은 순서로 모든 기능 설명, 항목을 눌러 펼치기, 검색(초성 가능), 자주 묻는 질문 추가']],
  ['웹 0.0.12', '2026-10-24', ['로그인: 인증번호 받기를 누른 뒤 기다리는 시간 줄임(사람 확인을 화면이 열릴 때 미리 준비)']],
  ['웹 0.0.11', '2026-10-24', ['윈도우 PC용 설치 프로그램(나인패밀리 설치 .exe) — 전체 → 계정 → PC 프로그램 설치 파일 받기. 토스포스처럼 설치해서 쓰고, 화면·기능은 웹앱과 같아요']],
  ['웹 0.0.10', '2026-10-24', ['직원과 권한(최고관리자): 직원 추가(권한 묶음), 항목별 권한 켜고 끄기, 사용 중지·다시 사용 — 로그인 번호와 서버 권한도 같이 맞춰요', '가맹점 보호·복원(최고관리자): 삭제한 가맹점 복원, 가맹점별 변경 이력과 그 시점으로 되돌리기, 백업 파일로 복원, 되돌리기 기준점(위험한 작업 직전에 자동 저장)', '가맹점 일괄 가져오기: 엑셀(.xlsx)·CSV, 미리보기 후 등록·갱신(거래처코드·사업자번호·상호로 같은 곳 찾기)', '단체 문자: 내용({상호} 자동 바꿈)·등급별·검색으로 가맹점 고르기, 휴대폰에서 한 곳씩 문자 앱 열기 (PC는 알리고 연동 후 바로 발송 예정)', '이제 안드로이드 앱의 전체 메뉴 기능이 웹에도 모두 들어왔어요']],
  ['웹 0.0.9', '2026-10-24', ['일일보고 쓰기: 날짜별로 쓰고 제출(완료 업무·올린 계약 자동 집계), 내가 낸 보고', '일일보고 종합 보기(보고 열람 권한자): 직원별 제출·미제출', '실적 보고서: 실적 권한자는 이달 실적 자동 집계를 고쳐서 대표님께 보고, 보고 열람 권한자는 올라온 보고서 보기', '자료실: 분류·검색, 자료 올리기(파일 5개·3MB, 사진은 자동으로 줄여서), 받기, 수정·삭제(올린 사람·관리자)', '비상연락망: 구분별 목록, 눌러서 전화, 추가·수정·삭제', '내 프로필: 사진 변경·상태 메시지, 다른 직원 프로필에서 1:1 대화·전화, 채팅 직원 줄에 프로필 사진']],
  ['웹 0.0.8', '2026-10-24', ['내 실적: 이번 달 신규 계약·판매금액, 지난달과 비교(성장률), 최근 6개월, 올린 계약', '전체 실적·직원별 순위(실적 권한자): 직원별 대수·판매·CMS·렌탈·판매금액 순위, 직원별 지난달→이번 달 막대', '수익 현황(실적 권한자): 총 수익·월 수익·최근 6개월·직원별 수익, 단가 안 적은 출고 장비 바로 입력', '지난 업무 기록: 완료된 업무 검색(전체 이력 권한이 있으면 모두, 없으면 내 것)']],
  ['웹 0.0.7', '2026-10-24', ['안드로이드 앱과 맞춤: 업무 상태 변경은 담당자·최고관리자, 업무 삭제는 만든 사람·최고관리자', '서류 업무(서류 접수·카드사 서류)를 지시하면 ‘서류접수’ 채팅방에 자동으로 알림', '계약 만료 3개월 이내 계약이 있으면 업무 화면 위에 알림 카드', '일정: 다가오는 일정 목록, 일정을 누르면 내용·가맹점 정보 보기, 관리자는 일정 삭제', '가맹점 등급 코드(0~7) 입력·표시', '공지: 작성 권한자·관리자는 읽은 사람 목록', '채팅: 나인이 프렌즈 스티커 80종·이모지, 말풍선 누르면 반응·답장·복사·내 메시지 삭제, 두 번 누르면 ❤️, 글 속 웹 주소 누르면 열림', '가맹점 응대 기록: 종류·날짜로 걸러 보기']],
  ['웹 0.0.6', '2026-10-24', ['저장 상태 표시: 서버에 저장되는 동안 ‘저장 중’, 인터넷이 끊기면 ‘저장 대기 n건’ — 연결되면 자동으로 저장돼요', '가맹점 동시 수정 보호: 수정 창을 연 사이 다른 직원(앱·다른 PC)이 같은 가맹점을 고치면 바뀐 항목을 알려 주고, 덮어쓸지 한 번 더 물어요', '가맹점 등록: 같은 사업자번호가 이미 있으면 알려 줘요', '백업: 관리자 → 데이터 백업 내려받기(PC에 파일로), 관리자가 웹을 열면 하루 한 번 이 PC 안에 자동 보관(14일치)', '매일 새벽 서버 전체 자료를 암호화해 따로 보관하는 자동 백업 준비(관리자가 비밀값을 넣으면 시작)']],
  ['웹 0.0.5', '2026-10-24', ['뒤로가기: 폰 뒤로가기·브라우저 뒤로 버튼이 앱처럼 한 단계씩 닫아요(팝업 → 대화방 → 메뉴 → 하위 화면 → 첫 화면, 첫 화면에서 한 번 더 누르면 나가요)', '빨라짐: 한 번 받은 자료를 기기에 보관해서 다음부터 바로 열리고, 인터넷이 약해도 보여요', '알림: 웹앱을 열어 둔 동안 새 업무·채팅·공지가 오면 소리·진동·안내, PC는 다른 창을 보고 있어도 브라우저 알림(전체 → 알림 받기), 탭 제목에 안 본 개수', '채팅: 사진 보기·저장, 파일 받기, 사진·파일 보내기(+ 버튼, 파일 3MB까지), PC와 아이폰 웹앱끼리 읽음 표시 맞춤', '업무 지시·일정 추가: 모든 칸에 이름표, 가맹점 조회로 거래처·전화·주소 자동 채우기', '일정: 공휴일 빨간색·이름 표시, 토요일 파란색, 오늘 버튼', '전체 메뉴: 아직 앱에서만 되는 기능은 맨 아래에 접어 두기, PC 주 메뉴에 프로젝트', '확인 창을 웹앱 모양으로, 팝업 안 안내가 버튼을 가리지 않게, 채팅 보내기 버튼·말풍선 줄바꿈 고침, 권한이 없을 때 안내']],
  ['웹 0.0.4', '2026-10-24', ['재고: 모델별 재고·출고중 수량, 안전재고 부족 표시, 재고 추가(시리얼 여러 개 한 번에)·수정·삭제, 입고·출고 단가와 보유 재고 자산(실적 권한자)', '바코드: PC는 USB·블루투스 스캐너로 찍으면 바로 입력·검색, 아이폰·휴대폰은 📷 버튼으로 카메라 스캔', '계약 관리: 만료 3개월 이내 계약 따로 보기(D-day), 계약 정보·나간 장비, 장비 추가, 설치 완료(장비가 재고에서 빠짐)', '신규 계약 올리기: 가맹점 찾기(상호·초성·사업자번호), 결제 연동(VAN/PG), 판매·CMS·렌탈과 금액, 재고에서 장비 고르기·스캔·직접 입력, 만료일 +12/24/36개월', '입금 확인: 입금 올리기·확인 처리, ‘입금확인’ 채팅방에 자동 알림', '안드로이드 앱과 같은 서버 자료라 어느 쪽에서 해도 바로 서로 보여요']],
  ['웹 0.0.3', '2026-10-24', ['화면 구성: 아이폰(휴대폰)은 안드로이드 앱과 같은 화면 — 아래 탭 업무·프로젝트·채팅·일정·전체, 나머지 기능은 전체 탭 안에', 'PC: 위쪽 가로줄에 주 메뉴(업무·채팅·일정·가맹점·응대 기록), 왼쪽 위 ☰ 를 누르면 계정·회사·일·관리자로 묶인 전체 메뉴, 왼쪽 위 나인패밀리를 누르면 홈(오늘 현황)', '가맹점 검색 고침: 한글을 치는 중에도 바로 걸러지고, 상호·초성(ㅅㅇㅍ)·사업자번호(- 없이도) 모두 찾아요. 가맹점 목록·응대 기록·채팅·메뉴 검색 모두 같아요', '가맹점: 목록과 PC 표에 전화·휴대폰·VAN사·계약이 보이고, 예전에 한 칸에 넣은 휴대폰 번호는 휴대폰번호 칸으로 이어받아요', '가맹점 삭제: ‘가맹점 등록·수정’ 권한과 암호가 있어야 해요 (목록에서만 사라지고 기록은 남아요)', '전체 메뉴에 사용설명서·버전 내역 추가, 아직 앱에서만 되는 기능은 ‘앱에서’ 로 표시']],
  ['웹 0.0.2', '2026-10-24', ['가맹점 항목 추가(전화·휴대폰·이메일·VAN사·계약구분과 금액), 모든 칸에 이름표', '가맹점 등록·수정 권한과 수정 암호(관리자가 설정)', '한글 검색 입력 끊김 고침, ☰ 전체 메뉴']],
  ['웹 0.0.1', '2026-10-24', ['웹앱 시작: 업무·프로젝트·채팅·일정·가맹점·응대 기록·공지, PC·아이폰 설치']]
];
function viewAbout() {
  return '<h1>버전·업데이트 내역</h1><div class="sub">지금 버전: 나인패밀리 ' + VERSION + ' (안드로이드 앱 내역은 앱의 전체 → 버전·업데이트 내역)</div>' +
    WEB_CHANGES.map(([v, d, items]) => '<div class="card flat"><div class="t1">' + v + ' <span class="sub">' + d + '</span></div>' + items.map(x => '<div class="bul">• ' + esc(x) + '</div>').join('') + '</div>').join('');
}
const WEB_MANUAL = [
  ['처음 시작하기 · 로그인', '1. 관리자가 등록해 둔 내 휴대폰 번호를 넣고 ‘인증번호 받기’를 눌러요.\n2. 문자로 온 인증번호 6자리를 넣으면 로그인돼요. 한 번 로그인하면 계속 유지돼요.\n※ ‘등록되지 않은 번호입니다’가 나오면 관리자에게 번호 등록을 요청하세요.\n※ 아이폰: Safari 로 열고 공유 버튼 → ‘홈 화면에 추가’ 하면 앱처럼 써요.\n※ 로그아웃: 전체(☰) → 계정 → 로그아웃.'],
  ['PC 프로그램 (윈도우)', '■ 윈도우 제목줄 없이 전체 모드로 실행돼요. 오른쪽 위 ⋮: 새로고침·다시시작·종료, 창 최소화(화면 구석에 바로가기 아이콘 — 끌어서 옮기고 더블클릭하면 다시 열려요, 안 읽은 개수는 빨간 숫자)·창 줄이기(작은 창 — 위쪽 검은 줄 어디든 잡고 끌어 옮기고(다른 모니터로도, 전체 모드에서 끌면 작은 창이 되어 따라와요), 가장자리를 끌어 크기 조절)·크게보기(지금 있는 모니터에서 다시 전체 모드). ■ X 를 눌러도 꺼지지 않고 오른쪽 아래 트레이(시계 옆)에서 계속 실행돼 알림을 받아요. 트레이 아이콘을 누르면 다시 열리고, 완전히 끄려면 트레이 아이콘 오른쪽 클릭 → 종료 또는 ⋮ → 종료. (PC 설치 파일 0.0.9 이상 — 새 버전이 나오면 위쪽 ‘지금 업데이트’를 누르면 받아서 설치 창이 자동으로 열려요)\n전체(☰) → 계정 → ‘PC 프로그램 설치 파일 받기’로 설치 파일을 받아 실행하면 바탕화면·시작 메뉴에 ‘나인패밀리’가 생겨요.\n처음 실행할 때 ‘Windows의 PC 보호’ 창이 뜨면 ‘추가 정보’ → ‘실행’을 눌러 주세요.\n프로그램은 이 웹앱을 창으로 띄우는 방식이라, 업데이트가 나오면 다시 설치하지 않아도 다음에 켤 때(켜 둔 상태면 F5) 바로 바뀌어요.\n크롬·엣지에서 주소창 오른쪽 설치 버튼으로 설치해도 같아요.\n■ 왼쪽 칸: PC에서는 채팅처럼 화면 왼쪽에 바로가기 목록이 나와요. 업무는 기한 지난·내 업무, 프로젝트는 진행률, 일정은 오늘부터 일주일, 가맹점·응대 기록은 진행 중인 가맹점 업무와 최근 연 가맹점, ☰에서 연 화면은 같은 묶음 메뉴. 눌러서 바로 열어요.'],
  ['화면 구성', '휴대폰(아이폰): 안드로이드 앱과 같은 화면이에요. 아래 탭 업무·프로젝트·채팅·일정·전체, 나머지 기능은 전체 탭에 계정 → 회사 → 일 → 관리자 순서로 있어요.\nPC: 위쪽 가로줄이 주 메뉴(업무·프로젝트·채팅·일정·가맹점·응대 기록)예요. 왼쪽 위 ☰ 를 누르면 전체 메뉴가 펼쳐지고, ‘나인패밀리’를 누르면 홈(오늘 현황)으로 가요.\n전체 메뉴 위 기능 검색에 단어나 초성(예: ㅈㄱ)을 치면 기능을 바로 찾아요.\n안드로이드 앱·아이폰·PC 는 같은 서버를 써서, 어디서 고쳐도 다른 기기에 바로 보여요.'],
  ['업무', '■ 보기: 업무 탭 위에 남은 업무 수, ‘상태별로 보기’(미완료·미확인·진행중·보류·완료)로 걸러 봐요. ‘전체 업무 보기’ 권한이 있으면 ‘내 업무 / 전체 업무’를 바꿔 봐요.\n■ 요청: 오른쪽 아래 + → 제목·종류·거래처·전화·주소·기한·메모·담당 직원. ‘가맹점 조회’로 고르면 거래처·전화·주소가 자동으로 채워져요. 기한을 넣으면 일정 달력에도 표시돼요. ‘다른 직원에게 업무 배정’ 권한이 없으면 나에게만 요청할 수 있어요.\n■ 서류 업무: 종류가 ‘서류 접수’·‘카드사 서류’이면 ‘서류접수’ 채팅방에 자동으로 알림이 올라가요.\n■ 처리: 업무를 눌러 진행 시작 → 보류·연기(다시 할 날짜) → 완료(처리 결과 한 줄). 상태는 담당자 본인과 최고관리자만 바꿔요. 모든 처리는 이력으로 남아요.\n■ 삭제: 업무를 만든 사람과 최고관리자만 해요.\n■ 계약 만료가 3개월 안으로 남은 계약이 있으면 업무 화면 위에 빨간 알림 카드가 떠요.\n■ 가맹점 업무와 응대 기록: 업무를 올릴 때 가맹점을 골라 ‘가맹점 요청사항’을 적어 두면, 완료 때 적는 ‘처리결과’와 함께 그 가맹점 응대 기록에 자동으로 남아요(📋 업무에서 표시). 가맹점 화면에는 아직 안 끝난 업무도 보여요.\n■ 용지신청·새 가맹점: 요청사항 위 ‘＋ 용지신청’을 누르면 칸에 들어가요(다시 누르면 빠짐). 완료하면 응대 기록 종류가 ‘용지신청’. 가맹점 조회에서 못 찾으면 ‘새 가맹점 등록’ → 찾던 상호·사업자번호가 채워지고, 저장하면 업무 창으로 돌아와 자동 연결돼요(권한·암호 필요).'],
  ['프로젝트', '+ 로 이름·마감일·메모·체크리스트(한 줄에 하나)·담당자를 넣어 만들어요.\n프로젝트를 눌러 항목을 체크하면 진행률이 자동으로 올라가고, ‘항목 추가’로 늘려요. 100%가 되면 ‘완료 되돌리기’로 진행중으로 돌릴 수 있어요.\n목록 위 전체·진행중·완료로 걸러 봐요.'],
  ['채팅', '■ PC 오른쪽 채팅창: 위쪽 ‘💬 채팅창’ 버튼을 누르면 화면 오른쪽에 대화방 목록이 열려요. 방에 들어가면 왼쪽 세로줄에 대화방들, 오른쪽에 대화가 보이고, 세로줄을 누르면 그 방으로 바뀌어요(☰ 목록으로 돌아가기). 가맹점 조회 같은 다른 화면을 보면서 대화하고, 다시 누르면 닫혀요. (PC에는 위쪽 ‘채팅’ 메뉴가 없어요)\n■ 대화방을 열면 안 읽은 첫 글부터 보여요(‘여기까지 읽었어요’ 줄).\n■ 알림 받기: 전체 → 채팅 → ‘채팅 알림 및 소리 설정’에서 켜고 꺼요(업무 알림은 전체 → 업무 → ‘업무 알림 및 소리 설정’). 채팅 알림은 방마다 1개만 떠요.\n■ 안 읽은 채팅 알림띠: 다른 화면을 보고 있어도 위쪽에 ‘💬 안 읽은 채팅’ 띠가 읽을 때까지 떠 있어요. 누르면 그 채팅방으로 바로 가요(알림 끈 방은 빼요).\n■ 직원을 눌러 1:1 대화(첫 메시지를 보내야 목록에 생겨요), ‘새 그룹 채팅방’으로 초대한 사람끼리 대화해요.\n■ 말풍선을 한 번 누르면 반응(👍 ❤️ 😂 …)·답장·복사·삭제(내 것), 두 번 빠르게 누르면 ❤️ 가 붙어요. 답장 띠의 ✕ 로 취소해요.\n■ 입력줄 + 로 사진·파일(3MB까지), ☺ 로 이모지와 나인이 프렌즈 스티커 80종을 보내요. 사진을 누르면 크게 보고 저장해요.\n■ 스크린샷: 대화방에서 Ctrl+V 로 붙여 넣으면 미리 보고 보내요(파일을 끌어다 놓아도 돼요).\n■ 줄바꿈: PC는 Shift+Enter, 휴대폰은 키보드 엔터(보내기는 버튼). 여러 줄이면 입력칸이 늘어나요.\n■ 글 속 웹 주소는 눌러서 열려요.\n■ 읽음 표시는 PC와 아이폰 웹앱끼리 맞춰져요(안드로이드 앱과는 아직 따로).\n※ 1:1 대화는 두 사람만 볼 수 있어요. 개인정보는 1:1 이나 그룹방에서 나누세요.\n■ 새 채팅·직원 찾기: ‘+ 새 채팅’ → 그룹 채팅방 또는 1:1 대화(직원 검색해서 고르기). 직원이 많으면 ‘직원 찾기’ 칸에 이름·초성·번호를 치거나 직원 줄 양옆 ‹ › 로 넘겨 찾아요.\n■ 읽음 표시: 말풍선 시각 옆 노란 숫자 = 아직 안 읽은 사람 수. 모두 읽으면 숫자가 사라져요.'],
  ['일정 (달력)', '■ 일요일·공휴일은 빨간색(공휴일 이름 표시, 2026~2028년), 토요일은 파란색이에요. ‹ › 로 달을 넘기고 ‘오늘’로 돌아와요.\n■ 날짜를 누르면 그날 일정과 기한이 있는 업무가 보이고, 아래 ‘다가오는 일정’에 앞으로의 일정이 날짜 순으로 나와요.\n■ 일정을 누르면 내용이 보이고, 가맹점이 연결된 일정은 ‘가맹점 정보 보기’로 바로 가요.\n■ 일정 추가·삭제는 최고관리자만 해요(+ 버튼). 가맹점을 고르면 장소에 주소가 들어가요. 일반 직원은 업무에 기한을 넣으면 달력에 표시돼요.'],
  ['가맹점', '■ 주소: 주소 칸(또는 ‘주소 검색’)을 누르면 인터넷 주소 검색처럼 도로명·지번·건물명으로 찾아 골라요. 고른 뒤 동·호수 같은 상세 주소를 이어 적어요.\n■ 검색: 상호, 초성(예: ㅅㅇㅍ), 사업자번호(- 없이도), 전화번호. 한글을 치는 중에도 바로 걸러져요. PC는 표로 보여요.\n■ 항목: 상호·사업자번호·전화번호·휴대폰번호·이메일·주소·VAN사·계약구분(임대면 월 CMS 금액, 판매면 판매 금액)·계약조건·등급 코드·메모. 칸마다 이름이 위에 있어요.\n■ 등급 코드(밴피 기준): 0 S·월 5만원 이상 / 1 A·3만원 이상 / 2 B·1만원 이상 / 3 C·1만원 미만 / 4 해지 / 5 신규 / 7 협력사.\n■ 등록·수정·삭제는 ‘가맹점 등록·수정’ 권한이 있어야 하고, 관리자가 수정 암호를 정해 두면 관리자도 암호를 넣어야 해요(한 번 넣으면 5분 동안 다시 묻지 않아요). 같은 사업자번호가 이미 있으면 등록할 때 알려 줘요.\n■ 삭제하면 목록에서만 사라지고 기록은 남아요(관리자가 복원 가능).\n■ 최고관리자는 가맹점 정보 창의 ‘🕘 변경 이력’에서 누가 언제 무엇을 바꿨는지 보고 그 시점으로 되돌려요.\n■ 계약기간·만료 예정: 등록·수정에 계약시작일·계약종료일. 목록 위 ‘계약 만료 예정’ 1·2·3개월 이내·만료됨을 누르면 그 가맹점만 종료일 빠른 순으로 보여요(검색과 같이 써요, 종료일이 빈 가맹점은 필터에서만 빠짐).\n■ VAN사: 다우데이타, 다우데이타PG, KIS정보통신, KIS정보통신PG, NHN KCP, KOVAN, KOPAY PG — 그 밖은 직접 입력하면 다음부터 목록에 같이 나와요.'],
  ['가맹점 응대 기록', '■ 가맹점을 열어 ‘+ 응대 기록 남기기’ → 날짜·종류(방문A/S·원격A/S·전화응대·기타)·요청사항·처리결과.\n■ 가맹점 창에서 종류 버튼과 날짜로 걸러 봐요.\n■ 전체 → 가맹점 응대 기록 조회: 상호·초성·사업자번호로 가맹점을 찾거나, 모든 가맹점의 최근 기록을 검색해요.\n■ 기록은 직원 누구나 고칠 수 있고 수정한 사람·시각이 남아요. 지우기는 쓴 사람과 최고관리자만 해요.'],
  ['재고 · 바코드', '■ 입고(＋ 입고 또는 오른쪽 아래 +): 모델명, 시리얼(한 줄에 하나 — 스캐너로 계속 찍으면 여러 대가 한 번에), 시리얼 없는 물품은 수량, 안전재고, 입고 단가(실적 권한자).\n■ 출고(− 출고): 계약 없이 나가는 장비 — 반품(공급처로)·불량·폐기·A/S 교체·분실·기타 중 사유를 고르고, 재고에서 찾거나 스캐너로 찍어 담아요. 시리얼 없는 물품은 수량을 적어요. A/S 교체는 가맹점을 연결할 수 있어요. 계약으로 나가는 장비는 지금처럼 ‘계약’에서 고릅니다.\n■ 수량 정정(재고 조사): 창고에서 센 실제 수량을 적고, 시리얼 장비는 없는 것만 체크를 꺼요(스캐너로 찍으면 ‘확인’ 표시). 사유를 적으면 차이만큼 바로잡고 이력에 남아요.\n■ 이력: 재고 화면의 ‘이력’ 또는 전체 → 일 → 재고 이력. 입고·출고·계약 출고·정정이 날짜·직원·메모와 함께 시간 순으로 나와요. 장비를 누르면 그 장비의 이력도 볼 수 있어요.\n■ 삭제는 잘못 넣은 것을 지울 때만 쓰세요(이력이 안 남음).\n■ 바코드: PC는 USB·블루투스 스캐너로 찍으면 바로 입력돼요. 검색칸에 시리얼을 찍으면 그 장비가 바로 열려요. 휴대폰은 📷 버튼으로 카메라 스캔(처음에 카메라 허용).\n■ 모델별로 재고·출고중 수량이 보이고, 안전재고보다 적으면 빨간색으로 알려요.\n■ 시리얼 줄을 눌러 수정·삭제, 실적 권한자는 입고·출고 단가와 보유 재고 자산을 봐요.\n■ 순서: 재고 → (계약에서 고르면) 출고중 → (설치 완료하면) 재고에서 빠짐.\n■ 보관지: 본사·광주지사. 입고할 때 보관지를 고르고, 위 ‘보관지’ 버튼으로 나눠 봐요. 장비를 눌러 보관지를 바꾸면 ‘이동’으로 이력에 남아요(예전 재고는 본사로 잡혀 있어요).\n■ 물품요청(지사 → 본사): 재고 화면 아래 또는 ☰ → 업무 → 물품요청. 품목·수량·받을 곳·본사 담당자를 적어 보내면 담당자 업무에 알림이 가요. 담당자가 ‘주문함’ → ‘발송(발주처리)’(송장 메모)을 누르면, 요청한 사람에게 ‘입고 확인’ 알림이 가요. 물건을 받고 ‘입고 확인’에서 받은 수량·시리얼을 적으면 받은 곳 재고에 바로 들어가요. 안 되면 담당자가 ‘반려’(사유).'],
  ['계약 · 입금', '■ 신규 계약 올리기: 가맹점 찾기 → 결제 연동(VAN/PG·업체명) → 구분(판매·CMS·렌탈)과 금액 → 나가는 장비(재고에서 고르기·스캔·직접 입력) → 장비 메모 → 계약일·만료일(+12/24/36개월 버튼).\n■ 계약 관리: 만료 3개월 이내 계약이 위에 빨간 D-day 로 나와요. 계약을 눌러 장비 추가, ‘설치 완료’(장비가 재고에서 빠짐). 실적 권한이 없으면 내가 올린 계약만 보여요.\n■ 입금 확인: + 로 종류·금액·가맹점·메모를 올리면 ‘입금확인’ 채팅방에 알림이 가고, 확인한 사람이 ‘확인 처리’를 눌러요.'],
  ['실적 · 수익 · 지난 업무', '■ 내 실적: 이번 달 내 신규 계약·판매금액, 지난달과 비교(성장률), 최근 6개월. ‹ › 로 달을 바꿔요.\n■ 전체 실적·직원별 순위(실적 권한자): 신규 계약 대수 순(같으면 판매금액 순), 직원별 지난달 → 이번 달 막대.\n■ 수익 현황(실적 권한자): 출고된 장비의 출고 단가 − 입고 단가. 단가를 안 적은 장비는 아래 목록에서 눌러 적으면 바로 반영돼요.\n■ 지난 업무 기록: 완료된 업무를 제목·거래처·담당자·완료 메시지로 찾아요(전체 이력 권한이 없으면 내 것만).'],
  ['일일보고 · 실적 보고서', '■ 일일보고 쓰기: ‹ › 로 날짜를 고르고 오늘 한 일·특이사항·내일 계획을 적어 제출해요. 그날 완료한 업무와 올린 계약은 (자동 집계)로 나에게만 보여요(보고에는 직접 쓴 내용만 올라가요). 같은 날 다시 내면 수정본으로 바뀌어요.\n■ 일일보고 종합 보기(보고 열람 권한자): 날짜별로 직원별 보고와 미제출자를 봐요.\n■ 실적 보고서: 실적 권한자는 자동 집계된 이달 실적을 고쳐 ‘대표님께 보고하기’, 보고 열람 권한자는 올라온 보고서를 봐요.'],
  ['자료실 · 비상연락망', '■ 자료실: 분류 버튼과 검색으로 찾고, 눌러서 첨부 파일을 받아요. + 로 제목·설명·분류와 파일(5개, 3MB까지, 사진은 자동으로 줄여서)을 올려요. 올린 사람과 관리자만 고치고 지워요. 개인정보 파일은 올리지 마세요.\n■ 비상연락망: 구분별로 모아 보이고, 번호를 누르면 전화가 걸려요. + 로 추가, ‘수정’으로 고치거나 지워요.'],
  ['내 프로필 · 공지사항', '■ 내 프로필: 전체 탭 맨 위 내 카드(또는 전체 → 계정 → 내 프로필)에서 사진과 상태 메시지(예: 외근 중)를 바꿔요. 다른 직원 프로필에서는 1:1 대화·전화하기.\n■ 공지사항: 읽지 않은 공지는 숫자로 표시돼요. ‘공지 작성’ 권한이 있으면 + 로 올리고 ‘맨 위에 고정’할 수 있어요. 작성 권한자·관리자는 공지 창에서 읽은 사람 목록을 봐요.'],
  ['알림 · 저장 상태 · 뒤로가기', '■ 화면 왼쪽 위 ‹ 뒤로: 하위 화면·다른 탭에서 누르면 한 단계씩 돌아가요(하위 화면 → 전체 메뉴 → 업무). 업무 화면에서 뒤로가기를 누르면 종료할지 물어봐요.\n■ 알림: 웹앱을 열어 둔 동안 새 업무·채팅·공지가 오면 소리·진동·안내로 알려요. PC는 전체 → 계정 → 알림 받기를 허용하면 다른 창을 보고 있어도 알림이 떠요. 탭 제목에 안 본 개수가 보여요. (웹앱을 닫았을 때 오는 알림은 서버 연동 후 가능)\n■ 저장 상태: 저장하면 화면 위에 ‘저장 중’이 잠깐 보여요. 인터넷이 끊기면 ‘저장 대기’로 바뀌고, 연결되면 저절로 저장돼요. 이 띠가 있는 동안에는 닫지 마세요.\n■ 가맹점 수정 창을 연 사이 다른 직원이 같은 가맹점을 고치면, 저장할 때 바뀐 항목을 보여 주고 덮어쓸지 한 번 더 물어요.\n■ 뒤로가기: 폰 뒤로가기·브라우저 뒤로 버튼으로 팝업 → 대화방 → 메뉴 → 하위 화면 → 첫 화면 순서로 닫혀요. 첫 화면에서 한 번 더 누르면 나가요.\n■ 알림 소리·음성: 새 업무가 배정되면 ‘띵동’ 소리와 함께 “업무가 배정되었습니다”, 채팅이 오면 카톡처럼 “나인톡!”, 공지는 “새 공지가 있습니다”라고 말해 줘요. ☰ → 업무 → ‘업무 알림 및 소리 설정’ / 채팅 → ‘채팅 알림 및 소리 설정’에서 업무 소리·채팅 소리를 따로 끄고 켜고, ‘들어 보기’로 미리 들어 봐요. 채팅방 위 🔔 를 누르면 그 방만 소리를 꺼요(🔕).'],
  ['관리자: 직원과 권한', '■ 직원을 누르면 ‘직원 정보’ 창이 열려요(사진·부서·직책·생년월일·연락처·주소). 여기서 ‘정보 수정’, ‘권한 설정’, ‘완전 삭제’를 따로 해요.\n■ 권한 설정 창: 항목별 권한(직원 정보 보기 포함), 영업 실적·순위에서 빼기, 일일보고·실적보고 명단에 넣기, 사용 중지.\n■ 직책 목록(☰ → 관리자 → 직책 목록): 한 줄에 하나, 위에 있을수록 앞에 보여요. 기본: 대표·이사·본부장·지사장·부장·차장·과장·대리·사원.\n■ 삭제 비밀번호(☰ → 관리자): 직원 완전 삭제, 가맹점·재고·응대 기록·자료실 삭제 때 물어봐요. 정하기 전에는 직원 완전 삭제를 할 수 없어요. 완전 삭제한 직원은 목록·명단·담당자 고르기에서 사라지고 로그인할 수 없어요(지난 기록의 이름은 남아요).\n■ 전체 → 관리자 → 직원과 권한. + 로 이름·휴대폰 번호·권한 묶음(영업직·사무직·관리자)을 넣어 등록하면 그 번호로 로그인할 수 있어요.\n■ 직원을 눌러 항목별 권한을 켜고 끄거나, ‘사용 중지’로 퇴사자의 접근을 막아요. 마지막 관리자는 중지하거나 관리 권한을 끌 수 없어요.\n■ 권한: 업무 만들기 / 다른 직원에게 업무 배정 / 전체 업무 보기 / 전체 이력 보기 / 공지 작성 / 실적 보기 / 일일보고·실적보고 종합 보기 / 가맹점 등록·수정 / 직원 관리(최고관리자).'],
  ['관리자: 백업 · 가맹점 보호·복원', '■ 자료는 여러 겹으로 지켜져요: ① 서버는 지우기가 막혀 있고 모든 변경이 기록돼요 ② 매일 새벽 서버 전체를 암호화해 90일 보관(비밀값 설정 후) ③ 관리자가 앱·웹을 열면 그 기기에 하루 한 번 14일치 자동 보관 ④ 데이터 백업 내려받기로 파일 보관(한 달에 한 번 이상 권장).\n■ 가맹점 보호·복원: 삭제한 가맹점 복원, 백업 파일(.json)로 복원, 되돌리기 기준점 만들기. 가져오기·복원·되돌리기 직전 상태는 그 PC에 자동 저장돼요(전체 → 관리자 → PC에 보관된 자동 백업).\n■ 가맹점 수정 암호: 전체 → 관리자에서 정하고 바꾸고 끄요.'],
  ['재고 일괄 등록 (엑셀)', '■ 처음 재고를 옮길 때 써요(관리자). 재고 화면의 ‘📥 재고 일괄 등록 (엑셀)’ 또는 ☰ → 계약·재고.\n■ ‘업로드 양식 받기’로 엑셀 양식을 받아 상품코드(또는 상품명)·상품 바코드·시리얼(장비 바코드)·수량·현재위치·사업자번호·설치일·메모를 채워요. 상품 바코드는 상자에 찍힌 것(같은 상품이면 같음), 시리얼은 장비마다 다른 번호예요. ‘(예시)’ 줄은 건너뛰어요.\n■ 현재위치가 본사·광주지사 → 우리 재고로 입고돼요(같은 상품·보관지의 시리얼 없는 물품은 수량이 더해져요).\n■ 현재위치가 가맹점 상호 → 이미 설치된 장비로 기록만 하고 재고 수·수익에는 넣지 않아요. 가맹점이 먼저 등록돼 있어야 하고, 사업자번호를 적으면 정확히 찾아요.\n■ 상품 목록에 없는 상품명은 새 상품코드(P0001…)로 등록돼요. 올리기 전에 미리보기로 개수와 못 올리는 줄(이유)을 보여 줘요.\n■ 앞으로 가맹점에 나가는 것은 계약·출고로 처리해요.'],
  ['메모 (PC)', '■ PC 화면 위쪽 메뉴 맨 끝 ‘메모’. 업무 중 적어 둘 것을 메모해요.\n■ 새 메모를 적고 ‘추가’(Ctrl+Enter). 메모 칸을 고치면 잠시 뒤 저절로 저장돼요. 📌 로 맨 위에 고정, 🗑 로 삭제.\n■ 내 계정에 저장돼서 다른 PC에서도 보이고, 다른 직원 화면에는 안 보여요.'],
  ['가맹점 일괄 가져오기 (엑셀·CSV)', '■ ‘📄 업로드 양식 받기’로 양식(.xlsx)을 받을 수 있어요. 이카운트 거래처 머리글과 같은 이름이라 이카운트 엑셀을 그대로 올리거나 양식에 붙여 넣어도 돼요. VAN사·계약시작일·계약종료일도 읽어요.\n■ 이카운트 등에서 거래처 목록을 엑셀(.xlsx) 또는 CSV로 받아요. 옛 .xls 는 엑셀에서 .xlsx 로 다시 저장해 주세요.\n■ 머리글에 ‘거래처명’(또는 상호·가맹점명)이 있어야 하고, 사업자등록번호·거래처코드·대표자·전화·핸드폰·주소·등급·업태·종목·메모 열이 있으면 함께 가져와요.\n■ 전체 → 가맹점 일괄 가져오기 → 파일 고르기 → 미리보기(새로 등록·갱신·건너뜀) 확인 → 가져오기.\n■ 응대 기록: 양식의 응대일자·응대종류·요청사항·처리결과(처리완료) 열에 적으면 그 가맹점 응대 기록으로 남아요(한 가맹점 여러 건은 상호를 같게 해서 줄 여러 개, 같은 날 같은 내용은 건너뜀).\n■ 같은 거래처코드·사업자번호·상호가 있으면 새로 만들지 않고, 파일에 값이 있는 칸만 덮어써요. 잘못되면 가맹점 보호·복원에서 되돌려요.'],
  ['단체 문자 (가맹점)', '■ 전체 → 단체 문자 보내기. 내용을 쓰고({상호} 는 가맹점 이름으로 바뀜), 등급 버튼·검색·체크로 받을 가맹점을 골라요(휴대폰 번호가 있는 곳만).\n■ ‘문자 보내기 시작’ → 한 곳씩 휴대폰 문자 앱이 열리고 내용이 채워져 있어요. 보내고 돌아오면 다음 가맹점이 준비돼요. 받는 분끼리 번호가 보이지 않고, 요금은 그 휴대폰 요금제로 나가요.\n■ PC에는 문자 앱이 없어 보낼 수 없어요(남은 번호 복사는 가능). 알리고 연동 후 PC에서도 바로 보낼 수 있게 할 예정이에요.'],
  ['안드로이드 앱과 다른 점', '■ 웹에 아직 없는 세부 기능: 채팅방 이름 변경·초대·음소거·방 안 검색, 프로젝트 항목 삭제·진행 기록, 시리얼 사진 인식.\n■ 웹에서 먼저 생긴 기능: 저장 상태 표시, 가맹점 동시 수정 경고, 웹 기기끼리 채팅 읽음 맞춤.\n■ 가맹점 삭제: 웹은 ‘가맹점 등록·수정’ 권한 + 암호, 앱은 최고관리자만.'],
  ['자주 묻는 질문', 'Q. 새 버전은 어떻게 받아요?\nA. 새 버전이 나오면 화면 위쪽에 ‘지금 업데이트’ 띠가 떠요. 누르거나, 새로고침(F5)·프로그램을 껐다 켜도 바로 적용돼요. 전체 → 회사 → 업데이트 확인으로 직접 확인할 수도 있어요.\n\nQ. 인증번호 문자가 안 와요.\nA. 번호가 등록됐는지 확인하세요. 짧은 시간에 여러 번 요청하면 잠시 막힐 수 있어요(30분쯤 뒤 다시).\n\nQ. 기기를 바꿨어요.\nA. 같은 번호로 다시 로그인하면 모든 자료가 그대로 나와요. 자료는 서버에 있어요.\n\nQ. 인터넷이 없을 때도 되나요?\nA. 받아 둔 자료로 보기와 입력이 되고, 연결되면 저절로 서버에 올라가요(화면 위 ‘저장 대기’ 띠).\n\nQ. 실수로 지웠어요.\nA. 지운 자료도 서버에 남아 있어요. 관리자에게 말씀해 주세요(가맹점은 보호·복원에서 바로 되살려요).\n\nQ. 업데이트는 어떻게 받아요?\nA. 웹앱·PC 프로그램은 다시 열면(F5) 자동으로 최신이에요. 안드로이드 앱은 새 APK 를 받아 설치해요.'],
  ['물품요청 (본사 ← 지사)', '■ 품목 칸을 누르면 재고 품목이 상품코드·보관지별 재고 수와 함께 떠서 골라요. 목록에 없는 물품은 이름만 적으면 ‘새 물품’으로 요청되고, 본사(관리자)가 주문·발송을 표시할 때 상품 목록에 올라가 상품코드가 붙어요.\n■ 요청: ☰ → 업무 → 물품요청, 또는 재고 화면 아래 ‘＋ 본사에 물품요청’. 받을 곳(광주지사·본사), 품목과 수량(줄 추가 가능), 본사 담당자, 희망 도착일, 메모를 적어 보내요.\n■ 본사 담당자: 업무 목록에 ‘미확인’으로 뜨고 알림(음성: 물품요청이 들어왔습니다)이 가요. 요청을 열어 ‘주문함’ → ‘발송(발주처리)’(택배사·송장번호 메모)를 누르거나, 안 되면 ‘반려’(사유).\n■ 요청한 사람: 발송되면 알림(음성: 물품이 발송되었습니다)과 업무 숫자가 떠요. 물건을 받고 ‘입고 확인’에서 받은 수량·시리얼을 적으면 받은 곳(보관지) 재고에 바로 입고되고, 재고 이력에 ‘물품요청 입고’로 남아요.\n■ 진행 단계: 요청 › 주문함 › 발송함 › 입고완료 (또는 반려). 모든 단계는 처리 이력에 시각·사람과 함께 남아요.']
];
// 사용설명서 순서: 시작하기 → 위쪽 주 메뉴 → ☰ 전체 메뉴 묶음(메뉴와 같은 순서) → 도움말
const MAN_GROUPS = [['시작하기', ['처음 시작하기 · 로그인', 'PC 프로그램 (윈도우)', '화면 구성']],
  ['주 메뉴', ['업무', '프로젝트', '채팅', '일정 (달력)', '가맹점', '가맹점 응대 기록', '메모 (PC)']],
  ['☰ 내 계정·설정', ['내 프로필 · 공지사항', '알림 · 저장 상태 · 뒤로가기']],
  ['☰ 업무', ['물품요청 (본사 ← 지사)']],
  ['☰ 가맹점', ['단체 문자 (가맹점)', '가맹점 일괄 가져오기 (엑셀·CSV)']],
  ['☰ 계약', ['계약 · 입금']],
  ['☰ 재고', ['재고 · 바코드', '재고 일괄 등록 (엑셀)']],
  ['☰ 실적 · 보고', ['실적 · 수익 · 지난 업무', '일일보고 · 실적 보고서']],
  ['☰ 회사', ['자료실 · 비상연락망']],
  ['☰ 관리자', ['관리자: 직원과 권한', '관리자: 백업 · 가맹점 보호·복원']],
  ['도움말', ['안드로이드 앱과 다른 점', '자주 묻는 질문']]];
function viewManual() {
  const q = (S.manq || '').trim();
  return '<h1>사용설명서</h1><div class="sub">나인패밀리 ' + VERSION + ' 기준 · 항목을 눌러 펼쳐요</div><input id="manq" data-q="manq" placeholder="🔍 사용설명서 검색 (예: 바코드, ㄱㅁㅈ)" value="' + esc(S.manq || '') + '"><div class="qres" data-for="manq">' +
    (MAN_GROUPS.map(([g, ts]) => { const es = ts.map(t => WEB_MANUAL.find(x => x[0] === t)).filter(x => x && kmatch(x[0] + ' ' + x[1], q));
      return es.length ? '<h2>' + esc(g) + '</h2>' + es.map(([t, b]) => '<details class="man"' + (q ? ' open' : '') + '><summary>' + esc(t) + '</summary><div class="mtext">' + esc(b) + '</div></details>').join('') : ''; }).join('') || '<div class="empty">찾는 내용이 없어요.</div>') + '</div>';
}

// ---------- 팝업 ----------
function modal(html) {
  closeModal();
  const d = document.createElement('div'); d.className = 'modal'; d.id = 'modal'; document.body.classList.add('hasmodal'); d.innerHTML = '<div class="sheet">' + html + '</div>';
  d.onclick = ev => { if (ev.target === d && !d.querySelector('input:not([type=checkbox]),textarea')) closeModal(); const a = ev.target.closest('[data-act]'); if (a && ACT[a.dataset.act]) { ev.stopPropagation(); ACT[a.dataset.act](a.dataset.arg, a, ev); } };
  document.body.appendChild(d);
}
function closeModal() { const m = $('#modal'); if (m) m.remove(); document.body.classList.remove('hasmodal'); }
function askConfirm(title, msg, okLabel, onOk, danger) { // 브라우저 기본 확인창 대신
  modal('<h3>' + esc(title) + '</h3>' + (msg ? '<div class="sub" style="white-space:pre-wrap;color:var(--ink);font-size:14px;margin:8px 0">' + esc(msg) + '</div>' : '') + '<div class="btns" style="margin-top:12px"><button class="btn" data-act="close">취소</button><button class="btn ' + (danger ? 'red' : 'gold') + '" id="c_ok">' + esc(okLabel) + '</button></div>');
  $('#c_ok').onclick = () => { closeModal(); onOk(); };
}
ACT.close = closeModal;
let rej = false;
function warn(s) { rej = true; toast(s); return false; }
function formModal(title, inner, onOk, okLabel) {
  modal('<h3>' + esc(title) + '</h3>' + inner + '<div class="btns" style="margin-top:12px"><button class="btn" id="m_cancel">취소</button><button class="btn gold" id="m_ok">' + esc(okLabel || '확인') + '</button></div>');
  $('#m_cancel').onclick = closeModal;
  $('#m_ok').onclick = () => { rej = false; const r = onOk(); if (r === true) closeModal(); };
  const f = $('#modal input, #modal textarea'); if (f && !f.readOnly && f.type !== 'date') f.focus();
}

// ---------- 설치(PWA) ----------
let installEv = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEv = e; syncInstall(); });
window.addEventListener('appinstalled', () => { installEv = null; syncInstall(); toast('설치했어요. 바탕화면·시작 메뉴에서 열 수 있어요.'); });
// PC 프로그램이 옛 버전이면 위쪽에 '새 PC 버전 설치' 안내 (웹은 바로 바뀌지만 창 모양·⋮ 메뉴·트레이는 설치 파일을 다시 깔아야 바뀐다)
const PC_SETUP_URL = 'https://github.com/ninepayments/Work-app/releases/latest/download/NineFamily-Setup.exe';
const PC_LATEST_API = 'https://api.github.com/repos/ninepayments/Work-app/releases/latest';
const verNum = v => String(v || '').replace(/^[^0-9]*/, '').split('.').map(Number).reduce((a, x) => a * 1000 + (x || 0), 0);
async function checkPcVersion() {
  if (!/Electron/.test(navigator.userAgent)) return;
  const w = window.nineWin, ua = /NineFamilyPC\/([\d.]+)/.exec(navigator.userAgent); // 설치된 버전: 0.0.7부터 UA 꼬리, 그 전엔 있는 기능으로 짐작
  const mine = ua ? ua[1] : w && w.ver ? w.ver : w && w.update ? '0.0.6' : w ? '0.0.5' : '0.0.2';
  try {
    const r = await (await fetch(PC_LATEST_API, {cache: 'no-store'})).json(); const t = String(r.tag_name || '');
    if (!t.startsWith('pc-v') || verNum(t) <= verNum(mine)) return;
    S.pcNew = t.slice(4); showUpdate(); // 웹 업데이트와 같은 자리(위쪽 '새 버전' 팝업)에 띄운다
  } catch (e) {}
}
ACT.pcUpdate = () => {
  const w = window.nineWin;
  if (w && w.update) { // 0.0.6 이상: 버튼 하나로 받아서 자동 설치·다시 켜기
    { const b = $('#updbar'); if (b) b.remove();
      modal('<h3>새 버전 받는 중</h3><div class="sub" id="pcupd">설치 파일 받는 중… 0%</div><div class="sub" style="margin-top:8px">다 받으면 설치 창이 자동으로 열려요. 안내대로 설치를 누르면 새 버전으로 다시 켜져요. 로그인·자료는 그대로예요.</div>');
      w.onUpdate((k, v) => { const el = $('#pcupd'); if (!el) return; if (k === 'progress') el.textContent = '설치 파일 받는 중… ' + v + '%'; else if (k === 'install') el.textContent = '설치 창을 여는 중… 안내대로 설치해 주세요.'; else { el.innerHTML = '자동으로 받지 못했어요(' + esc(String(v)) + ').<br>아래 버튼으로 설치 파일을 직접 받아 실행해 주세요(받은 뒤 이 프로그램을 ⋮ → 종료).<button class="btn gold full" style="margin-top:10px" onclick="location.href=\'' + PC_SETUP_URL + '\'">설치 파일 직접 받기</button><button class="btn full" data-act="close">닫기</button>'; } });
      w.update();
    }
    return;
  }
  askConfirm('PC 프로그램 새 버전 ' + S.pcNew, '지금 프로그램은 자동 업데이트가 없는 옛 버전이라 이번 한 번만 직접 설치해 주세요(다음부터는 버튼 하나로 자동).\n① 설치 파일 받기 → ② 이 프로그램 끄기(오른쪽 위 X) → ③ 받은 파일 실행. 로그인·자료는 그대로예요.', '설치 파일 받기', () => { location.href = 'https://github.com/ninepayments/Work-app/releases/latest/download/NineFamily-Setup.exe'; });
};
setTimeout(checkPcVersion, 4000);
function syncInstall() { document.querySelectorAll('.inst').forEach(b => b.style.display = installEv ? '' : 'none'); }
ACT.installApp = async () => { if (!installEv) return toast('이미 설치됐거나 이 브라우저는 주소창 메뉴에서 설치해야 해요.'); installEv.prompt(); await installEv.userChoice; installEv = null; syncInstall(); };

// ---------- 시작 ----------
function demoSeed() {
  S.uid = 1; S.phone = '+821000000000'; S.caps = {perf: true, admin: true, report: true};
  const U = (id, name, perms) => S.data.users.set(id, {id, name, phone: '+82100000000' + id, active: true, perms: perms || ['task_create']});
  U(1, '양문희', ['task_create', 'task_assign', 'task_view_all', 'notice_write', 'staff_manage']); U(2, '김영업'); U(3, '이사무');
  S.me = user(1);
  const T = (o) => S.data.tasks.set(o.id, Object.assign({creator: 1, history: [], created: '2026-10-2' + o.id % 9 + ' 10:00'}, o));
  T({id: 11, title: 'A마트 포스 설치', type: '신규 설치', client: 'A마트', phone: '062-123-4567', assignee: 1, status: '지시됨', due: '2026-10-27 14:00'});
  T({id: 12, title: '삼영푸드 단말기 AS', type: 'AS', client: '삼영푸드', assignee: 1, status: '진행중', due: '2026-10-25'});
  T({id: 13, title: '카드사 서류 접수', type: '카드사 서류', assignee: 2, status: '완료', doneAt: todayStr() + ' 09:00', doneMsg: '접수 완료'});
  S.data.projects.set(21, {id: 21, title: '10월 신규 가맹점 20곳', owner: 1, due: '2026-10-31', created: '2026-10-01 09:00', items: [{t: '리스트 정리', done: true}, {t: '방문 10곳', done: true}, {t: '계약 5건', done: false}], pct: 66});
  S.data.merchants.set(31, {id: 31, name: '삼영푸드', phone: '062-111-2222', addr: '광주 서구 상무대로 100', grade: 5});
  S.data.merchants.set(32, {id: 32, name: '행복분식', phone: '062-333-4444', addr: '광주 북구 용봉로 22', grade: 5});
  S.data.mlogs.set(41, {id: 41, merchant: 31, mname: '삼영푸드', date: todayStr(), kind: 'AS', text: '단말기 용지 걸림 해결', who: 2, created: nowStr()});
  S.data.rooms.set(51, {id: 51, name: '전체방', created: '2026-10-01 09:00'});
  S.data.msgs.set(61, {id: 61, room: 51, who: 2, text: '오늘 입금 확인 부탁드려요', ts: Date.now() - 3600000});
  S.data.msgs.set(62, {id: 62, room: 51, who: 1, text: '네 확인했습니다 👍', ts: Date.now() - 1800000});
  S.data.events.set(71, {id: 71, date: todayStr(), title: '본사 회의', time: '15:00', place: '광주지사', who: 1});
  [[91, 'Toss T2', 'T2-0001'], [92, 'Toss T2', 'T2-0002'], [93, '영수증 용지', '', 30]].forEach(([id, model, serial, qty]) => S.data.stock.set(id, {id, model, serial, qty: qty || 1, safe: serial ? 3 : 0, status: '재고', created: '2026-10-20 10:00'}));
  S.data.costs.set(95, {id: 95, stock: 91, buy: 250000, sell: 0});
  S.data.contracts.set(97, {id: 97, date: '2024-01-10', who: 1, merchant: 31, client: '삼영푸드', linkType: 'VAN사', company: 'KIS정보통신', kind: 'CMS', amount: 30000, expire: '2026-12-31', installed: true, installedAt: '2024-01-12', equip: [{sid: 0, model: 'Toss T1', serial: 'T1-9999'}], qty: 1, created: '2024-01-10 09:00'});
  S.data.deposits.set(98, {id: 98, kind: '판매대금', amount: 450000, memo: '입금자 김사장', merchant: 32, mname: '행복분식', by: 2, t: nowStr(), ok: false, created: nowStr()});
  S.data.notices.set(81, {id: 81, title: '웹앱 체험 중입니다', body: '이 화면은 연습용 가짜 자료예요. 서버에 아무것도 저장되지 않아요.', pinned: true, author: 1, t: nowStr(), readBy: []});
}
if (DEMO) { demoSeed(); render(); } else {
  firebase.initializeApp(CFG); auth = firebase.auth(); fs = firebase.firestore(); auth.languageCode = 'ko';
  fs.enablePersistence({synchronizeTabs: true}).catch(() => {}); // 한 번 받은 자료는 기기에 보관 → 다음부터 바로 열리고, 인터넷이 약해도 보인다
  loginView('phone');
  auth.onAuthStateChanged(u => { if (u && !S.uid) afterLogin(u); });
}
let wasWide = isWide();
window.addEventListener('resize', () => { if (S.me && wasWide !== isWide()) { wasWide = isWide(); later(); } });
if ('serviceWorker' in navigator && !DEMO) navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
// ---------- 새 버전 확인 ----------
if (/[?&]u=\d/.test(location.search)) history.replaceState(null, '', location.pathname + location.hash); // 업데이트용 주소 꼬리는 지운다
// 서버의 app.js 에서 VERSION 을 읽어 지금 화면과 다르면 위쪽에 '업데이트' 띠를 띄운다. 새로고침(F5)·프로그램 재시작 때도 항상 새 화면을 받는다(sw.js).
let newVer = '';
async function checkUpdate(manual) {
  try {
    const t = await (await fetch('app.js?v=' + Date.now(), {cache: 'no-store'})).text();
    const m = t.match(/const VERSION = '([^']+)'/); newVer = m && m[1] !== VERSION ? m[1] : '';
  } catch (e) { if (manual) toast('인터넷 연결을 확인해 주세요.'); return; }
  showUpdate();
  if (manual && !newVer) toast('지금이 최신 버전이에요 (' + VERSION + ').');
}
function showUpdate() { // 가벼운 업데이트(웹)는 새로고침, PC 프로그램 재설치가 필요하면 같은 자리·같은 버튼으로 덮어 설치
  let b = $('#updbar'); const pc = !!S.pcNew; if (!newVer && !pc) { if (b) b.remove(); return; }
  if (!b) { b = document.createElement('div'); b.id = 'updbar'; document.body.appendChild(b); }
  b.innerHTML = (pc ? 'PC 프로그램 새 버전 ' + esc(S.pcNew) + (window.nineWin && window.nineWin.update ? '' : ' (재설치)') : '새 버전 ' + esc(newVer.replace('웹 ', ''))) + '<button data-act="doUpdate">지금 업데이트</button><button data-act="laterUpdate" aria-label="나중에">✕</button>';
  b.querySelector('[data-act=doUpdate]').onclick = pc ? ACT.pcUpdate : ACT.doUpdate; b.querySelector('[data-act=laterUpdate]').onclick = () => b.remove();
}
ACT.doUpdate = async () => {
  toast('업데이트하는 중…');
  try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.update())); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
  location.replace(location.pathname + '?u=' + Date.now() + location.hash); // 처음 보는 주소로 열어야 서버(GitHub)의 10분 임시 보관을 건너뛴다
};
ACT.checkUpdate = () => checkUpdate(true);
if (!DEMO) { setTimeout(checkUpdate, 20000); setInterval(checkUpdate, 10 * 60000); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); }); }
