# Multi‑Agent Coordination for BioSynCare Lab

This document defines how three AI agents collaborate in this repository without stepping on each other’s work, and how they hand off progress cleanly.

Last updated: 2025-11-06

## Agents and scopes

- Web agent (Neurosensory Modulation UI)
  - Goal: Evolve the client-side web app and UX.
  - Owns: `index.html`, `src/**`, `src/ui/**`, `src/core/**`, `src/services/**`, `src/state/**`, `src/data/**`, `src/utils/**`, `docs_landing.html`, `eslint.config.js`, `firebase.json`, `firestore.*`.
  - Avoid: `rdf/**`, `ont/**`, `scripts/rdf/**`, `scripts/music/**` (open a PR instead if needed), `rdf/docs/**`.

- RDF/ONT agent (ONC/SSO + BSC OWL/SKOS + visualization/analysis)
  - Goal: Author and validate ontologies and datasets; generate docs and viz; analysis and PDF navigation helpers.
  - Owns: `rdf/**`, `ont/**`, `scripts/rdf/**`, `rdf/docs/**`, `docs/` ontology notes.
  - Avoid: `src/**`, `scripts/music/**` (propose integration points via PRs or adapter files).

- Music agent (change ringing + algebraic symmetries/permutations)
  - Goal: Generate musical structures and peals using Python; export assets for the web app.
  - Owns: `scripts/music/**` (including `scripts/music/output/**` and `scripts/music/peals/**`), `docs/` notes for methods.
  - Avoid: `src/**` edits (if a change is needed, propose via PR). Prefer writing data to `scripts/music/output/` and documenting the interface.

Notes:
- Shared files (e.g., `README.md`, `Makefile`) should be changed via small, focused PRs to avoid surprises.
- If an agent must touch outside its area, open a PR instead of committing directly and explain the rationale in the Handoff.

## Branching and commit hygiene

- Branch prefixes by agent:
  - Web: `web/<short-topic>`
  - RDF/ONT: `rdf/<short-topic>`
  - Music: `music/<short-topic>`
- Commit message prefix: `[web]`, `[rdf]`, or `[music]`.
- Commit small and often. Reference the Handoff when stopping.

## Handoff protocol (leave this when stopping)

When pausing work or finishing a chunk, leave a note for the next agent in `handoffs/<agent>.md` and paste the same content (or a summary) in your final chat message.

Template:

```
Handoff — <agent name> — <YYYY-MM-DD HH:MM local>

Context
- What I worked on and why
- Relevant links or files

Current state
- Branch: <name>
- Files changed: <list>
- Build/validation: <results>
- Known issues: <list>

Next steps (queue for successor)
- [ ] Action 1
- [ ] Action 2

Risks / assumptions
- <notes>

Commands / queries used (optional)
- <cmds>

Owner handoff
- Suggested next agent: <web|rdf|music>
```

Short version (if you’re in a hurry):

```
<agent> @ <YYYY-MM-DD HH:MM> — branch <name>
Did: <one-liner>. Next: <one-liner>. Issues: <optional>.
```

## Interfaces between agents

- Web ⇄ RDF/ONT
  - RDF produces artifacts in `rdf/**`, docs in `rdf/docs/**` (pyLODE, Ontospy, WebVOWL). Web only links/consumes.
  - If web needs a new RDF export, open an issue/PR tagged `[rdf]` describing the shape/location.

- Web ⇄ Music
  - Music writes machine-readable outputs to `scripts/music/output/` (JSON/CSV/audio). Web may import or fetch these outputs.
  - If web requires changes to runtime JS (e.g., `src/core/change-ringing.js`), do so via PRs with a small adapter, not by overwriting music’s Python logic.

- RDF/ONT ⇄ Music
  - Optional: music emits metadata (e.g., technique URIs) that map to RDF vocabularies. Coordinate via a small schema doc in `scripts/music/README.md` and an example file in `scripts/music/output/`.

## Minimal DoD per agent

- Web: feature works locally (`make serve`), no console errors, basic accessibility, and a Handoff note.
- RDF/ONT: `make rdf-validate` passes, docs generated (`make rdf-docs`), JSONs for WebVOWL updated (`make rdf-webvowl`), and a Handoff note.
- Music: scripts run with a clean venv, outputs written under `scripts/music/output/`, readme updated if data shape changes, and a Handoff note.

## Quick commands (helpers)

- Show where the coordination docs live: `make agents-info`
- Open this file (macOS): `make open-agents`

These are convenience wrappers so you don’t have to remember paths.
