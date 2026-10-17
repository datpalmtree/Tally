// Bridges the page to the desktop window: click-through, always-on-top, quit.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tallyDesktop', {
  setInteractive: (on) => ipcRenderer.send('tally:interactive', !!on),
  setOnTop: (on) => ipcRenderer.send('tally:ontop', !!on),
  quit: () => ipcRenderer.send('tally:quit'),
  platform: process.platform,
});
