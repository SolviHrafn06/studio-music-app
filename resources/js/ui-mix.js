// Mixer, effects rack (per track + master) with visual EQ and gain-reduction meters.

function levelFrac(pk) {
  const db = 20 * Math.log10(pk + 1e-9);
  return clamp((db + 54) / 54, 0, 1);
}
function drawVMeter(cv, pk, peakHold) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.fillStyle = '#0b0d10';
  g.fillRect(0, 0, W, H);
  const f = levelFrac(pk), hgt = f * H;
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#2fd4c4'); grad.addColorStop(0.7, '#4ade80'); grad.addColorStop(0.88, '#facc15'); grad.addColorStop(1, '#ff3b5c');
  g.fillStyle = grad;
  g.fillRect(1, H - hgt, W - 2, hgt);
  if (peakHold != null) { g.fillStyle = '#fff'; g.fillRect(1, H - levelFrac(peakHold) * H, W - 2, 1); }
}
const meterBuf = new Float32Array(2048);
function peakOf(an) {
  const b = meterBuf.subarray(0, an.fftSize);
  an.getFloatTimeDomainData(b);
  let pk = 0;
  for (let i = 0; i < b.length; i++) { const a = Math.abs(b[i]); if (a > pk) pk = a; }
  return pk;
}

// ---------------- Mixer ----------------
const Mixer = {
  meters: [],
  render() {
    const panel = $('#panel-mixer');
    panel.innerHTML = '';
    const P = App.project;
    const box = h('div', { class: 'mixer' });
    this.meters = [];
    const mini = (label, norm, def, text, fn) => knob({ label, norm, def, size: 30, text, onInput: (n) => { if (App._dragSnap == null) App.beginDrag(); fn(n); App.syncEngine(); }, onDone: () => App.endDrag() });
    for (const tr of P.tracks) {
      const meter = h('canvas', { width: 10, height: 120 });
      this.meters.push({ cv: meter, id: tr.id, peak: 0, hold: 0, ht: 0 });
      const fader = h('input', { class: 'fader', type: 'range', min: 0, max: 1.2, step: 0.01, value: tr.volume, title: 'Volume', onmousedown: () => App.beginDrag(), onchange: () => App.endDrag(), oninput: (e) => { tr.volume = +e.target.value; App.syncEngine(); $$('.track-header[data-id="' + tr.id + '"] .hvol').forEach((x) => (x.value = tr.volume)); } });
      fader.dataset.vol = tr.id;
      const btns = [
        h('button', { class: 'mini m' + (tr.mute ? ' on' : ''), onclick: () => App.mutate(() => (tr.mute = !tr.mute)) }, 'M'),
        h('button', { class: 'mini s' + (tr.solo ? ' on' : ''), onclick: () => App.mutate(() => (tr.solo = !tr.solo)) }, 'S'),
      ];
      if (tr.type === 'audio') btns.push(h('button', { class: 'mini at' + (tr.autotune.on ? ' on' : ''), title: 'Auto-Tune', onclick: () => App.mutate(() => (tr.autotune.on = !tr.autotune.on)) }, 'AT'));
      const inserts = h('div', { class: 'inserts' },
        tr.fx.map((f) => h('div', { class: 'ins' + (f.on ? '' : ' off'), title: 'Open ' + FX[f.type].name, onclick: () => { App.fxTrackId = tr.id; Panels.show('fx'); } }, h('span', { class: 'led' }), FX[f.type].name)),
        h('div', { class: 'ins add', onclick: () => { App.fxTrackId = tr.id; Panels.show('fx'); } }, '+ FX'));
      box.append(h('div', { class: 'strip' + (tr.id === App.selTrackId ? ' sel' : ''), onmousedown: () => { App.selTrackId = tr.id; $$('.strip').forEach((s) => s.classList.remove('sel')); } },
        h('div', { class: 'nm', style: `border-color:${tr.color}`, title: tr.name }, tr.name),
        inserts,
        h('div', { class: 'sends' },
          mini('Verb', tr.rev, 0.08, (n) => Math.round(n * 100) + '', (n) => (tr.rev = n)),
          mini('Echo', tr.dly, 0, (n) => Math.round(n * 100) + '', (n) => (tr.dly = n))),
        h('div', { class: 'sends' },
          mini('Pan', (tr.pan + 1) / 2, 0.5, (n) => (Math.abs(n - 0.5) < 0.01 ? 'C' : n < 0.5 ? 'L' + Math.round((0.5 - n) * 200) : 'R' + Math.round((n - 0.5) * 200)), (n) => (tr.pan = n * 2 - 1)),
          mini('Tone', (tr.eq.high + 15) / 30, 0.5, (n) => { const v = n * 30 - 15; return (v > 0 ? '+' : '') + v.toFixed(0); }, (n) => (tr.eq.high = n * 30 - 15))),
        h('div', { class: 'fader-row' }, fader, meter),
        h('div', { class: 'btns' }, btns)));
    }
    const mMeter = h('canvas', { width: 14, height: 120 });
    this.meters.push({ cv: mMeter, master: true, peak: 0, hold: 0, ht: 0 });
    box.append(h('div', { class: 'strip master' },
      h('div', { class: 'nm', style: 'border-color:#fff' }, 'MASTER'),
      h('div', { class: 'inserts' },
        P.master.fx.map((f) => h('div', { class: 'ins' + (f.on ? '' : ' off'), onclick: () => { App.fxTrackId = 'master'; Panels.show('fx'); } }, h('span', { class: 'led' }), FX[f.type].name)),
        h('div', { class: 'ins add', onclick: () => { App.fxTrackId = 'master'; Panels.show('fx'); } }, '+ Mastering')),
      h('div', { class: 'fader-row' },
        h('input', { class: 'fader', type: 'range', min: 0, max: 1.2, step: 0.01, value: P.master.volume, oninput: (e) => { P.master.volume = +e.target.value; App.syncEngine(); } }),
        mMeter),
      h('div', { class: 'hint2', id: 'lufs' }, '')));
    panel.append(box);
  },
  updateValues() { $$('#panel-mixer .fader[data-vol]').forEach((f) => { const t = App.track(f.dataset.vol); if (t) f.value = t.volume; }); },
  drawMeters() {
    if (App.tab !== 'mixer') return;
    const now = performance.now();
    for (const m of this.meters) {
      const an = m.master ? Engine.bus.analyser : Engine.nodes.get(m.id)?.meter;
      if (!an) continue;
      const pk = peakOf(an);
      m.peak = Math.max(pk, m.peak * 0.9);
      if (pk >= m.hold || now - m.ht > 1500) { m.hold = pk; m.ht = now; }
      drawVMeter(m.cv, m.peak, m.hold);
    }
  },
};

// ---------------- Effects rack ----------------
const FxPanel = {
  grs: [],
  target() {
    const P = App.project;
    if (App.fxTrackId === 'master') return { list: P.master.fx, name: 'Master', color: '#ffffff', master: true };
    const tr = App.track(App.fxTrackId) || App.track(App.selTrackId);
    return tr ? { list: tr.fx, name: tr.name, color: tr.color, tr } : null;
  },
  liveFx(t, id) {
    const n = t.master ? Engine.bus : Engine.nodes.get(t.tr.id);
    return n ? n.fx.find((f) => f.id === id) : null;
  },
  render() {
    const panel = $('#panel-fx');
    const sc = panel.scrollLeft;
    panel.innerHTML = '';
    const P = App.project, t = this.target();
    this.grs = [];
    if (!t) { panel.append(h('div', { class: 'empty' }, 'Select a track to add effects.')); return; }
    const trSel = options(h('select', { onchange: (e) => { App.fxTrackId = e.target.value; this.render(); } }), [...P.tracks.map((x) => [x.id, x.name]), ['master', '★ Master (mastering)']], t.master ? 'master' : t.tr.id);
    const addSel = options(h('select', { onchange: (e) => { if (!e.target.value) return; App.mutate(() => t.list.push(newFx(e.target.value)), true); } }), [['', '+ Add effect…'], ...FX_ORDER.map((k) => [k, FX[k].icon + '  ' + FX[k].name])], '');
    const head = h('div', { class: 'panel-head' }, h('h3', {}, 'Effects'), trSel, addSel);
    if (t.master) {
      head.append(h('label', { class: 'field' }, 'Mastering preset', options(h('select', {
        onchange: (e) => App.mutate(() => { P.master.preset = e.target.value; P.master.fx = e.target.value === 'None' ? [] : clone(MASTER_PRESETS[e.target.value]).map((f) => ({ ...f, id: 'f' + uid() })); }, true),
      }), ['None', ...Object.keys(MASTER_PRESETS)], P.master.preset || 'None')));
    } else {
      head.append(h('span', { class: 'hint2' }, 'Signal flows left → right. Effects with ◆ knobs can be automated in the timeline (A button).'));
    }
    panel.append(head);
    const row = h('div', { class: 'fx-row' });
    if (!t.list.length) row.append(h('div', { class: 'empty', style: 'padding:20px' }, t.master ? 'Pick a mastering preset above to make your song louder and more polished.' : 'No effects yet — add one from the menu above. Try Compressor + EQ on vocals, Saturation on drums, Delay on leads.'));
    t.list.forEach((f, i) => row.append(this.card(t, f, i)));
    panel.append(row);
    panel.scrollLeft = sc;
  },
  card(t, f, i) {
    const def = FX[f.type];
    const after = (structural) => { App.syncEngine(); if (f.type === 'eq') this.drawEq(t, f, card.querySelector('canvas.eqc')); if (structural) App.markDirty(); };
    const card = h('div', { class: 'fx-card' + (f.on ? '' : ' off') },
      h('div', { class: 'fx-head' },
        h('button', { class: 'pwr' + (f.on ? ' on' : ''), title: 'Bypass', onclick: () => App.mutate(() => (f.on = !f.on), true) }, '⏻'),
        h('span', { class: 'fx-name' }, def.icon + ' ' + def.name),
        h('button', { class: 'mini', title: 'Move left', disabled: i === 0, onclick: () => App.mutate(() => { t.list.splice(i, 1); t.list.splice(i - 1, 0, f); }, true) }, '◀'),
        h('button', { class: 'mini', title: 'Move right', disabled: i === t.list.length - 1, onclick: () => App.mutate(() => { t.list.splice(i, 1); t.list.splice(i + 1, 0, f); }, true) }, '▶'),
        h('button', { class: 'mini del', title: 'Remove', onclick: () => App.mutate(() => t.list.splice(i, 1), true) }, '✕')));
    if (f.type === 'eq') {
      const cv = h('canvas', { class: 'eqc', width: 300, height: 120 });
      card.append(cv);
      requestAnimationFrame(() => this.drawEq(t, f, cv));
      this.eqDrag(t, f, cv, after);
    }
    if (['comp', 'limiter', 'deess'].includes(f.type)) {
      const gr = h('div', { class: 'gr' }, h('span', {}, 'Gain reduction'), h('div', { class: 'gr-bar' }, h('div', { class: 'gr-fill' })), h('span', { class: 'gr-val' }, '0 dB'));
      card.append(gr);
      this.grs.push({ el: gr, t, id: f.id });
    }
    const knobs = h('div', { class: 'knobs' });
    for (const sp of def.params) {
      if (f.type === 'eq' && /f$|q$/.test(sp.id) && !['hp', 'lp'].includes(sp.id)) continue;
      const k = specKnob(sp, f.p, sp.id, after, t.color);
      if (sp.auto && !t.master) k.classList.add('autoable');
      knobs.append(k);
    }
    card.append(knobs);
    return card;
  },
  eqResponse(f, freqs) {
    const ctx = Engine.ctx;
    const mk = (type, fr, g, q) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.gain.value = g || 0; b.Q.value = q || 0.707; return b; };
    const p = f.p;
    const fl = [mk('highpass', p.hp), mk('lowshelf', p.lf, p.lg), mk('peaking', p.m1f, p.m1g, p.m1q), mk('peaking', p.m2f, p.m2g, p.m2q), mk('highshelf', p.hf, p.hg), mk('lowpass', p.lp)];
    const mag = new Float32Array(freqs.length).fill(1), m = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
    for (const b of fl) { b.getFrequencyResponse(freqs, m, ph); for (let i = 0; i < m.length; i++) mag[i] *= m[i]; }
    return mag;
  },
  eqX: (f, W) => (Math.log(f / 20) / Math.log(1000)) * W,
  eqF: (x, W) => 20 * Math.pow(1000, x / W),
  drawEq(t, f, cv) {
    if (!cv) return;
    const W = 300, H = 120, g = sizeCanvas(cv, W, H);
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = '#1f232b';
    g.fillStyle = '#5b6372';
    g.font = '9px Segoe UI';
    for (const fr of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) { const x = this.eqX(fr, W); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.fillText(fr >= 1000 ? fr / 1000 + 'k' : fr, x + 2, H - 3); }
    const y = (db) => H / 2 - (db / 20) * (H / 2);
    for (const db of [-12, 0, 12]) { g.strokeStyle = db ? '#1f232b' : '#343a46'; g.beginPath(); g.moveTo(0, y(db)); g.lineTo(W, y(db)); g.stroke(); }
    const N = 150, freqs = new Float32Array(N);
    for (let i = 0; i < N; i++) freqs[i] = this.eqF((i / (N - 1)) * W, W);
    const mag = this.eqResponse(f, freqs);
    g.beginPath();
    for (let i = 0; i < N; i++) { const xx = (i / (N - 1)) * W, yy = y(clamp(20 * Math.log10(mag[i] + 1e-9), -24, 24)); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
    g.strokeStyle = t.color === '#ffffff' ? '#2fd4c4' : t.color;
    g.lineWidth = 2;
    g.stroke();
    g.lineTo(W, H / 2); g.lineTo(0, H / 2); g.closePath();
    g.fillStyle = alpha(t.color === '#ffffff' ? '#2fd4c4' : t.color, 0.12);
    g.fill();
    g.lineWidth = 1;
    for (const b of this.eqBands(f)) {
      g.beginPath();
      g.arc(this.eqX(b.f, W), y(b.g), 5, 0, Math.PI * 2);
      g.fillStyle = '#fff';
      g.fill();
      g.fillStyle = '#111';
      g.font = 'bold 8px Segoe UI';
      g.fillText(b.label, this.eqX(b.f, W) - 2.5, y(b.g) + 3);
    }
  },
  eqBands(f) {
    const p = f.p;
    return [
      { label: 'L', f: p.lf, g: p.lg, fk: 'lf', gk: 'lg' }, { label: '1', f: p.m1f, g: p.m1g, fk: 'm1f', gk: 'm1g' },
      { label: '2', f: p.m2f, g: p.m2g, fk: 'm2f', gk: 'm2g' }, { label: 'H', f: p.hf, g: p.hg, fk: 'hf', gk: 'hg' },
      { label: '<', f: p.hp, g: 0, fk: 'hp' }, { label: '>', f: p.lp, g: 0, fk: 'lp' },
    ];
  },
  eqDrag(t, f, cv, after) {
    const W = 300, H = 120;
    cv.addEventListener('mousedown', (e) => {
      const r = cv.getBoundingClientRect();
      const x = e.clientX - r.left, yy = e.clientY - r.top;
      const yOf = (db) => H / 2 - (db / 20) * (H / 2);
      let best = null, bd = 14;
      for (const b of this.eqBands(f)) { const d = Math.hypot(this.eqX(b.f, W) - x, yOf(b.g) - yy); if (d < bd) { bd = d; best = b; } }
      if (!best) return;
      App.beginDrag();
      const spOf = (k) => FX.eq.params.find((p) => p.id === k);
      const move = (ev) => {
        const xx = clamp(ev.clientX - r.left, 0, W), y2 = clamp(ev.clientY - r.top, 0, H);
        const fs = spOf(best.fk);
        f.p[best.fk] = clamp(this.eqF(xx, W), fs.min, fs.max);
        if (best.gk) f.p[best.gk] = clamp(((H / 2 - y2) / (H / 2)) * 20, -18, 18);
        best = this.eqBands(f).find((b) => b.fk === best.fk);
        after(false);
      };
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); App.endDrag(); this.render(); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left;
      const qs = [['m1f', 'm1q'], ['m2f', 'm2q']];
      let best = null, bd = 30;
      for (const [fk, qk] of qs) { const d = Math.abs(this.eqX(f.p[fk], W) - x); if (d < bd) { bd = d; best = qk; } }
      if (best) { f.p[best] = clamp(f.p[best] * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 0.3, 8); after(false); App.markDirty(); }
    }, { passive: false });
  },
  drawMeters() {
    if (App.tab !== 'fx' && App.tab !== 'input') return;
    for (const g of this.grs) {
      const lf = this.liveFx(g.t, g.id);
      const red = lf && lf.inst.reduction ? -lf.inst.reduction() : 0;
      g.el.querySelector('.gr-fill').style.width = clamp((red / 24) * 100, 0, 100) + '%';
      g.el.querySelector('.gr-val').textContent = red.toFixed(1) + ' dB';
    }
  },
};
