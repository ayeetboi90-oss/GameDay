#!/usr/bin/env node
// PreToolUse (Edit|Write|MultiEdit): blocks changes that would hurt users or break the static-site contract.
//  1. Changing STORE_KEY in lib.js silently wipes every visitor's saved calendar.
//  2. External <script src> must come from an allowed CDN.
// Exit 2 = block the tool call; stderr is shown to Claude.
const path = require('path');

let raw = '';
process.stdin.on('data', (c) => (raw += c));
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }
  const ti = input.tool_input || {};
  const file = String(ti.file_path || '');
  const base = path.basename(file);
  const added = [ti.content, ti.new_string, ...(ti.edits || []).map((e) => e.new_string)].filter(Boolean).join('\n');
  const removed = [ti.old_string, ...(ti.edits || []).map((e) => e.old_string)].filter(Boolean).join('\n');
  const problems = [];

  if (base === 'lib.js') {
    const before = removed.match(/STORE_KEY\s*=\s*'([^']+)'/);
    const after = added.match(/STORE_KEY\s*=\s*'([^']+)'/);
    if ((before && after && before[1] !== after[1]) || (ti.content && after && after[1] !== 'gameday.v1')) {
      problems.push(
        "Don't change STORE_KEY — it would orphan every user's saved data. " +
        'Bump SCHEMA_VERSION and add an upgrade step in migrate() instead (see the storage-migrator agent).'
      );
    }
  }

  if (/\.html?$/i.test(base)) {
    const allowed = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'unpkg.com'];
    for (const m of added.matchAll(/<script[^>]+src="(https?:\/\/[^"]+)"/gi)) {
      let host = '';
      try { host = new URL(m[1]).host; } catch {}
      if (!allowed.includes(host)) problems.push(`External script host "${host}" is not allowed. Use one of: ${allowed.join(', ')} or vendor the file locally.`);
    }
  }

  if (problems.length) {
    process.stderr.write('Blocked by guard-edits hook:\n- ' + problems.join('\n- ') + '\n');
    process.exit(2);
  }
  process.exit(0);
});
