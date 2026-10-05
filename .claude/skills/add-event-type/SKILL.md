---
name: add-event-type
description: Add a new kind of calendar event (e.g. tournament, travel, fundraiser, scrimmage) to GameDay. Use when the user wants a new event category beyond game/practice/meeting.
---

# Add an event type

Event types are defined once in `lib.js` and styled in `styles.css`. The rest of the app (form switch, badges, calendar pills, filters) reads from `TYPES`, so most of the work is data + CSS.

## Steps

1. **Define it** in `lib.js`:
   - Add an entry to `TYPES`: `key: { label: 'Tournament', short: 'TRNY' }`. Keep `short` ≤ 4 uppercase letters (it fits the badge).
   - Add a default title to `DEFAULT_TITLES`.
2. **Style it** in `styles.css`. Every type needs both selectors (the harness enforces this):
   - `.badge.<key>` — the small label in lists/day panel.
   - `.pill.<key>` — the calendar chip. Pick a treatment distinct from the existing three:
     game = solid team color, practice = tinted + left bar, meeting = dashed outline.
     Good options: diagonal stripes (`repeating-linear-gradient`), double border, or a bold outline.
   - Check the mobile rule under `@media (max-width: 640px)` still renders it as a dot.
3. **Legend** in `app.js` → `renderSchedule()`: add a `<span class="badge <key>">` to `.legend`.
4. **Game-only behaviour**: if the new type has scores/opponents (like a scrimmage), decide whether `buildEventFields` should treat it like `game`, and whether `teamStats` should count it. Ask the user if unclear.
5. **This-week tiles**: `renderSchedule()` counts `wk[e.type]`. Add a tile if the type matters week to week, or leave it out.
6. **Tests**: add a case in `tests/lib.test.js` (e.g. `buildEventFields` default title for the new type). Run `npm test`.
7. **Verify** with the `verify-site` skill: create one of the new events in the Add & Edit tab and confirm it shows on the calendar and day panel.

## Don't
- Don't rename or remove existing type keys — saved user data references them, and `migrate()` drops events whose type is unknown. If a rename is truly needed, use the `storage-migrator` agent.
