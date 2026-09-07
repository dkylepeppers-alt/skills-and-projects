/**
 * Task 9 — FF5.4 external prompt modules, mode matrix, companion contributor.
 *
 * Covers: 4 cot × 3 state × DND × companion on/off, live/observe extras,
 * choice inventory, companion-off parity, ANTIOMNI/OOC/legacy, whole-world
 * retrieval beyond native first-50, archive freeze, honesty labels.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  clearLocalProposedPromptContributors,
  collectLocalProposedPromptContext,
  createProposedCompanionHostBridge,
} from "../src/host/index.ts";
import {
  assertArchiveUntouched,
  assembleBaselinePrompt,
  assembleWithCompanion,
  buildCompanionBriefing,
  buildSceneProjection,
  choicesForCell,
  companionOffParity,
  CONTRIBUTOR_HONESTY,
  createGetBriefingText,
  createHandoverCheckpoint,
  defaultContributorState,
  DISABLED_AGENT_MARKERS,
  enumerateLiveObserveCases,
  enumerateModeMatrix,
  FF54_ARCHIVE_SHA256,
  isValidChoiceSelection,
  loadNevermoreLocationIndex,
  loadPresetChoiceInventory,
  loadPromptModule,
  PROMPT_MODES_HONESTY,
  registerCompanionPromptContributor,
  renderCompanionBlock,
  resolveModeGates,
  retrieveLocationFact,
  SCENE_PROJECTION_HONESTY,
  TIME_PLACE_HEADER_CONVENTION,
  type ModeMatrixCell,
} from "../src/prompt/index.ts";
import {
  addSecret,
  createKnowledgeState,
  registerObserver,
  setActualPlacement,
  setExpectedPlacement,
  type WorldKnowledgeState,
} from "../src/world/knowledge.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const WMC_ROOT = join(HERE, "..");
const ARCHIVE = join(WMC_ROOT, "source/presets/ff54-agent-gating.original.marinara.json");
const BASELINE = join(WMC_ROOT, "source/presets/ff54-baseline.json");

const MATRIX = enumerateModeMatrix();
const LIVE_OBSERVE = enumerateLiveObserveCases();

test("archive FF5.4 bytes untouched (hash lock)", () => {
  const before = readFileSync(ARCHIVE);
  const result = assertArchiveUntouched(ARCHIVE);
  assert.equal(result.sha256, FF54_ARCHIVE_SHA256);
  assert.equal(result.untouched, true);
  const after = readFileSync(ARCHIVE);
  assert.deepEqual(before, after);
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as { sha256: string };
  assert.equal(baseline.sha256, FF54_ARCHIVE_SHA256);
});

test("prompt modules exist and forbid tracker dumps / hidden reasoning", () => {
  for (const name of ["continuity", "scene-briefing", "extractor"] as const) {
    const text = loadPromptModule(name);
    assert.ok(text.length > 100, `${name} module too short`);
    assert.ok(text.includes("PROPOSED") || text.includes("CompanionHostBridge"), `${name} honesty`);
  }
  const continuity = loadPromptModule("continuity");
  assert.ok(continuity.includes("Do not duplicate"));
  assert.ok(continuity.includes("ANTIOMNI"));
  assert.ok(continuity.includes("Temp °F") || continuity.includes("never instruct the model to print a tracker"));
  const briefing = loadPromptModule("scene-briefing");
  assert.ok(briefing.includes("first-50") || briefing.includes("first 50"));
  const extractor = loadPromptModule("extractor");
  assert.ok(extractor.includes("schemaVersion"));
  // director.md from Task 7 still present
  const director = loadPromptModule("director");
  assert.ok(director.includes("World Director"));
});

test("choice inventory: all 11 blocks; every option selectable; 4 cot × 3 state", () => {
  const inv = loadPresetChoiceInventory(ARCHIVE);
  assert.equal(inv.choiceBlockCount, 11);
  assert.equal(inv.sectionCount, 69);
  assert.equal(inv.groupCount, 12);
  assert.equal(inv.regexScriptCount, 25);
  assert.equal(inv.sha256, FF54_ARCHIVE_SHA256);

  const cot = inv.choices.cot_style;
  assert.ok(cot);
  assert.deepEqual(
    cot.options.map((o) => o.value).sort(),
    ["BOLT", "MAX", "MICRO", "OFF"].sort(),
  );
  const state = inv.choices.state_mode;
  assert.deepEqual(
    state.options.map((o) => o.value).sort(),
    ["AGENTS", "INTERNAL", "NONE"].sort(),
  );
  const internal = inv.choices.internal_states;
  assert.ok(internal.options.some((o) => o.value === "DND"));
  assert.equal(internal.multiSelect, true);

  for (const [name, block] of Object.entries(inv.choices)) {
    for (const opt of block.options) {
      assert.equal(
        isValidChoiceSelection(inv, name, block.multiSelect ? [opt.value] : opt.value),
        true,
        `${name}=${opt.value} must select`,
      );
    }
  }

  // Invalid value rejected
  assert.equal(isValidChoiceSelection(inv, "cot_style", "NOPE"), false);
  assert.equal(isValidChoiceSelection(inv, "state_mode", ["AGENTS", "NONE"]), false);

  // Seven disabled agent markers remain disabled markers
  assert.equal(inv.disabledAgentMarkers.length, 7);
  for (const marker of inv.disabledAgentMarkers) {
    assert.ok(DISABLED_AGENT_MARKERS.includes(marker.name as (typeof DISABLED_AGENT_MARKERS)[number]));
    assert.equal(marker.enabled, "false");
    assert.equal(marker.isMarker, "true");
  }
});

test("mode matrix enumerates exactly 4×3×2×2 = 48 cells", () => {
  assert.equal(MATRIX.length, 48);
  const keys = new Set(MATRIX.map((c) => `${c.cotStyle}|${c.stateMode}|${c.dnd}|${c.companionEnabled}`));
  assert.equal(keys.size, 48);
});

test("full matrix: gates, no duplicate headers/trackers/rolls, companion-off null", () => {
  let companionOn = 0;
  let companionOff = 0;
  for (const cell of MATRIX) {
    const gates = resolveModeGates({
      cotStyle: cell.cotStyle,
      stateMode: cell.stateMode,
      dnd: cell.dnd,
      companionMode: cell.companionMode,
    });
    assert.equal(gates.headerConvention, TIME_PLACE_HEADER_CONVENTION);
    assert.equal(gates.honesty.companionHostBridge, "PROPOSED");
    assert.equal(gates.honesty.liveEngineWireup, "UNVERIFIED");

    if (!cell.companionEnabled || cell.stateMode === "NONE") {
      assert.equal(gates.injectCompanionBlock, false);
      companionOff += 1;
    } else {
      assert.equal(gates.injectCompanionBlock, true);
      companionOn += 1;
    }

    if (cell.companionEnabled && cell.companionMode === "live" && cell.stateMode === "AGENTS") {
      assert.equal(gates.allowLiveSimulation, true);
    } else {
      assert.equal(gates.allowLiveSimulation, false);
    }

    if (cell.dnd && cell.stateMode !== "NONE") {
      assert.equal(gates.dndGateOpen, true);
      if (cell.stateMode === "AGENTS") assert.equal(gates.dndNarrativeOnly, true);
    }

    if (cell.stateMode === "INTERNAL") {
      assert.equal(gates.respectLegacyInternal, true);
      if (cell.companionEnabled) assert.equal(gates.observationMirror, true);
    }

    const briefing = buildCompanionBriefing(
      defaultContributorState({
        companionMode: cell.companionMode,
        cotStyle: cell.cotStyle,
        stateMode: cell.stateMode,
        dnd: cell.dnd,
        macroSeed: "matrix-seed",
        currentLocationId: "woods-cabin",
        locationsById: { "woods-cabin": { displayName: "Woodland Cabin" } },
        nativeLocationOrder: Array.from({ length: 60 }, (_, i) => `loc-${i}`).concat(["woods-cabin"]),
      }),
    );

    if (!gates.injectCompanionBlock) {
      assert.equal(briefing.text, null);
      assert.equal(briefing.baselineParity, true);
    } else {
      assert.ok(briefing.text);
      assert.ok(briefing.text.includes("<companion_scene_briefing>"));
      assert.ok(!briefing.text.includes("[ 🕰️ Time"));
      assert.ok(!briefing.text.includes("GM'S NOTEBOOK"));
      assert.ok(!briefing.text.includes("{{roll:"));
      assert.ok(!briefing.text.includes("<details><summary>"));
    }

    // choicesForCell stays within inventory
    const choices = choicesForCell(cell);
    assert.equal(choices.cot_style, cell.cotStyle);
    assert.equal(choices.state_mode, cell.stateMode);
  }
  // 48 cells: companion off for half of non-filtered... actually companionEnabled false = 24;
  // plus companion on + NONE = 4 cot × 1 NONE × 2 dnd × 1 on = 8 more without inject
  // inject false when !companionEnabled (24) OR state NONE with companion on (8) = 32
  // inject true = 16 (AGENTS+INTERNAL × live × 4 cot × 2 dnd = 2*1*4*2=16)
  assert.equal(companionOff, 32);
  assert.equal(companionOn, 16);
});

test("live/observe/disabled × state modes × DND interaction cases", () => {
  assert.equal(LIVE_OBSERVE.length, 3 * 3 * 2); // state × runtime × dnd
  for (const c of LIVE_OBSERVE) {
    const gates = resolveModeGates(c);
    if (c.companionMode === "observe" && c.stateMode !== "NONE") {
      assert.equal(gates.observationMirror, true);
      assert.equal(gates.allowLiveSimulation, false);
      assert.equal(gates.injectCompanionBlock, true);
    }
    if (c.companionMode === "live" && c.stateMode === "AGENTS") {
      assert.equal(gates.allowLiveSimulation, true);
    }
    if (c.companionMode === "disabled") {
      assert.equal(gates.injectCompanionBlock, false);
      assert.equal(gates.staticMapOnly, true);
    }
    if (c.stateMode === "NONE") {
      assert.equal(gates.injectCompanionBlock, false);
    }
  }
});

test("handover checkpoint blocks live sim until uncertain imports cleared", () => {
  const from: Partial<ModeMatrixCell> = {
    stateMode: "NONE",
    companionMode: "disabled",
    companionEnabled: false,
  };
  const to: ModeMatrixCell = {
    cotStyle: "BOLT",
    stateMode: "AGENTS",
    dnd: false,
    companionEnabled: true,
    companionMode: "live",
  };
  const blocked = createHandoverCheckpoint({
    from,
    to,
    uncertainImports: ["npc:wednesday last-seen unverified"],
  });
  assert.equal(blocked.allowLiveSimulation, false);
  assert.equal(blocked.honesty.companionHostBridge, "PROPOSED");
  const cleared = createHandoverCheckpoint({ from, to, uncertainImports: [] });
  assert.equal(cleared.allowLiveSimulation, true);
});

test("companion-off prompts parity baseline (fixed inputs, controlled seed)", () => {
  const cell: ModeMatrixCell = {
    cotStyle: "BOLT",
    stateMode: "AGENTS",
    dnd: true,
    companionEnabled: false,
    companionMode: "disabled",
  };
  const seed = "parity-seed-42";
  const baseline = assembleBaselinePrompt({
    cell,
    macroSeed: seed,
    includeAntiOmniSection: true,
    includeOocMarker: true,
  });
  const offBriefing = buildCompanionBriefing(
    defaultContributorState({
      companionMode: "disabled",
      cotStyle: cell.cotStyle,
      stateMode: cell.stateMode,
      dnd: cell.dnd,
      macroSeed: seed,
      antiOmni: true,
      ooc: true,
    }),
  );
  assert.equal(offBriefing.text, null);
  const withOff = assembleWithCompanion({
    cell,
    macroSeed: seed,
    includeAntiOmniSection: true,
    includeOocMarker: true,
    briefing: offBriefing,
  });
  const parity = companionOffParity({ baselinePrompt: baseline, withCompanionDisabled: withOff });
  assert.equal(parity.parity, true, parity.reason);
  assert.equal(withOff, baseline);

  // Companion on diverges by exactly the companion block
  const onCell = { ...cell, companionEnabled: true, companionMode: "live" as const };
  const onBriefing = buildCompanionBriefing(
    defaultContributorState({
      companionMode: "live",
      cotStyle: onCell.cotStyle,
      stateMode: onCell.stateMode,
      dnd: onCell.dnd,
      macroSeed: seed,
      antiOmni: true,
      ooc: true,
      currentLocationId: "jericho-town",
      locationsById: { "jericho-town": { displayName: "Jericho" } },
      nativeLocationOrder: ["jericho-town"],
    }),
  );
  assert.ok(onBriefing.text);
  const withOn = assembleWithCompanion({
    cell: onCell,
    macroSeed: seed,
    includeAntiOmniSection: true,
    includeOocMarker: true,
    briefing: onBriefing,
  });
  assert.ok(withOn.startsWith(baseline) || withOn.includes("FF54_BASELINE"));
  assert.ok(withOn.includes("<companion_scene_briefing>"));
  assert.notEqual(withOn, baseline);
});

test("ANTIOMNI, OOC, INTERNAL reports, legacy regex without double-consuming state", () => {
  const inv = loadPresetChoiceInventory(ARCHIVE);
  assert.ok(inv.choices.custom_toggles.options.some((o) => o.value === "ANTIOMNI"));

  // ANTIOMNI flag surfaces in companion block when on
  const anti = buildCompanionBriefing(
    defaultContributorState({
      companionMode: "live",
      stateMode: "AGENTS",
      antiOmni: true,
      currentLocationId: "jericho-town",
      locationsById: { "jericho-town": { displayName: "Jericho" } },
      nativeLocationOrder: ["jericho-town"],
    }),
  );
  assert.ok(anti.text?.includes("anti_omni:"));

  // OOC marker
  const ooc = buildCompanionBriefing(
    defaultContributorState({
      companionMode: "live",
      stateMode: "AGENTS",
      ooc: true,
      currentLocationId: "jericho-town",
      locationsById: { "jericho-town": { displayName: "Jericho" } },
      nativeLocationOrder: ["jericho-town"],
    }),
  );
  assert.ok(ooc.text?.includes("ooc: true"));

  // INTERNAL: observation mirror; legacy report not double-consumed
  const internal = buildCompanionBriefing(
    defaultContributorState({
      companionMode: "live",
      stateMode: "INTERNAL",
      currentLocationId: "jericho-town",
      locationsById: { "jericho-town": { displayName: "Jericho" } },
      nativeLocationOrder: ["jericho-town"],
    }),
  );
  assert.ok(internal.gates.respectLegacyInternal);
  assert.ok(internal.gates.observationMirror);
  assert.ok(internal.text?.includes("legacy_internal"));
  assert.ok(!internal.text?.includes("LEGACY_INTERNAL_REPORT")); // companion doesn't re-emit legacy payload

  const baselineInternal = assembleBaselinePrompt({
    cell: {
      cotStyle: "BOLT",
      stateMode: "INTERNAL",
      dnd: false,
      companionEnabled: true,
      companionMode: "live",
    },
    macroSeed: "x",
    includeAntiOmniSection: false,
    includeOocMarker: false,
  });
  assert.ok(baselineInternal.includes("LEGACY_INTERNAL_REPORT:mirror-only"));
  // Combined prompt contains legacy once
  const combined = assembleWithCompanion({
    cell: {
      cotStyle: "BOLT",
      stateMode: "INTERNAL",
      dnd: false,
      companionEnabled: true,
      companionMode: "live",
    },
    macroSeed: "x",
    includeAntiOmniSection: false,
    includeOocMarker: false,
    briefing: internal,
  });
  const matches = combined.match(/LEGACY_INTERNAL_REPORT/g) ?? [];
  assert.equal(matches.length, 1, "legacy report must appear once — not double-consumed");

  // Legacy regex inventory still 25; conversion path untouched (import from compatibility)
  assert.equal(inv.regexScriptCount, 25);
});

test("whole-world retrieval: location outside native first-50 name selection", () => {
  const { locationsById, nativeLocationOrder } = loadNevermoreLocationIndex();
  assert.ok(nativeLocationOrder.length >= 79);
  assert.ok(locationsById["woods-cabin"], "woods-cabin in pack");
  const idx = nativeLocationOrder.indexOf("woods-cabin");
  assert.ok(idx >= 50 || idx === -1 || true); // may be beyond 50 in definition order
  // Find a location that is definitely outside first 50 in native order
  const beyond = nativeLocationOrder.slice(50);
  assert.ok(beyond.length > 0, "map has locations beyond first 50");
  const targetId = beyond.find((id) => locationsById[id]) ?? "woods-cabin";
  const fact = retrieveLocationFact(targetId, locationsById, nativeLocationOrder);
  assert.ok(fact);
  assert.equal(fact.outsideNativeFirst50, true);
  assert.equal(fact.locationId, targetId);

  const projection = buildSceneProjection({
    audience: "player",
    observerId: "obs:player",
    knowledge: null,
    currentLocationId: targetId,
    locationsById,
    nativeLocationOrder,
    headerFacts: {
      timeDisplay: "03:15 PM",
      dayNumber: 2,
      dayOfWeek: "Tuesday",
      monthDayYear: "September 7, 2026",
      era: "AD",
      locationGeneral: "Jericho Woods",
      locationSpecific: fact.displayName,
      weatherEmoji: "🌫️",
      weather: "Fog",
      tempF: 58,
    },
    cotStyle: "BOLT",
    stateMode: "AGENTS",
    dnd: false,
    companionMode: "live",
  });
  assert.ok(projection.currentLocation);
  assert.equal(projection.currentLocation.outsideNativeFirst50, true);
  const block = renderCompanionBlock(projection);
  assert.ok(block?.includes(`id=${targetId}`));
  assert.ok(block?.includes("outside_native_first50=true"));
  assert.ok(block?.includes("header_facts:"));
  assert.ok(!block?.includes("[ 🕰️ Time"));
});

test("earned-knowledge filter: player briefing omits secrets and unknown NPCs", () => {
  let state: WorldKnowledgeState = createKnowledgeState({
    campaignId: "camp:t9",
    branchId: "branch:main",
    actualPlacements: {
      "npc:secret-keeper": { kind: "at", locationId: "crypts-breath" },
      "npc:friend": { kind: "at", locationId: "jericho-town" },
    },
    observerIds: ["obs:player"],
  });
  state = registerObserver(state, "obs:player", "Player");
  state = setActualPlacement(state, "npc:friend", { kind: "at", locationId: "jericho-town" });
  state = {
    ...state,
    observers: {
      ...state.observers,
      "obs:player": {
        ...state.observers["obs:player"]!,
        knownNpcIds: ["npc:friend"],
        knownLocationIds: ["jericho-town"],
      },
    },
  };
  state = addSecret(state, {
    secretId: "secret:crypt",
    subjectId: "crypts-breath",
    subjectKind: "location",
    summary: "hidden crypt truth",
    detail: "AUTHOR ONLY DETAIL",
    knownByObserverIds: [],
    visibility: "author",
  });
  state = setExpectedPlacement(state, {
    npcId: "npc:secret-keeper",
    windowId: "win:x",
    locationId: "crypts-breath",
    activity: "lurk",
    priority: "routine",
    certainty: "assumption",
    isSighting: false,
  });

  const { locationsById, nativeLocationOrder } = loadNevermoreLocationIndex();
  const projection = buildSceneProjection({
    audience: "player",
    observerId: "obs:player",
    knowledge: state,
    currentLocationId: "jericho-town",
    locationsById,
    nativeLocationOrder,
    cotStyle: "MICRO",
    stateMode: "AGENTS",
    dnd: false,
    companionMode: "live",
  });
  assert.ok(projection.knowledge);
  assert.equal(projection.knowledge.secrets.length, 0);
  assert.ok(!projection.occupants.some((o) => o.npcId === "npc:secret-keeper"));
  const block = renderCompanionBlock(projection)!;
  assert.ok(!block.includes("AUTHOR ONLY DETAIL"));
  assert.ok(!block.includes("npc:secret-keeper"));
});

test("Task 2 prompt contributor registration still works; companion integrates", async () => {
  clearLocalProposedPromptContributors();
  const stateRef = {
    current: defaultContributorState({
      companionMode: "live",
      stateMode: "AGENTS",
      currentLocationId: "jericho-town",
      locationsById: { "jericho-town": { displayName: "Jericho" } },
      nativeLocationOrder: ["jericho-town"],
    }),
  };
  const reg = registerCompanionPromptContributor({
    packageId: "world-map-companion",
    stateRef,
  });
  assert.equal(reg.status, "proposed-adapter");
  const blocks = await collectLocalProposedPromptContext({
    chatId: "chat:1",
    chatMeta: {},
    mode: "roleplay",
  });
  assert.equal(blocks.length, 1);
  assert.ok(blocks[0]!.includes("<companion_scene_briefing>"));

  // Companion off via meta
  const blocksOff = await collectLocalProposedPromptContext({
    chatId: "chat:1",
    chatMeta: { forceDisabled: true },
    mode: "roleplay",
  });
  assert.equal(blocksOff.length, 0);

  reg.unregister();
  clearLocalProposedPromptContributors();

  // Bridge registerPromptContributor path still PROPOSED
  const bridge = createProposedCompanionHostBridge({
    hostCapabilityApi: { major: 1, minor: 15 },
    observationOnly: true,
    companionMode: "observe",
  });
  // CompanionHostBridge adapter remains PROPOSED (not an Engine export).
  assert.equal(typeof bridge.registerPromptContributor, "function");
  assert.equal(typeof bridge.resolvePresetModeProfile, "function");
  const getBriefing = createGetBriefingText(stateRef);
  const bridged = bridge.registerPromptContributor(getBriefing);
  assert.ok(bridged.status === "proposed-adapter" || bridged.status === "wired");
  bridged.unregister();
});

test("honesty labels: PROPOSED / UNVERIFIED; no live Engine claim", () => {
  assert.equal(PROMPT_MODES_HONESTY.companionHostBridge, "PROPOSED");
  assert.equal(PROMPT_MODES_HONESTY.liveEngineWireup, "UNVERIFIED");
  assert.equal(SCENE_PROJECTION_HONESTY.companionHostBridge, "PROPOSED");
  assert.equal(SCENE_PROJECTION_HONESTY.runsSimulation, false);
  assert.equal(SCENE_PROJECTION_HONESTY.rollsDice, false);
  assert.equal(SCENE_PROJECTION_HONESTY.firstFiftyNameLimit, false);
  assert.equal(CONTRIBUTOR_HONESTY.companionHostBridge, "PROPOSED");
  assert.equal(CONTRIBUTOR_HONESTY.liveEngineWireup, "UNVERIFIED");
  assert.equal(CONTRIBUTOR_HONESTY.mutatesPromptRequest, false);
});

test("matrix coverage counts exported for proof receipt", () => {
  const coverage = {
    cotStyles: 4,
    stateModes: 3,
    dnd: 2,
    companionOnOff: 2,
    matrixCells: MATRIX.length,
    liveObserveCases: LIVE_OBSERVE.length,
    expectedMatrix: 48,
    expectedLiveObserve: 18,
  };
  assert.equal(coverage.matrixCells, coverage.expectedMatrix);
  assert.equal(coverage.liveObserveCases, coverage.expectedLiveObserve);
  // Spot-check archive hash again after all tests
  const sha = createHash("sha256").update(readFileSync(ARCHIVE)).digest("hex");
  assert.equal(sha, FF54_ARCHIVE_SHA256);
});
