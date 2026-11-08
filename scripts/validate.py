#!/usr/bin/env python3
"""Validate tracked JSON, archived release bytes, and existing map tool tests."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT / 'projects/nevermore'
RELEASE = PROJECT / 'releases/v2'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def main():
    ignored = {'.git', 'node_modules', '.venv', '__pycache__', 'build'}
    count = 0
    for path in ROOT.rglob('*.json'):
        if ignored.intersection(path.relative_to(ROOT).parts):
            continue
        with path.open('rb') as stream:
            prefix = stream.read(80)
        require(not prefix.startswith(b'version https://git-lfs.github.com/spec/'),
                f'Missing LFS content: {path.relative_to(ROOT)}. Run git lfs pull.')
        json.loads(path.read_text(encoding='utf-8'))
        count += 1
    for name in ['marinara-engine-authoring', 'marinara-world-maps']:
        skill = (ROOT / 'skills' / name / 'SKILL.md').read_text(encoding='utf-8')
        require(skill.startswith('---\n') and f'name: {name}' in skill,
                f'Missing skill frontmatter: {name}')
    for line in (RELEASE / 'SHA256SUMS').read_text().splitlines():
        expected, relative = line.split('  ', 1)
        path = RELEASE / relative
        require(path.resolve().is_relative_to(RELEASE.resolve()), 'Invalid checksum path')
        digest = hashlib.sha256()
        with path.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        actual = digest.hexdigest()
        require(actual == expected, f'Archived release changed: {relative}')
    pack_path = RELEASE / 'Nevermore-Woodlands-Crypts-v2.world-map.json'
    pack = json.loads(pack_path.read_text(encoding='utf-8'))
    index = json.loads((PROJECT / 'source/global-index.json').read_text())['globalIndexIds']
    require(len(index) == len(set(index)) == 50, 'Global index must contain 50 unique IDs')
    require(len(pack['definition']['locations']) == 79, 'v2 must preserve 79 locations')
    require(len(pack['artwork']) == 82, 'v2 must preserve 82 embedded images')
    # This comparison guards the shipped snapshot; source work may intentionally change the index.
    release_index = json.loads((RELEASE / 'global-index.json').read_text())['globalIndexIds']
    require([loc['id'] for loc in pack['definition']['locations'][:50]] == release_index,
            'Archived v2 location order does not match its released index')
    subprocess.run(['node', '--test', 'skills/marinara-world-maps/tests/regression.test.mjs'], cwd=ROOT, check=True)
    subprocess.run(['node', 'skills/marinara-engine-authoring/scripts/test-extension-tools.mjs'], cwd=ROOT, check=True)
    subprocess.run(['node', '--test', 'projects/modern-life-sim-cheats/tests/cheats.test.mjs'], cwd=ROOT, check=True)
    subprocess.run(['node', 'skills/marinara-world-maps/scripts/validate-map.mjs', str(pack_path)], cwd=ROOT, check=True)
    print(f'PASS: {count} JSON files; both skills; release checksums; 79 locations; 82 images; extension tools; life sim cheats.')
    print('Scope: local structural and integrity checks. No live app import or upstream source check in this command.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        print(f'FAIL: {error}', file=sys.stderr)
        sys.exit(1)
