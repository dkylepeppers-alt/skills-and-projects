/**
 * Companion prompt contributor (Task 9).
 *
 * Integrates with Task 2 `registerReadOnlyPromptContributor` without breaking
 * that registration path. Supplies runtime facts through the existing context
 * path as an explicit companion block. Companion-off returns null (baseline
 * parity). Never mutates request/chatMeta. Never runs simulation or rolls.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  registerReadOnlyPromptContributor,
  type PromptContextRequest,
  type PromptContributorRegistration,
  type RegisterCapabilityPromptContext,
} from "../host/prompt-contributor.ts";
import type {
  CompanionProfile,
  CompanionRuntimeMode,
  ResolvedPresetModeProfile,
} from "../host/types.ts";
import type { StableId } from "../contracts.ts";
import type { WorldKnowledgeState } from "../world/knowledge.ts";
import {
  choicesForCell,
  resolveModeGates,
  type CotStyle,
  type ModeMatrixCell,
  type StateMode,
} from "./modes.ts";
import {
  buildSceneProjection,
  renderCompanionBlock,
  type HeaderFacts,
  type SceneProjection,
  SCENE_PROJECTION_HONESTY,
} from "./projection.ts";

export const CONTRIBUTOR_HONESTY = {
  kind: "companion-prompt-contributor" as const,
  companionHostBridge: "PROPOSED" as const,
  mutatesPromptRequest: false as const,
  runsSimulation: false as const,
  isEngineExport: false as const,
  liveEngineWireup: "UNVERIFIED" as const,
  notes: [
    "Uses Task 2 registerReadOnlyPromptContributor; Engine wire-up still UNVERIFIED.",
    "Companion-off / NONE returns null so prompts parity baseline.",
  ],
} as const;

const HERE = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(HERE, "..", "prompts");

export type PromptModuleName = "continuity" | "scene-briefing" | "extractor" | "director";

export function loadPromptModule(name: PromptModuleName): string {
  const file =
    name === "scene-briefing"
      ? "scene-briefing.md"
      : name === "continuity"
        ? "continuity.md"
        : name === "extractor"
          ? "extractor.md"
          : "director.md";
  return readFileSync(join(PROMPTS_DIR, file), "utf8");
}

export type CompanionContributorState = {
  companionMode: CompanionRuntimeMode;
  companionProfile: CompanionProfile;
  cotStyle: CotStyle | string;
  stateMode: StateMode | string;
  dnd: boolean;
  audience: "author" | "player" | "character";
  observerId: StableId | null;
  knowledge: WorldKnowledgeState | null;
  currentLocationId: StableId | null;
  locationsById: Record<string, { displayName: string; kind?: string; parentId?: string | null }>;
  nativeLocationOrder: string[];
  headerFacts: HeaderFacts | null;
  affordanceLabels: string[];
  routeHints: string[];
  /** Controlled macro seed for parity tests — not used to roll dice. */
  macroSeed: string;
  /** When true, force companion off regardless of mode (explicit disable). */
  forceDisabled?: boolean;
  /** OOC pause — projection still allowed but flagged; no time advance claimed. */
  ooc?: boolean;
  /** ANTIOMNI toggle from custom_toggles. */
  antiOmni?: boolean;
};

export type CompanionBriefingResult = {
  text: string | null;
  projection: SceneProjection | null;
  gates: ReturnType<typeof resolveModeGates>;
  /** Baseline parity: true when no companion text was injected. */
  baselineParity: boolean;
  modules: { continuity: string; sceneBriefing: string; extractor: string };
  honesty: typeof CONTRIBUTOR_HONESTY;
};

const DEFAULT_STATE: CompanionContributorState = {
  companionMode: "disabled",
  companionProfile: "freeform",
  cotStyle: "BOLT",
  stateMode: "AGENTS",
  dnd: false,
  audience: "player",
  observerId: null,
  knowledge: null,
  currentLocationId: null,
  locationsById: {},
  nativeLocationOrder: [],
  headerFacts: null,
  affordanceLabels: [],
  routeHints: [],
  macroSeed: "fixed-seed-0",
  antiOmni: true,
  ooc: false,
};

/**
 * Build briefing text from current contributor state. Pure w.r.t. request —
 * does not mutate PromptContextRequest / chatMeta.
 */
export function buildCompanionBriefing(
  state: CompanionContributorState,
): CompanionBriefingResult {
  const mode: CompanionRuntimeMode = state.forceDisabled ? "disabled" : state.companionMode;
  const gates = resolveModeGates({
    cotStyle: state.cotStyle,
    stateMode: state.stateMode,
    dnd: state.dnd,
    companionMode: mode,
  });

  const modules = {
    continuity: loadPromptModule("continuity"),
    sceneBriefing: loadPromptModule("scene-briefing"),
    extractor: loadPromptModule("extractor"),
  };

  if (!gates.injectCompanionBlock) {
    return {
      text: null,
      projection: null,
      gates,
      baselineParity: true,
      modules,
      honesty: CONTRIBUTOR_HONESTY,
    };
  }

  const projection = buildSceneProjection({
    audience: state.audience,
    observerId: state.observerId,
    knowledge: state.knowledge,
    currentLocationId: state.currentLocationId,
    locationsById: state.locationsById,
    nativeLocationOrder: state.nativeLocationOrder,
    headerFacts: state.headerFacts,
    affordanceLabels: state.affordanceLabels,
    routeHints: state.routeHints,
    cotStyle: state.cotStyle,
    stateMode: state.stateMode,
    dnd: state.dnd,
    companionMode: mode,
    profile: state.companionProfile,
    optionalContext: state.ooc ? ["ooc: story time must not advance"] : [],
  });

  let block = renderCompanionBlock(projection);
  if (block && state.antiOmni) {
    block += "\nanti_omni: NPCs know only witnessed or explicitly transferred facts";
  }
  if (block && state.ooc) {
    block += "\nooc: true — do not advance story time";
  }
  // macroSeed is recorded for parity harnesses; never used to invent rolls here.
  if (block) {
    block += `\nmacro_seed: ${state.macroSeed}`;
  }

  return {
    text: block,
    projection,
    gates,
    baselineParity: block === null,
    modules,
    honesty: CONTRIBUTOR_HONESTY,
  };
}

/**
 * Create a getBriefingText callback for Task 2 registration.
 * Reads mutable state bag so tests/host can update without re-registering.
 */
export function createGetBriefingText(stateRef: { current: CompanionContributorState }): (
  request: PromptContextRequest,
) => string | null {
  return (request: PromptContextRequest) => {
    // Read-only: ignore mutation of request; may read mode hints from chatMeta if present.
    const meta = request.chatMeta ?? {};
    const overlay: Partial<CompanionContributorState> = {};
    if (typeof meta.companionMode === "string") {
      overlay.companionMode = meta.companionMode as CompanionRuntimeMode;
    }
    if (typeof meta.state_mode === "string") {
      overlay.stateMode = meta.state_mode as StateMode;
    }
    if (typeof meta.cot_style === "string") {
      overlay.cotStyle = meta.cot_style as CotStyle;
    }
    if (meta.dnd === true || meta.dnd === false) {
      overlay.dnd = meta.dnd;
    }
    if (meta.forceDisabled === true) {
      overlay.forceDisabled = true;
    }
    const merged = { ...stateRef.current, ...overlay };
    // Mode on the request string (Engine mode field) does not rewrite FF5.4 choices.
    void request.mode;
    return buildCompanionBriefing(merged).text;
  };
}

export function registerCompanionPromptContributor(options: {
  packageId: string;
  stateRef: { current: CompanionContributorState };
  registerCapabilityPromptContext?: RegisterCapabilityPromptContext | null;
}): PromptContributorRegistration {
  return registerReadOnlyPromptContributor({
    packageId: options.packageId,
    getBriefingText: createGetBriefingText(options.stateRef),
    registerCapabilityPromptContext: options.registerCapabilityPromptContext,
  });
}

/** Compare companion-off output to a baseline string (fixed inputs). */
export function companionOffParity(input: {
  baselinePrompt: string;
  withCompanionDisabled: string;
}): { parity: boolean; reason: string } {
  if (input.withCompanionDisabled.includes("<companion_scene_briefing>")) {
    return { parity: false, reason: "companion block present while disabled" };
  }
  if (input.baselinePrompt !== input.withCompanionDisabled) {
    return { parity: false, reason: "prompt text diverged from baseline under companion-off" };
  }
  return { parity: true, reason: "byte-identical to baseline" };
}

/**
 * Simulate a fixed baseline prompt assembly for parity tests.
 * Does not invoke Engine; controlled macro randomness via seed only.
 */
export function assembleBaselinePrompt(input: {
  cell: ModeMatrixCell;
  macroSeed: string;
  includeAntiOmniSection: boolean;
  includeOocMarker: boolean;
}): string {
  const choices = choicesForCell(input.cell);
  const parts = [
    "FF54_BASELINE",
    `cot=${choices.cot_style}`,
    `state=${choices.state_mode}`,
    `dnd=${input.cell.dnd ? "on" : "off"}`,
    `seed=${input.macroSeed}`,
  ];
  if (input.includeAntiOmniSection) {
    parts.push("SECTION:ANTIOMNI");
  }
  if (input.includeOocMarker) {
    parts.push("OOC:true");
  }
  // Legacy internal reports appear only as markers — not double-consumed by companion.
  if (input.cell.stateMode === "INTERNAL") {
    parts.push("LEGACY_INTERNAL_REPORT:mirror-only");
  }
  return parts.join("\n");
}

export function assembleWithCompanion(input: {
  cell: ModeMatrixCell;
  macroSeed: string;
  includeAntiOmniSection: boolean;
  includeOocMarker: boolean;
  briefing: CompanionBriefingResult;
}): string {
  const baseline = assembleBaselinePrompt({
    cell: input.cell,
    macroSeed: input.macroSeed,
    includeAntiOmniSection: input.includeAntiOmniSection,
    includeOocMarker: input.includeOocMarker,
  });
  if (!input.briefing.text) return baseline;
  return `${baseline}\n${input.briefing.text}`;
}

export function applyResolvedProfile(
  state: CompanionContributorState,
  profile: ResolvedPresetModeProfile,
  extras?: { dnd?: boolean; cotStyle?: string },
): CompanionContributorState {
  return {
    ...state,
    stateMode: profile.stateMode,
    companionMode: profile.companionMode,
    companionProfile: profile.companionProfile,
    dnd: extras?.dnd ?? state.dnd,
    cotStyle: extras?.cotStyle ?? state.cotStyle,
  };
}

export function defaultContributorState(
  overrides?: Partial<CompanionContributorState>,
): CompanionContributorState {
  return { ...DEFAULT_STATE, ...overrides };
}

export { SCENE_PROJECTION_HONESTY };
