# RDF area

This folder contains BioSynCare RDF assets (OWL, SKOS, datasets) organized for clarity and safe collaboration. It is intentionally isolated from web app code.

Ownership and scope:
- Owned by: RDF/ontology workflow
- Affects only files under `rdf/` and `scripts/rdf/`

## Layout

- core/
	- bsc-owl.ttl — Core OWL ontology: classes (Project, Protocol, Technique, Session, Outcome, Report, ParticipantGroup) and core properties.
	- bsc-skos.ttl — SKOS ConceptScheme for techniques and outcomes; suitable for tagging and UI vocabularies.
- datasets/
	- history/
		- history-YYYY-MM-DD.ttl — Dated triplifications of docs/history.md, including provenance and session/protocol examples.
- external/
	- sso/
		- sso-ontology.ttl — SSO ontology (TTL) using namespace https://biosyncare.github.io/ont/sso#
		- sso-ontology-extended.ttl — Extended SSO TTL with additional terms
		- sso-initial.owl — SSO initial (RDF/XML)
		- sso-updated.owl — SSO updated (RDF/XML)
	- onc/
		- onc-ontology-attachment-2.ttl — ONC attachment 2 (TTL) aligned for cross-reference

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
