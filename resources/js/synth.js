// Subtractive synth with editable patches + preset library.

const WAVES = ['sawtooth', 'square', 'triangle', 'sine'];
function basePatch() {
  return {
    osc: [
      { on: true, wave: 'sawtooth', oct: 0, semi: 0, fine: 0, level: 0.8, voices: 1, spread: 12 },
      { on: false, wave: 'square', oct: 0, semi: 0, fine: 0, level: 0.5, voices: 1, spread: 12 },
    ],
    sub: 0, noise: 0,
    filter: { type: 'lowpass', cutoff: 3000, res: 1, env: 2000, key: 0.3, drive: 0 },
    amp: { a: 0.005, d: 0.3, s: 0.7, r: 0.3 },
    fenv: { a: 0.005, d: 0.3, s: 0.3, r: 0.3 },
    lfo: { wave: 'sine', rate: 5, depth: 0, target: 'pitch' },
    penv: { amt: 0, time: 0.05 },
    gain: 0.5, fm: 0, mono: false, glide: 0.08,
  };
}
function P(over) {
  const p = basePatch();
  for (const k in over) {
    if (k === 'osc') over.osc.forEach((o, i) => (p.osc[i] = Object.assign({}, p.osc[i] || basePatch().osc[0], o)));
    else if (typeof over[k] === 'object') p[k] = Object.assign({}, p[k], over[k]);
    else p[k] = over[k];
  }
  return p;
}
const SYNTH_PRESETS = {
  // Leads
  'Super Saw': { cat: 'Lead', p: P({ osc: [{ wave: 'sawtooth', voices: 7, spread: 28, level: 0.9 }, { on: true, wave: 'sawtooth', oct: -1, level: 0.4 }], filter: { cutoff: 2600, res: 1, env: 3500, key: 0.3 }, amp: { a: 0.01, d: 0.3, s: 0.75, r: 0.35 } }) },
  'Square Lead': { cat: 'Lead', p: P({ osc: [{ wave: 'square', voices: 2, spread: 10, level: 0.8 }], filter: { cutoff: 2800, res: 2, env: 1500 }, amp: { a: 0.005, d: 0.2, s: 0.6, r: 0.15 }, lfo: { rate: 5.5, depth: 0.08, target: 'pitch' } }) },
  'Trance Lead': { cat: 'Lead', p: P({ osc: [{ wave: 'sawtooth', voices: 5, spread: 22 }, { on: true, wave: 'square', oct: 1, level: 0.3 }], filter: { cutoff: 1800, res: 4, env: 5000 }, fenv: { a: 0.002, d: 0.25, s: 0.2, r: 0.2 }, amp: { a: 0.003, d: 0.2, s: 0.7, r: 0.25 } }) },
  'Fifth Lead': { cat: 'Lead', p: P({ osc: [{ wave: 'sawtooth', voices: 2, spread: 8 }, { on: true, wave: 'sawtooth', semi: 7, level: 0.6 }], filter: { cutoff: 2200, res: 3, env: 3000 }, amp: { a: 0.005, d: 0.25, s: 0.7, r: 0.2 } }) },
  'Chip Lead': { cat: 'Lead', p: P({ osc: [{ wave: 'square', level: 0.7 }], filter: { cutoff: 12000, res: 0.5, env: 0 }, amp: { a: 0.001, d: 0.1, s: 0.8, r: 0.05 }, lfo: { rate: 7, depth: 0.12, target: 'pitch' } }) },
  'Whistle': { cat: 'Lead', p: P({ osc: [{ wave: 'sine', level: 0.9 }, { on: true, wave: 'triangle', oct: 1, level: 0.15 }], filter: { cutoff: 8000, env: 0 }, amp: { a: 0.06, d: 0.2, s: 0.9, r: 0.2 }, lfo: { rate: 5, depth: 0.15, target: 'pitch' } }) },
  'Acid Lead': { cat: 'Lead', p: P({ osc: [{ wave: 'sawtooth' }], filter: { cutoff: 500, res: 14, env: 4000, drive: 2 }, fenv: { a: 0.002, d: 0.2, s: 0.1, r: 0.1 }, amp: { a: 0.002, d: 0.2, s: 0.7, r: 0.08 } }) },
  // Pads
  'Soft Pad': { cat: 'Pad', p: P({ osc: [{ wave: 'sawtooth', voices: 3, spread: 18 }, { on: true, wave: 'triangle', oct: 1, level: 0.4 }], filter: { cutoff: 900, res: 0.7, env: 700, key: 0.2 }, amp: { a: 0.45, d: 0.6, s: 0.85, r: 1.1 }, fenv: { a: 0.5, d: 1, s: 0.5, r: 1 } }) },
  'Warm Pad': { cat: 'Pad', p: P({ osc: [{ wave: 'sawtooth', voices: 5, spread: 25, level: 0.7 }, { on: true, wave: 'square', oct: -1, level: 0.25 }], filter: { cutoff: 1200, res: 0.8, env: 400 }, amp: { a: 0.8, d: 1, s: 0.9, r: 1.6 }, lfo: { rate: 0.3, depth: 0.25, target: 'filter' } }) },
  'Dream Pad': { cat: 'Pad', p: P({ osc: [{ wave: 'triangle', voices: 3, spread: 15 }, { on: true, wave: 'sawtooth', oct: 1, voices: 3, spread: 20, level: 0.3 }], filter: { cutoff: 2500, res: 1, env: 0 }, amp: { a: 1.2, d: 1, s: 0.9, r: 2.5 }, lfo: { rate: 0.2, depth: 0.4, target: 'filter' } }) },
  'Strings': { cat: 'Pad', p: P({ osc: [{ wave: 'sawtooth', voices: 4, spread: 20, level: 0.8 }], filter: { cutoff: 2200, res: 0.5, env: 300 }, amp: { a: 0.25, d: 0.4, s: 0.9, r: 0.6 }, lfo: { rate: 5, depth: 0.05, target: 'pitch' } }) },
  'Choir Pad': { cat: 'Pad', p: P({ osc: [{ wave: 'sawtooth', voices: 4, spread: 16 }], filter: { type: 'bandpass', cutoff: 900, res: 2.5, env: 300, key: 0.5 }, amp: { a: 0.5, d: 0.5, s: 0.9, r: 1.2 }, lfo: { rate: 4.5, depth: 0.06, target: 'pitch' }, gain: 0.9 }) },
  // Basses
  'Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'sawtooth' }, { on: true, wave: 'square', oct: -1, level: 0.6 }], filter: { cutoff: 320, res: 6, env: 1400, key: 0 }, amp: { a: 0.003, d: 0.18, s: 0.55, r: 0.1 }, fenv: { a: 0.002, d: 0.2, s: 0.2, r: 0.1 } }) },
  '808 Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'sine', level: 1 }, { on: true, wave: 'triangle', level: 0.15 }], filter: { cutoff: 6000, env: 0, key: 0, drive: 2.5 }, amp: { a: 0.003, d: 1.4, s: 0.45, r: 0.25 }, penv: { amt: 7, time: 0.06 }, gain: 0.9 }) },
  'Sub Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'sine', level: 1 }], filter: { cutoff: 2000, env: 0, key: 0 }, amp: { a: 0.005, d: 0.1, s: 1, r: 0.12 }, gain: 0.9 }) },
  'Reese Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'sawtooth', voices: 2, spread: 22 }, { on: true, wave: 'sawtooth', oct: -1, voices: 2, spread: 30, level: 0.6 }], filter: { cutoff: 650, res: 2, env: 200, key: 0, drive: 1.5 }, amp: { a: 0.01, d: 0.2, s: 1, r: 0.15 }, lfo: { rate: 0.4, depth: 0.3, target: 'filter' } }) },
  'Wobble Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'sawtooth', voices: 2, spread: 12 }, { on: true, wave: 'square', oct: -1, level: 0.6 }], filter: { cutoff: 500, res: 8, env: 0, key: 0, drive: 2 }, amp: { a: 0.005, d: 0.1, s: 1, r: 0.1 }, lfo: { wave: 'sine', rate: 3, depth: 0.9, target: 'filter' } }) },
  'Pluck Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'square' }, { on: true, wave: 'sawtooth', oct: -1, level: 0.5 }], filter: { cutoff: 250, res: 4, env: 2500, key: 0 }, fenv: { a: 0.001, d: 0.12, s: 0, r: 0.1 }, amp: { a: 0.002, d: 0.3, s: 0.2, r: 0.1 } }) },
  '808 Slide': { cat: 'Bass', p: P({ osc: [{ wave: 'sine', level: 1 }, { on: true, wave: 'triangle', level: 0.12 }], filter: { cutoff: 6000, env: 0, key: 0, drive: 3 }, amp: { a: 0.003, d: 2, s: 0.7, r: 0.2 }, penv: { amt: 5, time: 0.04 }, gain: 0.9, mono: true, glide: 0.09 }) },
  'Mono Lead': { cat: 'Lead', p: P({ osc: [{ wave: 'sawtooth', voices: 3, spread: 14 }, { on: true, wave: 'square', oct: -1, level: 0.4 }], filter: { cutoff: 2600, res: 3, env: 2500 }, amp: { a: 0.005, d: 0.2, s: 0.8, r: 0.15 }, mono: true, glide: 0.06, lfo: { rate: 5.5, depth: 0.06, target: 'pitch' } }) },
  'FM Bell': { cat: 'Keys', p: P({ osc: [{ wave: 'sine' }, { on: true, wave: 'sine', semi: 7, oct: 1 }], fm: 0.5, filter: { cutoff: 12000, env: 0 }, fenv: { a: 0.001, d: 1.2, s: 0, r: 0.8 }, amp: { a: 0.001, d: 2.2, s: 0, r: 1.5 }, gain: 0.7 }) },
  'FM E-Piano': { cat: 'Keys', p: P({ osc: [{ wave: 'sine' }, { on: true, wave: 'sine', oct: 0 }], fm: 0.22, filter: { cutoff: 9000, env: 0 }, fenv: { a: 0.001, d: 0.6, s: 0.05, r: 0.4 }, amp: { a: 0.002, d: 1.6, s: 0.25, r: 0.4 }, gain: 0.7 }) },
  'FM Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'sine' }, { on: true, wave: 'sine', oct: 0 }], fm: 0.35, filter: { cutoff: 3000, env: 0, key: 0 }, fenv: { a: 0.001, d: 0.25, s: 0.15, r: 0.1 }, amp: { a: 0.002, d: 0.4, s: 0.7, r: 0.1 }, gain: 0.8 }) },
  'FM Growl': { cat: 'Bass', p: P({ osc: [{ wave: 'sawtooth' }, { on: true, wave: 'sine', oct: -1 }], fm: 0.6, filter: { cutoff: 900, res: 6, env: 0, key: 0, drive: 2 }, amp: { a: 0.005, d: 0.2, s: 1, r: 0.1 }, lfo: { rate: 2, depth: 0.7, target: 'filter' }, mono: true, glide: 0.05 }) },
  'Acid Bass': { cat: 'Bass', p: P({ osc: [{ wave: 'sawtooth' }], filter: { cutoff: 300, res: 16, env: 3000, key: 0, drive: 2.5 }, fenv: { a: 0.001, d: 0.18, s: 0.05, r: 0.1 }, amp: { a: 0.002, d: 0.2, s: 0.6, r: 0.06 } }) },
  // Keys
  'Electric Piano': { cat: 'Keys', p: P({ osc: [{ wave: 'sine', level: 1 }, { on: true, wave: 'sine', oct: 1, level: 0.25 }], filter: { cutoff: 5000, env: 2000 }, amp: { a: 0.003, d: 1.3, s: 0.2, r: 0.4 }, lfo: { rate: 4, depth: 0.15, target: 'amp' } }) },
  'Organ': { cat: 'Keys', p: P({ osc: [{ wave: 'sine', level: 0.8 }, { on: true, wave: 'sine', oct: 1, level: 0.5 }], sub: 0.4, filter: { cutoff: 8000, env: 0 }, amp: { a: 0.01, d: 0.1, s: 1, r: 0.08 }, lfo: { rate: 6, depth: 0.1, target: 'amp' } }) },
  'Bell': { cat: 'Keys', p: P({ osc: [{ wave: 'sine' }, { on: true, wave: 'sine', semi: 19, fine: 3, level: 0.35 }], filter: { cutoff: 9000, env: 0 }, amp: { a: 0.002, d: 1.8, s: 0, r: 1.2 } }) },
  'Music Box': { cat: 'Keys', p: P({ osc: [{ wave: 'sine', oct: 1 }, { on: true, wave: 'triangle', oct: 2, level: 0.2 }], filter: { cutoff: 9000, env: 0 }, amp: { a: 0.001, d: 0.9, s: 0, r: 0.6 } }) },
  'Synth Brass': { cat: 'Keys', p: P({ osc: [{ wave: 'sawtooth', voices: 3, spread: 10 }], filter: { cutoff: 600, res: 1, env: 3000 }, fenv: { a: 0.06, d: 0.4, s: 0.5, r: 0.3 }, amp: { a: 0.03, d: 0.3, s: 0.8, r: 0.25 } }) },
  'Clav': { cat: 'Keys', p: P({ osc: [{ wave: 'square', level: 0.7 }, { on: true, wave: 'sawtooth', oct: 1, level: 0.3 }], filter: { type: 'bandpass', cutoff: 1500, res: 2, env: 2500 }, fenv: { a: 0.001, d: 0.15, s: 0.1, r: 0.1 }, amp: { a: 0.001, d: 0.4, s: 0.2, r: 0.1 }, gain: 0.8 }) },
  // Plucks
  'Pluck': { cat: 'Pluck', p: P({ osc: [{ wave: 'sawtooth' }, { on: true, wave: 'square', fine: 6, level: 0.5 }], filter: { cutoff: 380, res: 3, env: 5000 }, fenv: { a: 0.001, d: 0.15, s: 0, r: 0.15 }, amp: { a: 0.002, d: 0.4, s: 0, r: 0.25 } }) },
  'Bright Pluck': { cat: 'Pluck', p: P({ osc: [{ wave: 'sawtooth', voices: 3, spread: 15 }], filter: { cutoff: 800, res: 2, env: 7000 }, fenv: { a: 0.001, d: 0.22, s: 0, r: 0.2 }, amp: { a: 0.001, d: 0.5, s: 0, r: 0.3 } }) },
  'Marimba': { cat: 'Pluck', p: P({ osc: [{ wave: 'sine' }, { on: true, wave: 'sine', semi: 24, level: 0.12 }], filter: { cutoff: 6000, env: 0 }, amp: { a: 0.001, d: 0.45, s: 0, r: 0.3 } }) },
  'Kalimba': { cat: 'Pluck', p: P({ osc: [{ wave: 'triangle' }, { on: true, wave: 'sine', oct: 2, level: 0.15 }], filter: { cutoff: 4000, env: 2000 }, fenv: { a: 0.001, d: 0.05, s: 0, r: 0.1 }, amp: { a: 0.001, d: 0.8, s: 0, r: 0.4 } }) },
  // FX
  'Laser': { cat: 'FX', p: P({ osc: [{ wave: 'square' }], filter: { cutoff: 4000, env: 0 }, penv: { amt: 24, time: 0.18 }, amp: { a: 0.001, d: 0.25, s: 0, r: 0.1 } }) },
  'Noise Sweep': { cat: 'FX', p: P({ osc: [{ on: false }], noise: 0.9, filter: { cutoff: 200, res: 6, env: 8000 }, fenv: { a: 1.5, d: 0.5, s: 0.6, r: 0.8 }, amp: { a: 0.5, d: 0.3, s: 0.8, r: 0.8 } }) },
  'Sci-Fi': { cat: 'FX', p: P({ osc: [{ wave: 'sine' }, { on: true, wave: 'square', oct: 1, level: 0.2 }], filter: { cutoff: 3000, env: 0 }, amp: { a: 0.01, d: 0.3, s: 0.8, r: 0.4 }, lfo: { wave: 'square', rate: 12, depth: 0.6, target: 'pitch' } }) },
};
function presetInst(name) {
  if (INSTRUMENTS[name]) return { kind: 'sampler', name };
  const pr = SYNTH_PRESETS[name] || SYNTH_PRESETS['Super Saw'];
  return { kind: 'synth', name: SYNTH_PRESETS[name] ? name : 'Super Saw', patch: JSON.parse(JSON.stringify(pr.p)) };
}

function adsr(param, t, base, peak, e, sus) {
  param.setValueAtTime(base, t);
  param.linearRampToValueAtTime(peak, t + Math.max(0.001, e.a));
  param.setTargetAtTime(sus, t + Math.max(0.001, e.a), Math.max(0.001, e.d) / 3);
}

function playPatch(ctx, dest, p, midi, t, dur, vel = 0.8, reg = noop) {
  const f0 = mtof(midi);
  const out = ctx.createGain();
  const peak = 0.22 * p.gain * vel;
  adsr(out.gain, t, 0, peak, p.amp, peak * p.amp.s);
  let amp = out;
  if (p.lfo.depth > 0 && p.lfo.target === 'amp') {
    const trem = ctx.createGain();
    trem.gain.value = 1 - p.lfo.depth * 0.5;
    trem.connect(out);
    amp = trem;
  }
  out.connect(dest);
  let head = amp;
  if (p.filter.drive) {
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(p.filter.drive);
    sh.connect(head);
    head = sh;
  }
  const fl = ctx.createBiquadFilter();
  fl.type = p.filter.type;
  fl.Q.value = p.filter.res;
  const kt = Math.pow(2, ((midi - 60) / 12) * p.filter.key);
  const cut = clampF(p.filter.cutoff * kt);
  adsr(fl.frequency, t, cut, clampF(cut + p.filter.env), p.fenv, clampF(cut + p.filter.env * p.fenv.s));
  fl.connect(head);
  const nodes = [];
  const lfo = p.lfo.depth > 0 ? ctx.createOscillator() : null;
  let lfoPitch = null;
  if (lfo) {
    lfo.type = p.lfo.wave;
    lfo.frequency.value = p.lfo.rate;
    const lg = ctx.createGain();
    if (p.lfo.target === 'pitch') { lg.gain.value = p.lfo.depth * 100; lfoPitch = lg; }
    else if (p.lfo.target === 'filter') { lg.gain.value = p.lfo.depth * cut * 0.9; lfo.connect(lg).connect(fl.frequency); }
    else { lg.gain.value = p.lfo.depth * 0.5; lfo.connect(lg).connect(amp.gain); }
    if (lfoPitch) lfo.connect(lfoPitch);
    lfo.start(t);
    nodes.push(lfo);
    reg(lfo);
  }
  const oscList = [];
  const mkOsc = (type, freq, detune, level, pan, dest2) => {
    const os = ctx.createOscillator();
    os.type = type;
    if (p.penv.amt) {
      os.frequency.setValueAtTime(freq * Math.pow(2, p.penv.amt / 12), t);
      os.frequency.exponentialRampToValueAtTime(freq, t + Math.max(0.005, p.penv.time));
    } else os.frequency.setValueAtTime(freq, t);
    os.detune.value = detune;
    if (lfoPitch) lfoPitch.connect(os.detune);
    oscList.push({ os, mult: freq / f0 });
    if (dest2) { os.connect(dest2); os.start(t); reg(os); nodes.push(os); return os; }
    const g = ctx.createGain();
    g.gain.value = level;
    os.connect(g);
    if (pan) {
      const pn = ctx.createStereoPanner();
      pn.pan.value = pan;
      g.connect(pn).connect(fl);
    } else g.connect(fl);
    os.start(t);
    reg(os);
    nodes.push(os);
    return os;
  };
  // FM: oscillator 2 becomes a modulator of oscillator 1's frequency
  const fmOn = p.fm > 0 && p.osc[1] && p.osc[1].on;
  let modGain = null;
  if (fmOn) {
    const o2 = p.osc[1];
    modGain = ctx.createGain();
    const depth = p.fm * f0 * 8;
    adsr(modGain.gain, t, depth * 0.25, depth, p.fenv, depth * (0.25 + 0.75 * p.fenv.s));
    mkOsc(o2.wave, f0 * Math.pow(2, o2.oct + o2.semi / 12), o2.fine, 1, 0, modGain);
  }
  for (const [oi, o] of p.osc.entries()) {
    if (!o.on || (fmOn && oi === 1)) continue;
    const fr = f0 * Math.pow(2, o.oct + o.semi / 12);
    const v = Math.max(1, Math.min(7, o.voices | 0));
    const lvl = o.level / Math.sqrt(v);
    for (let i = 0; i < v; i++) {
      const pos = v === 1 ? 0 : (i / (v - 1)) * 2 - 1;
      const os = mkOsc(o.wave, fr, o.fine + pos * o.spread, lvl, v > 1 ? pos * 0.6 : 0);
      if (fmOn && oi === 0) modGain.connect(os.frequency);
    }
  }
  if (p.sub > 0) mkOsc('square', f0 / 2, 0, p.sub * 0.6, 0);
  if (p.noise > 0) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf(ctx);
    n.loop = true;
    const g = ctx.createGain();
    g.gain.value = p.noise;
    n.connect(g).connect(fl);
    n.start(t, Math.random());
    reg(n);
    nodes.push(n);
  }
  const R = Math.max(0.01, p.amp.r);
  const end = (rt) => nodes.forEach((o) => { try { o.stop(rt + R * 2.5 + 0.05); } catch (e) {} });
  const release = (rt) => {
    if (out.gain.cancelAndHoldAtTime) { out.gain.cancelAndHoldAtTime(rt); fl.frequency.cancelAndHoldAtTime(rt); }
    out.gain.setTargetAtTime(0, rt, R / 3);
    fl.frequency.setTargetAtTime(cut, rt, Math.max(0.01, p.fenv.r) / 3);
    end(rt);
  };
  if (dur != null) {
    const rt = t + dur;
    out.gain.setTargetAtTime(0, rt, R / 3);
    fl.frequency.setTargetAtTime(cut, rt, Math.max(0.01, p.fenv.r) / 3);
    end(rt);
  }
  // legato slide to a new note (mono / 808 glides)
  const glide = (midi2, t2, dur2) => {
    const f2 = mtof(midi2), gt = Math.max(0.005, p.glide || 0.08);
    for (const { os, mult } of oscList) {
      os.frequency.cancelScheduledValues(t2);
      os.frequency.setTargetAtTime(f2 * mult, t2, gt / 3);
    }
    if (out.gain.cancelAndHoldAtTime) { out.gain.cancelAndHoldAtTime(t2); fl.frequency.cancelAndHoldAtTime(t2); }
    const rt = t2 + dur2;
    out.gain.setTargetAtTime(0, rt, R / 3);
    fl.frequency.setTargetAtTime(cut, rt, Math.max(0.01, p.fenv.r) / 3);
    end(rt);
  };
  return { release, glide };
}
function clampF(f) { return Math.max(20, Math.min(20000, f)); }

// Back-compat helper used by older code paths
function playNote(ctx, dest, name, midi, t, dur, vel = 0.8, reg = noop) {
  return playInstrument(ctx, dest, presetInst(name), midi, t, dur, vel, reg);
}
