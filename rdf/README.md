# RDF area

This folder contains BioSynCare RDF assets (OWL, SKOS, and datasets). It is intentionally isolated from the web app code to minimize conflicts between agents.

Ownership and scope:
- Owned by: RDF/ontology workflow
- Affects only files under `rdf/` and `scripts/rdf/`

## Quick start

1) Create a dedicated venv and install tooling:

```
make rdf-setup
```

2) Validate all Turtle files:

```
make rdf-validate
```

## Files
- `bsc-owl.ttl` — minimal core ontology (OWL)
- `bsc-skos.ttl` — SKOS vocabulary for techniques/outcomes
- `historyYYYYMMDD.ttl` — date-stamped triplifications of docs/history.md

## Notes
- The Python tooling uses `rdflib` and is kept in `scripts/rdf/`.
- The venv is `.venv-rdf/` (ignored by git).
- Avoid modifying app code when working in this area; use separate branches/PRs.
