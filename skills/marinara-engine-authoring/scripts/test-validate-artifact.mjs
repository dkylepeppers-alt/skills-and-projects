/** Run with the same TypeScript loader as validate-artifact.ts and MARINARA_ENGINE_ROOT set. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

if (!process.env.MARINARA_ENGINE_ROOT) throw new Error("Set MARINARA_ENGINE_ROOT to the release checkout.");
// Resolve checkout roots against the working directory once, so symlinks made in the temporary
// directory and validator runs from other working directories see the same checkouts.
process.env.MARINARA_ENGINE_ROOT = resolve(process.env.MARINARA_ENGINE_ROOT);
if (process.env.MARINARA_AGENTS_ROOT) process.env.MARINARA_AGENTS_ROOT = resolve(process.env.MARINARA_AGENTS_ROOT);
const engineSibling = resolve(process.env.MARINARA_ENGINE_ROOT, "..", "Marinara-Agents");
const agentsAvailable = Boolean(process.env.MARINARA_AGENTS_ROOT)
  || existsSync(resolve(engineSibling, "scripts/catalog-package-guidance.mjs"));
if (!agentsAvailable)
  throw new Error("Set MARINARA_AGENTS_ROOT (or clone Marinara-Agents next to Marinara-Engine): map profiles and agent packages are checked against it.");
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
    assert.match(result.output, /ok\s+hierarchyProfile/);
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
  {
    check("an invalid hierarchy profile fails the loaded maps model", () => {
      const value = JSON.parse(readFileSync(resolve(scripts, "../templates/map-template.json"), "utf8"));
      value.hierarchyProfile.types[0].baseKind = "not-a-kind";
      const result = run([fixture("bad-profile", value)]);
      assert.notEqual(result.status, 0, result.output);
      assert.match(result.output, /FAIL\s+hierarchyProfile/);
      assert.doesNotMatch(result.output, /not checked|Could not load/, "the maps model must load for this check to mean anything");
    });
  }
  // ── Formats beyond the six content templates ──
  const accepted = (paths, pattern) => {
    const result = run(paths);
    assert.equal(result.status, 0, result.output);
    if (pattern) assert.match(result.output, pattern);
    return result;
  };
  const templates = resolve(scripts, "../templates");
  check("extension templates pass the Engine importer, schema and lint", () => accepted(
    [join(templates, "extension-browser/manifest.json"), join(templates, "extension-server/manifest.json")],
    /ok\s+personal extension "Scene Notes" \(client\)[\s\S]*ok\s+personal extension "Uptime Log" \(server\)/,
  ));
  check("an extension manifest naming a missing file finds no extension", () => {
    const dir = join(temporary, "Broken Extension");
    mkdirSync(dir);
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      kind: "marinara.personal-extension", version: 1,
      config: { name: "Broken", runtime: "client", capabilities: [], jsPath: "missing.js" },
    }));
    const result = run([join(dir, "manifest.json")]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /finds no extension/);
  });
  check("sandbox-forbidden code in an extension fails its lint", () => {
    const dir = join(temporary, "Dom Extension");
    mkdirSync(dir);
    writeFileSync(join(dir, "extension.js"), "document.body.append('x');\nmarinara.chat.send('hi');\n");
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      kind: "marinara.personal-extension", version: 1,
      config: { name: "Dom", runtime: "client", capabilities: [], jsPath: "extension.js" },
    }));
    const result = run([join(dir, "manifest.json")]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /lint: .*`document`/);
    assert.match(result.output, /lint: .*marinara\.chat/);
  });
  check("the agent-package template manifest and definitions pass", () => accepted(
    [join(templates, "agent-package/manifest.json"), join(templates, "agent-package/agents.json")],
    /ok\s+capability package manifest[\s\S]*ok\s+agents\.json packaged agent definitions[\s\S]*ok\s+packaged agent definitions/,
  ));
  check("a Capability API minor above the supported one fails", () => {
    const manifest = JSON.parse(readFileSync(join(templates, "agent-package/manifest.json"), "utf8"));
    rejected({ ...manifest, schemaVersion: 2, capabilityApi: { major: 1, minor: 9999 },
      builtAgainst: { engineVersion: "2.5.2", engineCommit: "fc0333c3fe978cda5e0b919bd6faec985901704e" } }, /capabilityApi\.minor 9999/);
  });
  check("an engine.min below the 2.5.2 floor warns", () => {
    const manifest = JSON.parse(readFileSync(join(templates, "agent-package/manifest.json"), "utf8"));
    accepted([fixture("old-min", { ...manifest, engine: { min: "2.3.0", maxExclusive: "4.0.0" } })], /warn\s+engine\.min 2\.3\.0/);
  });
  check("a custom tool imports through the Engine's transfer normalizer", () => accepted([fixture("tool", {
    kind: "marinara.function", version: 1,
    config: { name: "roll_weather", description: "Pick today's weather.", executionType: "static", staticResult: "Rain" },
  })], /ok\s+tool\[0\] roll_weather/));
  check("a custom tool with an invalid name fails", () => rejected({
    kind: "marinara.function", version: 1, config: { name: "Roll Weather", description: "x", executionType: "static" },
  }, /snake_case/));
  check("a structural story script passes and a bad one fails", () => {
    accepted([fixture("story", { storyVersion: 1, flags: [], directions: [], events: [], cutscenes: [] })], /ok\s+story script/);
    rejected({ storyVersion: 1, flags: [{ id: "Bad Id", kind: "bool", initial: false }] }, /story script/);
  });
  check("a chat settings profile with 2.5.2 fields passes; an unknown setting fails", () => {
    accepted([fixture("profile", { type: "marinara_chat_settings_profile", version: 1,
      data: { name: "Night", mode: "roleplay", settings: { personaId: null, lorebookIds: ["a"] } } })], /ok\s+settings profile settings/);
    rejected({ type: "marinara_chat_settings_profile", version: 1,
      data: { name: "Night", mode: "roleplay", settings: { invented: true } } }, /settings profile settings/);
  });
  check("relative manifest paths still check files[] hashes beside the manifest", () => {
    const dir = join(temporary, "pkg");
    mkdirSync(dir);
    const manifest = JSON.parse(readFileSync(join(templates, "agent-package/manifest.json"), "utf8"));
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "agents.json"), readFileSync(join(templates, "agent-package/agents.json")));
    const result = spawnSync(process.execPath, [...process.execArgv, validator, "manifest.json"], {
      encoding: "utf8", env: process.env, cwd: dir, timeout: 30000,
    });
    assert.match(result.stdout, /warn\s+files\[\] entry agents\.json does not match/, result.stdout + result.stderr);
  });
  check("a package agent description that is only a prefix of the manifest's fails or warns", () => {
    const dir = join(temporary, "desc");
    mkdirSync(dir);
    const manifest = JSON.parse(readFileSync(join(templates, "agent-package/manifest.json"), "utf8"));
    const agents = JSON.parse(readFileSync(join(templates, "agent-package/agents.json"), "utf8"));
    agents[0].description = "Totally different text.";
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
    writeFileSync(join(dir, "agents.json"), JSON.stringify(agents));
    const result = run([join(dir, "manifest.json")]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /description must equal manifest\.description/);
  });
  check("an extension manifest shadowed by a root collection file is not silently swapped", () => {
    const dir = join(temporary, "Shadowed");
    mkdirSync(dir);
    writeFileSync(join(dir, "manifest.json"), JSON.stringify({
      kind: "marinara.personal-extension", version: 1,
      config: { name: "Broken", runtime: "client", capabilities: [], jsPath: "missing.js" },
    }));
    writeFileSync(join(dir, "marinara-extensions.json"), JSON.stringify({ extensions: [{ name: "Other", runtime: "client", capabilities: [], css: "a{}" }] }));
    const result = run([join(dir, "manifest.json")]);
    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /would use another file/);
  });
  check("a tool folder resolves its script beside its own manifest; a loose file warns", () => {
    const dir = join(temporary, "roll_weather");
    mkdirSync(dir);
    writeFileSync(join(dir, "script.js"), "return 'rain';");
    const tool = { kind: "marinara.function", version: 1,
      config: { name: "roll_weather", description: "Pick weather.", executionType: "script", scriptBodyPath: "script.js" } };
    writeFileSync(join(dir, "manifest.json"), JSON.stringify(tool));
    accepted([join(dir, "manifest.json")], /ok\s+tool\[0\] roll_weather/);
    writeFileSync(join(dir, "loose-tool.json"), JSON.stringify(tool));
    const loose = run([join(dir, "loose-tool.json")]);
    assert.match(loose.output, /loose JSON tool file is imported without resolving/);
    assert.match(loose.output, /script tool with no script body/);
  });
  check("without an Agents checkout, agent-package and map-profile checks fail instead of guessing", () => {
    const env = { ...process.env, MARINARA_AGENTS_ROOT: "" };
    delete env.MARINARA_AGENTS_ROOT;
    // Point the Engine root through a temporary path with no Marinara-Agents sibling.
    const isolated = join(temporary, "isolated", "Marinara-Engine");
    mkdirSync(dirname(isolated), { recursive: true });
    symlinkSync(process.env.MARINARA_ENGINE_ROOT, isolated);
    env.MARINARA_ENGINE_ROOT = isolated;
    const result = spawnSync(process.execPath, [...process.execArgv, validator,
      join(templates, "agent-package/manifest.json"), resolve(scripts, "../templates/map-template.json")],
      { encoding: "utf8", env, timeout: 30000 });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 1, output);
    assert.match(output, /description rule needs the Marinara-Agents checkout/);
    assert.match(output, /World Maps model needs the Marinara-Agents checkout/);
  });
  check("a Marinara-Agents checkout beside Marinara-Engine is found without MARINARA_AGENTS_ROOT", () => {
    const agentsRoot = process.env.MARINARA_AGENTS_ROOT || engineSibling;
    const root = join(temporary, "side-by-side");
    mkdirSync(root);
    symlinkSync(process.env.MARINARA_ENGINE_ROOT, join(root, "Marinara-Engine"));
    symlinkSync(agentsRoot, join(root, "Marinara-Agents"));
    const env = { ...process.env, MARINARA_ENGINE_ROOT: join(root, "Marinara-Engine") };
    delete env.MARINARA_AGENTS_ROOT;
    const result = spawnSync(process.execPath, [...process.execArgv, validator,
      join(templates, "agent-package/manifest.json"), resolve(scripts, "../templates/map-template.json")],
      { encoding: "utf8", env, timeout: 30000 });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, 0, output);
    assert.match(output, /ok\s+hierarchyProfile/);
  });
  check("a ruleset package with a tampered document fails the Engine reader", () => rejected({
    format: "marinara-ruleset", version: 1, manifest: {}, files: { "ruleset.json": "e30=" },
  }, /FAIL\s+ruleset package/));
} finally { rmSync(temporary, { recursive: true, force: true }); }
console.log(`${count - failures}/${count} checks passed.`);
process.exitCode = failures ? 1 : 0;
