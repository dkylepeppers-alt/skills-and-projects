/**
 * Task 8 — observation and consequence systems.
 *
 * Covers: false rumor, stale sighting, private room, communicated clue,
 * left-behind object, closed business, consequence revisited after branching.
 *
 * Unit proofs only — CompanionHostBridge / tracker / spatial-owner remain PROPOSED.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  AFFORDANCE_HONESTY,
  CONSEQUENCE_HONESTY,
  KNOWLEDGE_HONESTY,
  appendJournalEntry,
  canObservePrivateRoom,
  communicateReport,
  consequenceStillPresent,
  createConsequenceState,
  createJournal,
  createKnowledgeState,
  evaluateServiceOpen,
  forkConsequenceState,
  forkKnowledgeState,
  isSightingStale,
  journalFacts,
  journalLeads,
  leaveObject,
  listAffordances,
  projectForAudience,
  projectPlacement,
  proposeAffordanceAction,
  recordDamage,
  recordRumor,
  recordSighting,
  setActualPlacement,
  setExpectedPlacement,
  setPrivateAccessKnowledge,
  setServiceOverride,
  tickFactionClock,
  upsertFactionClock,
  addSecret,
  type AffordanceDef,
  type LocalServiceDef,
} from "../src/world/index.ts";
import {
  TRACKER_ADAPTER_HONESTY,
  companionMayWriteTrackerDomain,
  createTrackerRegistry,
  linkFactionClockToBond,
  linkObjectToInventory,
  promoteLeadToNativeQuest,
} from "../src/adapters/trackers.ts";
import { SPATIAL_OWNER_ADAPTER_HONESTY } from "../src/adapters/spatial-owner.ts";
import { createStoryClock, storyMinutesFromParts } from "../src/simulation/clock.ts";
import type { ScheduleExpectation } from "../src/simulation/schedules.ts";

const PLAYER = "obs:player";
const NPC_WED = "npc:wednesday-addams";
const LOC_DORM = "dorm-wednesday-enid";
const LOC_DINING = "main-hall-dining";
const LOC_PRIVATE = "dorm-weems-private";
const LOC_SHOP = "jericho-general-store";

function baseKnowledge() {
  return createKnowledgeState({
    campaignId: "campaign:test",
    branchId: "branch:main",
    observerIds: [PLAYER, "obs:enid"],
    actualPlacements: {
      [NPC_WED]: { kind: "at", locationId: LOC_DORM },
    },
  });
}

test("honesty labels: knowledge/affordances/consequences/trackers stay PROPOSED; bridge untouched", () => {
  assert.equal(KNOWLEDGE_HONESTY.companionHostBridge, "PROPOSED");
  assert.equal(AFFORDANCE_HONESTY.silentlyPerformsActions, false);
  assert.equal(CONSEQUENCE_HONESTY.companionHostBridge, "PROPOSED");
  assert.equal(TRACKER_ADAPTER_HONESTY.status, "PROPOSED");
  assert.equal(TRACKER_ADAPTER_HONESTY.liveTrackerApi, "UNVERIFIED");
  assert.equal(TRACKER_ADAPTER_HONESTY.companionHostBridge, "PROPOSED");
  assert.equal(SPATIAL_OWNER_ADAPTER_HONESTY.status, "PROPOSED");
});

test("false rumor does not move actual NPC placement", () => {
  let state = baseKnowledge();
  const before = state.actualPlacements[NPC_WED];
  state = recordRumor(state, {
    reportId: "rpt:false-1",
    holderObserverId: PLAYER,
    sourceObserverId: "obs:enid",
    npcId: NPC_WED,
    claimedLocationId: LOC_DINING,
    storyMinutes: 100,
    summary: "Someone said Wednesday is in the dining hall",
    falseClaim: true,
  });
  assert.deepEqual(state.actualPlacements[NPC_WED], before);
  assert.equal(state.actualPlacements[NPC_WED]?.kind, "at");
  if (state.actualPlacements[NPC_WED]?.kind === "at") {
    assert.equal(state.actualPlacements[NPC_WED].locationId, LOC_DORM);
  }
  const known = state.observers[PLAYER]!.rumoredNpcPlacements[NPC_WED];
  assert.equal(known?.kind, "at");
  if (known?.kind === "at") assert.equal(known.locationId, LOC_DINING);
  const proj = projectPlacement(state, NPC_WED, PLAYER);
  assert.equal(proj.labels.known, "rumor");
  assert.equal(proj.labels.actual, "actual");
  assert.notEqual(
    proj.known && proj.known.kind === "at" ? proj.known.locationId : null,
    proj.actual && proj.actual.kind === "at" ? proj.actual.locationId : null,
  );
});

test("stale sighting flagged when actual diverges or age exceeds window", () => {
  let state = baseKnowledge();
  state = recordSighting(state, {
    reportId: "rpt:sight-1",
    observerId: PLAYER,
    npcId: NPC_WED,
    locationId: LOC_DORM,
    storyMinutes: 60,
    summary: "Saw Wednesday in the dorm",
  });
  state = setActualPlacement(state, NPC_WED, { kind: "at", locationId: LOC_DINING });
  const expectation: ScheduleExpectation = {
    npcId: NPC_WED,
    windowId: "win:dining",
    locationId: LOC_DINING,
    activity: "meals",
    priority: "routine",
    certainty: "assumption",
    isSighting: false,
  };
  state = setExpectedPlacement(state, expectation);
  const proj = projectPlacement(state, NPC_WED, PLAYER);
  assert.equal(proj.labels.lastSeen, "last-seen");
  assert.equal(proj.labels.expected, "expected");
  assert.equal(proj.expected?.isSighting, false);
  const staleByDivergence = isSightingStale(proj, 90, 120);
  assert.equal(staleByDivergence.stale, true);
  assert.match(staleByDivergence.reason, /diverged/);
  const staleByAge = isSightingStale(proj, 60 + 200, 120);
  assert.equal(staleByAge.stale, true);
  assert.match(staleByAge.reason, /exceeds/);
});

test("private room: physical access, knowledge, and permission stay separate; no unearned interior", () => {
  let state = baseKnowledge();
  state = addSecret(state, {
    secretId: "secret:weems-letter",
    subjectId: LOC_PRIVATE,
    subjectKind: "location",
    summary: "hidden letter",
    detail: "AUTHOR ONLY: Weems keeps a sealed letter under the blotter",
    knownByObserverIds: [],
    visibility: "author",
  });

  // Unknown entrance — no interior knowledge
  let access = canObservePrivateRoom(state, {
    observerId: PLAYER,
    locationId: LOC_PRIVATE,
    physicallyOpen: true,
    permissionGranted: true,
  });
  assert.equal(access.mayEnter, false);
  assert.equal(access.mayKnowInterior, false);
  assert.match(access.reason, /unknown/);

  // Knows entrance but no permission
  state = setPrivateAccessKnowledge(state, PLAYER, LOC_PRIVATE, true);
  access = canObservePrivateRoom(state, {
    observerId: PLAYER,
    locationId: LOC_PRIVATE,
    physicallyOpen: true,
    permissionGranted: false,
  });
  assert.equal(access.mayEnter, false);
  assert.match(access.reason, /permission/);

  // Full access
  access = canObservePrivateRoom(state, {
    observerId: PLAYER,
    locationId: LOC_PRIVATE,
    physicallyOpen: true,
    permissionGranted: true,
  });
  assert.equal(access.mayEnter, true);

  // Secrets never appear in player or character projections
  const playerView = projectForAudience(state, "player", PLAYER);
  const charView = projectForAudience(state, "character", PLAYER);
  const authorView = projectForAudience(state, "author", PLAYER);
  assert.equal(playerView.secrets.length, 0);
  assert.equal(charView.secrets.length, 0);
  assert.equal(authorView.secrets.length, 1);
  assert.match(authorView.secrets[0]!.detail, /AUTHOR ONLY/);
  assert.ok(!JSON.stringify(playerView).includes("sealed letter under the blotter"));
  assert.ok(!JSON.stringify(charView).includes("sealed letter under the blotter"));
});

test("communicated clue transfers evidence-based knowledge without inventing confirmation", () => {
  let state = baseKnowledge();
  state = communicateReport(state, {
    reportId: "rpt:clue-1",
    fromObserverId: "obs:enid",
    toObserverId: PLAYER,
    clueId: "clue:crypt-key",
    subjectId: "loc:nightshades-crypt",
    claimedLocationId: "nightshades-crypt",
    summary: "Enid says a brass key was under the chapel pew",
    storyMinutes: 200,
  });
  const player = state.observers[PLAYER]!;
  assert.ok(player.knownClueIds.includes("clue:crypt-key"));
  const report = state.reports["rpt:clue-1"]!;
  assert.equal(report.certainty, "communicated");
  assert.equal(report.kind, "clue");
  assert.ok(report.evidence && report.evidence.length > 0);

  const view = projectForAudience(state, "player", PLAYER);
  const clueReport = view.reports.find((r) => r.reportId === "rpt:clue-1");
  assert.ok(clueReport);
  assert.equal(clueReport!.certainty, "communicated");
  // Not confirmed actual — no automatic placement of key as "confirmed"
  assert.notEqual(clueReport!.certainty, "confirmed");
});

test("left-behind object persists at location and links to inventory without duplicate", () => {
  let consequences = createConsequenceState({
    campaignId: "campaign:test",
    branchId: "branch:main",
  });
  consequences = leaveObject(consequences, {
    objectId: "obj:lantern",
    locationId: LOC_DORM,
    label: "brass lantern",
    leftByActorId: PLAYER,
    storyMinutes: 300,
    searchable: true,
  });
  assert.equal(consequences.objects["obj:lantern"]?.locationId, LOC_DORM);

  let registry = createTrackerRegistry();
  const linked = linkObjectToInventory(registry, {
    object: consequences.objects["obj:lantern"]!,
    nativeItem: { nativeItemId: "inv:lantern-1", label: "brass lantern", quantity: 1 },
  });
  assert.equal(linked.result.ok, true);
  registry = linked.registry;

  const dup = linkObjectToInventory(registry, {
    object: consequences.objects["obj:lantern"]!,
    nativeItem: { nativeItemId: "inv:lantern-OTHER", label: "brass lantern", quantity: 1 },
  });
  assert.equal(dup.result.ok, false);
  if (!dup.result.ok) assert.match(dup.result.reason, /already linked/);
});

test("closed business blocks buy affordance; proposal never silently performs", () => {
  const clock = createStoryClock({
    storyMinutes: storyMinutesFromParts(1, 22 * 60), // 10pm
    certainty: "sourced",
  });
  const service: LocalServiceDef = {
    serviceId: "svc:general-store",
    locationId: LOC_SHOP,
    label: "Jericho General Store",
    hours: {
      openMinuteOfDay: 9 * 60,
      closeMinuteOfDay: 18 * 60,
      certainty: "sourced",
    },
  };
  const openCheck = evaluateServiceOpen(service, clock);
  assert.equal(openCheck.open, false);

  let knowledge = createKnowledgeState({
    campaignId: "campaign:test",
    branchId: "branch:main",
    observerIds: [PLAYER],
  });
  knowledge = setPrivateAccessKnowledge(knowledge, PLAYER, LOC_SHOP, true);

  const buy: AffordanceDef = {
    id: "aff:buy-store",
    kind: "buy",
    locationId: LOC_SHOP,
    label: "Buy supplies",
    requiresKnownLocation: true,
    requiresOpenService: true,
    serviceId: "svc:general-store",
  };
  const listed = listAffordances({
    knowledge,
    observerId: PLAYER,
    locationId: LOC_SHOP,
    clock,
    occupants: [],
    services: [service],
    clues: [],
    objectsPresent: [],
    physicallyOpen: true,
    permissionGranted: true,
    affordances: [buy],
  });
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.available, false);
  assert.match(listed[0]!.reason, /outside authored hours|closed|hours/i);

  // Forced closed even during open hours
  const dayClock = createStoryClock({
    storyMinutes: storyMinutesFromParts(1, 12 * 60),
    certainty: "sourced",
  });
  const forced: LocalServiceDef = {
    ...service,
    forcedClosed: true,
    forcedClosedReason: "boarded up after the storm",
  };
  const forcedList = listAffordances({
    knowledge,
    observerId: PLAYER,
    locationId: LOC_SHOP,
    clock: dayClock,
    occupants: [],
    services: [forced],
    clues: [],
    objectsPresent: [],
    physicallyOpen: true,
    permissionGranted: true,
    affordances: [buy],
  });
  assert.equal(forcedList[0]!.available, false);

  const proposal = proposeAffordanceAction(
    { ...forcedList[0]!, available: true, reason: "forced available for proposal shape" },
    PLAYER,
  );
  // Even when available, performed is always false
  const openList = listAffordances({
    knowledge,
    observerId: PLAYER,
    locationId: LOC_SHOP,
    clock: dayClock,
    occupants: [],
    services: [service],
    clues: [],
    objectsPresent: [],
    physicallyOpen: true,
    permissionGranted: true,
    affordances: [buy],
  });
  assert.equal(openList[0]!.available, true);
  const okProposal = proposeAffordanceAction(openList[0]!, PLAYER);
  assert.equal(okProposal.proposed, true);
  assert.equal(okProposal.performed, false);
  assert.equal(okProposal.honesty.silentlyPerformsActions, false);
  void proposal;
});

test("consequence revisited after branching preserves left-behind object and damage", () => {
  let main = createConsequenceState({
    campaignId: "campaign:test",
    branchId: "branch:main",
  });
  main = leaveObject(main, {
    objectId: "obj:note",
    locationId: LOC_DORM,
    label: "hastily written note",
    leftByActorId: PLAYER,
    storyMinutes: 400,
    searchable: true,
  });
  main = recordDamage(main, {
    damageId: "dmg:broken-lock",
    locationId: LOC_DORM,
    summary: "dorm lock forced open",
    storyMinutes: 400,
    severity: "functional",
  });
  main = upsertFactionClock(main, {
    clockId: "clock:nightshades",
    factionId: "faction:nightshades",
    label: "Nightshade suspicion",
    segments: 6,
    filled: 2,
  });
  main = tickFactionClock(main, "clock:nightshades", 1, 410);
  assert.equal(main.factionClocks["clock:nightshades"]!.filled, 3);

  const branchA = forkConsequenceState(main, "branch:alt-a");
  const branchB = forkConsequenceState(main, "branch:alt-b");

  assert.equal(branchA.branchId, "branch:alt-a");
  assert.ok(consequenceStillPresent(branchA, { objectId: "obj:note", damageId: "dmg:broken-lock" }));
  assert.ok(consequenceStillPresent(branchB, { objectId: "obj:note", clockId: "clock:nightshades" }));

  // Divergent edit on A does not erase B's inheritance
  const afterA = leaveObject(branchA, {
    objectId: "obj:only-on-a",
    locationId: LOC_DINING,
    label: "branch A only",
    storyMinutes: 500,
    searchable: false,
  });
  assert.ok(afterA.objects["obj:only-on-a"]);
  assert.equal(branchB.objects["obj:only-on-a"], undefined);
  assert.ok(consequenceStillPresent(branchB, { objectId: "obj:note" }));

  // Knowledge fork similarly preserves reports
  let knowledge = baseKnowledge();
  knowledge = recordSighting(knowledge, {
    reportId: "rpt:pre-branch",
    observerId: PLAYER,
    npcId: NPC_WED,
    locationId: LOC_DORM,
    storyMinutes: 50,
  });
  const kBranch = forkKnowledgeState(knowledge, "branch:alt-a");
  assert.ok(kBranch.reports["rpt:pre-branch"]);
  assert.equal(kBranch.branchId, "branch:alt-a");
});

test("location journal distinguishes established facts from leads", () => {
  let journal = createJournal(LOC_DORM);
  journal = appendJournalEntry(journal, {
    entryId: "je:1",
    locationId: LOC_DORM,
    kind: "fact",
    summary: "Dorm window faces the quad",
    storyMinutes: 10,
    observerId: PLAYER,
    established: true,
  });
  journal = appendJournalEntry(journal, {
    entryId: "je:2",
    locationId: LOC_DORM,
    kind: "lead",
    summary: "Strange mud near the wardrobe",
    storyMinutes: 20,
    observerId: PLAYER,
    linkedClueId: "clue:mud",
    established: false,
  });
  journal = appendJournalEntry(journal, {
    entryId: "je:3",
    locationId: LOC_DORM,
    kind: "rumor",
    summary: "Ghost in the vents",
    storyMinutes: 30,
    observerId: PLAYER,
    established: false,
  });
  assert.equal(journalFacts(journal).length, 1);
  assert.equal(journalLeads(journal).length, 2);
});

test("tracker adapter: promote lead once; reject duplicate quest identity and conflicting bond scale", () => {
  assert.equal(companionMayWriteTrackerDomain("quests"), false);
  assert.equal(companionMayWriteTrackerDomain("inventory"), false);
  assert.equal(companionMayWriteTrackerDomain("bonds"), false);

  let registry = createTrackerRegistry();
  const clue = {
    clueId: "clue:crypt-key",
    summary: "brass key",
    storyMinutes: 200,
  };
  const promoted = promoteLeadToNativeQuest(registry, {
    clue,
    nativeQuest: { nativeQuestId: "quest:find-key", title: "Find the brass key", scale: "personal" },
  });
  assert.equal(promoted.result.ok, true);
  assert.equal(promoted.result.honesty.status, "PROPOSED");
  if (promoted.result.ok) assert.equal(promoted.result.nativeOwnerInvoked, false);
  registry = promoted.registry;

  const dupLead = promoteLeadToNativeQuest(registry, {
    clue,
    nativeQuest: { nativeQuestId: "quest:OTHER", title: "Other" },
  });
  assert.equal(dupLead.result.ok, false);

  const dupNative = promoteLeadToNativeQuest(registry, {
    clue: { clueId: "clue:other", summary: "other", storyMinutes: 201 },
    nativeQuest: { nativeQuestId: "quest:find-key", title: "Find the brass key" },
  });
  assert.equal(dupNative.result.ok, false);

  // Companion writer refused
  const companionWrite = promoteLeadToNativeQuest(registry, {
    clue: { clueId: "clue:x", summary: "x", storyMinutes: 1 },
    nativeQuest: { nativeQuestId: "quest:x", title: "x" },
    writer: "companion",
  });
  assert.equal(companionWrite.result.ok, false);

  let clockState = createConsequenceState({
    campaignId: "campaign:test",
    branchId: "branch:main",
  });
  clockState = upsertFactionClock(clockState, {
    clockId: "clock:nightshades",
    factionId: "faction:nightshades",
    label: "Nightshade suspicion",
    segments: 6,
    filled: 1,
  });
  const bond1 = linkFactionClockToBond(registry, {
    clock: clockState.factionClocks["clock:nightshades"]!,
    bond: {
      nativeBondId: "bond:player-nightshades",
      actorId: PLAYER,
      targetId: "faction:nightshades",
      scale: "0-100",
      value: 10,
    },
  });
  assert.equal(bond1.result.ok, true);
  registry = bond1.registry;

  // Conflicting scale for same pair
  clockState = upsertFactionClock(clockState, {
    clockId: "clock:nightshades-2",
    factionId: "faction:nightshades",
    label: "other clock",
    segments: 4,
    filled: 0,
  });
  const conflict = linkFactionClockToBond(registry, {
    clock: clockState.factionClocks["clock:nightshades-2"]!,
    bond: {
      nativeBondId: "bond:player-nightshades-b",
      actorId: PLAYER,
      targetId: "faction:nightshades",
      scale: "letters-A-F",
      value: 1,
    },
  });
  assert.equal(conflict.result.ok, false);
  if (!conflict.result.ok) assert.match(conflict.result.reason, /conflicting bond scale/);
});

test("service override consequence closes business independently of hours", () => {
  let consequences = createConsequenceState({
    campaignId: "campaign:test",
    branchId: "branch:main",
  });
  consequences = setServiceOverride(consequences, {
    serviceId: "svc:general-store",
    locationId: LOC_SHOP,
    closed: true,
    reason: "sheriff padlocked the store",
    storyMinutes: 600,
  });
  assert.equal(consequences.serviceOverrides["svc:general-store"]?.closed, true);

  const clock = createStoryClock({
    storyMinutes: storyMinutesFromParts(2, 12 * 60),
    certainty: "sourced",
  });
  const service: LocalServiceDef = {
    serviceId: "svc:general-store",
    locationId: LOC_SHOP,
    label: "Jericho General Store",
    hours: { openMinuteOfDay: 9 * 60, closeMinuteOfDay: 18 * 60, certainty: "sourced" },
    forcedClosed: consequences.serviceOverrides["svc:general-store"]!.closed,
    forcedClosedReason: consequences.serviceOverrides["svc:general-store"]!.reason,
  };
  const check = evaluateServiceOpen(service, clock);
  assert.equal(check.open, false);
  assert.match(check.reason, /padlocked|forced closed/i);
});
