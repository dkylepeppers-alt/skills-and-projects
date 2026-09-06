# Runtime: what is stored, projected and enforced

Contents: projection · travel · discovery/secrets · lore · visual context · verification.

## Owner projection

The spatial block is assembled from the effective enabled definition and current
location at generation time. It is not a one-time initialization. Moving changes
the current description, memory, destinations and forced lore IDs; message/swipe
snapshots and accepted travel contribute to effective state. Saving a map and
choosing a current location are distinct from merely browsing a location in the editor.

| Data | Owner projection / prompt |
| --- | --- |
| Current node | Description up to 4,000 characters, model memory up to 8,000 |
| Breadcrumb | Names/IDs, last 20 nodes; not parent descriptions |
| Destinations | First 50 from full resolved, deduplicated, sorted one-hop destinations |
| Known location index | First 50 active locations in definition array order; names/paths/IDs |
| Current lore IDs | Passed separately to the lore resolver |
| Current reference ID/toggle | Passed to eligible illustration pipelines, not an image in the text block |
| Accepted travel | Validated route/accepted destination/remaining route summary, up to 64 route IDs |
| Coordinates, icon, backgrounds, hierarchy vocabulary | Not automatic textual spatial reasoning |
| awarenessSummary | No consumer found in the audited owner-prompt path |

The current location need not be in the first 50 names to supply current context.
A destination outside that index can still appear in the separate destination list.
Server name/breadcrumb matching searches active locations across the definition.
Changing location does not cause the known index to select nearby or recently visited
nodes. Reordering the array changes its first 50; changing only `sortOrder` does not.

Do not automatically archive a large campaign down to 50. That changes availability,
not merely token usage. Discuss partitioning, compact indexing or selective scope with
the user; a custom prompt that repeats the whole atlas also spends context.

### Working above the 50-name index without source changes

No exposed setting raises or dynamically reranks the native 50-name index. First
identify what the user actually needs; storage, travel, global name awareness and
regional detail have different no-code solutions.

| Goal | Best supported approach | Boundary |
| --- | --- | --- |
| Store and navigate more than 50 locations | Keep one hierarchical definition and use containment, available links and routed travel | Definition remains bounded at 500; ordinary assistant movement remains one hop |
| Keep the most useful names globally visible | Put a strategic spine in the first 50 active `locations[]` records | Selection follows raw definition order, not `sortOrder`, proximity, recency or current branch |
| Give the model detailed awareness of the current region | Reuse a compact regional-directory lore entry on every location where it should apply | Exact-current attachments are not inherited; lore budgets still apply and lore does not create travel authority |
| Limit context by campaign act or lifecycle | Manually archive and restore genuinely unavailable branches | Archived nodes leave the active index and ordinary reachability; this is state editing, not prompt-only paging |
| Add a static atlas outside the map projection | Use a dedicated campaign preset section or literal text in the global map turn template | No turn-template variable exposes locations 51–500; global Roleplay/Game map templates affect every matching chat and static text can drift |
| Separate genuinely independent settings | Use separate templates/shared worlds and manually select or relink the chat | A chat resolves one effective definition; switching is not automatic regional paging and current/history constraints can block a seamless swap |

Use this default design for one large continuous world:

1. Keep the complete map rather than deleting detail to fit the prompt index.
2. Order the first 50 active records as a strategic spine: world/root, regions,
   settlements or districts, major buildings, travel hubs and signature places.
   One workable allocation is 1 root + 8 regions + 16 settlements/districts +
   15 major buildings + 10 hubs or landmarks.
3. Keep each navigational hub below 50 resolved one-hop destinations when practical.
   Destination projection has its own separate 50-entry bound and is sorted by
   `sortOrder`, then name and ID.
4. Add regional directory lore only when the model must know omitted local names
   before they become current or directly available. Keep each directory compact:

   ```text
   East Wing > Music Room [academy.east.music]
   East Wing > Practice Hall [academy.east.practice]
   East Wing > Instrument Storage [academy.east.storage]
   ```

   Link the same directory entry to every descendant where it should be available;
   linking it only to the region parent does not propagate it. The current-location
   forced-lore preselection is estimated against a 2,048-token budget before later
   per-book/global budgets and entry limits. Directory IDs help the model orient itself
   but do not bypass one-hop or routed-travel validation.
5. Reserve archive/restore or map switching for real story-scope changes, not routine
   navigation inside one continuous setting.

Do not present these as equivalent cap removals:

- Increasing model context does not change either 50-entry slice.
- Changing only `sortOrder` does not change the global known-location slice.
- `awarenessSummary`, coordinates and hierarchy-profile types do not add a second
  owner-prompt atlas in the audited path.
- Parent `description`, parent `modelMemory` and parent lore are not inherited by the
  current child.
- Editing the map turn template can reformat supplied variables or add literal text;
  it cannot request an uncapped location collection that the application never supplies.
- Archiving is not a harmless visibility filter, and splitting maps is not seamless
  automatic streaming.

## Travel is not one universal turn rule

Native destinations include active parent, active children, available outgoing links,
and incoming available bidirectional links from active sources. They are deduplicated.
Only available links count. Containment traversal remains independent of link states.

| Path | Acceptance in inspected source |
| --- | --- |
| Ordinary transition without travel mode | Existing one-hop destination |
| Explicit routed `step_by_step` | Resolve an available directed route; commit next hop |
| Explicit routed `travel_now` | Resolve the route; commit target, with route summary |
| Assistant `spatial_move` | Current location or an existing one-hop destination |
| Assistant `spatial_discover` | Separate discovery logic, not arbitrary route repair |

Route payloads are bounded to 64 destination IDs. Do not confuse this with the 50-name
index or 500-node definition limit. UI access, owner modes, revision checks and current
location expectations also matter. Inspect `validateSpatialTransition` when debugging.

A sibling trip through a parent has two graph hops, not necessarily two user turns.
A 25-floor building should normally have sibling floors with layer order; a 25-level
containment chain also exceeds the 20-level structural limit. Explicit links can
express stairs or lifts, but containment itself may provide a shorter route through
the building parent. Therefore a decorative floor spine does not enforce a sequential
dungeon crawl.

## User-led discovery and secrets

The runtime prompt tells the assistant to use the latest user-led arrival/discovery,
not its own narration, as authority. This is an instruction to the model; it is not
a deterministic natural-language proof of user intent. The server separately validates
directives against map topology.

For discovery, an unambiguous reachable existing name can be reused. A unique existing
but unreachable name is rejected rather than linked; ambiguity is rejected. A new
durable `enter` place becomes a child. A `link` place becomes a sibling and requires
explicit outgoing/incoming/both direction. New places default to kind place, list,
active, empty lore links, with schema validation and the 500-node guard. They do not
arrive with bespoke lore, art or full room semantics.

Known source contradiction: prompt wording promises a direct route for known arrivals
through newly revealed/secret paths, but `spatial_move` still accepts only the existing
one-hop set. Do not promise automatic opening of hidden/blocked links or add a fake
discovery to bypass a known unreachable node.

For each secret, design three separate things:

- Observable clue and narrative reveal condition, available from the near side.
- Destination content/payoff, without a spoiler in the name or public description.
- Actual topology/state operation that permits access when appropriate.

Hidden/blocked links restrict edges, not nodes. Test alternate containment and other
link routes. Reparenting beneath a publicly reachable gate room still exposes its
active children. Archiving a branch can remove destinations, but has starting/current/
active-child/history protections in mutation flows and requires an explicit authored
state change. It is not the only conceivable gate or a universal privacy mechanism.

`modelMemory` is author-visible and model-visible guidance, not encrypted data or
a spoiler-security boundary. Archived ancestors can still contribute breadcrumb names
of active descendants in malformed/inconsistent definitions. Prefer coherent branches;
do not promise absolute invisibility based on one status field.

## Location-attached lore

Only the exact current node's `lorebookEntryIds` are projected automatically.
Parent attachments are not inherited. Other lore may still enter through keywords,
constants, recursion, vector retrieval and ordinary scope rules.

Forced location entries bypass keyword matching and normal ownership scope, but still
face eligibility/exclusion checks, active-entry safeguards, per-chat overrides,
activation gates and budgets. At the pinned Engine revision, a 2,048 estimated-token
preselection budget applies to the location-forced candidates. Survivors merge with
ordinary activations and face per-book/global budgets and entry limits. Inspect
diagnostics instead of claiming that attaching a large entry guarantees injection.
Current estimates use character-count approximation, not the provider's exact tokenizer.

Portable lore determines what gets imported and attached; it does not fix a missing
outlet in the prompt preset. If an attached entry targets an outlet, inspect the exact
preset and the current macro consumer. Do not invent outlet names or prescribe a
universal depth. Presets are separate companion artifacts, not part of this map envelope.

## Visual context

Backgrounds are UI assets. Current-location references can guide image generation if
the saved map, toggle, owner pipeline, real Gallery record, file and backend capacity
all permit it. A successful reference lookup is not proof the provider honored it.
Trace caller budgets; do not publish a permanent provider-limit table from old docs.

## Verify in a disposable chat

Check import restoration warnings, save/apply, owner mode, enablement and starting/current
location. Walk one ordinary route, one routed journey and one expected rejected gate.
Inspect resolved spatial prompt and lore diagnostics at two different locations.
Verify actual artwork display and reference attachment; re-export and compare bindings.
Use fresh/dummy content for testing. Report which steps were run and which remain manual.
