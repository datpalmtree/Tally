// Bridges the page to the desktop window: window mode, click-through, Ctrl state, always-on-top, quit.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tallyDesktop', {
  mode: ipcRenderer.sendSync('tally:mode'), // 'desk' | 'float'
  setMode: (mode) => ipcRenderer.send('tally:setmode', mode),
  globalKeys: ipcRenderer.sendSync('tally:globalkeys'), // true when Ctrl is reported even while Tally isn't the active app
  onCtrl: (cb) => ipcRenderer.on('tally:ctrl', (_e, on) => cb(!!on)),
  setInteractive: (on) => ipcRenderer.send('tally:interactive', !!on),
  setOnTop: (on) => ipcRenderer.send('tally:ontop', !!on),
  quit: () => ipcRenderer.send('tally:quit'),
  platform: process.platform,
});
