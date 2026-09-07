/**
 * No-op World Map Companion lifecycle observer (Task 2).
 *
 * Observes roleplay chat lifecycle events without writing campaign/package
 * documents. This is companion-owned observation logic — not an Engine
 * CompanionHostBridge implementation and not a claim that packages can
 * subscribe via activate(context) alone (see docs/host-contract.md §3 / §6).
 */

export const LIFECYCLE_EVENTS = [
  "accept",
  "cancel",
  "retry",
  "edit",
  "swipe",
  "branch",
  "delete",
] as const;

export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];

export type ObservationEntry = {
  event: LifecycleEvent;
  at: string;
  detail?: Record<string, unknown>;
};

export type NoopLifecycleSnapshot = {
  enabled: boolean;
  promptContributionActive: boolean;
  counts: Record<LifecycleEvent, number>;
  companionStateWrites: number;
  ignoredWhileDisabled: number;
  log: ObservationEntry[];
};

function emptyCounts(): Record<LifecycleEvent, number> {
  return {
    accept: 0,
    cancel: 0,
    retry: 0,
    edit: 0,
    swipe: 0,
    branch: 0,
    delete: 0,
  };
}

/**
 * Create a disable/re-enable capable no-op observer.
 * When disabled, observations are ignored (cleanup: no active prompt contribution).
 */
export function createNoopLifecycleObserver() {
  let enabled = false;
  let promptContributionActive = false;
  const counts = emptyCounts();
  let companionStateWrites = 0;
  let ignoredWhileDisabled = 0;
  const log: ObservationEntry[] = [];

  return {
    enable(): void {
      enabled = true;
      promptContributionActive = true;
    },

    /** Deactivate: drop prompt contribution / listening (mirrors deactivatePackage cleanup). */
    disable(): void {
      enabled = false;
      promptContributionActive = false;
    },

    isEnabled(): boolean {
      return enabled;
    },

    hasPromptContribution(): boolean {
      return promptContributionActive;
    },

    /**
     * Record one lifecycle observation. Returns false when disabled (event ignored).
     * Does not mutate campaign docs.
     */
    observe(event: LifecycleEvent, detail?: Record<string, unknown>): boolean {
      if (!LIFECYCLE_EVENTS.includes(event)) {
        throw new Error(`Unknown lifecycle event: ${String(event)}`);
      }
      if (!enabled) {
        ignoredWhileDisabled += 1;
        return false;
      }
      counts[event] += 1;
      log.push({
        event,
        at: new Date().toISOString(),
        ...(detail ? { detail } : {}),
      });
      return true;
    },

    /**
     * Campaign/package document write path. No-op companion must never call this
     * successfully; any attempt increments the write counter and throws.
     */
    writeCampaignDocument(_input: { kind: string; data: unknown }): never {
      companionStateWrites += 1;
      throw new Error("no-op companion must not write campaign/package documents");
    },

    getSnapshot(): NoopLifecycleSnapshot {
      return {
        enabled,
        promptContributionActive,
        counts: { ...counts },
        companionStateWrites,
        ignoredWhileDisabled,
        log: log.map((entry) => ({ ...entry, detail: entry.detail ? { ...entry.detail } : undefined })),
      };
    },

    assertExactlyOnceEach(): void {
      for (const event of LIFECYCLE_EVENTS) {
        if (counts[event] !== 1) {
          throw new Error(`Expected exactly one "${event}" observation, got ${counts[event]}`);
        }
      }
    },

    assertZeroStateWrites(): void {
      if (companionStateWrites !== 0) {
        throw new Error(`Expected zero companion state writes, got ${companionStateWrites}`);
      }
    },
  };
}

export type NoopLifecycleObserver = ReturnType<typeof createNoopLifecycleObserver>;
