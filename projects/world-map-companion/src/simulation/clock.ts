/**
 * Story clock + native world-state reconciliation (Task 7).
 *
 * Companion owns the campaign story clock (field-ownership: storyClock).
 * Native world-state agent fields (date/time/weather) are reconciled into one
 * published commit — never two independent clocks.
 *
 * Honesty: this module does not call Engine APIs or invent CapabilityDocumentStore.
 */

import type { StableId } from "../contracts.ts";

/** Minutes since an arbitrary campaign epoch (day 0 00:00). */
export type StoryMinutes = number;

export type TimeCertainty = "exact" | "approx" | "unknown" | "assumption";

export type CompanionStoryClock = {
  /** Absolute story minutes from campaign epoch. */
  storyMinutes: StoryMinutes;
  /** Optional display calendar label (may be ASSUMPTION). */
  calendarLabel?: string | null;
  weather?: string | null;
  temperature?: string | null;
  certainty: TimeCertainty;
  /** Last native fields absorbed into this clock, if any. */
  lastNative?: NativeWorldStateSnapshot | null;
  honesty: {
    kind: "companion-story-clock";
    dualIndependentClocks: false;
    capabilityDocumentStore: false;
  };
};

/** Native world-state tracker shape (Agents world-state agent schema). */
export type NativeWorldStateSnapshot = {
  date: string | null;
  time: string | null;
  weather?: string | null;
  temperature?: string | null;
  location?: string | null;
};

export type ClockAdvanceKind =
  | "wait"
  | "travel"
  | "appointment"
  | "long_skip"
  | "conversation"
  | "ooc"
  | "edit_retry"
  | "status_inspect";

export type ClockAdvanceRequest = {
  kind: ClockAdvanceKind;
  /** Elapsed story minutes; ignored / forced 0 for OOC / edit / status. */
  elapsedMinutes?: number;
  notes?: string;
  travelCertainty?: TimeCertainty;
};

export type ClockAdvanceResult = {
  clock: CompanionStoryClock;
  elapsedMinutes: number;
  advanced: boolean;
  reason: string;
};

export type ReconcileResult = {
  clock: CompanionStoryClock;
  /** True when native fields changed the companion clock. */
  absorbedNative: boolean;
  conflicts: string[];
  published: {
    date: string | null;
    time: string | null;
    weather: string | null;
    storyMinutes: StoryMinutes;
  };
};

export const CLOCK_HONESTY = {
  kind: "companion-story-clock" as const,
  dualIndependentClocks: false as const,
  capabilityDocumentStore: false as const,
  companionHostBridge: "PROPOSED" as const,
  spatialOwner: "PROPOSED" as const,
};

const MINUTES_PER_DAY = 24 * 60;

export function createStoryClock(input: {
  storyMinutes?: StoryMinutes;
  calendarLabel?: string | null;
  weather?: string | null;
  temperature?: string | null;
  certainty?: TimeCertainty;
}): CompanionStoryClock {
  return {
    storyMinutes: input.storyMinutes ?? 0,
    calendarLabel: input.calendarLabel ?? null,
    weather: input.weather ?? null,
    temperature: input.temperature ?? null,
    certainty: input.certainty ?? "assumption",
    lastNative: null,
    honesty: {
      kind: "companion-story-clock",
      dualIndependentClocks: false,
      capabilityDocumentStore: false,
    },
  };
}

/** Day index and minute-of-day from absolute story minutes. */
export function splitStoryMinutes(storyMinutes: StoryMinutes): {
  dayIndex: number;
  minuteOfDay: number;
} {
  const dayIndex = Math.floor(storyMinutes / MINUTES_PER_DAY);
  const minuteOfDay = ((storyMinutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return { dayIndex, minuteOfDay };
}

export function storyMinutesFromParts(dayIndex: number, minuteOfDay: number): StoryMinutes {
  return dayIndex * MINUTES_PER_DAY + minuteOfDay;
}

/**
 * Parse native time strings into minute-of-day when possible.
 * Supports 24h HH:MM, 12h with am/pm, and common phrases (aligned with Engine HUD helpers).
 */
export function parseNativeTimeToMinuteOfDay(time: string | null | undefined): {
  minuteOfDay: number | null;
  certainty: TimeCertainty;
  raw: string;
} {
  const text = (time ?? "").trim();
  if (!text) return { minuteOfDay: null, certainty: "unknown", raw: "" };

  const meridiem = text.match(/\b(1[0-2]|0?\d)(?:[:.h]([0-5]\d))?\s*([ap])\.?m?\.?\b/i);
  if (meridiem) {
    const displayHour = Number(meridiem[1]);
    const minute = Number(meridiem[2] ?? "00");
    const marker = meridiem[3]!.toLowerCase();
    const hour = marker === "p" ? (displayHour % 12) + 12 : displayHour % 12;
    return { minuteOfDay: hour * 60 + minute, certainty: "exact", raw: text };
  }

  const twentyFour = text.match(/\b([01]?\d|2[0-3])[:.h]([0-5]\d)\b/i);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    return { minuteOfDay: hour * 60 + minute, certainty: "exact", raw: text };
  }

  const lower = text.toLowerCase();
  const phrases: Array<[RegExp, number]> = [
    [/\bmidnight\b/, 0],
    [/\b(dawn|sunrise|daybreak)\b/, 6 * 60],
    [/\bmorning\b/, 9 * 60],
    [/\b(noon|midday)\b/, 12 * 60],
    [/\bafternoon\b/, 15 * 60],
    [/\b(dusk|sunset|evening)\b/, 18 * 60],
    [/\bnight\b/, 22 * 60],
  ];
  for (const [re, mod] of phrases) {
    if (re.test(lower)) {
      return { minuteOfDay: mod, certainty: "approx", raw: text };
    }
  }

  return { minuteOfDay: null, certainty: "unknown", raw: text };
}

export function formatMinuteOfDay(minuteOfDay: number): string {
  const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function formatStoryClock(clock: CompanionStoryClock): {
  date: string;
  time: string;
  weather: string | null;
} {
  const { dayIndex, minuteOfDay } = splitStoryMinutes(clock.storyMinutes);
  const date =
    clock.calendarLabel && clock.calendarLabel.trim().length > 0
      ? `${clock.calendarLabel} (day ${dayIndex})`
      : `Day ${dayIndex}`;
  return {
    date,
    time: formatMinuteOfDay(minuteOfDay),
    weather: clock.weather ?? null,
  };
}

/**
 * Advance story time. OOC / edit / retry / status inspection never advance.
 * Quiet conversation may pass 0 elapsed (zero-elapsed chat).
 * Travel with unknown duration records notes but does not invent minutes unless provided.
 */
export function advanceClock(
  clock: CompanionStoryClock,
  request: ClockAdvanceRequest,
): ClockAdvanceResult {
  const nonAdvancing: ClockAdvanceKind[] = ["ooc", "edit_retry", "status_inspect"];
  if (nonAdvancing.includes(request.kind)) {
    return {
      clock,
      elapsedMinutes: 0,
      advanced: false,
      reason: `${request.kind} does not advance story time`,
    };
  }

  if (request.kind === "travel" && request.travelCertainty === "unknown" && request.elapsedMinutes == null) {
    return {
      clock,
      elapsedMinutes: 0,
      advanced: false,
      reason:
        "Travel duration UNKNOWN — no authored route-cost; refusing to invent elapsed minutes",
    };
  }

  const elapsed = Math.max(0, Math.floor(request.elapsedMinutes ?? 0));
  if (elapsed === 0) {
    return {
      clock,
      elapsedMinutes: 0,
      advanced: false,
      reason: request.notes ?? "zero elapsed — clock unchanged",
    };
  }

  const next: CompanionStoryClock = {
    ...clock,
    storyMinutes: clock.storyMinutes + elapsed,
    certainty:
      request.kind === "long_skip" && clock.certainty === "exact" ? "approx" : clock.certainty,
  };
  return {
    clock: next,
    elapsedMinutes: elapsed,
    advanced: true,
    reason: request.notes ?? `advanced ${elapsed} story minutes (${request.kind})`,
  };
}

/**
 * Reconcile companion clock with native world-state fields into one published view.
 * Prefer exact native clock when parseable; keep companion day index unless native date is set.
 * Conflicts are reported, not silently dual-written.
 */
export function reconcileWithNative(
  clock: CompanionStoryClock,
  native: NativeWorldStateSnapshot,
): ReconcileResult {
  const conflicts: string[] = [];
  const parsed = parseNativeTimeToMinuteOfDay(native.time);
  const { dayIndex } = splitStoryMinutes(clock.storyMinutes);
  let storyMinutes = clock.storyMinutes;
  let certainty = clock.certainty;
  let absorbedNative = false;

  if (parsed.minuteOfDay !== null) {
    const companionMod = splitStoryMinutes(clock.storyMinutes).minuteOfDay;
    if (Math.abs(companionMod - parsed.minuteOfDay) > 1) {
      conflicts.push(
        `time skew: companion ${formatMinuteOfDay(companionMod)} vs native ${parsed.raw}`,
      );
    }
    storyMinutes = storyMinutesFromParts(dayIndex, parsed.minuteOfDay);
    certainty = parsed.certainty;
    absorbedNative = true;
  } else if (native.time && native.time.trim()) {
    conflicts.push(`native time unparseable: ${native.time}`);
  }

  const weather = native.weather ?? clock.weather ?? null;
  if (native.weather && clock.weather && native.weather !== clock.weather) {
    conflicts.push(`weather: companion "${clock.weather}" vs native "${native.weather}"`);
    absorbedNative = true;
  }

  const calendarLabel =
    native.date && native.date.trim() ? native.date.trim() : clock.calendarLabel ?? null;
  if (native.date && clock.calendarLabel && native.date.trim() !== clock.calendarLabel) {
    conflicts.push(`date: companion "${clock.calendarLabel}" vs native "${native.date}"`);
    absorbedNative = true;
  }

  const next: CompanionStoryClock = {
    ...clock,
    storyMinutes,
    calendarLabel,
    weather,
    temperature: native.temperature ?? clock.temperature ?? null,
    certainty,
    lastNative: { ...native },
  };

  const published = formatStoryClock(next);
  return {
    clock: next,
    absorbedNative: absorbedNative || parsed.minuteOfDay !== null,
    conflicts,
    published: {
      date: published.date,
      time: published.time,
      weather: published.weather,
      storyMinutes: next.storyMinutes,
    },
  };
}

/** Calendar day boundary crossings between two absolute story times. */
export function dayBoundariesCrossed(from: StoryMinutes, to: StoryMinutes): number[] {
  if (to <= from) return [];
  const startDay = Math.floor(from / MINUTES_PER_DAY);
  const endDay = Math.floor(to / MINUTES_PER_DAY);
  const days: number[] = [];
  for (let d = startDay + 1; d <= endDay; d++) days.push(d);
  return days;
}

export type OperatingHoursWindow = {
  serviceId: StableId;
  locationId: StableId;
  /** Inclusive minute-of-day start; null = UNKNOWN. */
  openMinuteOfDay: number | null;
  /** Exclusive minute-of-day end; null = UNKNOWN. */
  closeMinuteOfDay: number | null;
  certainty: TimeCertainty;
  notes?: string;
};

export type ServiceOpenResult = {
  open: boolean | null;
  reason: string;
  certainty: TimeCertainty;
};

export function isServiceOpenAt(
  hours: OperatingHoursWindow,
  clock: CompanionStoryClock,
): ServiceOpenResult {
  if (hours.openMinuteOfDay === null || hours.closeMinuteOfDay === null) {
    return {
      open: null,
      reason: hours.notes ?? "operating hours UNKNOWN — cannot assert open/closed",
      certainty: "unknown",
    };
  }
  const { minuteOfDay } = splitStoryMinutes(clock.storyMinutes);
  const open =
    hours.openMinuteOfDay <= hours.closeMinuteOfDay
      ? minuteOfDay >= hours.openMinuteOfDay && minuteOfDay < hours.closeMinuteOfDay
      : minuteOfDay >= hours.openMinuteOfDay || minuteOfDay < hours.closeMinuteOfDay;
  return {
    open,
    reason: open ? "within authored hours" : "outside authored hours",
    certainty: hours.certainty,
  };
}

export { MINUTES_PER_DAY };
