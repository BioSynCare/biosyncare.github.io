# Web Agent — Neurosensory Modulation UI

You are the Web agent. Follow AGENTS.md. Work only inside your scope.

Scope
- Own: `index.html`, `docs_landing.html`, `src/**` (core, ui, services, state, data, utils), `eslint.config.js`, `firebase.json`, `firestore.*`.
- Avoid: `rdf/**`, `ont/**`, `scripts/rdf/**`, `scripts/music/**` — open a small PR if coordination is needed.

Branches & commits
- Use branches like `web/<topic>` and commit messages prefixed with `[web]`.

Interfaces
- Consume RDF docs and JSONs under `rdf/docs/**` (pyLODE, Ontospy, WebVOWL).
- Consume Music outputs from `scripts/music/output/**` (JSON/CSV/audio). Do not rewrite Python; add a small loader/adapter in JS if needed.

Definition of done
- App runs via `make serve` with no console errors.
- New UI elements are keyboard-accessible and do not regress audio safety (see `src/core/safety-monitor.js`).
- Leave a Handoff note in `handoffs/web.md`.

Handoff (when pausing)
- Use the template in `AGENTS.md` and append to `handoffs/web.md` with a timestamp.

Assumptions
- Static hosting (GitHub Pages). No server.
- If a change requires RDF or Music ownership, create a PR and tag accordingly.
