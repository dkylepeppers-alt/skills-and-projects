import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceLockPath = `${root}/compatibility/source-lock.json`;
const installedRuntimePath = `${root}/compatibility/installed-runtime.json`;
const hostContractPath = `${root}/docs/host-contract.md`;
const runtimeObservationPath = `${root}/compatibility/runtimeObservation.json`;

const EXPECTED_ENGINE = "9bbee87d1a44c33f704977bd8c25aafbec9b85aa";
const EXPECTED_AGENTS = "ee1a4a01d1091a9f5e4086c58f608e401aa1d879";
const EXPECTED_NATIVE_PRESET = "pLwe7NpVlr3mtoYe34-jD";

const REQUIRED_HOST_CONTRACT_SECTIONS = [
  "## 1. Pins",
  "## 3. Package / capability APIs (VERIFIED)",
  "## 4. Import / export paths (VERIFIED)",
  "## 5. Roleplay lifecycle map (VERIFIED owners)",
  "## 6. Proposed CompanionHostBridge (PROPOSED — plan Section 5)",
  "## 8. Proofs still required for Task 2 exit",
  "CompanionHostBridge",
  "prepareTurn",
  "finalizeTurn",
  "cancelTurn",
  "selectHistory",
  "UNVERIFIED",
  "POST /api/import/marinara",
  "GET /api/prompts/:id/full",
  "GET /api/prompts/:id/export",
  "POST /api/regex-scripts/import",
];

test("source-lock pins Engine and Agents to the inspected staging SHAs", () => {
  assert.equal(existsSync(sourceLockPath), true, "compatibility/source-lock.json must exist");
  const lock = JSON.parse(readFileSync(sourceLockPath, "utf8"));
  assert.equal(lock.engine.revision, EXPECTED_ENGINE);
  assert.equal(lock.agents.revision, EXPECTED_AGENTS);
  assert.equal(typeof lock.companion.implementationTip, "string");
  assert.match(lock.companion.implementationTip, /^[a-f0-9]{40}$/);
  assert.equal(lock.companion.taskBranch, "wmc/task-2-host-contract");
  assert.equal(lock.companion.implementationTip, "28d13991464abf6251e532d5e3da0c3cac756ef5");
  assert.equal(typeof lock.companion.taskTip, "string");
  assert.match(lock.companion.taskTip, /^[a-f0-9]{40}$/, "taskTip must be the Task 2 scaffold commit SHA");
});

test("installed-runtime records Task 1 in-process import; Task 2 lifecycle still absent", () => {
  assert.equal(existsSync(installedRuntimePath), true, "compatibility/installed-runtime.json must exist");
  const runtime = JSON.parse(readFileSync(installedRuntimePath, "utf8"));
  assert.equal(runtime.status, "PARTIAL");
  assert.equal(runtime.evidence.task1LiveImport, "recorded");
  assert.equal(runtime.evidence.task2LifecycleObservation, "absent");
  assert.equal(runtime.engine.commit, EXPECTED_ENGINE);
  assert.equal(runtime.agents.hierarchicalMaps.sourceRevisionInspected, EXPECTED_AGENTS);
  assert.equal(runtime.honesty?.notUserDesktopInstall, true);
  assert.equal(typeof runtime.runtimeObservation, "object");
  assert.notEqual(runtime.runtimeObservation, null);
  assert.equal(runtime.runtimeObservation.status, "recorded");
  assert.equal(runtime.runtimeObservation.mode, "in-process-engine-import");
  assert.equal(runtime.runtimeObservation.path, "compatibility/runtimeObservation.json");
  assert.equal(runtime.runtimeObservation.nativePresetId, EXPECTED_NATIVE_PRESET);
  assert.equal(runtime.runtimeObservation.pins.engine, EXPECTED_ENGINE);
  assert.equal(runtime.runtimeObservation.pins.agents, EXPECTED_AGENTS);
  assert.equal(runtime.runtimeObservation.verification.unaccounted, 0);
  assert.equal(runtime.runtimeObservation.verification.regexScoped, "25/25");
  assert.equal(existsSync(runtimeObservationPath), true, "runtimeObservation.json must exist");
  // Desktop install fields remain UNKNOWN / not claimed
  assert.equal(runtime.engine.version, "UNKNOWN");
  assert.equal(runtime.capabilityApi.installedHostReports, "UNKNOWN");
  assert.equal(runtime.packages["world-map-companion"].installed, false);
});

test("host-contract.md exists and contains required discovery sections", () => {
  assert.equal(existsSync(hostContractPath), true, "docs/host-contract.md must exist");
  const text = readFileSync(hostContractPath, "utf8");
  for (const needle of REQUIRED_HOST_CONTRACT_SECTIONS) {
    assert.ok(text.includes(needle), `host-contract.md must contain: ${needle}`);
  }
  assert.ok(text.includes("PROPOSED"), "proposed CompanionHostBridge must be labeled");
  assert.ok(text.includes("9bbee87d1a44c33f704977bd8c25aafbec9b85aa"));
  assert.ok(text.includes("ee1a4a01d1091a9f5e4086c58f608e401aa1d879"));
});
