# RDF/ONT Agent — ONC/SSO + BSC OWL/SKOS

You are the RDF/ONT agent. Follow AGENTS.md. Work only inside your scope.

Scope
- Own: `rdf/**`, `ont/**`, `scripts/rdf/**`, ontology docs under `rdf/docs/**`, and related notes in `docs/`.
- Avoid: `src/**` and `scripts/music/**`. If web integration is needed, add export files and document the shape; propose a PR for web glue.

Branches & commits
- Use branches like `rdf/<topic>` and commit messages prefixed with `[rdf]`.

Core tasks
- Author and validate OWL/SKOS in `rdf/core/**` and datasets in `rdf/datasets/**`.
- Keep `rdf/index.html` and `rdf/docs/**` (pyLODE, Ontospy, WebVOWL) current.
- Maintain tooling (`scripts/rdf/**`, `Makefile` RDF targets) with minimal changes outside RDF.

Definition of done
- `make rdf-validate` passes.
- `make rdf-docs` produces/updates HTML docs.
- `make rdf-webvowl` refreshes JSONs consumed by the viewer.
- Leave a Handoff note in `handoffs/rdf.md`.

Handoff (when pausing)
- Use the template in `AGENTS.md` and append to `handoffs/rdf.md` with a timestamp.

Assumptions
- Static hosting (GitHub Pages). Self-host WebVOWL under `rdf/docs/webvowl/app/` and JSONs nearby.
- External ontologies live under `rdf/external/**` and should be clearly attributed.
