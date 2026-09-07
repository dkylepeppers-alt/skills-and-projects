/**
 * Task 7 — time, schedules, NPC decisions.
 *
 * Covers: ordinary day, missed meeting, interrupted routine, day-long skip,
 * zero-elapsed chat, group-chat without duplicated ticks, witnessed placement
 * beats schedule, and sealed-route refusal.
 *
 * Unit proofs only — CompanionHostBridge / spatial-owner remain PROPOSED.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  CLOCK_HONESTY,
  DIRECTOR_HONESTY,
  advanceClock,
  batchAdvanceSchedules,
  collectDirectorTriggers,
  createRoster,
  createStoryClock,
  dayBoundariesCrossed,
  formatMinuteOfDay,
  interruptNpc,
  isServiceOpenAt,
  maybeBuildDirectorInvocation,
  parseNativeTimeToMinuteOfDay,
  presenceByLocation,
  reconcileWithNative,
  setWitnessPin,
  storyMinutesFromParts,
  tickRoster,
  tryNpcRoute,
  validateDirectorOutput,
  type AppointmentDef,
  type ScheduleWindowDef,
} from "../src/simulation/index.ts";
import {
  type SpatialDefinition,
  freezeDefinition,
  resolveEffectiveMap,
  setEdgeState,
} from "../src/world/index.ts";
import { SPATIAL_OWNER_ADAPTER_HONESTY } from "../src/adapters/spatial-owner.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const WMC_ROOT = join(HERE, "..");
const REPO_ROOT = join(WMC_ROOT, "..", "..");
const MAP_PATH = join(
  REPO_ROOT,
  "projects/nevermore/releases/v2/Nevermore-Woodlands-Crypts-v2.world-map.json",
);

let cachedBase: SpatialDefinition | null = null;

function loadBase(): SpatialDefinition {
  if (cachedBase) return freezeDefinition(cachedBase);
  const raw = JSON.parse(readFileSync(MAP_PATH, "utf8")) as { definition: SpatialDefinition };
  cachedBase = freezeDefinition(raw.definition);
  return freezeDefinition(cachedBase);
}

/** Fixture: ordinary school-day windows with concrete clocks (pack clocks are UNKNOWN). */
function schoolDayWindows(): ScheduleWindowDef[] {
  return [
    {
      id: "win:wed-dorm-night",
      scheduleId: "sched:test-wed",
      npcId: "npc:wednesday-addams",
      startMinuteOfDay: 22 * 60,
      endMinuteOfDay: 7 * 60,
      locationId: "dorm-wednesday-enid",
      activity: "sleep",
      travelRequired: false,
      priority: "routine",
      certainty: "assumption",
    },
    {
      id: "win:wed-class",
      scheduleId: "sched:test-wed",
      npcId: "npc:wednesday-addams",
      startMinuteOfDay: 9 * 60,
      endMinuteOfDay: 12 * 60,
      locationId: "main-hall-classrooms",
      activity: "classes",
      travelRequired: true,
      priority: "routine",
      certainty: "assumption",
    },
    {
      id: "win:wed-dining",
      scheduleId: "sched:test-wed",
      npcId: "npc:wednesday-addams",
      startMinuteOfDay: 12 * 60,
      endMinuteOfDay: 13 * 60,
      locationId: "main-hall-dining",
      activity: "meals",
      travelRequired: true,
      priority: "routine",
      certainty: "assumption",
    },
    {
      id: "win:enid-class",
      scheduleId: "sched:test-enid",
      npcId: "npc:enid-sinclair",
      startMinuteOfDay: 9 * 60,
      endMinuteOfDay: 12 * 60,
      locationId: "main-hall-classrooms",
      activity: "classes",
      travelRequired: true,
      priority: "routine",
      certainty: "assumption",
    },
    {
      id: "win:enid-common",
      scheduleId: "sched:test-enid",
      npcId: "npc:enid-sinclair",
      startMinuteOfDay: 18 * 60,
      endMinuteOfDay: 21 * 60,
      locationId: "dorms-common",
      activity: "social",
      travelRequired: true,
      priority: "routine",
      certainty: "assumption",
    },
    {
      id: "win:weems-office",
      scheduleId: "sched:test-weems",
      npcId: "npc:larissa-weems",
      startMinuteOfDay: 8 * 60,
      endMinuteOfDay: 17 * 60,
      locationId: "main-hall-weems",
      activity: "office",
      travelRequired: false,
      priority: "routine",
      certainty: "assumption",
    },
  ];
}

function baseRoster() {
  return createRoster([
    {
      npcId: "npc:wednesday-addams",
      placement: { kind: "at", locationId: "dorm-wednesday-enid" },
      goals: ["investigate leads"],
    },
    {
      npcId: "npc:enid-sinclair",
      placement: { kind: "at", locationId: "dorm-wednesday-enid" },
      goals: ["social routines"],
    },
    {
      npcId: "npc:larissa-weems",
      placement: { kind: "at", locationId: "main-hall-weems" },
      goals: ["run Nevermore"],
    },
  ]);
}

test("honesty: clock / director / host labels stay clear", () => {
  assert.equal(CLOCK_HONESTY.dualIndependentClocks, false);
  assert.equal(CLOCK_HONESTY.capabilityDocumentStore, false);
  assert.equal(DIRECTOR_HONESTY.perNpcPolling, false);
  assert.equal(DIRECTOR_HONESTY.callsLlmItself, false);
  assert.equal(DIRECTOR_HONESTY.companionHostBridge, "PROPOSED");
  assert.equal(SPATIAL_OWNER_ADAPTER_HONESTY.status, "PROPOSED");
  const bridgeSrc = readFileSync(join(WMC_ROOT, "src/host/companion-host-bridge.ts"), "utf8");
  assert.match(bridgeSrc, /CompanionHostBridge — PROPOSED/);
});

test("reconcile story time with native world state (single published clock)", () => {
  const clock = createStoryClock({
    storyMinutes: storyMinutesFromParts(0, 10 * 60),
    calendarLabel: "Wednesday",
    weather: "clear",
    certainty: "assumption",
  });
  const native = {
    date: "October 12",
    time: "10:30 AM",
    weather: "overcast",
    temperature: "58°F",
  };
  const result = reconcileWithNative(clock, native);
  assert.equal(result.published.time, "10:30");
  assert.match(result.published.date, /October 12/);
  assert.equal(result.published.weather, "overcast");
  assert.ok(result.absorbedNative);
  assert.ok(result.conflicts.some((c) => c.includes("weather") || c.includes("time") || c.includes("date")));
  assert.equal(result.clock.lastNative?.time, "10:30 AM");
});

test("OOC / edit / status do not advance; zero-elapsed chat leaves clock unchanged", () => {
  const clock = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 9 * 60) });
  for (const kind of ["ooc", "edit_retry", "status_inspect"] as const) {
    const r = advanceClock(clock, { kind, elapsedMinutes: 30 });
    assert.equal(r.advanced, false);
    assert.equal(r.elapsedMinutes, 0);
    assert.equal(r.clock.storyMinutes, clock.storyMinutes);
  }
  const zero = advanceClock(clock, { kind: "conversation", elapsedMinutes: 0 });
  assert.equal(zero.advanced, false);
  assert.equal(zero.clock.storyMinutes, clock.storyMinutes);
});

test("unknown travel duration refuses invented minutes", () => {
  const clock = createStoryClock({ storyMinutes: 100 });
  const r = advanceClock(clock, { kind: "travel", travelCertainty: "unknown" });
  assert.equal(r.advanced, false);
  assert.match(r.reason, /UNKNOWN/);
});

test("ordinary school day: batch priorities move NPCs along reachable routes", () => {
  const effective = resolveEffectiveMap(loadBase());
  const previous = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 8 * 60) });
  const morning = advanceClock(previous, { kind: "wait", elapsedMinutes: 60 });
  assert.equal(formatMinuteOfDay(morning.clock.storyMinutes % (24 * 60)), "09:00");

  let roster = baseRoster();
  const tick = tickRoster({
    roster,
    clock: morning.clock,
    previousClock: previous,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "day-morning-1",
  });
  assert.equal(tick.ticked, true);
  roster = tick.roster;

  const wed = roster.npcs["npc:wednesday-addams"]!;
  assert.equal(wed.placement.kind, "at");
  if (wed.placement.kind === "at") {
    assert.equal(wed.placement.locationId, "main-hall-classrooms");
  }
  const enid = roster.npcs["npc:enid-sinclair"]!;
  assert.equal(enid.placement.kind, "at");
  if (enid.placement.kind === "at") {
    assert.equal(enid.placement.locationId, "main-hall-classrooms");
  }
  const presence = presenceByLocation(roster);
  assert.ok(presence["main-hall-classrooms"]?.includes("npc:wednesday-addams"));
  assert.ok(presence["main-hall-classrooms"]?.includes("npc:enid-sinclair"));
  assert.deepEqual(
    tick.batch.decisionOrder,
    [...tick.batch.decisionOrder].sort(),
  );
});

test("missed meeting: appointment past grace without presence", () => {
  const effective = resolveEffectiveMap(loadBase());
  const due = storyMinutesFromParts(0, 12 * 60);
  let roster = baseRoster();
  const appt: AppointmentDef = {
    appointmentId: "appt:lunch-with-enid",
    npcId: "npc:wednesday-addams",
    locationId: "main-hall-dining",
    dueStoryMinutes: due,
    graceMinutes: 15,
    label: "Lunch with Enid",
    priority: "appointment",
  };
  roster = {
    ...roster,
    appointments: [appt],
    npcs: {
      ...roster.npcs,
      "npc:wednesday-addams": {
        ...roster.npcs["npc:wednesday-addams"]!,
        placement: { kind: "at", locationId: "main-hall-classrooms" },
      },
    },
  };

  const previous = createStoryClock({ storyMinutes: due + 10 });
  const after = createStoryClock({ storyMinutes: due + 20 });
  const tick = tickRoster({
    roster,
    clock: after,
    previousClock: previous,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "missed-lunch",
  });
  assert.equal(tick.batch.missedAppointments.length, 1);
  assert.equal(tick.batch.missedAppointments[0]!.appointmentId, "appt:lunch-with-enid");

  const invocation = maybeBuildDirectorInvocation({
    clock: after,
    roster: tick.roster,
    batch: tick.batch,
    seed: "seed-missed-1",
  });
  assert.ok(invocation);
  assert.ok(invocation!.triggerKinds.includes("missed_appointment"));
  assert.equal(invocation!.honesty.perNpcPolling, false);
});

test("interrupted routine: schedule does not move interrupted NPC", () => {
  const effective = resolveEffectiveMap(loadBase());
  let roster = baseRoster();
  roster = interruptNpc(roster, {
    npcId: "npc:wednesday-addams",
    reason: "player conversation in dorm",
    suspendRoutine: true,
  });
  const previous = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 8 * 60) });
  const clock = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 9 * 60) });
  const tick = tickRoster({
    roster,
    clock,
    previousClock: previous,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "interrupt-1",
  });
  const wed = tick.roster.npcs["npc:wednesday-addams"]!;
  assert.equal(wed.placement.kind, "at");
  if (wed.placement.kind === "at") {
    assert.equal(wed.placement.locationId, "dorm-wednesday-enid");
  }
  const blocked = tick.batch.moves.find((m) => m.npcId === "npc:wednesday-addams");
  assert.ok(blocked);
  assert.equal(blocked!.applied, false);
  assert.match(blocked!.reason, /interrupted/);
});

test("day-long skip: boundaries processed once; director long-skip trigger batched", () => {
  const effective = resolveEffectiveMap(loadBase());
  const start = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 8 * 60) });
  const end = advanceClock(start, {
    kind: "long_skip",
    elapsedMinutes: 24 * 60,
    notes: "skip one day",
  });
  assert.deepEqual(
    dayBoundariesCrossed(start.storyMinutes, end.clock.storyMinutes),
    [1],
  );

  let roster = baseRoster();
  // Midday position before skip catch-up at next morning class window.
  const tick = tickRoster({
    roster,
    clock: createStoryClock({ storyMinutes: storyMinutesFromParts(1, 9 * 60) }),
    previousClock: start,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "day-skip-1",
  });
  assert.equal(tick.ticked, true);
  const wed = tick.roster.npcs["npc:wednesday-addams"]!;
  assert.equal(wed.placement.kind, "at");
  if (wed.placement.kind === "at") {
    assert.equal(wed.placement.locationId, "main-hall-classrooms");
  }

  const triggers = collectDirectorTriggers({
    batch: tick.batch,
    roster: tick.roster,
    longSkip: true,
  });
  assert.ok(triggers.some((t) => t.kind === "long_skip_summary"));
  const invocation = maybeBuildDirectorInvocation({
    clock: tick.roster ? createStoryClock({ storyMinutes: storyMinutesFromParts(1, 9 * 60) }) : end.clock,
    roster: tick.roster,
    batch: tick.batch,
    seed: "seed-skip",
    longSkip: true,
  });
  assert.ok(invocation);
  assert.ok(invocation!.npcIds.length >= 1);
  assert.ok(invocation!.estimatedPromptTokens <= invocation!.budget.maxPromptTokens);
});

test("group-chat: multiple participants do not duplicate schedule ticks", () => {
  const effective = resolveEffectiveMap(loadBase());
  const previous = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 8 * 60) });
  const clock = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 9 * 60) });
  let roster = baseRoster();

  const first = tickRoster({
    roster,
    clock,
    previousClock: previous,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "group-chat-42",
  });
  assert.equal(first.ticked, true);
  roster = first.roster;

  // Same exchange, same story time — Enid + Wednesday group reply.
  const second = tickRoster({
    roster,
    clock,
    previousClock: previous,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "group-chat-42",
  });
  assert.equal(second.ticked, false);
  assert.match(second.skippedReason ?? "", /group-chat dedupe/);
  assert.equal(second.batch.moves.length, 0);

  // New exchange may tick again at same clock only if forceTick / different id.
  const third = tickRoster({
    roster,
    clock,
    previousClock: previous,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "group-chat-43",
  });
  assert.equal(third.ticked, true);
});

test("witnessed placement beats schedule; no teleport", () => {
  const effective = resolveEffectiveMap(loadBase());
  let roster = baseRoster();
  roster = setWitnessPin(roster, {
    npcId: "npc:wednesday-addams",
    locationId: "dorm-wednesday-enid",
    pinnedAt: storyMinutesFromParts(0, 8 * 60),
    reason: "player sees Wednesday in dorm",
  });
  const previous = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 8 * 60) });
  const clock = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 9 * 60) });
  const tick = tickRoster({
    roster,
    clock,
    previousClock: previous,
    windows: schoolDayWindows(),
    effective,
    exchangeId: "witness-1",
  });
  const wed = tick.roster.npcs["npc:wednesday-addams"]!;
  assert.equal(wed.placement.kind, "at");
  if (wed.placement.kind === "at") {
    assert.equal(wed.placement.locationId, "dorm-wednesday-enid");
  }
  const move = tick.batch.moves.find((m) => m.npcId === "npc:wednesday-addams");
  assert.equal(move?.applied, false);
  assert.match(move?.reason ?? "", /witnessed/);
  // Expectation may still record class — but isSighting is false.
  const exp = tick.batch.expectations.find((e) => e.npcId === "npc:wednesday-addams");
  assert.equal(exp?.isSighting, false);
});

test("schedule never teleports through sealed crypt gate", () => {
  const base = loadBase();
  const effective = resolveEffectiveMap(base); // crypts sealed by default
  const windows: ScheduleWindowDef[] = [
    {
      id: "win:illegal-crypt",
      scheduleId: "sched:bad",
      npcId: "npc:wednesday-addams",
      startMinuteOfDay: 9 * 60,
      endMinuteOfDay: 12 * 60,
      locationId: "crypts-breath",
      activity: "illegal",
      travelRequired: true,
      priority: "routine",
      certainty: "assumption",
    },
  ];
  const previous = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 8 * 60) });
  const clock = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 9 * 60) });
  const roster = baseRoster();
  const batch = batchAdvanceSchedules({
    clock,
    previousClock: previous,
    windows,
    appointments: [],
    placements: {
      "npc:wednesday-addams": { kind: "at", locationId: "dorm-wednesday-enid" },
    },
    witnessedNpcIds: new Set(),
    interruptedNpcIds: new Set(),
    effective,
  });
  const move = batch.moves.find((m) => m.npcId === "npc:wednesday-addams");
  assert.ok(move);
  assert.equal(move!.routeOk, false);
  assert.equal(move!.applied, false);
  assert.match(move!.reason, /blocked|sealed/);

  const route = tryNpcRoute(
    effective,
    "npc:wednesday-addams",
    "dorm-wednesday-enid",
    "crypts-breath",
  );
  assert.equal(route.ok, false);
});

test("director output validation rejects blocked travel and per-NPC polling", () => {
  const effective = resolveEffectiveMap(loadBase());
  const roster = baseRoster();
  const bad = validateDirectorOutput(
    {
      schemaVersion: 1,
      decisions: [
        {
          npcId: "npc:wednesday-addams",
          action: "travel",
          targetLocationId: "crypts-breath",
          rationale: "sneak in",
          certainty: "assumption",
        },
      ],
      worldEvents: [],
      omittedNpcIds: [],
      perNpcCalls: [{ npcId: "npc:enid-sinclair" }],
    },
    {
      allowedNpcIds: new Set(["npc:wednesday-addams"]),
      roster,
      effective,
      seed: "seed-val",
    },
  );
  assert.equal(bad.ok, false);
  if (!bad.ok) {
    assert.ok(bad.errors.some((e) => /polling|per-NPC/i.test(e) || e.includes("blocked")));
  }

  const good = validateDirectorOutput(
    {
      schemaVersion: 1,
      decisions: [
        {
          npcId: "npc:wednesday-addams",
          action: "wait",
          targetLocationId: null,
          rationale: "stay witnessed in dorm",
          certainty: "sourced",
        },
      ],
      worldEvents: [{ summary: "quiet corridor" }],
      omittedNpcIds: ["npc:enid-sinclair"],
    },
    {
      allowedNpcIds: new Set(["npc:wednesday-addams"]),
      roster,
      effective,
      seed: "seed-val-2",
    },
  );
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.random.seed, "seed-val-2");
    assert.equal(good.applied[0]!.action, "wait");
  }
});

test("operating hours UNKNOWN stays explicit; authored hours evaluate", () => {
  const clock = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 12 * 60) });
  const unknown = isServiceOpenAt(
    {
      serviceId: "svc:dining-hall",
      locationId: "main-hall-dining",
      openMinuteOfDay: null,
      closeMinuteOfDay: null,
      certainty: "unknown",
    },
    clock,
  );
  assert.equal(unknown.open, null);
  assert.match(unknown.reason, /UNKNOWN/);

  const authored = isServiceOpenAt(
    {
      serviceId: "svc:test-office",
      locationId: "main-hall-weems",
      openMinuteOfDay: 8 * 60,
      closeMinuteOfDay: 17 * 60,
      certainty: "assumption",
    },
    clock,
  );
  assert.equal(authored.open, true);
});

test("parse native time phrases and 24h", () => {
  assert.equal(parseNativeTimeToMinuteOfDay("14:05").minuteOfDay, 14 * 60 + 5);
  assert.equal(parseNativeTimeToMinuteOfDay("2:05 PM").minuteOfDay, 14 * 60 + 5);
  assert.equal(parseNativeTimeToMinuteOfDay("noon").minuteOfDay, 12 * 60);
  assert.equal(parseNativeTimeToMinuteOfDay("UNKNOWN").minuteOfDay, null);
});

test("commitment priority outranks routine in deterministic order", () => {
  const effective = resolveEffectiveMap(loadBase());
  // Open a path: dorm → classrooms is already available on surface.
  const windows: ScheduleWindowDef[] = [
    {
      id: "win:routine",
      scheduleId: "s1",
      npcId: "npc:wednesday-addams",
      startMinuteOfDay: 9 * 60,
      endMinuteOfDay: 12 * 60,
      locationId: "main-hall-classrooms",
      activity: "class",
      travelRequired: true,
      priority: "routine",
      certainty: "assumption",
    },
    {
      id: "win:commit",
      scheduleId: "s1",
      npcId: "npc:wednesday-addams",
      startMinuteOfDay: 9 * 60,
      endMinuteOfDay: 12 * 60,
      locationId: "main-hall-dining",
      activity: "promised lunch prep",
      travelRequired: true,
      priority: "commitment",
      certainty: "assumption",
    },
  ];
  const clock = createStoryClock({ storyMinutes: storyMinutesFromParts(0, 9 * 60) });
  const batch = batchAdvanceSchedules({
    clock,
    previousClock: createStoryClock({ storyMinutes: storyMinutesFromParts(0, 8 * 60) }),
    windows,
    appointments: [],
    placements: {
      "npc:wednesday-addams": { kind: "at", locationId: "dorm-wednesday-enid" },
    },
    witnessedNpcIds: new Set(),
    interruptedNpcIds: new Set(),
    effective,
  });
  assert.ok(batch.decisionOrder[0]?.startsWith("1:")); // commitment rank 1 before routine 4
  const applied = batch.moves.find((m) => m.applied);
  assert.equal(applied?.toLocationId, "main-hall-dining");
});

test("branch overlay: unlocking does not mutate base; sealed still blocks until overlay", () => {
  const base = loadBase();
  let overlay = {};
  overlay = setEdgeState(overlay, "crypts-door-1", "crypts-breath", "available");
  const opened = resolveEffectiveMap(base, overlay);
  const sealed = resolveEffectiveMap(base);
  assert.equal(
    tryNpcRoute(sealed, "npc:x", "crypts-door-1", "crypts-breath").ok,
    false,
  );
  // From door-1 to breath may work when overlay opens that edge — only if both in same component.
  // crypts-door-1 → crypts-breath is a gate edge; when available, adjacent hop works.
  const hop = tryNpcRoute(opened, "npc:x", "crypts-door-1", "crypts-breath");
  assert.equal(hop.ok, true);
  // Base definition unchanged
  const door = base.locations.find((l) => l.id === "crypts-door-1");
  const link = door?.links.find((l) => l.targetId === "crypts-breath");
  assert.equal(link?.state, "blocked");
});
