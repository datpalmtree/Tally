/* =====================================================================
   TALLY — notes that calculate
   ---------------------------------------------------------------------
   The whole app is one IIFE, so every section shares one scope.
   Markup lives in index.html, styles in style.css.

   Sections
     00-head      helpers, icons, looks, default settings, state + saving
     10-engine    expression parser and evaluator (live links, overrides)
     20-format    number formatting and equation-to-text
     30-ui        DOM refs, sound, toasts, undo/redo
     40-camera    zoomable / pannable board ("world" coordinates)
     50-input     keypad, typing, = (commit) and the calculator screen
     60-blocks    notes: calc, text and function nodes; links; menus
     70-interact  dragging, ports, scrubbing, resizing, device handling
     80-scope     tape (history) and the Scope visualisations
     90-config    config panel, files (import/export/PDF), keys, boot

   Coordinates
     Notes live in WORLD coordinates (S.cam maps world -> screen).
     The calculator, panels and bar live in SCREEN coordinates.
   ===================================================================== */
(() => {
'use strict';

/* ---------- tiny helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const uid = p => p + Math.random().toString(36).slice(2, 8);
/** Bridge injected by the desktop app's preload script (null in a browser). */
const DESK = window.tallyDesktop || null;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Platform capabilities (claude.ai artifact runtime); absent elsewhere. */
const CL = window.claude && typeof window.claude.use === 'function' ? window.claude : null;
const KEY = 'tally.v1';

/* ---------- icons (16px line icons, inherit currentColor) ---------- */
const sv = d => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const IC = {
  insert: sv('<path d="M3 2.5v5a3 3 0 003 3h7.5"/><path d="M10.5 7.5l3 3-3 3"/>'),
  plot: sv('<path d="M1.5 11c2-6 3.5-6 5 0s3 6 5 0 2.5-5 3-5"/>'),
  edit: sv('<path d="M10.5 2.5l3 3L6 13H3v-3z"/>'),
  copy: sv('<rect x="5" y="5" width="8.5" height="8.5" rx="1.5"/><path d="M11 3H4a1.5 1.5 0 00-1.5 1.5V11"/>'),
  more: '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>',
  pin: sv('<path d="M9.5 2l4.5 4.5-2 1-2.5 2.5.5 3-1 1L2.5 7.5l1-1 3 .5L9 4.5z"/><path d="M5 11l-3 3"/>'),
  rename: sv('<path d="M2.5 13.5h11"/><path d="M4 10.5L9.5 3l2 1.5L6 12H4z"/>'),
  dup: sv('<rect x="2.5" y="2.5" width="8" height="8" rx="1.5"/><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/>'),
  freeze: sv('<path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5"/>'),
  min: sv('<path d="M3 8h10"/>'),
  expand: sv('<rect x="3" y="3" width="10" height="10" rx="2"/>'),
  trash: sv('<path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4"/>'),
  text: sv('<path d="M3 4h10M3 8h10M3 12h6"/>'),
  fnode: sv('<circle cx="11.5" cy="8" r="2.5"/><path d="M2 3.5h3.5L9 8M2 8h7M2 12.5h3.5L9 8"/>'),
  link: sv('<path d="M6.5 9.5l3-3"/><path d="M7 4.5l1-1a3 3 0 014.5 4.5l-1 1M9 11.5l-1 1A3 3 0 013.5 8l1-1"/>'),
  file: sv('<path d="M4 1.5h5.5L12.5 4.5V14.5H4z"/><path d="M9.5 1.5v3h3"/>'),
  swap: sv('<path d="M3 5h10l-2.5-2.5M13 11H3l2.5 2.5"/>'),
};

/* ---------- looks (presets bundle every customisable visual) ---------- */
const PRESETS = {
  polar:   { label: 'Polar',   theme: 'light', material: 'polar',    screen: 'oled',  keys: 'squircle', accent: '#FF4F14', palette: ['#FF4F14', '#2D62FF', '#FFC31F', '#12B76A', '#8F918B', '#FF5BA7'], fDot: 'Doto',        fUi: 'Martian Mono' },
  glyph:   { label: 'Glyph',   theme: 'dark',  material: 'graphite', screen: 'oled',  keys: 'round',    accent: '#D71921', palette: ['#D71921', '#EDEDE8', '#8C8D88', '#FF7A6E', '#4E4F4D', '#B8B9B3'], fDot: 'Doto',        fUi: 'Geist Mono' },
  field:   { label: 'Field',   theme: 'light', material: 'silver',   screen: 'oled',  keys: 'square',   accent: '#FF6A13', palette: ['#FF6A13', '#2C7FE0', '#2AB27B', '#F2C230', '#9B9C97', '#1B1C1C'], fDot: 'Silkscreen',  fUi: 'Space Mono' },
  classic: { label: 'Classic', theme: 'light', material: 'polar',    screen: 'lcd',   keys: 'round',    accent: '#3E8EDE', palette: ['#3E8EDE', '#9AA3AD', '#6CBF73', '#F2B84B', '#E86A5C', '#A98BD6'], fDot: 'DotGothic16', fUi: 'IBM Plex Mono' },
  bondi:   { label: 'Bondi',   theme: 'light', material: 'aqua',     screen: 'glass', keys: 'round',    accent: '#00A2C7', palette: ['#00A2C7', '#FF6FAE', '#A6D930', '#FFAE00', '#7B6BFF', '#FF5A4E'], fDot: 'Doto',        fUi: 'DM Mono' },
  clear:   { label: 'Clear',   theme: 'light', material: 'clear',    screen: 'oled',  keys: 'squircle', accent: '#FF3B30', palette: ['#FF3B30', '#4D7CFF', '#FFD60A', '#30D158', '#98989D', '#BF5AF2'], fDot: 'Doto',        fUi: 'JetBrains Mono' },
};
const ACCENTS = ['#FF4F14', '#D71921', '#2D62FF', '#00A2C7', '#12B76A', '#FFB000', '#7B6BFF', '#121313'];
/** Google Fonts query strings, loaded on demand when a face is picked. */
const FONT_Q = {
  'Doto': 'Doto:wght@300..900', 'DotGothic16': 'DotGothic16', 'VT323': 'VT323', 'Silkscreen': 'Silkscreen:wght@400;700',
  'Sixtyfour': 'Sixtyfour', 'Major Mono Display': 'Major+Mono+Display', 'Martian Mono': 'Martian+Mono:wdth,wght@75..112.5,300..700',
  'Geist Mono': 'Geist+Mono:wght@300..700', 'Space Mono': 'Space+Mono:wght@400;700', 'IBM Plex Mono': 'IBM+Plex+Mono:wght@400;500;600',
  'DM Mono': 'DM+Mono:wght@400;500', 'JetBrains Mono': 'JetBrains+Mono:wght@400..700', 'Geist': 'Geist:wght@300..700',
};
const FONTS_DOT = ['Doto', 'DotGothic16', 'VT323', 'Silkscreen', 'Sixtyfour', 'Major Mono Display', 'Martian Mono', 'Geist Mono', 'Space Mono'];
const FONTS_UI = ['Martian Mono', 'Geist Mono', 'Space Mono', 'IBM Plex Mono', 'DM Mono', 'JetBrains Mono', 'Geist'];
const loadedFonts = new Set(['Doto', 'Martian Mono', 'Geist']);

/** Default decimal mark and digit grouping from the viewer's locale. */
function localeMarks() {
  try {
    const parts = new Intl.NumberFormat().formatToParts(12345.6);
    const g = parts.find(p => p.type === 'group'), d = parts.find(p => p.type === 'decimal');
    const dec = d && d.value === ',' ? ',' : '.';
    let group = g ? (/\s/.test(g.value) ? ' ' : g.value) : ',';
    if (!['', ',', '.', ' ', "'"].includes(group) || group === dec) group = ' ';
    return { dec, group };
  } catch (e) { return { dec: '.', group: ',' }; }
}
const LM = localeMarks();
/** Settings schema version — bump to run a one-time migration in loadState(). */
const SET_VERSION = 2;
const DEF = {
  v: SET_VERSION, preset: 'polar', theme: 'light', material: 'polar', screen: 'oled', keys: 'squircle', notes: 'glass',
  accent: '#FF4F14', palette: PRESETS.polar.palette.slice(), fDot: 'Doto', fUi: 'Martian Mono',
  blur: 18, glass: 62, ns: 100, screws: false, grid: true, links: true, sound: true, volume: 55, switches: 'clicky',
  grad: 'tint', gradS: 18, gradA: 155,
  dec: LM.dec, group: LM.group, cont: 'link', angle: 'deg', dp: -1, keepOnMerge: true, onTop: true,
};

/* ---------- app state (everything persisted lives in S) ---------- */
const S = {
  blocks: [],            // notes: {id, n, type:'calc'|'text'|'fn', tokens, x, y, ...}
  nextId: 1,
  vlinks: [],            // manual "visual" links: {id, a, b}
  bends: {},             // link key -> {x, y} world offset of its midpoint
  tape: [], memory: null,
  calc: { x: null, y: null, s: 1, wf: 1, orient: 'portrait', mode: 'std', base: 10 },
  scope: { open: false, x: null, y: null, w: 460, h: 360, live: true, v: null, mode: 'steps', cmp: 'bars', sweepIn: null, sweepR: 50, rel: false, focus: null },
  cam: { x: 0, y: 0, z: 1 },
  tapeOpen: false, example: false, cfgPos: null,
  set: { ...DEF },
  savedAt: 0,
};
/** Merge a saved snapshot into S, validating shapes and migrating old settings. */
function loadState(saved) {
  if (!saved || typeof saved !== 'object') return;
  if (Array.isArray(saved.blocks)) S.blocks = saved.blocks.filter(b => b && b.id && Array.isArray(b.tokens));
  S.nextId = saved.nextId || (S.blocks.reduce((m, b) => Math.max(m, b.n || 0), 0) + 1);
  if (Array.isArray(saved.vlinks)) S.vlinks = saved.vlinks.filter(v => v && v.a && v.b);
  if (saved.bends && typeof saved.bends === 'object') S.bends = saved.bends;
  if (Array.isArray(saved.tape)) S.tape = saved.tape.slice(-300);
  S.memory = typeof saved.memory === 'number' ? saved.memory : null;
  Object.assign(S.calc, saved.calc || {});
  S.calc.wf = clamp(+S.calc.wf || 1, 1, 2.4);
  S.calc.s = clamp(+S.calc.s || 1, 0.55, 1.9);
  Object.assign(S.scope, saved.scope || {});
  if (saved.cam && isFinite(saved.cam.z)) S.cam = { x: +saved.cam.x || 0, y: +saved.cam.y || 0, z: clamp(+saved.cam.z || 1, 0.2, 3) };
  S.tapeOpen = !!saved.tapeOpen;
  S.example = !!saved.example;
  S.cfgPos = saved.cfgPos || null;
  S.savedAt = saved.savedAt || 1; // older saves had no timestamp: treat as "some local work exists"
  const old = saved.set || {};
  Object.assign(S.set, old);
  if (!old.v || old.v < 2) {            // v1 -> v2: start on Polar light, screws off
    if (S.set.theme === 'auto') S.set.theme = 'light';
    S.set.screws = false;
    S.set.v = SET_VERSION;
  }
  if (!Array.isArray(S.set.palette) || S.set.palette.length !== 6) S.set.palette = DEF.palette.slice();
  S.blocks.forEach(b => { if (!b.type) b.type = 'calc'; if (b.type === 'fn' && !Array.isArray(b.inputs)) b.inputs = []; });
}
let saved0 = null;
try { saved0 = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved0 = null; }
const FRESH = !saved0;
loadState(saved0);

/* ---------- saving: this browser immediately, the viewer's account when available ---------- */
let booting = true;
let saveT = 0;
/** JSON without runtime-only fields (keys starting with "_"). */
const serial = o => JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v));
/** Schedule a save after a change; cheap to call often. */
function save() { if (!booting) S.savedAt = Date.now(); clearTimeout(saveT); saveT = setTimeout(flushSave, 300); }
/** Write now (also runs when the page is hidden or closed — that alone doesn't make it "newer"). */
function flushSave() {
  clearTimeout(saveT);
  try { localStorage.setItem(KEY, serial(S)); } catch (e) { /* storage unavailable */ }
  cloudQueue();
}
addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSave(); });

/** Account sync through the artifact "db" capability (private per viewer). */
const cloud = { db: null, uid: null, ready: false, busy: false, again: false, off: false, warned: false, armed: false, last: { settings: '', board: '' } };
let cloudT = 0;
// Nothing is written to the account until a person actually uses this page
// (previews and thumbnail renders never click or type).
['pointerdown', 'keydown'].forEach(t => addEventListener(t, e => { if (e.isTrusted && !cloud.armed) { cloud.armed = true; cloudQueue(); } }, true));
/** What syncs: look & number preferences and the board. Window layout (calculator spot, zoom) stays per device. */
function cloudParts() {
  const sc = S.scope;
  return {
    settings: serial({ set: S.set, scope: { mode: sc.mode, cmp: sc.cmp, live: sc.live, sweepR: sc.sweepR, rel: sc.rel }, savedAt: S.savedAt }),
    board: serial({ blocks: S.blocks, nextId: S.nextId, vlinks: S.vlinks, bends: S.bends, tape: S.tape.slice(-120), memory: S.memory, example: S.example, savedAt: S.savedAt }),
  };
}
function cloudQueue() { if (!cloud.ready || cloud.off || !cloud.armed) return; clearTimeout(cloudT); cloudT = setTimeout(cloudPush, 1500); }
/** Write changed documents one at a time; skips unchanged ones. */
async function cloudPush() {
  if (cloud.busy) { cloud.again = true; return; }
  cloud.busy = true;
  try {
    const parts = cloudParts();
    for (const k of ['settings', 'board']) {
      if (parts[k] === cloud.last[k]) continue;
      if (parts[k].length > 240000) {
        if (!cloud.warned) { cloud.warned = true; toast('This board is too big to sync to your account. It stays saved in this browser.'); }
        continue;
      }
      await cloud.db.doc(`data/users/${cloud.uid}/${k}`).set({ json: parts[k] });
      cloud.last[k] = parts[k];
    }
  } catch (e) {
    if (e && ['invalid_argument', 'revoked', 'not_granted', 'quota_exceeded'].includes(e.code)) cloud.off = true;
  } finally {
    cloud.busy = false;
    if (cloud.again) { cloud.again = false; cloudQueue(); }
  }
}
/** On load: pull the account copy and use whichever is newer. */
async function cloudInit() {
  if (!CL) return;
  try {
    const [db, user] = await Promise.all([CL.use('db'), CL.use('user')]);
    if (!db || !user) return;
    const id = await user.id();
    if (!id) return;
    cloud.db = db; cloud.uid = id;
    const [sd, bd] = await Promise.all([db.doc(`data/users/${id}/settings`).get(), db.doc(`data/users/${id}/board`).get()]);
    const untouched = FRESH && !S.savedAt;
    if (sd.exists) {
      const raw = sd.data().json; cloud.last.settings = raw;
      const d = JSON.parse(raw);
      if (untouched || (d.savedAt || 0) > (S.savedAt || 0)) applyCloudSettings(d);
    }
    if (bd.exists) {
      const raw = bd.data().json; cloud.last.board = raw;
      const d = JSON.parse(raw);
      if (untouched || (d.savedAt || 0) > (S.savedAt || 0)) applyCloudBoard(d);
    }
    cloud.ready = true;
    try { localStorage.setItem(KEY, serial(S)); } catch (e) { /* ignore */ }
    cloudQueue();
  } catch (e) { /* stay local-only */ }
}

/* =====================================================================
   10 · ENGINE — tokens -> AST -> value
   ---------------------------------------------------------------------
   An equation is an array of tokens ({k:'num'|'op'|'ref'|'fn'|...}).
   A 'ref' token points at another note by id, which is what makes notes
   live-linked: evaluating a ref evaluates that note's own equation.
   Context `c` carries: x (for curves), deg (angle mode), prg (integer
   math), stack (ids being evaluated, for loop detection), tr (optional
   step trace for the Scope), memo (per-pass cache) and over (temporary
   value overrides, used by the Sweep view).
   ===================================================================== */
class CalcError extends Error {}
const Err = m => new CalcError(m);
const byId = id => S.blocks.find(b => b.id === id);

/** Binary operators: s = screen glyph, w = needs spaces around it. */
const OPS = {
  '+': { s: '+' }, '-': { s: '−' }, '*': { s: '×' }, '/': { s: '÷' }, '^': { s: '^' }, root: { s: 'ʸ√' },
  mod: { s: 'mod', w: 1 }, ncr: { s: 'C', w: 1 }, npr: { s: 'P', w: 1 },
  and: { s: 'AND', w: 1 }, or: { s: 'OR', w: 1 }, xor: { s: 'XOR', w: 1 }, shl: { s: '≪' }, shr: { s: '≫' },
};
const toRad = (x, c) => (c.deg ? x * Math.PI / 180 : x);
const fromRad = (x, c) => (c.deg ? x * 180 / Math.PI : x);
const tiny = r => (Math.abs(r) < 1e-15 ? 0 : r);
/** Wrap a one-argument function for the FN table. */
function u(f) { return (c, a) => { if (a.length !== 1) throw Err('Needs one value'); return f(a[0], c); }; }
/** Add a domain check that throws "Invalid input". */
function dom(ok, f) { return (x, c) => { if (!ok(x)) throw Err('Invalid input'); return f(x, c); }; }
/** Functions: l = label shown on screen, v = variadic (takes a list). */
const FN = {
  sin: { l: 'sin', f: u((x, c) => tiny(Math.sin(toRad(x, c)))) },
  cos: { l: 'cos', f: u((x, c) => tiny(Math.cos(toRad(x, c)))) },
  tan: { l: 'tan', f: u((x, c) => { if (c.deg && Math.abs(((x % 180) + 180) % 180 - 90) < 1e-12) throw Err('Undefined'); return tiny(Math.tan(toRad(x, c))); }) },
  asin: { l: 'sin⁻¹', f: u(dom(x => x >= -1 && x <= 1, (x, c) => fromRad(Math.asin(x), c))) },
  acos: { l: 'cos⁻¹', f: u(dom(x => x >= -1 && x <= 1, (x, c) => fromRad(Math.acos(x), c))) },
  atan: { l: 'tan⁻¹', f: u((x, c) => fromRad(Math.atan(x), c)) },
  sinh: { l: 'sinh', f: u(Math.sinh) }, cosh: { l: 'cosh', f: u(Math.cosh) }, tanh: { l: 'tanh', f: u(Math.tanh) },
  ln: { l: 'ln', f: u(dom(x => x > 0, Math.log)) },
  log: { l: 'log', f: u(dom(x => x > 0, Math.log10)) },
  log2: { l: 'log₂', f: u(dom(x => x > 0, Math.log2)) },
  sqrt: { l: '√', f: u(dom(x => x >= 0, Math.sqrt)) },
  cbrt: { l: '∛', f: u(Math.cbrt) },
  sqr: { l: 'sqr', f: u(x => x * x) },
  recip: { l: '1/', f: u(x => { if (x === 0) throw Err('Can’t divide by zero'); return 1 / x; }) },
  abs: { l: 'abs', f: u(Math.abs) },
  exp: { l: 'e^', f: u(Math.exp) },
  p10: { l: '10^', f: u(x => Math.pow(10, x)) },
  p2: { l: '2^', f: u(x => Math.pow(2, x)) },
  floor: { l: 'floor', f: u(Math.floor) }, ceil: { l: 'ceil', f: u(Math.ceil) },
  round: { l: 'round', f: u(x => Math.round(x)) },
  neg: { l: '−', f: u(x => -x) },
  not: { l: 'NOT', f: u(x => Number(BigInt.asIntN(64, ~BigInt(Math.trunc(x))))) },
  sum: { l: 'Σ', v: 1, f: (c, a) => a.reduce((s, x) => s + x, 0) },
  avg: { l: 'avg', v: 1, f: (c, a) => { if (!a.length) throw Err('Needs values'); return a.reduce((s, x) => s + x, 0) / a.length; } },
  min: { l: 'min', v: 1, f: (c, a) => { if (!a.length) throw Err('Needs values'); return Math.min(...a); } },
  max: { l: 'max', v: 1, f: (c, a) => { if (!a.length) throw Err('Needs values'); return Math.max(...a); } },
};
/** Lanczos approximation, so n! works for non-integers. */
function gamma(z) {
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  const p = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  let x = p[0];
  for (let i = 1; i < 9; i++) x += p[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}
function fact(n) {
  if (n < 0 && Number.isInteger(n)) throw Err('Invalid input');
  if (Number.isInteger(n)) { if (n > 170) return Infinity; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
  return gamma(n + 1);
}
function ncr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) throw Err('Invalid input');
  r = Math.min(r, n - r); let v = 1;
  for (let i = 1; i <= r; i++) v = v * (n - r + i) / i;
  return Math.round(v);
}
function npr(n, r) {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) throw Err('Invalid input');
  let v = 1; for (let i = 0; i < r; i++) v *= (n - i);
  return v;
}
/** Programmer mode: 64-bit signed integer arithmetic via BigInt. */
function big(v) { if (!isFinite(v)) throw Err('Invalid input'); return BigInt.asIntN(64, BigInt(Math.trunc(v))); }
function prgop(op, a, b) {
  const A = big(a), B = big(b); let r;
  switch (op) {
    case '+': r = A + B; break; case '-': r = A - B; break; case '*': r = A * B; break;
    case '/': if (B === 0n) throw Err('Can’t divide by zero'); r = A / B; break;
    case 'mod': if (B === 0n) throw Err('Can’t divide by zero'); r = A % B; break;
    case 'and': r = A & B; break; case 'or': r = A | B; break; case 'xor': r = A ^ B; break;
    case 'shl': r = A << BigInt(clamp(Number(B), 0, 64)); break;
    case 'shr': r = A >> BigInt(clamp(Number(B), 0, 64)); break;
    default: throw Err('Syntax error');
  }
  return Number(BigInt.asIntN(64, r));
}
const PRG_OPS = new Set(['+', '-', '*', '/', 'mod', 'and', 'or', 'xor', 'shl', 'shr']);
function binop(op, a, b, c) {
  if (c.prg && PRG_OPS.has(op)) return prgop(op, a, b);
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/': if (b === 0) throw Err('Can’t divide by zero'); return a / b;
    case 'mod': if (b === 0) throw Err('Can’t divide by zero'); return a % b;
    case '^': { const r = Math.pow(a, b); if (Number.isNaN(r)) throw Err('Invalid input'); return r; }
    case 'root': {
      if (b === 0) throw Err('Invalid input');
      if (a < 0 && Number.isInteger(b) && Math.abs(b % 2) === 1) return -Math.pow(-a, 1 / b);
      const r = Math.pow(a, 1 / b); if (Number.isNaN(r)) throw Err('Invalid input'); return r;
    }
    case 'ncr': return ncr(a, b);
    case 'npr': return npr(a, b);
    default: return prgop(op, a, b);
  }
}
/** Numeric value of a number token (handles bases and half-typed exponents). */
function numVal(t) {
  let v = String(t.v).replace(/e[-+]?$/i, '');
  if (v === '' || v === '-' || v === '.') v = '0';
  if (t.b && t.b !== 10) {
    const neg = v[0] === '-'; const n = parseInt(neg ? v.slice(1) : v, t.b);
    if (Number.isNaN(n)) throw Err('Syntax error');
    return neg ? -n : n;
  }
  const n = Number(v);
  if (Number.isNaN(n)) throw Err('Syntax error');
  return n;
}

/* ---------- parser ---------- */
const ENDS = new Set(['num', 'const', 'var', 'ref', 'rp', 'post']);
const STARTS = new Set(['num', 'const', 'var', 'ref', 'lp', 'fn']);
const isOpener = t => t && (t.k === 'lp' || t.k === 'fn');
/** Insert the multiplication people leave out: 2π, 3(4), [note][note]. */
function withImplicit(tokens) {
  const out = [];
  for (const t of tokens) {
    const p = out[out.length - 1];
    if (p && ENDS.has(p.k) && STARTS.has(t.k)) out.push({ k: 'op', v: '*', imp: 1 });
    out.push(t);
  }
  return out;
}
/** Open minus closed parentheses (function tokens open one too). */
function balance(tokens) { let d = 0; for (const t of tokens) { if (isOpener(t)) d++; else if (t.k === 'rp') d--; } return d; }

/**
 * Recursive-descent parser. Precedence, low to high:
 * OR, XOR, AND, shifts, + −, × ÷ mod, unary −, ^ ʸ√ nCr nPr (right-assoc), postfix ! %.
 * Missing closing parentheses at the end are allowed.
 */
function parse(tokens) {
  const t = withImplicit(tokens);
  let i = 0;
  if (!t.length) throw Err('Empty');
  const isOp = (...vs) => { const p = t[i]; return p && p.k === 'op' && vs.includes(p.v); };
  const level = (ops, sub) => () => { let a = sub(); while (isOp(...ops)) { const op = t[i++].v; a = { t: 'bin', op, a, b: sub() }; } return a; };
  let expr;
  const closeOrEnd = () => { if (t[i] && t[i].k === 'rp') i++; else if (t[i]) throw Err('Syntax error'); };
  const primary = () => {
    const p = t[i];
    if (!p) throw Err('Incomplete');
    i++;
    switch (p.k) {
      case 'num': return { t: 'num', v: numVal(p) };
      case 'const': return { t: 'num', v: p.v === 'pi' ? Math.PI : Math.E, c: p.v };
      case 'var': return { t: 'var' };
      case 'ref': return { t: 'ref', id: p.id };
      case 'lp': { if (!t[i]) throw Err('Incomplete'); const a = expr(); closeOrEnd(); return { t: 'grp', a }; }
      case 'fn': {
        if (!FN[p.v]) throw Err('Unknown function');
        const args = [];
        if (t[i] && t[i].k === 'rp') { i++; } else {
          if (!t[i]) throw Err('Incomplete');
          args.push(expr());
          while (t[i] && t[i].k === 'comma') { i++; args.push(expr()); }
          closeOrEnd();
        }
        return { t: 'fn', f: p.v, args };
      }
      default: throw Err('Syntax error');
    }
  };
  const postfix = () => { let a = primary(); while (t[i] && t[i].k === 'post') a = { t: 'post', op: t[i++].v, a }; return a; };
  let unary;
  const pow = () => { const a = postfix(); if (isOp('^', 'root', 'ncr', 'npr')) { const op = t[i++].v; return { t: 'bin', op, a, b: unary() }; } return a; };
  unary = () => { if (isOp('-')) { i++; return { t: 'neg', a: unary() }; } if (isOp('+')) { i++; return unary(); } return pow(); };
  const mul = level(['*', '/', 'mod'], unary);
  const add = level(['+', '-'], mul);
  const shift = level(['shl', 'shr'], add);
  const band = level(['and'], shift);
  const bxor = level(['xor'], band);
  expr = level(['or'], bxor);
  const ast = expr();
  if (i < t.length) throw Err('Syntax error');
  return ast;
}

/* ---------- evaluation ---------- */
/** Trim float noise (0.1 + 0.2 -> 0.3) for display and storage. */
const clean = v => (typeof v === 'number' && isFinite(v) ? parseFloat(v.toPrecision(15)) : v);
function lead(c, v) { if (c.tr && !c.tr.length) c.tr.push({ y: v, lab: fmtS(v) }); }
/** Record one step for the Scope's step view ("+3" when it continues a chain). */
function step(c, r, sym, a, b) {
  if (!c.tr) return;
  const last = c.tr[c.tr.length - 1];
  c.tr.push({ y: r, lab: last && last.y === a ? sym + fmtS(b) : fmtS(a) + sym + fmtS(b) });
}
function ev(n, c) {
  switch (n.t) {
    case 'num': lead(c, n.v); return n.v;
    case 'var': if (c.x === undefined) throw Err('Needs x'); lead(c, c.x); return c.x;
    case 'ref': { const v = refVal(n.id, c); lead(c, v); return v; }
    case 'grp': return ev(n.a, c);
    case 'neg': return -ev(n.a, c);
    case 'post': {
      const a = ev(n.a, c);
      const r = n.op === '!' ? fact(a) : a / 100;
      if (c.tr) c.tr.push({ y: r, lab: fmtS(a) + n.op });
      return r;
    }
    case 'bin': {
      let a, b;
      // "50 + 10%" means 50 + 10% of 50, like a desk calculator.
      if ((n.op === '+' || n.op === '-') && n.b.t === 'post' && n.b.op === '%') { a = ev(n.a, c); b = a * ev(n.b.a, c) / 100; }
      else { a = ev(n.a, c); b = ev(n.b, c); }
      const r = binop(n.op, a, b, c);
      step(c, r, OPS[n.op].s, a, b);
      return r;
    }
    case 'fn': {
      const args = n.args.map(x => ev(x, c));
      const r = FN[n.f].f(c, args);
      if (c.tr) c.tr.push({ y: r, lab: FN[n.f].l + (args.length === 1 ? fmtS(args[0]) : '(…)') });
      return r;
    }
  }
  throw Err('Syntax error');
}
/** Parsed AST of a note, cached until its tokens change. */
function astOf(b) {
  const key = JSON.stringify(b.tokens);
  if (b._key !== key) {
    b._key = key;
    try { b._ast = parse(b.tokens); b._perr = null; } catch (e) { b._ast = null; b._perr = e instanceof CalcError ? e.message : 'Syntax error'; }
  }
  if (b._perr) throw Err(b._perr);
  return b._ast;
}
/** Value of the note `id` inside context `c` (honours overrides, memo and loops). */
function refVal(id, c) {
  if (c.over && c.over.has(id)) return c.over.get(id);
  if (c.stack.includes(id)) throw Err('Circular link');
  const b = byId(id);
  if (!b || b.type === 'text') throw Err('Missing note');
  if (b.type === 'fn' && !b.inputs.length) throw Err('No inputs yet');
  if (c.memo && c.x === undefined && c.memo.has(id)) return c.memo.get(id);
  const v = ev(astOf(b), { x: c.x, deg: b.ang === 'deg', prg: b.mode === 'prg', stack: [...c.stack, id], tr: null, memo: c.memo, over: c.over });
  if (c.memo && c.x === undefined) c.memo.set(id, v);
  return v;
}
/** Does this AST depend on x, directly or through linked notes? (curves) */
function usesX(ast, stack) {
  switch (ast.t) {
    case 'var': return true;
    case 'ref': {
      if (stack.includes(ast.id)) return false;
      const b = byId(ast.id); if (!b || b.type === 'text') return false;
      try { return usesX(astOf(b), [...stack, ast.id]); } catch (e) { return false; }
    }
    case 'grp': case 'neg': case 'post': return usesX(ast.a, stack);
    case 'bin': return usesX(ast.a, stack) || usesX(ast.b, stack);
    case 'fn': return ast.args.some(a => usesX(a, stack));
    default: return false;
  }
}
/** Throw if any linked note is missing or loops back. */
function checkRefs(ast, stack) {
  if (ast.t === 'ref') {
    if (stack.includes(ast.id)) throw Err('Circular link');
    const b = byId(ast.id); if (!b || b.type === 'text') throw Err('Missing note');
    checkRefs(astOf(b), [...stack, ast.id]);
  } else if (ast.a) checkRefs(ast.a, stack);
  if (ast.b) checkRefs(ast.b, stack);
  if (ast.args) ast.args.forEach(x => checkRefs(x, stack));
}
/** Recompute one note's cached result (_val, _func, _err, _empty). */
function compute(b, memo) {
  b._empty = false;
  if (b.type === 'text') { b._val = null; b._err = null; b._func = false; return; }
  if (b.type === 'fn' && !b.inputs.length) { b._val = null; b._err = null; b._func = false; b._empty = true; return; }
  try {
    const ast = astOf(b);
    b._func = usesX(ast, [b.id]);
    if (b._func) { b._val = null; checkRefs(ast, [b.id]); }
    else b._val = clean(refVal(b.id, { x: undefined, stack: [], memo }));
    b._err = null;
  } catch (e) {
    b._err = e instanceof CalcError ? e.message : 'Error';
    b._val = null;
  }
}
function recomputeAll() { const memo = new Map(); S.blocks.forEach(b => compute(b, memo)); }
/** Evaluate a curve at x; NaN where undefined. */
function fnAt(ast, ctx, x) {
  try { const v = ev(ast, { ...ctx, x, tr: null, memo: null }); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; }
}
function blockCtx(b) { return { deg: b.ang === 'deg', prg: b.mode === 'prg', stack: [b.id] }; }
/** Step-by-step reduction of an equation, for the Steps view. */
function traceOf(ast, ctx) {
  const c = { ...ctx, x: undefined, tr: [], memo: new Map() };
  try { ev(ast, c); return c.tr; } catch (e) { return null; }
}
/** Value of note `b` if note `inputId` had value `v` (Sweep view). */
function valueWith(b, inputId, v) {
  try {
    const r = ev(astOf(b), { x: undefined, deg: b.ang === 'deg', prg: b.mode === 'prg', stack: [b.id], tr: null, memo: null, over: new Map([[inputId, v]]) });
    return typeof r === 'number' ? r : NaN;
  } catch (e) { return NaN; }
}

/* ---------- graph helpers (who feeds whom) ---------- */
/** ids a note reads from (its inputs), in order, unique. */
const parentsOf = b => [...new Set(b.tokens.filter(t => t.k === 'ref').map(t => t.id))];
/** Map id -> array of notes that read from it. */
function childMap() {
  const m = new Map();
  for (const b of S.blocks) for (const p of parentsOf(b)) { if (!m.has(p)) m.set(p, []); m.get(p).push(b.id); }
  return m;
}
/** Every note downstream of `id` (transitively). */
function downstream(id, cm = childMap()) {
  const out = new Set(), q = [id];
  while (q.length) for (const c of cm.get(q.shift()) || []) if (!out.has(c)) { out.add(c); q.push(c); }
  return out;
}
/** Every note upstream of `id` (transitively). */
function upstream(id) {
  const out = new Set(), q = [id];
  while (q.length) { const b = byId(q.shift()); if (!b) continue; for (const p of parentsOf(b)) if (!out.has(p)) { out.add(p); q.push(p); } }
  return out;
}

/* =====================================================================
   20 · FORMAT — numbers and equations as text
   ===================================================================== */

/** Insert digit-group separators into an integer string. */
function groupInt(i) {
  const g = S.set.group;
  if (!g || i.length < 4) return i;
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, g === ' ' ? ' ' : g);
}
/**
 * Format a number for display. Options: dp (decimal places, -1 = auto),
 * sig (significant digits in auto mode), group (false = no separators).
 * Very large/small values switch to ᴇ notation.
 */
function fmt(v, opt = {}) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'number' || Number.isNaN(v)) return 'Error';
  if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
  const dp = opt.dp !== undefined ? opt.dp : S.set.dp;
  const sig = opt.sig || 12;
  const neg = v < 0;
  const a = Math.abs(v);
  let mant, exp = null;
  if (a !== 0 && (a >= 1e15 || a < 1e-9)) {
    let [m, e] = a.toExponential(dp >= 0 ? Math.min(dp, 12) : sig - 1).split('e');
    if (dp < 0 && m.includes('.')) m = m.replace(/\.?0+$/, '');
    mant = m; exp = String(+e);
  } else if (dp >= 0) {
    mant = a.toFixed(Math.min(dp, 20));
  } else {
    const p = parseFloat(a.toPrecision(sig));
    mant = String(p);
    if (mant.includes('e')) mant = p.toFixed(20).replace(/\.?0+$/, '');
  }
  const [i, f] = mant.split('.');
  let out = (opt.group === false ? i : groupInt(i)) + (f ? S.set.dec + f : '');
  if (exp !== null) out += 'ᴇ' + exp.replace('-', '−');
  return (neg && out !== '0' ? '−' : '') + out;
}
/** Short form for labels, chips and graph tags. */
const fmtS = v => fmt(v, { sig: 6, dp: -1 });
/**
 * HTML for big dot-matrix numbers: the decimal mark becomes a crisp accent
 * dot and group separators are dimmed, because dot faces draw "." and ","
 * almost identically.
 */
function numHTML(str) {
  const dec = S.set.dec, g = S.set.group === ' ' ? ' ' : S.set.group;
  const k = str.indexOf(dec);
  const [i, f] = k >= 0 && /\d/.test(str[k - 1] || '') ? [str.slice(0, k), str.slice(k + 1)] : [str, null];
  const gi = g ? esc(i).split(g).join(`<span class="gs">${esc(g)}</span>`) : esc(i);
  return gi + (f !== null ? `<span class="dm">${esc(dec)}</span>` + esc(f) : '');
}
const BASES = { 16: 'HEX', 10: 'DEC', 8: 'OCT', 2: 'BIN' };
function groupBase(d, b) {
  const n = b === 2 || b === 16 ? 4 : 3;
  return d.replace(new RegExp(`\\B(?=([0-9A-F]{${n}})+(?![0-9A-F]))`, 'g'), ' ');
}
/** Integer in another base (two's complement for negatives in non-decimal). */
function fmtBase(v, b) {
  if (typeof v !== 'number' || !isFinite(v)) return 'Error';
  const n = BigInt.asIntN(64, BigInt(Math.trunc(v)));
  if (b === 10) { const s = n.toString().replace('-', ''); return (n < 0n ? '−' : '') + groupInt(s); }
  return groupBase(BigInt.asUintN(64, n).toString(b).toUpperCase(), b);
}
/** A number token as typed (keeps trailing "." and partial exponents). */
function numText(t) {
  let v = String(t.v);
  const neg = v[0] === '-'; if (neg) v = v.slice(1);
  if (t.b && t.b !== 10) return (neg ? '−' : '') + groupBase(v.toUpperCase(), t.b);
  const [m, e] = v.split(/e/i);
  const [i, f] = m.split('.');
  let out = groupInt(i) + (f !== undefined ? S.set.dec + f : '');
  if (e !== undefined) out += 'ᴇ' + e.replace('+', '').replace('-', '−');
  return (neg ? '−' : '') + out;
}
const colorOf = b => S.set.palette[(b.c || 0) % 6];
/** Second gradient colour of a note (defaults to the next palette colour). */
const color2Of = b => S.set.palette[(b.c2 !== undefined ? b.c2 : (b.c || 0) + 1) % 6];
/** Black or white text, whichever reads better on `hex`. */
function inkFor(hex) {
  const h = String(hex).replace('#', '');
  if (h.length < 6) return '#FFFFFF';
  const [r, g, bl] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl > 0.42 ? '#121313' : '#FFFFFF';
}
const refName = b => (b ? (b.name || (b.type === 'fn' ? FOPS[b.op].name : '#' + b.n)) : '?');
/**
 * Equation as text. With `vals`, linked notes show their current number
 * (when it is short enough) so titles read "1,450 + 365.5", not "#1 + #2".
 */
function tokText(tokens, opt = {}) {
  const sep = S.set.dec === ',' ? '; ' : ', ';
  let s = tokens.map(t => {
    switch (t.k) {
      case 'num': return numText(t);
      case 'op': return OPS[t.v] ? ` ${OPS[t.v].s} ` : t.v;
      case 'ref': {
        const b = byId(t.id);
        if (!b) return '?';
        if (opt.vals && !b._func && !b._err && typeof b._val === 'number') {
          const v = fmtS(b._val);
          if (v.length <= (opt.max || 9)) return b._val < 0 ? `(${v})` : v;
        }
        return refName(b);
      }
      case 'fn': return FN[t.v] ? FN[t.v].l + '(' : '(';
      case 'lp': return '(';
      case 'rp': return ')';
      case 'comma': return sep;
      case 'const': return t.v === 'pi' ? 'π' : 'e';
      case 'var': return 'x';
      case 'post': return t.v;
      default: return '';
    }
  }).join('').replace(/\s+/g, ' ').trim();
  if (opt.close !== false) s += ')'.repeat(Math.max(0, balance(tokens)));
  return s;
}
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
/** The text a note is known by: its name, else its equation with numbers. */
function label(b, n = 30) {
  if (b.type === 'text') return trunc((b.text || 'Note').split('\n')[0] || 'Note', n);
  return trunc(b.name || (b.type === 'fn' ? FOPS[b.op].name : tokText(b.tokens, { vals: true })), n);
}
/** A number token for value v (in the current base when in PRG mode). */
const numTok = (v, base = 10) => {
  if (base !== 10) { const n = BigInt.asIntN(64, BigInt(Math.trunc(v || 0))); return { k: 'num', v: (n < 0n ? '-' : '') + (n < 0n ? -n : n).toString(base).toUpperCase(), b: base }; }
  return { k: 'num', v: String(clean(v)).replace('e+', 'e'), b: 10 };
};

/* ---------- function nodes (many inputs -> one answer) ---------- */
/** Operators a function node can apply to its inputs. `min` = minimum inputs that make sense. */
const FOPS = {
  sum:    { l: 'Σ',   name: 'Sum',        hint: 'Adds every input' },
  prod:   { l: 'Π',   name: 'Product',    hint: 'Multiplies every input' },
  sub:    { l: '−',   name: 'Subtract',   hint: 'First input minus the rest' },
  div:    { l: '÷',   name: 'Divide',     hint: 'First input divided by the rest' },
  avg:    { l: 'x̄',   name: 'Average',    hint: 'Mean of the inputs' },
  min:    { l: '↓',   name: 'Minimum',    hint: 'Smallest input' },
  max:    { l: '↑',   name: 'Maximum',    hint: 'Largest input' },
  range:  { l: '↕',   name: 'Range',      hint: 'Largest minus smallest' },
  pow:    { l: 'xʸ',  name: 'Power',      hint: 'A to the power of B' },
  pct:    { l: '%',   name: 'Percent of', hint: 'A percent of B' },
  custom: { l: 'ƒ',   name: 'Formula',    hint: 'Your own formula using A, B, C…' },
};
const LETTERS = 'ABCDFGHIJKLMNOPQ'; // skips E so it never clashes with the constant e
/** Build a function node's equation from its operator and inputs. */
function fnTokens(b) {
  const ins = b.inputs.filter(id => byId(id));
  if (!ins.length) return [];
  const R = id => ({ k: 'ref', id });
  const join = (list, sepTok) => list.flatMap((t, i) => (i ? [clone(sepTok), t] : [t]));
  const call = name => [{ k: 'fn', v: name }, ...join(ins.map(R), { k: 'comma' }), { k: 'rp' }];
  switch (b.op) {
    case 'sum': return call('sum');
    case 'avg': return call('avg');
    case 'min': return call('min');
    case 'max': return call('max');
    case 'range': return [...call('max'), { k: 'op', v: '-' }, ...call('min')];
    case 'prod': return join(ins.map(R), { k: 'op', v: '*' });
    case 'sub': return join(ins.map(R), { k: 'op', v: '-' });
    case 'div': return join(ins.map(R), { k: 'op', v: '/' });
    case 'pow': return join(ins.slice(0, 2).map(R), { k: 'op', v: '^' });
    case 'pct': return ins.length < 2 ? [R(ins[0])] : [R(ins[0]), { k: 'op', v: '*' }, R(ins[1]), { k: 'op', v: '/' }, { k: 'num', v: '100', b: 10 }];
    case 'custom': {
      const vars = {}; ins.forEach((id, i) => (vars[LETTERS[i]] = id));
      return textToTokens(b.formula || ins.map((_, i) => LETTERS[i]).join('+'), vars);
    }
  }
  return [];
}

/* =====================================================================
   30 · UI BASICS — element refs, sound, toasts, the LED, undo/redo
   ===================================================================== */
const root = document.documentElement;
const deskEl = $('#desk'), worldEl = $('#world'), dragLayer = $('#dragLayer'), linksEl = $('#links');
const calcEl = $('#calc'), screenEl = $('#screen'), exprEl = $('#expr'), resEl = $('#res'), topEl = $('#scrTop'), prgEl = $('#prg');
const tapeEl = $('#tape'), scopeEl = $('#scope'), cfgEl = $('#cfg'), popEl = $('#pop'), statsEl = $('#stats'), trashEl = $('#trash'), toastEl = $('#toast');
/** id -> note element */
const els = new Map();
/** ids of selected notes */
const selected = new Set();
/** UI-only state that is never saved. */
const UI = { selLink: null, linkDrag: null, space: false, dragging: false, zTop: 1, clip: null, clipText: '' };

/* ---------- sound: tiny synthesised clicks and tones (Web Audio) ---------- */
let AC = null, NOISE = null;
/** Pentatonic scale for selection pulses, so selecting several notes plays a little melody. */
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760, 2093];
let lastSfx = { k: '', t: 0 };
/**
 * Calculator key sounds, one set per "switch" type (Config → Details → Key switches).
 * Each plays key (digits, n = digit value), op (everything else), eq (=) and back (⌫ CE C Del).
 */
const SWITCHES = {
  clicky: {
    label: 'Clicky',
    key: (b, w) => { w(0.9, 2400, 0.012); b(3200, 0.02, 'square', 0, 0.05); w(0.5, 3600, 0.01, 0, 0.045); },
    op: (b, w) => { w(0.9, 1800, 0.014); b(1700, 0.03, 'square', 0, 0.06); w(0.45, 3000, 0.01, 0, 0.05); },
    eq: (b, w) => { w(0.6); b(880, 0.07, 'sine', 0, 0.32); b(1320, 0.12, 'sine', 0.06, 0.28); },
    back: (b, w) => { w(0.8, 1200, 0.016); b(900, 0.07, 'square', 0, 0.07, 420); },
  },
  tactile: {
    label: 'Tactile',
    key: (b, w) => { w(0.7, 0, 0.03, 1500); b(260, 0.045, 'sine', 0, 0.35, 140); },
    op: (b, w) => { w(0.7, 0, 0.03, 1100); b(220, 0.05, 'sine', 0, 0.38, 120); },
    eq: (b, w) => { w(0.6, 0, 0.035, 1200); b(196, 0.06, 'sine', 0, 0.4, 110); b(660, 0.12, 'triangle', 0.03, 0.16); },
    back: (b, w) => { w(0.6, 0, 0.045, 650); b(150, 0.1, 'sine', 0, 0.45, 70); },
  },
  soft: {
    label: 'Soft',
    key: (b, w) => { w(0.32, 0, 0.025, 900); b(180, 0.03, 'sine', 0, 0.12, 120); },
    op: (b, w) => { w(0.32, 0, 0.028, 750); b(160, 0.035, 'sine', 0, 0.13, 110); },
    eq: (b, w) => { w(0.3, 0, 0.03, 800); b(523, 0.14, 'sine', 0.01, 0.1); },
    back: (b, w) => { w(0.3, 0, 0.045, 450); b(120, 0.07, 'sine', 0, 0.16, 65); },
  },
  tonal: {
    label: 'Tonal',
    key: b => b(880, 0.07, 'sine', 0, 0.22),
    op: b => b(660, 0.08, 'triangle', 0, 0.2),
    eq: b => { b(880, 0.08, 'sine', 0, 0.24); b(1320, 0.14, 'sine', 0.06, 0.22); },
    back: b => b(440, 0.13, 'sine', 0, 0.24, 220),
  },
  melodic: {
    label: 'Melodic',
    // every digit has its own note on a pentatonic scale, so typing numbers plays tunes
    key: (b, w, n) => { const f = PENTA[clamp(n, 0, PENTA.length - 1)]; b(f, 0.2, 'sine', 0, 0.2); b(f * 2, 0.06, 'triangle', 0, 0.04); },
    op: b => { b(392, 0.16, 'triangle', 0, 0.16); b(587.33, 0.16, 'sine', 0, 0.08); },
    eq: b => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => b(f, 0.22, 'sine', i * 0.05, 0.18)); },
    back: b => { b(622.25, 0.1, 'sine', 0, 0.2); b(466.16, 0.16, 'sine', 0.07, 0.2); },
  },
  retro: {
    label: 'Retro',
    key: b => b(1046.5, 0.04, 'square', 0, 0.08),
    op: b => b(783.99, 0.05, 'square', 0, 0.08),
    eq: b => { b(1046.5, 0.06, 'square', 0, 0.08); b(1567.98, 0.1, 'square', 0.06, 0.08); },
    back: b => b(600, 0.13, 'square', 0, 0.08, 140),
  },
  typewriter: {
    label: 'Typewriter',
    key: (b, w) => { w(1, 1500, 0.03); b(120, 0.03, 'square', 0, 0.07); w(0.35, 2500, 0.012, 0, 0.035); },
    op: (b, w) => { w(1, 1100, 0.035); b(100, 0.035, 'square', 0, 0.08); w(0.4, 2200, 0.014, 0, 0.04); },
    eq: (b, w) => { w(0.8, 0, 0.05, 2000); b(2093, 0.45, 'sine', 0.05, 0.18); b(4186, 0.2, 'sine', 0.05, 0.04); },
    back: (b, w) => { w(0.8, 700, 0.045); b(85, 0.07, 'square', 0, 0.1); },
  },
};
/** Which key sound an action makes: [kind, n]. */
function keySfx(a) {
  if (/^[0-9A-F]$/.test(a)) return ['key', parseInt(a, 16)];
  if (a === 'dot') return ['key', 10];
  if (a === 'eq') return ['eq', 0];
  if (/^(back|ce|clear|canceledit|delfwd)$/.test(a)) return ['back', 0];
  return ['op', 0];
}
/**
 * Play an interface sound. `n` is the pitch step for 'sel' and the digit for 'key'.
 * Kinds: key op eq back pop merge drop del err tick soft sel desel link menu whoosh zoom.
 */
function sfx(kind, n = 0) {
  if (!S.set.sound) return;
  const now = performance.now();
  if (lastSfx.k === kind && now - lastSfx.t < 28) return; // avoid machine-gun repeats
  lastSfx = { k: kind, t: now };
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
  } catch (e) { return; }
  const t = AC.currentTime, vol = (S.set.volume / 100) * 0.45;
  if (!NOISE) {
    NOISE = AC.createBuffer(1, AC.sampleRate * 0.05, AC.sampleRate);
    const d = NOISE.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const blip = (f, d, type = 'sine', at = 0, v = 1, f2) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t + at);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + at + d);
    g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol * v, t + at + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
    o.connect(g); g.connect(AC.destination); o.start(t + at); o.stop(t + at + d + 0.03);
  };
  const noise = (v = 1, hp = 2400, d = 0.018, lp, at = 0) => {
    const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    s.buffer = NOISE; f.type = lp ? 'lowpass' : 'highpass'; f.frequency.value = lp || hp;
    g.gain.setValueAtTime(vol * v, t + at); g.gain.exponentialRampToValueAtTime(0.0001, t + at + d);
    s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t + at); s.stop(t + at + d + 0.02);
  };
  switch (kind) {
    case 'key': case 'op': case 'eq': case 'back': (SWITCHES[S.set.switches] || SWITCHES.clicky)[kind](blip, noise, n); break;
    case 'pop': blip(320, 0.12, 'sine', 0, 0.35, 920); break;
    case 'merge': blip(523, 0.18, 'sine', 0, 0.22); blip(659, 0.18, 'sine', 0.04, 0.2); blip(784, 0.24, 'sine', 0.08, 0.2); break;
    case 'drop': blip(660, 0.06, 'triangle', 0, 0.3); blip(990, 0.06, 'triangle', 0.04, 0.2); break;
    case 'del': blip(500, 0.16, 'sine', 0, 0.28, 120); break;
    case 'err': blip(140, 0.16, 'square', 0, 0.12); blip(110, 0.16, 'square', 0.08, 0.1); break;
    case 'tick': noise(0.5, 3000); break;
    case 'soft': noise(0.35, 3200); break;
    case 'sel': { const f = PENTA[clamp(n, 0, PENTA.length - 1)]; blip(f, 0.22, 'sine', 0, 0.16); blip(f * 2, 0.08, 'triangle', 0, 0.03); break; }
    case 'desel': blip(392, 0.12, 'sine', 0, 0.1, 330); break;
    case 'link': blip(740, 0.09, 'triangle', 0, 0.22); blip(1109, 0.14, 'sine', 0.05, 0.2); break;
    case 'menu': noise(0.3, 2600); blip(1240, 0.05, 'sine', 0, 0.08); break;
    case 'whoosh': noise(0.5, 0, 0.16, 900); break;
    case 'zoom': noise(0.18, 4000, 0.01); break;
  }
}

/* ---------- toast & status LED ---------- */
let toastT = 0;
function toast(msg) {
  toastEl.textContent = msg; toastEl.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 2400);
}
let ledT = 0;
function led(kind) {
  const l = $('#led'); l.className = 'led ' + kind;
  clearTimeout(ledT); ledT = setTimeout(() => (l.className = 'led'), kind === 'err' ? 900 : 500);
}

/* ---------- undo / redo (snapshots of the board, not settings) ---------- */
const UNDO = [], REDO = [];
const snapData = () => serial({ blocks: S.blocks, nextId: S.nextId, vlinks: S.vlinks, bends: S.bends });
/** Call BEFORE changing the board. Pass a snapshot taken earlier to record that state instead. */
function snapshot(data) { UNDO.push(data || snapData()); if (UNDO.length > 120) UNDO.shift(); REDO.length = 0; updateBar(); }
function restore(json) {
  const d = JSON.parse(json);
  S.blocks = d.blocks; S.nextId = d.nextId; S.vlinks = d.vlinks || []; S.bends = d.bends || {};
  for (const [id, el] of els) if (!byId(id)) { el.remove(); els.delete(id); }
  selected.clear(); UI.selLink = null;
  if (IN.editing && !byId(IN.editing)) IN.editing = null;
  recomputeAll(); renderAll(); renderScreen(); save();
}
function undo() { if (!UNDO.length) return toast('Nothing to undo'); REDO.push(snapData()); restore(UNDO.pop()); sfx('soft'); toast('Undone'); }
function redo() { if (!REDO.length) return toast('Nothing to redo'); UNDO.push(snapData()); restore(REDO.pop()); sfx('soft'); toast('Redone'); }

/** Load a script once (jsPDF for PDF export). */
const scripts = {};
function loadScript(src) {
  if (!scripts[src]) scripts[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete scripts[src]; rej(new Error('load')); }; document.head.appendChild(s); });
  return scripts[src];
}

/* =====================================================================
   40 · CAMERA — the board can be zoomed and panned
   ---------------------------------------------------------------------
   screen = world * z + (x, y). Notes, links and the drag layer share
   one CSS transform; the dot grid follows by moving its background.
   Wheel zooms around the pointer (trackpad two-finger scroll pans),
   middle-mouse or Space + drag pans anywhere on the board.
   ===================================================================== */
const BOUND = 6000;           // half-size of the board in world px
const ZMIN = 0.2, ZMAX = 3;

function applyCam() {
  const { x, y, z } = S.cam;
  const t = `translate3d(${x}px,${y}px,0) scale(${z})`;
  worldEl.style.transform = t;
  dragLayer.style.transform = t;
  const g = 22 * z;
  deskEl.style.backgroundSize = `${g}px ${g}px`;
  deskEl.style.backgroundPosition = `${x + g / 2}px ${y + g / 2}px`;
  const pct = $('#zoomPct'); if (pct) pct.textContent = Math.round(z * 100) + '%';
}
const toWorld = (sx, sy) => ({ x: (sx - S.cam.x) / S.cam.z, y: (sy - S.cam.y) / S.cam.z });
const toScreen = (wx, wy) => ({ x: wx * S.cam.z + S.cam.x, y: wy * S.cam.z + S.cam.y });
const rectToWorld = r => { const p = toWorld(r.x, r.y); return { x: p.x, y: p.y, w: r.w / S.cam.z, h: r.h / S.cam.z }; };
const rectToScreen = r => { const p = toScreen(r.x, r.y); return { x: p.x, y: p.y, w: r.w * S.cam.z, h: r.h * S.cam.z }; };
/** The part of the board currently on screen, in world coordinates. */
const viewWorld = () => rectToWorld({ x: 0, y: 0, w: innerWidth, h: innerHeight });

/** Keep the view centre inside the board bounds. */
function clampCam() {
  const v = viewWorld();
  const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
  S.cam.x += (cx - clamp(cx, -BOUND, BOUND)) * S.cam.z;
  S.cam.y += (cy - clamp(cy, -BOUND, BOUND)) * S.cam.z;
}
let camT = 0;
/** After any camera change: redraw, and drop glass blur briefly so motion stays smooth. */
function camMoved() {
  applyCam();
  root.classList.add('cam-moving');
  clearTimeout(camT);
  camT = setTimeout(() => { root.classList.remove('cam-moving'); save(); }, 160);
  if (!popEl.hidden && ['menu', 'merge', 'fn'].includes(popKind)) closePop(); // these are pinned to notes that just moved
  renderLinks();
}
function zoomAt(f, sx, sy) {
  const z0 = S.cam.z, z = clamp(z0 * f, ZMIN, ZMAX);
  if (z === z0) return;
  S.cam.x = sx - (sx - S.cam.x) * (z / z0);
  S.cam.y = sy - (sy - S.cam.y) * (z / z0);
  S.cam.z = z;
  clampCam(); camMoved();
}
/** Smooth zoom: wheel notches set a target and the camera eases toward it. */
const ZS = { target: 1, ax: 0, ay: 0, raf: 0 };
function zoomSmooth(f, sx, sy) {
  ZS.target = clamp((ZS.raf ? ZS.target : S.cam.z) * f, ZMIN, ZMAX);
  ZS.ax = sx; ZS.ay = sy;
  if (!ZS.raf) ZS.raf = requestAnimationFrame(zoomStep);
}
function zoomStep() {
  const z = S.cam.z, t = ZS.target;
  const nz = Math.abs(t - z) < 0.0006 ? t : z + (t - z) * 0.24;
  zoomAt(nz / z, ZS.ax, ZS.ay);
  ZS.raf = nz === t ? 0 : requestAnimationFrame(zoomStep);
}
function panBy(dx, dy) { S.cam.x += dx; S.cam.y += dy; clampCam(); camMoved(); }
/** Animate the camera to {x, y, z}. */
function tweenCam(to, ms = 380) {
  if (ZS.raf) { cancelAnimationFrame(ZS.raf); ZS.raf = 0; }
  const from = { ...S.cam }, t0 = performance.now();
  if (REDUCED) { Object.assign(S.cam, to); clampCam(); camMoved(); return; }
  const stepF = now => {
    const k = clamp((now - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
    S.cam.x = lerp(from.x, to.x, e); S.cam.y = lerp(from.y, to.y, e); S.cam.z = lerp(from.z, to.z, e);
    camMoved();
    if (k < 1) requestAnimationFrame(stepF);
  };
  requestAnimationFrame(stepF);
}
/** Zoom to 100% around the screen centre. */
function resetZoom() {
  const cx = innerWidth / 2, cy = innerHeight / 2, w = toWorld(cx, cy);
  tweenCam({ x: cx - w.x, y: cy - w.y, z: 1 });
  sfx('zoom');
}
/** Frame every note (or the given ones), leaving room for the calculator. */
function fitAll(list = S.blocks) {
  if (!list.length) return resetZoom();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  list.forEach(b => { const r = blockRect(b); x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
  const C = calcEl.getBoundingClientRect();
  const leftFree = C.right < innerWidth * 0.5 ? C.right + 24 : 24;
  const area = { x: leftFree, y: 70, w: innerWidth - leftFree - 24, h: innerHeight - 100 };
  const z = clamp(Math.min(area.w / (x1 - x0 || 1), area.h / (y1 - y0 || 1)), ZMIN, 1.4);
  tweenCam({ x: area.x + (area.w - (x1 - x0) * z) / 2 - x0 * z, y: area.y + (area.h - (y1 - y0) * z) / 2 - y0 * z, z });
  sfx('zoom');
}
/** Center the camera on one note. */
function focusBlock(b) {
  const r = blockRect(b), z = S.cam.z;
  tweenCam({ x: innerWidth / 2 - (r.x + r.w / 2) * z, y: innerHeight / 2 - (r.y + r.h / 2) * z, z });
}

/* ---------- input: wheel, middle-mouse, space ---------- */
/** Elements that keep the wheel for themselves. */
const WHEEL_OWN = '.device,.panel,.pop,#bar,#tape,#stats,.cfg-body,[contenteditable="true"]';
addEventListener('wheel', e => {
  const t = e.target;
  if (!(t instanceof Element) || t.closest(WHEEL_OWN)) return;
  const num = t.closest('.bv .num');
  if (num) { const b = byId(num.closest('.block').dataset.id); if (b && isPlainNum(b)) { e.preventDefault(); wheelNumber(b, e); return; } }
  const sym = t.closest('.t-fn .fsym,.t-fn .bt');
  if (sym) { const b = byId(sym.closest('.block').dataset.id); if (b && b.type === 'fn') { e.preventDefault(); wheelFnOp(b, e); return; } }
  e.preventDefault();
  const trackpadPan = !e.ctrlKey && (Math.abs(e.deltaX) > 0.5 || (e.deltaMode === 0 && !Number.isInteger(e.deltaY)));
  if (trackpadPan) { panBy(-e.deltaX, -e.deltaY); return; }
  // one mouse-wheel notch ≈ 1.2×; trackpad pinch (ctrl + small deltas) stays proportional
  let dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * innerHeight : e.deltaY;
  const pinch = e.ctrlKey && Math.abs(dy) < 15 && !Number.isInteger(dy);
  dy = clamp(dy, -80, 80);
  zoomSmooth(Math.exp(-dy * (pinch ? 0.012 : 0.0023)), e.clientX, e.clientY);
  sfx('zoom');
}, { passive: false });
/** Drag the whole board with the pointer. */
function startPan(e) {
  e.preventDefault();
  const x0 = S.cam.x, y0 = S.cam.y;
  root.classList.add('panning');
  track(e, (ev, dx, dy) => { S.cam.x = x0 + dx; S.cam.y = y0 + dy; clampCam(); camMoved(); }, () => root.classList.remove('panning'), 0);
}
addEventListener('pointerdown', e => {
  const t = e.target;
  if (!(t instanceof Element) || t.closest('.device,.panel,.pop,#bar,#tape,#stats')) return;
  if (e.button === 1 || (e.button === 0 && UI.space)) { e.stopPropagation(); startPan(e); }
}, true);
addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); }); // no autoscroll icon
addEventListener('keydown', e => {
  if (e.key === ' ' && !e.repeat && !(e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"],button'))) { UI.space = true; root.classList.add('space-pan'); e.preventDefault(); }
});
addEventListener('keyup', e => { if (e.key === ' ') { UI.space = false; root.classList.remove('space-pan'); } });
addEventListener('blur', () => { UI.space = false; root.classList.remove('space-pan'); });

/* =====================================================================
   50 · INPUT — keypad, typing, = and the calculator screen
   ---------------------------------------------------------------------
   IN.tok is the equation being typed. After =, IN.done is true and the
   screen shows the result; the next operator continues from it (as a
   linked note or a plain value, per settings).
   ===================================================================== */
const IN = { tok: [], cur: null, editing: null, done: false, prevText: '', prevVal: null, prevFunc: false, lastId: null, lastOp: null, second: false };
const last = () => IN.tok[IN.tok.length - 1];
const PRG = () => S.calc.mode === 'prg';

/* ---------- text cursor ----------
   IN.cur is a position in "slots": every character of a number is one slot,
   every other token (operator, note, bracket, function) is one slot.
   null means "at the end" (the normal typing position).
   Editing at the cursor splits the equation there, runs the ordinary
   end-of-line editing code on the left part, then joins the right part back. */
const tokSlots = t => (t.k === 'num' ? Math.max(1, String(t.v).length) : 1);
const slotCount = (tok = IN.tok) => tok.reduce((n, t) => n + tokSlots(t), 0);
/** Slot index where token i starts. */
const slotStart = i => slotCount(IN.tok.slice(0, i));
const atEnd = () => IN.cur === null || IN.cur >= slotCount();
/** Split IN.tok at slot p (a number is cut in two if p falls inside it). */
function splitAt(p) {
  const left = [], right = [];
  let acc = 0;
  for (const t of IN.tok) {
    const n = tokSlots(t);
    if (acc + n <= p) left.push(t);
    else if (acc >= p) right.push(t);
    else { const k = p - acc; left.push({ ...t, v: t.v.slice(0, k) }); right.push({ ...t, v: t.v.slice(k) }); }
    acc += n;
  }
  return { left, right };
}
/** Run an end-of-line edit at the cursor. */
function editAt(fn) {
  if (IN.done || atEnd()) { IN.cur = null; fn(); return; }
  const { left, right } = splitAt(IN.cur);
  const before = left[left.length - 1];
  IN.tok = left;
  fn();
  if (IN.done) return;                                   // the edit replaced everything
  const L = IN.tok;
  // deleting an opening bracket also deletes its partner on the right
  if (before && isOpener(before) && !L.includes(before)) {
    let d = 0;
    for (let i = 0; i < right.length; i++) {
      if (isOpener(right[i])) d++;
      else if (right[i].k === 'rp') { if (d === 0) { right.splice(i, 1); break; } d--; }
    }
  }
  IN.cur = slotCount(L);
  const a = L[L.length - 1], b = right[0];
  if (a && b && a.k === 'num' && b.k === 'num' && (a.b || 10) === (b.b || 10)) { a.v += b.v; right.shift(); } // re-join a cut number
  IN.tok = L.concat(right);
  if (IN.cur >= slotCount()) IN.cur = null;
}
/** Move the cursor by d slots. At the end, → steps out of an unclosed bracket. */
function moveCursor(d) {
  if (IN.done) { if (d < 0 && IN.lastId) { continueFromResult(); IN.cur = null; } else return; }
  const total = slotCount();
  const cur = IN.cur === null ? total : IN.cur;
  if (d > 0 && cur >= total) {
    const L = last();
    if (balance(IN.tok) > 0 && L && ENDS.has(L.k)) { IN.tok.push({ k: 'rp' }); IN.cur = null; sfx('tick'); renderScreen(); return; }
    return deny();
  }
  const n = clamp(cur + d, 0, total);
  if (n === cur) return deny();
  IN.cur = n >= total ? null : n;
  sfx('tick'); renderScreen();
}
function cursorHome() { if (IN.done || !IN.tok.length) return; IN.cur = 0; sfx('tick'); renderScreen(); }
function cursorEnd() { IN.cur = null; sfx('tick'); renderScreen(); }
/** Forward delete (Delete key) at the cursor. */
function deleteForward() {
  if (atEnd()) return deny();
  IN.cur = IN.cur + 1;
  if (IN.cur >= slotCount()) IN.cur = null;
  editAt(back);
  renderScreen();
}
/** Actions that change the equation and therefore happen at the cursor. */
const EDIT_ACTS = /^([0-9A-F]|dot|exp10|[-+*/^()]|mod|root|ncr|npr|and|or|xor|shl|shr|comma|pct|fact|recip|sqr|sqrt|neg|abs|cbrt|not|a?sin|a?cos|a?tan|sinh|cosh|tanh|ln|log2?|exp|p10|p2|floor|ceil|round|sum|avg|min|max|pi|e|x|rand|ans|ce|back|mr)$/;

/* ---------- key layouts (l = label, a = action, l2/a2 = 2nd function, c = style) ---------- */
const PAD_STD = [
  { l: '%', a: 'pct', c: 'op' }, { l: 'CE', a: 'ce', c: 'clr' }, { l: 'C', a: 'clear', c: 'clr' }, { l: '⌫', a: 'back', c: 'op', aria: 'Backspace' },
  { l: '¹⁄ₓ', a: 'recip', c: 'op', aria: 'Reciprocal' }, { l: 'x²', a: 'sqr', c: 'op', aria: 'Square' }, { l: '√x', a: 'sqrt', c: 'op', aria: 'Square root' }, { l: '÷', a: '/', c: 'op', aria: 'Divide' },
  { l: '7', a: '7' }, { l: '8', a: '8' }, { l: '9', a: '9' }, { l: '×', a: '*', c: 'op', aria: 'Multiply' },
  { l: '4', a: '4' }, { l: '5', a: '5' }, { l: '6', a: '6' }, { l: '−', a: '-', c: 'op', aria: 'Subtract' },
  { l: '1', a: '1' }, { l: '2', a: '2' }, { l: '3', a: '3' }, { l: '+', a: '+', c: 'op', aria: 'Add' },
  { l: '±', a: 'neg', c: 'op', aria: 'Change sign' }, { l: '0', a: '0' }, { l: '.', a: 'dot', aria: 'Decimal point' }, { l: '=', a: 'eq', c: 'eq', aria: 'Equals' },
];
const PAD_SCI = [
  { l: '2nd', a: '2nd', c: 'alt' }, { l: 'DEG', a: 'angle' }, { l: 'π', a: 'pi' }, { l: 'e', a: 'e' }, { l: 'x', a: 'x', c: 'var', aria: 'Variable x' },
  { l: 'sin', a: 'sin', l2: 'sin⁻¹', a2: 'asin' }, { l: 'cos', a: 'cos', l2: 'cos⁻¹', a2: 'acos' }, { l: 'tan', a: 'tan', l2: 'tan⁻¹', a2: 'atan' }, { l: '(', a: '(' }, { l: ')', a: ')' },
  { l: 'ln', a: 'ln', l2: 'sinh', a2: 'sinh' }, { l: 'log', a: 'log', l2: 'cosh', a2: 'cosh' }, { l: 'eˣ', a: 'exp', l2: 'tanh', a2: 'tanh' }, { l: '10ˣ', a: 'p10', l2: '2ˣ', a2: 'p2' }, { l: 'xʸ', a: '^', l2: 'ʸ√x', a2: 'root' },
  { l: 'n!', a: 'fact', l2: 'nCr', a2: 'ncr' }, { l: '|x|', a: 'abs', l2: 'nPr', a2: 'npr' }, { l: 'mod', a: 'mod', l2: 'log₂', a2: 'log2' }, { l: '∛x', a: 'cbrt', l2: '⌊x⌋', a2: 'floor' }, { l: 'EXP', a: 'exp10', l2: '⌈x⌉', a2: 'ceil' },
  { l: 'Σ', a: 'sum', l2: 'avg', a2: 'avg' }, { l: 'min', a: 'min', l2: 'max', a2: 'max' }, { l: ',', a: 'comma', aria: 'Argument separator' }, { l: 'rand', a: 'rand', l2: 'round', a2: 'round' }, { l: 'ANS', a: 'ans', aria: 'Last answer' },
];
const PAD_PRG = [
  { l: 'A', a: 'A', c: 'hex' }, { l: 'B', a: 'B', c: 'hex' }, { l: 'C', a: 'C', c: 'hex' }, { l: '(', a: '(' }, { l: ')', a: ')' },
  { l: 'D', a: 'D', c: 'hex' }, { l: 'E', a: 'E', c: 'hex' }, { l: 'F', a: 'F', c: 'hex' }, { l: 'mod', a: 'mod' }, { l: '≪', a: 'shl', aria: 'Shift left' },
  { l: 'AND', a: 'and' }, { l: 'OR', a: 'or' }, { l: 'XOR', a: 'xor' }, { l: 'NOT', a: 'not' }, { l: '≫', a: 'shr', aria: 'Shift right' },
  { l: 'HEX', a: 'b16', c: 'base' }, { l: 'DEC', a: 'b10', c: 'base' }, { l: 'OCT', a: 'b8', c: 'base' }, { l: 'BIN', a: 'b2', c: 'base' }, { l: 'ANS', a: 'ans' },
];
function keyHTML(k) {
  return `<button class="k ${k.c || ''}" data-act="${esc(k.a)}"${k.a2 ? ` data-act2="${esc(k.a2)}" data-l="${esc(k.l)}" data-l2="${esc(k.l2)}"` : ''} aria-label="${esc(k.aria || k.l)}" tabindex="-1">${k.l2 ? `<i>${esc(k.l2)}</i>` : ''}<span class="kl">${esc(k.l)}</span></button>`;
}
function buildPads() {
  $('#padStd').innerHTML = PAD_STD.map(keyHTML).join('');
  $('#padSci').innerHTML = PAD_SCI.map(keyHTML).join('');
  $('#padPrg').innerHTML = PAD_PRG.map(keyHTML).join('');
}
/** Refresh key labels/disabled states for the current mode, base and 2nd. */
function updateKeys() {
  const prg = PRG();
  $$('#calc .k').forEach(k => {
    const a = k.dataset.act;
    let dis = false;
    if (prg && /^[0-9A-F]$/.test(a)) dis = parseInt(a, 16) >= S.calc.base;
    if (prg && ['dot', 'recip', 'sqrt'].includes(a)) dis = true;
    k.classList.toggle('dis', dis);
    if (k.dataset.act2) {
      k.querySelector('.kl').textContent = IN.second ? k.dataset.l2 : k.dataset.l;
      k.querySelector('i').textContent = IN.second ? k.dataset.l : k.dataset.l2;
    }
    if (a === 'angle') k.querySelector('.kl').textContent = S.set.angle.toUpperCase();
    if (a === 'dot') k.querySelector('.kl').textContent = S.set.dec;
    if (a === '2nd') k.classList.toggle('lit', IN.second);
    if (k.classList.contains('base')) k.classList.toggle('on', +a.slice(1) === S.calc.base);
  });
  $$('#mem button').forEach(b => { b.disabled = ['mc', 'mr'].includes(b.dataset.act) && S.memory === null; });
  const comma = $('#padSci .k[data-act="comma"] .kl'); if (comma) comma.textContent = S.set.dec === ',' ? ';' : ',';
}

/* ---------- editing the token list ---------- */
function startFresh() { if (IN.done) { IN.tok = []; IN.done = false; } }
/** Token that stands for the last result (a link to its note, or its value). */
function contToken() {
  if (S.set.cont === 'link' && IN.lastId && byId(IN.lastId)) return { k: 'ref', id: IN.lastId };
  if (IN.prevVal !== null && IN.prevVal !== undefined) return numTok(IN.prevVal, PRG() ? S.calc.base : 10);
  if (IN.lastId && byId(IN.lastId)) return { k: 'ref', id: IN.lastId };
  return null;
}
function continueFromResult() {
  if (!IN.done) return;
  const c = contToken();
  IN.tok = c ? [c] : [];
  IN.done = false;
}
function deny() { sfx('err'); screenEl.classList.remove('shake'); void screenEl.offsetWidth; screenEl.classList.add('shake'); }
/** [start, end) of the last complete operand (number, note, group, function call). */
function operandRange(tok) {
  let i = tok.length - 1;
  if (i < 0 || !ENDS.has(tok[i].k)) return null;
  const end = tok.length;
  while (i >= 0 && tok[i].k === 'post') i--;
  if (i < 0) return null;
  if (tok[i].k === 'rp') {
    let d = 0;
    for (; i >= 0; i--) { if (tok[i].k === 'rp') d++; else if (isOpener(tok[i])) { d--; if (d === 0) break; } }
    if (i < 0) return null;
  }
  return [i, end];
}
function digit(d) {
  startFresh();
  if (PRG()) { if (parseInt(d, 16) >= S.calc.base) return deny(); }
  else if (/[A-F]/.test(d)) return deny();
  const L = last();
  if (L && L.k === 'num') {
    if ((L.v.replace(/[-.e]/gi, '')).length >= 30) return deny();
    if (L.v === '0') L.v = d; else if (L.v === '-0') L.v = '-' + d; else L.v += d;
  } else IN.tok.push({ k: 'num', v: d, b: PRG() ? S.calc.base : 10 });
}
function dot() {
  if (PRG()) return deny();
  startFresh();
  const L = last();
  if (L && L.k === 'num') { if (/[.e]/i.test(L.v)) return deny(); L.v += '.'; }
  else IN.tok.push({ k: 'num', v: '0.', b: 10 });
}
function expKey() {
  if (PRG()) return deny();
  startFresh();
  const L = last();
  if (L && L.k === 'num') { if (/e/i.test(L.v)) return deny(); L.v += 'e'; }
  else IN.tok.push({ k: 'num', v: '1e', b: 10 });
}
function op(o) {
  continueFromResult();
  let L = last();
  if (!L) { if (o === '-') { IN.tok.push({ k: 'op', v: '-' }); return; } IN.tok.push(numTok(0, PRG() ? S.calc.base : 10)); L = last(); }
  if (L.k === 'num' && /e$/i.test(L.v) && (o === '-' || o === '+')) { if (o === '-') L.v += '-'; return; }
  if (L.k === 'op') {
    const P = IN.tok[IN.tok.length - 2];
    if (o === '-' && L.v !== '-' && P && P.k !== 'op') { IN.tok.push({ k: 'op', v: '-' }); return; } // 5 × −3
    while (last() && last().k === 'op') IN.tok.pop();                                                 // replace operator
    if (!last() || isOpener(last()) || last().k === 'comma') { if (o === '-') IN.tok.push({ k: 'op', v: '-' }); return; }
    IN.tok.push({ k: 'op', v: o }); return;
  }
  if (isOpener(L) || L.k === 'comma') { if (o === '-') IN.tok.push({ k: 'op', v: '-' }); else deny(); return; }
  IN.tok.push({ k: 'op', v: o });
}
function lp() { startFresh(); IN.tok.push({ k: 'lp' }); }
function rp() {
  if (IN.done) return deny();
  const L = last();
  if (balance(IN.tok) <= 0 || !L || !ENDS.has(L.k)) return deny();
  IN.tok.push({ k: 'rp' });
}
/** Argument separator — only valid inside Σ / avg / min / max. */
function comma() {
  if (IN.done) return deny();
  const L = last();
  if (!L || !ENDS.has(L.k)) return deny();
  let d = 0;
  for (let i = IN.tok.length - 1; i >= 0; i--) {
    const t = IN.tok[i];
    if (t.k === 'rp') d++;
    else if (isOpener(t)) { if (d === 0) { if (t.k === 'fn' && FN[t.v].v) { IN.tok.push({ k: 'comma' }); return; } break; } d--; }
  }
  deny();
}
function postfix(p) {
  continueFromResult();
  const L = last();
  if (L && ENDS.has(L.k)) IN.tok.push({ k: 'post', v: p }); else deny();
}
/** Apply a one-argument function to the last operand (Windows-style x², √x, 1/x, ±). */
function wrap(name) {
  continueFromResult();
  const L = last();
  if (name === 'neg' && L && L.k === 'num') { L.v = L.v[0] === '-' ? L.v.slice(1) : '-' + L.v; return; }
  const r = operandRange(IN.tok);
  if (!r) { if (name === 'neg') { op('-'); return; } IN.tok.push({ k: 'fn', v: name }); return; }
  const inner = IN.tok.slice(r[0], r[1]);
  IN.tok.splice(r[0], r[1] - r[0], { k: 'fn', v: name }, ...inner, { k: 'rp' });
}
/** Scientific function key: wraps the last operand, or opens a call. */
function fnKey(name) {
  const variadic = FN[name] && FN[name].v;
  if (IN.done) {
    const c = contToken(); IN.done = false;
    IN.tok = c ? (variadic ? [{ k: 'fn', v: name }, c] : [{ k: 'fn', v: name }, c, { k: 'rp' }]) : [{ k: 'fn', v: name }];
    return;
  }
  const r = operandRange(IN.tok);
  if (r) {
    const inner = IN.tok.slice(r[0], r[1]);
    if (variadic) IN.tok.splice(r[0], r[1] - r[0], { k: 'fn', v: name }, ...inner);
    else IN.tok.splice(r[0], r[1] - r[0], { k: 'fn', v: name }, ...inner, { k: 'rp' });
    return;
  }
  IN.tok.push({ k: 'fn', v: name });
}
function atom(t) { startFresh(); IN.tok.push(t); }
function ce() {
  if (IN.done) { clearAll(); return; }
  const r = operandRange(IN.tok);
  if (r) IN.tok.splice(r[0]); else IN.tok.pop();
}
function clearAll() { IN.tok = []; IN.cur = null; IN.done = false; IN.prevText = ''; IN.prevVal = null; IN.prevFunc = false; }
function back() {
  if (IN.done) { clearAll(); return; }
  const L = last(); if (!L) return;
  if (L.k === 'num') { L.v = L.v.slice(0, -1); if (L.v === '' || L.v === '-') IN.tok.pop(); }
  else IN.tok.pop();
}
/** A forgiving copy for evaluation: drops trailing operators, closes parentheses. */
function prepTokens(tok) {
  const t = clone(tok);
  for (;;) {
    const L = t[t.length - 1];
    if (!L) break;
    if (L.k === 'op' || L.k === 'comma' || L.k === 'lp' || L.k === 'fn') { t.pop(); continue; }
    if (L.k === 'num') { L.v = String(L.v).replace(/e[-+]?$/i, ''); if (L.v === '' || L.v === '-') { t.pop(); continue; } }
    break;
  }
  for (let i = balance(t); i > 0; i--) t.push({ k: 'rp' });
  return t;
}
function ctxLive() { return { x: undefined, deg: S.set.angle === 'deg', prg: PRG(), stack: IN.editing ? [IN.editing] : [], tr: null, memo: new Map() }; }
/** Evaluate what's being typed: {val} | {func, ast} | {err}. */
function liveEval() {
  const toks = prepTokens(IN.tok);
  if (!toks.length) return { err: 'Empty' };
  try {
    const ast = parse(toks);
    const ctx = ctxLive();
    if (usesX(ast, ctx.stack)) { checkRefs(ast, ctx.stack); return { func: true, ast, ctx }; }
    return { val: clean(ev(ast, ctx)), ast, ctx };
  } catch (e) { return { err: e instanceof CalcError ? e.message : 'Error' }; }
}
function currentValue() {
  if (IN.done) return IN.prevFunc ? null : IN.prevVal;
  const L = liveEval();
  return typeof L.val === 'number' ? L.val : null;
}
function setBase(b) {
  if (!PRG()) return;
  IN.tok.forEach(t => { if (t.k === 'num') { let v = 0; try { v = numVal(t); } catch (e) { /* keep 0 */ } Object.assign(t, numTok(v, b)); } });
  S.calc.base = b;
}
function setMode(m) {
  if (m === S.calc.mode) return;
  if (S.calc.mode === 'prg' && m !== 'prg') setBase(10);
  S.calc.mode = m;
  calcEl.dataset.mode = m;
  $$('#modeSwitch button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === m)));
  $('#modeSwitch .thumb').style.transform = `translateX(${['std', 'sci', 'prg'].indexOf(m) * 100}%)`;
  IN.second = false;
  layoutChanged(); renderScreen(); save();
}

/** Dispatch one keypad action (editing actions happen at the cursor). */
function act(a) {
  if (EDIT_ACTS.test(a) && !IN.done && !atEnd()) {
    // typing ")" right before an existing ")" just steps over it
    if (a === ')') { const { right } = splitAt(IN.cur); if (right[0] && right[0].k === 'rp') { moveCursor(1); return; } }
    editAt(() => act0(a));
    renderScreen();
    return;
  }
  act0(a);
}
function act0(a) {
  if (/^[0-9]$/.test(a) || /^[A-F]$/.test(a)) digit(a);
  else switch (a) {
    case 'dot': dot(); break;
    case 'exp10': expKey(); break;
    case '+': case '-': case '*': case '/': case '^': case 'mod': case 'root': case 'ncr': case 'npr':
    case 'and': case 'or': case 'xor': case 'shl': case 'shr': op(a); break;
    case '(': lp(); break;
    case ')': rp(); break;
    case 'comma': comma(); break;
    case 'pct': postfix('%'); break;
    case 'fact': postfix('!'); break;
    case 'recip': case 'sqr': case 'sqrt': case 'neg': case 'abs': case 'cbrt': case 'not': wrap(a); break;
    case 'sin': case 'cos': case 'tan': case 'asin': case 'acos': case 'atan': case 'sinh': case 'cosh': case 'tanh':
    case 'ln': case 'log': case 'log2': case 'exp': case 'p10': case 'p2': case 'floor': case 'ceil': case 'round':
    case 'sum': case 'avg': case 'min': case 'max': fnKey(a); break;
    case 'pi': atom({ k: 'const', v: 'pi' }); break;
    case 'e': atom({ k: 'const', v: 'e' }); break;
    case 'x': if (PRG()) return deny(); atom({ k: 'var' }); break;
    case 'rand': atom(numTok(Math.round(Math.random() * 1e6) / 1e6)); break;
    case 'ans': { const b = IN.lastId && byId(IN.lastId); if (!b || b.id === IN.editing) return deny(); atom({ k: 'ref', id: b.id }); break; }
    case 'ce': ce(); break;
    case 'clear': clearAll(); break;
    case 'back': back(); break;
    case 'eq': commit(); return;
    case '2nd': IN.second = !IN.second; break;
    case 'angle': S.set.angle = S.set.angle === 'deg' ? 'rad' : 'deg'; save(); break;
    case 'b16': case 'b10': case 'b8': case 'b2': setBase(+a.slice(1)); break;
    case 'canceledit': cancelEdit(); return;
    case 'left': moveCursor(-1); return;
    case 'right': moveCursor(1); return;
    case 'mc': S.memory = null; toast('Memory cleared'); break;
    case 'mr': if (S.memory === null) return deny(); atom(numTok(S.memory, PRG() ? S.calc.base : 10)); break;
    case 'ms': case 'm+': case 'm-': {
      const v = currentValue(); if (v === null) return deny();
      S.memory = a === 'ms' ? v : (S.memory || 0) + (a === 'm+' ? v : -v);
      toast(`Memory ${fmt(S.memory)}`); save(); break;
    }
    case 'tape': toggleTape(); return;
    case 'scope': toggleScope(); return;
    case 'cfg': toggleCfg(); return;
    case 'rotate': rotate(); return;
    default: return;
  }
  // 2nd is one-shot: it switches off after any key that has a 2nd function.
  if (a !== '2nd' && IN.second && /^(a?sin|a?cos|a?tan|sinh|cosh|tanh|log2?|p2|p10|root|ncr|npr|floor|ceil|avg|max|min|round|ln|exp|fact|abs|mod|cbrt|exp10|sum|rand|\^)$/.test(a)) IN.second = false;
  renderScreen();
}
/** Keyboard path: light the matching key and play its sound. */
function press(a, fromKey) {
  if (fromKey) UI.focusCalc = true;
  const k = $(`#calc [data-act="${CSS.escape(a)}"]`);
  if (k && fromKey) { k.classList.add('on'); setTimeout(() => k.classList.remove('on'), 110); }
  if (fromKey) sfx(...keySfx(a));
  act(a);
}

/* ---------- = : turn the equation into a note ---------- */
/** Index of the last top-level binary operator (for repeat-equals). */
function topLevelOp(tok) {
  let d = 0;
  for (let i = tok.length - 1; i > 0; i--) {
    const t = tok[i];
    if (t.k === 'rp') d++; else if (isOpener(t)) d--;
    else if (d === 0 && t.k === 'op' && tok[i - 1].k !== 'op') return i;
  }
  return -1;
}
function commit() {
  let tok = prepTokens(IN.tok);
  if (IN.done || !IN.tok.length) {
    // Pressing = again repeats the last operation on the last result.
    if (IN.lastOp && IN.lastId && byId(IN.lastId)) tok = [{ k: 'ref', id: IN.lastId }, { k: 'op', v: IN.lastOp.op }, ...clone(IN.lastOp.right)];
    else return deny();
  }
  if (!tok.length) return deny();
  let ast;
  try { ast = parse(tok); } catch (e) { return fail(e.message); }
  const self = IN.editing;
  const ctx = { x: undefined, deg: S.set.angle === 'deg', prg: PRG(), stack: self ? [self] : [], tr: null, memo: new Map() };
  let func = false, val = null;
  try {
    func = usesX(ast, ctx.stack);
    if (func) checkRefs(ast, ctx.stack);
    else val = clean(ev(ast, ctx));
  } catch (e) { return fail(e instanceof CalcError ? e.message : 'Error'); }

  const opi = topLevelOp(tok);
  IN.lastOp = opi > 0 && tok[opi].k === 'op' ? { op: tok[opi].v, right: clone(tok.slice(opi + 1)) } : null;
  let b;
  snapshot();
  if (self && byId(self)) {
    b = byId(self);
    b.tokens = tok; b.ang = S.set.angle; b.mode = PRG() ? 'prg' : 'std'; b.note = '';
    if (b.type === 'fn') { b.type = 'calc'; delete b.inputs; }
    recomputeAll(); renderAll(); flashBlock(b);
    IN.editing = null;
    toast(`Updated ${label(b, 24)}`);
  } else {
    b = newBlock(tok, { from: screenEl.getBoundingClientRect() });
  }
  tapeAdd(tok, func ? null : val, func);
  IN.prevText = tokText(tok, { vals: true }) + ' =';
  IN.prevVal = func ? null : val;
  IN.prevFunc = func;
  IN.lastId = b.id;
  IN.done = true; IN.tok = []; IN.cur = null;
  sfx('eq'); setTimeout(() => sfx('pop'), 90); led('ok');
  renderScreen(); save();
}
/** Enter on an empty calculator drops a 0 note: a quick way to lay out nodes, then scroll or drag its number to tune it. */
function quickNote() {
  snapshot();
  const b = newBlock([numTok(0)], { from: screenEl.getBoundingClientRect() });
  IN.lastId = b.id;
  sfx('pop'); led('ok');
}
function fail(msg) { deny(); led('err'); resEl.className = 'scr-res err'; resEl.textContent = msg; }
function cancelEdit() { IN.editing = null; IN.tok = []; IN.cur = null; IN.done = false; renderScreen(); }

/* ---------- screen rendering ---------- */
/** Equation HTML with the caret at the cursor (a number holding the caret is shown ungrouped). */
function exprWithCaret() {
  const caret = '<span class="caret"></span>';
  if (IN.cur === null) return IN.tok.map(tokHTML).join('') + caret;
  let acc = 0, out = '', placed = false;
  IN.tok.forEach((t, i) => {
    const n = tokSlots(t);
    if (!placed && IN.cur === acc) { out += caret; placed = true; }
    if (!placed && t.k === 'num' && IN.cur > acc && IN.cur < acc + n) {
      const raw = String(t.v).replace('.', S.set.dec).replace('-', '−'), k = IN.cur - acc;
      out += `<span class="t num" data-i="${i}">${esc(raw.slice(0, k))}${caret}${esc(raw.slice(k))}</span>`;
      placed = true;
    } else out += tokHTML(t, i);
    acc += n;
  });
  return out + (placed ? '' : caret);
}

function tokHTML(t, i) {
  const d = `data-i="${i}"`;
  switch (t.k) {
    case 'num': return `<span class="t num" ${d}>${esc(numText(t))}</span>`;
    case 'op': return `<span class="t op" ${d}>${OPS[t.v] ? (OPS[t.v].w ? ' ' + OPS[t.v].s + ' ' : OPS[t.v].s) : ''}</span>`;
    case 'ref': {
      const b = byId(t.id);
      const c = b ? colorOf(b) : 'var(--err)';
      const txt = b ? (b.name || (b._func ? 'ƒ#' + b.n : b._err || b._empty ? '#' + b.n : fmtS(b._val))) : '?';
      return `<span class="t chip" ${d} style="--bc:${c};--bk:${b ? inkFor(c) : '#fff'}" title="${esc(b ? label(b, 60) : 'Missing note')}">${esc(txt)}</span>`;
    }
    case 'fn': return `<span class="t fn" ${d}>${esc(FN[t.v] ? FN[t.v].l : '')}(</span>`;
    case 'lp': return `<span class="t" ${d}>(</span>`;
    case 'rp': return `<span class="t" ${d}>)</span>`;
    case 'comma': return `<span class="t" ${d}>${S.set.dec === ',' ? ';' : ','} </span>`;
    case 'const': return `<span class="t num" ${d}>${t.v === 'pi' ? 'π' : 'e'}</span>`;
    case 'var': return `<span class="t var" ${d}>x</span>`;
    case 'post': return `<span class="t op" ${d}>${esc(t.v)}</span>`;
  }
  return '';
}
function renderScreen() {
  const parts = [`<span class="on">${S.calc.mode.toUpperCase()}</span>`];
  parts.push(PRG() ? `<span class="on">${BASES[S.calc.base]}</span>` : `<span class="on">${S.set.angle.toUpperCase()}</span>`);
  if (S.memory !== null) parts.push('<span class="acc">M</span>');
  if (IN.second) parts.push('<span class="acc">2ND</span>');
  if (S.set.dp >= 0) parts.push(`<span>DP ${S.set.dp}</span>`);
  parts.push('<span class="sp"></span>');
  if (IN.editing) { const b = byId(IN.editing); parts.push(`<span class="edit">EDIT ▸ ${esc(b ? label(b, 14) : '')}<button data-act="canceledit" title="Stop editing (Esc)" aria-label="Stop editing">✕</button></span>`); }
  topEl.innerHTML = parts.join('');

  let val = null, func = false, err = null, preview = false, fnInfo = null;
  if (IN.done && !IN.tok.length) {
    exprEl.innerHTML = `<span class="prev">${esc(IN.prevText)}</span>`;
    if (IN.prevFunc) { func = true; const b = byId(IN.lastId); if (b) { try { fnInfo = { ast: astOf(b), ctx: blockCtx(b) }; } catch (e) { /* none */ } } }
    else val = IN.prevVal;
  } else if (!IN.tok.length) {
    exprEl.innerHTML = '<span class="caret"></span>' + (S.blocks.length ? '<span class="hint">  type, or drop a note here</span>' : '');
    val = 0; preview = true;
  } else {
    const g = balance(IN.tok);
    if (IN.cur !== null && IN.cur >= slotCount()) IN.cur = null;
    exprEl.innerHTML = exprWithCaret() + (g > 0 ? `<span class="ghost">${')'.repeat(g)}</span>` : '');
    const L = liveEval();
    preview = true;
    if (L.err) { if (!['Incomplete', 'Empty'].includes(L.err)) err = L.err; }
    else if (L.func) { func = true; fnInfo = { ast: L.ast, ctx: L.ctx }; }
    else val = L.val;
  }
  if (err) { resEl.className = 'scr-res err'; resEl.textContent = err; resEl.style.fontSize = ''; }
  else if (func) {
    resEl.className = 'scr-res' + (preview ? ' preview' : '');
    resEl.innerHTML = '<canvas width="192" height="72"></canvas><span>ƒ(x)</span>';
    resEl.style.fontSize = '';
    if (fnInfo) drawSpark(resEl.querySelector('canvas'), x => fnAt(fnInfo.ast, fnInfo.ctx, x), cssv('--accent'), cssv('--screen-dim'));
  } else {
    resEl.className = 'scr-res' + (preview ? ' preview' : '');
    let txt = val === null ? '' : PRG() ? fmtBase(val, S.calc.base) : fmt(val);
    if (preview && IN.tok.length && txt) txt = '=' + txt;
    if (PRG()) resEl.textContent = txt || (preview ? '' : '0');
    else resEl.innerHTML = txt ? (txt[0] === '=' ? '<span class="eqs">=</span>' + numHTML(txt.slice(1)) : numHTML(txt)) : (preview ? '' : '0');
    const base = PRG() ? 30 : 40, len = txt.length;
    resEl.style.fontSize = len > 9 ? Math.max(15, base * 9.5 / len) + 'px' : '';
  }
  if (PRG()) {
    const v = func || err ? null : val;
    prgEl.innerHTML = [16, 10, 8, 2].map(b => `<button data-base="${b}" class="${S.calc.base === b ? 'on' : ''}">${BASES[b]}</button><span>${v === null ? '—' : fmtBase(v, b)}</span>`).join('');
  }
  exprEl.scrollTop = exprEl.scrollHeight;
  updateKeys();
  renderLinks();
  if (S.scope.open && S.scope.live) { renderScopeCtl(); scopeDirty(); }
}

/* =====================================================================
   60 · NOTES — three kinds share one element shell
     calc : an equation and its live result (what = creates)
     text : a plain post-it for words
     fn   : a function node — many inputs, one answer (Σ, Π, avg, formula…)
   Links
     data : drawn from equation references (animated dashes)
     vis  : manual links people draw for meaning only (solid)
   Any link can be bent by dragging it; its bend is stored per link key.
   ===================================================================== */

/* ---------- element templates ---------- */
const PORTS = `<span class="port out" title="Drag to link to another note or into empty space"></span><i class="bgrip" title="Drag to resize (resizes every selected note)"></i>`;
const TPL = {
  calc: `<header class="bh"><span class="led"></span><span class="bt" spellcheck="false"></span><span class="pinmark">${IC.pin}</span><button class="ib" data-a="more" title="More" aria-label="More actions">${IC.more}</button></header>
  <div class="beq"></div><div class="bv"><span class="num"></span></div><canvas class="bsp"></canvas>
  <footer class="bf"><span class="bid"></span><span class="bbadges"></span><span class="sp"></span>
  <button class="ib" data-a="insert" title="Insert into calculator" aria-label="Insert into calculator">${IC.insert}</button>
  <button class="ib" data-a="plot" title="Show on scope" aria-label="Show on scope">${IC.plot}</button>
  <button class="ib" data-a="edit" title="Edit equation" aria-label="Edit equation">${IC.edit}</button>
  <button class="ib" data-a="copy" title="Copy value" aria-label="Copy value">${IC.copy}</button></footer>${PORTS}`,
  text: `<header class="bh"><span class="led"></span><span class="bt">Note</span><span class="pinmark">${IC.pin}</span><button class="ib" data-a="more" title="More" aria-label="More actions">${IC.more}</button></header>
  <div class="btx" spellcheck="false"></div>${PORTS}`,
  fn: `<header class="bh"><span class="fsym" title="Scroll or drag to change the function · double-click for the list"></span><span class="bt" spellcheck="false"></span><span class="pinmark">${IC.pin}</span><button class="ib" data-a="more" title="More" aria-label="More actions">${IC.more}</button></header>
  <div class="fin"></div><div class="bv"><span class="num"></span></div>
  <footer class="bf"><span class="bid"></span><span class="bbadges"></span><span class="sp"></span>
  <button class="ib" data-a="op" title="Change function" aria-label="Change function">${IC.fnode}</button>
  <button class="ib" data-a="insert" title="Insert into calculator" aria-label="Insert into calculator">${IC.insert}</button>
  <button class="ib" data-a="plot" title="Show on scope" aria-label="Show on scope">${IC.plot}</button>
  <button class="ib" data-a="copy" title="Copy value" aria-label="Copy value">${IC.copy}</button></footer>
  <span class="port in" title="Inputs — drag links here"></span>${PORTS}`,
};
function blockEl(b) {
  let el = els.get(b.id);
  if (el && el.dataset.type === b.type) return el;
  if (el) el.remove();
  el = document.createElement('article');
  el.className = 'block t-' + b.type;
  el.dataset.id = b.id;
  el.dataset.type = b.type;
  el.innerHTML = TPL[b.type] || TPL.calc;
  worldEl.appendChild(el);
  els.set(b.id, el);
  return el;
}
function placeEl(b, extra = '') {
  const el = els.get(b.id);
  if (el) el.style.transform = `translate3d(${b.x}px,${b.y}px,0)${extra}`;
}
/** A calc note that is just one number — it can be tuned by dragging or scrolling the number. */
const isPlainNum = b => b.type === 'calc' && b.tokens.length === 1 && b.tokens[0].k === 'num' && b.mode !== 'prg';
const isNumeric = b => b.type !== 'text' && !b._func && !b._err && typeof b._val === 'number';

/** Update one note's element from its state. `cm` = childMap() when rendering many. */
function renderBlock(b, cm) {
  const el = blockEl(b);
  const c = colorOf(b), c2 = color2Of(b);
  el.style.setProperty('--bc', c);
  el.style.setProperty('--bc2', c2);
  el.style.setProperty('--bk', inkFor(c));
  el.style.setProperty('--bs', b.bs || 1);
  el.style.width = b.w && !b.min ? `calc(${b.w}px * var(--bs,1) * var(--ns) * var(--nm,1))` : '';
  el.classList.toggle('func', !!b._func);
  el.classList.toggle('err', !!b._err);
  el.classList.toggle('empty', !!b._empty);
  el.classList.toggle('pinned', !!b.pin);
  el.classList.toggle('min', !!b.min);
  el.classList.toggle('selected', selected.has(b.id));
  el.classList.toggle('scrub', isPlainNum(b) && !b.min);
  placeEl(b);
  if (b.type === 'text') {
    const tx = el.querySelector('.btx');
    if (tx.contentEditable !== 'true') tx.textContent = b.text || '';
    el.querySelector('.bt').textContent = b.name || 'Note';
    return;
  }
  const kids = (cm || childMap()).get(b.id) || [];
  const bt = el.querySelector('.bt');
  const badges = [];
  if (b.type === 'fn') {
    const f = FOPS[b.op] || FOPS.sum;
    el.querySelector('.fsym').textContent = f.l;
    if (bt.contentEditable !== 'true') bt.textContent = b.name || f.name;
    bt.title = f.hint + ' · scroll to change';
    const ins = b.inputs.map(byId).filter(Boolean);
    const lettered = ['custom', 'sub', 'div', 'pow', 'pct'].includes(b.op);
    el.querySelector('.fin').innerHTML = ins.length
      ? (b.op === 'custom' ? `<span class="fx">${esc(b.formula || ins.map((_, i) => LETTERS[i]).join('+'))}</span>` : '')
        + ins.map((x, i) => `<span class="fi" style="--bc:${colorOf(x)}" title="${esc(label(x, 60))}">${lettered ? `<b>${LETTERS[i]}</b>` : '<i></i>'}${esc(isNumeric(x) ? fmtS(x._val) : x._func ? 'ƒ' : '—')}</span>`).join('')
      : '<span class="fi-empty">Drag a link from any note into here</span>';
    if (b.op === 'pct' && ins.length > 2 || b.op === 'pow' && ins.length > 2) badges.push('<span class="badge" title="Only the first two inputs are used">A, B</span>');
  } else {
    const eq = b.note ? b.note + ' · frozen' : tokText(b.tokens, { vals: true });
    if (bt.contentEditable !== 'true') bt.textContent = b.name || eq;
    bt.title = (b.name ? b.name + ' = ' : '') + tokText(b.tokens);
    el.querySelector('.beq').textContent = b.name && !b.min ? eq : '';
    const refs = parentsOf(b).length;
    if (refs) badges.push(`<span class="badge live" title="Updates when its linked notes change">LIVE</span>`);
    if (b.mode === 'prg' && isNumeric(b)) badges.push(`<span class="badge" title="Hex">0x${fmtBase(b._val, 16).replace(/\s/g, '')}</span>`);
    else if (b.tokens.some(t => t.k === 'fn' && /sin|cos|tan/.test(t.v))) badges.push(`<span class="badge">${b.ang === 'deg' ? 'DEG' : 'RAD'}</span>`);
    if (isPlainNum(b)) badges.push('<span class="badge" title="Drag or scroll the number to tune it">↕</span>');
    el.querySelector('[data-a="edit"]').classList.toggle('on', IN.editing === b.id);
  }
  if (kids.length) badges.push(`<span class="badge" title="${kids.length} note${kids.length > 1 ? 's use' : ' uses'} this value">→${kids.length}</span>`);
  el.querySelector('.bbadges').innerHTML = badges.join('');
  el.querySelector('.bid').textContent = '#' + String(b.n).padStart(2, '0');
  el.querySelector('[data-a="plot"]').classList.toggle('on', !!b.plot);
  const num = el.querySelector('.bv .num');
  let txt;
  if (b._err) txt = b._err;
  else if (b._empty) txt = '—';
  else if (b._func) txt = 'ƒ(x)';
  else txt = fmt(b._val, b.dp >= 0 ? { dp: b.dp } : {}); // a note's own decimals override the knob
  if (b._err || b._func || b._empty) num.textContent = txt; else num.innerHTML = numHTML(txt);
  const basePx = 32 * (b.bs || 1) * (S.set.ns / 100) * (innerWidth < 640 ? 0.82 : 1);
  num.parentElement.style.fontSize = !b._err && !b._func && !b._empty && !b.min && txt.length > 9 ? Math.max(12, basePx * 9.5 / txt.length) + 'px' : '';
  if (b._func && !b.min) {
    let ast = null; try { ast = astOf(b); } catch (e) { /* none */ }
    if (ast) {
      const ctx = blockCtx(b);
      const sig = [b._key, fnAt(ast, ctx, -7.3), fnAt(ast, ctx, 0.41), fnAt(ast, ctx, 5.2), b.bs, c, S.set.ns].join('|');
      if (sig !== b._sparkSig) { b._sparkSig = sig; requestAnimationFrame(() => drawSpark(el.querySelector('.bsp'), x => fnAt(ast, ctx, x), c, cssv('--ink-3'))); }
    }
  }
}
function renderAll() {
  for (const [id, el] of els) if (!byId(id)) { el.remove(); els.delete(id); }
  const cm = childMap();
  S.blocks.forEach(b => renderBlock(b, cm));
  renderLinks(); renderStats(); scopeChanged(); updateBar();
  if (S.tapeOpen) renderTape();
}
function flashBlock(b) {
  const el = els.get(b.id); if (!el) return;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}
/** Small curve preview for x-equations (notes and the screen). */
function drawSpark(cv, f, color, axis) {
  if (!cv) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = cv.clientWidth || 180, H = cv.clientHeight || 44;
  cv.width = W * dpr; cv.height = H * dpr;
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const x0 = -10, x1 = 10, N = Math.max(40, Math.round(W / 2));
  const ys = [];
  for (let i = 0; i <= N; i++) ys.push(f(x0 + (x1 - x0) * i / N));
  const fin = ys.filter(isFinite).sort((a, b) => a - b);
  if (!fin.length) return;
  let lo = fin[Math.floor(fin.length * 0.04)], hi = fin[Math.ceil(fin.length * 0.96) - 1];
  if (hi - lo < 1e-9) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.15; lo -= pad; hi += pad;
  const Y = y => H - (y - lo) / (hi - lo) * H;
  g.strokeStyle = axis; g.globalAlpha = 0.5; g.lineWidth = 1; g.setLineDash([2, 3]);
  if (lo < 0 && hi > 0) { g.beginPath(); g.moveTo(0, Y(0)); g.lineTo(W, Y(0)); g.stroke(); }
  g.beginPath(); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();
  g.setLineDash([]); g.globalAlpha = 1; g.strokeStyle = color; g.lineWidth = 1.8; g.lineJoin = 'round';
  g.beginPath(); let pen = false, py = 0;
  ys.forEach((y, i) => {
    const px = i / N * W;
    if (!isFinite(y)) { pen = false; return; }
    const yy = clamp(Y(y), -H, 2 * H);
    if (pen && Math.abs(yy - py) > H * 1.2) pen = false;
    if (!pen) { g.moveTo(px, yy); pen = true; } else g.lineTo(px, yy);
    py = yy;
  });
  g.stroke();
}

/* ---------- geometry & placement (world coordinates) ---------- */
function blockRect(b) { const el = els.get(b.id); return { x: b.x, y: b.y, w: el ? el.offsetWidth : 204, h: el ? el.offsetHeight : 110 }; }
function rectOf(el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }
const overlap = (a, b, m = 10) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
const clampPos = (x, y) => ({ x: clamp(x, -BOUND, BOUND), y: clamp(y, -BOUND, BOUND) });
/** Screen-space UI that notes should not spawn under, converted to world rects. */
function hudRects() {
  const list = [calcEl, $('#bar')];
  if (!tapeEl.hidden) list.push(tapeEl);
  if (!scopeEl.hidden) list.push(scopeEl);
  if (!cfgEl.hidden) list.push(cfgEl);
  return list.map(e => rectToWorld(rectOf(e)));
}
/** Nearest free spot in view, preferring the right side of the calculator. */
function findSpot(w, h, exceptId) {
  const z = S.cam.z, v = viewWorld();
  const occ = S.blocks.filter(b => b.id !== exceptId).map(blockRect).concat(hudRects());
  const C = rectToWorld(rectOf(calcEl));
  const ax = C.x + C.w + 24 / z + w / 2, ay = C.y + h / 2;
  const st = 14 / z;
  let best = null;
  for (let y = v.y + 56 / z; y <= v.y + v.h - h - 12 / z; y += st) {
    for (let x = v.x + 12 / z; x <= v.x + v.w - w - 12 / z; x += st) {
      const r = { x, y, w, h };
      if (occ.some(o => overlap(r, o, 10 / z))) continue;
      const cx = x + w / 2, cy = y + h / 2;
      const d = Math.hypot(cx - ax, (cy - ay) * 1.15) + (cx >= C.x + C.w ? 0 : 160 / z);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  if (best) return best;
  const k = S.blocks.length % 8;
  return { x: v.x + 24 / z + k * 18 / z, y: v.y + 70 / z + k * 22 / z };
}
/** A free spot right next to rect r (used for merges and new nodes). */
function findSpotNear(b, r) {
  const el = els.get(b.id); const w = el.offsetWidth, h = el.offsetHeight;
  const occ = S.blocks.filter(o => o.id !== b.id).map(blockRect).concat(hudRects());
  const cands = [[r.x, r.y + r.h + 14], [r.x + r.w + 24, r.y], [r.x - w - 24, r.y], [r.x, r.y - h - 14], [r.x + r.w + 24, r.y + r.h + 14], [r.x - w - 24, r.y + r.h + 14]];
  for (const [x, y] of cands) if (!occ.some(o => overlap({ x, y, w, h }, o, 6))) return { x, y };
  return findSpot(w, h, b.id);
}
/** Animate notes to new positions; links follow every frame. */
function tweenBlocks(moves, ms = 380) {
  if (!moves.length) return;
  if (REDUCED) { moves.forEach(m => { m.b.x = m.x; m.b.y = m.y; placeEl(m.b); }); drawLinks(); save(); return; }
  const from = moves.map(m => ({ x: m.b.x, y: m.b.y })), t0 = performance.now();
  const f = now => {
    const k = clamp((now - t0) / ms, 0, 1), e = 1 - Math.pow(1 - k, 3);
    moves.forEach((m, i) => { m.b.x = lerp(from[i].x, m.x, e); m.b.y = lerp(from[i].y, m.y, e); placeEl(m.b); });
    drawLinks();
    if (k < 1) requestAnimationFrame(f); else save();
  };
  requestAnimationFrame(f);
}

/* ---------- creating notes ---------- */
function baseBlock(type, opt) {
  const n = S.nextId++;
  return { id: uid('b' + n + '_'), n, type, name: opt.name || '', tokens: [], x: 0, y: 0, c: opt.c !== undefined ? opt.c : S.blocks.length % 6, pin: false, min: false, plot: false, bs: 1, ang: opt.ang || S.set.angle, mode: opt.mode || (PRG() ? 'prg' : 'std'), t: Date.now(), note: '' };
}
/** Insert a note, place it (near a point, next to a rect, or in free space) and pop it in. */
function addBlock(b, opt = {}) {
  S.blocks.push(b);
  compute(b, new Map());
  if (b._func) b.plot = true;
  if (opt.plot) b.plot = true;
  const el = blockEl(b);
  renderBlock(b);
  const w = el.offsetWidth || 204, h = el.offsetHeight || 110;
  let pos = opt.near ? findSpotNear(b, opt.near) : opt.x !== undefined ? { x: opt.x, y: opt.y } : findSpot(w, h, b.id);
  pos = clampPos(pos.x, pos.y);
  b.x = pos.x; b.y = pos.y;
  el.style.zIndex = ++UI.zTop;
  placeEl(b);
  if (opt.from && !REDUCED) {
    const f = opt.from instanceof DOMRect ? rectToWorld({ x: opt.from.left, y: opt.from.top, w: opt.from.width, h: opt.from.height }) : opt.from;
    const dx = f.x + f.w / 2 - (b.x + w / 2), dy = f.y + f.h / 2 - (b.y + h / 2);
    el.animate([
      { transform: `translate3d(${b.x + dx}px,${b.y + dy}px,0) scale(.25)`, opacity: 0 },
      { transform: `translate3d(${b.x}px,${b.y}px,0) scale(1)`, opacity: 1 },
    ], { duration: 560, easing: 'cubic-bezier(.2,1.25,.35,1)' });
  }
  if (S.example && !booting) { S.example = false; }
  renderAll(); save();
  return b;
}
/** A calc note from an equation (what = and merges create). */
function newBlock(tokens, opt = {}) {
  const b = baseBlock('calc', opt);
  b.tokens = clone(tokens);
  if (opt.c === undefined) { const r = tokens.find(t => t.k === 'ref' && byId(t.id)); if (r) b.c = byId(r.id).c; }
  return addBlock(b, opt);
}
/** A plain text post-it. Opens for typing unless opt.quiet. */
function newText(opt = {}) {
  const b = baseBlock('text', opt);
  b.text = opt.text || '';
  b.c = opt.c !== undefined ? opt.c : 2;
  addBlock(b, opt);
  sfx('pop');
  if (!opt.quiet) setTimeout(() => startTextEdit(b), 30);
  return b;
}
/** A function node with optional starting inputs. */
function newFnNode(op = 'sum', inputs = [], opt = {}) {
  const b = baseBlock('fn', opt);
  b.op = op; b.inputs = inputs.filter(id => byId(id) && byId(id).type !== 'text'); b.formula = opt.formula || '';
  if (opt.c === undefined && b.inputs.length) b.c = byId(b.inputs[0]).c;
  b.tokens = fnTokens(b);
  addBlock(b, opt);
  sfx('pop');
  return b;
}

/* ---------- links ---------- */
/** Every link on the board with its kind and whether people may delete it. */
function linkList() {
  const out = [];
  for (const b of S.blocks) {
    if (b.type === 'text') continue;
    for (const p of parentsOf(b)) if (byId(p)) out.push({ key: `d:${p}>${b.id}`, a: p, b: b.id, kind: 'data', del: b.type === 'fn' });
  }
  for (const v of S.vlinks) if (byId(v.a) && byId(v.b)) out.push({ key: `v:${v.id}`, a: v.a, b: v.b, kind: 'vis', del: true, id: v.id });
  return out;
}
/** Exit/entry points on the facing sides of two rects. */
function anchor(a, b) {
  const ac = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, bc = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  const dx = bc.x - ac.x, dy = bc.y - ac.y;
  if (Math.abs(dx) * 0.7 > Math.abs(dy)) {
    const s = Math.sign(dx);
    return [{ x: ac.x + s * a.w / 2, y: ac.y }, { x: bc.x - s * b.w / 2, y: bc.y }, { x: s, y: 0 }];
  }
  const s = Math.sign(dy) || 1;
  return [{ x: ac.x, y: ac.y + s * a.h / 2 }, { x: bc.x, y: bc.y - s * b.h / 2 }, { x: 0, y: s }];
}
/** Cubic curve between two rects; `bend` shifts its midpoint by that offset. */
function curve(A, B, bend) {
  const [p, q, d] = anchor(A, B);
  const k = Math.max(30, Math.hypot(q.x - p.x, q.y - p.y) * 0.35);
  const c1 = { x: p.x + d.x * k, y: p.y + d.y * k }, c2 = { x: q.x - d.x * k, y: q.y - d.y * k };
  if (bend) { c1.x += bend.x * 4 / 3; c1.y += bend.y * 4 / 3; c2.x += bend.x * 4 / 3; c2.y += bend.y * 4 / 3; }
  const mid = { x: (p.x + 3 * c1.x + 3 * c2.x + q.x) / 8, y: (p.y + 3 * c1.y + 3 * c2.y + q.y) / 8 };
  return { p, q, mid, d: `M${p.x.toFixed(1)},${p.y.toFixed(1)} C${c1.x.toFixed(1)},${c1.y.toFixed(1)} ${c2.x.toFixed(1)},${c2.y.toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}` };
}
let linkRaf = 0;
/** Schedule a links redraw for the next frame. */
function renderLinks() { if (!linkRaf) linkRaf = requestAnimationFrame(() => { linkRaf = 0; drawLinks(); }); }
/** Draw all links now, from note positions in the model (never from animated DOM). */
function drawLinks() {
  const rects = new Map();
  const R = b => { if (!rects.has(b.id)) rects.set(b.id, blockRect(b)); return rects.get(b.id); };
  let out = '';
  for (const l of linkList()) {
    if (l.kind === 'data' && !S.set.links && UI.selLink !== l.key) continue;
    const A = byId(l.a), B = byId(l.b);
    const c = curve(R(A), R(B), S.bends[l.key]);
    const color = colorOf(A), sel = UI.selLink === l.key;
    out += `<g class="lk ${l.kind}${sel ? ' sel' : ''}"><path class="vis" d="${c.d}" stroke="${color}"/><circle cx="${c.p.x}" cy="${c.p.y}" r="2.5" fill="${color}"/><circle cx="${c.q.x}" cy="${c.q.y}" r="${l.kind === 'vis' ? 4 : 3.5}" fill="${color}"/><path class="hit" data-key="${l.key}" d="${c.d}"/>`;
    if (sel) {
      out += `<circle class="handle" data-key="${l.key}" cx="${c.mid.x}" cy="${c.mid.y}" r="6" stroke="${color}"/>`;
      if (l.del) out += `<g class="ldel" data-del="${l.key}" transform="translate(${c.mid.x + 14},${c.mid.y - 14})"><circle r="9"/><path d="M-3,-3L3,3M3,-3L-3,3"/></g>`;
    }
    out += '</g>';
  }
  // what the calculator is reading right now
  if (!IN.done && S.set.links) {
    const sr = rectToWorld(rectOf(screenEl));
    for (const id of new Set(IN.tok.filter(t => t.k === 'ref').map(t => t.id))) {
      const a = byId(id); if (!a) continue;
      out += `<g class="lk live"><path class="vis" d="${curve(R(a), sr).d}" stroke="${colorOf(a)}"/></g>`;
    }
  }
  if (UI.linkDrag) {
    const L = UI.linkDrag, a = byId(L.from);
    if (a) { const ar = R(a); const p = { x: ar.x + ar.w, y: ar.y + ar.h / 2 }; out += `<path class="temp" d="M${p.x},${p.y} C${p.x + 60},${p.y} ${L.x - 60},${L.y} ${L.x},${L.y}" stroke="${colorOf(a)}"/><circle class="temp-end" cx="${L.x}" cy="${L.y}" r="5" fill="${colorOf(a)}"/>`; }
  }
  linksEl.innerHTML = out;
}
function addVLink(a, b) {
  if (a === b) return;
  if (S.vlinks.some(v => (v.a === a && v.b === b) || (v.a === b && v.b === a))) { toast('Those notes are already linked'); return; }
  snapshot();
  S.vlinks.push({ id: uid('v'), a, b });
  sfx('link'); renderLinks(); save();
  toast('Linked');
}
function deleteLink(key) {
  const l = linkList().find(x => x.key === key);
  if (!l) return;
  if (!l.del) { toast('That link is part of an equation. Edit the note to change it.'); return; }
  snapshot();
  if (l.kind === 'vis') S.vlinks = S.vlinks.filter(v => v.id !== l.id);
  else { const fb = byId(l.b); fb.inputs = fb.inputs.filter(id => id !== l.a); fb.tokens = fnTokens(fb); }
  delete S.bends[key];
  UI.selLink = null;
  recomputeAll(); renderAll(); renderScreen(); save(); sfx('del');
}
function selectLink(key) {
  UI.selLink = key;
  if (key) { setSelected([]); sfx('tick'); }
  drawLinks();
}

/* ---------- function nodes ---------- */
/** Connect `srcId` into function node `fb` (refuses loops and text notes). */
function addInput(fb, srcId) {
  const src = byId(srcId);
  if (!src || fb.type !== 'fn') return false;
  if (src.type === 'text') { addVLink(srcId, fb.id); return false; }
  if (srcId === fb.id || upstream(srcId).has(fb.id)) { deny(); toast('That would make a loop'); return false; }
  if (fb.inputs.includes(srcId)) { toast('Already an input'); return false; }
  fb.inputs.push(srcId);
  fb.tokens = fnTokens(fb);
  return true;
}
function addInputs(fb, ids) {
  snapshot();
  const n = ids.filter(id => addInput(fb, id)).length;
  if (!n) { UNDO.pop(); updateBar(); return; }
  recomputeAll(); renderAll(); flashBlock(fb); sfx('link'); save();
  toast(n > 1 ? `${n} inputs connected` : 'Input connected');
}
function setFnOp(fb, op, formula) {
  snapshot();
  fb.op = op;
  if (formula !== undefined) fb.formula = formula;
  fb.tokens = fnTokens(fb);
  recomputeAll(); renderAll(); save(); sfx('tick');
}
/** Step to the next (dir 1) or previous (dir -1) function in FOPS order. No snapshot or save. */
function stepFnOp(fb, dir) {
  const keys = Object.keys(FOPS);
  fb.op = keys[(keys.indexOf(fb.op) + dir + keys.length) % keys.length];
  fb.tokens = fnTokens(fb);
  recomputeAll(); renderAll(); flashBlock(fb); sfx('tick');
  const f = FOPS[fb.op]; toast(`${f.l}  ${f.name} — ${f.hint}`);
}
/** Scroll on a function node's symbol or name: one wheel notch = one function. */
const opWheel = { acc: 0, t: 0 };
function wheelFnOp(fb, e) {
  if (!opWheel.t) snapshot();
  clearTimeout(opWheel.t); opWheel.t = setTimeout(() => { opWheel.t = 0; opWheel.acc = 0; save(); }, 500);
  opWheel.acc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  if (Math.abs(opWheel.acc) >= 40) { stepFnOp(fb, opWheel.acc > 0 ? 1 : -1); opWheel.acc = 0; }
}
/** Drag a function node's symbol: every 24px down/right is the next function, up/left the previous. */
function startOpDrag(e, fb) {
  e.preventDefault();
  const snap = snapData();
  let steps = 0;
  track(e, (ev, dx, dy) => {
    const n = Math.round((dx + dy) / 24);
    while (steps !== n) { const d = n > steps ? 1 : -1; steps += d; stepFnOp(fb, d); }
  }, (ev, moved) => {
    if (!moved) { setSelected([fb.id], ev.shiftKey || ev.ctrlKey || ev.metaKey); return; }
    if (steps) { snapshot(snap); save(); }
  }, 4);
}

/* ---------- note actions ---------- */
/** Delete notes. Notes that used them keep their values (references are inlined). */
function deleteBlocks(ids, opt = {}) {
  ids = ids.filter(id => byId(id));
  if (!ids.length) return;
  if (opt.snap !== false) snapshot();
  const del = new Set(ids);
  let kept = 0;
  for (const b of S.blocks) {
    if (del.has(b.id) || b.type !== 'fn') continue;
    const before = b.inputs.length;
    b.inputs = b.inputs.filter(id => !del.has(id));
    if (b.inputs.length !== before) { b.tokens = fnTokens(b); kept++; }
  }
  const inline = tokens => {
    let guard = 0, hit = false;
    while (tokens.some(t => t.k === 'ref' && del.has(t.id)) && guard++ < 25) {
      hit = true;
      tokens = tokens.flatMap(t => {
        if (t.k !== 'ref' || !del.has(t.id)) return [t];
        const src = byId(t.id);
        if (isNumeric(src) && src.type === 'fn') return [numTok(src._val)];
        return src.tokens.length === 1 ? [clone(src.tokens[0])] : [{ k: 'lp' }, ...clone(src.tokens), { k: 'rp' }];
      });
    }
    return [tokens, hit];
  };
  for (const b of S.blocks) {
    if (del.has(b.id) || b.type !== 'calc') continue;
    const [t, hit] = inline(b.tokens);
    if (hit) { b.tokens = t; kept++; }
  }
  IN.tok = inline(IN.tok)[0];
  if (IN.editing && del.has(IN.editing)) cancelEdit();
  S.vlinks = S.vlinks.filter(v => !del.has(v.a) && !del.has(v.b));
  for (const k of Object.keys(S.bends)) if (ids.some(id => k.includes(id))) delete S.bends[k];
  for (const id of ids) {
    const el = els.get(id);
    if (el) {
      els.delete(id);
      if (REDUCED || opt.anim === false) el.remove();
      else {
        el.style.pointerEvents = 'none';
        el.animate([{ opacity: 1, transform: el.style.transform }, { opacity: 0, transform: el.style.transform + ' scale(.6)' }], { duration: 200, easing: 'ease-in' }).onfinish = () => el.remove();
      }
    }
    selected.delete(id);
  }
  S.blocks = S.blocks.filter(b => !del.has(b.id));
  if (IN.lastId && del.has(IN.lastId)) IN.lastId = null;
  UI.selLink = null;
  recomputeAll(); renderAll(); renderScreen(); save();
  sfx('del');
  if (!opt.quiet) toast(kept ? `Deleted · ${kept} linked note${kept > 1 ? 's' : ''} updated` : `Deleted ${ids.length > 1 ? ids.length + ' notes' : 'note'} · Ctrl+Z undoes`);
}
/** Replace an equation with its current value (cuts its links). */
function freeze(b) {
  if (b.type !== 'calc' || b._func || b._err || isPlainNum(b)) return toast(b._func ? 'Curves can’t be frozen' : 'Nothing to freeze');
  snapshot();
  b.note = tokText(b.tokens, { vals: true });
  b.tokens = [numTok(b._val)];
  recomputeAll(); renderAll(); save();
  toast('Frozen to a plain value');
}
/** Copy notes (keeping links between the copies) offset by dx, dy. Returns the copies. */
function cloneBlocks(list, dx = 24, dy = 24) {
  const map = new Map();
  list.forEach(b => map.set(b.id, uid('b' + S.nextId + '_')));
  const copies = list.map(b => {
    const c = JSON.parse(serial(b));
    c.id = map.get(b.id); c.n = S.nextId++; c.x = b.x + dx; c.y = b.y + dy; c.t = Date.now();
    c.tokens = c.tokens.map(t => (t.k === 'ref' && map.has(t.id) ? { ...t, id: map.get(t.id) } : t));
    if (c.type === 'fn') c.inputs = c.inputs.map(id => map.get(id) || id);
    return c;
  });
  S.blocks.push(...copies);
  S.vlinks.filter(v => map.has(v.a) && map.has(v.b)).forEach(v => S.vlinks.push({ id: uid('v'), a: map.get(v.a), b: map.get(v.b) }));
  recomputeAll();
  copies.forEach(c => { renderBlock(c); els.get(c.id).style.zIndex = ++UI.zTop; });
  return copies;
}
function duplicate(list) {
  if (!list.length) return;
  snapshot();
  const copies = cloneBlocks(list);
  setSelected(copies.map(c => c.id));
  renderAll(); save(); sfx('pop');
  toast(copies.length > 1 ? `Duplicated ${copies.length} notes` : 'Duplicated');
}
function insertIntoCalc(b, at) {
  if (b.type === 'text') { deny(); return toast('Text notes have no value to calculate with'); }
  if (b.id === IN.editing) { deny(); return toast('A note can’t use itself'); }
  if (IN.editing) {
    try { checkRefs({ t: 'ref', id: b.id }, [IN.editing]); } catch (e) { deny(); return toast(e.message); }
  }
  if (IN.done) { IN.tok = []; IN.done = false; }
  const ins = [{ k: 'ref', id: b.id }];
  if (!at && !atEnd()) { editAt(() => IN.tok.push(...ins)); sfx('drop'); led('busy'); renderScreen(); return; }
  const idx = at ? clamp(at.i, 0, IN.tok.length) : IN.tok.length;
  if (at && at.mode === 'replace' && IN.tok[at.i]) IN.tok.splice(at.i, 1, ...ins);
  else IN.tok.splice(idx, 0, ...ins);
  IN.cur = idx + 1 >= IN.tok.length ? null : slotStart(idx + 1);
  sfx('drop'); led('busy');
  renderScreen();
}
/** Several notes dropped on the screen at once become "A + B + C". */
function insertMany(ids, at) {
  ids = ids.filter(id => { const b = byId(id); return b && b.type !== 'text' && id !== IN.editing; });
  if (!ids.length) return deny();
  if (ids.length === 1) return insertIntoCalc(byId(ids[0]), at);
  if (IN.done) { IN.tok = []; IN.done = false; }
  const ins = [];
  ids.forEach((id, i) => { if (i) ins.push({ k: 'op', v: '+' }); ins.push({ k: 'ref', id }); });
  const idx = at ? clamp(at.i, 0, IN.tok.length) : IN.tok.length;
  IN.tok.splice(idx, at && at.mode === 'replace' ? 1 : 0, ...ins);
  IN.cur = idx + ins.length >= IN.tok.length ? null : slotStart(idx + ins.length);
  sfx('drop'); led('busy'); renderScreen();
}
function editBlock(b) {
  if (b.type === 'fn') return openFnMenu(b, els.get(b.id).querySelector('[data-a="op"]'));
  if (b.type === 'text') return startTextEdit(b);
  if (IN.editing === b.id) { cancelEdit(); renderAll(); return; }
  IN.editing = b.id;
  IN.tok = clone(b.tokens); IN.cur = null;
  IN.done = false;
  if (b.mode === 'prg') setMode('prg'); else if (PRG()) setMode('std');
  S.set.angle = b.ang || S.set.angle;
  flashBlock(b); sfx('tick');
  renderAll(); renderScreen();
  toast('Editing — press = to update, Esc to stop');
}
function copyText(s, msg) {
  const done = () => { toast(msg || `Copied ${s}`); sfx('tick'); };
  const fallback = () => {
    const ta = document.createElement('textarea'); ta.value = s; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('Copy isn’t allowed here'); }
    ta.remove();
  };
  try { navigator.clipboard.writeText(s).then(done, fallback); } catch (e) { fallback(); }
}
const rawVal = b => (b.type === 'text' ? b.text || '' : b._func ? tokText(b.tokens) : b._err || b._empty ? '' : String(b._val));
function copyBlock(b) { copyText(rawVal(b), b.type === 'text' ? 'Copied text' : `Copied ${b._func ? 'equation' : fmt(b._val)}`); }
function togglePlot(b, on) {
  if (b.type === 'text') return;
  b.plot = on === undefined ? !b.plot : on;
  if (b.plot && !S.scope.open) openScope();
  renderBlock(b); scopeChanged(); save();
  if (b.plot) { sfx('soft'); setTimeout(fitScope, 30); }
}
/** Inline rename of a note's title. */
function rename(b) {
  const el = els.get(b.id); if (!el) return;
  if (b.min) { b.min = false; renderBlock(b); }
  const bt = el.querySelector('.bt');
  bt.contentEditable = 'true';
  bt.dataset.ph = 'Name this note';
  bt.textContent = b.name || '';
  bt.focus();
  const r = document.createRange(); r.selectNodeContents(bt); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  let finished = false;
  const finish = ok => {
    if (finished) return; finished = true;
    bt.contentEditable = 'false';
    bt.removeEventListener('keydown', kd); bt.removeEventListener('blur', bl);
    const v = bt.textContent.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (ok && v !== (b.name || '')) { snapshot(); b.name = v; save(); sfx('tick'); }
    renderAll(); renderScreen();
  };
  const kd = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); finish(true); } if (e.key === 'Escape') { e.preventDefault(); finish(false); } };
  const bl = () => finish(true);
  bt.addEventListener('keydown', kd); bt.addEventListener('blur', bl);
}
/** Type into a text note. Esc or clicking away saves. */
function startTextEdit(b) {
  const el = els.get(b.id); if (!el) return;
  if (b.min) { b.min = false; renderBlock(b); }
  const tx = el.querySelector('.btx');
  const before = b.text || '', snap = snapData();
  tx.contentEditable = 'true';
  tx.textContent = before;
  el.classList.add('editing');
  tx.focus();
  const r = document.createRange(); r.selectNodeContents(tx); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  const kd = e => { e.stopPropagation(); if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); tx.blur(); } };
  const pa = e => { e.preventDefault(); e.stopPropagation(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text')); };
  const bl = () => {
    tx.contentEditable = 'false';
    el.classList.remove('editing');
    tx.removeEventListener('keydown', kd); tx.removeEventListener('blur', bl); tx.removeEventListener('paste', pa);
    const v = tx.innerText.replace(/\n+$/, '');
    if (v !== before) { snapshot(snap); b.text = v; save(); sfx('tick'); }
    renderBlock(b); renderLinks();
  };
  tx.addEventListener('keydown', kd); tx.addEventListener('blur', bl); tx.addEventListener('paste', pa);
}

/* ---------- merge (drop one note on another) ---------- */
const MERGES = [['+', '+'], ['−', '-'], ['×', '*'], ['÷', '/'], ['xʸ', '^'], ['avg', 'avg'], ['min', 'min'], ['max', 'max']];
function mergeTokens(a, b, o) {
  return ['+', '-', '*', '/', '^'].includes(o)
    ? [{ k: 'ref', id: a.id }, { k: 'op', v: o }, { k: 'ref', id: b.id }]
    : [{ k: 'fn', v: o }, { k: 'ref', id: a.id }, { k: 'comma' }, { k: 'ref', id: b.id }, { k: 'rp' }];
}
function openMerge(target, src) {
  let A = target, B = src;
  const draw = () => {
    const rows = MERGES.map(([l, o]) => {
      let prev = 'ƒ(x)';
      if (!A._func && !B._func) { try { prev = fmtS(clean(ev(parse(mergeTokens(A, B, o)), { x: undefined, deg: true, prg: false, stack: [], tr: null, memo: new Map() }))); } catch (e) { prev = e.message; } }
      return `<button class="mop" data-op="${esc(o)}" title="${esc(refName(A))} ${esc(l)} ${esc(refName(B))}">${esc(l)}<small>${esc(prev)}</small></button>`;
    }).join('');
    popEl.innerHTML = `<h4>Merge <span style="color:${colorOf(A)}">${esc(trunc(label(A, 14), 14))}</span> with <span style="color:${colorOf(B)}">${esc(trunc(label(B, 14), 14))}</span><span class="sp"></span><button class="tb" data-swap title="Swap order">⇄</button></h4>
      <div class="mops">${rows}</div>
      <div class="mfoot"><label><button class="tog" role="switch" aria-checked="${S.set.keepOnMerge}" data-keep aria-label="Keep originals"></button>Keep originals</label><span class="sp"></span><button class="tb" data-node title="Connect both into a new function node">Make node</button><button class="tb" data-vlink title="Just draw a link between them">Link</button><button class="tb" data-cancel>Cancel</button></div>`;
  };
  draw();
  openPop('merge', null);
  const tr = rectToScreen(blockRect(target));
  positionPop(tr.x + tr.w / 2, tr.y + tr.h + 10, tr.y - 10);
  popEl.onclick = e => {
    if (e.target.closest('[data-swap]')) { [A, B] = [B, A]; draw(); sfx('tick'); return; }
    if (e.target.closest('[data-keep]')) { S.set.keepOnMerge = !S.set.keepOnMerge; draw(); save(); sfx('tick'); return; }
    if (e.target.closest('[data-cancel]')) { closePop(); return; }
    if (e.target.closest('[data-vlink]')) { closePop(); addVLink(src.id, target.id); return; }
    if (e.target.closest('[data-node]')) { closePop(); snapshot(); const r = blockRect(target); const nb = newFnNode('sum', [A.id, B.id], { near: r }); flashBlock(nb); return; }
    const m = e.target.closest('[data-op]');
    if (m) { closePop(); doMerge(A, B, m.dataset.op, target); }
  };
}
function doMerge(A, B, o, target) {
  snapshot();
  const r = blockRect(target);
  const keep = S.set.keepOnMerge;
  const nb = newBlock(mergeTokens(A, B, o), { c: target.c, ...(keep ? { near: r } : { x: r.x, y: r.y }), from: r, plot: A.plot || B.plot });
  if (!keep) deleteBlocks([A.id, B.id], { snap: false, quiet: true });
  flashBlock(nb); sfx('merge'); led('ok');
  toast(keep ? 'Merged into a new linked note' : 'Merged');
}

/* ---------- popovers & menus ---------- */
let popKind = null, popFor = null;
function openPop(kind, forId) { popEl.hidden = false; popKind = kind; popFor = forId; sfx('menu'); }
function positionPop(cx, below, above) {
  const w = popEl.offsetWidth, h = popEl.offsetHeight;
  const x = clamp(cx - w / 2, 10, innerWidth - w - 10);
  const y = below + h < innerHeight - 10 ? below : Math.max(10, above - h);
  popEl.style.left = x + 'px'; popEl.style.top = y + 'px';
}
function closePop() { popEl.hidden = true; popEl.innerHTML = ''; popEl.onclick = null; popEl.onkeydown = null; popKind = null; popFor = null; }
const mi = (a, icon, text, kbd = '', cls = '') => `<button class="mi ${cls}" data-m="${a}">${icon}${esc(text)}${kbd ? `<kbd>${kbd}</kbd>` : ''}</button>`;
function swatchRow(attr, cur) {
  return S.set.palette.map((c, i) => `<button style="--sc:${c}" class="${cur === i ? 'on' : ''}" data-${attr}="${i}" aria-label="Color ${i + 1}"></button>`).join('');
}
/** The ⋯ menu of a note. */
function openMenu(b, anchorEl) {
  const sizes = `<div class="sizes seg" role="group" aria-label="Size">${[['S', 0.8], ['M', 1], ['L', 1.3], ['XL', 1.7]].map(([l, v]) => `<button data-bs="${v}" aria-pressed="${(b.bs || 1) === v}">${l}</button>`).join('')}</div>`;
  const duo = S.set.grad === 'duo' ? `<div class="msub">Fade to</div><div class="msw">${swatchRow('c2', b.c2 !== undefined ? b.c2 : ((b.c || 0) + 1) % 6)}</div>` : '';
  let items = '';
  if (b.type === 'text') {
    items = mi('textedit', IC.edit, 'Edit text', 'dbl‑click') + mi('rename', IC.rename, 'Rename label') + mi('dup', IC.dup, 'Duplicate', 'Ctrl D') + mi('pin', IC.pin, b.pin ? 'Unpin' : 'Pin in place') + mi('copy', IC.copy, 'Copy text');
  } else if (b.type === 'fn') {
    items = mi('op', IC.fnode, 'Change function') + mi('reverse', IC.swap, 'Reverse input order') + mi('rename', IC.rename, 'Rename', 'F2') + mi('insert', IC.insert, 'Insert into calculator') + mi('plot', IC.plot, b.plot ? 'Hide from scope' : 'Show on scope') + mi('dup', IC.dup, 'Duplicate', 'Ctrl D') + mi('pin', IC.pin, b.pin ? 'Unpin' : 'Pin in place') + mi('min', b.min ? IC.expand : IC.min, b.min ? 'Expand' : 'Collapse') + mi('copy', IC.copy, 'Copy value');
  } else {
    items = mi('rename', IC.rename, 'Rename', 'F2') + mi('edit', IC.edit, IN.editing === b.id ? 'Stop editing' : 'Edit equation') + mi('insert', IC.insert, 'Insert into calculator') + mi('plot', IC.plot, b.plot ? 'Hide from scope' : 'Show on scope') + mi('dup', IC.dup, 'Duplicate', 'Ctrl D')
      + (!b._func && !isPlainNum(b) ? mi('freeze', IC.freeze, 'Freeze to value') : '') + mi('pin', IC.pin, b.pin ? 'Unpin' : 'Pin in place') + mi('min', b.min ? IC.expand : IC.min, b.min ? 'Expand' : 'Collapse')
      + mi('copy', IC.copy, b._func ? 'Copy equation' : 'Copy value') + (!b._func ? mi('copyeq', IC.copy, 'Copy equation') : '');
  }
  const decs = b.type === 'text' ? '' : `<div class="msub">Decimals</div><div class="sizes seg" role="group" aria-label="Decimals">${[['Auto', -1], ['0', 0], ['1', 1], ['2', 2], ['3', 3], ['4', 4]].map(([l, v]) => `<button data-dp="${v}" aria-pressed="${(b.dp >= 0 ? b.dp : -1) === v}">${l}</button>`).join('')}</div>`;
  popEl.innerHTML = `<div class="msw">${swatchRow('c', b.c || 0)}</div>${duo}${sizes}${decs}${items}<div class="hr"></div>${mi('del', IC.trash, 'Delete', 'Del', 'danger')}`;
  openPop('menu', b.id);
  const r = anchorEl.getBoundingClientRect();
  positionPop(r.left + r.width / 2, r.bottom + 6, r.top - 6);
  popEl.onclick = e => {
    const c = e.target.closest('[data-c]');
    if (c) { snapshot(); b.c = +c.dataset.c; renderAll(); renderScreen(); save(); sfx('tick'); openMenu(b, anchorEl); return; }
    const c2 = e.target.closest('[data-c2]');
    if (c2) { b.c2 = +c2.dataset.c2; renderBlock(b); save(); sfx('tick'); openMenu(b, anchorEl); return; }
    const dpb = e.target.closest('[data-dp]');
    if (dpb) { const v = +dpb.dataset.dp; if (v < 0) delete b.dp; else b.dp = v; renderBlock(b); save(); sfx('tick'); openMenu(b, anchorEl); return; }
    const s = e.target.closest('[data-bs]');
    if (s) { b.bs = +s.dataset.bs; renderBlock(b); renderLinks(); save(); sfx('tick'); openMenu(b, anchorEl); return; }
    const m = e.target.closest('[data-m]'); if (!m) return;
    closePop();
    blockAction(b, m.dataset.m, anchorEl);
  };
}
/** Pick a function node's operator (and its formula for "Formula"). */
function openFnMenu(b, anchorEl) {
  const err = msg => { const e = $('#fxErr'); if (e) e.textContent = msg; };
  popEl.innerHTML = `<h4>Function</h4><div class="fops">${Object.entries(FOPS).map(([k, f]) => `<button class="fop${b.op === k ? ' on' : ''}" data-op="${k}" title="${esc(f.hint)}"><b>${esc(f.l)}</b>${esc(f.name)}</button>`).join('')}</div>
    <div class="fxrow"${b.op === 'custom' ? '' : ' hidden'}><label for="fxIn">Formula — inputs are ${esc(b.inputs.map((_, i) => LETTERS[i]).join(', ') || 'A, B, …')}</label><input id="fxIn" class="io1" value="${esc(b.formula || b.inputs.map((_, i) => LETTERS[i]).join('+') || 'A+B')}" spellcheck="false"><span id="fxErr" class="fxerr"></span><button class="btn pri" data-apply>Apply</button></div>`;
  openPop('fn', b.id);
  const r = anchorEl.getBoundingClientRect();
  positionPop(r.left + r.width / 2, r.bottom + 6, r.top - 6);
  const apply = () => {
    const f = $('#fxIn').value.trim();
    const vars = {}; b.inputs.forEach((id, i) => (vars[LETTERS[i]] = id));
    try { parse(textToTokens(f, vars)); } catch (e) { err(e.message === 'Missing note' ? 'Use only the input letters' : e.message); deny(); return; }
    closePop(); setFnOp(b, 'custom', f);
  };
  popEl.onclick = e => {
    const o = e.target.closest('[data-op]');
    if (o) {
      if (o.dataset.op === 'custom') { $$('.fop', popEl).forEach(x => x.classList.toggle('on', x === o)); $('.fxrow', popEl).hidden = false; $('#fxIn').focus(); return; }
      closePop(); setFnOp(b, o.dataset.op); return;
    }
    if (e.target.closest('[data-apply]')) apply();
  };
  popEl.onkeydown = e => { if (e.key === 'Enter' && e.target.id === 'fxIn') { e.preventDefault(); apply(); } if (e.key === 'Escape') closePop(); e.stopPropagation(); };
}
/** After dragging a link into empty space: what should appear there? */
function openNewNodeMenu(srcId, sx, sy) {
  const src = byId(srcId); if (!src) return;
  const w = toWorld(sx, sy);
  const numeric = src.type !== 'text';
  popEl.innerHTML = `<h4>New from ${esc(trunc(label(src, 18), 18))}</h4>
    ${numeric ? `<div class="fops">${['sum', 'prod', 'sub', 'div', 'avg', 'min', 'max', 'pct', 'custom'].map(k => `<button class="fop" data-op="${k}" title="${esc(FOPS[k].hint)}"><b>${esc(FOPS[k].l)}</b>${esc(FOPS[k].name)}</button>`).join('')}</div><div class="hr"></div>` : ''}
    ${mi('text', IC.text, 'Text note, linked')}${numeric ? mi('calc', IC.edit, 'Use it in the calculator') : ''}`;
  openPop('newnode', srcId);
  positionPop(sx, sy + 10, sy - 10);
  popEl.onclick = e => {
    const o = e.target.closest('[data-op]');
    if (o) { closePop(); snapshot(); const nb = newFnNode(o.dataset.op, [srcId], { x: w.x, y: w.y - 40 }); flashBlock(nb); if (o.dataset.op === 'custom') setTimeout(() => openFnMenu(nb, els.get(nb.id).querySelector('[data-a="op"]')), 60); return; }
    const m = e.target.closest('[data-m]'); if (!m) return;
    closePop();
    if (m.dataset.m === 'text') { snapshot(); const t = newText({ x: w.x, y: w.y - 30, c: src.c }); S.vlinks.push({ id: uid('v'), a: srcId, b: t.id }); renderLinks(); save(); }
    if (m.dataset.m === 'calc') insertIntoCalc(src);
  };
}
function blockAction(b, a, anchorEl) {
  switch (a) {
    case 'more': openMenu(b, anchorEl); break;
    case 'rename': rename(b); break;
    case 'textedit': startTextEdit(b); break;
    case 'edit': editBlock(b); break;
    case 'op': openFnMenu(b, anchorEl); break;
    case 'reverse': snapshot(); b.inputs.reverse(); b.tokens = fnTokens(b); recomputeAll(); renderAll(); save(); sfx('tick'); break;
    case 'insert': insertIntoCalc(b); break;
    case 'plot': togglePlot(b); break;
    case 'dup': duplicate([b]); break;
    case 'freeze': freeze(b); break;
    case 'pin': b.pin = !b.pin; renderBlock(b); save(); sfx('tick'); toast(b.pin ? 'Pinned' : 'Unpinned'); break;
    case 'min': b.min = !b.min; renderBlock(b); renderLinks(); save(); sfx('soft'); break;
    case 'copy': copyBlock(b); break;
    case 'copyeq': copyText(tokText(b.tokens, { vals: true }), 'Copied equation'); break;
    case 'del': deleteBlocks([b.id]); break;
  }
}

/* ---------- selection & the stats strip ---------- */
/** Select notes; plays a rising pentatonic pulse as the selection grows. */
function setSelected(ids, add, quiet) {
  const before = selected.size;
  if (!add) selected.clear();
  ids.forEach(id => selected.add(id));
  if (selected.size && UI.selLink) { UI.selLink = null; drawLinks(); }
  S.blocks.forEach(b => { const el = els.get(b.id); if (el) el.classList.toggle('selected', selected.has(b.id)); });
  if (!quiet) {
    if (selected.size > before) sfx('sel', selected.size - 1);
    else if (selected.size === 0 && before > 0) sfx('desel');
  }
  renderStats();
}
function renderStats() {
  const list = [...selected].map(byId).filter(Boolean);
  if (list.length < 2) { statsEl.hidden = true; return; }
  const vals = list.filter(isNumeric).map(b => b._val);
  const n = vals.length;
  const sum = vals.reduce((a, v) => a + v, 0);
  const mn = n ? Math.min(...vals) : 0, mx = n ? Math.max(...vals) : 0;
  const st = [['Σ Sum', 'sum', sum], ['Avg', 'avg', n ? sum / n : 0], ['Min', 'min', mn], ['Max', 'max', mx], ['Range', 'range', mx - mn]];
  statsEl.innerHTML = `<span class="n">${list.length} notes</span>` + (n ? st.map(([l, k, v]) => `<button class="st" data-stat="${k}" title="Pop a linked ${l.replace('Σ ', '')} note"><small>${l}</small><b>${numHTML(fmt(clean(v), { sig: 9 }))}</b></button>`).join('') : '')
    + (n ? '<button class="tb" data-stat="node" title="Connect the selected notes into a new function node">Node</button>' : '')
    + '<button class="tb" data-stat="link" title="Chain the selected notes with manual links">Link</button><button class="tb" data-stat="plot" title="Show all on scope">Plot</button><button class="tb" data-stat="pdf" title="Export these notes and what feeds them as a PDF">PDF</button><button class="tb" data-stat="del" title="Delete selected">Delete</button><button class="tb" data-stat="none" aria-label="Clear selection">✕</button>';
  statsEl.hidden = false;
}
/** Turn a stat in the strip into a linked note (e.g. a live Sum of the selection). */
function statBlock(kind) {
  const ids = [...selected].filter(id => { const b = byId(id); return b && isNumeric(b); });
  if (!ids.length) return;
  const args = []; ids.forEach((id, i) => { if (i) args.push({ k: 'comma' }); args.push({ k: 'ref', id }); });
  const tok = kind === 'range'
    ? [{ k: 'fn', v: 'max' }, ...clone(args), { k: 'rp' }, { k: 'op', v: '-' }, { k: 'fn', v: 'min' }, ...clone(args), { k: 'rp' }]
    : [{ k: 'fn', v: kind }, ...args, { k: 'rp' }];
  snapshot();
  const names = { sum: 'Sum', avg: 'Average', min: 'Min', max: 'Max', range: 'Range' };
  const nb = newBlock(tok, { name: names[kind], from: statsEl.getBoundingClientRect() });
  flashBlock(nb); sfx('merge');
}

/* =====================================================================
   70 · INTERACTION — pointer handling for notes, links and the device
   ===================================================================== */

/**
 * Follow one pointer until release. move(ev, dx, dy) runs once the pointer
 * has travelled `threshold` px; up(ev, moved, dx, dy) runs on release.
 */
function track(e, move, up, threshold = 3) {
  const sx = e.clientX, sy = e.clientY, pid = e.pointerId;
  let moved = false;
  const mm = ev => {
    if (ev.pointerId !== pid) return;
    const dx = ev.clientX - sx, dy = ev.clientY - sy;
    if (!moved && Math.hypot(dx, dy) < threshold) return;
    moved = true;
    move && move(ev, dx, dy);
  };
  const uu = ev => {
    if (ev.pointerId !== pid) return;
    removeEventListener('pointermove', mm); removeEventListener('pointerup', uu); removeEventListener('pointercancel', uu);
    up && up(ev, moved, ev.clientX - sx, ev.clientY - sy);
  };
  addEventListener('pointermove', mm); addEventListener('pointerup', uu); addEventListener('pointercancel', uu);
}

/* ---------- dropping a note onto the screen: where in the equation? ---------- */
function screenDropIndex(x, y) {
  if (IN.done || !IN.tok.length) return { i: 0, mode: 'insert', empty: true };
  let best = null;
  for (const s of $$('#expr .t')) {
    const r = s.getBoundingClientRect(), i = +s.dataset.i;
    if (y >= r.top - 3 && y <= r.bottom + 3 && x >= r.left && x <= r.right) {
      const t = IN.tok[i];
      // the middle of a number or note replaces it; the edges insert beside it
      if (t && ['num', 'ref', 'const', 'var'].includes(t.k) && r.width > 10 && x > r.left + r.width * 0.25 && x < r.right - r.width * 0.25) return { i, mode: 'replace', el: s };
      return x < r.left + r.width / 2 ? { i, mode: 'insert', el: s, side: 'l' } : { i: i + 1, mode: 'insert', el: s, side: 'r' };
    }
    const cx = clamp(x, r.left, r.right), cy = clamp(y, r.top, r.bottom);
    const d = Math.hypot(x - cx, (y - cy) * 2.5);
    if (!best || d < best.d) best = { d, i: x < r.left + r.width / 2 ? i : i + 1, el: s, side: x < r.left + r.width / 2 ? 'l' : 'r' };
  }
  return best ? { i: best.i, mode: 'insert', el: best.el, side: best.side } : { i: IN.tok.length, mode: 'insert' };
}
function showDropCaret(info) {
  $$('#expr .replace').forEach(s => s.classList.remove('replace'));
  let c = $('#dropcaret');
  if (!info) { if (c) c.remove(); return; }
  if (info.mode === 'replace') { if (c) c.remove(); info.el.classList.add('replace'); return; }
  if (!c) { c = document.createElement('i'); c.id = 'dropcaret'; c.className = 'dropcaret'; screenEl.appendChild(c); }
  const sr = screenEl.getBoundingClientRect(), sc = S.calc.s;
  let r;
  if (info.el) r = info.el.getBoundingClientRect();
  else { const er = exprEl.getBoundingClientRect(); r = { left: er.left + 2, right: er.left + 2, top: er.top + 2, bottom: er.top + 20 }; }
  const x = info.el ? (info.side === 'l' ? r.left : r.right) : r.left;
  c.style.left = ((x - sr.left) / sc - 1) + 'px'; c.style.top = ((r.top - sr.top) / sc - 1) + 'px'; c.style.height = ((r.bottom - r.top) / sc + 2) + 'px';
}
/** What is under the pointer while dragging: trash, screen, scope or another note. */
function dropTarget(ev, excludeIds) {
  const tr = trashEl.getBoundingClientRect();
  if (document.body.classList.contains('dragging') && ev.clientX >= tr.left - 8 && ev.clientX <= tr.right + 8 && ev.clientY >= tr.top - 8 && ev.clientY <= tr.bottom + 8) return { k: 'trash' };
  const hit = document.elementFromPoint(ev.clientX, ev.clientY);
  if (!hit) return null;
  if (hit.closest('#screen')) return { k: 'screen' };
  if (hit.closest('#scope')) return { k: 'scope' };
  const bel = hit.closest('.block');
  if (bel && !excludeIds.includes(bel.dataset.id)) return { k: 'block', id: bel.dataset.id };
  return null;
}
function clearTargets() {
  $$('.block.target').forEach(x => x.classList.remove('target', 'into'));
  screenEl.classList.remove('drop-over'); scopeEl.classList.remove('drop-over'); trashEl.classList.remove('over');
}
function showTarget(t, group) {
  clearTargets();
  if (!t) return;
  if (t.k === 'block') { const tb = byId(t.id); const el = els.get(t.id); el.classList.add('target'); if (tb.type === 'fn' || group.length > 1 || tb.type === 'text' || group[0].type === 'text') el.classList.add('into'); }
  if (t.k === 'screen') screenEl.classList.add('drop-over');
  if (t.k === 'scope') scopeEl.classList.add('drop-over');
  if (t.k === 'trash') trashEl.classList.add('over');
  sfx('tick');
}

/* ---------- dragging notes ---------- */
function onBlockDown(e) {
  const el = e.target.closest('.block');
  if (!el || e.button !== 0 || UI.space) return;
  closePopIfOutside(e);
  if (e.target.closest('button,[contenteditable="true"],.port,.bgrip')) return;
  const b = byId(el.dataset.id); if (!b) return;
  el.style.zIndex = ++UI.zTop;
  if (e.target.closest('.bv .num') && isPlainNum(b) && !b.min) { startScrub(e, b, el); return; }
  if (b.type === 'fn' && e.target.closest('.fsym')) { startOpDrag(e, b); return; }
  e.preventDefault();
  let group = selected.has(b.id) && selected.size > 1 ? [...selected].map(byId).filter(Boolean) : [b];
  let origin = group.map(g => ({ g, x: g.x, y: g.y }));
  const snap = snapData();
  const z = S.cam.z;
  let target = null, lifted = false, copied = false;
  const srcIds = group.map(g => g.id);
  track(e, (ev, dx, dy) => {
    if (!lifted && b.pin && group.length === 1) { lifted = 'pinned'; toast('Pinned — unpin it from ⋯ to move'); return; }
    if (lifted === 'pinned') return;
    if (!lifted) {
      lifted = true; UI.dragging = true;
      if (ev.altKey) { // Alt + drag drags a copy and leaves the originals in place
        snapshot(snap); copied = true;
        group = cloneBlocks(group, 0, 0);
        origin = group.map(g => ({ g, x: g.x, y: g.y }));
        setSelected(group.map(g => g.id), false, true);
        toast(group.length > 1 ? `Copying ${group.length} notes` : 'Copying note');
      }
      document.body.classList.add('dragging');
      group.forEach(g => { const ge = els.get(g.id); ge.classList.add('lift'); ge.style.pointerEvents = 'none'; dragLayer.appendChild(ge); });
      screenEl.classList.add('drop-ready');
      sfx('soft');
    }
    origin.forEach(o => { if (!o.g.pin || copied) { o.g.x = o.x + dx / z; o.g.y = o.y + dy / z; placeEl(o.g, ' rotate(-1.2deg) scale(1.03)'); } });
    const nt = dropTarget(ev, group.map(g => g.id));
    if ((target && target.k) !== (nt && nt.k) || (target && nt && target.id !== nt.id)) { showTarget(nt, group); target = nt; }
    if (target && target.k === 'screen') { target.at = screenDropIndex(ev.clientX, ev.clientY); showDropCaret(target.at); }
    else showDropCaret(null);
    drawLinks();
  }, (ev, moved) => {
    if (!moved || lifted !== true) {
      if (!moved) {
        if (ev.shiftKey || ev.ctrlKey || ev.metaKey) { if (selected.has(b.id)) { selected.delete(b.id); setSelected([], true, true); sfx('desel'); } else setSelected([b.id], true); }
        else setSelected([b.id]);
      }
      return;
    }
    UI.dragging = false;
    document.body.classList.remove('dragging');
    screenEl.classList.remove('drop-ready');
    clearTargets(); showDropCaret(null);
    group.forEach(g => { const ge = els.get(g.id); if (!ge) return; ge.classList.remove('lift'); ge.style.pointerEvents = ''; worldEl.appendChild(ge); placeEl(g); });
    const goBack = () => { if (!copied) tweenBlocks(origin.map(o => ({ b: o.g, x: o.x, y: o.y })), 320); };
    const ids = group.map(g => g.id);
    if (target && target.k === 'screen') { goBack(); if (copied) deleteBlocks(ids, { snap: false, quiet: true, anim: false }); insertMany(srcIds, target.at); }
    else if (target && target.k === 'scope') { goBack(); group.forEach(g => { if (g.type !== 'text') g.plot = true; }); renderAll(); openScope(); fitScope(); sfx('drop'); toast(group.length > 1 ? 'Added to scope' : `${label(group[0], 20)} on scope`); save(); }
    else if (target && target.k === 'trash') { if (!copied) snapshot(snap); deleteBlocks(ids, { snap: false }); }
    else if (target && target.k === 'block') {
      const tb = byId(target.id);
      goBack();
      if (!tb) return;
      if (tb.type === 'fn') addInputs(tb, ids);                                   // many notes -> one function
      else if (group.length > 1) { snapshot(); const nb = newFnNode('sum', [tb.id, ...ids].filter(id => byId(id).type !== 'text'), { near: blockRect(tb) }); flashBlock(nb); }
      else if (tb.type === 'text' || b.type === 'text') addVLink(b.id, tb.id);
      else openMerge(tb, b);
    } else {
      group.forEach(g => { const p = clampPos(g.x, g.y); g.x = p.x; g.y = p.y; placeEl(g); });
      if (!copied) snapshot(snap);
      sfx('drop'); renderAll(); save();
    }
    renderLinks();
  });
}
function closePopIfOutside(e) {
  if (!popEl.hidden && !popEl.contains(e.target) && !e.target.closest('[data-a="more"],[data-a="op"]')) closePop();
}

/* ---------- tuning plain numbers: drag or scroll on the number itself ---------- */
function scrubStep(t) {
  const start = numVal(t);
  const decs = (String(t.v).split('.')[1] || '').replace(/e.*/i, '').length;
  const unit = Math.pow(10, -Math.min(decs, 6));
  return { start, decs, mag: Math.max(unit, Math.pow(10, Math.floor(Math.log10(Math.abs(start) || 1)) - 2)) };
}
/** Set a plain number note to v and refresh only what depends on it. */
function setPlain(b, v, dp) {
  b.tokens[0].v = String(parseFloat(v.toFixed(Math.min(10, dp))));
  recomputeAll();
  const cm = childMap();
  const touched = [b.id, ...downstream(b.id, cm)];
  touched.forEach(id => { const x = byId(id); if (x) renderBlock(x, cm); });
  if (!IN.done && IN.tok.length) renderScreen();
  scopeDirty(); renderStats();
}
function startScrub(e, b, el) {
  e.preventDefault();
  const { start, decs, mag } = scrubStep(b.tokens[0]);
  const snap = snapData();
  let taken = false, lastSteps = 0;
  el.classList.add('scrubbing');
  track(e, (ev, dx, dy) => {
    if (!taken) { taken = true; snapshot(snap); }
    const fine = ev.shiftKey ? 0.1 : ev.altKey ? 10 : 1;
    const steps = Math.round(-dy / 4);
    if (steps !== lastSteps) { lastSteps = steps; sfx('zoom'); }
    setPlain(b, start + steps * mag * fine, Math.max(decs, mag * fine < 1 ? Math.ceil(-Math.log10(mag * fine)) : 0));
  }, (ev, moved) => {
    el.classList.remove('scrubbing');
    if (!moved) { setSelected([b.id], ev.shiftKey); return; }
    sfx('soft'); save(); renderAll();
  }, 2);
}
let wheelSnapT = 0;
function wheelNumber(b, e) {
  if (!wheelSnapT) snapshot();
  clearTimeout(wheelSnapT); wheelSnapT = setTimeout(() => { wheelSnapT = 0; renderAll(); save(); }, 500);
  const { start, decs, mag } = scrubStep(b.tokens[0]);
  const fine = e.shiftKey ? 0.1 : e.altKey ? 10 : 1;
  setPlain(b, start + (e.deltaY < 0 ? 1 : -1) * mag * fine, Math.max(decs, mag * fine < 1 ? Math.ceil(-Math.log10(mag * fine)) : 0));
  sfx('zoom');
}

/* ---------- link ports: drag from a note to link it ---------- */
function onPortDown(e) {
  const port = e.target.closest('.port.out'); if (!port) return;
  e.preventDefault(); e.stopPropagation();
  const b = byId(port.closest('.block').dataset.id); if (!b) return;
  const p0 = toWorld(e.clientX, e.clientY);
  UI.linkDrag = { from: b.id, x: p0.x, y: p0.y };
  root.classList.add('linking');
  let target = null;
  track(e, ev => {
    const p = toWorld(ev.clientX, ev.clientY);
    UI.linkDrag.x = p.x; UI.linkDrag.y = p.y;
    const nt = dropTarget(ev, [b.id]);
    if ((target && target.k) !== (nt && nt.k) || (target && nt && target.id !== nt.id)) { showTarget(nt, [b]); target = nt; }
    drawLinks();
  }, (ev, moved) => {
    UI.linkDrag = null; root.classList.remove('linking'); clearTargets();
    drawLinks();
    if (!moved) { toast('Drag from this dot to another note, or into empty space'); return; }
    if (!target) { openNewNodeMenu(b.id, ev.clientX, ev.clientY); return; }
    if (target.k === 'screen') return insertIntoCalc(b);
    if (target.k === 'scope') return togglePlot(b, true);
    if (target.k === 'block') { const tb = byId(target.id); if (tb.type === 'fn' && b.type !== 'text') addInputs(tb, [b.id]); else addVLink(b.id, tb.id); }
  }, 2);
}

/* ---------- links: select, bend (drag), delete ---------- */
linksEl.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  const del = e.target.closest('[data-del]');
  if (del) { e.stopPropagation(); deleteLink(del.dataset.del); return; }
  const h = e.target.closest('[data-key]'); if (!h) return;
  e.preventDefault(); e.stopPropagation();
  const key = h.dataset.key;
  if (UI.selLink !== key) selectLink(key);
  const b0 = { ...(S.bends[key] || { x: 0, y: 0 }) }, snap = snapData(), z = S.cam.z;
  track(e, (ev, dx, dy) => { S.bends[key] = { x: b0.x + dx / z, y: b0.y + dy / z }; drawLinks(); }, (ev, moved) => { if (moved) { snapshot(snap); save(); sfx('soft'); } }, 3);
});
/* ---------- links: hover shows the operation each link carries ---------- */
const tipEl = $('#linktip');
const OP_NAMES = { '+': 'Add', '-': 'Subtract', '*': 'Multiply', '/': 'Divide', '^': 'Power', root: 'Root', mod: 'Modulo', ncr: 'Combinations', npr: 'Permutations', and: 'AND', or: 'OR', xor: 'XOR', shl: 'Shift left', shr: 'Shift right' };
/** How a link's source feeds its target: { sym, name, detail }. */
function linkInfo(l) {
  const A = byId(l.a), B = byId(l.b);
  if (!A || !B) return null;
  if (l.kind === 'vis') return { sym: '↔', name: 'Visual link', detail: `${label(A, 22)} ↔ ${label(B, 22)} · no math` };
  if (B.type === 'fn') {
    const f = FOPS[B.op] || FOPS.sum, i = B.inputs.indexOf(A.id);
    const lettered = ['custom', 'sub', 'div', 'pow', 'pct'].includes(B.op);
    const detail = B.op === 'custom' ? `${refName(B)} = ${B.formula || B.inputs.map((_, j) => LETTERS[j]).join('+')}` : f.hint;
    return { sym: f.l, name: f.name + (lettered && i >= 0 ? ` · input ${LETTERS[i]}` : ''), detail };
  }
  // a calc note: the operator touching this reference in its equation
  const t = B.tokens, i = t.findIndex(x => x.k === 'ref' && x.id === A.id);
  const opAt = j => (t[j] && t[j].k === 'op' ? t[j].v : null);
  const named = o => ({ sym: OPS[o] ? OPS[o].s : o, name: OP_NAMES[o] || o });
  let r = { sym: '=', name: 'Uses the value' };
  const o = opAt(i - 1) || opAt(i + 1);
  if (o) r = named(o);
  else if (t[i + 1] && t[i + 1].k === 'post') r = { sym: t[i + 1].v, name: t[i + 1].v === '%' ? 'Percent' : 'Factorial' };
  else if ((t[i - 1] && ENDS.has(t[i - 1].k)) || (t[i + 1] && STARTS.has(t[i + 1].k))) r = named('*'); // implicit ×, like 2A
  else {
    // inside brackets or a function call: walk out to the opener
    for (let j = i - 1, d = 0; j >= 0; j--) {
      if (t[j].k === 'rp') d++;
      else if (isOpener(t[j]) && d-- === 0) {
        if (t[j].k === 'fn') { const n = FN[t[j].v] ? FN[t[j].v].l : t[j].v; r = { sym: n, name: `Inside ${n}( )` }; }
        else if (opAt(j - 1)) r = named(opAt(j - 1));
        break;
      }
    }
  }
  return { ...r, detail: `${refName(B)} = ${tokText(t)}` };
}
function showLinkTip(key, x, y) {
  const l = linkList().find(q => q.key === key), info = l && linkInfo(l);
  if (!info) return hideLinkTip();
  if (tipEl.dataset.key !== key) {
    tipEl.dataset.key = key;
    const c = colorOf(byId(l.a));
    tipEl.style.setProperty('--bc', c); tipEl.style.setProperty('--bk', inkFor(c));
    tipEl.innerHTML = `<b class="ls">${esc(info.sym)}</b><span><span class="ln">${esc(info.name)}</span><span class="ld">${esc(trunc(info.detail, 60))}</span></span>`;
  }
  tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = clamp(x + 14, 8, innerWidth - w - 8) + 'px';
  tipEl.style.top = (y + 18 + h < innerHeight - 8 ? y + 18 : y - h - 12) + 'px';
}
function hideLinkTip() { tipEl.hidden = true; delete tipEl.dataset.key; }
linksEl.addEventListener('pointermove', e => {
  const h = e.target.closest('.hit');
  if (!h || e.buttons || UI.dragging || UI.linkDrag) return hideLinkTip();
  showLinkTip(h.dataset.key, e.clientX, e.clientY);
});
linksEl.addEventListener('pointerout', e => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('#links .hit')) hideLinkTip(); });
linksEl.addEventListener('pointerdown', hideLinkTip, true);
linksEl.addEventListener('dblclick', e => {
  const h = e.target.closest('[data-key]'); if (!h) return;
  snapshot(); delete S.bends[h.dataset.key]; drawLinks(); save(); sfx('tick');
});

/* ---------- resizing notes from the corner (every selected note scales together) ---------- */
function onGripDown(e) {
  const grip = e.target.closest('.bgrip'); if (!grip) return;
  e.preventDefault(); e.stopPropagation();
  const b = byId(grip.closest('.block').dataset.id); if (!b) return;
  const group = selected.has(b.id) ? [...selected].map(byId).filter(Boolean) : [b];
  const starts = group.map(g => g.bs || 1);
  const w0 = els.get(b.id).offsetWidth, snap = snapData(), z = S.cam.z;
  track(e, (ev, dx, dy) => {
    const f = clamp((w0 + (dx + dy) / 2 / z) / w0, 0.3, 4);
    group.forEach((g, i) => { g.bs = parseFloat(clamp(starts[i] * f, 0.55, 3).toFixed(3)); renderBlock(g); });
    drawLinks();
  }, (ev, moved) => { if (moved) { snapshot(snap); save(); sfx('soft'); } }, 1);
}

/* ---------- empty desk: marquee select, double-click for a text note ---------- */
function onDeskDown(e) {
  if (e.button !== 0 || UI.space) return;
  closePopIfOutside(e);
  if (UI.selLink) selectLink(null);
  if (DESK) { setSelected([]); return; }
  const add = e.shiftKey || e.ctrlKey || e.metaKey;
  const base = add ? new Set(selected) : new Set();
  const mq = $('#marquee');
  const sx = e.clientX, sy = e.clientY;
  let count = selected.size;
  track(e, ev => {
    const x = Math.min(sx, ev.clientX), y = Math.min(sy, ev.clientY), w = Math.abs(ev.clientX - sx), h = Math.abs(ev.clientY - sy);
    mq.hidden = false; Object.assign(mq.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    const r = rectToWorld({ x, y, w, h });
    const ids = S.blocks.filter(b => overlap(r, blockRect(b), 0)).map(b => b.id);
    selected.clear(); base.forEach(id => selected.add(id)); ids.forEach(id => selected.add(id));
    setSelected([], true, true);
    if (selected.size > count) sfx('sel', selected.size - 1); else if (selected.size < count) sfx('desel');
    count = selected.size;
  }, (ev, moved) => {
    mq.hidden = true;
    if (!moved) setSelected([]);
  }, 4);
}
deskEl.addEventListener('dblclick', e => {
  const w = toWorld(e.clientX, e.clientY);
  snapshot();
  newText({ x: w.x - 20, y: w.y - 20 });
});

/* ---------- the calculator: move, scale, stretch width, rotate ---------- */
function placeCalc() {
  const c = S.calc;
  calcEl.style.setProperty('--wf', c.wf || 1);
  calcEl.style.transform = `translate3d(${c.x}px,${c.y}px,0) scale(${c.s})`;
  if (S.tapeOpen) placeTape();
}
function clampCalc() {
  const w = calcEl.offsetWidth * S.calc.s;
  S.calc.x = clamp(S.calc.x, -w + 80, innerWidth - 80);
  S.calc.y = clamp(S.calc.y, 4, innerHeight - 60);
}
/** Keep the calculator on screen after a mode/orientation/size change. */
function fitCalc() {
  const h = calcEl.offsetHeight, w = calcEl.offsetWidth, vh = innerHeight, vw = innerWidth;
  const top = vw < 640 ? 8 : 56;
  if (h * S.calc.s > vh - top - 8) S.calc.s = Math.max(0.5, parseFloat(((vh - top - 8) / h).toFixed(2)));
  if (w * S.calc.s > vw - 16) S.calc.s = Math.max(0.5, parseFloat(((vw - 16) / w).toFixed(2)));
  const sh = h * S.calc.s, sw = w * S.calc.s;
  if (S.calc.y + sh > vh - 8) S.calc.y = Math.max(top, vh - 8 - sh);
  if (S.calc.y < top && vh - top - 8 >= sh) S.calc.y = top;
  if (S.calc.x + sw > vw - 8) S.calc.x = Math.max(8, vw - 8 - sw);
}
function layoutChanged() {
  requestAnimationFrame(() => { fitCalc(); clampCalc(); placeCalc(); renderLinks(); syncCfg(); });
}
function rotate() {
  S.calc.orient = S.calc.orient === 'portrait' ? 'landscape' : 'portrait';
  calcEl.dataset.orient = S.calc.orient;
  if (!REDUCED) calcEl.animate([{ opacity: 0.4, filter: 'blur(2px)' }, { opacity: 1, filter: 'blur(0)' }], { duration: 260 });
  layoutChanged(); sfx('whoosh'); save();
}
calcEl.addEventListener('pointerdown', e => {
  if (e.button !== 0) return;
  closePopIfOutside(e);
  if (e.target.closest('.k,.fk,.knob,.switch,.mem button,.screen,.grip,.wgrip,button')) return;
  e.preventDefault();
  const ox = S.calc.x, oy = S.calc.y;
  calcEl.classList.add('moving');
  track(e, (ev, dx, dy) => { S.calc.x = ox + dx; S.calc.y = oy + dy; placeCalc(); renderLinks(); },
    (ev, moved) => { calcEl.classList.remove('moving'); clampCalc(); placeCalc(); renderLinks(); save(); if (moved) sfx('soft'); });
});
/** Corner grip: uniform scale. */
$('#grip').addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  const s0 = S.calc.s, w0 = calcEl.offsetWidth;
  track(e, (ev, dx, dy) => { S.calc.s = clamp(s0 + (dx + dy) / 2 / w0, 0.7, 1.9); placeCalc(); renderLinks(); }, () => { save(); syncCfg(); sfx('soft'); }, 1);
});
/** Side handle: stretch the width; keys widen, their labels stay centred. */
$('#wgrip').addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  const f0 = S.calc.wf || 1, w0 = calcEl.offsetWidth / f0;
  track(e, (ev, dx) => { S.calc.wf = parseFloat(clamp(f0 + dx / S.calc.s / w0, 1, 2.4).toFixed(3)); /* never narrower than its keys */ placeCalc(); renderLinks(); }, () => { layoutChanged(); save(); sfx('soft'); }, 1);
});
$('#wgrip').addEventListener('dblclick', () => { S.calc.wf = 1; placeCalc(); layoutChanged(); save(); sfx('tick'); });
/* Arrow keys go to whichever was used last: the calculator (cursor) or the notes (nudge). */
calcEl.addEventListener('pointerdown', () => { UI.focusCalc = true; }, true);
worldEl.addEventListener('pointerdown', () => { UI.focusCalc = false; }, true);
deskEl.addEventListener('pointerdown', () => { UI.focusCalc = false; }, true);
/** Click inside the equation to put the cursor there. */
exprEl.addEventListener('click', e => {
  if (IN.done || !IN.tok.length) return;
  const sp = e.target.closest('.t');
  if (!sp) { IN.cur = null; renderScreen(); return; }
  const i = +sp.dataset.i, t = IN.tok[i], r = sp.getBoundingClientRect();
  const frac = clamp((e.clientX - r.left) / (r.width || 1), 0, 1);
  const off = t.k === 'num' ? Math.round(frac * tokSlots(t)) : frac < 0.5 ? 0 : 1;
  IN.cur = slotStart(i) + off;
  if (IN.cur >= slotCount()) IN.cur = null;
  sfx('tick'); renderScreen();
});
calcEl.addEventListener('mousedown', e => { if (e.target.closest('.k,.fk,.mem button,.switch button')) e.preventDefault(); });
calcEl.addEventListener('pointerdown', e => {
  const k = e.target.closest('.k,.fk,.mem button');
  if (!k || k.classList.contains('dis')) return;
  const a = k.dataset.act;
  if (k.classList.contains('fk') || k.closest('.mem')) sfx('soft'); else sfx(...keySfx(a));
});
calcEl.addEventListener('click', e => {
  const base = e.target.closest('[data-base]');
  if (base) { setBase(+base.dataset.base); sfx('soft'); renderScreen(); return; }
  const k = e.target.closest('[data-act]');
  if (!k || k.classList.contains('dis')) return;
  act(IN.second && k.dataset.act2 ? k.dataset.act2 : k.dataset.act);
});
$('#modeSwitch').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) { setMode(b.dataset.mode); sfx('tick'); } });

/* ---------- precision knob (decimal places) ---------- */
const knob = $('#knob');
function setDP(v) {
  v = clamp(v, -1, 10);
  if (v === S.set.dp) return;
  S.set.dp = v; sfx('tick');
  syncKnob(); renderAll(); renderScreen(); save();
}
function syncKnob() {
  knob.querySelector('.cap').style.transform = `rotate(${-135 + (S.set.dp + 1) * (270 / 11)}deg)`;
  $('#knobLabel').textContent = 'DP · ' + (S.set.dp < 0 ? 'AUTO' : S.set.dp);
  knob.setAttribute('aria-valuenow', S.set.dp);
  knob.setAttribute('aria-valuetext', S.set.dp < 0 ? 'Automatic' : S.set.dp + ' decimal places');
}
knob.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  const v0 = S.set.dp;
  track(e, (ev, dx, dy) => setDP(v0 + Math.round((-dy + dx) / 14)), (ev, moved) => { if (!moved) setDP(S.set.dp >= 10 ? -1 : S.set.dp + 1); }, 2);
});
knob.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); setDP(S.set.dp + (e.deltaY < 0 ? 1 : -1)); }, { passive: false });
knob.addEventListener('dblclick', () => setDP(-1));
knob.addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowRight'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setDP(S.set.dp + 1); }
  if (['ArrowDown', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); e.stopPropagation(); setDP(S.set.dp - 1); }
});

/* ---------- wiring for the notes layer ---------- */
worldEl.addEventListener('pointerdown', e => { if (e.target.closest('.port.out')) onPortDown(e); else if (e.target.closest('.bgrip')) onGripDown(e); else onBlockDown(e); });
dragLayer.addEventListener('pointerdown', onBlockDown);
deskEl.addEventListener('pointerdown', onDeskDown);
worldEl.addEventListener('click', e => {
  const btn = e.target.closest('.block button[data-a]'); if (!btn) return;
  const b = byId(btn.closest('.block').dataset.id); if (!b) return;
  if ((btn.dataset.a === 'more' && popKind === 'menu' || btn.dataset.a === 'op' && popKind === 'fn') && !popEl.hidden && popFor === b.id) { closePop(); return; }
  blockAction(b, btn.dataset.a, btn);
});
worldEl.addEventListener('dblclick', e => {
  const el = e.target.closest('.block'); if (!el || e.target.closest('button,.port,.bgrip')) return;
  const b = byId(el.dataset.id); if (!b) return;
  if (b.type === 'fn' && e.target.closest('.fsym')) return openFnMenu(b, e.target.closest('.fsym'));
  if (b.type === 'text' && !e.target.closest('.bt')) return startTextEdit(b);
  if (e.target.closest('.bt')) rename(b);
  else if (e.target.closest('.bv') && !isPlainNum(b)) insertIntoCalc(b);
  else if (b.min) { b.min = false; renderBlock(b); renderLinks(); save(); }
});

/* =====================================================================
   80 · TAPE & SCOPE
   ---------------------------------------------------------------------
   Tape  : printed history of every =; load or re-pop any entry.
   Scope : five ways to look at the board
     steps   each equation as step bars (1+2+3 climbs 1 -> 3 -> 6), x-equations as curves
     compare plotted numbers side by side, as bars or dots
     flow    the link network as a flow diagram; line weight = value carried
     tree    how one answer is built, operation by operation, through linked notes
     sweep   vary one input number and watch every result that depends on it
   ===================================================================== */

/* ---------- tape ---------- */
/** Copy of tokens with every link replaced by its current value (entries outlive notes). */
function bake(tokens) {
  let cur = clone(tokens), guard = 0;
  while (cur.some(t => t.k === 'ref') && guard++ < 25) {
    cur = cur.flatMap(t => {
      if (t.k !== 'ref') return [t];
      const b = byId(t.id);
      if (!b) return [numTok(0)];
      if (isNumeric(b)) return [numTok(b._val)];
      return [{ k: 'lp' }, ...clone(b.tokens), { k: 'rp' }];
    });
  }
  return cur;
}
function tapeAdd(tok, val, func) {
  S.tape.push({ t: Date.now(), text: tokText(tok, { vals: true }), val, func: !!func, tokens: bake(tok) });
  if (S.tape.length > 300) S.tape.shift();
  if (S.tapeOpen) renderTape();
}
function renderTape() {
  const list = $('#tapeList');
  $('#tapeCount').textContent = S.tape.length ? `· ${S.tape.length}` : '';
  if (!S.tape.length) { list.innerHTML = '<div class="tape-e">Nothing printed yet.<br>Every = lands here.</div>'; return; }
  const fmtT = ts => { const d = new Date(ts); return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
  list.innerHTML = S.tape.map((r, i) => `<div class="trow" data-i="${i}" title="Load into calculator"><span class="tt">${esc(fmtT(r.t))}</span><span class="te">${esc(r.text)}</span><span class="tv">${r.func ? 'ƒ(x)' : esc(fmt(r.val))}</span><span class="ta"><button data-t="load">Load</button><button data-t="pop">Pop</button></span></div>`).join('') + `<div class="tape-end">*** ${S.tape.length} ${S.tape.length === 1 ? 'ENTRY' : 'ENTRIES'} ***</div>`;
  list.scrollTop = list.scrollHeight;
}
/** Tape prints out of the top of the calculator, or sits beside it when there's no room. */
function placeTape() {
  const C = rectOf(calcEl), w = 236;
  tapeEl.classList.remove('side');
  const above = C.y - 14;
  if (above >= 170) {
    const h = Math.min(380, above);
    Object.assign(tapeEl.style, { left: clamp(C.x + (C.w - w) / 2, 8, innerWidth - w - 8) + 'px', top: (C.y - h + 8) + 'px', height: h + 'px' });
  } else {
    tapeEl.classList.add('side');
    const right = C.x + C.w + 12 + w < innerWidth;
    const h = Math.min(420, innerHeight - 24);
    Object.assign(tapeEl.style, { left: (right ? C.x + C.w + 12 : Math.max(8, C.x - w - 12)) + 'px', top: clamp(C.y, 12, innerHeight - h - 12) + 'px', height: h + 'px' });
  }
}
function toggleTape(force) {
  S.tapeOpen = force === undefined ? !S.tapeOpen : force;
  tapeEl.hidden = !S.tapeOpen;
  $('#calc .fk[data-act="tape"]').classList.toggle('on', S.tapeOpen);
  if (S.tapeOpen) { renderTape(); placeTape(); tapeEl.classList.remove('anim'); void tapeEl.offsetWidth; if (!REDUCED) tapeEl.classList.add('anim'); }
  if (!booting) sfx('whoosh');
  save();
}
$('#tapeClose').addEventListener('click', () => toggleTape(false));
$('#tapeClear').addEventListener('click', e => {
  const btn = e.currentTarget;
  if (btn.dataset.arm !== '1') { btn.dataset.arm = '1'; btn.textContent = 'Sure?'; sfx('tick'); setTimeout(() => { btn.dataset.arm = ''; btn.textContent = 'Clear'; }, 2500); return; }
  S.tape = []; btn.dataset.arm = ''; btn.textContent = 'Clear'; renderTape(); save(); sfx('del'); toast('Tape cleared');
});
$('#tapeList').addEventListener('click', e => {
  const row = e.target.closest('.trow'); if (!row) return;
  const r = S.tape[+row.dataset.i]; if (!r) return;
  const t = e.target.closest('[data-t]');
  if (t && t.dataset.t === 'pop') { snapshot(); const nb = newBlock(r.tokens, { from: row.getBoundingClientRect() }); flashBlock(nb); sfx('pop'); return; }
  IN.editing = null; IN.tok = clone(r.tokens); IN.done = false; sfx('soft'); renderScreen();
});

/* ---------- scope: shared state & helpers ---------- */
const SC = { cv: $('#cv'), W: 0, H: 0, raf: 0, hover: null, hidden: new Set(), hits: [], tr: new Map() };
const MODES = { steps: 'Steps', compare: 'Compare', flow: 'Flow', tree: 'Tree', sweep: 'Sweep' };
const V = () => S.scope.v || (S.scope.v = { x0: -1, x1: 9, y0: -1, y1: 10 });
const sx = x => (x - V().x0) / (V().x1 - V().x0) * SC.W;
const sy = y => SC.H - (y - V().y0) / (V().y1 - V().y0) * SC.H;
const wx = px => V().x0 + px / SC.W * (V().x1 - V().x0);
const wy = py => V().y0 + (SC.H - py) / SC.H * (V().y1 - V().y0);
function cssv(n) { return getComputedStyle(calcEl).getPropertyValue(n).trim() || '#888'; }
function cssr(n) { return getComputedStyle(root).getPropertyValue(n).trim() || '#888'; }
/** Theme colours for canvas drawing, cached until the look changes. */
let COL = null;
function colors() {
  if (!COL) COL = { ink: cssr('--ink'), ink2: cssr('--ink-2'), ink3: cssr('--ink-3'), dot: cssr('--desk-dot'), fui: cssr('--f-ui'), fdot: cssr('--f-dot'), accent: cssr('--accent'), err: cssr('--err'), base: cssr('--glass-base') };
  return COL;
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { COL = null; scopeDirty(); });
function niceStep(span, target) {
  const raw = span / Math.max(1, target);
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
function fmtTick(v, st) {
  if (Math.abs(v) >= 1e6 || (Math.abs(v) < 1e-4 && v !== 0)) return fmt(v, { sig: 3, dp: -1 });
  return fmt(parseFloat(v.toFixed(Math.min(Math.max(0, -Math.floor(Math.log10(st) + 1e-9)), 8))), { dp: -1, sig: 8 });
}
/** Truncate text to a pixel width on a canvas. */
function fitText(g, s, w) { if (g.measureText(s).width <= w) return s; while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1); return s + '…'; }
function rrect(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
function tag(g, text, x, y, color, font, align) {
  const C = colors();
  g.font = `600 8.5px ${font}`;
  const w = g.measureText(text).width + 12, h = 16;
  const L = align === 'right' ? x - w : x;
  const T = clamp(y - h / 2, 2, SC.H - h - 2);
  g.fillStyle = color; g.globalAlpha = 0.95; rrect(g, L, T, w, h, 8); g.fill();
  g.globalAlpha = 1; g.fillStyle = inkFor(color.startsWith('#') ? color : '#888888'); g.textAlign = 'left'; g.textBaseline = 'middle';
  g.fillText(text, L + 6, T + h / 2 + 0.5);
  void C;
}
/** Plotted notes (+ the live equation) as drawable series. */
function seriesList() {
  const out = [];
  for (const b of S.blocks) {
    if (!b.plot || b._err || b.type === 'text' || b._empty) continue;
    let ast; try { ast = astOf(b); } catch (e) { continue; }
    out.push({ id: b.id, b, ast, ctx: blockCtx(b), func: !!b._func, color: colorOf(b), label: label(b, 22), val: b._val });
  }
  if (S.scope.live && !IN.done && IN.tok.length) {
    const L = liveEval();
    if (!L.err && L.ast) out.push({ id: 'live', live: true, ast: L.ast, ctx: L.ctx, func: !!L.func, color: colors().accent, label: 'Live', val: L.val });
  }
  return out;
}
function scopeDirty() { if (S.scope.open && !SC.raf) SC.raf = requestAnimationFrame(() => { SC.raf = 0; drawScope(); }); }
/** Something on the board changed: refresh controls and redraw. */
function scopeChanged() { if (S.scope.open) { renderScopeCtl(); scopeDirty(); } }
function drawGrid(g, W, H, xs, ys) {
  const C = colors();
  const v = V(), stX = niceStep(v.x1 - v.x0, W / 70), stY = niceStep(v.y1 - v.y0, H / 46);
  if (((v.x1 - v.x0) / stX) * ((v.y1 - v.y0) / stY) < 6000) {
    g.fillStyle = C.dot;
    for (let x = Math.ceil(v.x0 / stX) * stX; x <= v.x1; x += stX) for (let y = Math.ceil(v.y0 / stY) * stY; y <= v.y1; y += stY) { g.beginPath(); g.arc(sx(x), sy(y), 1.15, 0, 7); g.fill(); }
  }
  g.strokeStyle = C.ink3; g.lineWidth = 1; g.globalAlpha = 0.7;
  if (v.x0 < 0 && v.x1 > 0) { g.beginPath(); g.moveTo(Math.round(sx(0)) + 0.5, 0); g.lineTo(Math.round(sx(0)) + 0.5, H); g.stroke(); }
  if (v.y0 < 0 && v.y1 > 0) { g.beginPath(); g.moveTo(0, Math.round(sy(0)) + 0.5); g.lineTo(W, Math.round(sy(0)) + 0.5); g.stroke(); }
  g.globalAlpha = 1;
  g.font = `500 8.5px ${C.fui}`; g.fillStyle = C.ink3; g.textBaseline = 'top'; g.textAlign = 'center';
  const ay = xs === 'bottom' ? H - 13 : clamp(sy(0) + 4, 4, H - 14);
  for (let x = Math.ceil(v.x0 / stX) * stX; x <= v.x1; x += stX) { if (xs !== 'bottom' && Math.abs(x) < stX / 2) continue; const px = sx(x); if (px < 14 || px > W - 14) continue; g.fillText(fmtTick(x, stX), px, ay); }
  g.textAlign = 'left'; g.textBaseline = 'middle';
  const axx = ys === 'left' ? 5 : clamp(sx(0) + 5, 4, W - 50);
  for (let y = Math.ceil(v.y0 / stY) * stY; y <= v.y1; y += stY) { if (ys !== 'left' && Math.abs(y) < stY / 2) continue; const py = sy(y); if (py < 10 || py > H - 18) continue; g.fillText(fmtTick(y, stY) + (S.scope.mode === 'sweep' && S.scope.rel ? '%' : ''), axx, py); }
}

/* ---------- scope: frame ---------- */
const EMPTY = {
  steps: 'Drop a note here or press its wave button.<br>Numbers draw as step bars, x‑equations as curves.',
  compare: 'Plot two or more number notes<br>to compare them side by side.',
  flow: 'Link a few notes together — through equations,<br>function nodes or manual links — and the network shows here.',
  tree: 'Select a note that’s built from others<br>to see how its answer is put together.',
  sweep: 'Make a plain number feed other notes,<br>then pick it here to see how they respond.',
};
function drawScope() {
  const cv = SC.cv, wrap = cv.parentElement;
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  SC.W = W; SC.H = H; SC.hits = [];
  const mode = S.scope.mode;
  let drawn = false;
  if (mode === 'steps') drawn = drawSteps(g, W, H);
  else if (mode === 'compare') drawn = drawCompare(g, W, H);
  else if (mode === 'flow') drawn = drawFlow(g, W, H);
  else if (mode === 'tree') drawn = drawTree(g, W, H);
  else if (mode === 'sweep') drawn = drawSweep(g, W, H);
  const em = $('#scopeEmpty');
  em.hidden = drawn; if (!drawn) em.innerHTML = EMPTY[mode];
  cv.style.cursor = mode === 'steps' ? 'crosshair' : SC.hits.length ? 'pointer' : 'default';
  if (mode !== 'steps' && mode !== 'sweep') hoverHits();
}
/** Tooltip for hit regions (compare/flow/tree). */
function hoverHits() {
  const ro = $('#readout');
  const h = SC.hover && SC.hits.find(r => SC.hover.px >= r.x && SC.hover.px <= r.x + r.w && SC.hover.py >= r.y && SC.hover.py <= r.y + r.h);
  if (!h) { ro.hidden = true; return; }
  ro.innerHTML = h.tip; ro.hidden = false;
  const rw = ro.offsetWidth, rh = ro.offsetHeight;
  ro.style.left = clamp(SC.hover.px + 14 + rw > SC.W ? SC.hover.px - rw - 14 : SC.hover.px + 14, 4, SC.W - rw - 4) + 'px';
  ro.style.top = clamp(SC.hover.py - rh / 2, 4, SC.H - rh - 4) + 'px';
}

/* ---------- steps (the original view: step bars + curves) ---------- */
function drawSteps(g, W, H) {
  const C = colors();
  drawGrid(g, W, H);
  const ser = seriesList();
  const vis = ser.filter(s => !SC.hidden.has(s.id));
  const traces = vis.filter(s => !s.func), funcs = vis.filter(s => s.func);
  $('#scopeSub').textContent = ser.length ? `${ser.length} trace${ser.length > 1 ? 's' : ''}` : '';
  const K = traces.length, bw = Math.min(0.62 / Math.max(1, K), 0.42);
  const Cy = y => clamp(y, -4 * H, 5 * H);
  traces.forEach((s, k) => {
    const tr = traceOf(s.ast, s.ctx);
    s.tr = tr;
    if (!tr || !tr.length) return;
    const off = (k - (K - 1) / 2) * bw; s.off = off;
    let prev = 0;
    g.lineWidth = 1.5;
    tr.forEach((p, j) => {
      const x = j + off, y0 = j === 0 ? 0 : prev, y1 = p.y;
      if (!isFinite(y1)) return;
      const L = sx(x - bw / 2), R = sx(x + bw / 2), T = Cy(sy(Math.max(y0, y1))), B = Cy(sy(Math.min(y0, y1)));
      const lastStep = j === tr.length - 1;
      g.fillStyle = s.color; g.globalAlpha = lastStep ? 0.55 : 0.22;
      rrect(g, L, T, Math.max(2, R - L), Math.max(1.5, B - T), 3); g.fill();
      g.globalAlpha = 1; g.strokeStyle = s.color; g.stroke();
      if (j > 0) { g.save(); g.setLineDash([2, 3]); g.globalAlpha = 0.7; g.beginPath(); g.moveTo(sx(j - 1 + off + bw / 2), Cy(sy(prev))); g.lineTo(L, Cy(sy(prev))); g.stroke(); g.restore(); }
      if (R - L > 6 || tr.length < 14) {
        g.fillStyle = C.ink; g.font = `${lastStep ? 600 : 500} 8.5px ${C.fui}`; g.textAlign = 'center';
        const up = y1 >= y0; g.textBaseline = up ? 'bottom' : 'top';
        const ly = up ? T - 4 : B + 4;
        if (ly > 8 && ly < H - 8) g.fillText(lastStep && j > 0 ? '=' + fmtS(p.y) : p.lab, (L + R) / 2, ly);
      }
      prev = y1;
    });
    if (isFinite(prev)) {
      const fy = sy(prev);
      if (fy > -2 && fy < H + 2) {
        g.save(); g.strokeStyle = s.color; g.globalAlpha = 0.55; g.setLineDash(s.live ? [6, 4] : [1.5, 4]); g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(0, fy); g.lineTo(W, fy); g.stroke(); g.restore();
        tag(g, `${s.label} = ${fmtS(prev)}`, W - 6, fy, s.color, C.fui, 'right');
      }
    }
  });
  funcs.forEach(s => {
    g.save(); g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = 'round';
    if (s.live) g.setLineDash([6, 4]);
    g.beginPath(); let pen = false, py = 0, lastP = null;
    for (let px = 0; px <= W; px += 1.5) {
      const y = fnAt(s.ast, s.ctx, wx(px));
      if (!isFinite(y)) { pen = false; continue; }
      const yy = sy(y);
      if (pen && Math.abs(yy - py) > H * 1.5) pen = false;
      if (!pen) { g.moveTo(px, Cy(yy)); pen = true; } else g.lineTo(px, Cy(yy));
      py = yy;
      if (yy > 6 && yy < H - 6) lastP = { px, yy };
    }
    g.stroke(); g.restore();
    if (lastP) tag(g, s.label, Math.min(lastP.px, W - 6), lastP.yy - 12, s.color, C.fui, 'right');
  });
  const ro = $('#readout');
  if (SC.hover && vis.length) {
    const { px, py } = SC.hover, x = wx(px);
    g.save(); g.strokeStyle = C.ink3; g.globalAlpha = 0.6; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(px + 0.5, 0); g.lineTo(px + 0.5, H); g.stroke(); g.restore();
    const lines = [`<div style="color:var(--ink-3)">x = ${esc(fmtS(x))}</div>`];
    funcs.forEach(s => {
      const y = fnAt(s.ast, s.ctx, x);
      if (isFinite(y)) { g.fillStyle = s.color; g.beginPath(); g.arc(px, sy(y), 3.5, 0, 7); g.fill(); }
      lines.push(`<div><i style="--bc:${s.color}"></i>${esc(s.label)}  <b>${esc(fmtS(y))}</b></div>`);
    });
    traces.forEach(s => {
      if (!s.tr) return;
      const j = Math.round(x - (s.off || 0)), p = s.tr[j];
      if (p && Math.abs(x - (s.off || 0) - j) < 0.5) lines.push(`<div><i style="--bc:${s.color}"></i>${esc(s.label)} · step ${j + 1}: ${esc(p.lab)} → <b>${esc(fmtS(p.y))}</b></div>`);
    });
    ro.innerHTML = lines.join(''); ro.hidden = false;
    const rw = ro.offsetWidth, rh = ro.offsetHeight;
    ro.style.left = (px + 14 + rw > W ? px - rw - 14 : px + 14) + 'px';
    ro.style.top = clamp(py - rh / 2, 6, H - rh - 6) + 'px';
  } else ro.hidden = true;
  return ser.length > 0;
}
/** Steps view: frame every visible trace and curve. */
function fitScope() {
  if (!S.scope.open || S.scope.mode !== 'steps') { scopeDirty(); return; }
  const ser = seriesList().filter(s => !SC.hidden.has(s.id));
  if (!ser.length) { S.scope.v = { x0: -1, x1: 9, y0: -1, y1: 10 }; scopeDirty(); return; }
  let x0 = Infinity, x1 = -Infinity; const ys = [0];
  const tr = ser.filter(s => !s.func), fn = ser.filter(s => s.func);
  tr.forEach(s => { const t = traceOf(s.ast, s.ctx); if (!t) return; x0 = Math.min(x0, -0.7); x1 = Math.max(x1, t.length - 0.3); t.forEach(p => isFinite(p.y) && ys.push(p.y)); });
  if (fn.length) { if (tr.length) { x0 = Math.min(x0, -1); x1 = Math.max(x1, 7); } else { x0 = -10; x1 = 10; } }
  if (!isFinite(x0)) { x0 = -1; x1 = 9; }
  fn.forEach(s => {
    const vals = [];
    for (let i = 0; i <= 200; i++) { const y = fnAt(s.ast, s.ctx, x0 + (x1 - x0) * i / 200); if (isFinite(y)) vals.push(y); }
    vals.sort((a, b) => a - b);
    if (vals.length) ys.push(vals[Math.floor(vals.length * 0.05)], vals[Math.ceil(vals.length * 0.95) - 1]);
  });
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.16;
  S.scope.v = { x0, x1: x1 + (x1 - x0) * 0.12, y0: y0 - pad, y1: y1 + pad * 1.3 };
  scopeDirty(); save();
}
function zoomScope(f, cx, cy, ax = true, ay = true) {
  const v = V();
  const mx = cx === undefined ? (v.x0 + v.x1) / 2 : wx(cx), my = cy === undefined ? (v.y0 + v.y1) / 2 : wy(cy);
  if (ax) { v.x0 = mx - (mx - v.x0) * f; v.x1 = mx + (v.x1 - mx) * f; }
  if (ay) { v.y0 = my - (my - v.y0) * f; v.y1 = my + (v.y1 - my) * f; }
  scopeDirty(); save();
}

/* ---------- compare ---------- */
function drawCompare(g, W, H) {
  const C = colors();
  let items = seriesList().filter(s => !s.func && typeof s.val === 'number' && isFinite(s.val) && !SC.hidden.has(s.id));
  let note = '';
  if (items.length < 2) {
    const all = S.blocks.filter(isNumeric).slice(-12).map(b => ({ id: b.id, b, color: colorOf(b), label: label(b, 22), val: b._val }));
    if (all.length >= 2) { items = all; note = 'All notes — plot some to choose'; }
  }
  $('#scopeSub').textContent = note || (items.length ? `${items.length} values` : '');
  if (!items.length) return false;
  const vals = items.map(s => s.val);
  const vmin = Math.min(0, ...vals), vmax = Math.max(0, ...vals), span = vmax - vmin || 1;
  g.font = `500 9px ${C.fui}`;
  const labW = clamp(Math.max(...items.map(s => g.measureText(s.label).width)) + 12, 60, W * 0.38);
  const L = labW + 10, R = W - 64, top = 14, rowH = clamp((H - top * 2) / items.length, 14, 34);
  const X = v => L + (v - vmin) / span * (R - L);
  const st = niceStep(span, (R - L) / 70);
  g.fillStyle = C.ink3; g.textAlign = 'center'; g.textBaseline = 'bottom'; g.font = `500 8px ${C.fui}`;
  for (let v = Math.ceil(vmin / st) * st; v <= vmax + 1e-9; v += st) {
    g.globalAlpha = 0.35; g.fillRect(Math.round(X(v)), top, 1, items.length * rowH); g.globalAlpha = 1;
    g.fillText(fmtTick(v, st), X(v), top - 2);
  }
  g.strokeStyle = C.ink3; g.beginPath(); g.moveTo(Math.round(X(0)) + 0.5, top); g.lineTo(Math.round(X(0)) + 0.5, top + items.length * rowH); g.stroke();
  const dots = S.scope.cmp === 'dots';
  items.forEach((s, i) => {
    const y = top + i * rowH + rowH / 2, x0 = X(0), x1 = X(s.val);
    g.font = `500 9px ${C.fui}`; g.fillStyle = C.ink2; g.textAlign = 'right'; g.textBaseline = 'middle';
    g.fillText(fitText(g, s.label, labW - 6), labW, y);
    g.fillStyle = s.color; g.strokeStyle = s.color;
    if (dots) {
      g.globalAlpha = 0.5; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
      g.globalAlpha = 1; g.beginPath(); g.arc(x1, y, Math.min(6, rowH / 3), 0, 7); g.fill();
    } else {
      const bh = Math.max(4, rowH * 0.56);
      g.globalAlpha = s.live ? 0.35 : 0.8; rrect(g, Math.min(x0, x1), y - bh / 2, Math.max(2, Math.abs(x1 - x0)), bh, 3); g.fill(); g.globalAlpha = 1;
    }
    g.fillStyle = C.ink; g.font = `600 9px ${C.fui}`; g.textAlign = s.val < 0 ? 'right' : 'left';
    g.fillText(fmtS(s.val), s.val < 0 ? Math.min(x1, x0) - 6 : Math.max(x1, x0) + 6, y);
    SC.hits.push({ x: 0, y: y - rowH / 2, w: W, h: rowH, id: s.b ? s.b.id : null, tip: `<div><i style="--bc:${s.color}"></i>${esc(s.label)}</div><div><b>${esc(fmt(s.val))}</b> · ${(s.val / (Math.max(...vals.map(Math.abs)) || 1) * 100).toFixed(1)}% of the largest</div>` });
  });
  return true;
}

/* ---------- flow: the link network, left to right ---------- */
function flowGraph(all) {
  const plotted = all ? [] : S.blocks.filter(b => b.plot && b.type !== 'text' && (parentsOf(b).length || childMap().has(b.id)));
  const cm = childMap();
  let ids;
  if (plotted.length) { ids = new Set(); plotted.forEach(b => { ids.add(b.id); upstream(b.id).forEach(x => ids.add(x)); }); }
  else ids = new Set(S.blocks.filter(b => b.type !== 'text' && (parentsOf(b).length || cm.has(b.id))).map(b => b.id));
  S.vlinks.forEach(v => { if (ids.has(v.a) || ids.has(v.b) || !plotted.length) { if (byId(v.a)) ids.add(v.a); if (byId(v.b)) ids.add(v.b); } });
  const nodes = [...ids].map(byId).filter(Boolean);
  const edges = [];
  nodes.forEach(b => { if (b.type !== 'text') parentsOf(b).forEach(p => { if (ids.has(p)) edges.push({ a: p, b: b.id, kind: 'data' }); }); });
  S.vlinks.forEach(v => { if (ids.has(v.a) && ids.has(v.b)) edges.push({ a: v.a, b: v.b, kind: 'vis' }); });
  if (!all && plotted.length && !edges.length) return flowGraph(true);
  return { nodes, edges, plottedOnly: !!plotted.length };
}
function drawFlow(g, W, H) {
  const C = colors();
  const { nodes, edges } = flowGraph();
  $('#scopeSub').textContent = nodes.length ? `${nodes.length} notes · ${edges.length} links` : '';
  if (nodes.length < 2) return false;
  // depth = longest path from a source
  const depth = new Map(nodes.map(n => [n.id, 0]));
  for (let it = 0; it < nodes.length; it++) {
    let changed = false;
    for (const e of edges) { const d = depth.get(e.a) + 1; if (d > depth.get(e.b) && d < nodes.length) { depth.set(e.b, d); changed = true; } }
    if (!changed) break;
  }
  const maxD = Math.max(...depth.values());
  const cols = Array.from({ length: maxD + 1 }, () => []);
  nodes.forEach(n => cols[depth.get(n.id)].push(n));
  const maxAbs = Math.max(1e-12, ...nodes.filter(isNumeric).map(n => Math.abs(n._val)));
  const padX = 14, padY = 14, colW = (W - padX * 2) / (maxD + 1), boxW = clamp(colW * 0.66, 72, 170);
  const hOf = n => (n.type === 'text' ? 26 : isNumeric(n) ? 30 + 30 * Math.sqrt(Math.abs(n._val) / maxAbs) : 32);
  const pos = new Map();
  cols.forEach((list, d) => {
    if (d > 0) {
      const bary = n => { const ps = edges.filter(e => e.b === n.id && pos.has(e.a)).map(e => pos.get(e.a).y + pos.get(e.a).h / 2); return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 1e9; };
      list.sort((a, b) => bary(a) - bary(b));
    }
    const gap = 10, total = list.reduce((s, n) => s + hOf(n), 0) + gap * (list.length - 1);
    const k = Math.min(1, (H - padY * 2) / total);
    let y = padY + Math.max(0, (H - padY * 2 - total * k) / 2);
    list.forEach(n => { const h = hOf(n) * k; pos.set(n.id, { x: padX + d * colW + (colW - boxW) / 2, y, w: boxW, h }); y += h + gap * k; });
  });
  const hov = SC.hover ? SC.hoverId : null;
  // edges first
  edges.forEach(e => {
    const A = pos.get(e.a), B = pos.get(e.b), na = byId(e.a);
    const x0 = A.x + A.w, y0 = A.y + A.h / 2, x1 = B.x, y1 = B.y + B.h / 2, k = Math.max(20, (x1 - x0) * 0.5);
    const lit = hov && (hov === e.a || hov === e.b);
    g.save();
    g.strokeStyle = colorOf(na); g.lineCap = 'round';
    if (e.kind === 'vis') { g.setLineDash([3, 4]); g.lineWidth = 1.4; g.globalAlpha = lit ? 0.9 : hov ? 0.2 : 0.6; }
    else { g.lineWidth = isNumeric(na) ? 1.5 + 10 * Math.sqrt(Math.abs(na._val) / maxAbs) : 2; g.globalAlpha = lit ? 0.7 : hov ? 0.1 : 0.32; }
    g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + k, y0, x1 - k, y1, x1, y1); g.stroke();
    g.restore();
  });
  // nodes
  nodes.forEach(n => {
    const p = pos.get(n.id), col = colorOf(n);
    const dim = hov && hov !== n.id && !edges.some(e => (e.a === hov && e.b === n.id) || (e.b === hov && e.a === n.id));
    g.globalAlpha = dim ? 0.35 : 1;
    g.fillStyle = col; g.globalAlpha *= 0.16; rrect(g, p.x, p.y, p.w, p.h, 8); g.fill();
    g.globalAlpha = dim ? 0.35 : 1; g.strokeStyle = col; g.lineWidth = selected.has(n.id) ? 2.2 : 1.2; g.stroke();
    let tx = p.x + 8;
    if (n.type === 'fn') {
      const r = Math.min(9, p.h / 2 - 3);
      g.fillStyle = col; g.beginPath(); g.arc(p.x + 8 + r, p.y + p.h / 2, r, 0, 7); g.fill();
      g.fillStyle = inkFor(col); g.font = `700 ${Math.round(r * 1.1)}px ${C.fui}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(FOPS[n.op].l, p.x + 8 + r, p.y + p.h / 2 + 0.5);
      tx += r * 2 + 6;
    }
    g.textAlign = 'left'; g.textBaseline = 'middle';
    const tw = p.x + p.w - 8 - tx;
    if (n.type === 'text') { g.font = `500 9px ${C.fui}`; g.fillStyle = C.ink2; g.fillText(fitText(g, label(n, 40), tw), tx, p.y + p.h / 2); }
    else {
      const two = p.h >= 34;
      g.font = `500 8.5px ${C.fui}`; g.fillStyle = C.ink2;
      g.fillText(fitText(g, label(n, 40), tw), tx, two ? p.y + p.h / 2 - 7 : p.y + p.h / 2);
      if (two) { g.font = `700 12px ${C.fdot}`; g.fillStyle = C.ink; g.fillText(fitText(g, n._err ? n._err : n._func ? 'ƒ(x)' : n._empty ? '—' : fmtS(n._val), tw), tx, p.y + p.h / 2 + 7); }
    }
    g.globalAlpha = 1;
    const ins = edges.filter(e => e.b === n.id).length, outs = edges.filter(e => e.a === n.id).length;
    SC.hits.push({ ...p, id: n.id, tip: `<div><i style="--bc:${col}"></i><b>${esc(label(n, 40))}</b></div>${n.type === 'text' ? '' : `<div>${esc(n._err || (n._func ? 'curve ƒ(x)' : n._empty ? 'no inputs yet' : fmt(n._val)))}</div>`}<div style="color:var(--ink-3)">${ins} in · ${outs} out · click to find it</div>` });
  });
  return true;
}

/* ---------- tree: how one answer is built ---------- */
function treeFocus() {
  const pick = id => { const b = byId(id); return b && b.type !== 'text' && !b._empty ? b : null; };
  return pick(S.scope.focus) || [...selected].map(pick).find(Boolean)
    || S.blocks.slice().reverse().find(b => b.type !== 'text' && parentsOf(b).length && !b._empty)
    || S.blocks.filter(b => b.plot).map(b => pick(b.id)).find(Boolean) || null;
}
/** Convert an AST into a display tree with the value of every sub-expression. */
function buildTree(ast, ctx, depth, seen, budget) {
  const val = (() => { try { const v = ev(ast, { ...ctx, x: undefined, tr: null }); return typeof v === 'number' ? v : NaN; } catch (e) { return NaN; } })();
  budget.n++;
  switch (ast.t) {
    case 'grp': budget.n--; return buildTree(ast.a, ctx, depth, seen, budget);
    case 'num': return { lab: ast.c === 'pi' ? 'π' : ast.c === 'e' ? 'e' : fmtS(ast.v), val, kind: 'leaf', kids: [] };
    case 'var': return { lab: 'x', val: NaN, kind: 'leaf', kids: [] };
    case 'neg': return { lab: '−', val, kind: 'op', kids: [buildTree(ast.a, ctx, depth, seen, budget)] };
    case 'post': return { lab: ast.op, val, kind: 'op', kids: [buildTree(ast.a, ctx, depth, seen, budget)] };
    case 'bin': return { lab: OPS[ast.op].s, val, kind: 'op', kids: [buildTree(ast.a, ctx, depth, seen, budget), buildTree(ast.b, ctx, depth, seen, budget)] };
    case 'fn': return { lab: FN[ast.f].l, val, kind: 'op', kids: ast.args.map(a => buildTree(a, ctx, depth, seen, budget)) };
    case 'ref': {
      const b = byId(ast.id);
      const node = { lab: b ? label(b, 16) : '?', val, kind: 'ref', id: ast.id, color: b ? colorOf(b) : C0(), kids: [] };
      if (b && depth < 4 && !seen.has(b.id) && budget.n < 90 && (parentsOf(b).length || b.tokens.length > 1)) {
        try { node.kids = [buildTree(astOf(b), { ...blockCtx(b), memo: ctx.memo }, depth + 1, new Set([...seen, b.id]), budget)]; } catch (e) { /* unparsable */ }
      }
      return node;
    }
  }
  return { lab: '?', val, kind: 'leaf', kids: [] };
}
const C0 = () => colors().ink3;
function drawTree(g, W, H) {
  const C = colors();
  const f = treeFocus();
  $('#scopeSub').textContent = f ? label(f, 22) : '';
  if (!f) return false;
  let ast; try { ast = astOf(f); } catch (e) { return false; }
  const root = { lab: label(f, 18), val: f._val, kind: 'ref', id: f.id, color: colorOf(f), kids: [buildTree(ast, { ...blockCtx(f), memo: new Map() }, 0, new Set([f.id]), { n: 0 })] };
  // layout: every node gets a box width; a subtree is as wide as its children; then scale to fit
  const NODE_GAP = 12, ROW = 64;
  const boxW = n => {
    if (n.kind === 'op') return 30;
    if (n.kind === 'leaf') { g.font = `600 9px ${C.fui}`; return g.measureText(n.lab).width + 14; }
    g.font = `600 8.5px ${C.fui}`; const a1 = g.measureText(n.lab).width; g.font = `700 11px ${C.fdot}`; const a2 = g.measureText(isFinite(n.val) ? fmtS(n.val) : '—').width;
    return Math.max(a1, a2) + 20;
  };
  let maxDepth = 0;
  const measure = (n, d) => {
    n.d = d; n.bw = boxW(n); maxDepth = Math.max(maxDepth, d);
    n.kids.forEach(k => measure(k, d + 1));
    n.span = Math.max(n.bw, n.kids.reduce((s, k) => s + k.span, 0) + NODE_GAP * Math.max(0, n.kids.length - 1));
  };
  measure(root, 0);
  const place = (n, left) => {
    n.cx = left + n.span / 2;
    const inner = n.kids.reduce((s, k) => s + k.span, 0) + NODE_GAP * Math.max(0, n.kids.length - 1);
    let x = left + (n.span - inner) / 2;
    n.kids.forEach(k => { place(k, x); x += k.span + NODE_GAP; });
  };
  place(root, 0);
  const k = Math.min(1.15, (W - 24) / root.span, (H - 28) / (maxDepth * ROW + 44));
  const ox = (W - root.span * k) / 2, oy = 20;
  g.save(); g.translate(ox, oy); g.scale(k, k);
  const P = n => ({ x: n.cx, y: n.d * ROW + 14 });
  const hit = (x, y, w, h, extra) => SC.hits.push({ x: ox + x * k, y: oy + y * k, w: w * k, h: h * k, ...extra });
  const edgesF = n => n.kids.forEach(c => {
    const a = P(n), b = P(c);
    g.strokeStyle = C.ink3; g.globalAlpha = 0.55; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(a.x, a.y + 12); g.bezierCurveTo(a.x, (a.y + b.y) / 2, b.x, (a.y + b.y) / 2, b.x, b.y - 12); g.stroke();
    g.globalAlpha = 1; edgesF(c);
  });
  edgesF(root);
  const nodeF = (n, isRoot) => {
    const p = P(n);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const valTxt = isFinite(n.val) ? fmtS(n.val) : '';
    if (n.kind === 'op') {
      const r = 12;
      g.fillStyle = C.base; g.beginPath(); g.arc(p.x, p.y, r, 0, 7); g.fill();
      g.strokeStyle = C.ink2; g.lineWidth = 1.2; g.stroke();
      g.fillStyle = C.ink; g.font = `700 11px ${C.fui}`; g.fillText(n.lab, p.x, p.y + 0.5);
      if (valTxt) { g.font = `500 8px ${C.fui}`; g.fillStyle = C.ink3; g.textAlign = 'left'; g.fillText('=' + valTxt, p.x + r + 3, p.y + 1); g.textAlign = 'center'; }
      hit(p.x - r, p.y - r, r * 2, r * 2, { tip: `<div><b>${esc(n.lab)}</b> → ${esc(valTxt || '—')}</div>` });
    } else if (n.kind === 'leaf') {
      g.font = `600 9px ${C.fui}`;
      const w = n.bw;
      g.fillStyle = C.base; rrect(g, p.x - w / 2, p.y - 9, w, 18, 9); g.fill();
      g.strokeStyle = C.ink3; g.lineWidth = 1; g.stroke();
      g.fillStyle = C.ink; g.fillText(n.lab, p.x, p.y + 0.5);
    } else {
      const w = n.bw, h = 30;
      g.fillStyle = n.color; g.globalAlpha = 0.18; rrect(g, p.x - w / 2, p.y - h / 2, w, h, 8); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = n.color; g.lineWidth = isRoot ? 2.4 : 1.3; g.stroke();
      g.fillStyle = C.ink2; g.font = `600 8.5px ${C.fui}`; g.fillText(n.lab, p.x, p.y - 6);
      g.fillStyle = C.ink; g.font = `700 11px ${C.fdot}`; g.fillText(valTxt || '—', p.x, p.y + 7);
      hit(p.x - w / 2, p.y - h / 2, w, h, { id: n.id, tip: `<div><i style="--bc:${n.color}"></i><b>${esc(n.lab)}</b> = ${esc(valTxt || '—')}</div><div style="color:var(--ink-3)">click to find it on the board</div>` });
    }
    n.kids.forEach(c => nodeF(c, false));
  };
  nodeF(root, true);
  g.restore();
  return true;
}

/* ---------- sweep: vary one input, watch the results ---------- */
function sweepSetup() {
  const inputs = S.blocks.filter(isPlainNum);
  const cm = childMap();
  let inp = byId(S.scope.sweepIn);
  if (!inp || !isPlainNum(inp)) inp = inputs.find(b => downstream(b.id, cm).size) || inputs[0] || null;
  const outs = inp ? [...downstream(inp.id, cm)].map(byId).filter(b => b && b.type !== 'text' && !b._func && !SC.hidden.has(b.id)).slice(0, 8) : [];
  return { inputs, inp, outs };
}
function drawSweep(g, W, H) {
  const C = colors();
  const { inp, outs } = sweepSetup();
  $('#scopeSub').textContent = inp ? `${label(inp, 14)} → ${outs.length} result${outs.length === 1 ? '' : 's'}` : '';
  if (!inp || !outs.length) return false;
  const v0 = inp._val, r = S.scope.sweepR / 100;
  const a = v0 === 0 ? -10 : v0 - Math.abs(v0) * r, b = v0 === 0 ? 10 : v0 + Math.abs(v0) * r;
  const N = 90, rel = S.scope.rel;
  const series = outs.map(o => {
    const y0 = o._val;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const xv = a + (b - a) * i / N;
      let y = valueWith(o, inp.id, xv);
      if (rel && y0) y = (y - y0) / Math.abs(y0) * 100;
      pts.push([xv, y]);
    }
    return { o, pts, now: rel && y0 ? 0 : y0, color: colorOf(o) };
  });
  const ys = series.flatMap(s => s.pts.map(p => p[1])).filter(isFinite);
  if (!ys.length) return false;
  let y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (y1 - y0 < 1e-9) { y0 -= 1; y1 += 1; }
  const pad = (y1 - y0) * 0.12;
  S.scope._sv = { x0: a - (b - a) * 0.02, x1: b + (b - a) * 0.16, y0: y0 - pad, y1: y1 + pad };
  const keep = S.scope.v; S.scope.v = S.scope._sv;
  drawGrid(g, W, H, 'bottom', 'left');
  const nx = sx(v0);
  g.save(); g.strokeStyle = C.ink2; g.setLineDash([3, 3]); g.globalAlpha = 0.7; g.beginPath(); g.moveTo(nx, 0); g.lineTo(nx, H - 16); g.stroke(); g.restore();
  g.fillStyle = C.ink2; g.font = `600 8px ${C.fui}`; g.textAlign = 'center'; g.textBaseline = 'top'; g.fillText(`${label(inp, 14)} now ${fmtS(v0)}`, clamp(nx, 50, W - 50), 4);
  series.forEach(s => {
    g.strokeStyle = s.color; g.lineWidth = 2; g.lineJoin = 'round';
    g.beginPath(); let pen = false;
    s.pts.forEach(([xv, y]) => { if (!isFinite(y)) { pen = false; return; } const px = sx(xv), py = clamp(sy(y), -H, 2 * H); if (!pen) { g.moveTo(px, py); pen = true; } else g.lineTo(px, py); });
    g.stroke();
    if (isFinite(s.now)) { g.fillStyle = s.color; g.beginPath(); g.arc(nx, sy(s.now), 4, 0, 7); g.fill(); }
    const lastP = [...s.pts].reverse().find(p => isFinite(p[1]));
    if (lastP) tag(g, label(s.o, 16), W - 4, sy(lastP[1]), s.color, C.fui, 'right');
  });
  const ro = $('#readout');
  if (SC.hover) {
    const { px, py } = SC.hover, xv = wx(px);
    g.save(); g.strokeStyle = C.ink3; g.globalAlpha = 0.6; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(px + 0.5, 0); g.lineTo(px + 0.5, H); g.stroke(); g.restore();
    const lines = [`<div style="color:var(--ink-3)">${esc(label(inp, 18))} = ${esc(fmtS(xv))}</div>`];
    series.forEach(s => {
      let y = valueWith(s.o, inp.id, xv);
      const raw = y;
      if (rel && s.o._val) y = (y - s.o._val) / Math.abs(s.o._val) * 100;
      if (isFinite(y)) { g.fillStyle = s.color; g.beginPath(); g.arc(px, sy(y), 3.5, 0, 7); g.fill(); }
      lines.push(`<div><i style="--bc:${s.color}"></i>${esc(label(s.o, 18))}  <b>${esc(fmtS(raw))}</b>${rel && s.o._val ? ` (${y >= 0 ? '+' : ''}${esc(fmtS(y))}%)` : ''}</div>`);
    });
    ro.innerHTML = lines.join(''); ro.hidden = false;
    const rw = ro.offsetWidth, rh = ro.offsetHeight;
    ro.style.left = (px + 14 + rw > W ? px - rw - 14 : px + 14) + 'px';
    ro.style.top = clamp(py - rh / 2, 6, H - rh - 6) + 'px';
  } else ro.hidden = true;
  S.scope.v = keep;
  return true;
}

/* ---------- scope: controls row, panel, events ---------- */
function renderScopeCtl() {
  if (!S.scope.open) return;
  const mode = S.scope.mode, ctl = $('#scopeCtl');
  $$('#scopeModes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.smode === mode)));
  ['scLive', 'scFit', 'scIn', 'scOut'].forEach(id => ($('#' + id).hidden = mode !== 'steps' && !(mode === 'compare' && id === 'scLive')));
  $('#scLive').classList.toggle('on', !!S.scope.live);
  const chips = () => seriesList().map(s => `<button class="lg ${SC.hidden.has(s.id) ? 'off' : ''} ${s.live ? 'live' : ''}" data-id="${s.id}" style="--bc:${s.color}" title="Show or hide"><i></i>${esc(s.label)}${s.live ? '' : `<span class="x" data-x="${s.id}" title="Remove from scope">✕</span>`}</button>`).join('');
  if (mode === 'steps') ctl.innerHTML = chips() || '<span class="hint">Nothing plotted yet</span>';
  else if (mode === 'compare') ctl.innerHTML = `<div class="seg"><button data-cmp="bars" aria-pressed="${S.scope.cmp !== 'dots'}">Bars</button><button data-cmp="dots" aria-pressed="${S.scope.cmp === 'dots'}">Dots</button></div>${chips()}`;
  else if (mode === 'flow') ctl.innerHTML = `<span class="hint">${flowGraph().plottedOnly ? 'Plotted notes and everything feeding them' : 'Every linked note'} · line weight = value · hover to trace · click to find</span>`;
  else if (mode === 'tree') {
    const opts = S.blocks.filter(b => b.type !== 'text' && (parentsOf(b).length || b.tokens.length > 1));
    const f = treeFocus();
    ctl.innerHTML = `<label class="hint" for="treeSel">Note</label><select class="sel" id="treeSel">${opts.map(b => `<option value="${b.id}"${f && f.id === b.id ? ' selected' : ''}>${esc(label(b, 28))}</option>`).join('')}</select><span class="hint">click a linked note to find it</span>`;
  } else if (mode === 'sweep') {
    const { inputs, inp, outs } = sweepSetup();
    ctl.innerHTML = inputs.length
      ? `<label class="hint" for="swIn">Vary</label><select class="sel" id="swIn">${inputs.map(b => `<option value="${b.id}"${inp && inp.id === b.id ? ' selected' : ''}>${esc(label(b, 22))}</option>`).join('')}</select>
         <label class="hint" for="swR">±${S.scope.sweepR}%</label><input type="range" id="swR" min="10" max="200" step="10" value="${S.scope.sweepR}">
         <button class="tb${S.scope.rel ? ' on' : ''}" id="swRel" title="Show each result as % change, so different sizes compare">Relative</button>
         ${outs.map(o => `<button class="lg ${SC.hidden.has(o.id) ? 'off' : ''}" data-id="${o.id}" style="--bc:${colorOf(o)}"><i></i>${esc(label(o, 16))}</button>`).join('')}`
      : '<span class="hint">No plain number notes to vary yet</span>';
  }
}
function setScopeMode(m) {
  S.scope.mode = m; SC.hover = null; SC.hoverId = null;
  renderScopeCtl(); if (m === 'steps') fitScope(); else scopeDirty();
  sfx('tick'); save();
}
function openScope() {
  S.scope.open = true;
  scopeEl.hidden = false;
  if (S.scope.x === null) {
    const w = Math.min(S.scope.w, innerWidth - 24), h = Math.min(S.scope.h, innerHeight - 90);
    S.scope.w = w; S.scope.h = h;
    S.scope.x = innerWidth - w - 16; S.scope.y = innerHeight - h - 16;
  }
  placePanel(scopeEl, S.scope);
  $('#calc .fk[data-act="scope"]').classList.add('on');
  renderScopeCtl();
  if (!S.scope.v) fitScope(); else scopeDirty();
  if (!booting) sfx('whoosh');
  save();
}
function toggleScope(force) {
  const on = force === undefined ? !S.scope.open : force;
  if (on) openScope();
  else { S.scope.open = false; scopeEl.hidden = true; $('#calc .fk[data-act="scope"]').classList.remove('on'); sfx('whoosh'); save(); }
}
function placePanel(el, st) {
  const w = Math.min(st.w || el.offsetWidth, innerWidth - 16);
  st.x = clamp(st.x, 8 - w + 80, innerWidth - 80);
  st.y = clamp(st.y, 8, innerHeight - 40);
  el.style.left = st.x + 'px'; el.style.top = st.y + 'px';
  if (st.w) el.style.width = w + 'px';
  if (st.h) el.style.height = Math.min(st.h, innerHeight - 16) + 'px';
}
SC.cv.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (S.scope.mode !== 'steps') {
    const h = SC.hits.find(r => SC.hover && SC.hover.px >= r.x && SC.hover.px <= r.x + r.w && SC.hover.py >= r.y && SC.hover.py <= r.y + r.h);
    if (h && h.id && byId(h.id)) { setSelected([h.id]); focusBlock(byId(h.id)); flashBlock(byId(h.id)); }
    return;
  }
  const v0 = { ...V() };
  track(e, (ev, dx, dy) => {
    const kx = (v0.x1 - v0.x0) / SC.W, ky = (v0.y1 - v0.y0) / SC.H;
    S.scope.v = { x0: v0.x0 - dx * kx, x1: v0.x1 - dx * kx, y0: v0.y0 + dy * ky, y1: v0.y1 + dy * ky };
    SC.hover = null; scopeDirty();
  }, () => save(), 2);
});
SC.cv.addEventListener('pointermove', e => {
  const r = SC.cv.getBoundingClientRect();
  SC.hover = { px: e.clientX - r.left, py: e.clientY - r.top };
  const h = SC.hits.find(q => SC.hover.px >= q.x && SC.hover.px <= q.x + q.w && SC.hover.py >= q.y && SC.hover.py <= q.y + q.h);
  SC.hoverId = h && h.id ? h.id : null;
  scopeDirty();
});
SC.cv.addEventListener('pointerleave', () => { SC.hover = null; SC.hoverId = null; scopeDirty(); });
SC.cv.addEventListener('wheel', e => {
  e.preventDefault(); e.stopPropagation();
  if (S.scope.mode !== 'steps') return;
  const r = SC.cv.getBoundingClientRect();
  zoomScope(Math.exp(e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top, !e.altKey, !e.shiftKey);
}, { passive: false });
SC.cv.addEventListener('dblclick', fitScope);
$('#scFit').addEventListener('click', () => { fitScope(); sfx('tick'); });
$('#scIn').addEventListener('click', () => { zoomScope(0.7); sfx('zoom'); });
$('#scOut').addEventListener('click', () => { zoomScope(1.4); sfx('zoom'); });
$('#scClose').addEventListener('click', () => toggleScope(false));
$('#scLive').addEventListener('click', () => { S.scope.live = !S.scope.live; renderScopeCtl(); scopeDirty(); save(); sfx('tick'); });
$('#scopeModes').addEventListener('click', e => { const b = e.target.closest('[data-smode]'); if (b) setScopeMode(b.dataset.smode); });
$('#scopeCtl').addEventListener('click', e => {
  const x = e.target.closest('[data-x]');
  if (x) { const b = byId(x.dataset.x); if (b) togglePlot(b, false); return; }
  const c = e.target.closest('[data-cmp]');
  if (c) { S.scope.cmp = c.dataset.cmp; renderScopeCtl(); scopeDirty(); save(); sfx('tick'); return; }
  if (e.target.closest('#swRel')) { S.scope.rel = !S.scope.rel; renderScopeCtl(); scopeDirty(); save(); sfx('tick'); return; }
  const lg = e.target.closest('.lg'); if (!lg) return;
  const id = lg.dataset.id;
  SC.hidden.has(id) ? SC.hidden.delete(id) : SC.hidden.add(id);
  renderScopeCtl(); scopeDirty(); sfx('tick');
});
$('#scopeCtl').addEventListener('input', e => {
  if (e.target.id === 'swR') { S.scope.sweepR = +e.target.value; e.target.previousElementSibling.textContent = `±${S.scope.sweepR}%`; scopeDirty(); save(); }
});
$('#scopeCtl').addEventListener('change', e => {
  if (e.target.id === 'swIn') { S.scope.sweepIn = e.target.value; SC.hidden.clear(); renderScopeCtl(); scopeDirty(); save(); sfx('tick'); }
  if (e.target.id === 'treeSel') { S.scope.focus = e.target.value; scopeDirty(); save(); sfx('tick'); }
});
if ('ResizeObserver' in window) new ResizeObserver(() => scopeDirty()).observe($('#scope .cv-wrap'));

/* panels: drag by header, resize from the corner */
function panelState(el) { return el === scopeEl ? S.scope : (S.cfgPos = S.cfgPos || { x: null, y: null }); }
$$('.panel .ph').forEach(h => h.addEventListener('pointerdown', e => {
  if (e.target.closest('button')) return;
  e.preventDefault();
  const el = h.closest('.panel'), st = panelState(el);
  const ox = el.offsetLeft, oy = el.offsetTop;
  track(e, (ev, dx, dy) => { st.x = ox + dx; st.y = oy + dy; el.style.left = st.x + 'px'; el.style.top = st.y + 'px'; }, () => { placePanel(el, st); save(); });
}));
$$('.pgrip').forEach(gr => gr.addEventListener('pointerdown', e => {
  e.preventDefault(); e.stopPropagation();
  const el = gr.closest('.panel'), st = panelState(el);
  const w0 = el.offsetWidth, h0 = el.offsetHeight;
  track(e, (ev, dx, dy) => { st.w = clamp(w0 + dx, 300, innerWidth - 16); st.h = clamp(h0 + dy, 240, innerHeight - 16); el.style.width = st.w + 'px'; el.style.height = st.h + 'px'; scopeDirty(); }, () => save(), 1);
}));

/* =====================================================================
   85 · EXAMPLES — ready-made logic maps that show what boards are for
   ---------------------------------------------------------------------
   Each example is a small cluster: a text note that explains it and what
   to try, number notes for the inputs, and equations / function nodes
   that turn them into answers. Grid units: one column = 236 px, one
   row = 150 px (world coordinates, relative to the cluster's corner).
   ===================================================================== */
const EX_COL = 236, EX_ROW = 150;
const EXAMPLES = [
  {
    id: 'trip', title: 'Split a trip', blurb: 'Four costs flow into one Σ node, then the total is shared.',
    build(B) {
      const t = B.text('SPLIT A TRIP\nFour costs flow into one Σ node, then get shared between people.\nScrub “People” or any cost. Try Scope → Flow.', 0, 0, 1);
      const fl = B.eq('Flights', '2*189', {}, 0, 1, 1);
      const ho = B.eq('Hotel', '3*142', {}, 0, 2, 1);
      const fo = B.eq('Food', '4*55', {}, 0, 3, 1);
      const ca = B.num('Car', 210, 0, 4, 1);
      const tot = B.fn('Trip total', 'sum', [fl, ho, fo, ca], 1, 2.3, 2);
      const pe = B.num('People', 4, 1, 3.7, 4);
      B.eq('Each pays', 'A/B', { A: tot, B: pe }, 2, 3, 3, { dp: 2 });
      B.link(t, tot);
    },
  },
  {
    id: 'invoice', title: 'Freelance invoice', blurb: 'Hours × rate plus expenses, VAT on top. Sweep the hours.',
    build(B) {
      const t = B.text('FREELANCE INVOICE\nHours × rate plus expenses, then VAT on top.\nScope → Sweep: vary Hours and watch the invoice.', 0, 0, 0);
      const h = B.num('Hours', 38, 0, 1, 0);
      const r = B.num('Rate', 85, 0, 2, 0);
      const ex = B.num('Expenses', 120, 0, 3.1, 4);
      const vr = B.num('VAT %', 25, 0, 4.2, 4);
      const w = B.eq('Work', 'A*B', { A: h, B: r }, 1, 1.5, 0);
      const sub = B.fn('Subtotal', 'sum', [w, ex], 1, 2.8, 0);
      const vat = B.fn('VAT', 'pct', [vr, sub], 1, 4.1, 5, { dp: 2 });
      const inv = B.fn('Invoice', 'sum', [sub, vat], 2, 3.3, 2, { dp: 2 });
      B.link(t, inv);
    },
  },
  {
    id: 'savings', title: 'Savings growth', blurb: 'Compound interest as one formula node with four inputs.',
    build(B) {
      const t = B.text('SAVINGS GROWTH\nCompound interest is one formula node fed by four numbers.\nScope → Sweep on Years, then turn on Relative.', 0, 0, 3);
      const st = B.num('Start', 5000, 0, 1, 3);
      const mo = B.num('Monthly', 200, 0, 2, 3);
      const ra = B.num('Interest %', 6, 0, 3, 4);
      const yr = B.num('Years', 10, 0, 4, 4);
      const fv = B.fn('Future value', 'custom', [st, mo, ra, yr], 1, 1.6, 2, { formula: 'A*(1+C/1200)^(12*D)+B*((1+C/1200)^(12*D)-1)/(C/1200)', dp: 2 });
      const pi = B.fn('Paid in', 'custom', [st, mo, yr], 1, 3.2, 4, { formula: 'A+B*12*C' });
      B.fn('Interest earned', 'sub', [fv, pi], 2, 2.4, 3, { dp: 2 });
      B.link(t, fv);
    },
  },
  {
    id: 'breakeven', title: 'Break-even', blurb: 'Numbers and a curve built from the same notes.',
    build(B) {
      const t = B.text('BREAK-EVEN\nThe profit curve and the break-even number use the same notes.\nScope → Steps: the curve crosses zero at the break-even point. Scrub Price.', 0, 0, 5);
      const p = B.num('Price', 25, 0, 1, 5);
      const c = B.num('Unit cost', 9, 0, 2, 5);
      const f = B.num('Fixed costs', 4000, 0, 3, 4);
      const m = B.eq('Margin per unit', 'A-B', { A: p, B: c }, 1, 1.5, 5);
      B.eq('Break-even units', 'A/B', { A: f, B: m }, 1, 2.8, 2);
      B.eq('Profit (x = hundreds sold)', 'A*100*x-B', { A: m, B: f }, 2, 2, 3, { plot: true });
      B.link(t, m);
    },
  },
  {
    id: 'recipe', title: 'Recipe scaler', blurb: 'One ratio fans out to every ingredient.',
    build(B) {
      const t = B.text('RECIPE SCALER\nOne ratio fans out to every ingredient.\nScrub “Servings wanted”.', 0, 0, 2);
      const rs = B.num('Recipe serves', 4, 0, 1, 4);
      const sw = B.num('Servings wanted', 6, 0, 2, 2);
      const sc = B.eq('Scale', 'A/B', { A: sw, B: rs }, 1, 1.5, 2);
      B.eq('Flour g', '250*A', { A: sc }, 2, 0.6, 2);
      B.eq('Butter g', '120*A', { A: sc }, 2, 1.6, 2);
      B.eq('Eggs', 'round(2*A)', { A: sc }, 2, 2.6, 2);
      B.eq('Milk ml', '300*A', { A: sc }, 2, 3.6, 2);
      B.link(t, sc);
    },
  },
  {
    id: 'deal', title: 'Which pack is cheaper?', blurb: 'Price per kilo for each pack; the cheapest wins.',
    build(B) {
      const t = B.text('WHICH PACK IS CHEAPER?\nPrice per kilo for each pack, then a Minimum node picks the winner.\nScope → Compare shows them as bars.', 0, 0, 1);
      const a = B.eq('Small €/kg', '4.99/0.5', {}, 0, 1, 1, { plot: true, dp: 2 });
      const b = B.eq('Big €/kg', '12.49/1.5', {}, 0, 2, 0, { plot: true, dp: 2 });
      const c = B.eq('Bulk €/kg', '29.90/4', {}, 0, 3, 3, { plot: true, dp: 2 });
      const best = B.fn('Cheapest €/kg', 'min', [a, b, c], 1, 2, 2, { dp: 2 });
      B.eq('Saving vs small €/kg', 'A-B', { A: a, B: best }, 2, 2, 3, { dp: 2 });
      B.link(t, best);
    },
  },
  {
    id: 'triangle', title: 'Right triangle', blurb: 'Formula nodes as building blocks. Open the Tree view.',
    build(B) {
      const t = B.text('RIGHT TRIANGLE\nFormula nodes as math building blocks.\nSelect Hypotenuse, then Scope → Tree shows how it is built.', 0, 0, 4);
      const a = B.num('Side a', 3, 0, 1, 1);
      const b = B.num('Side b', 4, 0, 2, 1);
      const h = B.fn('Hypotenuse', 'custom', [a, b], 1, 1, 0, { formula: 'sqrt(A^2+B^2)' });
      B.eq('Area', 'A*B/2', { A: a, B: b }, 1, 2.3, 3);
      B.eq('Angle α°', 'atan(A/B)', { A: a, B: b }, 2, 1, 5, { ang: 'deg', dp: 1 });
      B.fn('Perimeter', 'sum', [a, b, h], 2, 2.3, 4);
      B.link(t, h);
    },
  },
];

/** Build one example with its corner at world (ox, oy). Returns the new notes. */
function buildExample(ex, ox, oy) {
  const made = [];
  const at = (cx, ry) => ({ x: ox + cx * EX_COL, y: oy + ry * EX_ROW });
  const mk = (type, name, c, extra = {}) => {
    const b = baseBlock(type, { name, c, mode: 'std', ang: extra.ang || 'deg' });
    S.blocks.push(b); made.push(b);
    return b;
  };
  const ids = vars => { const m = {}; Object.entries(vars || {}).forEach(([k, n]) => (m[k] = n.id)); return m; };
  const B = {
    text(text, cx, ry, c) { const b = mk('text', '', c); b.text = text; b.w = EX_COL * 2 - 20; Object.assign(b, at(cx, ry)); return b; },
    num(name, v, cx, ry, c, o = {}) { const b = mk('calc', name, c); if (o.dp >= 0) b.dp = o.dp; b.tokens = [{ k: 'num', v: String(v), b: 10 }]; Object.assign(b, at(cx, ry)); return b; },
    eq(name, formula, vars, cx, ry, c, o = {}) {
      const b = mk('calc', name, c, o);
      b.tokens = textToTokens(formula, ids(vars));   // vars object => "." decimals whatever the locale
      Object.assign(b, at(cx, ry));
      if (o.plot) b.plot = true;
      if (o.dp >= 0) b.dp = o.dp;
      return b;
    },
    fn(name, op, inputs, cx, ry, c, o = {}) {
      const b = mk('fn', name, c);
      b.op = op; b.inputs = inputs.map(n => n.id); b.formula = o.formula || '';
      b.tokens = fnTokens(b);
      if (o.dp >= 0) b.dp = o.dp;
      Object.assign(b, at(cx, ry));
      return b;
    },
    link(a, b) { S.vlinks.push({ id: uid('v'), a: a.id, b: b.id }); },
  };
  ex.build(B);
  return made;
}
/** Add examples to the right of everything on the board (or in view if it's empty), then frame them. */
function addExamples(list) {
  snapshot();
  let ox, oy;
  if (S.blocks.length) {
    let x1 = -Infinity, y0 = Infinity;
    S.blocks.forEach(b => { const r = blockRect(b); x1 = Math.max(x1, r.x + r.w); y0 = Math.min(y0, r.y); });
    ox = x1 + 260; oy = y0;
  } else { const v = viewWorld(), C = rectToWorld(rectOf(calcEl)); ox = Math.max(v.x + 40, C.x + C.w + 60); oy = v.y + 80; }
  const all = [];
  let cx = ox, cy = oy, rowH = 0, col = 0;
  list.forEach(ex => {
    const made = buildExample(ex, cx, cy);
    recomputeAll();
    made.forEach(b => renderBlock(b));
    // push apart anything that ended up overlapping (text wraps differently per font)
    for (let pass = 0; pass < 6; pass++) {
      let moved = false;
      const rs = made.map(b => ({ b, r: blockRect(b) })).sort((p, q) => p.r.y - q.r.y);
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
        const a = rs[i].r, c = rs[j].r;
        if (overlap(a, c, 8)) { rs[j].b.y = a.y + a.h + 16; c.y = rs[j].b.y; moved = true; }
      }
      if (!moved) break;
    }
    made.forEach(b => placeEl(b));
    let x1 = -Infinity, y1 = -Infinity;
    made.forEach(b => { const r = blockRect(b); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
    rowH = Math.max(rowH, y1 - cy);
    all.push(...made);
    if (++col >= 3) { col = 0; cx = ox; cy += rowH + 180; rowH = 0; } else cx = x1 + 200;
  });
  S.example = false;
  recomputeAll(); renderAll(); renderScreen(); save();
  setSelected([], false, true);
  sfx('merge');
  requestAnimationFrame(() => fitAll(all));
  toast(list.length > 1 ? `Added ${list.length} examples — zoom in on any of them` : `Added “${list[0].title}”`);
}
/** The Examples gallery popover. */
function openExamples(anchorEl) {
  if (popKind === 'examples' && !popEl.hidden) return closePop();
  popEl.innerHTML = `<h4>Examples<span class="sp"></span><button class="tb" data-ex="all">Add all</button></h4>
    <div class="exlist">${EXAMPLES.map(ex => `<button class="exi" data-ex="${ex.id}"><b>${esc(ex.title)}</b><span>${esc(ex.blurb)}</span></button>`).join('')}</div>
    <p class="exnote">Each lands next to your notes with a note on what to try. Ctrl+Z removes it.</p>`;
  openPop('examples', null);
  const r = anchorEl.getBoundingClientRect();
  positionPop(r.left + r.width / 2, r.bottom + 6, r.top - 6);
  popEl.onclick = e => {
    const b = e.target.closest('[data-ex]'); if (!b) return;
    closePop();
    addExamples(b.dataset.ex === 'all' ? EXAMPLES : EXAMPLES.filter(x => x.id === b.dataset.ex));
  };
}

/* =====================================================================
   90 · CONFIG, FILES, KEYBOARD, BOOT
   ===================================================================== */

/* ---------- config panel (built from small row helpers) ---------- */
function segRow(lab, key, opts, stack) {
  const cur = key === 'orient' ? S.calc.orient : S.set[key];
  return `<div class="row${stack ? ' stack' : ''}"><span class="lb">${lab}</span><div class="seg" role="group" aria-label="${esc(lab)}">${opts.map(([v, l]) => `<button data-set="${key}" data-val="${esc(v)}" aria-pressed="${String(cur) === String(v)}">${esc(l)}</button>`).join('')}</div></div>`;
}
const togRow = (lab, key) => `<div class="row"><span class="lb">${lab}</span><button class="tog" role="switch" data-tog="${key}" aria-checked="${!!S.set[key]}" aria-label="${esc(lab)}"></button></div>`;
const rangeRow = (lab, key, min, max, st = 1, src = 'set') => {
  const v = src === 'calc' ? Math.round(S.calc[key] * 100) : S.set[key];
  return `<div class="row"><label for="cfg_${key}">${lab}</label><input type="range" id="cfg_${key}" data-range="${key}" data-src="${src}" min="${min}" max="${max}" step="${st}" value="${v}"></div>`;
};
function buildCfg() {
  const s = S.set;
  $('#cfgBody').innerHTML = `
  <div class="cfg-sec"><h3>Preset</h3><div class="presets">${Object.entries(PRESETS).map(([k, p]) => `<button class="preset" data-preset="${k}" aria-pressed="${s.preset === k}"><span class="sw">${[p.accent, ...p.palette.slice(1, 4)].map(c => `<i style="background:${c}"></i>`).join('')}</span>${p.label}</button>`).join('')}</div></div>
  <div class="cfg-sec"><h3>Look</h3>
    ${segRow('Theme', 'theme', [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']])}
    ${segRow('Body', 'material', [['polar', 'Polar'], ['silver', 'Silver'], ['graphite', 'Graphite'], ['clear', 'Clear'], ['aqua', 'Aqua']], true)}
    ${segRow('Screen', 'screen', [['oled', 'OLED'], ['lcd', 'LCD'], ['paper', 'Paper'], ['glass', 'Glass']], true)}
    ${segRow('Keys', 'keys', [['squircle', 'Soft'], ['round', 'Round'], ['square', 'Square']])}
    ${segRow('Notes', 'notes', [['glass', 'Glass'], ['solid', 'Post‑it']])}
    <div class="row stack"><span class="lb">Accent</span><div class="swatches">${ACCENTS.map(c => `<button class="swatch ${s.accent.toLowerCase() === c.toLowerCase() ? 'on' : ''}" style="--sc:${c}" data-accent="${c}" aria-label="Accent ${c}"></button>`).join('')}<span class="swatch" style="--sc:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" title="Pick any accent"><input type="color" id="cfgAccent" value="${s.accent}" aria-label="Pick any accent"></span></div></div>
    <div class="row stack"><span class="lb">Note colors · click to change</span><div class="swatches">${s.palette.map((c, i) => `<span class="swatch" style="--sc:${c}"><input type="color" data-pal="${i}" id="cfgPal${i}" value="${c}" aria-label="Note color ${i + 1}"></span>`).join('')}</div></div>
  </div>
  <div class="cfg-sec"><h3>Note gradient</h3>
    ${segRow('Style', 'grad', [['tint', 'Tint'], ['duo', 'Two‑tone'], ['none', 'Flat']])}
    ${rangeRow('Strength', 'gradS', 0, 70)}
    ${rangeRow('Angle', 'gradA', 0, 360, 5)}
    <p class="note">Two‑tone fades each note into a second color, set per note in its ⋯ menu.</p>
  </div>
  <div class="cfg-sec"><h3>Type</h3>
    <div class="row"><label for="cfgFDot">Number face</label><select class="sel" id="cfgFDot" data-font="fDot">${FONTS_DOT.map(f => `<option${f === s.fDot ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
    <div class="row"><label for="cfgFUi">Label face</label><select class="sel" id="cfgFUi" data-font="fUi">${FONTS_UI.map(f => `<option${f === s.fUi ? ' selected' : ''}>${f}</option>`).join('')}</select></div>
  </div>
  <div class="cfg-sec"><h3>Size & glass</h3>
    ${rangeRow('Calculator size', 's', 70, 190, 5, 'calc')}
    ${rangeRow('Calculator width', 'wf', 100, 240, 5, 'calc')}
    ${rangeRow('Note size', 'ns', 70, 160, 5)}
    ${rangeRow('Glass blur', 'blur', 0, 40)}
    ${rangeRow('Note opacity', 'glass', 15, 98)}
    ${segRow('Orientation', 'orient', [['portrait', 'Portrait'], ['landscape', 'Landscape']])}
  </div>
  <div class="cfg-sec"><h3>Details</h3>
    ${togRow('Screws', 'screws')}${togRow('Dotted desk', 'grid')}${togRow('Equation links between notes', 'links')}${togRow('Sounds', 'sound')}
    ${rangeRow('Volume', 'volume', 0, 100)}
    ${segRow('Key switches', 'switches', Object.entries(SWITCHES).map(([k, w]) => [k, w.label]), true)}
    <p class="note">How the calculator keys sound. ⌫, CE, C and Del have their own sound in every set.</p>
  </div>
  <div class="cfg-sec"><h3>Numbers</h3>
    ${segRow('Decimal mark', 'dec', [['.', '1.5'], [',', '1,5']])}
    ${segRow('Digit grouping', 'group', [['', 'None'], [',', '1,000'], ['.', '1.000'], [' ', '1 000'], ["'", "1'000"]], true)}
    ${segRow('Angles', 'angle', [['deg', 'Degrees'], ['rad', 'Radians']])}
    ${segRow('After =, keep going with', 'cont', [['link', 'Linked note'], ['value', 'Plain value']], true)}
    ${togRow('Merging keeps the originals', 'keepOnMerge')}
  </div>
  ${DESK ? `<div class="cfg-sec"><h3>Desktop</h3>${togRow('Float above other windows', 'onTop')}<p class="note">Ctrl+Shift+Space shows or hides Tally. Empty board space lets clicks through to your apps.</p><div class="btnrow"><button class="btn" id="cfgQuit">Quit Tally</button></div></div>` : ''}
  <div class="cfg-sec"><h3>Board files</h3>
    <div class="btnrow"><button class="btn" data-file="import">Import…</button><button class="btn" data-file="board">Export board</button><button class="btn" data-file="sel">Export selection</button><button class="btn" data-file="pdf">Selection as PDF</button></div>
    <div class="btnrow"><button class="btn" id="cfgReset">Reset look</button></div>
    <p class="note">${cloud.ready ? 'Your board and settings sync to your account and are saved in this browser as you work.' : 'Your board and settings are saved in this browser as you work.'}</p>
  </div>
  <div class="cfg-sec"><h3>Keyboard & mouse</h3><div class="kbd">
    <b>0–9 . + − * / ^ ( )</b><span>Type equations · Enter makes a note</span>
    <b>Enter (empty)</b><span>New 0 note to build with · = repeats the last operation</span>
    <b>Esc</b><span>Clear, stop editing, deselect</span>
    <b>← → · Home End · Del</b><span>Move the cursor in the equation · → at the end steps out of a bracket · delete ahead</span>
    <b>⌫ / Del</b><span>Backspace / delete selected notes or link</span>
    <b>x p e · s c t l g r q m</b><span>x (×in STD), π, e · sin cos tan ln log √ x² mod</span>
    <b>Wheel · Ctrl+wheel</b><span>Zoom the board (trackpad scroll pans)</span>
    <b>Middle drag · Space+drag</b><span>Pan the board</span>
    <b>Alt+drag</b><span>Drag a copy of the notes</span>
    <b>Double‑click desk</b><span>New text note</span>
    <b>Drag a note’s ● dot</b><span>Link it, feed a function node, or start a new one</span>
    <b>Ctrl D · F2 · arrows</b><span>Duplicate · rename · nudge selected notes after clicking one (Shift = 10×)</span>
    <b>Ctrl C / V</b><span>Copy / paste notes (or paste an equation)</span>
    <b>Ctrl Z / Ctrl⇧Z · Ctrl A</b><span>Undo / redo · select all</span>
    <b>Ctrl 0 · Ctrl 1</b><span>Zoom 100% · fit all notes</span>
  </div></div>`;
}
/** A few keystrokes in the chosen switch set: two digits, an operator, a delete. */
function previewSwitches() {
  [['key', 1], ['key', 5], ['op', 0], ['back', 0]].forEach(([k, n], i) => setTimeout(() => sfx(k, n), i * 140));
}
function syncCfg() { if (!cfgEl.hidden) { const b = $('#cfg .cfg-body'), sc = b.scrollTop; buildCfg(); b.scrollTop = sc; } }
function toggleCfg(force) {
  const on = force === undefined ? cfgEl.hidden : force;
  cfgEl.hidden = !on;
  $('#calc .fk[data-act="cfg"]').classList.toggle('on', on);
  if (on) {
    buildCfg();
    const st = panelState(cfgEl);
    if (st.x === null) { const C = rectOf(calcEl); const w = Math.min(340, innerWidth - 24); st.x = C.x + C.w + 16 + w < innerWidth ? C.x + C.w + 16 : Math.max(12, C.x - w - 16); st.y = 64; st.h = innerHeight - 80; }
    st.h = Math.min(st.h || innerHeight - 80, innerHeight - 24);
    placePanel(cfgEl, st);
  }
  sfx('whoosh');
}
$('#cfgClose').addEventListener('click', () => toggleCfg(false));
$('#cfgBody').addEventListener('click', e => {
  const s = S.set;
  const seg = e.target.closest('[data-set]');
  if (seg) {
    const k = seg.dataset.set, v = seg.dataset.val;
    if (k === 'orient') { if (v !== S.calc.orient) rotate(); syncCfg(); return; }
    s[k] = v;
    if (k === 'dec' && s.group === v) s.group = v === ',' ? ' ' : ',';
    if (k === 'group' && s.dec === v) s.dec = v === ',' ? '.' : ',';
    if (['theme', 'material', 'screen', 'keys'].includes(k)) s.preset = 'custom';
    if (k === 'switches') previewSwitches(); else sfx('tick');
    applySettings(); syncCfg(); return;
  }
  const pr = e.target.closest('[data-preset]');
  if (pr) {
    const p = PRESETS[pr.dataset.preset];
    Object.assign(s, { preset: pr.dataset.preset, theme: p.theme, material: p.material, screen: p.screen, keys: p.keys, accent: p.accent, palette: p.palette.slice(), fDot: p.fDot, fUi: p.fUi });
    sfx('merge'); applySettings(); syncCfg(); return;
  }
  const ac = e.target.closest('[data-accent]');
  if (ac) { s.accent = ac.dataset.accent; s.preset = 'custom'; sfx('tick'); applySettings(); syncCfg(); return; }
  const tg = e.target.closest('[data-tog]');
  if (tg) {
    const k = tg.dataset.tog; s[k] = !s[k];
    tg.setAttribute('aria-checked', String(!!s[k]));
    if (k === 'onTop' && DESK && DESK.setOnTop) DESK.setOnTop(s.onTop);
    sfx('tick'); applySettings(); return;
  }
  const f = e.target.closest('[data-file]');
  if (f) return fileAction(f.dataset.file);
  if (e.target.id === 'cfgReset') {
    const keep = { dec: s.dec, group: s.group, angle: s.angle, cont: s.cont, dp: s.dp };
    S.set = { ...DEF, ...keep, palette: DEF.palette.slice() };
    S.calc.s = 1; S.calc.wf = 1; placeCalc();
    applySettings(); syncCfg(); toast('Look reset'); sfx('whoosh');
  }
  if (e.target.id === 'cfgQuit' && DESK) DESK.quit();
});
$('#cfgBody').addEventListener('input', e => {
  const s = S.set, t = e.target;
  if (t.dataset.range) {
    if (t.dataset.src === 'calc') { S.calc[t.dataset.range] = t.value / 100; placeCalc(); clampCalc(); renderLinks(); save(); return; }
    s[t.dataset.range] = +t.value; applySettings(false); return;
  }
  if (t.id === 'cfgAccent') { s.accent = t.value; s.preset = 'custom'; applySettings(false); return; }
  if (t.dataset.pal !== undefined) { s.palette[+t.dataset.pal] = t.value; t.parentElement.style.setProperty('--sc', t.value); s.preset = 'custom'; applySettings(false); }
});
$('#cfgBody').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.font) { S.set[t.dataset.font] = t.value; S.set.preset = 'custom'; applySettings(); sfx('tick'); }
  if (t.dataset.src === 'calc') layoutChanged();
  if (t.id === 'cfgAccent' || t.dataset.pal !== undefined) syncCfg();
});

function ensureFont(f) {
  if (loadedFonts.has(f) || !FONT_Q[f]) return;
  loadedFonts.add(f);
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${FONT_Q[f]}&display=swap`;
  l.onload = () => { (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => setTimeout(() => { COL = null; renderAll(); renderScreen(); }, 60)); };
  document.head.appendChild(l);
}
/** Push settings into CSS variables / attributes. full=false skips heavy re-layout (sliders). */
function applySettings(full = true) {
  const s = S.set;
  root.classList.toggle('force-dark', s.theme === 'dark');
  root.classList.toggle('force-light', s.theme === 'light');
  root.dataset.material = s.material; root.dataset.screen = s.screen; root.dataset.keys = s.keys; root.dataset.notes = s.notes; root.dataset.grad = s.grad;
  root.style.setProperty('--accent', s.accent);
  root.style.setProperty('--accent-ink', inkFor(s.accent));
  s.palette.forEach((c, i) => root.style.setProperty('--c' + i, c));
  root.style.setProperty('--blur', s.blur + 'px');
  root.style.setProperty('--glass-a', s.glass / 100);
  root.style.setProperty('--ns', s.ns / 100);
  root.style.setProperty('--gs', (s.grad === 'none' ? 0 : s.gradS) + '%');
  root.style.setProperty('--gs2', (s.grad === 'duo' ? s.gradS : 0) + '%');
  root.style.setProperty('--ga', s.gradA + 'deg');
  ensureFont(s.fDot); ensureFont(s.fUi);
  root.style.setProperty('--f-dot', `"${s.fDot}","Doto","DotGothic16",ui-monospace,monospace`);
  root.style.setProperty('--f-ui', `"${s.fUi}","Martian Mono",ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace`);
  root.classList.toggle('no-screws', !s.screws);
  root.classList.toggle('no-grid', !s.grid);
  calcEl.dataset.orient = S.calc.orient;
  calcEl.dataset.mode = S.calc.mode;
  COL = null;
  save();
  if (full) { syncKnob(); renderAll(); renderScreen(); layoutChanged(); }
  else { S.blocks.forEach(b => renderBlock(b)); renderLinks(); scopeDirty(); }
  updateBar();
}

/* ---------- files: export / import boards, PDF of a note tree ---------- */
const dlCap = CL ? CL.use('downloads').catch(() => null) : Promise.resolve(null);
/** Hand a generated file to the viewer (platform save prompt, or a normal download). */
async function offerFile(filename, data) {
  const dl = await dlCap;
  if (dl) {
    try { await dl.save({ filename, data }); toast(`Saved ${filename}`); sfx('drop'); return; }
    catch (e) { if (e && e.code === 'declined') return; if (e && !['unavailable', 'not_granted', 'capability_disabled', 'capability_removed'].includes(e.code)) { toast('Couldn’t save the file'); return; } }
  }
  const blob = data instanceof Blob ? data : new Blob([data], { type: filename.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast(`Exported ${filename}`); sfx('drop');
}
const stamp = () => new Date().toISOString().slice(0, 10);
/** Selected notes plus everything that feeds them (so an export stands on its own). */
function selectionTree() {
  const ids = new Set();
  [...selected].forEach(id => { ids.add(id); upstream(id).forEach(x => ids.add(x)); });
  S.vlinks.forEach(v => { if (ids.has(v.a) && byId(v.b) && byId(v.b).type === 'text') ids.add(v.b); if (ids.has(v.b) && byId(v.a) && byId(v.a).type === 'text') ids.add(v.a); });
  return [...ids].map(byId).filter(Boolean);
}
function boardData(list, kind) {
  const ids = new Set(list.map(b => b.id));
  return serial({
    tally: 2, kind, exportedAt: new Date().toISOString(), nextId: S.nextId,
    blocks: list, vlinks: S.vlinks.filter(v => ids.has(v.a) && ids.has(v.b)),
    bends: Object.fromEntries(Object.entries(S.bends).filter(([k]) => [...ids].some(id => k.includes(id)))),
    cam: kind === 'board' ? S.cam : undefined,
  });
}
async function fileAction(kind) {
  closePop();
  if (kind === 'import') return $('#fileIn').click();
  if (kind === 'board') { if (!S.blocks.length) return toast('The board is empty'); return offerFile(`tally-board-${stamp()}.json`, boardData(S.blocks, 'board')); }
  const list = selected.size ? selectionTree() : [];
  if (!list.length) { toast('Select some notes first'); return; }
  if (kind === 'sel') return offerFile(`tally-notes-${stamp()}.json`, boardData(list, 'selection'));
  if (kind === 'pdf') return exportPDF(list);
}
/** Import: a whole board replaces the current one; a selection is added at the view centre. */
$('#fileIn').addEventListener('change', e => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let d;
    try { d = JSON.parse(rd.result); if (!d || !Array.isArray(d.blocks)) throw new Error(); } catch (err) { toast('That file isn’t a Tally board'); sfx('err'); return; }
    snapshot();
    const list = d.blocks.filter(b => b && b.id && Array.isArray(b.tokens));
    list.forEach(b => { if (!b.type) b.type = 'calc'; if (b.type === 'fn' && !Array.isArray(b.inputs)) b.inputs = []; });
    if (d.kind === 'selection') {
      const added = addImported(list, d.vlinks || []);
      toast(`Added ${added.length} notes`);
    } else {
      for (const [, el] of els) el.remove();
      els.clear(); selected.clear();
      S.blocks = list; S.vlinks = d.vlinks || []; S.bends = d.bends || {};
      S.nextId = Math.max(d.nextId || 1, list.reduce((m, b) => Math.max(m, (b.n || 0) + 1), 1));
      if (d.cam) { S.cam = { ...S.cam, ...d.cam }; applyCam(); }
      S.example = false;
      toast(`Loaded board · ${list.length} notes`);
    }
    recomputeAll(); renderAll(); renderScreen(); save(); sfx('merge');
  };
  rd.readAsText(f);
});
/** Characters the built-in PDF fonts can't draw, mapped to plain ones. */
function pdfText(s) {
  const map = { '−': '-', 'ᴇ': 'E', '√': 'sqrt', '∛': 'cbrt', 'π': 'pi', 'ƒ': 'f', 'Σ': 'sum', 'Π': 'prod', '⁻¹': '^-1', 'ʸ': 'y', '₂': '2', '≪': '<<', '≫': '>>', '↕': 'range', '↑': 'max', '↓': 'min', 'x̄': 'avg', ' ': ' ', '…': '...', '⇄': '<>', 'ˣ': 'x', '²': '2' };
  return String(s).replace(/⁻¹|x̄|[−ᴇ√∛πƒΣΠʸ₂≪≫↕↑↓ …⇄ˣ²]/g, c => map[c] || '').replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
}
function hexRgb(h) { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); }
const mixWhite = (rgb, k) => rgb.map(c => Math.round(c + (255 - c) * k));
/** Draw the given notes and their links as a vector PDF (jsPDF, loaded on demand). */
async function exportPDF(list) {
  toast('Preparing PDF…');
  try { await loadScript(DESK ? 'vendor/jspdf.umd.min.js' : 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'); }
  catch (e) { toast('Couldn’t load the PDF maker — check your connection'); return; }
  const { jsPDF } = window.jspdf;
  const rects = new Map(list.map(b => [b.id, blockRect(b)]));
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  rects.forEach(r => { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
  const k = 0.75, m = 36, head = 40;
  const W = Math.max(420, (x1 - x0) * k + m * 2), H = Math.max(300, (y1 - y0) * k + m * 2 + head);
  const doc = new jsPDF({ orientation: W > H ? 'landscape' : 'portrait', unit: 'pt', format: [W, H] });
  const P = (x, y) => [(x - x0) * k + m, (y - y0) * k + m + head];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(18, 19, 19);
  doc.text('TALLY', m, m);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120, 120, 115);
  doc.text(pdfText(`${list.length} notes · exported ${new Date().toLocaleString()}`), m + 52, m);
  const ids = new Set(list.map(b => b.id));
  for (const l of linkList()) {
    if (!ids.has(l.a) || !ids.has(l.b)) continue;
    const c = curve(rects.get(l.a), rects.get(l.b), S.bends[l.key]);
    const nums = c.d.match(/-?\d+(\.\d+)?/g).map(Number);
    const [ax, ay] = P(nums[0], nums[1]), [c1x, c1y] = P(nums[2], nums[3]), [c2x, c2y] = P(nums[4], nums[5]), [bx, by] = P(nums[6], nums[7]);
    const rgb = hexRgb(colorOf(byId(l.a)));
    doc.setDrawColor(...rgb); doc.setLineWidth(l.kind === 'vis' ? 0.9 : 1.2);
    doc.setLineDashPattern(l.kind === 'vis' ? [] : [2, 3], 0);
    doc.lines([[c1x - ax, c1y - ay, c2x - ax, c2y - ay, bx - ax, by - ay]], ax, ay, [1, 1], 'S');
    doc.setFillColor(...rgb); doc.circle(bx, by, 2.2, 'F');
  }
  doc.setLineDashPattern([], 0);
  for (const b of list) {
    const r = rects.get(b.id), [x, y] = P(r.x, r.y), w = r.w * k, h = r.h * k;
    const rgb = hexRgb(colorOf(b));
    doc.setFillColor(...mixWhite(rgb, 0.86)); doc.setDrawColor(...rgb); doc.setLineWidth(0.8);
    doc.roundedRect(x, y, w, h, 8, 8, 'FD');
    doc.setFillColor(...rgb); doc.circle(x + 10, y + 11, 2.6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(80, 82, 78);
    const title = b.type === 'fn' ? `${pdfText(FOPS[b.op].name).toUpperCase()}${b.name ? ' · ' + pdfText(b.name) : ''}` : pdfText(label(b, 60)).toUpperCase();
    doc.text(doc.splitTextToSize(title, w - 26)[0] || '', x + 17, y + 13.5);
    if (b.type === 'text') {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(30, 31, 29);
      doc.text(doc.splitTextToSize(pdfText(b.text || ''), w - 18).slice(0, Math.max(1, Math.floor((h - 26) / 11))), x + 9, y + 28);
      continue;
    }
    if (b.name || b.type === 'fn') {
      doc.setFont('courier', 'normal'); doc.setFontSize(6.5); doc.setTextColor(130, 130, 125);
      const eq = b.type === 'fn' ? b.inputs.map(id => byId(id)).filter(Boolean).map(i => pdfText(label(i, 14))).join(', ') : pdfText(tokText(b.tokens, { vals: true }));
      doc.text(doc.splitTextToSize(eq, w - 18)[0] || '', x + 9, y + 24);
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(Math.min(18, 16 * (b.bs || 1))); doc.setTextColor(18, 19, 19);
    doc.text(pdfText(b._err || (b._func ? 'f(x)' : b._empty ? '-' : fmt(b._val))), x + w - 9, y + h - 12, { align: 'right' });
  }
  const blob = doc.output('blob');
  offerFile(`tally-notes-${stamp()}.pdf`, blob);
}

/* ---------- top bar ---------- */
function updateBar() {
  $('#bLinks').classList.toggle('on', !!S.set.links);
  $('#bUndo').disabled = !UNDO.length; $('#bUndo').style.opacity = UNDO.length ? 1 : 0.4;
  $('#bRedo').disabled = !REDO.length; $('#bRedo').style.opacity = REDO.length ? 1 : 0.4;
  $('#exampleChip').hidden = !S.example;
  $('#bClear').style.display = S.blocks.length ? '' : 'none';
}
$('#bUndo').addEventListener('click', undo);
$('#bRedo').addEventListener('click', redo);
$('#bLinks').addEventListener('click', () => { S.set.links = !S.set.links; applySettings(false); syncCfg(); sfx('tick'); });
$('#bTidy').addEventListener('click', tidy);
$('#bText').addEventListener('click', () => { snapshot(); newText({}); });
$('#bNode').addEventListener('click', () => {
  snapshot();
  const ins = [...selected].filter(id => isNumeric(byId(id)) || (byId(id) && byId(id)._func));
  const nb = newFnNode('sum', ins, ins.length ? { near: blockRect(byId(ins[ins.length - 1])) } : {});
  flashBlock(nb);
  toast(ins.length ? `Function node with ${ins.length} input${ins.length > 1 ? 's' : ''}` : 'Function node added — drag links from notes into it');
});
$('#zIn').addEventListener('click', () => zoomSmooth(1.25, innerWidth / 2, innerHeight / 2));
$('#zOut').addEventListener('click', () => zoomSmooth(0.8, innerWidth / 2, innerHeight / 2));
$('#zoomPct').addEventListener('click', resetZoom);
$('#zFit').addEventListener('click', () => fitAll());
$('#bFile').addEventListener('click', e => {
  if (popKind === 'file' && !popEl.hidden) return closePop();
  const n = selected.size;
  popEl.innerHTML = `<h4>Board</h4>${mi('import', IC.file, 'Import board or notes…')}${mi('board', IC.file, 'Export whole board (.json)')}${mi('sel', IC.file, n ? `Export ${n} selected + inputs (.json)` : 'Export selection (.json)')}${mi('pdf', IC.file, n ? `${n} selected as PDF` : 'Selection as PDF')}`;
  openPop('file', null);
  const r = e.currentTarget.getBoundingClientRect();
  positionPop(r.left + r.width / 2, r.bottom + 6, r.top - 6);
  popEl.onclick = ev => { const m = ev.target.closest('[data-m]'); if (m) fileAction(m.dataset.m); };
});
function clearDesk(btn) {
  if (btn && btn.dataset.arm !== '1') { btn.dataset.arm = '1'; btn.classList.add('warn'); btn.querySelector('.lbl').textContent = 'Clear all?'; sfx('tick'); setTimeout(() => { btn.dataset.arm = ''; btn.classList.remove('warn'); btn.querySelector('.lbl').textContent = 'Clear desk'; }, 2600); return; }
  if (btn) { btn.dataset.arm = ''; btn.classList.remove('warn'); btn.querySelector('.lbl').textContent = 'Clear desk'; }
  if (!S.blocks.length) return;
  snapshot();
  const n = S.blocks.length;
  for (const [, el] of els) el.remove();
  els.clear(); selected.clear();
  IN.tok = bake(IN.tok); S.blocks = []; S.vlinks = []; S.bends = {}; IN.editing = null; IN.lastId = null;
  S.example = false;
  recomputeAll(); renderAll(); renderScreen(); save();
  sfx('del'); toast(`Cleared ${n} notes · Ctrl+Z brings them back`);
}
$('#bClear').addEventListener('click', e => clearDesk(e.currentTarget));
$('#bExClear').addEventListener('click', () => clearDesk());
$('#bEx').addEventListener('click', e => openExamples(e.currentTarget));
$('#bExMore').addEventListener('click', e => openExamples(e.currentTarget));
/** Arrange unpinned notes in columns beside the calculator (animated; links follow). */
function tidy() {
  const list = S.blocks.filter(b => !b.pin).sort((a, b) => a.n - b.n);
  if (!list.length) return;
  snapshot();
  const z = S.cam.z, v = viewWorld(), C = rectToWorld(rectOf(calcEl)), gap = 16;
  const colW = Math.max(...list.map(b => blockRect(b).w)) + gap;
  let startX = C.x + C.w + 28 / z;
  if (startX + colW > v.x + v.w) startX = v.x + 12 / z;
  const top = v.y + 64 / z, maxY = v.y + v.h - 12 / z;
  let x = startX, y = top;
  const moves = list.map(b => {
    const r = blockRect(b);
    if (y + r.h > maxY && y > top) { y = top; x += colW; }
    const m = { b, x, y };
    y += r.h + gap;
    return m;
  });
  tweenBlocks(moves, 420);
  sfx('merge');
}

/* ---------- keyboard ---------- */
function selectAll() { setSelected(S.blocks.map(b => b.id)); }
function escape() {
  if (!popEl.hidden) return closePop();
  if (UI.selLink) return selectLink(null);
  if (IN.editing) { cancelEdit(); renderAll(); return; }
  if (selected.size) return setSelected([]);
  if (!cfgEl.hidden && !IN.tok.length && !IN.done) return toggleCfg(false);
  clearAll(); renderScreen(); sfx('soft');
}
function copyCurrent() {
  const sel = [...selected].map(byId).filter(Boolean);
  if (sel.length) {
    UI.clip = JSON.parse(boardData(sel, 'selection'));
    UI.clipText = sel.map(rawVal).join('\n');
    return copyText(UI.clipText, `Copied ${sel.length} note${sel.length > 1 ? 's' : ''} — Ctrl+V pastes them`);
  }
  const v = currentValue();
  if (v !== null) copyText(String(v), `Copied ${fmt(v)}`);
}
/** Add notes from a file or the clipboard: fresh ids, links between them kept, placed at the view. */
function addImported(src, vlinks = []) {
  const list = clone(src);
  const map = new Map(list.map(b => [b.id, uid('b' + S.nextId + '_')]));
  const v = viewWorld(), x0 = Math.min(...list.map(b => b.x)), y0 = Math.min(...list.map(b => b.y));
  list.forEach(b => {
    b.id = map.get(b.id); b.n = S.nextId++; b.type = b.type || 'calc';
    b.x = b.x - x0 + v.x + v.w * 0.35; b.y = b.y - y0 + v.y + v.h * 0.25;
    b.tokens = b.tokens.map(t => (t.k === 'ref' && map.has(t.id) ? { ...t, id: map.get(t.id) } : t));
    if (b.type === 'fn') b.inputs = (b.inputs || []).map(id => map.get(id) || id);
  });
  S.blocks.push(...list);
  vlinks.forEach(l => { if (map.has(l.a) && map.has(l.b)) S.vlinks.push({ id: uid('v'), a: map.get(l.a), b: map.get(l.b) }); });
  recomputeAll(); renderAll();
  setSelected(list.map(b => b.id), false, true);
  return list;
}
/** Paste notes copied with Ctrl+C. */
function pasteNotes() {
  if (!UI.clip) return false;
  snapshot();
  const list = addImported(UI.clip.blocks, UI.clip.vlinks || []);
  save(); sfx('pop');
  toast(`Pasted ${list.length} note${list.length > 1 ? 's' : ''}`);
  return true;
}
document.addEventListener('keydown', e => {
  const t = e.target;
  if (t.closest && t.closest('input,textarea,select,[contenteditable="true"]')) return;
  const k = e.key, mod = e.ctrlKey || e.metaKey;
  if (mod) {
    const kk = k.toLowerCase();
    if (kk === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (kk === 'y') { e.preventDefault(); redo(); }
    else if (kk === 'a') { e.preventDefault(); selectAll(); }
    else if (kk === 'd') { e.preventDefault(); duplicate([...selected].map(byId).filter(Boolean)); }
    else if (kk === 'c') { if (String(getSelection())) return; e.preventDefault(); copyCurrent(); }
    else if (kk === '0') { e.preventDefault(); resetZoom(); }
    else if (kk === '1') { e.preventDefault(); fitAll(); }
    else if (kk === '=' || kk === '+') { e.preventDefault(); zoomSmooth(1.2, innerWidth / 2, innerHeight / 2); }
    else if (kk === '-') { e.preventDefault(); zoomSmooth(1 / 1.2, innerWidth / 2, innerHeight / 2); }
    return;
  }
  if (e.altKey || k === ' ') return;
  if (t.closest && t.closest('.cfg-body button,.pop button,#bar button,#tape button,.panel .ph button,.srow button') && (k === 'Enter')) return;
  // nudge / rename selected notes
  // arrows: move the calculator cursor, or nudge notes if notes were used last
  if ((k === 'ArrowLeft' || k === 'ArrowRight') && (!selected.size || UI.focusCalc)) { e.preventDefault(); UI.focusCalc = true; moveCursor(k === 'ArrowLeft' ? -1 : 1); return; }
  if ((k === 'Home' || k === 'End') && (!selected.size || UI.focusCalc)) { e.preventDefault(); k === 'Home' ? cursorHome() : cursorEnd(); return; }
  if (selected.size && k.startsWith('Arrow')) {
    e.preventDefault();
    const d = (e.shiftKey ? 10 : 1) / S.cam.z;
    const [dx, dy] = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, -d], ArrowDown: [0, d] }[k];
    [...selected].forEach(id => { const b = byId(id); if (b && !b.pin) { b.x += dx; b.y += dy; placeEl(b); } });
    renderLinks(); save(); return;
  }
  if (k === 'F2' && selected.size === 1) { e.preventDefault(); const b = byId([...selected][0]); if (b) (b.type === 'text' ? startTextEdit : rename)(b); return; }
  if ((k === 'Delete' || k === 'Backspace') && UI.selLink) { e.preventDefault(); deleteLink(UI.selLink); return; }
  let a = null;
  if (/^[0-9]$/.test(k)) a = k;
  else if (PRG() && /^[a-fA-F]$/.test(k)) a = k.toUpperCase();
  else switch (k) {
    case '.': a = 'dot'; break;
    case ',': a = S.set.dec === ',' ? 'dot' : 'comma'; break;
    case ';': a = 'comma'; break;
    case '+': case '-': case '*': case '/': case '^': case '(': case ')': a = k; break;
    case '%': a = 'pct'; break;
    case '!': a = 'fact'; break;
    case 'Enter':
      // empty calculator: Enter makes a new 0 note (= still repeats the last operation)
      if (!IN.editing && (IN.done || !IN.tok.length)) { e.preventDefault(); UI.focusCalc = true; quickNote(); return; }
      a = 'eq'; break;
    case '=': a = 'eq'; break;
    case 'Backspace': a = 'back'; break;
    case 'Delete':
      if (selected.size && !UI.focusCalc) { e.preventDefault(); deleteBlocks([...selected]); return; }
      if (!atEnd() && !IN.done) { e.preventDefault(); sfx('back'); deleteForward(); return; }
      a = 'ce'; break;
    case 'Escape': e.preventDefault(); escape(); return;
    case 'x': a = S.calc.mode === 'sci' ? 'x' : '*'; break;
    case 'p': a = 'pi'; break;
    case 'e': a = 'e'; break;
    case 's': a = 'sin'; break;
    case 'c': a = 'cos'; break;
    case 't': a = 'tan'; break;
    case 'l': a = 'ln'; break;
    case 'g': a = 'log'; break;
    case 'r': a = 'sqrt'; break;
    case 'q': a = 'sqr'; break;
    case 'm': a = 'mod'; break;
  }
  if (!a) return;
  e.preventDefault();
  press(a, true);
});
/**
 * Text -> tokens (paste, function-node formulas). `vars` maps single
 * capital letters to note ids (A, B, C… in formulas).
 */
function textToTokens(str, vars) {
  let s = String(str).replace(/[×✕·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, 'pi').replace(/√/g, 'sqrt').trim();
  const out = [], dec = S.set.dec;
  s = s.replace(/\s+/g, '');
  if (!vars) s = dec === '.' ? s.replace(/(\d),(?=\d{3}(\D|$))/g, '$1') : s.replace(/(\d)\.(?=\d{3}(\D|$))/g, '$1');
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const num = rest.match(dec === ',' && !vars ? /^(\d+(,\d*)?|,\d+)(e[-+]?\d+)?/i : /^(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?/i);
    if (num) { out.push({ k: 'num', v: num[0].replace(',', '.').toLowerCase(), b: 10 }); i += num[0].length; continue; }
    if (vars && /^[A-Z](?![a-z])/.test(rest) && rest[0] !== 'E') { out.push({ k: 'ref', id: vars[rest[0]] || '__missing' }); i++; continue; }
    const w = rest.match(/^[a-z]+/i);
    if (w) {
      const name = w[0].toLowerCase();
      const alias = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', lg: 'log', average: 'avg', mean: 'avg' }[name] || name;
      if (FN[alias] && s[i + w[0].length] === '(') { out.push({ k: 'fn', v: alias }); i += w[0].length + 1; continue; }
      if (name === 'pi') out.push({ k: 'const', v: 'pi' });
      else if (name === 'e') out.push({ k: 'const', v: 'e' });
      else if (name === 'x') out.push({ k: 'var' });
      else if (['mod', 'and', 'or', 'xor'].includes(name)) out.push({ k: 'op', v: name });
      i += w[0].length; continue;
    }
    const c = s[i];
    if ('+-*/^'.includes(c)) out.push({ k: 'op', v: c });
    else if (c === '%' || c === '!') out.push({ k: 'post', v: c });
    else if (c === '(') out.push({ k: 'lp' });
    else if (c === ')') out.push({ k: 'rp' });
    else if (c === ';' || (c === ',' && (dec === '.' || vars))) out.push({ k: 'comma' });
    i++;
  }
  return out;
}
document.addEventListener('paste', e => {
  if (e.target.closest && e.target.closest('input,textarea,[contenteditable="true"]')) return;
  const txt = (e.clipboardData || window.clipboardData).getData('text');
  if (UI.clip && (!txt || txt === UI.clipText)) { e.preventDefault(); pasteNotes(); return; }
  if (!txt) return;
  const toks = textToTokens(txt);
  if (!toks.length) return toast('Nothing to paste as an equation');
  e.preventDefault();
  if (IN.done) { IN.tok = []; IN.done = false; IN.cur = null; }
  editAt(() => IN.tok.push(...toks));
  sfx('drop'); renderScreen();
});
statsEl.addEventListener('click', e => {
  const s = e.target.closest('[data-stat]'); if (!s) return;
  const k = s.dataset.stat;
  if (k === 'none') return setSelected([]);
  if (k === 'del') return deleteBlocks([...selected]);
  if (k === 'pdf') return fileAction('pdf');
  if (k === 'plot') { [...selected].forEach(id => { const b = byId(id); if (b && b.type !== 'text') b.plot = true; }); openScope(); renderAll(); fitScope(); save(); sfx('drop'); return; }
  if (k === 'node') { $('#bNode').click(); return; }
  if (k === 'link') {
    const list = [...selected].map(byId).filter(Boolean).sort((a, b) => a.x - b.x || a.y - b.y);
    snapshot(); let n = 0;
    for (let i = 1; i < list.length; i++) if (!S.vlinks.some(v => (v.a === list[i - 1].id && v.b === list[i].id) || (v.b === list[i - 1].id && v.a === list[i].id))) { S.vlinks.push({ id: uid('v'), a: list[i - 1].id, b: list[i].id }); n++; }
    renderLinks(); save(); sfx('link'); toast(`${n} link${n === 1 ? '' : 's'} added`); return;
  }
  statBlock(k);
});
document.addEventListener('pointerdown', e => {
  if (!popEl.hidden && !popEl.contains(e.target) && !e.target.closest('[data-a="more"],[data-a="op"],#bFile,#bEx,#bExMore') && !e.target.closest('.block')) closePop();
}, true);
let rzT = 0;
addEventListener('resize', () => {
  clearTimeout(rzT);
  rzT = setTimeout(() => {
    clampCalc(); placeCalc();
    if (S.scope.open) placePanel(scopeEl, S.scope);
    if (!cfgEl.hidden) placePanel(cfgEl, panelState(cfgEl));
    renderLinks(); scopeDirty();
  }, 80);
});

/* ---------- desktop app: empty space lets clicks through ---------- */
if (DESK) {
  root.classList.add('desktop-mode');
  let inter = null;
  const INTER = '.device,.block,.panel,.pop,#bar .pill,#tape,#stats,#trash,#toast,#links .hit,#links .handle,#links .ldel';
  const setI = on => { if (on !== inter) { inter = on; try { DESK.setInteractive(on); } catch (e) { /* ignore */ } } };
  addEventListener('pointermove', e => { if (UI.dragging || UI.linkDrag || e.buttons) { setI(true); return; } setI(!!(e.target.closest && e.target.closest(INTER))); }, true);
  addEventListener('pointerleave', () => setI(false));
  setI(false);
  if (DESK.setOnTop) DESK.setOnTop(!!S.set.onTop);
}

/* ---------- applying synced state ---------- */
function applyCloudSettings(d) {
  if (d.set) Object.assign(S.set, d.set);
  if (d.scope) Object.assign(S.scope, d.scope);
  S.savedAt = Math.max(S.savedAt, d.savedAt || 0);
  applySettings();
  scopeChanged();
}
function applyCloudBoard(d) {
  for (const [, el] of els) el.remove();
  els.clear(); selected.clear();
  loadState({ ...JSON.parse(serial(S)), blocks: d.blocks || [], nextId: d.nextId, vlinks: d.vlinks || [], bends: d.bends || {}, tape: d.tape || S.tape, memory: d.memory, example: d.example, savedAt: Math.max(S.savedAt, d.savedAt || 0) });
  recomputeAll(); renderAll(); renderScreen();
}

/* ---------- boot ---------- */
function initialPlacement() {
  const vw = innerWidth, vh = innerHeight;
  calcEl.dataset.orient = S.calc.orient;
  calcEl.dataset.mode = S.calc.mode;
  calcEl.style.setProperty('--wf', S.calc.wf || 1);
  const w = calcEl.offsetWidth, h = calcEl.offsetHeight;
  if (S.calc.x === null || S.calc.y === null) {
    let s = Math.min(1, (vh - 84) / h, (vw - 24) / w);
    if (vw < 640) s = Math.min(1, (vw - 24) / w, (vh * 0.62) / h);
    S.calc.s = Math.max(0.6, parseFloat(s.toFixed(2)));
    const sw = w * S.calc.s, sh = h * S.calc.s;
    if (vw < 640) { S.calc.x = (vw - sw) / 2; S.calc.y = vh - sh - 12; }
    else { S.calc.x = Math.max(20, Math.min(vw * 0.08, 120)); S.calc.y = Math.max(60, (vh - sh) / 2 + 10); }
  }
  clampCalc(); placeCalc();
}
/** First visit: an example desk that shows links, a function node, a text note and both kinds of graph. */
function seed() {
  S.example = true;
  const C = rectToWorld(rectOf(calcEl));
  const wide = innerWidth >= 1000;
  const col = x => C.x + C.w + 36 + x * 230;
  const at = (x, y) => (wide ? { x: col(x), y: C.y + y } : {});
  const N = v => ({ k: 'num', v: String(v), b: 10 });
  const rent = newBlock([N(1450)], { name: 'Rent', c: 0, ...at(0, 0) });
  const groc = newBlock([N(85), { k: 'op', v: '*' }, N(4.3)], { name: 'Groceries', c: 1, ...at(0, 132) });
  const subs = newBlock([N(39)], { name: 'Subscriptions', c: 4, ...at(0, 264) });
  const total = newFnNode('sum', [rent.id, groc.id, subs.id], { name: 'Monthly', c: 2, ...at(1, 90) });
  newBlock([{ k: 'ref', id: total.id }, { k: 'op', v: '*' }, N(12)], { name: 'Per year', c: 2, ...at(2, 90) });
  const note = newText({ text: 'Drag a note’s ● dot to link it. Drop notes onto Σ to add them.\nMore ideas: Examples, top bar.', c: 5, quiet: true, ...at(1, -96) });
  S.vlinks.push({ id: uid('v'), a: note.id, b: total.id });
  newBlock([N(1), { k: 'op', v: '+' }, N(2), { k: 'op', v: '+' }, N(3)], { c: 3, plot: true, ...at(0, 400) });
  newBlock([N(2), { k: 'op', v: '*' }, { k: 'fn', v: 'sin' }, { k: 'var' }, { k: 'rp' }], { c: 5, ang: 'rad', ...at(1, 400) });
  S.example = true;
  S.tape = S.blocks.filter(b => b.type === 'calc').map((b, i) => ({ t: Date.now() - 60000 * (8 - i), text: tokText(b.tokens, { vals: true }), val: b._val, func: !!b._func, tokens: bake(b.tokens) }));
  UNDO.length = 0;
  if (innerWidth >= 1280) {
    S.scope.w = 460; S.scope.h = 340;
    S.scope.x = innerWidth - S.scope.w - 20; S.scope.y = innerHeight - S.scope.h - 20;
    openScope();
  }
}
function boot() {
  buildPads();
  applySettings(false);
  applyCam();
  syncKnob();
  $('#modeSwitch .thumb').style.transform = `translateX(${['std', 'sci', 'prg'].indexOf(S.calc.mode) * 100}%)`;
  $$('#modeSwitch button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.mode === S.calc.mode)));
  initialPlacement();
  recomputeAll();
  if (FRESH) seed();
  else if (S.scope.open) openScope();
  if (S.tapeOpen) toggleTape(true);
  const lastB = S.blocks.filter(b => b.type !== 'text').sort((a, b) => b.n - a.n)[0];
  if (lastB) IN.lastId = lastB.id;
  renderAll();
  renderScreen();
  updateBar();
  flushSave();
  booting = false;
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderAll(); renderScreen(); layoutChanged(); });
  cloudInit();
  window.__tally = { S, IN, UI, parse, ev, act, commit, recomputeAll, byId, fmt, textToTokens, newFnNode, newText, addVLink, valueWith, fitAll, linkList };
}
boot();
})();

