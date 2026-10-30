// chord stamps for the piano roll
const CHORD_TYPES = {
  'Single note': null, 'Triad (in key)': 'key3', '7th (in key)': 'key7', 'Major': [0, 4, 7], 'Minor': [0, 3, 7], 'Power (5th)': [0, 7, 12],
  'Sus2': [0, 2, 7], 'Sus4': [0, 5, 7], 'Maj7': [0, 4, 7, 11], 'Min7': [0, 3, 7, 10], 'Dom7': [0, 4, 7, 10], 'Dim': [0, 3, 6], 'Add9': [0, 4, 7, 14], 'Min9': [0, 3, 7, 10, 14], 'Octave': [0, 12],
};
function chordNotes(p, type, P) {
  const t = CHORD_TYPES[type];
  if (!t) return [p];
  if (Array.isArray(t)) return t.map((i) => p + i);
  const mask = scaleMask(P.key, P.scale);
  const up = (from, steps) => { let k = from, c = 0; while (c < steps) { k++; if (mask[((k % 12) + 12) % 12]) c++; } return k; };
  const n = t === 'key7' ? 4 : 3, out = [p];
  for (let i = 1; i < n; i++) out.push(up(out[i - 1], 2));
  return out;
}

// Editors: Channel Rack (step sequencer), Piano Roll, Instrument (synth editor + arpeggiator).

const Panels = {
  show(tab, render = true) {
    App.tab = tab;
    $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    AT.hookReports();
    if (render) this.render();
  },
  render() {
    const t = App.tab;
    if (t === 'rack') Rack.render();
    else if (t === 'piano') Piano.render();
    else if (t === 'inst') Inst.render();
    else if (t === 'mixer') Mixer.render();
    else if (t === 'fx') FxPanel.render();
    else if (t === 'vocal') Vocal.render();
    else if (t === 'browser') Browser.render();
    else if (t === 'input') InputPanel.render();
  },
};

// ---------------- Channel Rack ----------------
const STEP_CYCLE = [0.5, 2, 3, 4, 0];
const Rack = {
  curCol: -1,
  painting: { on: false, val: 1 },
  stepClass(v, i) {
    let c = 'step' + (Math.floor(i / 4) % 2 ? ' g1' : '');
    if (v) c += ' on' + (v === 0.5 ? ' soft' : v >= 2 ? ' roll r' + v : '');
    return c;
  },
  render() {
    const panel = $('#panel-rack');
    panel.innerHTML = '';
    const P = App.project;
    const tr = App.track(App.rackTrackId);
    if (!tr) {
      panel.append(h('div', { class: 'empty' }, 'No drum track yet. ', h('button', { class: 'primary', onclick: () => addTrack('drums') }, '+ Add Drums'), ' or grab a beat from the Browser tab.'));
      return;
    }
    tr.curPattern = clamp(tr.curPattern || 0, 0, tr.patterns.length - 1);
    const pat = tr.patterns[tr.curPattern];
    const drumTracks = P.tracks.filter((t) => t.type === 'drums');
    const trSel = options(h('select', { onchange: (e) => { App.rackTrackId = e.target.value; App.selectTrack(e.target.value, false); } }), drumTracks.map((t) => [t.id, t.name]), tr.id);
    const patSel = options(h('select', {
      onchange: (e) => {
        if (e.target.value === 'new') App.mutate(() => { tr.patterns.push(newPattern('Pattern ' + (tr.patterns.length + 1), pat.len)); tr.curPattern = tr.patterns.length - 1; }, false);
        else { tr.curPattern = +e.target.value; this.render(); }
      },
    }), [...tr.patterns.map((p, i) => [i, p.name]), ['new', '+ New pattern']], tr.curPattern);
    const lenSel = options(h('select', {
      onchange: (e) => App.mutate(() => {
        const len = +e.target.value;
        for (const k in pat.steps) { const a = pat.steps[k]; pat.steps[k] = Array.from({ length: len }, (_, i) => a[i] ?? (len > a.length ? a[i % a.length] : 0)); }
        pat.len = len;
      }, false),
    }), [[12, '12 steps'], [16, '16 steps'], [24, '24 steps'], [32, '32 steps'], [48, '48 steps'], [64, '64 steps']], pat.len);
    const kitSel = options(h('select', { onchange: (e) => App.mutate(() => (tr.kit = e.target.value), true) }), Object.keys(DRUM_KITS).map((k) => [k, k + ' kit']), tr.kit);
    const swing = knob({ label: 'Swing', norm: (tr.swing || 0) / 0.6, def: 0, size: 34, text: (n) => Math.round(n * 100) + '%', onInput: (n) => (tr.swing = n * 0.6), onDone: () => App.markDirty() });
    panel.append(h('div', { class: 'panel-head' },
      h('h3', {}, 'Channel Rack'), trSel, kitSel, patSel,
      h('button', { title: 'Copy this pattern', onclick: () => App.mutate(() => { const c = clone(pat); c.name = pat.name + ' copy'; tr.patterns.push(c); tr.curPattern = tr.patterns.length - 1; }, false) }, 'Clone'),
      h('button', { title: 'Rename pattern', onclick: () => { const n = prompt('Pattern name', pat.name); if (n) App.mutate(() => (pat.name = n), false); } }, 'Rename'),
      lenSel, swing,
      h('button', { class: 'primary', onclick: () => this.playPattern(tr) }, '▶ Loop pattern'),
      h('button', { onclick: () => App.mutate(() => (pat.steps = {}), false) }, 'Clear'),
      h('span', { class: 'hint2' }, 'Click/drag = paint · right-click = soft → roll ×2 → ×3 → ×4 (trap hats!)'),
    ));
    const grid = h('div', { class: 'rack-grid' });
    tr.channels.forEach((ch, ci) => {
      const steps = pat.steps[ch.id] || new Array(pat.len).fill(0);
      const stepsEl = h('div', { class: 'steps' });
      for (let i = 0; i < pat.len; i++) {
        if (i && i % 4 === 0) stepsEl.append(h('div', { class: 'gap' }));
        const s = h('div', { class: this.stepClass(steps[i], i) });
        s.dataset.col = i;
        const apply = (val) => { const a = (pat.steps[ch.id] ||= new Array(pat.len).fill(0)); a[i] = val; s.className = this.stepClass(val, i); };
        s.addEventListener('mousedown', (e) => {
          e.preventDefault();
          App.beginDrag();
          const cur = (pat.steps[ch.id] || [])[i] || 0;
          this.painting.on = true;
          if (e.button === 2) {
            const ix = STEP_CYCLE.indexOf(cur);
            this.painting.val = STEP_CYCLE[ix < 0 ? 0 : (ix + 1) % STEP_CYCLE.length];
          } else this.painting.val = cur ? 0 : 1;
          apply(this.painting.val);
          if (this.painting.val) this.preview(tr, ch, Math.min(1, this.painting.val));
        });
        s.addEventListener('mouseenter', () => { if (this.painting.on) apply(this.painting.val); });
        stepsEl.append(s);
      }
      const pitch = h('input', { type: 'number', class: 'pitch', min: -24, max: 24, value: ch.pitch || 0, title: 'Pitch (semitones)', onchange: (e) => App.mutate(() => (ch.pitch = clamp(+e.target.value || 0, -24, 24)), false) });
      grid.append(h('div', { class: 'rack-row' },
        h('button', { class: 'mini m' + (ch.mute ? ' on' : ''), title: 'Mute channel', onclick: () => App.mutate(() => (ch.mute = !ch.mute), false) }, 'M'),
        h('button', { class: 'ch-name' + (ch.sample ? ' custom' : ''), title: ch.sample ? 'Custom sample: ' + ch.name : 'Click to preview', onmousedown: () => this.preview(tr, ch, 1) }, ch.name),
        h('input', { type: 'range', min: 0, max: 1.2, step: 0.01, value: ch.vol, title: 'Channel volume', oninput: (e) => (ch.vol = +e.target.value), onchange: () => App.markDirty() }),
        pitch,
        h('button', { class: 'mini', title: 'Load your own sample (wav/mp3) into this channel', onclick: () => this.loadSample(tr, ch) }, '📂'),
        ch.sample ? h('button', { class: 'mini', title: 'Back to built-in sound', onclick: () => App.mutate(() => { ch.sample = null; ch.name = DRUM_KIT.find((d) => d.id === ch.kind)?.name || 'Sound'; }, false) }, '↺') : null,
        stepsEl,
        h('button', { class: 'mini del', title: 'Remove channel', onclick: () => App.mutate(() => { tr.channels.splice(ci, 1); }, false) }, '✕'),
      ));
    });
    panel.append(grid);
    const kindSel = options(h('select', {}), DRUM_KIT.map((d) => [d.id, d.name]), 'crash');
    panel.append(h('div', { class: 'rack-row', style: 'margin-top:8px' },
      h('span', { class: 'label' }, 'Add channel:'), kindSel,
      h('button', { onclick: () => App.mutate(() => { const k = DRUM_KIT.find((d) => d.id === kindSel.value); tr.channels.push({ id: uid(), kind: k.id, name: k.name, vol: 0.8, mute: false, sample: null, pitch: 0 }); }, false) }, '+ Built-in sound'),
      h('button', { onclick: () => { const ch = { id: uid(), kind: 'kick', name: 'Sample', vol: 0.8, mute: false, sample: null, pitch: 0 }; this.loadSample(tr, ch, true); } }, '+ From audio file…'),
    ));
    panel.oncontextmenu = (e) => e.preventDefault();
    this.curCol = -1;
  },
  preview(tr, ch, vel) {
    const n = Engine.nodes.get(tr.id);
    if (!n) return;
    playDrum(Engine.ctx, n.input, ch.kind, Engine.ctx.currentTime + 0.005, vel * ch.vol, ch.sample ? Buffers.get(ch.sample) : null, noop, tr.kit, ch.pitch || 0);
  },
  async loadSample(tr, ch, isNew) {
    const files = await pickFiles('#file-sample');
    if (!files.length) return;
    try {
      const buf = await Engine.ctx.decodeAudioData(await files[0].arrayBuffer());
      const id = Buffers.add(buf);
      App.mutate(() => { ch.sample = id; ch.name = files[0].name.replace(/\.[^.]+$/, '').slice(0, 24); if (isNew) tr.channels.push(ch); }, false);
      this.preview(tr, ch, 1);
    } catch (e) { toast('Could not read that audio file.'); }
  },
  playPattern(tr) {
    const P = App.project;
    let c = tr.clips.find((c) => c.pattern === tr.curPattern);
    if (!c) {
      App.mutate(() => {
        const start = Math.ceil(Engine.songEnd(P) / 4) * 4;
        c = { id: uid(), start: tr.clips.length ? start : 0, length: tr.patterns[tr.curPattern].len / 4, pattern: tr.curPattern, off: 0 };
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
      const ov = Engine.override && Engine.override.P.tracks[0].id === tr.id ? Engine.override.P.tracks[0].clips : tr.clips;
      const c = ov.find((c) => c.pattern === tr.curPattern && beat >= c.start && beat < c.start + c.length);
      if (c && pat) col = (Math.floor((beat - c.start) * 4) + (c.off || 0)) % pat.len;
    }
    if (col === this.curCol) return;
    $$('#panel-rack .step.cur').forEach((s) => s.classList.remove('cur'));
    if (col >= 0) $$(`#panel-rack .step[data-col="${col}"]`).forEach((s) => s.classList.add('cur'));
    this.curCol = col;
  },
};

// ---------------- Piano Roll ----------------
const SNAPS = [['1/32', 0.5], ['1/16', 1], ['1/8T', 4 / 3], ['1/8', 2], ['1/4', 4], ['Off', 0]];
const Piano = {
  lo: 21, hi: 108, rh: 13, cw: 22, kw: 58, velH: 64,
  snap: 1,
  sel: new Set(),
  clip: null,
  flashed: new Set(),
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
        synthTr ? 'Click an empty spot in an Instrument lane to create a clip, or ' : 'No instrument track yet. ',
        synthTr
          ? h('button', { class: 'primary', onclick: () => App.mutate(() => { const c = { id: uid(), start: Math.floor(App.playhead / 4) * 4, length: 4, notes: [] }; synthTr.clips.push(c); App.editClipId = c.id; App.selClipId = c.id; }) }, '+ New clip on ' + synthTr.name)
          : h('button', { class: 'primary', onclick: () => addTrack('synth') }, '+ Add Instrument')));
      return;
    }
    const { tr, c } = found;
    if (this.clip !== c) { this.sel.clear(); this.clip = c; }
    this.tr = tr; this.c = c;
    this.steps = Math.round(c.length * 4);
    const instSel = options(h('select', { onchange: (e) => setInstrument(tr, e.target.value) }), instrumentOptions(tr.inst), instValue(tr.inst));
    const snapSel = options(h('select', { onchange: (e) => { this.snap = +e.target.value; this.draw(); } }), SNAPS.map(([l, v]) => [v, l]), this.snap);
    const lenSel = options(h('select', { onchange: (e) => (App.noteLen = +e.target.value) }), [[0.5, '1/32'], [1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, '1 bar']], App.noteLen);
    const barsIn = h('input', { type: 'number', min: 0.25, max: 64, step: 0.25, value: c.length / 4, title: 'Clip length in bars', onchange: (e) => App.mutate(() => (c.length = clamp(+e.target.value || 1, 0.25, 64) * 4)) });
    panel.append(h('div', { class: 'panel-head' },
      h('h3', {}, 'Piano Roll'),
      h('span', { style: `color:${tr.color};font-weight:600` }, tr.name),
      h('label', { class: 'field' }, 'Sound', instSel),
      h('label', { class: 'field' }, 'Snap', snapSel),
      h('label', { class: 'field' }, 'New note', lenSel),
      h('label', { class: 'field' }, 'Bars', barsIn),
      h('label', { class: 'field', title: 'Clicking adds a whole chord' }, 'Chord', options(h('select', { onchange: (e) => (this.chord = e.target.value) }), Object.keys(CHORD_TYPES), this.chord)),
      h('label', { class: 'field', title: 'New and moved notes stay in the song key' }, h('input', { type: 'checkbox', checked: this.scaleLock, onchange: (e) => (this.scaleLock = e.target.checked) }), 'Scale lock'),
      h('label', { class: 'field', title: 'Show notes from other instrument tracks' }, h('input', { type: 'checkbox', checked: this.ghosts, onchange: (e) => { this.ghosts = e.target.checked; this.draw(); } }), 'Ghosts'),
      h('button', { title: 'Snap selected notes (or all) to the grid (Ctrl+Q)', onclick: () => this.quantize() }, 'Quantize'),
      h('button', { title: 'More tools', onclick: (e) => this.toolsMenu(e) }, 'Tools ▾'),
      h('button', { title: 'Transpose down an octave', onclick: () => this.transpose(-12) }, '−8va'),
      h('button', { title: 'Transpose up an octave', onclick: () => this.transpose(12) }, '+8va'),
      h('button', { class: 'primary', onclick: () => { P.loop = { on: true, start: c.start, end: c.start + c.length }; App.syncTop(); TL.draw(); App.playhead = c.start; App.play(); } }, '▶ Loop clip'),
      h('button', { onclick: () => App.mutate(() => (c.notes = [])) }, 'Clear'),
      h('span', { class: 'hint2' }, 'Click = add · drag = move · edge = resize · Ctrl+drag = select box · Shift+click = multi · arrows = transpose/move · bottom lane = velocity'),
    ));
    const wrap = h('div', { id: 'piano-wrap' });
    wrap.dataset.clip = c.id;
    const keys = h('canvas', { id: 'piano-keys' });
    const grid = h('canvas', { id: 'piano-grid' });
    const ph = h('div', { id: 'piano-ph' });
    const mq = h('div', { id: 'piano-mq', class: 'mq' });
    wrap.append(keys, grid, ph, mq);
    const vel = h('canvas', { id: 'piano-vel' });
    const velWrap = h('div', { id: 'piano-vel-wrap' }, h('div', { class: 'vel-label' }, 'Velocity'), h('div', { class: 'vel-scroll' }, vel));
    panel.append(wrap, velWrap);
    this.keys = keys; this.grid = grid; this.vel = vel; this.wrap = wrap;
    wrap.addEventListener('scroll', () => { velWrap.querySelector('.vel-scroll').scrollLeft = wrap.scrollLeft; });
    this.drawKeys();
    this.draw();
    grid.addEventListener('mousedown', (e) => this.down(e));
    grid.addEventListener('mousemove', (e) => this.hover(e));
    grid.addEventListener('contextmenu', (e) => e.preventDefault());
    vel.addEventListener('mousedown', (e) => this.velDown(e));
    keys.addEventListener('mousedown', (e) => {
      const p = this.hi - Math.floor(e.offsetY / this.rh);
      App.noteOn(p, 0.8, 'mouse');
      window.addEventListener('mouseup', () => App.noteOff('mouse'), { once: true });
    });
    if (keep && keep[2] === c.id) { wrap.scrollLeft = keep[0]; wrap.scrollTop = keep[1]; }
    else {
      const ps = c.notes.map((n) => n.p);
      const center = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : 62;
      wrap.scrollTop = (this.hi - center) * this.rh - 110;
    }
  },
  drawKeys() {
    const H = (this.hi - this.lo + 1) * this.rh;
    const g = sizeCanvas(this.keys, this.kw, H);
    for (let p = this.hi; p >= this.lo; p--) {
      const y = (this.hi - p) * this.rh;
      const black = [1, 3, 6, 8, 10].includes(p % 12);
      const lit = this.flashed.has(p);
      g.fillStyle = lit ? '#2fd4c4' : black ? '#22252c' : '#d9dce3';
      g.fillRect(0, y, this.kw, this.rh);
      g.fillStyle = '#00000055';
      g.fillRect(0, y + this.rh - 1, this.kw, 1);
      if (p % 12 === 0) { g.fillStyle = '#333'; g.font = '10px Segoe UI'; g.fillText(noteName(p), this.kw - 26, y + this.rh - 3); }
    }
  },
  flashKey(p, on) {
    if (on) this.flashed.add(p); else this.flashed.delete(p);
    if (App.tab === 'piano' && this.keys && this.keys.isConnected) this.drawKeys();
  },
  draw() {
    const P = App.project, c = this.c, tr = this.tr;
    if (!c || !this.grid) return;
    const W = Math.max(this.steps, 16) * this.cw, H = (this.hi - this.lo + 1) * this.rh;
    const g = sizeCanvas(this.grid, W, H);
    const mask = scaleMask(P.key, P.scale);
    for (let p = this.hi; p >= this.lo; p--) {
      const y = (this.hi - p) * this.rh, pc = ((p % 12) + 12) % 12;
      g.fillStyle = mask[pc] ? (pc === P.key ? '#2a2f3a' : '#22262e') : '#181a20';
      g.fillRect(0, y, W, this.rh);
      g.fillStyle = pc === 0 ? '#3a404d' : '#1d2027';
      g.fillRect(0, y + this.rh - 1, W, 1);
    }
    const sn = this.snap || 1;
    for (let s = 0; s <= this.steps + 1e-6; s += sn < 1 ? sn : 1) {
      g.fillStyle = Math.abs(s % (4 * App.bpb())) < 1e-6 ? '#4a5160' : Math.abs(s % 4) < 1e-6 ? '#323843' : '#24282f';
      g.fillRect(Math.round(s * this.cw), 0, 1, H);
    }
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(this.steps * this.cw, 0, W, H);
    if (this.ghosts) {
      g.fillStyle = 'rgba(200,205,220,0.13)';
      for (const t of P.tracks) {
        if (t.type !== 'synth') continue;
        for (const oc of t.clips) {
          if (oc === c || oc.start >= c.start + c.length || oc.start + oc.length <= c.start) continue;
          const off = (oc.start - c.start) * 4;
          for (const n of oc.notes) {
            const ss = n.s + off;
            if (ss + n.d < 0 || ss > this.steps || n.p < this.lo || n.p > this.hi) continue;
            g.fillRect(ss * this.cw + 1, (this.hi - n.p) * this.rh + 2, Math.max(3, n.d * this.cw - 2), this.rh - 4);
          }
        }
      }
    }
    for (const n of c.notes) {
      const x = n.s * this.cw, y = (this.hi - n.p) * this.rh, w = Math.max(4, n.d * this.cw - 2);
      const sel = this.sel.has(n);
      g.globalAlpha = 0.55 + 0.45 * (n.v ?? 0.8);
      g.fillStyle = sel ? '#ffffff' : tr.color;
      g.beginPath();
      g.roundRect(x + 1, y + 1, w, this.rh - 2, 3);
      g.fill();
      g.globalAlpha = 1;
      g.fillStyle = '#00000066';
      g.fillRect(x + w - 3, y + 3, 2, this.rh - 6);
      if (w > 30) { g.fillStyle = '#111'; g.font = '9px Segoe UI'; g.fillText(noteName(n.p), x + 4, y + this.rh - 3.5); }
    }
    this.drawVel(W);
  },
  drawVel(W) {
    const g = sizeCanvas(this.vel, W + this.kw, this.velH);
    g.fillStyle = '#111317';
    g.fillRect(0, 0, W + this.kw, this.velH);
    g.fillStyle = '#1a1d23';
    g.fillRect(0, 0, this.kw, this.velH);
    for (const n of this.c.notes) {
      const x = this.kw + n.s * this.cw, hgt = (n.v ?? 0.8) * (this.velH - 8);
      g.fillStyle = this.sel.has(n) ? '#fff' : this.tr.color;
      g.fillRect(x + 1, this.velH - hgt, 4, hgt);
      g.beginPath(); g.arc(x + 3, this.velH - hgt, 3.5, 0, Math.PI * 2); g.fill();
    }
  },
  q(s) { return this.snap ? Math.round(s / this.snap) * this.snap : Math.round(s * 100) / 100; },
  qf(s) { return this.snap ? Math.floor(s / this.snap + 1e-6) * this.snap : Math.round(s * 100) / 100; },
  at(e) {
    const p = this.hi - Math.floor(e.offsetY / this.rh);
    const s = e.offsetX / this.cw;
    let note = null;
    for (let i = this.c.notes.length - 1; i >= 0; i--) { const n = this.c.notes[i]; if (n.p === p && s >= n.s && s < n.s + n.d) { note = n; break; } }
    return { p, s, note };
  },
  hover(e) {
    if (this.dragging) return;
    const { note } = this.at(e);
    this.grid.style.cursor = note ? (e.offsetX > (note.s + note.d) * this.cw - 7 ? 'ew-resize' : 'move') : 'crosshair';
  },
  preview(p) {
    const tr = this.tr, n = tr && Engine.nodes.get(tr.id);
    if (!n) return;
    playInstrument(Engine.ctx, n.input, tr.inst, p, Engine.ctx.currentTime + 0.005, 0.3, 0.8);
  },
  down(e) {
    const c = this.c;
    let { p, s, note } = this.at(e);
    if (e.button === 2) {
      if (note) App.mutate(() => { c.notes = c.notes.filter((n) => n !== note && !(this.sel.has(note) && this.sel.has(n))); this.sel.clear(); });
      return;
    }
    if (e.button !== 0) return;
    if (!note && e.ctrlKey) return this.marquee(e);
    if (note && e.shiftKey) { if (this.sel.has(note)) this.sel.delete(note); else this.sel.add(note); this.draw(); return; }
    App.beginDrag();
    let mode = 'move';
    if (note) {
      if (e.offsetX > (note.s + note.d) * this.cw - 7) mode = 'resize';
      if (!this.sel.has(note)) { this.sel.clear(); this.sel.add(note); }
    } else {
      if (s >= this.steps) return;
      const st = this.qf(s);
      if (this.scaleLock) p = this.lock(p);
      const d0 = Math.min(App.noteLen, this.steps - st);
      this.sel.clear();
      for (const pp of chordNotes(p, this.chord, App.project)) {
        const nn = { p: clamp(pp, this.lo, this.hi), s: st, d: d0, v: 0.8 };
        c.notes.push(nn);
        this.sel.add(nn);
        if (pp === p) note = nn;
      }
      note = note || [...this.sel][0];
      [...this.sel].slice(1).forEach((x) => this.preview(x.p));
    }
    this.preview(note.p);
    this.dragging = true;
    const group = [...this.sel];
    const orig = group.map((n) => ({ s: n.s, p: n.p, d: n.d }));
    const s0 = s, p0 = p;
    this.draw();
    const rect = this.grid.getBoundingClientRect();
    let lastP = note.p;
    const move = (ev) => {
      const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      const ds = this.q(x / this.cw - s0), dp = (this.hi - Math.floor(y / this.rh)) - p0;
      if (mode === 'move') {
        const minS = Math.min(...orig.map((o) => o.s));
        group.forEach((n, i) => { n.s = Math.max(0, orig[i].s + Math.max(-minS, ds)); n.p = clamp(orig[i].p + dp, this.lo, this.hi); if (this.scaleLock) n.p = this.lock(n.p); });
        if (note.p !== lastP) { lastP = note.p; this.preview(note.p); }
      } else {
        group.forEach((n, i) => (n.d = Math.max(this.snap || 0.25, this.q(orig[i].d + ds))));
        App.noteLen = note.d;
      }
      this.draw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.dragging = false;
      App.endDrag();
      this.draw();
      TL.draw();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  marquee(e) {
    const mq = $('#piano-mq'), rect = this.grid.getBoundingClientRect();
    const x0 = e.offsetX, y0 = e.offsetY;
    const move = (ev) => {
      const x1 = ev.clientX - rect.left, y1 = ev.clientY - rect.top;
      const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), hh = Math.abs(y1 - y0);
      Object.assign(mq.style, { display: 'block', left: this.kw + l + 'px', top: t + 'px', width: w + 'px', height: hh + 'px' });
      this.sel = new Set(this.c.notes.filter((n) => n.s * this.cw < l + w && (n.s + n.d) * this.cw > l && (this.hi - n.p) * this.rh < t + hh && (this.hi - n.p + 1) * this.rh > t));
      this.draw();
    };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); mq.style.display = 'none'; };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  velDown(e) {
    const rect = this.vel.getBoundingClientRect();
    App.beginDrag();
    const apply = (ev) => {
      const x = ev.clientX - rect.left - this.kw, y = ev.clientY - rect.top;
      const v = clamp(1 - (y - 4) / (this.velH - 8), 0.05, 1);
      const sx = x / this.cw;
      const hits = this.c.notes.filter((n) => Math.abs(n.s - sx) < 0.4);
      const tgt = hits.some((n) => this.sel.has(n)) ? [...this.sel] : hits;
      tgt.forEach((n) => (n.v = Math.round(v * 100) / 100));
      this.draw();
    };
    apply(e);
    const up = () => { window.removeEventListener('mousemove', apply); window.removeEventListener('mouseup', up); App.endDrag(); TL.draw(); };
    window.addEventListener('mousemove', apply);
    window.addEventListener('mouseup', up);
  },
  targets() { return this.sel.size ? [...this.sel] : this.c.notes; },
  chord: 'Single note',
  scaleLock: false,
  ghosts: true,
  lock(p) {
    const P = App.project, mask = scaleMask(P.key, P.scale);
    for (let d = 0; d < 7; d++) { if (mask[(((p + d) % 12) + 12) % 12]) return p + d; if (mask[(((p - d) % 12) + 12) % 12]) return p - d; }
    return p;
  },
  toolsMenu(e) {
    const op = (fn, msg) => () => { if (!this.c) return; App.mutate(() => fn(this.targets()), false); if (msg) toast(msg); };
    Menu.show(e.clientX, e.clientY + 12, [
      { label: 'Strum (roll the chord)', action: op((ns) => { const byStart = {}; ns.forEach((n) => (byStart[n.s.toFixed(2)] ||= []).push(n)); Object.values(byStart).forEach((g) => g.sort((a, b) => a.p - b.p).forEach((n, i) => { n.s += i * 0.35; n.d = Math.max(0.25, n.d - i * 0.35); })); }, 'Strummed') },
      { label: 'Humanize (timing + velocity)', action: op((ns) => ns.forEach((n) => { n.s = Math.max(0, Math.round((n.s + (Math.random() - 0.5) * 0.25) * 100) / 100); n.v = clamp((n.v ?? 0.8) + (Math.random() - 0.5) * 0.25, 0.2, 1); }), 'Humanized') },
      { label: 'Randomize velocity', action: op((ns) => ns.forEach((n) => (n.v = Math.round((0.45 + Math.random() * 0.55) * 100) / 100))) },
      { label: 'Legato (fill gaps)', action: op((ns) => { const starts = [...new Set(this.c.notes.map((n) => n.s))].sort((a, b) => a - b); ns.forEach((n) => { const nx = starts.find((x) => x > n.s + 1e-6); n.d = (nx ?? this.steps) - n.s; }); }, 'Legato') },
      { label: 'Reverse', action: op((ns) => { const lo = Math.min(...ns.map((n) => n.s)), hi = Math.max(...ns.map((n) => n.s + n.d)); ns.forEach((n) => (n.s = lo + hi - (n.s + n.d))); }) },
      { label: 'Double speed', action: op((ns) => { const lo = Math.min(...ns.map((n) => n.s)); ns.forEach((n) => { n.s = lo + (n.s - lo) / 2; n.d = Math.max(0.25, n.d / 2); }); }) },
      { label: 'Half speed', action: op((ns) => { const lo = Math.min(...ns.map((n) => n.s)); ns.forEach((n) => { n.s = lo + (n.s - lo) * 2; n.d *= 2; }); }) },
      { label: 'Snap pitches to key', action: op((ns) => ns.forEach((n) => (n.p = this.lock(n.p))), 'Notes moved into the key') },
      '-',
      { label: 'Duplicate selection', key: 'Ctrl+B', action: () => this.dupSel() },
      { label: 'Select all', key: 'Ctrl+A', action: () => this.selectAll() },
    ]);
  },
  dupSel() {
    if (!this.c || !this.sel.size) return false;
    const ns = [...this.sel], lo = Math.min(...ns.map((n) => n.s)), hi = Math.max(...ns.map((n) => n.s + n.d));
    App.mutate(() => { const add = ns.map((n) => ({ ...n, s: n.s + (hi - lo) })); this.c.notes.push(...add); this.sel = new Set(add); }, false);
    return true;
  },
  quantize() {
    if (!this.c) return;
    const sn = this.snap || 1;
    App.mutate(() => this.targets().forEach((n) => { n.s = Math.round(n.s / sn) * sn; n.d = Math.max(sn, Math.round(n.d / sn) * sn); }), false);
    toast('Quantized to ' + (SNAPS.find((x) => x[1] === sn) || ['1/16'])[0]);
  },
  transpose(d) { if (this.c) App.mutate(() => this.targets().forEach((n) => (n.p = clamp(n.p + d, this.lo, this.hi))), false); },
  nudge(ds) { if (this.c) App.mutate(() => this.targets().forEach((n) => (n.s = Math.max(0, n.s + ds))), false); },
  delSel() { if (this.c && this.sel.size) { App.mutate(() => { this.c.notes = this.c.notes.filter((n) => !this.sel.has(n)); this.sel.clear(); }); return true; } return false; },
  copy() { if (this.sel.size) { const lo = Math.min(...[...this.sel].map((n) => n.s)); this.clip_ = [...this.sel].map((n) => ({ ...n, s: n.s - lo })); toast(`Copied ${this.sel.size} notes`); return true; } return false; },
  paste() {
    if (!this.clip_ || !this.c) return false;
    const c = this.c;
    const at = this.sel.size ? Math.max(...[...this.sel].map((n) => n.s + n.d)) : Math.max(0, Math.floor((App.playhead - c.start) * 4));
    App.mutate(() => { const add = this.clip_.map((n) => ({ ...n, s: n.s + at })); c.notes.push(...add); this.sel = new Set(add); }, false);
    return true;
  },
  selectAll() { if (this.c) { this.sel = new Set(this.c.notes); this.draw(); } },
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

// ---------------- Instrument panel (synth editor + arpeggiator) ----------------
const SYN_SPECS = {
  oct: { label: 'Octave', min: -2, max: 2, def: 0 }, semi: { label: 'Semi', min: -12, max: 12, def: 0 }, fine: { label: 'Fine', min: -50, max: 50, def: 0, unit: 'c' },
  level: { label: 'Level', min: 0, max: 1, def: 0.8, unit: '%' }, voices: { label: 'Unison', min: 1, max: 7, def: 1 }, spread: { label: 'Detune', min: 0, max: 50, def: 12, unit: 'c' },
  sub: { label: 'Sub', min: 0, max: 1, def: 0, unit: '%' }, noise: { label: 'Noise', min: 0, max: 1, def: 0, unit: '%' },
  cutoff: { label: 'Cutoff', min: 40, max: 18000, def: 3000, log: true, unit: 'Hz' }, res: { label: 'Reso', min: 0.1, max: 20, def: 1, log: true },
  env: { label: 'Env amt', min: 0, max: 9000, def: 2000, unit: 'Hz' }, key: { label: 'Key trk', min: 0, max: 1, def: 0.3, unit: '%' }, drive: { label: 'Drive', min: 0, max: 4, def: 0 },
  a: { label: 'Attack', min: 0.001, max: 3, def: 0.005, log: true, unit: 's' }, d: { label: 'Decay', min: 0.01, max: 3, def: 0.3, log: true, unit: 's' },
  s: { label: 'Sustain', min: 0, max: 1, def: 0.7, unit: '%' }, r: { label: 'Release', min: 0.01, max: 4, def: 0.3, log: true, unit: 's' },
  rate: { label: 'Rate', min: 0.05, max: 20, def: 5, log: true, unit: 'Hz' }, depth: { label: 'Depth', min: 0, max: 1, def: 0, unit: '%' },
  amt: { label: 'Pitch env', min: -24, max: 24, def: 0 }, time: { label: 'Time', min: 0.005, max: 1, def: 0.05, log: true, unit: 's' },
  gain: { label: 'Volume', min: 0, max: 1.5, def: 0.5, unit: '%' },
  fm: { label: 'FM amount', min: 0, max: 1, def: 0, unit: '%' },
  glide: { label: 'Glide', min: 0.005, max: 0.6, def: 0.08, log: true, unit: 's' },
};
const USER_PRESETS_KEY = 'studio-user-presets';
function userPresets() { try { return JSON.parse(localStorage.getItem(USER_PRESETS_KEY) || '{}'); } catch (e) { return {}; } }
const Inst = {
  render() {
    const panel = $('#panel-inst');
    panel.innerHTML = '';
    const P = App.project;
    let tr = App.track(App.selTrackId);
    if (!tr || tr.type !== 'synth') tr = P.tracks.find((t) => t.type === 'synth');
    if (!tr) { panel.append(h('div', { class: 'empty' }, 'Select an instrument track. ', h('button', { class: 'primary', onclick: () => addTrack('synth') }, '+ Add Instrument'))); return; }
    const inst = tr.inst;
    const ups = userPresets();
    const optsList = instrumentOptions(ups[inst.name] ? null : inst);
    if (Object.keys(ups).length) optsList.push({ group: 'My presets', items: Object.keys(ups).map((k) => ['user:' + k, k]) });
    const sel = options(h('select', {
      onchange: (e) => {
        const v = e.target.value;
        if (v.startsWith('user:')) { const nm = v.slice(5); App.mutate(() => (tr.inst = { kind: 'synth', name: nm, patch: clone(ups[nm]) })); }
        else setInstrument(tr, v);
      },
    }), optsList, inst.kind === 'synth' && ups[inst.name] ? 'user:' + inst.name : instValue(inst));
    const head = h('div', { class: 'panel-head' }, h('h3', {}, 'Instrument'), h('span', { style: `color:${tr.color};font-weight:600` }, tr.name), sel);
    if (inst.kind === 'synth') {
      head.append(h('button', { onclick: () => { const n = prompt('Name your preset', inst.name + ' (mine)'); if (!n) return; const u = userPresets(); u[n] = clone(inst.patch); try { localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(u)); } catch (e) {} inst.name = n; App.markDirty(); this.render(); toast('Saved preset "' + n + '"'); } }, 'Save preset'));
      head.append(h('button', { title: 'Back to the factory sound', onclick: () => { if (SYNTH_PRESETS[inst.name]) App.mutate(() => (tr.inst = presetInst(inst.name))); } }, 'Reset'));
    }
    panel.append(head);
    const body = h('div', { class: 'inst-body' });
    if (inst.kind === 'sampler') {
      const info = INSTRUMENTS[inst.name];
      body.append(h('div', { class: 'section sampler-card' },
        h('div', { class: 'sec-title' }, 'Real instrument'),
        h('div', { class: 'big-name' }, inst.name),
        h('div', { class: 'hint2' }, `${info.notes.length} recorded notes · ${info.cat}`),
        h('div', { class: 'hint2' }, Sampler.ready(inst.name) ? 'Loaded ✓' : 'Loading…'),
        h('div', { class: 'hint2', style: 'margin-top:8px' }, 'Samples: Salamander Grand Piano & tonejs-instruments (CC-BY 3.0)')));
      if (!Sampler.ready(inst.name)) Sampler.load(inst.name, Engine.ctx).then(() => App.tab === 'inst' && this.render());
    } else if (inst.kind === 'sample') body.append(...SamplerUI.sections(tr));
    else body.append(...this.synthSections(tr));
    body.append(this.arpSection(tr));
    panel.append(body, this.keyboard(tr));
  },
  synthSections(tr) {
    const p = tr.inst.patch, col = tr.color;
    const after = () => {};
    const K = (obj, key, specKey) => specKnob(SYN_SPECS[specKey || key], obj, key, after, col);
    const waveBtns = (o) => h('div', { class: 'wave-btns' }, WAVES.map((w) => h('button', { class: 'mini' + (o.wave === w ? ' on' : ''), title: w, onclick: () => App.mutate(() => (o.wave = w), false) }, { sawtooth: '⩘', square: '⊓', triangle: '⋀', sine: '∿' }[w])));
    const sec = (title, ...kids) => h('div', { class: 'section' }, h('div', { class: 'sec-title' }, title), h('div', { class: 'knobs' }, ...kids));
    const oscSec = (i) => {
      const o = p.osc[i];
      return h('div', { class: 'section' + (o.on ? '' : ' off') },
        h('div', { class: 'sec-title' }, h('label', {}, h('input', { type: 'checkbox', checked: o.on, onchange: (e) => App.mutate(() => (o.on = e.target.checked), false) }), ' Oscillator ' + (i + 1)), waveBtns(o)),
        h('div', { class: 'knobs' }, K(o, 'oct'), K(o, 'semi'), K(o, 'fine'), K(o, 'level'), K(o, 'voices'), K(o, 'spread')));
    };
    const fType = options(h('select', { onchange: (e) => App.mutate(() => (p.filter.type = e.target.value), false) }), ['lowpass', 'highpass', 'bandpass'], p.filter.type);
    const lfoT = options(h('select', { onchange: (e) => App.mutate(() => (p.lfo.target = e.target.value), false) }), [['pitch', '→ Pitch (vibrato)'], ['filter', '→ Filter (wobble)'], ['amp', '→ Volume (tremolo)']], p.lfo.target);
    const lfoW = options(h('select', { onchange: (e) => App.mutate(() => (p.lfo.wave = e.target.value), false) }), WAVES, p.lfo.wave);
    return [
      oscSec(0), oscSec(1),
      sec('Sub & Noise', K(p, 'sub'), K(p, 'noise'), K(p.penv, 'amt'), K(p.penv, 'time'), K(p, 'gain')),
      h('div', { class: 'section' }, h('div', { class: 'sec-title' }, 'FM & Glide',
        h('label', { title: 'Mono: one note at a time. Overlapping notes slide into each other (808 glides).' }, h('input', { type: 'checkbox', checked: !!p.mono, onchange: (e) => App.mutate(() => (p.mono = e.target.checked), false) }), ' Mono / slide')),
        h('div', { class: 'knobs' }, K(p, 'fm'), K(p, 'glide')),
        h('div', { class: 'hint2', style: 'max-width:200px' }, 'FM: oscillator 2 bends oscillator 1 for bells, e-pianos and growls. Slide: overlap notes in the piano roll.')),
      h('div', { class: 'section' }, h('div', { class: 'sec-title' }, 'Filter ', fType), h('div', { class: 'knobs' }, K(p.filter, 'cutoff'), K(p.filter, 'res'), K(p.filter, 'env'), K(p.filter, 'key'), K(p.filter, 'drive'))),
      sec('Filter envelope', K(p.fenv, 'a'), K(p.fenv, 'd'), K(p.fenv, 's'), K(p.fenv, 'r')),
      sec('Amp envelope', K(p.amp, 'a'), K(p.amp, 'd'), K(p.amp, 's'), K(p.amp, 'r')),
      h('div', { class: 'section' }, h('div', { class: 'sec-title' }, 'LFO ', lfoW, lfoT), h('div', { class: 'knobs' }, K(p.lfo, 'rate'), K(p.lfo, 'depth'))),
    ];
  },
  arpSection(tr) {
    const a = tr.arp;
    const mode = options(h('select', { onchange: (e) => App.mutate(() => (a.mode = e.target.value), false) }), [['up', 'Up'], ['down', 'Down'], ['updown', 'Up & down'], ['random', 'Random'], ['chord', 'Chord repeat']], a.mode);
    const rate = options(h('select', { onchange: (e) => App.mutate(() => (a.rate = +e.target.value), false) }), [[0.5, '1/32'], [1, '1/16'], [2, '1/8'], [4, '1/4']], a.rate);
    const oct = options(h('select', { onchange: (e) => App.mutate(() => (a.oct = +e.target.value), false) }), [[1, '1 octave'], [2, '2 octaves'], [3, '3 octaves']], a.oct);
    return h('div', { class: 'section arp' + (a.on ? '' : ' off') },
      h('div', { class: 'sec-title' }, h('label', {}, h('input', { type: 'checkbox', checked: a.on, onchange: (e) => App.mutate(() => (a.on = e.target.checked), false) }), ' Arpeggiator')),
      h('div', { class: 'arp-row' }, mode, rate, oct),
      h('div', { class: 'knobs' }, specKnob({ label: 'Gate', min: 0.1, max: 1, def: 0.8, unit: '%' }, a, 'gate', () => {}, tr.color)),
      h('div', { class: 'hint2' }, 'Hold chords in the piano roll — the arp plays them as patterns.'));
  },
  keyboard(tr) {
    const kb = h('div', { class: 'onscreen-kb' });
    const base = (App.octave + 1) * 12 - 12;
    for (let m = base; m < base + 36; m++) {
      const black = [1, 3, 6, 8, 10].includes(m % 12);
      const k = h('div', { class: 'k ' + (black ? 'b' : 'w'), title: noteName(m) });
      k.addEventListener('mousedown', (e) => { e.preventDefault(); App.noteOn(m, 0.85, 'osk' + m); const up = () => { App.noteOff('osk' + m); k.removeEventListener('mouseleave', up); }; window.addEventListener('mouseup', up, { once: true }); k.addEventListener('mouseleave', up); });
      if (m % 12 === 0) k.append(h('span', {}, noteName(m)));
      kb.append(k);
    }
    return kb;
  },
};
