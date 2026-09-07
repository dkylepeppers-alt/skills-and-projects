import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceLockPath = `${root}/compatibility/source-lock.json`;
const installedRuntimePath = `${root}/compatibility/installed-runtime.json`;
const hostContractPath = `${root}/docs/host-contract.md`;
const runtimeObservationPath = `${root}/compatibility/runtimeObservation.json`;
const lifecycleObservationPath = `${root}/compatibility/lifecycle-observation.json`;

const EXPECTED_ENGINE = "9bbee87d1a44c33f704977bd8c25aafbec9b85aa";
const EXPECTED_AGENTS = "ee1a4a01d1091a9f5e4086c58f608e401aa1d879";
const EXPECTED_NATIVE_PRESET = "pLwe7NpVlr3mtoYe34-jD";
const EXPECTED_IMPLEMENTATION_TIP = "7df59b75d9366d12ce52bc001b3b95f93879d1fa";
// taskTip pinned after bridge commit; tests that need exact tip read from lock after pin step
const EXPECTED_TASK_BRANCH = "wmc/task-2-bridge";

const REQUIRED_HOST_CONTRACT_SECTIONS = [
  "## 1. Pins",
  "## 3. Package / capability APIs (VERIFIED)",
  "## 4. Import / export paths (VERIFIED)",
  "## 5. Roleplay lifecycle map (VERIFIED owners)",
  "## 6. CompanionHostBridge (PROPOSED adapter — IMPLEMENTED in companion repo)",
  "## 8. Task 2 lifecycle observation (RECORDED in-process) + remaining gaps",
  "CompanionHostBridge",
  "prepareTurn",
  "finalizeTurn",
  "cancelTurn",
  "selectHistory",
  "UNVERIFIED",
  "IMPLEMENTED (proposed adapter)",
  "src/host/",
  "POST /api/import/marinara",
  "GET /api/prompts/:id/full",
  "GET /api/prompts/:id/export",
  "POST /api/regex-scripts/import",
  "lifecycle-observation.json",
  "task2LifecycleObservation",
  "activatePackage",
];

test("source-lock pins Engine and Agents to the inspected staging SHAs", () => {
  assert.equal(existsSync(sourceLockPath), true, "compatibility/source-lock.json must exist");
  const lock = JSON.parse(readFileSync(sourceLockPath, "utf8"));
  assert.equal(lock.engine.revision, EXPECTED_ENGINE);
  assert.equal(lock.agents.revision, EXPECTED_AGENTS);
  assert.equal(lock.companion.taskBranch, EXPECTED_TASK_BRANCH);
  assert.equal(lock.companion.implementationTip, EXPECTED_IMPLEMENTATION_TIP);
  assert.equal(typeof lock.companion.taskTip, "string");
  assert.ok(lock.companion.taskTip.length >= 7, "taskTip must be a commit SHA");
  assert.notEqual(lock.companion.taskTip, "PENDING_COMMIT");
});

test("installed-runtime records Task 1 import and Task 2 lifecycle; remains PARTIAL for desktop unknowns", () => {
  assert.equal(existsSync(installedRuntimePath), true, "compatibility/installed-runtime.json must exist");
  const runtime = JSON.parse(readFileSync(installedRuntimePath, "utf8"));
  assert.equal(runtime.status, "PARTIAL");
  assert.equal(runtime.evidence.task1LiveImport, "recorded");
  assert.equal(runtime.evidence.task2LifecycleObservation, "recorded");
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
  assert.equal(existsSync(lifecycleObservationPath), true, "lifecycle-observation.json must exist");
  assert.equal(runtime.lifecycleObservation.status, "recorded");
  assert.equal(runtime.lifecycleObservation.path, "compatibility/lifecycle-observation.json");
  // Desktop install fields remain UNKNOWN / not claimed
  assert.equal(runtime.engine.version, "UNKNOWN");
  assert.equal(runtime.capabilityApi.installedHostReports, "UNKNOWN");
  assert.equal(runtime.packages["world-map-companion"].installed, false);
  assert.equal(runtime.evidence.task2CompanionHostBridge, "proposed-adapter-implemented");
  assert.equal(runtime.companionHostBridge.status, "proposed-adapter-implemented");
  assert.equal(runtime.companionHostBridge.engineExport, false);
  assert.equal(runtime.companionHostBridge.desktopActivatePackage, "UNVERIFIED");
});

test("host-contract.md exists and contains required discovery sections", () => {
  assert.equal(existsSync(hostContractPath), true, "docs/host-contract.md must exist");
  const text = readFileSync(hostContractPath, "utf8");
  for (const needle of REQUIRED_HOST_CONTRACT_SECTIONS) {
    assert.ok(text.includes(needle), `host-contract.md must contain: ${needle}`);
  }
  assert.ok(text.includes("PROPOSED"), "proposed CompanionHostBridge must be labeled");
  assert.ok(text.includes("IMPLEMENTED (proposed adapter)"), "bridge adapter must be marked implemented as proposed");
  assert.ok(text.includes("src/host/"), "host-contract must point at src/host/");
  assert.ok(text.includes("9bbee87d1a44c33f704977bd8c25aafbec9b85aa"));
  assert.ok(text.includes("ee1a4a01d1091a9f5e4086c58f608e401aa1d879"));
  assert.ok(
    text.includes("lifecycle-observation.json") && text.includes("task2LifecycleObservation"),
    "host-contract must note Task 2 lifecycle observation recorded",
  );
  assert.ok(text.includes("RECORDED in-process"), "host-contract must label lifecycle as RECORDED in-process");
});
