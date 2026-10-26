'use strict';
// 웹앱 화면(오른쪽 위 ⋮ 메뉴)에서 PC 창을 다룰 수 있게 꼭 필요한 기능만 연다.
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('nineWin', {
  act: k => ipcRenderer.send('nine-win', String(k)), // reload · restart · quit · min · shrink · full
  state: () => ipcRenderer.invoke('nine-win-state'), // {full: 전체 화면(최대화)인지}
  move: (dx, dy) => ipcRenderer.send('nine-move', Number(dx) || 0, Number(dy) || 0), // 위쪽 줄을 끌어 창 옮기기(전체 모드면 작은 창으로 바뀌며 따라옴)
  update: () => ipcRenderer.send('nine-update'), // 새 버전 받아서 자동 설치·다시 켜기
  onUpdate: f => ipcRenderer.on('nine-upd', (e, k, v) => f(String(k), v)), // progress(%) · install · error
  ver: ((process.argv || []).find(x => x.startsWith('--nine-ver=')) || '').slice(11) // 설치된 PC 프로그램 버전 (웹이 새 버전 안내에 씀)
});
