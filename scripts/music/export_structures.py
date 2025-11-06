#!/usr/bin/env python3
"""
Generate change-ringing pattern data and permutation symmetry summaries for the
BioSyncare JavaScript audio engine.

The script parses the plain-text peal definitions in `peals/raw/`, analyses the
permutations between rows, and emits a structured JavaScript module with:

- Detailed change-ringing libraries (rows, transitions, metrics)
- Aggregated permutation families (unique transitions across peals)
- Symmetric group summaries (cycle types, canonical generators, samples)
"""

from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from itertools import permutations
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple


ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parents[1]
RAW_PEALS_DIR = ROOT / "peals" / "raw"
DATA_DIR = REPO_ROOT / "src" / "data"
OUTPUT_FILE = DATA_DIR / "musicStructures.js"


def parse_peal_file(path: Path) -> Dict:
    """Parse a plain changes peal file and return metadata + rows."""
    metadata: Dict[str, object] = {}
    rows: List[str] = []

    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            payload = stripped.lstrip("#").strip()
            if ":" in payload:
                key, value = payload.split(":", 1)
                key = key.strip().lower()
                value = value.strip()
                if key in {"stage", "rows"}:
                    try:
                        metadata[key] = int(value)
                    except ValueError:
                        metadata[key] = value
                else:
                    metadata[key] = value
            continue

        rows.append(stripped)

    if not rows:
        raise ValueError(f"No rows found in {path}")

    stage = metadata.get("stage")
    if stage is None:
        stage = len(rows[0])
    elif isinstance(stage, int):
        expected_len = len(rows[0])
        if stage != expected_len:
            raise ValueError(f"Stage mismatch in {path}: metadata {stage} vs row length {expected_len}")
    else:
        # Stage was a string that couldn't be coerced; fall back to row length.
        metadata["stage"] = stage
        stage = len(rows[0])

    return {
        "metadata": metadata,
        "rows": rows,
        "stage": int(stage),
    }


def permutation_cycles(perm: Sequence[int]) -> List[List[int]]:
    """Return permutation cycles (including fixed points) for a permutation."""
    visited = set()
    cycles: List[List[int]] = []
    for start in range(len(perm)):
        if start in visited:
            continue
        cycle = []
        current = start
        while current not in visited:
            visited.add(current)
            cycle.append(current)
            current = perm[current]
        cycles.append(cycle)
    return cycles


def permutation_parity(perm: Sequence[int]) -> str:
    """Return 'even' or 'odd' parity of a permutation represented in one-line form."""
    inversions = 0
    length = len(perm)
    for i in range(length):
        for j in range(i + 1, length):
            if perm[i] > perm[j]:
                inversions += 1
    return "even" if inversions % 2 == 0 else "odd"


def permutation_sign(parity: str) -> int:
    return 1 if parity == "even" else -1


def cycle_signature_from_cycles(cycles: Sequence[Sequence[int]]) -> str:
    lengths = sorted((len(c) for c in cycles), reverse=True)
    return "-".join(str(length) for length in lengths)


def describe_permutation(perm: Sequence[int]) -> Dict:
    perm_list = list(perm)
    cycles = permutation_cycles(perm_list)
    parity = permutation_parity(perm_list)
    return {
        "permutation": perm_list,
        "cycles": cycles,
        "cycleSignature": cycle_signature_from_cycles(cycles),
        "parity": parity,
        "sign": permutation_sign(parity),
    }


def extract_hunt_bells(comment: object) -> int | None:
    if not isinstance(comment, str):
        return None
    match = re.search(r"(\d+)\s+hunt", comment)
    if match:
        try:
            return int(match.group(1))
        except ValueError:
            return None
    return None


def count_inversions(perm: Sequence[int]) -> int:
    inversions = 0
    length = len(perm)
    for i in range(length):
        for j in range(i + 1, length):
            if perm[i] > perm[j]:
                inversions += 1
    return inversions


def classify_transition(prev_perm: Sequence[int], next_perm: Sequence[int]) -> Dict:
    stage = len(prev_perm)
    position_perm = [0] * stage
    bell_perm = [0] * stage
    movements: List[Dict] = []
    movement_counts = Counter({"up": 0, "down": 0, "stay": 0})
    distance_counts = Counter()
    adjacent_only = True
    swap_pairs: List[List[int]] = []
    visited_swaps = set()

    for pos, bell in enumerate(prev_perm):
        target_pos = next_perm.index(bell)
        position_perm[pos] = target_pos
        bell_perm[bell] = target_pos
        distance = target_pos - pos
        if abs(distance) > 1:
            adjacent_only = False
        direction = "stay"
        if distance < 0:
            direction = "up"
        elif distance > 0:
            direction = "down"

        movement_counts[direction] += 1
        distance_counts[str(distance)] += 1
        movements.append(
            {
                "bell": bell,
                "from": pos,
                "to": target_pos,
                "distance": distance,
                "direction": direction,
            }
        )

    for idx, target in enumerate(position_perm):
        if idx in visited_swaps or target == idx:
            continue
        if position_perm[target] == idx:
            pair = [min(idx, target), max(idx, target)]
            if pair not in swap_pairs:
                swap_pairs.append(pair)
            visited_swaps.add(idx)
            visited_swaps.add(target)

    cycles = permutation_cycles(position_perm)
    parity = permutation_parity(position_perm)

    return {
        "positionPermutation": position_perm,
        "bellPermutation": bell_perm,
        "cycles": cycles,
        "cycleSignature": cycle_signature_from_cycles(cycles),
        "parity": parity,
        "sign": permutation_sign(parity),
        "adjacentOnly": adjacent_only,
        "swapPairs": swap_pairs,
        "movements": movements,
        "movementCounts": dict(movement_counts),
        "distanceCounts": dict(distance_counts),
    }


def build_change_ringing_library() -> List[Dict]:
    structures: List[Dict] = []

    for path in sorted(RAW_PEALS_DIR.glob("*.txt")):
        parsed = parse_peal_file(path)
        metadata = parsed["metadata"]
        rows = parsed["rows"]
        stage = parsed["stage"]

        structure_id = path.stem.replace("-", "_")
        title = metadata.get("title") or structure_id.replace("_", " ").title()
        comment = metadata.get("comment")
        hunt_bells = extract_hunt_bells(comment)

        row_details: List[Dict] = []
        row_parity_counts = Counter({"even": 0, "odd": 0})

        for index, row in enumerate(rows):
            perm = [int(char) for char in row]
            cycles = permutation_cycles(perm)
            parity = permutation_parity(perm)
            row_parity_counts[parity] += 1
            row_details.append(
                {
                    "index": index,
                    "notation": row,
                    "permutation": perm,
                    "cycles": cycles,
                    "cycleSignature": cycle_signature_from_cycles(cycles),
                    "parity": parity,
                    "sign": permutation_sign(parity),
                    "inversionCount": count_inversions(perm),
                    "isIdentity": perm == list(range(stage)),
                }
            )

        transitions: List[Dict] = []
        transition_parity_counts = Counter({"even": 0, "odd": 0})
        unique_position_perms: Dict[Tuple[int, ...], Dict] = {}
        movement_hist = Counter({"up": 0, "down": 0, "stay": 0})
        distance_hist: Counter = Counter()
        swap_hist = Counter()
        adjacent_only_global = True

        for idx in range(len(row_details) - 1):
            current_perm = row_details[idx]["permutation"]
            next_perm = row_details[idx + 1]["permutation"]
            transition = classify_transition(current_perm, next_perm)
            transition.update(
                {
                    "index": idx,
                    "from": row_details[idx]["notation"],
                    "to": row_details[idx + 1]["notation"],
                }
            )
            transitions.append(transition)
            transition_parity_counts[transition["parity"]] += 1
            adjacent_only_global = adjacent_only_global and transition["adjacentOnly"]

            for direction, count in transition["movementCounts"].items():
                movement_hist[direction] += count

            for distance, count in transition["distanceCounts"].items():
                distance_hist[distance] += count

            for pair in transition["swapPairs"]:
                swap_hist[f"{pair[0]}-{pair[1]}"] += 1

            key = tuple(transition["positionPermutation"])
            if key not in unique_position_perms:
                unique_position_perms[key] = {
                    "permutation": transition["positionPermutation"],
                    "cycles": transition["cycles"],
                    "cycleSignature": transition["cycleSignature"],
                    "parity": transition["parity"],
                    "sign": transition["sign"],
                    "swapPairs": transition["swapPairs"],
                    "adjacentOnly": transition["adjacentOnly"],
                    "count": 0,
                }
            unique_position_perms[key]["count"] += 1

        structure = {
            "id": structure_id,
            "family": "plain_changes",
            "title": title,
            "stage": stage,
            "rows": len(rows),
            "huntBells": hunt_bells,
            "sourceFile": str(path.relative_to(REPO_ROOT)),
            "metadata": metadata,
            "rowsDetail": row_details,
            "transitions": transitions,
            "summary": {
                "rowParityCounts": dict(row_parity_counts),
                "transitionParityCounts": dict(transition_parity_counts),
                "adjacentOnly": adjacent_only_global,
                "uniquePositionPermutations": list(unique_position_perms.values()),
                "movementHistogram": dict(movement_hist),
                "distanceHistogram": dict(distance_hist),
                "swapPairHistogram": dict(swap_hist),
            },
        }

        structures.append(structure)

    return structures


def build_permutation_families(structures: Iterable[Dict]) -> List[Dict]:
    families: Dict[Tuple[int, ...], Dict] = {}

    for structure in structures:
        stage = structure["stage"]
        structure_id = structure["id"]
        unique_perms = structure["summary"]["uniquePositionPermutations"]

        for entry in unique_perms:
            key = tuple(entry["permutation"])
            family = families.get(key)
            if family is None:
                family = {
                    "id": f"perm_{''.join(str(x) for x in key)}",
                    "positionPermutation": entry["permutation"],
                    "cycles": entry["cycles"],
                    "cycleSignature": entry["cycleSignature"],
                    "parity": entry["parity"],
                    "sign": entry["sign"],
                    "swapPairs": entry["swapPairs"],
                    "adjacentOnly": entry["adjacentOnly"],
                    "occurrenceCount": 0,
                    "stages": set(),
                    "structures": [],
                }
                families[key] = family

            family["occurrenceCount"] += entry["count"]
            family["stages"].add(stage)
            family["structures"].append(
                {
                    "id": structure_id,
                    "stage": stage,
                    "count": entry["count"],
                }
            )

    family_list: List[Dict] = []
    for entry in families.values():
        entry["stages"] = sorted(entry["stages"])
        family_list.append(entry)

    # Sort by cycle signature then id for stability
    family_list.sort(key=lambda item: (item["cycleSignature"], item["id"]))
    return family_list


def build_symmetric_group_catalog(stages: Iterable[int], samples_per_cycle: int = 3) -> List[Dict]:
    catalog: List[Dict] = []

    for stage in sorted(set(stages)):
        order = math.factorial(stage)
        cycle_counter: Counter = Counter()
        cycle_samples: Dict[str, List[Dict]] = defaultdict(list)
        parity_counts = Counter({"even": 0, "odd": 0})

        for perm_tuple in permutations(range(stage)):
            perm = list(perm_tuple)
            cycles = permutation_cycles(perm)
            parity = permutation_parity(perm)
            signature = cycle_signature_from_cycles(cycles)

            parity_counts[parity] += 1
            cycle_counter[signature] += 1
            if len(cycle_samples[signature]) < samples_per_cycle:
                cycle_samples[signature].append(
                    {
                        "permutation": perm,
                        "cycles": cycles,
                        "parity": parity,
                        "sign": permutation_sign(parity),
                    }
                )

        canonical_generators: List[Dict] = []

        # Identity element
        identity = list(range(stage))
        canonical_generators.append(
            {
                "label": "identity",
                "description": "Neutral element",
                **describe_permutation(identity),
            }
        )

        # Adjacent transpositions
        for index in range(stage - 1):
            perm = list(range(stage))
            perm[index], perm[index + 1] = perm[index + 1], perm[index]
            canonical_generators.append(
                {
                    "label": f"swap_{index}_{index + 1}",
                    "description": "Adjacent transposition",
                    **describe_permutation(perm),
                }
            )

        # Long cycle (rotating bells)
        if stage > 2:
            perm = list(range(1, stage)) + [0]
            canonical_generators.append(
                {
                    "label": "long_cycle",
                    "description": "Cyclic shift (0→1→…→0)",
                    **describe_permutation(perm),
                }
            )

        # Reversal symmetry
        if stage > 1:
            perm = list(reversed(range(stage)))
            canonical_generators.append(
                {
                    "label": "reverse",
                    "description": "Order reversal",
                    **describe_permutation(perm),
                }
            )

        cycle_type_samples = [
            {
                "cycleSignature": signature,
                "count": cycle_counter[signature],
                "samples": cycle_samples[signature],
            }
            for signature in sorted(cycle_counter.keys())
        ]

        catalog.append(
            {
                "stage": stage,
                "label": f"S_{stage}",
                "order": order,
                "parityCounts": dict(parity_counts),
                "cycleTypeCounts": dict(cycle_counter),
                "cycleTypeSamples": cycle_type_samples,
                "canonicalGenerators": canonical_generators,
            }
        )

    return catalog


def main() -> None:
    if not RAW_PEALS_DIR.exists():
        raise SystemExit(f"Missing peal directory: {RAW_PEALS_DIR}")

    DATA_DIR.mkdir(parents=True, exist_ok=True)

    library = build_change_ringing_library()
    permutation_families = build_permutation_families(library)
    catalog = build_symmetric_group_catalog([item["stage"] for item in library])

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "scripts/music/export_structures.py",
        "changeRingingLibrary": library,
        "permutationFamilies": permutation_families,
        "symmetricGroupCatalog": catalog,
    }

    js_content = (
        "// Auto-generated by scripts/music/export_structures.py\n"
        "// Do not edit this file by hand; re-run the exporter instead.\n\n"
        f"export const musicStructures = {json.dumps(payload, indent=2)};\n\n"
        "export const changeRingingLibrary = musicStructures.changeRingingLibrary;\n"
        "export const permutationFamilies = musicStructures.permutationFamilies;\n"
        "export const symmetricGroupCatalog = musicStructures.symmetricGroupCatalog;\n"
        "export const musicStructuresGeneratedAt = musicStructures.generatedAt;\n\n"
        "export default musicStructures;\n"
    )

    OUTPUT_FILE.write_text(js_content, encoding="utf-8")
    print(f"[OK] Wrote structured data to {OUTPUT_FILE.relative_to(REPO_ROOT)}")


if __name__ == "__main__":
    main()
