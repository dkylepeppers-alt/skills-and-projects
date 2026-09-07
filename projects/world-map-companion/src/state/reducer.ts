/**
 * Deterministic campaign event reducer (Task 3).
 * Applies typed events → projections; rejects unknown IDs, malformed state,
 * duplicates, stale writes, invalid chronology, and cross-campaign writes.
 */

import { createHash } from "node:crypto";

import {
  CONTRACT_SCHEMA_VERSION,
  type CampaignProjection,
  type CompanionEvent,
  type ObserverKnowledge,
} from "../contracts.ts";
import { SchemaValidationError, parseCompanionEvent, validateCampaignProjection } from "../schema.ts";

export type ReduceErrorCode =
  | "UNKNOWN_NPC"
  | "UNKNOWN_LOCATION"
  | "UNKNOWN_OBSERVER"
  | "UNKNOWN_PARENT"
  | "DUPLICATE_EVENT"
  | "STALE_REVISION"
  | "INVALID_CHRONOLOGY"
  | "CROSS_CAMPAIGN"
  | "CROSS_BRANCH"
  | "MALFORMED_STATE"
  | "UNKNOWN_EVENT_TYPE";

export class ReduceError extends Error {
  readonly code: ReduceErrorCode;
  readonly details: Record<string, unknown>;
  constructor(code: ReduceErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(`${code}: ${message}`);
    this.name = "ReduceError";
    this.code = code;
    this.details = details;
  }
}

export function emptyProjection(campaignId: string, branchId: string): CampaignProjection {
  return {
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    campaignId,
    branchId,
    revision: 0,
    headEventId: null,
    storyTime: null,
    npcs: {},
    locations: {},
    observers: {},
    supersededEventIds: [],
    checkpointIds: [],
  };
}

function emptyObserver(observerId: string): ObserverKnowledge {
  return {
    observerId,
    knownLocationIds: [],
    knownNpcIds: [],
    rumoredNpcPlacements: {},
    lastSeen: {},
  };
}

function cloneProjection(p: CampaignProjection): CampaignProjection {
  return structuredClone(p);
}

/** Canonical JSON for deterministic hashing (sorted object keys). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        sorted[key] = (v as Record<string, unknown>)[key];
      }
      return sorted;
    }
    return v;
  });
}

export function hashProjection(projection: CampaignProjection): string {
  const { revision: _r, headEventId: _h, ...rest } = projection;
  // Hash semantic state; revision/head are cursor metadata verified separately.
  const body = { ...rest, revision: projection.revision, headEventId: projection.headEventId };
  return createHash("sha256").update(canonicalJson(body)).digest("hex");
}

function assertSameCampaignBranch(state: CampaignProjection, event: CompanionEvent): void {
  if (event.campaignId !== state.campaignId) {
    throw new ReduceError(
      "CROSS_CAMPAIGN",
      `event ${event.eventId} targets campaign ${event.campaignId}, projection is ${state.campaignId}`,
      { eventId: event.eventId, eventCampaignId: event.campaignId, projectionCampaignId: state.campaignId },
    );
  }
  if (event.branchId !== state.branchId) {
    throw new ReduceError(
      "CROSS_BRANCH",
      `event ${event.eventId} targets branch ${event.branchId}, projection is ${state.branchId}`,
      { eventId: event.eventId, eventBranchId: event.branchId, projectionBranchId: state.branchId },
    );
  }
}

/**
 * Apply one validated event to a projection.
 * `seenEventIds` tracks IDs already in the lineage (including those not in projection).
 */
export function applyEvent(
  state: CampaignProjection,
  rawEvent: CompanionEvent,
  seenEventIds: ReadonlySet<string>,
): CampaignProjection {
  let event: CompanionEvent;
  try {
    event = parseCompanionEvent(rawEvent);
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      throw new ReduceError("MALFORMED_STATE", err.message, { issues: err.issues });
    }
    throw err;
  }

  assertSameCampaignBranch(state, event);

  if (seenEventIds.has(event.eventId)) {
    throw new ReduceError("DUPLICATE_EVENT", `event ID already applied: ${event.eventId}`, {
      eventId: event.eventId,
    });
  }

  if (event.expectedRevision !== state.revision) {
    throw new ReduceError(
      "STALE_REVISION",
      `event ${event.eventId} expected revision ${event.expectedRevision}, projection is at ${state.revision}`,
      {
        eventId: event.eventId,
        expectedRevision: event.expectedRevision,
        actualRevision: state.revision,
      },
    );
  }

  if (event.parentEventId !== null) {
    if (!seenEventIds.has(event.parentEventId) && state.headEventId !== event.parentEventId) {
      // Parent must already be in lineage. Empty campaign may only have null parent.
      if (state.headEventId !== null || seenEventIds.size > 0) {
        if (!seenEventIds.has(event.parentEventId)) {
          throw new ReduceError(
            "UNKNOWN_PARENT",
            `parent event ${event.parentEventId} is not in campaign lineage`,
            { eventId: event.eventId, parentEventId: event.parentEventId },
          );
        }
      }
    }
    if (state.headEventId !== null && event.parentEventId !== state.headEventId) {
      // Strict append chronology: parent must be current head for linear branch.
      throw new ReduceError(
        "INVALID_CHRONOLOGY",
        `event ${event.eventId} parent ${event.parentEventId} is not head ${state.headEventId}`,
        {
          eventId: event.eventId,
          parentEventId: event.parentEventId,
          headEventId: state.headEventId,
        },
      );
    }
  } else if (state.headEventId !== null || state.revision !== 0) {
    throw new ReduceError(
      "INVALID_CHRONOLOGY",
      `root event ${event.eventId} not allowed when projection already has history`,
      { eventId: event.eventId, headEventId: state.headEventId, revision: state.revision },
    );
  }

  const next = cloneProjection(state);
  const payload = event.payload;

  switch (payload.type) {
    case "campaign.created": {
      if (state.revision !== 0) {
        throw new ReduceError("INVALID_CHRONOLOGY", "campaign.created only valid on empty projection", {
          eventId: event.eventId,
        });
      }
      if (payload.campaign.campaignId !== state.campaignId) {
        throw new ReduceError("CROSS_CAMPAIGN", "campaign.created payload campaignId mismatch", {
          eventId: event.eventId,
        });
      }
      for (const npc of payload.initialNpcs ?? []) {
        next.npcs[npc.npcId] = structuredClone(npc);
      }
      for (const loc of payload.initialLocations ?? []) {
        next.locations[loc.locationId] = structuredClone(loc);
      }
      for (const obsId of payload.campaign.observerIds) {
        next.observers[obsId] = emptyObserver(obsId);
      }
      break;
    }
    case "npc.placed": {
      next.npcs[payload.npc.npcId] = structuredClone(payload.npc);
      break;
    }
    case "npc.moved": {
      const npc = next.npcs[payload.npcId];
      if (!npc) {
        throw new ReduceError("UNKNOWN_NPC", `cannot move unknown npc ${payload.npcId}`, {
          eventId: event.eventId,
          npcId: payload.npcId,
        });
      }
      npc.placement = structuredClone(payload.placement);
      if (payload.evidence) {
        npc.evidence = [...(npc.evidence ?? []), ...payload.evidence];
      }
      break;
    }
    case "npc.updated": {
      const npc = next.npcs[payload.npcId];
      if (!npc) {
        throw new ReduceError("UNKNOWN_NPC", `cannot update unknown npc ${payload.npcId}`, {
          eventId: event.eventId,
          npcId: payload.npcId,
        });
      }
      Object.assign(npc, structuredClone(payload.patch), { npcId: payload.npcId });
      break;
    }
    case "location.access_changed": {
      const loc = next.locations[payload.locationId];
      if (!loc) {
        throw new ReduceError("UNKNOWN_LOCATION", `unknown location ${payload.locationId}`, {
          eventId: event.eventId,
          locationId: payload.locationId,
        });
      }
      loc.access = { ...loc.access, ...structuredClone(payload.access) };
      break;
    }
    case "location.discovered": {
      const loc = next.locations[payload.locationId];
      if (!loc) {
        throw new ReduceError("UNKNOWN_LOCATION", `unknown location ${payload.locationId}`, {
          eventId: event.eventId,
          locationId: payload.locationId,
        });
      }
      if (!next.observers[payload.observerId]) {
        throw new ReduceError("UNKNOWN_OBSERVER", `unknown observer ${payload.observerId}`, {
          eventId: event.eventId,
          observerId: payload.observerId,
        });
      }
      loc.discoveryByObserver[payload.observerId] = true;
      const obs = next.observers[payload.observerId]!;
      if (!obs.knownLocationIds.includes(payload.locationId)) {
        obs.knownLocationIds = [...obs.knownLocationIds, payload.locationId];
      }
      break;
    }
    case "location.updated": {
      const loc = next.locations[payload.locationId];
      if (!loc) {
        throw new ReduceError("UNKNOWN_LOCATION", `unknown location ${payload.locationId}`, {
          eventId: event.eventId,
          locationId: payload.locationId,
        });
      }
      Object.assign(loc, structuredClone(payload.patch), { locationId: payload.locationId });
      break;
    }
    case "observer.registered": {
      if (!next.observers[payload.observerId]) {
        next.observers[payload.observerId] = emptyObserver(payload.observerId);
      }
      break;
    }
    case "correction.supersede": {
      if (!seenEventIds.has(payload.supersedesEventId) && state.headEventId !== payload.supersedesEventId) {
        // Allow superseding any prior event in lineage
        if (!seenEventIds.has(payload.supersedesEventId)) {
          throw new ReduceError("UNKNOWN_PARENT", `cannot supersede unknown event ${payload.supersedesEventId}`, {
            eventId: event.eventId,
            supersedesEventId: payload.supersedesEventId,
          });
        }
      }
      if (!next.supersededEventIds.includes(payload.supersedesEventId)) {
        next.supersededEventIds = [...next.supersededEventIds, payload.supersedesEventId];
      }
      break;
    }
    case "time.advanced": {
      next.storyTime = payload.storyTime;
      break;
    }
    case "checkpoint.created": {
      if (!next.checkpointIds.includes(payload.checkpointId)) {
        next.checkpointIds = [...next.checkpointIds, payload.checkpointId];
      }
      break;
    }
    default: {
      const _exhaustive: never = payload;
      throw new ReduceError("UNKNOWN_EVENT_TYPE", `unhandled payload`, {
        eventId: event.eventId,
        payload: _exhaustive,
      });
    }
  }

  next.revision = state.revision + 1;
  next.headEventId = event.eventId;

  const issues = validateCampaignProjection(next);
  if (issues.length > 0) {
    throw new ReduceError("MALFORMED_STATE", "projection invalid after reduce", { issues });
  }
  return next;
}

/** Replay an ordered event list onto an empty (or seeded) projection. */
export function replayEvents(
  events: readonly CompanionEvent[],
  seed?: CampaignProjection,
): { projection: CampaignProjection; stateHash: string } {
  if (events.length === 0) {
    const projection = seed ?? emptyProjection("campaign:empty", "branch:main");
    return { projection, stateHash: hashProjection(projection) };
  }
  const first = events[0]!;
  let state = seed ?? emptyProjection(first.campaignId, first.branchId);
  const seen = new Set<string>();
  // If seed already has history, seed seen with head chain is caller's job; for full replay use empty.
  for (const event of events) {
    state = applyEvent(state, event, seen);
    seen.add(event.eventId);
  }
  return { projection: state, stateHash: hashProjection(state) };
}
