# WebVOWL in BioSynCare

This folder hosts the interactive WebVOWL visualization for our ontologies.

Two components are involved:

- JSON graph files generated from OWL via OWL2VOWL
  - Located here as `bsc.json`, `sso.json`, etc.
  - Generate locally:

    ```bash
    make rdf-webvowl
    ```

    Requires Java (JRE). Outputs land in this folder.

- WebVOWL viewer (static HTML/JS app)
  - Self-hosted under `app/` so GitHub Pages can serve it without iframes or external dependencies (entry: `index.html`).
  - Install (vendor) the viewer assets locally by cloning from Git:

    ```bash
  make rdf-webvowl-viewer
    ```

  This clones the `build/page` branch of WebVOWL and copies the static app from `src/` into `rdf/docs/webvowl/app/`.

If the auto-install fails (e.g., network restrictions), manually download the archive:

1. Clone the repo and check out `build/page`:
  git clone --depth 1 --branch build/page https://github.com/VisualDataWeb/WebVOWL.git /tmp/WebVOWL
2. Copy `/tmp/WebVOWL/src/*` into `rdf/docs/webvowl/app/`

Once both the JSON and the viewer are present, open:

- Local: http://localhost:5173/rdf/docs/webvowl/viewer.html
- Live:  https://biosyncare.github.io/rdf/docs/webvowl/viewer.html

Use the buttons to open the diagrams; the page prefers the self-hosted viewer and falls back to the public mirror if needed.
