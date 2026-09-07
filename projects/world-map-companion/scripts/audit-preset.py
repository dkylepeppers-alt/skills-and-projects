#!/usr/bin/env python3
"""Audit the uploaded preset against its immutable, independently pinned baseline.

This command never updates either input. Optional reports are separate artifacts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

PROJECT = Path(__file__).resolve().parents[1]
SOURCE = PROJECT / 'source/presets/ff54-agent-gating.original.marinara.json'
BASELINE = PROJECT / 'source/presets/ff54-baseline.json'
EXPECTED_BYTES = 187_861
EXPECTED_SHA256 = '43801992b7e07ffb24c0395f32ce87b4ea4f3a40aed929eb0462e3e41b7adc93'
BASELINE_SHA256 = 'e44c05139bde61779ac15402dab71d36c531fbd38f6adc2c338eba8f74c91de8'
COUNTS = {'sections': 69, 'groups': 12, 'choiceBlocks': 11, 'regexScripts': 25}


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_digest(value: Any) -> str:
    return digest(json.dumps(value, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode('utf-8'))


def audit(source_path: Path, baseline_path: Path) -> dict[str, Any]:
    raw = source_path.read_bytes()
    if len(raw) != EXPECTED_BYTES:
        raise ValueError(f'source has {len(raw)} bytes; expected {EXPECTED_BYTES}')
    if digest(raw) != EXPECTED_SHA256:
        raise ValueError('source does not match the archived SHA-256')
    baseline_raw = baseline_path.read_bytes()
    if digest(baseline_raw) != BASELINE_SHA256:
        raise ValueError('baseline does not match the archived SHA-256')
    source, baseline = json.loads(raw), json.loads(baseline_raw)
    data, preset = source['data'], source['data']['preset']
    records = {key: data[key] for key in ('sections', 'groups', 'choiceBlocks')}
    records['regexScripts'] = source['extensions']['regex_scripts']
    if {key: len(rows) for key, rows in records.items()} != COUNTS:
        raise ValueError('source collection counts differ from the baseline')
    if canonical_digest(preset) != baseline['presetHash']:
        raise ValueError('preset fields differ from the baseline')
    for key, rows in records.items():
        if len(rows) != len(baseline[key]):
            raise ValueError(f'{key} baseline count differs')
        for row, archived in zip(rows, baseline[key], strict=True):
            if (row['id'] != archived['id'] or list(row) != archived['fields'] or
                    canonical_digest(row) != archived['sha256_canonical_json']):
                raise ValueError(f'{key} record {row["id"]} differs from the baseline')
    disabled = []
    for row in data['sections']:
        marker = row.get('markerConfig')
        marker = json.loads(marker) if isinstance(marker, str) else marker
        if marker and marker.get('type') == 'agent_data' and row['enabled'] in (False, 'false'):
            disabled.append({'id': row['id'], 'name': row['name'],
                             'agentType': marker.get('agentType'), 'enabled': row['enabled']})
    if len(disabled) != 7:
        raise ValueError('disabled agent marker count differs from the baseline')
    return {
        'schemaVersion': 1,
        'purpose': 'Archive integrity and field accounting; runtime behavior is verified separately.',
        'archive': {'bytes': len(raw), 'sha256': digest(raw)},
        'baseline': {'sha256': digest(baseline_raw)},
        'counts': COUNTS,
        'defaultChoices': json.loads(preset['defaultChoices']),
        'disabledAgentMarkers': disabled,
        'records': {key: baseline[key] for key in records},
    }


def protects_input(output: Path, inputs: tuple[Path, ...]) -> bool:
    return any(output.resolve() == path.resolve() or
               (output.exists() and path.exists() and output.samefile(path))
               for path in inputs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, default=SOURCE)
    parser.add_argument('--baseline', type=Path, default=BASELINE)
    parser.add_argument('--output', type=Path, help='optional separate JSON report')
    args = parser.parse_args()
    try:
        # Protect canonical inputs even when alternate input paths were supplied.
        if args.output and protects_input(args.output, (args.source, args.baseline, SOURCE, BASELINE)):
            raise ValueError('output must not overwrite the source or baseline')
        report = audit(args.source, args.baseline)
        rendered = json.dumps(report, ensure_ascii=False, indent=2) + '\n'
        if args.output:
            args.output.write_text(rendered, encoding='utf-8')
        sys.stdout.write(rendered)
        return 0
    except (OSError, ValueError, KeyError, TypeError) as error:
        print(f'preset audit failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
