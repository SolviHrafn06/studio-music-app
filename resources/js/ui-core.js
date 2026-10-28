// Studio — core UI helpers, project model, app state, transport, recording, files.

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NL = () => !!(window.Neutralino && window.NL_PORT);
const clone = (o) => JSON.parse(JSON.stringify(o));

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function options(sel, list, value) {
  sel.innerHTML = '';
  for (const o of list) {
    if (o && o.group) {
      const g = h('optgroup', { label: o.group });
      o.items.forEach((it) => { const [v, l] = Array.isArray(it) ? it : [it, it]; g.append(h('option', { value: v }, l)); });
      sel.append(g);
      continue;
    }
    const [v, label] = Array.isArray(o) ? o : [o, o];
    sel.append(h('option', { value: v }, label));
  }
  sel.value = value;
  return sel;
}
function alpha(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function sizeCanvas(cv, w, hgt) {
  let dpr = window.devicePixelRatio || 1;
  dpr = Math.min(dpr, 32000 / Math.max(1, w), 32000 / Math.max(1, hgt));
  const W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(hgt * dpr));
  if (cv.width !== W) cv.width = W;
  if (cv.height !== H) cv.height = H;
  cv.style.width = w + 'px';
  cv.style.height = hgt + 'px';
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
const isTyping = (e) => e.target.matches && e.target.matches('input[type=text], input[type=number], input:not([type]), select, textarea');

// ---- rotary knob control ----
function knob({ label, norm, text, def = null, onInput, onDone, color, size = 42, title }) {
  const el = h('div', { class: 'knob', title: title || label });
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 40 40');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  const arc = (a0, a1, r) => {
    const p = (a) => [20 + r * Math.cos(a), 20 + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1} ${y1}`;
  };
  const A0 = Math.PI * 0.75, SPAN = Math.PI * 1.5;
  const bg = document.createElementNS(svgNS, 'path');
  bg.setAttribute('d', arc(A0, A0 + SPAN, 15));
  bg.setAttribute('class', 'k-bg');
  const fg = document.createElementNS(svgNS, 'path');
  fg.setAttribute('class', 'k-fg');
  if (color) fg.style.stroke = color;
  const dot = document.createElementNS(svgNS, 'circle');
  dot.setAttribute('r', 11);
  dot.setAttribute('cx', 20);
  dot.setAttribute('cy', 20);
  dot.setAttribute('class', 'k-cap');
  const tick = document.createElementNS(svgNS, 'line');
  tick.setAttribute('class', 'k-tick');
  svg.append(bg, fg, dot, tick);
  const val = h('div', { class: 'k-val' });
  el.append(svg, val, h('div', { class: 'k-lab' }, label));
  let n = norm;
  const draw = () => {
    const a = A0 + SPAN * clamp(n, 0, 1);
    fg.setAttribute('d', n > 0.002 ? arc(A0, a, 15) : '');
    tick.setAttribute('x1', 20 + 4 * Math.cos(a)); tick.setAttribute('y1', 20 + 4 * Math.sin(a));
    tick.setAttribute('x2', 20 + 10 * Math.cos(a)); tick.setAttribute('y2', 20 + 10 * Math.sin(a));
    val.textContent = text(n);
  };
  draw();
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const y0 = e.clientY, n0 = n;
    el.classList.add('drag');
    const move = (ev) => {
      n = clamp(n0 + (y0 - ev.clientY) / (ev.shiftKey ? 600 : 150), 0, 1);
      draw();
      onInput(n);
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      el.classList.remove('drag');
      onDone && onDone(n);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  el.addEventListener('dblclick', () => { if (def != null) { n = def; draw(); onInput(n); onDone && onDone(n); } });
  el.addEventListener('wheel', (e) => { e.preventDefault(); n = clamp(n - Math.sign(e.deltaY) * 0.02, 0, 1); draw(); onInput(n); clearTimeout(el._t); el._t = setTimeout(() => onDone && onDone(n), 300); }, { passive: false });
  el.set = (v) => { n = v; draw(); };
  return el;
}
// knob bound to a parameter spec (fx params, synth params)
function specKnob(sp, obj, key, after, color) {
  if (sp.options) {
    return h('label', { class: 'k-select' }, h('span', {}, sp.label),
      options(h('select', { onchange: (e) => { App.beginDrag(); obj[key] = e.target.value; after(true); App.endDrag(); } }), sp.options, obj[key]));
  }
  return knob({
    label: sp.label, norm: toNorm(sp, obj[key]), def: toNorm(sp, sp.def), color,
    text: (n) => fmtVal(sp, fromNorm(sp, n)),
    onInput: (n) => { if (App._dragSnap == null) App.beginDrag(); obj[key] = fromNorm(sp, n); after(false); },
    onDone: () => { App.endDrag(); after(true); },
  });
}

// ---------------- project model ----------------
const COLORS = ['#ff7a2f', '#ffc145', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#2dd4c4', '#fb923c', '#e879f9', '#a3e635'];
const TYPE_ICON = { drums: '▦', synth: '♪', audio: '🎤' };
const DEFAULT_HARM = () => ({ on: false, mix: 0.6, voices: [{ deg: 2, gain: 0.7, pan: -0.6 }, { deg: 4, gain: 0.6, pan: 0.6 }] });

function newPattern(name, len = 16) { return { name, len, steps: {} }; }
function makeTrack(type, P) {
  P.colorIdx = (P.colorIdx || 0) + 1;
  const t = {
    id: uid(), type, color: COLORS[(P.colorIdx - 1) % COLORS.length], volume: 0.8, pan: 0,
    mute: false, solo: false, eq: { low: 0, mid: 0, high: 0 }, rev: 0.08, dly: 0, clips: [], fx: [], auto: [], autoShow: false, autoSel: 'vol', armed: false,
  };
  if (type === 'drums') Object.assign(t, {
    name: 'Drums', kit: 'Classic', curPattern: 0, patterns: [newPattern('Pattern 1')],
    channels: DRUM_KIT.slice(0, 9).map((d) => ({ id: uid(), kind: d.id, name: d.name, vol: 0.8, mute: false, sample: null, pitch: 0 })),
  });
  if (type === 'synth') Object.assign(t, { name: 'Instrument', inst: presetInst('Grand Piano'), arp: { on: false, mode: 'up', rate: 1, oct: 1, gate: 0.8 } });
  if (type === 'audio') Object.assign(t, {
    name: 'Vocals', rev: 0.18,
    autotune: { on: true, follow: true, key: P.key, scale: P.scale, speed: 0.05, amount: 1, robot: 0, harmony: false, formant: 0, shift: 0, harm: DEFAULT_HARM(), preset: null },
  });
  return t;
}
function blankProject() {
  return { version: 2, name: 'My Song', bpm: 120, key: 0, scale: 'Major', loop: { on: false, start: 0, end: 16 }, tracks: [], colorIdx: 0, master: { fx: [], volume: 0.9, preset: 'None' } };
}
function normalizeProject(P) {
  P.version = 2;
  P.master = P.master || { fx: [], volume: 0.9, preset: 'None' };
  P.loop = P.loop || { on: false, start: 0, end: 16 };
  for (const t of P.tracks) {
    t.fx = t.fx || [];
    t.auto = t.auto || [];
    t.autoSel = t.autoSel || 'vol';
    t.eq = t.eq || { low: 0, mid: 0, high: 0 };
    if (t.type === 'synth') {
      if (!t.inst) t.inst = presetInst(t.instrument || 'Super Saw');
      delete t.instrument;
      t.arp = t.arp || { on: false, mode: 'up', rate: 1, oct: 1, gate: 0.8 };
    }
    if (t.type === 'drums') {
      t.kit = t.kit || 'Classic';
      t.channels.forEach((c) => (c.pitch = c.pitch || 0));
    }
    if (t.type === 'audio') {
      const a = t.autotune;
      a.robot = a.robot || 0; a.formant = a.formant || 0; a.shift = a.shift || 0;
      a.harm = a.harm || DEFAULT_HARM();
      for (const c of t.clips) {
        c.takes = c.takes || [c.buf];
        c.srcBpm = c.srcBpm || P.bpm;
        c.stretch = !!c.stretch;
      }
    }
  }
  return P;
}
function emptyProject() {
  const P = blankProject();
  const d = makeTrack('drums', P), s = makeTrack('synth', P), a = makeTrack('audio', P);
  a.armed = true;
  P.tracks.push(d, s, a);
  return P;
}
function demoProject() {
  const P = blankProject();
  P.name = 'Demo Song';
  P.bpm = 92; P.key = 9; P.scale = 'Minor';
  const d = makeTrack('drums', P);
  d.kit = '808';
  d.patterns[0] = drumLoopPattern(d, { name: 'Groove', s: { kick: 'x......x..x.....', snare: '....x.......x...', clap: '............x...', hat: 'x.x.xox.x.x.xo2.', ohat: '..............x.' } });
  d.clips.push({ id: uid(), start: 0, length: 32, pattern: 0, off: 0 });
  const prog = { deg: [0, 5, 2, 6] };
  const b = makeTrack('synth', P);
  b.name = '808 Bass'; b.inst = presetInst('808 Bass'); b.rev = 0;
  const bl = makeBassLoop(P, prog, '808 Slides');
  b.clips.push({ id: uid(), start: 0, length: 16, notes: bl.notes }, { id: uid(), start: 16, length: 16, notes: clone(bl.notes) });
  const c = makeTrack('synth', P);
  c.name = 'Piano'; c.inst = presetInst('Grand Piano'); c.volume = 0.75; c.rev = 0.25;
  const cl = makeChordLoop(P, prog, 'Pulse');
  c.clips.push({ id: uid(), start: 0, length: 16, notes: cl.notes }, { id: uid(), start: 16, length: 16, notes: clone(cl.notes) });
  const pad = makeTrack('synth', P);
  pad.name = 'Pad'; pad.inst = presetInst('Warm Pad'); pad.volume = 0.5; pad.rev = 0.35;
  pad.clips.push({ id: uid(), start: 16, length: 16, notes: makeChordLoop(P, prog, 'Sustained').notes });
  pad.fx.push(newFx('pump', { depth: 0.6 }));
  const m = makeTrack('synth', P);
  m.name = 'Pluck'; m.inst = presetInst('Bright Pluck'); m.volume = 0.55; m.rev = 0.2;
  m.fx.push(newFx('delay', { mix: 0.25, time: '1/8.' }));
  m.clips.push({ id: uid(), start: 16, length: 16, notes: makeMelody(P, MELODY_IDEAS[0]).notes });
  m.auto.push({ target: 'fx:' + m.fx[0].id + ':mix', pts: [{ b: 16, v: 0.05 }, { b: 31, v: 0.6 }] });
  const v = makeTrack('audio', P);
  v.name = 'Vocals'; v.armed = true;
  v.fx.push(newFx('comp', { thr: -20, ratio: 3 }), newFx('deess', {}));
  P.tracks = [d, b, c, pad, m, v];
  P.master.fx = clone(MASTER_PRESETS['Loud & Punchy']);
  P.master.preset = 'Loud & Punchy';
  return P;
}

// ---------------- app state ----------------
const App = {
  project: null,
  selTrackId: null,
  selClips: new Set(),
  editClipId: null,
  rackTrackId: null,
  atTrackId: null,
  fxTrackId: null,
  ppb: 36,
  rowH: 72,
  autoH: 56,
  snap: 1,
  playhead: 0,
  undoStack: [],
  redoStack: [],
  tab: 'browser',
  octave: 4,
  noteLen: 2,
  hearOnRecord: false,
  countClick: false,
  quantizeRec: true,
  takeCount: 0,
  midiRec: null,
  dirty: false,

  get selClipId() { return this.selClips.size ? [...this.selClips][this.selClips.size - 1] : null; },
  set selClipId(id) { this.selClips = new Set(id ? [id] : []); },
  track(id) { return this.project.tracks.find((t) => t.id === id); },
  findClip(id) {
    for (const t of this.project.tracks) {
      const c = t.clips.find((c) => c.id === id);
      if (c) return { tr: t, c };
    }
    return null;
  },

  load(P) {
    if (Engine.playing) this.stop();
    this.project = normalizeProject(P);
    this.undoStack = [];
    this.redoStack = [];
    this.playhead = 0;
    this.selTrackId = P.tracks[0]?.id || null;
    this.selClips = new Set();
    this.editClipId = this.rackTrackId = this.atTrackId = this.fxTrackId = null;
    this.fixSelection();
    this.syncTop();
    Engine.ensureInstruments(this.project).then(() => TL.draw());
    this.refresh(true);
    this.dirty = false;
  },

  fixSelection() {
    const P = this.project;
    if (!this.track(this.selTrackId)) this.selTrackId = P.tracks[0]?.id || null;
    for (const id of [...this.selClips]) if (!this.findClip(id)) this.selClips.delete(id);
    if (this.editClipId && !this.findClip(this.editClipId)) this.editClipId = null;
    const firstOf = (type) => P.tracks.find((t) => t.type === type)?.id || null;
    if (!this.track(this.rackTrackId)) this.rackTrackId = firstOf('drums');
    if (!this.track(this.atTrackId)) this.atTrackId = firstOf('audio');
    if (this.fxTrackId !== 'master' && !this.track(this.fxTrackId)) this.fxTrackId = this.selTrackId;
    if (!this.editClipId) {
      const s = P.tracks.find((t) => t.type === 'synth' && t.clips.length);
      if (s) this.editClipId = s.clips[0].id;
    }
  },

  syncEngine() {
    const P = this.project;
    for (const t of P.tracks) {
      if (t.type === 'audio' && t.autotune.follow) { t.autotune.key = P.key; t.autotune.scale = P.scale; }
    }
    Engine.sync(P);
    AT.hookReports();
  },

  refresh(structural) {
    this.fixSelection();
    this.syncEngine();
    if (structural) Headers.render();
    TL.draw();
    Panels.render();
    this.markDirty();
  },
  markDirty() { this.dirty = true; Autosave.schedule(); },

  snapshot() { return JSON.stringify(this.project); },
  pushUndo(s) {
    this.undoStack.push(s);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  },
  mutate(fn, structural = true) {
    this.pushUndo(this.snapshot());
    fn();
    this.refresh(structural);
  },
  beginDrag() { this._dragSnap = this.snapshot(); },
  endDrag() {
    if (this._dragSnap == null) return;
    if (this.snapshot() !== this._dragSnap) { this.pushUndo(this._dragSnap); this.markDirty(); }
    this._dragSnap = null;
  },
  undo() {
    if (!this.undoStack.length) return toast('Nothing to undo');
    this.redoStack.push(this.snapshot());
    this.project = JSON.parse(this.undoStack.pop());
    this.syncTop();
    this.refresh(true);
  },
  redo() {
    if (!this.redoStack.length) return toast('Nothing to redo');
    this.undoStack.push(this.snapshot());
    this.project = JSON.parse(this.redoStack.pop());
    this.syncTop();
    this.refresh(true);
  },

  selectTrack(id, autoTab = true) {
    const tr = this.track(id);
    if (!tr) return;
    const changed = this.selTrackId !== id;
    this.selTrackId = id;
    if (this.fxTrackId !== 'master' || changed) this.fxTrackId = id;
    if (tr.type === 'drums') this.rackTrackId = id;
    if (tr.type === 'audio') this.atTrackId = id;
    if (tr.type === 'synth') {
      const cur = this.findClip(this.editClipId);
      if (!cur || cur.tr.id !== id) this.editClipId = tr.clips[0]?.id || null;
    }
    if (autoTab && ['rack', 'piano', 'inst', 'vocal'].includes(this.tab)) {
      Panels.show(tr.type === 'drums' ? 'rack' : tr.type === 'synth' ? (this.tab === 'inst' ? 'inst' : 'piano') : 'vocal', false);
    }
    if (changed) {
      $$('.track-header').forEach((e) => e.classList.toggle('sel', e.dataset.id === id));
      TL.draw();
      AT.hookReports();
    }
    Panels.render();
  },

  syncTop() {
    const P = this.project;
    $('#bpm').value = P.bpm;
    $('#key').value = P.key;
    $('#scale').value = P.scale;
    $('#btn-loop').classList.toggle('on', P.loop.on);
    $('#song-name').value = P.name;
  },

  // ---- transport ----
  togglePlay() { if (Engine.playing) this.stop(); else this.play(); },
  play() {
    Engine.play(this.playhead);
    this.setPlayUI(true);
  },
  setPlayUI(on) {
    $('#btn-play').classList.toggle('on', on);
    $('#btn-play').textContent = on ? '❚❚' : '▶';
  },
  async stop() {
    const wasPlaying = Engine.playing || Engine.recording;
    const wasRec = Engine.recording;
    const midi = this.midiRec;
    this.midiRec = null;
    Engine.stop();
    this.setPlayUI(false);
    $('#btn-rec').classList.remove('on');
    $('#rec-region').style.display = 'none';
    if (!wasPlaying) this.playhead = 0;
    if (midi) this.finishMidiRec(midi);
    if (wasRec) {
      if (this._monitorForRec) { await Engine.setMonitor(AT.live ? this.atTrackId : null); this._monitorForRec = false; }
      const r = await Engine.finishRecord();
      if (r) {
        this.mutate(() => {
          const tr = this.track(r.trackId);
          const c = { id: uid(), start: r.start, length: r.length, buf: r.buf, takes: r.takes, offset: 0, name: 'Take ' + ++this.takeCount, srcBpm: r.srcBpm, stretch: true, fadeIn: 0, fadeOut: 0, gain: 1 };
          tr.clips.push(c);
          this.selClipId = c.id;
        });
        toast(r.takes.length > 1 ? `Recorded ${r.takes.length} takes — pick the best one in the Vocal tab.` : 'Recorded! Tweak Auto-Tune or edit pitch in the Vocal tab.', 4000);
      }
    }
  },
  seek(beat) {
    beat = Math.max(0, beat);
    this.playhead = beat;
    if (Engine.playing && !Engine.recording && !this.midiRec) Engine.play(beat);
    else if (!Engine.playing) this.syncEngine();
  },
  armedTrack() {
    const P = this.project;
    const sel = this.track(this.selTrackId);
    if (sel && sel.armed) return sel;
    return P.tracks.find((t) => t.armed && t.type !== 'drums') || (sel && sel.type !== 'drums' ? sel : null);
  },
  async toggleRecord() {
    if (Engine.recording || this.midiRec) return this.stop();
    if (Engine.playing) await this.stop();
    const P = this.project;
    let tr = this.armedTrack();
    if (!tr) {
      this.mutate(() => { tr = makeTrack('audio', P); tr.armed = true; P.tracks.push(tr); });
    }
    if (tr.type === 'synth') {
      this.midiRec = { trackId: tr.id, notes: [], held: new Map(), loop: P.loop.on ? { ...P.loop } : null };
      this.play();
      $('#btn-rec').classList.add('on');
      toast('Recording MIDI — play your MIDI keyboard or the A–K keys.', 3000);
      return;
    }
    try {
      if (this.hearOnRecord && Engine.monitorId !== tr.id) { await Engine.setMonitor(tr.id); this._monitorForRec = true; }
      await Engine.startRecord(tr.id, this.playhead);
    } catch (err) {
      console.error(err);
      toast('Could not open the microphone: ' + (err.message || err.name), 5000);
      return;
    }
    $('#btn-rec').classList.add('on');
    this.setPlayUI(true);
  },

  // ---- live notes (MIDI keyboard / computer keys) ----
  held: new Map(),
  liveTrack() {
    const sel = this.track(this.selTrackId);
    if (this.midiRec) return this.track(this.midiRec.trackId);
    return sel;
  },
  noteOn(midi, vel = 0.85, key = midi) {
    const tr = this.liveTrack();
    if (!tr || this.held.has(key)) return;
    const n = Engine.nodes.get(tr.id);
    if (!n) return;
    if (tr.type === 'synth') {
      if (tr.inst.kind === 'sampler' && !Sampler.ready(tr.inst.name)) Sampler.load(tr.inst.name, Engine.ctx);
      this.held.set(key, { v: playInstrument(Engine.ctx, n.input, tr.inst, midi, Engine.ctx.currentTime, null, vel), midi });
      if (this.midiRec && Engine.playing) {
        const b = Engine.beat();
        this.midiRec.held.set(midi, { s: b, v: vel });
      }
    } else if (tr.type === 'drums') {
      const ch = tr.channels[((midi - 36) % tr.channels.length + tr.channels.length) % tr.channels.length];
      if (ch) Rack.preview(tr, ch, vel);
    }
    Piano.flashKey && Piano.flashKey(midi, true);
  },
  noteOff(key) {
    const h0 = this.held.get(key);
    if (!h0) return;
    h0.v.release(Engine.ctx.currentTime);
    this.held.delete(key);
    const mr = this.midiRec;
    if (mr && mr.held.has(h0.midi)) {
      const st = mr.held.get(h0.midi);
      mr.held.delete(h0.midi);
      let e = Engine.beat();
      if (e < st.s) e = mr.loop ? mr.loop.end : st.s + 0.25;
      mr.notes.push({ p: h0.midi, b: st.s, len: Math.max(0.0625, e - st.s), v: st.v });
    }
    Piano.flashKey && Piano.flashKey(h0.midi, false);
  },
  finishMidiRec(mr) {
    const now = Engine.beat() ?? this.playhead;
    for (const [p, st] of mr.held) mr.notes.push({ p, b: st.s, len: Math.max(0.25, now - st.s), v: st.v });
    if (!mr.notes.length) return;
    const tr = this.track(mr.trackId);
    const q = (x) => (this.quantizeRec ? Math.round(x * 4) / 4 : x);
    let start, length, target = null;
    if (mr.loop) {
      start = mr.loop.start; length = mr.loop.end - mr.loop.start;
      target = tr.clips.find((c) => Math.abs(c.start - start) < 1e-6 && Math.abs(c.length - length) < 1e-6);
    } else {
      const lo = Math.min(...mr.notes.map((n) => n.b)), hi = Math.max(...mr.notes.map((n) => n.b + n.len));
      start = Math.floor(lo / 4) * 4;
      length = Math.max(4, Math.ceil((hi - start) / 4) * 4);
    }
    this.mutate(() => {
      const c = target || { id: uid(), start, length, notes: [] };
      for (const n of mr.notes) {
        const s = clamp(q(n.b - c.start) * 4, 0, c.length * 4 - 0.25);
        c.notes.push({ p: n.p, s: Math.round(s * 1000) / 1000, d: Math.max(this.quantizeRec ? 1 : 0.25, Math.round(q(n.len) * 4 * 1000) / 1000), v: Math.round(n.v * 100) / 100 });
      }
      if (!target) tr.clips.push(c);
      this.editClipId = c.id;
      this.selClipId = c.id;
    });
    toast(`Recorded ${mr.notes.length} notes.`);
  },
};

function addTrack(type, opts = {}) {
  const P = App.project;
  let tr;
  App.mutate(() => {
    tr = makeTrack(type, P);
    if (type === 'audio' && !P.tracks.some((t) => t.armed)) tr.armed = true;
    if (type === 'audio') tr.name = 'Vocals ' + (P.tracks.filter((t) => t.type === 'audio').length + 1);
    Object.assign(tr, opts);
    P.tracks.push(tr);
  });
  if (tr.type === 'synth') Engine.ensureInstruments(P);
  App.selectTrack(tr.id);
  return tr;
}

// ---------------- MIDI keyboards ----------------
const MIDI = {
  async init() {
    if (!navigator.requestMIDIAccess) return;
    try {
      const acc = await navigator.requestMIDIAccess();
      const hook = () => {
        let n = 0;
        acc.inputs.forEach((inp) => { inp.onmidimessage = (e) => this.msg(e.data); n++; });
        $('#midi-led').classList.toggle('on', n > 0);
        $('#midi-led').title = n ? `MIDI keyboard connected (${n})` : 'No MIDI keyboard connected';
      };
      acc.onstatechange = hook;
      hook();
    } catch (e) { console.warn('MIDI unavailable', e); }
  },
  msg(d) {
    const cmd = d[0] & 0xf0;
    if (cmd === 0x90 && d[2] > 0) { App.noteOn(d[1], d[2] / 127, 'm' + d[1]); $('#midi-led').classList.add('hit'); setTimeout(() => $('#midi-led').classList.remove('hit'), 80); }
    else if (cmd === 0x80 || (cmd === 0x90 && d[2] === 0)) App.noteOff('m' + d[1]);
  },
};

// ---------------- autosave (crash recovery) ----------------
const Autosave = {
  db: null, timer: null,
  open() {
    return new Promise((res) => {
      try {
        const r = indexedDB.open('studio-autosave', 1);
        r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('buffers'); };
        r.onsuccess = () => { this.db = r.result; res(this.db); };
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  },
  tx(store, mode, fn) {
    return new Promise((res) => {
      if (!this.db) return res(null);
      try {
        const t = this.db.transaction(store, mode), s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => res(r && r.result);
        t.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  },
  schedule() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), 4000);
  },
  async save() {
    if (!this.db || !App.project) return;
    const ids = usedBuffers(App.project);
    const have = new Set((await this.tx('buffers', 'readonly', (s) => s.getAllKeys())) || []);
    for (const id of ids) {
      if (have.has(id)) continue;
      const b = Buffers.get(id);
      if (!b) continue;
      const chans = [];
      for (let c = 0; c < b.numberOfChannels; c++) chans.push(b.getChannelData(c));
      await this.tx('buffers', 'readwrite', (s) => s.put({ sr: b.sampleRate, chans }, id));
    }
    await this.tx('kv', 'readwrite', (s) => s.put({ time: Date.now(), json: JSON.stringify(App.project), ids: [...ids] }, 'last'));
    $('#save-state').textContent = 'Autosaved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  },
  async last() { return this.tx('kv', 'readonly', (s) => s.get('last')); },
  async restore(rec) {
    Buffers.clear();
    for (const id of rec.ids) {
      const b = await this.tx('buffers', 'readonly', (s) => s.get(id));
      if (!b) continue;
      const buf = new AudioBuffer({ numberOfChannels: b.chans.length, length: b.chans[0].length, sampleRate: b.sr });
      b.chans.forEach((d, i) => buf.copyToChannel(d, i));
      Buffers.add(buf, id);
    }
    App.load(JSON.parse(rec.json));
  },
  async prune() {
    const rec = await this.last();
    const keep = new Set(rec ? rec.ids : []);
    const keys = (await this.tx('buffers', 'readonly', (s) => s.getAllKeys())) || [];
    for (const k of keys) if (!keep.has(k)) await this.tx('buffers', 'readwrite', (s) => s.delete(k));
  },
};
function usedBuffers(P) {
  const used = new Set();
  P.tracks.forEach((t) => {
    t.clips.forEach((c) => { if (c.buf) used.add(c.buf); (c.takes || []).forEach((b) => used.add(b)); if (c.edit && c.edit.src) used.add(c.edit.src); });
    (t.channels || []).forEach((ch) => ch.sample && used.add(ch.sample));
  });
  return used;
}

// ---------------- files ----------------
function pickFiles(sel) {
  return new Promise((resolve) => {
    const inp = $(sel);
    inp.value = '';
    inp.onchange = () => resolve(Array.from(inp.files || []));
    inp.click();
  });
}
async function saveBytes(name, bytes, filterName, ext, dir) {
  const ab = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (NL()) {
    try {
      let path;
      if (dir) path = dir + (dir.endsWith('\\') || dir.endsWith('/') ? '' : '/') + name;
      else {
        path = await Neutralino.os.showSaveDialog('Save ' + filterName, { defaultPath: name, filters: [{ name: filterName, extensions: [ext] }] });
        if (!path) return false;
        if (!path.toLowerCase().endsWith('.' + ext)) path += '.' + ext;
      }
      await Neutralino.filesystem.writeBinaryFile(path, ab);
      if (!dir) toast('Saved to ' + path, 4000);
      return path;
    } catch (e) {
      console.error(e);
      toast('Save failed: ' + (e.message || JSON.stringify(e)), 5000);
      return false;
    }
  }
  const url = URL.createObjectURL(new Blob([ab]));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  if (!dir) toast('Saved ' + name);
  return name;
}
const safeName = (s) => (s || 'My Song').replace(/[\\/:*?"<>|]+/g, '_');
async function projectBytes() {
  const P = App.project;
  const buffers = {};
  for (const id of usedBuffers(P)) { const b = Buffers.get(id); if (b) buffers[id] = abToBase64(encodeWAV(b)); }
  return new TextEncoder().encode(JSON.stringify({ app: 'Studio', version: 2, project: P, buffers }));
}
async function saveProject() {
  const P = App.project;
  const path = await saveBytes(safeName(P.name) + '.studio', await projectBytes(), 'Studio project', 'studio');
  if (path) { App.dirty = false; $('#save-state').textContent = 'Saved'; }
}
async function loadProjectText(text, name) {
  const data = JSON.parse(text);
  if (!data.project) throw new Error('not a Studio project');
  Buffers.clear();
  for (const [id, b64] of Object.entries(data.buffers || {})) {
    const buf = await Engine.ctx.decodeAudioData(base64ToAb(b64));
    Buffers.add(buf, id);
  }
  data.project.name = data.project.name || name;
  App.load(data.project);
}
async function openProject() {
  const files = await pickFiles('#file-project');
  if (!files.length) return;
  try {
    await loadProjectText(await files[0].text(), files[0].name.replace(/\.[^.]+$/, ''));
    toast('Opened ' + files[0].name);
  } catch (e) {
    console.error(e);
    toast('Could not open that file: ' + e.message, 5000);
  }
}
function encodeMP3(buf, kbps = 192, onProgress) {
  return new Promise(async (resolve) => {
    const enc = new lamejs.Mp3Encoder(2, buf.sampleRate, kbps);
    const L = buf.getChannelData(0), R = buf.getChannelData(1);
    const toI16 = (a, s, e) => { const o = new Int16Array(e - s); for (let i = s; i < e; i++) { const v = Math.max(-1, Math.min(1, a[i])); o[i - s] = v < 0 ? v * 0x8000 : v * 0x7fff; } return o; };
    const parts = [];
    const block = 1152 * 40;
    for (let i = 0; i < L.length; i += block) {
      const e = Math.min(L.length, i + block);
      const l = toI16(L, i, e), r = toI16(R, i, e);
      for (let j = 0; j < l.length; j += 1152) {
        const d = enc.encodeBuffer(l.subarray(j, j + 1152), r.subarray(j, j + 1152));
        if (d.length) parts.push(new Uint8Array(d));
      }
      onProgress && onProgress(e / L.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    const d = enc.flush();
    if (d.length) parts.push(new Uint8Array(d));
    const total = parts.reduce((a, p) => a + p.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    resolve(out);
  });
}
async function exportSong(fmt) {
  if (Engine.playing) await App.stop();
  const P = App.project;
  try {
    if (fmt === 'stems') {
      let dir = null;
      if (NL()) { dir = await Neutralino.os.showFolderDialog('Choose a folder for the stems'); if (!dir) return; }
      for (let i = 0; i < P.tracks.length; i++) {
        const tr = P.tracks[i];
        if (!tr.clips.length) continue;
        toast(`Rendering stem ${i + 1}/${P.tracks.length}: ${tr.name}…`, 20000);
        const buf = await Engine.render(P, { only: tr.id, noMaster: true });
        await saveBytes(`${safeName(P.name)} - ${String(i + 1).padStart(2, '0')} ${safeName(tr.name)}.wav`, encodeWAV(buf), 'WAV audio', 'wav', dir || 'downloads');
      }
      toast(dir ? 'Stems saved to ' + dir : 'Stems downloaded', 5000);
      return;
    }
    toast('Rendering your song…', 20000);
    const buf = await Engine.render(P);
    if (fmt === 'mp3') {
      const bytes = await encodeMP3(buf, 192, (p) => toast(`Encoding MP3… ${Math.round(p * 100)}%`, 20000));
      await saveBytes(safeName(P.name) + '.mp3', bytes, 'MP3 audio', 'mp3');
    } else await saveBytes(safeName(P.name) + '.wav', encodeWAV(buf), 'WAV audio', 'wav');
  } catch (e) {
    console.error(e);
    toast(e.message, 5000);
  }
}
async function importAudio(files) {
  files = files || (await pickFiles('#file-audio'));
  if (!files.length) return;
  const P = App.project;
  let tr = App.track(App.selTrackId);
  for (const f of files) {
    try {
      const buf = await Engine.ctx.decodeAudioData(await f.arrayBuffer());
      const id = Buffers.add(buf);
      App.mutate(() => {
        if (!tr || tr.type !== 'audio') {
          tr = makeTrack('audio', P);
          tr.name = f.name.replace(/\.[^.]+$/, '').slice(0, 20);
          tr.autotune.on = false;
          tr.rev = 0;
          P.tracks.push(tr);
        }
        const c = { id: uid(), start: Math.floor(App.playhead), length: buf.duration / (60 / P.bpm), buf: id, takes: [id], offset: 0, name: f.name, srcBpm: P.bpm, stretch: false, fadeIn: 0, fadeOut: 0, gain: 1 };
        tr.clips.push(c);
        App.selTrackId = tr.id;
        App.selClipId = c.id;
      });
    } catch (e) {
      toast('Could not decode ' + f.name);
    }
  }
}
