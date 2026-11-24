const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const fs = require('fs');
const srv = require('./serve')(8812);
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = [];
  pg.on('pageerror', (e) => errs.push(e.message + ' ' + (e.stack || '').split('\n')[1]));
  await pg.route('**/js/neutralino.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
    window.NL_PORT = 1; window.NL_OS = 'Windows'; window.NL_PATH = 'C:/Users/solvi/Music App/Studio'; window.NL_ARGS = ['Studio.exe'];
    window.__cmds = [];
    window.Neutralino = { init() {}, events: { on() {} }, app: { exit() {} }, window: { setTitle() {} },
      os: { showMessageBox: async () => 'NO', execCommand: async (c) => { window.__cmds.push(c); return { exitCode: c.startsWith('reg query') ? 1 : 0, stdOut: '' }; } },
      storage: { getData: async () => { throw new Error('x'); }, setData: async () => {} },
      filesystem: { getStats: async () => ({ size: 1 }), readFile: async () => '', writeFile: async () => {} } };` }));
  await pg.goto('http://localhost:8812/');
  await pg.waitForTimeout(1000);
  await pg.click('#empty-btn');
  await pg.waitForTimeout(1500);
  const song = fs.readFileSync(EXAMPLE, 'utf8');
  const r = await pg.evaluate(async (song) => {
    const out = { cmds: window.__cmds };
    await loadProjectText(song, 'x');
    out.loaded = App.project.tracks.length;
    // damaged file must not wipe the open song
    try { await loadProjectText('{"project": {"tracks": [', 'bad'); } catch (e) { out.badErr = e.message; }
    out.afterBad = App.project.tracks.length + ' ' + App.project.name;
    // partial / old-style project
    const partial = { project: { name: 'Old', bpm: '128', tracks: [{ type: 'drums', name: 'D' }, { type: 'audio', clips: [{ start: 0, length: 4, buf: 'nope' }] }, { type: 'weird' }, { type: 'synth', instrument: 'Super Saw', clips: [{ start: 0, length: 4, notes: [{ p: 60, s: 0, d: 4, v: 0.8 }] }] }] } };
    await loadProjectText(JSON.stringify(partial), 'old');
    out.partial = App.project.tracks.map((t) => t.type + ':' + t.name).join(',') + ' bpm ' + App.project.bpm;
    // newer-version warning
    await loadProjectText(JSON.stringify({ appVersion: '9.0.0', project: { name: 'Future', tracks: [] } }), 'f');
    out.toasts = document.querySelector('#toast').textContent;
    // round trip keeps appVersion
    out.saved = JSON.parse(new TextDecoder().decode(await projectBytes())).appVersion;
    out.scroll = TL.scroll.scrollLeft;
    return out;
  }, song);
  console.log(JSON.stringify(r, null, 1));
  const ok = (n, c) => console.log((c ? '✓ ' : '✗ ') + n);
  ok('Studio registers itself for .studio files', r.cmds.some((c) => c.includes('Studio.Project\\shell\\open\\command') && c.startsWith('reg add')));
  ok('example song loads (20 tracks)', r.loaded === 20);
  ok('damaged file keeps the open song', /damaged/.test(r.badErr) && r.afterBad === '20 Neon Riot');
  ok('partial/old project repaired', r.partial === 'drums:D,audio:Vocals,synth:Instrument bpm 128');
  ok('newer-version warning', /newer Studio \(9\.0\.0\)/.test(r.toasts));
  ok('saves appVersion', /^\d+\.\d+\.\d+$/.test(r.saved || ''));
  ok('view reset to bar 1', r.scroll === 0);
  console.log(errs.join('\n') || 'no errors');
  await b.close(); srv.close();
})();
