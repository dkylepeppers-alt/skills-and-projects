# Art direction and asset production

Contents: roles · brief · inventory · style bible · prompts · production · review · binding · budgets.

## Separate the two native roles

| Role | Author on | Intended job |
| --- | --- | --- |
| Reference plate | Each scene location: referenceImageId + useReferenceImage | Establish stable visual identity for eligible image generation |
| Child-map background | Parent: mapBackgroundImageId + mapBackgroundPosition, childPresentation map | Canvas under the parent's child markers |

A location can have both, either, or neither. One image can be assigned to both roles,
but a useful eye-level bedroom plate is usually a poor floor-plan canvas. Backgrounds
are not automatically sent as illustration references. A disabled reference can still
be stored/displayed; turning it off is not deleting the art.

There is no generic album, animated scene player or attachment slot in the native map
contract. Variants, concept sheets, audio and source masters remain companion assets
unless a current consumer proves additional support.

## Art brief before a large batch

Establish the user's desired medium, realism, visual influences, tone, aspect/dimensions,
coverage, tolerances for people/text, and budget. Use their existing artwork as reference
when supplied. Do not make expensive bulk-generation commitments from a location count
alone: backgrounds, remakes and shared roles change the asset total.

Distinguish three deliverables:

- Scene plates: recognizability, reusable camera coverage and stable landmarks.
- Navigational canvases: intelligible spatial layout and marker placement.
- Authoring masters: editable/layered sources, prompts, provenance, variants and licenses.

Use the available image-generation/editing tool for requested raster creation or edits.
Load its applicable skill when executing that work. Inspect a referenced local image
before editing it. Do not replace requested art with programmatic drawing or rename a
file to pretend it was transformed. For exact floor geometry, use an authored plan,
vector/diagram source or explicit manual layout; a generated illustration is not a survey.

## Inventory every location, not just the interesting rooms

Run scripts/art-inventory.mjs on the definition. Include roots, regions, settlements,
places, buildings, ALL floors and ALL rooms, archived nodes marked separately.
For each ID, decide reference required/optional/intentionally none. For map parents,
decide background coverage separately. A layers floor may need a reference while
not needing a child-map background; “floor has no background” is not automatically a gap.

Use assets/art-plan.example.json as the companion planning shape. Keep role decisions,
camera, prompt, source path, revision, generation status, review and bindings together.
It is an authoring manifest, not a native envelope field.

Report coverage in distinct categories:

1. No assignment.
2. Assigned source key but no embedded image (external dependency).
3. Embedded image matched by key (binding coverage).
4. Decoded and visually reviewed image (asset quality).
5. Restored/displayed in the target app (runtime evidence).

Do not collapse these into “has an image.” A filename in a ZIP or an unchecked UUID
does not prove that the map can display it.

## Lock a small style bible

Choose reusable constraints, with branch-specific variations:

- Medium/rendering: photographic, painterly, illustrated plan, miniature, etc.
- Architecture grammar: construction era, repeated arches/door frames, proportions,
  roof language, repairs and modern adaptations.
- Materials and palette: a small recurring set plus local accents.
- Light logic: season/weather/exterior time; plausible interior sources and falloff.
- Camera grammar: lens/perspective families by role, human scale, horizon and orientation.
- Occupancy: normally empty reusable plates; intentional exceptions noted explicitly.
- Invariants: building silhouette, door/window placement, adjacent landmarks and
  signature features that must persist between related images.
- Exclusions: accidental people/silhouettes/reflections, unwanted text/logos, modern
  clutter, oversized parent landmarks appearing inside child interiors.
- Technical target: aspect family, output dimensions, file format and crop-safe areas.

Do not prescribe one universal aspect ratio. Match the destination surface and intended
reuse; portrait suits some shafts, landscape suits many rooms, square may suit a card.
Check how the app crops it. A background must support the actual marker layout.

For a Nevermore-like academy, distinguish shared stone/metal/wood language from
node-specific identity. Black/pink halves, tide-glass accents or soot-dark work surfaces
can differentiate siblings while architecture and light remain coherent.

## Prompt cameras, not lore paragraphs

A scene prompt should answer: where is the camera, what dominates the frame, what is
unique here, how is it lit, what must remain unchanged, and what must not appear?

Template:

“[Medium and continuity reference]. [Location ID/name for tracking outside the rendered
image]. Camera [viewpoint, height, lens/perspective], framing [foreground/midground/
background]. Show [dominant geometry] with [two or three signature materials/landmarks].
[Light source/direction and restrained palette]. Preserve [invariants]. [Occupancy
policy]. [Text/logo/exclusion policy]. Compose for [aspect and crop constraints].”

Do not ask the image to render the tracking ID. Avoid lists of abstract history,
every lorebook fact, conflicting times of day, and meaningless “8K masterpiece” padding.
Use relationship/reference images where supported instead of re-inventing architecture
through increasingly elaborate descriptions.

Example room plate:
> Gothic photographic interior, eye-level from the doorway with a restrained wide
> lens. Two dormitory alcoves share a tall stone window: one charcoal and iron, the
> other rose textiles and warm wood. Keep the window geometry and central aisle
> consistent with the approved room reference. Soft overcast daylight, subdued
> contrast. Empty reusable environment, no people or reflections of people, no text.

Example floor plate:
> Establishing view of the upper-floor landing, camera at the stair arrival. Repeated
> pointed oak doorways recede along pale worn stone; a brass bell bracket distinguishes
> this landing from the lower floor. Same masonry and cool window light as the approved
> building set. Keep the landing generous enough for a conversation. No figures, no text.

Example navigational canvas:
> Illustrated top-down campus overview using the supplied exact layout as geometry.
> Preserve north, shoreline, building footprints and road connections. Low-detail
> vegetation between landmarks, restrained contrast under marker zones, no baked-in
> labels or pins. Do not add buildings, roads or doors.

The last prompt is art direction, not a guarantee of geometric fidelity. Compare the
result to the source plan; use the source plan directly where exactness is required.

## Produce in controlled sets

1. Approve representative anchors: one exterior, one interior, one floor/wrapper and
   one actual navigation canvas. Refine the style bible before expanding.
2. Generate related siblings together using the approved anchors. Keep intentional
   differences visible; do not give every sibling identical furniture and lighting.
3. Inspect each output immediately. Record prompt, actual provider/model if known,
   source references, dimensions, revision and review status. Never fabricate a seed
   or model identifier for an externally supplied image.
4. Bind approved output to location ID and role as it lands. A batch is not complete
   until the inventory reflects it.
5. Prefer targeted edits for correct composition with one defect; regenerate for
   wrong geometry or viewpoint. Maintain source masters and reversible revisions.
6. Recheck the full inventory after every structural addition, including bathrooms,
   landings, basement levels, wrapper nodes and background roles.
7. Review the family at thumbnail size and important assets full-size; a set can
   be inconsistent even when every individual image looks attractive.

For reusable plates, empty/no-text is a good DEFAULT: baked-in characters can recur as
unwanted cast and illegible text competes with UI labels. It is not a creative law.
Permit intentional population, readable signage, time-specific variants or weather
when the user wants them; track which variant is active.

## Visual acceptance checks

Check composition, scale, real entrances, duplicated doors/windows, implausible stairs,
accidental silhouettes/reflections, structural warping, text, viewpoint, repeated room
identity and continuity across adjacent spaces. Compare sibling pairs: could their
plates swap unnoticed? Compare parent/child landmarks without forcing the entire
parent building into every room image.

For backgrounds, test marker positions against approved geography, labels against
busy texture and screen crops against important landmarks. Hand-place child coordinates
after art is approved. Avoid regenerating a canvas under fixed markers without rechecking
every position. Keep the precise layout as source so later restyling cannot redefine routes.

## Binding and packaging

Use a real local image file, not just its name. The builder maps
art/reference/<location-id>.* and art/background/<location-id>.* to roles.
It creates a source key such as global-gallery:academy-pack:reference:west-dorm and
puts matching image bytes in artwork[].data as a supported base64 data URL.

That string is NOT a real destination Gallery UUID, a filename lookup or a data URI.
The importer uploads/reuses the asset, gets an actual destination ID and remaps
references. Invented source keys are useful only when matching payloads travel with them.
Library imports restore referenced art globally. Workspace imports distinguish global
source keys from chat-scoped ones; prefer bundled global-prefixed keys for portable packs.

Supported bundled MIME prefixes: image/jpeg, image/png, image/gif, image/webp, image/avif.
Parser acceptance is only the first stage. Bad base64, invalid image bytes, upload limits
or storage failures can still prevent restoration; a success toast may include failures.
Do not infer animation support just because GIF passes the MIME check.

Keep companion manifests, source images and exact prompts. Embedded prompt/provider/model
metadata records provenance; it does not rerun generation when importing the map.
Data URLs enlarge binary data by roughly one third before JSON overhead. Use appropriate
dimensions/compression and avoid shipping unused duplicates, but do not destroy source masters.

## Reference budgets and final verification

Only the current location's enabled eligible reference consumes a slot for that image
request; enabling references on 73 nodes does not consume 73 simultaneous slots.
Location imagery shares a backend/pipeline reference budget with characters/personas.
Trace current callers and backend/model limits; avoid freezing a stale universal matrix.
Even a location-only slot may be unavailable if the provider cannot use references.

For handoff, report bound roles, deliberate gaps, external dependencies and visual/runtime
QA separately. Import into a disposable target chat, inspect restoration warnings,
verify display and prompt/reference diagnostics, then re-export and compare remapped
bindings. If no target app was exercised, say so plainly.
