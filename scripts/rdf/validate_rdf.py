#!/usr/bin/env python3
"""
Validate all RDF Turtle files in the rdf/ directory using rdflib.
Exits non-zero if any file fails to parse.

Usage:
  python scripts/rdf/validate_rdf.py
"""
from pathlib import Path
import sys

from rdflib import Graph


def validate_ttl(ttl_path: Path) -> bool:
    g = Graph()
    try:
        g.parse(ttl_path.as_posix(), format="turtle")
        return True
    except Exception as e:
        print(f"ERROR: {ttl_path}: {e}")
        return False


def main() -> int:
    repo_root = Path(__file__).resolve().parents[2]
    rdf_dir = repo_root / "rdf"
    if not rdf_dir.exists():
        print(f"No rdf directory found at {rdf_dir}")
        return 1

    ttl_files = sorted(rdf_dir.rglob("*.ttl"))
    if not ttl_files:
        print("No .ttl files found in rdf/")
        return 0

    ok = True
    for p in ttl_files:
        result = validate_ttl(p)
        status = "OK" if result else "FAIL"
        print(f"[rdflib] {status} {p.relative_to(repo_root)}")
        ok = ok and result

    return 0 if ok else 2


if __name__ == "__main__":
    sys.exit(main())
