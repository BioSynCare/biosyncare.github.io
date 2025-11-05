PROJECT ?= biosyncarelab
PORT ?= 5173
MSG ?= up

.PHONY: help deploy-rules serve git-sync firebase-login open-console

help:
	@printf "Available targets:\n"
	@printf "  deploy-rules    Deploy Firestore security rules (project: $(PROJECT))\n"
	@printf "  serve           Start a static dev server on port $(PORT)\n"
	@printf "  git-sync        Run 'git commit -am \"$(MSG)\"' and push if there are changes\n"
	@printf "  firebase-login  Run 'firebase login' to authenticate the CLI\n"
	@printf "  open-console    Open the Firebase console for $(PROJECT)\n"
	@printf "  rdf-setup       Create Python venv and install RDF tooling\n"
	@printf "  rdf-validate    Validate all Turtle files in rdf/ using rdflib\n"
	@printf "  rdf-report      Generate HTML summary of classes and properties\n"
	@printf "  rdf-docs        Generate pyLODE and Ontospy HTML documentation\n"
	@printf "  rdf-webvowl     Generate WebVOWL JSONs (requires Java)\n"
	@printf "  rdf-webvowl-viewer  Vendor WebVOWL viewer assets (static)\n"

deploy-rules:
	firebase deploy --only firestore:rules --project $(PROJECT)

serve:
	python3 -m http.server $(PORT)

git-sync:
	@git status -sb
	@if git diff --quiet; then \
		echo "No changes to commit."; \
	else \
		git commit -am "$(MSG)" && git push; \
	fi

up:
	git commit -am up
	git push

aup:
	git add .
	make up

firebase-login:
	firebase login

open-console:
	open "https://console.firebase.google.com/project/$(PROJECT)"

# ---------- RDF workflow (isolated) ----------
.PHONY: rdf-setup rdf-validate

VENV_RDF := .venv-rdf
PYTHON_RDF := $(VENV_RDF)/bin/python

rdf-setup:
	python3 -m venv $(VENV_RDF)
	. $(VENV_RDF)/bin/activate; pip install -U pip;
	. $(VENV_RDF)/bin/activate; pip install -r scripts/rdf/requirements.txt

rdf-validate:
	. $(VENV_RDF)/bin/activate; $(PYTHON_RDF) scripts/rdf/validate_rdf.py

rdf-report:
	. $(VENV_RDF)/bin/activate; $(PYTHON_RDF) scripts/rdf/inspect_rdf.py

.PHONY: rdf-docs rdf-docs-pylode rdf-docs-ontospy

rdf-docs: rdf-docs-pylode rdf-docs-ontospy

rdf-docs-pylode:
	mkdir -p rdf/docs/pylode
	. $(VENV_RDF)/bin/activate; $(PYTHON_RDF) -m pylode rdf/core/bsc-owl.ttl -o rdf/docs/pylode/bsc-owl.html
	. $(VENV_RDF)/bin/activate; $(PYTHON_RDF) -m pylode rdf/core/bsc-skos.ttl -o rdf/docs/pylode/bsc-skos.html
	. $(VENV_RDF)/bin/activate; $(PYTHON_RDF) -m pylode rdf/external/sso/sso-ontology.ttl -o rdf/docs/pylode/sso-ontology.html
	. $(VENV_RDF)/bin/activate; $(PYTHON_RDF) -m pylode rdf/external/sso/sso-ontology-extended.ttl -o rdf/docs/pylode/sso-ontology-extended.html

rdf-docs-ontospy:
	mkdir -p rdf/docs/ontospy/bsc rdf/docs/ontospy/sso
	. $(VENV_RDF)/bin/activate; printf "1\n" | ontospy gendocs -o rdf/docs/ontospy/bsc rdf/core/bsc-owl.ttl || true
	. $(VENV_RDF)/bin/activate; printf "1\n" | ontospy gendocs -o rdf/docs/ontospy/sso rdf/external/sso/sso-ontology.ttl || true

.PHONY: rdf-webvowl rdf-webvowl-setup

rdf-webvowl-setup:
	mkdir -p scripts/rdf/tools rdf/docs/webvowl
	@if [ ! -f scripts/rdf/tools/owl2vowl.jar ]; then \
		curl -L -o scripts/rdf/tools/owl2vowl.jar https://github.com/VisualDataWeb/OWL2VOWL/releases/download/0.3.6/owl2vowl.jar ; \
		echo "Downloaded OWL2VOWL jar." ; \
	else \
		echo "OWL2VOWL jar already present." ; \
	fi

rdf-webvowl: rdf-webvowl-setup
	@echo "Generating VOWL JSON for bsc-owl.ttl and sso-ontology.ttl (Java required)..."
	java -jar scripts/rdf/tools/owl2vowl.jar -file rdf/core/bsc-owl.ttl -o rdf/docs/webvowl/bsc.json || true
	java -jar scripts/rdf/tools/owl2vowl.jar -file rdf/external/sso/sso-ontology.ttl -o rdf/docs/webvowl/sso.json || true

rdf-webvowl-viewer:
	mkdir -p scripts/rdf/tools rdf/docs/webvowl/app
	@echo "Fetching WebVOWL gh-pages archive..."
	@rm -f scripts/rdf/tools/webvowl-gh-pages.zip
	@curl -L -A "biosyncare-webvowl-fetch" -o scripts/rdf/tools/webvowl-gh-pages.zip https://codeload.github.com/VisualDataWeb/WebVOWL/zip/refs/heads/gh-pages
	@rm -rf scripts/rdf/tools/WebVOWL-gh-pages
	@unzip -q -o scripts/rdf/tools/webvowl-gh-pages.zip -d scripts/rdf/tools
	@# Copy viewer assets into site folder
	@cp -R scripts/rdf/tools/WebVOWL-gh-pages/* rdf/docs/webvowl/app/ || true
	@echo "WebVOWL viewer assets installed under rdf/docs/webvowl/app/"
