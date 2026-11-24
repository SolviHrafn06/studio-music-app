const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const srv = require('./serve')(8796);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs=[]; pg.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
  await pg.goto('http://localhost:8796/'); await pg.click('#start-btn'); await pg.waitForTimeout(1500);
  const step = async (name, fn) => { try { console.log('✓', name, JSON.stringify(await pg.evaluate(fn))); } catch (e) { console.log('✗', name, e.message.split('\n')[0]); } };
  await step('PAT mode', async () => { Panels.show('rack'); toggleMode(); App.play(); await new Promise(r=>setTimeout(r,1500)); const ov=!!Engine.override, tracks=Engine.override.P.tracks.length, beat=Engine.beat(); App.stop(); toggleMode(); return {ov, tracks, beatInLoop: beat < 4}; });
  await step('F keys', async () => { const fire=(k)=>window.dispatchEvent(new KeyboardEvent('keydown',{key:k})); fire('F9'); const a=App.tab; fire('F7'); const b2=App.tab; fire('F6'); const c=App.tab; fire('F5'); const h1=getComputedStyle(document.body).getPropertyValue('--bottom-h'); fire('F5'); return {a,b2,c,h1}; });
  await step('3/4 time', async () => { const s=document.querySelector('#timesig'); s.value='3'; s.onchange({target:s}); TL.draw(); return {bpb:App.bpb(), snapBar: document.querySelector('#snap').options[0].value}; });
  await step('marker', async () => { App.mutate(()=>App.project.markers.push({b:12, name:'Chorus'}), false); TL.draw(); return App.project.markers.length; });
  await pg.screenshot({ path: path.join(SHOTS, 't10.png') });
  await step('save/load keeps bpb+markers', async () => { const bytes=await projectBytes(); await loadProjectText(new TextDecoder().decode(bytes),'x'); return {bpb:App.project.bpb, markers:App.project.markers.length, ts: document.querySelector('#timesig').value}; });
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
