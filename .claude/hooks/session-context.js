#!/usr/bin/env node
// SessionStart: give Claude a one-glance status of the project. stdout is added to context.
const fs = require('fs');
const path = require('path');

const projectDir = process.env.CLAUDE_PROJECT_DIR || path.resolve(__dirname, '..', '..');
const read = (f) => { try { return fs.readFileSync(path.join(projectDir, f), 'utf8'); } catch { return ''; } };

const lib = read('lib.js');
const schema = (lib.match(/SCHEMA_VERSION\s*=\s*(\d+)/) || [])[1] || '?';
const types = [...(lib.match(/const TYPES = {([\s\S]*?)\n  };/) || ['', ''])[1].matchAll(/^\s+(\w+):/gm)].map((m) => m[1]);
const testFiles = fs.existsSync(path.join(projectDir, 'tests')) ? fs.readdirSync(path.join(projectDir, 'tests')).filter((f) => f.endsWith('.test.js')) : [];
const sizes = ['index.html', 'styles.css', 'lib.js', 'app.js'].map((f) => `${f} ${(read(f).length / 1024).toFixed(1)}KB`).join(', ');

process.stdout.write(
  `GameDay project status — schema v${schema}; event types: ${types.join(', ') || '?'}; ` +
  `test files: ${testFiles.join(', ') || 'none'}; sizes: ${sizes}. ` +
  'Commands: `npm test`, `npm run check`, preview server "gameday" (port 5173).\n'
);
