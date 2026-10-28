// Input & Amp tab (choose mic / interface input per track, monitor, tuner, amp & vocal chains)
// and the Audio Settings window.

const Devices = {
  ins: [], outs: [], granted: false,
  async refresh() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      this.ins = list.filter((d) => d.kind === 'audioinput');
      this.outs = list.filter((d) => d.kind === 'audiooutput');
      this.granted = this.ins.some((d) => d.label);
    } catch (e) { this.ins = []; this.outs = []; }
    return this;
  },
  label(d, i) {
    if (d.deviceId === 'default') return 'System default' + (d.label ? ' (' + d.label.replace(/^Default - /, '') + ')' : '');
    if (d.deviceId === 'communications') return 'Communications device';
    return d.label || 'Input ' + (i + 1);
  },
  inputOptions() {
    const opts = [['default', 'System default input']];
    this.ins.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications').forEach((d, i) => opts.push([d.deviceId, this.label(d, i)]));
    return opts;
  },
  outputOptions() {
    const opts = [['default', 'System default output']];
    this.outs.filter((d) => d.deviceId !== 'default' && d.deviceId !== 'communications').forEach((d, i) => opts.push([d.deviceId, d.label || 'Output ' + (i + 1)]));
    return opts;
  },
  defaultInput() { try { return localStorage.getItem('studio-default-input') || 'default'; } catch (e) { return 'default'; } },
};
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    await Devices.refresh();
    if (App.tab === 'input') InputPanel.render();
    toast('Audio devices changed');
  });
}

const STRINGS = [['E2', 40], ['A2', 45], ['D3', 50], ['G3', 55], ['B3', 59], ['E4', 64]];
const Tuner = {
  buf: new Float32Array(4096), dec: new Float32Array(2048), d: new Float32Array(1024),
  hz: 0, smooth: 0, last: 0,
  read(an, sr) {
    an.getFloatTimeDomainData(this.buf);
    const x = this.dec;
    for (let i = 0; i < 2048; i++) x[i] = (this.buf[2 * i] + this.buf[2 * i + 1]) * 0.5;
    let e = 0;
    for (let i = 0; i < 1024; i++) e += x[i] * x[i];
    if (e < 1024 * 2e-6) return 0;
    const sr2 = sr / 2, W = 1024, tmax = Math.min(1000, Math.floor(sr2 / 36)), tmin = Math.floor(sr2 / 1400), d = this.d;
    let run = 0;
    d[0] = 1;
    for (let tau = 1; tau <= tmax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i += 1) { const v = x[i] - x[i + tau]; s += v * v; }
      run += s;
      d[tau] = run > 0 ? (s * tau) / run : 1;
    }
    let tau = -1;
    for (let t = tmin; t <= tmax; t++) if (d[t] < 0.12) { while (t + 1 <= tmax && d[t + 1] < d[t]) t++; tau = t; break; }
    if (tau < 2) return 0;
    const a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a + c - 2 * b;
    const bt = Math.abs(den) > 1e-9 ? tau + (0.5 * (a - c)) / den : tau;
    return sr2 / bt;
  },
};

const InputPanel = {
  async render() {
    const panel = $('#panel-input');
    panel.innerHTML = '';
    const P = App.project;
    let tr = App.track(App.selTrackId);
    if (!tr || tr.type !== 'audio') tr = App.track(App.atTrackId) || P.tracks.find((t) => t.type === 'audio');
    if (!tr) {
      panel.append(h('div', { class: 'empty' }, 'Inputs are set per audio track. ',
        h('button', { class: 'primary', onclick: () => addGuitarTrack() }, '🎸 + Guitar track'), ' ',
        h('button', { onclick: () => addTrack('audio') }, '🎤 + Vocal track')));
      return;
    }
    this.tr = tr;
    tr.input = tr.input || { device: Devices.defaultInput(), ch: 'mono' };
    await Devices.refresh();
    const audioTracks = P.tracks.filter((t) => t.type === 'audio');
    const trSel = options(h('select', { onchange: (e) => { App.selectTrack(e.target.value, false); this.render(); } }), audioTracks.map((t) => [t.id, t.name]), tr.id);
    const devSel = options(h('select', { class: 'dev-select', onchange: (e) => this.changeInput(tr, { device: e.target.value }) }), Devices.inputOptions(), tr.input.device);
    const chSel = options(h('select', { onchange: (e) => this.changeInput(tr, { ch: e.target.value }) }), [['mono', 'Mono (all inputs mixed)'], ['1', 'Input 1 only (left)'], ['2', 'Input 2 only (right)'], ['stereo', 'Stereo']], tr.input.ch);
    const live = Engine.nodes.get(tr.id)?.inGain && [...Engine.inputs.values()].length;
    const monitoring = Engine.monitors.has(tr.id);
    const gainK = knob({ label: 'Gain', norm: ((tr.inGain || 0) + 24) / 48, def: 0.5, size: 36, color: '#2fd4c4', text: (n) => { const v = Math.round(n * 48 - 24); return (v > 0 ? '+' : '') + v + ' dB'; }, onInput: (n) => { tr.inGain = Math.round(n * 48 - 24); const nn = Engine.nodes.get(tr.id); if (nn && nn.inGain) nn.inGain.gain.value = Math.pow(10, tr.inGain / 20); }, onDone: () => App.markDirty() });
    this.meter = h('canvas', { class: 'in-meter', width: 220, height: 16 });
    this.meterTxt = h('div', { class: 'hint2' }, live ? '' : 'Input is off');
    const inputCol = h('div', { class: 'section in-col' },
      h('div', { class: 'sec-title' }, '1. Input',
        h('button', { class: 'live-btn' + (monitoring ? ' on' : ''), title: 'Hear the input live through this track’s amp & effects (use headphones)', onclick: () => this.toggleMonitor(tr) }, monitoring ? '🎧 Monitoring' : '🎧 Monitor'),
        h('button', { class: 'mini arm' + (tr.armed ? ' on' : ''), title: 'Arm this track, then press R to record', onclick: () => App.mutate(() => { const v = !tr.armed; P.tracks.forEach((t) => (t.armed = false)); tr.armed = v; }) }, '● Arm')),
      h('div', { class: 'row-flex' }, devSel, h('button', { class: 'mini', title: 'Refresh device list', onclick: () => this.render() }, '⟳')),
      h('div', { class: 'row-flex', title: 'Guitar in an audio interface? Pick the interface above, then the input number you plugged into.' }, chSel,
        live ? null : h('button', { class: 'primary mini', onclick: () => this.activate(tr) }, '▶ Turn on')),
      !Devices.granted ? h('div', { class: 'hint2 warn' }, 'Allow microphone access to see device names → ', h('button', { class: 'mini', onclick: () => this.activate(tr) }, 'Allow')) : null,
      h('div', { class: 'row-flex' }, gainK, h('div', {}, this.meter, this.meterTxt)),
      h('div', { class: 'hint2' }, `Latency ≈ ${Engine.latencyMs()} ms. Guitar? Use an audio interface or USB guitar cable.`));
    this.tunerNote = h('div', { class: 'tuner-note' }, '—');
    this.tunerNeedle = h('div', { class: 'tuner-needle' });
    this.tunerHz = h('div', { class: 'hint2' }, 'Play a single string');
    this.strings = h('div', { class: 'tuner-strings' }, STRINGS.map(([n]) => h('span', {}, n)));
    const tunerCol = h('div', { class: 'section tuner' },
      h('div', { class: 'sec-title' }, '2. Tuner'),
      this.tunerNote,
      h('div', { class: 'tuner-scale' }, h('span', {}, '♭'), h('div', { class: 'tuner-bar' }, h('div', { class: 'tuner-center' }), this.tunerNeedle), h('span', {}, '♯')),
      this.tunerHz, this.strings);
    const presets = (group, title, guitar) => h('div', { class: 'chain-group' }, h('div', { class: 'lab' }, title),
      h('div', { class: 'chain-grid' }, Object.keys(CHAIN_PRESETS[group]).map((name) => h('button', {
        class: 'chain-btn' + (tr.chain === name ? ' active' : ''),
        onclick: () => App.mutate(() => {
          tr.fx = CHAIN_PRESETS[group][name]();
          tr.chain = name;
          if (guitar) { tr.autotune.on = false; tr.rev = 0; tr.dly = 0; }
        }),
      }, name))));
    const presetCol = h('div', { class: 'section chains' },
      h('div', { class: 'sec-title' }, '3. Sound'),
      presets('guitar', '🎸 Guitar & bass amps', true),
      presets('vocal', '🎤 Vocal & mic chains', false));
    FxPanel.grs = [];
    const t = { list: tr.fx, name: tr.name, color: tr.color, tr };
    const cards = h('div', { class: 'fx-row' },
      tr.fx.length ? tr.fx.map((f, i) => FxPanel.card(t, f, i)) : h('div', { class: 'hint2', style: 'padding:12px' }, 'No effects on this track yet — pick a sound above.'),
      h('div', { class: 'add-fx' }, options(h('select', { onchange: (e) => { if (e.target.value) App.mutate(() => { tr.fx.push(newFx(e.target.value)); tr.chain = null; }); } }), [['', '+ Add effect / pedal…'], ...FX_ORDER.map((k) => [k, FX[k].icon + '  ' + FX[k].name])], '')));
    panel.append(
      h('div', { class: 'panel-head' }, h('h3', {}, 'Input & Amp'), trSel,
        h('button', { onclick: () => addGuitarTrack() }, '🎸 + Guitar track'),
        h('button', { onclick: () => AudioSettings.open() }, '⚙ Audio settings')),
      h('div', { class: 'input-layout' }, inputCol, tunerCol, presetCol),
      h('div', { class: 'lab', style: 'margin:8px 0 4px' }, `Signal chain on "${tr.name}" (left → right)`), cards);
    if (Engine.inputs.size) this.activate(tr, true);
  },
  async activate(tr, quiet) {
    try {
      await Engine.trackInput(tr);
      if (!quiet) { await Devices.refresh(); this.render(); }
    } catch (e) {
      toast('Could not open the input: ' + (e.message || e.name), 5000);
    }
  },
  async changeInput(tr, patch) {
    App.mutate(() => { tr.input = { ...tr.input, ...patch }; }, false);
    if (patch.device) try { localStorage.setItem('studio-default-input', patch.device); } catch (e) {}
    try { await Engine.trackInput(tr); await Engine.refreshInputs(App.project); } catch (e) { toast('Could not open that input: ' + (e.message || e.name), 5000); }
    if (Engine.monitors.has(tr.id)) await Engine.setTrackMonitor(tr.id, true);
    this.render();
  },
  async toggleMonitor(tr) {
    try {
      const on = !Engine.monitors.has(tr.id);
      await Engine.setTrackMonitor(tr.id, on);
      if (on) toast('Monitoring on — wear headphones so the speakers don’t feed back into the mic!', 4000);
    } catch (e) { toast('Could not open the input: ' + (e.message || e.name), 5000); }
    Headers.render();
    this.render();
  },
  peak: 0, hold: 0, holdT: 0,
  draw() {
    if (App.tab !== 'input' || !this.tr || !this.meter || !this.meter.isConnected) return;
    const n = Engine.nodes.get(this.tr.id);
    if (!n || !n.inMeter || !n.inSrc) return;
    const pk = peakOf(n.inMeter);
    this.peak = Math.max(pk, this.peak * 0.9);
    const now = performance.now();
    if (pk > this.hold || now - this.holdT > 1500) { this.hold = pk; this.holdT = now; }
    const g = this.meter.getContext('2d'), W = 220, H = 16;
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, H);
    const f = levelFrac(this.peak);
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, '#2fd4c4'); grad.addColorStop(0.7, '#4ade80'); grad.addColorStop(0.88, '#facc15'); grad.addColorStop(1, '#ff3b5c');
    g.fillStyle = grad; g.fillRect(0, 3, W * f, H - 6);
    g.fillStyle = '#fff'; g.fillRect(W * levelFrac(this.hold) - 1, 1, 2, H - 2);
    const db = 20 * Math.log10(this.hold + 1e-9);
    this.meterTxt.textContent = db < -50 ? 'No signal — check the device/channel and turn up the gain' : db > -1 ? '⚠ Clipping! Turn the input gain down' : db < -30 ? 'Quiet — turn the gain up a bit' : 'Good level ✓  (' + db.toFixed(0) + ' dB)';
    this.meterTxt.classList.toggle('warn', db > -1 || db < -50);
    // tuner (~15 times a second)
    if (now - Tuner.last > 66) {
      Tuner.last = now;
      const hz = Tuner.read(n.inMeter, Engine.ctx.sampleRate);
      if (hz > 0) {
        Tuner.smooth = Tuner.smooth && Math.abs(Math.log2(hz / Tuner.smooth)) < 0.05 ? Tuner.smooth * 0.7 + hz * 0.3 : hz;
        const m = ftom(Tuner.smooth), nearest = Math.round(m), cents = Math.round((m - nearest) * 100);
        this.tunerNote.textContent = noteName(nearest);
        this.tunerNote.classList.toggle('intune', Math.abs(cents) <= 4);
        this.tunerNeedle.style.left = 50 + cents + '%';
        this.tunerHz.textContent = `${Tuner.smooth.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents} cents`;
        const si = STRINGS.reduce((b, s, i) => (Math.abs(s[1] - m) < Math.abs(STRINGS[b][1] - m) ? i : b), 0);
        [...this.strings.children].forEach((el, i) => el.classList.toggle('on', i === si && Math.abs(STRINGS[si][1] - m) < 1.5));
      }
    }
  },
};

function addGuitarTrack() {
  const P = App.project;
  let tr;
  App.mutate(() => {
    tr = makeTrack('audio', P);
    tr.name = 'Guitar ' + (P.tracks.filter((t) => /^Guitar/.test(t.name)).length + 1);
    tr.autotune.on = false;
    tr.rev = 0;
    tr.fx = CHAIN_PRESETS.guitar['Blues Crunch']();
    tr.chain = 'Blues Crunch';
    P.tracks.forEach((t) => (t.armed = false));
    tr.armed = true;
    P.tracks.push(tr);
  });
  App.selectTrack(tr.id, false);
  Panels.show('input');
  toast('Guitar track added — choose your input, then press 🎧 Monitor to play through the amp.', 5000);
  return tr;
}

const AudioSettings = {
  async open() {
    await Devices.refresh();
    const close = () => ov.remove();
    const outSel = options(h('select', {
      onchange: async (e) => {
        try { await Engine.setOutput(e.target.value); localStorage.setItem('studio-output', e.target.value); toast('Output changed'); }
        catch (err) { toast(err.message, 4000); }
      },
    }), Devices.outputOptions(), (() => { try { return localStorage.getItem('studio-output') || 'default'; } catch (e) { return 'default'; } })());
    const inSel = options(h('select', { onchange: (e) => { try { localStorage.setItem('studio-default-input', e.target.value); } catch (x) {} } }), Devices.inputOptions(), Devices.defaultInput());
    const midiList = MIDI.acc ? [...MIDI.acc.inputs.values()].map((i) => i.name) : [];
    const ov = h('div', { class: 'modal-ov', onmousedown: (e) => { if (e.target === ov) close(); } },
      h('div', { class: 'modal' },
        h('div', { class: 'modal-head' }, h('h3', {}, '⚙ Audio settings'), h('button', { class: 'mini', onclick: close }, '✕')),
        h('label', { class: 'lab' }, 'Output (speakers / headphones / interface)'), outSel,
        h('label', { class: 'lab' }, 'Default input for new tracks'), inSel,
        !Devices.granted ? h('div', { class: 'hint2 warn' }, 'Device names show after you allow microphone access. ', h('button', { class: 'mini', onclick: async () => { try { await Engine.openInput('default'); } catch (e) {} close(); this.open(); } }, 'Allow access')) : null,
        h('div', { class: 'hint2' }, 'Each audio track can use a different input — set it in the Input & Amp tab.'),
        h('label', { class: 'lab' }, 'Performance'),
        h('div', { class: 'hint2' }, `Sample rate ${Engine.ctx.sampleRate} Hz · output latency ≈ ${Engine.latencyMs()} ms`),
        h('div', { class: 'hint2' }, 'For the lowest latency: use a USB audio interface, wear headphones, close other audio apps, and plug your laptop in.'),
        h('label', { class: 'lab' }, 'MIDI keyboards'),
        h('div', { class: 'hint2' }, midiList.length ? midiList.join(', ') : 'None detected — plug one in (it is picked up automatically).'),
        h('div', { class: 'row-flex', style: 'margin-top:12px' },
          h('button', { onclick: () => { const t = Engine.ctx.currentTime + 0.02; [60, 64, 67, 72].forEach((p, i) => playPatch(Engine.ctx, Engine.previewBus, SYNTH_PRESETS['Electric Piano'].p, p, t + i * 0.12, 0.6, 0.8)); } }, '🔊 Test sound'),
          h('span', { class: 'spacer' }),
          h('button', { class: 'primary', onclick: close }, 'Done'))));
    document.body.append(ov);
  },
  async restore() {
    try { const o = localStorage.getItem('studio-output'); if (o && o !== 'default') await Engine.setOutput(o); } catch (e) {}
  },
};
