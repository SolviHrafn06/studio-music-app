const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const fs = require('fs');
const srv = require('./serve')(8813);
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1600, height: 950 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await pg.goto('http://localhost:8813/');
  await pg.waitForTimeout(800);
  await pg.click('#gen-splash-btn');
  await pg.waitForTimeout(1500);
  await pg.screenshot({ path: path.join(SHOTS, 'gen-dialog.png') });
  // structure for all genres x 3 seeds
  const res = await pg.evaluate(async () => {
    const out = {};
    for (const genre of Object.keys(GEN.GENRES)) for (const seed of [11, 222, 3333]) for (const length of ['Short (~1 min)', 'Normal (~2 min)', 'Long (~3 min)']) {
      const P = generateSong({ genre, mood: 'Auto', key: 'Auto', bpm: 0, length, vocals: true, seed });
      const bars = P.markers.length ? Math.max(...P.tracks.flatMap((t) => t.clips.map((c) => (c.start + c.length) / 4))) : 0;
      let bad = 0, notes = 0;
      for (const t of P.tracks) for (const c of t.clips) { if (c.notes) for (const n of c.notes) { notes++; if (![n.p, n.s, n.d, n.v].every(Number.isFinite) || n.d <= 0 || n.s < 0 || n.s >= c.length * 4 + 0.01 || n.p < 12 || n.p > 108) bad++; } if (c.pattern !== undefined && !t.patterns[c.pattern]) bad++; }
      const k = genre + ' ' + length.split(' ')[0];
      (out[k] = out[k] || []).push({ seed, name: P.name, bpm: P.bpm, key: P.key, scale: P.scale, mood: P.generated.mood, tracks: P.tracks.length, bars, secs: Math.round(bars * 4 * 60 / P.bpm), notes, bad });
    }
    return out;
  });
  const summary = {};
  let badTotal = 0;
  for (const [k, v] of Object.entries(res)) { badTotal += v.reduce((a, x) => a + x.bad, 0); summary[k] = v.map((x) => `${x.name} ${x.bpm}bpm ${x.secs}s ${x.tracks}tr ${x.notes}n`).join(' | '); }
  console.log(JSON.stringify(summary, null, 1)); console.log('bad notes/patterns:', badTotal); console.log((badTotal ? '✗' : '✓') + ' generated notes and patterns are all valid');
  // generate through the real UI flow, then render 8 bars of the biggest section per genre
  const lv = {};
  const GENRES = await pg.evaluate(() => Object.keys(GEN.GENRES));
  for (const genre of GENRES) {
    const r = await pg.evaluate(async (genre) => {
      await Generator.run({ genre, mood: 'Auto', key: 'Auto', bpm: 0, length: 'Normal (~2 min)', vocals: true, seed: 0 });
      const P = clone(App.project);
      const sec = P.markers.find((m) => /Drop|Hook|Chorus|^B$/.test(m.name)) || P.markers[1];
      P.tracks.forEach((t) => (t.clips = t.clips.filter((c) => c.start >= sec.b && c.start < sec.b + 32).map((c) => ({ ...c, start: c.start - sec.b }))));
      P.tracks.forEach((t) => (t.auto = []));
      const t0 = performance.now();
      const buf = await Engine.render(P, { tail: 0.5 });
      const d = buf.getChannelData(0); let e = 0, pk = 0; for (let i = 0; i < d.length; i++) { e += d[i] * d[i]; pk = Math.max(pk, Math.abs(d[i])); }
      return { name: App.project.name, section: sec.name, rms: (10 * Math.log10(e / d.length)).toFixed(1), peak: pk.toFixed(2), sec: ((performance.now() - t0) / 1000).toFixed(1), headers: document.querySelectorAll('.track-head').length, tracks: App.project.tracks.length };
    }, genre);
    lv[genre] = r;
  }
  console.table(lv);
  for (const [g, r] of Object.entries(lv)) console.log((+r.rms > -30 && +r.peak <= 1 ? '✓' : '✗') + ` ${g} renders audio (${r.rms} dB, peak ${r.peak})`);
  await pg.screenshot({ path: path.join(SHOTS, 'gen-result.png') });
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
