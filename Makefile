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
	@printf "  agents-info     Show locations of AGENTS.md and per-agent instructions\n"
	@printf "  open-agents     Open AGENTS.md (macOS)\n"
	@printf "  web-sync-music-data  Build src/data/musicStructures.js from scripts/music/output/musicStructures.json\n"
	@printf "  repo-health      Quick repository health scan (status, lint, RDF validate)\n"
	@printf "  agents-info     Show locations of AGENTS.md and per-agent instructions\n"
	@printf "  open-agents     Open AGENTS.md (macOS)\n"
	@printf "  rdf-setup       Create Python venv and install RDF tooling\n"
	@printf "  rdf-validate    Validate all Turtle files in rdf/ using rdflib\n"
	@printf "  rdf-report      Generate HTML summary of classes and properties\n"
	@printf "  rdf-docs        Generate pyLODE and Ontospy HTML documentation\n"
	@printf "  rdf-webvowl     Generate WebVOWL JSONs (requires Java)\n"
	@printf "  rdf-webvowl-viewer  Vendor WebVOWL viewer assets (static)\n"
	@printf "  rdf-explorer-data  Export graph/entity JSON for the static explorer\n"

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

# ---------- Agents helpers ----------
.PHONY: agents-info open-agents

agents-info:
	@echo "Coordination file: AGENTS.md"
	@echo "Per-agent instructions: .vscode/ai-instructions/"
	@ls -1 .vscode/ai-instructions || true
	@echo "Handoffs folder: handoffs/ (append your notes to the relevant file)"

open-agents:
	open AGENTS.md

# ---------- Repo health ----------
.PHONY: repo-health

repo-health:
	@echo "== Git status ==" && git status -sb && echo
	@echo "== Node lint (if available) ==" && npm run -s lint || echo "(lint script not defined or failed)" && echo
	@echo "== RDF validate (if venv set up) ==" && $(MAKE) -s rdf-validate || echo "(rdf-validate skipped)" && echo

# ---------- Web/Music data sync ----------
.PHONY: web-sync-music-data

web-sync-music-data:
	@if [ ! -f scripts/music/output/musicStructures.json ]; then \
		echo "ERROR: scripts/music/output/musicStructures.json not found. Run: python3 scripts/music/export_structures.py"; \
		exit 1; \
	fi
	@python3 scripts/music/sync_to_web.py

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

.PHONY: rdf-webvowl rdf-webvowl-setup rdf-webvowl-jar rdf-webvowl-build-owl2vowl

rdf-webvowl-setup:
	mkdir -p scripts/rdf/tools rdf/docs/webvowl
	@# Download OWL2VOWL jar robustly with fallbacks if missing or clearly too small
	@if [ ! -s scripts/rdf/tools/owl2vowl.jar ] || [ $$(wc -c < scripts/rdf/tools/owl2vowl.jar) -lt 100000 ]; then \
		echo "Fetching OWL2VOWL jar..."; \
		rm -f scripts/rdf/tools/owl2vowl.jar; \
		for URL in \
			https://github.com/VisualDataWeb/OWL2VOWL/releases/download/0.3.6/owl2vowl.jar \
			https://raw.githubusercontent.com/VisualDataWeb/OWL2VOWL/0.3.6/owl2vowl.jar ; do \
			echo "  -> trying $$URL"; \
			curl -fL -H "Accept: application/octet-stream" -o scripts/rdf/tools/owl2vowl.jar "$$URL" && break; \
			done; \
		if [ ! -s scripts/rdf/tools/owl2vowl.jar ] || [ $$(wc -c < scripts/rdf/tools/owl2vowl.jar) -lt 100000 ]; then \
			echo "WARN: Direct jar download failed; trying legacy 0.2.0 zip asset..."; \
			rm -rf scripts/rdf/tools/owl2vowl-zip && mkdir -p scripts/rdf/tools/owl2vowl-zip; \
			curl -fL -H "Accept: application/octet-stream" -o scripts/rdf/tools/owl2vowl-0.2.0.zip https://github.com/VisualDataWeb/OWL2VOWL/releases/download/0.2.0/owl2vowl.zip || true; \
			unzip -q -o scripts/rdf/tools/owl2vowl-0.2.0.zip -d scripts/rdf/tools/owl2vowl-zip || true; \
			chmod -R u+rwX scripts/rdf/tools/owl2vowl-zip || true; \
			JAR=$$(cd scripts/rdf/tools/owl2vowl-zip && find . -name 'owl2vowl.jar' -maxdepth 3 -print -quit); \
			if [ -n "$$JAR" ]; then \
				cp "scripts/rdf/tools/owl2vowl-zip/$$JAR" scripts/rdf/tools/owl2vowl.jar; \
			fi; \
		fi; \
		if [ ! -s scripts/rdf/tools/owl2vowl.jar ] || [ $$(wc -c < scripts/rdf/tools/owl2vowl.jar) -lt 100000 ]; then \
			echo "WARN: Could not obtain owl2vowl.jar from releases; will attempt to build from source."; \
			$(MAKE) rdf-webvowl-build-owl2vowl || { echo "ERROR: Build failed. Install Maven or download the jar manually."; exit 1; }; \
		fi; \
		if ! unzip -t scripts/rdf/tools/owl2vowl.jar >/dev/null 2>&1; then \
			echo "ERROR: owl2vowl.jar appears to be invalid."; \
			exit 1; \
		fi; \
		echo "Downloaded OWL2VOWL jar."; \
	else \
		echo "OWL2VOWL jar already present."; \
	fi

rdf-webvowl-build-owl2vowl:
	mkdir -p scripts/rdf/tools
	@if ! command -v mvn >/dev/null 2>&1; then \
		echo "ERROR: Maven (mvn) not found. Please install Maven or provide owl2vowl.jar manually."; \
		exit 1; \
	fi
	@if [ ! -d scripts/rdf/tools/OWL2VOWL ]; then \
		git clone --depth 1 https://github.com/VisualDataWeb/OWL2VOWL.git scripts/rdf/tools/OWL2VOWL; \
	else \
		git -C scripts/rdf/tools/OWL2VOWL pull --ff-only; \
	fi
	@echo "Building OWL2VOWL with Maven (this may take a minute)..."
	@cd scripts/rdf/tools/OWL2VOWL && mvn -q -DskipTests package
	@JAR=$$(cd scripts/rdf/tools/OWL2VOWL/target && ls -1 *-shaded.jar 2>/dev/null | head -n1); \
	if [ -z "$$JAR" ]; then \
		echo "ERROR: Built jar not found (expected *-shaded.jar)."; exit 1; \
	fi; \
	cp "scripts/rdf/tools/OWL2VOWL/target/$$JAR" scripts/rdf/tools/owl2vowl.jar
	@echo "OWL2VOWL jar built at scripts/rdf/tools/owl2vowl.jar"

rdf-webvowl: rdf-webvowl-setup rdf-webvowl-jar
	@echo "Generating VOWL JSON for bsc-owl.ttl and sso-ontology.ttl (Java required)..."
	java -jar scripts/rdf/tools/owl2vowl.jar -file rdf/core/bsc-owl.ttl -echo > rdf/docs/webvowl/bsc.json || true
	java -jar scripts/rdf/tools/owl2vowl.jar -file rdf/external/sso/sso-ontology.ttl -echo > rdf/docs/webvowl/sso.json || true

rdf-webvowl-jar:
	@if [ ! -s scripts/rdf/tools/owl2vowl.jar ]; then \
		$(MAKE) rdf-webvowl-setup; \
	fi

rdf-webvowl-viewer:
	mkdir -p scripts/rdf/tools rdf/docs/webvowl/app
	@if [ ! -d scripts/rdf/tools/WebVOWL-build-page ]; then \
		echo "Cloning WebVOWL build/page (shallow)..."; \
		git clone --depth 1 --branch build/page https://github.com/VisualDataWeb/WebVOWL.git scripts/rdf/tools/WebVOWL-build-page; \
	else \
		echo "Updating existing WebVOWL build/page clone..."; \
		git -C scripts/rdf/tools/WebVOWL-build-page fetch origin build/page; \
		git -C scripts/rdf/tools/WebVOWL-build-page reset --hard origin/build/page; \
	fi
	@# Install and build deploy/ with grunt (postinstall runs release)
	@cd scripts/rdf/tools/WebVOWL-build-page && npm install --silent || npm install
	@# Copy built app from deploy/
	@rm -rf rdf/docs/webvowl/app/*
	@cp -R scripts/rdf/tools/WebVOWL-build-page/deploy/* rdf/docs/webvowl/app/ || true
	@echo "WebVOWL viewer assets installed under rdf/docs/webvowl/app/ (entry: index.html)"

.PHONY: rdf-explorer-data

rdf-explorer-data:
	. $(VENV_RDF)/bin/activate; $(PYTHON_RDF) scripts/rdf/export_explorer_data.py
