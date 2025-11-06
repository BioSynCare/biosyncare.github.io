#!/usr/bin/env python3
"""
Render reference WAV files for BioSynCare Lab audio presets.

These exports allow the web team to validate that the in-browser synthesis
matches the canonical tones generated with the ttm/music Python framework.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from music.core.io import write_wav_mono, write_wav_stereo
from music.core.synths.noises import noise as synth_noise
from music.core.synths.notes import note
from music.utils import WAVEFORM_SINE


PRESET_DEFINITIONS = {
    "sine": {
        "filename": "preset_sine.wav",
        "description": "Pure 440Hz sine tone (calibration reference).",
    },
    "binaural": {
        "filename": "preset_binaural_alpha.wav",
        "description": "Stereo alpha-range binaural beat (200Hz ± 5Hz).",
    },
    "monaural": {
        "filename": "preset_monaural_theta.wav",
        "description": "Summed dual-tone theta monaural beat (210Hz ± 3Hz).",
    },
    "isochronic": {
        "filename": "preset_isochronic_12hz.wav",
        "description": "Isochronic pulse: 180Hz carrier with 12Hz gating.",
    },
    "martigli": {
        "filename": "preset_martigli_harmonics.wav",
        "description": "Layered Martigli ratios atop a 220Hz fundamental.",
    },
    "noise-white": {
        "filename": "preset_noise_white.wav",
        "description": "Broad-spectrum white noise.",
    },
    "noise-pink": {
        "filename": "preset_noise_pink.wav",
        "description": "1/f pink noise.",
    },
    "noise-brown": {
        "filename": "preset_noise_brown.wav",
        "description": "Brownian noise emphasising low frequencies.",
    },
}


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def render_sine(output_path: Path, duration: float, sample_rate: int) -> None:
    audio = note(
        freq=440,
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(20, 20))


def render_binaural(output_path: Path, duration: float, sample_rate: int) -> None:
    base = 200.0
    beat = 10.0
    left = note(
        freq=base - beat / 2,
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    right = note(
        freq=base + beat / 2,
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    stereo = np.vstack((left, right))
    write_wav_stereo(stereo, filename=str(output_path), sample_rate=sample_rate, fades=(20, 20))


def render_monaural(output_path: Path, duration: float, sample_rate: int) -> None:
    base = 210.0
    beat = 6.0
    low = note(
        freq=base - beat / 2,
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    high = note(
        freq=base + beat / 2,
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    audio = 0.5 * (low + high)
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(20, 20))


def render_isochronic(output_path: Path, duration: float, sample_rate: int) -> None:
    carrier_freq = 180.0
    pulse_freq = 12.0
    carrier = note(
        freq=carrier_freq,
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    samples = np.arange(carrier.size)
    envelope = (np.sin(2 * np.pi * pulse_freq * (samples / sample_rate)) > 0).astype(float)
    audio = carrier * envelope
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(20, 20))


def render_martigli(output_path: Path, duration: float, sample_rate: int) -> None:
    fundamental = 220.0
    harmonic_ratios = [1, 1.5, 2, 3, 5, 8, 13]
    layers = []
    for idx, ratio in enumerate(harmonic_ratios, start=1):
        partial = note(
            freq=fundamental * ratio,
            duration=duration,
            waveform_table=WAVEFORM_SINE,
            sample_rate=sample_rate,
        )
        layers.append(partial / idx)
    audio = np.sum(layers, axis=0)
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(40, 40))


def render_noise(output_path: Path, duration: float, sample_rate: int, color: str) -> None:
    audio = synth_noise(noise_type=color.split("-")[-1], duration=duration, sample_rate=sample_rate)
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(10, 10))


RENDERERS = {
    "sine": render_sine,
    "binaural": render_binaural,
    "monaural": render_monaural,
    "isochronic": render_isochronic,
    "martigli": render_martigli,
    "noise-white": lambda path, duration, sr: render_noise(path, duration, sr, "noise-white"),
    "noise-pink": lambda path, duration, sr: render_noise(path, duration, sr, "noise-pink"),
    "noise-brown": lambda path, duration, sr: render_noise(path, duration, sr, "noise-brown"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Render BioSynCare audio preset reference WAV files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("scripts/music/output/presets"),
        help="Directory where WAV files will be written (default: scripts/music/output/presets)",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=10.0,
        help="Duration of each preset render in seconds (default: 10.0)",
    )
    parser.add_argument(
        "--sample-rate",
        type=int,
        default=44100,
        help="Sample rate in Hz (default: 44100)",
    )
    parser.add_argument(
        "--presets",
        nargs="*",
        choices=sorted(PRESET_DEFINITIONS.keys()),
        default=sorted(PRESET_DEFINITIONS.keys()),
        help="Subset of presets to render (default: all)",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ensure_output_dir(args.output)

    for preset_key in args.presets:
        definition = PRESET_DEFINITIONS[preset_key]
        filename = args.output / definition["filename"]
        print(f"[render] {preset_key:12s} -> {filename.name}")
        if preset_key.startswith("noise-"):
            RENDERERS[preset_key](filename, args.duration, args.sample_rate)
        else:
            RENDERERS[preset_key](filename, args.duration, args.sample_rate)
    print(f"[done] Wrote {len(args.presets)} preset WAV file(s) to {args.output}")


if __name__ == "__main__":
    main()
