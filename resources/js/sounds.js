// Built-in sounds: synthesized drum kit, synth instruments, helpers.

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = {
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Minor': [0, 2, 3, 5, 7, 8, 10],
  'Harmonic Minor': [0, 2, 3, 5, 7, 8, 11],
  'Pentatonic Major': [0, 2, 4, 7, 9],
  'Pentatonic Minor': [0, 3, 5, 7, 10],
  'Blues': [0, 3, 5, 6, 7, 10],
  'Dorian': [0, 2, 3, 5, 7, 9, 10],
  'Mixolydian': [0, 2, 4, 5, 7, 9, 10],
  'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
function scaleMask(key, scale) {
  const m = new Array(12).fill(0);
  (SCALES[scale] || SCALES.Chromatic).forEach((i) => (m[(i + key) % 12] = 1));
  return m;
}
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const ftom = (f) => 69 + 12 * Math.log2(f / 440);
function noteName(m) {
  m = Math.round(m);
  return NOTE_NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
}
const noop = () => {};

const _noise = new WeakMap();
function noiseBuf(ctx) {
  let b = _noise.get(ctx);
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    _noise.set(ctx, b);
  }
  return b;
}
function noise(ctx, t, dur, reg) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  s.start(t, Math.random(), dur);
  reg(s);
  return s;
}
function envGain(ctx, t, peak, decay, attack = 0.001) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  return g;
}
function filter(ctx, type, freq, q = 0.7) {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  return f;
}
function osc(ctx, type, freq, t, stop, reg) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.start(t);
  o.stop(stop);
  reg(o);
  return o;
}
const _curves = {};
function driveCurve(amount) {
  if (_curves[amount]) return _curves[amount];
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return (_curves[amount] = c);
}

const DRUM_KIT = [
  { id: 'kick', name: 'Kick' },
  { id: 'snare', name: 'Snare' },
  { id: 'clap', name: 'Clap' },
  { id: 'hat', name: 'Closed Hat' },
  { id: 'ohat', name: 'Open Hat' },
  { id: 'tom', name: 'Tom' },
  { id: 'rim', name: 'Rim' },
  { id: 'cowbell', name: 'Cowbell' },
  { id: '808', name: '808 Boom' },
  { id: 'crash', name: 'Crash' },
  { id: 'shaker', name: 'Shaker' },
  { id: 'perc', name: 'Perc' },
];

// Drum kits: each kind is described by a small recipe. Kits change the recipe numbers.
const DRUM_KITS = {
  'Classic': {},
  '808': {
    kick: { f0: 120, f1: 48, sweep: 0.06, dec: 0.9, click: 0.05, drive: 1.2 },
    snare: { tone: [180, 330], tdec: 0.12, ndec: 0.18, hp: 1800, nl: 0.55 },
    hat: { metal: 1, dec: 0.045 }, ohat: { metal: 1, dec: 0.45 },
    tom: { f0: 170, f1: 120, dec: 0.5 }, clap: { bp: 1100, dec: 0.32 },
  },
  '909': {
    kick: { f0: 220, f1: 50, sweep: 0.035, dec: 0.38, click: 0.45, drive: 2.2 },
    snare: { tone: [190, 345], tdec: 0.09, ndec: 0.26, hp: 2200, nl: 0.8 },
    hat: { metal: 0.6, dec: 0.06 }, ohat: { metal: 0.6, dec: 0.38 },
    clap: { bp: 1600, dec: 0.28 },
  },
  'Trap': {
    kick: { f0: 150, f1: 46, sweep: 0.05, dec: 0.7, click: 0.3, drive: 3 },
    snare: { tone: [240], tdec: 0.06, ndec: 0.14, hp: 2500, nl: 0.9, clap: 0.6 },
    hat: { metal: 0.8, dec: 0.028 }, ohat: { metal: 0.8, dec: 0.26 },
    '808': { f0: 90, f1: 45, sweep: 0.12, dec: 2.0, drive: 3 },
    clap: { bp: 1400, dec: 0.24 },
  },
  'Lo-fi': {
    lofi: 2600,
    kick: { f0: 130, f1: 45, sweep: 0.09, dec: 0.4, click: 0.1, drive: 1.5 },
    snare: { tone: [200], tdec: 0.1, ndec: 0.2, hp: 900, nl: 0.5 },
    hat: { metal: 0, dec: 0.04 }, ohat: { metal: 0, dec: 0.22 },
  },
  'House': {
    kick: { f0: 170, f1: 52, sweep: 0.045, dec: 0.45, click: 0.35, drive: 1.8 },
    snare: { tone: [200, 300], tdec: 0.08, ndec: 0.22, hp: 1500, nl: 0.7 },
    hat: { metal: 0.5, dec: 0.05 }, ohat: { metal: 0.5, dec: 0.3 },
    clap: { bp: 1300, dec: 0.35 },
  },
};
const DEF_RECIPE = {
  kick: { f0: 160, f1: 42, sweep: 0.12, dec: 0.5, click: 0.25, drive: 0 },
  snare: { tone: [230], tdec: 0.11, ndec: 0.22, hp: 1200, nl: 0.6 },
  hat: { metal: 0, dec: 0.05 }, ohat: { metal: 0, dec: 0.32 },
  tom: { f0: 210, f1: 105, dec: 0.38 }, clap: { bp: 1300, dec: 0.3 },
  '808': { f0: 75, f1: 48, sweep: 0.09, dec: 1.25, drive: 2 },
};
const METAL_F = [205.3, 304.4, 369.6, 522.7, 540, 800];

// Every voice goes through one output gain that disconnects itself once all its sound sources have
// finished — otherwise finished notes stay in the audio graph and the app slows down over time.
function voiceOut(ctx, dest, reg) {
  const out = ctx.createGain();
  out.connect(dest);
  let n = 0;
  const r = (s) => {
    n++;
    s.addEventListener('ended', () => { if (--n === 0) { try { out.disconnect(); } catch (e) {} } });
    reg(s);
  };
  return { out, reg: r };
}

// Synthesized drum hits are rendered once per kit/sound/pitch and then played from memory (much less CPU).
const DrumCache = {
  map: new Map(),
  pending: new Map(),
  key: (kit, kind, pitch) => kit + '|' + kind + '|' + pitch,
  get(kit, kind, pitch) { return this.map.get(this.key(kit, kind, pitch)); },
  ensure(kit, kind, pitch) {
    const k = this.key(kit, kind, pitch);
    if (this.map.has(k)) return Promise.resolve(this.map.get(k));
    if (this.pending.has(k)) return this.pending.get(k);
    const sr = 44100, len = kind === '808' ? 2.6 : kind === 'crash' ? 2.2 : kind === 'kick' ? 1.1 : 0.8;
    const ctx = new OfflineAudioContext(1, Math.ceil(sr * len), sr);
    playDrum(ctx, ctx.destination, kind, 0, 1, null, noop, kit, pitch, true);
    const p = ctx.startRendering().then((b) => { this.map.set(k, b); this.pending.delete(k); return b; });
    this.pending.set(k, p);
    return p;
  },
  warm(P) {
    const ps = [];
    for (const t of P.tracks) if (t.type === 'drums') for (const ch of t.channels) if (!ch.sample) ps.push(this.ensure(t.kit || 'Classic', ch.kind, ch.pitch || 0));
    return Promise.all(ps);
  },
};

function playDrum(ctx, dest, kind, t, vel = 1, sample = null, reg = noop, kit = 'Classic', pitch = 0, raw = false) {
  { const V = voiceOut(ctx, dest, reg); dest = V.out; reg = V.reg; }
  if (!sample && !raw) {
    const cb = DrumCache.get(kit, kind, pitch);
    if (cb) {
      const s = ctx.createBufferSource();
      s.buffer = cb;
      const g = ctx.createGain();
      g.gain.value = vel;
      s.connect(g).connect(dest);
      s.start(t);
      reg(s);
      return;
    }
    DrumCache.ensure(kit, kind, pitch);
  }
  if (sample) {
    const s = ctx.createBufferSource();
    s.buffer = sample;
    if (pitch) s.playbackRate.value = Math.pow(2, pitch / 12);
    const g = ctx.createGain();
    g.gain.value = vel;
    s.connect(g).connect(dest);
    s.start(t);
    reg(s);
    return;
  }
  const K = DRUM_KITS[kit] || {};
  const R = (k) => Object.assign({}, DEF_RECIPE[k] || {}, K[k] || {});
  const pr = Math.pow(2, pitch / 12);
  if (K.lofi) {
    const lp = filter(ctx, 'lowpass', K.lofi, 0.5);
    lp.connect(dest);
    dest = lp;
  }
  const shaped = (amount) => {
    if (!amount) return dest;
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(amount);
    sh.connect(dest);
    return sh;
  };
  const metal = (dec, amt, lvl) => {
    const bp = filter(ctx, 'bandpass', 10000, 0.8), hp = filter(ctx, 'highpass', 7000);
    const g = envGain(ctx, t, vel * lvl, dec);
    METAL_F.forEach((f) => osc(ctx, 'square', f * 1.0 * pr, t, t + dec + 0.1, reg).connect(bp));
    const mg = ctx.createGain(); mg.gain.value = amt * 0.6;
    bp.connect(hp).connect(mg).connect(g);
    const n = noise(ctx, t, dec + 0.05, reg);
    const ng = ctx.createGain(); ng.gain.value = 1 - amt * 0.6;
    n.connect(filter(ctx, 'highpass', 7500)).connect(ng).connect(g);
    g.connect(dest);
  };
  switch (kind) {
    case 'kick': {
      const r = R('kick');
      const o = osc(ctx, 'sine', r.f0 * pr, t, t + r.dec + 0.1, reg);
      o.frequency.exponentialRampToValueAtTime(r.f1 * pr, t + r.sweep);
      o.connect(envGain(ctx, t, vel, r.dec)).connect(shaped(r.drive));
      if (r.click) {
        const c = noise(ctx, t, 0.02, reg);
        c.connect(filter(ctx, 'highpass', 2500)).connect(envGain(ctx, t, vel * r.click, 0.01)).connect(dest);
      }
      break;
    }
    case 'snare': {
      const r = R('snare');
      const n = noise(ctx, t, r.ndec + 0.08, reg);
      n.connect(filter(ctx, 'highpass', r.hp)).connect(envGain(ctx, t, vel * r.nl, r.ndec)).connect(dest);
      r.tone.forEach((f, i) => {
        const o = osc(ctx, 'triangle', f * pr, t, t + r.tdec + 0.1, reg);
        o.frequency.exponentialRampToValueAtTime(f * 0.7 * pr, t + 0.08);
        o.connect(envGain(ctx, t, (vel * 0.6) / (i + 1), r.tdec)).connect(dest);
      });
      if (r.clap) playDrum(ctx, dest, 'clap', t, vel * r.clap, null, reg, kit, pitch);
      break;
    }
    case 'clap': {
      const r = R('clap');
      const n = noise(ctx, t, r.dec + 0.1, reg);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.011;
        g.gain.setValueAtTime(vel * 0.8, tt);
        g.gain.exponentialRampToValueAtTime(vel * 0.08 + 0.0001, tt + 0.01);
      }
      g.gain.setValueAtTime(vel * 0.7, t + 0.034);
      g.gain.exponentialRampToValueAtTime(0.0001, t + r.dec);
      n.connect(filter(ctx, 'bandpass', r.bp * pr, 1.1)).connect(g).connect(dest);
      break;
    }
    case 'hat':
    case 'ohat': {
      const r = R(kind);
      metal(r.dec, r.metal, kind === 'hat' ? 0.38 : 0.32);
      break;
    }
    case 'crash': {
      const dec = 1.6;
      const n = noise(ctx, t, dec + 0.1, reg);
      n.connect(filter(ctx, 'highpass', 4500)).connect(envGain(ctx, t, vel * 0.3, dec, 0.002)).connect(dest);
      metal(dec * 0.7, 0.5, 0.15);
      break;
    }
    case 'shaker': {
      const n = noise(ctx, t, 0.12, reg);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * 0.25, t + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      n.connect(filter(ctx, 'bandpass', 6500, 1.5)).connect(g).connect(dest);
      break;
    }
    case 'perc': {
      const o = osc(ctx, 'sine', 620 * pr, t, t + 0.25, reg);
      o.frequency.exponentialRampToValueAtTime(380 * pr, t + 0.08);
      o.connect(envGain(ctx, t, vel * 0.55, 0.18)).connect(dest);
      break;
    }
    case 'tom': {
      const r = R('tom');
      const o = osc(ctx, 'sine', r.f0 * pr, t, t + r.dec + 0.1, reg);
      o.frequency.exponentialRampToValueAtTime(r.f1 * pr, t + r.dec * 0.6);
      o.connect(envGain(ctx, t, vel * 0.8, r.dec)).connect(dest);
      break;
    }
    case 'rim': {
      const o = osc(ctx, 'triangle', 1700 * pr, t, t + 0.05, reg);
      o.connect(envGain(ctx, t, vel * 0.5, 0.03)).connect(dest);
      const n = noise(ctx, t, 0.03, reg);
      n.connect(filter(ctx, 'bandpass', 3200, 2)).connect(envGain(ctx, t, vel * 0.4, 0.02)).connect(dest);
      break;
    }
    case 'cowbell': {
      const bp = filter(ctx, 'bandpass', 800 * pr, 1.5);
      const g = envGain(ctx, t, vel * 0.35, 0.35);
      osc(ctx, 'square', 545 * pr, t, t + 0.4, reg).connect(bp);
      osc(ctx, 'square', 815 * pr, t, t + 0.4, reg).connect(bp);
      bp.connect(g).connect(dest);
      break;
    }
    case '808': {
      const r = R('808');
      const o = osc(ctx, 'sine', r.f0 * pr, t, t + r.dec + 0.2, reg);
      o.frequency.exponentialRampToValueAtTime(r.f1 * pr, t + r.sweep);
      o.connect(envGain(ctx, t, vel * 0.9, r.dec, 0.003)).connect(shaped(r.drive));
      break;
    }
  }
}

// ---- Sampler: real recorded instruments ----
function parseNote(n) {
  const m = /^([A-G])(s?)(-?\d)$/.exec(n);
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
  return (+m[3] + 1) * 12 + pc;
}
const Sampler = {
  cache: new Map(),
  load(name, ctx) {
    const inst = INSTRUMENTS[name];
    if (!inst) return Promise.resolve(null);
    if (this.cache.has(name)) return this.cache.get(name).promise;
    const entry = { list: [] };
    entry.promise = Promise.all(inst.notes.map(async (n) => {
      const r = await fetch(`samples/${inst.dir}/${n}.mp3`);
      const buf = await ctx.decodeAudioData(await r.arrayBuffer());
      entry.list.push({ midi: parseNote(n), buf });
    })).then(() => { entry.list.sort((a, b) => a.midi - b.midi); entry.ready = true; return entry; });
    this.cache.set(name, entry);
    return entry.promise;
  },
  ready(name) { return !!this.cache.get(name)?.ready; },
  play(ctx, dest, name, midi, t, dur, vel = 0.8, reg = noop) {
    { const V = voiceOut(ctx, dest, reg); dest = V.out; reg = V.reg; }
    const inst = INSTRUMENTS[name], e = this.cache.get(name);
    if (!inst || !e || !e.ready) return { release: noop };
    let best = e.list[0];
    for (const s of e.list) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    const src = ctx.createBufferSource();
    src.buffer = best.buf;
    src.playbackRate.value = Math.pow(2, (midi - best.midi) / 12);
    const g = ctx.createGain();
    const peak = 0.9 * Math.pow(vel, 1.4);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + inst.att);
    let head = g;
    if (inst.bright) {
      const lp = filter(ctx, 'lowpass', 1200 + vel * vel * 16000, 0.5);
      lp.connect(g);
      head = lp;
    }
    src.connect(head);
    g.connect(dest);
    src.start(t);
    reg(src);
    const release = (rt) => {
      if (g.gain.cancelAndHoldAtTime) g.gain.cancelAndHoldAtTime(rt);
      g.gain.setTargetAtTime(0, rt, inst.rel / 3);
      try { src.stop(rt + inst.rel * 2 + 0.05); } catch (e) {}
    };
    if (dur != null) {
      g.gain.setTargetAtTime(0, t + dur, inst.rel / 3);
      src.stop(t + dur + inst.rel * 2 + 0.05);
    }
    return { release };
  },
};

// Play any instrument (sampler or synth patch)
function playInstrument(ctx, dest, inst, midi, t, dur, vel = 0.8, reg = noop) {
  if (!inst) return { release: noop };
  if (inst.kind === 'sampler') return Sampler.play(ctx, dest, inst.name, midi, t, dur, vel, reg);
  if (inst.kind === 'sample') return playSample(ctx, dest, inst, midi, t, dur, vel, reg);
  return playPatch(ctx, dest, inst.patch, midi, t, dur, vel, reg);
}

function playClick(ctx, dest, t, accent) {
  const o = ctx.createOscillator();
  o.frequency.value = accent ? 1760 : 1100;
  const g = envGain(ctx, t, accent ? 0.35 : 0.2, 0.04);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + 0.06);
}

function makeImpulse(ctx, seconds = 2.6, decay = 3) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

// ---- WAV / base64 helpers ----
function encodeWAV(buffer) {
  const nch = buffer.numberOfChannels, sr = buffer.sampleRate, len = buffer.length;
  const ab = new ArrayBuffer(44 + len * nch * 2);
  const v = new DataView(ab);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + len * nch * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nch * 2, true); v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, len * nch * 2, true);
  const chans = [];
  for (let c = 0; c < nch; c++) chans.push(buffer.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return ab;
}
function abToBase64(ab) {
  const bytes = new Uint8Array(ab);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function base64ToAb(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes.buffer;
}
function computePeaks(buffer, per = 256) {
  const d = buffer.getChannelData(0);
  const n = Math.ceil(d.length / per);
  const p = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let m = 0;
    const end = Math.min(d.length, (i + 1) * per);
    for (let j = i * per; j < end; j++) { const a = Math.abs(d[j]); if (a > m) m = a; }
    p[i] = m;
  }
  return p;
}
