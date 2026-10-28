// Audio engine: mixer graph, transport/scheduler, recording, offline export.

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
  clear() { this.map.clear(); this.peaks.clear(); },
};

const Engine = {
  ctx: null,
  nodes: new Map(),
  sources: new Set(),
  playing: false,
  recording: false,
  metronome: false,
  anchors: [],

  async init() {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    await this.ctx.audioWorklet.addModule('js/worklets.js');
    this.bus = this.buildMaster(this.ctx, this.ctx.destination);
    this.silent = this.ctx.createGain();
    this.silent.gain.value = 0;
    this.silent.connect(this.ctx.destination);
    this.previewBus = this.ctx.createGain();
    this.previewBus.connect(this.bus.input);
  },

  buildMaster(ctx, dest) {
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
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -8;
    comp.knee.value = 6;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.15;
    const vol = ctx.createGain();
    vol.gain.value = 0.9;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    input.connect(comp).connect(vol).connect(analyser).connect(dest);
    return { input, revIn, dlyIn, dly, vol, analyser };
  },

  createTrackChain(ctx, tr, bus) {
    const n = {};
    n.input = ctx.createGain();
    let head = n.input;
    if (tr.type === 'audio') {
      const a = tr.autotune;
      n.at = new AudioWorkletNode(ctx, 'autotune', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { mask: scaleMask(a.key, a.scale) } });
      n.maskKey = scaleMask(a.key, a.scale).join();
      head.connect(n.at);
      head = n.at;
    }
    n.low = filter(ctx, 'lowshelf', 220);
    n.mid = filter(ctx, 'peaking', 1200, 0.8);
    n.high = filter(ctx, 'highshelf', 5500);
    n.vol = ctx.createGain();
    n.pan = ctx.createStereoPanner();
    n.rev = ctx.createGain();
    n.dly = ctx.createGain();
    n.meter = ctx.createAnalyser();
    n.meter.fftSize = 512;
    head.connect(n.low).connect(n.mid).connect(n.high).connect(n.vol).connect(n.pan).connect(bus.input);
    n.pan.connect(n.rev).connect(bus.revIn);
    n.pan.connect(n.dly).connect(bus.dlyIn);
    n.pan.connect(n.meter);
    return n;
  },

  applyTrack(n, tr, anySolo, offline) {
    const set = (p, v) => {
      if (offline || !this.ctx) p.value = v;
      else p.setTargetAtTime(v, this.ctx.currentTime, 0.015);
    };
    const audible = !tr.mute && (!anySolo || tr.solo);
    set(n.vol.gain, audible ? tr.volume : 0);
    set(n.pan.pan, tr.pan);
    set(n.rev.gain, tr.rev);
    set(n.dly.gain, tr.dly);
    set(n.low.gain, tr.eq.low);
    set(n.mid.gain, tr.eq.mid);
    set(n.high.gain, tr.eq.high);
    if (n.at && tr.autotune) {
      const a = tr.autotune;
      n.at.parameters.get('bypass').value = a.on ? 0 : 1;
      n.at.parameters.get('speed').value = a.speed;
      n.at.parameters.get('amount').value = a.amount;
      n.at.parameters.get('robot').value = a.robot || 0;
      n.at.parameters.get('harmony').value = a.harmony ? 1 : 0;
      const mask = scaleMask(a.key, a.scale).join();
      if (n.maskKey !== mask) {
        n.maskKey = mask;
        n.at.port.postMessage({ mask: scaleMask(a.key, a.scale) });
      }
    }
  },

  sync(P) {
    if (!this.ctx) return;
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
      if (!n) {
        n = this.createTrackChain(this.ctx, tr, this.bus);
        this.nodes.set(tr.id, n);
      }
      this.applyTrack(n, tr, anySolo, false);
    }
    this.bus.dly.delayTime.setTargetAtTime((60 / P.bpm) * 0.75, this.ctx.currentTime, 0.05);
  },

  // Schedules everything that happens on one 16th-note step. Shared by live playback and export.
  scheduleStep(ctx, P, step, time, jump, nodes, reg) {
    const spStep = 60 / P.bpm / 4;
    for (const tr of P.tracks) {
      const n = nodes.get(tr.id);
      if (!n) continue;
      for (const c of tr.clips) {
        const s0 = Math.round(c.start * 4), s1 = Math.round((c.start + c.length) * 4);
        if (step < s0 || step >= s1) continue;
        const rel = step - s0;
        if (tr.type === 'drums') {
          const pat = tr.patterns[c.pattern];
          if (!pat) continue;
          const ps = rel % pat.len;
          for (const ch of tr.channels) {
            const v = pat.steps[ch.id] && pat.steps[ch.id][ps];
            if (v && !ch.mute) playDrum(ctx, n.input, ch.kind, time, v * ch.vol, ch.sample ? Buffers.get(ch.sample) : null, reg);
          }
        } else if (tr.type === 'synth') {
          for (const nt of c.notes) {
            if (nt.s === rel) playNote(ctx, n.input, tr.instrument, nt.p, time, nt.d * spStep, nt.v ?? 0.8, reg);
          }
        } else if (tr.type === 'audio') {
          const buf = Buffers.get(c.buf);
          if (!buf) continue;
          if (rel === 0 || jump) {
            const off = (c.offset || 0) + rel * spStep;
            const dur = (s1 - step) * spStep;
            if (off < buf.duration) {
              const src = ctx.createBufferSource();
              src.buffer = buf;
              const g = ctx.createGain();
              g.gain.value = c.gain ?? 1;
              src.connect(g).connect(n.input);
              src.start(time, off, Math.min(dur, buf.duration - off));
              reg(src);
            }
          }
        }
      }
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
      } else if (!L.on && !this.recording && this.endStep > 0 && this.step >= this.endStep) {
        const when = (this.nextTime - ctx.currentTime) * 1000;
        clearInterval(this.timer);
        this.timer = null;
        setTimeout(() => App.stop(true), Math.max(0, when));
        return;
      }
      this.scheduleStep(ctx, P, this.step, this.nextTime, this.jump, this.nodes, this.reg);
      if (this.metronome && this.step % 4 === 0) playClick(ctx, this.bus.input, this.nextTime, this.step % 16 === 0);
      this.jump = false;
      this.step++;
      this.nextTime += spStep;
    }
  },

  // Current playhead position in beats
  beat() {
    if (!this.playing) return null;
    const now = this.ctx.currentTime;
    const spStep = 60 / App.project.bpm / 4;
    while (this.anchors.length > 1 && this.anchors[1].time <= now) this.anchors.shift();
    const a = this.anchors[0];
    return Math.max(a.step, a.step + (now - a.time) / spStep) / 4;
  },

  stop(keepTimer) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const s of this.sources) { try { s.stop(); } catch (e) {} }
    this.sources.clear();
    this.playing = false;
  },

  // ---- microphone / recording ----
  async getMic() {
    if (!this.mic) {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      this.micStream = stream;
      this.mic = this.ctx.createMediaStreamSource(stream);
    }
    return this.mic;
  },

  async setMonitor(trackId) {
    if (this.monitorTo) {
      try { this.mic.disconnect(this.monitorTo); } catch (e) {}
      this.monitorTo = null;
      this.monitorId = null;
    }
    if (!trackId) return;
    const mic = await this.getMic();
    const n = this.nodes.get(trackId);
    if (!n) return;
    mic.connect(n.input);
    this.monitorTo = n.input;
    this.monitorId = trackId;
  },

  async startRecord(trackId, fromBeat) {
    const mic = await this.getMic();
    const rec = new AudioWorkletNode(this.ctx, 'recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    const info = { trackId, chunks: [], first: null, startBeat: Math.floor(fromBeat * 4 + 1e-6) / 4 };
    rec.port.onmessage = (e) => {
      if (info.first === null) info.first = e.data.t;
      info.chunks.push(e.data.d);
    };
    mic.connect(rec);
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
    try { this.mic.disconnect(rec); rec.disconnect(); } catch (e) {}
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
    const len = total - trim;
    if (len < sr * 0.1) return null;
    const buf = this.ctx.createBuffer(1, len, sr);
    buf.copyToChannel(all.subarray(trim), 0);
    const id = Buffers.add(buf);
    return { buf: id, start: info.startBeat, length: buf.duration / (60 / App.project.bpm), trackId: info.trackId };
  },

  // ---- export ----
  async render(P) {
    const sr = 44100;
    const end = this.songEnd(P);
    if (!end) throw new Error('Nothing to export yet — add some clips first.');
    const spStep = 60 / P.bpm / 4;
    const len = Math.ceil((end * 4 * spStep + 3) * sr);
    const ctx = new OfflineAudioContext(2, len, sr);
    await ctx.audioWorklet.addModule('js/worklets.js');
    const bus = this.buildMaster(ctx, ctx.destination);
    bus.dly.delayTime.value = (60 / P.bpm) * 0.75;
    const nodes = new Map();
    const anySolo = P.tracks.some((t) => t.solo);
    for (const tr of P.tracks) {
      const n = this.createTrackChain(ctx, tr, bus);
      this.applyTrack(n, tr, anySolo, true);
      nodes.set(tr.id, n);
    }
    for (let s = 0; s < Math.round(end * 4); s++) this.scheduleStep(ctx, P, s, s * spStep + 0.02, false, nodes, noop);
    return await ctx.startRendering();
  },
};
