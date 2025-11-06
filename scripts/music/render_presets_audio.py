#!/usr/bin/env python3
"""
Render reference WAV files for BioSynCare Lab audio presets.

These exports allow the web team to validate that the in-browser synthesis
matches the canonical tones generated with the ttm/music Python framework.
"""

from __future__ import annotations

import argparse
import math
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
        "settings": {"freq": 440.0, "gain": 0.2},
    },
    "binaural": {
        "filename": "preset_binaural_alpha.wav",
        "description": "Stereo alpha-range binaural beat (200Hz ± 5Hz).",
        "settings": {"base": 200.0, "beat": 10.0, "gain": 0.25},
    },
    "monaural": {
        "filename": "preset_monaural_theta.wav",
        "description": "Summed dual-tone theta monaural beat (210Hz ± 3Hz).",
        "settings": {"base": 210.0, "beat": 6.0, "gain": 0.3},
    },
    "isochronic": {
        "filename": "preset_isochronic_12hz.wav",
        "description": "Isochronic pulse: 180Hz carrier with 12Hz gating.",
        "settings": {"freq": 180.0, "pulseFreq": 12.0, "gain": 0.22},
    },
    "martigli": {
        "filename": "preset_martigli_harmonics.wav",
        "description": "Layered Martigli ratios atop a 220Hz fundamental.",
        "settings": {
            "fundamental": 220.0,
            "harmonics": [1, 1.5, 2, 3, 5, 8, 13],
            "gain": 0.14,
        },
    },
    "noise-white": {
        "filename": "preset_noise_white.wav",
        "description": "Broad-spectrum white noise.",
        "settings": {"color": "white", "gain": 0.18},
    },
    "noise-pink": {
        "filename": "preset_noise_pink.wav",
        "description": "1/f pink noise.",
        "settings": {"color": "pink", "gain": 0.18},
    },
    "noise-brown": {
        "filename": "preset_noise_brown.wav",
        "description": "Brownian noise emphasising low frequencies.",
        "settings": {"color": "brown", "gain": 0.22},
    },
}


def ensure_output_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def render_sine(output_path: Path, duration: float, sample_rate: int) -> None:
    settings = PRESET_DEFINITIONS["sine"]["settings"]
    audio = note(
        freq=settings["freq"],
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    audio = audio * settings["gain"]
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(50, 50))


def render_binaural(output_path: Path, duration: float, sample_rate: int) -> None:
    settings = PRESET_DEFINITIONS["binaural"]["settings"]
    base = settings["base"]
    beat = settings["beat"]
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
    stereo = np.vstack((left, right)) * settings["gain"]
    write_wav_stereo(stereo, filename=str(output_path), sample_rate=sample_rate, fades=(50, 50))


def render_monaural(output_path: Path, duration: float, sample_rate: int) -> None:
    settings = PRESET_DEFINITIONS["monaural"]["settings"]
    base = settings["base"]
    beat = settings["beat"]
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
    audio = audio * settings["gain"]
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(50, 50))


def render_isochronic(output_path: Path, duration: float, sample_rate: int) -> None:
    settings = PRESET_DEFINITIONS["isochronic"]["settings"]
    carrier_freq = settings["freq"]
    pulse_freq = settings["pulseFreq"]
    gain = settings["gain"]
    carrier = note(
        freq=carrier_freq,
        duration=duration,
        waveform_table=WAVEFORM_SINE,
        sample_rate=sample_rate,
    )
    samples = np.arange(carrier.size)
    square = np.sign(np.sin(2 * math.pi * pulse_freq * samples / sample_rate))
    envelope = 0.5 * (square + 1.0)
    audio = carrier * envelope * gain
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(100, 100))


def render_martigli(output_path: Path, duration: float, sample_rate: int) -> None:
    settings = PRESET_DEFINITIONS["martigli"]["settings"]
    fundamental = settings["fundamental"]
    harmonic_ratios = settings["harmonics"]
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
    audio = audio * settings["gain"]
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(120, 120))


def render_noise(output_path: Path, duration: float, sample_rate: int, color: str) -> None:
    settings = PRESET_DEFINITIONS[color]["settings"]
    audio = synth_noise(noise_type=settings["color"], duration=duration, sample_rate=sample_rate)
    audio = audio * settings["gain"]
    write_wav_mono(audio, filename=str(output_path), sample_rate=sample_rate, fades=(50, 50))


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
