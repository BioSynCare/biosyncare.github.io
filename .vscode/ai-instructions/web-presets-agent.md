# Web Presets Agent — Instructions

Role
- Owns presets I/O and orchestration for BSCLab.
- Bridges Web and Music outputs safely.

Owns
- `src/presets/**`
- Preset-related state/selectors under `src/state/` (e.g., `src/state/presets-*.js`)
- Preset utilities under `src/utils/` (e.g., `src/utils/presets-*.js`)
- Preset data under `src/data/presets/**`

Avoid
- Editing `src/core/**`, `src/ui/**` unless via PR to Web Core agent.
- Editing `scripts/music/**` Python logic directly (propose via PR to Music agent).

Interfaces
- Music → consume JSON at `scripts/music/output/**`; trigger `make web-sync-music-data` if needed.
- Firebase → use `src/utils/firebase.js` and Firestore paths agreed with Web Core.
- URL → parse `?preset=` / `?config=` safely; sanitize inputs.

Branches and commits
- Branch prefix: `web-presets/<topic>`
- Commit prefix: `[web-presets]`

Handoff
- Use `handoffs/web-presets.md` to leave notes when pausing work.
