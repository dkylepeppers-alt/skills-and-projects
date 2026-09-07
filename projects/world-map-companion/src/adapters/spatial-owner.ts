/**
 * Spatial-owner adapter (Task 6) — PROPOSED wiring.
 *
 * Mirrors the inspected Marinara Agents hierarchical-maps spatial owner-turn
 * patterns (PendingSpatialTransition: commandId, expectedDefinitionRevision,
 * expectedCurrentLocationId, travelMode) without claiming a live desktop
 * package activate or an upstream Engine export.
 *
 * Inspected sources (Agents checkout when present):
 * - packages/hierarchical-maps/.../spatial-context/owner-turn.ts
 * - packages/hierarchical-maps/.../spatial-context/state-resolution.ts
 * Pinned Agents revision: ee1a4a01d1091a9f5e4086c58f608e401aa1d879
 *
 * Honesty labels are part of the public surface — do not strip them.
 */

import type { StableId } from "../contracts.ts";
import type { EffectiveMap } from "../world/effective-map.ts";
import {
  type TravelActorKind,
  type TravelMode,
  type TravelValidation,
  hashTravelCommand,
  validateTravelCommand,
} from "../world/travel.ts";

export const SPATIAL_OWNER_ADAPTER_HONESTY = {
  status: "PROPOSED" as const,
  activatesDesktopPackage: false,
  isEngineExport: false,
  isAgentsPackageActivate: false,
  inspectedAgentsRevision: "ee1a4a01d1091a9f5e4086c58f608e401aa1d879",
  inspectedEngineRevision: "9bbee87d1a44c33f704977bd8c25aafbec9b85aa",
  notes: [
    "Companion proposes validated movement; native spatial owner remains authoritative for player focal location when wired.",
    "This adapter does not activate the hierarchical-maps desktop package.",
    "CompanionHostBridge remains PROPOSED (Task 2); this file does not change that label.",
    "Live HTTP Engine round-trips are a separate receipt from Task 6 topology unit proofs.",
  ],
};

/** Shape aligned with Agents PendingSpatialTransition (inspected). */
export type PendingSpatialTransitionProposal = {
  destinationId: string;
  travelMode?: TravelMode;
  expectedDefinitionRevision: number;
  expectedCurrentLocationId: string | null;
  commandId: string;
};

export type SpatialOwnerProposal = {
  honesty: typeof SPATIAL_OWNER_ADAPTER_HONESTY;
  transition: PendingSpatialTransitionProposal;
  payloadHash: string;
  actorId: StableId;
  actorKind: TravelActorKind;
  validation: TravelValidation;
};

export type SpatialOwnerCommitResult =
  | {
      committed: true;
      honesty: typeof SPATIAL_OWNER_ADAPTER_HONESTY;
      acceptedLocationId: string;
      remainingLocationIds: string[];
      complete: boolean;
      /** Native owner not invoked — local unit / dry-run only. */
      nativeOwnerInvoked: false;
    }
  | {
      committed: false;
      honesty: typeof SPATIAL_OWNER_ADAPTER_HONESTY;
      reason: string;
      validation?: TravelValidation;
      nativeOwnerInvoked: false;
    };

/**
 * Build a PROPOSED spatial-owner transition from companion travel validation.
 * Does not call Engine/Agents HTTP or activate any package.
 */
export function proposeSpatialOwnerTransition(
  effective: EffectiveMap,
  input: {
    actorId: StableId;
    actorKind: TravelActorKind;
    currentLocationId: StableId | null;
    destinationId: StableId;
    travelMode?: TravelMode;
    commandId?: string;
    companionIds?: StableId[];
  },
): SpatialOwnerProposal {
  const validation = validateTravelCommand(effective, input);
  if (!validation.ok) {
    const transition: PendingSpatialTransitionProposal = {
      destinationId: input.destinationId,
      ...(input.travelMode ? { travelMode: input.travelMode } : {}),
      expectedDefinitionRevision: effective.definition.revision,
      expectedCurrentLocationId: input.currentLocationId,
      commandId: input.commandId ?? "unvalidated",
    };
    return {
      honesty: SPATIAL_OWNER_ADAPTER_HONESTY,
      transition,
      payloadHash: hashTravelCommand({
        ...transition,
        actorId: input.actorId,
        actorKind: input.actorKind,
      }),
      actorId: input.actorId,
      actorKind: input.actorKind,
      validation,
    };
  }
  const transition: PendingSpatialTransitionProposal = {
    destinationId: validation.command.destinationId,
    ...(validation.command.travelMode
      ? { travelMode: validation.command.travelMode }
      : {}),
    expectedDefinitionRevision: validation.command.expectedDefinitionRevision,
    expectedCurrentLocationId: validation.command.expectedCurrentLocationId,
    commandId: validation.command.commandId,
  };
  return {
    honesty: SPATIAL_OWNER_ADAPTER_HONESTY,
    transition,
    payloadHash: hashTravelCommand(validation.command),
    actorId: input.actorId,
    actorKind: input.actorKind,
    validation,
  };
}

/**
 * Dry-run commit for unit tests. Never claims native owner application.
 * A future host bridge may replace this with a real owner-turn call.
 */
export function dryRunApplySpatialOwnerProposal(
  proposal: SpatialOwnerProposal,
): SpatialOwnerCommitResult {
  if (!proposal.validation.ok) {
    return {
      committed: false,
      honesty: SPATIAL_OWNER_ADAPTER_HONESTY,
      reason: proposal.validation.message,
      validation: proposal.validation,
      nativeOwnerInvoked: false,
    };
  }
  if (proposal.honesty.activatesDesktopPackage || proposal.honesty.isAgentsPackageActivate) {
    return {
      committed: false,
      honesty: SPATIAL_OWNER_ADAPTER_HONESTY,
      reason: "Adapter honesty forbids claiming package activate.",
      nativeOwnerInvoked: false,
    };
  }
  return {
    committed: true,
    honesty: SPATIAL_OWNER_ADAPTER_HONESTY,
    acceptedLocationId: proposal.validation.acceptedDestinationId,
    remainingLocationIds: proposal.validation.remainingLocationIds,
    complete: proposal.validation.complete,
    nativeOwnerInvoked: false,
  };
}

/** Inspect Agents checkout paths when present — informational only. */
export function inspectSpatialOwnerSources(agentsRoot: string | null): {
  honesty: typeof SPATIAL_OWNER_ADAPTER_HONESTY;
  agentsRoot: string | null;
  ownerTurnPath: string | null;
  stateResolutionPath: string | null;
  found: boolean;
} {
  const relOwner =
    "packages/hierarchical-maps/src/engine/packages/server/src/services/spatial-context/owner-turn.ts";
  const relState =
    "packages/hierarchical-maps/src/engine/packages/server/src/services/spatial-context/state-resolution.ts";
  if (!agentsRoot) {
    return {
      honesty: SPATIAL_OWNER_ADAPTER_HONESTY,
      agentsRoot: null,
      ownerTurnPath: null,
      stateResolutionPath: null,
      found: false,
    };
  }
  // Dynamic import of fs avoided at module load — caller can verify existence.
  return {
    honesty: SPATIAL_OWNER_ADAPTER_HONESTY,
    agentsRoot,
    ownerTurnPath: `${agentsRoot.replace(/\/$/, "")}/${relOwner}`,
    stateResolutionPath: `${agentsRoot.replace(/\/$/, "")}/${relState}`,
    found: true,
  };
}
