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
EXPECTED_WRAP_FORMAT = 'none'
EXPECTED_DISABLED_AGENT_MARKERS = [
    {'id': 'qbBXq2fx1R4ois3mSWtQ4', 'name': 'Persona Stats (Agent)',
     'agentType': 'persona-stats', 'enabled': 'false'},
    {'id': 'mVFgjDwXZPmwK1v31jTpT', 'name': 'Character Tracker (Agent)',
     'agentType': 'character-tracker', 'enabled': 'false'},
    {'id': 'ZDrz_C7-R4VNy5zYuMQ1t', 'name': 'Custom Tracker (Agent)',
     'agentType': 'custom-tracker', 'enabled': 'false'},
    {'id': 'oxqE6DBUlcLY3k0n4wvMB', 'name': 'Beholder (Agent)',
     'agentType': 'beholder', 'enabled': 'false'},
    {'id': 'R31nXEzlHyVSQQcxOsym_', 'name': 'Quest Tracker (Agent)',
     'agentType': 'quest', 'enabled': 'false'},
    {'id': 'IPh87UHK1iV0wLIc22mL9', 'name': 'World State (Agent)',
     'agentType': 'world-state', 'enabled': 'false'},
    {'id': 'PDN9z6Hfg1E5fjRGhw9vA', 'name': 'Inventory Tracker (Agent)',
     'agentType': 'inventory-tracker', 'enabled': 'false'},
]


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def canonical_digest(value: Any) -> str:
    return digest(json.dumps(value, ensure_ascii=False, sort_keys=True,
                             separators=(',', ':')).encode('utf-8'))


def parse_marker(value: Any) -> Any:
    if isinstance(value, str):
        return json.loads(value)
    return value


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

    # Order arrays, defaults, and wrapFormat are part of the freeze contract.
    if preset.get('sectionOrder') != baseline['sectionOrderRaw']:
        raise ValueError('sectionOrder differs from the baseline raw order array')
    if preset.get('groupOrder') != baseline['groupOrderRaw']:
        raise ValueError('groupOrder differs from the baseline raw order array')
    if preset.get('defaultChoices') != baseline['defaultChoicesRaw']:
        raise ValueError('defaultChoices differ from the baseline raw choices')
    if json.loads(preset['defaultChoices']) != baseline['defaultChoices']:
        raise ValueError('parsed defaultChoices differ from the baseline')
    if preset.get('wrapFormat') != EXPECTED_WRAP_FORMAT:
        raise ValueError(f'wrapFormat is {preset.get("wrapFormat")!r}; expected {EXPECTED_WRAP_FORMAT!r}')

    wrapping = []
    for row in data['sections']:
        wrap_in_xml, xml_tag = row.get('wrapInXml'), row.get('xmlTagName')
        if wrap_in_xml not in (False, 'false') or xml_tag not in ('', None):
            raise ValueError(f'section {row["id"]} wrapping fields are not the archived defaults')
        wrapping.append({
            'id': row['id'],
            'wrapInXml': wrap_in_xml,
            'xmlTagName': xml_tag if xml_tag is not None else '',
        })
    if len(wrapping) != COUNTS['sections']:
        raise ValueError('wrapping field inventory is incomplete')

    disabled = []
    for row in data['sections']:
        marker = parse_marker(row.get('markerConfig'))
        if marker and marker.get('type') == 'agent_data' and row['enabled'] in (False, 'false'):
            disabled.append({
                'id': row['id'],
                'name': row['name'],
                'agentType': marker.get('agentType'),
                'enabled': row['enabled'],
            })
    if disabled != EXPECTED_DISABLED_AGENT_MARKERS:
        raise ValueError('disabled agent markers differ from the pinned archive list')

    regex_summary = []
    for row in records['regexScripts']:
        regex_summary.append({
            'id': row['id'],
            'scriptName': row.get('scriptName'),
            'disabled': row.get('disabled'),
            'markdownOnly': row.get('markdownOnly'),
            'promptOnly': row.get('promptOnly'),
            'runOnEdit': row.get('runOnEdit'),
            'substituteRegex': row.get('substituteRegex'),
            'placement': row.get('placement'),
            'minDepth': row.get('minDepth'),
            'maxDepth': row.get('maxDepth'),
            'findRegex': row.get('findRegex'),
        })

    return {
        'schemaVersion': 1,
        'purpose': 'Archive integrity and field accounting; runtime behavior is verified separately.',
        'archive': {'bytes': len(raw), 'sha256': digest(raw)},
        'baseline': {'sha256': digest(baseline_raw)},
        'counts': COUNTS,
        'defaultChoices': baseline['defaultChoices'],
        'wrapFormat': EXPECTED_WRAP_FORMAT,
        'wrappingFields': {
            'sectionsChecked': len(wrapping),
            'allWrapInXmlFalse': all(item['wrapInXml'] in (False, 'false') for item in wrapping),
            'allXmlTagNameEmpty': all(item['xmlTagName'] == '' for item in wrapping),
        },
        'orderArrays': {
            'sectionOrderIds': json.loads(baseline['sectionOrderRaw']),
            'groupOrderIds': json.loads(baseline['groupOrderRaw']),
            'sectionOrderCount': len(json.loads(baseline['sectionOrderRaw'])),
            'groupOrderCount': len(json.loads(baseline['groupOrderRaw'])),
        },
        'disabledAgentMarkers': disabled,
        'regexExecutableSummary': regex_summary,
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
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as error:
        print(f'preset audit failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
