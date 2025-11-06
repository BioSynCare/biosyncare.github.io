"""
Utility helpers for reading shared preset definitions.

These JSON files live under `src/data/presets/` so that both the web bundle and
the Python tooling consume the exact same values.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional


ROOT = Path(__file__).resolve().parents[2]  # repo root
DATA_DIR = ROOT / "src" / "data" / "presets"


def _read_json(path: Path) -> Dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


@dataclass(frozen=True)
class AudioPreset:
    id: str
    label: str
    category: str
    defaults: Dict[str, Any]


@dataclass(frozen=True)
class SessionVoice:
    presetId: str
    label: str
    startOffsetSec: float
    durationSec: float
    gain: float
    params: Dict[str, Any]
    martigli: Dict[str, Any]


@dataclass(frozen=True)
class SymmetryTrack:
    enabled: bool
    patternId: Optional[str]
    baseFrequency: Optional[float]
    division: Optional[int]
    scale: Optional[Dict[str, Any]]
    bellMapping: Optional[str]
    customFrequencies: Optional[List[float]]
    gain: Optional[float]
    martigli: Dict[str, Any]


@dataclass(frozen=True)
class SessionPreset:
    id: str
    label: str
    description: str
    startUtc: Optional[str]
    totalDurationSec: float
    loop: bool
    voices: List[SessionVoice]
    symmetryTrack: SymmetryTrack
    metadata: Dict[str, Any]


def load_audio_presets() -> List[AudioPreset]:
    payload = _read_json(DATA_DIR / "audio-presets.json")
    presets = []
    for entry in payload.get("presets", []):
        presets.append(
            AudioPreset(
                id=entry["id"],
                label=entry.get("label", entry["id"]),
                category=entry.get("category", "core"),
                defaults=entry.get("defaults", {}),
            )
        )
    return presets


def load_session_presets() -> List[SessionPreset]:
    payload = _read_json(DATA_DIR / "session-presets.json")
    sessions: List[SessionPreset] = []
    for entry in payload.get("sessions", []):
        voices = [
            SessionVoice(
                presetId=voice["presetId"],
                label=voice.get("label", voice["presetId"]),
                startOffsetSec=float(voice.get("startOffsetSec", 0)),
                durationSec=float(voice.get("durationSec", 0)),
                gain=float(voice.get("gain", 0)),
                params=voice.get("params", {}),
                martigli=voice.get("martigli", {}),
            )
            for voice in entry.get("voices", [])
        ]

        symmetry = entry.get("symmetryTrack", {}) or {}
        symmetry_track = SymmetryTrack(
            enabled=bool(symmetry.get("enabled", False)),
            patternId=symmetry.get("patternId"),
            baseFrequency=symmetry.get("baseFrequency"),
            division=symmetry.get("division"),
            scale=symmetry.get("scale"),
            bellMapping=symmetry.get("bellMapping"),
            customFrequencies=symmetry.get("customFrequencies"),
            gain=symmetry.get("gain"),
            martigli=symmetry.get("martigli", {}),
        )

        sessions.append(
            SessionPreset(
                id=entry["id"],
                label=entry.get("label", entry["id"]),
                description=entry.get("description", ""),
                startUtc=entry.get("startUtc"),
                totalDurationSec=float(entry.get("totalDurationSec", 0)),
                loop=bool(entry.get("loop", False)),
                voices=voices,
                symmetryTrack=symmetry_track,
                metadata=entry.get("metadata", {}),
            )
        )
    return sessions


if __name__ == "__main__":
    audio = load_audio_presets()
    sessions = load_session_presets()
    print(f"Loaded {len(audio)} audio presets and {len(sessions)} session presets.")
