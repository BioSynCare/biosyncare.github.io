# Web Core Agent — Instructions

Role
- Owns the rest of the web app (UI/UX, audio, services) while respecting the Presets boundary.

Owns
- `index.html`, `docs_landing.html`
- `src/**` except `src/presets/**` and files explicitly owned by other agents
- `src/core/**`, `src/ui/**`, `src/services/**`, `src/state/**`, `src/data/**`, `src/utils/**`

Avoid
- Editing `src/presets/**` (owned by Web Presets agent). For changes, open a PR targeted to `web-presets/<topic>`.
- Editing `rdf/**`, `ont/**`, `scripts/music/**`.

Interfaces
- Presets → depend on a clear API surface exposed by `src/presets/**`; do not reach into its internals.
- Music → consume `src/data/musicStructures.js` (built via `make web-sync-music-data`).

Branches and commits
- Branch prefix: `web-core/<topic>`
- Commit prefix: `[web-core]`

Handoff
- Use `handoffs/web-core.md` to leave notes when pausing work.
