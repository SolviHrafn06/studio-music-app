// Effects: every effect builds a little Web Audio graph with input/output, can be updated live,
// exposes automatable AudioParams, and may hook into the step scheduler (tempo-synced effects).

const SYNC_DIVS = [['1/16', 0.25], ['1/8T', 1 / 3], ['1/8', 0.5], ['1/8.', 0.75], ['1/4', 1], ['1/4.', 1.5], ['1/2', 2], ['1 bar', 4]];
const LFO_DIVS = [['Off', 0], ['1/16', 0.25], ['1/8', 0.5], ['1/4', 1], ['1/2', 2], ['1 bar', 4], ['2 bars', 8]];
const dbToGain = (db) => Math.pow(10, db / 20);
const _irCache = new WeakMap();
const REVERB_TYPES = { Room: [0.9, 3.2, 0.6], Hall: [2.8, 2.6, 0.45], Plate: [1.8, 2.2, 1], Cathedral: [5.5, 2.4, 0.35], Spring: [1.4, 3.5, 0.8] };
function reverbIR(ctx, type) {
  let m = _irCache.get(ctx);
  if (!m) { m = {}; _irCache.set(ctx, m); }
  if (m[type]) return m[type];
  const [sec, decay, bright] = REVERB_TYPES[type] || REVERB_TYPES.Hall;
  const len = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const n = Math.random() * 2 - 1;
      const k = bright + (1 - bright) * (1 - i / len) * 0.5;
      lp += (n - lp) * k;
      const env = Math.pow(1 - i / len, decay);
      d[i] = lp * env * (type === 'Spring' ? 1 + 0.5 * Math.sin(i / 90) : 1);
    }
  }
  return (m[type] = b);
}
function curveFor(mode, drive) {
  const n = 2048, c = new Float32Array(n), k = 1 + drive * 30;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y;
    if (mode === 'Tube') y = x >= 0 ? Math.tanh(k * x) : Math.tanh(k * x * 0.6) / 0.85;
    else if (mode === 'Fuzz') y = Math.sign(x) * (1 - Math.exp(-k * 1.5 * Math.abs(x)));
    else if (mode === 'Hard clip') y = Math.max(-1, Math.min(1, x * k * 0.5));
    else y = Math.tanh(k * x * 0.5);
    c[i] = y;
  }
  const mx = Math.max(...c.map(Math.abs)) || 1;
  return c.map((v) => v / mx);
}
function wetDry(ctx) {
  const input = ctx.createGain(), output = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain();
  input.connect(dry).connect(output);
  wet.connect(output);
  return { input, output, dry, wet, mix(v, live) { setP(dry.gain, 1 - v, live); setP(wet.gain, v, live); } };
}
function setP(param, v, live) {
  if (live && param.setTargetAtTime) param.setTargetAtTime(v, param.context ? param.context.currentTime : 0, 0.02);
  else param.value = v;
}

const FX = {
  eq: {
    name: 'EQ', icon: '〰',
    params: [
      { id: 'hp', label: 'Low Cut', min: 20, max: 1000, def: 20, log: true, unit: 'Hz' },
      { id: 'lf', label: 'Low Freq', min: 40, max: 600, def: 120, log: true, unit: 'Hz' },
      { id: 'lg', label: 'Low', min: -18, max: 18, def: 0, unit: 'dB', auto: true },
      { id: 'm1f', label: 'Mid 1', min: 100, max: 4000, def: 400, log: true, unit: 'Hz' },
      { id: 'm1g', label: 'Gain 1', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'm1q', label: 'Q 1', min: 0.3, max: 8, def: 1, log: true },
      { id: 'm2f', label: 'Mid 2', min: 500, max: 12000, def: 2500, log: true, unit: 'Hz' },
      { id: 'm2g', label: 'Gain 2', min: -18, max: 18, def: 0, unit: 'dB' },
      { id: 'm2q', label: 'Q 2', min: 0.3, max: 8, def: 1, log: true },
      { id: 'hf', label: 'High Freq', min: 2000, max: 16000, def: 8000, log: true, unit: 'Hz' },
      { id: 'hg', label: 'High', min: -18, max: 18, def: 0, unit: 'dB', auto: true },
      { id: 'lp', label: 'High Cut', min: 1000, max: 20000, def: 20000, log: true, unit: 'Hz' },
    ],
    create(ctx, p) {
      const mk = (type) => { const f = ctx.createBiquadFilter(); f.type = type; return f; };
      const hp = mk('highpass'), ls = mk('lowshelf'), m1 = mk('peaking'), m2 = mk('peaking'), hs = mk('highshelf'), lp = mk('lowpass');
      hp.Q.value = 0.707; lp.Q.value = 0.707;
      hp.connect(ls).connect(m1).connect(m2).connect(hs).connect(lp);
      const filters = [hp, ls, m1, m2, hs, lp];
      return {
        input: hp, output: lp, filters,
        ap: { lg: ls.gain, hg: hs.gain },
        set(p, live) {
          setP(hp.frequency, p.hp, live); setP(ls.frequency, p.lf, live); setP(ls.gain, p.lg, live);
          setP(m1.frequency, p.m1f, live); setP(m1.gain, p.m1g, live); setP(m1.Q, p.m1q, live);
          setP(m2.frequency, p.m2f, live); setP(m2.gain, p.m2g, live); setP(m2.Q, p.m2q, live);
          setP(hs.frequency, p.hf, live); setP(hs.gain, p.hg, live); setP(lp.frequency, p.lp, live);
        },
      };
    },
  },
  comp: {
    name: 'Compressor', icon: '◧',
    params: [
      { id: 'thr', label: 'Threshold', min: -60, max: 0, def: -18, unit: 'dB' },
      { id: 'ratio', label: 'Ratio', min: 1, max: 20, def: 4, log: true, unit: ':1' },
      { id: 'att', label: 'Attack', min: 0.1, max: 100, def: 10, log: true, unit: 'ms' },
      { id: 'rel', label: 'Release', min: 10, max: 1000, def: 150, log: true, unit: 'ms' },
      { id: 'knee', label: 'Knee', min: 0, max: 30, def: 6, unit: 'dB' },
      { id: 'makeup', label: 'Makeup', min: 0, max: 24, def: 3, unit: 'dB' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, def: 1, unit: '%' },
    ],
    create(ctx) {
      const wd = wetDry(ctx), c = ctx.createDynamicsCompressor(), mk = ctx.createGain();
      wd.input.connect(c).connect(mk).connect(wd.wet);
      return {
        input: wd.input, output: wd.output, comp: c,
        reduction: () => c.reduction,
        set(p, live) {
          setP(c.threshold, p.thr, live); setP(c.ratio, p.ratio, live); setP(c.attack, p.att / 1000, live);
          setP(c.release, p.rel / 1000, live); setP(c.knee, p.knee, live); setP(mk.gain, dbToGain(p.makeup), live);
          wd.mix(p.mix, live);
        },
      };
    },
  },
  sat: {
    name: 'Saturation', icon: '♨',
    params: [
      { id: 'mode', label: 'Type', options: ['Tape', 'Tube', 'Fuzz', 'Hard clip'], def: 'Tape' },
      { id: 'drive', label: 'Drive', min: 0, max: 1, def: 0.3, unit: '%' },
      { id: 'tone', label: 'Tone', min: 500, max: 18000, def: 9000, log: true, unit: 'Hz', auto: true },
      { id: 'mix', label: 'Mix', min: 0, max: 1, def: 1, unit: '%', auto: true },
      { id: 'out', label: 'Output', min: -24, max: 6, def: -3, unit: 'dB' },
    ],
    create(ctx) {
      const wd = wetDry(ctx), pre = ctx.createGain(), sh = ctx.createWaveShaper(), tone = ctx.createBiquadFilter(), out = ctx.createGain();
      sh.oversample = '2x';
      tone.type = 'lowpass';
      wd.input.connect(pre).connect(sh).connect(tone).connect(out).connect(wd.wet);
      let key = '';
      return {
        input: wd.input, output: wd.output, ap: { tone: tone.frequency, mix: wd.wet.gain },
        set(p, live) {
          const k = p.mode + p.drive.toFixed(2);
          if (k !== key) { key = k; sh.curve = curveFor(p.mode, p.drive); }
          setP(pre.gain, 1 + p.drive * 2, live); setP(tone.frequency, p.tone, live);
          setP(out.gain, dbToGain(p.out), live); wd.mix(p.mix, live);
        },
      };
    },
  },
  chorus: {
    name: 'Chorus', icon: '≋',
    params: [
      { id: 'rate', label: 'Rate', min: 0.05, max: 5, def: 0.8, log: true, unit: 'Hz' },
      { id: 'depth', label: 'Depth', min: 0, max: 1, def: 0.5, unit: '%' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, def: 0.5, unit: '%', auto: true },
    ],
    create(ctx) {
      const wd = wetDry(ctx), merger = ctx.createChannelMerger(2);
      const lfo = ctx.createOscillator();
      lfo.start();
      const taps = [0, 1].map((ch) => {
        const d = ctx.createDelay(0.05), g = ctx.createGain();
        d.delayTime.value = ch ? 0.019 : 0.014;
        lfo.connect(g).connect(d.delayTime);
        wd.input.connect(d).connect(merger, 0, ch);
        return { d, g };
      });
      merger.connect(wd.wet);
      return {
        input: wd.input, output: wd.output, ap: { mix: wd.wet.gain }, osc: [lfo],
        set(p, live) {
          setP(lfo.frequency, p.rate, live);
          taps.forEach((t, i) => setP(t.g.gain, (i ? -1 : 1) * p.depth * 0.004, live));
          wd.mix(p.mix, live);
        },
      };
    },
  },
  phaser: {
    name: 'Phaser', icon: '◌',
    params: [
      { id: 'rate', label: 'Rate', min: 0.05, max: 8, def: 0.5, log: true, unit: 'Hz' },
      { id: 'depth', label: 'Depth', min: 0, max: 1, def: 0.7, unit: '%' },
      { id: 'fb', label: 'Feedback', min: 0, max: 0.9, def: 0.5, unit: '%' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, def: 0.5, unit: '%', auto: true },
    ],
    create(ctx) {
      const wd = wetDry(ctx), lfo = ctx.createOscillator(), lg = ctx.createGain(), fb = ctx.createGain();
      lfo.start();
      lfo.connect(lg);
      const stages = [];
      let head = ctx.createGain();
      wd.input.connect(head);
      const first = head;
      for (let i = 0; i < 6; i++) {
        const ap = ctx.createBiquadFilter();
        ap.type = 'allpass';
        ap.frequency.value = 700;
        ap.Q.value = 0.6;
        lg.connect(ap.frequency);
        head.connect(ap);
        head = ap;
        stages.push(ap);
      }
      head.connect(fb).connect(first);
      head.connect(wd.wet);
      return {
        input: wd.input, output: wd.output, ap: { mix: wd.wet.gain }, osc: [lfo],
        set(p, live) {
          setP(lfo.frequency, p.rate, live); setP(lg.gain, p.depth * 600, live);
          setP(fb.gain, p.fb, live); wd.mix(p.mix, live);
        },
      };
    },
  },
  filter: {
    name: 'Filter', icon: '⌒',
    params: [
      { id: 'type', label: 'Type', options: ['lowpass', 'highpass', 'bandpass'], def: 'lowpass' },
      { id: 'cutoff', label: 'Cutoff', min: 20, max: 20000, def: 2000, log: true, unit: 'Hz', auto: true },
      { id: 'res', label: 'Resonance', min: 0.1, max: 20, def: 1, log: true, auto: true },
      { id: 'lfo', label: 'Wobble', options: LFO_DIVS.map((d) => d[0]), def: 'Off' },
      { id: 'lfoDepth', label: 'Wobble amt', min: 0, max: 1, def: 0.5, unit: '%' },
    ],
    create(ctx, p, env) {
      const f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.start();
      lfo.connect(lg).connect(f.frequency);
      return {
        input: f, output: f, ap: { cutoff: f.frequency, res: f.Q }, osc: [lfo],
        set(p, live) {
          f.type = p.type;
          setP(f.frequency, p.cutoff, live); setP(f.Q, p.res, live);
          const div = (LFO_DIVS.find((d) => d[0] === p.lfo) || LFO_DIVS[0])[1];
          setP(lfo.frequency, div ? env.bpm / 60 / div : 0.0001, live);
          setP(lg.gain, div ? p.cutoff * 0.85 * p.lfoDepth : 0, live);
        },
      };
    },
  },
  reverb: {
    name: 'Reverb', icon: '◎',
    params: [
      { id: 'type', label: 'Space', options: Object.keys(REVERB_TYPES), def: 'Hall' },
      { id: 'pre', label: 'Pre-delay', min: 0, max: 200, def: 20, unit: 'ms' },
      { id: 'damp', label: 'Damping', min: 1000, max: 20000, def: 8000, log: true, unit: 'Hz' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, def: 0.3, unit: '%', auto: true },
    ],
    create(ctx) {
      const wd = wetDry(ctx), pre = ctx.createDelay(0.3), conv = ctx.createConvolver(), damp = ctx.createBiquadFilter();
      damp.type = 'lowpass';
      wd.input.connect(pre).connect(conv).connect(damp).connect(wd.wet);
      let t = '';
      return {
        input: wd.input, output: wd.output, ap: { mix: wd.wet.gain },
        set(p, live) {
          if (t !== p.type) { t = p.type; conv.buffer = reverbIR(ctx, p.type); }
          setP(pre.delayTime, p.pre / 1000, live); setP(damp.frequency, p.damp, live);
          wd.mix(p.mix, live);
        },
      };
    },
  },
  delay: {
    name: 'Delay', icon: '⋯',
    params: [
      { id: 'time', label: 'Time', options: SYNC_DIVS.map((d) => d[0]), def: '1/8.' },
      { id: 'fb', label: 'Feedback', min: 0, max: 0.92, def: 0.4, unit: '%' },
      { id: 'tone', label: 'Tone', min: 500, max: 16000, def: 4000, log: true, unit: 'Hz' },
      { id: 'pp', label: 'Mode', options: ['Ping-pong', 'Stereo'], def: 'Ping-pong' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, def: 0.3, unit: '%', auto: true },
    ],
    create(ctx, p, env) {
      const wd = wetDry(ctx), dl = ctx.createDelay(4), dr = ctx.createDelay(4), fl = ctx.createGain(), fr = ctx.createGain();
      const tl = ctx.createBiquadFilter(), tr = ctx.createBiquadFilter(), merger = ctx.createChannelMerger(2), mono = ctx.createGain();
      tl.type = tr.type = 'lowpass';
      wd.input.connect(mono).connect(dl);
      dl.connect(tl); dr.connect(tr);
      tl.connect(merger, 0, 0); tr.connect(merger, 0, 1);
      merger.connect(wd.wet);
      let mode = '';
      return {
        input: wd.input, output: wd.output, ap: { mix: wd.wet.gain },
        set(p, live) {
          const beats = (SYNC_DIVS.find((d) => d[0] === p.time) || SYNC_DIVS[3])[1];
          const sec = Math.min(3.9, (60 / env.bpm) * beats);
          setP(dl.delayTime, sec, live); setP(dr.delayTime, sec, live);
          setP(tl.frequency, p.tone, live); setP(tr.frequency, p.tone, live);
          setP(fl.gain, p.fb, live); setP(fr.gain, p.fb, live);
          if (mode !== p.pp) {
            mode = p.pp;
            try { tl.disconnect(fl); tr.disconnect(fr); fl.disconnect(); fr.disconnect(); mono.disconnect(dr); } catch (e) {}
            if (p.pp === 'Ping-pong') { tl.connect(fl).connect(dr); tr.connect(fr).connect(dl); }
            else { mono.connect(dr); tl.connect(fl).connect(dl); tr.connect(fr).connect(dr); }
          }
          wd.mix(p.mix, live);
        },
      };
    },
  },
  crush: {
    name: 'Lo-fi', icon: '▚',
    params: [
      { id: 'bits', label: 'Bits', min: 2, max: 16, def: 8 },
      { id: 'down', label: 'Downsample', min: 1, max: 40, def: 4, log: true, unit: 'x' },
      { id: 'tone', label: 'Tone', min: 800, max: 18000, def: 6000, log: true, unit: 'Hz' },
      { id: 'mix', label: 'Mix', min: 0, max: 1, def: 1, unit: '%', auto: true },
    ],
    create(ctx) {
      const wd = wetDry(ctx), cr = new AudioWorkletNode(ctx, 'crusher', { outputChannelCount: [2] }), tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      wd.input.connect(cr).connect(tone).connect(wd.wet);
      return {
        input: wd.input, output: wd.output, ap: { mix: wd.wet.gain },
        set(p, live) {
          cr.parameters.get('bits').value = p.bits; cr.parameters.get('down').value = p.down;
          setP(tone.frequency, p.tone, live); wd.mix(p.mix, live);
        },
      };
    },
  },
  width: {
    name: 'Stereo Width', icon: '↔',
    params: [{ id: 'width', label: 'Width', min: 0, max: 2, def: 1.3, unit: '%' }],
    create(ctx) {
      const input = ctx.createGain(), split = ctx.createChannelSplitter(2), merge = ctx.createChannelMerger(2);
      input.channelCountMode = 'explicit'; input.channelCount = 2;
      input.connect(split);
      const mid = ctx.createGain(), side = ctx.createGain(), sideAmt = ctx.createGain(), inv = ctx.createGain();
      mid.gain.value = 0.5;
      split.connect(mid, 0); split.connect(mid, 1);
      const sl = ctx.createGain(), sr = ctx.createGain();
      sl.gain.value = 0.5; sr.gain.value = -0.5;
      split.connect(sl, 0); split.connect(sr, 1);
      sl.connect(side); sr.connect(side);
      side.connect(sideAmt);
      inv.gain.value = -1;
      mid.connect(merge, 0, 0); mid.connect(merge, 0, 1);
      sideAmt.connect(merge, 0, 0); sideAmt.connect(inv).connect(merge, 0, 1);
      return { input, output: merge, set(p, live) { setP(sideAmt.gain, p.width, live); } };
    },
  },
  doubler: {
    name: 'Doubler', icon: '⧉',
    params: [
      { id: 'amount', label: 'Amount', min: 0, max: 1, def: 0.6, unit: '%', auto: true },
      { id: 'spread', label: 'Spread', min: 0, max: 1, def: 1, unit: '%' },
    ],
    create(ctx) {
      const input = ctx.createGain(), output = ctx.createGain(), wet = ctx.createGain();
      input.connect(output);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.35;
      lfo.start();
      const pans = [0, 1].map((i) => {
        const d = ctx.createDelay(0.1), lg = ctx.createGain(), pn = ctx.createStereoPanner(), bp = ctx.createBiquadFilter();
        d.delayTime.value = i ? 0.023 : 0.014;
        lg.gain.value = (i ? -1 : 1) * 0.0015;
        bp.type = 'highpass'; bp.frequency.value = 180;
        lfo.connect(lg).connect(d.delayTime);
        input.connect(bp).connect(d).connect(pn).connect(wet);
        return pn;
      });
      wet.connect(output);
      return {
        input, output, ap: { amount: wet.gain }, osc: [lfo],
        set(p, live) { setP(wet.gain, p.amount * 0.7, live); pans.forEach((pn, i) => setP(pn.pan, (i ? 1 : -1) * p.spread, live)); },
      };
    },
  },
  deess: {
    name: 'De-esser', icon: 'S',
    params: [
      { id: 'freq', label: 'Frequency', min: 3000, max: 10000, def: 6000, log: true, unit: 'Hz' },
      { id: 'amount', label: 'Amount', min: 0, max: 1, def: 0.5, unit: '%' },
    ],
    create(ctx) {
      const input = ctx.createGain(), output = ctx.createGain();
      const lo = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter(), lo2 = ctx.createBiquadFilter(), hi2 = ctx.createBiquadFilter();
      lo.type = lo2.type = 'lowpass'; hi.type = hi2.type = 'highpass';
      const c = ctx.createDynamicsCompressor();
      c.ratio.value = 12; c.attack.value = 0.001; c.release.value = 0.06; c.knee.value = 3;
      input.connect(lo).connect(lo2).connect(output);
      input.connect(hi).connect(hi2).connect(c).connect(output);
      return {
        input, output, reduction: () => c.reduction,
        set(p, live) {
          [lo, lo2, hi, hi2].forEach((f) => setP(f.frequency, p.freq, live));
          setP(c.threshold, -10 - p.amount * 40, live);
        },
      };
    },
  },
  pump: {
    name: 'Sidechain Pump', icon: '⇂',
    params: [
      { id: 'depth', label: 'Depth', min: 0, max: 1, def: 0.7, unit: '%' },
      { id: 'rate', label: 'Every', options: ['1/4', '1/8', '1/2', '1 bar'], def: '1/4' },
      { id: 'rel', label: 'Release', min: 0.05, max: 0.6, def: 0.18, unit: 's' },
    ],
    create(ctx) {
      const g = ctx.createGain();
      let P = {};
      return {
        input: g, output: g,
        set(p) { P = p; },
        schedule(step, time, spStep) {
          const every = { '1/4': 4, '1/8': 2, '1/2': 8, '1 bar': 16 }[P.rate] || 4;
          if (step % every !== 0 || !P.depth) return;
          const floor = Math.max(0.0001, 1 - P.depth);
          g.gain.cancelScheduledValues(time);
          g.gain.setValueAtTime(floor, time);
          g.gain.setTargetAtTime(1, time + 0.01, P.rel / 3);
        },
        reset() { g.gain.cancelScheduledValues(0); g.gain.value = 1; },
      };
    },
  },
  limiter: {
    name: 'Limiter', icon: '▔',
    params: [
      { id: 'gain', label: 'Gain', min: 0, max: 18, def: 3, unit: 'dB' },
      { id: 'ceil', label: 'Ceiling', min: -12, max: 0, def: -1, unit: 'dB' },
    ],
    create(ctx) {
      const pre = ctx.createGain(), c = ctx.createDynamicsCompressor(), post = ctx.createGain();
      c.ratio.value = 20; c.knee.value = 0; c.attack.value = 0.001; c.release.value = 0.08;
      pre.connect(c).connect(post);
      return {
        input: pre, output: post, reduction: () => c.reduction,
        set(p, live) { setP(pre.gain, dbToGain(p.gain), live); setP(c.threshold, p.ceil - 1, live); setP(post.gain, 1, live); },
      };
    },
  },
};

// ---- guitar: amp models, cabinets, gate, tremolo ----
const AMP_MODELS = {
  'Clean':   { hp: 70,  mid: [700, 0],   drive: [2.5, 0],  curve: 'tube', lp: 9500, out: 0.45 },
  'Crunch':  { hp: 90,  mid: [900, 3],   drive: [9, 2.5],  curve: 'tube', lp: 7500, out: 0.3 },
  'Lead':    { hp: 110, mid: [1000, 5],  drive: [20, 5],   curve: 'tube', lp: 6800, out: 0.22 },
  'Metal':   { hp: 150, mid: [1300, 4],  drive: [40, 10],  curve: 'hard', lp: 6200, out: 0.2 },
  'Fuzz':    { hp: 60,  mid: [800, -2],  drive: [70, 0],   curve: 'fuzz', lp: 5200, out: 0.2 },
  'Bass':    { hp: 30,  mid: [500, 2],   drive: [4, 0],    curve: 'tape', lp: 5000, out: 0.4 },
};
const _ampCurves = {};
function ampCurve(type) {
  if (_ampCurves[type]) return _ampCurves[type];
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    let y;
    if (type === 'tube') y = x >= 0 ? Math.tanh(1.6 * x) : Math.tanh(1.1 * x) * 0.9; // asymmetric = warm even harmonics
    else if (type === 'hard') y = Math.max(-0.9, Math.min(0.9, Math.tanh(2.5 * x) * 1.05));
    else if (type === 'fuzz') y = Math.sign(x) * (1 - Math.exp(-4 * Math.abs(x)));
    else y = Math.tanh(x);
    c[i] = y;
  }
  return (_ampCurves[type] = c);
}
const CABS = {
  '1x12 Combo':  [['highpass', 90, 0.7], ['peaking', 120, 1.2, 3], ['peaking', 2500, 1.5, 3], ['lowpass', 5500, 0.9], ['lowpass', 6500, 0.7]],
  '2x12 Open':   [['highpass', 75, 0.7], ['peaking', 110, 1, 2], ['peaking', 3000, 1.2, 2], ['lowpass', 6500, 0.8], ['lowpass', 7500, 0.7]],
  '4x12 Closed': [['highpass', 70, 0.8], ['peaking', 100, 1.4, 5], ['peaking', 450, 1.2, -4], ['peaking', 2200, 1.4, 4], ['lowpass', 4800, 1], ['lowpass', 5500, 0.7]],
  '4x10 Bass':   [['highpass', 40, 0.7], ['peaking', 80, 1, 4], ['peaking', 800, 1, -2], ['lowpass', 4000, 0.8], ['lowpass', 5000, 0.7]],
  'Off (DI)':    [],
};
Object.assign(FX, {
  amp: {
    name: 'Amp', icon: '🎸',
    params: [
      { id: 'model', label: 'Amp', options: Object.keys(AMP_MODELS), def: 'Crunch' },
      { id: 'gain', label: 'Gain', min: 0, max: 1, def: 0.5, unit: '%' },
      { id: 'bass', label: 'Bass', min: -12, max: 12, def: 0, unit: 'dB' },
      { id: 'mid', label: 'Mid', min: -12, max: 12, def: 0, unit: 'dB' },
      { id: 'treble', label: 'Treble', min: -12, max: 12, def: 0, unit: 'dB' },
      { id: 'presence', label: 'Presence', min: -12, max: 12, def: 2, unit: 'dB' },
      { id: 'master', label: 'Master', min: -24, max: 12, def: 0, unit: 'dB', auto: true },
    ],
    create(ctx) {
      const mk = (t, f, q, g) => { const b = ctx.createBiquadFilter(); b.type = t; b.frequency.value = f; if (q != null) b.Q.value = q; if (g != null) b.gain.value = g; return b; };
      const input = ctx.createGain(), hp = mk('highpass', 80, 0.7), pre = mk('peaking', 800, 0.8, 0);
      const g1 = ctx.createGain(), s1 = ctx.createWaveShaper(), inter = mk('lowpass', 7000, 0.7), g2 = ctx.createGain(), s2 = ctx.createWaveShaper(), dc = mk('highpass', 25, 0.7);
      const bass = mk('lowshelf', 120, null, 0), mid = mk('peaking', 700, 0.7, 0), treble = mk('highshelf', 3200, null, 0), pres = mk('highshelf', 5000, null, 0), lp = mk('lowpass', 8000, 0.7), out = ctx.createGain();
      s1.oversample = s2.oversample = '4x';
      input.connect(hp).connect(pre).connect(g1).connect(s1).connect(inter).connect(g2).connect(s2).connect(dc).connect(bass).connect(mid).connect(treble).connect(pres).connect(lp).connect(out);
      let model = '';
      return {
        input, output: out, ap: { master: out.gain },
        set(p, live) {
          const M = AMP_MODELS[p.model] || AMP_MODELS.Crunch;
          if (model !== p.model) { model = p.model; s1.curve = ampCurve(M.curve); s2.curve = M.drive[1] ? ampCurve(M.curve) : null; }
          setP(hp.frequency, M.hp, live); setP(pre.frequency, M.mid[0], live); setP(pre.gain, M.mid[1], live);
          setP(g1.gain, 0.6 + p.gain * M.drive[0], live);
          setP(g2.gain, M.drive[1] ? 0.5 + p.gain * M.drive[1] : 1, live);
          setP(bass.gain, p.bass, live); setP(mid.gain, p.mid, live); setP(treble.gain, p.treble, live); setP(pres.gain, p.presence, live);
          setP(lp.frequency, M.lp, live);
          setP(out.gain, M.out * dbToGain(p.master) * (M.drive[1] ? 0.7 : 1), live);
        },
      };
    },
  },
  cab: {
    name: 'Cabinet', icon: '▣',
    params: [
      { id: 'type', label: 'Speaker', options: Object.keys(CABS), def: '4x12 Closed' },
      { id: 'mic', label: 'Mic tone', min: 0, max: 1, def: 0.5, unit: '%' },
      { id: 'room', label: 'Room', min: 0, max: 1, def: 0.15, unit: '%' },
    ],
    create(ctx) {
      const input = ctx.createGain(), out = ctx.createGain(), micF = ctx.createBiquadFilter(), roomIn = ctx.createGain(), roomD = ctx.createDelay(0.1), roomLp = ctx.createBiquadFilter(), roomFb = ctx.createGain();
      micF.type = 'highshelf'; micF.frequency.value = 3500;
      roomD.delayTime.value = 0.017; roomLp.type = 'lowpass'; roomLp.frequency.value = 3000; roomFb.gain.value = 0.35;
      let chain = [], type = null;
      const build = (t) => {
        try { input.disconnect(); } catch (e) {}
        chain.forEach((f) => { try { f.disconnect(); } catch (e) {} });
        chain = (CABS[t] || []).map(([ty, f, q, g]) => { const b = ctx.createBiquadFilter(); b.type = ty; b.frequency.value = f; b.Q.value = q; if (g != null) b.gain.value = g; return b; });
        let h = input;
        for (const f of chain) { h.connect(f); h = f; }
        h.connect(micF);
      };
      micF.connect(out);
      micF.connect(roomIn).connect(roomD).connect(roomLp).connect(out);
      roomLp.connect(roomFb).connect(roomD);
      return {
        input, output: out,
        set(p, live) {
          if (type !== p.type) { type = p.type; build(p.type); }
          setP(micF.gain, (p.mic - 0.5) * 12, live);
          setP(roomIn.gain, p.room * 0.5, live);
          setP(out.gain, 1, live);
        },
      };
    },
  },
  gate: {
    name: 'Noise Gate', icon: '⊘',
    params: [
      { id: 'thr', label: 'Threshold', min: -90, max: -10, def: -55, unit: 'dB' },
      { id: 'rel', label: 'Release', min: 10, max: 500, def: 80, log: true, unit: 'ms' },
    ],
    create(ctx) {
      const g = new AudioWorkletNode(ctx, 'gate', { outputChannelCount: [2] });
      return {
        input: g, output: g,
        reduction: () => -(g._red || 0),
        set(p) { g.parameters.get('thr').value = p.thr; g.parameters.get('rel').value = p.rel; },
      };
    },
  },
  trem: {
    name: 'Tremolo', icon: '∿',
    params: [
      { id: 'rate', label: 'Rate', options: ['1/16', '1/8', '1/8T', '1/4', '1/2'], def: '1/8' },
      { id: 'depth', label: 'Depth', min: 0, max: 1, def: 0.5, unit: '%', auto: true },
      { id: 'shape', label: 'Shape', options: ['Smooth', 'Choppy'], def: 'Smooth' },
    ],
    create(ctx, p, env) {
      const g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.start();
      lfo.connect(lg).connect(g.gain);
      return {
        input: g, output: g, osc: [lfo], ap: { depth: lg.gain },
        set(p, live) {
          const beats = { '1/16': 0.25, '1/8': 0.5, '1/8T': 1 / 3, '1/4': 1, '1/2': 2 }[p.rate] || 0.5;
          lfo.type = p.shape === 'Choppy' ? 'square' : 'sine';
          setP(lfo.frequency, env.bpm / 60 / beats, live);
          setP(g.gain, 1 - p.depth / 2, live);
          setP(lg.gain, p.depth / 2, live);
        },
      };
    },
  },
});

// One-click signal chains for the Input & Amp tab
const CHAIN_PRESETS = {
  guitar: {
    'Clean Sparkle': () => [newFx('gate', { thr: -62 }), newFx('comp', { thr: -24, ratio: 3, att: 15, makeup: 4 }), newFx('amp', { model: 'Clean', gain: 0.25, treble: 3, presence: 3 }), newFx('cab', { type: '2x12 Open', mic: 0.6 }), newFx('chorus', { mix: 0.25, depth: 0.4 }), newFx('reverb', { type: 'Hall', mix: 0.22 })],
    'Funk Clean': () => [newFx('comp', { thr: -30, ratio: 6, att: 5, makeup: 4 }), newFx('amp', { model: 'Clean', gain: 0.35, mid: 2, treble: 4 }), newFx('cab', { type: '1x12 Combo' }), newFx('phaser', { mix: 0.3, rate: 0.4 })],
    'Blues Crunch': () => [newFx('gate', { thr: -60 }), newFx('amp', { model: 'Crunch', gain: 0.45, mid: 3, treble: 1 }), newFx('cab', { type: '1x12 Combo', mic: 0.45 }), newFx('reverb', { type: 'Spring', mix: 0.2 })],
    'Rock Lead': () => [newFx('gate', { thr: -55 }), newFx('amp', { model: 'Lead', gain: 0.65, mid: 2, presence: 3 }), newFx('cab', { type: '4x12 Closed' }), newFx('delay', { time: '1/8.', mix: 0.18, fb: 0.35 }), newFx('reverb', { type: 'Plate', mix: 0.18 })],
    'Metal': () => [newFx('gate', { thr: -45, rel: 40 }), newFx('eq', { hp: 80 }), newFx('amp', { model: 'Metal', gain: 0.8, bass: 3, mid: -4, treble: 3, presence: 4 }), newFx('cab', { type: '4x12 Closed', mic: 0.55 }), newFx('eq', { hp: 90, lp: 9000 })],
    'Fuzz Stoner': () => [newFx('gate', { thr: -55 }), newFx('amp', { model: 'Fuzz', gain: 0.7, bass: 4, treble: -2 }), newFx('cab', { type: '4x12 Closed', mic: 0.35, room: 0.3 }), newFx('reverb', { type: 'Room', mix: 0.15 })],
    'Surf Tremolo': () => [newFx('amp', { model: 'Clean', gain: 0.3, treble: 4, master: 5 }), newFx('cab', { type: '2x12 Open' }), newFx('trem', { rate: '1/8', depth: 0.6 }), newFx('reverb', { type: 'Spring', mix: 0.4 })],
    'Ambient Wash': () => [newFx('amp', { model: 'Clean', gain: 0.2, master: 12 }), newFx('cab', { type: '2x12 Open', mic: 0.4 }), newFx('chorus', { mix: 0.35 }), newFx('delay', { pp: 'Ping-pong', time: '1/4.', fb: 0.6, mix: 0.4 }), newFx('reverb', { type: 'Cathedral', mix: 0.5 })],
    'Bass Amp': () => [newFx('comp', { thr: -24, ratio: 4, att: 10, makeup: 4 }), newFx('amp', { model: 'Bass', gain: 0.3, bass: 3, mid: -2 }), newFx('cab', { type: '4x10 Bass', room: 0.05 })],
    'Acoustic (pickup)': () => [newFx('eq', { hp: 70, m1f: 250, m1g: -4, hg: 3 }), newFx('comp', { thr: -20, ratio: 3, makeup: 3 }), newFx('reverb', { type: 'Room', mix: 0.2 })],
    'No amp (direct)': () => [],
  },
  vocal: {
    'Pop Vocal Chain': () => [newFx('eq', { hp: 90, m1f: 300, m1g: -2, hg: 3 }), newFx('comp', { thr: -22, ratio: 4, att: 5, makeup: 5 }), newFx('deess', { amount: 0.5 }), newFx('reverb', { type: 'Plate', mix: 0.18 })],
    'Rap Vocal': () => [newFx('eq', { hp: 100, m2f: 3000, m2g: 3 }), newFx('comp', { thr: -26, ratio: 6, att: 3, makeup: 8 }), newFx('deess', { amount: 0.6 }), newFx('sat', { drive: 0.15, mix: 0.4, out: -1 })],
    'Radio / Telephone': () => [newFx('eq', { hp: 500, lp: 3500, m1f: 1500, m1g: 6 }), newFx('sat', { drive: 0.5, mix: 1, out: -4 }), newFx('comp', { thr: -20, ratio: 8 })],
    'Dreamy Vocal': () => [newFx('eq', { hp: 120, hg: 4 }), newFx('comp', { thr: -20, ratio: 3 }), newFx('doubler', { amount: 0.6 }), newFx('delay', { time: '1/4', fb: 0.45, mix: 0.25 }), newFx('reverb', { type: 'Cathedral', mix: 0.4 })],
    'Podcast / Voice-over': () => [newFx('gate', { thr: -60 }), newFx('eq', { hp: 80, m1f: 250, m1g: -2, hg: 2 }), newFx('comp', { thr: -24, ratio: 4, makeup: 6 }), newFx('deess', {}), newFx('limiter', { gain: 3 })],
    'Raw (no effects)': () => [],
  },
};

const FX_ORDER = ['gate', 'amp', 'cab', 'eq', 'comp', 'sat', 'filter', 'trem', 'chorus', 'phaser', 'doubler', 'deess', 'delay', 'reverb', 'crush', 'width', 'pump', 'limiter'];

function newFx(type, over = {}) {
  const p = {};
  for (const sp of FX[type].params) p[sp.id] = sp.def;
  return { id: 'f' + Math.random().toString(36).slice(2, 9), type, on: true, p: Object.assign(p, over) };
}
// normalized 0..1 <-> value for knobs & automation
function toNorm(sp, v) {
  if (sp.options) return sp.options.indexOf(v) / Math.max(1, sp.options.length - 1);
  if (sp.log) return Math.log(v / sp.min) / Math.log(sp.max / sp.min);
  return (v - sp.min) / (sp.max - sp.min);
}
function fromNorm(sp, n) {
  n = Math.max(0, Math.min(1, n));
  if (sp.options) return sp.options[Math.round(n * (sp.options.length - 1))];
  if (sp.log) return sp.min * Math.pow(sp.max / sp.min, n);
  return sp.min + n * (sp.max - sp.min);
}
function fmtVal(sp, v) {
  if (sp.options) return v;
  if (sp.unit === '%') return Math.round(v * 100) + '%';
  if (sp.unit === 'Hz') return v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + 'k' : Math.round(v) + '';
  if (sp.unit === 'ms') return (v < 10 ? v.toFixed(1) : Math.round(v)) + 'ms';
  if (sp.unit === 'dB') return (v > 0 ? '+' : '') + v.toFixed(1);
  if (sp.unit === ':1') return v.toFixed(1) + ':1';
  if (sp.unit === 's') return v.toFixed(2) + 's';
  if (sp.unit === 'x') return Math.round(v) + 'x';
  return Math.abs(v) < 10 ? v.toFixed(1) : Math.round(v) + '';
}

const MASTER_PRESETS = {
  'Clean': [newFx('limiter', { gain: 1, ceil: -1 })],
  'Loud & Punchy': [newFx('eq', { lg: 2, hg: 1.5, hp: 30 }), newFx('comp', { thr: -16, ratio: 3, att: 25, rel: 120, makeup: 3 }), newFx('limiter', { gain: 6, ceil: -0.8 })],
  'Warm': [newFx('sat', { mode: 'Tape', drive: 0.2, mix: 0.5, out: -2 }), newFx('eq', { hg: -1.5, lg: 1 }), newFx('limiter', { gain: 3, ceil: -1 })],
  'Bright & Wide': [newFx('eq', { hg: 3, hp: 30 }), newFx('width', { width: 1.35 }), newFx('limiter', { gain: 4, ceil: -1 })],
  'Lo-fi Tape': [newFx('crush', { bits: 12, down: 2, tone: 7000, mix: 0.5 }), newFx('sat', { drive: 0.35, mix: 0.6, out: -3 }), newFx('eq', { hp: 60, lp: 9000 }), newFx('limiter', { gain: 2, ceil: -1 })],
};
