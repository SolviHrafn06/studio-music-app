const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const srv = require('./serve')(8792);
(async () => {
  const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 1500, height: 920 } });
  const errs=[]; pg.on('pageerror', e => errs.push(e.message + ' ' + (e.stack||'').split('\n')[1]));
  await pg.goto('http://localhost:8792/'); await pg.click('#start-btn'); await pg.waitForTimeout(1500);
  const step = async (name, fn) => { try { console.log('✓', name, JSON.stringify(await pg.evaluate(fn))); } catch (e) { console.log('✗', name, e.message.split('\n')[0]); } };
  await step('chord stamp', async () => { const t=App.project.tracks[2]; App.editClipId=t.clips[0].id; Panels.show('piano'); await new Promise(r=>setTimeout(r,200)); Piano.chord='7th (in key)'; Piano.scaleLock=true; const n0=Piano.c.notes.length;
    const wrap=document.querySelector('#piano-wrap'); const g=document.querySelector('#piano-grid'); const r=g.getBoundingClientRect(); const wr=wrap.getBoundingClientRect();
    const y = wr.top + 40 - r.top; const ev=new MouseEvent('mousedown',{clientX:r.left+22*2+3, clientY:wr.top+40, bubbles:true, button:0}); Object.defineProperty(ev,'offsetX',{value:22*2+3}); Object.defineProperty(ev,'offsetY',{value:y}); Piano.down(ev); window.dispatchEvent(new MouseEvent('mouseup'));
    const added=Piano.c.notes.slice(n0).map(n=>noteName(n.p)); return added; });
  await step('tools', async () => { Piano.selectAll(); const before=JSON.stringify(Piano.c.notes.slice(0,3)); for (const lab of ['Strum','Humanize','Legato']) { const it=[...document.querySelectorAll('x')]; } 
    App.mutate(()=>{},false); const ns=Piano.targets(); const s0=ns.map(n=>n.s); Piano.dupSel(); return {dup: Piano.c.notes.length}; });
  await step('library', async () => {
    const mk = (f, sec) => { const sr=44100; const b=new AudioBuffer({numberOfChannels:1,length:sr*sec,sampleRate:sr}); const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=0.5*Math.sin(2*Math.PI*f*i/sr)*Math.exp(-i/sr*3); return new File([encodeWAV(b)], f+'hz.wav', {type:'audio/wav'}); };
    Library.folders.push({name:'Test Pack', session:true}); for (const f of [110,220,440]) Library.items.push({name:f+'hz.wav', folder:'Test Pack', rel:'Kicks', file: mk(f,1)});
    Browser.cat='mine'; Panels.show('browser'); await Library.preview(Library.items[0]); await Library.addToTimeline(Library.items[1], null, 8); await Library.toDrums(Library.items[2]); await Library.toSampler(Library.items[0], false);
    return {rows: document.querySelectorAll('.lib-row').length, tracks: App.project.tracks.map(t=>t.type+':'+t.name).slice(-3)}; });
  await pg.evaluate(()=>{ Browser.cat='mine'; Panels.show('browser'); }); await pg.waitForTimeout(200); await pg.screenshot({ path: path.join(SHOTS, 'lib.png') });
  await step('audio tools', async () => { const t=App.project.tracks.find(t=>t.type==='audio' && t.clips.length); const c=t.clips[0];
    const pitch=(buf)=>{ const d=buf.getChannelData(0), sr=buf.sampleRate, s=Math.floor(0.2*sr); let best=0,bt=0; for(let tau=20;tau<800;tau++){ let cc=0,e1=0,e2=0; for(let i=0;i<4096;i++){cc+=d[s+i]*d[s+i+tau]; e1+=d[s+i]**2; e2+=d[s+i+tau]**2;} cc/=Math.sqrt(e1*e2)+1e-9; if(cc>best+0.002){best=cc;bt=tau;} } return (sr/bt).toFixed(1); };
    const p0=pitch(Buffers.get(c.buf)); AudioTools.normalize(t,c); let pk=0; for(const v of Buffers.get(c.buf).getChannelData(0)) pk=Math.max(pk,Math.abs(v));
    await AudioTools.transpose(t,c,12); const p1=pitch(Buffers.get(c.buf)); AudioTools.reverse(t,c); return {p0, afterOctaveUp:p1, normPeak:pk.toFixed(3), name:c.name}; });
  await step('bounce', async () => { const t=App.project.tracks[2]; await AudioTools.bounce(t); const nt=App.project.tracks[3]; return {name:nt.name, len:nt.clips[0].length.toFixed(1), origMuted:t.mute}; });
  await step('make unique', async () => { const t=App.project.tracks[0]; const c=t.clips[0]; AudioTools.makeUnique(t,c); return {patterns:t.patterns.length, clipPat:c.pattern}; });
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
