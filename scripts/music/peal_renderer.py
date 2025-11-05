#!/usr/bin/env python3
"""
Utilities for parsing and re-rendering change-ringing peal definition files.

The script is intentionally lightweight so it can evolve alongside the
musical tooling without introducing third-party dependencies. Each input
file is expected to contain one change per line (e.g., "12345678"), with
optional comments in the form `# key: value` or `# some note`.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional


@dataclass
class PealMetadata:
    """Lightweight metadata extracted from a peal source file."""

    title: str
    source: str
    rows: int
    stage: Optional[int] = None
    length_histogram: Dict[int, int] = field(default_factory=dict)
    comment: Optional[str] = None
    tags: List[str] = field(default_factory=list)


@dataclass
class Peal:
    """Parsed representation of a peal definition."""

    metadata: PealMetadata
    rows: List[str]

    def to_summary(self) -> Dict[str, object]:
        """Return a JSON-serializable summary."""
        return {
            "title": self.metadata.title,
            "source": self.metadata.source,
            "rows": self.metadata.rows,
            "stage": self.metadata.stage,
            "length_histogram": self.metadata.length_histogram,
            "tags": self.metadata.tags,
            "comment": self.metadata.comment,
        }


def parse_comment_line(line: str, meta: PealMetadata) -> None:
    """Extract key/value metadata from a comment line."""
    if ":" not in line:
        # free-form comment
        existing = meta.comment or ""
        meta.comment = f"{existing}\n{line}".strip()
        return

    key, value = line.split(":", 1)
    key = key.strip().lower()
    value = value.strip()

    if key == "title":
        meta.title = value
    elif key in {"tags", "tag"}:
        tags = [item.strip() for item in value.split(",") if item.strip()]
        meta.tags.extend(tag for tag in tags if tag not in meta.tags)
    elif key in {"note", "comment"}:
        existing = meta.comment or ""
        meta.comment = f"{existing}\n{value}".strip()
    elif key == "stage":
        try:
            meta.stage = int(value)
        except ValueError:
            pass
    elif key == "rows":
        try:
            meta.rows = int(value)
        except ValueError:
            pass


def parse_peal_file(path: Path, encoding: str = "utf-8") -> Peal:
    """Parse a peal definition file into a Peal object."""
    lines = path.read_text(encoding=encoding).splitlines()
    raw_rows: List[str] = []

    # Default metadata guesses
    default_title = path.stem.replace("_", " ").replace("-", " ").title()
    metadata = PealMetadata(
        title=default_title,
        source=path.name,
        rows=0,
    )

    for line in lines:
        stripped = line.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            parse_comment_line(stripped.lstrip("#").strip(), metadata)
            continue
        raw_rows.append(stripped)

    if not raw_rows:
        raise ValueError(f"No rows found in {path}")

    metadata.rows = len(raw_rows)
    length_histogram: Dict[int, int] = {}
    for row in raw_rows:
        length_histogram[len(row)] = length_histogram.get(len(row), 0) + 1
    metadata.length_histogram = dict(sorted(length_histogram.items()))
    if metadata.stage is None:
        # assume the most common row length represents the stage
        metadata.stage = max(length_histogram, key=length_histogram.get)

    return Peal(metadata=metadata, rows=raw_rows)


def render_plain_text(peal: Peal) -> str:
    """Render a peal as numbered plain text."""
    meta = peal.metadata
    header_lines = [
        f"Peal: {meta.title}",
        f"Source file: {meta.source}",
        f"Rows: {meta.rows}",
    ]
    if meta.stage:
        header_lines.append(f"Stage: {meta.stage}")
    if meta.tags:
        header_lines.append(f"Tags: {', '.join(meta.tags)}")
    if meta.comment:
        header_lines.append("Comment:")
        header_lines.extend(f"  {line}" for line in meta.comment.splitlines())

    header_lines.append(f"Generated: {datetime.now().isoformat(timespec='seconds')}")
    header_lines.append("")

    body_lines = []
    width = len(str(meta.rows))
    for index, row in enumerate(peal.rows, start=1):
        body_lines.append(f"{index:>{width}} | {row}")

    histogram_lines = []
    if meta.length_histogram:
        histogram_lines.append("")
        histogram_lines.append("Row length histogram:")
        for length, count in meta.length_histogram.items():
            histogram_lines.append(f"  {length}: {count}")

    return "\n".join(header_lines + body_lines + histogram_lines) + "\n"


def discover_input_files(input_dir: Path) -> Iterable[Path]:
    """Yield all .txt files under the input directory."""
    for path in sorted(input_dir.glob("*.txt")):
        if path.is_file():
            yield path


def write_output(text: str, output_path: Path, overwrite: bool = False) -> None:
    """Write rendered text to disk."""
    if output_path.exists() and not overwrite:
        raise FileExistsError(f"{output_path} already exists (use --overwrite to replace it)")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(text, encoding="utf-8")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Render change-ringing peal definition files into formatted output."
    )
    parser.add_argument(
        "--input",
        type=Path,
        required=True,
        help="Directory containing raw peal *.txt files.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="Directory where rendered files will be written.",
    )
    parser.add_argument(
        "--encoding",
        default="utf-8",
        help="File encoding for input peal files (default: utf-8).",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite existing rendered files if they already exist.",
    )
    return parser


def main(argv: Optional[List[str]] = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    input_dir: Path = args.input
    output_dir: Path = args.output

    if not input_dir.exists():
        parser.error(f"Input directory does not exist: {input_dir}")
    if not input_dir.is_dir():
        parser.error(f"Input path is not a directory: {input_dir}")

    output_dir.mkdir(parents=True, exist_ok=True)

    summaries = []
    for source_path in discover_input_files(input_dir):
        try:
            peal = parse_peal_file(source_path, encoding=args.encoding)
        except Exception as exc:  # pylint: disable=broad-except
            print(f"[WARN] Failed to parse {source_path}: {exc}", file=sys.stderr)
            continue

        rendered_text = render_plain_text(peal)
        destination = output_dir / f"{source_path.stem}_rendered.txt"
        try:
            write_output(rendered_text, destination, overwrite=args.overwrite)
        except FileExistsError as exc:
            print(f"[WARN] {exc}", file=sys.stderr)
            continue

        summaries.append(peal.to_summary())
        print(f"[OK] Rendered {source_path.name} -> {destination.name}")

    if summaries:
        index_path = output_dir / "index.json"
        index_path.write_text(json.dumps(summaries, indent=2), encoding="utf-8")
        print(f"[OK] Wrote summary index: {index_path}")
    else:
        print("[INFO] No peals were rendered.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
