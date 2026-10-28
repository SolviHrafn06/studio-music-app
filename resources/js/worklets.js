// Audio worklet processors: built-in Auto-Tune (pitch detection + correction) and a mic recorder.

class AutoTuneProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: 'bypass', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'speed', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'amount', defaultValue: 1, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'robot', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
      { name: 'harmony', defaultValue: 0, minValue: 0, maxValue: 1, automationRate: 'k-rate' },
    ];
  }

  constructor(options) {
    super();
    const po = (options && options.processorOptions) || {};
    this.mask = po.mask || [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1];
    this.report = false;
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.mask) this.mask = d.mask;
      if ('report' in d) this.report = d.report;
    };
    this.N = 16384;
    this.ring = new Float32Array(this.N);
    this.w = 0;
    this.win = 2048;
    this.dec = new Float32Array(1024);
    this.yin = new Float32Array(512);
    this.hop = 256;
    this.hc = 0;
    this.ratio = 1;
    this.target = 1;
    this.G = Math.round(sampleRate * 0.03);
    this.Gt = this.G;
    this.ph = 0.5;
    this.lastF = 0;
    this.lastT = 0;
    this.rc = 0;
    this.voicedRun = 0;
    this.initVocoder();
  }

  // ---- robot voice: channel vocoder whose carrier follows the corrected pitch ----
  initVocoder() {
    const B = 20, lo = 90, hi = 9000, Q = 5.5;
    this.vb = [];
    for (let i = 0; i < B; i++) {
      const f = lo * Math.pow(hi / lo, i / (B - 1));
      const w0 = (2 * Math.PI * Math.min(f, sampleRate * 0.45)) / sampleRate;
      const al = Math.sin(w0) / (2 * Q), a0 = 1 + al;
      this.vb.push({
        b0: al / a0, b2: -al / a0, a1: (-2 * Math.cos(w0)) / a0, a2: (1 - al) / a0,
        m1: 0, m2: 0, my1: 0, my2: 0, c1: 0, c2: 0, cy1: 0, cy2: 0, env: 0,
      });
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

  vocode(mod, harmony) {
    // carrier: bright saws at the tuned pitch (+ optional 5th and sub-octave), a little noise for consonants
    if (this.lastT > 0) this.cf += (this.lastT - this.cf) * 0.01;
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
    // automatic gain so the robot is as loud as the singer
    this.inPow += (mod * mod - this.inPow) * this.powA;
    this.outPow += (out * out - this.outPow) * this.powA;
    const want = Math.min(40, Math.sqrt(this.inPow / (this.outPow + 1e-9)));
    this.agc += (want - this.agc) * 0.0005;
    return out * this.agc;
  }

  detect() {
    const N = this.N, ring = this.ring, x = this.dec;
    let idx = (this.w - this.win + N) % N;
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

  analyze(amount) {
    const f = this.detect();
    let tf = 0;
    if (f > 0) {
      const m = 69 + 12 * Math.log2(f / 440);
      let best = Math.round(m), bd = 99;
      for (let k = Math.floor(m) - 6; k <= Math.ceil(m) + 6; k++) {
        if (this.mask[((k % 12) + 12) % 12]) {
          const dd = Math.abs(k - m);
          if (dd < bd) { bd = dd; best = k; }
        }
      }
      this.target = Math.pow(2, (amount * (best - m)) / 12);
      // pitch-synchronous grain size (a multiple of the period) keeps the two read taps in phase
      const period = sampleRate / f;
      const k = Math.max(1, Math.round((sampleRate * 0.012) / period));
      this.Gt = Math.min(2 * k * period, this.N / 4);
      tf = 440 * Math.pow(2, (best - 69) / 12);
      this.voicedRun++;
    } else {
      this.target = 1;
      this.voicedRun = 0;
    }
    this.lastF = f;
    this.lastT = tf;
    if (this.report && ++this.rc >= 6) {
      this.rc = 0;
      this.port.postMessage({ f: this.lastF, t: this.lastT });
    }
  }

  read(delay) {
    let pos = this.w - 1 - delay;
    while (pos < 0) pos += this.N;
    const i = Math.floor(pos), fr = pos - i;
    const a = this.ring[i], b = this.ring[(i + 1) % this.N];
    return a + (b - a) * fr;
  }

  process(inputs, outputs, params) {
    const inp = inputs[0], out = outputs[0];
    if (!out || !out.length) return true;
    const n = out[0].length;
    if (!inp || inp.length === 0) {
      for (const ch of out) ch.fill(0);
      return true;
    }
    if (params.bypass[0] > 0.5) {
      for (let c = 0; c < out.length; c++) out[c].set(inp[Math.min(c, inp.length - 1)]);
      return true;
    }
    const speed = params.speed[0], amount = params.amount[0];
    const robot = params.robot[0], harmony = params.harmony[0];
    const gT = Math.cos(robot * Math.PI / 2), gR = Math.sin(robot * Math.PI / 2);
    const tc = speed * 0.3;
    const coef = tc < 0.002 ? 1 : 1 - Math.exp(-1 / (tc * sampleRate));
    const i0 = inp[0], i1 = inp.length > 1 ? inp[1] : null;
    const N = this.N, ring = this.ring, o0 = out[0];
    const TWO_PI = Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const dry = i1 ? (i0[i] + i1[i]) * 0.5 : i0[i];
      ring[this.w] = dry;
      this.w = (this.w + 1) % N;
      if (++this.hc >= this.hop) { this.hc = 0; this.analyze(amount); }
      this.ratio += (this.target - this.ratio) * coef;
      // change grain size only while tap B is silent, keeping tap A's delay constant (click-free)
      if (Math.abs(this.ph - 0.5) < 0.02 && Math.abs(this.Gt - this.G) > 1) {
        const ng = Math.max(this.G * 0.93, Math.min(this.G * 1.07, this.Gt));
        this.ph = (this.ph * this.G) / ng;
        this.G = ng;
      }
      const G = this.G;
      this.ph += (1 - this.ratio) / G;
      if (this.ph >= 1) this.ph -= 1; else if (this.ph < 0) this.ph += 1;
      const p2 = (this.ph + 0.5) % 1;
      const ga = 0.5 - 0.5 * Math.cos(TWO_PI * this.ph);
      const tuned = this.read(3 + this.ph * G) * ga + this.read(3 + p2 * G) * (1 - ga);
      o0[i] = robot > 0.001 ? tuned * gT + this.vocode(dry, harmony) * gR : tuned;
    }
    for (let c = 1; c < out.length; c++) out[c].set(o0);
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

registerProcessor('autotune', AutoTuneProcessor);
registerProcessor('recorder', RecorderProcessor);
