'use strict';
/* 나인패밀리 PC 프로그램 — 토스포스처럼 설치형 창으로 웹앱(https://ninepayments.github.io/Work-app/)을 띄운다.
 * 화면과 기능은 웹앱 그대로라서, 웹을 고치면 이 프로그램도 다시 설치할 필요 없이 바로 바뀐다. 자료는 서버(Firebase)에 있다. */
const {app, BrowserWindow, shell, session, Menu, Tray, ipcMain, nativeImage, screen} = require('electron');
const path = require('path');

const HOME = 'https://ninepayments.github.io/Work-app/';
const ORIGIN = new URL(HOME).origin;
let win = null, tray = null, quitting = false, trayTipShown = false, widget = null, badge = 0, widgetPos = null;

if (!app.requestSingleInstanceLock()) app.quit(); // 이미 켜져 있으면 그 창을 앞으로
app.on('second-instance', () => showWin());

function showWin() { hideWidget(); if (!win) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); }

// ---------- 창 최소화 때 바로가기 아이콘 (화면 위에 항상 떠 있음, 끌어서 옮기기, 더블클릭하면 다시 열기) ----------
function showWidget() {
  if (!widget) {
    const wa = screen.getPrimaryDisplay().workArea;
    const p = widgetPos || {x: wa.x + wa.width - 140, y: wa.y + wa.height - 150};
    widget = new BrowserWindow({
      x: p.x, y: p.y, width: 124, height: 124, frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true,
      focusable: true, hasShadow: false, show: false, title: '나인패밀리',
      webPreferences: {contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, 'widget-preload.js')}
    });
    widget.setAlwaysOnTop(true, 'floating');
    widget.loadFile(path.join(__dirname, 'widget.html'));
    widget.webContents.on('did-finish-load', () => { if (widget) widget.webContents.send('nine-badge', badge); });
    widget.on('moved', () => { if (widget) { const [x, y] = widget.getPosition(); widgetPos = {x, y}; } });
    widget.on('closed', () => { widget = null; });
  }
  widget.showInactive();
}
function hideWidget() { if (widget) widget.hide(); }
ipcMain.on('nine-widget', (e, k, dx, dy) => {
  if (!widget || e.sender !== widget.webContents) return;
  if (k === 'open') showWin();
  else if (k === 'move') { const [x, y] = widget.getPosition(); widget.setPosition(x + Math.round(dx), y + Math.round(dy)); widgetPos = {x: x + Math.round(dx), y: y + Math.round(dy)}; }
});
function quitAll() { quitting = true; app.quit(); }

function inApp(url) { // 우리 웹앱과 로그인(문자 인증·reCAPTCHA) 화면만 창 안에서, 나머지 링크는 기본 브라우저로
  try {
    const u = new URL(url);
    return (u.origin === ORIGIN && u.pathname.startsWith('/Work-app')) || /(^|\.)(firebaseapp\.com|google\.com|gstatic\.com|recaptcha\.net)$/.test(u.hostname);
  } catch (e) { return false; }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, title: '나인패밀리', backgroundColor: '#ffffff', autoHideMenuBar: true, show: false,
    frame: false, // 토스포스처럼 윈도우 제목줄 없이: 창 조작은 웹앱 오른쪽 위 ⋮ 메뉴로, 작은 창일 때는 위쪽 검은 줄을 끌어 옮긴다
    icon: path.join(__dirname, 'res', 'icon.png'),
    webPreferences: {contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, preload: path.join(__dirname, 'preload.js'), additionalArguments: ['--nine-ver=' + app.getVersion()]}
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); }); // 처음엔 전체 모드(토스포스처럼)
  win.on('close', e => { // X 를 눌러도 꺼지지 않고 오른쪽 아래 트레이로 숨는다 (알림을 계속 받게)
    if (quitting) return;
    e.preventDefault(); win.hide();
    if (!trayTipShown && tray) { trayTipShown = true; try { tray.displayBalloon({title: '나인패밀리', content: '오른쪽 아래 트레이에서 계속 실행 중이에요. 끄려면 트레이 아이콘 → 종료.', iconType: 'info'}); } catch (er) {} }
  });
  win.on('page-title-updated', (e, t) => { // 웹앱 제목 '(3) 나인패밀리' 의 숫자 = 안 읽은 개수 → 아이콘 빨간 숫자
    const m = /^\((\d+)\)/.exec(t || ''); badge = m ? Number(m[1]) : 0;
    if (widget) widget.webContents.send('nine-badge', badge);
  });
  win.on('session-end', () => { quitting = true; }); // 윈도우 끄기·로그아웃 때는 막지 않는다
  win.loadURL(HOME);
  win.webContents.on('before-input-event', (e, i) => { // F5·Ctrl+R = 새 버전으로 새로고침 (메뉴줄이 없어서 직접 건다)
    if (i.type === 'keyDown' && (i.key === 'F5' || (i.control && i.key.toLowerCase() === 'r'))) { e.preventDefault(); win.webContents.reloadIgnoringCache(); }
  });
  win.webContents.setWindowOpenHandler(({url}) => { if (!inApp(url)) shell.openExternal(url); return {action: 'deny'}; });
  win.webContents.on('will-navigate', (e, url) => { if (!inApp(url)) { e.preventDefault(); shell.openExternal(url); } });
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { // 인터넷이 끊겨 처음 화면을 못 받으면 안내 후 다시 시도
    if (!isMain || code === -3) return;
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<body style="font-family:sans-serif;text-align:center;padding-top:20vh"><h2>인터넷 연결을 확인해 주세요</h2><p>연결되면 자동으로 다시 열려요.</p><script>setTimeout(()=>location.href=' + JSON.stringify(HOME) + ',5000)</script></body>'));
  });
}

// 웹앱 오른쪽 위 ⋮ 메뉴: 새로고침 · 다시시작 · 종료 · 창 최소화 · 창 줄이기(옮길 수 있는 작은 창) · 크게보기(다시 전체 모드)
ipcMain.on('nine-win', (e, k) => {
  if (!win || e.sender !== win.webContents) return;
  if (k === 'reload') win.webContents.reloadIgnoringCache();
  else if (k === 'restart') { quitting = true; app.relaunch(); app.exit(0); }
  else if (k === 'quit') quitAll();
  else if (k === 'min') { win.hide(); showWidget(); } // 최소화 = 화면 구석의 바로가기 아이콘으로
  else if (k === 'shrink') {
    if (win.isFullScreen()) win.setFullScreen(false);
    win.unmaximize();
    const wa = screen.getDisplayMatching(win.getBounds()).workArea, w = Math.min(1100, wa.width - 80), h = Math.min(760, wa.height - 80);
    win.setBounds({x: wa.x + Math.round((wa.width - w) / 2), y: wa.y + Math.round((wa.height - h) / 2), width: w, height: h});
  } else if (k === 'full') win.maximize();
});
ipcMain.handle('nine-win-state', e => ({full: !!(win && (win.isMaximized() || win.isFullScreen()))}));

function createTray() {
  let img = nativeImage.createFromPath(path.join(__dirname, 'res', 'icon.png'));
  if (!img.isEmpty()) img = img.resize({width: 16, height: 16});
  tray = new Tray(img);
  tray.setToolTip('나인패밀리');
  tray.setContextMenu(Menu.buildFromTemplate([
    {label: '나인패밀리 열기', click: showWin},
    {label: '새로고침', click: () => { showWin(); if (win) win.webContents.reloadIgnoringCache(); }},
    {type: 'separator'},
    {label: '종료', click: quitAll}
  ]));
  tray.on('click', showWin);
  tray.on('double-click', showWin);
}

app.on('before-quit', () => { quitting = true; });

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  // 켤 때마다 임시 보관 화면을 비워 항상 최신 웹앱을 받는다 (로그인·자료 보관은 그대로)
  try { await session.defaultSession.clearCache(); } catch (e) {}
  // 바코드 카메라·알림만 허용 (우리 웹앱에서 요청할 때)
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb(inApp(details.requestingUrl || wc.getURL()) && ['media', 'notifications', 'clipboard-sanitized-write'].includes(perm)));
  createWindow();
  createTray();
});
app.on('window-all-closed', () => { if (quitting) app.quit(); });
