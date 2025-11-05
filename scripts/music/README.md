# BiosynCare Change-Ringing Toolkit

This folder hosts Python utilities for working with musical change-ringing
patterns (peals). The tools here are intentionally isolated from the rest of
the codebase so we can iterate without interfering with other agents that may
be editing BioSyncCare or RDF resources.

## Current utilities

### `peal_renderer.py`

Command-line helper that scans a directory of plain-text peal definitions and
creates formatted summaries that are easier to inspect or share.

Each source file is expected to contain one row per change. Lines starting with
`#` are treated as comments and blank lines are ignored. Everything else is
preserved verbatim, so you can include bells as digits (`123456`) or any other
notation you prefer.

```bash
python peal_renderer.py --input peals/raw --output peals/rendered
```

The renderer will:

1. Parse every `.txt` file in the input directory.
2. Produce a formatted version in the output directory that numbers each row
   and adds helpful metadata.
3. Emit a JSON summary (`index.json`) with quick statistics about every peal.

Both the parser and formatting steps are lightweight pure-Python utilities,
making them easy to extend with additional render targets (e.g., Markdown,
LaTeX, MIDI generation) as the music package evolves.

## Working with Python dependencies

At the moment the scripts only rely on Python's standard library. If we need
third-party packages for more advanced rendering (e.g., `music21`, `mido`,
`numpy`), list them in `requirements.txt` inside this folder so the dependency
scope stays localized:

```bash
# optional install example
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Feel free to add additional modules inside this package for symmetry engines,
pattern generators, or integrations with the broader audiovisual toolchain.
