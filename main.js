// Tally desktop — two window modes:
//   desk  : a normal window (move, resize, maximise) with the dotted board, same as the browser version
//   float : a transparent, click-through layer over the whole desktop
// Switching closes the window and opens the other kind; the board is kept in the page's storage.
const { app, BrowserWindow, screen, ipcMain, globalShortcut, Tray, Menu, nativeImage, shell, powerMonitor } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.platform === 'linux') {
  app.commandLine.appendSwitch('enable-transparent-visuals');
  app.disableHardwareAcceleration();
}
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let tray = null;
let onTop = true;

/* ---------- window preferences (mode + desk window size), kept between launches ---------- */
const prefs = { mode: 'desk', bounds: null, maximized: false };
const prefsFile = () => path.join(app.getPath('userData'), 'window.json');
function loadPrefs() {
  try { Object.assign(prefs, JSON.parse(fs.readFileSync(prefsFile(), 'utf8'))); } catch (e) { /* first launch */ }
  if (prefs.mode !== 'float') prefs.mode = 'desk';
}
function savePrefs() {
  try { fs.writeFileSync(prefsFile(), JSON.stringify(prefs)); } catch (e) { /* not fatal */ }
}
const isFloat = () => prefs.mode === 'float';

/* ---------- float mode: is Ctrl held? ----------
   The float window is usually not the active app (clicks on empty space go to the app underneath),
   so the page never hears key presses. A system-wide hook reports just the Ctrl key to the page,
   which then lets Ctrl+drag near the calculator and notes select. */
let hook = null, ctrlDown = false;
function sendCtrl(on) {
  if (on === ctrlDown) return;
  ctrlDown = on;
  if (win && isFloat()) win.webContents.send('tally:ctrl', on);
}
function startCtrlWatch() {
  if (hook) return;
  try {
    const { uIOhook, UiohookKey } = require('uiohook-napi');
    const CTRL = new Set([UiohookKey.Ctrl, UiohookKey.CtrlRight]);
    uIOhook.on('keydown', e => { if (CTRL.has(e.keycode)) sendCtrl(true); });
    uIOhook.on('keyup', e => { if (CTRL.has(e.keycode)) sendCtrl(false); });
    uIOhook.start();
    hook = uIOhook;
  } catch (e) { hook = null; /* no hook: the page falls back to keys it hears while active */ }
}
function stopCtrlWatch() {
  if (!hook) return;
  try { hook.stop(); hook.removeAllListeners(); } catch (e) { /* already stopped */ }
  hook = null;
  ctrlDown = false;
}

function workArea() {
  return screen.getPrimaryDisplay().workArea;
}
/** Saved desk bounds, if they still land on a connected display. */
function deskBounds() {
  const b = prefs.bounds;
  if (!b || !(b.width > 200 && b.height > 200)) return {};
  const onScreen = screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y < a.y + a.height - 40 && b.y + 20 > a.y);
  return onScreen ? b : { width: b.width, height: b.height };
}

function createWindow() {
  const float = isFloat();
  const opts = {
    title: 'Tally',
    icon: path.join(__dirname, 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (float) {
    Object.assign(opts, workArea(), {
      transparent: true,
      frame: false,
      hasShadow: false,
      resizable: false,
      movable: false,
      maximizable: false,
      fullscreenable: false,
      backgroundColor: '#00000000',
    });
  } else {
    Object.assign(opts, { width: 1280, height: 820, minWidth: 720, minHeight: 520 }, deskBounds());
  }
  const w = new BrowserWindow(opts);
  win = w;
  if (float) {
    startCtrlWatch();
    // Empty desk space passes clicks through to whatever is underneath.
    w.setIgnoreMouseEvents(true, { forward: true });
    w.setAlwaysOnTop(onTop, 'floating');
    if (process.platform === 'darwin') w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    stopCtrlWatch();
    w.removeMenu();
    if (prefs.maximized) w.maximize();
    const keep = () => {
      prefs.maximized = w.isMaximized();
      if (!prefs.maximized && !w.isMinimized()) prefs.bounds = w.getBounds();
    };
    w.on('resize', keep);
    w.on('move', keep);
    w.on('close', () => { keep(); savePrefs(); });
  }
  w.loadFile(path.join(__dirname, 'index.html'));
  w.once('ready-to-show', () => w.show());
  w.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  w.on('closed', () => { if (win === w) win = null; });
}

/** Reopen the window as 'desk' or 'float'. The new window opens before the old one closes, so the app never quits in between. */
function setMode(mode) {
  mode = mode === 'float' ? 'float' : 'desk';
  if (mode === prefs.mode && win) return;
  const old = win;
  if (old && !isFloat()) { prefs.maximized = old.isMaximized(); if (!prefs.maximized) prefs.bounds = old.getBounds(); }
  prefs.mode = mode;
  savePrefs();
  createWindow();
  if (old) old.destroy();
  buildTrayMenu();
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
    { type: 'separator' },
    { label: 'Desk window', type: 'radio', checked: !isFloat(), click: () => setMode('desk') },
    { label: 'Float over desktop', type: 'radio', checked: isFloat(), click: () => setMode('float') },
    { label: 'Float above other windows', type: 'checkbox', checked: onTop, enabled: isFloat(), click: (item) => setOnTop(item.checked) },
    { type: 'separator' },
    { label: 'Quit Tally', click: () => app.quit() },
  ]));
}

function setOnTop(on) {
  onTop = !!on;
  if (win && isFloat()) win.setAlwaysOnTop(onTop, 'floating');
  buildTrayMenu();
}

ipcMain.on('tally:interactive', (_e, on) => {
  if (win && isFloat()) win.setIgnoreMouseEvents(!on, { forward: true });
});
ipcMain.on('tally:ontop', (_e, on) => setOnTop(on));
ipcMain.on('tally:mode', (e) => { e.returnValue = prefs.mode; });
ipcMain.on('tally:globalkeys', (e) => { e.returnValue = !!hook; });
ipcMain.on('tally:setmode', (_e, mode) => setMode(mode));
ipcMain.on('tally:quit', () => app.quit());

app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

app.whenReady().then(() => {
  loadPrefs();
  createWindow();
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, process.platform === 'darwin' ? 'tray.png' : 'tray@2x.png'));
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img.resize({ width: 18, height: 18 }));
    tray.setToolTip('Tally');
    tray.on('click', toggleVisible);
    buildTrayMenu();
  } catch (e) { /* tray not available on this desktop */ }
  globalShortcut.register('CommandOrControl+Shift+Space', toggleVisible);
  screen.on('display-metrics-changed', () => { if (win && isFloat()) win.setBounds(workArea()); });
  // a Ctrl release can be missed while the lock screen or Ctrl+Alt+Del is up
  for (const ev of ['lock-screen', 'unlock-screen', 'suspend', 'resume']) powerMonitor.on(ev, () => sendCtrl(false));
  app.on('activate', () => { if (!win) createWindow(); });
});

app.on('will-quit', () => { globalShortcut.unregisterAll(); stopCtrlWatch(); });
app.on('window-all-closed', () => app.quit());
