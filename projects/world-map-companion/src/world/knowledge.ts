/**
 * Observer knowledge projections (Task 8).
 *
 * Separates actual world state, player knowledge, and each NPC's knowledge.
 * Sightings, rumors, and communicated reports carry source + time; a false
 * rumor never moves the real NPC. Secrets stay out of player-view / character
 * prompts. Schedules predict expected whereabouts — they are not sightings.
 */

import type {
  EvidenceSpan,
  NpcPlacement,
  ObserverKnowledge,
  StableId,
} from "../contracts.ts";
import type { ScheduleExpectation } from "../simulation/schedules.ts";

export const KNOWLEDGE_HONESTY = {
  kind: "companion-observer-knowledge" as const,
  companionHostBridge: "PROPOSED" as const,
  spatialOwner: "PROPOSED" as const,
  capabilityDocumentStore: false as const,
  isEngineExport: false as const,
  notes: [
    "Projections filter secrets before player-view and character prompts.",
    "Expected placements come from schedules; they are never sightings.",
    "CompanionHostBridge remains PROPOSED; this module does not change that.",
  ],
};

export type KnowledgeCertainty =
  | "confirmed"
  | "sighting"
  | "communicated"
  | "rumor"
  | "expected"
  | "unknown";

export type ReportKind = "sighting" | "rumor" | "communication" | "clue";

/** Authoritative secret / author-only fact attached to a location or NPC. */
export type SecretFact = {
  secretId: StableId;
  subjectId: StableId;
  subjectKind: "location" | "npc" | "object";
  summary: string;
  /** Full text — never included in player-view or character prompts. */
  detail: string;
  knownByObserverIds: StableId[];
  visibility: "author" | "system";
};

export type KnowledgeReport = {
  reportId: StableId;
  kind: ReportKind;
  subjectId: StableId;
  claimedLocationId?: StableId | null;
  claimedSummary: string;
  sourceObserverId: StableId;
  holderObserverId: StableId;
  storyMinutes: number;
  certainty: KnowledgeCertainty;
  evidence?: EvidenceSpan[];
  falseClaim?: boolean;
  clueId?: StableId;
};

export type ObserverKnowledgeState = ObserverKnowledge & {
  displayName?: string;
  knownSecretIds: StableId[];
  reportIds: StableId[];
  knownClueIds: StableId[];
  knownPrivateAccess: Record<string, boolean>;
};

export type WorldKnowledgeState = {
  schemaVersion: 1;
  campaignId: StableId;
  branchId: StableId;
  actualPlacements: Record<string, NpcPlacement>;
  secrets: Record<string, SecretFact>;
  observers: Record<string, ObserverKnowledgeState>;
  reports: Record<string, KnowledgeReport>;
  expectedByNpc: Record<string, ScheduleExpectation | null>;
};

export type PlacementProjection = {
  npcId: StableId;
  actual: NpcPlacement | null;
  known: NpcPlacement | null;
  lastSeen: { locationId?: StableId; at?: string; storyMinutes?: number } | null;
  expected: ScheduleExpectation | null;
  labels: {
    actual: "actual";
    known: KnowledgeCertainty | "unknown";
    lastSeen: "last-seen" | "none";
    expected: "expected" | "none";
  };
};

export type ViewAudience = "author" | "player" | "character";

export type FilteredProjection = {
  audience: ViewAudience;
  observerId: StableId | null;
  knownLocationIds: StableId[];
  knownNpcIds: StableId[];
  reports: Array<{
    reportId: StableId;
    kind: ReportKind;
    subjectId: StableId;
    claimedLocationId?: StableId | null;
    claimedSummary: string;
    certainty: KnowledgeCertainty;
    storyMinutes: number;
    falseClaim?: boolean;
  }>;
  secrets: SecretFact[];
  placements: PlacementProjection[];
  honesty: typeof KNOWLEDGE_HONESTY;
};

function emptyObserver(observerId: StableId, displayName?: string): ObserverKnowledgeState {
  return {
    observerId,
    displayName,
    knownLocationIds: [],
    knownNpcIds: [],
    rumoredNpcPlacements: {},
    lastSeen: {},
    knownSecretIds: [],
    reportIds: [],
    knownClueIds: [],
    knownPrivateAccess: {},
  };
}

export function createKnowledgeState(input: {
  campaignId: StableId;
  branchId: StableId;
  actualPlacements?: Record<string, NpcPlacement>;
  observerIds?: StableId[];
}): WorldKnowledgeState {
  const observers: Record<string, ObserverKnowledgeState> = {};
  for (const id of input.observerIds ?? []) {
    observers[id] = emptyObserver(id);
  }
  return {
    schemaVersion: 1,
    campaignId: input.campaignId,
    branchId: input.branchId,
    actualPlacements: { ...(input.actualPlacements ?? {}) },
    secrets: {},
    observers,
    reports: {},
    expectedByNpc: {},
  };
}

export function registerObserver(
  state: WorldKnowledgeState,
  observerId: StableId,
  displayName?: string,
): WorldKnowledgeState {
  if (state.observers[observerId]) return state;
  return {
    ...state,
    observers: {
      ...state.observers,
      [observerId]: emptyObserver(observerId, displayName),
    },
  };
}

export function setActualPlacement(
  state: WorldKnowledgeState,
  npcId: StableId,
  placement: NpcPlacement,
): WorldKnowledgeState {
  return {
    ...state,
    actualPlacements: { ...state.actualPlacements, [npcId]: placement },
  };
}

export function setExpectedPlacement(
  state: WorldKnowledgeState,
  expectation: ScheduleExpectation,
): WorldKnowledgeState {
  return {
    ...state,
    expectedByNpc: { ...state.expectedByNpc, [expectation.npcId]: expectation },
  };
}

export function addSecret(state: WorldKnowledgeState, secret: SecretFact): WorldKnowledgeState {
  return {
    ...state,
    secrets: { ...state.secrets, [secret.secretId]: secret },
  };
}

export function recordSighting(
  state: WorldKnowledgeState,
  input: {
    reportId: StableId;
    observerId: StableId;
    npcId: StableId;
    locationId: StableId;
    storyMinutes: number;
    evidence?: EvidenceSpan[];
    summary?: string;
  },
): WorldKnowledgeState {
  let next = registerObserver(state, input.observerId);
  const obs = { ...next.observers[input.observerId]! };
  if (!obs.knownNpcIds.includes(input.npcId)) {
    obs.knownNpcIds = [...obs.knownNpcIds, input.npcId];
  }
  if (!obs.knownLocationIds.includes(input.locationId)) {
    obs.knownLocationIds = [...obs.knownLocationIds, input.locationId];
  }
  obs.lastSeen = {
    ...obs.lastSeen,
    [input.npcId]: {
      locationId: input.locationId,
      at: `story:${input.storyMinutes}`,
    },
  };
  obs.rumoredNpcPlacements = {
    ...obs.rumoredNpcPlacements,
    [input.npcId]: { kind: "at", locationId: input.locationId },
  };
  const report: KnowledgeReport = {
    reportId: input.reportId,
    kind: "sighting",
    subjectId: input.npcId,
    claimedLocationId: input.locationId,
    claimedSummary: input.summary ?? `Sighted at ${input.locationId}`,
    sourceObserverId: input.observerId,
    holderObserverId: input.observerId,
    storyMinutes: input.storyMinutes,
    certainty: "sighting",
    evidence: input.evidence,
    falseClaim: false,
  };
  if (!obs.reportIds.includes(input.reportId)) {
    obs.reportIds = [...obs.reportIds, input.reportId];
  }
  return {
    ...next,
    observers: { ...next.observers, [input.observerId]: obs },
    reports: { ...next.reports, [input.reportId]: report },
  };
}

export function recordRumor(
  state: WorldKnowledgeState,
  input: {
    reportId: StableId;
    holderObserverId: StableId;
    sourceObserverId: StableId;
    npcId: StableId;
    claimedLocationId: StableId;
    storyMinutes: number;
    summary: string;
    falseClaim?: boolean;
    evidence?: EvidenceSpan[];
  },
): WorldKnowledgeState {
  let next = registerObserver(state, input.holderObserverId);
  const actualBefore = next.actualPlacements[input.npcId];
  const obs = { ...next.observers[input.holderObserverId]! };
  if (!obs.knownNpcIds.includes(input.npcId)) {
    obs.knownNpcIds = [...obs.knownNpcIds, input.npcId];
  }
  obs.rumoredNpcPlacements = {
    ...obs.rumoredNpcPlacements,
    [input.npcId]: { kind: "at", locationId: input.claimedLocationId },
  };
  const report: KnowledgeReport = {
    reportId: input.reportId,
    kind: "rumor",
    subjectId: input.npcId,
    claimedLocationId: input.claimedLocationId,
    claimedSummary: input.summary,
    sourceObserverId: input.sourceObserverId,
    holderObserverId: input.holderObserverId,
    storyMinutes: input.storyMinutes,
    certainty: "rumor",
    evidence: input.evidence,
    falseClaim: input.falseClaim ?? false,
  };
  if (!obs.reportIds.includes(input.reportId)) {
    obs.reportIds = [...obs.reportIds, input.reportId];
  }
  next = {
    ...next,
    observers: { ...next.observers, [input.holderObserverId]: obs },
    reports: { ...next.reports, [input.reportId]: report },
  };
  if (actualBefore !== undefined) {
    next = {
      ...next,
      actualPlacements: { ...next.actualPlacements, [input.npcId]: actualBefore },
    };
  }
  return next;
}

export function communicateReport(
  state: WorldKnowledgeState,
  input: {
    reportId: StableId;
    fromObserverId: StableId;
    toObserverId: StableId;
    sourceReportId?: StableId;
    clueId?: StableId;
    subjectId: StableId;
    claimedLocationId?: StableId | null;
    summary: string;
    storyMinutes: number;
    evidence?: EvidenceSpan[];
    kind?: ReportKind;
  },
): WorldKnowledgeState {
  let next = registerObserver(state, input.toObserverId);
  next = registerObserver(next, input.fromObserverId);
  const to = { ...next.observers[input.toObserverId]! };
  const kind = input.kind ?? (input.clueId ? "clue" : "communication");
  const report: KnowledgeReport = {
    reportId: input.reportId,
    kind,
    subjectId: input.subjectId,
    claimedLocationId: input.claimedLocationId ?? null,
    claimedSummary: input.summary,
    sourceObserverId: input.fromObserverId,
    holderObserverId: input.toObserverId,
    storyMinutes: input.storyMinutes,
    certainty: "communicated",
    evidence: input.evidence ?? [
      {
        note: `Communicated by ${input.fromObserverId}`,
        at: `story:${input.storyMinutes}`,
        sourceEventId: input.sourceReportId,
      },
    ],
    clueId: input.clueId,
  };
  if (!to.reportIds.includes(input.reportId)) {
    to.reportIds = [...to.reportIds, input.reportId];
  }
  if (input.clueId && !to.knownClueIds.includes(input.clueId)) {
    to.knownClueIds = [...to.knownClueIds, input.clueId];
  }
  return {
    ...next,
    observers: { ...next.observers, [input.toObserverId]: to },
    reports: { ...next.reports, [input.reportId]: report },
  };
}

export function revealSecretToObserver(
  state: WorldKnowledgeState,
  secretId: StableId,
  observerId: StableId,
): WorldKnowledgeState {
  const secret = state.secrets[secretId];
  if (!secret) return state;
  let next = registerObserver(state, observerId);
  const updatedSecret: SecretFact = {
    ...secret,
    knownByObserverIds: secret.knownByObserverIds.includes(observerId)
      ? secret.knownByObserverIds
      : [...secret.knownByObserverIds, observerId],
  };
  const obs = { ...next.observers[observerId]! };
  if (!obs.knownSecretIds.includes(secretId)) {
    obs.knownSecretIds = [...obs.knownSecretIds, secretId];
  }
  return {
    ...next,
    secrets: { ...next.secrets, [secretId]: updatedSecret },
    observers: { ...next.observers, [observerId]: obs },
  };
}

export function setPrivateAccessKnowledge(
  state: WorldKnowledgeState,
  observerId: StableId,
  locationId: StableId,
  known: boolean,
): WorldKnowledgeState {
  let next = registerObserver(state, observerId);
  const obs = { ...next.observers[observerId]! };
  obs.knownPrivateAccess = { ...obs.knownPrivateAccess, [locationId]: known };
  if (known && !obs.knownLocationIds.includes(locationId)) {
    obs.knownLocationIds = [...obs.knownLocationIds, locationId];
  }
  return {
    ...next,
    observers: { ...next.observers, [observerId]: obs },
  };
}

function placementEquals(a: NpcPlacement, b: NpcPlacement): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "at" && b.kind === "at") return a.locationId === b.locationId;
  if (a.kind === "traveling" && b.kind === "traveling") {
    return a.fromLocationId === b.fromLocationId && a.toLocationId === b.toLocationId;
  }
  return a.kind === "unknown" && b.kind === "unknown";
}

export function projectPlacement(
  state: WorldKnowledgeState,
  npcId: StableId,
  observerId: StableId,
): PlacementProjection {
  const actual = state.actualPlacements[npcId] ?? null;
  const obs = state.observers[observerId];
  const rumored = obs?.rumoredNpcPlacements[npcId] ?? null;
  const last = obs?.lastSeen[npcId] ?? null;
  const expected = state.expectedByNpc[npcId] ?? null;

  let knownLabel: KnowledgeCertainty | "unknown" = "unknown";
  if (rumored) {
    const held = Object.values(state.reports).filter(
      (r) => r.holderObserverId === observerId && r.subjectId === npcId,
    );
    const best = held.sort((a, b) => b.storyMinutes - a.storyMinutes)[0];
    knownLabel = best?.certainty ?? "rumor";
  }

  return {
    npcId,
    actual,
    known: rumored,
    lastSeen: last
      ? {
          locationId: last.locationId,
          at: last.at,
          storyMinutes: last.at?.startsWith("story:")
            ? Number(last.at.slice("story:".length))
            : undefined,
        }
      : null,
    expected,
    labels: {
      actual: "actual",
      known: knownLabel,
      lastSeen: last ? "last-seen" : "none",
      expected: expected ? "expected" : "none",
    },
  };
}

export function projectForAudience(
  state: WorldKnowledgeState,
  audience: ViewAudience,
  observerId: StableId | null,
): FilteredProjection {
  const obs = observerId ? state.observers[observerId] : null;
  const npcIds = new Set<string>([
    ...Object.keys(state.actualPlacements),
    ...(obs?.knownNpcIds ?? []),
  ]);

  const placements: PlacementProjection[] = [];
  for (const npcId of npcIds) {
    if (audience === "author") {
      placements.push(projectPlacement(state, npcId, observerId ?? "obs:author"));
    } else if (observerId) {
      const p = projectPlacement(state, npcId, observerId);
      if (p.labels.known !== "confirmed" && p.labels.known !== "sighting") {
        placements.push({ ...p, actual: null });
      } else {
        placements.push({
          ...p,
          actual: p.known && p.actual && placementEquals(p.known, p.actual) ? p.actual : null,
        });
      }
    }
  }

  const reports = Object.values(state.reports)
    .filter((r) => {
      if (audience === "author") return true;
      if (!observerId) return false;
      return r.holderObserverId === observerId;
    })
    .map((r) => {
      const base = {
        reportId: r.reportId,
        kind: r.kind,
        subjectId: r.subjectId,
        claimedLocationId: r.claimedLocationId,
        claimedSummary: r.claimedSummary,
        certainty: r.certainty,
        storyMinutes: r.storyMinutes,
      };
      if (audience === "character") return base;
      return { ...base, falseClaim: r.falseClaim };
    });

  const secrets: SecretFact[] = audience === "author" ? Object.values(state.secrets) : [];

  return {
    audience,
    observerId,
    knownLocationIds: obs?.knownLocationIds ?? [],
    knownNpcIds: obs?.knownNpcIds ?? [],
    reports,
    secrets,
    placements,
    honesty: KNOWLEDGE_HONESTY,
  };
}

export function isSightingStale(
  projection: PlacementProjection,
  currentStoryMinutes: number,
  maxAgeMinutes: number,
): { stale: boolean; reason: string } {
  if (!projection.lastSeen || projection.lastSeen.storyMinutes === undefined) {
    return { stale: false, reason: "no last-seen to age" };
  }
  const age = currentStoryMinutes - projection.lastSeen.storyMinutes;
  if (age > maxAgeMinutes) {
    return {
      stale: true,
      reason: `last-seen age ${age}m exceeds ${maxAgeMinutes}m; actual may have moved`,
    };
  }
  if (
    projection.actual?.kind === "at" &&
    projection.lastSeen.locationId &&
    projection.actual.locationId !== projection.lastSeen.locationId
  ) {
    return {
      stale: true,
      reason: "actual placement diverged from last-seen location",
    };
  }
  return { stale: false, reason: "within freshness window" };
}

export function canObservePrivateRoom(
  state: WorldKnowledgeState,
  input: {
    observerId: StableId;
    locationId: StableId;
    physicallyOpen: boolean;
    permissionGranted: boolean;
  },
): {
  mayEnter: boolean;
  mayKnowInterior: boolean;
  reason: string;
} {
  const obs = state.observers[input.observerId];
  const entranceKnown = obs?.knownLocationIds.includes(input.locationId) ?? false;
  const privateKnown = obs?.knownPrivateAccess[input.locationId] ?? false;
  const mayEnter =
    input.physicallyOpen && input.permissionGranted && (entranceKnown || privateKnown);
  const mayKnowInterior = mayEnter || privateKnown;
  if (!input.physicallyOpen) {
    return { mayEnter: false, mayKnowInterior: false, reason: "physically sealed" };
  }
  if (!entranceKnown && !privateKnown) {
    return {
      mayEnter: false,
      mayKnowInterior: false,
      reason: "entrance unknown to observer",
    };
  }
  if (!input.permissionGranted) {
    return {
      mayEnter: false,
      mayKnowInterior: privateKnown,
      reason: "no social permission",
    };
  }
  return {
    mayEnter,
    mayKnowInterior,
    reason: mayEnter ? "access + permission + knowledge" : "insufficient access",
  };
}

export function forkKnowledgeState(
  state: WorldKnowledgeState,
  targetBranchId: StableId,
): WorldKnowledgeState {
  return {
    ...structuredClone(state),
    branchId: targetBranchId,
  };
}
