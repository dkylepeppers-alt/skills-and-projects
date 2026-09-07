# World Map Companion — Full Campaign Implementation Plan

**Date:** 2026-09-07  
**Status:** Implementation checkpoints exist through Task 9 at branch tip c9c511c23a080c8a815059f39323a4bf6b5ecf0c; native package activation, exact LFS-backed validation, whole-world acceptance, and Tasks 10–14 remain open.  
**Canonical repository:** [dkylepeppers-alt/skills-and-projects](https://github.com/dkylepeppers-alt/skills-and-projects)  
**Plan path:** `projects/world-map-companion/docs/2026-09-07-implementation-plan.md`

**Checklist state (updated 2026-09-07):** `[x]` means the implementation is present and supported by fresh unit/structural evidence or an explicit recorded receipt. `[ ]` means it is not implemented or is not verified at the required integration/release level. `PROPOSED`, `UNVERIFIED`, partial-runtime, and recorded-only evidence remain explicit and do not count as live-app proof.

> **For agentic workers:** Execute this plan with the writing-plans/executing-plans workflow, using the task checkboxes and release gates below. Read the repository instructions and both Marinara skills first. Follow the task dependencies. Keep source preservation, installed-runtime verification, and whole-world acceptance as separate checks. This document incorporates the design specification; do not replace its scope with a smaller pilot.

**Goal:** Make the complete Nevermore map a useful, persistent part of roleplay: a place to find people, make plans, travel, investigate, discover opportunities, and see consequences. Preserve the supplied Freaky Frankenstein 5.4 preset in its entirety and make the companion reusable with other settings.

**Architecture:** A dedicated World Map Companion capability package, a focused Engine integration bridge, and a focused World Maps integration. The companion maintains a campaign history and produces scene context; the existing preset directs narration. The native map remains responsible for the player’s validated focal location. A Nevermore content pack supplies the complete setting.

**Tech stack:** TypeScript aligned with the inspected Marinara Engine and Agents workspaces; Engine capability persistence; the existing World Maps client technology; schema-validated structured agent output; deterministic state reduction and replay; Python for repository content/preservation validation. Pin actual dependency versions from the target checkout before implementation.

## 1. The product we are building

The first complete release must support an ordinary school day, a social encounter, an investigation across town, an expedition through the woods, and a gated underground journey in the same persistent campaign. The user can interact through natural chat, the map, or optional action controls.

| Play experience | Required behavior |
|---|---|
| Find someone | Search by name, role, relationship, or known activity; distinguish current sighting, last seen, expected whereabouts, and unknown location. |
| Understand a place | Open its description, occupants, useful activities, services, access conditions, clues, local consequences, and connected destinations. |
| Make a plan | See appointments, opening hours, known risks, travel requirements, active objectives, and relevant people without consulting multiple trackers. |
| Travel meaningfully | Choose a route and pace; bring companions; allow interruptions and intermediate scenes; preserve doors, secrets, permissions, and time costs. |
| Discover the world | Learn locations, routes, people, clues, and rumors through play; preserve what each character actually knows. |
| Affect the world | Leave objects, damage, evidence, promises, favors, opened gates, changed services, and faction reactions that remain on later visits. |
| Let life continue | NPCs follow schedules and goals; appointments pass; offscreen events advance when story time or an established trigger warrants it. |
| Recover control | Correct a mistaken fact, pin a state, undo an event, switch a swipe, branch a chat, restore a checkpoint, or export a campaign. |

**Release boundary:** All 79 existing Nevermore locations, all 82 existing image assets, all existing travel links, and a census of recurring NPCs in the supplied setting materials. No school-only, room-only, or NPC-marker-only release counts as completion. Unknown facts remain explicitly unknown; coverage does not justify inventing canon.

## 2. Non-negotiable preservation contract

The supplied preset is the permanent base, not raw material for a rewrite. Ship an immutable copy and reference it by hash from the companion installation profile. Put new prompt modules, settings, agents, and state outside that file. This approach does not require changing its section order, choices, or content.

| Uploaded baseline | Verified value |
|---|---|
| File | `Freaky Frankenstein 5.4 — Agent Gating.marinara.json` |
| Type / version | `marinara_preset` / `1` |
| Preset ID | `QT6ABwAN4X1hQEGhGSGjs` |
| Size | 187,861 bytes |
| SHA-256 | `43801992b7e07ffb24c0395f32ce87b4ea4f3a40aed929eb0462e3e41b7adc93` |
| Contents | 69 sections, 12 groups, 11 choice blocks, 25 embedded regex scripts |
| Active state default | `state_mode = AGENTS` |
| Other principal defaults | `BOLT`, second-person, `STORY`, output length on, `EMBELLISH` |
| Wrapping | `wrapFormat = none` |

Preserve every original object, ID, field, default, array order, disabled item, macro, conditional, regex script, attribution, and export extension. Do not normalize the source’s JSON-encoded strings or string booleans. Do not silently enable the seven disabled agent-data sections. Do not remove legacy internal-state systems because the companion offers related functionality. Preserve all writing, formatting, content, and optional mode choices without changing their defaults.

The source and the imported runtime require different proofs. Native import remaps IDs and normalizes stored values. The inspected importer also selects a subset of fields; its preset path does not install the root `extensions.regex_scripts` collection. Therefore:

1. **Archive proof:** the uploaded bytes remain identical in source, repository, and release archive.
2. **Transport proof:** every field has a recorded destination or preserved sidecar; none silently disappears from the package/export.
3. **Behavior proof:** original supported options, enabled/disabled behavior, marker placement, wrappers, and regex behavior survive the compatibility installation. A sidecar alone is not proof that a feature works.

Build a compatibility installer/adapter where needed. Record old-to-new native IDs. Preserve unsupported metadata in the source envelope. For executable fields that need translation, produce a documented one-to-one mapping and test actual behavior. Do not declare import success merely because the Engine returns a preset ID. Any required behavior that cannot be reproduced blocks the compatible release until resolved.

The companion-off comparison is against this same preserved preset imported into the same compatible Engine, with identical inputs and controlled randomness. It must not add prompt text, perform agent calls, advance clocks, or change rendering when disabled.

## 3. Evidence and integration boundaries

Source inspection for this plan is pinned to:

| Repository | Revision |
|---|---|
| Private skills and projects | `abdfa80d5bf8ed66cd158639bc7f68f94c8dfc94` |
| Marinara Engine, staging | `9bbee87d1a44c33f704977bd8c25aafbec9b85aa` |
| Marinara Agents, staging | `ee1a4a01d1091a9f5e4086c58f608e401aa1d879` |

These are inspected source revisions, not a claim about the user’s installed build. The Nevermore v2 handoff reports checks against older revisions; rerun its map tests against the implementation baseline.

| Verified capability or limitation | Design consequence |
|---|---|
| Capability modules can register services, conversation commands, routes, and prompt context. | Use a supported package with explicit server/client entrypoints. |
| Prompt contributors are read-only, called per generation, and have a 2-second deadline. | Assemble a cached, bounded briefing there. Do not run the simulation, make model calls, or commit state inside the contributor. |
| The inspected activation API does not expose a general roleplay prepare/finish/rewind lifecycle registration. | Implement and test an explicit Engine bridge. Do not pretend a custom agent package alone supplies these hooks. |
| Capability documents expose revisions; persistence exposes transactions and a chat lock. | Use them for package-owned state, then verify their actual concurrency and recovery behavior in the target file-backed database. |
| Native movement has command identity, definition revision checks, and message/swipe snapshots. | Integrate with that movement transaction; never infer player teleportation from a generated header alone. |
| World Maps has spatial-workspace and chat-runtime client slots. | Extend the existing map with a supported overlay and companion panel; avoid DOM scraping. |
| Native global map context lists a selected 50 names in the existing Nevermore setup. | Retrieve the full map through its data model; use selective scene context without treating unlisted locations as nonexistent. |
| The base preset already contains internal simulation and agent gating. | Introduce clear state ownership and mode behavior before writing new prompts. |

The deliverable includes the bridge and map integration required for this design. An unsupported host must show which compatible build is required; it must not silently become a weaker prompt-only substitute. Private installation must be proven using the actual installer/package contracts. Public catalog publication is not assumed.

## 4. State ownership and preset cooperation

Use one authoritative owner for each field, with other components reading or proposing changes. An AI response proposes facts; a validator and reducer decide what is committed. A generated statement does not directly write database state.

| Domain | Authority | Other components’ role |
|---|---|---|
| Geography, containment, artwork, canonical links | Versioned World Maps definition | Companion reads; setting pack attaches behavior by existing ID. |
| Player/focal location | Native spatial owner transaction | Companion proposes a validated movement command and records its result. |
| Story date, time, weather | One reconciled world-state commit for the turn | Companion proposes durations; native world-state output is reconciled before publication. No two independent clocks. |
| NPC placement, journeys, schedules, goals | Companion campaign state in live mode | Existing character data provides identity; extractors and schedules propose events. |
| Discovery, observer knowledge, rumors | Companion campaign state | UI and prompts receive filtered projections. |
| Door state, access changes, placed objects, local consequences | Companion campaign overlays | Native travel and map display read the same effective overlay. |
| Existing inventory, stats, bonds, and quests | Their configured native/legacy owner | Companion references IDs and sends proposals to that owner; it does not create another inventory or relationship scale. |
| Companion appointments, leads, faction clocks | Companion, with explicit links to existing quests | Promote a lead to a native quest through an adapter; keep one quest identity. |
| Prose, POV, dialogue, formatting, optional rules | Original FF5.4 preset | Companion supplies grounded facts and opportunities, not a replacement writing style. |

The Engine bridge must arbitrate overlapping native-agent output at field level. This is new integration work, not an existing generic capability API. Preserve the preset’s agent sections and choices while preventing duplicated persistence or contradictory `<context>` blocks.

### Existing modes remain intact

| Original selection | Companion behavior |
|---|---|
| `AGENTS`, companion live | Full campaign system. Use the existing engine-managed prior-state context convention plus a clearly identified scene briefing. |
| `AGENTS`, companion observe | Record supported observations and show the map; do not autonomously simulate NPCs or create offscreen events. |
| `INTERNAL` | Respect the selected legacy internal-state systems. Companion is an explicitly displayed observation mirror; it must not also advance their agendas, bonds, dice, or world simulation. |
| `NONE` | Static map/viewer only. No companion tracking or simulation. |
| Companion disabled or absent | Original preset behavior, with no companion contribution. |

Do not add a fourth `state_mode`, rewrite existing gates, or change the selected mode behind the user’s back. Companion controls live in its own settings. Changing modes establishes a recorded handover checkpoint; reconcile or mark uncertain imported facts before enabling live simulation.

Preserve the exact original time/place header and Fahrenheit formatting. Supply its facts instead of adding a competing header. Keep OOC pauses, user agency, the authored action cadence, perception constraints, and optional DND behavior. In `AGENTS`, DND remains narrative-only as the base requires. Preserve legacy reasoning sections as source data; new diagnostics record short factual evidence, not hidden reasoning traces.

## 5. Data model and turn protocol

Separate reusable world data from campaign-specific state. Two chats using the same map must not share NPC positions, discoveries, or opened doors unless the user deliberately selects a shared campaign.

**World pack:** world ID, source map ID/revision/hash, location profiles, NPC definitions and source bindings, calendars, schedules, route costs, encounter rules, services, and authored setting assumptions.

**Campaign:** campaign ID, active branch, source world version, settings, observer identities, ownership configuration, checkpoints, and a durable event history. The chat metadata stores a narrow reference; the history lives in package-owned records. Avoid replacing the entire metadata blob and overwriting unrelated features.

**NPC state:** stable ID; bound native character IDs where available; aliases; actual placement; activity; journey; goals; appointments; availability; condition; faction links; and evidence. Represent placement explicitly as `at`, `traveling`, or `unknown`. Schedules predict where someone is expected; they do not prove a sighting.

**Location state:** existing location ID; physical access; discovery per observer; social restrictions; occupancy; operating hours; objects/evidence; hazards; active events; services; and persistent changes. Physical unlock, knowledge of an entrance, and permission to enter are separate facts.

**Event:** stable event ID; campaign/branch; causal parent; anchor; expected revision; typed payload; source evidence; visibility; and optional deterministic random result. Corrections supersede facts through events instead of deleting the historical record.

Proposed core interfaces, to be implemented and schema-validated:

```ts
type TurnAnchor = {
  chatId: string;
  messageId: string;
  swipeIndex: number;
  contentHash: string;
};

type StateCursor = {
  campaignId: string;
  branchId: string;
  headEventId: string | null;
  revision: number;
};

type TurnTicket = {
  id: string;
  base: StateCursor;
  anchor: TurnAnchor;
  acceptedActionIds: string[];
  observationOnly: boolean;
};

interface CompanionHostBridge {
  prepareTurn(input: TurnInput): Promise<TurnTicket>;
  finalizeTurn(ticket: TurnTicket, result: AcceptedResponse): Promise<CommitResult>;
  cancelTurn(ticketId: string): Promise<void>;
  selectHistory(input: HistorySelection): Promise<StateCursor>;
}

// Domain DTOs above are defined in contracts.ts during Task 3.
// This is a proposed API, not a claim that these methods exist upstream.
```

The canonical deduplication identity includes campaign, branch, message, selected swipe, content hash, and processing version. Retry the same accepted response without repeating its effects. An edit changes the hash and invalidates dependent projections. A new swipe has its own candidate history; it does not overwrite another swipe’s world.

### Lifecycle

1. **Resolve the selected history.** Load the applicable checkpoint and replay its selected lineage. Never use “latest timestamp” as a substitute for the chosen swipe/branch.
2. **Prepare the action.** Resolve explicit map actions, travel intent, OOC state, and known elapsed-time requests. Validate prerequisites. Create a turn ticket and tentative proposals. Keep user-committed movement distinguishable from assistant-generated consequences.
3. **Build the briefing.** Use the committed cursor plus clearly identified accepted current actions. Include current surroundings, eligible occupants, relevant exits, appointments, and immediate consequences. The prompt contributor only reads this prepared projection.
4. **Generate roleplay.** FF5.4 retains its existing narrative responsibilities. The main model may portray an NPC choosing an action; it cannot choose the player’s unexpressed action or declare a failed prerequisite satisfied.
5. **Extract once.** A focused state agent reads the accepted response and relevant scene facts. It proposes typed changes with short evidence spans. Discard speculative outcomes, quoted plans, report/control blocks, and uncompleted movement.
6. **Reconcile and commit.** Validate entity IDs, chronology, ownership, access, evidence, and base revision. Reconcile native tracker proposals. Commit the accepted event batch and projections atomically at the appropriate anchor.
7. **Publish.** Update map/panel projections and make the committed snapshot available to the next turn. Keep a durable reconciliation job if agent completion is delayed; show “updating” until resolved.

No mutation occurs on every streaming chunk. Cancellation discards assistant-dependent tentative effects, but does not erase a user action already committed by the native owner. Retry uses the same action identity. Do not hold a database transaction or chat lock across an LLM call. Do not re-enter the same chat lock from the movement adapter; share the active transaction where required.

For asynchronous native agents, add a reconciliation barrier before the next world-dependent action uses their results. If processing fails, keep the last valid state, show a repairable pending status, and allow a retry. Never silently treat stale state as current.

## 6. Whole-world behavior

### NPC presence, schedules, and goals

Build the roster from the full original lorebook and supplied character materials, not only the portable map’s selected entries. Record source identity, aliases, home/work/school associations, recurring activities, commitments, goals, and knowledge boundaries. Resolve ambiguous names through an explicit alias table. Do not fabricate native character UUIDs.

Author schedules as time windows with priorities, travel requirements, exceptions, and interruption rules. Current witnessed actions and explicit commitments beat a routine schedule. A person cannot appear in two unrelated places or traverse an unavailable route. Significant NPCs can pursue goals away from the player; update them on relevant story-time boundaries, not through a separate model call per NPC.

Maintain all roster entries. Use more detailed planning for active NPCs and event-driven catch-up for distant ones, with the same timeline and rules. “Not currently in prompt context” does not mean frozen or nonexistent. Group conversations should commit one accepted exchange without ticking every participant’s schedule multiple times.

### Travel, doors, and discoveries

Support ordinary movement, step-by-step journeys, consensual fast travel, waiting, following, escorting, rendezvous, and party splitting. Natural language and UI commands converge on the same validator. Supply authored travel-time estimates or explicit uncertainty; pixel distances and hierarchy depth are not real-world measurements.

Keep all Nevermore v2 IDs, links, and artwork. Its deliberately separated crypt containment components protect progression. Do not reparent them to make the map look simpler. A display-only regional grouping can aggregate them without creating a travel path.

Three hidden entrance pairs must remain independently discoverable:

| Surface location | Crypt entrance |
|---|---|
| `nevermore-poe-statue` | `crypts-stair-mouth` |
| `ravencroft-iron-maiden` | `crypts-tunnel-mouth` |
| `dorms-common` | `crypts-crawlspace` |

The three progression links must change only through validated campaign events: `crypts-door-1` → `crypts-breath`, `crypts-door-2` → `crypts-chamber-3`, and `crypts-door-3` → `crypts-approach`. Preserve their existing bidirectional semantics; do not add parallel reverse links. Use the existing authored completion conditions without expanding or rewriting their content.

Create an effective-map resolver that combines the immutable definition with the selected campaign overlay. Native route validation, available-destination context, map rendering, NPC routing, and fast travel must all read that same effective result. A UI-only open-door badge is insufficient. Switching to a pre-unlock swipe must restore the blocked route without editing the reusable shared world.

### Knowledge, investigation, and consequences

Separate actual world state, player knowledge, and each NPC’s knowledge. Player-facing markers default to known information. Author view can inspect actual state but does not automatically feed that state into character dialogue or a player-facing generation. Filter data before sending it to the relevant model and before returning it to the player-view API.

Support sightings, communicated reports, uncertain rumors, identified clues, undiscovered leads, and conflicting testimony. Attach source and time. A report can be wrong without moving the real NPC. Respect the preset’s authored sight/hearing constraints; do not infer omniscient knowledge from being nearby on a diagram.

Location affordances include searching, questioning, studying, buying, meeting, resting, waiting, following a lead, and interacting with a persistent object. Availability depends on what the player knows, access, operating hours, who is present, and current conditions. Buttons propose an action; they never silently perform it.

Link appointments, favors, local reputation, and faction clocks to existing quest and relationship systems. Persist meaningful environmental consequences. Use a compact location journal that distinguishes established facts from leads. Do not create a disconnected second GM notebook containing duplicate copies of every tracker.

### Narrative pacing and companion profiles

Ship four companion profiles: **freeform**, **social/schedule**, **exploration/mystery**, and **tactical travel**. They change event frequency, offered controls, time granularity, and briefing emphasis. They do not overwrite FF5.4’s writing choices or force roleplay into rigid combat rounds.

The profile may suggest a pause at an arrival, appointment, danger, or meaningful discovery. Quiet conversation does not need an encounter roll every message. OOC, editing, retries, and status inspection do not advance story time. A long time skip processes meaningful schedule/event boundaries and summarizes intervening changes without generating one turn per minute.

## 7. Agent and prompt design

Use three responsibilities with bounded work:

| Component | Responsibility | Invocation |
|---|---|---|
| Deterministic scene builder | Select facts, routes, people, and opportunities from validated state. | Every applicable generation; no model call. |
| State extractor/reconciler | Propose changes established by accepted narration and merge compatible tracker evidence. | At most one additional extraction call per accepted response; skip when no relevant narrative change exists. |
| World director | Propose non-mechanical NPC decisions or world events when goals/conditions require judgment. | Event-triggered; batch relevant decisions. Never one call per NPC or per token. |

Deterministic schedules, route costs, visibility filters, and state validation stay in code. The director does not secretly choose the user’s actions or retcon an active scene. Existing dice mechanics remain authoritative in their domains; do not roll a second conflicting result. Store companion random outcomes with their events so replay cannot reroll them.

New prompt modules are separate files: continuity contract, scene briefing template, extraction schema instructions, and director instructions. They use concise factual evidence, not hidden reasoning requests. They never instruct the model to print a tracker report into ordinary `AGENTS` replies.

Set a configurable companion briefing budget, initially targeting roughly 1,200–2,000 tokens for ordinary scenes. This is a target to measure, not a fixed claim about a model. Include mandatory current-scene and safety-of-action facts first; retrieve distant information only when relevant. Track omitted optional context explicitly. Never trim the original preset to meet this budget. If the total prompt cannot fit, report the capacity issue and adjust companion retrieval or the selected model/context settings.

## 8. Map and chat interface

Extend the native map canvas with occupant markers keyed to existing location IDs. Reuse bound portraits where available and provide readable initials/icons otherwise. Stack occupants into a count at regional zoom; expand into identities in the relevant child map. Keep uncertain/last-seen markers visually distinct from confirmed presence. An unknown location does not receive a guessed pin.

Ship the following cooperating views:

- **Map:** occupants, known events, discoveries, route preview, access conditions, and persistent local changes; separate controls for browsing and committing travel.
- **Here & Now:** current place, known nearby people, ongoing activities, available actions, relevant time/weather, and immediate consequences.
- **People:** roster search, known whereabouts, appointments, following/companions, and source/time of sightings.
- **Journal:** visited places, clues, rumors, commitments, linked quests, and location-specific history.
- **Timeline & Corrections:** recent committed changes, pending reconciliation, evidence, manual corrections, locks with scope/expiry, undo, checkpoints, and branch state.
- **Settings:** companion mode/profile, player/author perspective, pacing, budget, ownership diagnostics, package versions, and export/import.

Use keyboard-operable controls, labels that do not depend on color, and a compact layout usable beside a chat on a narrow screen. Do not cover map navigation with large permanent panels. UI actions must have natural-language equivalents so the campaign remains playable through chat alone.

A correction is a reversible event with a reason and explicit scope. A pin can hold an NPC’s location until released, until an in-world time, or until a specified event. Conflicting proposals go to review rather than quietly overruling that pin. Export both campaign state and its world/preset dependencies, with version and checksum manifests; do not duplicate embedded art in every checkpoint.

## 9. Repository and deliverables

Use the private repository for both reusable work and the setting pack. Keep upstream repositories in separate development checkouts; do not vendor full Engine or Agents repositories. Store reproducible focused patches and their tested base revisions here until an authorized upstream integration exists.

All paths below are **proposed additions**, except the explicitly referenced existing Nevermore source, releases, and root validator.

| Path under repository root | Purpose |
|---|---|
| `projects/world-map-companion/README.md` | Product, installation, ownership, and release instructions. |
| `projects/world-map-companion/source/presets/ff54-agent-gating.original.marinara.json` | Byte-identical uploaded source. |
| `projects/world-map-companion/source/presets/ff54-baseline.json` | File/object hashes, field inventory, defaults, and disabled-state audit. |
| `projects/world-map-companion/compatibility/` | Source lock, installed-runtime report, import mappings, host patch metadata. |
| `projects/world-map-companion/patches/engine/` | Focused lifecycle, ownership, and import/export compatibility changes. |
| `projects/world-map-companion/patches/hierarchical-maps/` | Effective-state adapter and native overlay integration. |
| `projects/world-map-companion/package/` | Capability manifest, build configuration, server/client entrypoints. |
| `projects/world-map-companion/src/` | Contracts, state, simulation, adapters, commands, prompts, and client components. |
| `projects/world-map-companion/tests/` | Contract, preservation, replay, integration, and acceptance fixtures. |
| `projects/world-map-companion/scripts/` | Build, baseline audit, content validation, package verification. |
| `projects/world-map-companion/docs/` | This plan, evidence, installation guide, ownership contract, user guide. |
| `projects/world-map-companion/releases/v1/` | First immutable, fully qualified release and checksums. |
| `projects/nevermore/companion/` | Complete Nevermore-specific locations, NPC roster, schedules, events, profiles, and acceptance journeys. |

Do not edit `projects/nevermore/source/original.world-map.json`, overwrite `projects/nevermore/releases/v2/`, alter art, or modify the frozen toolkit for this feature. Do not regenerate images. If the existing map itself needs a justified repair, isolate it as a separately documented versioned change rather than folding it into companion development.

The first release contains: compatible package; required host/map patches or tested compatible builds; preserved preset and import adapter; all-world Nevermore pack; four profiles; recovery/export tooling; user guide; schema/compatibility report; and test evidence. Mark code licensing separately from supplied third-party content and artwork; retain existing attribution.

## 10. Executable work plan

Use a short feature branch per coherent milestone and commit validated work. Task numbers are dependencies, not reduced public releases. The checklist below records the current verification state of this implementation branch; it is not a release declaration.

### Task 1 — Freeze inputs and prove preset transport

**Depends on:** none. **Files:** `source/presets/*`, `scripts/audit-preset.py`, `compatibility/preset-import-map.json`, `tests/preset-preservation.test.ts`.

- [x] Verify the supplied SHA-256 and capture every original field, per-object hash, order array, choice, and regex record in the baseline manifest.
- [x] Import into an isolated target Engine and export again; record normalized values and remapped IDs without treating them as source changes.
- [x] Implement the missing import/regex compatibility path against actual destination schemas. Test scopes, disabled flags, regex flags, editing behavior, and depth limits; retain original legacy records alongside any translated form.
- [x] Prove all 69 sections, 12 groups, 11 choices, and 25 regex records are accounted for. Verify optional wrapping fields and all seven disabled agent markers explicitly.

**Exit:** no unaccounted field or unsupported executable behavior. Source bytes unchanged. A failing importer fidelity test blocks packaging, not preservation of the archive.

### Task 2 — Establish the host integration contract

**Depends on:** 1. **Files:** `compatibility/source-lock.json`, `compatibility/installed-runtime.json`, `docs/host-contract.md`, `tests/host-contract.test.ts`, focused patch metadata.

- [x] Record installed Engine/package versions, source revisions where available, local modifications, package API permissions, installer route, and actual roleplay lifecycle entrypoints.
- [x] Trace accepted-response, cancel, retry, edit, swipe selection, branch, message deletion, and import/export paths in the target source. Record exact owning files/functions and tests in the host contract.
- [x] Specify and implement the missing bridge at those owners. Add field-ownership arbitration and expose resolved preset mode/profile to the companion without parsing display text.
- [ ] Prove read-only prompt contribution, real private package activation, deactivation cleanup, and supported-version detection. A package must not claim a host API version it has not tested.

**Exit:** a no-op companion observes each required lifecycle event exactly once in a real roleplay chat, makes no state changes, and survives disable/re-enable.

### Task 3 — Define contracts and persistent state

**Depends on:** 2. **Files:** `src/contracts.ts`, `src/schema.ts`, `src/state/repository.ts`, `src/state/reducer.ts`, `src/state/migrations.ts`, `tests/state-contract.test.ts`.

- [x] Define all DTOs named in Section 5, typed events, world/NPC/location records, observer projections, and stable-ID rules. Version each external payload.
- [x] Implement package document storage, revision checks, append-only events, snapshots, narrow campaign references, and transactional projection updates.
- [x] Reject unknown IDs, malformed state, duplicate event IDs, stale writes, invalid chronology, and cross-campaign writes with actionable errors.
- [x] Test revision conflicts and failure between event persistence and projection publication using the actual file-backed transaction implementation. Fix or compensate for any unproven atomicity before proceeding.

**Exit:** deterministic replay produces the same state hash; a failed commit leaves no half-applied campaign.

### Task 4 — Make history selection authoritative

**Depends on:** 3. **Files:** `src/state/history.ts`, `src/state/checkpoints.ts`, `src/host/lifecycle.ts`, `tests/history-replay.test.ts`.

- [x] Bind events to message, swipe, content hash, branch lineage, and processing version. Separate tentative jobs from committed results.
- [x] Implement selected-swipe projection, edited-message invalidation, branch inheritance, message deletion, checkpoint restore, and replay from the nearest valid checkpoint.
- [x] Add durable pending-job recovery and idempotent retry after restart. Keep recorded randomness stable.
- [x] Test that switching away from an arrival/unlock removes its dependent effects, selecting it again restores them, and another chat stays unchanged.

**Exit:** retry, rewind, branch, and restart cannot double-advance time, move an NPC twice, or leak campaign state across chats.

### Task 5 — Build the complete Nevermore content pack

**Depends on:** 3. **Files:** `projects/nevermore/companion/{manifest,locations,npcs,aliases,schedules,services,events,profiles}.json`, `scripts/validate-world-pack.py`, `tests/world-pack.test.ts`.

- [x] Enumerate all 79 locations and all existing edges from v2. Preserve 82 asset references; join by ID, never by display name alone.
- [x] Give every location a functional profile appropriate to its role: playable scene, circulation space, boundary/gate, or regional container. Include affordances, access, time assumptions, source references, and relevant NPC associations.
- [x] Census recurring NPCs from the full source lore/character materials. Resolve aliases and bindings, mark uncertain initial positions, and author source-consistent schedules/goals with assumptions labeled.
- [x] Cover town, campus, residences, Ravencroft, woodland sectors, and every crypt component. Validate no dangling IDs, unreachable required schedule legs, duplicate identities, or unintended topology changes.

**Exit:** machine-readable coverage is 79/79 locations, 82/82 assets preserved, and 100% of the completed recurring-NPC census classified. No “later region” placeholders.

### Task 6 — Implement travel and effective topology

**Depends on:** 2–5. **Files:** `src/world/effective-map.ts`, `src/world/travel.ts`, `src/adapters/spatial-owner.ts`, map integration patch, `tests/travel-gates.test.ts`.

- [x] Combine immutable map data with branch-specific discovery/access overlays and expose a single effective definition to every travel consumer.
- [ ] Integrate command IDs, expected location/revision, and native owner transactions. Add journeys, travel-time proposals, companions, step travel, interruption, and fast-travel prerequisites.
- [x] Route NPCs and player actions through the same physical constraints while keeping observer knowledge and social permission separate.
- [x] Rerun all 63 existing Nevermore route assertions; add branch rollback, hidden-entrance independence, closed-service access, party split, and mid-journey interruption scenarios.

**Exit:** the map, prompt, player movement, and NPC movement agree on routes. All 79 locations become reachable under their authored unlock conditions; the sealed boundaries cannot be bypassed through parent navigation.

### Task 7 — Implement time, schedules, and NPC decisions

**Depends on:** 3, 5, 6. **Files:** `src/simulation/{clock,schedules,npcs,director}.ts`, `src/prompts/director.md`, `tests/simulation.test.ts`.

- [x] Reconcile story time with native world state. Implement calendar boundaries, operating hours, appointments, waiting, travel durations, OOC pauses, and long skips.
- [x] Advance due schedules/goals in batches, considering routes, current scene commitments, interruptions, and deterministic priorities. Keep uncertain outcomes explicit.
- [x] Add the event-triggered director for decisions that require narrative judgment, with budgets, validated output, seeded event randomness, and no per-NPC polling model loop.
- [x] Test an ordinary day, a missed meeting, an interrupted routine, a day-long skip, and a conversation with no elapsed time. Test group-chat processing without duplicated ticks.

**Exit:** consistent NPC presence across the entire map; a schedule never overrides a witnessed location or teleports someone through a blocked route.

### Task 8 — Implement observation and consequence systems

**Depends on:** 3, 5–7. **Files:** `src/world/{knowledge,affordances,consequences}.ts`, `src/adapters/trackers.ts`, `tests/knowledge-consequences.test.ts`.

- [x] Implement actual/known/last-seen/expected projections and evidence-based communication. Keep secrets out of player-view API responses and inappropriate character prompts.
- [x] Add location journals, clues, rumors, appointments, persistent objects, damage, local services, and faction clocks.
- [x] Link native quests/inventory/bonds through explicit ownership adapters; prevent duplicate quest identities and conflicting scales.
- [x] Test false rumors, a stale sighting, a private room, a communicated clue, a left-behind object, a closed business, and a consequence revisited after branching.

**Exit:** a player can investigate and plan using the map without learning unearned information or losing prior consequences.

### Task 9 — Integrate FF5.4 through external prompt modules

**Depends on:** 1–4, 6–8. **Files:** `src/prompts/{continuity,scene-briefing,extractor}.md`, `src/prompt/{projection,contributor,modes}.ts`, `tests/preset-modes.test.ts`.

- [x] Build the read-only scene projection and companion contributor. Preserve the original preset file; supply runtime facts through the existing context path and explicit companion block.
- [x] Implement the mode matrix and handover checkpoints. Preserve exact header conventions, original gates, optional DND behavior, and disabled marker states.
- [x] Verify all existing choice options still render and select correctly. Test the full `4 cot styles × 3 state modes × DND on/off × companion on/off` matrix, with additional live/observe and legacy-module interaction cases.
- [x] Compare companion-off prompts to baseline using fixed inputs and controlled macro randomness. Test `ANTIOMNI`, OOC, internal reports, and legacy regex transformations without consuming the same state twice.

**Verification snapshot — 2026-09-07**

- Branch tip inspected: [c9c511c23a080c8a815059f39323a4bf6b5ecf0c](https://github.com/dkylepeppers-alt/skills-and-projects/commit/c9c511c23a080c8a815059f39323a4bf6b5ecf0c). Tasks 1–9 source, tests, and compatibility receipts are present; implementation paths for Tasks 10–14 are absent.
- Fresh local evidence from a reconstructed text checkout: 116/116 focused project tests, 11/11 preset-audit tests, and 14/14 preset-mode tests passed. The branch’s recorded Task 9 receipt reports 124/124 for the full suite, but exact reproduction was blocked because the 91 MB Nevermore map and artwork are Git LFS objects unavailable to this checkout. Against a temporary local structural fixture, 7/8 world-pack assertions passed; the only failure was the expected map SHA check.
- The repository validator was run with an LFS-pointer probe and stopped with “Missing LFS content … Run git lfs pull.” No GitHub status contexts were attached to the branch tip, so no CI pass is claimed.
- Recorded compatibility evidence covers the pinned in-process Engine round trip, lifecycle observation, route assertions, simulation, knowledge/consequence, and prompt-mode receipts. It explicitly leaves CompanionHostBridge activation and live Engine wire-up PROPOSED/UNVERIFIED; those release gates remain open.

### Task 10 — Wire extraction and reconciled commits

**Depends on:** 4, 7–9. **Files:** `src/agents/extractor.ts`, `src/state/validator.ts`, `src/state/reconciliation.ts`, `tests/turn-lifecycle.test.ts`.

- [ ] Run extraction on accepted narrative, using a canonical transcript channel identified in the host contract. Exclude hidden reasoning, control markup, quoted plans, display-only transformations, and duplicated legacy report payloads.
- [ ] Validate source spans, aliases, place IDs, route feasibility, actual completion, visibility, user agency, and state ownership. Reject unsupported certainty.
- [ ] Merge native agent proposals at the turn barrier and commit one coherent result. Make revision conflicts retry against fresh state instead of overwriting it.
- [ ] Test malformed output, ambiguous names, interrupted streaming, canceled generation, duplicate callbacks, stale native trackers, and an extracted movement that contradicts native spatial state.

**Exit:** accepted evidence produces durable state once; malformed or contradictory proposals leave a visible, repairable pending issue without corrupting the campaign.

### Task 11 — Ship map overlays and complete companion views

**Depends on:** 5–10. **Files:** `src/client/{MapOverlay,HereNowPanel,PeoplePanel,JournalPanel,TimelinePanel,CompanionSettings}.tsx`, `src/client/api.ts`, client slot adapter, `tests/ui-projection.test.ts`.

- [ ] Add zoom-aware occupancy, known-event markers, route preview, access indicators, and explicit player/author view switching.
- [ ] Implement all six views in Section 8, with stable cross-links among people, places, journal entries, appointments, and quests.
- [ ] Route action buttons through the same command path as chat; separate map browsing, travel proposal, and committed movement.
- [ ] Verify narrow-screen layout, keyboard operation, overlapping markers, empty/unknown states, stale/pending status, and projection refresh on swipe changes.

**Exit:** the complete system is usable from both map and chat, with no raw internal JSON required for normal play.

### Task 12 — Add corrections, migration, and campaign portability

**Depends on:** 4, 8, 10, 11. **Files:** `src/commands/{corrections,checkpoints,portability}.ts`, `src/state/bootstrap.ts`, `tests/recovery-portability.test.ts`.

- [ ] Implement corrections, pins/expiry, undo, checkpoint export, dependency manifests, versioned import, and migration rollback backups.
- [ ] Bootstrap new campaigns from explicit initial facts. For existing chats, build a reviewable historical reconstruction with evidence and unknowns; do not silently overwrite their current native state.
- [ ] Distinguish missing world assets, missing character bindings, and unsupported schema versions with repairable import reports. Preserve the original source archive.
- [ ] Round-trip a branched campaign with discoveries, opened doors, NPC journeys, corrections, pending jobs, and linked quests; verify state hashes and dependency bindings.

**Exit:** a campaign can be moved or restored without losing its history, source preset, map references, or observer knowledge.

### Task 13 — Validate whole-world play and operational behavior

**Depends on:** 1–12. **Files:** `projects/nevermore/companion/acceptance-journeys.json`, `tests/whole-world.acceptance.test.ts`, `docs/acceptance-report.md`.

- [ ] Run all journeys and release gates in Section 11 against the actual installed-compatible Engine and World Maps package.
- [ ] Measure extra model calls, briefing tokens, projection latency, simulation catch-up, replay time, and UI refresh on representative hardware. Record conditions and observed results, not only targets.
- [ ] Stress the full Nevermore roster, the native maximum supported map fixture where applicable, long histories, simultaneous requests, package restart, and unavailable model connections.
- [ ] Run the repository’s required `python3 scripts/validate.py` in a complete checkout with its required LFS objects, plus the new package/content tests. Do not claim the full validator passed from a partial checkout.

**Exit:** no unresolved preservation, state-integrity, topology, knowledge-leak, or whole-world coverage blocker. Performance stays within the host’s contributor deadline; model work runs outside it.

### Task 14 — Package and document the full release

**Depends on:** 13. **Files:** `package/manifest.json`, `scripts/build-release.*`, `releases/v1/*`, `README.md`, `docs/{installation,user-guide,compatibility}.md`.

- [ ] Build against pinned compatible sources; validate the actual package manifest, permissions, entrypoints, file hashes, and install/uninstall lifecycle.
- [ ] Include every deliverable in Section 9, four companion profiles, source-preservation evidence, full-world coverage, and a concrete compatibility matrix.
- [ ] Test a clean installation, update, disabling the companion, and re-enabling it with preserved campaign state. The original preset remains selectable and intact.
- [ ] Commit source, reproducible patches, content, and release evidence to a reviewable branch/PR in the private repository. Keep LFS conventions and exclude secrets/generated caches. Do not merge or publish upstream without the applicable authorization.

**Exit:** a complete installable release with documented evidence, not only a plan, mockup, prompt, or successful development harness.

## 11. Acceptance journeys and release gates

Every journey uses the same package and complete world pack. Test both structured state and visible play behavior; a snapshot-only test cannot establish good roleplay.

| Journey | What must be demonstrated |
|---|---|
| School day | Begin in the existing starting room; follow classes/appointments; find a recurring NPC; wait; interrupt a routine; return later and see consistent changes. |
| Social scene | Hold a multi-turn conversation without arbitrary time jumps, forced encounters, NPC teleportation, duplicated bond updates, or the player’s actions being invented. |
| Town investigation | Follow a communicated lead across town, respect service hours and travel time, encounter an uncertain report, and preserve evidence in the journal. |
| Woodland expedition | Plan a connected route, bring a companion, pause at an intermediate site, split/rejoin, leave an object, and find it on return. |
| Gated journey | Discover each entrance independently, exercise all three progression gates, verify retreat, prevent containment bypass, and avoid asserting an unearned final outcome. |
| History recovery | Generate an alternate reply before a discovery/unlock, select it, verify NPC/time/access rollback, branch, correct a fact, restart, and restore the selected state. |
| Preset compatibility | Exercise all state modes, all original choices, active and disabled sections, embedded regex compatibility, and companion-off baseline equivalence. |
| Portable campaign | Export a meaningful branched campaign and import into a clean compatible installation with correct dependency rebinding and identical selected-state hash. |

Release gates:

- **Preservation:** uploaded hash unchanged; complete field/behavior audit; zero removed or rewritten preset components.
- **Coverage:** 79/79 locations, 82/82 asset references, complete roster census, every existing edge classified, all authored regions usable.
- **State integrity:** no duplicate effects, cross-chat leakage, half commits, stale branch projection, impossible movement, or silent conflict overwrite.
- **Knowledge:** no secret data in player-view payloads; confirmed/last-seen/expected states remain distinct.
- **Playable behavior:** all journeys pass; map and chat controls agree; existing FF5.4 narrative choices remain effective.
- **Compatibility:** clean install and actual runtime evidence for the specified Engine/package versions, including required patches.
- **Recovery:** restart, cancel, edit, swipe, branch, correction, export, and restore all preserve intended state.

## 12. Risk decisions and stop conditions

| Concrete risk | Required response |
|---|---|
| Source archive is preserved but runtime import drops behavior | Fix or translate the import path and verify it; do not label the release lossless based on the archive alone. |
| Existing package API lacks a required hook | Implement the explicit host bridge and pin compatibility. Do not substitute DOM polling or unanchored prompt parsing. |
| Native and companion agents disagree | Apply ownership, evidence, and revision rules; expose unresolved conflicts. Do not keep two competing truths. |
| Gate changes affect only UI | Route every consumer through the effective-map resolver before accepting the feature. |
| An NPC or travel duration lacks source support | Record unknown/assumption with provenance; let author settings refine it without presenting invented facts as canon. |
| Prompt budget is exceeded | Reduce optional companion context or change capacity settings; never remove original preset sections. |
| A map/preset upgrade changes IDs or semantics | Require a versioned migration and backup; reject unresolved bindings instead of guessing. |
| Full validation lacks required source/LFS/runtime access | Record exactly what remains unverified and keep the release gate open. Do not claim installed-runtime or full-repository success. |

No calendar estimate is asserted before the import and host-contract tasks establish the required patch surface. Those tasks produce the concrete effort/dependency estimate. Their result may change implementation ordering, not the agreed complete first-release scope.

## 13. Source references and plan review

Primary sources inspected for this design:

- [Engine preset importer](https://github.com/Pasta-Devs/Marinara-Engine/blob/9bbee87d1a44c33f704977bd8c25aafbec9b85aa/packages/server/src/services/import/marinara.importer.ts): selected-field import, ID remapping, preset-envelope dispatch.
- [Engine prompt assembler](https://github.com/Pasta-Devs/Marinara-Engine/blob/9bbee87d1a44c33f704977bd8c25aafbec9b85aa/packages/server/src/services/prompt/assembler.ts): disabled-section handling and editable agent-marker expansion.
- [Capability module runtime](https://github.com/Pasta-Devs/Marinara-Engine/blob/9bbee87d1a44c33f704977bd8c25aafbec9b85aa/packages/server/src/services/capability-packages/capability-module-runtime.service.ts): supported registration surface.
- [Prompt contributor contract](https://github.com/Pasta-Devs/Marinara-Engine/blob/9bbee87d1a44c33f704977bd8c25aafbec9b85aa/packages/server/src/services/capability-packages/capability-prompt-context.service.ts): read-only contribution and deadline.
- [Capability persistence implementation](https://github.com/Pasta-Devs/Marinara-Engine/blob/9bbee87d1a44c33f704977bd8c25aafbec9b85aa/packages/server/src/services/capability-packages/capability-persistence.service.ts): documents, revisions, transactions, snapshots, and metadata update behavior.
- [World Maps package manifest](https://github.com/Pasta-Devs/Marinara-Agents/blob/ee1a4a01d1091a9f5e4086c58f608e401aa1d879/packages/hierarchical-maps/manifest.json): package entrypoints and client slots.
- [Native spatial owner turn](https://github.com/Pasta-Devs/Marinara-Agents/blob/ee1a4a01d1091a9f5e4086c58f608e401aa1d879/packages/hierarchical-maps/src/engine/packages/server/src/services/spatial-context/owner-turn.ts): movement validation, command identity, and transactional anchoring.
- [Native spatial state resolution](https://github.com/Pasta-Devs/Marinara-Agents/blob/ee1a4a01d1091a9f5e4086c58f608e401aa1d879/packages/hierarchical-maps/src/engine/packages/server/src/services/spatial-context/state-resolution.ts): effective state/history integration boundary.
- [Nevermore v2 handoff](https://github.com/dkylepeppers-alt/skills-and-projects/blob/abdfa80d5bf8ed66cd158639bc7f68f94c8dfc94/projects/nevermore/releases/v2/HANDOFF.md): map inventory, intentional topology, gate IDs, and previously reported validation.
- Uploaded FF5.4 preset: directly parsed and hashed for this plan; its contents are treated as the user’s source material, not instructions to the planning agent.

**Plan review:** The design covers the full-world recommendation, immutable preset preservation, actual import limitations, explicit host additions, native/companion ownership, player knowledge, travel gates, history recovery, and complete release evidence. Tasks 1–9 now have implementation/unit or recorded-receipt checkmarks only where the evidence supports them. Native package activation and live Engine wire-up remain PROPOSED/UNVERIFIED; exact LFS-backed validation, whole-world acceptance, and release packaging remain open. Tasks 10–14 are not implemented on this branch.

**Verification performed on 2026-09-07:** Inspected branch tip c9c511c23a080c8a815059f39323a4bf6b5ecf0c, checked the branch’s source and compatibility evidence, and ran the focused project tests noted in the verification snapshot above. The exact full-suite receipt remains recorded but was not independently reproduced because the connector exposed the required Nevermore map as an LFS pointer. The root validator stopped on missing LFS content, and no live application/package activation or clean-release test was available. Keep the corresponding release gates open until those checks run in a complete checkout and supported host.
