# Tally

**A node-based calculator whose answers pop out as notes you can drag around your screen.**

Every time you press <kbd>=</kbd>, the answer becomes a note on a zoomable board. Notes can reference each other and feed into function nodes, so change one number and everything built on it updates.

## How it runs

Tally is a desktop app built with [Electron](https://www.electronjs.org/). It has two window modes, and you switch between them with the **Float** / **Desk** button in the toolbar. The same files also open as a web page.

| | **Desk** (desktop app, default) | **Float** (desktop app) | **Browser** |
|---|---|---|---|
| **What you see** | A normal window with the dotted board | The calculator and notes float over your other apps, with no background or frame | A web page with the dotted board |
| **Move and resize the window** | Yes | Not needed: it covers your screen but is invisible | Like any browser tab |
| **Toolbar** | Across the top | Folds into a round button above the calculator's top-left corner and moves with it | Across the top |
| **Clicking empty space** | Selects and pans on the board | Passes through to whatever app is underneath | Selects and pans on the board |
| **Select, zoom, pan on empty space** | Drag · scroll · middle-drag | Hold <kbd>Ctrl</kbd> near the calculator and notes, then drag · scroll · middle-drag | Drag · scroll · middle-drag |
| **Stays on top of other windows** | No | Yes, toggle it from the tray icon or Config | No |
| **Show/hide shortcut and tray icon** | Yes | Yes | No |

Both desktop modes share one board. Switching saves it, reopens the window in the other mode, and keeps the calculator and notes where they were on screen. Tally remembers the last mode and the desk window's size and position.

**Float is one window, not one per note.** It's a single transparent window the size of your main screen, with the calculator, notes, and panels drawn inside it. Clicks only land on Tally where something is drawn, so the rest of your screen works normally. Because it's one window on the main display, notes can't be dragged onto a second monitor.

**The Float toolbar.** Click the round **v** button above the calculator to unfold the tools into one row. The arrow turns to **>** while they're open. Click it again to fold them away. Tally remembers which way you left it.

**Selecting in Float mode.** For Tally to draw a selection box, it has to catch clicks on empty space, which normally go to the app underneath. Holding <kbd>Ctrl</kbd> tells Tally to catch them, and the board gets a faint tint while it does. This only happens near the calculator and notes (within about 100px of them), so <kbd>Ctrl</kbd>+click keeps working in other apps away from Tally, for example to open a link in a new tab. The desktop app watches the Ctrl key system-wide while in Float mode, so this works even when Tally isn't the active app. It only listens for Ctrl, and only in Float mode.

The browser version keeps its notes in that browser's storage, separate from the desktop app.

No framework and no build step: one HTML file, one stylesheet, one script.

---

## Features

- **Live notes.** Drop a note onto the calculator screen to use it in an equation. The new note stays linked to it and recalculates when the source changes.
- **Function nodes.** Feed any number of notes into a node that sums, multiplies, averages, finds the min/max/range, or runs your own formula (`A*B/C`).
- **Fast node building.** Press <kbd>Enter</kbd> on an empty calculator to drop a `0` note, then scroll or drag its number to tune it.
- **Readable links.** Hover any link to see what it does to the value, for example `× Multiply · Groceries = 85 × 4.3`.
- **Quick function switching.** Scroll or drag on a function node's symbol (Σ, Π, ÷ …) to cycle through functions. Double-click it for the full list.
- **Scope.** Graph equations as steps or curves, compare values, see how values flow through the board, inspect how one answer is built, or sweep an input and watch everything downstream move.
- **Three modes.** Standard, Scientific, and Programmer (hex/dec/oct/bin, bitwise ops).
- **Key switch sounds.** Pick how the keys sound: Clicky, Tactile, Soft, Tonal, Melodic (each digit plays its own note), Retro, or Typewriter. Delete keys always have their own distinct sound.
- **Make it yours.** Presets, light/dark themes, body materials, screen styles, accent and note colors, typefaces, glass blur, sizes.
- **Import and export.** Save boards as `.json`, and export selected notes as `.json` or PDF.
- **Autosave.** Notes, tape history, and settings persist between launches.

## Getting started

### Desktop app

You need [Node.js LTS](https://nodejs.org) (one-time install).

```bash
git clone https://github.com/datpalmtree/Tally.git
cd Tally
npm install
npm start
```

`npm install` is only needed once. It downloads Electron into `node_modules/`. After that, `npm start` launches Tally in the mode you used last (Desk the first time). To quit, close the desk window, or use the tray icon or **Config → Quit Tally**.

### In a browser

Open `index.html` in Chrome, Edge, or Firefox, or serve the folder with a local server such as VS Code's **Live Server** extension. There's nothing to install.

### Troubleshooting

**`npm start` fails with `Cannot read properties of undefined (reading 'requestSingleInstanceLock')`.** The `ELECTRON_RUN_AS_NODE` environment variable is set in that terminal, so Electron is running as plain Node.js. Some tools launched from VS Code set it. Clear it and try again:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE   # PowerShell
npm start
```

### Install it like a normal Windows app

```bash
npm run dist          # builds dist/Tally Setup 2.0.0.exe
```

Run `Tally Setup 2.0.0.exe` to install Tally for your user account (no admin rights needed). It adds **Tally** to the desktop and Start menu, and you can pin it to the taskbar from there. The installer isn't code-signed, so Windows SmartScreen may warn the first time: choose **More info → Run anyway**. Uninstall from **Settings → Apps**.

Other builds:

```bash
npm run dist:portable # one self-contained Tally .exe, nothing to install (starts slower)
npm run dist:mac      # macOS .dmg
npm run dist:linux    # Linux AppImage
```

## Controls

### Calculator

| Input | Action |
|---|---|
| <kbd>0</kbd>–<kbd>9</kbd> <kbd>.</kbd> <kbd>+</kbd> <kbd>−</kbd> <kbd>*</kbd> <kbd>/</kbd> <kbd>^</kbd> <kbd>(</kbd> <kbd>)</kbd> | Type an equation |
| <kbd>Enter</kbd> | Turn the equation into a note. **On an empty calculator, make a new `0` note** |
| <kbd>=</kbd> | Same as Enter, but on an empty calculator it repeats the last operation |
| <kbd>⌫</kbd> / <kbd>Del</kbd> | Backspace / delete ahead (or delete the selected notes or link) |
| <kbd>←</kbd> <kbd>→</kbd> <kbd>Home</kbd> <kbd>End</kbd> | Move the cursor inside the equation |
| <kbd>Esc</kbd> | Clear, stop editing, deselect |
| <kbd>x</kbd> <kbd>p</kbd> <kbd>e</kbd> | x (× in STD mode), π, e |
| <kbd>s</kbd> <kbd>c</kbd> <kbd>t</kbd> <kbd>l</kbd> <kbd>g</kbd> <kbd>r</kbd> <kbd>q</kbd> <kbd>m</kbd> | sin, cos, tan, ln, log, √, x², mod |

### Board and notes

| Input | Action |
|---|---|
| Scroll / <kbd>Ctrl</kbd>+scroll | Zoom the board (trackpad scroll pans) |
| Middle-drag / <kbd>Space</kbd>+drag | Pan |
| <kbd>Ctrl</kbd>+<kbd>0</kbd> / <kbd>Ctrl</kbd>+<kbd>1</kbd> | Zoom to 100% / fit every note |
| Drag or scroll a plain number | Tune its value (<kbd>Shift</kbd> = fine, <kbd>Alt</kbd> = coarse) |
| Drag a note's ● dot | Link it, feed a function node, or start a new node |
| Hover a link | Show the operation it carries |
| Drag a link | Bend it (double-click to straighten) |
| Scroll or drag a function symbol | Cycle through functions |
| Double-click a function symbol | Open the function list |
| <kbd>Alt</kbd>+drag | Drag a copy |
| Double-click the desk | New text note |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> / <kbd>F2</kbd> | Duplicate / rename |
| <kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd> | Copy / paste notes (or paste an equation) |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Undo / redo |

### Desktop app only

- **Float** / **Desk** in the toolbar switches window mode. It's also in **Config → Desktop** and the tray menu.
- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> on Mac) shows or hides Tally.
- In Float mode, the round **v** button above the calculator folds the toolbar in and out.
- In Float mode, hold <kbd>Ctrl</kbd> near the calculator and notes to select (drag, add <kbd>Shift</kbd> to add to the selection), zoom (scroll), or pan (middle-drag).
- The tray icon has Show/Hide, Desk window / Float over desktop, **Float above other windows** (Float mode only), and Quit. Quit is also in Config.

## Settings

Open **Config** (the sliders icon on the calculator). Sound options are under **Details**:

- **Sounds** on/off and **Volume**
- **Key switches**: Clicky · Tactile · Soft · Tonal · Melodic · Retro · Typewriter. Picking one plays a short preview.

All sounds are synthesized live with the Web Audio API, so there are no audio files.

## Project structure

```
tally/
├── index.html      # markup: board, top bar, calculator, panels
├── style.css       # all styles and themes
├── script.js       # the app (engine, UI, board, scope, config)
├── main.js         # Electron main process: transparent click-through window, tray, shortcut
├── preload.js      # safe bridge between the page and the desktop window
├── fonts/          # bundled typefaces (SIL OFL)
├── vendor/         # jsPDF for PDF export (MIT)
└── package.json
```

`script.js` is organized into numbered sections (engine → formatting → UI → camera → input → blocks → interaction → scope → config) and runs inside one IIFE, so every section shares one scope.

## Notes

- On Linux, click-through over empty space depends on your window manager. If clicks get blocked, untick **Float above other windows** and toggle Tally with the shortcut.
- The three default typefaces (Doto, Martian Mono, Geist) are bundled under the SIL Open Font License, so the app works offline. jsPDF is bundled under the MIT license. Other typefaces in Config load from Google Fonts when you're online.
