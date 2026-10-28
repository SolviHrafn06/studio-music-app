// Studio — main application (UI, project model, editors)

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NL = () => !!(window.Neutralino && window.NL_PORT);

function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k != null && k !== false) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}
function options(sel, list, value) {
  sel.innerHTML = '';
  for (const o of list) {
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
  cv.width = Math.max(1, Math.round(w * dpr));
  cv.height = Math.max(1, Math.round(hgt * dpr));
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
const isTyping = (e) => e.target.matches('input[type=text], input[type=number], input:not([type]), select, textarea');

// ---------------- project model ----------------
const COLORS = ['#ff7a2f', '#ffc145', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#2dd4c4', '#fb923c', '#e879f9', '#a3e635'];
const TYPE_ICON = { drums: '▦', synth: '♪', audio: '🎤' };

function newPattern(name, len = 16) { return { name, len, steps: {} }; }
function makeTrack(type, P) {
  P.colorIdx = (P.colorIdx || 0) + 1;
  const t = {
    id: uid(), type, color: COLORS[(P.colorIdx - 1) % COLORS.length], volume: 0.8, pan: 0,
    mute: false, solo: false, eq: { low: 0, mid: 0, high: 0 }, rev: 0.08, dly: 0, clips: [],
  };
  if (type === 'drums') Object.assign(t, {
    name: 'Drums', curPattern: 0, patterns: [newPattern('Pattern 1')],
    channels: DRUM_KIT.map((d) => ({ id: uid(), kind: d.id, name: d.name, vol: 0.8, mute: false, sample: null })),
  });
  if (type === 'synth') Object.assign(t, { name: 'Instrument', instrument: 'Super Saw' });
  if (type === 'audio') Object.assign(t, {
    name: 'Vocals', armed: false, rev: 0.18,
    autotune: { on: true, follow: true, key: P.key, scale: P.scale, speed: 0.05, amount: 1 },
  });
  return t;
}
function blankProject() {
  return { name: 'My Song', bpm: 120, key: 0, scale: 'Major', loop: { on: false, start: 0, end: 16 }, tracks: [], colorIdx: 0 };
}
function emptyProject() {
  const P = blankProject();
  P.tracks.push(makeTrack('drums', P), makeTrack('synth', P), makeTrack('audio', P));
  P.tracks[2].armed = true;
  return P;
}
function demoProject() {
  const P = blankProject();
  P.name = 'Demo Song';
  P.bpm = 92; P.key = 9; P.scale = 'Minor';
  P.loop = { on: false, start: 0, end: 16 };
  const d = makeTrack('drums', P);
  const pat = d.patterns[0];
  const chId = (k) => d.channels.find((c) => c.kind === k).id;
  const set = (k, arr, v = 1) => {
    const a = (pat.steps[chId(k)] ||= new Array(16).fill(0));
    arr.forEach((i) => (a[i] = v));
  };
  set('kick', [0, 7, 10]);
  set('snare', [4, 12]);
  set('clap', [12], 0.6);
  set('hat', [0, 2, 4, 6, 8, 10, 12]);
  set('hat', [3, 11, 15], 0.5);
  set('ohat', [14], 0.7);
  d.clips.push({ id: uid(), start: 0, length: 32, pattern: 0 });

  const roots = [33, 29, 36, 31];
  const chords = [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]];
  const b = makeTrack('synth', P);
  b.name = '808 Bass'; b.instrument = '808 Bass'; b.rev = 0;
  const bassNotes = [];
  roots.forEach((r, i) => bassNotes.push({ p: r, s: i * 16, d: 6, v: 0.9 }, { p: r, s: i * 16 + 7, d: 3, v: 0.8 }, { p: r, s: i * 16 + 10, d: 6, v: 0.8 }));
  b.clips.push({ id: uid(), start: 0, length: 16, notes: bassNotes }, { id: uid(), start: 16, length: 16, notes: JSON.parse(JSON.stringify(bassNotes)) });

  const c = makeTrack('synth', P);
  c.name = 'Chords'; c.instrument = 'Soft Pad'; c.volume = 0.7; c.rev = 0.3;
  const chordNotes = [];
  chords.forEach((ch, i) => ch.forEach((p) => chordNotes.push({ p, s: i * 16, d: 16, v: 0.7 })));
  c.clips.push({ id: uid(), start: 0, length: 16, notes: chordNotes }, { id: uid(), start: 16, length: 16, notes: JSON.parse(JSON.stringify(chordNotes)) });

  const m = makeTrack('synth', P);
  m.name = 'Pluck'; m.instrument = 'Pluck'; m.volume = 0.6; m.dly = 0.25; m.rev = 0.2;
  const arp = [];
  chords.forEach((ch, i) => {
    const tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[1] + 12];
    for (let k = 0; k < 8; k++) arp.push({ p: tones[k % 4], s: i * 16 + k * 2, d: 2, v: 0.7 });
  });
  m.clips.push({ id: uid(), start: 16, length: 16, notes: arp });

  const v = makeTrack('audio', P);
  v.name = 'Vocals'; v.armed = true;
  P.tracks = [d, b, c, m, v];
  return P;
}

// ---------------- app state ----------------
const App = {
  project: null,
  selTrackId: null,
  selClipId: null,
  editClipId: null,
  rackTrackId: null,
  atTrackId: null,
  ppb: 36,
  rowH: 72,
  snap: 1,
  playhead: 0,
  undoStack: [],
  redoStack: [],
  tab: 'rack',
  octave: 4,
  noteLen: 2,
  hearOnRecord: false,
  takeCount: 0,

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
    this.project = P;
    this.undoStack = [];
    this.redoStack = [];
    this.playhead = 0;
    this.selTrackId = P.tracks[0]?.id || null;
    this.selClipId = null;
    this.editClipId = null;
    this.rackTrackId = null;
    this.atTrackId = null;
    this.fixSelection();
    this.syncTop();
    this.refresh(true);
  },

  fixSelection() {
    const P = this.project;
    if (!this.track(this.selTrackId)) this.selTrackId = P.tracks[0]?.id || null;
    if (this.selClipId && !this.findClip(this.selClipId)) this.selClipId = null;
    if (this.editClipId && !this.findClip(this.editClipId)) this.editClipId = null;
    const firstOf = (type) => P.tracks.find((t) => t.type === type)?.id || null;
    if (!this.track(this.rackTrackId)) this.rackTrackId = firstOf('drums');
    if (!this.track(this.atTrackId)) this.atTrackId = firstOf('audio');
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
  },

  // undo helpers
  snapshot() { return JSON.stringify(this.project); },
  mutate(fn, structural = true) {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 150) this.undoStack.shift();
    this.redoStack = [];
    fn();
    this.refresh(structural);
  },
  beginDrag() { this._dragSnap = this.snapshot(); },
  endDrag() {
    if (this._dragSnap == null) return;
    if (this.snapshot() !== this._dragSnap) {
      this.undoStack.push(this._dragSnap);
      this.redoStack = [];
    }
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
    if (tr.type === 'drums') this.rackTrackId = id;
    if (tr.type === 'audio') this.atTrackId = id;
    if (tr.type === 'synth') {
      const cur = this.findClip(this.editClipId);
      if (!cur || cur.tr.id !== id) this.editClipId = tr.clips[0]?.id || null;
    }
    if (autoTab && this.tab !== 'mixer') {
      Panels.show(tr.type === 'drums' ? 'rack' : tr.type === 'synth' ? 'piano' : 'autotune', false);
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
  },

  // transport
  togglePlay() {
    if (Engine.playing) this.stop();
    else this.play();
  },
  play() {
    Engine.play(this.playhead);
    $('#btn-play').classList.add('on');
    $('#btn-play').textContent = '❚❚';
  },
  async stop() {
    const wasPlaying = Engine.playing || Engine.recording;
    const wasRec = Engine.recording;
    Engine.stop();
    $('#btn-play').classList.remove('on');
    $('#btn-play').textContent = '▶';
    $('#btn-rec').classList.remove('on');
    $('#rec-region').style.display = 'none';
    if (!wasPlaying) this.playhead = 0;
    if (wasRec) {
      if (this._monitorForRec) { await Engine.setMonitor(AT.live ? this.atTrackId : null); this._monitorForRec = false; }
      const r = await Engine.finishRecord();
      if (r) {
        this.mutate(() => {
          const tr = this.track(r.trackId);
          const c = { id: uid(), start: r.start, length: r.length, buf: r.buf, offset: 0, name: 'Take ' + ++this.takeCount };
          tr.clips.push(c);
          this.selClipId = c.id;
        });
        toast('Recorded! Auto-Tune is applied live on playback — tweak it in the Auto-Tune tab.');
      }
    }
  },
  seek(beat) {
    beat = Math.max(0, beat);
    this.playhead = beat;
    if (Engine.playing && !Engine.recording) Engine.play(beat);
  },
  async toggleRecord() {
    if (Engine.recording) return this.stop();
    if (Engine.playing) await this.stop();
    const P = this.project;
    let tr = P.tracks.find((t) => t.type === 'audio' && t.armed) || (this.track(this.selTrackId)?.type === 'audio' ? this.track(this.selTrackId) : null);
    if (!tr) {
      this.mutate(() => {
        tr = makeTrack('audio', P);
        tr.armed = true;
        P.tracks.push(tr);
      });
    }
    try {
      if (this.hearOnRecord && Engine.monitorId !== tr.id) { await Engine.setMonitor(tr.id); this._monitorForRec = true; }
      await Engine.startRecord(tr.id, this.playhead);
    } catch (err) {
      console.error(err);
      toast('Could not open the microphone: ' + (err.message || err.name), 5000);
      return;
    }
    this.recTrackId = tr.id;
    $('#btn-rec').classList.add('on');
    $('#btn-play').classList.add('on');
    $('#btn-play').textContent = '❚❚';
  },
};

// ---------------- track headers ----------------
const Headers = {
  render() {
    const el = $('#headers');
    el.innerHTML = '';
    const P = App.project;
    P.tracks.forEach((tr) => {
      const btn = (cls, label, title, on, fn) => h('button', { class: `mini ${cls}${on ? ' on' : ''}`, title, onclick: (e) => { e.stopPropagation(); fn(); } }, label);
      const row2 = [
        btn('m', 'M', 'Mute', tr.mute, () => App.mutate(() => (tr.mute = !tr.mute))),
        btn('s', 'S', 'Solo', tr.solo, () => App.mutate(() => (tr.solo = !tr.solo))),
      ];
      if (tr.type === 'audio') {
        row2.push(btn('arm', '●', 'Arm for recording', tr.armed, () => App.mutate(() => {
          const v = !tr.armed;
          P.tracks.forEach((t) => (t.armed = false));
          tr.armed = v;
        })));
        row2.push(btn('at', 'AT', 'Auto-Tune on/off', tr.autotune.on, () => App.mutate(() => (tr.autotune.on = !tr.autotune.on))));
      }
      if (tr.type === 'synth') {
        const sel = options(h('select', { title: 'Instrument', onmousedown: (e) => e.stopPropagation(), onchange: (e) => App.mutate(() => (tr.instrument = e.target.value), false) }), Object.keys(SYNTHS), tr.instrument);
        row2.push(sel);
      }
      const vol = h('input', {
        type: 'range', min: 0, max: 1.2, step: 0.01, value: tr.volume, title: 'Volume',
        onmousedown: (e) => e.stopPropagation(),
        oninput: (e) => { tr.volume = +e.target.value; App.syncEngine(); Mixer.updateValues(); },
      });
      row2.push(vol);
      const hd = h('div', { class: 'track-header' + (tr.id === App.selTrackId ? ' sel' : ''), onmousedown: () => App.selectTrack(tr.id) },
        h('div', { class: 'stripe', style: `background:${tr.color}` }),
        h('div', { class: 'body' },
          h('div', { class: 'row' },
            h('span', { class: 'type', title: tr.type }, TYPE_ICON[tr.type]),
            h('input', { class: 'name', type: 'text', value: tr.name, spellcheck: false, onchange: (e) => App.mutate(() => (tr.name = e.target.value || 'Track')) }),
            btn('del', '✕', 'Delete track', false, () => App.mutate(() => { P.tracks = P.tracks.filter((t) => t !== tr); })),
          ),
          h('div', { class: 'row' }, row2),
        ));
      hd.dataset.id = tr.id;
      el.append(hd);
    });
    const empty = h('div', { style: 'padding:14px;color:var(--muted);font-size:12px' }, P.tracks.length ? '' : 'No tracks yet — add one above.');
    el.append(empty);
  },
};

// ---------------- timeline ----------------
const TL = {
  init() {
    this.scroll = $('#arr-scroll');
    this.cv = $('#timeline');
    this.ruler = $('#ruler');
    this.cv.addEventListener('mousedown', (e) => this.down(e));
    this.cv.addEventListener('dblclick', (e) => this.dbl(e));
    this.cv.addEventListener('mousemove', (e) => this.hover(e));
    this.ruler.parentElement.addEventListener('mousedown', (e) => this.rulerDown(e));
    window.addEventListener('resize', () => this.draw());
    const rr = h('div', { id: 'rec-region', style: 'position:absolute;display:none;background:rgba(255,59,92,.25);border:1px solid #ff3b5c;border-radius:6px;pointer-events:none' });
    $('#lanes').append(rr);
  },
  totalBeats() {
    const end = Engine.songEnd(App.project);
    return Math.max(32 * 4, Math.ceil(end / 4) * 4 + 64, Math.ceil(App.playhead / 4) * 4 + 32);
  },
  draw() {
    const P = App.project, ppb = App.ppb, rh = App.rowH;
    const beats = this.totalBeats();
    const W = beats * ppb;
    const H = Math.max(P.tracks.length * rh, this.scroll.clientHeight - 28);
    const g = sizeCanvas(this.cv, W, H);
    g.fillStyle = '#15171c';
    g.fillRect(0, 0, W, H);
    for (let bar = 0; bar < beats / 4; bar++) {
      if (Math.floor(bar / 4) % 2 === 1) { g.fillStyle = '#181b21'; g.fillRect(bar * 4 * ppb, 0, 4 * ppb, H); }
    }
    P.tracks.forEach((tr, i) => {
      if (tr.id === App.selTrackId) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, i * rh, W, rh); }
    });
    const lines = (color, test, step) => {
      g.strokeStyle = color;
      g.beginPath();
      for (let b = 0; b <= beats; b += step) {
        if (!test(b)) continue;
        const x = Math.round(b * ppb) + 0.5;
        g.moveTo(x, 0); g.lineTo(x, H);
      }
      g.stroke();
    };
    if (ppb >= 60) lines('#1c1f26', (b) => Math.abs(b - Math.round(b)) > 0.01, 0.25);
    lines('#23272f', (b) => b % 4 !== 0, 1);
    lines('#373d4a', (b) => b % 4 === 0, 1);
    g.fillStyle = '#2a2f3a';
    P.tracks.forEach((_, i) => g.fillRect(0, (i + 1) * rh - 1, W, 1));
    const L = P.loop;
    if (L.end > L.start) {
      g.fillStyle = L.on ? 'rgba(47,212,196,0.08)' : 'rgba(255,255,255,0.025)';
      g.fillRect(L.start * ppb, 0, (L.end - L.start) * ppb, H);
    }
    P.tracks.forEach((tr, i) => tr.clips.forEach((c) => this.drawClip(g, tr, c, c.start * ppb, i * rh + 4, c.length * ppb, rh - 8, c.id === App.selClipId)));
    this.drawRuler(W, beats);
  },
  drawRuler(W, beats) {
    const P = App.project, ppb = App.ppb;
    const g = sizeCanvas(this.ruler, W, 26);
    g.fillStyle = '#1c1f26';
    g.fillRect(0, 0, W, 26);
    const L = P.loop;
    if (L.end > L.start) {
      g.fillStyle = L.on ? 'rgba(47,212,196,0.55)' : 'rgba(139,147,165,0.3)';
      g.fillRect(L.start * ppb, 0, (L.end - L.start) * ppb, 6);
    }
    g.font = '11px Segoe UI, sans-serif';
    const every = ppb < 14 ? 4 : ppb < 24 ? 2 : 1;
    for (let b = 0; b <= beats; b++) {
      const x = Math.round(b * ppb) + 0.5;
      if (b % 4 === 0) {
        g.fillStyle = '#4a5160';
        g.fillRect(x, 10, 1, 16);
        if ((b / 4) % every === 0) { g.fillStyle = '#c3c8d4'; g.fillText(String(b / 4 + 1), x + 4, 21); }
      } else if (ppb >= 16) {
        g.fillStyle = '#343a46';
        g.fillRect(x, 19, 1, 7);
      }
    }
  },
  drawClip(g, tr, c, x, y, w, hh, sel) {
    const P = App.project, ppb = App.ppb;
    g.save();
    g.beginPath();
    g.roundRect(x + 0.5, y + 0.5, Math.max(4, w - 1), hh, 5);
    g.fillStyle = alpha(tr.color, 0.22);
    g.fill();
    g.lineWidth = sel ? 2 : 1;
    g.strokeStyle = sel ? '#ffffff' : alpha(tr.color, 0.8);
    g.stroke();
    g.clip();
    g.fillStyle = alpha(tr.color, 0.85);
    g.fillRect(x, y, w, 15);
    let label = c.name || tr.name;
    if (tr.type === 'drums') label = tr.patterns[c.pattern]?.name || 'Pattern';
    g.fillStyle = '#121212';
    g.font = '600 11px Segoe UI, sans-serif';
    g.fillText(label, x + 6, y + 11.5);
    const y0 = y + 18, bh = hh - 21, sw = ppb / 4;
    g.fillStyle = tr.color;
    if (tr.type === 'drums') {
      const pat = tr.patterns[c.pattern];
      if (pat) {
        const rows = tr.channels.filter((ch) => pat.steps[ch.id]?.some((v) => v));
        if (rows.length) {
          const rr = Math.min(7, bh / rows.length);
          const off = (bh - rows.length * rr) / 2;
          for (let s = 0; s < c.length * 4; s++) {
            const ps = s % pat.len;
            rows.forEach((ch, ri) => {
              if (pat.steps[ch.id][ps]) g.fillRect(x + s * sw + 0.5, y0 + off + ri * rr, Math.max(1.5, sw - 1.5), Math.max(1, rr - 1.5));
            });
          }
        }
      }
    } else if (tr.type === 'synth') {
      const ns = c.notes.filter((n) => n.s < c.length * 4);
      if (ns.length) {
        let lo = Math.min(...ns.map((n) => n.p)), hi = Math.max(...ns.map((n) => n.p));
        if (hi - lo < 12) { const m = (hi + lo) / 2; lo = m - 6; hi = m + 6; }
        const ph = bh / (hi - lo + 1);
        for (const n of ns) g.fillRect(x + n.s * sw + 0.5, y0 + (hi - n.p) * ph, Math.max(2, n.d * sw - 1.5), Math.max(2, ph - 1));
      }
    } else if (tr.type === 'audio') {
      const peaks = Buffers.peaks.get(c.buf), buf = Buffers.get(c.buf);
      if (peaks && buf) {
        const spb = 60 / P.bpm, sr = buf.sampleRate, mid = y0 + bh / 2;
        g.fillStyle = alpha(tr.color, 0.95);
        for (let px = 0; px < w; px++) {
          const idx = Math.floor((((c.offset || 0) + (px / ppb) * spb) * sr) / 256);
          if (idx >= peaks.length) break;
          const a = Math.max(0.5, Math.min(1, peaks[idx] * 1.2) * (bh / 2));
          g.fillRect(x + px, mid - a, 1, a * 2);
        }
      } else {
        g.fillStyle = '#ff8a8a';
        g.fillText('audio missing', x + 6, y0 + 14);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x + w - 4, y + hh / 2 - 8, 2, 16);
    g.restore();
  },
  hit(e) {
    const P = App.project;
    const ti = Math.floor(e.offsetY / App.rowH);
    const tr = P.tracks[ti];
    const beat = e.offsetX / App.ppb;
    if (!tr) return { tr: null, beat, ti };
    let clip = null;
    for (let i = tr.clips.length - 1; i >= 0; i--) {
      const c = tr.clips[i];
      if (beat >= c.start && beat <= c.start + c.length) { clip = c; break; }
    }
    return { tr, clip, beat, ti };
  },
  hover(e) {
    if (this.dragging) return;
    const { clip } = this.hit(e);
    this.cv.style.cursor = clip ? ((e.offsetX - (clip.start + clip.length) * App.ppb) > -8 ? 'ew-resize' : 'grab') : 'copy';
  },
  down(e) {
    const P = App.project;
    const snap = App.snap;
    const { tr, clip, beat } = this.hit(e);
    if (!tr) { App.selClipId = null; this.draw(); return; }
    if (App.selTrackId !== tr.id) App.selectTrack(tr.id);
    if (e.button === 2) {
      if (clip) App.mutate(() => { tr.clips = tr.clips.filter((c) => c !== clip); });
      return;
    }
    if (e.button !== 0) return;
    let mode, target = clip, grab = 0, srcTrack = tr;
    App.beginDrag();
    if (clip) {
      if (e.ctrlKey || e.altKey) {
        target = JSON.parse(JSON.stringify(clip));
        target.id = uid();
        tr.clips.push(target);
      }
      const edge = e.offsetX - (clip.start + clip.length) * App.ppb > -8;
      mode = edge && !(e.ctrlKey || e.altKey) ? 'resize' : 'move';
      grab = beat - clip.start;
      App.selClipId = target.id;
      if (tr.type === 'synth') App.editClipId = target.id;
      if (tr.type === 'drums') tr.curPattern = target.pattern;
    } else if (tr.type === 'audio') {
      App.selClipId = null;
      App.seek(Math.floor(beat / snap) * snap);
      App._dragSnap = null;
      this.draw();
      return;
    } else {
      const start = Math.floor(beat / snap) * snap;
      target = { id: uid(), start, length: 4 };
      if (tr.type === 'drums') { target.pattern = tr.curPattern || 0; target.length = tr.patterns[target.pattern].len / 4; }
      else target.notes = [];
      tr.clips.push(target);
      App.selClipId = target.id;
      if (tr.type === 'synth') App.editClipId = target.id;
      mode = 'resize';
    }
    this.dragging = true;
    this.draw();
    Panels.render();
    const startX = e.clientX, startY = e.clientY, rect = this.cv.getBoundingClientRect();
    const move = (ev) => {
      const b = (ev.clientX - rect.left) / App.ppb;
      if (mode === 'move') {
        target.start = Math.max(0, Math.round((b - grab) / snap) * snap);
        const ti = Math.floor((ev.clientY - rect.top) / App.rowH);
        const nt = P.tracks[ti];
        if (nt && nt !== srcTrack && nt.type === srcTrack.type && (nt.type !== 'drums' || nt.patterns[target.pattern])) {
          srcTrack.clips = srcTrack.clips.filter((c) => c !== target);
          nt.clips.push(target);
          srcTrack = nt;
          App.selTrackId = nt.id;
          Headers.render();
        }
      } else {
        let len = Math.max(snap < 1 ? 0.25 : snap, Math.round((b - target.start) / snap) * snap);
        if (srcTrack.type === 'audio') {
          const buf = Buffers.get(target.buf);
          if (buf) len = Math.min(len, (buf.duration - (target.offset || 0)) / (60 / P.bpm));
          len = Math.max(0.25, len);
        }
        target.length = len;
      }
      this.draw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.dragging = false;
      App.endDrag();
      App.refresh(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  dbl(e) {
    const { tr, clip } = this.hit(e);
    if (!tr || !clip) return;
    if (tr.type === 'drums') { tr.curPattern = clip.pattern; App.rackTrackId = tr.id; Panels.show('rack'); }
    else if (tr.type === 'synth') { App.editClipId = clip.id; Panels.show('piano'); }
    else { App.atTrackId = tr.id; Panels.show('autotune'); }
  },
  rulerDown(e) {
    const rect = this.ruler.getBoundingClientRect();
    const snap = Math.max(1, App.snap);
    const b0 = (e.clientX - rect.left) / App.ppb;
    let dragged = false;
    const P = App.project;
    const move = (ev) => {
      const b1 = (ev.clientX - rect.left) / App.ppb;
      if (!dragged && Math.abs(ev.clientX - e.clientX) > 5) { dragged = true; App.beginDrag(); }
      if (dragged) {
        const a = Math.floor(Math.min(b0, b1) / snap) * snap;
        const z = Math.ceil(Math.max(b0, b1) / snap) * snap;
        P.loop.start = Math.max(0, a);
        P.loop.end = Math.max(a + snap, z);
        P.loop.on = true;
        $('#btn-loop').classList.add('on');
        this.draw();
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!dragged) App.seek(Math.floor(b0 / App.snap) * App.snap);
      else App.endDrag();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
};

// ---------------- bottom panels ----------------
const Panels = {
  show(tab, render = true) {
    App.tab = tab;
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    AT.hookReports();
    if (render) this.render();
  },
  render() {
    if (App.tab === 'rack') Rack.render();
    else if (App.tab === 'piano') Piano.render();
    else if (App.tab === 'mixer') Mixer.render();
    else if (App.tab === 'autotune') AT.render();
  },
};

function addTrack(type) {
  const P = App.project;
  let tr;
  App.mutate(() => {
    tr = makeTrack(type, P);
    if (type === 'audio' && !P.tracks.some((t) => t.armed)) tr.armed = true;
    if (type === 'audio') tr.name = 'Vocals ' + (P.tracks.filter((t) => t.type === 'audio').length + 1);
    P.tracks.push(tr);
  });
  App.selectTrack(tr.id);
  return tr;
}

// ---- Channel rack (step sequencer) ----
const Rack = {
  curCol: -1,
  painting: { on: false, val: 1 },
  render() {
    const panel = $('#panel-rack');
    panel.innerHTML = '';
    const P = App.project;
    const tr = App.track(App.rackTrackId);
    if (!tr) {
      panel.append(h('div', { class: 'empty' }, 'No drum track yet. ', h('button', { class: 'primary', onclick: () => addTrack('drums') }, '+ Add Drums')));
      return;
    }
    tr.curPattern = clamp(tr.curPattern || 0, 0, tr.patterns.length - 1);
    const pat = tr.patterns[tr.curPattern];
    const drumTracks = P.tracks.filter((t) => t.type === 'drums');
    const trSel = options(h('select', { onchange: (e) => { App.rackTrackId = e.target.value; App.selectTrack(e.target.value, false); } }), drumTracks.map((t) => [t.id, t.name]), tr.id);
    const patSel = options(h('select', {
      onchange: (e) => {
        if (e.target.value === 'new') {
          App.mutate(() => { tr.patterns.push(newPattern('Pattern ' + (tr.patterns.length + 1), pat.len)); tr.curPattern = tr.patterns.length - 1; }, false);
        } else { tr.curPattern = +e.target.value; this.render(); }
      },
    }), [...tr.patterns.map((p, i) => [i, p.name]), ['new', '+ New pattern']], tr.curPattern);
    const lenSel = options(h('select', {
      onchange: (e) => App.mutate(() => {
        const len = +e.target.value;
        pat.len = len;
        for (const k in pat.steps) {
          const a = pat.steps[k];
          pat.steps[k] = Array.from({ length: len }, (_, i) => a[i] ?? (len > a.length ? a[i % a.length] : 0));
        }
      }, false),
    }), [[16, '16 steps'], [32, '32 steps']], pat.len);
    const head = h('div', { class: 'panel-head' },
      h('h3', {}, 'Channel Rack'), trSel, patSel,
      h('button', { title: 'Copy this pattern', onclick: () => App.mutate(() => { const c = JSON.parse(JSON.stringify(pat)); c.name = pat.name + ' copy'; tr.patterns.push(c); tr.curPattern = tr.patterns.length - 1; }, false) }, 'Clone'),
      h('button', { title: 'Rename pattern', onclick: () => { const n = prompt('Pattern name', pat.name); if (n) App.mutate(() => (pat.name = n), false); } }, 'Rename'),
      lenSel,
      h('button', { class: 'primary', onclick: () => this.playPattern(tr) }, '▶ Loop this pattern'),
      h('button', { onclick: () => App.mutate(() => (pat.steps = {}), false) }, 'Clear'),
      h('span', { class: 'label', style: 'font-size:11px' }, 'Click/drag to paint steps · right-click = soft hit · click a name to hear it · new clips use this pattern'),
    );
    panel.append(head);
    const painting = this.painting;
    tr.channels.forEach((ch, ci) => {
      const steps = pat.steps[ch.id] || new Array(pat.len).fill(0);
      const stepsEl = h('div', { class: 'steps' });
      for (let i = 0; i < pat.len; i++) {
        if (i && i % 4 === 0) stepsEl.append(h('div', { class: 'gap' }));
        const v = steps[i];
        const s = h('div', { class: 'step' + ((Math.floor(i / 4) % 2) ? ' g1' : '') + (v ? (v < 1 ? ' soft on' : ' on') : '') });
        s.dataset.col = i;
        const apply = (val) => {
          const a = (pat.steps[ch.id] ||= new Array(pat.len).fill(0));
          a[i] = val;
          s.className = 'step' + ((Math.floor(i / 4) % 2) ? ' g1' : '') + (val ? (val < 1 ? ' soft on' : ' on') : '');
        };
        s.addEventListener('mousedown', (e) => {
          e.preventDefault();
          App.beginDrag();
          const cur = (pat.steps[ch.id] || [])[i];
          painting.on = true;
          painting.val = e.button === 2 ? (cur === 0.5 ? 0 : 0.5) : (cur ? 0 : 1);
          apply(painting.val);
          if (painting.val) this.preview(tr, ch, painting.val);
        });
        s.addEventListener('mouseenter', () => { if (painting.on) apply(painting.val); });
        stepsEl.append(s);
      }
      const row = h('div', { class: 'rack-row' },
        h('button', { class: 'mini m' + (ch.mute ? ' on' : ''), title: 'Mute channel', onclick: () => App.mutate(() => (ch.mute = !ch.mute), false) }, 'M'),
        h('button', { class: 'ch-name' + (ch.sample ? ' custom' : ''), title: ch.sample ? 'Custom sample: ' + ch.name : 'Click to preview', onmousedown: () => this.preview(tr, ch, 1) }, ch.name),
        h('input', { type: 'range', min: 0, max: 1.2, step: 0.01, value: ch.vol, title: 'Channel volume', oninput: (e) => (ch.vol = +e.target.value) }),
        h('button', { class: 'mini', title: 'Load your own sample (wav/mp3) into this channel', onclick: () => this.loadSample(tr, ch) }, '📂'),
        ch.sample ? h('button', { class: 'mini', title: 'Back to built-in sound', onclick: () => App.mutate(() => { ch.sample = null; ch.name = DRUM_KIT.find((d) => d.id === ch.kind)?.name || 'Sound'; }, false) }, '↺') : null,
        stepsEl,
        h('button', { class: 'mini del', title: 'Remove channel', onclick: () => App.mutate(() => { tr.channels.splice(ci, 1); }, false) }, '✕'),
      );
      panel.append(row);
    });
    const kindSel = options(h('select', {}), DRUM_KIT.map((d) => [d.id, d.name]), 'kick');
    panel.append(h('div', { class: 'rack-row', style: 'margin-top:8px' },
      h('span', { class: 'label' }, 'Add channel:'), kindSel,
      h('button', { onclick: () => App.mutate(() => { const k = DRUM_KIT.find((d) => d.id === kindSel.value); tr.channels.push({ id: uid(), kind: k.id, name: k.name, vol: 0.8, mute: false, sample: null }); }, false) }, '+ Built-in sound'),
      h('button', { onclick: () => { const ch = { id: uid(), kind: 'kick', name: 'Sample', vol: 0.8, mute: false, sample: null }; this.loadSample(tr, ch, true); } }, '+ From audio file…'),
    ));
    panel.oncontextmenu = (e) => e.preventDefault();
    this.curCol = -1;
  },
  preview(tr, ch, vel) {
    const n = Engine.nodes.get(tr.id);
    if (!n) return;
    playDrum(Engine.ctx, n.input, ch.kind, Engine.ctx.currentTime + 0.005, vel * ch.vol, ch.sample ? Buffers.get(ch.sample) : null);
  },
  async loadSample(tr, ch, isNew) {
    const files = await pickFiles('#file-sample');
    if (!files.length) return;
    try {
      const buf = await Engine.ctx.decodeAudioData(await files[0].arrayBuffer());
      const id = Buffers.add(buf);
      App.mutate(() => {
        ch.sample = id;
        ch.name = files[0].name.replace(/\.[^.]+$/, '').slice(0, 24);
        if (isNew) tr.channels.push(ch);
      }, false);
      this.preview(tr, ch, 1);
    } catch (e) { toast('Could not read that audio file.'); }
  },
  playPattern(tr) {
    const P = App.project;
    let c = tr.clips.find((c) => c.pattern === tr.curPattern);
    if (!c) {
      App.mutate(() => {
        const start = Math.ceil(Engine.songEnd(P) / 4) * 4;
        c = { id: uid(), start: tr.clips.length ? start : 0, length: tr.patterns[tr.curPattern].len / 4, pattern: tr.curPattern };
        tr.clips.push(c);
      });
    }
    P.loop = { on: true, start: c.start, end: c.start + tr.patterns[tr.curPattern].len / 4 };
    App.syncTop();
    TL.draw();
    App.playhead = c.start;
    App.play();
  },
  highlight(beat) {
    if (App.tab !== 'rack') return;
    const tr = App.track(App.rackTrackId);
    let col = -1;
    if (tr && beat != null) {
      const pat = tr.patterns[tr.curPattern];
      const c = tr.clips.find((c) => c.pattern === tr.curPattern && beat >= c.start && beat < c.start + c.length);
      if (c && pat) col = (Math.floor((beat - c.start) * 4)) % pat.len;
    }
    if (col === this.curCol) return;
    $$('#panel-rack .step.cur').forEach((s) => s.classList.remove('cur'));
    if (col >= 0) $$(`#panel-rack .step[data-col="${col}"]`).forEach((s) => s.classList.add('cur'));
    this.curCol = col;
  },
};

// ---- Piano roll ----
const Piano = {
  lo: 24, hi: 96, rh: 14, cw: 22, kw: 58,
  render() {
    const panel = $('#panel-piano');
    const oldWrap = $('#piano-wrap');
    const keep = oldWrap ? [oldWrap.scrollLeft, oldWrap.scrollTop, oldWrap.dataset.clip] : null;
    panel.innerHTML = '';
    const P = App.project;
    const found = App.findClip(App.editClipId);
    const selTr = App.track(App.selTrackId);
    if (!found || found.tr.type !== 'synth') {
      const synthTr = selTr?.type === 'synth' ? selTr : P.tracks.find((t) => t.type === 'synth');
      panel.append(h('div', { class: 'empty' },
        synthTr ? 'Click an empty spot in an Instrument lane on the timeline to create a clip, then draw notes here. ' : 'No instrument track yet. ',
        synthTr
          ? h('button', { class: 'primary', onclick: () => { App.mutate(() => { const c = { id: uid(), start: Math.floor(App.playhead / 4) * 4, length: 4, notes: [] }; synthTr.clips.push(c); App.editClipId = c.id; App.selClipId = c.id; }); } }, '+ New clip on ' + synthTr.name)
          : h('button', { class: 'primary', onclick: () => addTrack('synth') }, '+ Add Instrument'),
      ));
      return;
    }
    const { tr, c } = found;
    this.tr = tr; this.c = c;
    const steps = Math.round(c.length * 4);
    const instSel = options(h('select', { onchange: (e) => App.mutate(() => (tr.instrument = e.target.value)) }), Object.keys(SYNTHS), tr.instrument);
    const lenSel = options(h('select', { onchange: (e) => (App.noteLen = +e.target.value) }), [[1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, '1 bar']], App.noteLen);
    const barsIn = h('input', { type: 'number', min: 1, max: 64, value: c.length / 4, title: 'Clip length in bars', onchange: (e) => App.mutate(() => (c.length = clamp(+e.target.value || 1, 0.25, 64) * 4)) });
    panel.append(h('div', { class: 'panel-head' },
      h('h3', {}, 'Piano Roll'),
      h('span', { style: `color:${tr.color};font-weight:600` }, tr.name),
      h('label', { class: 'field' }, 'Sound', instSel),
      h('label', { class: 'field' }, 'Note length', lenSel),
      h('label', { class: 'field' }, 'Clip bars', barsIn),
      h('button', { class: 'primary', onclick: () => { P.loop = { on: true, start: c.start, end: c.start + c.length }; App.syncTop(); TL.draw(); App.playhead = c.start; App.play(); } }, '▶ Loop clip'),
      h('button', { onclick: () => App.mutate(() => (c.notes = [])) }, 'Clear'),
      h('span', { class: 'label', style: 'font-size:11px' }, 'Click to add · drag to move · drag right edge to resize · right-click to delete · bright rows are in the song key'),
    ));
    const wrap = h('div', { id: 'piano-wrap' });
    wrap.dataset.clip = c.id;
    const keys = h('canvas', { id: 'piano-keys' });
    const grid = h('canvas', { id: 'piano-grid' });
    const ph = h('div', { style: 'position:absolute;top:0;width:2px;background:var(--accent2);pointer-events:none;display:none;z-index:1', id: 'piano-ph' });
    wrap.append(keys, grid, ph);
    panel.append(wrap);
    this.keys = keys; this.grid = grid; this.steps = steps;
    this.drawKeys();
    this.draw();
    grid.addEventListener('mousedown', (e) => this.down(e));
    grid.addEventListener('mousemove', (e) => this.hover(e));
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    keys.addEventListener('mousedown', (e) => {
      const p = this.hi - Math.floor(e.offsetY / this.rh);
      this.preview(p);
    });
    if (keep && keep[2] === c.id) { wrap.scrollLeft = keep[0]; wrap.scrollTop = keep[1]; }
    else {
      const ps = c.notes.map((n) => n.p);
      const center = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 62;
      wrap.scrollTop = (this.hi - center) * this.rh - 120;
    }
  },
  drawKeys() {
    const H = (this.hi - this.lo + 1) * this.rh;
    const g = sizeCanvas(this.keys, this.kw, H);
    for (let p = this.hi; p >= this.lo; p--) {
      const y = (this.hi - p) * this.rh;
      const black = [1, 3, 6, 8, 10].includes(p % 12);
      g.fillStyle = black ? '#22252c' : '#d9dce3';
      g.fillRect(0, y, this.kw, this.rh);
      g.fillStyle = '#00000055';
      g.fillRect(0, y + this.rh - 1, this.kw, 1);
      if (p % 12 === 0) { g.fillStyle = '#333'; g.font = '10px Segoe UI'; g.fillText(noteName(p), this.kw - 26, y + this.rh - 3); }
    }
  },
  draw() {
    const P = App.project, c = this.c, tr = this.tr;
    if (!c) return;
    const W = this.steps * this.cw, H = (this.hi - this.lo + 1) * this.rh;
    const g = sizeCanvas(this.grid, W, H);
    const mask = scaleMask(P.key, P.scale);
    for (let p = this.hi; p >= this.lo; p--) {
      const y = (this.hi - p) * this.rh;
      const pc = ((p % 12) + 12) % 12;
      g.fillStyle = mask[pc] ? (pc === P.key ? '#2a2f3a' : '#22262e') : '#181a20';
      g.fillRect(0, y, W, this.rh);
      g.fillStyle = pc === 0 ? '#3a404d' : '#1d2027';
      g.fillRect(0, y + this.rh - 1, W, 1);
    }
    for (let s = 0; s <= this.steps; s++) {
      g.fillStyle = s % 16 === 0 ? '#4a5160' : s % 4 === 0 ? '#323843' : '#24282f';
      g.fillRect(s * this.cw, 0, 1, H);
    }
    for (const n of c.notes) {
      const x = n.s * this.cw, y = (this.hi - n.p) * this.rh;
      g.fillStyle = n === this.selNote ? '#ffffff' : tr.color;
      g.beginPath();
      g.roundRect(x + 1, y + 1, Math.max(4, n.d * this.cw - 2), this.rh - 2, 3);
      g.fill();
      g.fillStyle = '#00000066';
      g.fillRect(x + n.d * this.cw - 5, y + 3, 2, this.rh - 6);
      if (n.d * this.cw > 34) { g.fillStyle = '#111'; g.font = '9px Segoe UI'; g.fillText(noteName(n.p), x + 4, y + this.rh - 4); }
    }
  },
  at(e) {
    const p = this.hi - Math.floor(e.offsetY / this.rh);
    const s = Math.floor(e.offsetX / this.cw);
    const note = this.c.notes.find((n) => n.p === p && s >= n.s && s < n.s + n.d);
    return { p, s, note };
  },
  hover(e) {
    if (this.dragging) return;
    const { note } = this.at(e);
    this.grid.style.cursor = note ? (e.offsetX > (note.s + note.d) * this.cw - 7 ? 'ew-resize' : 'move') : 'crosshair';
  },
  down(e) {
    const c = this.c;
    let { p, s, note } = this.at(e);
    if (e.button === 2) {
      if (note) App.mutate(() => { c.notes = c.notes.filter((n) => n !== note); });
      return;
    }
    if (e.button !== 0) return;
    App.beginDrag();
    let mode = 'move', grab = 0;
    if (note) {
      if (e.offsetX > (note.s + note.d) * this.cw - 7) mode = 'resize';
      grab = s - note.s;
    } else {
      if (s >= this.steps) return;
      note = { p, s, d: Math.min(App.noteLen, this.steps - s), v: 0.8 };
      c.notes.push(note);
    }
    this.selNote = note;
    this.preview(note.p);
    this.dragging = true;
    this.draw();
    const rect = this.grid.getBoundingClientRect();
    let lastP = note.p;
    const move = (ev) => {
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      if (mode === 'move') {
        note.s = clamp(Math.floor(x / this.cw) - grab, 0, this.steps - 1);
        note.p = clamp(this.hi - Math.floor(y / this.rh), this.lo, this.hi);
        if (note.p !== lastP) { lastP = note.p; this.preview(note.p); }
      } else {
        note.d = clamp(Math.round(x / this.cw) - note.s, 1, this.steps * 2);
        App.noteLen = note.d;
      }
      this.draw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.dragging = false;
      this.selNote = null;
      App.endDrag();
      this.draw();
      TL.draw();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  preview(p) {
    const tr = this.tr;
    const n = tr && Engine.nodes.get(tr.id);
    if (!n) return;
    playNote(Engine.ctx, n.input, tr.instrument, p, Engine.ctx.currentTime + 0.005, 0.3, 0.8);
  },
  playhead(beat) {
    const ph = $('#piano-ph');
    if (!ph || App.tab !== 'piano' || !this.c) return;
    const c = this.c;
    if (beat == null || beat < c.start || beat >= c.start + c.length) { ph.style.display = 'none'; return; }
    ph.style.display = 'block';
    ph.style.left = this.kw + (beat - c.start) * 4 * this.cw + 'px';
    ph.style.height = (this.hi - this.lo + 1) * this.rh + 'px';
  },
};

// ---- Mixer ----
const Mixer = {
  meters: [],
  render() {
    const panel = $('#panel-mixer');
    panel.innerHTML = '';
    const P = App.project;
    const box = h('div', { class: 'mixer' });
    this.meters = [];
    const knob = (label, min, max, step, val, fn, title) => [
      h('span', { title }, label),
      h('input', { type: 'range', min, max, step, value: val, title, oninput: (e) => { fn(+e.target.value); App.syncEngine(); }, ondblclick: (e) => { const d = min < 0 ? 0 : (label === 'Pan' ? 0 : val); e.target.value = d; fn(d); App.syncEngine(); } }),
    ];
    P.tracks.forEach((tr) => {
      const meter = h('canvas', { width: 12, height: 120 });
      this.meters.push({ cv: meter, id: tr.id, peak: 0 });
      const fader = h('input', { class: 'fader', type: 'range', min: 0, max: 1.2, step: 0.01, value: tr.volume, title: 'Volume', oninput: (e) => { tr.volume = +e.target.value; App.syncEngine(); } });
      fader.dataset.vol = tr.id;
      const btns = [
        h('button', { class: 'mini m' + (tr.mute ? ' on' : ''), onclick: () => App.mutate(() => (tr.mute = !tr.mute)) }, 'M'),
        h('button', { class: 'mini s' + (tr.solo ? ' on' : ''), onclick: () => App.mutate(() => (tr.solo = !tr.solo)) }, 'S'),
      ];
      if (tr.type === 'audio') btns.push(h('button', { class: 'mini at' + (tr.autotune.on ? ' on' : ''), title: 'Auto-Tune', onclick: () => App.mutate(() => (tr.autotune.on = !tr.autotune.on)) }, 'AT'));
      box.append(h('div', { class: 'strip' + (tr.id === App.selTrackId ? ' sel' : ''), onmousedown: (ev) => { App.selTrackId = tr.id; $$('.strip').forEach((s) => s.classList.toggle('sel', s === ev.currentTarget)); } },
        h('div', { class: 'nm', style: `border-color:${tr.color}`, title: tr.name }, tr.name),
        h('div', { class: 'fx' },
          ...knob('Pan', -1, 1, 0.01, tr.pan, (v) => (tr.pan = v), 'Pan left/right'),
          ...knob('Low', -15, 15, 0.5, tr.eq.low, (v) => (tr.eq.low = v), 'EQ bass (dB)'),
          ...knob('Mid', -15, 15, 0.5, tr.eq.mid, (v) => (tr.eq.mid = v), 'EQ mids (dB)'),
          ...knob('High', -15, 15, 0.5, tr.eq.high, (v) => (tr.eq.high = v), 'EQ treble (dB)'),
          ...knob('Verb', 0, 1, 0.01, tr.rev, (v) => (tr.rev = v), 'Reverb amount'),
          ...knob('Echo', 0, 1, 0.01, tr.dly, (v) => (tr.dly = v), 'Echo / delay amount (synced to tempo)'),
        ),
        h('div', { class: 'fader-row' }, fader, meter),
        h('div', { class: 'btns' }, btns),
      ));
    });
    const mMeter = h('canvas', { width: 12, height: 120 });
    this.meters.push({ cv: mMeter, master: true, peak: 0 });
    box.append(h('div', { class: 'strip master' },
      h('div', { class: 'nm', style: 'border-color:#fff' }, 'MASTER'),
      h('div', { class: 'fx' }, h('span', {}, ''), h('span', { style: 'font-size:10px' }, 'Built-in limiter keeps your mix from clipping.')),
      h('div', { class: 'fader-row' },
        h('input', { class: 'fader', type: 'range', min: 0, max: 1.2, step: 0.01, value: Engine.bus.vol.gain.value, oninput: (e) => Engine.bus.vol.gain.setTargetAtTime(+e.target.value, Engine.ctx.currentTime, 0.02) }),
        mMeter),
    ));
    panel.append(box);
  },
  updateValues() {
    $$('#panel-mixer .fader[data-vol]').forEach((f) => { const t = App.track(f.dataset.vol); if (t) f.value = t.volume; });
  },
  buf: new Float32Array(1024),
  drawMeters() {
    if (App.tab !== 'mixer') return;
    for (const m of this.meters) {
      const an = m.master ? Engine.bus.analyser : Engine.nodes.get(m.id)?.meter;
      if (!an) continue;
      const b = this.buf.subarray(0, an.fftSize);
      an.getFloatTimeDomainData(b);
      let pk = 0;
      for (let i = 0; i < b.length; i++) pk = Math.max(pk, Math.abs(b[i]));
      m.peak = Math.max(pk, m.peak * 0.92);
      drawVMeter(m.cv, m.peak);
    }
  },
};
function levelFrac(pk) {
  const db = 20 * Math.log10(pk + 1e-9);
  return clamp((db + 54) / 54, 0, 1);
}
function drawVMeter(cv, pk) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.fillStyle = '#0b0d10';
  g.fillRect(0, 0, W, H);
  const f = levelFrac(pk), hgt = f * H;
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#2fd4c4'); grad.addColorStop(0.7, '#4ade80'); grad.addColorStop(0.88, '#facc15'); grad.addColorStop(1, '#ff3b5c');
  g.fillStyle = grad;
  g.fillRect(1, H - hgt, W - 2, hgt);
}

// ---- Auto-Tune panel ----
// Voice styles: Auto-Tune settings + robot vocoder + track effects in one click
const VOICE_PRESETS = [
  { name: 'Cher – Believe', desc: 'The original hard-tune warble: notes snap instantly', at: { speed: 0, amount: 1, robot: 0, harmony: false }, fx: { rev: 0.22, dly: 0.08, eq: { low: -2, mid: 0, high: 3 } } },
  { name: 'T-Pain', desc: 'Hard, glossy R&B tune', at: { speed: 0, amount: 1, robot: 0, harmony: false }, fx: { rev: 0.18, dly: 0.12, eq: { low: 0, mid: 1, high: 2 } } },
  { name: 'Kanye – 808s', desc: 'Cold, heavy tune drenched in reverb', at: { speed: 0, amount: 1, robot: 0.15, harmony: false }, fx: { rev: 0.5, dly: 0.22, eq: { low: -4, mid: -1, high: 3 } } },
  { name: 'Kanye – Stronger', desc: 'Half voice, half robot', at: { speed: 0, amount: 1, robot: 0.55, harmony: false }, fx: { rev: 0.2, dly: 0.15, eq: { low: -2, mid: 3, high: 3 } } },
  { name: 'Daft Punk Robot', desc: 'Full vocoder robot with harmony', at: { speed: 0, amount: 1, robot: 1, harmony: true }, fx: { rev: 0.22, dly: 0.25, eq: { low: 0, mid: 0, high: 4 } } },
  { name: 'Pop Vocal', desc: 'Tight but still human', at: { speed: 0.08, amount: 1, robot: 0, harmony: false }, fx: { rev: 0.18, dly: 0.05, eq: { low: -1, mid: 0, high: 2 } } },
  { name: 'Natural', desc: 'Gentle pitch fixing', at: { speed: 0.35, amount: 0.85, robot: 0, harmony: false }, fx: { rev: 0.15, dly: 0, eq: { low: 0, mid: 0, high: 0 } } },
  { name: 'Subtle', desc: 'Barely-there correction', at: { speed: 0.6, amount: 0.5, robot: 0, harmony: false }, fx: { rev: 0.12, dly: 0, eq: { low: 0, mid: 0, high: 0 } } },
];

const AT = {
  hist: [],
  live: false,
  noteEl: null,
  hookReports() {
    for (const [id, n] of Engine.nodes) {
      if (!n.at) continue;
      const want = id === App.atTrackId && App.tab === 'autotune';
      if (n._report !== want) {
        n._report = want;
        n.at.port.postMessage({ report: want });
        n.at.port.onmessage = want ? (e) => this.push(e.data) : null;
      }
    }
  },
  push(d) {
    this.hist.push({ f: d.f, t: d.t, time: performance.now() });
    if (this.hist.length > 600) this.hist.shift();
    if (this.noteEl) {
      if (d.f > 0) {
        const cents = Math.round((ftom(d.f) - ftom(d.t || d.f)) * 100);
        this.noteEl.textContent = noteName(ftom(d.t || d.f));
        this.subEl.textContent = `You sang ${noteName(ftom(d.f))} (${cents > 0 ? '+' : ''}${cents}¢) → corrected to ${noteName(ftom(d.t || d.f))}`;
      }
    }
  },
  render() {
    const panel = $('#panel-autotune');
    panel.innerHTML = '';
    const P = App.project;
    const tr = App.track(App.atTrackId);
    const audioTracks = P.tracks.filter((t) => t.type === 'audio');
    if (!tr) {
      panel.append(h('div', { class: 'empty' }, 'Auto-Tune works on vocal/audio tracks. ', h('button', { class: 'primary', onclick: () => addTrack('audio') }, '+ Add Vocal track')));
      return;
    }
    const a = tr.autotune;
    const upd = (fn, structural = false) => App.mutate(fn, structural);
    const trSel = options(h('select', { onchange: (e) => { App.atTrackId = e.target.value; App.selectTrack(e.target.value, false); } }), audioTracks.map((t) => [t.id, t.name]), tr.id);
    const keySel = options(h('select', { disabled: a.follow, onchange: (e) => upd(() => (a.key = +e.target.value)) }), NOTE_NAMES.map((n, i) => [i, n]), a.key);
    const scaleSel = options(h('select', { disabled: a.follow, onchange: (e) => upd(() => (a.scale = e.target.value)) }), Object.keys(SCALES), a.scale);
    const slider = (label, val, fn, left, right) => h('div', { class: 'slider' },
      h('span', {}, label), h('span', { class: 'lr' }, left),
      h('input', { type: 'range', min: 0, max: 100, step: 1, value: Math.round(val * 100), title: label, oninput: (e) => { fn(+e.target.value / 100); App.syncEngine(); }, onchange: () => App.refresh(true) }),
      h('span', { class: 'lr' }, right));
    const styles = h('div', { class: 'voice-styles' },
      h('div', { class: 'vs-title' }, 'Voice styles', h('span', {}, ' — one click sets Auto-Tune, robot and effects')),
      h('div', { class: 'vs-grid' }, VOICE_PRESETS.map((vp) => h('button', {
        class: 'vs-card' + (a.on && a.preset === vp.name ? ' active' : ''),
        onclick: () => upd(() => {
          Object.assign(a, vp.at, { on: true, preset: vp.name });
          tr.rev = vp.fx.rev; tr.dly = vp.fx.dly; tr.eq = { ...vp.fx.eq };
        }, true),
      }, h('b', {}, vp.name), h('small', {}, vp.desc)))));
    const custom = (fn) => (v) => { fn(v); a.preset = null; };
    this.noteEl = h('div', { class: 'at-note' }, '—');
    this.subEl = h('div', { class: 'at-sub' }, 'Sing or play back a vocal to see the pitch.');
    const liveBtn = h('button', { class: 'live-btn' + (this.live ? ' on' : ''), onclick: () => this.toggleLive() }, this.live ? '■ Stop live Auto-Tune' : '🎤 Sing live through Auto-Tune');
    const controls = h('div', { class: 'at-controls' },
      h('div', { class: 'panel-head', style: 'margin:0' }, h('h3', { style: 'color:var(--accent2)' }, 'Auto-Tune'), trSel),
      h('div', { class: 'at-big' },
        h('button', { class: 'at-power' + (a.on ? ' on' : ''), onclick: () => upd(() => (a.on = !a.on), true) }, a.on ? 'ON' : 'OFF'),
        h('div', {}, this.noteEl, this.subEl)),
      h('div', { class: 'panel-head', style: 'margin:0' },
        h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: a.follow, onchange: (e) => upd(() => { a.follow = e.target.checked; }) }), 'Use song key'),
        keySel, scaleSel),
      slider('Retune speed', a.speed, custom((v) => (a.speed = v)), 'Instant', 'Natural'),
      slider('Amount', a.amount, custom((v) => (a.amount = v)), 'Subtle', 'Full'),
      slider('Robot voice', a.robot || 0, custom((v) => (a.robot = v)), 'Human', 'Vocoder'),
      h('label', { class: 'field', title: 'Adds a 5th above and an octave below to the robot voice' }, h('input', { type: 'checkbox', checked: !!a.harmony, onchange: (e) => upd(() => { a.harmony = e.target.checked; a.preset = null; }) }), 'Robot harmony (chords)'),
      h('div', { class: 'presets' }, liveBtn,
        h('label', { class: 'field', title: 'Hear yourself through Auto-Tune while recording' }, h('input', { type: 'checkbox', checked: App.hearOnRecord, onchange: (e) => (App.hearOnRecord = e.target.checked) }), 'Hear myself while recording')),
    );
    const graph = h('canvas', { id: 'at-graph' });
    const gbox = h('div', { class: 'at-graph-box' }, graph,
      h('div', { class: 'at-tip' }, 'Tip: wear headphones when singing live. Arm the vocal track (●) and press Record to capture a take — Auto-Tune stays adjustable after recording.'));
    panel.append(h('div', { class: 'at-layout' }, controls, styles, gbox));
    this.graph = graph;
    this.gbox = gbox;
  },
  async toggleLive() {
    const tr = App.track(App.atTrackId);
    try {
      if (this.live) { await Engine.setMonitor(null); this.live = false; }
      else {
        if (!tr) return;
        await Engine.setMonitor(tr.id);
        this.live = true;
        toast('Live Auto-Tune on — use headphones to avoid feedback!', 4000);
      }
    } catch (e) {
      toast('Could not open the microphone: ' + (e.message || e.name), 5000);
    }
    this.render();
  },
  drawGraph() {
    if (App.tab !== 'autotune' || !this.graph) return;
    const cv = this.graph;
    const W = this.gbox.clientWidth, H = this.gbox.clientHeight;
    if (!W || !H) return;
    const g = sizeCanvas(cv, W, H);
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, W, H);
    const P = App.project, tr = App.track(App.atTrackId);
    const a = tr?.autotune;
    const mask = a ? scaleMask(a.key, a.scale) : new Array(12).fill(1);
    const now = performance.now(), span = 6000;
    const recent = this.hist.filter((p) => now - p.time < span && p.f > 0);
    let center = 62;
    if (recent.length) center = recent.slice(-30).reduce((s, p) => s + ftom(p.f), 0) / Math.min(30, recent.length);
    const lo = Math.round(center) - 12, hi = Math.round(center) + 12;
    const y = (m) => H - ((m - lo) / (hi - lo)) * H;
    g.font = '10px Segoe UI';
    for (let m = lo; m <= hi; m++) {
      const pc = ((m % 12) + 12) % 12;
      if (!mask[pc]) continue;
      g.fillStyle = pc === (a?.key ?? 0) ? '#2fd4c433' : '#ffffff10';
      g.fillRect(0, y(m) - 0.5, W, 1);
      g.fillStyle = '#8b93a5';
      g.fillText(noteName(m), 4, y(m) - 2);
    }
    const plot = (key, color, width) => {
      g.strokeStyle = color;
      g.lineWidth = width;
      g.beginPath();
      let pen = false, last = 0;
      for (const p of this.hist) {
        const age = now - p.time;
        if (age > span) continue;
        const v = key === 'f' ? p.f : p.t;
        if (!(v > 0) || p.time - last > 150) pen = false;
        last = p.time;
        if (!(v > 0)) continue;
        const xx = W - (age / span) * W, yy = y(ftom(v));
        if (pen) g.lineTo(xx, yy); else g.moveTo(xx, yy);
        pen = true;
      }
      g.stroke();
    };
    plot('f', '#8b93a5', 1.5);
    if (a?.on) plot('t', '#2fd4c4', 2.5);
    g.fillStyle = '#8b93a5';
    g.fillText('grey = your voice   teal = after Auto-Tune', W - 210, 14);
    if (!recent.length) {
      g.fillStyle = '#5b6372';
      g.font = '13px Segoe UI';
      g.fillText('Play back a vocal take, or press "Sing live" to see your pitch here.', 40, H / 2);
    }
  },
};

// ---------------- files ----------------
function pickFiles(sel) {
  return new Promise((resolve) => {
    const inp = $(sel);
    inp.value = '';
    inp.onchange = () => resolve(Array.from(inp.files || []));
    inp.click();
  });
}
async function saveBytes(name, bytes, filterName, ext) {
  const ab = bytes instanceof ArrayBuffer ? bytes : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  if (NL()) {
    try {
      let path = await Neutralino.os.showSaveDialog('Save ' + filterName, { defaultPath: name, filters: [{ name: filterName, extensions: [ext] }] });
      if (!path) return false;
      if (!path.toLowerCase().endsWith('.' + ext)) path += '.' + ext;
      await Neutralino.filesystem.writeBinaryFile(path, ab);
      toast('Saved to ' + path, 4000);
      return true;
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
  toast('Saved ' + name);
  return true;
}
const safeName = (s) => (s || 'My Song').replace(/[\\/:*?"<>|]+/g, '_');
async function saveProject() {
  const P = App.project;
  const used = new Set();
  P.tracks.forEach((t) => {
    t.clips.forEach((c) => c.buf && used.add(c.buf));
    (t.channels || []).forEach((ch) => ch.sample && used.add(ch.sample));
  });
  const buffers = {};
  for (const id of used) { const b = Buffers.get(id); if (b) buffers[id] = abToBase64(encodeWAV(b)); }
  const text = JSON.stringify({ app: 'Studio', version: 1, project: P, buffers });
  await saveBytes(safeName(P.name) + '.studio', new TextEncoder().encode(text), 'Studio project', 'studio');
}
async function openProject() {
  const files = await pickFiles('#file-project');
  if (!files.length) return;
  try {
    const data = JSON.parse(await files[0].text());
    if (!data.project) throw new Error('not a Studio project');
    Buffers.clear();
    for (const [id, b64] of Object.entries(data.buffers || {})) {
      const buf = await Engine.ctx.decodeAudioData(base64ToAb(b64));
      Buffers.add(buf, id);
    }
    data.project.name = data.project.name || files[0].name.replace(/\.[^.]+$/, '');
    App.load(data.project);
    toast('Opened ' + files[0].name);
  } catch (e) {
    console.error(e);
    toast('Could not open that file: ' + e.message, 5000);
  }
}
async function exportWav() {
  if (Engine.playing) await App.stop();
  toast('Rendering your song…', 10000);
  try {
    const buf = await Engine.render(App.project);
    await saveBytes(safeName(App.project.name) + '.wav', encodeWAV(buf), 'WAV audio', 'wav');
  } catch (e) {
    console.error(e);
    toast(e.message, 5000);
  }
}
async function importAudio() {
  const files = await pickFiles('#file-audio');
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
        const c = { id: uid(), start: Math.floor(App.playhead), length: buf.duration / (60 / P.bpm), buf: id, offset: 0, name: f.name };
        tr.clips.push(c);
        App.selTrackId = tr.id;
        App.selClipId = c.id;
      });
    } catch (e) {
      toast('Could not decode ' + f.name);
    }
  }
}

// ---------------- keyboard ----------------
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
const held = new Map();
function onKeyDown(e) {
  if (isTyping(e)) return;
  const k = e.key.toLowerCase();
  if (e.ctrlKey || e.metaKey) {
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); App.undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); App.redo(); }
    else if (k === 's') { e.preventDefault(); saveProject(); }
    else if (k === 'o') { e.preventDefault(); openProject(); }
    else if (k === 'd') {
      e.preventDefault();
      const f = App.findClip(App.selClipId);
      if (f) App.mutate(() => { const c = JSON.parse(JSON.stringify(f.c)); c.id = uid(); c.start = f.c.start + f.c.length; f.tr.clips.push(c); App.selClipId = c.id; });
    }
    return;
  }
  if (e.key === ' ') { e.preventDefault(); App.togglePlay(); return; }
  if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); App.seek(0); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const f = App.findClip(App.selClipId);
    if (f) App.mutate(() => { f.tr.clips = f.tr.clips.filter((c) => c !== f.c); });
    return;
  }
  if (e.repeat) return;
  const tr = App.track(App.selTrackId);
  if (k === 'z') { App.octave = Math.max(1, App.octave - 1); toast('Keyboard octave ' + App.octave); return; }
  if (k === 'x') { App.octave = Math.min(7, App.octave + 1); toast('Keyboard octave ' + App.octave); return; }
  if (tr && tr.type === 'synth' && k in KEYMAP) {
    const n = Engine.nodes.get(tr.id);
    if (!n || held.has(k)) return;
    const midi = (App.octave + 1) * 12 + KEYMAP[k];
    held.set(k, playNote(Engine.ctx, n.input, tr.instrument, midi, Engine.ctx.currentTime, null, 0.85));
    return;
  }
  if (tr && tr.type === 'drums' && /^[1-9]$/.test(k)) {
    const ch = tr.channels[+k - 1];
    if (ch) Rack.preview(tr, ch, 1);
    return;
  }
  if (k === 'r') { App.toggleRecord(); return; }
  if (k === 'l') { App.mutate(() => (App.project.loop.on = !App.project.loop.on), false); App.syncTop(); return; }
  if (k === 'm') { toggleMetro(); return; }
}
function onKeyUp(e) {
  if (e.key === ' ') e.preventDefault();
  const k = e.key.toLowerCase();
  const v = held.get(k);
  if (v) { v.release(Engine.ctx.currentTime); held.delete(k); }
}
function toggleMetro() {
  Engine.metronome = !Engine.metronome;
  $('#btn-metro').classList.toggle('on', Engine.metronome);
}

// ---------------- animation loop ----------------
const meterBuf = new Float32Array(1024);
let masterPeak = 0;
function frame() {
  if (App.project) {
    const playing = Engine.playing;
    const b = playing ? Engine.beat() : App.playhead;
    const x = b * App.ppb;
    $('#playhead').style.left = x + 'px';
    $('#ruler-head').style.left = x + 'px';
    const bar = Math.floor(b / 4) + 1, beat = Math.floor(b % 4) + 1, six = Math.floor((b * 4) % 4) + 1;
    $('#time-bars').textContent = `${bar}.${beat}.${six}`;
    const secs = (b * 60) / App.project.bpm;
    $('#time-secs').textContent = `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`;
    if (playing) {
      const sc = TL.scroll, vis = sc.clientWidth - 230;
      if (x > sc.scrollLeft + vis - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 60);
      if (x > TL.cv.width / (window.devicePixelRatio || 1) - 200) TL.draw();
    }
    const rr = $('#rec-region');
    if (Engine.recording && Engine.recInfo) {
      const ti = App.project.tracks.findIndex((t) => t.id === Engine.recInfo.trackId);
      const s = Engine.recInfo.startBeat;
      rr.style.display = 'block';
      rr.style.left = s * App.ppb + 'px';
      rr.style.width = Math.max(2, (b - s) * App.ppb) + 'px';
      rr.style.top = ti * App.rowH + 4 + 'px';
      rr.style.height = App.rowH - 8 + 'px';
    }
    Rack.highlight(playing ? b : null);
    Piano.playhead(playing ? b : null);
    Mixer.drawMeters();
    AT.drawGraph();
    // master meter
    if (Engine.bus) {
      const an = Engine.bus.analyser;
      an.getFloatTimeDomainData(meterBuf);
      let pk = 0;
      for (let i = 0; i < meterBuf.length; i++) pk = Math.max(pk, Math.abs(meterBuf[i]));
      masterPeak = Math.max(pk, masterPeak * 0.92);
      const cv = $('#master-meter'), g = cv.getContext('2d');
      g.fillStyle = '#0b0d10';
      g.fillRect(0, 0, cv.width, cv.height);
      const f = levelFrac(masterPeak);
      const grad = g.createLinearGradient(0, 0, cv.width, 0);
      grad.addColorStop(0, '#2fd4c4'); grad.addColorStop(0.7, '#4ade80'); grad.addColorStop(0.88, '#facc15'); grad.addColorStop(1, '#ff3b5c');
      g.fillStyle = grad;
      g.fillRect(2, 8, (cv.width - 4) * f, cv.height - 16);
    }
  }
  requestAnimationFrame(frame);
}

// ---------------- boot ----------------
function wireTopBar() {
  options($('#key'), NOTE_NAMES.map((n, i) => [i, n]), 0);
  options($('#scale'), Object.keys(SCALES), 'Major');
  $('#btn-play').onclick = () => App.togglePlay();
  $('#btn-stop').onclick = () => App.stop();
  $('#btn-home').onclick = () => App.seek(0);
  $('#btn-rec').onclick = () => App.toggleRecord();
  $('#btn-loop').onclick = () => { App.mutate(() => (App.project.loop.on = !App.project.loop.on), false); App.syncTop(); };
  $('#btn-metro').onclick = toggleMetro;
  $('#btn-undo').onclick = () => App.undo();
  $('#btn-redo').onclick = () => App.redo();
  $('#btn-save').onclick = saveProject;
  $('#btn-open').onclick = openProject;
  $('#btn-export').onclick = exportWav;
  $('#btn-import').onclick = importAudio;
  $('#btn-new').onclick = () => { if (confirm('Start a new empty project? Unsaved changes will be lost.')) { Buffers.clear(); App.load(emptyProject()); } };
  $('#bpm').onchange = (e) => {
    const P = App.project;
    const nb = clamp(Math.round(+e.target.value || 120), 40, 240);
    e.target.value = nb;
    const was = Engine.playing && !Engine.recording ? Engine.beat() : null;
    App.mutate(() => {
      const ratio = nb / P.bpm;
      P.tracks.forEach((t) => t.type === 'audio' && t.clips.forEach((c) => (c.length *= ratio)));
      P.bpm = nb;
    }, false);
    if (was != null) Engine.play(was);
  };
  $('#key').onchange = (e) => App.mutate(() => (App.project.key = +e.target.value), false);
  $('#scale').onchange = (e) => App.mutate(() => (App.project.scale = e.target.value), false);
  $('#snap').onchange = (e) => (App.snap = +e.target.value);
  $('#zoom-in').onclick = () => { App.ppb = Math.min(160, App.ppb * 1.25); TL.draw(); };
  $('#zoom-out').onclick = () => { App.ppb = Math.max(8, App.ppb / 1.25); TL.draw(); };
  $$('#arr-toolbar [data-add]').forEach((b) => (b.onclick = () => addTrack(b.dataset.add)));
  $$('#tabs button').forEach((b) => (b.onclick = () => Panels.show(b.dataset.tab)));
  window.addEventListener('mouseup', () => { if (Rack.painting.on) { Rack.painting.on = false; App.endDrag(); TL.draw(); } });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('contextmenu', (e) => { if (!isTyping(e)) e.preventDefault(); });
  document.addEventListener('mouseup', () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  TL.scroll.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
      e.preventDefault();
      App.ppb = clamp(App.ppb * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 8, 160);
      TL.draw();
    }
  }, { passive: false });
}

async function boot() {
  if (NL()) {
    try { Neutralino.init(); Neutralino.events.on('windowClose', () => Neutralino.app.exit()); } catch (e) { console.warn(e); }
  }
  TL.init();
  wireTopBar();
  $('#start-btn').onclick = async () => {
    $('#start-btn').textContent = 'Loading…';
    try {
      await Engine.init();
      await Engine.ctx.resume();
    } catch (e) {
      console.error(e);
      $('#start-btn').textContent = 'Audio failed to start: ' + e.message;
      return;
    }
    App.load(demoProject());
    $('#splash').classList.add('hidden');
    toast('Loaded a demo song — press Space to play it!', 4000);
  };
  requestAnimationFrame(frame);
}
boot();
