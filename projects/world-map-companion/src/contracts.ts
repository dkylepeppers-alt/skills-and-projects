/**
 * World Map Companion — domain contracts (Task 3).
 *
 * Canonical DTOs from plan §5. Versioned external payloads carry `schemaVersion`.
 * Not Engine exports. CompanionHostBridge turn types live here; host/types re-exports them.
 */

/** Current payload schema major for companion-owned documents. */
export const CONTRACT_SCHEMA_VERSION = 1 as const;

export type SchemaVersioned = {
  schemaVersion: typeof CONTRACT_SCHEMA_VERSION | number;
};

// ─── Stable ID rules ─────────────────────────────────────────────────────────

/**
 * Stable IDs are opaque non-empty strings. Domain prefixes are conventions only:
 * - world: `world:<slug>`
 * - campaign: `campaign:<slug>`
 * - branch: `branch:<slug>`
 * - npc: `npc:<slug>` (companion-owned; never fabricate native character UUIDs)
 * - location: existing map location IDs (e.g. Nevermore v2 IDs)
 * - event: `evt:<ulid-or-uuid>`
 * - observer: `obs:<slug>`
 * - ticket: `ticket:<ulid-or-uuid>`
 *
 * Equality is exact string match. Cross-campaign ID reuse does not imply identity.
 */
export type StableId = string;

export const STABLE_ID_PREFIX = {
  world: "world:",
  campaign: "campaign:",
  branch: "branch:",
  npc: "npc:",
  event: "evt:",
  observer: "obs:",
  ticket: "ticket:",
} as const;

export function isNonEmptyStableId(value: unknown): value is StableId {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}

// ─── Turn protocol (plan §5) ─────────────────────────────────────────────────

export type TurnAnchor = {
  chatId: string;
  messageId: string;
  swipeIndex: number;
  contentHash: string;
};

export type StateCursor = {
  campaignId: string;
  branchId: string;
  headEventId: string | null;
  revision: number;
};

export type TurnTicket = {
  id: string;
  base: StateCursor;
  anchor: TurnAnchor;
  acceptedActionIds: string[];
  observationOnly: boolean;
};

export type TurnInput = {
  chatId: string;
  messageId?: string | null;
  swipeIndex?: number;
  contentHash?: string;
  campaignId?: string;
  branchId?: string;
  baseRevision?: number;
  headEventId?: string | null;
  acceptedActionIds?: string[];
  observationOnly?: boolean;
};

export type AcceptedResponse = {
  chatId: string;
  messageId: string;
  swipeIndex: number;
  contentHash: string;
  content?: string;
};

export type CommitResult = {
  committed: boolean;
  cursor: StateCursor;
  ticketId: string;
  observationOnly: boolean;
  reason?: string;
};

export type HistorySelectionKind = "swipe" | "branch" | "edit" | "delete" | "retry";

export type HistorySelection = {
  kind: HistorySelectionKind;
  chatId: string;
  campaignId?: string;
  branchId?: string;
  messageId?: string;
  swipeIndex?: number;
  contentHash?: string;
  branchChatId?: string;
};

// ─── World pack ──────────────────────────────────────────────────────────────

export type PlacementKind = "at" | "traveling" | "unknown";

export type LocationProfileKind =
  | "playable-scene"
  | "circulation"
  | "boundary-gate"
  | "regional-container";

export type WorldLocationProfile = {
  locationId: StableId;
  kind: LocationProfileKind;
  affordances?: string[];
  accessNotes?: string;
  timeAssumptions?: string;
  npcAssociations?: StableId[];
  sourceRefs?: string[];
};

export type WorldNpcDefinition = {
  npcId: StableId;
  displayName: string;
  /** Bound native character IDs when known — never fabricated. */
  nativeCharacterIds?: string[];
  aliases?: string[];
  homeLocationIds?: StableId[];
  workLocationIds?: StableId[];
  initialPlacement?: {
    kind: PlacementKind;
    locationId?: StableId;
    notes?: string;
  };
  goals?: string[];
  scheduleIds?: StableId[];
  factionIds?: StableId[];
  sourceRefs?: string[];
};

export type WorldPack = SchemaVersioned & {
  worldId: StableId;
  displayName: string;
  sourceMap: {
    mapId: string;
    revision: string;
    contentHash: string;
  };
  locationProfiles: WorldLocationProfile[];
  npcDefinitions: WorldNpcDefinition[];
  calendars?: unknown[];
  schedules?: unknown[];
  routeCosts?: unknown[];
  encounterRules?: unknown[];
  services?: unknown[];
  authoredAssumptions?: string[];
};

// ─── Campaign ────────────────────────────────────────────────────────────────

export type CampaignSettings = {
  companionProfile?:
    | "freeform"
    | "social-schedule"
    | "exploration-mystery"
    | "tactical-travel";
  timeGranularity?: string;
  [key: string]: unknown;
};

/**
 * Narrow chat metadata reference — store only this in chat metadata blobs.
 * Full history lives in package-owned campaign documents.
 */
export type NarrowCampaignRef = SchemaVersioned & {
  campaignId: StableId;
  branchId: StableId;
  packageDocumentId: string;
  headEventId: string | null;
  revision: number;
};

export type CampaignRecord = SchemaVersioned & {
  campaignId: StableId;
  displayName: string;
  activeBranchId: StableId;
  sourceWorldId: StableId;
  sourceWorldVersion: string;
  settings: CampaignSettings;
  observerIds: StableId[];
  ownership: {
    packageId: string;
    documentKind: "world-map-companion-campaign";
  };
  checkpointIds: StableId[];
  createdAt: string;
  updatedAt: string;
};

// ─── NPC / location campaign state ───────────────────────────────────────────

export type NpcPlacement =
  | { kind: "at"; locationId: StableId }
  | { kind: "traveling"; fromLocationId: StableId; toLocationId: StableId; progress?: number }
  | { kind: "unknown"; notes?: string };

export type NpcState = {
  npcId: StableId;
  nativeCharacterIds?: string[];
  aliases?: string[];
  placement: NpcPlacement;
  activity?: string;
  journeyId?: StableId | null;
  goals?: string[];
  appointments?: StableId[];
  availability?: string;
  condition?: string;
  factionLinks?: StableId[];
  evidence?: EvidenceSpan[];
};

export type LocationAccess = {
  physicallyOpen: boolean;
  entranceKnownBy: StableId[];
  permissionGrantedTo: StableId[];
};

export type LocationState = {
  locationId: StableId;
  access: LocationAccess;
  /** Discovery keyed by observer ID. */
  discoveryByObserver: Record<string, boolean>;
  socialRestrictions?: string[];
  occupancy?: StableId[];
  operatingHours?: string;
  objects?: string[];
  evidence?: EvidenceSpan[];
  hazards?: string[];
  activeEventIds?: StableId[];
  services?: string[];
  persistentChanges?: string[];
};

export type EvidenceSpan = {
  sourceEventId?: StableId;
  quote?: string;
  note?: string;
  at?: string;
};

// ─── Typed events ────────────────────────────────────────────────────────────

export type EventVisibility = "player" | "author" | "system" | "npc";

export type RandomResult = {
  seed: string;
  table?: string;
  outcome: string | number | boolean;
};

export type CompanionEventType =
  | "campaign.created"
  | "npc.placed"
  | "npc.moved"
  | "npc.updated"
  | "location.access_changed"
  | "location.discovered"
  | "location.updated"
  | "observer.registered"
  | "correction.supersede"
  | "time.advanced"
  | "checkpoint.created";

export type EventPayload =
  | { type: "campaign.created"; campaign: CampaignRecord; initialNpcs?: NpcState[]; initialLocations?: LocationState[] }
  | { type: "npc.placed"; npc: NpcState }
  | { type: "npc.moved"; npcId: StableId; placement: NpcPlacement; evidence?: EvidenceSpan[] }
  | { type: "npc.updated"; npcId: StableId; patch: Partial<Omit<NpcState, "npcId">> }
  | { type: "location.access_changed"; locationId: StableId; access: Partial<LocationAccess> }
  | { type: "location.discovered"; locationId: StableId; observerId: StableId }
  | { type: "location.updated"; locationId: StableId; patch: Partial<Omit<LocationState, "locationId">> }
  | { type: "observer.registered"; observerId: StableId; displayName?: string }
  | {
      type: "correction.supersede";
      supersedesEventId: StableId;
      reason: string;
      replacement?: EventPayload;
    }
  | { type: "time.advanced"; storyTime: string; notes?: string }
  | { type: "checkpoint.created"; checkpointId: StableId; label?: string };

export type CompanionEvent = SchemaVersioned & {
  eventId: StableId;
  campaignId: StableId;
  branchId: StableId;
  /** Causal parent event ID; null for root. */
  parentEventId: string | null;
  anchor: TurnAnchor | null;
  /** Base campaign revision this event expects (optimistic concurrency). */
  expectedRevision: number;
  payload: EventPayload;
  evidence?: EvidenceSpan[];
  visibility: EventVisibility[];
  random?: RandomResult;
  createdAt: string;
  /** When set, this event supersedes another (corrections). */
  supersedesEventId?: StableId;
};

// ─── Observer projections ────────────────────────────────────────────────────

export type ObserverKnowledge = {
  observerId: StableId;
  knownLocationIds: StableId[];
  knownNpcIds: StableId[];
  rumoredNpcPlacements: Record<string, NpcPlacement | undefined>;
  lastSeen: Record<string, { locationId?: StableId; at?: string }>;
};

export type CampaignProjection = SchemaVersioned & {
  campaignId: StableId;
  branchId: StableId;
  revision: number;
  headEventId: string | null;
  storyTime: string | null;
  npcs: Record<string, NpcState>;
  locations: Record<string, LocationState>;
  observers: Record<string, ObserverKnowledge>;
  /** Event IDs superseded by corrections (still in history, not active facts). */
  supersededEventIds: string[];
  checkpointIds: string[];
};

export type CampaignSnapshot = SchemaVersioned & {
  snapshotId: StableId;
  campaignId: StableId;
  branchId: StableId;
  revision: number;
  headEventId: string | null;
  projection: CampaignProjection;
  /** Deterministic hash of projection for replay verification. */
  stateHash: string;
  createdAt: string;
  label?: string;
};

/** Dedup identity for accepted turn processing (plan §5). */
export type TurnDedupKey = {
  campaignId: StableId;
  branchId: StableId;
  messageId: string;
  swipeIndex: number;
  contentHash: string;
  processingVersion: number;
};

export const PROCESSING_VERSION = 1 as const;
