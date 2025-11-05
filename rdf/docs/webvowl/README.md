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
  - Self-hosted under `app/` so GitHub Pages can serve it without iframes or external dependencies.
  - Install (vendor) the viewer assets locally:

    ```bash
    make rdf-webvowl-viewer
    ```

    This downloads the WebVOWL `gh-pages` branch and copies the static files into `rdf/docs/webvowl/app/`.

If the auto-install fails (e.g., network restrictions), manually download the archive:

1. Download https://github.com/VisualDataWeb/WebVOWL/archive/refs/heads/gh-pages.zip
2. Unzip and copy its contents into `rdf/docs/webvowl/app/`

Once both the JSON and the viewer are present, open:

- Local: http://localhost:5173/rdf/docs/webvowl/viewer.html
- Live:  https://biosyncare.github.io/rdf/docs/webvowl/viewer.html

Use the buttons to open the diagrams; the page prefers the self-hosted viewer and falls back to the public mirror if needed.
