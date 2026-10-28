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
];

function playDrum(ctx, dest, kind, t, vel = 1, sample = null, reg = noop) {
  if (sample) {
    const s = ctx.createBufferSource();
    s.buffer = sample;
    const g = ctx.createGain();
    g.gain.value = vel;
    s.connect(g).connect(dest);
    s.start(t);
    reg(s);
    return;
  }
  switch (kind) {
    case 'kick': {
      const o = osc(ctx, 'sine', 160, t, t + 0.6, reg);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      o.connect(envGain(ctx, t, vel, 0.5)).connect(dest);
      const c = noise(ctx, t, 0.02, reg);
      c.connect(filter(ctx, 'highpass', 2000)).connect(envGain(ctx, t, vel * 0.25, 0.012)).connect(dest);
      break;
    }
    case 'snare': {
      const n = noise(ctx, t, 0.3, reg);
      n.connect(filter(ctx, 'highpass', 1200)).connect(envGain(ctx, t, vel * 0.6, 0.22)).connect(dest);
      const o = osc(ctx, 'triangle', 230, t, t + 0.2, reg);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
      o.connect(envGain(ctx, t, vel * 0.6, 0.11)).connect(dest);
      break;
    }
    case 'clap': {
      const n = noise(ctx, t, 0.4, reg);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (let i = 0; i < 3; i++) {
        const tt = t + i * 0.011;
        g.gain.setValueAtTime(vel * 0.8, tt);
        g.gain.exponentialRampToValueAtTime(vel * 0.08 + 0.0001, tt + 0.01);
      }
      g.gain.setValueAtTime(vel * 0.7, t + 0.034);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      n.connect(filter(ctx, 'bandpass', 1300, 1.1)).connect(g).connect(dest);
      break;
    }
    case 'hat':
    case 'ohat': {
      const dec = kind === 'hat' ? 0.05 : 0.32;
      const n = noise(ctx, t, dec + 0.05, reg);
      n.connect(filter(ctx, 'highpass', 7500)).connect(envGain(ctx, t, vel * 0.35, dec)).connect(dest);
      break;
    }
    case 'tom': {
      const o = osc(ctx, 'sine', 210, t, t + 0.45, reg);
      o.frequency.exponentialRampToValueAtTime(105, t + 0.25);
      o.connect(envGain(ctx, t, vel * 0.8, 0.38)).connect(dest);
      break;
    }
    case 'rim': {
      const o = osc(ctx, 'triangle', 1700, t, t + 0.05, reg);
      o.connect(envGain(ctx, t, vel * 0.5, 0.03)).connect(dest);
      const n = noise(ctx, t, 0.03, reg);
      n.connect(filter(ctx, 'bandpass', 3200, 2)).connect(envGain(ctx, t, vel * 0.4, 0.02)).connect(dest);
      break;
    }
    case 'cowbell': {
      const bp = filter(ctx, 'bandpass', 800, 1.5);
      const g = envGain(ctx, t, vel * 0.35, 0.35);
      osc(ctx, 'square', 545, t, t + 0.4, reg).connect(bp);
      osc(ctx, 'square', 815, t, t + 0.4, reg).connect(bp);
      bp.connect(g).connect(dest);
      break;
    }
    case '808': {
      const o = osc(ctx, 'sine', 75, t, t + 1.4, reg);
      o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
      const sh = ctx.createWaveShaper();
      sh.curve = driveCurve(2);
      o.connect(sh).connect(envGain(ctx, t, vel * 0.9, 1.25, 0.003)).connect(dest);
      break;
    }
  }
}

// Synth instruments. osc: t=type, d=detune cents, o=semitone offset, g=gain
const SYNTHS = {
  'Super Saw': { osc: [{ t: 'sawtooth', d: -14 }, { t: 'sawtooth', d: 14 }, { t: 'sawtooth', o: -12, g: 0.6 }], f: { freq: 2400, q: 1, env: 3000 }, a: [0.01, 0.3, 0.7, 0.35], g: 0.12 },
  'Square Lead': { osc: [{ t: 'square', d: -6 }, { t: 'square', d: 6 }], f: { freq: 2800, q: 2, env: 1500 }, a: [0.005, 0.2, 0.6, 0.15], g: 0.09 },
  'Soft Pad': { osc: [{ t: 'sawtooth', d: -9 }, { t: 'sawtooth', d: 9 }, { t: 'triangle', o: 12, g: 0.5 }], f: { freq: 900, q: 0.7, env: 700 }, a: [0.45, 0.6, 0.85, 1.1], g: 0.1 },
  'Strings': { osc: [{ t: 'sawtooth', d: -11 }, { t: 'sawtooth', d: 11 }, { t: 'sawtooth', d: 0, g: 0.6 }], f: { freq: 2200, q: 0.5, env: 0 }, a: [0.25, 0.4, 0.9, 0.6], g: 0.08 },
  'Bass': { osc: [{ t: 'sawtooth' }, { t: 'square', o: -12, g: 0.6 }], f: { freq: 320, q: 6, env: 1400 }, a: [0.003, 0.18, 0.55, 0.1], g: 0.2 },
  '808 Bass': { osc: [{ t: 'sine' }, { t: 'triangle', g: 0.15 }], a: [0.003, 1.4, 0.45, 0.25], g: 0.42, drive: 2.5, glide: 7 },
  'Electric Piano': { osc: [{ t: 'sine' }, { t: 'sine', o: 12, g: 0.25 }, { t: 'triangle', o: 24, g: 0.05 }], a: [0.003, 1.3, 0.2, 0.4], g: 0.26 },
  'Pluck': { osc: [{ t: 'sawtooth', d: -6 }, { t: 'square', d: 6, g: 0.5 }], f: { freq: 380, q: 3, env: 5000, decay: 0.15 }, a: [0.002, 0.4, 0, 0.25], g: 0.14 },
  'Organ': { osc: [{ t: 'sine' }, { t: 'sine', o: 12, g: 0.5 }, { t: 'sine', o: 19, g: 0.3 }, { t: 'sine', o: 24, g: 0.25 }], a: [0.01, 0.1, 1, 0.08], g: 0.12 },
  'Bell': { osc: [{ t: 'sine' }, { t: 'sine', o: 19, d: 3, g: 0.35 }, { t: 'sine', o: 28, g: 0.15 }], a: [0.002, 1.8, 0, 1.2], g: 0.2 },
};

function playNote(ctx, dest, name, midi, t, dur, vel = 0.8, reg = noop) {
  const p = SYNTHS[name] || SYNTHS['Super Saw'];
  const [A, D, S, R] = p.a;
  const f0 = mtof(midi);
  const out = ctx.createGain();
  const peak = p.g * vel;
  out.gain.setValueAtTime(0, t);
  out.gain.linearRampToValueAtTime(peak, t + A);
  out.gain.setTargetAtTime(Math.max(peak * S, 0), t + A, D / 3 + 0.001);
  out.connect(dest);
  let head = out;
  if (p.drive) {
    const sh = ctx.createWaveShaper();
    sh.curve = driveCurve(p.drive);
    sh.connect(head);
    head = sh;
  }
  if (p.f) {
    const fl = ctx.createBiquadFilter();
    fl.type = 'lowpass';
    fl.Q.value = p.f.q || 0.7;
    fl.frequency.setValueAtTime(Math.min(p.f.freq + (p.f.env || 0), 18000), t);
    fl.frequency.setTargetAtTime(p.f.freq, t, (p.f.decay || D) / 3 + 0.001);
    fl.connect(head);
    head = fl;
  }
  const oscs = p.osc.map((o) => {
    const os = ctx.createOscillator();
    os.type = o.t;
    const fr = f0 * Math.pow(2, (o.o || 0) / 12);
    if (p.glide) {
      os.frequency.setValueAtTime(fr * Math.pow(2, p.glide / 12), t);
      os.frequency.exponentialRampToValueAtTime(fr, t + 0.06);
    } else os.frequency.setValueAtTime(fr, t);
    os.detune.value = o.d || 0;
    const g = ctx.createGain();
    g.gain.value = o.g ?? 1;
    os.connect(g).connect(head);
    os.start(t);
    reg(os);
    return os;
  });
  const release = (rt) => {
    if (out.gain.cancelAndHoldAtTime) out.gain.cancelAndHoldAtTime(rt);
    out.gain.setTargetAtTime(0, rt, R / 3 + 0.001);
    oscs.forEach((o) => { try { o.stop(rt + R * 2 + 0.05); } catch (e) {} });
  };
  if (dur != null) {
    const rt = t + dur;
    out.gain.setTargetAtTime(0, rt, R / 3 + 0.001);
    oscs.forEach((o) => o.stop(rt + R * 2 + 0.05));
  }
  return { release };
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
