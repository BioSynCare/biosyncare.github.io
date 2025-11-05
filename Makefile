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
