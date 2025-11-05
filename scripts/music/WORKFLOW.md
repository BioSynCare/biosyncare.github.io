# Music Package Workflow

This document describes the complete workflow for working with change-ringing peals using the `scripts/music` toolkit and the `ttm/music` package.

## Setup

The environment is already configured with:

- **Virtual environment**: `.venv/` with Python 3.11
- **ttm/music package**: Installed in editable mode from `3p/music/`
- **Dependencies**: numpy, scipy, matplotlib, sympy, and audio processing libraries

To activate the environment:

```bash
cd scripts/music
source .venv/bin/activate
```

## Directory Structure

```
scripts/music/
├── 3p/
│   └── music/              # ttm/music package (cloned from GitHub)
├── peals/
│   ├── raw/                # Plain-text peal definitions
│   └── rendered/           # Formatted peal files + index.json
├── output/                 # Generated audio files
├── .venv/                  # Python virtual environment
├── README.md               # Package overview
├── WORKFLOW.md             # This file
├── peal_renderer.py        # Format peal definitions
├── peal_to_audio.py        # Convert peals to audio
└── generate_sample_peals.py # Generate example peals
```

## Workflow Steps

### 1. Generate Sample Peals

Use the `generate_sample_peals.py` script to create peal definition files from the PlainChanges algorithm:

```bash
python generate_sample_peals.py
```

This creates files in `peals/raw/` like:
- `plain_changes_3.txt` - 3-bell peal (6 rows)
- `plain_changes_4.txt` - 4-bell peal (24 rows)
- `plain_changes_5.txt` - 5-bell peal (120 rows)
- `plain_changes_6.txt` - 6-bell peal (120 rows)

Each file contains:
- Metadata as comments (title, stage, rows, comment)
- One row per line (e.g., "012", "102", "120")

### 2. Format and Inspect Peals

Use `peal_renderer.py` to create formatted, human-readable versions:

```bash
python peal_renderer.py --input peals/raw --output peals/rendered
```

This creates:
- Numbered versions of each peal in `peals/rendered/`
- `index.json` with metadata for all peals

Example rendered output:
```
Peal: Plain Changes on 4 Bells
Source file: plain_changes_4.txt
Rows: 24
Stage: 4
Comment:
  Classic 4-bell peal (Plain Bob Minimus)
Generated: 2025-11-05T18:19:35

 1 | 0123
 2 | 1023
 3 | 1203
...
```

### 3. Convert Peals to Audio

Use `peal_to_audio.py` to generate audio files from peals.

#### Option A: Render from a peal definition file

```bash
python peal_to_audio.py render peals/raw/plain_changes_4.txt output/my_peal.wav \
  --base-freq 220 \
  --duration 0.3 \
  --vibrato-freq 5.0 \
  --vibrato-depth 0.02
```

#### Option B: Generate and render a new peal

```bash
python peal_to_audio.py generate output/custom_peal.wav \
  --bells 5 \
  --hunts 2 \
  --base-freq 440 \
  --duration 0.25
```

Parameters:
- `--base-freq`: Base frequency in Hz (default: 220.0 / A3)
- `--duration`: Note duration in seconds (default: 0.3)
- `--bells`: Number of bells (for generate command)
- `--hunts`: Number of hunt bells (for generate command)
- `--vibrato-freq`: Vibrato frequency in Hz (optional)
- `--vibrato-depth`: Vibrato depth 0-1 (optional)

## Using the ttm/music Package Directly

### Basic Peal Generation

```python
from music.structures.peals import PlainChanges

# Generate a 4-bell peal
peal = PlainChanges(nelements=4, nhunts=1)

# Get the sequences
sequences = peal.act()
print(f"Generated {len(sequences)} rows")

# Print with colored output
from music.structures.symmetry import print_peal
print_peal(sequences, hunts=[0])
```

### Audio Synthesis

```python
from music.legacy import Being

# Create synth
being = Being()

# Set frequencies for each note
being.f_ = [220, 440, 330, 440]  # Hz

# Set durations
being.d_ = [0.5, 0.5, 0.5, 0.5]  # seconds

# Render to WAV
being.render(4, 'output.wav')
```

### Campanology (Change Ringing with Audio)

```python
from music.structures.peals import PlainChanges
from music.legacy import Being

# Generate 3-bell peal
pe3 = PlainChanges(3)
sequences = pe3.act([220, 440, 330])  # Map bells to frequencies

# Flatten sequences to frequency list
freqs = sum(sequences, [])

# Render audio
being = Being()
being.f_ = freqs
being.render(len(freqs), 'campanology.wav')
```

## Key Concepts

### Change Ringing

Change ringing is a mathematical and musical art form where bells are rung in permutations:
- **Stage**: Number of bells (3, 4, 5, 6, etc.)
- **Row**: A complete permutation of the bells
- **Peal**: A sequence of rows that returns to the starting position
- **Hunt bell**: A bell that follows a regular pattern through the sequence

### Plain Changes Algorithm

The `PlainChanges` class generates peals using specific rules:
- Bells can only swap with adjacent neighbors
- Hunt bells follow predictable patterns up and down
- The sequence is "true" (no repeated rows except start/end)

### Audio Mapping

Our scripts map bell positions to frequencies using a pentatonic scale:
- Harmonic and pleasant to listen to
- Each bell gets a distinct frequency
- Higher stage = wider frequency range

## Advanced Usage

### Custom Frequency Mappings

Edit `peal_to_audio.py` to customize the `generate_frequencies()` function:

```python
def generate_frequencies(num_bells: int, base_freq: float = 220.0) -> List[float]:
    # Example: Use chromatic scale instead of pentatonic
    semitone_ratio = 2 ** (1/12)
    return [base_freq * (semitone_ratio ** i) for i in range(num_bells)]
```

### Integration with BioSynCare

The generated audio can be used in the BioSynCare audiovisual interface:
1. Generate peal audio with specific parameters
2. Load the WAV file in the web interface
3. Synchronize with visual patterns or breathing controls

### Batch Processing

Process multiple peals at once:

```bash
for peal in peals/raw/*.txt; do
  basename=$(basename "$peal" .txt)
  python peal_to_audio.py render "$peal" "output/${basename}.wav" --duration 0.2
done
```

## Troubleshooting

### Import Errors

If you see import errors, make sure the virtual environment is activated:
```bash
source .venv/bin/activate
```

### Audio Not Playing

The scripts generate WAV files. Use any audio player:
```bash
# macOS
afplay output/simple_peal.wav

# Linux
aplay output/simple_peal.wav

# Or use VLC, audacity, etc.
```

### Permission Errors

Make scripts executable:
```bash
chmod +x *.py
```

## Resources

- **ttm/music GitHub**: https://github.com/ttm/music
- **ttm/music Documentation**: See `3p/music/README.md`
- **Change Ringing Reference**: http://www.gutenberg.org/files/18567/18567-h/18567-h.htm
- **MASS Framework**: https://github.com/ttm/mass/

## Contributing

When adding new features:
1. Keep dependencies in `3p/` directory
2. Update this workflow document
3. Add examples to demonstrate new functionality
4. Test with the provided sample peals
