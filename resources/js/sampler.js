// Sampler & Slicer: play any sample across the keyboard, or chop it into slices (one per key from C4 up).

function newSamplerInst(bufId, name, slices) {
  return { kind: 'sample', name: name || 'Sampler', buf: bufId, root: 60, att: 0.002, rel: 0.12, gain: 1, pitch: 0, reverse: false, loop: false, mode: slices && slices.length ? 'slices' : 'pitch', slices: slices || [], oneshot: true };
}
const _revCache = new Map();
function sampleBuffer(inst) {
  const b = Buffers.get(inst.buf);
  if (!b || !inst.reverse) return b;
  let r = _revCache.get(inst.buf);
  if (!r) {
    r = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: b.length, sampleRate: b.sampleRate });
    for (let c = 0; c < b.numberOfChannels; c++) r.copyToChannel(b.getChannelData(c).slice().reverse(), c);
    _revCache.set(inst.buf, r);
  }
  return r;
}
function sliceBounds(inst, i, dur) {
  const s0 = inst.slices[i], s1 = i + 1 < inst.slices.length ? inst.slices[i + 1] : dur;
  return [s0, s1];
}
function playSample(ctx, dest, inst, midi, t, dur, vel = 0.8, reg = noop) {
  { const V = voiceOut(ctx, dest, reg); dest = V.out; reg = V.reg; }
  const buf = sampleBuffer(inst);
  if (!buf) return { release: noop };
  let off = 0, len = buf.duration, rate;
  const slicing = inst.mode === 'slices' && inst.slices.length;
  if (slicing) {
    const i = midi - 60;
    if (i < 0 || i >= inst.slices.length) return { release: noop };
    const [s0, s1] = sliceBounds(inst, i, buf.duration);
    off = inst.reverse ? buf.duration - s1 : s0;
    len = s1 - s0;
    rate = Math.pow(2, (inst.pitch || 0) / 12);
  } else rate = Math.pow(2, (midi - inst.root + (inst.pitch || 0)) / 12);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ctx.createGain();
  const peak = Math.pow(vel, 1.2) * (inst.gain ?? 1);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + Math.max(0.001, inst.att));
  src.connect(g).connect(dest);
  const R = Math.max(0.005, inst.rel);
  if (inst.loop && !slicing) { src.loop = true; src.start(t); }
  else src.start(t, off, len);
  reg(src);
  const playLen = len / rate;
  const release = (rt) => {
    if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(rt);
    g.gain.setTargetAtTime(0, rt, R / 3);
    try { src.stop(rt + R * 3); } catch (e) {}
  };
  if (dur != null) {
    const end = slicing && inst.oneshot ? playLen : inst.loop ? dur : Math.min(dur, playLen);
    g.gain.setTargetAtTime(0, t + end, R / 3);
    try { src.stop(t + end + R * 3); } catch (e) {}
  }
  return { release };
}

// transient (beat) detection -> slice start times in seconds
function detectSlices(buf, max = 16, sens = 0.5) {
  const sr = buf.sampleRate, hop = 256, chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const frames = Math.floor(buf.length / hop);
  const e = new Float32Array(frames);
  for (let k = 0; k < frames; k++) {
    let s = 0;
    for (const d of chans) for (let i = k * hop; i < (k + 1) * hop; i++) s += d[i] * d[i];
    e[k] = Math.log(1e-9 + s / hop);
  }
  const onset = new Float32Array(frames);
  for (let k = 2; k < frames; k++) onset[k] = Math.max(0, e[k] - Math.max(e[k - 1], e[k - 2]));
  let mean = 0, sd = 0;
  for (const v of onset) mean += v;
  mean /= frames;
  for (const v of onset) sd += (v - mean) ** 2;
  sd = Math.sqrt(sd / frames);
  const thr = mean + (2.5 - sens * 2) * sd, minGap = Math.round((0.07 * sr) / hop);
  const peaks = [];
  for (let k = 2; k < frames - 1; k++) {
    if (onset[k] > thr && onset[k] >= onset[k - 1] && onset[k] >= onset[k + 1]) peaks.push({ k, v: onset[k] });
  }
  peaks.sort((a, b) => b.v - a.v);
  const chosen = [];
  for (const p of peaks) {
    if (chosen.length >= max - 1) break;
    if (chosen.every((c) => Math.abs(c - p.k) >= minGap) && p.k > minGap) chosen.push(p.k);
  }
  return [0, ...chosen.sort((a, b) => a - b).map((k) => Math.max(0, (k * hop - hop) / sr))];
}
function equalSlices(buf, n) { return Array.from({ length: n }, (_, i) => (i * buf.duration) / n); }

// new instrument track playing a sample (optionally pre-chopped)
function makeSamplerTrack(bufId, name, chop) {
  const P = App.project, buf = Buffers.get(bufId);
  let tr;
  App.mutate(() => {
    tr = makeTrack('synth', P);
    tr.name = (name || 'Sampler').slice(0, 22);
    const slices = chop ? detectSlices(buf, 16, 0.5) : [];
    tr.inst = newSamplerInst(bufId, tr.name, slices);
    P.tracks.push(tr);
    if (chop) samplerMakePattern(tr, true);
  });
  App.selectTrack(tr.id, false);
  Panels.show('inst');
  return tr;
}
// write a clip that replays the slices in their original rhythm
function samplerMakePattern(tr, inMutate) {
  const P = App.project, inst = tr.inst, buf = Buffers.get(inst.buf);
  if (!buf || !inst.slices.length) return;
  const spStep = 60 / P.bpm / 4;
  const run = () => {
    const notes = inst.slices.map((s, i) => {
      const [a, b] = sliceBounds(inst, i, buf.duration);
      return { p: 60 + i, s: Math.round((a / spStep) * 100) / 100, d: Math.max(0.25, Math.round(((b - a) / spStep) * 100) / 100), v: 0.85 };
    });
    const len = Math.max(4, Math.ceil(buf.duration / spStep / 16) * 4);
    const c = { id: uid(), start: Math.floor(App.playhead / 4) * 4, length: len, notes };
    tr.clips.push(c);
    App.editClipId = c.id;
    App.selClipId = c.id;
  };
  if (inMutate) run(); else App.mutate(run);
}

// ---- Sampler panel UI (shown inside the Instrument tab) ----
const SamplerUI = {
  sections(tr) {
    const inst = tr.inst, buf = Buffers.get(inst.buf);
    const after = () => {};
    const K = (label, key, sp) => specKnob({ label, ...sp }, inst, key, after, tr.color);
    const cv = h('canvas', { class: 'smp-wave' });
    const mode = options(h('select', { onchange: (e) => App.mutate(() => { inst.mode = e.target.value; if (inst.mode === 'slices' && !inst.slices.length && buf) inst.slices = detectSlices(buf); }, false) }), [['pitch', 'Pitched (play it across the keyboard)'], ['slices', 'Slices (one slice per key from C4)']], inst.mode);
    const root = options(h('select', { onchange: (e) => App.mutate(() => (inst.root = +e.target.value), false) }), Array.from({ length: 61 }, (_, i) => [i + 36, noteName(i + 36)]), inst.root);
    const sens = { v: 0.5 };
    const wave = h('div', { class: 'section smp-main' },
      h('div', { class: 'sec-title' }, '✂ Sampler / Slicer', h('span', { class: 'hint2' }, buf ? `${buf.duration.toFixed(2)} s · ${inst.slices.length} slices` : 'no sample loaded')),
      h('div', { class: 'row-flex' },
        h('button', { onclick: () => this.load(tr) }, '📂 Load sample…'), mode,
        inst.mode === 'pitch' ? h('label', { class: 'field' }, 'Root', root) : null,
        h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: inst.reverse, onchange: (e) => App.mutate(() => (inst.reverse = e.target.checked), false) }), 'Reverse'),
        inst.mode === 'pitch' ? h('label', { class: 'field' }, h('input', { type: 'checkbox', checked: inst.loop, onchange: (e) => App.mutate(() => (inst.loop = e.target.checked), false) }), 'Loop') : h('label', { class: 'field', title: 'Play the whole slice even for short notes' }, h('input', { type: 'checkbox', checked: inst.oneshot, onchange: (e) => App.mutate(() => (inst.oneshot = e.target.checked), false) }), 'One-shot')),
      cv,
      inst.mode === 'slices' ? h('div', { class: 'row-flex' },
        h('button', { class: 'primary', onclick: () => App.mutate(() => (inst.slices = detectSlices(buf, 32, sens.v)), false) }, '✨ Auto-chop on beats'),
        h('label', { class: 'field' }, 'Sensitivity', h('input', { type: 'range', min: 0, max: 100, value: 50, oninput: (e) => (sens.v = +e.target.value / 100) })),
        ...[4, 8, 16, 32].map((n) => h('button', { onclick: () => App.mutate(() => (inst.slices = equalSlices(buf, n)), false) }, 'Chop ' + n)),
        h('button', { title: 'Create a clip that plays the slices back in the original rhythm', onclick: () => { samplerMakePattern(tr); Panels.show('piano'); } }, '🎹 Make pattern')) : null,
      h('div', { class: 'hint2' }, inst.mode === 'slices' ? 'Click = hear a slice · Ctrl+click = add a cut · drag a cut to move it · right-click a cut to delete. Slice 1 = C4, slice 2 = C#4…' : 'Click the waveform to hear it. The root note plays the sample at its original pitch.'));
    const knobs = h('div', { class: 'section' }, h('div', { class: 'sec-title' }, 'Sound'),
      h('div', { class: 'knobs' },
        K('Attack', 'att', { min: 0.001, max: 1, def: 0.002, log: true, unit: 's' }),
        K('Release', 'rel', { min: 0.005, max: 3, def: 0.12, log: true, unit: 's' }),
        K('Pitch', 'pitch', { min: -24, max: 24, def: 0, unit: 'st' }),
        K('Volume', 'gain', { min: 0, max: 2, def: 1, unit: '%' })));
    requestAnimationFrame(() => this.draw(tr, cv));
    this.bind(tr, cv);
    return [wave, knobs];
  },
  async load(tr) {
    const files = await pickFiles('#file-sample');
    if (!files.length) return;
    try {
      const buf = await Engine.ctx.decodeAudioData(await files[0].arrayBuffer());
      const id = Buffers.add(buf);
      App.mutate(() => { tr.inst.buf = id; tr.inst.name = files[0].name.replace(/\.[^.]+$/, '').slice(0, 22); tr.inst.slices = tr.inst.mode === 'slices' ? detectSlices(buf) : []; });
    } catch (e) { toast('Could not read that audio file.'); }
  },
  W: 760, H: 120,
  draw(tr, cv) {
    const inst = tr.inst, buf = Buffers.get(inst.buf), W = Math.max(400, cv.parentElement ? cv.parentElement.clientWidth - 24 : this.W), H = this.H;
    this.W = W;
    const g = sizeCanvas(cv, W, H);
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, W, H);
    if (!buf) { g.fillStyle = '#5b6372'; g.font = '13px Segoe UI'; g.fillText('Load a sample (drum loop, vocal chop, one-shot…)', 20, H / 2); return; }
    const pk = Buffers.peaks.get(inst.buf);
    g.fillStyle = tr.color;
    for (let x = 0; x < W; x++) {
      let i = Math.floor((x / W) * pk.length);
      if (inst.reverse) i = pk.length - 1 - i;
      const v = Math.max(0.5, pk[i] * (H / 2 - 4));
      g.fillRect(x, H / 2 - v, 1, v * 2);
    }
    if (inst.mode === 'slices') {
      inst.slices.forEach((s, i) => {
        const x = (s / buf.duration) * W;
        g.fillStyle = i === this.hot ? '#fff' : '#ffc145';
        g.fillRect(x, 0, 2, H);
        g.fillStyle = '#ffc145';
        g.font = 'bold 10px Segoe UI';
        g.fillText(String(i + 1), x + 4, 12);
      });
    }
  },
  bind(tr, cv) {
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    cv.addEventListener('mousedown', (e) => {
      const inst = tr.inst, buf = Buffers.get(inst.buf);
      if (!buf) return;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, t = (x / this.W) * buf.duration;
      const near = inst.mode === 'slices' ? inst.slices.findIndex((s) => Math.abs((s / buf.duration) * this.W - x) < 6) : -1;
      const n = Engine.nodes.get(tr.id);
      if (e.button === 2) { if (near > 0) App.mutate(() => inst.slices.splice(near, 1), false); return; }
      if (inst.mode === 'slices' && e.ctrlKey) { App.mutate(() => { inst.slices.push(t); inst.slices.sort((a, b) => a - b); }, false); return; }
      if (near > 0) {
        App.beginDrag();
        const move = (ev) => {
          const tt = clamp(((ev.clientX - r.left) / this.W) * buf.duration, inst.slices[near - 1] + 0.01, near + 1 < inst.slices.length ? inst.slices[near + 1] - 0.01 : buf.duration - 0.01);
          inst.slices[near] = tt;
          this.hot = near;
          this.draw(tr, cv);
        };
        const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); this.hot = -1; App.endDrag(); this.draw(tr, cv); };
        window.addEventListener('mousemove', move);
        window.addEventListener('mouseup', up);
        return;
      }
      if (!n) return;
      if (inst.mode === 'slices') {
        let i = inst.slices.findIndex((s, k) => t >= s && (k + 1 >= inst.slices.length || t < inst.slices[k + 1]));
        if (i >= 0) { this.hot = i; this.draw(tr, cv); playSample(Engine.ctx, n.input, inst, 60 + i, Engine.ctx.currentTime, null, 0.9); setTimeout(() => { this.hot = -1; this.draw(tr, cv); }, 250); }
      } else {
        const v = playSample(Engine.ctx, n.input, inst, inst.root, Engine.ctx.currentTime, null, 0.9);
        window.addEventListener('mouseup', () => v.release(Engine.ctx.currentTime), { once: true });
      }
    });
  },
};
