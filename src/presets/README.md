# Presets Manager (Web)

Owner: Web Presets agent

Purpose
- Centralize preset I/O for BSCLab: load/save from Firebase, parse/apply URL args, and import/export JSON from Music outputs.
- Provide a small, explicit API for the rest of the web app; avoid coupling UI components to storage/parsing details.

Scope
- This folder is the sole home for presets orchestration code and adapters.
- Sources/sinks:
  - Music: consume JSON under `scripts/music/output/` via a sync step or fetch at runtime.
  - Firebase: read/write user or shared presets via `src/utils/firebase.js`.
  - URL: parse `?preset=...` or `?config=...` arguments and apply safely.

Contract (suggested)
- `loadPreset({ from })` where `from ∈ { 'firebase', 'url', 'file', 'local' }`
- `savePreset({ to })` where `to ∈ { 'firebase', 'file', 'local' }`
- `applyPreset(preset)` returns `Result` with validation errors if any
- Emits events or returns data-only objects, leaving UI rendering to callers

Boundaries
- Web Core must not edit files in `src/presets/**`. Changes go through a PR owned by Web Presets agent.
- Do not modify Python music scripts from here; consume their outputs in `scripts/music/output/**`.

Notes
- Keep presets schema versioned; add a `version` field and migration helpers.
- Add a minimal validator and sanitize URL-derived inputs.
