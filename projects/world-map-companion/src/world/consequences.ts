/**
 * Persistent environmental consequences (Task 8).
 *
 * Left-behind objects, damage, local service changes, and faction clocks
 * survive revisits and branch inheritance from the shared lineage. Branching
 * copies consequences at fork time; divergent edits on one branch do not
 * erase the other's inherited snapshot.
 */

import type { StableId } from "../contracts.ts";

export const CONSEQUENCE_HONESTY = {
  kind: "companion-consequences" as const,
  companionHostBridge: "PROPOSED" as const,
  capabilityDocumentStore: false as const,
  isEngineExport: false as const,
  notes: [
    "Consequences are companion campaign overlays — not a second GM notebook.",
    "Branch fork copies lineage consequences; later divergence is per-branch.",
  ],
};

export type PersistentObject = {
  objectId: StableId;
  locationId: StableId;
  label: string;
  leftByActorId?: StableId;
  storyMinutes: number;
  condition?: string;
  searchable: boolean;
  notes?: string;
};

export type DamageRecord = {
  damageId: StableId;
  locationId: StableId;
  summary: string;
  storyMinutes: number;
  severity: "cosmetic" | "functional" | "blocking";
  sourceEventId?: StableId;
};

export type FactionClock = {
  clockId: StableId;
  factionId: StableId;
  label: string;
  segments: number;
  filled: number;
  linkedQuestId?: string | null;
  notes?: string;
};

export type ConsequenceEvent = {
  consequenceId: StableId;
  kind: "object_left" | "object_removed" | "damage" | "service_change" | "faction_tick" | "custom";
  locationId?: StableId;
  storyMinutes: number;
  summary: string;
  payload?: Record<string, unknown>;
};

export type ConsequenceState = {
  schemaVersion: 1;
  campaignId: StableId;
  branchId: StableId;
  /** Lineage revision this state was forked/copied from (for revisit proofs). */
  lineageRevision: number;
  objects: Record<string, PersistentObject>;
  damage: Record<string, DamageRecord>;
  factionClocks: Record<string, FactionClock>;
  events: ConsequenceEvent[];
  /** Service forced-closed overrides keyed by serviceId. */
  serviceOverrides: Record<string, { closed: boolean; reason: string; locationId: StableId }>;
};

export function createConsequenceState(input: {
  campaignId: StableId;
  branchId: StableId;
  lineageRevision?: number;
}): ConsequenceState {
  return {
    schemaVersion: 1,
    campaignId: input.campaignId,
    branchId: input.branchId,
    lineageRevision: input.lineageRevision ?? 0,
    objects: {},
    damage: {},
    factionClocks: {},
    events: [],
    serviceOverrides: {},
  };
}

export function leaveObject(
  state: ConsequenceState,
  object: PersistentObject,
): ConsequenceState {
  const event: ConsequenceEvent = {
    consequenceId: `evt:obj:${object.objectId}`,
    kind: "object_left",
    locationId: object.locationId,
    storyMinutes: object.storyMinutes,
    summary: `Left ${object.label} at ${object.locationId}`,
    payload: { objectId: object.objectId },
  };
  return {
    ...state,
    objects: { ...state.objects, [object.objectId]: object },
    events: [...state.events, event],
    lineageRevision: state.lineageRevision + 1,
  };
}

export function removeObject(
  state: ConsequenceState,
  objectId: StableId,
  storyMinutes: number,
): ConsequenceState {
  const existing = state.objects[objectId];
  if (!existing) return state;
  const { [objectId]: _removed, ...rest } = state.objects;
  const event: ConsequenceEvent = {
    consequenceId: `evt:obj-rm:${objectId}:${storyMinutes}`,
    kind: "object_removed",
    locationId: existing.locationId,
    storyMinutes,
    summary: `Removed ${existing.label} from ${existing.locationId}`,
    payload: { objectId },
  };
  return {
    ...state,
    objects: rest,
    events: [...state.events, event],
    lineageRevision: state.lineageRevision + 1,
  };
}

export function recordDamage(
  state: ConsequenceState,
  damage: DamageRecord,
): ConsequenceState {
  const event: ConsequenceEvent = {
    consequenceId: `evt:dmg:${damage.damageId}`,
    kind: "damage",
    locationId: damage.locationId,
    storyMinutes: damage.storyMinutes,
    summary: damage.summary,
    payload: { damageId: damage.damageId, severity: damage.severity },
  };
  return {
    ...state,
    damage: { ...state.damage, [damage.damageId]: damage },
    events: [...state.events, event],
    lineageRevision: state.lineageRevision + 1,
  };
}

export function setServiceOverride(
  state: ConsequenceState,
  input: {
    serviceId: StableId;
    locationId: StableId;
    closed: boolean;
    reason: string;
    storyMinutes: number;
  },
): ConsequenceState {
  const event: ConsequenceEvent = {
    consequenceId: `evt:svc:${input.serviceId}:${input.storyMinutes}`,
    kind: "service_change",
    locationId: input.locationId,
    storyMinutes: input.storyMinutes,
    summary: input.reason,
    payload: { serviceId: input.serviceId, closed: input.closed },
  };
  return {
    ...state,
    serviceOverrides: {
      ...state.serviceOverrides,
      [input.serviceId]: {
        closed: input.closed,
        reason: input.reason,
        locationId: input.locationId,
      },
    },
    events: [...state.events, event],
    lineageRevision: state.lineageRevision + 1,
  };
}

export function upsertFactionClock(
  state: ConsequenceState,
  clock: FactionClock,
): ConsequenceState {
  return {
    ...state,
    factionClocks: { ...state.factionClocks, [clock.clockId]: clock },
    lineageRevision: state.lineageRevision + 1,
  };
}

export function tickFactionClock(
  state: ConsequenceState,
  clockId: StableId,
  delta: number,
  storyMinutes: number,
): ConsequenceState {
  const clock = state.factionClocks[clockId];
  if (!clock) return state;
  const filled = Math.max(0, Math.min(clock.segments, clock.filled + delta));
  const updated: FactionClock = { ...clock, filled };
  const event: ConsequenceEvent = {
    consequenceId: `evt:faction:${clockId}:${storyMinutes}`,
    kind: "faction_tick",
    storyMinutes,
    summary: `${clock.label}: ${filled}/${clock.segments}`,
    payload: { clockId, filled, segments: clock.segments },
  };
  return {
    ...state,
    factionClocks: { ...state.factionClocks, [clockId]: updated },
    events: [...state.events, event],
    lineageRevision: state.lineageRevision + 1,
  };
}

export function objectsAtLocation(
  state: ConsequenceState,
  locationId: StableId,
): PersistentObject[] {
  return Object.values(state.objects).filter((o) => o.locationId === locationId);
}

export function damageAtLocation(
  state: ConsequenceState,
  locationId: StableId,
): DamageRecord[] {
  return Object.values(state.damage).filter((d) => d.locationId === locationId);
}

/**
 * Fork consequences onto a new branch. Inherited objects/damage/clocks are
 * preserved; subsequent mutations on either branch do not cross-contaminate.
 */
export function forkConsequenceState(
  state: ConsequenceState,
  targetBranchId: StableId,
): ConsequenceState {
  const cloned = structuredClone(state);
  return {
    ...cloned,
    branchId: targetBranchId,
  };
}

/**
 * Revisit check: after branching, the inherited consequence set still contains
 * the prior object/damage from the shared lineage.
 */
export function consequenceStillPresent(
  state: ConsequenceState,
  input: { objectId?: StableId; damageId?: StableId; clockId?: StableId },
): boolean {
  if (input.objectId && !state.objects[input.objectId]) return false;
  if (input.damageId && !state.damage[input.damageId]) return false;
  if (input.clockId && !state.factionClocks[input.clockId]) return false;
  return true;
}
