const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const srv = require('./serve')(8783);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1366, height: 820 } });
  const errs = []; pg.on('pageerror', e => errs.push('PAGEERR ' + e.message + ' ' + (e.stack||'').split('\n')[1]));
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto('http://localhost:8783/'); await pg.click('#start-btn'); await pg.waitForTimeout(2000);
  const tl = await pg.locator('#timeline').boundingBox();
  const ev = (f) => pg.evaluate(f);
  // click empty area on Pluck lane (row 5, y=4*72+36) at bar 2 → new clip
  const n0 = await ev(() => App.project.tracks[4].clips.length);
  await pg.mouse.click(tl.x + 36*5, tl.y + 4*72 + 36);
  console.log('create clip', n0, '->', await ev(() => App.project.tracks[4].clips.length));
  // drag that clip right by 4 beats
  await pg.mouse.move(tl.x + 36*5 + 30, tl.y + 4*72 + 40); await pg.mouse.down(); await pg.mouse.move(tl.x + 36*9 + 30, tl.y + 4*72 + 40, {steps:5}); await pg.mouse.up();
  console.log('moved clip start', await ev(() => App.findClip(App.selClipId).c.start));
  // marquee select over first 3 tracks
  await pg.mouse.move(tl.x + 36*40, tl.y + 10); await pg.mouse.down(); await pg.mouse.move(tl.x + 36*2, tl.y + 72*3 - 10, {steps:6}); await pg.mouse.up();
  console.log('marquee selected', await ev(() => App.selClips.size));
  // right-click menu
  await pg.mouse.click(tl.x + 36*3, tl.y + 72 + 36, {button:'right'});
  console.log('menu items', await ev(() => document.querySelectorAll('.ctx-menu .item').length));
  await pg.screenshot({ path: path.join(SHOTS, 'u-menu.png') });
  await pg.keyboard.press('Escape');
  // piano roll draw a note
  await ev(() => { App.editClipId = App.project.tracks[2].clips[0].id; Panels.show('piano'); });
  await pg.waitForTimeout(300);
  const pr = await pg.locator('#piano-grid').boundingBox();
  const nn0 = await ev(() => Piano.c.notes.length);
  await pg.mouse.click(pr.x + 22*3 + 5, pr.y + 300);
  console.log('note added', nn0, '->', await ev(() => Piano.c.notes.length));
  await pg.screenshot({ path: path.join(SHOTS, 'u-piano.png') });
  // knob drag in instrument tab on a synth
  await ev(() => { App.selectTrack(App.project.tracks[3].id); Panels.show('inst'); });
  await pg.waitForTimeout(300);
  const k = await pg.locator('#panel-inst .knob').nth(9).boundingBox();
  const before = await ev(() => JSON.stringify(App.project.tracks[3].inst.patch.filter));
  await pg.mouse.move(k.x + k.width/2, k.y + 15); await pg.mouse.down(); await pg.mouse.move(k.x + k.width/2, k.y - 40, {steps:5}); await pg.mouse.up();
  console.log('knob changed', before !== await ev(() => JSON.stringify(App.project.tracks[3].inst.patch.filter)));
  await pg.screenshot({ path: path.join(SHOTS, 'u-inst.png') });
  // automation lane: open on Drums, click to add points
  await ev(() => App.mutate(() => { App.project.tracks[0].autoShow = true; App.project.tracks[0].autoSel = 'vol'; }));
  await pg.mouse.click(tl.x + 36*2, tl.y + 72 + 15); await pg.mouse.click(tl.x + 36*10, tl.y + 72 + 45);
  console.log('auto points', await ev(() => (App.project.tracks[0].auto.find(l=>l.target==='vol')||{pts:[]}).pts.length));
  // play with automation + stop
  await ev(() => { App.seek(0); App.play(); }); await pg.waitForTimeout(1500); await ev(() => App.stop());
  // open v1 project (migration)
  const v1 = { name:'Old', bpm:100, key:0, scale:'Major', loop:{on:false,start:0,end:16}, tracks:[
    {id:'a', type:'synth', name:'Bass', color:'#ff7a2f', volume:0.8, pan:0, mute:false, solo:false, eq:{low:0,mid:0,high:0}, rev:0, dly:0, instrument:'Bass', clips:[{id:'c1', start:0, length:4, notes:[{p:36,s:0,d:4,v:0.8}]}]},
    {id:'b', type:'audio', name:'Vox', color:'#4ade80', volume:0.8, pan:0, mute:false, solo:false, eq:{low:0,mid:0,high:0}, rev:0, dly:0, armed:true, autotune:{on:true, follow:true, key:0, scale:'Major', speed:0, amount:1}, clips:[]},
    {id:'d', type:'drums', name:'Drums', color:'#38bdf8', volume:0.8, pan:0, mute:false, solo:false, eq:{low:0,mid:0,high:0}, rev:0, dly:0, curPattern:0, patterns:[{name:'P1', len:16, steps:{x:[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]}}], channels:[{id:'x', kind:'kick', name:'Kick', vol:0.8, mute:false, sample:null}], clips:[{id:'c2', start:0, length:4, pattern:0}]} ]};
  console.log('v1 load', await pg.evaluate(async (v1) => { await loadProjectText(JSON.stringify({app:'Studio', version:1, project:v1, buffers:{}}), 'old'); const b = await Engine.render(App.project); return App.project.tracks.map(t=>t.type+':'+(t.inst?t.inst.name:'')).join(',') + ' dur ' + b.duration.toFixed(1); }, v1));
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
