// Audio worklet processors:
//  - 'autotune': pitch detection (YIN) + formant-preserving PSOLA pitch correction, voice character (formant),
//    pitch shift, harmonizer voices, robot vocoder, and an "edit" mode driven by the graphical pitch editor.
//  - 'recorder': captures microphone audio.
//  - 'crusher': bit/sample-rate reduction for the Lo-fi effect.

const AT_LATENCY = 0.025;

class AutoTuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    const k = (name, def, min, max) => ({ name, defaultValue: def, minValue: min, maxValue: max, automationRate: 'k-rate' });
    return [k('bypass', 1, 0, 1), k('speed', 0, 0, 1), k('amount', 1, 0, 1), k('robot', 0, 0, 1), k('harmony', 0, 0, 1),
      k('formant', 0, -12, 12), k('shift', 0, -24, 24), k('harmMix', 0.6, 0, 1)];
  }

  constructor(options) {
    super();
    const po = (options && options.processorOptions) || {};
    this.mask = po.mask || [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
    this.edit = po.edit || null; // { fps, ratio: Float32Array, hz: Float32Array }
    this.report = false;
    this.N = 32768;
    this.ring = new Float32Array(this.N);
    this.lpRing = new Float32Array(this.N);
    this.lp = 0;
    this.lpA = 1 - Math.exp((-2 * Math.PI * 500) / sampleRate);
    this.n = 0;
    this.L = Math.round(sampleRate * AT_LATENCY);
    this.M = 8192;
    this.dec = new Float32Array(1024);
    this.yin = new Float32Array(512);
    this.hop = 256;
    this.hc = 0;
    this.T = sampleRate * 0.006;
    this.voiced = false;
    this.target = 1;
    this.ratio = 1;
    this.best = 60;
    this.lastF = 0;
    this.lastT = 0;
    this.rc = 0;
    this.marks = [];
    this.am = 0;
    this.voices = [this.mkVoice(0, 1, 0)];
    this.setHarm(po.harm || []);
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.mask) this.mask = d.mask;
      if ('report' in d) this.report = d.report;
      if (d.harm) this.setHarm(d.harm);
    };
    this.initVocoder();
  }

  mkVoice(deg, gain, pan) {
    return { deg, gain, pan, next: this.L, acc: new Float32Array(this.M), ws: new Float32Array(this.M), ratio: 1, g: deg ? 0 : 1, iv: 0 };
  }
  setHarm(list) {
    this.voices = [this.voices[0]].concat(list.slice(0, 3).map((h) => this.mkVoice(h.deg, h.gain ?? 0.7, h.pan ?? 0)));
  }

  // ---------- pitch detection ----------
  detect() {
    const N = this.N, ring = this.ring, x = this.dec;
    let idx = (((this.n - 2048) % N) + N) % N;
    for (let i = 0; i < 1024; i++) {
      const a = ring[idx]; idx = (idx + 1) % N;
      const b = ring[idx]; idx = (idx + 1) % N;
      x[i] = (a + b) * 0.5;
    }
    let e = 0;
    for (let i = 0; i < 1024; i++) e += x[i] * x[i];
    if (e < 1024 * 1.5e-5) return 0;
    const sr2 = sampleRate / 2, half = 512;
    const tmin = Math.max(2, Math.floor(sr2 / 1100));
    const tmax = Math.min(half - 1, Math.floor(sr2 / 65));
    const d = this.yin;
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= tmax; tau++) {
      let s = 0;
      for (let i = 0; i < half; i++) { const v = x[i] - x[i + tau]; s += v * v; }
      run += s;
      d[tau] = run > 0 ? (s * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tmin; t <= tmax; t++) {
      if (d[t] < 0.18) {
        while (t + 1 <= tmax && d[t + 1] < d[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return 0;
    let bt = tau;
    if (tau > 1 && tau < tmax) {
      const a = d[tau - 1], b = d[tau], c = d[tau + 1];
      const den = a + c - 2 * b;
      if (Math.abs(den) > 1e-9) bt = tau + (0.5 * (a - c)) / den;
    }
    return sr2 / bt;
  }

  snap(m) {
    let best = Math.round(m), bd = 99;
    for (let k = Math.floor(m) - 6; k <= Math.ceil(m) + 6; k++) {
      if (this.mask[((k % 12) + 12) % 12]) {
        const dd = Math.abs(k - m);
        if (dd < bd) { bd = dd; best = k; }
      }
    }
    return best;
  }
  scaleInterval(root, deg) {
    let k = root, c = 0;
    const s = Math.sign(deg);
    while (c < Math.abs(deg) && Math.abs(k - root) < 24) {
      k += s;
      if (this.mask[((k % 12) + 12) % 12]) c++;
    }
    return k - root;
  }

  analyze(amount) {
    let f, desired;
    if (this.edit) {
      const fr = Math.min(this.edit.hz.length - 1, Math.floor((this.n / sampleRate) * this.edit.fps));
      f = fr >= 0 ? this.edit.hz[fr] : 0;
      this.target = fr >= 0 && f > 0 ? this.edit.ratio[fr] : 1;
      if (f > 0) desired = 69 + 12 * Math.log2((f * this.target) / 440);
    } else {
      f = this.detect();
      if (f > 0) {
        const m = 69 + 12 * Math.log2(f / 440);
        const best = this.snap(m);
        this.target = Math.pow(2, (amount * (best - m)) / 12);
        desired = m + amount * (best - m);
      } else this.target = 1;
    }
    if (f > 0) {
      this.voiced = true;
      this.T = Math.min(sampleRate / 70, sampleRate / f);
      this.best = Math.round(desired);
      for (const v of this.voices) if (v.deg) v.iv = this.scaleInterval(this.best, v.deg);
      this.lastF = f;
      this.lastT = 440 * Math.pow(2, (desired - 69) / 12);
    } else {
      this.voiced = false;
      this.T = sampleRate * 0.006;
      this.lastF = 0;
      this.lastT = 0;
    }
    if (this.report && ++this.rc >= 6) {
      this.rc = 0;
      this.port.postMessage({ f: this.lastF, t: this.lastT });
    }
  }

  readAbs(p) {
    const i = Math.floor(p), fr = p - i, N = this.N;
    const a = this.ring[((i % N) + N) % N], b = this.ring[(((i + 1) % N) + N) % N];
    return a + (b - a) * fr;
  }

  // ---------- PSOLA grain synthesis ----------
  addGrain(v, F, o) {
    const c = v.next, marks = this.marks, lim = this.n - 1;
    let mk = null, bd = 1e12;
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i];
      if (m.pos + m.T * Math.min(1, F) > lim) continue;
      const d = Math.abs(m.pos - c);
      if (d < bd) { bd = d; mk = m; } else if (m.pos < c) break;
    }
    if (!mk) return;
    // input half-length: shorter when lowering formants so stretched grains don't smear into neighbours
    const Ta = mk.T * Math.min(1, F), Ts = Ta / F;
    const k0 = Math.max(Math.ceil(c - Ts), o + 1), k1 = Math.floor(c + Ts);
    const M = this.M, acc = v.acc, ws = v.ws;
    for (let k = k0; k <= k1; k++) {
      const u = (k - c) / Ts;
      const w = 0.5 + 0.5 * Math.cos(Math.PI * u);
      const x = this.readAbs(mk.pos + (k - c) * F);
      const j = k % M;
      acc[j] += w * x;
      ws[j] += w;
    }
  }

  // ---------- robot vocoder ----------
  initVocoder() {
    const B = 20, lo = 90, hi = 9000, Q = 5.5;
    this.vb = [];
    for (let i = 0; i < B; i++) {
      const f = lo * Math.pow(hi / lo, i / (B - 1));
      const w0 = (2 * Math.PI * Math.min(f, sampleRate * 0.45)) / sampleRate;
      const al = Math.sin(w0) / (2 * Q), a0 = 1 + al;
      this.vb.push({ b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w0)) / a0, a2: (1 - al) / a0, m1: 0, m2: 0, my1: 0, my2: 0, c1: 0, c2: 0, cy1: 0, cy2: 0, env: 0 });
    }
    this.envA = 1 - Math.exp(-1 / (0.004 * sampleRate));
    this.envR = 1 - Math.exp(-1 / (0.03 * sampleRate));
    this.cf = 220;
    this.cph = [0, 0, 0];
    this.inPow = 1e-6;
    this.outPow = 1e-6;
    this.agc = 1;
    this.powA = 1 - Math.exp(-1 / (0.08 * sampleRate));
  }
  vocode(mod, harmony, shiftR) {
    if (this.lastT > 0) this.cf += (this.lastT * shiftR - this.cf) * 0.01;
    const sr = sampleRate, ph = this.cph;
    ph[0] += this.cf / sr; if (ph[0] >= 1) ph[0] -= 1;
    ph[1] += (this.cf * 1.4983) / sr; if (ph[1] >= 1) ph[1] -= 1;
    ph[2] += (this.cf * 0.5) / sr; if (ph[2] >= 1) ph[2] -= 1;
    let car = (2 * ph[0] - 1) + (2 * ph[2] - 1) * 0.5;
    if (harmony > 0.5) car += (2 * ph[1] - 1) * 0.7;
    car += (Math.random() * 2 - 1) * 0.08;
    let out = 0;
    const vb = this.vb, A = this.envA, R = this.envR;
    for (let i = 0; i < vb.length; i++) {
      const b = vb[i];
      const my = b.b0 * mod + b.b2 * b.m2 - b.a1 * b.my1 - b.a2 * b.my2;
      b.m2 = b.m1; b.m1 = mod; b.my2 = b.my1; b.my1 = my;
      const cy = b.b0 * car + b.b2 * b.c2 - b.a1 * b.cy1 - b.a2 * b.cy2;
      b.c2 = b.c1; b.c1 = car; b.cy2 = b.cy1; b.cy1 = cy;
      const a = Math.abs(my);
      b.env += (a - b.env) * (a > b.env ? A : R);
      out += cy * b.env;
    }
    this.inPow += (mod * mod - this.inPow) * this.powA;
    this.outPow += (out * out - this.outPow) * this.powA;
    const want = Math.min(40, Math.sqrt(this.inPow / (this.outPow + 1e-9)));
    this.agc += (want - this.agc) * 0.0005;
    return out * this.agc;
  }

  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return true;
    const nfr = out[0].length;
    const oL = out[0], oR = out[1] || out[0];
    if (params.bypass[0] > 0.5 && !this.edit) {
      if (!inp || !inp.length) { oL.fill(0); if (out[1]) out[1].fill(0); return true; }
      for (let c = 0; c < out.length; c++) out[c].set(inp[Math.min(c, inp.length - 1)]);
      return true;
    }
    const i0 = inp && inp.length ? inp[0] : null, i1 = inp && inp.length > 1 ? inp[1] : null;
    const speed = params.speed[0], amount = params.amount[0], robot = params.robot[0], harmony = params.harmony[0];
    const F = Math.pow(2, params.formant[0] / 12), shiftR = Math.pow(2, params.shift[0] / 12), hmix = params.harmMix[0];
    const tc = speed * 0.3;
    const coef = this.edit ? 1 : (tc < 0.002 ? 1 : 1 - Math.exp(-1 / (tc * sampleRate)));
    const gT = Math.cos((robot * Math.PI) / 2), gR = Math.sin((robot * Math.PI) / 2);
    const N = this.N, M = this.M, L = this.L, voices = this.voices;
    const gA = 1 - Math.exp(-1 / (0.03 * sampleRate));
    for (let i = 0; i < nfr; i++) {
      const dry = i0 ? (i1 ? (i0[i] + i1[i]) * 0.5 : i0[i]) : 0;
      this.ring[this.n % N] = dry;
      this.lp += (dry - this.lp) * this.lpA;
      this.lpRing[this.n % N] = this.lp;
      this.n++;
      if (++this.hc >= this.hop) { this.hc = 0; this.analyze(amount); }
      // analysis pitch marks, one per period, snapped to the waveform's pulse (epoch) when voiced
      while (this.n - 1 >= this.am + 1.5 * this.T) {
        const T = this.T;
        let pos = this.am + T;
        if (this.voiced) {
          let bi = -1, bv = -1e9;
          const a = Math.ceil(this.am + 0.5 * T), z = Math.floor(this.am + 1.5 * T);
          for (let k = a; k <= z; k++) { const v = this.lpRing[k % N]; if (v > bv) { bv = v; bi = k; } }
          if (bi > this.am + 0.3 * T) pos = bi;
        }
        this.am = pos;
        this.marks.push({ pos, T });
        if (this.marks.length > 96) this.marks.splice(0, 32);
      }
      this.ratio += (this.target - this.ratio) * coef;
      const o = this.n - 1 - L;
      let L0 = 0, R0 = 0;
      for (let vi = 0; vi < voices.length; vi++) {
        const v = voices[vi];
        const r = vi === 0 ? this.ratio * shiftR : this.ratio * shiftR * Math.pow(2, v.iv / 12);
        v.ratio = r;
        if (vi) v.g += ((this.voiced ? 1 : 0) - v.g) * gA;
        if (v.next < o) v.next = o + 1;
        while (v.next < o + L) {
          this.addGrain(v, F, o);
          v.next += Math.max(16, this.T / r);
        }
        if (o < 0) continue;
        const j = o % M;
        const y = v.acc[j] / Math.max(v.ws[j], 0.6);
        v.acc[j] = 0;
        v.ws[j] = 0;
        if (vi === 0) {
          let s = y;
          if (robot > 0.001) s = y * gT + this.vocode(this.readAbs(o), harmony, shiftR) * gR;
          L0 += s; R0 += s;
        } else {
          const g = v.g * v.gain * hmix, a = ((v.pan + 1) * Math.PI) / 4;
          L0 += y * g * Math.cos(a) * 1.2;
          R0 += y * g * Math.sin(a) * 1.2;
        }
      }
      oL[i] = L0;
      if (out[1]) oR[i] = R0;
    }
    return true;
  }
}

class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = 4096;
    this.buf = new Float32Array(this.size);
    this.n = 0;
    this.t = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush' && this.n > 0) {
        this.port.postMessage({ t: this.t, d: this.buf.slice(0, this.n) });
        this.n = 0;
      }
    };
  }
  process(inputs) {
    const inp = inputs[0];
    if (inp && inp.length) {
      const a = inp[0], b = inp.length > 1 ? inp[1] : null;
      if (this.n === 0) this.t = currentTime;
      for (let i = 0; i < a.length; i++) {
        this.buf[this.n++] = b ? (a[i] + b[i]) * 0.5 : a[i];
        if (this.n >= this.size) {
          this.port.postMessage({ t: this.t, d: this.buf.slice(0) });
          this.n = 0;
          this.t = currentTime + (i + 1) / sampleRate;
        }
      }
    }
    return true;
  }
}

class CrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bits', defaultValue: 8, minValue: 1, maxValue: 16, automationRate: 'k-rate' },
      { name: 'down', defaultValue: 4, minValue: 1, maxValue: 64, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.h = [0, 0]; this.c = 0; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) { for (const o of out) o.fill(0); return true; }
    const q = Math.pow(2, params.bits[0] - 1), down = params.down[0];
    for (let i = 0; i < out[0].length; i++) {
      this.c += 1;
      const take = this.c >= down;
      if (take) this.c -= down;
      for (let ch = 0; ch < out.length; ch++) {
        const x = inp[Math.min(ch, inp.length - 1)][i];
        if (take) this.h[ch] = Math.round(x * q) / q;
        out[ch][i] = this.h[ch];
      }
    }
    return true;
  }
}

class GateProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'thr', defaultValue: -55, minValue: -100, maxValue: 0, automationRate: 'k-rate' },
      { name: 'rel', defaultValue: 80, minValue: 5, maxValue: 1000, automationRate: 'k-rate' },
    ];
  }
  constructor() { super(); this.env = 0; this.g = 0; this.hold = 0; }
  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!inp || !inp.length) { for (const o of out) o.fill(0); return true; }
    const thr = Math.pow(10, params.thr[0] / 20), close = thr * 0.5;
    const relA = 1 - Math.exp(-1 / ((params.rel[0] / 1000) * sampleRate)), attA = 1 - Math.exp(-1 / (0.0008 * sampleRate));
    const envA = 1 - Math.exp(-1 / (0.002 * sampleRate)), envR = 1 - Math.exp(-1 / (0.03 * sampleRate));
    const holdN = Math.round(0.03 * sampleRate);
    for (let i = 0; i < out[0].length; i++) {
      let a = 0;
      for (let c = 0; c < inp.length; c++) a = Math.max(a, Math.abs(inp[c][i]));
      this.env += (a - this.env) * (a > this.env ? envA : envR);
      if (this.env > thr) this.hold = holdN;
      else if (this.hold > 0) this.hold--;
      const target = this.env > thr || (this.hold > 0 && this.env > close) ? 1 : 0;
      this.g += (target - this.g) * (target > this.g ? attA : relA);
      for (let c = 0; c < out.length; c++) out[c][i] = inp[Math.min(c, inp.length - 1)][i] * this.g;
    }
    return true;
  }
}

registerProcessor('gate', GateProcessor);
registerProcessor('autotune', AutoTuneProcessor);
registerProcessor('recorder', RecorderProcessor);
registerProcessor('crusher', CrusherProcessor);
