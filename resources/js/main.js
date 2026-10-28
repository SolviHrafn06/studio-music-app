// Studio — boot, top bar, keyboard shortcuts, animation loop.

const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15 };
App.typing = true;

function typingActive() {
  const tr = App.track(App.selTrackId);
  return App.typing && tr && (tr.type === 'synth' || tr.type === 'drums');
}
function onKeyDown(e) {
  if (/^F(5|6|7|8|9|10|11|12)$/.test(e.key) || (e.ctrlKey && e.key.toLowerCase() === 'r')) e.preventDefault();
  if (isTyping(e)) return;
  const fk = { F5: () => toggleBottom(), F6: () => Panels.show('rack'), F7: () => Panels.show('piano'), F8: () => Panels.show('browser'), F9: () => Panels.show('mixer'), F10: () => AudioSettings.open(), F11: () => Panels.show('fx'), F12: () => Panels.show('vocal') }[e.key];
  if (fk) { fk(); return; }
  const k = e.key.toLowerCase();
  const inPiano = App.tab === 'piano' && Piano.c;
  if (e.ctrlKey || e.metaKey) {
    const map = {
      z: () => (e.shiftKey ? App.redo() : App.undo()), y: () => App.redo(), s: () => saveProject(), o: () => openProject(),
      e: () => exportSong('wav'), r: () => exportSong('wav'), q: () => inPiano && Piano.quantize(), b: () => (inPiano && Piano.dupSel()) || Edit.duplicate(), d: () => Edit.duplicate(), t: () => Edit.split(), l: () => toggleLoop(),
      c: () => (inPiano && Piano.copy()) || Edit.copy(), x: () => (inPiano && Piano.copy() && Piano.delSel()) || Edit.cut(),
      v: () => (inPiano && Piano.paste()) || Edit.paste(), a: () => (inPiano ? Piano.selectAll() : Edit.selectAll()),
    };
    if (map[k]) { e.preventDefault(); map[k](); }
    return;
  }
  if (e.key === ' ') { e.preventDefault(); App.togglePlay(); return; }
  if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); App.seek(0); return; }
  if (e.key === 'Escape') { App.selClips.clear(); Piano.sel.clear(); TL.draw(); Piano.draw(); Menu.hide(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { if (!(inPiano && Piano.delSel())) Edit.del(); return; }
  if (inPiano && Piano.sel.size && e.key.startsWith('Arrow')) {
    e.preventDefault();
    if (e.key === 'ArrowUp') Piano.transpose(e.shiftKey ? 12 : 1);
    else if (e.key === 'ArrowDown') Piano.transpose(e.shiftKey ? -12 : -1);
    else Piano.nudge((e.key === 'ArrowLeft' ? -1 : 1) * (Piano.snap || 1));
    return;
  }
  if (e.key === '+' || e.key === '=') { zoom(1.25); return; }
  if (e.key === '-') { zoom(0.8); return; }
  if (e.repeat) return;
  const tr = App.track(App.selTrackId);
  if (typingActive()) {
    if (k === 'z') { App.octave = Math.max(1, App.octave - 1); toast('Keyboard octave ' + App.octave); return; }
    if (k === 'x') { App.octave = Math.min(7, App.octave + 1); toast('Keyboard octave ' + App.octave); return; }
    if (tr.type === 'synth' && k in KEYMAP) { App.noteOn((App.octave + 1) * 12 + KEYMAP[k], 0.85, 'k' + k); return; }
    if (tr.type === 'drums' && /^[1-9]$/.test(k)) { const ch = tr.channels[+k - 1]; if (ch) Rack.preview(tr, ch, 1); return; }
  }
  if (k === 'r') { App.toggleRecord(); return; }
  if (k === 'l') { toggleLoop(); return; }
  if (k === 'm') { toggleMetro(); return; }
  if (k === 's') { Edit.split(); return; }
}
function onKeyUp(e) {
  if (e.key === ' ') e.preventDefault();
  App.noteOff('k' + e.key.toLowerCase());
}
function toggleBottom() {
  const cur = getComputedStyle(document.body).getPropertyValue('--bottom-h').trim();
  if (parseInt(cur) > 60) { App._bh = cur; document.body.style.setProperty('--bottom-h', '38px'); }
  else document.body.style.setProperty('--bottom-h', App._bh || '360px');
  setTimeout(() => TL.draw(), 50);
}
function toggleMode() {
  App.patMode = !App.patMode;
  $('#btn-mode').textContent = App.patMode ? 'PAT' : 'SONG';
  $('#btn-mode').classList.toggle('pat', App.patMode);
  if (Engine.playing) { App.stop(); App.play(); }
}
function toggleMetro() { Engine.metronome = !Engine.metronome; $('#btn-metro').classList.toggle('on', Engine.metronome); }
function toggleLoop() { App.mutate(() => (App.project.loop.on = !App.project.loop.on), false); App.syncTop(); }
function zoom(f) {
  const sc = TL.scroll, center = (sc.scrollLeft + sc.clientWidth / 2 - 230) / App.ppb;
  App.ppb = clamp(App.ppb * f, 8, 200);
  TL.draw();
  sc.scrollLeft = center * App.ppb - sc.clientWidth / 2 + 230;
}

// ---------------- animation loop ----------------
let masterPeak = 0;
function frame() {
  if (App.project && Engine.ctx) {
    const playing = Engine.playing;
    const b = playing ? Engine.beat() : App.playhead;
    const x = b * App.ppb;
    $('#playhead').style.left = x + 'px';
    $('#ruler-head').style.left = x + 'px';
    const bpb = App.bpb(), bar = Math.floor(b / bpb) + 1, beat = Math.floor(b % bpb) + 1, six = Math.floor((b * 4) % 4) + 1;
    $('#time-bars').textContent = `${bar}.${beat}.${six}`;
    const secs = (b * 60) / App.project.bpm;
    $('#time-secs').textContent = `${Math.floor(secs / 60)}:${(secs % 60).toFixed(1).padStart(4, '0')}`;
    if (playing) {
      const sc = TL.scroll, vis = sc.clientWidth - 230;
      if (x > sc.scrollLeft + vis - 40 || x < sc.scrollLeft) sc.scrollLeft = Math.max(0, x - 60);
      if (x > TL.cv.clientWidth - 200) TL.draw();
    }
    const rr = $('#rec-region');
    const recTrack = Engine.recording && Engine.recInfo ? Engine.recInfo.trackId : App.midiRec ? App.midiRec.trackId : null;
    if (recTrack && playing) {
      const tr = App.track(recTrack);
      const s = Engine.recInfo ? Engine.recInfo.startBeat : App.midiRec.loop ? App.midiRec.loop.start : App.playhead;
      Object.assign(rr.style, { display: 'block', left: s * App.ppb + 'px', width: Math.max(2, (b - s) * App.ppb) + 'px', top: TL.trackY(tr) + 4 + 'px', height: App.rowH - 8 + 'px' });
    }
    Rack.highlight(playing ? b : null);
    Piano.playhead(playing ? b : null);
    Mixer.drawMeters();
    FxPanel.drawMeters();
    AT.drawGraph();
    InputPanel.draw();
    const pk = peakOf(Engine.bus.analyser);
    masterPeak = Math.max(pk, masterPeak * 0.92);
    const cv = $('#master-meter'), g = cv.getContext('2d');
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, cv.width, cv.height);
    const grad = g.createLinearGradient(0, 0, cv.width, 0);
    grad.addColorStop(0, '#2fd4c4'); grad.addColorStop(0.7, '#4ade80'); grad.addColorStop(0.88, '#facc15'); grad.addColorStop(1, '#ff3b5c');
    g.fillStyle = grad;
    g.fillRect(2, 8, (cv.width - 4) * levelFrac(masterPeak), cv.height - 16);
    if (masterPeak > 0.98) { g.fillStyle = '#ff3b5c'; g.fillRect(cv.width - 6, 2, 4, cv.height - 4); }
  }
  requestAnimationFrame(frame);
}

// ---------------- top bar & layout ----------------
function wireTopBar() {
  options($('#key'), NOTE_NAMES.map((n, i) => [i, n]), 0);
  options($('#scale'), Object.keys(SCALES), 'Major');
  $('#btn-play').onclick = () => App.togglePlay();
  $('#btn-stop').onclick = () => App.stop();
  $('#btn-home').onclick = () => App.seek(0);
  $('#btn-rec').onclick = () => App.toggleRecord();
  $('#btn-loop').onclick = toggleLoop;
  $('#btn-metro').onclick = toggleMetro;
  $('#btn-mode').onclick = toggleMode;
  $('#timesig').onchange = (e) => { App.mutate(() => (App.project.bpb = +e.target.value), false); $('#snap').options[0].value = App.project.bpb; if ($('#snap').selectedIndex === 0) App.snap = App.project.bpb; };
  $('#btn-typing').onclick = () => { App.typing = !App.typing; $('#btn-typing').classList.toggle('on', App.typing); toast(App.typing ? 'Musical typing ON: A–K play notes' : 'Musical typing OFF'); };
  $('#btn-undo').onclick = () => App.undo();
  $('#btn-redo').onclick = () => App.redo();
  $('#btn-save').onclick = saveProject;
  $('#btn-open').onclick = openProject;
  $('#btn-export').onclick = (e) => Menu.show(e.clientX, e.clientY + 14, [
    { label: 'Export WAV (best quality)', key: 'Ctrl+E', action: () => exportSong('wav') },
    { label: 'Export MP3 (192 kbps)', action: () => exportSong('mp3') },
    { label: 'Export stems (one WAV per track)', action: () => exportSong('stems') },
  ]);
  $('#btn-import').onclick = () => importAudio();
  $('#btn-settings').onclick = () => AudioSettings.open();
  $('#btn-new').onclick = () => { if (!App.dirty || confirm('Start a new empty project? Unsaved changes will be lost.')) { Buffers.clear(); App.load(emptyProject()); } };
  $('#song-name').onchange = (e) => App.mutate(() => (App.project.name = e.target.value || 'My Song'), false);
  $('#bpm').onchange = (e) => {
    const P = App.project;
    const nb = clamp(Math.round(+e.target.value || 120), 40, 240);
    e.target.value = nb;
    const was = Engine.playing && !Engine.recording ? Engine.beat() : null;
    App.mutate(() => {
      const ratio = nb / P.bpm;
      P.tracks.forEach((t) => t.type === 'audio' && t.clips.forEach((c) => { if (!c.stretch) c.length *= ratio; }));
      P.bpm = nb;
    }, false);
    if (was != null) Engine.play(was);
  };
  $('#bpm').addEventListener('wheel', (e) => { e.preventDefault(); $('#bpm').value = +$('#bpm').value - Math.sign(e.deltaY); $('#bpm').onchange({ target: $('#bpm') }); }, { passive: false });
  $('#key').onchange = (e) => App.mutate(() => (App.project.key = +e.target.value), false);
  $('#scale').onchange = (e) => App.mutate(() => (App.project.scale = e.target.value), false);
  $('#snap').onchange = (e) => (App.snap = +e.target.value);
  $('#zoom-in').onclick = () => zoom(1.25);
  $('#zoom-out').onclick = () => zoom(0.8);
  $$('#tabs button[data-tab]').forEach((b) => (b.onclick = () => Panels.show(b.dataset.tab)));
  window.addEventListener('mouseup', () => { if (Rack.painting.on) { Rack.painting.on = false; App.endDrag(); TL.draw(); } });
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  document.addEventListener('contextmenu', (e) => { if (!isTyping(e)) e.preventDefault(); });
  document.addEventListener('mouseup', () => { const a = document.activeElement; if (a && a.tagName === 'BUTTON') a.blur(); });
  TL.scroll.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15); } }, { passive: false });
  // resizable bottom panel
  const rz = $('#resizer');
  rz.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const y0 = e.clientY, h0 = $('#bottom').getBoundingClientRect().height;
    const move = (ev) => { const nh = clamp(h0 + (y0 - ev.clientY), 160, innerHeight - 220); document.body.style.setProperty('--bottom-h', nh + 'px'); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); TL.draw(); Panels.render(); try { localStorage.setItem('studio-bottom-h', document.body.style.getPropertyValue('--bottom-h')); } catch (e) {} };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  });
  try { const v = localStorage.getItem('studio-bottom-h'); if (v) document.body.style.setProperty('--bottom-h', v); } catch (e) {}
}

async function boot() {
  if (NL()) {
    try {
      Neutralino.init();
      Neutralino.events.on('windowClose', async () => {
        let exit = true;
        try {
          if (App.dirty && App.project) {
            await Autosave.save();
            const r = await Neutralino.os.showMessageBox('Studio', 'Save changes to "' + App.project.name + '" before closing?', 'YES_NO_CANCEL', 'QUESTION');
            if (r === 'CANCEL') exit = false;
            else if (r === 'YES') await saveProject();
          }
        } catch (e) { console.warn(e); }
        if (exit) Neutralino.app.exit();
      });
    } catch (e) { console.warn(e); }
  }
  TL.init();
  wireTopBar();
  await Autosave.open();
  const last = await Autosave.last();
  const start = async (mode) => {
    $$('.splash-card button').forEach((b) => (b.disabled = true));
    try {
      await Engine.init();
      await Engine.ctx.resume();
    } catch (e) {
      console.error(e);
      $('#start-btn').textContent = 'Audio failed to start: ' + e.message;
      return;
    }
    $('#splash').classList.add('hidden');
    let opened = false;
    if (mode === 'recover' && last) { await Autosave.restore(last); opened = true; toast('Recovered your last session.'); }
    if (!opened && window.NL_ARGS) {
      const f = NL_ARGS.find((a) => /\.studio$/i.test(a));
      if (f && NL()) { try { await loadProjectText(await Neutralino.filesystem.readFile(f), f.split(/[\\/]/).pop().replace(/\.studio$/i, '')); opened = true; } catch (e) { console.warn(e); } }
    }
    if (!opened && mode === 'open') { App.load(emptyProject()); await openProject(); opened = true; }
    if (!opened) { App.load(mode === 'empty' ? emptyProject() : demoProject()); toast(mode === 'empty' ? 'New project ready.' : 'Loaded a demo song — press Space to play it!', 4000); }
    Autosave.prune();
    Library.init();
    AudioSettings.restore();
    MIDI.init();
    setInterval(() => App.dirty && Autosave.save(), 60000);
  };
  $('#start-btn').onclick = () => start('demo');
  $('#empty-btn').onclick = () => start('empty');
  $('#open-btn').onclick = () => start('open');
  if (last && last.json) {
    const t = new Date(last.time);
    const btn = $('#recover-btn');
    btn.style.display = '';
    btn.textContent = `↺ Recover last session (${t.toLocaleDateString()} ${t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    btn.onclick = () => start('recover');
  }
  requestAnimationFrame(frame);
}
boot();
