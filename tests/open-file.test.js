// Simulates double-clicking a .studio file: Neutralino passes the path in NL_ARGS.
const path = require('path');
const SHOTS = process.env.SHOTS || require('os').tmpdir();
const EXAMPLE = path.join(__dirname, '..', 'examples', 'Neon Riot.studio');
const { chromium } = require('playwright');
const fs = require('fs');
const srv = require('./serve')(8810);
(async () => {
  const b = await chromium.launch();
  const results = {};
  for (const scenario of ['file', 'nofile', 'badfile']) {
    const pg = await b.newPage();
    const errs = [];
    pg.on('pageerror', (e) => errs.push(e.message));
    await pg.route('**/js/neutralino.js', (r) => r.fulfill({ contentType: 'text/javascript', body: `
      window.NL_PORT = 1;
      window.NL_ARGS = ${JSON.stringify(scenario === 'nofile' ? ['C:\\\\Studio\\\\Studio.exe', '--path=C:\\\\Studio'] : ['C:\\\\Studio\\\\Studio.exe', '--path=C:\\\\Studio', scenario === 'file' ? 'C:\\\\Users\\\\solvi\\\\Music\\\\Neon Riot.studio' : 'C:\\\\x\\\\missing.studio'])};
      window.__title = '';
      window.Neutralino = { init() {}, events: { on() {} }, os: { showMessageBox: async () => 'NO' }, app: { exit() {} },
        window: { setTitle(t) { window.__title = t; } },
        filesystem: { readFile: async (p) => { if (/missing/.test(p)) throw new Error('NE_FS_FILRDER'); window.__read = p; return (await fetch('/__song.studio')).text(); } } };` }));
    await pg.route('**/__song.studio', (r) => r.fulfill({ body: fs.readFileSync(EXAMPLE) }));
    await pg.goto('http://localhost:8810/');
    await pg.waitForTimeout(scenario === 'nofile' ? 1500 : 6000);
    results[scenario] = await pg.evaluate(() => ({
      splashVisible: !document.querySelector('#splash').classList.contains('hidden'),
      project: App.project ? App.project.name : null, tracks: App.project ? App.project.tracks.length : 0,
      bpm: App.project && App.project.bpm, read: window.__read || null, title: window.__title, dirty: App.dirty,
      toast: [...document.querySelectorAll('.toast')].map((t) => t.textContent).join(' | '),
    }));
    if (scenario === 'badfile') {
      await pg.click('#empty-btn'); await pg.waitForTimeout(1500);
      results.badfile.afterClick = await pg.evaluate(() => ({ splash: !document.querySelector('#splash').classList.contains('hidden'), project: App.project && App.project.name }));
    }
    if (scenario === 'file') {
      // first key press resumes audio and Space starts playback
      await pg.keyboard.press('Space');
      await pg.waitForTimeout(1200);
      results.file.playing = await pg.evaluate(() => Engine.playing && Engine.ctx.state);
      await pg.keyboard.press('Space');
    }
    results[scenario].errors = errs;
    await pg.close();
  }
  console.log(JSON.stringify(results, null, 1));
  const ok = (n, c) => console.log((c ? '✓ ' : '✗ ') + n);
  ok('double-clicked file opens straight into the song', results.file && !results.file.splashVisible && results.file.tracks > 0);
  ok('Space plays after opening from a file', results.file && !!results.file.playing);
  ok('no file -> start screen', results.nofile && results.nofile.splashVisible);
  ok('unreadable file -> start screen', results.badfile && results.badfile.splashVisible);
  console.log(Object.values(results).some((r) => r.errors && r.errors.length) ? 'errors: ' + JSON.stringify(Object.values(results).map((r) => r.errors)) : 'no errors');
  await b.close(); srv.close();
})();
