// Timeline (arrangement): track headers, clips, automation lanes, selection, editing.

// ---- floating context menu ----
const Menu = {
  el: null,
  show(x, y, items) {
    this.hide();
    const m = h('div', { class: 'ctx-menu' });
    const build = (list, parent) => {
      for (const it of list) {
        if (it === '-') { parent.append(h('div', { class: 'sep' })); continue; }
        const row = h('div', { class: 'item' + (it.disabled ? ' dis' : '') + (it.sub ? ' has-sub' : '') },
          h('span', { class: 'chk' }, it.checked ? '✓' : ''), h('span', {}, it.label), it.key ? h('span', { class: 'key' }, it.key) : null);
        if (it.sub) {
          const sm = h('div', { class: 'ctx-menu sub' });
          build(it.sub, sm);
          row.append(sm);
        } else if (!it.disabled) row.addEventListener('mousedown', (e) => { e.stopPropagation(); this.hide(); it.action(); });
        parent.append(row);
      }
    };
    build(items, m);
    document.body.append(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + 'px';
    m.style.top = Math.min(y, innerHeight - r.height - 8) + 'px';
    this.el = m;
    setTimeout(() => window.addEventListener('mousedown', this._close = () => this.hide(), { once: true }), 0);
  },
  hide() { if (this.el) { this.el.remove(); this.el = null; } },
};

function autoTargets(tr) {
  const list = [['vol', 'Volume'], ['pan', 'Pan']];
  for (const f of tr.fx || []) for (const sp of FX[f.type].params) if (sp.auto) list.push([`fx:${f.id}:${sp.id}`, `${FX[f.type].name} · ${sp.label}`]);
  return list;
}
function instrumentOptions(cur) {
  const groups = [];
  if (cur && cur.kind === 'synth' && !SYNTH_PRESETS[cur.name]) groups.push({ group: 'This track', items: [[cur.name, cur.name + ' (custom)']] });
  groups.push({ group: 'Real instruments', items: Object.keys(INSTRUMENTS) }, { group: 'Sampler', items: [['__sampler', 'Sampler / Slicer (load a sample)…']] });
  const cats = {};
  for (const [n, p] of Object.entries(SYNTH_PRESETS)) (cats[p.cat] ||= []).push(n);
  for (const [c, items] of Object.entries(cats)) groups.push({ group: 'Synth · ' + c, items });
  return groups;
}
function instValue(inst) { return inst.kind === 'sample' ? '__sampler' : inst.name; }
async function setInstrument(tr, name) {
  if (tr.inst && tr.inst.kind === 'synth' && name === tr.inst.name && !SYNTH_PRESETS[name]) return;
  if (name === '__sampler') {
    const files = await pickFiles('#file-sample');
    if (!files.length) { Headers.render(); return; }
    try {
      const buf = await Engine.ctx.decodeAudioData(await files[0].arrayBuffer());
      const id = Buffers.add(buf);
      App.mutate(() => { tr.inst = newSamplerInst(id, files[0].name.replace(/\.[^.]+$/, '').slice(0, 22)); });
      Panels.show('inst');
    } catch (e) { toast('Could not read that audio file.'); }
    return;
  }
  App.mutate(() => { tr.inst = presetInst(name); }, true);
  if (tr.inst.kind === 'sampler') { toast('Loading ' + name + '…', 1500); Sampler.load(name, Engine.ctx).then(() => toast(name + ' ready')); }
}

// ---------------- track headers ----------------
const Headers = {
  render() {
    const el = $('#headers');
    el.innerHTML = '';
    const P = App.project;
    for (const tr of P.tracks) {
      const btn = (cls, label, title, on, fn) => h('button', { class: `mini ${cls}${on ? ' on' : ''}`, title, onmousedown: (e) => e.stopPropagation(), onclick: (e) => { e.stopPropagation(); fn(); } }, label);
      const row2 = [
        btn('m', 'M', 'Mute', tr.mute, () => App.mutate(() => (tr.mute = !tr.mute))),
        btn('s', 'S', 'Solo', tr.solo, () => App.mutate(() => (tr.solo = !tr.solo))),
      ];
      if (tr.type !== 'drums') row2.push(btn('arm', '●', tr.type === 'audio' ? 'Arm for recording' : 'Arm for MIDI recording', tr.armed, () => App.mutate(() => { const v = !tr.armed; P.tracks.forEach((t) => (t.armed = false)); tr.armed = v; })));
      if (tr.type === 'audio') row2.push(btn('mon', '🎧', 'Monitor: hear this track’s input live (Input & Amp tab)', Engine.monitors.has(tr.id), () => InputPanel.toggleMonitor(tr)));
      if (tr.type === 'audio') row2.push(btn('at', 'AT', 'Auto-Tune on/off', tr.autotune.on, () => App.mutate(() => (tr.autotune.on = !tr.autotune.on))));
      row2.push(btn('aut' + (tr.auto.some((l) => l.pts.length) ? ' has' : ''), 'A', 'Show automation lane', tr.autoShow, () => App.mutate(() => (tr.autoShow = !tr.autoShow))));
      if (tr.type === 'synth') row2.push(options(h('select', { title: 'Instrument', onmousedown: (e) => e.stopPropagation(), onchange: (e) => setInstrument(tr, e.target.value) }), instrumentOptions(tr.inst), instValue(tr.inst)));
      if (tr.type === 'drums') row2.push(options(h('select', { title: 'Drum kit', onmousedown: (e) => e.stopPropagation(), onchange: (e) => App.mutate(() => (tr.kit = e.target.value), false) }), Object.keys(DRUM_KITS).map((k) => [k, k + ' kit']), tr.kit));
      const vol = h('input', {
        type: 'range', min: 0, max: 1.2, step: 0.01, value: tr.volume, title: 'Volume', class: 'hvol',
        onmousedown: (e) => { e.stopPropagation(); App.beginDrag(); }, onchange: () => App.endDrag(),
        oninput: (e) => { tr.volume = +e.target.value; App.syncEngine(); Mixer.updateValues(); },
      });
      const fxn = tr.fx.length ? h('span', { class: 'fxbadge', title: 'Effects on this track', onmousedown: (e) => { e.stopPropagation(); App.fxTrackId = tr.id; App.selectTrack(tr.id, false); Panels.show('fx'); } }, 'FX ' + tr.fx.length) : null;
      const hd = h('div', { class: 'track-header' + (tr.id === App.selTrackId ? ' sel' : ''), style: `height:${App.rowH}px`, onmousedown: () => App.selectTrack(tr.id), oncontextmenu: (e) => { e.preventDefault(); Headers.menu(tr, e); } },
        h('div', { class: 'stripe', style: `background:${tr.color}` }),
        h('div', { class: 'body' },
          h('div', { class: 'row' },
            h('span', { class: 'type', title: tr.type }, TYPE_ICON[tr.type]),
            h('input', { class: 'name', type: 'text', value: tr.name, spellcheck: false, onmousedown: (e) => e.stopPropagation(), onchange: (e) => App.mutate(() => (tr.name = e.target.value || 'Track')) }),
            fxn, vol),
          h('div', { class: 'row' }, row2),
        ));
      hd.dataset.id = tr.id;
      el.append(hd);
      if (tr.autoShow) {
        const tsel = options(h('select', { onchange: (e) => App.mutate(() => (tr.autoSel = e.target.value)) }), autoTargets(tr), tr.autoSel);
        const lane = tr.auto.find((l) => l.target === tr.autoSel);
        el.append(h('div', { class: 'auto-header', style: `height:${App.autoH}px` },
          h('span', { class: 'label' }, 'Automation'), tsel,
          lane && lane.pts.length ? h('button', { class: 'mini', title: 'Clear this lane', onclick: () => App.mutate(() => { lane.pts = []; }) }, 'Clear') : h('span', { class: 'hint2' }, 'click lane to add points')));
      }
    }
    el.append(h('div', { class: 'add-row' },
      h('button', { onclick: () => addTrack('drums') }, '+ Drums'),
      h('button', { onclick: () => addTrack('synth') }, '+ Instrument'),
      h('button', { onclick: () => addTrack('audio') }, '+ Vocal'),
      h('button', { onclick: () => addGuitarTrack() }, '+ Guitar')));
  },
  menu(tr, e) {
    const P = App.project;
    const i = P.tracks.indexOf(tr);
    Menu.show(e.clientX, e.clientY, [
      { label: 'Duplicate track', action: () => App.mutate(() => { const c = clone(tr); c.id = uid(); c.name += ' copy'; c.clips.forEach((x) => (x.id = uid())); c.fx.forEach((f) => (f.id = 'f' + uid())); P.tracks.splice(i + 1, 0, c); }) },
      { label: 'Move up', disabled: i === 0, action: () => App.mutate(() => { P.tracks.splice(i, 1); P.tracks.splice(i - 1, 0, tr); }) },
      { label: 'Move down', disabled: i === P.tracks.length - 1, action: () => App.mutate(() => { P.tracks.splice(i, 1); P.tracks.splice(i + 1, 0, tr); }) },
      { label: 'Color', sub: COLORS.map((c) => ({ label: '■ ' + c, action: () => App.mutate(() => (tr.color = c)) })) },
      { label: 'Effects…', action: () => { App.fxTrackId = tr.id; Panels.show('fx'); } },
      { label: 'Bounce to audio (freeze)', disabled: tr.type === 'bus' || !tr.clips.length, action: () => AudioTools.bounce(tr) },
      '-',
      { label: 'Delete track', action: () => App.mutate(() => {
        P.tracks = P.tracks.filter((t) => t !== tr);
        for (const t of P.tracks) if (t.out === tr.id) t.out = null;
        for (const f of [...P.tracks.flatMap((t) => t.fx), ...P.master.fx]) {
          if (f.type === 'scomp' && f.p.src === tr.id) f.p.src = '';
        }
      }) },
    ]);
  },
};

// ---------------- timeline ----------------
const TL = {
  init() {
    this.scroll = $('#arr-scroll');
    this.cv = $('#timeline');
    this.ruler = $('#ruler');
    this.cv.addEventListener('mousedown', (e) => this.down(e));
    this.cv.addEventListener('dblclick', (e) => this.dbl(e));
    this.cv.addEventListener('mousemove', (e) => this.hover(e));
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    this.ruler.parentElement.addEventListener('mousedown', (e) => this.rulerDown(e));
    window.addEventListener('resize', () => this.draw());
    $('#lanes').append(h('div', { id: 'rec-region' }), h('div', { id: 'marquee' }));
    this.scroll.addEventListener('dragover', (e) => { e.preventDefault(); });
    this.scroll.addEventListener('drop', (e) => { e.preventDefault();
      const li = e.dataTransfer.getData('text/studio-lib');
      if (li !== '') { const it = Library.items[+li]; if (it) { const r = this.cv.getBoundingClientRect(); const row = this.rowAt(e.clientY - r.top); const beat = Math.max(0, Math.round((e.clientX - r.left) / App.ppb / App.snap) * App.snap); Library.addToTimeline(it, row && row.kind === 'track' ? row.tr : null, beat); } return; } const f = [...e.dataTransfer.files].filter((x) => /audio|\.wav|\.mp3|\.ogg|\.flac|\.m4a/i.test(x.type + x.name)); if (f.length) importAudio(f); });
  },
  layout() {
    const rows = [];
    let y = 0;
    for (const tr of App.project.tracks) {
      rows.push({ tr, y, h: App.rowH, kind: 'track' });
      y += App.rowH;
      if (tr.autoShow) { rows.push({ tr, y, h: App.autoH, kind: 'auto' }); y += App.autoH; }
    }
    this.rows = rows;
    this.totalH = y;
    return rows;
  },
  rowAt(y) { return (this.rows || this.layout()).find((r) => y >= r.y && y < r.y + r.h) || null; },
  trackY(tr) { const r = this.layout().find((x) => x.tr === tr && x.kind === 'track'); return r ? r.y : 0; },
  totalBeats() {
    const end = Engine.songEnd(App.project);
    return Math.max(32 * 4, Math.ceil(end / 4) * 4 + 64, Math.ceil(App.playhead / 4) * 4 + 32);
  },
  secPerBeatSrc(c, P) { return c.stretch && c.srcBpm ? 60 / c.srcBpm : 60 / P.bpm; },
  draw() {
    if (!App.project) return;
    const P = App.project, ppb = App.ppb;
    const rows = this.layout();
    const beats = this.totalBeats();
    const W = beats * ppb;
    const H = Math.max(this.totalH + 60, this.scroll.clientHeight - 28);
    const g = sizeCanvas(this.cv, W, H);
    g.fillStyle = '#15171c';
    g.fillRect(0, 0, W, H);
    const bpb = App.bpb();
    for (let bar = 0; bar < beats / bpb; bar++) if (Math.floor(bar / 4) % 2 === 1) { g.fillStyle = '#181b21'; g.fillRect(bar * bpb * ppb, 0, bpb * ppb, H); }
    for (const r of rows) {
      if (r.kind === 'auto') { g.fillStyle = '#111317'; g.fillRect(0, r.y, W, r.h); }
      else if (r.tr.id === App.selTrackId) { g.fillStyle = 'rgba(255,255,255,0.035)'; g.fillRect(0, r.y, W, r.h); }
    }
    const lines = (color, test, step) => {
      g.strokeStyle = color;
      g.beginPath();
      for (let b = 0; b <= beats; b += step) {
        if (!test(b)) continue;
        const x = Math.round(b * ppb) + 0.5;
        g.moveTo(x, 0); g.lineTo(x, H);
      }
      g.stroke();
    };
    if (ppb >= 60) lines('#1c1f26', (b) => Math.abs(b - Math.round(b)) > 0.01, 0.25);
    lines('#23272f', (b) => b % bpb !== 0, 1);
    lines('#373d4a', (b) => b % bpb === 0, 1);
    g.fillStyle = '#2a2f3a';
    for (const r of rows) g.fillRect(0, r.y + r.h - 1, W, 1);
    const L = P.loop;
    if (L.end > L.start) {
      g.fillStyle = L.on ? 'rgba(47,212,196,0.08)' : 'rgba(255,255,255,0.025)';
      g.fillRect(L.start * ppb, 0, (L.end - L.start) * ppb, H);
    }
    for (const r of rows) {
      if (r.kind === 'track') for (const c of r.tr.clips) this.drawClip(g, r.tr, c, c.start * ppb, r.y + 4, c.length * ppb, r.h - 8, App.selClips.has(c.id));
      else this.drawLane(g, r, W);
    }
    this.drawRuler(W, beats);
  },
  drawLane(g, r, W) {
    const tr = r.tr, lane = tr.auto.find((l) => l.target === tr.autoSel);
    const y0 = r.y + 6, hh = r.h - 12, ppb = App.ppb;
    const vy = (v) => y0 + (1 - v) * hh;
    g.fillStyle = alpha(tr.color, 0.08);
    g.fillRect(0, y0, W, hh);
    if (!lane || !lane.pts.length) {
      g.setLineDash([4, 4]);
      g.strokeStyle = alpha(tr.color, 0.5);
      const n = Engine.nodes.get(tr.id);
      const t = n && Engine.autoTarget(tr, n, tr.autoSel);
      let v = 0.5;
      if (tr.autoSel === 'vol') v = tr.volume / 1.25;
      else if (tr.autoSel === 'pan') v = (tr.pan + 1) / 2;
      else if (t) { const m = /^fx:([^:]+):(.+)$/.exec(tr.autoSel); const f = tr.fx.find((x) => x.id === m[1]); const sp = FX[f.type].params.find((p) => p.id === m[2]); v = toNorm(sp, f.p[m[2]]); }
      g.beginPath(); g.moveTo(0, vy(v)); g.lineTo(W, vy(v)); g.stroke();
      g.setLineDash([]);
      return;
    }
    const pts = lane.pts;
    g.beginPath();
    g.moveTo(0, vy(pts[0].v));
    for (const p of pts) g.lineTo(p.b * ppb, vy(p.v));
    g.lineTo(W, vy(pts[pts.length - 1].v));
    g.strokeStyle = tr.color;
    g.lineWidth = 2;
    g.stroke();
    g.lineTo(W, y0 + hh); g.lineTo(0, y0 + hh); g.closePath();
    g.fillStyle = alpha(tr.color, 0.15);
    g.fill();
    g.lineWidth = 1;
    for (const p of pts) {
      g.beginPath();
      g.arc(p.b * ppb, vy(p.v), p === this._selPt ? 6 : 4.5, 0, Math.PI * 2);
      g.fillStyle = p === this._selPt ? '#fff' : tr.color;
      g.fill();
      g.strokeStyle = '#111';
      g.stroke();
    }
  },
  drawRuler(W, beats) {
    const P = App.project, ppb = App.ppb;
    const g = sizeCanvas(this.ruler, W, 26);
    g.fillStyle = '#1c1f26';
    g.fillRect(0, 0, W, 26);
    const L = P.loop;
    if (L.end > L.start) {
      g.fillStyle = L.on ? 'rgba(47,212,196,0.55)' : 'rgba(139,147,165,0.3)';
      g.fillRect(L.start * ppb, 0, (L.end - L.start) * ppb, 6);
    }
    g.font = '11px Segoe UI, sans-serif';
    const every = ppb < 14 ? 4 : ppb < 24 ? 2 : 1, bpb = App.bpb();
    for (let b = 0; b <= beats; b++) {
      const x = Math.round(b * ppb) + 0.5;
      if (b % bpb === 0) {
        g.fillStyle = '#4a5160';
        g.fillRect(x, 10, 1, 16);
        if ((b / bpb) % every === 0) { g.fillStyle = '#c3c8d4'; g.fillText(String(b / bpb + 1), x + 4, 21); }
      } else if (ppb >= 16) { g.fillStyle = '#343a46'; g.fillRect(x, 19, 1, 7); }
    }
    // markers
    for (const m of P.markers || []) {
      const x = m.b * ppb;
      g.fillStyle = '#e879f9';
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 8, 0); g.lineTo(x, 9); g.fill();
      g.fillRect(x, 0, 1.5, 26);
      g.font = 'bold 10px Segoe UI';
      const w = g.measureText(m.name).width + 8;
      g.fillStyle = 'rgba(232,121,249,0.85)';
      g.fillRect(x + 2, 11, w, 13);
      g.fillStyle = '#1a0a20';
      g.fillText(m.name, x + 6, 21);
      g.font = '11px Segoe UI, sans-serif';
    }
  },
  clipLabel(tr, c) {
    if (tr.type === 'drums') return tr.patterns[c.pattern]?.name || 'Pattern';
    if (tr.type === 'audio') { let s = c.name || 'Audio'; if (c.takes && c.takes.length > 1) s += `  [take ${c.takes.indexOf(c.buf) + 1}/${c.takes.length}]`; if (c.edit) s += '  ✎'; return s; }
    return c.name || tr.name;
  },
  drawClip(g, tr, c, x, y, w, hh, sel) {
    const P = App.project, ppb = App.ppb;
    g.save();
    g.beginPath();
    g.roundRect(x + 0.5, y + 0.5, Math.max(4, w - 1), hh, 5);
    g.fillStyle = alpha(tr.color, sel ? 0.34 : 0.22);
    g.fill();
    g.lineWidth = sel ? 2 : 1;
    g.strokeStyle = sel ? '#ffffff' : alpha(tr.color, 0.8);
    g.stroke();
    g.clip();
    g.fillStyle = alpha(tr.color, 0.85);
    g.fillRect(x, y, w, 15);
    g.fillStyle = '#121212';
    g.font = '600 11px Segoe UI, sans-serif';
    g.fillText(this.clipLabel(tr, c), x + 6, y + 11.5);
    const y0 = y + 18, bh = hh - 21, sw = ppb / 4;
    g.fillStyle = tr.color;
    if (tr.type === 'drums') {
      const pat = tr.patterns[c.pattern];
      if (pat) {
        const rows = tr.channels.filter((ch) => pat.steps[ch.id]?.some((v) => v));
        if (rows.length) {
          const rr = Math.min(7, bh / rows.length), off = (bh - rows.length * rr) / 2;
          for (let s = 0; s < c.length * 4; s++) {
            const ps = (s + (c.off || 0)) % pat.len;
            rows.forEach((ch, ri) => { if (pat.steps[ch.id][ps]) g.fillRect(x + s * sw + 0.5, y0 + off + ri * rr, Math.max(1.5, sw - 1.5), Math.max(1, rr - 1.5)); });
          }
        }
      }
    } else if (tr.type === 'synth') {
      const ns = c.notes.filter((n) => n.s < c.length * 4);
      if (ns.length) {
        let lo = Math.min(...ns.map((n) => n.p)), hi = Math.max(...ns.map((n) => n.p));
        if (hi - lo < 12) { const m = (hi + lo) / 2; lo = m - 6; hi = m + 6; }
        const ph = bh / (hi - lo + 1);
        for (const n of ns) g.fillRect(x + n.s * sw + 0.5, y0 + (hi - n.p) * ph, Math.max(2, n.d * sw - 1.5), Math.max(2, ph - 1));
      }
    } else if (tr.type === 'audio') {
      const peaks = Buffers.peaks.get(c.buf), buf = Buffers.get(c.buf);
      if (peaks && buf) {
        const spbS = this.secPerBeatSrc(c, P), sr = buf.sampleRate, mid = y0 + bh / 2, base = c.gain ?? 1;
        const fi = c.fadeIn || 0, fo = c.fadeOut || 0;
        g.fillStyle = alpha(tr.color, 0.95);
        for (let px = 0; px < w; px++) {
          const idx = Math.floor((((c.offset || 0) + (px / ppb) * spbS) * sr) / 256);
          if (idx >= peaks.length) break;
          const bt = px / ppb;
          const fe = (fi ? Math.min(1, bt / fi) : 1) * (fo ? Math.min(1, Math.max(0, (c.length - bt) / fo)) : 1);
          const a = Math.max(0.5, Math.min(1, peaks[idx] * 1.2 * base * fe) * (bh / 2));
          g.fillRect(x + px, mid - a, 1, a * 2);
        }
        // fades
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.beginPath();
        if (fi) { g.moveTo(x, y0 + bh); g.lineTo(x + fi * ppb, y0); }
        if (fo) { g.moveTo(x + w - fo * ppb, y0); g.lineTo(x + w, y0 + bh); }
        g.stroke();
        g.fillStyle = '#fff';
        g.fillRect(x + fi * ppb - 3, y + 15, 6, 5);
        g.fillRect(x + w - fo * ppb - 3, y + 15, 6, 5);
        if (c.stretch && c.srcBpm && Math.abs(c.srcBpm - P.bpm) > 0.01) { g.fillStyle = '#121212'; g.fillText('⇔', x + w - 18, y + 11.5); }
      } else {
        g.fillStyle = '#ff8a8a';
        g.fillText('audio missing', x + 6, y0 + 14);
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(x + w - 4, y + hh / 2 - 8, 2, 16);
    g.fillRect(x + 2, y + hh / 2 - 8, 2, 16);
    g.restore();
  },
  hit(e) {
    const r = this.rowAt(e.offsetY);
    const beat = e.offsetX / App.ppb;
    if (!r) return { row: null, beat };
    if (r.kind === 'auto') return { row: r, tr: r.tr, beat };
    let clip = null;
    for (let i = r.tr.clips.length - 1; i >= 0; i--) {
      const c = r.tr.clips[i];
      if (beat >= c.start && beat <= c.start + c.length) { clip = c; break; }
    }
    return { row: r, tr: r.tr, clip, beat };
  },
  zone(e, r, c) {
    const x0 = c.start * App.ppb, x1 = (c.start + c.length) * App.ppb, x = e.offsetX, y = e.offsetY - r.y - 4;
    if (r.tr.type === 'audio' && y < 22) {
      if (Math.abs(x - (x0 + (c.fadeIn || 0) * App.ppb)) < 7) return 'fadeIn';
      if (Math.abs(x - (x1 - (c.fadeOut || 0) * App.ppb)) < 7) return 'fadeOut';
    }
    if (x1 - x < 8) return 'right';
    if (x - x0 < 6) return 'left';
    return 'move';
  },
  hover(e) {
    if (this.dragging) return;
    const { row, clip } = this.hit(e);
    if (row && row.kind === 'auto') { this.cv.style.cursor = 'crosshair'; return; }
    if (!clip) { this.cv.style.cursor = 'default'; return; }
    const z = this.zone(e, row, clip);
    this.cv.style.cursor = z === 'move' ? 'grab' : z === 'fadeIn' || z === 'fadeOut' ? 'pointer' : 'ew-resize';
  },
  snapB(b) { const s = App.snap; return Math.round(b / s) * s; },
  down(e) {
    Menu.hide();
    const P = App.project;
    const { row, tr, clip, beat } = this.hit(e);
    if (!row) { if (!e.shiftKey) App.selClips.clear(); this.startMarquee(e); return; }
    if (App.selTrackId !== tr.id) App.selectTrack(tr.id);
    if (row.kind === 'auto') return this.laneDown(e, row);
    if (e.button === 2) {
      if (clip) { if (!App.selClips.has(clip.id)) App.selClipId = clip.id; this.draw(); this.clipMenu(tr, clip, e); }
      return;
    }
    if (e.button !== 0) return;
    if (!clip) return this.emptyDown(e, row, beat);
    if (e.shiftKey) { if (App.selClips.has(clip.id)) App.selClips.delete(clip.id); else App.selClips.add(clip.id); this.draw(); Panels.render(); return; }
    if (!App.selClips.has(clip.id)) App.selClipId = clip.id;
    if (tr.type === 'synth') App.editClipId = clip.id;
    if (tr.type === 'drums') { tr.curPattern = clip.pattern; App.rackTrackId = tr.id; }
    const zone = this.zone(e, row, clip);
    App.beginDrag();
    let targets = [...App.selClips].map((id) => App.findClip(id)).filter(Boolean);
    if ((e.ctrlKey || e.altKey) && zone === 'move') {
      const dup = targets.map(({ tr: t, c }) => { const n = clone(c); n.id = uid(); t.clips.push(n); return { tr: t, c: n }; });
      targets = dup;
      App.selClips = new Set(dup.map((d) => d.c.id));
    }
    const orig = targets.map(({ c }) => ({ start: c.start, length: c.length, offset: c.offset || 0, off: c.off || 0, notes: c.notes ? clone(c.notes) : null, fadeIn: c.fadeIn || 0, fadeOut: c.fadeOut || 0 }));
    const main = targets.find((t) => t.c.id === (clip.id) || App.selClips.has(clip.id)) || targets[0];
    const mainIdx = targets.findIndex((t) => t.c === clip) >= 0 ? targets.findIndex((t) => t.c === clip) : 0;
    let srcTrack = tr;
    this.dragging = true;
    this.draw();
    Panels.render();
    const rect = this.cv.getBoundingClientRect();
    const b0 = beat;
    const move = (ev) => {
      const b = (ev.clientX - rect.left) / App.ppb;
      const d = this.snapB(b - b0);
      if (zone === 'move') {
        const minStart = Math.min(...orig.map((o) => o.start));
        const dd = Math.max(-minStart, d);
        targets.forEach(({ c }, i) => (c.start = orig[i].start + dd));
        if (targets.length === 1) {
          const r2 = this.rowAt(ev.clientY - rect.top);
          const nt = r2 && r2.kind === 'track' ? r2.tr : null;
          const c = targets[0].c;
          if (nt && nt !== srcTrack && nt.type === srcTrack.type && (nt.type !== 'drums' || nt.patterns[c.pattern])) {
            srcTrack.clips = srcTrack.clips.filter((x) => x !== c);
            nt.clips.push(c);
            targets[0].tr = nt;
            srcTrack = nt;
            App.selTrackId = nt.id;
            Headers.render();
          }
        }
      } else if (zone === 'right' || zone === 'left') {
        const { tr: t, c } = targets[mainIdx], o = orig[mainIdx];
        const minLen = Math.min(0.25, App.snap);
        if (zone === 'right') {
          let len = Math.max(minLen, this.snapB(o.start + o.length + (b - b0)) - o.start);
          if (t.type === 'audio') { const buf = Buffers.get(c.buf); if (buf) len = Math.min(len, (buf.duration - (c.offset || 0)) / this.secPerBeatSrc(c, P)); }
          c.length = Math.max(minLen, len);
        } else {
          let ns = Math.min(o.start + o.length - minLen, this.snapB(o.start + (b - b0)));
          if (t.type === 'audio') ns = Math.max(ns, o.start - o.offset / this.secPerBeatSrc(c, P));
          ns = Math.max(0, ns);
          const delta = ns - o.start;
          c.start = ns;
          c.length = o.length - delta;
          if (t.type === 'audio') c.offset = Math.max(0, o.offset + delta * this.secPerBeatSrc(c, P));
          else if (t.type === 'drums') { const L2 = t.patterns[c.pattern]?.len || 16; c.off = (((o.off + Math.round(delta * 4)) % L2) + L2) % L2; }
          else c.notes = o.notes.map((n) => ({ ...n, s: n.s - delta * 4 })).filter((n) => n.s >= 0);
        }
      } else {
        const { c } = targets[mainIdx];
        const bb = Math.max(0, Math.min(c.length, b - c.start));
        const q = Math.round(bb * 8) / 8;
        if (zone === 'fadeIn') c.fadeIn = Math.min(q, c.length - (c.fadeOut || 0));
        else c.fadeOut = Math.min(c.length - q, c.length - (c.fadeIn || 0));
      }
      this.draw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this.dragging = false;
      App.endDrag();
      App.refresh(false);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  emptyDown(e, row, beat) {
    const tr = row.tr;
    const sx = e.clientX, sy = e.clientY;
    let moved = false;
    const mv = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 4) {
        moved = true;
        window.removeEventListener('mousemove', mv);
        window.removeEventListener('mouseup', upf);
        if (!e.shiftKey) App.selClips.clear();
        this.startMarquee(e, ev);
      }
    };
    const upf = () => {
      window.removeEventListener('mousemove', mv);
      window.removeEventListener('mouseup', upf);
      if (moved) return;
      App.selClips.clear();
      if (tr.type === 'bus') { App.seek(Math.floor(beat / App.snap) * App.snap); this.draw(); return; }
      if (tr.type === 'audio') { App.seek(Math.floor(beat / App.snap) * App.snap); this.draw(); Panels.render(); return; }
      const start = Math.floor(beat / App.snap) * App.snap;
      App.mutate(() => {
        const c = { id: uid(), start, length: App.bpb() };
        if (tr.type === 'drums') { c.pattern = tr.curPattern || 0; c.length = tr.patterns[c.pattern].len / 4; c.off = 0; }
        else { c.notes = []; App.editClipId = c.id; }
        tr.clips.push(c);
        App.selClipId = c.id;
      }, false);
    };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', upf);
  },
  startMarquee(e, ev2) {
    const rect = this.cv.getBoundingClientRect();
    const mq = $('#marquee');
    const x0 = e.clientX - rect.left, y0 = e.clientY - rect.top;
    const base = new Set(App.selClips);
    const move = (ev) => {
      const x1 = ev.clientX - rect.left, y1 = ev.clientY - rect.top;
      const l = Math.min(x0, x1), t = Math.min(y0, y1), w = Math.abs(x1 - x0), hh = Math.abs(y1 - y0);
      Object.assign(mq.style, { display: 'block', left: l + 'px', top: t + 'px', width: w + 'px', height: hh + 'px' });
      const sel = new Set(base);
      for (const r of this.layout()) {
        if (r.kind !== 'track' || r.y + r.h < t || r.y > t + hh) continue;
        for (const c of r.tr.clips) if (c.start * App.ppb < l + w && (c.start + c.length) * App.ppb > l) sel.add(c.id);
      }
      App.selClips = sel;
      this.draw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      mq.style.display = 'none';
      Panels.render();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    if (ev2) move(ev2);
  },
  laneDown(e, row) {
    const tr = row.tr;
    let lane = tr.auto.find((l) => l.target === tr.autoSel);
    const y0 = row.y + 6, hh = row.h - 12;
    const toV = (y) => clamp(1 - (y - y0) / hh, 0, 1);
    const toB = (x) => Math.max(0, Math.round((x / App.ppb) * 4) / 4);
    const near = lane ? lane.pts.find((p) => Math.hypot(p.b * App.ppb - e.offsetX, y0 + (1 - p.v) * hh - e.offsetY) < 8) : null;
    if (e.button === 2) {
      if (near) App.mutate(() => { lane.pts = lane.pts.filter((p) => p !== near); }, false);
      return;
    }
    App.beginDrag();
    if (!lane) { lane = { target: tr.autoSel, pts: [] }; tr.auto.push(lane); }
    let pt = near;
    if (!pt) {
      pt = { b: toB(e.offsetX), v: toV(e.offsetY) };
      lane.pts.push(pt);
      lane.pts.sort((a, b) => a.b - b.b);
    }
    this._selPt = pt;
    const rect = this.cv.getBoundingClientRect();
    this.draw();
    const move = (ev) => {
      pt.b = toB(ev.clientX - rect.left);
      pt.v = toV(ev.clientY - rect.top);
      lane.pts.sort((a, b) => a.b - b.b);
      this.draw();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      this._selPt = null;
      App.endDrag();
      App.refresh(true);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
  dbl(e) {
    const { tr, clip } = this.hit(e);
    if (!tr || !clip) return;
    if (tr.type === 'drums') { tr.curPattern = clip.pattern; App.rackTrackId = tr.id; Panels.show('rack'); }
    else if (tr.type === 'synth') { App.editClipId = clip.id; Panels.show('piano'); }
    else { App.atTrackId = tr.id; App.selClipId = clip.id; Vocal.sub = 'pitch'; Panels.show('vocal'); }
  },
  clipMenu(tr, c, e) {
    const P = App.project;
    const items = [
      { label: 'Rename…', action: () => { const n = prompt('Clip name', c.name || ''); if (n != null) App.mutate(() => (c.name = n), false); } },
      { label: 'Duplicate', key: 'Ctrl+D', action: () => Edit.duplicate() },
      { label: 'Split at playhead', key: 'S', disabled: !(App.playhead > c.start && App.playhead < c.start + c.length), action: () => Edit.split() },
      { label: 'Copy', key: 'Ctrl+C', action: () => Edit.copy() },
      '-',
    ];
    if (tr.type === 'synth') items.push({ label: 'Edit notes', action: () => { App.editClipId = c.id; Panels.show('piano'); } });
    if (tr.type === 'drums') items.push({ label: 'Make unique (own pattern)', action: () => AudioTools.makeUnique(tr, c) });
    if (tr.type === 'drums') items.push({ label: 'Pattern', sub: tr.patterns.map((p, i) => ({ label: p.name, checked: c.pattern === i, action: () => App.mutate(() => { c.pattern = i; tr.curPattern = i; }, false) })) });
    if (tr.type === 'audio') {
      if (c.takes && c.takes.length > 1) items.push({ label: 'Takes', sub: c.takes.map((b, i) => ({ label: 'Take ' + (i + 1), checked: c.buf === b, action: () => App.mutate(() => { c.buf = b; delete c.edit; }, false) })) });
      items.push(
        { label: 'Follow song tempo', checked: !!c.stretch, action: () => App.mutate(() => { c.stretch = !c.stretch; c.srcBpm = c.srcBpm || P.bpm; }, false) },
        { label: 'Edit pitch…', action: () => { App.atTrackId = tr.id; App.selClipId = c.id; Vocal.sub = 'pitch'; Panels.show('vocal'); } },
        { label: 'Reverse', action: () => AudioTools.reverse(tr, c) },
        { label: 'Normalize', action: () => AudioTools.normalize(tr, c) },
        { label: 'Transpose', sub: [12, 7, 5, 2, 1, -1, -2, -5, -7, -12].map((st) => ({ label: (st > 0 ? '+' : '') + st + ' semitones', action: () => AudioTools.transpose(tr, c, st) })) },
        { label: 'Chop to Slicer (new track)', action: () => makeSamplerTrack(c.buf, (c.name || 'Chops') + ' chops', true) },
        { label: 'Play in Sampler (new track)', action: () => makeSamplerTrack(c.buf, c.name || 'Sampler', false) },
        { label: 'Fade in/out', sub: [0, 0.25, 0.5, 1, 2].map((f) => ({ label: f ? f + ' beat' + (f > 1 ? 's' : '') : 'None', action: () => App.mutate(() => { c.fadeIn = Math.min(f, c.length / 2); c.fadeOut = Math.min(f, c.length / 2); }, false) })) },
        { label: 'Clip volume', sub: [[-12, 0.25], [-6, 0.5], [-3, 0.71], [0, 1], [3, 1.41], [6, 2]].map(([db, g]) => ({ label: (db > 0 ? '+' : '') + db + ' dB', checked: Math.abs((c.gain ?? 1) - g) < 0.01, action: () => App.mutate(() => (c.gain = g), false) })) },
      );
    }
    items.push('-', { label: 'Delete', key: 'Del', action: () => Edit.del() });
    Menu.show(e.clientX, e.clientY, items);
  },
  rulerDown(e) {
    if (e.button === 2) {
      e.preventDefault();
      const rect0 = this.ruler.getBoundingClientRect(), b = Math.max(0, Math.round((e.clientX - rect0.left) / App.ppb / App.snap) * App.snap);
      const P = App.project, near = P.markers.find((m) => Math.abs(m.b * App.ppb - (e.clientX - rect0.left)) < 30);
      Menu.show(e.clientX, e.clientY, [
        { label: 'Add marker here…', action: () => { const n = prompt('Marker name (e.g. Verse, Chorus, Drop)', ['Intro', 'Verse', 'Chorus', 'Bridge', 'Drop', 'Outro'][P.markers.length % 6]); if (n) App.mutate(() => { P.markers.push({ b, name: n }); P.markers.sort((x, y) => x.b - y.b); }, false); } },
        near ? { label: `Rename "${near.name}"…`, action: () => { const n = prompt('Marker name', near.name); if (n) App.mutate(() => (near.name = n), false); } } : null,
        near ? { label: `Delete "${near.name}"`, action: () => App.mutate(() => (P.markers = P.markers.filter((m) => m !== near)), false) } : null,
        near ? { label: `Loop "${near.name}" section`, action: () => { const nx = P.markers.find((m) => m.b > near.b); App.mutate(() => (P.loop = { on: true, start: near.b, end: nx ? nx.b : Engine.songEnd(P) || near.b + App.bpb() * 4 }), false); App.syncTop(); } } : null,
      ].filter(Boolean));
      return;
    }
    const rect = this.ruler.getBoundingClientRect();
    const snap = Math.max(1, App.snap);
    const b0 = (e.clientX - rect.left) / App.ppb;
    let dragged = false;
    const P = App.project;
    const move = (ev) => {
      const b1 = (ev.clientX - rect.left) / App.ppb;
      if (!dragged && Math.abs(ev.clientX - e.clientX) > 5) { dragged = true; App.beginDrag(); }
      if (dragged) {
        const a = Math.floor(Math.min(b0, b1) / snap) * snap, z = Math.ceil(Math.max(b0, b1) / snap) * snap;
        P.loop.start = Math.max(0, a);
        P.loop.end = Math.max(a + snap, z);
        P.loop.on = true;
        $('#btn-loop').classList.add('on');
        this.draw();
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (!dragged) App.seek(Math.floor(b0 / App.snap) * App.snap);
      else App.endDrag();
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  },
};

// ---- clip editing commands (keyboard + menus) ----
const Edit = {
  clipboard: null,
  sel() { return [...App.selClips].map((id) => App.findClip(id)).filter(Boolean); },
  del() { const s = this.sel(); if (!s.length) return; App.mutate(() => s.forEach(({ tr, c }) => (tr.clips = tr.clips.filter((x) => x !== c)))); },
  duplicate() {
    const s = this.sel();
    if (!s.length) return;
    const lo = Math.min(...s.map((x) => x.c.start)), hi = Math.max(...s.map((x) => x.c.start + x.c.length));
    App.mutate(() => { App.selClips = new Set(s.map(({ tr, c }) => { const n = clone(c); n.id = uid(); n.start = c.start + (hi - lo); tr.clips.push(n); return n.id; })); });
  },
  copy() {
    const s = this.sel();
    if (!s.length) return;
    const lo = Math.min(...s.map((x) => x.c.start));
    this.clipboard = s.map(({ tr, c }) => ({ trackId: tr.id, type: tr.type, c: { ...clone(c), start: c.start - lo } }));
    toast(`Copied ${s.length} clip${s.length > 1 ? 's' : ''}`);
  },
  cut() { this.copy(); this.del(); },
  paste() {
    if (!this.clipboard) return;
    const P = App.project, at = Math.floor(App.playhead / App.snap) * App.snap, sel = App.track(App.selTrackId);
    App.mutate(() => {
      const ids = new Set();
      for (const it of this.clipboard) {
        let tr = App.track(it.trackId);
        if (!tr || (this.clipboard.length === 1 && sel && sel.type === it.type)) tr = sel && sel.type === it.type ? sel : tr;
        if (!tr) continue;
        const n = clone(it.c);
        n.id = uid();
        n.start = at + it.c.start;
        tr.clips.push(n);
        ids.add(n.id);
      }
      App.selClips = ids;
    });
  },
  split() {
    const b = App.playhead, P = App.project;
    const s = this.sel().filter(({ c }) => b > c.start + 1e-6 && b < c.start + c.length - 1e-6);
    const targets = s.length ? s : P.tracks.flatMap((tr) => tr.clips.filter((c) => b > c.start && b < c.start + c.length && tr.id === App.selTrackId).map((c) => ({ tr, c })));
    if (!targets.length) return toast('Put the playhead over a clip to split it');
    App.mutate(() => {
      for (const { tr, c } of targets) {
        const d = b - c.start, r = clone(c);
        r.id = uid();
        r.start = b;
        r.length = c.length - d;
        c.length = d;
        if (tr.type === 'synth') {
          const st = d * 4;
          r.notes = c.notes.filter((n) => n.s >= st).map((n) => ({ ...n, s: n.s - st }));
          c.notes = c.notes.filter((n) => n.s < st).map((n) => ({ ...n, d: Math.min(n.d, st - n.s) }));
        } else if (tr.type === 'drums') {
          const L2 = tr.patterns[c.pattern]?.len || 16;
          r.off = ((c.off || 0) + Math.round(d * 4)) % L2;
        } else {
          r.offset = (c.offset || 0) + d * TL.secPerBeatSrc(c, P);
          c.fadeOut = 0; r.fadeIn = 0;
        }
        tr.clips.push(r);
      }
    });
  },
  selectAll() { App.selClips = new Set(App.project.tracks.flatMap((t) => t.clips.map((c) => c.id))); TL.draw(); },
};
