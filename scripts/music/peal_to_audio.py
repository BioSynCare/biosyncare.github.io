#!/usr/bin/env python3
"""
Convert change-ringing peals to audio using the ttm/music package.

Audio rendering is intentionally gated behind `--allow-render` because BioSyncare
now synthesizes peals on the fly in the JavaScript audio engine. Use this tool
only when you explicitly need offline WAV exports.
"""

import argparse
from pathlib import Path
from typing import List, Optional

from music.structures.peals import PlainChanges
from music.legacy import Being


def parse_peal_file(path: Path) -> List[List[int]]:
    """Parse a peal definition file and return sequences as integer lists."""
    lines = path.read_text(encoding="utf-8").splitlines()
    sequences = []

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue

        # Convert "012" to [0, 1, 2]
        try:
            sequence = [int(c) for c in stripped]
            sequences.append(sequence)
        except ValueError:
            print(f"Warning: Skipping invalid row: {stripped}")
            continue

    return sequences


def generate_frequencies(num_bells: int, base_freq: float = 220.0) -> List[float]:
    """
    Generate bell frequencies using a harmonic series.

    Args:
        num_bells: Number of bells in the peal
        base_freq: Base frequency in Hz (default: A3 = 220Hz)

    Returns:
        List of frequencies for each bell
    """
    # Use a pentatonic scale for pleasant harmonies
    # Scale degrees: 1, 2, 3, 5, 6 (major pentatonic)
    scale_ratios = [1.0, 9/8, 5/4, 3/2, 5/3, 2.0, 9/4, 5/2, 3.0]

    frequencies = []
    for i in range(num_bells):
        ratio = scale_ratios[i % len(scale_ratios)]
        octave = i // len(scale_ratios)
        freq = base_freq * ratio * (2 ** octave)
        frequencies.append(freq)

    return frequencies


def peal_to_audio(
    peal_file: Path,
    output_file: Path,
    base_freq: float = 220.0,
    note_duration: float = 0.3,
    vibrato_freq: float = 0.0,
    vibrato_depth: float = 0.0,
) -> None:
    """
    Convert a peal definition file to an audio file.

    Args:
        peal_file: Path to peal definition file
        output_file: Path to output WAV file
        base_freq: Base frequency in Hz
        note_duration: Duration of each note in seconds
        vibrato_freq: Vibrato frequency in Hz (0 = no vibrato)
        vibrato_depth: Vibrato depth (0-1)
    """
    print(f"Reading peal: {peal_file}")
    sequences = parse_peal_file(peal_file)

    if not sequences:
        print("Error: No valid sequences found in peal file")
        return

    # Determine number of bells from first sequence
    num_bells = len(sequences[0])
    print(f"  {len(sequences)} rows, {num_bells} bells")

    # Generate bell frequencies
    bell_freqs = generate_frequencies(num_bells, base_freq)
    print(f"  Bell frequencies: {[f'{f:.1f}Hz' for f in bell_freqs]}")

    # Flatten sequences into frequency list
    # Each sequence becomes a set of simultaneous or sequential notes
    freqs = []
    for sequence in sequences:
        # Map each bell position to its frequency
        for bell_pos in sequence:
            if 0 <= bell_pos < len(bell_freqs):
                freqs.append(bell_freqs[bell_pos])

    print(f"  Total notes: {len(freqs)}")

    # Create Being synth and render
    print(f"Rendering audio to: {output_file}")
    being = Being()
    being.f_ = freqs

    # Add vibrato if requested
    if vibrato_freq > 0 and vibrato_depth > 0:
        being.fv_ = [vibrato_freq] * len(freqs)
        being.nu_ = [vibrato_depth] * len(freqs)

    # Set note durations
    being.d_ = [note_duration] * len(freqs)

    # Render to file
    being.render(len(freqs), str(output_file))
    print(f"✓ Audio rendered successfully")


def generate_peal_audio(
    nelements: int,
    nhunts: int,
    output_file: Path,
    base_freq: float = 220.0,
    note_duration: float = 0.3,
) -> None:
    """
    Generate a PlainChanges peal and render it directly to audio.

    Args:
        nelements: Number of bells
        nhunts: Number of hunt bells
        output_file: Path to output WAV file
        base_freq: Base frequency in Hz
        note_duration: Duration of each note in seconds
    """
    print(f"Generating {nelements}-bell peal with {nhunts} hunt bells")

    # Generate peal
    peal = PlainChanges(nelements=nelements, nhunts=nhunts)
    sequences = peal.act()

    print(f"  Generated {len(sequences)} rows")

    # Generate frequencies
    bell_freqs = generate_frequencies(nelements, base_freq)

    # Flatten to frequency list
    freqs = []
    for sequence in sequences:
        for bell_pos in sequence:
            freqs.append(bell_freqs[bell_pos])

    # Render
    print(f"Rendering to: {output_file}")
    being = Being()
    being.f_ = freqs
    being.d_ = [note_duration] * len(freqs)
    being.render(len(freqs), str(output_file))
    print(f"✓ Audio rendered successfully")


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Convert change-ringing peals to audio files."
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    # Subcommand: render from file
    render_parser = subparsers.add_parser(
        "render", help="Render a peal definition file to audio"
    )
    render_parser.add_argument(
        "input", type=Path, help="Path to peal definition file"
    )
    render_parser.add_argument(
        "output", type=Path, help="Path to output WAV file"
    )
    render_parser.add_argument(
        "--base-freq", type=float, default=220.0,
        help="Base frequency in Hz (default: 220.0)"
    )
    render_parser.add_argument(
        "--duration", type=float, default=0.3,
        help="Note duration in seconds (default: 0.3)"
    )
    render_parser.add_argument(
        "--vibrato-freq", type=float, default=0.0,
        help="Vibrato frequency in Hz (default: 0, no vibrato)"
    )
    render_parser.add_argument(
        "--vibrato-depth", type=float, default=0.0,
        help="Vibrato depth 0-1 (default: 0)"
    )
    render_parser.add_argument(
        "--allow-render",
        action="store_true",
        help="Explicitly allow WAV rendering (disabled by default for realtime engine)",
    )

    # Subcommand: generate peal and render
    generate_parser = subparsers.add_parser(
        "generate", help="Generate a PlainChanges peal and render to audio"
    )
    generate_parser.add_argument(
        "output", type=Path, help="Path to output WAV file"
    )
    generate_parser.add_argument(
        "--bells", type=int, default=4, help="Number of bells (default: 4)"
    )
    generate_parser.add_argument(
        "--hunts", type=int, default=1, help="Number of hunt bells (default: 1)"
    )
    generate_parser.add_argument(
        "--base-freq", type=float, default=220.0,
        help="Base frequency in Hz (default: 220.0)"
    )
    generate_parser.add_argument(
        "--duration", type=float, default=0.3,
        help="Note duration in seconds (default: 0.3)"
    )
    generate_parser.add_argument(
        "--allow-render",
        action="store_true",
        help="Explicitly allow WAV rendering (disabled by default for realtime engine)",
    )

    args = parser.parse_args(argv)

    if args.command == "render":
        if not args.allow_render:
            print(
                "Audio rendering disabled. Use --allow-render if you truly need to write WAV files.\n"
                "Realtime synthesis now happens in the JavaScript audio engine."
            )
            return 0
        if not args.input.exists():
            parser.error(f"Input file does not exist: {args.input}")

        peal_to_audio(
            args.input,
            args.output,
            base_freq=args.base_freq,
            note_duration=args.duration,
            vibrato_freq=args.vibrato_freq,
            vibrato_depth=args.vibrato_depth,
        )

    elif args.command == "generate":
        if not args.allow_render:
            print(
                "Audio rendering disabled. Use --allow-render if you truly need to write WAV files.\n"
                "Realtime synthesis now happens in the JavaScript audio engine."
            )
            return 0
        generate_peal_audio(
            args.bells,
            args.hunts,
            args.output,
            base_freq=args.base_freq,
            note_duration=args.duration,
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
