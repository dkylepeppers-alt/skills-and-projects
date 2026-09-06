#!/usr/bin/env python3
"""Assemble a working Nevermore map without overwriting an existing output."""
import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', default='build/Nevermore-rebuilt.world-map.json')
    args = parser.parse_args()
    output = (ROOT / args.out).resolve()
    build_root = (ROOT / 'build').resolve()
    if not output.is_relative_to(build_root):
        parser.error('Output must be under this project\'s build/ directory.')
    if output.exists():
        parser.error(f'Output already exists: {output}. Choose a new filename.')
    output.parent.mkdir(parents=True, exist_ok=True)
    commands = [
        [sys.executable, 'rebuild.py'],
        ['node', 'toolkit/build-pack.mjs', '--definition', 'source/map.json',
         '--images', 'art', '--pack', 'nevermore-map-pack',
         '--lorebook', 'source/revised-lore.marinara.json',
         '--lorebook', 'source/directories.marinara.json',
         '--links', 'source/lore-links.json', '--out', str(output)],
        [sys.executable, 'finalize.py', str(output)],
        ['node', 'toolkit/validate-map.mjs', str(output)],
    ]
    for command in commands:
        subprocess.run(command, cwd=ROOT, check=True)
    print(f'Built and checked: {output}')


if __name__ == '__main__':
    main()
