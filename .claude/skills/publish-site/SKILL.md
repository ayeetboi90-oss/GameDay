---
name: publish-site
description: Publish the GameDay static site to the web (GitHub Pages, Netlify Drop, or a claude.ai artifact). Only run when the user explicitly asks to deploy, publish, or host the site.
disable-model-invocation: true
---

# Publish the site

Publishing is outward-facing: confirm the target with the user before doing anything, and never push or deploy without a clear yes.

## Before publishing
1. Run `npm run check` — must pass.
2. Run the `verify-site` skill.
3. The deployable files are exactly: `index.html`, `styles.css`, `lib.js`, `app.js`. Nothing else is needed at runtime (`tests/`, `.claude/`, `package.json` are dev-only).

## Options (ask which one)
- **GitHub Pages** — needs a git repo and a GitHub remote. Commit, push to `main`, then enable Pages (Settings → Pages → Deploy from branch → `main` / root). Use the `gh` CLI if available: `gh repo create`, then `gh api` to enable Pages. Ask before creating a repo or pushing.
- **Netlify Drop** — no account setup from Claude; tell the user to drag the folder onto https://app.netlify.com/drop.
- **claude.ai artifact** — fastest private link. Inline `styles.css`, `lib.js`, and `app.js` into a single HTML file in the scratchpad (artifacts are single pages; or publish the extra files via `files`), then publish with the Artifact tool.

## Remind the user
Data is saved per browser (localStorage). A published copy does not share events between visitors.
