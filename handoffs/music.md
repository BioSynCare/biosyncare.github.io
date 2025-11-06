<!-- Append new handoff entries below. Keep newest at the top. -->

## Handoff — Music Agent — 2025-11-06 18:05 UTC

Context
- Export pipeline refreshed (`scripts/music/export_structures.py`) to emit full + compact JSON under `scripts/music/output/`.
- Adds additional PlainChanges variants (extra hunts/stages) and symmetry datasets (rotations/mirrors/dihedral, swap families).
- Docs updated (`scripts/music/README.md`, `scripts/music/WORKFLOW.md`) with usage notes; handoff for Web agent updated with consumption instructions.

Current state
- Branch: n/a (working tree dirty only for exporters + docs)
- Files touched: `scripts/music/export_structures.py`, docs, web handoff.
- Validation: `python scripts/music/export_structures.py` regenerates JSON (minified + pretty).
- Issues: Sympy raises informational warnings about duplicate PlainChanges (expected).

Next steps
- [ ] Coordinate with Web agent if new datasets are required.
- [ ] Keep JSON outputs ignored (they’re regenerated on demand).

Risks / assumptions
- Web agent relies on `make web-sync-music-data`; ensure this target remains in sync if exporter format changes.
