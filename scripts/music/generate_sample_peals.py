#!/usr/bin/env python3
"""
Generate sample peal files using the ttm/music package.

This script creates plain-text peal definition files that can be rendered
using peal_renderer.py.
"""

from pathlib import Path
from music.structures.peals import PlainChanges

def save_peal(peal_obj, filename, title, comment=""):
    """Save a peal object to a plain text file."""
    output_dir = Path("peals/raw")
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / filename

    # Act the peal on its natural domain to get the sequences
    sequences = peal_obj.act()

    with open(output_path, 'w') as f:
        # Write metadata as comments
        f.write(f"# title: {title}\n")
        f.write(f"# stage: {peal_obj.nelements}\n")
        f.write(f"# rows: {len(sequences)}\n")
        if comment:
            f.write(f"# comment: {comment}\n")
        f.write("\n")

        # Write each sequence/row
        for sequence in sequences:
            # Convert [0,1,2,3] to "0123" format
            row = ''.join(str(i) for i in sequence)
            f.write(f"{row}\n")

    print(f"Generated: {output_path} ({len(sequences)} rows)")

def main():
    """Generate various sample peals."""

    print("Generating sample peals...")
    print()

    # 3-bell plain changes
    pc3 = PlainChanges(nelements=3, nhunts=1)
    save_peal(
        pc3,
        "plain_changes_3.txt",
        "Plain Changes on 3 Bells",
        "Basic 3-bell peal with 1 hunt bell"
    )

    # 4-bell plain changes
    pc4 = PlainChanges(nelements=4, nhunts=1)
    save_peal(
        pc4,
        "plain_changes_4.txt",
        "Plain Changes on 4 Bells",
        "Classic 4-bell peal (Plain Bob Minimus)"
    )

    # 5-bell plain changes
    pc5 = PlainChanges(nelements=5, nhunts=2)
    save_peal(
        pc5,
        "plain_changes_5.txt",
        "Plain Changes on 5 Bells",
        "5-bell peal with 2 hunt bells (Plain Bob Doubles)"
    )

    # 6-bell plain changes
    pc6 = PlainChanges(nelements=6, nhunts=2)
    save_peal(
        pc6,
        "plain_changes_6.txt",
        "Plain Changes on 6 Bells",
        "6-bell peal with 2 hunt bells (Plain Bob Minor)"
    )

    print()
    print("Sample peals generated successfully!")
    print("Run peal_renderer.py to create formatted versions:")
    print("  python peal_renderer.py --input peals/raw --output peals/rendered")

if __name__ == "__main__":
    main()
