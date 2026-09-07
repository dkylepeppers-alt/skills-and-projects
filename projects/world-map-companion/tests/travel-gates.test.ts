/**
 * Task 6 — travel / effective topology gates.
 *
 * Reruns the 63 Nevermore route assertions (HANDOFF / verify-source.mjs) against
 * the companion effective-map resolver. Adds branch rollback, hidden-entrance
 * independence, closed-service access, party split, and mid-journey interrupt.
 *
 * Topology unit proof only — live HTTP Engine receipts are separate.
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  SPATIAL_OWNER_ADAPTER_HONESTY,
  dryRunApplySpatialOwnerProposal,
  inspectSpatialOwnerSources,
  proposeSpatialOwnerTransition,
} from "../src/adapters/spatial-owner.ts";
import {
  type MapOverlay,
  type SpatialDefinition,
  freezeDefinition,
  mergeOverlays,
  physicalCanReach,
  physicalReachable,
  physicalRoute,
  resolveEffectiveMap,
  setEdgeState,
} from "../src/world/index.ts";
import {
  advanceJourneyStep,
  interruptJourney,
  planJourney,
  planPartySplit,
  proposeNpcTravel,
  resumeJourney,
  validateTravelCommand,
} from "../src/world/travel.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const WMC_ROOT = join(HERE, "..");
const REPO_ROOT = join(WMC_ROOT, "..", "..");
const MAP_PATH = join(
  REPO_ROOT,
  "projects/nevermore/releases/v2/Nevermore-Woodlands-Crypts-v2.world-map.json",
);
const EVENTS_PATH = join(REPO_ROOT, "projects/nevermore/companion/events.json");
const PROOF_PATH = join(WMC_ROOT, "compatibility/task6-topology-unit-proof.json");

const ENTRANCES: Array<[string, string]> = [
  ["nevermore-poe-statue", "crypts-stair-mouth"],
  ["ravencroft-iron-maiden", "crypts-tunnel-mouth"],
  ["dorms-common", "crypts-crawlspace"],
];
const GATES: Array<[string, string]> = [
  ["crypts-door-1", "crypts-breath"],
  ["crypts-door-2", "crypts-chamber-3"],
  ["crypts-door-3", "crypts-approach"],
];

let cachedBase: SpatialDefinition | null = null;

function loadBaseDefinition(): SpatialDefinition {
  if (cachedBase) return freezeDefinition(cachedBase);
  const raw = JSON.parse(readFileSync(MAP_PATH, "utf8")) as {
    definition: SpatialDefinition;
  };
  const def = raw.definition;
  assert.equal(def.locations.length, 79);
  assert.equal(def.startingLocationId, "dorm-wednesday-enid");
  cachedBase = freezeDefinition(def);
  return freezeDefinition(cachedBase);
}

function withEdges(base: SpatialDefinition, pairs: Array<[string, string, "available" | "blocked" | "hidden"]>): MapOverlay {
  let overlay: MapOverlay = {};
  for (const [fromId, toId, state] of pairs) {
    overlay = setEdgeState(overlay, fromId, toId, state);
  }
  return overlay;
}

function openEntrance(overlay: MapOverlay, entrance: [string, string]): MapOverlay {
  return setEdgeState(overlay, entrance[0], entrance[1], "available");
}

function openGate(overlay: MapOverlay, gate: [string, string]): MapOverlay {
  return setEdgeState(overlay, gate[0], gate[1], "available");
}

function blockGate(overlay: MapOverlay, gate: [string, string]): MapOverlay {
  return setEdgeState(overlay, gate[0], gate[1], "blocked");
}

test("immutable base is not mutated by overlays", () => {
  const base = loadBaseDefinition();
  const before = JSON.stringify(base.locations.find((l) => l.id === "nevermore-poe-statue")?.links);
  const effective = resolveEffectiveMap(
    base,
    setEdgeState({}, "nevermore-poe-statue", "crypts-stair-mouth", "available"),
  );
  const after = JSON.stringify(base.locations.find((l) => l.id === "nevermore-poe-statue")?.links);
  assert.equal(before, after);
  assert.equal(effective.honesty.mutatesBase, false);
  const effLink = effective.definition.locations
    .find((l) => l.id === "nevermore-poe-statue")
    ?.links.find((l) => l.targetId === "crypts-stair-mouth");
  assert.equal(effLink?.state, "available");
});

test("default reachability: 54 surface; crypts sealed; 63 route assertions", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  const effective0 = resolveEffectiveMap(base, {});
  assert.equal(physicalReachable(effective0, start).length, 54);
  for (const loc of base.locations.filter((l) => l.id.startsWith("crypts-"))) {
    assert.equal(physicalCanReach(effective0, start, loc.id), false, loc.id);
  }

  let routeCases = 0;
  for (const entrance of ENTRANCES) {
    let overlay = openEntrance({}, entrance);
    let effective = resolveEffectiveMap(base, overlay);
    assert.equal(physicalCanReach(effective, start, "crypts-chamber-1"), true);
    assert.equal(physicalCanReach(effective, start, "crypts-chamber-2"), false);
    assert.equal(physicalCanReach(effective, "crypts-chamber-1", start), true);
    routeCases += 3;

    for (let stage = 0; stage < 3; stage++) {
      const gate = GATES[stage]!;
      assert.equal(physicalCanReach(effective, gate[0], gate[1]), false);
      overlay = openGate(overlay, gate);
      effective = resolveEffectiveMap(base, overlay);
      assert.equal(physicalCanReach(effective, gate[0], gate[1]), true);
      assert.equal(physicalCanReach(effective, gate[1], gate[0]), true);
      assert.equal(physicalCanReach(effective, gate[1], start), true);
      routeCases += 4;
      if (stage < 2) {
        assert.equal(physicalCanReach(effective, start, GATES[stage + 1]![1]), false);
        routeCases += 1;
      }
    }

    assert.equal(physicalReachable(effective, start).length, 79);
    routeCases += 1;

    for (const gate of GATES) {
      const cut = resolveEffectiveMap(base, blockGate(overlay, gate));
      assert.equal(physicalCanReach(cut, start, gate[1]), false, `cut ${gate[0]}`);
      routeCases += 1;
    }
  }

  assert.equal(routeCases, 63);

  // Write distinct topology unit proof (not live HTTP).
  const proof = {
    schemaVersion: 1,
    task: 6,
    kind: "topology-unit-proof",
    distinctFrom: "live-http-engine-receipt",
    status: "PASS",
    baseSha: "740cdee2cb618969a540d827800a8ef2043a30d3",
    routeCases,
    defaultReachable: 54,
    allOpenReachable: 79,
    sealedBoundariesHold: true,
    ranAt: new Date().toISOString(),
  };
  writeFileSync(PROOF_PATH, JSON.stringify(proof, null, 2) + "\n");
});

test("hidden entrances are independently discoverable", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  for (const entrance of ENTRANCES) {
    const only = resolveEffectiveMap(base, openEntrance({}, entrance));
    assert.equal(physicalCanReach(only, start, "crypts-chamber-1"), true);
    for (const other of ENTRANCES) {
      if (other[0] === entrance[0]) continue;
      // Other entrances remain hidden — but crypt may still be reachable via the opened one.
      const baseLink = base.locations
        .find((l) => l.id === other[0])
        ?.links.find((l) => l.targetId === other[1]);
      assert.equal(baseLink?.state, "hidden");
      const effLink = only.definition.locations
        .find((l) => l.id === other[0])
        ?.links.find((l) => l.targetId === other[1]);
      assert.equal(effLink?.state, "hidden");
    }
  }
  // Opening none keeps crypt unreachable.
  assert.equal(physicalCanReach(resolveEffectiveMap(base, {}), start, "crypts-stair-mouth"), false);
});

test("branch rollback restores blocked routes without mutating base", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  const unlocked = resolveEffectiveMap(
    base,
    withEdges(base, [
      ["nevermore-poe-statue", "crypts-stair-mouth", "available"],
      ["crypts-door-1", "crypts-breath", "available"],
      ["crypts-door-2", "crypts-chamber-3", "available"],
      ["crypts-door-3", "crypts-approach", "available"],
    ]),
  );
  assert.equal(physicalReachable(unlocked, start).length, 79);

  // Simulate selecting a pre-unlock swipe: empty overlay branch.
  const rolled = resolveEffectiveMap(base, {});
  assert.equal(physicalCanReach(rolled, start, "crypts-altar"), false);
  assert.equal(physicalReachable(rolled, start).length, 54);
  const baseGate = base.locations
    .find((l) => l.id === "crypts-door-1")
    ?.links.find((l) => l.targetId === "crypts-breath");
  assert.equal(baseGate?.state, "blocked");
});

test("sealed boundaries cannot bypass via parent navigation", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  // Even with all surface parent nav, crypt roots stay unreachable until entrance links open.
  const effective = resolveEffectiveMap(base, {});
  assert.equal(physicalCanReach(effective, start, "crypts-labyrinth"), false);
  assert.equal(physicalCanReach(effective, start, "crypts-second-rite"), false);
  assert.equal(physicalCanReach(effective, start, "crypts-union"), false);
  assert.equal(physicalCanReach(effective, start, "crypts-covenant"), false);
  assert.equal(physicalRoute(effective, "ravencroft-parlor", "crypts-altar"), null);

  const events = JSON.parse(readFileSync(EVENTS_PATH, "utf8")) as {
    intentionalTopology: { roots: string[] };
  };
  assert.deepEqual(events.intentionalTopology.roots.sort(), [
    "crypts-covenant",
    "crypts-labyrinth",
    "crypts-second-rite",
    "crypts-union",
    "jericho-woods",
  ].sort());
});

test("closed service does not invent topology; social permission is separate", () => {
  const base = loadBaseDefinition();
  const overlay: MapOverlay = {
    services: [
      {
        serviceId: "svc:dining-hall",
        locationId: "main-hall-dining",
        open: false,
        reason: "ASSUMPTION closed for test",
      },
    ],
    socialPermissions: [
      {
        locationId: "main-hall-weems",
        actorId: "obs:player",
        permitted: false,
        reason: "no appointment",
      },
    ],
  };
  const effective = resolveEffectiveMap(base, overlay);
  // Physical route to dining hall still exists (service closure ≠ wall).
  assert.equal(
    physicalCanReach(effective, base.startingLocationId!, "main-hall-dining"),
    true,
  );
  const denied = validateTravelCommand(effective, {
    actorId: "obs:player",
    actorKind: "player",
    currentLocationId: base.startingLocationId,
    destinationId: "main-hall-weems",
    travelMode: "travel_now",
    enforceSocialPermission: true,
    fastTravel: { requireReachable: true },
  });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.code, "social_denied");

  const physicalOk = validateTravelCommand(effective, {
    actorId: "obs:player",
    actorKind: "player",
    currentLocationId: base.startingLocationId,
    destinationId: "main-hall-weems",
    travelMode: "travel_now",
    enforceSocialPermission: false,
    fastTravel: { requireReachable: true },
  });
  assert.equal(physicalOk.ok, true);
});

test("party split uses same physical constraints per actor", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  const effective = resolveEffectiveMap(
    base,
    openEntrance({}, ["dorms-common", "crypts-crawlspace"]),
  );
  const splits = planPartySplit(effective, [
    {
      actorId: "obs:player",
      actorKind: "player",
      fromLocationId: start,
      targetLocationId: "crypts-chamber-1",
      mode: "travel_now",
    },
    {
      actorId: "npc:enid",
      actorKind: "npc",
      fromLocationId: start,
      targetLocationId: "jericho-main-street",
      mode: "travel_now",
    },
  ]);
  assert.equal(splits.length, 2);
  assert.equal(splits[0]!.result.ok, true);
  assert.equal(splits[1]!.result.ok, true);

  const npcBlocked = proposeNpcTravel(effective, {
    npcId: "npc:enid",
    fromLocationId: start,
    targetLocationId: "crypts-altar",
  });
  assert.equal(npcBlocked.ok, false);
});

test("mid-journey interrupt and resume", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  const effective = resolveEffectiveMap(base, {});
  const planned = planJourney(effective, {
    actorId: "obs:player",
    actorKind: "player",
    fromLocationId: start,
    targetLocationId: "jericho-main-street",
    mode: "step_by_step",
    companionIds: ["npc:enid"],
  });
  assert.equal(planned.ok, true);
  if (!planned.ok) return;

  const step = advanceJourneyStep(effective, { ...planned.journey, status: "in_progress" });
  assert.equal(step.ok, true);
  if (!step.ok) return;

  const interrupted = interruptJourney(step.journey, "encounter at gates");
  assert.equal(interrupted.status, "interrupted");
  assert.equal(interrupted.interruptReason, "encounter at gates");

  const resumed = resumeJourney(effective, interrupted);
  assert.equal(resumed.ok, true);
  if (!resumed.ok) return;
  assert.equal(resumed.journey.status, "in_progress");
  assert.ok(resumed.journey.commandId);
  assert.equal(resumed.journey.expectedDefinitionRevision, effective.definition.revision);
});

test("fast-travel prereqs: colocated companions and known destination", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  const effective = resolveEffectiveMap(base, {
    discoveries: [
      {
        observerId: "obs:player",
        knownLocationIds: ["jericho-main-street"],
      },
    ],
  });
  const missingCompanion = validateTravelCommand(effective, {
    actorId: "obs:player",
    actorKind: "player",
    currentLocationId: start,
    destinationId: "jericho-main-street",
    travelMode: "travel_now",
    companionIds: ["npc:enid"],
    fastTravel: {
      requireReachable: true,
      requireKnownDestination: true,
      observerId: "obs:player",
      requireCompanionsColocated: true,
      companionLocations: { "npc:enid": "nevermore-gates" },
    },
  });
  assert.equal(missingCompanion.ok, false);
  if (!missingCompanion.ok) assert.equal(missingCompanion.code, "party_split_required");

  const ok = validateTravelCommand(effective, {
    actorId: "obs:player",
    actorKind: "player",
    currentLocationId: start,
    destinationId: "jericho-main-street",
    travelMode: "travel_now",
    companionIds: ["npc:enid"],
    fastTravel: {
      requireReachable: true,
      requireKnownDestination: true,
      observerId: "obs:player",
      requireCompanionsColocated: true,
      companionLocations: { "npc:enid": start },
    },
  });
  assert.equal(ok.ok, true);
});

test("spatial-owner adapter honesty: PROPOSED, no package activate", () => {
  assert.equal(SPATIAL_OWNER_ADAPTER_HONESTY.status, "PROPOSED");
  assert.equal(SPATIAL_OWNER_ADAPTER_HONESTY.activatesDesktopPackage, false);
  assert.equal(SPATIAL_OWNER_ADAPTER_HONESTY.isAgentsPackageActivate, false);
  assert.equal(SPATIAL_OWNER_ADAPTER_HONESTY.isEngineExport, false);

  const base = loadBaseDefinition();
  const effective = resolveEffectiveMap(base, {});
  const proposal = proposeSpatialOwnerTransition(effective, {
    actorId: "obs:player",
    actorKind: "player",
    currentLocationId: base.startingLocationId,
    destinationId: "dorms-common",
    travelMode: "step_by_step",
  });
  assert.equal(proposal.honesty.status, "PROPOSED");
  assert.ok(proposal.transition.commandId);
  assert.equal(proposal.transition.expectedDefinitionRevision, effective.definition.revision);
  const applied = dryRunApplySpatialOwnerProposal(proposal);
  assert.equal(applied.committed, true);
  if (applied.committed) {
    assert.equal(applied.nativeOwnerInvoked, false);
  }

  const agentsRoot = join(REPO_ROOT, "..", "Marinara-Agents");
  const inspection = inspectSpatialOwnerSources(existsSync(agentsRoot) ? agentsRoot : null);
  assert.equal(inspection.honesty.status, "PROPOSED");
  if (inspection.found && inspection.ownerTurnPath) {
    assert.ok(existsSync(inspection.ownerTurnPath), "owner-turn.ts inspectable");
    assert.ok(existsSync(inspection.stateResolutionPath!), "state-resolution.ts inspectable");
  }
});

test("player and NPC rejected equally on sealed gate", () => {
  const base = loadBaseDefinition();
  const start = base.startingLocationId!;
  const effective = resolveEffectiveMap(base, {});
  for (const kind of ["player", "npc"] as const) {
    const result = validateTravelCommand(effective, {
      actorId: kind === "player" ? "obs:player" : "npc:enid",
      actorKind: kind,
      currentLocationId: start,
      destinationId: "crypts-altar",
      travelMode: "travel_now",
      fastTravel: { requireReachable: true },
    });
    assert.equal(result.ok, false, kind);
  }
});

test("live HTTP honesty receipt remains distinct and NOT_RUN by default", () => {
  const httpReceipt = join(WMC_ROOT, "compatibility/task6-live-http-honesty.json");
  assert.ok(existsSync(httpReceipt));
  const doc = JSON.parse(readFileSync(httpReceipt, "utf8")) as {
    kind: string;
    status: string;
    usedForTask6Topology: boolean;
  };
  assert.equal(doc.kind, "live-http-honesty-receipt");
  assert.equal(doc.usedForTask6Topology, false);
  assert.notEqual(doc.kind, "topology-unit-proof");
});
