const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const srv = require('./serve')(8781);
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1500, height: 920 }, acceptDownloads: true });
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack||'').split('\n').slice(1,3).join(' ')));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.type()+' '+m.text()); });
  await pg.goto('http://localhost:8781/');
  await pg.click('#start-btn');
  await pg.waitForTimeout(2500);
  const step = async (name, fn, arg) => { try { const r = await pg.evaluate(fn, arg); console.log('✓', name, r !== undefined ? JSON.stringify(r) : ''); } catch (e) { console.log('✗', name, e.message.split('\n')[0]); } };
  const wait = (ms) => pg.waitForTimeout(ms);

  await step('render demo', async () => { const b = await Engine.render(App.project); let pk=0; const d=b.getChannelData(0); for(let i=0;i<d.length;i+=5) pk=Math.max(pk,Math.abs(d[i])); return {dur:b.duration.toFixed(1), peak:pk.toFixed(2)}; });
  // audio recording
  await step('record start', async () => { App.selectTrack(App.project.tracks.find(t=>t.type==='audio').id); App.seek(0); await App.toggleRecord(); return Engine.recording; });
  await wait(2500);
  await step('record stop', async () => { await App.stop(); const t=App.project.tracks.find(t=>t.type==='audio'); return t.clips.map(c=>({len:c.length.toFixed(2), takes:c.takes.length})); });
  // loop recording takes
  await step('loop rec start', async () => { const P=App.project; P.loop={on:true,start:0,end:4}; App.seek(0); await App.toggleRecord(); return true; });
  await wait(7000);
  await step('loop rec stop', async () => { await App.stop(); App.project.loop.on=false; const t=App.project.tracks.find(t=>t.type==='audio'); return t.clips.map(c=>({start:c.start, len:c.length.toFixed(2), takes:c.takes.length})); });
  // pitch editor
  await step('pitch editor', async () => {
    const t=App.project.tracks.find(t=>t.type==='audio'); const c=t.clips[0]; App.atTrackId=t.id; App.selClipId=c.id; Vocal.sub='pitch'; Panels.show('vocal');
    const an = await Vocal.analyze(c.buf); await new Promise(r=>setTimeout(r,300));
    Vocal.autoCorrect(c, t); await new Promise(r=>setTimeout(r,2500));
    return {notes: an.notes.length, edited: !!c.edit, newBuf: c.buf !== c.edit?.src, status: document.querySelector('#pe-status')?.textContent};
  });
  await pg.screenshot({ path: path.join(SHOTS, 'f-pitch.png') });
  // all effects
  await step('all fx', async () => { const t=App.project.tracks[1]; App.mutate(()=>{ for (const k of FX_ORDER) t.fx.push(newFx(k)); }); App.fxTrackId=t.id; Panels.show('fx'); App.seek(0); App.play(); await new Promise(r=>setTimeout(r,1500)); App.stop(); return Engine.nodes.get(t.id).fx.length; });
  await pg.screenshot({ path: path.join(SHOTS, 'f-fx.png') });
  await step('fx render', async () => { const b = await Engine.render(App.project); let pk=0; const d=b.getChannelData(0); for(let i=0;i<d.length;i+=5) pk=Math.max(pk,Math.abs(d[i])); const bad = d.some(v=>!isFinite(v)); return {peak:pk.toFixed(2), bad}; });
  await step('remove fx', async () => { App.mutate(()=>{ App.project.tracks[1].fx=[]; }); return true; });
  // automation lanes UI
  await step('automation show', async () => { const t=App.project.tracks[4]; App.mutate(()=>{ t.autoShow=true; t.autoSel=t.auto[0].target; }); return TL.layout().length; });
  await pg.screenshot({ path: path.join(SHOTS, 'f-auto.png') });
  // time stretch
  await step('stretch', async () => { const t=App.project.tracks.find(t=>t.type==='audio'); const c=t.clips[0]; c.stretch=true; c.srcBpm=App.project.bpm; const before=Buffers.get(c.buf).duration; App.project.bpm=120; await Engine.ensureStretched(App.project); const r=Engine.clipBuffer(c, App.project); App.project.bpm=92; return {before:before.toFixed(2), after:r.buf.duration.toFixed(2), ratio:r.ratio.toFixed(3)}; });
  // midi record
  await step('midi rec', async () => { const t=App.project.tracks.find(t=>t.name==='Piano'); App.mutate(()=>{ App.project.tracks.forEach(x=>x.armed=false); t.armed=true; }); App.selectTrack(t.id); App.seek(32); await App.toggleRecord(); 
    const sleep=(ms)=>new Promise(r=>setTimeout(r,ms)); for (const p of [60,64,67,72]) { App.noteOn(p,0.9,'t'+p); await sleep(250); App.noteOff('t'+p); await sleep(100);} await App.stop(); const c=t.clips[t.clips.length-1]; return {start:c.start, n:c.notes.length, notes:c.notes.map(n=>[n.p,n.s,n.d])}; });
  // editing
  await step('split/dup/copy/paste', async () => { const t=App.project.tracks[2]; const c=t.clips[0]; App.selClipId=c.id; App.playhead=8; Edit.split(); const n1=t.clips.length; App.selClipId=t.clips[0].id; Edit.duplicate(); Edit.copy(); App.playhead=60; Edit.paste(); return {afterSplit:n1, total:t.clips.length}; });
  await step('piano quantize/transpose', async () => { const t=App.project.tracks[2]; App.editClipId=t.clips[0].id; Panels.show('piano'); Piano.selectAll(); Piano.transpose(12); Piano.quantize(); return Piano.c.notes.length; });
  await pg.screenshot({ path: path.join(SHOTS, 'f-piano.png') });
  // arp
  await step('arp', async () => { const t=App.project.tracks[3]; App.mutate(()=>{ t.arp.on=true; t.arp.mode='updown'; }); App.seek(16); App.play(); await new Promise(r=>setTimeout(r,1200)); App.stop(); return Engine.sources.size; });
  // browser adds
  await step('browser', async () => { Panels.show('browser'); App.playhead=64; Browser.addDrums(DRUM_LOOPS[1]); Browser.cat='chords'; Browser.addNotes(makeChordLoop(App.project, CHORD_LOOPS[0], 'Stabs'), 'Grand Piano', 'Chords'); Browser.addNotes(makeBassLoop(App.project, CHORD_LOOPS[0], 'Walking'), 'Electric Bass', 'Bass'); await Browser.previewDrums(DRUM_LOOPS[3]); await new Promise(r=>setTimeout(r,800)); Browser.stopPreview(); return App.project.tracks.length; });
  // instruments all load + play
  await step('all instruments', async () => { const names=Object.keys(INSTRUMENTS); await Promise.all(names.map(n=>Sampler.load(n, Engine.ctx))); return names.filter(n=>Sampler.ready(n)).length + '/' + names.length; });
  await step('all synth presets', async () => { const ctx=new OfflineAudioContext(2,44100,44100); let n=0; for (const k of Object.keys(SYNTH_PRESETS)) { playPatch(ctx, ctx.destination, SYNTH_PRESETS[k].p, 60, 0.01*n, 0.2, 0.8); n++; } const b=await ctx.startRendering(); return n; });
  // vocal styles & harmonizer
  await step('voice styles', async () => { App.atTrackId=App.project.tracks.find(t=>t.type==='audio').id; Vocal.sub='tune'; Panels.show('vocal'); const btns=[...document.querySelectorAll('.vs-card')]; btns[5].click(); return App.track(App.atTrackId).autotune.harm.on; });
  await pg.screenshot({ path: path.join(SHOTS, 'f-vocal.png') });
  // save / load
  await step('save+load', async () => { const bytes=await projectBytes(); const n=App.project.tracks.length; await loadProjectText(new TextDecoder().decode(bytes), 'x'); return {kb: Math.round(bytes.length/1024), tracks: App.project.tracks.length===n}; });
  // autosave
  await step('autosave', async () => { await Autosave.save(); const l=await Autosave.last(); return {ok:!!l, ids:l.ids.length}; });
  // mp3
  await step('mp3', async () => { const b=await Engine.render(App.project, {tail:0.5}); const t0=performance.now(); const m=await encodeMP3(b,192); return {kb:Math.round(m.length/1024), sec:((performance.now()-t0)/1000).toFixed(1), songSec:b.duration.toFixed(1)}; });
  await step('stem render', async () => { const t=App.project.tracks[0]; const b=await Engine.render(App.project,{only:t.id,noMaster:true}); return b.duration.toFixed(1); });
  await step('undo x5', async () => { for(let i=0;i<5;i++) App.undo(); return App.undoStack.length; });
  await pg.screenshot({ path: path.join(SHOTS, 'f-end.png') });
  console.log(errs.slice(0,20).join('\n') || 'no errors');
  await b.close(); srv.close();
})();
