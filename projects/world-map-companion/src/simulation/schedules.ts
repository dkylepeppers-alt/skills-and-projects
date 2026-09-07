/**
 * Schedule / appointment batch advance (Task 7).
 *
 * Deterministic priorities: witnessed > commitment > appointment > goal > routine.
 * Schedules predict expected whereabouts; they never prove a sighting and never
 * override a witnessed placement or teleport through a sealed/blocked route.
 */

import type { NpcPlacement, StableId } from "../contracts.ts";
import type { EffectiveMap } from "../world/effective-map.ts";
import { physicalCanReach } from "../world/effective-map.ts";
import type { CompanionStoryClock, StoryMinutes, TimeCertainty } from "./clock.ts";
import { splitStoryMinutes } from "./clock.ts";

export type SchedulePriority =
  | "witnessed"
  | "commitment"
  | "appointment"
  | "goal"
  | "routine";

/** Lower number = higher priority (deterministic sort). */
export const SCHEDULE_PRIORITY_RANK: Record<SchedulePriority, number> = {
  witnessed: 0,
  commitment: 1,
  appointment: 2,
  goal: 3,
  routine: 4,
};

export type ScheduleWindowDef = {
  id: StableId;
  scheduleId: StableId;
  npcId: StableId;
  /** Inclusive minute-of-day; null = UNKNOWN / not clock-bound. */
  startMinuteOfDay: number | null;
  /** Exclusive minute-of-day; null = UNKNOWN. */
  endMinuteOfDay: number | null;
  locationId: StableId;
  activity: string;
  travelRequired: boolean;
  priority: SchedulePriority;
  certainty: TimeCertainty;
  /** Day indices this window applies to; empty/undefined = every day. */
  dayIndices?: number[];
  notes?: string;
};

export type AppointmentDef = {
  appointmentId: StableId;
  npcId: StableId;
  locationId: StableId;
  /** Absolute story minutes when the appointment is due. */
  dueStoryMinutes: StoryMinutes;
  /** Grace period after due before marking missed. */
  graceMinutes?: number;
  withNpcIds?: StableId[];
  label: string;
  priority: "appointment" | "commitment";
};

export type ScheduleExpectation = {
  npcId: StableId;
  windowId: StableId | null;
  locationId: StableId | null;
  activity: string | null;
  priority: SchedulePriority;
  certainty: TimeCertainty;
  /** Expected ≠ witnessed. */
  isSighting: false;
  notes?: string;
};

export type ScheduleMoveProposal = {
  npcId: StableId;
  fromLocationId: StableId | null;
  toLocationId: StableId;
  windowId: StableId;
  priority: SchedulePriority;
  routeOk: boolean;
  applied: boolean;
  reason: string;
  placement?: NpcPlacement;
};

export type MissedAppointment = {
  appointmentId: StableId;
  npcId: StableId;
  locationId: StableId;
  dueStoryMinutes: StoryMinutes;
  missedAt: StoryMinutes;
  label: string;
};

export type BatchAdvanceInput = {
  clock: CompanionStoryClock;
  /** Previous clock before this tick (for boundary detection). */
  previousClock: CompanionStoryClock;
  windows: ScheduleWindowDef[];
  appointments: AppointmentDef[];
  /** Actual placements keyed by npcId. */
  placements: Record<string, NpcPlacement>;
  /** NPCs currently pinned by witnessed placement. */
  witnessedNpcIds: ReadonlySet<string>;
  /** NPCs with an active interruption (routine suspended). */
  interruptedNpcIds: ReadonlySet<string>;
  effective: EffectiveMap;
};

export type BatchAdvanceResult = {
  expectations: ScheduleExpectation[];
  moves: ScheduleMoveProposal[];
  missedAppointments: MissedAppointment[];
  /** Sorted decision keys for determinism proof. */
  decisionOrder: string[];
  tickId: string;
};

function windowActiveAt(window: ScheduleWindowDef, clock: CompanionStoryClock): boolean {
  if (window.startMinuteOfDay === null || window.endMinuteOfDay === null) {
    return false;
  }
  const { dayIndex, minuteOfDay } = splitStoryMinutes(clock.storyMinutes);
  if (window.dayIndices && window.dayIndices.length > 0 && !window.dayIndices.includes(dayIndex)) {
    return false;
  }
  const { startMinuteOfDay: start, endMinuteOfDay: end } = window;
  if (start <= end) {
    return minuteOfDay >= start && minuteOfDay < end;
  }
  // Overnight window.
  return minuteOfDay >= start || minuteOfDay < end;
}

function placementLocation(placement: NpcPlacement | undefined): StableId | null {
  if (!placement) return null;
  if (placement.kind === "at") return placement.locationId;
  if (placement.kind === "traveling") return placement.fromLocationId;
  return null;
}

function compareWindows(a: ScheduleWindowDef, b: ScheduleWindowDef): number {
  const pr = SCHEDULE_PRIORITY_RANK[a.priority] - SCHEDULE_PRIORITY_RANK[b.priority];
  if (pr !== 0) return pr;
  const npc = a.npcId.localeCompare(b.npcId);
  if (npc !== 0) return npc;
  return a.id.localeCompare(b.id);
}

/**
 * Select the highest-priority active window per NPC (deterministic).
 * Witnessed / interrupted NPCs still get expectations but no move proposals.
 */
export function expectedWhereabouts(
  windows: ScheduleWindowDef[],
  clock: CompanionStoryClock,
): Map<string, ScheduleExpectation> {
  const byNpc = new Map<string, ScheduleWindowDef[]>();
  for (const w of windows) {
    if (!windowActiveAt(w, clock)) continue;
    const list = byNpc.get(w.npcId) ?? [];
    list.push(w);
    byNpc.set(w.npcId, list);
  }

  const out = new Map<string, ScheduleExpectation>();
  for (const [npcId, list] of [...byNpc.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort(compareWindows);
    const best = list[0]!;
    out.set(npcId, {
      npcId,
      windowId: best.id,
      locationId: best.locationId,
      activity: best.activity,
      priority: best.priority,
      certainty: best.certainty,
      isSighting: false,
      notes: best.notes,
    });
  }
  return out;
}

/**
 * Batch-advance schedules/goals for one story-time tick.
 * One tickId per accepted exchange — group chat must not call this once per participant.
 */
export function batchAdvanceSchedules(input: BatchAdvanceInput): BatchAdvanceResult {
  const tickId = `tick:${input.previousClock.storyMinutes}->${input.clock.storyMinutes}`;
  const expectationsMap = expectedWhereabouts(input.windows, input.clock);
  const expectations = [...expectationsMap.values()].sort((a, b) =>
    a.npcId.localeCompare(b.npcId),
  );

  const candidateWindows = input.windows
    .filter((w) => windowActiveAt(w, input.clock))
    .sort(compareWindows);

  const moves: ScheduleMoveProposal[] = [];
  const decisionOrder: string[] = [];
  const movedNpcs = new Set<string>();

  for (const w of candidateWindows) {
    const key = `${SCHEDULE_PRIORITY_RANK[w.priority]}:${w.npcId}:${w.id}`;
    decisionOrder.push(key);
    if (movedNpcs.has(w.npcId)) continue;

    if (input.witnessedNpcIds.has(w.npcId)) {
      moves.push({
        npcId: w.npcId,
        fromLocationId: placementLocation(input.placements[w.npcId]),
        toLocationId: w.locationId,
        windowId: w.id,
        priority: w.priority,
        routeOk: false,
        applied: false,
        reason: "witnessed placement beats schedule — no teleport",
      });
      movedNpcs.add(w.npcId);
      continue;
    }

    if (input.interruptedNpcIds.has(w.npcId) && w.priority === "routine") {
      moves.push({
        npcId: w.npcId,
        fromLocationId: placementLocation(input.placements[w.npcId]),
        toLocationId: w.locationId,
        windowId: w.id,
        priority: w.priority,
        routeOk: false,
        applied: false,
        reason: "routine interrupted — schedule suspended",
      });
      movedNpcs.add(w.npcId);
      continue;
    }

    const from = placementLocation(input.placements[w.npcId]);
    if (from === w.locationId) {
      moves.push({
        npcId: w.npcId,
        fromLocationId: from,
        toLocationId: w.locationId,
        windowId: w.id,
        priority: w.priority,
        routeOk: true,
        applied: false,
        reason: "already at expected location",
        placement: { kind: "at", locationId: w.locationId },
      });
      movedNpcs.add(w.npcId);
      continue;
    }

    if (from === null) {
      // Unknown placement: may set expected activity but not invent a teleport.
      moves.push({
        npcId: w.npcId,
        fromLocationId: null,
        toLocationId: w.locationId,
        windowId: w.id,
        priority: w.priority,
        routeOk: false,
        applied: false,
        reason: "placement unknown — schedule sets expectation only, not a sighting",
      });
      movedNpcs.add(w.npcId);
      continue;
    }

    const routeOk = physicalCanReach(input.effective, from, w.locationId);
    if (!routeOk) {
      moves.push({
        npcId: w.npcId,
        fromLocationId: from,
        toLocationId: w.locationId,
        windowId: w.id,
        priority: w.priority,
        routeOk: false,
        applied: false,
        reason: "blocked or sealed route — refusing schedule teleport",
      });
      movedNpcs.add(w.npcId);
      continue;
    }

    moves.push({
      npcId: w.npcId,
      fromLocationId: from,
      toLocationId: w.locationId,
      windowId: w.id,
      priority: w.priority,
      routeOk: true,
      applied: true,
      reason: `schedule ${w.priority} move via effective topology`,
      placement: { kind: "at", locationId: w.locationId },
    });
    movedNpcs.add(w.npcId);
  }

  const missedAppointments: MissedAppointment[] = [];
  for (const appt of [...input.appointments].sort((a, b) =>
    a.appointmentId.localeCompare(b.appointmentId),
  )) {
    const grace = appt.graceMinutes ?? 0;
    const deadline = appt.dueStoryMinutes + grace;
    if (input.clock.storyMinutes < deadline) continue;
    if (input.previousClock.storyMinutes >= deadline) continue; // already past in prior tick

    const loc = placementLocation(input.placements[appt.npcId]);
    const witnessedHere =
      input.witnessedNpcIds.has(appt.npcId) && loc === appt.locationId;
    if (witnessedHere || loc === appt.locationId) continue;

    missedAppointments.push({
      appointmentId: appt.appointmentId,
      npcId: appt.npcId,
      locationId: appt.locationId,
      dueStoryMinutes: appt.dueStoryMinutes,
      missedAt: input.clock.storyMinutes,
      label: appt.label,
    });
  }

  return {
    expectations,
    moves,
    missedAppointments,
    decisionOrder,
    tickId,
  };
}

/** Load pack windows; UNKNOWN clocks yield null bounds (inactive as clock-bound). */
export function packWindowToDef(
  raw: {
    id: string;
    scheduleId: string;
    npcId: string;
    start?: string;
    end?: string;
    locationId: string;
    activity: string;
    travelRequired?: boolean;
    certainty?: string;
    priority?: string;
    notes?: string;
  },
  overrides: Partial<ScheduleWindowDef> = {},
): ScheduleWindowDef {
  const parseClock = (v: string | undefined): number | null => {
    if (!v || v === "UNKNOWN") return null;
    const m = v.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const base: ScheduleWindowDef = {
    id: raw.id,
    scheduleId: raw.scheduleId,
    npcId: raw.npcId,
    startMinuteOfDay: parseClock(raw.start),
    endMinuteOfDay: parseClock(raw.end),
    locationId: raw.locationId,
    activity: raw.activity,
    travelRequired: raw.travelRequired ?? false,
    priority: (raw.priority as SchedulePriority | undefined) ?? "routine",
    certainty: (raw.certainty as TimeCertainty | undefined) ?? "assumption",
    notes: raw.notes,
  };
  return { ...base, ...overrides };
}
