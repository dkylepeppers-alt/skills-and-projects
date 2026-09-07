/**
 * FF5.4 mode matrix + handover checkpoints (Task 9).
 *
 * Reads choice inventories from the frozen archive (hash/compare only — never
 * mutates preset source bytes). Companion settings stay outside the preset.
 *
 * Matrix: 4 cot styles × 3 state modes × DND on/off × companion on/off.
 * Additional live/observe runtime modes are companion-owned.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  CompanionProfile,
  CompanionRuntimeMode,
  PresetStateMode,
} from "../host/types.ts";

export const PROMPT_MODES_HONESTY = {
  kind: "companion-prompt-modes" as const,
  companionHostBridge: "PROPOSED" as const,
  archiveMutation: false as const,
  isEngineExport: false as const,
  liveEngineWireup: "UNVERIFIED" as const,
  notes: [
    "Choice inventories are read from the frozen FF5.4 archive; source bytes are never edited.",
    "CompanionHostBridge remains PROPOSED; this module does not claim live Engine wire-up.",
  ],
} as const;

/** Exact CoT style values from FF5.4 cot_style choice. */
export const COT_STYLES = ["BOLT", "MAX", "MICRO", "OFF"] as const;
export type CotStyle = (typeof COT_STYLES)[number];

/** Exact state_mode values from FF5.4 (no fourth mode). */
export const STATE_MODES = ["AGENTS", "INTERNAL", "NONE"] as const;
export type StateMode = (typeof STATE_MODES)[number];

/** Companion on/off for the Task 9 matrix (maps to enabled vs disabled). */
export const COMPANION_ENABLED = [true, false] as const;

/** DND on/off — DND lives in internal_states multi-select. */
export const DND_ENABLED = [true, false] as const;

export const COMPANION_RUNTIME_MODES: readonly CompanionRuntimeMode[] = [
  "live",
  "observe",
  "disabled",
] as const;

export const COMPANION_PROFILES: readonly CompanionProfile[] = [
  "freeform",
  "social-schedule",
  "exploration-mystery",
  "tactical-travel",
] as const;

/** Exact Time/Place header convention from frozen FF5.4 (do not invent a rival). */
export const TIME_PLACE_HEADER_CONVENTION =
  "[ 🕰️ Time HH:MM AM/PM | 🗓️ Day # - 🗓️ DayOfWeek, Month DD, YYYY Era | 📍 Location - Specific Area | [WeatherEmoji] Weather, Temp °F ]";

/** Seven disabled agent-data marker sections — must stay disabled by default. */
export const DISABLED_AGENT_MARKERS = [
  "Persona Stats (Agent)",
  "Character Tracker (Agent)",
  "Custom Tracker (Agent)",
  "Beholder (Agent)",
  "Quest Tracker (Agent)",
  "World State (Agent)",
  "Inventory Tracker (Agent)",
] as const;

export type PresetChoiceOption = {
  value: string;
  label: string;
};

export type PresetChoiceInventory = {
  variableName: string;
  multiSelect: boolean;
  options: PresetChoiceOption[];
};

export type ModeMatrixCell = {
  cotStyle: CotStyle;
  stateMode: StateMode;
  dnd: boolean;
  companionEnabled: boolean;
  /** Derived companion runtime when companionEnabled; always disabled when false. */
  companionMode: CompanionRuntimeMode;
};

export type ModeGateResolution = {
  cell: ModeMatrixCell;
  /** Companion may inject a scene briefing block. */
  injectCompanionBlock: boolean;
  /** Companion may autonomously simulate NPCs / offscreen events. */
  allowLiveSimulation: boolean;
  /** Companion is observation-only mirror (INTERNAL or observe). */
  observationMirror: boolean;
  /** DND section may fire under preset gates. */
  dndGateOpen: boolean;
  /** In AGENTS, DND is narrative-only (no second mechanical sim). */
  dndNarrativeOnly: boolean;
  /** Legacy internal-state systems remain authoritative; companion must not double-advance. */
  respectLegacyInternal: boolean;
  /** Static map only — no companion tracking. */
  staticMapOnly: boolean;
  headerConvention: typeof TIME_PLACE_HEADER_CONVENTION;
  honesty: typeof PROMPT_MODES_HONESTY;
};

export type HandoverCheckpoint = {
  schemaVersion: 1;
  kind: "mode-handover";
  from: Partial<ModeMatrixCell> & { companionMode?: CompanionRuntimeMode };
  to: ModeMatrixCell;
  recordedAt: string;
  /** Facts that must be reconciled or marked uncertain before live simulation. */
  uncertainImports: string[];
  allowLiveSimulation: boolean;
  honesty: typeof PROMPT_MODES_HONESTY;
};

export type PresetArchiveSnapshot = {
  sha256: string;
  bytes: number;
  choices: Record<string, PresetChoiceInventory>;
  disabledAgentMarkers: Array<{ name: string; enabled: string; isMarker: string }>;
  regexScriptCount: number;
  sectionCount: number;
  groupCount: number;
  choiceBlockCount: number;
};

const HERE = dirname(fileURLToPath(import.meta.url));
const ARCHIVE_PATH = join(
  HERE,
  "..",
  "..",
  "source",
  "presets",
  "ff54-agent-gating.original.marinara.json",
);

/** Known archive SHA-256 — compare only; never rewrite. */
export const FF54_ARCHIVE_SHA256 =
  "43801992b7e07ffb24c0395f32ce87b4ea4f3a40aed929eb0462e3e41b7adc93";

function parseOptions(raw: unknown): PresetChoiceOption[] {
  const list =
    typeof raw === "string"
      ? (JSON.parse(raw) as unknown[])
      : Array.isArray(raw)
        ? raw
        : [];
  return list.map((item) => {
    if (typeof item === "string") return { value: item, label: item };
    const row = item as Record<string, unknown>;
    const value = String(row.value ?? row.variableValue ?? row.name ?? "");
    const label = String(row.label ?? row.name ?? value);
    return { value, label };
  });
}

/**
 * Read-only inventory of every FF5.4 choice option (render/select verification).
 * Does not mutate archive bytes.
 */
export function loadPresetChoiceInventory(
  archivePath: string = ARCHIVE_PATH,
): PresetArchiveSnapshot {
  const buf = readFileSync(archivePath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  const envelope = JSON.parse(buf.toString("utf8")) as {
    data: {
      sections: Array<Record<string, unknown>>;
      groups: unknown[];
      choiceBlocks: Array<Record<string, unknown>>;
    };
    extensions?: { regex_scripts?: unknown[] };
  };

  const choices: Record<string, PresetChoiceInventory> = {};
  for (const block of envelope.data.choiceBlocks) {
    const variableName = String(block.variableName ?? block.name ?? "");
    choices[variableName] = {
      variableName,
      multiSelect: block.multiSelect === true || block.multiSelect === "true",
      options: parseOptions(block.options),
    };
  }

  const disabledAgentMarkers = envelope.data.sections
    .filter((s) => DISABLED_AGENT_MARKERS.includes(String(s.name) as (typeof DISABLED_AGENT_MARKERS)[number]))
    .map((s) => ({
      name: String(s.name),
      enabled: String(s.enabled),
      isMarker: String(s.isMarker),
    }));

  return {
    sha256,
    bytes: buf.byteLength,
    choices,
    disabledAgentMarkers,
    regexScriptCount: envelope.extensions?.regex_scripts?.length ?? 0,
    sectionCount: envelope.data.sections.length,
    groupCount: envelope.data.groups.length,
    choiceBlockCount: envelope.data.choiceBlocks.length,
  };
}

/** Assert archive bytes match the frozen lock — throws if drifted. */
export function assertArchiveUntouched(archivePath: string = ARCHIVE_PATH): {
  sha256: string;
  untouched: true;
} {
  const buf = readFileSync(archivePath);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  if (sha256 !== FF54_ARCHIVE_SHA256) {
    throw new Error(
      `FF5.4 archive SHA mismatch: expected ${FF54_ARCHIVE_SHA256}, got ${sha256}`,
    );
  }
  return { sha256, untouched: true };
}

/**
 * Full Task 9 matrix: 4 × 3 × 2 × 2 = 48 cells.
 * companionEnabled maps to companionMode live (on) or disabled (off).
 */
export function enumerateModeMatrix(options?: {
  companionOnMode?: "live" | "observe";
}): ModeMatrixCell[] {
  const onMode = options?.companionOnMode ?? "live";
  const cells: ModeMatrixCell[] = [];
  for (const cotStyle of COT_STYLES) {
    for (const stateMode of STATE_MODES) {
      for (const dnd of DND_ENABLED) {
        for (const companionEnabled of COMPANION_ENABLED) {
          cells.push({
            cotStyle,
            stateMode,
            dnd,
            companionEnabled,
            companionMode: companionEnabled ? onMode : "disabled",
          });
        }
      }
    }
  }
  return cells;
}

/** Extra live/observe × state_mode cases beyond the binary companion on/off matrix. */
export function enumerateLiveObserveCases(): Array<{
  stateMode: StateMode;
  companionMode: CompanionRuntimeMode;
  dnd: boolean;
  cotStyle: CotStyle;
}> {
  const cases: Array<{
    stateMode: StateMode;
    companionMode: CompanionRuntimeMode;
    dnd: boolean;
    cotStyle: CotStyle;
  }> = [];
  for (const stateMode of STATE_MODES) {
    for (const companionMode of COMPANION_RUNTIME_MODES) {
      for (const dnd of DND_ENABLED) {
        cases.push({ stateMode, companionMode, dnd, cotStyle: "BOLT" });
      }
    }
  }
  return cases;
}

export function resolveModeGates(input: {
  cotStyle: CotStyle | string;
  stateMode: PresetStateMode | StateMode | string;
  dnd: boolean;
  companionMode: CompanionRuntimeMode;
}): ModeGateResolution {
  const cotStyle = (COT_STYLES as readonly string[]).includes(input.cotStyle)
    ? (input.cotStyle as CotStyle)
    : "BOLT";
  const stateMode = (STATE_MODES as readonly string[]).includes(String(input.stateMode))
    ? (input.stateMode as StateMode)
    : "AGENTS";
  const companionEnabled = input.companionMode !== "disabled";
  const cell: ModeMatrixCell = {
    cotStyle,
    stateMode,
    dnd: input.dnd,
    companionEnabled,
    companionMode: input.companionMode,
  };

  const staticMapOnly = stateMode === "NONE" || !companionEnabled;
  const respectLegacyInternal = stateMode === "INTERNAL";
  const observationMirror =
    companionEnabled &&
    (input.companionMode === "observe" || stateMode === "INTERNAL");
  const allowLiveSimulation =
    companionEnabled &&
    input.companionMode === "live" &&
    stateMode === "AGENTS";
  const injectCompanionBlock =
    companionEnabled && stateMode !== "NONE" && input.companionMode !== "disabled";
  const dndGateOpen = input.dnd && stateMode !== "NONE";
  const dndNarrativeOnly = dndGateOpen && stateMode === "AGENTS";

  return {
    cell,
    injectCompanionBlock,
    allowLiveSimulation,
    observationMirror,
    dndGateOpen,
    dndNarrativeOnly,
    respectLegacyInternal,
    staticMapOnly,
    headerConvention: TIME_PLACE_HEADER_CONVENTION,
    honesty: PROMPT_MODES_HONESTY,
  };
}

/**
 * Changing modes establishes a recorded handover checkpoint.
 * Live simulation stays off until uncertain imports are reconciled.
 */
export function createHandoverCheckpoint(input: {
  from: Partial<ModeMatrixCell> & { companionMode?: CompanionRuntimeMode };
  to: ModeMatrixCell;
  recordedAt?: string;
  uncertainImports?: string[];
}): HandoverCheckpoint {
  const gates = resolveModeGates({
    cotStyle: input.to.cotStyle,
    stateMode: input.to.stateMode,
    dnd: input.to.dnd,
    companionMode: input.to.companionMode,
  });
  const uncertain = input.uncertainImports ?? [];
  return {
    schemaVersion: 1,
    kind: "mode-handover",
    from: input.from,
    to: input.to,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
    uncertainImports: uncertain,
    allowLiveSimulation: gates.allowLiveSimulation && uncertain.length === 0,
    honesty: PROMPT_MODES_HONESTY,
  };
}

/** Whether a choice value is a valid option for the named FF5.4 variable. */
export function isValidChoiceSelection(
  inventory: PresetArchiveSnapshot,
  variableName: string,
  value: string | string[],
): boolean {
  const block = inventory.choices[variableName];
  if (!block) return false;
  const allowed = new Set(block.options.map((o) => o.value));
  if (Array.isArray(value)) {
    if (!block.multiSelect && value.length > 1) return false;
    return value.every((v) => allowed.has(v));
  }
  return allowed.has(value);
}

/** Build defaultChoices-like object for matrix cell (controlled / fixed inputs). */
export function choicesForCell(cell: ModeMatrixCell): Record<string, unknown> {
  const internal_states = cell.dnd ? ["DND"] : [];
  return {
    cot_style: cell.cotStyle,
    state_mode: cell.stateMode,
    internal_states,
    custom_toggles: ["VOICE2", "ANTIOMNI", "VAD", "REALNPC", "BANNED", "VNCOLOR2", "GENESIS"],
    pov_style: "SECOND",
    prose_style: "STORY",
    output_length: "ON",
    echo_mode: "EMBELLISH",
    nsfw_mode: "NONE",
    bypass_mode: "NONE",
    extras: [],
  };
}
