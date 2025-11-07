<!-- Append new handoff entries below. Keep newest at the top. -->

## Handoff — Web Presets Agent — 2025-11-07 02:10 UTC

Context
- Firebase adapter (`src/presets/firebase-adapter.js`) now fetches/saves presets; catalog merges hosted docs with bundled JSON.
- Audio panel includes a preset library UI (search, tab between tracks/sessions, load buttons, save buttons).
- “Save track preset” and “Save session preset” snapshot the current controls/active tracks to Firestore (private by default).

Current State
- Folders/default metadata hard-coded to `community`; no delete/rename UI yet.
- Saving uses prompt dialogs; a richer modal is still outstanding.
- Library reflects Firebase data after refresh; offline mode still falls back to static JSON.

Next Steps
- [ ] Add folder picker + metadata form (name, description, tags, visibility).
- [ ] Surface collection hierarchy / filtering UI.
- [ ] Allow deleting/renaming presets (respect ownership rules).
- [ ] Hook symmetryTrack playback once audio support lands.

Risks
- Remote audio presets whose `basePresetId` isn’t in `audioPresets` cannot load (warning logged). Need validation/migration tools.
- Save actions assume Firestore permissions allow writes; handle auth errors gracefully in future iteration.

Owner: Web Presets

---

## Handoff — Web Presets Agent — 2025-11-06 21:30 UTC

Context
- Established shared preset catalogs (`src/data/presets/audio-presets.json` & `session-presets.json`) covering all core audio tracks plus multi-voice BSCLab sessions (with Martigli + symmetry metadata).
- Added runtime helpers:
  - `src/presets/catalog.js` for listing/cloning presets and sessions.
  - `src/presets/url.js` to parse query args (`?preset=sine&preset.frequency=432`).
- Python side can load the exact same data via `scripts/music/presets/load_presets.py`.

Status
- Data + helpers committed; no UI wiring yet.
- URL parser returns merged defaults/overrides but `main.js` is not consuming it—follow-up required.

Next Steps
- [ ] Integrate catalog into `audioPresets` initial state so defaults originate from shared JSON.
- [ ] Allow session selection on launch (use `parsePresetUrlConfig`).
- [ ] Persist user edits back to the shared schema (version bump when fields change).

Risks / Notes
- Import assertions (`assert { type: 'json' }`) are used in catalog; ensure bundler supports them.
- URL overrides accept `voice.{index}.param=value` for multi-voice sessions—document for web-core.
