# World Map Companion — Host Integration Contract (Task 2)

**Date:** 2026-09-07  
**Scope:** Discovery + scaffold only. No Engine bridge implementation, no package activation, no preset byte changes, no invented remapped IDs / `runtimeObservation`.  
**Status:** Source-traced against pinned checkouts. Live installed-runtime and no-op lifecycle observation remain open exit proofs.

## 1. Pins

| Source | Revision | Checkout path |
|---|---|---|
| Marinara Engine (staging) | `9bbee87d1a44c33f704977bd8c25aafbec9b85aa` | `/workspace/repos/Marinara-Engine` |
| Marinara Agents (staging) | `ee1a4a01d1091a9f5e4086c58f608e401aa1d879` | `/workspace/repos/Marinara-Agents` |
| Companion implementation branch tip (branched from) | `28d13991464abf6251e532d5e3da0c3cac756ef5` | `implementation/world-map-companion` |
| Companion task branch | `wmc/task-2-host-contract` | see `compatibility/source-lock.json` |

Machine-readable copy: `compatibility/source-lock.json`.  
Installed build versions: `compatibility/installed-runtime.json` (status **UNKNOWN** until Task 1 live evidence exists).

Inspected capability API surface in Engine shared schema: `supportedCapabilityApi = { major: 1, minor: 15 }`  
(`packages/shared/src/schemas/capability-package.schema.ts` → `supportedCapabilityApi`).

World Maps package inspected at Agents pin: `hierarchical-maps` manifest `version` **1.4.2**, `capabilityApi` **1.4**, permissions listed below. That is a **source** pin, not proof of the user's installed package.

## 2. Verified vs UNVERIFIED legend

- **VERIFIED:** Symbol/path observed in the pinned Engine/Agents checkout.
- **PROPOSED:** Companion-owned API from plan Section 5; does **not** exist upstream.
- **UNVERIFIED:** Required for Task 2 exit or later integration, but not proven against a live Engine process / installed runtime in this workspace.

## 3. Package / capability APIs (VERIFIED)

### 3.1 Activation surface

| Path | Symbol | Notes |
|---|---|---|
| `packages/server/src/services/capability-packages/capability-module-runtime.service.ts` | `CapabilityModuleRuntime` (class) | Loads verified runtime snapshot; requires `module.activate(context)`. |
| same | `activatePackage(app, packageId)` | Deactivates then re-activates one package. |
| same | `deactivatePackage(packageId)` | Runs registered cleanups. |
| same | `capabilityModuleRuntime` | Singleton export. |
| same | `prepareCapabilityRuntimeEnvironment` | Sets DATA_DIR for bundled package modules. |
| same | `CapabilityActivationContext` (local type) | `app`, `dataDir`, `package`, `api.*` host handles. |

**Activation `api` methods (VERIFIED):**

- `registerTurnGameEngine`
- `registerConversationCommand` — requires manifest permission `conversation-actions` when a handler is supplied
- `registerService` — agent-runtime key gated via `assertCapabilityAgentRuntimeServiceRegistration`
- `registerPromptContext` — requires permission `prompt-context`
- `registerPrivilegedRoutes` — requires permission `routes` (enforced in route registration)
- `runInternalRoute`
- `runtime` → `CapabilityRuntimeHost` (embeddings, languageModels, logger, **persistence**, resources, …)

**No VERIFIED general roleplay prepare / finalize / rewind / cancel / swipe / edit registration API** on the activation context. Packages cannot subscribe to those chat lifecycle events through `activate(context)` alone. That gap is why the companion needs an explicit Engine bridge (PROPOSED below).

### 3.2 Prompt contributors (VERIFIED)

| Path | Symbol | Notes |
|---|---|---|
| `packages/server/src/services/capability-packages/capability-prompt-context.service.ts` | `registerCapabilityPromptContext` | Per-package contributor registration; returns cleanup. |
| same | `CapabilityPromptContextContributor` | Read-only; may return string / rich contribution / null. |
| same | `collectCapabilityPromptContext` | Collects all contributors for a turn. |
| same | `CONTRIBUTOR_TIMEOUT_MS` / `withDeadline` | **2000 ms** deadline per contributor. |
| `packages/server/src/routes/generate.routes.ts` | call site ~L3536 | Generation pipeline invokes `collectCapabilityPromptContext`. |

Contract comments in-source: contributor must not mutate; throws/timeouts are skipped so one package cannot block generation.

### 3.3 Persistence (VERIFIED)

| Path | Symbol | Notes |
|---|---|---|
| `packages/server/src/services/capability-packages/capability-persistence.service.ts` | `createCapabilityPersistenceHost` | Host for package documents / spatial snapshots. |
| same | `withChatLock` | Queues via `withChatMetadataPatchQueue`. |
| same | `transaction` | File-backed DB transaction wrapping a persistence session. |
| same | `documents` / `appendRoleplayEvent` | Document store + roleplay-event append. |

Related read path (not a lifecycle hook):  
`capability-roleplay-events.service.ts` → `collectRoleplayEventContext`, `engineEventOwner`, `visibleTo`.

### 3.4 Permissions + installer (VERIFIED)

Permission enum (`capabilityPermissionSchema`):

`agent-runtime` | `chat-read` | `chat-write` | `conversation-actions` | `network` | `prompt-context` | `routes` | `storage` | `ui`

Installer / lifecycle routes (`packages/server/src/routes/capability-packages.routes.ts`):

| HTTP | Owner | Notes |
|---|---|---|
| `GET /api/capability-packages/installed` | `capabilityPackageManager.installed` | List installed. |
| `POST /api/capability-packages/:id/install` | `capabilityPackageManager.install` then conditional `capabilityModuleRuntime.activatePackage` | Privileged; turn-game packages may activate immediately when not `restart-required`. |
| `DELETE /api/capability-packages/:id` | `deactivatePackage` + `capabilityPackageManager.uninstall` | Cleanup patches chat metadata agent refs. |

Package manager: `packages/server/src/services/capability-packages/package-manager.service.ts` → `capabilityPackageManager` (install / uninstall / runtimePackages / verifiedRuntimeFiles / markRuntime*).

**Installer notes for companion (scaffold guidance, not implemented):**

- Expect a v2 manifest with explicit `entrypoints.server` / `entrypoints.client`, hashed `files`, `engine.min`/`maxExclusive`, and only declared permissions.
- Likely needed permissions for the eventual package: at least `prompt-context`, `storage`, `chat-read`; plus `routes`/`ui`/`chat-write`/`conversation-actions`/`agent-runtime` only when those surfaces are actually used and tested.
- `routes` permission requires `restartRequired: true` (`getCapabilityPackageInstallIssue`).
- Private install must be proven on a real host; catalog publication is not assumed.
- Do not claim a `capabilityApi` minor the package has not tested against `supportedCapabilityApi`.

World Maps reference permissions (source pin only):  
`agent-runtime`, `chat-read`, `chat-write`, `network`, `prompt-context`, `routes`, `storage`, `ui` (`Marinara-Agents/.../hierarchical-maps/manifest.json`).

## 4. Import / export paths (VERIFIED)

| Concern | HTTP | Route file | Service / symbol |
|---|---|---|---|
| Marinara JSON import | `POST /api/import/marinara` | `packages/server/src/routes/import.routes.ts` | `importMarinara` in `services/import/marinara.importer.ts` |
| Native `.marinara` zip | `POST /api/import/marinara-package` | same | zip → `data.json` path in route |
| Preset full readback | `GET /api/prompts/:id/full` | `packages/server/src/routes/prompts.routes.ts` | lists sections/groups/choiceBlocks |
| Preset export | `GET /api/prompts/:id/export` | same | `buildPresetExportEnvelope` (local) |
| Regex script import | `POST /api/regex-scripts/import` | `packages/server/src/routes/regex-scripts.routes.ts` | `createRegexScriptsStorage(...).create` via `importRegexScriptSchema` |

**UNVERIFIED (Task 1 live):** actual remapped IDs, normalized export values, and regex readback against a running Engine. Do not invent `runtimeObservation`. See `compatibility/engine-import-status.md` / Task 1 ownership.

## 5. Roleplay lifecycle map (VERIFIED owners)

There is **no** package-facing prepare/finish/rewind bus. Lifecycle is owned by chat storage + the generate route. Companion observation must hook these owners (via a future Engine bridge), not invent parallel events.

### 5.1 Accepted response (assistant turn persisted)

| Step | Path#symbol | Notes |
|---|---|---|
| Generate entry | `routes/generate.routes.ts` → `app.post("/")` (~L803) | Main SSE generation route. |
| Persist new assistant | same file → `chats.createMessage(...)` (~L7442) | Default accept path after model completion / post-process. |
| Persist regen swipe | same → `chats.addSwipe(regenerateMessageId, fullResponse)` (~L7366) | Retry/regen creates a new swipe on the existing message. |
| Persist continue | same → `chats.updateMessageContent(continueMessageId, ...)` (~L7376) | Continuation edits the active message content. |
| Hidden command anchor | same → `chats.createMessage` (~L7266) | Empty/hidden assistant row when commands exist without prose. |
| Storage | `services/storage/chats.storage.ts` → `createMessage` / `addSwipe` / `updateMessageContent` | Authoritative persistence. |
| Client signal | generate route → SSE `assistant_message_ready` (~L7943+) | Emitted after save; **not** a package hook. |
| Spatial materialization | Agents `.../spatial-context/state-resolution.ts` → `materializeAssistantSpatialState` | Called from generate after save when hierarchical maps enabled. |
| Spatial owner commit (impersonate travel) | Agents `.../spatial-context/owner-turn.ts` → `commitSpatialOwnerTurn` | User-committed movement path. |

**UNVERIFIED:** Whether every accept path (empty anchor, discarded duplicate conversation response, aborted mid-stream partial save) is observable without Engine patches; which SSE types a no-op companion must see exactly once per user-visible accept.

### 5.2 Cancel / abort

| Path#symbol | Notes |
|---|---|
| `routes/generate.routes.ts` → `app.post("/abort")` (~L10726) | Explicit `POST /api/generate/abort` with `{ chatId, agentsOnly? }`; aborts AbortControllers; may POST provider `/api/extra/abort`. |
| same → client `close` handler (~L1279) | Disconnect aborts in-flight generation. |
| `routes/chats.routes.ts` chat delete (~L1811) | Aborts `activeGenerations` for the chat before `storage.remove`. |
| `activeGenerations` Map | Decorated on Fastify (~L10711); identity-checked release in generate `finally`. |

**UNVERIFIED:** Partial assistant rows left after abort; companion cancel semantics vs native “discard tentative effects but keep user-committed spatial turns”.

### 5.3 Retry / regenerate / agent retry

| Path#symbol | Notes |
|---|---|
| `generate.routes.ts` `POST /` with `regenerateMessageId` | Treated as regen; saves via `addSwipe` (accepted alternate). |
| `routes/generate/retry-agents-route.ts` → `registerRetryAgentsRoute` | `POST` retry-agents (agent-only redo; not a full message regen). |
| same → `finalizeCapabilityAgentResults` usage | Agent result finalization for retries. |
| `capability-agent-runtime.service.ts` → `finalizeCapabilityAgentResults` | Shared finalizer. |

**UNVERIFIED:** Idempotent companion processing keyed by message+swipe+contentHash on regen; interaction with deferred capability agent results (`shouldDeferCapabilityAgentResult`).

### 5.4 Edit message

| Path#symbol | Notes |
|---|---|
| `routes/chats.routes.ts` → `PATCH /:chatId/messages/:messageId` (~L2130) | Body `{ content }`. |
| `chats.storage.ts` → `updateMessageContent` | Persists edit (also used by continue). |
| `PATCH .../extra` (~L2139) | Partial extra merge; may sync swipe extras. |

**UNVERIFIED:** Content-hash invalidation cascade for companion projections after edit.

### 5.5 Swipe selection / swipe CRUD

| HTTP (under `/api/chats`) | Route ~line | Storage |
|---|---|---|
| `GET .../messages/:messageId/swipes` | L3278 | `getSwipes` |
| `POST .../swipes` | L3283 | `addSwipe` |
| `POST .../swipes/bulk` | L3289 | `addSwipe` loop |
| `DELETE .../swipes/:index` | L3315 | `removeSwipe` |
| `DELETE .../swipes/others/:index` | L3343 | `removeSwipe` loop |
| `PUT .../active-swipe` | L3370 | `setActiveSwipe` |

Storage: `chats.storage.ts` → `addSwipe` (~L2128), `setActiveSwipe` (~L2174), `removeSwipe` (~L2210).

**UNVERIFIED:** Companion selected-history projection on active-swipe change without full bridge; game-state row anchoring per swipe (`getByChatAndMessage`).

### 5.6 Branch

| Path#symbol | Notes |
|---|---|
| `routes/chats.routes.ts` → `POST /:id/branch` (~L3885) | Copies messages/swipes/metadata up to optional `upToMessageId`; scene chats rejected. |
| `chats.storage.ts` → `create` / `createMessagesBatch` / `getSwipes` | Used during branch copy. |

**UNVERIFIED:** Companion campaign fork vs chat-branch identity; inheritance of package documents across `groupId` branches.

### 5.7 Message deletion

| Path#symbol | Notes |
|---|---|
| `DELETE /:chatId/messages/:messageId` (~L2114) | `storage.removeMessage` |
| `POST /:chatId/messages/bulk-delete` (~L2120) | `storage.removeMessages` |
| `chats.storage.ts` → `removeMessage` / `removeMessages` | Authoritative delete |

**UNVERIFIED:** Companion event tombstones / projection repair after deletion mid-history.

## 6. Proposed CompanionHostBridge (PROPOSED — plan Section 5)

> **PROPOSED API — not present in Marinara Engine.** To be implemented later as an explicit host bridge / patch at the verified owners above. Do not treat these methods as upstream exports.

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

// Domain DTOs (TurnInput, AcceptedResponse, CommitResult, HistorySelection)
// are defined in contracts.ts during Task 3.
```

**Intended wiring (future, not implemented in Task 2):**

| Bridge method | Primary verified owners to instrument |
|---|---|
| `prepareTurn` | Before prompt assembly / contributor collection in `generate.routes.ts`; read-only projection for `registerPromptContext`. |
| `finalizeTurn` | After accepted persist (`createMessage` / `addSwipe` / continue update) and before/at `assistant_message_ready`. |
| `cancelTurn` | `POST /api/generate/abort` + disconnect abort paths. |
| `selectHistory` | `setActiveSwipe`, branch create, message edit/delete, regenerate swipe add. |

Field-ownership arbitration and preset mode/profile exposure without parsing display text remain **future bridge work** (plan Task 2 bullets beyond this scaffold).

## 7. Prompt contributor usage rules (for eventual no-op / live modes)

**VERIFIED constraints:**

- Read-only; 2 s deadline; failures skipped.
- Called per generation via `collectCapabilityPromptContext`.
- Must not run simulation, model calls, or commits inside the contributor.

Companion briefing assembly belongs **outside** the contributor (prepareTurn / cached projection); the contributor only reads the prepared text.

## 8. Proofs still required for Task 2 exit

Task 2 exit (from plan): *a no-op companion observes each required lifecycle event exactly once in a real roleplay chat, makes no state changes, and survives disable/re-enable.*

Still **UNVERIFIED / blocking exit**:

1. **Live installed-runtime fill-in** of `compatibility/installed-runtime.json` (Engine version/commit, hierarchical-maps version, capability API reported by host) — depends on Task 1 live evidence + real installer.
2. **No-op companion package** activated on a real host (private install path), registering only observation hooks / prompt no-op.
3. **Exactly-once observation** of: accepted response, cancel/abort, retry/regen, edit, active swipe change, branch, message deletion — against the owners in §5.
4. **Disable / re-enable cleanup** via `deactivatePackage` / `activatePackage` with no leftover prompt contribution or listeners.
5. **Supported-version detection** refusing hosts outside tested `capabilityApi` / engine range.
6. **Bridge implementation** at the verified owners (explicitly out of scope for this scaffold commit).

This document + `source-lock.json` + `installed-runtime.json` (UNKNOWN) + `tests/host-contract.test.ts` satisfy the **discovery/scaffold** portion only.

## 9. Out of scope / non-goals for this commit

- Modifying `source/presets/*` bytes.
- Inventing remapped IDs or `runtimeObservation`.
- Implementing Engine patches, CompanionHostBridge runtime, or package activation.
- Claiming Task 1 live import complete.
- Opening/merging a PR that asserts Task 1 or Task 2 exit proofs.
