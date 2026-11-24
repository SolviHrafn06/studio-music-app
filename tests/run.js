#!/usr/bin/env node
// Runs every tests/*.test.js (Playwright + headless Chromium) one after another.
// A test fails if it exits non-zero, prints a line starting with ✗, or its last line isn't "... no errors".
// Usage: node tests/run.js [name-filter]      env: SHOTS=<folder for screenshots>
const { spawnSync } = require('child_process');
const fs = require('fs'), path = require('path');
const filter = process.argv[2] || '';
const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.js') && f.includes(filter)).sort();
if (process.env.SHOTS) fs.mkdirSync(process.env.SHOTS, { recursive: true });
const results = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', timeout: 10 * 60 * 1000, env: process.env });
  const out = (r.stdout || '') + (r.stderr || '');
  const lines = out.trim().split('\n');
  const crosses = lines.filter((l) => l.trim().startsWith('✗'));
  const last = lines[lines.length - 1] || '';
  const reasons = [];
  if (r.status !== 0) reasons.push(r.error ? r.error.message : 'exit code ' + r.status);
  if (crosses.length) reasons.push(crosses.length + ' failed check(s)');
  if (!/no errors$/.test(last.trim())) reasons.push('page errors or no final "no errors" line');
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  results.push({ f, ok: !reasons.length });
  console.log(`${reasons.length ? '✗ FAIL' : '✓ pass'}  ${f.padEnd(26)} ${secs.padStart(6)}s${reasons.length ? '  — ' + reasons.join(', ') : ''}`);
  if (reasons.length) console.log(lines.map((l) => '      | ' + l).slice(-40).join('\n'));
}
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} test files passed`);
process.exit(failed ? 1 : 0);
