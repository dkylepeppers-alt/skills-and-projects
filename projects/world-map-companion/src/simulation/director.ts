/**
 * Event-triggered world director (Task 7).
 *
 * Batches narrative-judgment decisions when goals/conditions require it.
 * NEVER one model call per NPC or per token. Deterministic schedules stay in
 * code; the director only proposes non-mechanical choices with budgets and
 * schema-validated output. Seeded randomness is stored for replay.
 *
 * This module validates director output and builds invocation payloads — it
 * does not itself call an LLM. Host wiring remains PROPOSED.
 */

import { createHash } from "node:crypto";

import type { RandomResult, StableId } from "../contracts.ts";
import type { EffectiveMap } from "../world/effective-map.ts";
import { physicalCanReach } from "../world/effective-map.ts";
import type { CompanionStoryClock } from "./clock.ts";
import type { BatchAdvanceResult } from "./schedules.ts";
import type { RosterState } from "./npcs.ts";

export const DIRECTOR_HONESTY = {
  kind: "companion-world-director" as const,
  invocationModel: "event-triggered-batch" as const,
  perNpcPolling: false as const,
  companionHostBridge: "PROPOSED" as const,
  spatialOwner: "PROPOSED" as const,
  capabilityDocumentStore: false as const,
  callsLlmItself: false as const,
};

export type DirectorTriggerKind =
  | "missed_appointment"
  | "goal_blocked"
  | "long_skip_summary"
  | "interrupted_scene"
  | "author_request";

export type DirectorTrigger = {
  kind: DirectorTriggerKind;
  /** Related NPC ids (batched — not one call each). */
  npcIds: StableId[];
  detail: string;
  priority: number;
};

export type DirectorBudget = {
  /** Max NPC decisions in one director invocation. */
  maxDecisions: number;
  /** Soft token budget for the director prompt payload. */
  maxPromptTokens: number;
  /** Max triggers considered this tick. */
  maxTriggers: number;
};

export const DEFAULT_DIRECTOR_BUDGET: DirectorBudget = {
  maxDecisions: 8,
  maxPromptTokens: 1200,
  maxTriggers: 12,
};

export type DirectorDecisionProposal = {
  npcId: StableId;
  /** stay | travel | wait | pursue_goal | unknown */
  action: "stay" | "travel" | "wait" | "pursue_goal" | "unknown";
  targetLocationId?: StableId | null;
  rationale: string;
  certainty: "assumption" | "sourced" | "unknown";
};

export type DirectorOutput = {
  schemaVersion: 1;
  decisions: DirectorDecisionProposal[];
  worldEvents: Array<{ summary: string; npcIds?: StableId[] }>;
  omittedNpcIds: StableId[];
  notes?: string;
};

export type DirectorInvocation = {
  honesty: typeof DIRECTOR_HONESTY;
  triggerKinds: DirectorTriggerKind[];
  npcIds: StableId[];
  budget: DirectorBudget;
  seed: string;
  promptPath: "src/prompts/director.md";
  /** Approximate payload size in tokens (chars/4). */
  estimatedPromptTokens: number;
  context: {
    storyMinutes: number;
    triggers: DirectorTrigger[];
    rosterSnapshot: Array<{
      npcId: StableId;
      placement: string;
      expectedLocationId?: StableId | null;
      goals: string[];
    }>;
  };
};

export type DirectorValidation =
  | { ok: true; output: DirectorOutput; random: RandomResult; applied: DirectorDecisionProposal[] }
  | { ok: false; errors: string[] };

function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function placementLabel(roster: RosterState, npcId: string): string {
  const npc = roster.npcs[npcId];
  if (!npc) return "missing";
  if (npc.placement.kind === "at") return `at:${npc.placement.locationId}`;
  if (npc.placement.kind === "traveling") {
    return `traveling:${npc.placement.fromLocationId}->${npc.placement.toLocationId}`;
  }
  return `unknown:${npc.placement.notes ?? ""}`;
}

/**
 * Collect event triggers from a schedule batch + roster — no per-NPC model loop.
 */
export function collectDirectorTriggers(input: {
  batch: BatchAdvanceResult;
  roster: RosterState;
  longSkip: boolean;
}): DirectorTrigger[] {
  const triggers: DirectorTrigger[] = [];

  if (input.batch.missedAppointments.length > 0) {
    triggers.push({
      kind: "missed_appointment",
      npcIds: [...new Set(input.batch.missedAppointments.map((m) => m.npcId))].sort(),
      detail: input.batch.missedAppointments.map((m) => m.appointmentId).join(","),
      priority: 1,
    });
  }

  const blocked = input.batch.moves.filter((m) => !m.routeOk && m.reason.includes("blocked"));
  if (blocked.length > 0) {
    triggers.push({
      kind: "goal_blocked",
      npcIds: [...new Set(blocked.map((m) => m.npcId))].sort(),
      detail: `${blocked.length} schedule moves blocked by topology`,
      priority: 2,
    });
  }

  const interrupted = Object.keys(input.roster.interrupts).sort();
  if (interrupted.length > 0) {
    triggers.push({
      kind: "interrupted_scene",
      npcIds: interrupted,
      detail: "active routine interruptions",
      priority: 3,
    });
  }

  if (input.longSkip) {
    triggers.push({
      kind: "long_skip_summary",
      npcIds: Object.keys(input.roster.npcs).sort(),
      detail: "summarize intervening schedule/goal changes without per-minute turns",
      priority: 4,
    });
  }

  return triggers.sort((a, b) => a.priority - b.priority || a.kind.localeCompare(b.kind));
}

/**
 * Build a single batched director invocation when triggers warrant judgment.
 * Returns null when deterministic code handled everything (no model needed).
 */
export function maybeBuildDirectorInvocation(input: {
  clock: CompanionStoryClock;
  roster: RosterState;
  batch: BatchAdvanceResult;
  budget?: DirectorBudget;
  seed: string;
  longSkip?: boolean;
}): DirectorInvocation | null {
  const budget = input.budget ?? DEFAULT_DIRECTOR_BUDGET;
  const triggers = collectDirectorTriggers({
    batch: input.batch,
    roster: input.roster,
    longSkip: Boolean(input.longSkip),
  }).slice(0, budget.maxTriggers);

  // Deterministic path: no misses, no blocks, no long-skip, no interrupts needing judgment.
  const needsJudgment = triggers.some((t) =>
    ["missed_appointment", "goal_blocked", "long_skip_summary", "author_request"].includes(
      t.kind,
    ),
  );
  if (!needsJudgment) return null;

  const npcIds = [...new Set(triggers.flatMap((t) => t.npcIds))]
    .sort()
    .slice(0, budget.maxDecisions);

  const rosterSnapshot = npcIds.map((npcId) => ({
    npcId,
    placement: placementLabel(input.roster, npcId),
    expectedLocationId: input.roster.npcs[npcId]?.expectedLocationId ?? null,
    goals: input.roster.npcs[npcId]?.goals ?? [],
  }));

  const context = {
    storyMinutes: input.clock.storyMinutes,
    triggers,
    rosterSnapshot,
  };
  const estimatedPromptTokens = approxTokens(JSON.stringify(context));

  return {
    honesty: DIRECTOR_HONESTY,
    triggerKinds: [...new Set(triggers.map((t) => t.kind))],
    npcIds,
    budget,
    seed: input.seed,
    promptPath: "src/prompts/director.md",
    estimatedPromptTokens: Math.min(estimatedPromptTokens, budget.maxPromptTokens),
    context,
  };
}

function isAction(value: unknown): value is DirectorDecisionProposal["action"] {
  return (
    value === "stay" ||
    value === "travel" ||
    value === "wait" ||
    value === "pursue_goal" ||
    value === "unknown"
  );
}

/**
 * Validate director JSON output. Rejects per-NPC polling shapes and illegal teleports.
 */
export function validateDirectorOutput(
  raw: unknown,
  input: {
    allowedNpcIds: ReadonlySet<string>;
    roster: RosterState;
    effective: EffectiveMap;
    seed: string;
  },
): DirectorValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["director output must be an object"] };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) errors.push("schemaVersion must be 1");
  if (!Array.isArray(obj.decisions)) errors.push("decisions must be an array");
  if (!Array.isArray(obj.worldEvents)) errors.push("worldEvents must be an array");
  if (!Array.isArray(obj.omittedNpcIds)) errors.push("omittedNpcIds must be an array");

  // Reject polling anti-pattern: nested perNpcCalls / oneCallPerNpc markers.
  if ("perNpcCalls" in obj || "oneCallPerNpc" in obj) {
    errors.push("per-NPC polling fields are forbidden");
  }

  if (errors.length) return { ok: false, errors };

  const decisions: DirectorDecisionProposal[] = [];
  for (const [i, d] of (obj.decisions as unknown[]).entries()) {
    if (!d || typeof d !== "object") {
      errors.push(`decisions[${i}] must be object`);
      continue;
    }
    const row = d as Record<string, unknown>;
    if (typeof row.npcId !== "string" || !input.allowedNpcIds.has(row.npcId)) {
      errors.push(`decisions[${i}].npcId not in allowed batch`);
      continue;
    }
    if (!isAction(row.action)) {
      errors.push(`decisions[${i}].action invalid`);
      continue;
    }
    if (typeof row.rationale !== "string" || !row.rationale.trim()) {
      errors.push(`decisions[${i}].rationale required`);
      continue;
    }
    const certainty =
      row.certainty === "assumption" || row.certainty === "sourced" || row.certainty === "unknown"
        ? row.certainty
        : null;
    if (!certainty) {
      errors.push(`decisions[${i}].certainty invalid`);
      continue;
    }
    const targetLocationId =
      row.targetLocationId === null || row.targetLocationId === undefined
        ? null
        : typeof row.targetLocationId === "string"
          ? row.targetLocationId
          : null;
    if (row.action === "travel" && targetLocationId) {
      const npc = input.roster.npcs[row.npcId];
      const from =
        npc?.placement.kind === "at"
          ? npc.placement.locationId
          : npc?.placement.kind === "traveling"
            ? npc.placement.fromLocationId
            : null;
      if (from && !physicalCanReach(input.effective, from, targetLocationId)) {
        errors.push(
          `decisions[${i}]: travel ${row.npcId} ${from}→${targetLocationId} blocked on effective map`,
        );
        continue;
      }
    }
    decisions.push({
      npcId: row.npcId,
      action: row.action,
      targetLocationId,
      rationale: row.rationale,
      certainty,
    });
  }

  if (errors.length) return { ok: false, errors };

  const output: DirectorOutput = {
    schemaVersion: 1,
    decisions,
    worldEvents: (obj.worldEvents as DirectorOutput["worldEvents"]).map((e) => ({
      summary: String((e as { summary?: string }).summary ?? ""),
      npcIds: (e as { npcIds?: StableId[] }).npcIds,
    })),
    omittedNpcIds: (obj.omittedNpcIds as StableId[]).map(String),
    notes: typeof obj.notes === "string" ? obj.notes : undefined,
  };

  const random: RandomResult = {
    seed: input.seed,
    table: "director-batch",
    outcome: createHash("sha256")
      .update(input.seed)
      .update(JSON.stringify(output.decisions.map((d) => d.npcId).sort()))
      .digest("hex")
      .slice(0, 16),
  };

  return { ok: true, output, random, applied: decisions };
}

/** Seeded pick among options for replay-stable director-side randomness helpers. */
export function seededPick<T>(seed: string, table: string, options: T[]): {
  pick: T;
  random: RandomResult;
} {
  if (options.length === 0) {
    throw new Error("seededPick requires at least one option");
  }
  const digest = createHash("sha256").update(seed).update(table).digest();
  const idx = digest.readUInt32BE(0) % options.length;
  return {
    pick: options[idx]!,
    random: { seed, table, outcome: idx },
  };
}
