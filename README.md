# Tally

**A calculator whose answers pop out as notes you can drag around your desktop.**

Tally runs as a transparent layer over your desktop. Every time you press <kbd>=</kbd>, the answer becomes a note on a zoomable board. Notes can reference each other, so change one number and everything built on it updates. Clicks on empty space pass straight through to the apps underneath, so the notes sit on your screen like sticky notes that can do math.

It's an Electron app with no framework and no build step: one HTML file, one stylesheet, one script.

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

You need [Node.js LTS](https://nodejs.org) (one-time install).

```bash
git clone https://github.com/<your-username>/tally.git
cd tally
npm install
npm start
```

### Build a standalone app

```bash
npm run dist          # Windows: portable .exe in dist/
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

### Desktop

- <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> (<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>Space</kbd> on Mac) shows or hides Tally.
- The tray icon has Show/Hide, **Float above other windows**, and Quit. Quit is also in Config.

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
