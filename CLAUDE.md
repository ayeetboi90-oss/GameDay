# GameDay — team sports calendar

Static website (no build step, no framework, no npm dependencies) for sports teams to schedule **practices, meetings, and games** across **multiple teams**, with a bold & sporty look. Data is saved in the visitor's browser (localStorage).

## Three parts of the app
1. **Schedule** — month calendar, Next Game countdown, this-week counts, day panel.
2. **Add & Edit** — event form (type switch, repeat weekly, scores for games), searchable event list, team manager.
3. **Stats** — per-team scoreboard (W-L-T, win %, averages, streak, last 5), results table, "Needs a score" quick entry.

## Files
| File | Role |
|---|---|
| `index.html` | Shell: header, tabs, team chips, `<main id="app">`. Loads `lib.js` **then** `app.js`. |
| `lib.js` | **Pure logic, no DOM.** Constants (`TYPES`, colors), date/time helpers, `buildEventFields` (form validation), `expandWeekly`, `teamStats`, `migrate`, `seed`. UMD: `window.GameDayLib` in browser, `require()` in Node. |
| `app.js` | UI: state (`ui`), rendering per tab via template strings, one delegated click handler keyed on `data-action`. |
| `styles.css` | Design tokens on `:root` + dark mode overrides, components, responsive rules (1000px, 640px). |
| `tests/` | Harness — `node:test`, zero deps. |

## Commands
- `npm test` — run the harness.
- `npm run check` — syntax check + tests.
- Preview server: **gameday** in `.claude/launch.json` (`python -m http.server 5173`). Don't preview via `file://`.

## Conventions
- Put any logic that can be pure in `lib.js` and test it; keep `app.js` for DOM/rendering.
- Escape every user string in templates with `esc()`; pass team colors through `safeColor()`.
- New interactive elements use `data-action="kebab-name"` and a branch in the click handler (the harness checks every action has a handler).
- Colors only via CSS custom properties; dark theme tokens must be added in **both** dark selectors.
- Dates are local `'YYYY-MM-DD'` strings; times `'HH:MM'`. Never use `toISOString()` for date keys (UTC shift bugs).
- Wrap every `localStorage` access in try/catch; the app must work when storage is unavailable.
- Never change `STORE_KEY`. Schema changes → bump `SCHEMA_VERSION` + add a `migrate()` step.

## Claude Code setup (`.claude/`)
**Hooks** (`settings.json`, scripts in `hooks/`):
- `SessionStart` → `session-context.js`: prints schema version, event types, file sizes.
- `PreToolUse` (Edit/Write) → `guard-edits.js`: blocks changing `STORE_KEY` and non-allowlisted external `<script>` hosts.
- `PostToolUse` (Edit/Write) → `post-edit-check.js`: `node --check` on JS, runs tests when site/test files change.
- `Stop` → `stop-gate.js`: won't end a turn with failing syntax/tests (once per turn).

**Skills** (`skills/`): `add-event-type`, `add-stat`, `verify-site`, `publish-site` (user-invoked only).

**Agents** (`agents/`): `ui-reviewer` (read-only design/a11y/XSS review), `test-writer` (node:test tests), `storage-migrator` (safe data-model changes).

**Typical flow for a feature:** implement (logic in `lib.js`) → `test-writer` for coverage → `ui-reviewer` → `verify-site`.
