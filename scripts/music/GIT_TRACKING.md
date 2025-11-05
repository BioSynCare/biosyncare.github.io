# Git Tracking Strategy for scripts/music/

## What IS Tracked (committed to git)

### Source Code & Scripts
- ✓ `README.md` - Main documentation
- ✓ `WORKFLOW.md` - Detailed workflow guide
- ✓ `HANDOFF.md` - Technical handoff document
- ✓ `GIT_TRACKING.md` - This file
- ✓ `peal_renderer.py` - Format peal files
- ✓ `peal_to_audio.py` - Convert peals to audio
- ✓ `generate_sample_peals.py` - Generate sample peals
- ✓ `__init__.py` - Python package marker
- ✓ `.gitignore` - Ignore patterns

### Third-party Package
- ✓ `3p/music/` - ttm/music package (cloned from GitHub)
  - Full source code of the music synthesis library
  - Examples, tests, documentation
  - This allows other developers to have the package without installing it

### Directory Structure
- ✓ `peals/raw/.gitkeep` - Preserve directory
- ✓ `peals/rendered/.gitkeep` - Preserve directory
- ✓ `output/.gitkeep` - Preserve directory

## What is NOT Tracked (ignored)

### Generated Files
- ✗ `output/*.wav` - Generated audio files
- ✗ `output/*.mp3` - Generated audio files
- ✗ `peals/rendered/*_rendered.txt` - Formatted peal files
- ✗ `peals/rendered/index.json` - Generated index
- ✗ `peals/raw/*.txt` - Generated peal definitions
- ✗ `*.mid`, `*.midi` - MIDI files (if generated)

### Python Environment
- ✗ `.venv/` - Virtual environment (6000+ files)
- ✗ `__pycache__/` - Python bytecode cache
- ✗ `*.pyc`, `*.pyo`, `*.pyd` - Compiled Python files
- ✗ `*.egg-info/` - Package metadata

### Development Artifacts
- ✗ `.DS_Store` - macOS file system metadata
- ✗ `*.swp`, `*.swo`, `*~` - Editor temporary files
- ✗ `.vscode/`, `.idea/` - IDE configuration
- ✗ `*.log` - Log files

## Rationale

### Why track 3p/music/?
The ttm/music package is tracked because:
1. **Reproducibility** - Ensures everyone has the exact same version
2. **Offline development** - No need to clone from GitHub
3. **Modifications** - We can patch or extend the package locally
4. **Stability** - Pins to a specific commit, avoiding breaking changes

### Why ignore .venv/?
Virtual environments are NOT tracked because:
1. **Size** - Contains 6000+ files, ~200MB
2. **Platform-specific** - Compiled extensions differ by OS
3. **Regenerable** - Anyone can recreate it with `pip install -e 3p/music`
4. **Best practice** - Standard Python development practice

### Why ignore generated files?
Output files are NOT tracked because:
1. **Regenerable** - Can be created from source scripts anytime
2. **Large** - WAV files can be several MB each
3. **Ephemeral** - Testing/development artifacts, not deliverables
4. **Noise** - Would clutter git history with binary diffs

## Setting Up on a New Machine

When cloning this repository, developers need to:

```bash
cd scripts/music

# 1. Create virtual environment
python3 -m venv .venv

# 2. Activate it
source .venv/bin/activate

# 3. Install ttm/music package
pip install -e 3p/music

# 4. Verify installation
python -c "import music; print('Music package ready!')"

# 5. Generate samples (optional)
python generate_sample_peals.py
```

The `3p/music/` package is already present in git, so no external clone is needed.

## File Size Summary

```
Tracked in git:
- Scripts & docs:    ~50 KB
- 3p/music package:  ~2-3 MB
- Total tracked:     ~3 MB

Not tracked (local only):
- .venv:             ~200 MB
- Generated audio:   ~10-100 MB (depends on usage)
- Cache files:       ~1-5 MB
```

## Updating .gitignore

If you need to add more patterns:

1. **Local** - Edit `scripts/music/.gitignore` for music-specific ignores
2. **Global** - Edit `/.gitignore` for repository-wide patterns

Test your patterns with:
```bash
git check-ignore -v path/to/file
```

## Cleaning Generated Files

To remove all generated files and start fresh:

```bash
cd scripts/music

# Remove all ignored files (BE CAREFUL!)
git clean -Xdf

# Or selectively remove:
rm -rf output/*.wav
rm -rf peals/rendered/*.txt peals/rendered/*.json
rm -rf peals/raw/*.txt
```

The .gitkeep files will preserve the directory structure.
