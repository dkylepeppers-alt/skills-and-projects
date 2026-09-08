/** Validate extractor proposals against accepted evidence and current state. */
import type { CampaignProjection } from "../contracts.ts";
import type { ExtractedProposal } from "../agents/extractor.ts";
import { arbitrateFieldWrite } from "../host/field-ownership.ts";
import type { EffectiveMap } from "../world/effective-map.ts";
import { physicalCanReach } from "../world/effective-map.ts";

export type ProposalValidationIssue = {
  code:
    | "INVALID_SOURCE_SPAN"
    | "AMBIGUOUS_ALIAS"
    | "ALIAS_ID_MISMATCH"
    | "UNKNOWN_ENTITY"
    | "UNKNOWN_PLACE"
    | "IMPOSSIBLE_ROUTE"
    | "INCOMPLETE_CHANGE"
    | "UNSUPPORTED_CERTAINTY"
    | "INVALID_VISIBILITY"
    | "PLAYER_AGENCY"
    | "OWNERSHIP_CONFLICT"
    | "NATIVE_SPATIAL_CONTRADICTION";
  proposalId: string;
  message: string;
  repairable: true;
};

export type ValidatedProposal = ExtractedProposal & {
  resolvedSubjectId?: string;
  resolvedPlaceId?: string;
};

export type ProposalValidationInput = {
  narrative: string;
  proposals: ExtractedProposal[];
  projection: CampaignProjection;
  effectiveMap: EffectiveMap;
  entityAliases: Record<string, string[]>;
  placeAliases: Record<string, string[]>;
  acceptedActionIds: string[];
  nativeSpatial?: {
    revision: number;
    playerLocationId: string | null;
    completedActionIds: string[];
  };
};

export type ProposalValidationResult = {
  accepted: ValidatedProposal[];
  issues: ProposalValidationIssue[];
};

function resolveAlias(table: Record<string, string[]>, alias: string | undefined): string | undefined {
  if (!alias) return undefined;
  const matches = table[alias] ?? [];
  return matches.length === 1 ? matches[0] : undefined;
}

export function validateExtractedProposals(
  input: ProposalValidationInput,
): ProposalValidationResult {
  const accepted: ValidatedProposal[] = [];
  const issues: ProposalValidationIssue[] = [];
  const locationIds = new Set(input.effectiveMap.definition.locations.map((location) => location.id));

  for (const proposal of input.proposals) {
    const span = proposal.sourceSpan;
    if (
      !Number.isInteger(span?.start) ||
      !Number.isInteger(span?.end) ||
      span.start < 0 ||
      span.end <= span.start ||
      span.end > input.narrative.length ||
      input.narrative.slice(span.start, span.end) !== span.quote
    ) {
      issues.push({
        code: "INVALID_SOURCE_SPAN",
        proposalId: proposal.proposalId,
        message: `source span ${String(span?.start)}:${String(span?.end)} must exactly quote accepted narrative`,
        repairable: true,
      });
      continue;
    }

    if (proposal.completion !== "completed") {
      issues.push({
        code: "INCOMPLETE_CHANGE",
        proposalId: proposal.proposalId,
        message: `${proposal.completion} proposal is not an actually completed change`,
        repairable: true,
      });
      continue;
    }
    if (proposal.certainty !== "observed") {
      issues.push({
        code: "UNSUPPORTED_CERTAINTY",
        proposalId: proposal.proposalId,
        message: `${proposal.certainty} evidence cannot establish certain actual state`,
        repairable: true,
      });
      continue;
    }
    const ownership = arbitrateFieldWrite(proposal.domain, proposal.writer);
    const isPlayerMovementProposal = proposal.payload.type === "player.moved";
    if (!ownership.allowed && !isPlayerMovementProposal) {
      issues.push({
        code: "OWNERSHIP_CONFLICT",
        proposalId: proposal.proposalId,
        message: ownership.reason ?? `domain ${proposal.domain} is not owned by ${proposal.writer}`,
        repairable: true,
      });
      continue;
    }
    if (
      isPlayerMovementProposal &&
      (!proposal.actionId || !input.acceptedActionIds.includes(proposal.actionId))
    ) {
      issues.push({
        code: "PLAYER_AGENCY",
        proposalId: proposal.proposalId,
        message: "player movement lacks an explicitly accepted action identity",
        repairable: true,
      });
      continue;
    }
    if (isPlayerMovementProposal) {
      const native = input.nativeSpatial;
      if (
        !native ||
        !proposal.actionId ||
        !native.completedActionIds.includes(proposal.actionId) ||
        native.playerLocationId !== proposal.payload.toLocationId
      ) {
        issues.push({
          code: "NATIVE_SPATIAL_CONTRADICTION",
          proposalId: proposal.proposalId,
          message: `native spatial owner reports ${native?.playerLocationId ?? "no completed location"}, not ${proposal.payload.toLocationId}`,
          repairable: true,
        });
        continue;
      }
      if (
        !locationIds.has(proposal.payload.fromLocationId) ||
        !locationIds.has(proposal.payload.toLocationId) ||
        !physicalCanReach(
          input.effectiveMap,
          proposal.payload.fromLocationId,
          proposal.payload.toLocationId,
        )
      ) {
        issues.push({
          code: "IMPOSSIBLE_ROUTE",
          proposalId: proposal.proposalId,
          message: `no effective route from ${proposal.payload.fromLocationId} to ${proposal.payload.toLocationId} at revision ${input.effectiveMap.definition.revision}`,
          repairable: true,
        });
        continue;
      }
    }
    if (
      proposal.payload.type === "location.discovered" &&
      proposal.payload.observerId === "obs:player" &&
      !proposal.visibility.includes("player")
    ) {
      issues.push({
        code: "INVALID_VISIBILITY",
        proposalId: proposal.proposalId,
        message: "player discovery requires player-visible earned evidence",
        repairable: true,
      });
      continue;
    }

    const resolvedSubjectId = resolveAlias(input.entityAliases, proposal.subjectAlias);
    const resolvedPlaceId = resolveAlias(input.placeAliases, proposal.placeAlias);
    if (proposal.subjectAlias && !resolvedSubjectId) {
      const candidates = input.entityAliases[proposal.subjectAlias] ?? [];
      issues.push({
        code: "AMBIGUOUS_ALIAS",
        proposalId: proposal.proposalId,
        message: `subject alias ${proposal.subjectAlias} is not uniquely resolved; candidates: ${candidates.join(", ") || "none"}`,
        repairable: true,
      });
      continue;
    }
    if (proposal.placeAlias && !resolvedPlaceId) {
      const candidates = input.placeAliases[proposal.placeAlias] ?? [];
      issues.push({
        code: "AMBIGUOUS_ALIAS",
        proposalId: proposal.proposalId,
        message: `place alias ${proposal.placeAlias} is not uniquely resolved; candidates: ${candidates.join(", ") || "none"}`,
        repairable: true,
      });
      continue;
    }

    const payloadSubjectId =
      proposal.payload.type === "npc.moved" ||
      proposal.payload.type === "npc.updated" ||
      proposal.payload.type === "player.moved"
        ? proposal.payload.type === "player.moved"
          ? proposal.payload.actorId
          : proposal.payload.npcId
        : proposal.payload.type === "npc.placed"
          ? proposal.payload.npc.npcId
          : undefined;
    const payloadPlaceId =
      proposal.payload.type === "npc.moved"
        ? proposal.payload.placement.kind === "at"
          ? proposal.payload.placement.locationId
          : proposal.payload.placement.kind === "traveling"
            ? proposal.payload.placement.toLocationId
            : undefined
        : proposal.payload.type === "player.moved"
          ? proposal.payload.toLocationId
          : proposal.payload.type === "location.discovered" ||
              proposal.payload.type === "location.access_changed" ||
              proposal.payload.type === "location.updated"
            ? proposal.payload.locationId
            : undefined;
    if (
      (resolvedSubjectId && payloadSubjectId && resolvedSubjectId !== payloadSubjectId) ||
      (resolvedPlaceId && payloadPlaceId && resolvedPlaceId !== payloadPlaceId)
    ) {
      issues.push({
        code: "ALIAS_ID_MISMATCH",
        proposalId: proposal.proposalId,
        message: "resolved narrative alias does not match the proposed entity/place ID",
        repairable: true,
      });
      continue;
    }

    if (proposal.payload.type === "npc.moved") {
      const npc = input.projection.npcs[proposal.payload.npcId];
      const destination =
        proposal.payload.placement.kind === "at"
          ? proposal.payload.placement.locationId
          : proposal.payload.placement.kind === "traveling"
            ? proposal.payload.placement.toLocationId
            : null;
      if (!npc) {
        issues.push({
          code: "UNKNOWN_ENTITY",
          proposalId: proposal.proposalId,
          message: `unknown NPC ${proposal.payload.npcId}`,
          repairable: true,
        });
        continue;
      }
      if (!destination || !locationIds.has(destination)) {
        issues.push({
          code: "UNKNOWN_PLACE",
          proposalId: proposal.proposalId,
          message: `unknown movement destination ${String(destination)}`,
          repairable: true,
        });
        continue;
      }
      const from = npc.placement.kind === "at" ? npc.placement.locationId : null;
      if (!from || !physicalCanReach(input.effectiveMap, from, destination)) {
        issues.push({
          code: "IMPOSSIBLE_ROUTE",
          proposalId: proposal.proposalId,
          message: `no effective route from ${String(from)} to ${destination} at revision ${input.effectiveMap.definition.revision}`,
          repairable: true,
        });
        continue;
      }
    }
    if (
      (proposal.payload.type === "location.discovered" ||
        proposal.payload.type === "location.access_changed" ||
        proposal.payload.type === "location.updated") &&
      !locationIds.has(proposal.payload.locationId)
    ) {
      issues.push({
        code: "UNKNOWN_PLACE",
        proposalId: proposal.proposalId,
        message: `unknown location ${proposal.payload.locationId}`,
        repairable: true,
      });
      continue;
    }

    accepted.push({ ...proposal, resolvedSubjectId, resolvedPlaceId });
  }
  return { accepted, issues };
}
