#!/usr/bin/env node
// PostToolUse (Edit|Write|MultiEdit): fast feedback after a file changes.
//  - .js files get a syntax check (node --check).
//  - Changes to site or test files run the unit/integrity harness.
// Exit 2 = report the failure back to Claude so it fixes it right away.
const { spawnSync } = require('child_process');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const SITE_FILES = ['lib.js', 'app.js', 'index.html', 'styles.css'];

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const file = String((input.tool_input || {}).file_path || '');
  if (!file) process.exit(0);
  const rel = path.relative(projectDir, path.resolve(file)).replace(/\\/g, '/');
  if (rel.startsWith('..')) process.exit(0); // outside the project

  if (/\.js$/.test(rel)) {
    const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (r.status !== 0) {
      process.stderr.write(`Syntax error in ${rel}:\n${r.stderr.trim()}\n`);
      process.exit(2);
    }
  }

  if (SITE_FILES.includes(rel) || rel.startsWith('tests/')) {
    const r = spawnSync(process.execPath, ['--test', '--test-reporter=dot', 'tests/**/*.test.js'], { cwd: projectDir, encoding: 'utf8', timeout: 60000 });
    if (r.status !== 0) {
      const out = (r.stdout + r.stderr).split('\n').filter((l) => /✖|not ok|Error|expected|actual|at .*test\.js/.test(l)).slice(0, 25).join('\n');
      process.stderr.write(`Tests failing after editing ${rel}:\n${out}\nRun \`npm test\` for full output.\n`);
      process.exit(2);
    }
  }
  process.exit(0);
});
