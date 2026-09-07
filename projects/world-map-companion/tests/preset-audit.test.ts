import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'source/presets/ff54-agent-gating.original.marinara.json');
const baseline = join(root, 'source/presets/ff54-baseline.json');
const EXPECTED_DISABLED = [
  'persona-stats',
  'character-tracker',
  'custom-tracker',
  'beholder',
  'quest',
  'world-state',
  'inventory-tracker',
];

function audit(args: string[] = []) {
  return spawnSync('python3', ['scripts/audit-preset.py', ...args], { cwd: root, encoding: 'utf8' });
}

test('audit accounts for every supplied record without rewriting either source file', () => {
  const beforeSource = readFileSync(source);
  const beforeBaseline = readFileSync(baseline);
  const result = audit();
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.deepEqual(report.counts, { sections: 69, groups: 12, choiceBlocks: 11, regexScripts: 25 });
  assert.equal(report.disabledAgentMarkers.length, 7);
  assert.deepEqual(report.disabledAgentMarkers.map((row: { agentType: string }) => row.agentType), EXPECTED_DISABLED);
  assert.equal(report.defaultChoices.state_mode, 'AGENTS');
  assert.equal(report.wrapFormat, 'none');
  assert.equal(report.wrappingFields.sectionsChecked, 69);
  assert.equal(report.wrappingFields.allWrapInXmlFalse, true);
  assert.equal(report.wrappingFields.allXmlTagNameEmpty, true);
  assert.equal(report.orderArrays.sectionOrderCount, 69);
  assert.equal(report.orderArrays.groupOrderCount, 12);
  assert.equal(report.regexExecutableSummary.length, 25);
  assert.equal(report.records.sections.length, 69);
  assert.equal(report.records.regexScripts.length, 25);
  assert.deepEqual(readFileSync(source), beforeSource);
  assert.deepEqual(readFileSync(baseline), beforeBaseline);
});

test('an altered preset is rejected even when it remains valid JSON', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff54-audit-'));
  try {
    const changed = JSON.parse(readFileSync(source, 'utf8'));
    changed.data.sections[49].enabled = 'true';
    const path = join(dir, 'changed.json');
    writeFileSync(path, JSON.stringify(changed));
    const result = audit(['--source', path]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /source .* (?:bytes|SHA-256)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an altered baseline is rejected and an output report cannot overwrite either input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ff54-audit-'));
  try {
    const path = join(dir, 'baseline.json');
    writeFileSync(path, readFileSync(baseline, 'utf8') + ' ');
    assert.equal(audit(['--baseline', path]).status, 1);
    for (const input of [source, baseline]) {
      const before = readFileSync(input);
      assert.equal(audit(['--output', input]).status, 1);
      assert.deepEqual(readFileSync(input), before);
    }
    const output = join(dir, 'audit.json');
    assert.equal(audit(['--output', output]).status, 0);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).archive.bytes, 187861);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('archive integrity rejects enabling each disabled agent marker', async (t) => {
  const beforeSource = readFileSync(source);
  const beforeBaseline = readFileSync(baseline);
  const sourceText = beforeSource.toString('utf8');
  const original = JSON.parse(sourceText);

  for (const agentType of EXPECTED_DISABLED) {
    await t.test(agentType, () => {
      const dir = mkdtempSync(join(tmpdir(), 'ff54-audit-'));
      try {
        const expected = structuredClone(original);
        const marker = expected.data.sections.find((row: { markerConfig: string | { type?: string; agentType?: string } | null }) => {
          const config = typeof row.markerConfig === 'string' ? JSON.parse(row.markerConfig) : row.markerConfig;
          return config?.type === 'agent_data' && config.agentType === agentType;
        });
        assert.ok(marker, `Missing ${agentType} marker in the test source`);
        assert.equal(marker.enabled, 'false');
        marker.enabled = 'true';

        const markerStart = sourceText.indexOf(`"id": "${marker.id}"`);
        assert.notEqual(markerStart, -1);
        const disabledField = '"enabled": "false"';
        const fieldStart = sourceText.indexOf(disabledField, markerStart);
        assert.notEqual(fieldStart, -1);
        // One padding space preserves the byte count while changing only this
        // marker's JSON value. The archive hash must reject it before inventory.
        const altered = sourceText.slice(0, fieldStart) + '"enabled": "true" ' +
          sourceText.slice(fieldStart + disabledField.length);
        assert.equal(Buffer.byteLength(altered), beforeSource.length);
        assert.deepEqual(JSON.parse(altered), expected);

        const path = join(dir, 'enabled-marker.json');
        writeFileSync(path, altered);
        const result = audit(['--source', path]);
        assert.equal(result.status, 1, result.stderr);
        assert.match(result.stderr, /source does not match the archived SHA-256/);
        assert.equal(result.stdout, '', 'Rejected source must not produce an inventory');
      } finally {
        rmSync(dir, { recursive: true, force: true });
        assert.deepEqual(readFileSync(source), beforeSource);
        assert.deepEqual(readFileSync(baseline), beforeBaseline);
      }
    });
  }
});
