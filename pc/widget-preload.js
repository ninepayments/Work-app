'use strict';
// 바로가기 아이콘 창 전용: 옮기기·다시 열기·안 읽은 개수 받기만
const {contextBridge, ipcRenderer} = require('electron');
contextBridge.exposeInMainWorld('nineWidget', {
  move: (dx, dy) => ipcRenderer.send('nine-widget', 'move', Number(dx) || 0, Number(dy) || 0),
  open: () => ipcRenderer.send('nine-widget', 'open'),
  onBadge: f => ipcRenderer.on('nine-badge', (e, n) => f(Number(n) || 0))
});
