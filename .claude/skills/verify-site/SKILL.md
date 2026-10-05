---
name: verify-site
description: Run and visually verify the GameDay site after a change — tests, local server, browser checks on desktop and mobile widths, and console errors. Use after any UI or logic change, or when asked to run, test, or check the site.
---

# Verify the site

## 1. Harness
Run `npm run check` (syntax + all tests). Fix failures before going further.

## 2. Serve
Start the preview server named **gameday** from `.claude/launch.json` (port 5173) with the preview tool. Do not open `index.html` as a `file://` URL — the preview pane renders local files as static snapshots without running scripts.

## 3. Fresh state
Reset to demo data so results are predictable:
```js
localStorage.removeItem('gameday.v1'); location.reload();
```

## 4. Walk the three tabs
For each, prefer `get_page_text` / `read_page` over screenshots; take one screenshot per tab to check visuals.
- **Schedule** — month grid renders, Next Game countdown shows, clicking a day updates the side panel, ‹ › and Today work, team chips filter.
- **Add & Edit** — switching to *Game* reveals opponent/venue/score fields; adding an event shows a toast and the event appears in the list and calendar; editing and deleting work; adding a team adds a chip.
- **Stats** — one scoreboard per team (or one when filtered); "Needs a score" accepts a score and the record updates.

## 5. Responsive + console
- Resize to the `mobile` preset; check there is no horizontal scroll:
  `document.documentElement.scrollWidth <= innerWidth`. Calendar pills should collapse to dots.
- Reset the viewport to `desktop` when done.
- Read console messages with `onlyErrors: true` — must be empty.

## 6. Clean up
Clear any test events you added (step 3 again) so the user sees clean demo data. Report what you checked and anything you couldn't verify.
