#!/usr/bin/env node
// Runs every test in tests/ (Playwright + headless Chromium) one after another.
//  *.test.js  - plain scripts: fail on a non-zero exit, a line starting with ✗, or a last line that isn't "... no errors".
//  *.test.cjs - node:test files: run with `node --test`; the runner serves resources/ and passes
//               STUDIO_BASE_URL and CHROMIUM_PATH; pass/fail comes from the exit code.
// Usage: node tests/run.js [name-filter]      env: SHOTS=<folder for screenshots>
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname).filter((f) => /\.test\.c?js$/.test(f) && f.includes(filter)).sort();
const NODE_TEST_PORT = 8899;
let chromiumPath = process.env.CHROMIUM_PATH;
if (!chromiumPath) { try { chromiumPath = require('playwright').chromium.executablePath(); } catch (e) {} }
function runNodeTest(file) {
  // serve resources/ in a child process so this runner can block on spawnSync
  const server = require('child_process').spawn(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, 'serve.js'))})(${NODE_TEST_PORT})`], { stdio: 'ignore' });
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},400)']);
  // node:test files require('playwright-core'); make it resolvable wherever playwright itself is installed
  let modDirs = process.env.NODE_PATH ? [process.env.NODE_PATH] : [];
  try { modDirs.unshift(path.dirname(path.dirname(require.resolve('playwright')))); } catch (e) {}
  const env = Object.assign({}, process.env, { STUDIO_BASE_URL: `http://127.0.0.1:${NODE_TEST_PORT}/`, CHROMIUM_PATH: chromiumPath || '', NODE_PATH: modDirs.join(path.delimiter) });
  const r = spawnSync(process.execPath, ['--test', path.join(__dirname, file)], { encoding: 'utf8', timeout: 10 * 60 * 1000, env });
  server.kill();
  return r;
}
if (process.env.SHOTS) fs.mkdirSync(process.env.SHOTS, { recursive: true });
const results = [];
for (const f of files) {
  const t0 = Date.now();
  const nodeTest = f.endsWith('.cjs');
  const r = nodeTest ? runNodeTest(f) : spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 10 * 60 * 1000, env: process.env });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.trim().split('\n');
  const crosses = lines.filter((l) => l.trim().startsWith('✗'));
  const last = lines[lines.length - 1] || '';
  const reasons = [];
  if (r.status !== 0) reasons.push(r.error ? r.error.message : 'exit code ' + r.status);
  if (!nodeTest && crosses.length) reasons.push(crosses.length + ' failed check(s)');
  if (!nodeTest && !/no errors$/.test(last.trim())) reasons.push('page errors or no final "no errors" line');
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  results.push({ f, ok: !reasons.length });
  console.log(`${reasons.length ? '✗ FAIL' : '✓ pass'}  ${f.padEnd(26)} ${secs.padStart(6)}s${reasons.length ? '  — ' + reasons.join(', ') : ''}`);
  if (reasons.length) console.log(lines.map((l) => '      | ' + l).slice(-40).join('\n'));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} test files passed`);
process.exit(failed ? 1 : 0);
