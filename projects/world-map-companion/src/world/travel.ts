/**
 * Travel / journeys (Task 6).
 *
 * Player and NPC movement share the same physical effective-map constraints.
 * Observer knowledge and social permission are filtered separately.
 *
 * Travel durations: Nevermore pack marks route costs UNKNOWN — proposals
 * carry explicit uncertainty rather than inventing canon times.
 */

import { createHash, randomUUID } from "node:crypto";

import type { StableId } from "../contracts.ts";
import {
  type EffectiveMap,
  actorHasSocialPermission,
  physicalCanReach,
  physicalDestinations,
  physicalRoute,
} from "./effective-map.ts";

export type TravelMode = "step_by_step" | "travel_now";

export type TravelActorKind = "player" | "npc";

export type TravelTimeProposal = {
  /** Always explicit — Nevermore has no authored route-cost table. */
  certainty: "unknown" | "authored" | "assumption";
  estimatedStoryMinutes?: number | null;
  notes: string;
};

export type JourneyStatus =
  | "planned"
  | "in_progress"
  | "interrupted"
  | "completed"
  | "cancelled";

export type Journey = {
  journeyId: StableId;
  actorId: StableId;
  actorKind: TravelActorKind;
  mode: TravelMode;
  fromLocationId: StableId;
  targetLocationId: StableId;
  /** Full route excluding current start (Engine route contract). */
  routeLocationIds: StableId[];
  /** Remaining destinations after the next accepted hop. */
  remainingLocationIds: StableId[];
  companionIds: StableId[];
  status: JourneyStatus;
  timeProposal: TravelTimeProposal;
  /** Spatial owner command identity for the next hop / commit. */
  commandId: string;
  expectedDefinitionRevision: number;
  expectedCurrentLocationId: StableId;
  interruptReason?: string;
  createdAt: string;
};

export type TravelCommand = {
  commandId: string;
  destinationId: StableId;
  travelMode?: TravelMode;
  expectedDefinitionRevision: number;
  expectedCurrentLocationId: StableId | null;
  actorId: StableId;
  actorKind: TravelActorKind;
  companionIds?: StableId[];
};

export type TravelValidationOk = {
  ok: true;
  command: TravelCommand;
  routeLocationIds: StableId[];
  acceptedDestinationId: StableId;
  remainingLocationIds: StableId[];
  complete: boolean;
  timeProposal: TravelTimeProposal;
};

export type TravelValidationErr = {
  ok: false;
  code:
    | "unreachable"
    | "stale_revision"
    | "stale_location"
    | "social_denied"
    | "fast_travel_prereq"
    | "party_split_required"
    | "invalid_actor";
  message: string;
};

export type TravelValidation = TravelValidationOk | TravelValidationErr;

export type FastTravelPrereqs = {
  requireReachable: boolean;
  requireKnownDestination?: boolean;
  observerId?: StableId;
  requireCompanionsColocated?: boolean;
  companionLocations?: Record<string, StableId | null | undefined>;
};

const DEFAULT_TIME: TravelTimeProposal = {
  certainty: "unknown",
  estimatedStoryMinutes: null,
  notes:
    "Travel duration UNKNOWN — no authored route-cost table in Nevermore source (pack gaps).",
};

export function newTravelCommandId(prefix = "cmd"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

export function hashTravelCommand(
  command: Omit<TravelCommand, "commandId"> & { commandId: string },
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        destinationId: command.destinationId,
        ...(command.travelMode ? { travelMode: command.travelMode } : {}),
        expectedDefinitionRevision: command.expectedDefinitionRevision,
        expectedCurrentLocationId: command.expectedCurrentLocationId,
        commandId: command.commandId,
      }),
    )
    .digest("hex");
}

function defaultTimeProposal(mode: TravelMode | undefined): TravelTimeProposal {
  if (mode === "travel_now") {
    return {
      ...DEFAULT_TIME,
      notes:
        "Fast-travel time proposal: duration UNKNOWN unless an authored cost exists; do not invent minutes.",
    };
  }
  return { ...DEFAULT_TIME };
}

/**
 * Validate a movement command against the effective map.
 * Same physical rules for player and NPC (`actorKind` does not relax topology).
 */
export function validateTravelCommand(
  effective: EffectiveMap,
  input: {
    actorId: StableId;
    actorKind: TravelActorKind;
    currentLocationId: StableId | null;
    destinationId: StableId;
    travelMode?: TravelMode;
    commandId?: string;
    expectedDefinitionRevision?: number;
    companionIds?: StableId[];
    enforceSocialPermission?: boolean;
    fastTravel?: FastTravelPrereqs;
  },
): TravelValidation {
  const revision = effective.definition.revision;
  const expectedRevision = input.expectedDefinitionRevision ?? revision;
  if (expectedRevision !== revision) {
    return {
      ok: false,
      code: "stale_revision",
      message: "The world map changed. Review the available destinations.",
    };
  }
  if (input.currentLocationId === null) {
    return { ok: false, code: "stale_location", message: "The current location does not exist." };
  }

  if (input.enforceSocialPermission) {
    const permitted = actorHasSocialPermission(
      effective.overlay,
      input.actorId,
      input.destinationId,
    );
    if (permitted === false) {
      return {
        ok: false,
        code: "social_denied",
        message: "Social permission denied for this destination (physical route may still exist).",
      };
    }
  }

  const mode = input.travelMode;
  if (mode === "travel_now" && input.fastTravel) {
    const ft = input.fastTravel;
    if (
      ft.requireReachable &&
      !physicalCanReach(effective, input.currentLocationId, input.destinationId)
    ) {
      return {
        ok: false,
        code: "fast_travel_prereq",
        message: "Fast travel requires a reachable route on the effective map.",
      };
    }
    if (ft.requireKnownDestination && ft.observerId) {
      const known = effective.overlay.discoveries?.find((d) => d.observerId === ft.observerId);
      if (!known?.knownLocationIds.includes(input.destinationId)) {
        return {
          ok: false,
          code: "fast_travel_prereq",
          message: "Fast travel requires the observer to know the destination.",
        };
      }
    }
    if (ft.requireCompanionsColocated && input.companionIds?.length) {
      for (const companionId of input.companionIds) {
        const loc = ft.companionLocations?.[companionId];
        if (loc !== input.currentLocationId) {
          return {
            ok: false,
            code: "party_split_required",
            message: `Companion ${companionId} is not co-located; split or rendezvous before fast travel.`,
          };
        }
      }
    }
  }

  const routeLocationIds = physicalRoute(effective, input.currentLocationId, input.destinationId);
  if (!routeLocationIds || routeLocationIds.length === 0) {
    if (!mode) {
      const hop = physicalDestinations(effective, input.currentLocationId).find(
        (d) => d.id === input.destinationId,
      );
      if (!hop) {
        return {
          ok: false,
          code: "unreachable",
          message: "The selected destination is not reachable from the current location.",
        };
      }
      const command: TravelCommand = {
        commandId: input.commandId ?? newTravelCommandId(),
        destinationId: input.destinationId,
        expectedDefinitionRevision: revision,
        expectedCurrentLocationId: input.currentLocationId,
        actorId: input.actorId,
        actorKind: input.actorKind,
        companionIds: input.companionIds,
      };
      return {
        ok: true,
        command,
        routeLocationIds: [input.destinationId],
        acceptedDestinationId: input.destinationId,
        remainingLocationIds: [],
        complete: true,
        timeProposal: defaultTimeProposal(undefined),
      };
    }
    return {
      ok: false,
      code: "unreachable",
      message: "The selected destination is not reachable from the current location.",
    };
  }

  const acceptedDestinationId =
    mode === "step_by_step" ? routeLocationIds[0]! : routeLocationIds[routeLocationIds.length - 1]!;
  const remainingLocationIds = mode === "step_by_step" ? routeLocationIds.slice(1) : [];

  if (mode === "step_by_step") {
    const hop = physicalDestinations(effective, input.currentLocationId).find(
      (d) => d.id === acceptedDestinationId,
    );
    if (!hop) {
      return {
        ok: false,
        code: "unreachable",
        message: "The selected destination is not reachable from the current location.",
      };
    }
  }

  const command: TravelCommand = {
    commandId: input.commandId ?? newTravelCommandId(),
    destinationId: input.destinationId,
    ...(mode ? { travelMode: mode } : {}),
    expectedDefinitionRevision: revision,
    expectedCurrentLocationId: input.currentLocationId,
    actorId: input.actorId,
    actorKind: input.actorKind,
    companionIds: input.companionIds,
  };

  return {
    ok: true,
    command,
    routeLocationIds,
    acceptedDestinationId,
    remainingLocationIds,
    complete: remainingLocationIds.length === 0,
    timeProposal: defaultTimeProposal(mode),
  };
}

export function planJourney(
  effective: EffectiveMap,
  input: {
    actorId: StableId;
    actorKind: TravelActorKind;
    fromLocationId: StableId;
    targetLocationId: StableId;
    mode: TravelMode;
    companionIds?: StableId[];
    createdAt?: string;
    fastTravel?: FastTravelPrereqs;
  },
): { ok: true; journey: Journey } | TravelValidationErr {
  const validation = validateTravelCommand(effective, {
    actorId: input.actorId,
    actorKind: input.actorKind,
    currentLocationId: input.fromLocationId,
    destinationId: input.targetLocationId,
    travelMode: input.mode,
    companionIds: input.companionIds,
    fastTravel: input.fastTravel,
  });
  if (!validation.ok) return validation;

  const journey: Journey = {
    journeyId: `journey_${randomUUID().replace(/-/g, "")}`,
    actorId: input.actorId,
    actorKind: input.actorKind,
    mode: input.mode,
    fromLocationId: input.fromLocationId,
    targetLocationId: input.targetLocationId,
    routeLocationIds: validation.routeLocationIds,
    remainingLocationIds: validation.remainingLocationIds,
    companionIds: input.companionIds ?? [],
    status: "planned",
    timeProposal: validation.timeProposal,
    commandId: validation.command.commandId,
    expectedDefinitionRevision: validation.command.expectedDefinitionRevision,
    expectedCurrentLocationId: input.fromLocationId,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  return { ok: true, journey };
}

/** Advance one step-by-step hop; regenerates commandId for the next commit. */
export function advanceJourneyStep(
  effective: EffectiveMap,
  journey: Journey,
): { ok: true; journey: Journey; arrivedLocationId: StableId } | TravelValidationErr {
  if (journey.status === "interrupted" || journey.status === "cancelled") {
    return { ok: false, code: "invalid_actor", message: `Journey is ${journey.status}.` };
  }
  if (journey.mode !== "step_by_step") {
    return { ok: false, code: "invalid_actor", message: "advanceJourneyStep requires step_by_step mode." };
  }
  const validation = validateTravelCommand(effective, {
    actorId: journey.actorId,
    actorKind: journey.actorKind,
    currentLocationId: journey.expectedCurrentLocationId,
    destinationId: journey.targetLocationId,
    travelMode: "step_by_step",
    companionIds: journey.companionIds,
    expectedDefinitionRevision: journey.expectedDefinitionRevision,
  });
  if (!validation.ok) return validation;

  const arrivedLocationId = validation.acceptedDestinationId;
  const remainingAfterHop = validation.remainingLocationIds;
  const complete = remainingAfterHop.length === 0;
  const next: Journey = {
    ...journey,
    status: complete ? "completed" : "in_progress",
    expectedCurrentLocationId: arrivedLocationId,
    expectedDefinitionRevision: effective.definition.revision,
    commandId: newTravelCommandId(),
    routeLocationIds: [],
    remainingLocationIds: [],
  };
  if (!complete) {
    const cont = physicalRoute(effective, arrivedLocationId, journey.targetLocationId);
    next.routeLocationIds = cont ?? [];
    next.remainingLocationIds = cont && cont.length > 1 ? cont.slice(1) : [];
  }
  return { ok: true, journey: next, arrivedLocationId };
}

export function interruptJourney(journey: Journey, reason: string): Journey {
  return {
    ...journey,
    status: "interrupted",
    interruptReason: reason,
  };
}

export function resumeJourney(
  effective: EffectiveMap,
  journey: Journey,
): { ok: true; journey: Journey } | TravelValidationErr {
  if (journey.status !== "interrupted") {
    return { ok: false, code: "invalid_actor", message: "Only interrupted journeys can resume." };
  }
  const validation = validateTravelCommand(effective, {
    actorId: journey.actorId,
    actorKind: journey.actorKind,
    currentLocationId: journey.expectedCurrentLocationId,
    destinationId: journey.targetLocationId,
    travelMode: journey.mode,
    companionIds: journey.companionIds,
  });
  if (!validation.ok) return validation;
  return {
    ok: true,
    journey: {
      ...journey,
      status: "in_progress",
      interruptReason: undefined,
      routeLocationIds: validation.routeLocationIds,
      remainingLocationIds: validation.remainingLocationIds,
      commandId: validation.command.commandId,
      expectedDefinitionRevision: validation.command.expectedDefinitionRevision,
      timeProposal: validation.timeProposal,
    },
  };
}

/**
 * Party split: companions may diverge; each actor still uses the same
 * physical validator. Returns per-actor journey plans.
 */
export function planPartySplit(
  effective: EffectiveMap,
  parties: Array<{
    actorId: StableId;
    actorKind: TravelActorKind;
    fromLocationId: StableId;
    targetLocationId: StableId;
    mode: TravelMode;
  }>,
): Array<{ actorId: StableId; result: ReturnType<typeof planJourney> }> {
  return parties.map((p) => ({
    actorId: p.actorId,
    result: planJourney(effective, { ...p, companionIds: [] }),
  }));
}

/** NPC and player share this entrypoint — no topology privilege by kind. */
export function proposeNpcTravel(
  effective: EffectiveMap,
  input: {
    npcId: StableId;
    fromLocationId: StableId;
    targetLocationId: StableId;
    mode?: TravelMode;
  },
): TravelValidation {
  return validateTravelCommand(effective, {
    actorId: input.npcId,
    actorKind: "npc",
    currentLocationId: input.fromLocationId,
    destinationId: input.targetLocationId,
    travelMode: input.mode ?? "travel_now",
    fastTravel: { requireReachable: true },
  });
}
