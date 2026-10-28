// Loop & sound browser: click to preview, add to the song in one click.

const Browser = {
  cat: 'drums',
  chordStyle: 'Sustained',
  bassStyle: '808 Slides',
  matchTempo: false,
  prevSources: [],
  prevNodes: [],
  render() {
    const panel = $('#panel-browser');
    panel.innerHTML = '';
    const P = App.project;
    const cats = [['drums', '🥁 Drum beats', DRUM_LOOPS.length], ['chords', '🎹 Chord progressions', CHORD_LOOPS.length], ['bass', '🎸 Bass lines', CHORD_LOOPS.length], ['melody', '🎵 Melodies', MELODY_IDEAS.length], ['inst', '🎻 Instruments', Object.keys(INSTRUMENTS).length + Object.keys(SYNTH_PRESETS).length]];
    const side = h('div', { class: 'br-side' }, cats.map(([k, l, n]) => h('button', { class: 'br-cat' + (this.cat === k ? ' active' : ''), onclick: () => { this.cat = k; this.render(); } }, h('span', {}, l), h('small', {}, n))),
      h('div', { class: 'hint2', style: 'margin-top:10px' }, `Everything follows your song key (${NOTE_NAMES[P.key]} ${P.scale}).`));
    const list = h('div', { class: 'br-list' });
    const tools = h('div', { class: 'br-tools' });
    if (this.cat === 'drums') {
      tools.append(h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: this.matchTempo, onchange: (e) => (this.matchTempo = e.target.checked) }), 'Also set song tempo to the beat\'s BPM'));
      for (const l of DRUM_LOOPS) list.append(this.row(l.name, `${l.genre} · ${l.bpm} BPM · ${l.kit} kit`, () => this.previewDrums(l), () => this.addDrums(l)));
    } else if (this.cat === 'chords' || this.cat === 'bass') {
      const isC = this.cat === 'chords';
      tools.append(h('label', { class: 'field' }, 'Style', options(h('select', { onchange: (e) => { if (isC) this.chordStyle = e.target.value; else this.bassStyle = e.target.value; } }), isC ? CHORD_STYLES : BASS_STYLES, isC ? this.chordStyle : this.bassStyle)));
      for (const c of CHORD_LOOPS) {
        const mk = () => (isC ? makeChordLoop(P, c, this.chordStyle) : makeBassLoop(P, c, this.bassStyle));
        const inst = isC ? (this.chordStyle === 'Sustained' ? 'Warm Pad' : 'Grand Piano') : this.bassStyle === '808 Slides' ? '808 Bass' : 'Electric Bass';
        list.append(this.row(c.name, (c.minor ? 'minor feel' : 'major feel') + ' · 4 bars', () => this.previewNotes(mk(), inst), () => this.addNotes(mk(), inst, isC ? 'Chords' : 'Bass')));
      }
    } else if (this.cat === 'melody') {
      for (const m of MELODY_IDEAS) list.append(this.row(m.name, 'melody idea · in key', () => this.previewNotes(makeMelody(P, m), 'Bright Pluck'), () => this.addNotes(makeMelody(P, m), 'Bright Pluck', 'Melody')));
    } else {
      const all = [...Object.keys(INSTRUMENTS).map((n) => [n, 'Real instrument · ' + INSTRUMENTS[n].cat]), ...Object.entries(SYNTH_PRESETS).map(([n, p]) => [n, 'Synth · ' + p.cat])];
      for (const [n, d] of all) list.append(this.row(n, d, () => this.previewInst(n), () => { const t = addTrack('synth', { name: n, inst: presetInst(n) }); App.mutate(() => { t.clips.push({ id: uid(), start: Math.floor(App.playhead / 4) * 4, length: 4, notes: [] }); App.editClipId = t.clips[0].id; }); Panels.show('piano'); }, 'New track'));
    }
    panel.append(h('div', { class: 'browser' }, side, h('div', { class: 'br-main' }, tools, list)));
  },
  row(name, desc, onPrev, onAdd, addLabel = '+ Add to song') {
    return h('div', { class: 'br-row' },
      h('button', { class: 'br-play', title: 'Preview', onclick: onPrev }, '▶'),
      h('div', { class: 'br-info', ondblclick: onAdd }, h('b', {}, name), h('small', {}, desc)),
      h('button', { class: 'br-add', onclick: onAdd }, addLabel));
  },
  stopPreview() {
    for (const s of this.prevSources) try { s.stop(); } catch (e) {}
    for (const n of this.prevNodes) try { n.pan.disconnect(); } catch (e) {}
    this.prevSources = [];
    this.prevNodes = [];
  },
  async playTemp(tr, clip, steps) {
    this.stopPreview();
    if (Engine.playing) App.stop();
    const ctx = Engine.ctx, P = App.project;
    if (tr.type === 'synth' && tr.inst.kind === 'sampler') await Sampler.load(tr.inst.name, ctx);
    tr.clips = [clip];
    const n = Engine.createTrackChain(ctx, tr, Engine.bus, Engine.env);
    Engine.applyTrack(n, tr, false, P, false);
    this.prevNodes.push(n);
    const map = new Map([[tr.id, n]]);
    const TP = { bpm: P.bpm, tracks: [tr] };
    const t0 = ctx.currentTime + 0.05, sp = 60 / P.bpm / 4;
    const reg = (s) => this.prevSources.push(s);
    for (let s = 0; s < steps; s++) Engine.scheduleStep(ctx, TP, s, t0 + s * sp, s === 0, map, reg);
  },
  previewDrums(l) {
    const P = App.project, tr = makeTrack('drums', { colorIdx: 0 });
    tr.kit = l.kit;
    const pat = drumLoopPattern(tr, l);
    tr.patterns = [pat];
    this.playTemp(tr, { id: 'p', start: 0, length: 8, pattern: 0, off: 0 }, 32);
  },
  previewNotes(loop, inst) {
    const tr = makeTrack('synth', { colorIdx: 0 });
    tr.inst = presetInst(inst);
    this.playTemp(tr, { id: 'p', start: 0, length: Math.min(loop.length, 16), notes: loop.notes }, Math.min(loop.length, 16) * 4);
  },
  previewInst(name) {
    const tr = makeTrack('synth', { colorIdx: 0 });
    tr.inst = presetInst(name);
    const P = App.project, base = 60 + P.key;
    const sc = scaleList(P);
    const notes = [0, 2, 4, 7].map((d, i) => ({ p: degPitch(P, d, 60), s: i * 2, d: 2, v: 0.8 })).concat([0, 2, 4].map((d) => ({ p: degPitch(P, d, 48), s: 8, d: 8, v: 0.7 })));
    this.playTemp(tr, { id: 'p', start: 0, length: 4, notes }, 16);
  },
  addDrums(l) {
    this.stopPreview();
    const P = App.project;
    let tr = App.track(App.selTrackId);
    if (!tr || tr.type !== 'drums') tr = P.tracks.find((t) => t.type === 'drums');
    App.mutate(() => {
      if (!tr) { tr = makeTrack('drums', P); tr.channels = []; tr.patterns = []; P.tracks.unshift(tr); }
      tr.kit = l.kit;
      const pat = drumLoopPattern(tr, l);
      tr.patterns.push(pat);
      if (tr.patterns.length > 1 && !Object.keys(tr.patterns[0].steps).length) { tr.patterns.shift(); tr.clips.forEach((c) => (c.pattern = Math.max(0, c.pattern - 1))); }
      tr.curPattern = tr.patterns.length - 1;
      const start = Math.floor(App.playhead / 4) * 4;
      const c = { id: uid(), start, length: 16, pattern: tr.curPattern, off: 0 };
      tr.clips.push(c);
      App.selClipId = c.id;
      App.selTrackId = tr.id;
      App.rackTrackId = tr.id;
      if (this.matchTempo) P.bpm = l.bpm;
    });
    App.syncTop();
    toast(`Added "${l.name}" (4 bars) — edit it in the Channel Rack.`);
  },
  addNotes(loop, inst, name) {
    this.stopPreview();
    const P = App.project;
    let tr = App.track(App.selTrackId);
    const fresh = !tr || tr.type !== 'synth' || tr.clips.some((c) => c.start < App.playhead + loop.length && c.start + c.length > App.playhead);
    App.mutate(() => {
      if (fresh) { tr = makeTrack('synth', P); tr.name = name; tr.inst = presetInst(inst); P.tracks.push(tr); }
      const c = { id: uid(), start: Math.floor(App.playhead / 4) * 4, length: loop.length, notes: clone(loop.notes) };
      tr.clips.push(c);
      App.selClipId = c.id;
      App.editClipId = c.id;
      App.selTrackId = tr.id;
    });
    Engine.ensureInstruments(P);
    toast(`Added ${name.toLowerCase()} — open the Piano Roll to change notes.`);
  },
};
