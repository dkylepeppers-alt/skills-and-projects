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
  assert.equal(report.defaultChoices.state_mode, 'AGENTS');
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
