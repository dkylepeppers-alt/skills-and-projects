# Optional in-app AI drafting

Default to the offline workflow when the user wants external control. The app's builder
is an optional source of drafts, not the authority for a hand-authored file.

At the pinned package, ai-draft.ts exposes these specs:

| Preset | Target | Maximum draft locations | Maximum depth | Draft output budget |
| --- | --- | --- | --- | --- |
| small | 8 | 12 | 3 | 12,000 |
| medium | 16 | 24 | 5 | 24,000 |
| large | 28 | 40 | 7 | 40,000 |

These are draft-generation specs, NOT the map's 5,000-location storage limit. Custom target
preferences are bounded separately. Connection output settings, remaining map capacity
and expansion depth can reduce effective output. Recheck current consumers before
diagnosing truncation from a table.

Create/replace/expand requests use an intermediate draft vocabulary including key,
parentKey, sourceKeys and origin. Native final definitions instead use id, parentId,
lorebookEntryIds and the strict location fields. Do not paste draft-only provenance
fields into an importable location. Keep provenance in companion sources.

Grounding modes include setup, lore_strict and lore_expand. The request schema requires
lore sources for lore modes and excludes them from setup mode. Strict canon and
permitted invention are separate authoring intentions; validate actual generated
provenance instead of believing a prompt instruction proves factual fidelity.

A chat-specific draft, replacement, expansion or preview can also append the World
Maps reference lorebook selected in Chat Settings → Agents. That text is prompt
source data for the request. It is not a field in the map file, and it does not
replace grounding-mode lore sources. The host method is
`resolveAgentLorebookEntries`; World Maps 1.7.1 refuses the call on an Engine that
does not provide it. Engine v2.5.2 does.

Review a draft for scene usefulness, isolated-context quality, floor/room completeness,
duplicate names, route plausibility, secret bypasses and artwork policy. Expansion is
intended to preserve existing content; inspect normalization and the preview/diff before
claiming it never changes any connection or setting. Do not imply a draft is saved,
enabled or supplied with finished artwork/lore merely because generation succeeded.

## Keep three prompt systems separate

- Generation options: guidance plus draftSystem/draftUser/expansionSystem/expansionUser
  templates. Prefer a small guidance edit when that is sufficient.
- Turn prompt templates: runtime current location, visible/private context, destinations
  and authority instruction. Confirm all necessary variables survive an override.
- Maps location artwork override: image prompt composition. It is not the prose
  turn prompt or the lore outlet system.

The inspected turn variables are ownerMode, currentPath, currentLocationId,
visibleLocationContext, privateModelContextBlock, availableDestinations,
authorityInstruction. These are template variables, not an invented family of lore
outlets. For any macro/preset request, inspect the actual preset and resolver.

Map art overrides can use locationName, locationDescription, locationType, locationPrompt,
parentLocationName, parentLocationDescription, locationPath and relevant genre/style/
image-instruction variables. Recheck the actual provider route and resolved preview
before editing. Adding parent context can accidentally cause every room image to show
the whole parent landmark. External supplied plates do not rerun this template.

Treat syntax failure, truncated output and unavailable connection as different diagnoses.
Inspect the actual response/stop reason, repair path and output budget; do not recommend
raising tokens for every parse failure. Never make paid retry batches without user scope.
