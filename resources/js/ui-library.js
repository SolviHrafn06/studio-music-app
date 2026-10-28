// "My samples" library (your own sample folders) + audio clip tools (reverse, normalize, transpose, bounce).

const AUDIO_EXT = /\.(wav|mp3|ogg|flac|m4a|aac|aif|aiff|opus|webm)$/i;
const Library = {
  folders: [],
  items: [],
  filter: '',
  cache: new Map(),
  scanning: false,
  init() {
    try { this.folders = JSON.parse(localStorage.getItem('studio-sample-folders') || '[]'); } catch (e) { this.folders = []; }
    if (NL() && this.folders.length) this.scanAll();
  },
  save() { try { localStorage.setItem('studio-sample-folders', JSON.stringify(this.folders.filter((f) => f.path))); } catch (e) {} },
  async addFolder() {
    if (NL()) {
      const path = await Neutralino.os.showFolderDialog('Choose a folder with your samples');
      if (!path) return;
      if (!this.folders.some((f) => f.path === path)) this.folders.push({ path, name: path.split(/[\\/]/).filter(Boolean).pop() });
      this.save();
      await this.scanAll();
    } else {
      const inp = h('input', { type: 'file', multiple: true });
      inp.setAttribute('webkitdirectory', '');
      inp.onchange = () => {
        const files = [...inp.files].filter((f) => AUDIO_EXT.test(f.name));
        if (!files.length) return toast('No audio files found in that folder');
        const root = (files[0].webkitRelativePath || files[0].name).split('/')[0];
        this.folders.push({ name: root, session: true });
        for (const f of files) this.items.push({ name: f.name, folder: root, rel: (f.webkitRelativePath || f.name).split('/').slice(1, -1).join(' / '), file: f });
        Browser.render();
      };
      inp.click();
    }
  },
  removeFolder(f) {
    this.folders = this.folders.filter((x) => x !== f);
    this.items = this.items.filter((i) => i.folder !== f.name);
    this.save();
    Browser.render();
  },
  async scanAll() {
    if (!NL()) return;
    this.scanning = true;
    this.items = this.items.filter((i) => i.file);
    Browser.cat === 'mine' && Browser.render();
    for (const f of this.folders) {
      if (!f.path) continue;
      try { await this.scan(f, f.path, '', 0); } catch (e) { console.warn('scan failed', f.path, e); }
    }
    this.scanning = false;
    if (Browser.cat === 'mine' && App.tab === 'browser') Browser.render();
  },
  async scan(folder, dir, rel, depth) {
    if (depth > 6 || this.items.length > 5000) return;
    const entries = await Neutralino.filesystem.readDirectory(dir);
    for (const e of entries) {
      if (e.entry === '.' || e.entry === '..') continue;
      const full = e.path || dir.replace(/[\\/]+$/, '') + '/' + e.entry;
      if (e.type === 'DIRECTORY') await this.scan(folder, full, rel ? rel + ' / ' + e.entry : e.entry, depth + 1);
      else if (AUDIO_EXT.test(e.entry)) this.items.push({ name: e.entry, folder: folder.name, rel, path: full });
    }
  },
  async buffer(item) {
    const key = item.path || item.name + item.rel + item.folder;
    if (this.cache.has(key)) return this.cache.get(key);
    const ab = item.file ? await item.file.arrayBuffer() : await Neutralino.filesystem.readBinaryFile(item.path);
    const buf = await Engine.ctx.decodeAudioData(ab);
    this.cache.set(key, buf);
    if (this.cache.size > 40) this.cache.delete(this.cache.keys().next().value);
    return buf;
  },
  _prev: null,
  async preview(item) {
    try {
      const buf = await this.buffer(item);
      if (this._prev) try { this._prev.stop(); } catch (e) {}
      const s = Engine.ctx.createBufferSource();
      s.buffer = buf;
      s.connect(Engine.previewBus);
      s.start();
      this._prev = s;
    } catch (e) { toast('Could not play ' + item.name); }
  },
  async addToTimeline(item, tr, beat) {
    const buf = await this.buffer(item);
    const id = Buffers.add(buf);
    const P = App.project;
    App.mutate(() => {
      if (!tr || tr.type !== 'audio') {
        tr = makeTrack('audio', P);
        tr.name = item.name.replace(/\.[^.]+$/, '').slice(0, 20);
        tr.autotune.on = false;
        tr.rev = 0;
        P.tracks.push(tr);
      }
      const c = { id: uid(), start: beat ?? Math.floor(App.playhead), length: buf.duration / (60 / P.bpm), buf: id, takes: [id], offset: 0, name: item.name, srcBpm: P.bpm, stretch: false, fadeIn: 0, fadeOut: 0, gain: 1 };
      tr.clips.push(c);
      App.selTrackId = tr.id;
      App.selClipId = c.id;
    });
  },
  async toDrums(item) {
    const buf = await this.buffer(item);
    const id = Buffers.add(buf);
    const P = App.project;
    let tr = App.track(App.rackTrackId) || P.tracks.find((t) => t.type === 'drums');
    App.mutate(() => {
      if (!tr) { tr = makeTrack('drums', P); tr.channels = []; P.tracks.unshift(tr); }
      tr.channels.push({ id: uid(), kind: 'kick', name: item.name.replace(/\.[^.]+$/, '').slice(0, 24), vol: 0.8, mute: false, sample: id, pitch: 0 });
      App.rackTrackId = tr.id;
    });
    toast(`Added "${item.name}" to the Channel Rack`);
  },
  async toSampler(item, chop) {
    const buf = await this.buffer(item);
    makeSamplerTrack(Buffers.add(buf), item.name.replace(/\.[^.]+$/, ''), chop);
  },
  render(list, tools) {
    list.classList.add('lib');
    tools.append(
      h('button', { class: 'primary', onclick: () => this.addFolder() }, '📁 Add sample folder…'),
      h('input', { type: 'text', placeholder: 'Search samples…', value: this.filter, class: 'lib-search', oninput: (e) => { this.filter = e.target.value; this.fill(list); } }),
      this.scanning ? h('span', { class: 'hint2' }, 'Scanning…') : h('span', { class: 'hint2' }, `${this.items.length} sounds`),
      ...this.folders.map((f) => h('span', { class: 'lib-folder', title: f.path || 'this session only' }, '📁 ' + f.name, h('button', { class: 'mini', title: 'Remove folder', onclick: () => this.removeFolder(f) }, '✕'))));
    this.fill(list);
  },
  fill(list) {
    list.innerHTML = '';
    if (!this.folders.length) {
      list.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, 'Add the folders where you keep your sample packs, drum kits and loops. Click a sound to hear it, then add it to your song, the Channel Rack, or the Sampler — or drag it onto the timeline.'));
      return;
    }
    const q = this.filter.toLowerCase();
    const shown = this.items.filter((i) => !q || (i.name + ' ' + i.rel + ' ' + i.folder).toLowerCase().includes(q)).slice(0, 400);
    for (const it of shown) {
      const row = h('div', { class: 'br-row lib-row', draggable: true },
        h('button', { class: 'br-play', title: 'Preview', onclick: () => this.preview(it) }, '▶'),
        h('div', { class: 'br-info', onclick: () => this.preview(it) }, h('b', {}, it.name.replace(/\.[^.]+$/, '')), h('small', {}, [it.folder, it.rel].filter(Boolean).join(' / '))),
        h('button', { class: 'br-add', title: 'Add to the song as an audio clip at the playhead', onclick: () => this.addToTimeline(it, App.track(App.selTrackId)) }, '+ Song'),
        h('button', { class: 'br-add', title: 'Add as a sound in the Channel Rack (step sequencer)', onclick: () => this.toDrums(it) }, '→ Rack'),
        h('button', { class: 'br-add', title: 'Open in the Sampler / Slicer', onclick: () => this.toSampler(it, false) }, '→ Sampler'));
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/studio-lib', String(this.items.indexOf(it))); e.dataTransfer.effectAllowed = 'copy'; });
      list.append(row);
    }
    if (!shown.length) list.append(h('div', { class: 'empty', style: 'grid-column:1/-1' }, this.scanning ? 'Scanning your folders…' : 'No sounds match.'));
  },
};

// ---- audio clip tools ----
const AudioTools = {
  replace(c, buf) {
    const id = Buffers.add(buf);
    const i = (c.takes || []).indexOf(c.buf);
    if (i >= 0) c.takes[i] = id; else c.takes = [id];
    c.buf = id;
    delete c.edit;
    return id;
  },
  reverse(tr, c) {
    const b = Buffers.get(c.buf);
    const r = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: b.length, sampleRate: b.sampleRate });
    for (let ch = 0; ch < b.numberOfChannels; ch++) r.copyToChannel(b.getChannelData(ch).slice().reverse(), ch);
    const lenSec = c.length * TL.secPerBeatSrc(c, App.project);
    App.mutate(() => { this.replace(c, r); c.offset = Math.max(0, b.duration - ((c.offset || 0) + lenSec)); });
    toast('Reversed');
  },
  normalize(tr, c) {
    const b = Buffers.get(c.buf);
    let pk = 0;
    for (let ch = 0; ch < b.numberOfChannels; ch++) for (const v of b.getChannelData(ch)) if (Math.abs(v) > pk) pk = Math.abs(v);
    if (pk < 1e-4) return toast('Clip is silent');
    const g = 0.966 / pk;
    const r = new AudioBuffer({ numberOfChannels: b.numberOfChannels, length: b.length, sampleRate: b.sampleRate });
    for (let ch = 0; ch < b.numberOfChannels; ch++) r.copyToChannel(b.getChannelData(ch).map((v) => v * g), ch);
    App.mutate(() => this.replace(c, r));
    toast(`Normalized (${(20 * Math.log10(g)).toFixed(1)} dB)`);
  },
  // pitch-shift any audio (loops, chords, vocals): time-stretch by r with WSOLA, then resample by r
  async shiftBuffer(b, semis) {
    const r = Math.pow(2, semis / 12);
    const chans = [];
    for (let ch = 0; ch < b.numberOfChannels; ch++) chans.push(b.getChannelData(ch).slice());
    const res = await Worker1.call({ cmd: 'stretch', chans, sr: b.sampleRate, ratio: r }, chans.map((x) => x.buffer));
    const st = new AudioBuffer({ numberOfChannels: res.chans.length, length: res.chans[0].length, sampleRate: b.sampleRate });
    res.chans.forEach((d, i) => st.copyToChannel(d, i));
    const ctx = new OfflineAudioContext(b.numberOfChannels, b.length, b.sampleRate);
    const s = ctx.createBufferSource();
    s.buffer = st;
    s.playbackRate.value = r;
    s.connect(ctx.destination);
    s.start();
    return ctx.startRendering();
  },
  async transpose(tr, c, semis) {
    toast('Transposing…', 8000);
    const r = await this.shiftBuffer(Buffers.get(c.buf), semis);
    App.mutate(() => { this.replace(c, r); c.name = (c.name || 'Audio').replace(/ \([+-]\d+\)$/, '') + ` (${semis > 0 ? '+' : ''}${semis})`; });
    toast(`Transposed ${semis > 0 ? 'up' : 'down'} ${Math.abs(semis)} semitone${Math.abs(semis) > 1 ? 's' : ''}`);
  },
  async bounce(tr) {
    const P = App.project;
    if (!tr.clips.length) return toast('Nothing to bounce on this track');
    toast('Bouncing ' + tr.name + ' to audio…', 15000);
    const buf = await Engine.render(P, { only: tr.id, noMaster: true, tail: 1.5 });
    const id = Buffers.add(buf);
    let nt;
    App.mutate(() => {
      nt = makeTrack('audio', P);
      nt.name = tr.name + ' (audio)';
      nt.color = tr.color;
      nt.autotune.on = false;
      nt.rev = 0;
      nt.clips.push({ id: uid(), start: 0, length: buf.duration / (60 / P.bpm), buf: id, takes: [id], offset: 0, name: tr.name + ' bounce', srcBpm: P.bpm, stretch: false, fadeIn: 0, fadeOut: 0, gain: 1 });
      P.tracks.splice(P.tracks.indexOf(tr) + 1, 0, nt);
      tr.mute = true;
    });
    toast(`Bounced to "${nt.name}" — the original is muted (unmute it any time).`, 5000);
  },
  makeUnique(tr, c) {
    App.mutate(() => {
      const pat = clone(tr.patterns[c.pattern]);
      pat.name = pat.name + ' (' + (tr.patterns.length + 1) + ')';
      tr.patterns.push(pat);
      c.pattern = tr.patterns.length - 1;
      tr.curPattern = c.pattern;
    });
    toast('This clip now has its own pattern');
  },
};
