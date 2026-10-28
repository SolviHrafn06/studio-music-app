// Audio engine: mixer graph with effect chains, transport/scheduler, automation, recording,
// tempo-stretching, offline export.

const AT_LAT = 0.025; // Auto-Tune processing latency (must match worklets.js)

const Buffers = {
  map: new Map(),
  peaks: new Map(),
  add(buf, id) {
    id = id || 'b' + Math.random().toString(36).slice(2, 10);
    this.map.set(id, buf);
    this.peaks.set(id, computePeaks(buf));
    return id;
  },
  get(id) { return this.map.get(id); },
  clear() { this.map.clear(); this.peaks.clear(); Engine.stretchCache.clear(); },
};

const Worker1 = {
  w: null, n: 0, pending: new Map(),
  call(msg, transfer) {
    if (!this.w) {
      this.w = new Worker('js/analysis-worker.js');
      this.w.onmessage = (e) => { const p = this.pending.get(e.data.id); if (p) { this.pending.delete(e.data.id); p(e.data); } };
    }
    const id = ++this.n;
    return new Promise((res) => { this.pending.set(id, res); this.w.postMessage({ ...msg, id }, transfer || []); });
  },
};

function laneValue(lane, beat) {
  const p = lane.pts;
  if (!p.length) return 0.5;
  if (beat <= p[0].b) return p[0].v;
  for (let i = 1; i < p.length; i++) {
    if (beat <= p[i].b) {
      const a = p[i - 1], b = p[i];
      return a.v + ((b.v - a.v) * (beat - a.b)) / Math.max(1e-6, b.b - a.b);
    }
  }
  return p[p.length - 1].v;
}

const Engine = {
  ctx: null,
  nodes: new Map(),
  sources: new Set(),
  stretchCache: new Map(),
  playing: false,
  recording: false,
  metronome: false,
  anchors: [],
  env: { bpm: 120 },

  async init() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule('js/worklets.js');
    this.bus = this.buildMaster(this.ctx, this.ctx.destination, this.env);
    this.silent = this.ctx.createGain();
    this.silent.gain.value = 0;
    this.silent.connect(this.ctx.destination);
    this.previewBus = this.ctx.createGain();
    this.previewBus.gain.value = 0.9;
    this.previewBus.connect(this.bus.input);
  },

  buildMaster(ctx, dest, env) {
    const input = ctx.createGain();
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(ctx);
    const revIn = ctx.createGain();
    const revOut = ctx.createGain();
    revOut.gain.value = 0.8;
    revIn.connect(reverb).connect(revOut).connect(input);
    const dlyIn = ctx.createGain();
    const dly = ctx.createDelay(3);
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const lp = filter(ctx, 'lowpass', 3500);
    dlyIn.connect(dly);
    dly.connect(lp);
    lp.connect(fb).connect(dly);
    lp.connect(input);
    const fxIn = ctx.createGain(), fxOut = ctx.createGain();
    input.connect(fxIn);
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -3;
    comp.knee.value = 3;
    comp.ratio.value = 12;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;
    const vol = ctx.createGain();
    vol.gain.value = 0.9;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    fxOut.connect(comp).connect(vol).connect(analyser).connect(dest);
    const m = { input, revIn, dlyIn, dly, vol, analyser, fxIn, fxOut, fx: [], fxKey: null };
    this.buildFx(ctx, m, [], env);
    return m;
  },

  createTrackChain(ctx, tr, bus, env) {
    const n = {};
    n.input = ctx.createGain();
    let head = n.input;
    if (tr.type === 'audio') {
      const a = tr.autotune;
      n.at = new AudioWorkletNode(ctx, 'autotune', {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2],
        processorOptions: { mask: scaleMask(a.key, a.scale), harm: a.harm && a.harm.on ? a.harm.voices : [] },
      });
      n.maskKey = scaleMask(a.key, a.scale).join();
      n.harmKey = JSON.stringify(a.harm && a.harm.on ? a.harm.voices : []);
      head.connect(n.at);
      head = n.at;
    }
    n.fxIn = ctx.createGain();
    n.fxOut = ctx.createGain();
    head.connect(n.fxIn);
    n.low = filter(ctx, 'lowshelf', 220);
    n.mid = filter(ctx, 'peaking', 1200, 0.8);
    n.high = filter(ctx, 'highshelf', 5500);
    n.vol = ctx.createGain();
    n.autoVol = ctx.createGain();
    n.pan = ctx.createStereoPanner();
    n.rev = ctx.createGain();
    n.dly = ctx.createGain();
    n.meter = ctx.createAnalyser();
    n.meter.fftSize = 512;
    n.fxOut.connect(n.low).connect(n.mid).connect(n.high).connect(n.vol).connect(n.autoVol).connect(n.pan).connect(bus.input);
    n.pan.connect(n.rev).connect(bus.revIn);
    n.pan.connect(n.dly).connect(bus.dlyIn);
    n.pan.connect(n.meter);
    n.fx = [];
    n.fxKey = null;
    this.buildFx(ctx, n, tr.fx || [], env);
    return n;
  },

  fxKeyOf(list) { return list.map((f) => f.id + f.type + (f.on ? 1 : 0)).join('|'); },
  buildFx(ctx, n, list, env) {
    try { n.fxIn.disconnect(); } catch (e) {}
    for (const f of n.fx) {
      try { f.inst.output.disconnect(); } catch (e) {}
      (f.inst.osc || []).forEach((o) => { try { o.stop(); } catch (e) {} });
    }
    n.fx = list.filter((f) => f.on).map((f) => {
      const inst = FX[f.type].create(ctx, f.p, env);
      inst.set(f.p, false);
      return { id: f.id, type: f.type, on: true, inst };
    });
    let head = n.fxIn;
    for (const f of n.fx) { head.connect(f.inst.input); head = f.inst.output; }
    head.connect(n.fxOut);
    n.fxKey = this.fxKeyOf(list);
  },

  autoTarget(tr, n, target) {
    if (target === 'vol') return { param: n.autoVol.gain, map: (v) => v * 1.25 };
    if (target === 'pan') return { param: n.pan.pan, map: (v) => v * 2 - 1 };
    const m = /^fx:([^:]+):(.+)$/.exec(target);
    if (!m) return null;
    const f = n.fx.find((x) => x.id === m[1]);
    const def = (tr.fx || []).find((x) => x.id === m[1]);
    if (!f || !def || !f.inst.ap || !f.inst.ap[m[2]]) return null;
    const sp = FX[def.type].params.find((p) => p.id === m[2]);
    if (sp.unit === '%' && m[2] === 'mix' && def.type === 'doubler') return { param: f.inst.ap[m[2]], map: (v) => v * 0.7 };
    return { param: f.inst.ap[m[2]], map: (v) => fromNorm(sp, v) };
  },
  activeLane(tr, target) { return (tr.auto || []).find((l) => l.target === target && l.pts.length); },

  applyTrack(n, tr, anySolo, P, live) {
    const set = (p, v) => setP(p, v, live);
    const audible = !tr.mute && (!anySolo || tr.solo);
    const volLane = this.activeLane(tr, 'vol'), panLane = this.activeLane(tr, 'pan');
    set(n.vol.gain, audible ? (volLane ? 1 : tr.volume) : 0);
    if (!panLane) set(n.pan.pan, tr.pan);
    set(n.rev.gain, tr.rev);
    set(n.dly.gain, tr.dly);
    set(n.low.gain, tr.eq.low);
    set(n.mid.gain, tr.eq.mid);
    set(n.high.gain, tr.eq.high);
    const fxList = tr.fx || [];
    if (n.fxKey !== this.fxKeyOf(fxList)) this.buildFx(n.input.context, n, fxList, live ? this.env : n.env || this.env);
    for (const f of n.fx) { const d = fxList.find((x) => x.id === f.id); if (d) f.inst.set(d.p, live); }
    if (!this.playing || !live) {
      const beat = live ? App.playhead : 0;
      for (const lane of tr.auto || []) {
        if (!lane.pts.length) continue;
        const t = this.autoTarget(tr, n, lane.target);
        if (t) { t.param.cancelScheduledValues(0); t.param.value = t.map(laneValue(lane, beat)); }
      }
      if (!volLane) n.autoVol.gain.value = 1;
    }
    if (n.at && tr.autotune) {
      const a = tr.autotune, pa = (k) => n.at.parameters.get(k);
      pa('bypass').value = a.on ? 0 : 1;
      pa('speed').value = a.speed;
      pa('amount').value = a.amount;
      pa('robot').value = a.robot || 0;
      pa('harmony').value = a.harmony ? 1 : 0;
      pa('formant').value = a.formant || 0;
      pa('shift').value = a.shift || 0;
      pa('harmMix').value = a.harm ? a.harm.mix ?? 0.6 : 0.6;
      const mask = scaleMask(a.key, a.scale).join();
      if (n.maskKey !== mask) { n.maskKey = mask; n.at.port.postMessage({ mask: scaleMask(a.key, a.scale) }); }
      const hk = JSON.stringify(a.harm && a.harm.on ? a.harm.voices : []);
      if (n.harmKey !== hk) { n.harmKey = hk; n.at.port.postMessage({ harm: a.harm && a.harm.on ? a.harm.voices : [] }); }
    }
  },

  sync(P) {
    if (!this.ctx) return;
    this.env.bpm = P.bpm;
    const ids = new Set(P.tracks.map((t) => t.id));
    for (const [id, n] of this.nodes) {
      if (!ids.has(id)) {
        try { n.pan.disconnect(); n.input.disconnect(); } catch (e) {}
        this.nodes.delete(id);
      }
    }
    const anySolo = P.tracks.some((t) => t.solo);
    for (const tr of P.tracks) {
      let n = this.nodes.get(tr.id);
      if (!n) { n = this.createTrackChain(this.ctx, tr, this.bus, this.env); this.nodes.set(tr.id, n); }
      this.applyTrack(n, tr, anySolo, P, true);
    }
    const m = this.bus, mfx = P.master.fx;
    if (m.fxKey !== this.fxKeyOf(mfx)) this.buildFx(this.ctx, m, mfx, this.env);
    for (const f of m.fx) { const d = mfx.find((x) => x.id === f.id); if (d) f.inst.set(d.p, true); }
    setP(m.vol.gain, P.master.volume, true);
    this.bus.dly.delayTime.setTargetAtTime((60 / P.bpm) * 0.75, this.ctx.currentTime, 0.05);
  },

  ensureInstruments(P) {
    const names = new Set();
    for (const t of P.tracks) if (t.type === 'synth' && t.inst.kind === 'sampler') names.add(t.inst.name);
    return Promise.all([...names].map((nm) => Sampler.load(nm, this.ctx)));
  },

  // audio clip buffer, following the song tempo when "stretch" is on
  clipBuffer(c, P) {
    const buf = Buffers.get(c.buf);
    if (!buf || !c.stretch || !c.srcBpm || Math.abs(c.srcBpm - P.bpm) < 0.01) return { buf, ratio: 1 };
    const ratio = c.srcBpm / P.bpm;
    const key = c.buf + '@' + ratio.toFixed(4);
    const hit = this.stretchCache.get(key);
    if (hit && hit.buf) return { buf: hit.buf, ratio };
    if (!hit) {
      const entry = {};
      this.stretchCache.set(key, entry);
      const chans = [];
      for (let ch = 0; ch < buf.numberOfChannels; ch++) chans.push(buf.getChannelData(ch).slice());
      entry.promise = Worker1.call({ cmd: 'stretch', chans, sr: buf.sampleRate, ratio }, chans.map((x) => x.buffer)).then((r) => {
        const nb = new AudioBuffer({ numberOfChannels: r.chans.length, length: r.chans[0].length, sampleRate: buf.sampleRate });
        r.chans.forEach((d, i) => nb.copyToChannel(d, i));
        entry.buf = nb;
        Buffers.peaks.set(key, computePeaks(nb));
        if (typeof TL !== 'undefined') TL.draw();
        return nb;
      });
    }
    return { buf, ratio: 1, pending: hit ? hit.promise : this.stretchCache.get(key).promise };
  },
  async ensureStretched(P) {
    const ps = [];
    for (const t of P.tracks) if (t.type === 'audio') for (const c of t.clips) { const r = this.clipBuffer(c, P); if (r.pending) ps.push(r.pending); }
    await Promise.all(ps);
  },

  // Schedules everything that happens on one 16th-note step. Shared by live playback and export.
  scheduleStep(ctx, P, step, time, jump, nodes, reg) {
    const spStep = 60 / P.bpm / 4, spBeat = spStep * 4;
    for (const tr of P.tracks) {
      const n = nodes.get(tr.id);
      if (!n) continue;
      for (const f of n.fx) if (f.inst.schedule) f.inst.schedule(step, time, spStep);
      if (tr.auto && tr.auto.length) {
        for (const lane of tr.auto) {
          if (!lane.pts.length) continue;
          const t = this.autoTarget(tr, n, lane.target);
          if (!t) continue;
          const v0 = t.map(laneValue(lane, step / 4)), v1 = t.map(laneValue(lane, (step + 1) / 4));
          if (jump) { t.param.cancelScheduledValues(time); t.param.setValueAtTime(v0, time); }
          t.param.linearRampToValueAtTime(v1, time + spStep);
        }
      }
      for (const c of tr.clips) {
        const s0 = Math.round(c.start * 4), s1 = Math.round((c.start + c.length) * 4);
        if (step < s0 || step >= s1) continue;
        const rel = step - s0;
        if (tr.type === 'drums') {
          const pat = tr.patterns[c.pattern];
          if (!pat) continue;
          const ps = (rel + (c.off || 0)) % pat.len;
          for (const ch of tr.channels) {
            const v = pat.steps[ch.id] && pat.steps[ch.id][ps];
            if (!v || ch.mute) continue;
            const hits = v >= 2 ? Math.round(v) : 1, vel = v >= 2 ? 0.85 : v;
            const sw = ps % 2 === 1 ? (tr.swing || 0) * spStep * 0.66 : 0;
            for (let h = 0; h < hits; h++) {
              playDrum(ctx, n.input, ch.kind, time + sw + (h * spStep) / hits, vel * ch.vol * (h ? 0.85 : 1), ch.sample ? Buffers.get(ch.sample) : null, reg, tr.kit || 'Classic', ch.pitch || 0);
            }
          }
        } else if (tr.type === 'synth') {
          const clipSteps = s1 - s0;
          if (tr.arp && tr.arp.on) this.arpStep(ctx, tr, c, n, rel, s0, clipSteps, time, spStep, reg);
          else {
            for (const nt of c.notes) {
              if (Math.floor(nt.s + 1e-6) !== rel || nt.s >= clipSteps) continue;
              playInstrument(ctx, n.input, tr.inst, nt.p, time + (nt.s - rel) * spStep, nt.d * spStep, nt.v ?? 0.8, reg);
            }
          }
        } else if (tr.type === 'audio') {
          if (!(rel === 0 || jump)) continue;
          const { buf, ratio } = this.clipBuffer(c, P);
          if (!buf) continue;
          let off = (c.offset || 0) * ratio + rel * spStep;
          const clipDur = (s1 - s0) * spStep;
          let tc = rel * spStep;
          let startT = time - (tr.autotune && tr.autotune.on ? AT_LAT : 0);
          if (startT < ctx.currentTime) { const d = ctx.currentTime - startT; off += d; tc += d; startT = ctx.currentTime; }
          const dur = clipDur - tc;
          if (off >= buf.duration || dur <= 0) continue;
          const src = ctx.createBufferSource();
          src.buffer = buf;
          const g = ctx.createGain();
          const base = c.gain ?? 1;
          const fi = (c.fadeIn || 0) * spBeat, fo = (c.fadeOut || 0) * spBeat;
          const env = (x) => base * (fi > 0 ? Math.min(1, x / fi) : 1) * (fo > 0 ? Math.min(1, Math.max(0, (clipDur - x) / fo)) : 1);
          g.gain.setValueAtTime(env(tc), startT);
          if (fi > 0 && tc < fi) g.gain.linearRampToValueAtTime(env(fi), startT + (fi - tc));
          if (fo > 0) {
            const foStart = Math.max(tc, clipDur - fo);
            g.gain.setValueAtTime(env(foStart), startT + (foStart - tc));
            g.gain.linearRampToValueAtTime(0, startT + (clipDur - tc));
          }
          src.connect(g).connect(n.input);
          src.start(startT, off, Math.min(dur, buf.duration - off));
          reg(src);
        }
      }
    }
  },

  arpStep(ctx, tr, c, n, rel, s0, clipSteps, time, spStep, reg) {
    const a = tr.arp, rate = a.rate || 1;
    const subs = rate < 1 ? Math.round(1 / rate) : 1;
    for (let k = 0; k < subs; k++) {
      const pos = rel + k * rate;
      const gidx = Math.round((s0 + pos) / rate);
      if (rate > 1 && Math.abs(pos / rate - Math.round(pos / rate)) > 1e-6) continue;
      const held = c.notes.filter((nt) => nt.s <= pos + 1e-6 && nt.s + nt.d > pos + 1e-6 && nt.s < clipSteps).map((nt) => nt.p).sort((x, y) => x - y);
      if (!held.length) continue;
      const seq = [];
      for (let o = 0; o < (a.oct || 1); o++) held.forEach((p) => seq.push(p + 12 * o));
      let notes;
      if (a.mode === 'chord') notes = held;
      else {
        let idx;
        const L = seq.length;
        if (a.mode === 'down') idx = L - 1 - (gidx % L);
        else if (a.mode === 'updown') { const per = Math.max(1, 2 * L - 2); const q = gidx % per; idx = q < L ? q : per - q; }
        else if (a.mode === 'random') idx = Math.abs(Math.sin(gidx * 12.9898) * 43758.5453) % 1 * L | 0;
        else idx = gidx % L;
        notes = [seq[idx]];
      }
      for (const p of notes) playInstrument(ctx, n.input, tr.inst, p, time + k * rate * spStep, rate * spStep * (a.gate || 0.8), 0.8, reg);
    }
  },

  reg(s) {
    Engine.sources.add(s);
    s.addEventListener('ended', () => Engine.sources.delete(s));
  },

  songEnd(P) {
    let e = 0;
    for (const t of P.tracks) for (const c of t.clips) e = Math.max(e, c.start + c.length);
    return e;
  },

  play(fromBeat) {
    if (this.playing) this.stop(true);
    const ctx = this.ctx;
    if (ctx.state !== 'running') ctx.resume();
    this.ensureStretched(App.project);
    this.playing = true;
    this.step = Math.floor(fromBeat * 4 + 1e-6);
    this.nextTime = ctx.currentTime + 0.08;
    this.anchors = [{ time: this.nextTime, step: this.step }];
    this.jump = true;
    this.endStep = Math.round(this.songEnd(App.project) * 4);
    this.timer = setInterval(() => this.tick(), 20);
    this.tick();
    return this.nextTime;
  },

  tick() {
    const ctx = this.ctx, P = App.project;
    const spStep = 60 / P.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const L = P.loop;
      if (L.on && L.end > L.start && this.step >= Math.round(L.end * 4)) {
        this.step = Math.round(L.start * 4);
        this.anchors.push({ time: this.nextTime, step: this.step });
        this.jump = true;
      } else if (!L.on && !this.recording && !App.midiRec && this.endStep > 0 && this.step >= this.endStep) {
        const when = (this.nextTime - ctx.currentTime) * 1000;
        clearInterval(this.timer);
        this.timer = null;
        setTimeout(() => App.stop(true), Math.max(0, when));
        return;
      }
      this.scheduleStep(ctx, P, this.step, this.nextTime, this.jump, this.nodes, this.reg);
      if ((this.metronome || (this.recording && App.countClick)) && this.step % 4 === 0) playClick(ctx, this.bus.input, this.nextTime, this.step % 16 === 0);
      this.jump = false;
      this.step++;
      this.nextTime += spStep;
    }
  },

  beat() {
    if (!this.playing) return null;
    const now = this.ctx.currentTime;
    const spStep = 60 / App.project.bpm / 4;
    while (this.anchors.length > 1 && this.anchors[1].time <= now) this.anchors.shift();
    const a = this.anchors[0];
    return Math.max(a.step, a.step + (now - a.time) / spStep) / 4;
  },

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.sources) { try { s.stop(); } catch (e) {} }
    this.sources.clear();
    this.playing = false;
    for (const n of this.nodes.values()) for (const f of n.fx) if (f.inst.reset) f.inst.reset();
    for (const f of this.bus.fx) if (f.inst.reset) f.inst.reset();
    if (App.project) this.sync(App.project);
  },

  // ---- inputs (mics, audio interfaces, guitars) / monitoring / recording ----
  inputs: new Map(),
  monitors: new Set(),
  async openInput(deviceId = 'default') {
    const key = deviceId || 'default';
    if (this.inputs.has(key)) return this.inputs.get(key);
    const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: { ideal: 2 }, latency: { ideal: 0.003 } };
    if (key !== 'default') audio.deviceId = { exact: key };
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio }); }
    catch (e) {
      if (key === 'default') throw e;
      toast('That input device is not available — using the default input.', 4000);
      return this.openInput('default');
    }
    const ctx = this.ctx, src = ctx.createMediaStreamSource(stream);
    const split = ctx.createChannelSplitter(2);
    src.connect(split);
    const mono = ctx.createGain();
    mono.channelCount = 1; mono.channelCountMode = 'explicit'; mono.channelInterpretation = 'speakers';
    src.connect(mono);
    const c1 = ctx.createGain(), c2 = ctx.createGain();
    split.connect(c1, 0); split.connect(c2, 1);
    const settings = stream.getAudioTracks()[0].getSettings ? stream.getAudioTracks()[0].getSettings() : {};
    const e = { key, stream, src, nodes: { mono, '1': c1, '2': c2, stereo: src }, chans: settings.channelCount || 1, label: stream.getAudioTracks()[0].label };
    this.inputs.set(key, e);
    return e;
  },
  // the (gain-adjusted) input signal feeding a track, according to the track's input settings
  async trackInput(tr) {
    const n = this.nodes.get(tr.id);
    if (!n) throw new Error('track not ready');
    const inp = tr.input || { device: 'default', ch: 'mono' };
    const e = await this.openInput(inp.device);
    const srcNode = e.nodes[inp.ch] || e.nodes.mono;
    if (!n.inGain) {
      n.inGain = this.ctx.createGain();
      n.inMeter = this.ctx.createAnalyser();
      n.inMeter.fftSize = 4096;
      n.inGain.connect(n.inMeter);
    }
    if (n.inSrc !== srcNode) {
      if (n.inSrc) try { n.inSrc.disconnect(n.inGain); } catch (x) {}
      srcNode.connect(n.inGain);
      n.inSrc = srcNode;
    }
    n.inGain.gain.value = Math.pow(10, (tr.inGain || 0) / 20);
    return n.inGain;
  },
  async setTrackMonitor(trackId, on) {
    const tr = App.track(trackId), n = this.nodes.get(trackId);
    if (!tr || !n) return;
    const node = await this.trackInput(tr);
    try { node.disconnect(n.input); } catch (x) {}
    if (on) { node.connect(n.input); this.monitors.add(trackId); }
    else this.monitors.delete(trackId);
    this.monitorId = this.monitors.size ? [...this.monitors][0] : null;
  },
  // legacy single-monitor helper: monitor exactly this track (or none)
  async setMonitor(trackId) {
    for (const id of [...this.monitors]) if (id !== trackId) await this.setTrackMonitor(id, false);
    if (trackId) await this.setTrackMonitor(trackId, true);
  },
  async refreshInputs(P) {
    // re-route tracks whose input changed and close devices nobody uses any more
    for (const tr of P.tracks) {
      const n = this.nodes.get(tr.id);
      if (tr.type === 'audio' && n && n.inGain) await this.trackInput(tr);
    }
    const used = new Set(P.tracks.filter((t) => t.type === 'audio').map((t) => (t.input && t.input.device) || 'default'));
    for (const [k, e] of this.inputs) {
      const live = [...this.nodes.values()].some((n) => n.inSrc && Object.values(e.nodes).includes(n.inSrc));
      if (!used.has(k) && !live) { e.stream.getTracks().forEach((t) => t.stop()); this.inputs.delete(k); }
    }
  },
  async setOutput(deviceId) {
    if (!this.ctx.setSinkId) throw new Error('Choosing an output device is not supported here');
    await this.ctx.setSinkId(deviceId === 'default' ? '' : deviceId);
  },
  latencyMs() { return Math.round(((this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0)) * 1000); },

  async startRecord(trackId, fromBeat) {
    const tr = App.track(trackId);
    const inNode = await this.trackInput(tr);
    const rec = new AudioWorkletNode(this.ctx, 'recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const P = App.project;
    const info = { trackId, chunks: [], first: null, startBeat: Math.floor(fromBeat * 4 + 1e-6) / 4, loop: P.loop.on && P.loop.end > P.loop.start ? { ...P.loop } : null, bpm: P.bpm, inNode };
    rec.port.onmessage = (e) => {
      if (info.first === null) info.first = e.data.t;
      info.chunks.push(e.data.d);
    };
    inNode.connect(rec);
    rec.connect(this.silent);
    this.rec = rec;
    this.recInfo = info;
    this.recording = true;
    info.t0 = this.play(fromBeat);
  },

  async finishRecord() {
    const info = this.recInfo, rec = this.rec;
    this.recording = false;
    if (!info) return null;
    rec.port.postMessage('flush');
    await new Promise((r) => setTimeout(r, 120));
    try { info.inNode.disconnect(rec); rec.disconnect(); } catch (e) {}
    this.rec = null;
    this.recInfo = null;
    if (!info.chunks.length) return null;
    const sr = this.ctx.sampleRate;
    const total = info.chunks.reduce((a, c) => a + c.length, 0);
    const all = new Float32Array(total);
    let o = 0;
    for (const c of info.chunks) { all.set(c, o); o += c.length; }
    const latency = (this.ctx.outputLatency || 0) + (this.ctx.baseLatency || 0);
    const trim = Math.max(0, Math.round((info.t0 - info.first + latency) * sr));
    const data = all.subarray(trim);
    if (data.length < sr * 0.1) return null;
    const spb = 60 / info.bpm;
    const mk = (arr) => { const b = this.ctx.createBuffer(1, arr.length, sr); b.copyToChannel(arr, 0); return Buffers.add(b); };
    const L = info.loop;
    if (L && info.startBeat < L.end) {
      // loop recording: every full pass through the loop becomes a take
      const first = Math.round((L.end - info.startBeat) * spb * sr), passLen = Math.round((L.end - L.start) * spb * sr);
      const takes = [];
      if (info.startBeat <= L.start + 1e-6 && data.length >= first * 0.98) takes.push(mk(data.subarray(0, first)));
      for (let p = first; p + passLen * 0.98 <= data.length; p += passLen) takes.push(mk(data.subarray(p, Math.min(data.length, p + passLen))));
      if (takes.length) {
        return { buf: takes[takes.length - 1], takes, start: L.start, length: L.end - L.start, trackId: info.trackId, srcBpm: info.bpm };
      }
    }
    const id = mk(data);
    return { buf: id, takes: [id], start: info.startBeat, length: data.length / sr / spb, trackId: info.trackId, srcBpm: info.bpm };
  },

  // ---- export ----
  async render(P, opts = {}) {
    const sr = 44100;
    const end = this.songEnd(P);
    if (!end) throw new Error('Nothing to export yet — add some clips first.');
    await this.ensureInstruments(P);
    await this.ensureStretched(P);
    const spStep = 60 / P.bpm / 4;
    const len = Math.ceil((end * 4 * spStep + (opts.tail ?? 3)) * sr);
    const ctx = new OfflineAudioContext(2, len, sr);
    await ctx.audioWorklet.addModule('js/worklets.js');
    const env = { bpm: P.bpm };
    const bus = this.buildMaster(ctx, ctx.destination, env);
    bus.dly.delayTime.value = (60 / P.bpm) * 0.75;
    if (!opts.noMaster) {
      this.buildFx(ctx, bus, P.master.fx, env);
      bus.vol.gain.value = P.master.volume;
    }
    const nodes = new Map();
    const tracks = opts.only ? P.tracks.filter((t) => t.id === opts.only) : P.tracks;
    const PP = { ...P, tracks };
    const anySolo = !opts.only && tracks.some((t) => t.solo);
    for (const tr of tracks) {
      const n = this.createTrackChain(ctx, tr, bus, env);
      n.env = env;
      const t2 = opts.only ? { ...tr, mute: false, solo: false } : tr;
      this.applyTrack(n, t2, anySolo, PP, false);
      nodes.set(tr.id, n);
    }
    const OFF = 0.05;
    for (let s = 0; s < Math.round(end * 4); s++) this.scheduleStep(ctx, PP, s, s * spStep + OFF, s === 0, nodes, noop);
    const out = await ctx.startRendering();
    // drop the small scheduling lead-in
    const lead = Math.round(OFF * sr);
    const res = new AudioBuffer({ numberOfChannels: 2, length: out.length - lead, sampleRate: sr });
    for (let c = 0; c < 2; c++) res.copyToChannel(out.getChannelData(c).subarray(lead), c);
    return res;
  },
};
