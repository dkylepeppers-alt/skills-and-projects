/**
 * External prompt modules + mode matrix (Task 9).
 * Prompt markdown lives under src/prompts/; TypeScript under src/prompt/.
 */

export {
  PROMPT_MODES_HONESTY,
  COT_STYLES,
  STATE_MODES,
  COMPANION_ENABLED,
  DND_ENABLED,
  COMPANION_RUNTIME_MODES,
  COMPANION_PROFILES,
  TIME_PLACE_HEADER_CONVENTION,
  DISABLED_AGENT_MARKERS,
  FF54_ARCHIVE_SHA256,
  loadPresetChoiceInventory,
  assertArchiveUntouched,
  enumerateModeMatrix,
  enumerateLiveObserveCases,
  resolveModeGates,
  createHandoverCheckpoint,
  isValidChoiceSelection,
  choicesForCell,
  type CotStyle,
  type StateMode,
  type PresetChoiceOption,
  type PresetChoiceInventory,
  type ModeMatrixCell,
  type ModeGateResolution,
  type HandoverCheckpoint,
  type PresetArchiveSnapshot,
} from "./modes.ts";

export {
  SCENE_PROJECTION_HONESTY,
  buildSceneProjection,
  renderCompanionBlock,
  retrieveLocationFact,
  loadNevermoreLocationIndex,
  type HeaderFacts,
  type SceneLocationFact,
  type SceneOccupantFact,
  type SceneProjection,
  type SceneProjectionInput,
} from "./projection.ts";

export {
  CONTRIBUTOR_HONESTY,
  loadPromptModule,
  buildCompanionBriefing,
  createGetBriefingText,
  registerCompanionPromptContributor,
  companionOffParity,
  assembleBaselinePrompt,
  assembleWithCompanion,
  applyResolvedProfile,
  defaultContributorState,
  type PromptModuleName,
  type CompanionContributorState,
  type CompanionBriefingResult,
} from "./contributor.ts";
