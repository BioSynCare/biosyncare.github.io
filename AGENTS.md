# Multi‑Agent Coordination for BioSynCare Lab

This document defines how three AI agents collaborate in this repository without stepping on each other’s work, and how they hand off progress cleanly.

Last updated: 2025-11-06 (web agents split: Presets vs Core)

## Agents and scopes

- Web Presets agent (Presets I/O and Music bridge)
  - Goal: Own preset input/output for BSCLab: URL parsing, Firebase read/write, and consuming Music outputs; expose a small API to the rest of the app.
  - Owns: `src/presets/**`, preset-related helpers under `src/utils/presets-*.js`, preset state/selectors under `src/state/presets-*.js`, and any preset data under `src/data/presets/**`.
  - Avoid: Changing Python logic in `scripts/music/**` directly (coordinate via PR to Music agent). Avoid unrelated UI/service edits—hand off to Web Core.
  - Notes: Responsible for sanitizing URL-provided configs, schema versioning/migrations of presets, and coordinating with Music’s JSON under `scripts/music/output/**` (via the sync step below).

- Web Core agent (Neurosensory Modulation UI)
  - Goal: Evolve the client-side web app and UX excluding the presets subsystem; keep boundaries clean.
  - Owns: `index.html`, `docs_landing.html`, `src/**` except `src/presets/**`, including `src/ui/**`, `src/core/**`, `src/services/**`, `src/state/**`, `src/data/**`, `src/utils/**`.
  - Avoid: `src/presets/**` (owned by Web Presets). Also avoid `rdf/**`, `ont/**`, `scripts/rdf/**`, `scripts/music/**` (open a PR instead).

- RDF/ONT agent (ONC/SSO + BSC OWL/SKOS + visualization/analysis)
  - Goal: Author and validate ontologies and datasets; generate docs and viz; analysis and PDF navigation helpers.
  - Owns: `rdf/**`, `ont/**`, `scripts/rdf/**`, `rdf/docs/**`, `docs/` ontology notes.
  - Avoid: `src/**`, `scripts/music/**` (propose integration points via PRs or adapter files).

- Music agent (change ringing + algebraic symmetries/permutations)
  - Goal: Generate musical structures and peals using Python; export assets for the web app.
  - Owns: `scripts/music/**` (including `scripts/music/output/**` and `scripts/music/peals/**`), `docs/` notes for methods.
  - Avoid: `src/**` edits (if a change is needed, propose via PR). Prefer writing data to `scripts/music/output/` and documenting the interface.

- Agent master (governance and meta-instructions)
  - Goal: Improve and maintain the agent governance docs and per-agent instruction files; add light repo helpers to make workflows discoverable.
  - Owns: `AGENTS.md`, `.vscode/ai-instructions/**`, `handoffs/**`, small Makefile helpers (non-functional, informational targets).
  - Avoid: application logic changes; if needed, open a PR and hand off to the relevant agent.

- Git master (repo health, committing, and reviews)
  - Goal: Keep the repo in a healthy state; run quick checks; craft informative commits; propose follow-ups or small fixes.
  - Owns: High-level housekeeping changes (format/readme/help targets), running linters/validators, batching safe commits. May open PRs that span multiple areas.
  - Avoid: deep feature implementation (delegate to Web/RDF/Music via Handoff or PR assignments), destructive refactors without prior notes.

Notes:
- Shared files (e.g., `README.md`, `Makefile`) should be changed via small, focused PRs to avoid surprises.
- If an agent must touch outside its area, open a PR instead of committing directly and explain the rationale in the Handoff.

## Branching and commit hygiene

- Branch prefixes by agent:
  - Web Presets: `web-presets/<short-topic>`
  - Web Core: `web-core/<short-topic>`
  - RDF/ONT: `rdf/<short-topic>`
  - Music: `music/<short-topic>`
  - Agent master: `meta/<short-topic>`
  - Git master: `ops/<short-topic>`
- Commit message prefix: `[web-presets]`, `[web-core]`, `[rdf]`, or `[music]`.
  - Meta/governance: `[meta]`
  - Ops/repo health: `[ops]`
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

- Web Presets ⇄ Music
  - Music writes machine-readable outputs to `scripts/music/output/` (JSON/CSV/audio). Presets agent may import or fetch these outputs to construct presets.
  - Preferred flow: Music exports `scripts/music/output/musicStructures.json`; Web runs `make web-sync-music-data` to (re)generate `src/data/musicStructures.js` for synchronous imports consumed by Presets and Core.
  - If preset logic needs changes in Python outputs, open a PR to Music with a small, documented adapter rather than altering core music scripts.

- Web Core ⇄ Web Presets
  - Web Core uses only the Presets agent’s public API (`src/presets/**`), not its internals.
  - If Core needs new preset capabilities, open a PR targeted to the Presets branch/folder. Core must not directly modify `src/presets/**`.

- RDF/ONT ⇄ Music
  - Optional: music emits metadata (e.g., technique URIs) that map to RDF vocabularies. Coordinate via a small schema doc in `scripts/music/README.md` and an example file in `scripts/music/output/`.

## Minimal DoD per agent

- Web Presets: preset load/save (URL, Firebase, Music JSON) works locally (`make serve`); schema validated/sanitized; includes a Handoff note.
- Web Core: feature works locally (`make serve`), no console errors, basic accessibility, and a Handoff note; does not modify `src/presets/**`.
- RDF/ONT: `make rdf-validate` passes, docs generated (`make rdf-docs`), JSONs for WebVOWL updated (`make rdf-webvowl`), and a Handoff note.
- Music: scripts run with a clean venv, outputs written under `scripts/music/output/`, readme updated if data shape changes, and a Handoff note.
- Agent master: governance docs and instruction files improved; helpers added to Makefile if needed; Handoff note explains changes and intended usage.
- Git master: repository status is clean; quick checks pass (lint/validate); commits are informative; Handoff note lists follow-ups per agent.

## Quick commands (helpers)

- Show where the coordination docs live: `make agents-info`
- Open this file (macOS): `make open-agents`
 - Quick repo health scan (lint/status): `make repo-health`

Folders to know
- Presets API and adapters: `src/presets/**` (owned by Web Presets agent)
- New handoffs: `handoffs/web-presets.md`, `handoffs/web-core.md`

Instruction files
- `.vscode/ai-instructions/web-presets-agent.md`
- `.vscode/ai-instructions/web-core-agent.md`

These are convenience wrappers so you don’t have to remember paths.
