// Bridges the page to the desktop window: window mode, click-through, always-on-top, quit.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tallyDesktop', {
  mode: ipcRenderer.sendSync('tally:mode'), // 'desk' | 'float'
  setMode: (mode) => ipcRenderer.send('tally:setmode', mode),
  setInteractive: (on) => ipcRenderer.send('tally:interactive', !!on),
  setOnTop: (on) => ipcRenderer.send('tally:ontop', !!on),
  quit: () => ipcRenderer.send('tally:quit'),
  platform: process.platform,
});
