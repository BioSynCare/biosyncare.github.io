# RDF area

This folder contains BioSynCare RDF assets (OWL, SKOS, datasets) organized for clarity and safe collaboration. It is intentionally isolated from web app code.

Ownership and scope:
- Owned by: RDF/ontology workflow
- Affects only files under `rdf/` and `scripts/rdf/`

## Layout

- core/
	- bsc-owl.ttl — minimal core ontology (OWL)
	- bsc-skos.ttl — SKOS vocabulary for techniques/outcomes
- datasets/
	- history/
		- history-YYYY-MM-DD.ttl — date-stamped triplifications of docs/history.md
- external/
	- sso/
		- sso-ontology.ttl — SSO ontology (TTL form)
		- sso-ontology-extended.ttl — Extended SSO TTL
		- sso-initial.owl — SSO initial (RDF/XML)
		- sso-updated.owl — SSO updated (RDF/XML)
	- onc/
		- onc-ontology-attachment-2.ttl — ONC attachment 2 (TTL)

## Quick start

1) Create a dedicated venv and install tooling:

```
make rdf-setup
```

2) Validate all Turtle files:

```
make rdf-validate
```

## Notes
- The Python tooling uses `rdflib` and is kept in `scripts/rdf/`.
- The venv is `.venv-rdf/` (ignored by git).
- Avoid modifying app code when working in this area; use separate branches/PRs.
