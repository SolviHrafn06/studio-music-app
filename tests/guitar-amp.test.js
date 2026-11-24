const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const srv = require('./serve')(8786);
(async () => {
  const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack||'').split('\n')[1]));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('http://localhost:8786/'); await pg.click('#start-btn'); await pg.waitForTimeout(2000);
  const step = async (name, fn) => { try { console.log('✓', name, JSON.stringify(await pg.evaluate(fn))); } catch (e) { console.log('✗', name, e.message.split('\n')[0]); } };
  await step('add guitar', async () => { const t = addGuitarTrack(); await new Promise(r=>setTimeout(r,500)); return {name:t.name, fx:t.fx.map(f=>f.type), tab:App.tab}; });
  await step('activate input', async () => { const t=App.track(App.selTrackId); await InputPanel.activate(t); await new Promise(r=>setTimeout(r,800)); return {inputs:Engine.inputs.size, devices:Devices.ins.length, granted:Devices.granted, chans:[...Engine.inputs.values()][0].chans}; });
  await step('monitor on', async () => { const t=App.track(App.selTrackId); await InputPanel.toggleMonitor(t); await new Promise(r=>setTimeout(r,1500)); return {mon:Engine.monitors.has(t.id), meterTxt: InputPanel.meterTxt.textContent, tuner: InputPanel.tunerNote.textContent + ' ' + InputPanel.tunerHz.textContent}; });
  await pg.screenshot({ path: path.join(SHOTS, 'g-input.png') });
  await step('channel 1', async () => { const t=App.track(App.selTrackId); await InputPanel.changeInput(t, {ch:'1'}); await new Promise(r=>setTimeout(r,500)); return t.input; });
  await step('record guitar', async () => { App.seek(0); await App.toggleRecord(); await new Promise(r=>setTimeout(r,2000)); await App.stop(); const t=App.track(App.selTrackId); return t.clips.map(c=>c.length.toFixed(2)); });
  await step('monitor off', async () => { const t=App.track(App.selTrackId); await InputPanel.toggleMonitor(t); return Engine.monitors.size; });
  await step('amp presets render', async () => {
    const sr=44100, out={};
    for (const [name, mk] of Object.entries(CHAIN_PRESETS.guitar)) {
      const ctx=new OfflineAudioContext(2, sr*2, sr); await ctx.audioWorklet.addModule('js/worklets.js');
      // Karplus-Strong plucked E2 + A2 power chord
      const buf=ctx.createBuffer(1, sr*2, sr), d=buf.getChannelData(0);
      for (const f of [82.4, 123.5, 164.8]) { const N=Math.round(sr/f); const ring=new Float32Array(N).map(()=>Math.random()*2-1); let i=0; for (let n=0;n<d.length;n++){ const v=ring[i]; const nx=ring[(i+1)%N]; ring[i]=0.996*0.5*(v+nx); d[n]+=v*0.25; i=(i+1)%N; } }
      const src=ctx.createBufferSource(); src.buffer=buf; let head=src; const env={bpm:120};
      for (const f of mk()) { const inst=FX[f.type].create(ctx,f.p,env); inst.set(f.p,false); head.connect(inst.input); head=inst.output; }
      head.connect(ctx.destination); src.start();
      const r=await ctx.startRendering(); const o=r.getChannelData(0); let s=0,pk=0,bad=false; for (let i=0;i<o.length;i++){ if(!isFinite(o[i])) bad=true; s+=o[i]*o[i]; pk=Math.max(pk,Math.abs(o[i])); }
      out[name]=(bad?'NaN ':'')+(10*Math.log10(s/o.length)).toFixed(1)+'dB rms, pk '+pk.toFixed(2);
    }
    return out;
  });
  await step('tuner accuracy', async () => { const ctx=Engine.ctx; const res={}; for (const f of [82.41, 110, 146.83, 196, 246.94, 329.63, 41.2]) { const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f; const an=ctx.createAnalyser(); an.fftSize=4096; o.connect(an); o.start(); await new Promise(r=>setTimeout(r,200)); res[f]=Tuner.read(an, ctx.sampleRate).toFixed(2); o.stop(); } return res; });
  await step('settings modal', async () => { await AudioSettings.open(); await new Promise(r=>setTimeout(r,300)); return document.querySelectorAll('.modal select').length; });
  await pg.screenshot({ path: path.join(SHOTS, 'g-settings.png') });
  await step('close modal + save/load keeps input', async () => { document.querySelector('.modal-ov').remove(); const bytes=await projectBytes(); await loadProjectText(new TextDecoder().decode(bytes),'x'); const t=App.project.tracks.find(t=>/Guitar/.test(t.name)); return {input:t.input, fx:t.fx.length}; });
  await step('export with amp', async () => { const b=await Engine.render(App.project); return b.duration.toFixed(1); });
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
