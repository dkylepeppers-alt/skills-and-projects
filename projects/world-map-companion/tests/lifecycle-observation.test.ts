import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  createNoopLifecycleObserver,
  LIFECYCLE_EVENTS,
  type LifecycleEvent,
} from "../compatibility/noop-lifecycle-observer.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const observationPath = `${root}/compatibility/lifecycle-observation.json`;
const installedRuntimePath = `${root}/compatibility/installed-runtime.json`;

test("no-op observer records each lifecycle event exactly once and forbids state writes", () => {
  const observer = createNoopLifecycleObserver();
  observer.enable();

  for (const event of LIFECYCLE_EVENTS) {
    assert.equal(observer.observe(event, { i: event }), true);
  }

  observer.assertExactlyOnceEach();
  observer.assertZeroStateWrites();

  // Second accept would violate exactly-once
  observer.observe("accept");
  assert.throws(() => observer.assertExactlyOnceEach(), /accept/);

  assert.throws(
    () => observer.writeCampaignDocument({ kind: "campaign", data: { x: 1 } }),
    /must not write/,
  );
  assert.equal(observer.getSnapshot().companionStateWrites, 1);
  assert.throws(() => observer.assertZeroStateWrites(), /state writes/);
});

test("disable ignores events; re-enable keeps prior exactly-once counts stable until new observes", () => {
  const observer = createNoopLifecycleObserver();
  observer.enable();
  for (const event of LIFECYCLE_EVENTS) observer.observe(event);

  observer.disable();
  assert.equal(observer.isEnabled(), false);
  assert.equal(observer.hasPromptContribution(), false);
  assert.equal(observer.observe("delete", { while: "disabled" }), false);
  assert.equal(observer.getSnapshot().ignoredWhileDisabled, 1);
  observer.assertExactlyOnceEach();

  observer.enable();
  assert.equal(observer.isEnabled(), true);
  assert.equal(observer.hasPromptContribution(), true);
  observer.assertExactlyOnceEach();
  observer.assertZeroStateWrites();
});

test("recorded lifecycle-observation.json has counts === 1 and zero companion writes", () => {
  assert.equal(existsSync(observationPath), true, "lifecycle-observation.json must exist (run scripts/engine-lifecycle-observation.ts)");
  const obs = JSON.parse(readFileSync(observationPath, "utf8"));
  assert.equal(obs.status, "recorded");
  assert.equal(obs.mode, "in-process-engine-lifecycle");
  assert.equal(obs.companionStateWrites, 0);
  assert.equal(obs.documentCreateAttempts, 0);
  assert.equal(obs.packageDocumentsListed, 0);
  for (const event of LIFECYCLE_EVENTS) {
    assert.equal(obs.counts[event], 1, `count for ${event}`);
    assert.equal(obs.events[event].count, 1);
  }
  assert.equal(obs.disableReenable.disabledClearedPromptContribution, true);
  assert.equal(obs.disableReenable.countsUnchangedWhileDisabled, true);
  assert.equal(obs.disableReenable.reenabledListening, true);
  assert.equal(obs.disableReenable.countsStillExactlyOnceAfterReenable, true);
  assert.ok(obs.disableReenable.ignoredWhileDisabled >= 1);
  assert.equal(obs.honesty.fullHttpServer, false);
  assert.equal(obs.honesty.notPackageActivation, true);
  assert.ok(Array.isArray(obs.blockers) && obs.blockers.length >= 1);
  // Log must contain exactly one of each event in some order
  const logEvents = obs.log.map((e: { event: LifecycleEvent }) => e.event);
  for (const event of LIFECYCLE_EVENTS) {
    assert.equal(logEvents.filter((e: string) => e === event).length, 1);
  }
});

test("installed-runtime marks task2LifecycleObservation recorded while staying PARTIAL", () => {
  const runtime = JSON.parse(readFileSync(installedRuntimePath, "utf8"));
  assert.equal(runtime.status, "PARTIAL");
  assert.equal(runtime.evidence.task1LiveImport, "recorded");
  assert.equal(runtime.evidence.task2LifecycleObservation, "recorded");
  assert.equal(runtime.lifecycleObservation.status, "recorded");
  assert.equal(runtime.lifecycleObservation.path, "compatibility/lifecycle-observation.json");
  for (const event of LIFECYCLE_EVENTS) {
    assert.equal(runtime.lifecycleObservation.counts[event], 1);
  }
  assert.equal(runtime.lifecycleObservation.companionStateWrites, 0);
  // Desktop unknowns remain
  assert.equal(runtime.engine.version, "UNKNOWN");
  assert.equal(runtime.packages["world-map-companion"].installed, false);
});
