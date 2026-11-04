'use strict';
// 웹앱 화면(오른쪽 위 ⋮ 메뉴)에서 PC 창을 다룰 수 있게 꼭 필요한 기능만 연다.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('nineWin', {
  act: k => ipcRenderer.send('nine-win', String(k)), // reload · restart · quit · min · shrink · full
  state: () => ipcRenderer.invoke('nine-win-state'), // {full: 전체 화면(최대화)인지}
  move: (dx, dy) => ipcRenderer.send('nine-move', Number(dx) || 0, Number(dy) || 0), // 위쪽 줄을 끌어 창 옮기기(전체 모드면 작은 창으로 바뀌며 따라옴)
  update: () => ipcRenderer.send('nine-update'), // 새 버전 받아서 자동 설치·다시 켜기
  onUpdate: f => ipcRenderer.on('nine-upd', (e, k, v) => f(String(k), v)), // progress(%) · install · error
  np: { // 0.1.0~: 나인패스를 상단바 아래에 메뉴 화면처럼 띄우기 (자리 b = {x, y, w, h})
    show: (url, b) => ipcRenderer.send('nine-np', 'show', Object.assign({url: url ? String(url) : ''}, b || {})),
    bounds: b => ipcRenderer.send('nine-np', 'bounds', b || {}),
    hide: () => ipcRenderer.send('nine-np', 'hide'),
    back: () => ipcRenderer.send('nine-np', 'back'),
    reload: () => ipcRenderer.send('nine-np', 'reload'),
    state: () => ipcRenderer.invoke('nine-np-state'),
    on: f => ipcRenderer.on('nine-np-ev', (e, k, v) => f(String(k), v))
  },
  ver: ((process.argv || []).find(x => x.startsWith('--nine-ver=')) || '').slice(11) // 설치된 PC 프로그램 버전 (웹이 새 버전 안내에 씀)
});
