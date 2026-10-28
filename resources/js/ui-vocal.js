// Vocal studio: Auto-Tune (styles, voice character, pitch shift, harmonizer), graphical pitch editor, takes.

const VOICE_PRESETS = [
  { name: 'Cher – Believe', desc: 'The original hard-tune warble', at: { speed: 0, amount: 1, robot: 0, harmony: false, formant: 0, shift: 0 }, fx: { rev: 0.22, dly: 0.08, eq: { low: -2, mid: 0, high: 3 } } },
  { name: 'T-Pain', desc: 'Hard, glossy R&B tune', at: { speed: 0, amount: 1, robot: 0, harmony: false, formant: 0, shift: 0 }, fx: { rev: 0.18, dly: 0.12, eq: { low: 0, mid: 1, high: 2 } } },
  { name: 'Kanye – 808s', desc: 'Cold, heavy tune drenched in reverb', at: { speed: 0, amount: 1, robot: 0.15, harmony: false, formant: 0, shift: 0 }, fx: { rev: 0.5, dly: 0.22, eq: { low: -4, mid: -1, high: 3 } } },
  { name: 'Kanye – Stronger', desc: 'Half voice, half robot', at: { speed: 0, amount: 1, robot: 0.55, harmony: false, formant: 0, shift: 0 }, fx: { rev: 0.2, dly: 0.15, eq: { low: -2, mid: 3, high: 3 } } },
  { name: 'Daft Punk Robot', desc: 'Full vocoder robot with harmony', at: { speed: 0, amount: 1, robot: 1, harmony: true, formant: 0, shift: 0 }, fx: { rev: 0.22, dly: 0.25, eq: { low: 0, mid: 0, high: 4 } } },
  { name: 'Choir Stack', desc: 'Auto harmonies a 3rd & 5th above', at: { speed: 0.1, amount: 1, robot: 0, harmony: false, formant: 0, shift: 0 }, harm: { on: true, mix: 0.7, voices: [{ deg: 2, gain: 0.7, pan: -0.7 }, { deg: 4, gain: 0.6, pan: 0.7 }] }, fx: { rev: 0.35, dly: 0.05, eq: { low: -2, mid: 0, high: 2 } } },
  { name: 'Octave Doubler', desc: 'Huge octave-below layer', at: { speed: 0.08, amount: 1, robot: 0, harmony: false, formant: 0, shift: 0 }, harm: { on: true, mix: 0.6, voices: [{ deg: -7, gain: 0.8, pan: 0 }] }, fx: { rev: 0.2, dly: 0.05, eq: { low: 0, mid: 0, high: 1 } } },
  { name: 'Chipmunk', desc: 'High, squeaky cartoon voice', at: { speed: 0.1, amount: 0.5, robot: 0, harmony: false, formant: 6, shift: 7 }, fx: { rev: 0.1, dly: 0, eq: { low: -3, mid: 0, high: 0 } } },
  { name: 'Deep Monster', desc: 'Low, dark and scary', at: { speed: 0.1, amount: 0.5, robot: 0, harmony: false, formant: -5, shift: -7 }, fx: { rev: 0.25, dly: 0, eq: { low: 3, mid: -2, high: -3 } } },
  { name: 'Higher Voice', desc: 'Lighter, brighter character', at: { speed: 0.1, amount: 0.8, robot: 0, harmony: false, formant: 3, shift: 4 }, fx: { rev: 0.18, dly: 0, eq: { low: -2, mid: 0, high: 1 } } },
  { name: 'Lower Voice', desc: 'Deeper, darker character', at: { speed: 0.1, amount: 0.8, robot: 0, harmony: false, formant: -3, shift: -4 }, fx: { rev: 0.18, dly: 0, eq: { low: 1, mid: 0, high: -1 } } },
  { name: 'Natural', desc: 'Gentle pitch fixing', at: { speed: 0.35, amount: 0.85, robot: 0, harmony: false, formant: 0, shift: 0 }, fx: { rev: 0.15, dly: 0, eq: { low: 0, mid: 0, high: 0 } } },
];
const HARM_DEGS = [[7, 'Octave up'], [4, '5th up'], [2, '3rd up'], [-2, '3rd down'], [-3, '4th down'], [-7, 'Octave down']];

const AT = {
  hist: [],
  live: false,
  noteEl: null,
  hookReports() {
    for (const [id, n] of Engine.nodes) {
      if (!n.at) continue;
      const want = id === App.atTrackId && App.tab === 'vocal';
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
    if (this.noteEl && this.noteEl.isConnected && d.f > 0) {
      const cents = Math.round((ftom(d.f) - ftom(d.t || d.f)) * 100);
      this.noteEl.textContent = noteName(ftom(d.t || d.f));
      this.subEl.textContent = `You sang ${noteName(ftom(d.f))} (${cents > 0 ? '+' : ''}${cents}¢) → ${noteName(ftom(d.t || d.f))}`;
    }
  },
  async toggleLive() {
    const tr = App.track(App.atTrackId);
    try {
      if (this.live) { await Engine.setMonitor(null); this.live = false; }
      else if (tr) { await Engine.setMonitor(tr.id); this.live = true; toast('Live Auto-Tune on — use headphones to avoid feedback!', 4000); }
    } catch (e) { toast('Could not open the microphone: ' + (e.message || e.name), 5000); }
    Vocal.render();
  },
  drawGraph() {
    if (App.tab !== 'vocal' || Vocal.sub !== 'tune' || !this.gbox || !this.gbox.isConnected) return;
    const cv = this.graph, W = this.gbox.clientWidth, H = this.gbox.clientHeight;
    if (!W || !H) return;
    const g = sizeCanvas(cv, W, H);
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, W, H);
    const tr = App.track(App.atTrackId), a = tr?.autotune;
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
      g.strokeStyle = color; g.lineWidth = width; g.beginPath();
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
    if (!recent.length) { g.fillStyle = '#5b6372'; g.font = '13px Segoe UI'; g.fillText('Play back a vocal, or press "Sing live", to see your pitch here.', 30, H / 2); }
  },
};

const Vocal = {
  sub: 'tune',
  analysis: new Map(),
  render() {
    const panel = $('#panel-vocal');
    panel.innerHTML = '';
    const P = App.project;
    const tr = App.track(App.atTrackId);
    const audioTracks = P.tracks.filter((t) => t.type === 'audio');
    if (!tr) { panel.append(h('div', { class: 'empty' }, 'The vocal studio works on vocal/audio tracks. ', h('button', { class: 'primary', onclick: () => addTrack('audio') }, '+ Add Vocal track'))); return; }
    const trSel = options(h('select', { onchange: (e) => { App.atTrackId = e.target.value; App.selectTrack(e.target.value, false); } }), audioTracks.map((t) => [t.id, t.name]), tr.id);
    const tabs = h('div', { class: 'subtabs' },
      ...[['tune', 'Auto-Tune & Voice'], ['pitch', 'Pitch Editor'], ['takes', 'Takes']].map(([k, l]) => h('button', { class: this.sub === k ? 'active' : '', onclick: () => { this.sub = k; this.render(); } }, l)));
    panel.append(h('div', { class: 'panel-head' }, h('h3', { style: 'color:var(--accent2)' }, 'Vocal Studio'), trSel, tabs));
    if (this.sub === 'tune') this.renderTune(panel, tr);
    else if (this.sub === 'pitch') this.renderPitch(panel, tr);
    else this.renderTakes(panel, tr);
  },

  // ---------- Auto-Tune & voice ----------
  renderTune(panel, tr) {
    const a = tr.autotune;
    const upd = (fn, s = true) => App.mutate(fn, s);
    const keySel = options(h('select', { disabled: a.follow, onchange: (e) => upd(() => (a.key = +e.target.value)) }), NOTE_NAMES.map((n, i) => [i, n]), a.key);
    const scaleSel = options(h('select', { disabled: a.follow, onchange: (e) => upd(() => (a.scale = e.target.value)) }), Object.keys(SCALES), a.scale);
    const K = (label, obj, key, sp) => {
      const k = specKnob({ label, ...sp }, obj, key, (s) => { a.preset = null; App.syncEngine(); if (s) App.markDirty(); }, '#2fd4c4');
      return k;
    };
    AT.noteEl = h('div', { class: 'at-note' }, '—');
    AT.subEl = h('div', { class: 'at-sub' }, 'Sing or play back a vocal to see the pitch.');
    const left = h('div', { class: 'at-controls' },
      h('div', { class: 'at-big' },
        h('button', { class: 'at-power' + (a.on ? ' on' : ''), onclick: () => upd(() => (a.on = !a.on)) }, a.on ? 'ON' : 'OFF'),
        h('div', {}, AT.noteEl, AT.subEl)),
      h('div', { class: 'row-flex' },
        h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: a.follow, onchange: (e) => upd(() => (a.follow = e.target.checked)) }), 'Song key'), keySel, scaleSel),
      h('div', { class: 'knobs' },
        K('Retune', a, 'speed', { min: 0, max: 1, def: 0.05, unit: '%' }),
        K('Amount', a, 'amount', { min: 0, max: 1, def: 1, unit: '%' }),
        K('Robot', a, 'robot', { min: 0, max: 1, def: 0, unit: '%' }),
        K('Character', a, 'formant', { min: -12, max: 12, def: 0, unit: 'st' }),
        K('Pitch', a, 'shift', { min: -24, max: 24, def: 0, unit: 'st' })),
      h('div', { class: 'hint2' }, 'Retune 0 = instant robot snap · Character = male↔female tone without changing the note · Pitch = move the whole voice'),
      h('div', { class: 'row-flex' },
        h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: !!a.harmony, onchange: (e) => upd(() => { a.harmony = e.target.checked; a.preset = null; }) }), 'Robot chords'),
        h('button', { class: 'live-btn' + (AT.live ? ' on' : ''), onclick: () => AT.toggleLive() }, AT.live ? '■ Stop live' : '🎤 Sing live'),
        h('label', { class: 'field', title: 'Hear yourself through the vocal chain while recording' }, h('input', { type: 'checkbox', checked: App.hearOnRecord, onchange: (e) => (App.hearOnRecord = e.target.checked) }), 'Monitor while recording')),
    );
    // harmonizer
    const hm = a.harm;
    const harm = h('div', { class: 'section harm' + (hm.on ? '' : ' off') },
      h('div', { class: 'sec-title' }, h('label', {}, h('input', { type: 'checkbox', checked: hm.on, onchange: (e) => upd(() => { hm.on = e.target.checked; a.preset = null; }) }), ' Harmonizer'),
        h('span', { class: 'hint2' }, 'auto backing voices in key')),
      ...hm.voices.map((v, i) => h('div', { class: 'harm-voice' },
        options(h('select', { onchange: (e) => upd(() => (v.deg = +e.target.value)) }), HARM_DEGS, v.deg),
        knob({ label: 'Level', norm: v.gain, def: 0.7, size: 30, color: '#2fd4c4', text: (n) => Math.round(n * 100) + '%', onInput: (n) => { v.gain = n; }, onDone: () => App.mutate(() => {}, false) }),
        knob({ label: 'Pan', norm: (v.pan + 1) / 2, def: 0.5, size: 30, color: '#2fd4c4', text: (n) => (Math.abs(n - 0.5) < 0.01 ? 'C' : n < 0.5 ? 'L' : 'R'), onInput: (n) => { v.pan = n * 2 - 1; }, onDone: () => App.mutate(() => {}, false) }),
        h('button', { class: 'mini del', onclick: () => upd(() => hm.voices.splice(i, 1)) }, '✕'))),
      h('div', { class: 'row-flex' },
        hm.voices.length < 3 ? h('button', { onclick: () => upd(() => hm.voices.push({ deg: 7, gain: 0.6, pan: 0 })) }, '+ Voice') : null,
        knob({ label: 'Mix', norm: hm.mix, def: 0.6, size: 30, color: '#2fd4c4', text: (n) => Math.round(n * 100) + '%', onInput: (n) => { hm.mix = n; App.syncEngine(); }, onDone: () => App.markDirty() })));
    const styles = h('div', { class: 'voice-styles' },
      h('div', { class: 'vs-title' }, 'Voice styles'),
      h('div', { class: 'vs-grid' }, VOICE_PRESETS.map((vp) => h('button', {
        class: 'vs-card' + (a.on && a.preset === vp.name ? ' active' : ''),
        onclick: () => upd(() => {
          Object.assign(a, vp.at, { on: true, preset: vp.name });
          a.harm = vp.harm ? clone(vp.harm) : { ...a.harm, on: false };
          tr.rev = vp.fx.rev; tr.dly = vp.fx.dly; tr.eq = { ...vp.fx.eq };
        }),
      }, h('b', {}, vp.name), h('small', {}, vp.desc)))));
    AT.graph = h('canvas', {});
    AT.gbox = h('div', { class: 'at-graph-box' }, AT.graph);
    panel.append(h('div', { class: 'vocal-layout' }, left, h('div', { class: 'mid-col' }, harm), styles, AT.gbox));
  },

  // ---------- takes ----------
  renderTakes(panel, tr) {
    const c = this.clipOf(tr);
    if (!c) { panel.append(h('div', { class: 'empty' }, 'Record or import a vocal first. Tip: turn on Loop and record — every pass becomes a take.')); return; }
    const box = h('div', { class: 'takes' });
    (c.takes || [c.buf]).forEach((b, i) => {
      const buf = Buffers.get(b);
      const cv = h('canvas', { width: 520, height: 46 });
      const active = (c.edit ? c.edit.src : c.buf) === b;
      box.append(h('div', { class: 'take' + (active ? ' active' : '') },
        h('button', { class: active ? 'primary' : '', onclick: () => App.mutate(() => { c.buf = b; delete c.edit; }) }, active ? '✓ Take ' + (i + 1) : 'Use take ' + (i + 1)),
        h('button', { onclick: () => this.audition(b) }, '▶'),
        cv,
        h('span', { class: 'hint2' }, buf ? buf.duration.toFixed(1) + 's' : ''),
        (c.takes || []).length > 1 ? h('button', { class: 'mini del', title: 'Delete take', onclick: () => App.mutate(() => { c.takes.splice(i, 1); if (c.buf === b) { c.buf = c.takes[Math.max(0, i - 1)]; delete c.edit; } }) }, '✕') : null));
      requestAnimationFrame(() => { const pk = Buffers.peaks.get(b); if (!pk) return; const g = cv.getContext('2d'); g.fillStyle = '#0b0d10'; g.fillRect(0, 0, 520, 46); g.fillStyle = tr.color; for (let x = 0; x < 520; x++) { const v = pk[Math.floor((x / 520) * pk.length)] * 22; g.fillRect(x, 23 - v, 1, v * 2 || 1); } });
    });
    panel.append(h('div', { class: 'hint2', style: 'margin-bottom:8px' }, `${(c.takes || []).length} take(s) on "${c.name || 'clip'}". Turn on Loop (L) and press Record to stack more takes.`), box);
  },
  audition(id) {
    const b = Buffers.get(id);
    if (!b) return;
    if (this._aud) try { this._aud.stop(); } catch (e) {}
    const s = Engine.ctx.createBufferSource();
    s.buffer = b;
    s.connect(Engine.previewBus);
    s.start();
    this._aud = s;
  },
  clipOf(tr) {
    const sel = App.findClip(App.selClipId);
    if (sel && sel.tr === tr) return sel.c;
    return tr.clips[0] || null;
  },

  // ---------- graphical pitch editor ----------
  async analyze(bufId) {
    if (this.analysis.has(bufId)) return this.analysis.get(bufId);
    const buf = Buffers.get(bufId);
    const ch = buf.getChannelData(0).slice();
    const p = Worker1.call({ cmd: 'pitch', data: ch, sr: buf.sampleRate }, [ch.buffer]).then((r) => {
      const res = { fps: r.fps, hz: r.hz, rms: r.rms, notes: segmentNotes(r.hz, r.fps) };
      this.analysis.set(bufId, res);
      return res;
    });
    this.analysis.set(bufId, p);
    return p;
  },
  renderPitch(panel, tr) {
    const c = this.clipOf(tr);
    if (!c) { panel.append(h('div', { class: 'empty' }, 'Select a vocal clip on the timeline to edit its pitch note by note.')); return; }
    const src = c.edit ? c.edit.src : c.buf;
    const P = App.project;
    const bar = h('div', { class: 'panel-head' },
      h('span', { class: 'hint2' }, `Editing "${c.name || 'clip'}"`),
      h('button', { class: 'primary', onclick: () => this.autoCorrect(c, tr) }, '✨ Correct all to key'),
      h('label', { class: 'field' }, 'Flatten wobble', h('input', { type: 'range', min: 0, max: 100, value: Math.round((c.edit?.flatten || 0) * 100), onchange: (e) => this.editChange(c, tr, (ed) => (ed.flatten = +e.target.value / 100)) })),
      h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: this.snapScale !== false, onchange: (e) => (this.snapScale = e.target.checked) }), 'Snap to scale'),
      h('button', { onclick: () => App.mutate(() => { if (c.edit) { c.buf = c.edit.src; delete c.edit; } }) }, 'Reset'),
      tr.autotune.on ? h('button', { title: 'Live Auto-Tune also runs on this track', onclick: () => App.mutate(() => (tr.autotune.on = false)) }, 'Turn off live Auto-Tune') : null,
      h('span', { class: 'hint2' }, 'Drag a note up/down · double-click = snap to key · Alt-drag = fine'),
      h('span', { class: 'hint2', id: 'pe-status' }, ''));
    const wrap = h('div', { id: 'pe-wrap' });
    const cv = h('canvas', { id: 'pe-canvas' });
    wrap.append(cv);
    panel.append(bar, wrap);
    this.pe = { c, tr, cv, wrap, pps: 140 };
    $('#pe-status').textContent = 'Analyzing pitch…';
    this.analyze(src).then((an) => {
      if (!this.pe || this.pe.c !== c) return;
      this.pe.an = an;
      $('#pe-status').textContent = an.notes.length ? `${an.notes.length} notes found` : 'No sung notes found';
      if (!c.edit) c._pendingNotes = an.notes.map((n) => ({ ...n, shift: 0 }));
      this.drawPE();
      const ns = an.notes;
      if (ns.length) { const mid = ns.reduce((s, n) => s + n.center, 0) / ns.length; wrap.scrollTop = (96 - mid) * 12 - wrap.clientHeight / 2; }
    });
    cv.addEventListener('mousedown', (e) => this.peDown(e));
    cv.addEventListener('dblclick', (e) => this.peDbl(e));
  },
  peNotes(c) { return c.edit ? c.edit.notes : c._pendingNotes || []; },
  drawPE() {
    const pe = this.pe;
    if (!pe || !pe.an || !pe.cv.isConnected) return;
    const { c, tr, an, pps } = pe, P = App.project;
    const lo = 36, hi = 96, rh = 12;
    const dur = an.hz.length / an.fps, W = Math.max(pe.wrap.clientWidth, dur * pps + 60), H = (hi - lo) * rh;
    const g = sizeCanvas(pe.cv, W, H);
    const mask = scaleMask(tr.autotune.key, tr.autotune.scale);
    const y = (m) => (hi - m) * rh;
    for (let m = hi; m > lo; m--) {
      const pc = ((m % 12) + 12) % 12;
      g.fillStyle = mask[pc] ? '#20242c' : '#16181d';
      g.fillRect(0, y(m), W, rh);
      g.fillStyle = '#0f1115';
      g.fillRect(0, y(m) + rh - 1, W, 1);
      if (pc === 0) { g.fillStyle = '#5b6372'; g.font = '10px Segoe UI'; g.fillText(noteName(m), 4, y(m) + rh - 2); }
    }
    const spb = 60 / P.bpm;
    for (let t = 0; t < dur; t += spb) { g.fillStyle = '#262a33'; g.fillRect(t * pps, 0, 1, H); }
    // original pitch curve
    const fx = (f) => (f / an.fps) * pps;
    const curve = (fn, color, wdt) => {
      g.strokeStyle = color; g.lineWidth = wdt; g.beginPath();
      let pen = false;
      for (let f = 0; f < an.hz.length; f++) {
        const v = an.hz[f];
        if (!v) { pen = false; continue; }
        const m = fn(f, 69 + 12 * Math.log2(v / 440));
        const yy = y(m) + rh / 2;
        if (pen) g.lineTo(fx(f), yy); else g.moveTo(fx(f), yy);
        pen = true;
      }
      g.stroke();
    };
    curve((f, m) => m, '#6b7385', 1.2);
    const notes = this.peNotes(c), flat = c.edit?.flatten || 0;
    if (c.edit) curve((f, m) => { const n = notes.find((x) => f >= x.i0 && f < x.i1); return n ? n.center + n.shift + (m - n.center) * (1 - flat) : m; }, '#2fd4c4', 1.6);
    for (const n of notes) {
      const x0 = fx(n.i0), x1 = fx(n.i1), m = n.center + n.shift;
      g.fillStyle = n === pe.sel ? '#ffffff' : alpha(tr.color, n.shift ? 0.9 : 0.55);
      g.beginPath();
      g.roundRect(x0, y(m) + 1, Math.max(4, x1 - x0), rh - 2, 5);
      g.fill();
      if (x1 - x0 > 26) { g.fillStyle = '#111'; g.font = '9px Segoe UI'; g.fillText(noteName(Math.round(m)), x0 + 4, y(m) + rh - 3); }
      if (n.shift) { g.strokeStyle = alpha('#ffffff', 0.4); g.setLineDash([2, 3]); g.strokeRect(x0, y(n.center) + 1, x1 - x0, rh - 2); g.setLineDash([]); }
    }
  },
  peHit(e) {
    const pe = this.pe;
    if (!pe || !pe.an) return null;
    const f = (e.offsetX / pe.pps) * pe.an.fps, m = 96 - e.offsetY / 12;
    return this.peNotes(pe.c).find((n) => f >= n.i0 && f < n.i1 && Math.abs(n.center + n.shift + 0.5 - m) < 1) || null;
  },
  snapTo(tr, m) {
    if (this.snapScale === false) return Math.round(m);
    const mask = scaleMask(tr.autotune.key, tr.autotune.scale);
    let best = Math.round(m), bd = 99;
    for (let k = Math.floor(m) - 6; k <= Math.ceil(m) + 6; k++) if (mask[((k % 12) + 12) % 12] && Math.abs(k - m) < bd) { bd = Math.abs(k - m); best = k; }
    return best;
  },
  ensureEdit(c) {
    if (!c.edit) c.edit = { src: c.buf, notes: clone(c._pendingNotes || []), flatten: 0 };
    return c.edit;
  },
  peDown(e) {
    const pe = this.pe, n = this.peHit(e);
    pe.sel = n;
    this.drawPE();
    if (!n) return;
    App.beginDrag();
    const c = pe.c, tr = pe.tr;
    const ed = this.ensureEdit(c);
    const nn = ed.notes.find((x) => x.i0 === n.i0) || n;
    pe.sel = nn;
    const y0 = e.clientY, s0 = nn.shift;
    const move = (ev) => {
      const d = (y0 - ev.clientY) / 12;
      if (ev.altKey) nn.shift = Math.round((s0 + d) * 10) / 10;
      else nn.shift = this.snapTo(tr, nn.center + s0 + d) - nn.center;
      this.drawPE();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      App.endDrag();
      this.scheduleRender(c, tr);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  peDbl(e) {
    const pe = this.pe, n = this.peHit(e);
    if (!n) return;
    this.editChange(pe.c, pe.tr, (ed) => { const nn = ed.notes.find((x) => x.i0 === n.i0); if (nn) nn.shift = this.snapTo(pe.tr, nn.center) - nn.center; });
  },
  autoCorrect(c, tr) {
    if (!this.pe || !this.pe.an) return;
    this.editChange(c, tr, (ed) => { ed.notes.forEach((n) => (n.shift = this.snapTo(tr, n.center) - n.center)); ed.flatten = Math.max(ed.flatten, 0.3); });
  },
  editChange(c, tr, fn) {
    App.pushUndo(App.snapshot());
    fn(this.ensureEdit(c));
    this.drawPE();
    this.scheduleRender(c, tr);
  },
  scheduleRender(c, tr) {
    clearTimeout(this._rt);
    this._rt = setTimeout(() => this.renderEdit(c, tr), 250);
  },
  async renderEdit(c, tr) {
    const ed = c.edit;
    if (!ed) return;
    const an = await this.analyze(ed.src);
    const src = Buffers.get(ed.src);
    const st = $('#pe-status');
    if (st) st.textContent = 'Rendering…';
    const ratio = new Float32Array(an.hz.length).fill(1);
    for (const n of ed.notes) {
      for (let f = n.i0; f < n.i1; f++) {
        const v = an.hz[f];
        if (!v) continue;
        const m = 69 + 12 * Math.log2(v / 440);
        const desired = n.center + n.shift + (m - n.center) * (1 - ed.flatten);
        ratio[f] = Math.pow(2, (desired - m) / 12);
      }
    }
    // smooth note transitions
    const sm = ratio.slice();
    for (let f = 2; f < ratio.length - 2; f++) sm[f] = (ratio[f - 2] + ratio[f - 1] + ratio[f] + ratio[f + 1] + ratio[f + 2]) / 5;
    const sr = src.sampleRate, L = Math.round(sr * AT_LAT);
    const ctx = new OfflineAudioContext(1, src.length + L, sr);
    await ctx.audioWorklet.addModule('js/worklets.js');
    const s = ctx.createBufferSource();
    s.buffer = src;
    const node = new AudioWorkletNode(ctx, 'autotune', { outputChannelCount: [1], processorOptions: { edit: { fps: an.fps, ratio: sm, hz: an.hz }, mask: scaleMask(tr.autotune.key, tr.autotune.scale) } });
    node.parameters.get('bypass').value = 0;
    s.connect(node).connect(ctx.destination);
    s.start();
    const out = await ctx.startRendering();
    const res = ctx.createBuffer(1, src.length, sr);
    res.copyToChannel(out.getChannelData(0).subarray(L, L + src.length), 0);
    const old = c.buf !== ed.src ? c.buf : null;
    c.buf = Buffers.add(res);
    if (old && !usedBuffers(App.project).has(old)) { Buffers.map.delete(old); Buffers.peaks.delete(old); }
    if (st && st.isConnected) st.textContent = 'Done ✓ — press play to hear it';
    TL.draw();
    App.markDirty();
  },
};

function segmentNotes(hz, fps) {
  const m = Array.from(hz, (f) => (f > 0 ? 69 + 12 * Math.log2(f / 440) : 0));
  const notes = [];
  let cur = null;
  const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  const close = (end) => {
    if (cur && end - cur.i0 >= Math.round(fps * 0.06)) notes.push({ i0: cur.i0, i1: end, center: Math.round(median(cur.vals) * 100) / 100 });
    cur = null;
  };
  for (let f = 0; f < m.length; f++) {
    if (!m[f]) { close(f); continue; }
    if (!cur) { cur = { i0: f, vals: [m[f]] }; continue; }
    const med = median(cur.vals.slice(-10));
    const jump = Math.abs(m[f] - med) > 0.75 && (m[f + 1] ? Math.abs(m[f + 1] - med) > 0.75 : true) && (m[f + 2] ? Math.abs(m[f + 2] - med) > 0.75 : true);
    if (jump && f - cur.i0 > 4) { close(f); cur = { i0: f, vals: [m[f]] }; }
    else cur.vals.push(m[f]);
  }
  close(m.length);
  return notes;
}
