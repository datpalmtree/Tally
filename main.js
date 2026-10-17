// Tally desktop — runs the calculator in a transparent, click-through layer over your desktop.
const { app, BrowserWindow, screen, ipcMain, globalShortcut, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let onTop = true;

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}

function createWindow() {
  const { x, y, width, height } = workArea();
  win = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: false,
    movable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    title: 'Tally',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Empty desk space passes clicks through to whatever is underneath.
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(onTop, 'floating');
  if (process.platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.on('closed', () => { win = null; });
}

function toggleVisible() {
  if (!win) return createWindow();
  if (win.isVisible()) win.hide();
  else { win.show(); win.focus(); }
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: win && win.isVisible() ? 'Hide Tally' : 'Show Tally', accelerator: 'CommandOrControl+Shift+Space', click: toggleVisible },
    { label: 'Float above other windows', type: 'checkbox', checked: onTop, click: (item) => setOnTop(item.checked) },
    { type: 'separator' },
    { label: 'Quit Tally', click: () => app.quit() },
  ]));
}

function setOnTop(on) {
  onTop = !!on;
  if (win) win.setAlwaysOnTop(onTop, 'floating');
  buildTrayMenu();
}

ipcMain.on('tally:interactive', (_e, on) => {
  if (win) win.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('tally:ontop', (_e, on) => setOnTop(on));
ipcMain.on('tally:quit', () => app.quit());

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(() => {
  createWindow();
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, process.platform === 'darwin' ? 'tray.png' : 'tray@2x.png'));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 18, height: 18 }));
    tray.setToolTip('Tally');
    tray.on('click', toggleVisible);
    buildTrayMenu();
  } catch (e) { /* tray not available on this desktop */ }
  globalShortcut.register('CommandOrControl+Shift+Space', toggleVisible);
  screen.on('display-metrics-changed', () => { if (win) win.setBounds(workArea()); });
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
