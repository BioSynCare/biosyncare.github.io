# BiosynCare Change-Ringing Toolkit

This folder hosts Python utilities for working with musical change-ringing
patterns (peals). The tools here are intentionally isolated from the rest of
the codebase so we can iterate without interfering with other agents that may
be editing BioSyncCare or RDF resources.

## Quick Start

```bash
# Activate the virtual environment
source .venv/bin/activate

# Generate sample peals
python generate_sample_peals.py

# Format the peals
python peal_renderer.py --input peals/raw --output peals/rendered

# Export structured data (JSON) for the JS engine
python scripts/music/export_structures.py

# Sync JSON into a JS module for the frontend (keeps Web/Music boundary clean)
make web-sync-music-data

# Render reference WAVs for audio presets
python scripts/music/render_presets_audio.py

# Convert a peal to audio (explicit opt-in; disabled by default)
python peal_to_audio.py generate output/my_peal.wav --bells 4 --hunts 1 --allow-render
```

> ⚠️ Audio rendering is opt-in. The BioSyncare frontend now synthesizes peals in real time,
> so the Python tools refuse to write WAV files unless you pass `--allow-render`.

For detailed workflow documentation, see [WORKFLOW.md](WORKFLOW.md).

## Utilities

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

### `peal_to_audio.py`

Converts change-ringing peals to audio files using the ttm/music package.
Maps bell positions to frequencies and renders complete peals as WAV files.

```bash
# Render an existing peal file
python peal_to_audio.py render peals/raw/plain_changes_4.txt output/my_peal.wav --allow-render

# Generate and render a new peal
python peal_to_audio.py generate output/custom.wav --bells 5 --hunts 2 --duration 0.25 --allow-render
```

Options:
- `--base-freq`: Base frequency in Hz (default: 220)
- `--duration`: Note duration in seconds (default: 0.3)
- `--vibrato-freq`: Vibrato frequency in Hz (optional)
- `--vibrato-depth`: Vibrato depth 0-1 (optional)

### `generate_sample_peals.py`

Generates example peal definition files using the PlainChanges algorithm
from the ttm/music package. Creates peals for 3, 4, 5, and 6 bells with
appropriate hunt bell configurations.

```bash
python generate_sample_peals.py
```

Output files are saved to `peals/raw/` with metadata comments.

### `export_structures.py`

Exports the change-ringing library, additional PlainChanges variants, and
permutation symmetry datasets.

```bash
python export_structures.py
```

Outputs (all under `scripts/music/output/`):
- `musicStructures.json` (pretty) and `musicStructures.min.json`
  - Full metadata including transition analytics, symmetry summaries, and
    auto-generated PlainChanges sequences beyond the raw txt files.
- `musicStructures.compact.json` and `musicStructures.compact.min.json`
  - Lightweight permutations-only view for realtime consumers (bell indices,
    rotations, mirrors, dihedral sets).

Use `make web-sync-music-data` if you need to sync the pretty JSON into the
web bundle.

### `render_presets_audio.py`

Renders WAV reference files for the web audio presets (sine, binaural, monaural,
isochronic, Martigli harmonics, and coloured noise variants). Useful for QA or
regression checks against the browser engine.

```bash
python render_presets_audio.py --output scripts/music/output/presets --duration 12
```

Arguments:
- `--output`: Target directory (default `scripts/music/output/presets`)
- `--duration`: Seconds per render (default 10s)
- `--sample-rate`: Sample rate in Hz (default 44100)
- `--presets`: Optional subset of preset keys

### Preset Templates

Session/preset JSON guidance (including Martigli and symmetry-track fields) lives in
`scripts/music/presets/README.md`. Share this with the web agent when defining
coordinated sessions or multi-voice experiences.

## Dependencies

The toolkit uses the **ttm/music** package, a comprehensive Python library for
music synthesis and algorithmic composition. The package is installed in
editable mode from `3p/music/` and includes:

- **Core synthesis**: Oscillators, filters, envelopes, effects
- **Structures**: Change ringing peals, permutations, scales, chords
- **I/O**: WAV file reading/writing, audio playback
- **Legacy synths**: Being, IteratorSynth for pattern-based composition

### Installation

The virtual environment is already set up with all dependencies:

```bash
# Install from scratch (if needed)
python -m venv .venv
source .venv/bin/activate
pip install -e 3p/music
```

Dependencies include: numpy, scipy, matplotlib, sympy, colorama, termcolor.

## Directory Structure

```
scripts/music/
├── 3p/
│   └── music/              # ttm/music package (installed editably)
├── peals/
│   ├── raw/                # Plain-text peal definitions
│   └── rendered/           # Formatted peals + index.json
├── output/                 # Generated audio files (.wav)
├── .venv/                  # Python virtual environment
├── README.md               # This file
├── WORKFLOW.md             # Detailed workflow documentation
├── peal_renderer.py        # Format peal definitions
├── peal_to_audio.py        # Convert peals to audio
└── generate_sample_peals.py # Generate example peals
```

## Change Ringing Basics

Change ringing is a mathematical and musical art form where bells are rung in
all possible permutations:

- **Stage**: Number of bells (3, 4, 5, 6, etc.)
- **Row**: A complete permutation of the bells
- **Peal**: A sequence of rows that returns to the starting position
- **Hunt bell**: A bell that follows a regular pattern through the sequence

The **PlainChanges** algorithm generates true peals where:
- Bells can only swap with adjacent neighbors
- Hunt bells follow predictable patterns
- No row is repeated (except the starting position)

## Integration

These utilities can be integrated with:

- **BioSynCare web interface**: `src/core/change-ringing.js` consumes `src/data/musicStructures.js` (generated from `scripts/music/output/musicStructures.json` via `make web-sync-music-data`)
- **RDF/OWL ontologies**: Describe peal patterns and properties
- **Audiovisual synchronization**: Match peal rhythms with breathing cycles
- **Pattern analysis**: Study symmetries and mathematical properties

See [WORKFLOW.md](WORKFLOW.md) for detailed examples and advanced usage.
