/** Run with the same TypeScript loader as validate-artifact.ts and MARINARA_ENGINE_ROOT set. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (!process.env.MARINARA_ENGINE_ROOT) throw new Error("Set MARINARA_ENGINE_ROOT to the release checkout.");
const scripts = dirname(fileURLToPath(import.meta.url));
const temporary = mkdtempSync(join(process.cwd(), ".marinara-validation-"));
const validator = join(scripts, "validate-artifact.ts");
let count = 0;
let failures = 0;

function run(args) {
  const result = spawnSync(process.execPath, [...process.execArgv, validator, ...args], {
    encoding: "utf8", env: process.env, timeout: 30000,
  });
  if (result.error) throw result.error;
  return { status: result.status, output: result.stdout + result.stderr };
}
function fixture(name, value) {
  const path = join(temporary, name + ".json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}
function check(name, test) {
  count += 1;
  try { test(); console.log("ok - " + name); }
  catch (error) { failures += 1; console.error("FAIL - " + name + ": " + error.message); }
}
function rejected(value, pattern = /FAIL|error|unsupported|unrecognized|usage/i) {
  const result = run([fixture("case-" + count, value)]);
  assert.notEqual(result.status, 0, result.output);
  assert.match(result.output, pattern);
}
function preset(sections = [], groups = []) {
  return { type: "marinara_preset", version: 1, data: {
    preset: { name: "Validation fixture", sectionOrder: sections.map(s => s.id), groupOrder: groups.map(g => g.id) },
    sections, groups, choiceBlocks: [],
  } };
}

try {
  check("shipped native templates pass release schemas", () => {
    const names = ["lorebook.marinara.json", "character.marinara.json", "persona.marinara.json", "map-template.json", "preset.marinara.json", "regex-scripts.json"];
    const result = run(names.map(n => resolve(scripts, "../templates", n)));
    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /ok\s+map definition/);
    if (process.env.MARINARA_AGENTS_ROOT) assert.match(result.output, /ok\s+hierarchyProfile/);
  });
  check("unknown JSON never reports successful validation", () => rejected({ arbitrary: "unvalidated" }));
  check("unsupported envelope versions fail", () => rejected({ type: "marinara_character", version: 2, data: {} }));
  check("no input produces usage failure", () => {
    const result = run([]); assert.notEqual(result.status, 0, result.output); assert.match(result.output, /usage/i);
  });
  check("invalid native JSON is diagnosed", () => {
    const path = join(temporary, "bad.json"); writeFileSync(path, "{");
    const result = run([path]); assert.equal(result.status, 1, result.output); assert.match(result.output, /not parseable JSON/);
  });
  check("null native payload is a file failure, not an uncaught exception", () => {
    const result = run([fixture("null", { type: "marinara_lorebook", version: 1, data: null })]);
    assert.equal(result.status, 1, result.output); assert.match(result.output, /FAIL/); assert.doesNotMatch(result.output, /TypeError|uncaught/i);
  });
  check("duplicate section IDs cannot silently remap to the last section", () => rejected(preset([
    { id: "same", name: "First", enabled: true }, { id: "same", name: "Second", enabled: true },
  ]), /duplicate/i));
  check("a markerConfig string containing null cannot bypass required marker configuration", () => rejected(preset([
    { id: "marker", name: "History", isMarker: true, enabled: true, markerConfig: "null" },
  ]), /markerConfig/));
  check("invalid scopedRegexMode is reported as normalized instead of silently ignored", () => {
    const value = preset(); value.data.preset.scopedRegexMode = "unknown";
    const result = run([fixture("regex-mode", value)]); assert.equal(result.status, 0, result.output);
    assert.match(result.output, /warn.*scopedRegexMode.*disabled/);
  });
  check("valid new preset fields and JSON-string choice metadata import", () => {
    const value = preset([{ id: "plain", name: "Plain", enabled: "true", skipWrap: "true" }]);
    value.data.preset.scopedRegexMode = "exclusive";
    value.data.preset.defaultChoices = JSON.stringify({ tone: "direct" });
    value.data.choiceBlocks = [{ variableName: "tone", question: "Tone", options: JSON.stringify([{ id: "direct", label: "Direct", value: "Direct" }]) }];
    const result = run([fixture("new-preset", value)]); assert.equal(result.status, 0, result.output);
  });
  check("preset data without preset object cannot become an empty success", () => rejected({ type: "marinara_preset", version: 1, data: {} }));
  check("one bad file does not prevent later file validation", () => {
    const result = run([fixture("wrong-shape", { type: "marinara_lorebook", version: 1, data: null }), resolve(scripts, "../templates/character.marinara.json")]);
    assert.equal(result.status, 1, result.output); assert.match(result.output, /ok\s+character card/);
  });
  check("unknown marker types fail the actual release schema", () => rejected(preset([
    { id: "marker", name: "Unsupported", enabled: true, isMarker: true, markerConfig: { type: "invented" } },
  ]), /markerConfig/));
  check("invalid regex flags fail rather than receiving a safety-only warning", () => rejected([
    { name: "Invalid flags", findRegex: "x", flags: "gg", placement: ["ai_output"] },
  ], /flags/));
  check("current regex export wrapper validates all enclosed scripts", () => {
    const value = { kind: "marinara.regex-scripts", version: 1, regexScripts: [
      { name: "Current format", findRegex: "x", flags: "g", placement: ["ai_output"] },
    ] };
    const result = run([fixture("regex-wrapper", value)]); assert.equal(result.status, 0, result.output);
    assert.match(result.output, /ok\s+script\[0\]/);
  });
  check("a bad script in the current regex wrapper fails", () => rejected({
    kind: "marinara.regex-scripts", version: 1, regexScripts: [{ name: "Bad", findRegex: "x", placement: ["invented"] }],
  }, /placement/));
  check("a data object shadows the top-level map definition exactly as the importer does", () => {
    const value = JSON.parse(readFileSync(resolve(scripts, "../templates/map-template.json"), "utf8"));
    value.data = {};
    rejected(value, /map definition/);
  });
} finally { rmSync(temporary, { recursive: true, force: true }); }
console.log(`${count - failures}/${count} checks passed.`);
process.exitCode = failures ? 1 : 0;
