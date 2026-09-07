/**
 * NPC presence / goals / interruptions (Task 7).
 *
 * Maintains roster placements across the map. Schedules set expectations;
 * witnessed placement is authoritative until released. Group conversations
 * advance the roster once per accepted exchange (no per-participant ticks).
 */

import type { NpcPlacement, NpcState, StableId } from "../contracts.ts";
import type { EffectiveMap } from "../world/effective-map.ts";
import { proposeNpcTravel } from "../world/travel.ts";
import type { CompanionStoryClock } from "./clock.ts";
import {
  type AppointmentDef,
  type BatchAdvanceResult,
  type MissedAppointment,
  type ScheduleMoveProposal,
  type ScheduleWindowDef,
  batchAdvanceSchedules,
} from "./schedules.ts";

export type WitnessPin = {
  npcId: StableId;
  locationId: StableId;
  /** Absolute story minutes when pin was set; optional expiry. */
  pinnedAt: number;
  expiresAt?: number | null;
  reason: string;
};

export type NpcInterrupt = {
  npcId: StableId;
  reason: string;
  untilStoryMinutes?: number | null;
  suspendRoutine: boolean;
};

export type NpcSimState = {
  npcId: StableId;
  placement: NpcPlacement;
  activity?: string;
  goals: string[];
  /** Expected whereabouts from schedule (not a sighting). */
  expectedLocationId?: StableId | null;
  expectedActivity?: string | null;
};

export type RosterState = {
  npcs: Record<string, NpcSimState>;
  witnessPins: Record<string, WitnessPin>;
  interrupts: Record<string, NpcInterrupt>;
  appointments: AppointmentDef[];
  /** Last schedule tick identity — group chat reuses this. */
  lastTickId: string | null;
  lastTickStoryMinutes: number | null;
};

export type SimulationTickInput = {
  roster: RosterState;
  clock: CompanionStoryClock;
  previousClock: CompanionStoryClock;
  windows: ScheduleWindowDef[];
  effective: EffectiveMap;
  /**
   * Conversation / exchange identity. Multiple participants in the same
   * group chat share one exchangeId so schedules tick once.
   */
  exchangeId: string;
  /** When true, force a new tick even if exchangeId was seen (tests). */
  forceTick?: boolean;
};

export type SimulationTickResult = {
  roster: RosterState;
  batch: BatchAdvanceResult;
  /** False when this exchange already ticked (group-chat dedupe). */
  ticked: boolean;
  skippedReason?: string;
};

export function createRoster(
  initial: Array<{
    npcId: StableId;
    placement: NpcPlacement;
    activity?: string;
    goals?: string[];
  }>,
): RosterState {
  const npcs: Record<string, NpcSimState> = {};
  for (const row of initial) {
    npcs[row.npcId] = {
      npcId: row.npcId,
      placement: row.placement,
      activity: row.activity,
      goals: row.goals ?? [],
    };
  }
  return {
    npcs,
    witnessPins: {},
    interrupts: {},
    appointments: [],
    lastTickId: null,
    lastTickStoryMinutes: null,
  };
}

export function setWitnessPin(
  roster: RosterState,
  pin: WitnessPin,
): RosterState {
  const npc = roster.npcs[pin.npcId];
  const nextNpcs = { ...roster.npcs };
  if (npc) {
    nextNpcs[pin.npcId] = {
      ...npc,
      placement: { kind: "at", locationId: pin.locationId },
      activity: npc.activity,
    };
  }
  return {
    ...roster,
    npcs: nextNpcs,
    witnessPins: { ...roster.witnessPins, [pin.npcId]: pin },
  };
}

export function releaseWitnessPin(roster: RosterState, npcId: StableId): RosterState {
  const pins = { ...roster.witnessPins };
  delete pins[npcId];
  return { ...roster, witnessPins: pins };
}

export function interruptNpc(roster: RosterState, interrupt: NpcInterrupt): RosterState {
  return {
    ...roster,
    interrupts: { ...roster.interrupts, [interrupt.npcId]: interrupt },
  };
}

export function clearInterrupt(roster: RosterState, npcId: StableId): RosterState {
  const interrupts = { ...roster.interrupts };
  delete interrupts[npcId];
  return { ...roster, interrupts };
}

export function addAppointment(roster: RosterState, appointment: AppointmentDef): RosterState {
  return {
    ...roster,
    appointments: [...roster.appointments, appointment].sort((a, b) =>
      a.appointmentId.localeCompare(b.appointmentId),
    ),
  };
}

function activeWitnessSet(roster: RosterState, clock: CompanionStoryClock): Set<string> {
  const set = new Set<string>();
  for (const pin of Object.values(roster.witnessPins)) {
    if (pin.expiresAt != null && clock.storyMinutes >= pin.expiresAt) continue;
    set.add(pin.npcId);
  }
  return set;
}

function activeInterruptSet(roster: RosterState, clock: CompanionStoryClock): Set<string> {
  const set = new Set<string>();
  for (const interrupt of Object.values(roster.interrupts)) {
    if (!interrupt.suspendRoutine) continue;
    if (interrupt.untilStoryMinutes != null && clock.storyMinutes >= interrupt.untilStoryMinutes) {
      continue;
    }
    set.add(interrupt.npcId);
  }
  return set;
}

function placementsMap(roster: RosterState): Record<string, NpcPlacement> {
  const out: Record<string, NpcPlacement> = {};
  for (const [id, npc] of Object.entries(roster.npcs)) {
    out[id] = npc.placement;
  }
  return out;
}

/**
 * Apply one simulation tick for an accepted exchange.
 * Zero-elapsed chats still reconcile expectations but produce no time-driven misses
 * beyond appointments that became due exactly at this clock (caller advances clock first).
 */
export function tickRoster(input: SimulationTickInput): SimulationTickResult {
  const exchangeTickId = `exchange:${input.exchangeId}`;
  if (
    !input.forceTick &&
    input.roster.lastTickId === exchangeTickId &&
    input.roster.lastTickStoryMinutes === input.clock.storyMinutes
  ) {
    return {
      roster: input.roster,
      batch: {
        expectations: [],
        moves: [],
        missedAppointments: [],
        decisionOrder: [],
        tickId: exchangeTickId,
      },
      ticked: false,
      skippedReason: "group-chat dedupe — exchange already ticked at this story time",
    };
  }

  const witnessed = activeWitnessSet(input.roster, input.clock);
  const interrupted = activeInterruptSet(input.roster, input.clock);

  const batch = batchAdvanceSchedules({
    clock: input.clock,
    previousClock: input.previousClock,
    windows: input.windows,
    appointments: input.roster.appointments,
    placements: placementsMap(input.roster),
    witnessedNpcIds: witnessed,
    interruptedNpcIds: interrupted,
    effective: input.effective,
  });

  // Re-key tickId to exchange for group-chat proofs.
  const batchWithExchange: BatchAdvanceResult = {
    ...batch,
    tickId: exchangeTickId,
  };

  const nextNpcs: Record<string, NpcSimState> = { ...input.roster.npcs };
  for (const exp of batch.expectations) {
    const npc = nextNpcs[exp.npcId];
    if (!npc) continue;
    nextNpcs[exp.npcId] = {
      ...npc,
      expectedLocationId: exp.locationId,
      expectedActivity: exp.activity,
    };
  }

  for (const move of batch.moves) {
    if (!move.applied || !move.placement) continue;
    const npc = nextNpcs[move.npcId];
    if (!npc) continue;
    nextNpcs[move.npcId] = {
      ...npc,
      placement: move.placement,
      activity: batch.expectations.find((e) => e.npcId === move.npcId)?.activity ?? npc.activity,
    };
  }

  // Drop expired pins / interrupts.
  const witnessPins: Record<string, WitnessPin> = {};
  for (const [id, pin] of Object.entries(input.roster.witnessPins)) {
    if (pin.expiresAt != null && input.clock.storyMinutes >= pin.expiresAt) continue;
    witnessPins[id] = pin;
  }
  const interrupts: Record<string, NpcInterrupt> = {};
  for (const [id, interrupt] of Object.entries(input.roster.interrupts)) {
    if (
      interrupt.untilStoryMinutes != null &&
      input.clock.storyMinutes >= interrupt.untilStoryMinutes
    ) {
      continue;
    }
    interrupts[id] = interrupt;
  }

  const roster: RosterState = {
    ...input.roster,
    npcs: nextNpcs,
    witnessPins,
    interrupts,
    lastTickId: exchangeTickId,
    lastTickStoryMinutes: input.clock.storyMinutes,
  };

  return { roster, batch: batchWithExchange, ticked: true };
}

/**
 * Attempt an explicit NPC journey through effective topology (Task 6).
 * Used when goals require travel that schedules alone do not cover.
 */
export function tryNpcRoute(
  effective: EffectiveMap,
  npcId: StableId,
  fromLocationId: StableId,
  targetLocationId: StableId,
): { ok: true; toLocationId: StableId } | { ok: false; reason: string } {
  const validation = proposeNpcTravel(effective, {
    npcId,
    fromLocationId,
    targetLocationId,
    mode: "travel_now",
  });
  if (!validation.ok) {
    return { ok: false, reason: validation.message };
  }
  return { ok: true, toLocationId: targetLocationId };
}

export function applyMoveProposals(
  roster: RosterState,
  moves: ScheduleMoveProposal[],
): RosterState {
  const nextNpcs = { ...roster.npcs };
  for (const move of moves) {
    if (!move.applied || !move.placement) continue;
    const npc = nextNpcs[move.npcId];
    if (!npc) continue;
    nextNpcs[move.npcId] = { ...npc, placement: move.placement };
  }
  return { ...roster, npcs: nextNpcs };
}

export function missedSummary(batch: BatchAdvanceResult): MissedAppointment[] {
  return batch.missedAppointments;
}

/** Project sim state into contract NpcState records. */
export function toNpcStates(roster: RosterState): Record<string, NpcState> {
  const out: Record<string, NpcState> = {};
  for (const [id, npc] of Object.entries(roster.npcs)) {
    out[id] = {
      npcId: npc.npcId,
      placement: npc.placement,
      activity: npc.activity,
      goals: npc.goals,
      appointments: roster.appointments
        .filter((a) => a.npcId === id)
        .map((a) => a.appointmentId),
    };
  }
  return out;
}

/** Presence map: locationId → npcIds actually at that place. */
export function presenceByLocation(roster: RosterState): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const npc of Object.values(roster.npcs)) {
    if (npc.placement.kind !== "at") continue;
    const loc = npc.placement.locationId;
    (out[loc] ??= []).push(npc.npcId);
  }
  for (const ids of Object.values(out)) ids.sort();
  return out;
}
