/**
 * Location affordances, journals, clues, rumors, appointments, services (Task 8).
 *
 * Buttons propose an action; they never silently perform it. Availability
 * depends on what the player knows, access, operating hours, who is present,
 * and current conditions.
 */

import type { AppointmentDef } from "../simulation/schedules.ts";
import type { CompanionStoryClock, OperatingHoursWindow } from "../simulation/clock.ts";
import { isServiceOpenAt } from "../simulation/clock.ts";
import type { StableId } from "../contracts.ts";
import type { WorldKnowledgeState } from "./knowledge.ts";
import { canObservePrivateRoom } from "./knowledge.ts";

export const AFFORDANCE_HONESTY = {
  kind: "companion-location-affordances" as const,
  companionHostBridge: "PROPOSED" as const,
  silentlyPerformsActions: false as const,
  isEngineExport: false as const,
};

export type AffordanceKind =
  | "search"
  | "question"
  | "study"
  | "buy"
  | "meet"
  | "rest"
  | "wait"
  | "follow_lead"
  | "interact_object";

export type AffordanceDef = {
  id: StableId;
  kind: AffordanceKind;
  locationId: StableId;
  label: string;
  /** Prerequisites described for UI; enforced in listAffordances. */
  requiresKnownLocation?: boolean;
  requiresOccupant?: boolean;
  requiresOpenService?: boolean;
  requiresClueId?: StableId;
  requiresObjectId?: StableId;
  serviceId?: StableId;
};

export type AffordanceAvailability = {
  affordance: AffordanceDef;
  available: boolean;
  reason: string;
  /** Always a proposal — never an auto-commit. */
  proposalOnly: true;
};

export type JournalEntryKind = "fact" | "lead" | "rumor" | "appointment" | "note";

export type LocationJournalEntry = {
  entryId: StableId;
  locationId: StableId;
  kind: JournalEntryKind;
  summary: string;
  storyMinutes: number;
  observerId: StableId;
  linkedClueId?: StableId;
  linkedQuestId?: StableId;
  linkedAppointmentId?: StableId;
  established: boolean;
};

export type ClueRecord = {
  clueId: StableId;
  summary: string;
  locationId?: StableId;
  discoveredBy?: StableId;
  storyMinutes: number;
  linkedLeadIds?: StableId[];
  /** When promoted via tracker adapter. */
  linkedNativeQuestId?: string | null;
};

export type LocalServiceHours = {
  openMinuteOfDay: number | null;
  closeMinuteOfDay: number | null;
  certainty: OperatingHoursWindow["certainty"];
  notes?: string;
};

export type LocalServiceDef = {
  serviceId: StableId;
  locationId: StableId;
  label: string;
  hours: LocalServiceHours;
  /** Overlay override — closed regardless of hours. */
  forcedClosed?: boolean;
  forcedClosedReason?: string;
};

export type ServiceOverrideMap = Record<
  string,
  { closed: boolean; reason: string; locationId: StableId }
>;

export type AffordanceContext = {
  knowledge: WorldKnowledgeState;
  observerId: StableId;
  locationId: StableId;
  clock: CompanionStoryClock;
  occupants: StableId[];
  services: LocalServiceDef[];
  clues: ClueRecord[];
  objectsPresent: StableId[];
  physicallyOpen: boolean;
  permissionGranted: boolean;
  affordances: AffordanceDef[];
  /** Consequence serviceOverrides — applied in evaluateServiceOpen. */
  serviceOverrides?: ServiceOverrideMap;
};

export function listAffordances(ctx: AffordanceContext): AffordanceAvailability[] {
  const privateObs = canObservePrivateRoom(ctx.knowledge, {
    observerId: ctx.observerId,
    locationId: ctx.locationId,
    physicallyOpen: ctx.physicallyOpen,
    permissionGranted: ctx.permissionGranted,
  });
  const obs = ctx.knowledge.observers[ctx.observerId];
  const locationKnown = obs?.knownLocationIds.includes(ctx.locationId) ?? false;

  return ctx.affordances
    .filter((a) => a.locationId === ctx.locationId)
    .map((affordance) => {
      if (!ctx.physicallyOpen && affordance.kind !== "wait") {
        return unavailable(affordance, "location physically sealed");
      }
      if (affordance.requiresKnownLocation && !locationKnown) {
        return unavailable(affordance, "location unknown to observer");
      }
      if (!privateObs.mayEnter && ["search", "study", "rest", "interact_object"].includes(affordance.kind)) {
        return unavailable(affordance, privateObs.reason);
      }
      if (affordance.requiresOccupant && ctx.occupants.length === 0) {
        return unavailable(affordance, "no known occupants present");
      }
      if (affordance.requiresOpenService || affordance.kind === "buy") {
        const service = ctx.services.find(
          (s) =>
            s.locationId === ctx.locationId &&
            (!affordance.serviceId || s.serviceId === affordance.serviceId),
        );
        if (!service) {
          return unavailable(affordance, "no matching service at location");
        }
        const open = evaluateServiceOpen(service, ctx.clock, ctx.serviceOverrides);
        if (!open.open) {
          return unavailable(affordance, open.reason);
        }
      }
      if (affordance.requiresClueId) {
        const has = ctx.clues.some((c) => c.clueId === affordance.requiresClueId);
        const known =
          obs?.knownClueIds.includes(affordance.requiresClueId) ||
          ctx.clues.some(
            (c) => c.clueId === affordance.requiresClueId && c.discoveredBy === ctx.observerId,
          );
        if (!has || !known) {
          return unavailable(affordance, "required clue not known");
        }
      }
      if (affordance.requiresObjectId) {
        if (!ctx.objectsPresent.includes(affordance.requiresObjectId)) {
          return unavailable(affordance, "required object not present");
        }
      }
      if (affordance.kind === "question" && ctx.occupants.length === 0) {
        return unavailable(affordance, "nobody present to question");
      }
      return {
        affordance,
        available: true,
        reason: "prerequisites met — proposal only",
        proposalOnly: true as const,
      };
    });
}

function unavailable(affordance: AffordanceDef, reason: string): AffordanceAvailability {
  return { affordance, available: false, reason, proposalOnly: true };
}

export function evaluateServiceOpen(
  service: LocalServiceDef,
  clock: CompanionStoryClock,
  serviceOverrides?: ServiceOverrideMap,
): { open: boolean; reason: string } {
  const override = serviceOverrides?.[service.serviceId];
  if (override?.closed) {
    return {
      open: false,
      reason: override.reason || "service forced closed",
    };
  }
  if (service.forcedClosed) {
    return {
      open: false,
      reason: service.forcedClosedReason ?? "service forced closed",
    };
  }
  const hours: OperatingHoursWindow = {
    serviceId: service.serviceId,
    locationId: service.locationId,
    openMinuteOfDay: service.hours.openMinuteOfDay,
    closeMinuteOfDay: service.hours.closeMinuteOfDay,
    certainty: service.hours.certainty,
    notes: service.hours.notes,
  };
  const result = isServiceOpenAt(hours, clock);
  if (result.open === null) {
    return { open: false, reason: result.reason };
  }
  return { open: result.open, reason: result.reason };
}

/**
 * Propose an affordance action — never mutates world state.
 */
export function proposeAffordanceAction(
  availability: AffordanceAvailability,
  actorId: StableId,
): {
  proposed: boolean;
  honesty: typeof AFFORDANCE_HONESTY;
  actionId: string;
  kind: AffordanceKind;
  locationId: StableId;
  actorId: StableId;
  reason: string;
  performed: false;
} {
  if (!availability.available) {
    return {
      proposed: false,
      honesty: AFFORDANCE_HONESTY,
      actionId: `action:rejected:${availability.affordance.id}`,
      kind: availability.affordance.kind,
      locationId: availability.affordance.locationId,
      actorId,
      reason: availability.reason,
      performed: false,
    };
  }
  return {
    proposed: true,
    honesty: AFFORDANCE_HONESTY,
    actionId: `action:propose:${availability.affordance.id}:${actorId}`,
    kind: availability.affordance.kind,
    locationId: availability.affordance.locationId,
    actorId,
    reason: "proposal queued for turn barrier — not performed",
    performed: false,
  };
}

export type LocationJournal = {
  locationId: StableId;
  entries: LocationJournalEntry[];
};

export function createJournal(locationId: StableId): LocationJournal {
  return { locationId, entries: [] };
}

export function appendJournalEntry(
  journal: LocationJournal,
  entry: LocationJournalEntry,
): LocationJournal {
  if (entry.locationId !== journal.locationId) {
    throw new Error("journal entry location mismatch");
  }
  return { ...journal, entries: [...journal.entries, entry] };
}

/** Facts vs leads — established facts have established:true. */
export function journalFacts(journal: LocationJournal): LocationJournalEntry[] {
  return journal.entries.filter((e) => e.kind === "fact" && e.established);
}

export function journalLeads(journal: LocationJournal): LocationJournalEntry[] {
  return journal.entries.filter((e) => e.kind === "lead" || (e.kind === "rumor" && !e.established));
}

export function linkAppointmentToJournal(
  journal: LocationJournal,
  appointment: AppointmentDef,
  observerId: StableId,
  entryId: StableId,
): LocationJournal {
  return appendJournalEntry(journal, {
    entryId,
    locationId: journal.locationId,
    kind: "appointment",
    summary: appointment.label,
    storyMinutes: appointment.dueStoryMinutes,
    observerId,
    linkedAppointmentId: appointment.appointmentId,
    established: true,
  });
}
