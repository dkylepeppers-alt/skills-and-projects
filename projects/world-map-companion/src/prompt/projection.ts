/**
 * Read-only scene projection (Task 9).
 *
 * Selects facts, routes, people, and opportunities from validated state.
 * No model call. No simulation. No dice. Uses Task 8 earned-knowledge filters
 * for player/character audiences. Whole-world location retrieval is by ID —
 * not limited to the native first-50 known-name index.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { StableId } from "../contracts.ts";
import type { CompanionProfile, CompanionRuntimeMode } from "../host/types.ts";
import {
  projectForAudience,
  type FilteredProjection,
  type ViewAudience,
  type WorldKnowledgeState,
} from "../world/knowledge.ts";
import {
  resolveModeGates,
  TIME_PLACE_HEADER_CONVENTION,
  type CotStyle,
  type ModeGateResolution,
  type StateMode,
  PROMPT_MODES_HONESTY,
} from "./modes.ts";

export const SCENE_PROJECTION_HONESTY = {
  kind: "companion-scene-projection" as const,
  companionHostBridge: "PROPOSED" as const,
  runsSimulation: false as const,
  rollsDice: false as const,
  duplicatesHeader: false as const,
  isEngineExport: false as const,
  liveEngineWireup: "UNVERIFIED" as const,
  firstFiftyNameLimit: false as const,
  notes: [
    "Player/character projections use projectForAudience earned-knowledge filters.",
    "Locations resolve by pack ID including IDs outside the native first-50 name index.",
    "CompanionHostBridge remains PROPOSED.",
  ],
} as const;

export type HeaderFacts = {
  /** HH:MM AM/PM for the preset header — facts only, no competing header string. */
  timeDisplay: string;
  dayNumber: number;
  dayOfWeek: string;
  monthDayYear: string;
  era: string;
  locationGeneral: string;
  locationSpecific: string;
  weatherEmoji: string;
  weather: string;
  /** Fahrenheit — preserve FF5.4 convention. */
  tempF: number;
};

export type SceneLocationFact = {
  locationId: StableId;
  displayName: string;
  /** True when this ID is outside the native first-50 known-name selection. */
  outsideNativeFirst50: boolean;
  kind?: string;
  parentId?: string | null;
};

export type SceneOccupantFact = {
  npcId: StableId;
  label: "known" | "sighting" | "communicated" | "rumor" | "expected" | "last-seen" | "actual";
  locationId?: StableId | null;
  summary: string;
};

export type SceneProjection = {
  schemaVersion: 1;
  audience: ViewAudience;
  gates: ModeGateResolution;
  profile: CompanionProfile;
  headerFacts: HeaderFacts | null;
  /** Facts for the preset header — never a second rendered header block. */
  headerConvention: typeof TIME_PLACE_HEADER_CONVENTION;
  currentLocation: SceneLocationFact | null;
  occupants: SceneOccupantFact[];
  affordanceLabels: string[];
  routeHints: string[];
  knowledge: FilteredProjection | null;
  omittedOptional: string[];
  /** Approximate token budget accounting (chars/4). */
  budget: {
    targetTokens: number;
    usedTokens: number;
    omittedForBudget: string[];
  };
  honesty: typeof SCENE_PROJECTION_HONESTY;
};

export type SceneProjectionInput = {
  audience: ViewAudience;
  observerId: StableId | null;
  knowledge?: WorldKnowledgeState | null;
  currentLocationId: StableId | null;
  /** Pack locations keyed by locationId (whole world). */
  locationsById: Record<string, { displayName: string; kind?: string; parentId?: string | null }>;
  /** Ordered location IDs as in the native map definition (first 50 = name index). */
  nativeLocationOrder: string[];
  headerFacts?: HeaderFacts | null;
  affordanceLabels?: string[];
  routeHints?: string[];
  cotStyle: CotStyle | string;
  stateMode: StateMode | string;
  dnd: boolean;
  companionMode: CompanionRuntimeMode;
  profile?: CompanionProfile;
  budgetTargetTokens?: number;
  /** Extra optional context lines (may be omitted under budget). */
  optionalContext?: string[];
};

const DEFAULT_BUDGET = 1600;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Resolve a location by pack ID. Works for IDs beyond the native first-50 name index.
 */
export function retrieveLocationFact(
  locationId: StableId,
  locationsById: SceneProjectionInput["locationsById"],
  nativeLocationOrder: string[],
): SceneLocationFact | null {
  const row = locationsById[locationId];
  if (!row) return null;
  const idx = nativeLocationOrder.indexOf(locationId);
  const outsideNativeFirst50 = idx < 0 || idx >= 50;
  return {
    locationId,
    displayName: row.displayName,
    outsideNativeFirst50,
    kind: row.kind,
    parentId: row.parentId ?? null,
  };
}

function occupantsFromKnowledge(
  knowledge: FilteredProjection,
  audience: ViewAudience,
): SceneOccupantFact[] {
  const out: SceneOccupantFact[] = [];
  for (const p of knowledge.placements) {
    if (audience === "author" && p.actual) {
      out.push({
        npcId: p.npcId,
        label: "actual",
        locationId: p.actual.kind === "at" ? p.actual.locationId : null,
        summary: `actual:${p.actual.kind}`,
      });
    }
    if (p.known) {
      const cert = p.labels.known;
      const label =
        cert === "sighting" ||
        cert === "communicated" ||
        cert === "rumor" ||
        cert === "confirmed"
          ? cert === "confirmed"
            ? "known"
            : cert
          : "known";
      out.push({
        npcId: p.npcId,
        label,
        locationId: p.known.kind === "at" ? p.known.locationId : null,
        summary: `known:${p.labels.known}`,
      });
    } else if (p.lastSeen?.locationId) {
      out.push({
        npcId: p.npcId,
        label: "last-seen",
        locationId: p.lastSeen.locationId,
        summary: "last-seen",
      });
    } else if (p.expected?.locationId) {
      out.push({
        npcId: p.npcId,
        label: "expected",
        locationId: p.expected.locationId,
        summary: "expected (not a sighting)",
      });
    }
  }
  return out;
}

/**
 * Deterministic read-only scene projection. Never mutates knowledge / world state.
 */
export function buildSceneProjection(input: SceneProjectionInput): SceneProjection {
  const gates = resolveModeGates({
    cotStyle: input.cotStyle,
    stateMode: input.stateMode,
    dnd: input.dnd,
    companionMode: input.companionMode,
  });
  const profile = input.profile ?? "freeform";
  const budgetTarget = input.budgetTargetTokens ?? DEFAULT_BUDGET;

  if (!gates.injectCompanionBlock) {
    return {
      schemaVersion: 1,
      audience: input.audience,
      gates,
      profile,
      headerFacts: null,
      headerConvention: TIME_PLACE_HEADER_CONVENTION,
      currentLocation: null,
      occupants: [],
      affordanceLabels: [],
      routeHints: [],
      knowledge: null,
      omittedOptional: ["companion-disabled-or-none"],
      budget: { targetTokens: budgetTarget, usedTokens: 0, omittedForBudget: [] },
      honesty: SCENE_PROJECTION_HONESTY,
    };
  }

  const knowledge =
    input.knowledge && input.observerId !== undefined
      ? projectForAudience(input.knowledge, input.audience, input.observerId)
      : null;

  // Secrets must never appear in player/character briefing material.
  if (knowledge && input.audience !== "author" && knowledge.secrets.length > 0) {
    throw new Error("earned-knowledge filter leaked secrets into non-author projection");
  }

  const currentLocation = input.currentLocationId
    ? retrieveLocationFact(
        input.currentLocationId,
        input.locationsById,
        input.nativeLocationOrder,
      )
    : null;

  const occupants = knowledge ? occupantsFromKnowledge(knowledge, input.audience) : [];
  const affordanceLabels = [...(input.affordanceLabels ?? [])];
  const routeHints = [...(input.routeHints ?? [])];
  const omittedOptional: string[] = [];
  const omittedForBudget: string[] = [];

  // Observation mirror / INTERNAL: do not surface live-simulation affordances as actionable.
  if (gates.observationMirror || !gates.allowLiveSimulation) {
    omittedOptional.push("live-simulation-actions");
  }

  let optional = [...(input.optionalContext ?? [])];
  let used = estimateTokens(
    JSON.stringify({
      currentLocation,
      occupants,
      affordanceLabels,
      routeHints,
      headerFacts: input.headerFacts ?? null,
    }),
  );
  while (optional.length > 0 && used + estimateTokens(optional[0]!) > budgetTarget) {
    const dropped = optional.shift()!;
    omittedForBudget.push(dropped.slice(0, 80));
    omittedOptional.push("budget:" + dropped.slice(0, 40));
  }
  used += optional.reduce((n, line) => n + estimateTokens(line), 0);

  return {
    schemaVersion: 1,
    audience: input.audience,
    gates,
    profile,
    headerFacts: input.headerFacts ?? null,
    headerConvention: TIME_PLACE_HEADER_CONVENTION,
    currentLocation,
    occupants,
    affordanceLabels,
    routeHints,
    knowledge,
    omittedOptional,
    budget: {
      targetTokens: budgetTarget,
      usedTokens: used,
      omittedForBudget,
    },
    honesty: SCENE_PROJECTION_HONESTY,
  };
}

/**
 * Render the explicit companion block from a projection.
 * Returns null when companion must not inject (parity with baseline).
 * Never emits a competing Time/Place header or tracker dump.
 */
export function renderCompanionBlock(projection: SceneProjection): string | null {
  if (!projection.gates.injectCompanionBlock) return null;

  const lines: string[] = [];
  lines.push("<companion_scene_briefing>");
  lines.push(`mode: state=${projection.gates.cell.stateMode} companion=${projection.gates.cell.companionMode} cot=${projection.gates.cell.cotStyle} dnd=${projection.gates.cell.dnd ? "on" : "off"}`);
  lines.push(`profile: ${projection.profile}`);
  lines.push(`audience: ${projection.audience}`);
  lines.push("header_convention: supply facts only for preset Time/Place header (HH:MM, Day, Location, Weather, Temp F); do not emit a second header block");

  if (projection.headerFacts) {
    const h = projection.headerFacts;
    lines.push(
      `header_facts: time=${h.timeDisplay}; day=#${h.dayNumber} ${h.dayOfWeek}, ${h.monthDayYear} ${h.era}; place=${h.locationGeneral} - ${h.locationSpecific}; weather=${h.weatherEmoji} ${h.weather}, ${h.tempF}°F`,
    );
  }

  if (projection.currentLocation) {
    const loc = projection.currentLocation;
    lines.push(
      `location: id=${loc.locationId}; name=${loc.displayName}; outside_native_first50=${loc.outsideNativeFirst50}`,
    );
  }

  if (projection.gates.observationMirror) {
    lines.push("observation_mirror: true — do not advance legacy agendas, bonds, dice, or world sim");
  }
  if (projection.gates.dndNarrativeOnly) {
    lines.push("dnd: narrative-only in AGENTS — no second mechanical roll");
  }
  if (projection.gates.respectLegacyInternal) {
    lines.push("legacy_internal: respected — companion must not double-consume internal reports");
  }

  for (const o of projection.occupants) {
    lines.push(
      `occupant: npc=${o.npcId}; label=${o.label}; at=${o.locationId ?? "unknown"}; ${o.summary}`,
    );
  }
  for (const a of projection.affordanceLabels) {
    lines.push(`affordance_propose: ${a}`);
  }
  for (const r of projection.routeHints) {
    lines.push(`route: ${r}`);
  }
  if (projection.omittedOptional.length > 0) {
    lines.push(`omitted: ${projection.omittedOptional.join(" | ")}`);
  }
  lines.push(`honesty: CompanionHostBridge=${SCENE_PROJECTION_HONESTY.companionHostBridge}; liveEngine=${SCENE_PROJECTION_HONESTY.liveEngineWireup}`);
  lines.push("</companion_scene_briefing>");

  const text = lines.join("\n");
  // Guard: never emit a filled Time/Place header line (facts-only is fine).
  if (/\[\s*🕰️\s+Time\s+\d/.test(text)) {
    throw new Error("companion block must not emit a competing Time/Place header");
  }
  if (text.includes("<details><summary>") || text.includes("GM'S NOTEBOOK")) {
    throw new Error("companion block must not dump legacy tracker reports");
  }
  return text;
}

/** Load Nevermore pack locations for whole-world retrieval tests / runtime. */
export function loadNevermoreLocationIndex(repoRoot?: string): {
  locationsById: SceneProjectionInput["locationsById"];
  nativeLocationOrder: string[];
} {
  const here = dirname(fileURLToPath(import.meta.url));
  const root = repoRoot ?? join(here, "..", "..", "..", "..");
  const packPath = join(root, "projects/nevermore/companion/locations.json");
  const mapPath = join(
    root,
    "projects/nevermore/releases/v2/Nevermore-Woodlands-Crypts-v2.world-map.json",
  );
  const pack = JSON.parse(readFileSync(packPath, "utf8")) as {
    locations: Array<{
      locationId: string;
      displayName: string;
      kind?: string;
      parentId?: string | null;
    }>;
  };
  const rawMap = readFileSync(mapPath, "utf8");
  if (rawMap.startsWith("version https://git-lfs.github.com/spec/v1")) {
    throw new Error(
      `map file is still a Git LFS pointer; run git lfs pull before loading: ${mapPath}`,
    );
  }
  const map = JSON.parse(rawMap) as {
    definition: { locations: Array<{ id: string }> };
  };
  const locationsById: SceneProjectionInput["locationsById"] = {};
  for (const loc of pack.locations) {
    locationsById[loc.locationId] = {
      displayName: loc.displayName,
      kind: loc.kind,
      parentId: loc.parentId ?? null,
    };
  }
  const nativeLocationOrder = map.definition.locations.map((l) => l.id);
  return { locationsById, nativeLocationOrder };
}

export { PROMPT_MODES_HONESTY };
