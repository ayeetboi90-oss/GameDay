#!/usr/bin/env node
// Stop: don't let a turn end with a broken site. Runs the full check once;
// if it fails, Claude is asked to keep going and fix it. stop_hook_active
// prevents an infinite loop when the failure can't be fixed automatically.
const { spawnSync } = require('child_process');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input = {};
  try { input = JSON.parse(raw); } catch {}
  if (input.stop_hook_active) process.exit(0);

  const node = process.execPath;
  for (const f of ['lib.js', 'app.js']) {
    const r = spawnSync(node, ['--check', path.join(projectDir, f)], { encoding: 'utf8' });
    if (r.status !== 0) {
      process.stderr.write(`Before finishing: ${f} has a syntax error.\n${r.stderr.trim()}\n`);
      process.exit(2);
    }
  }
  const t = spawnSync(node, ['--test', '--test-reporter=dot', 'tests/**/*.test.js'], { cwd: projectDir, encoding: 'utf8', timeout: 120000 });
  if (t.status !== 0) {
    const tail = (t.stdout + t.stderr).trim().split('\n').slice(-30).join('\n');
    process.stderr.write(`Before finishing: the test harness is failing. Fix it or explain why.\n${tail}\n`);
    process.exit(2);
  }
  process.exit(0);
});
