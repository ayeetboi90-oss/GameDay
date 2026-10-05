---
name: add-stat
description: Add a new statistic or result metric to the GameDay Stats tab (e.g. home/away record, goal differential, shutouts, longest win streak, attendance). Use when the user asks for more stats, records, or season numbers.
---

# Add a stat

Stats are computed in `teamStats(events, teamId)` in `lib.js` (pure, testable) and displayed in `renderStats()` in `app.js`.

## Steps

1. **Compute it in `lib.js`** inside `teamStats`. It receives every event; filter to scored games with `hasScore(e)` and use `resultOf(e)` (`'W' | 'L' | 'T'`). Return the new value on the result object. Use `null` when there isn't enough data so the UI can show `–`.
2. **Test it first-class** in `tests/lib.test.js` — extend the `teamStats` test fixture or add a new test. Cover: no games, ties, a mix of teams (other teams must not leak in).
3. **Display it** in `app.js` → `renderStats()`:
   - Short numeric stats go in `.tiles` (currently 4 per row on desktop, 2 on mobile — if you add a 5th, change to 3 or 6 tiles so rows stay even, or replace a less useful one).
   - Format like the others: `.toFixed(1)` for averages, `.000` style for percentages, `–` for null.
4. **New data needed?** If the stat requires a field events don't have yet (e.g. attendance), that's a schema change: add the field in `buildEventFields`, the form in `renderEdit()`, and follow the `storage-migrator` agent's process.
5. Run `npm test`, then use `verify-site` to eyeball the Stats tab for each team and the "All teams" view.
