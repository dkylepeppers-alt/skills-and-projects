/**
 * Native quest / inventory / bonds tracker adapter (Task 8) — PROPOSED.
 *
 * Links companion leads, appointments, faction clocks, and left-behind objects
 * to existing legacy trackers through explicit ownership. Prevents duplicate
 * quest identities and conflicting relationship scales.
 *
 * Engine APIs for live tracker read/write are UNVERIFIED on the desktop host;
 * this adapter is labeled PROPOSED and does not claim an Engine export.
 */

import {
  arbitrateFieldWrite,
  type FieldDomain,
  type FieldOwner,
} from "../host/field-ownership.ts";
import type { StableId } from "../contracts.ts";
import type { ClueRecord } from "../world/affordances.ts";
import type { FactionClock, PersistentObject } from "../world/consequences.ts";

export const TRACKER_ADAPTER_HONESTY = {
  status: "PROPOSED" as const,
  activatesDesktopPackage: false,
  isEngineExport: false,
  isAgentsPackageActivate: false,
  liveTrackerApi: "UNVERIFIED" as const,
  companionHostBridge: "PROPOSED" as const,
  inspectedEngineRevision: "9bbee87d1a44c33f704977bd8c25aafbec9b85aa",
  inspectedAgentsRevision: "ee1a4a01d1091a9f5e4086c58f608e401aa1d879",
  notes: [
    "Promote a companion lead to a native quest through this adapter; keep one quest identity.",
    "Do not create a disconnected second GM notebook of duplicate trackers.",
    "Inventory and bonds remain legacy-tracker owned; companion only links.",
    "CompanionHostBridge remains PROPOSED; this file does not change that label.",
    "Engine live tracker read/write APIs are UNVERIFIED — label PROPOSED until proven.",
  ],
};

export type NativeQuestRef = {
  /** Native tracker identity — never fabricate a second companion-only duplicate. */
  nativeQuestId: string;
  title: string;
  scale?: string;
};

export type NativeBondRef = {
  nativeBondId: string;
  actorId: string;
  targetId: string;
  /** Relationship scale label used by the legacy tracker. */
  scale: string;
  value: number;
};

export type NativeInventoryRef = {
  nativeItemId: string;
  label: string;
  quantity: number;
};

export type TrackerLink =
  | {
      kind: "quest";
      companionLeadId: StableId;
      nativeQuestId: string;
      scale?: string;
    }
  | {
      kind: "inventory";
      companionObjectId: StableId;
      nativeItemId: string;
    }
  | {
      kind: "bond";
      companionFactionClockId: StableId;
      nativeBondId: string;
      scale: string;
    };

export type TrackerRegistry = {
  honesty: typeof TRACKER_ADAPTER_HONESTY;
  /** nativeQuestId → link */
  questByNativeId: Record<string, TrackerLink & { kind: "quest" }>;
  /** companionLeadId → nativeQuestId (inverse; rejects duplicates). */
  questByCompanionLead: Record<string, string>;
  inventoryLinks: Record<string, TrackerLink & { kind: "inventory" }>;
  bondLinks: Record<string, TrackerLink & { kind: "bond" }>;
  /** Bond scales already claimed — conflicting scale for same pair is rejected. */
  bondScaleByPair: Record<string, string>;
};

export function createTrackerRegistry(): TrackerRegistry {
  return {
    honesty: TRACKER_ADAPTER_HONESTY,
    questByNativeId: {},
    questByCompanionLead: {},
    inventoryLinks: {},
    bondLinks: {},
    bondScaleByPair: {},
  };
}

function assertOwner(domain: FieldDomain, writer: FieldOwner): void {
  const result = arbitrateFieldWrite(domain, writer);
  if (!result.allowed) {
    throw new Error(result.reason ?? "tracker ownership refused");
  }
}

export type PromoteLeadResult =
  | {
      ok: true;
      honesty: typeof TRACKER_ADAPTER_HONESTY;
      link: TrackerLink & { kind: "quest" };
      nativeOwnerInvoked: false;
    }
  | {
      ok: false;
      honesty: typeof TRACKER_ADAPTER_HONESTY;
      reason: string;
      nativeOwnerInvoked: false;
    };

/**
 * Promote a companion clue/lead to a native quest identity.
 * Rejects duplicate companion→quest or quest→companion mappings.
 * Writer must be legacy-tracker (quests owned by legacy-tracker).
 */
export function promoteLeadToNativeQuest(
  registry: TrackerRegistry,
  input: {
    clue: ClueRecord;
    nativeQuest: NativeQuestRef;
    /** Who is writing the native quest record. */
    writer?: FieldOwner;
  },
): { registry: TrackerRegistry; result: PromoteLeadResult } {
  const writer = input.writer ?? "legacy-tracker";
  try {
    assertOwner("quests", writer);
  } catch (err) {
    return {
      registry,
      result: {
        ok: false,
        honesty: TRACKER_ADAPTER_HONESTY,
        reason: err instanceof Error ? err.message : String(err),
        nativeOwnerInvoked: false,
      },
    };
  }

  const leadId = input.clue.clueId;
  const existingNative = registry.questByCompanionLead[leadId];
  if (existingNative && existingNative !== input.nativeQuest.nativeQuestId) {
    return {
      registry,
      result: {
        ok: false,
        honesty: TRACKER_ADAPTER_HONESTY,
        reason: `duplicate quest identity: lead ${leadId} already linked to ${existingNative}`,
        nativeOwnerInvoked: false,
      },
    };
  }
  const existingLead = registry.questByNativeId[input.nativeQuest.nativeQuestId];
  if (existingLead && existingLead.companionLeadId !== leadId) {
    return {
      registry,
      result: {
        ok: false,
        honesty: TRACKER_ADAPTER_HONESTY,
        reason: `duplicate quest identity: native ${input.nativeQuest.nativeQuestId} already linked to ${existingLead.companionLeadId}`,
        nativeOwnerInvoked: false,
      },
    };
  }

  const link: TrackerLink & { kind: "quest" } = {
    kind: "quest",
    companionLeadId: leadId,
    nativeQuestId: input.nativeQuest.nativeQuestId,
    scale: input.nativeQuest.scale,
  };
  const next: TrackerRegistry = {
    ...registry,
    questByNativeId: { ...registry.questByNativeId, [link.nativeQuestId]: link },
    questByCompanionLead: { ...registry.questByCompanionLead, [leadId]: link.nativeQuestId },
  };
  return {
    registry: next,
    result: {
      ok: true,
      honesty: TRACKER_ADAPTER_HONESTY,
      link,
      nativeOwnerInvoked: false,
    },
  };
}

export type LinkInventoryResult =
  | {
      ok: true;
      honesty: typeof TRACKER_ADAPTER_HONESTY;
      link: TrackerLink & { kind: "inventory" };
      nativeOwnerInvoked: false;
    }
  | {
      ok: false;
      honesty: typeof TRACKER_ADAPTER_HONESTY;
      reason: string;
      nativeOwnerInvoked: false;
    };

/** Link a left-behind persistent object to a native inventory item (no duplicate). */
export function linkObjectToInventory(
  registry: TrackerRegistry,
  input: {
    object: PersistentObject;
    nativeItem: NativeInventoryRef;
    writer?: FieldOwner;
  },
): { registry: TrackerRegistry; result: LinkInventoryResult } {
  const writer = input.writer ?? "legacy-tracker";
  try {
    assertOwner("inventory", writer);
  } catch (err) {
    return {
      registry,
      result: {
        ok: false,
        honesty: TRACKER_ADAPTER_HONESTY,
        reason: err instanceof Error ? err.message : String(err),
        nativeOwnerInvoked: false,
      },
    };
  }
  const existing = registry.inventoryLinks[input.object.objectId];
  if (existing && existing.nativeItemId !== input.nativeItem.nativeItemId) {
    return {
      registry,
      result: {
        ok: false,
        honesty: TRACKER_ADAPTER_HONESTY,
        reason: `object ${input.object.objectId} already linked to ${existing.nativeItemId}`,
        nativeOwnerInvoked: false,
      },
    };
  }
  const link: TrackerLink & { kind: "inventory" } = {
    kind: "inventory",
    companionObjectId: input.object.objectId,
    nativeItemId: input.nativeItem.nativeItemId,
  };
  return {
    registry: {
      ...registry,
      inventoryLinks: { ...registry.inventoryLinks, [input.object.objectId]: link },
    },
    result: {
      ok: true,
      honesty: TRACKER_ADAPTER_HONESTY,
      link,
      nativeOwnerInvoked: false,
    },
  };
}

export type LinkBondResult =
  | {
      ok: true;
      honesty: typeof TRACKER_ADAPTER_HONESTY;
      link: TrackerLink & { kind: "bond" };
      nativeOwnerInvoked: false;
    }
  | {
      ok: false;
      honesty: typeof TRACKER_ADAPTER_HONESTY;
      reason: string;
      nativeOwnerInvoked: false;
    };

function bondPairKey(a: string, b: string): string {
  return [a, b].sort().join("::");
}

/**
 * Link a faction clock to a native bond. Rejects conflicting scales for the
 * same actor/target pair.
 */
export function linkFactionClockToBond(
  registry: TrackerRegistry,
  input: {
    clock: FactionClock;
    bond: NativeBondRef;
    writer?: FieldOwner;
  },
): { registry: TrackerRegistry; result: LinkBondResult } {
  const writer = input.writer ?? "legacy-tracker";
  try {
    assertOwner("bonds", writer);
  } catch (err) {
    return {
      registry,
      result: {
        ok: false,
        honesty: TRACKER_ADAPTER_HONESTY,
        reason: err instanceof Error ? err.message : String(err),
        nativeOwnerInvoked: false,
      },
    };
  }
  const pair = bondPairKey(input.bond.actorId, input.bond.targetId);
  const existingScale = registry.bondScaleByPair[pair];
  if (existingScale && existingScale !== input.bond.scale) {
    return {
      registry,
      result: {
        ok: false,
        honesty: TRACKER_ADAPTER_HONESTY,
        reason: `conflicting bond scale for ${pair}: have ${existingScale}, got ${input.bond.scale}`,
        nativeOwnerInvoked: false,
      },
    };
  }
  const link: TrackerLink & { kind: "bond" } = {
    kind: "bond",
    companionFactionClockId: input.clock.clockId,
    nativeBondId: input.bond.nativeBondId,
    scale: input.bond.scale,
  };
  return {
    registry: {
      ...registry,
      bondLinks: { ...registry.bondLinks, [input.clock.clockId]: link },
      bondScaleByPair: { ...registry.bondScaleByPair, [pair]: input.bond.scale },
    },
    result: {
      ok: true,
      honesty: TRACKER_ADAPTER_HONESTY,
      link,
      nativeOwnerInvoked: false,
    },
  };
}

/** Companion must not dual-write native quest/inventory/bond domains. */
export function companionMayWriteTrackerDomain(domain: FieldDomain): boolean {
  const result = arbitrateFieldWrite(domain, "companion");
  return result.allowed;
}
