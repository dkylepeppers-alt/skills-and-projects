# World Map Companion — History Selection (Task 4)

**Date:** 2026-09-07  
**Merged tip:** `4008b1e` (PR #9 → `implementation/world-map-companion`)  
**Code:** `src/state/history.ts`, `src/state/checkpoints.ts` (exports via `src/state/index.ts`)  
**Contracts:** `TurnDedupKey`, `HistorySelection`, `PROCESSING_VERSION` in `src/contracts.ts`  
**Tests:** `tests/history-replay.test.ts`  
**Storage:** Task 3 file-backed `CampaignRepository` — **not** Engine `CapabilityDocumentStore`

## Purpose

Make chat history selection authoritative for campaign projection. Events bind to a concrete message/swipe/contentHash/branch/processingVersion. Selected-swipe projection never substitutes “latest timestamp.” Tentative work stays outside the committed lineage until an idempotent commit.

## Status

| Surface | Status |
|---|---|
| Companion `HistoryStore` / `CheckpointStore` (unit-tested) | **IMPLEMENTED** at `4008b1e` |
| Live Engine `selectHistory` wiring at generate.routes / chats HTTP | **UNVERIFIED** (bridge stays **PROPOSED**) |
| Desktop `activatePackage` | **UNVERIFIED** |
| Archive FF5.4 presets under `source/presets/` | **FROZEN** (unchanged by Task 4) |

## Binding identity

A committed turn is keyed by `TurnDedupKey`:

- `campaignId`, `branchId`
- `messageId`, `swipeIndex`, `contentHash`
- `processingVersion` (currently `PROCESSING_VERSION = 1`)

`eventMatchesBinding` rejects events that do not match the selected binding. Soft-invalidated turns remain on disk for archive but are excluded from projection.

## Selection kinds

`applyHistorySelection` applies a `HistorySelection` (`swipe` | `edit` | `delete` | `branch` | `retry`) onto `HistoryStore`:

| Kind | Behavior |
|---|---|
| `swipe` | Updates `selectedByMessage` for that message; republishes selected projection. Requires `messageId`, `swipeIndex`, `contentHash`. |
| `edit` | Content-hash change soft-invalidates the old turn and dependent later turns; selection moves to the new hash. |
| `delete` | Soft-invalidates the message and truncates dependent lineage; other chats unchanged. |
| `branch` | Inherits selection/lineage into the target campaign/chat; source chat stays intact. |
| `retry` | Idempotent re-commit path for the same dedup key (no double-advance). |

Cross-chat writes are rejected (`CROSS_CHAT`). Unknown or malformed selections raise `HistoryError`.

## Pending jobs vs committed turns

- **PendingJob** — durable tentative work (`pending` / `processing` / `failed` / `cancelled`). Holds `proposedEvents` and `recordedRandom` captured at enqueue. Not part of committed lineage.
- **CommittedTurn** — events published through Task 3 repository; may be soft-`invalidated` with reason.
- `recoverPendingJobs` rehydrates durable jobs after restart; optional `commitReady` commits idempotently.
- `retryPendingJob` reuses the same `recordedRandom` — randomness is stable across retry/restart.
- Committing removes the matching pending job. An already-committed non-invalidated turn is reused (no double-advance).

## Checkpoints

`CheckpointStore` snapshots companion projection + selection prefix via Task 3 repository snapshots (again: not Engine document store).

- `create` — records message-order prefix, selected swipes, event count, head, revision, state hash.
- `findNearestValid` — largest checkpoint whose event count ≤ lineage and whose message prefix is a prefix of current (or provided) order.
- `restore` — exact rewind to checkpoint selection, or `replayToSelection` to seed from nearest checkpoint then replay suffix events.

## Exit criteria (unit)

Verified in `tests/history-replay.test.ts` at merge:

- No double-advance on retry / rewind / branch / restart paths exercised by the suite.
- No cross-chat campaign leak.
- Swipe/edit/delete/branch/checkpoint restore + durable pending recovery with stable randomness.

## Non-claims

- Does **not** prove live Engine route instrumentation calling `CompanionHostBridge.selectHistory`.
- Does **not** use or invent Engine `CapabilityDocumentStore` as the campaign store.
- Does **not** modify frozen FF5.4 archive presets.
- Does **not** complete Task 5+ (Nevermore pack, travel, simulation, live wire-up).

## Related docs

- Task 2 Engine owners and PROPOSED bridge: `docs/host-contract.md` (§5 owners, §6 `selectHistory`)
- Task 3 contracts / file repository: `src/contracts.ts`, `src/state/repository.ts`, `tests/state-contract.test.ts`
- Implementation plan Task 4 exit text: `docs/2026-09-07-implementation-plan.md` (§10 Task 4)
