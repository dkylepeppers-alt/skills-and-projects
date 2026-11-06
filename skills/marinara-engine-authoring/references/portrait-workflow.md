# Marinara photorealistic portrait workflow and reusable template

Version 1.0 production defaults | Import/export contract checked Engine v2.5.2, 2026-11-06

## 1. Recommended result

Create **one character identity sheet, 16 facial-expression portraits, and 16 matching full-body portraits**, using one approved neutral portrait and one approved neutral full-body design as the permanent references. Generate each image independently from those references, inspect the results together, and package the accepted PNGs inside a native character export when a single uploadable file is required. The identity sheet provides a portable multi-view reference and travels as a selected gallery image; the 32 expression images travel as sprites.

Assumption: these are character sprites for Marinara's Facial Expressions and Full-body categories, intended for use during roleplay. The character card and identity references will be supplied when this workflow is executed. This document is the reusable production guide; it is not itself a Marinara-importable portrait asset.

The production defaults below are recommendations, not app requirements. The file structure and import behavior in section 8 were checked against Engine source at commit `fc0333c3fe978cda5e0b919bd6faec985901704e`.

## 2. Production brief: fill in once

```yaml
project:
  character_name: "[NAME]"
  release: "v1"
  source_character_file: "[EXISTING NATIVE CHARACTER EXPORT]"
  deliverable: "native character JSON with embedded sprites and selected identity sheet"

references:
  identity: "[APPROVED FACE / CHARACTER REFERENCE]"
  neutral_portrait: "[APPROVED NEUTRAL PORTRAIT, ONCE CREATED]"
  neutral_full_body: "[APPROVED FULL-BODY DESIGN, ONCE CREATED]"
  identity_sheet: "[APPROVED THREE-VIEW IDENTITY SHEET, ONCE CREATED]"
  wardrobe: "[OPTIONAL CLOTHING REFERENCE]"

design:
  rendering: "photorealistic studio photography"
  outfit: "[SPECIFY ONLY WHAT THE REFERENCES DO NOT ESTABLISH]"
  unseen_body_details: "[AUTHOR-SUPPLIED DETAILS FOR AREAS NOT SHOWN]"
  expression_strength: "clearly readable, physically plausible, character-specific"
  gaze: "toward camera unless an expression explicitly needs otherwise"
  background_delivery: "real transparent alpha for sprites; neutral solid background for identity sheet"
  light: "large soft frontal key slightly above eye level, gentle fill"

portrait:
  framing: "top of hair through upper chest; complete hair and shoulders"
  aspect_ratio: "1:1"
  delivery_pixels: "1024 x 1024"
  alignment: "fixed head scale, eye line, crop, and shoulder position"

full_body:
  framing: "complete head-to-toe figure; all hair, hands, and footwear visible"
  aspect_ratio: "2:3"
  delivery_pixels: "1024 x 1536"
  pose: "front-facing relaxed standing; arms resting naturally beside torso"
  alignment: "fixed body scale, centerline, head height, and foot baseline"

identity_sheet:
  filename: "character_identity_sheet.png"
  views_left_to_right: "three-quarter-front, three-quarter-rear, direct-rear"
  framing: "three complete head-to-toe views of the same person at identical scale"
  aspect_ratio: "2:1"
  delivery_pixels: "3072 x 1536"
  background: "solid warm gray #A99D90"
  packaging: "gallery image selected as character sheet"

expressions:
  - neutral
  - happy
  - sad
  - angry
  - surprised
  - embarrassed
  - thinking
  - laughing
  - worried
  - scared
  - disgusted
  - love
  - smirk
  - crying
  - determined
  - hurt
```

These YAML fields are production notes, not Marinara schema fields. Use the image provider's supported output controls for actual dimensions. If the provider cannot produce the requested canvas directly, preserve the intended framing and finish onto the target canvas afterward. Do not stretch the figure to fit.

If the only identity reference is a headshot, it does not establish unseen body proportions, wardrobe, or footwear. Resolve those from the supplied character specification or mark the initial full-body design as provisional for review. Do not claim unseen anatomy has been faithfully preserved.

## 3. Reference and continuity rules

1. **Keep identity in the images.** Do not repeat the character's face shape, eye color, hair color, figure, or other visible stable features in every reference-driven prompt. Assign each image its job and describe the requested expression or composition.
2. **Create two permanent neutral masters.** The portrait master controls face identity and portrait framing. The body master controls the approved physique, outfit, footwear, stance, and full-body framing.
3. **Generate siblings from masters.** Generate every expression from the approved neutral portrait. Generate every full-body expression from the approved body master plus its accepted matching facial portrait. Never make each new expression from the last generated expression.
4. **Keep the same production settings.** Record provider, model/version when available, actual dimensions, seed if supported, reference order, prompt, and output filename. A repeated seed alone does not guarantee identity or framing consistency.
5. **Keep expression separate from pose.** The core full-body set retains one standing pose. Emotional readability comes from the face and restrained tension, not a new camera angle or dramatic gesture for every image.
6. **Preserve the rendering treatment.** Use one consistent light direction, white balance, contrast, skin texture treatment, and sharpness. Avoid unrelated cinematic lighting changes between expressions.
7. **One character, one image per render.** Individual renders give each face the available detail and allow rejection without rerendering an entire sheet. Expression contact sheets are for review, not sprite upload. The identity sheet is a separate reference deliverable assembled from approved views or generated with the explicit three-view contract below.

## 4. Generation sequence and prompt templates

Bracketed fields are replaced before sending a prompt. Attach the actual reference images; filenames in prompt text do not make images available to a generator. The output filename is metadata and must not appear as text inside the image.

### Stage A: neutral portrait master

Use the supplied identity reference. If its existing portrait framing is already suitable, preserve that framing instead of unnecessarily rebuilding it.

```text
Create one photorealistic studio portrait of the exact person in the attached identity reference. The reference controls recognizable identity and all visible stable appearance. Establish the following portrait framing and neutral expression while retaining the reference's established wardrobe unless the supplied wardrobe specification explicitly replaces it.

Front-facing portrait, head upright, shoulders level and relaxed, eyes looking into the camera. Frame from above the complete hair silhouette through the upper chest, with both shoulders legible. Neutral expression: resting brows, comfortably open eyes, relaxed cheeks, lips gently meeting, and an unstrained jaw.

Eye-level portrait perspective with minimal perspective distortion. Large soft frontal key slightly above eye level and gentle fill; natural skin color, fine skin texture, coherent individual hair strands, realistic eyes, and ordinary photographic contrast. Keep the face sharply resolved without smoothing the skin into plastic or sharpening pores into grit.

One isolated person, clean separation around the silhouette, no text or decorative frame. [BACKGROUND INSTRUCTION]

Output: square 1:1 composition; target delivery 1024 x 1024 pixels.
```

Save the approved finished result as `neutral.png`. Retain its original generated file separately as a source master.

### Stage B: facial-expression portraits

Attach the approved neutral portrait as the identity and source-frame reference. Use the same prompt for every label, replacing only the expression paragraph.

```text
Use the attached approved neutral portrait as the authority for the exact person's identity, wardrobe, lighting, camera, head scale, and framing. Change only the facial expression to the final state described below; retain the established head orientation and shoulder position except for any explicitly specified minimal expression-related movement.

Expression: [EXPRESSION RECIPE FROM SECTION 5]

Produce one photorealistic portrait with natural facial muscle movement, coherent eyelids and pupils, realistic lips and any visible teeth, and preserved individual facial asymmetry. Maintain the master's photographic texture, color, light direction, subject position, and upper-chest crop. The emotion must remain readable when the image is reduced to a small portrait.

[BACKGROUND INSTRUCTION]

Output: square 1:1 composition; target delivery 1024 x 1024 pixels.
```

Save each accepted image using the exact expression label, such as `happy.png` or `thinking.png`.

### Stage C: neutral full-body master

Attach the identity reference or neutral portrait. Attach a body reference when available, and a separate wardrobe reference only when it adds necessary information. Explain those roles explicitly.

```text
Reference roles:
- Image 1 establishes the exact person's facial identity and visible stable appearance.
- [OPTIONAL IMAGE 2 establishes approved body proportions.]
- [OPTIONAL IMAGE 3 establishes wardrobe and footwear only.]

Create one photorealistic full-body studio photograph of this exact person. Establish a complete head-to-toe composition using the assigned references and the following information for areas they do not show: [AUTHOR-SUPPLIED UNSEEN BODY, WARDROBE, AND FOOTWEAR DETAILS; OMIT IF FULLY COVERED].

The person stands facing the camera, head upright, shoulders level, weight balanced comfortably over both feet. Arms rest beside the torso with slight natural elbow bends; hands relaxed and entirely visible. Feet rest on the same implied level ground. Neutral facial expression, eyes toward the camera.

Show the entire hair silhouette, body, fingers, and footwear inside the frame. Leave modest clear margin above the hair, beside the outermost silhouette, and beneath the soles. Keep the figure centered, with natural proportions and a level camera positioned around mid-torso height at sufficient distance to avoid an enlarged head or feet.

Large soft frontal light and gentle fill, consistent with the portrait master. Natural skin and fabric texture, physically plausible anatomy, garment drape, and photographic detail throughout the figure. One isolated person with a clean silhouette. [BACKGROUND INSTRUCTION]

Output: vertical 2:3 composition; target delivery 1024 x 1536 pixels.
```

Save the approved result as `full_neutral.png`. Inspect the face at full size before accepting the body master: a convincing outfit does not compensate for a different face.

### Stage C1: character identity sheet

Produce the sheet after accepting the neutral portrait and neutral full-body master, before accepting the complete production package. It records the approved design from multiple viewpoints. Continue using the individual neutral masters for tightly controlled expression generation; the sheet supplies supporting identity, wardrobe, and rear-view continuity rather than replacing the matching expression portrait.

**Default layout:** exactly three complete figures on one landscape canvas, ordered left to right as follows. Each figure represents the same person photographed from a different viewpoint.

| Position | View | Required visibility |
|---|---|---|
| Left | Three-quarter-front, approximately 45 degrees | Recognizable face, front and side garment construction, complete head-to-toe silhouette |
| Center | Three-quarter-rear, approximately 135 degrees | Back and near side, rear hair arrangement, side-to-back garment continuity, complete footwear |
| Right | Direct-rear, 180 degrees | Back of head, shoulders, torso, clothing closures and seams where established, both legs and footwear |

Use the same neutral standing stance, outfit, accessories, lighting treatment, body scale, head height, and foot baseline across all three views. The head follows the torso orientation: a rear view must not turn its face toward the camera. Preserve anatomical left/right placement of asymmetrical features; do not create a rear view by horizontally mirroring a front image.

The neutral portrait already supplies the high-detail frontal face reference. Keep it as a separate original image instead of shrinking it into an inset on this sheet. Do not add labels, grids, decorative borders, scenery, extra poses, or expression thumbnails to the image. Record view names in the production ledger.

**Preferred production method:** generate each viewpoint independently from the same approved neutral body master and identity reference, then assemble the accepted images into one sheet without generative repainting. Use uniform scaling and translation for placement. This lets you reject one inconsistent rear view without disturbing accepted views. Retain the individual source images for future reference use.

For each viewpoint, use this prompt with the appropriate view clause:

```text
Image 1 establishes the exact person's facial identity. Image 2 establishes the approved body proportions, hair, outfit, footwear, accessories, and photographic treatment. Create one neutral full-body reference photograph of the same person from [VIEW CLAUSE]. The assigned references control stable appearance; only the viewing direction and necessary view-dependent perspective change.

View: [THREE-QUARTER-FRONT AT APPROXIMATELY 45 DEGREES / THREE-QUARTER-REAR AT APPROXIMATELY 135 DEGREES / DIRECT-REAR AT 180 DEGREES]. The head follows the body's orientation. Maintain a relaxed upright standing pose with balanced weight, arms resting naturally beside the torso, hands visible, and the complete figure inside the frame from above the hair through below the soles.

For surfaces not established by the references, use only these approved design details: [REAR HAIR, GARMENT BACK, CLOSURES, MARKINGS, AND ACCESSORY DETAILS; OMIT WHEN ALREADY ESTABLISHED]. Preserve anatomical left/right placement and physically continuous garment construction.

Neutral studio reference photography, near-orthographic appearance produced by sufficient camera distance and minimal perspective distortion. Level camera, consistent soft studio illumination, natural color, realistic skin and fabric, sharply resolved photographic detail. Solid warm gray #A99D90 seamless background. One complete figure, no text, labels, inset images, or decorative elements.

Output: vertical 2:3 source image; target 1024 x 1536 pixels. Leave consistent margins for assembly.
```

If direct sheet generation is preferred, attach the same approved identity and body references and use this complete sheet prompt:

```text
Create a photorealistic character identity reference sheet of the exact person established by the attached identity and approved full-body references. Preserve their established stable appearance, body proportions, hair, wardrobe, footwear, accessories, and photographic treatment across every view.

Exactly three full-body views of this one person, arranged evenly from left to right: three-quarter-front at approximately 45 degrees, three-quarter-rear at approximately 135 degrees, and direct-rear at 180 degrees. Every figure is completely visible head-to-toe at identical scale, with aligned head heights and foot baselines, ample separation, and no overlap. Each maintains the same relaxed neutral standing stance; the head follows the torso's viewing direction. Preserve anatomical left/right placement of all asymmetrical details.

[APPROVED DETAILS FOR PREVIOUSLY UNSEEN REAR SURFACES, IF NEEDED.]

Near-orthographic studio reference photography with minimal perspective distortion, consistent soft illumination, natural color, realistic skin, coherent hair, accurate anatomy, and believable fabric construction. Solid warm gray #A99D90 seamless background. No text, labels, grid lines, inset portraits, props, scenery, or additional figures.

Output: landscape 2:1 composition; target delivery 3072 x 1536 pixels.
```

The identity sheet uses an opaque neutral background because its job is reference inspection. The transparent-background instructions for sprite overlays do not apply to this deliverable. The dimensions and layout are production defaults, not a special Marinara file-format requirement.

Do not assume a front reference establishes rear hair, back closures, hidden markings, or the back of an outfit. Use supplied specifications or review a provisional design for those areas before accepting the sheet. If the sheet conflicts with the neutral master, repair the inconsistent view rather than silently redefining the character.

Save the accepted composite as `character_identity_sheet.png`. Keep the individual view masters outside the sprite-upload folders. When using the sheet for a subsequent single-image render, explicitly assign it identity/design authority only and request exactly one person in one view so its multi-view layout does not become the output composition.

### Stage D: matching full-body expressions

For each label, attach Image 1 = approved neutral full-body master and Image 2 = accepted matching portrait. The matching portrait contributes face identity and expression; its crop must not override the body composition.

```text
Image 1 controls the approved full-body design: body proportions, wardrobe, footwear, accessories, standing pose, camera, lighting, subject scale, and head-to-toe framing. Image 2 controls the same person's facial identity and the target facial expression only.

Produce one photorealistic full-body image with Image 1's complete composition and the following facial state, matching Image 2: [EXPRESSION RECIPE]. Keep the same relaxed standing stance, hand positions, head orientation, centerline, head height, and foot baseline. Facial expression is the only intentional variation in this matched set.

Resolve the face as a natural part of the photographed body, with consistent skin color, light, perspective, and detail. Preserve the full hair silhouette, both hands, and complete footwear inside the canvas. Maintain realistic anatomy, fabric texture, and the approved photographic rendering treatment.

[BACKGROUND INSTRUCTION]

Output: vertical 2:3 composition; target delivery 1024 x 1536 pixels.
```

Save as `full_happy.png`, `full_thinking.png`, and so on. If the body render loses facial detail, perform a localized face correction using the matching portrait while holding the rest of the body image fixed, then inspect the boundary for changes in light or skin texture.

## 5. Expression recipes and exact filenames

These 16 labels match the character editor's suggested expression set in the checked source and remain this workflow's production default. The shared avatar mapping also recognizes `blushing`; it is optional for this static set. The descriptions below are authored generation directions. They are not medical claims or exact muscle-action classifications.

| Label | Facial direction | Portrait file | Full-body file |
|---|---|---|---|
| neutral | Resting brows, comfortably open eyes, relaxed cheeks, lips gently meeting, unstrained jaw. | `neutral.png` | `full_neutral.png` |
| happy | Mouth corners lifted into a warm smile, cheeks gently raised, slight narrowing beneath the eyes; relaxed brows. | `happy.png` | `full_happy.png` |
| sad | Inner brows lifted slightly, upper eyelids heavy, mouth corners lowered gently, lips loosely closed; subdued sorrow without tears. | `sad.png` | `full_sad.png` |
| angry | Brows lowered and drawn together, firm focused gaze, lips pressed together, controlled jaw tension; restrained anger without a shout. | `angry.png` | `full_angry.png` |
| surprised | Brows lifted, eyes widened naturally, jaw slightly dropped, lips parted; sudden surprise without panic. | `surprised.png` | `full_surprised.png` |
| embarrassed | Inner brows lifted slightly, eyes subtly averted while head remains upright, lips held in a small self-conscious smile; restrained natural cheek flush. | `embarrassed.png` | `full_embarrassed.png` |
| thinking | Slight asymmetry between brows, focused eyes just off the lens, lips softly pressed; concentrated consideration without touching the face. | `thinking.png` | `full_thinking.png` |
| laughing | Cheeks visibly raised, eyes narrowed by genuine amusement, mouth open in a natural laugh with coherent teeth and jaw; head remains upright. | `laughing.png` | `full_laughing.png` |
| worried | Inner brows raised and drawn together, attentive tense eyes, lightly compressed lips; uncertainty and concern without terror. | `worried.png` | `full_worried.png` |
| scared | Brows raised and pulled inward, widened eyes with tense lower lids, parted lips drawn slightly sideways, rigid jaw; clearly fearful. | `scared.png` | `full_scared.png` |
| disgusted | Nose subtly wrinkled, upper lip raised, narrowed eyes and lowered brows; visible aversion without distorting the face into a caricature. | `disgusted.png` | `full_disgusted.png` |
| love | Soft attentive gaze, relaxed brows, gently raised cheeks, small affectionate smile; intimate warmth without graphic symbols or exaggerated blush. | `love.png` | `full_love.png` |
| smirk | One mouth corner lifted, slight corresponding cheek tension, one brow subtly raised, steady knowing eye contact. | `smirk.png` | `full_smirk.png` |
| crying | Inner brows lifted and drawn together, wet lower eyelids, a few plausible tear tracks, strained mouth with a slight lower-lip tremble; no flowing waterfall effect. | `crying.png` | `full_crying.png` |
| determined | Brows slightly lowered, unwavering focused gaze, mouth closed firmly without compression, jaw set; purposeful resolve rather than anger. | `determined.png` | `full_determined.png` |
| hurt | Brows drawn together and lifted centrally, eyes partly tightened, lips parted in a restrained wince; discomfort without inventing wounds, bruises, or damaged clothing. | `hurt.png` | `full_hurt.png` |

Adapt intensity to the character's established personality while preserving clear distinctions. In particular, keep happy/laughing, sad/crying, worried/scared, and angry/determined visibly different.

Additional labels such as `flirty`, `confused`, `bored`, or `skeptical` can be added as custom expressions. Keep the default set intact first. A custom filename makes an asset available; it does not guarantee the current agent will request that label in the situations you intend.

## 6. Background, framing, and finishing

### Choose one background instruction

**When the generator supports actual transparent output:**

```text
Transparent background with genuine alpha outside the subject. Preserve fine hair edges and natural partially transparent edge pixels. No visible backdrop, floor plane, checkerboard pattern, or detached cast shadow.
```

**When generating against a matte for later removal:**

```text
Uniform flat [MATTE COLOR] background selected to contrast with the subject's hair and clothing. Even background color, clean silhouette separation, no background texture, gradient, props, or strong color spill onto the subject.
```

The second route produces an intermediate image. Remove the matte and save real RGBA PNGs before packaging. A picture of a checkerboard is not transparency. Preserve soft hair edges and legitimate transparent materials; do not erase similar colors within the subject.

### Finish every set consistently

1. Keep original renders untouched in a source folder.
2. Inspect and repair generation defects before reducing resolution.
3. Remove the background when needed and inspect edges against both light and dark backdrops.
4. Align facial portraits to the same eye line and head scale. Align full-body portraits to the same head height and foot baseline. Translate and uniformly scale; do not warp anatomy to force alignment.
5. Use a common canvas within each category. Avoid separate tight auto-crops that make the figure jump in size during expression changes.
6. Save genuine PNG files, preferably in sRGB, with alpha where the image should be transparent.
7. Compare the whole set at expected phone display size. Review at full size for defects and at small size for emotion readability.

For unusually wide hair, outfits, or poses, expand the shared canvas or choose a wider common ratio. Keeping the entire silhouette is more useful than rigidly enforcing 2:3.

## 7. Asset acceptance checklist

- [ ] The identity sheet contains exactly the three specified views of the same person, with complete silhouettes and consistent scale.
- [ ] Rear hair, clothing construction, footwear, markings, and anatomical left/right details agree across sheet views and the approved masters.
- [ ] The identity sheet is legible, free of accidental extra figures, and saved separately from the expression sprites.
- [ ] Every image depicts the same recognizable individual at the same apparent age.
- [ ] Expression changes do not redesign the nose, jaw, eye spacing, hairline, or stable marks.
- [ ] Portrait crops, head scale, light direction, and color treatment agree across the set.
- [ ] Full-body proportions, garment construction, accessories, footwear, and pose agree across the set.
- [ ] Every full-body image includes all hair, fingers, and footwear.
- [ ] Teeth, pupils, eyelids, hands, garment edges, and jewelry are coherent.
- [ ] Each expression is identifiable at small display size and distinct from its closest neighbor.
- [ ] Transparent areas contain actual alpha; no checkerboard or matte residue is baked in.
- [ ] Hair and clothing edges work against both bright and dark backgrounds.
- [ ] All filenames are unique, lowercase, and match the intended labels exactly.
- [ ] Each expression has its matching `full_` counterpart, including both neutral images.

Track acceptance in a simple ledger:

| Label | Portrait accepted | Body accepted | Identity checked | Alpha checked | Import checked | Notes |
|---|---|---|---|---|---|---|
| neutral | | | | | | |
| happy | | | | | | |

Expand the ledger to include every selected label. Generation completion is not acceptance.

## 8. Packaging and upload

### Animated avatar boundary

The expression package below contains static sprites. The **2D Avatars** agent can reuse them as a PNGTuber setup, with optional `_talk`, `_blink`, and `_blink_talk` variants. It uses portraits whenever any are present, otherwise full-body sprites. Since 2.5.2 sprites alone do not show as an avatar until **Show this avatar in chats** is on for that owner. Read `avatars.md` for all accepted suffixes, face mappings, `.save` / `.mavatar` / `.vrm` / `.vrma` / MMD / GLB / FBX imports, settings and validation. Keep this workflow's 16+16 art defaults unless the user requests an animated-avatar set.

Native character export embeds sprites and static profile pictures, **not** the separate `avatar-models` files or their `avatar.json` settings. Profile export/backup includes those files. Deliver avatar models separately with setup instructions when transferring only a character.

### Recommended single-file deliverable

Deliver `[character-slug]-portraits-v1.marinara.json`: an existing native character export with the accepted expression images embedded in its **outer `data.sprites` array** and the identity sheet embedded in **outer `data.gallery`** as the selected character sheet.

The actual structure is:

```json
{
  "type": "marinara_character",
  "version": 1,
  "exportedAt": "[ACTUAL ISO TIMESTAMP]",
  "data": {
    "spec": "chara_card_v2",
    "spec_version": "2.0",
    "data": {
      "name": "[EXISTING CHARACTER NAME]"
    },
    "sprites": [
      {
        "filename": "neutral.png",
        "data": "data:image/png;base64,[ACTUAL ENCODED PNG BYTES]"
      },
      {
        "filename": "full_neutral.png",
        "data": "data:image/png;base64,[ACTUAL ENCODED PNG BYTES]"
      }
    ]
  }
}
```

**This is a structural illustration, not an import-ready file.** The bracketed strings must be replaced, and the abbreviated inner character object must be the complete original character data. Do not replace a real card with this example's name-only object.

Packing procedure:

1. Read the supplied native export and confirm `type: "marinara_character"` and `version: 1`.
2. Preserve the entire envelope, character text, extensions, embedded lore, avatar, gallery, and metadata. Do not rewrite the personality or preset-related fields as part of an art task.
3. Read each accepted PNG as bytes and base64-encode the actual file. Use `{ "filename": "happy.png", "data": "data:image/png;base64,..." }` for each entry.
4. Merge into `data.sprites` by exact filename. Replace deliberately regenerated assets with the same name; preserve unrelated sprites. Check case and extension collisions instead of silently creating duplicate labels.
5. Keep `sprites` beside the nested character `data`, not inside it or under `extensions`. Do not use invented fields such as `portraits`, `fullBodyPortraits`, or image URLs pointing to a local folder.
6. Update `exportedAt` to the actual packaging time, leaving the source card's historical metadata intact.
7. Parse the finished JSON. Decode every embedded image and verify its bytes match the corresponding accepted PNG. Check signatures and image readability, not just the filename extension.
8. Import through Marinara's character import flow and inspect the resulting character's sprite categories.

**Import behavior:** the checked native character importer creates a character record. Treat importing the assembled file as creating a new character copy, not as an automatic update or merge into an existing character. To add sprites to an existing character in place, use the image-upload route below. After upload, a native export from that character provides the single portable file with the app's own packaging.

### Include the identity sheet in the same native file

The checked exporter places the selected sheet in `data.gallery` and marks that image with `isCharacterSheet: true`. Its reference-use setting is `data.data.extensions.useCharacterSheetAsReference`. The importer restores the gallery image, creates its new local ID, and binds that ID to the character. Do not invent or carry over a database-specific `characterSheetImageId` when assembling a portable export.

Add or merge this gallery entry, using the actual PNG bytes, actual dimensions, and actual generation metadata:

```json
{
  "filename": "character_identity_sheet.png",
  "data": "data:image/png;base64,[ACTUAL ENCODED IDENTITY-SHEET PNG BYTES]",
  "prompt": "[ACTUAL GENERATION PROMPT OR ASSEMBLY PROVENANCE]",
  "provider": "[ACTUAL PROVIDER, OR EMPTY STRING IF UNKNOWN]",
  "model": "[ACTUAL MODEL, OR EMPTY STRING IF UNKNOWN]",
  "width": 3072,
  "height": 1536,
  "isCharacterSheet": true
}
```

This is an entry template, not a standalone import envelope. Replace all placeholders; use the actual finished image width and height rather than copying the example dimensions blindly. For a sheet assembled from multiple renders, record that assembly honestly and keep detailed per-view provenance in the ledger.

1. Preserve existing gallery entries and unrelated character extensions. Merge the accepted identity sheet into `data.gallery` deliberately, avoiding unintended filename collisions.
2. Mark only the intended selected sheet with `isCharacterSheet: true`. If an older sheet is retained in the gallery, remove its selection marker rather than deleting its image. The checked importer takes the last successfully restored marked image, so multiple marked sheets are ambiguous production input.
3. Set `data.data.extensions.useCharacterSheetAsReference` to `true` for this package's intended reference use. Preserve an explicitly requested disabled setting as `false`. Remove a stale `characterSheetImageId` from the portable extension object; the importer assigns the restored image's real ID.
4. Decode and verify the sheet's embedded bytes against the accepted PNG, along with the sprite checks. The sheet is a gallery asset and is not counted among the 32 sprites. Its encoded bytes still increase the complete character file's size.
5. After import, verify that the Character Sheet preview displays the correct image and that its reference switch has the intended state. Re-export natively and confirm the selected gallery entry retains `isCharacterSheet: true`.

### Image folders for updating an existing character

| Folder | Contents | Upload destination |
|---|---|---|
| `upload/facial/` | `neutral.png`, `happy.png`, and the other facial PNGs | Character editor → Sprites → Facial Expressions → Add sprites → Upload images (select all files in the folder) → Import |
| `upload/full-body/` | `full_neutral.png`, `full_happy.png`, and the other full-body PNGs | Character editor → Sprites → Full-body → Add sprites → Upload images (select all files in the folder) → Import |
| `upload/identity/` | `character_identity_sheet.png` | Character editor → Character Sheet section → upload the individual image; enable its reference switch |
| `source/` | Original renders and reference masters | Keep outside the upload selection |
| `review/` | Contact sheets, prompts, production brief, and checks | Keep outside the upload selection |

The Full-body tab adds `full_` when needed. The Facial Expressions tab removes that prefix during label normalization. **Do not upload both categories together through the Facial Expressions tab:** body images can be relabeled as facial images and replace matching labels. Select each category's own files.

Engine 2.5.2 removed the character Sprites tab's **Upload Folder** button (#8851): **Upload images** takes a multi-file selection, imports them outside any folder, and does not scan subfolders; use **New folder** afterward if wanted. Sprite folders now exist and travel in native exports. The persona editor still has **Upload Folder**, which turns subfolders into sprite folders. Sprite ZIP export is not an upload format; extract a distributed ZIP before selecting its files. Sprite labels may also carry outfit/condition facets after the mood (`happy_pajamas`), with word-by-word fallback (`characters-personas.md`).

Upload the identity sheet through the Character Sheet section's dedicated image control. In the checked editor, that upload stores it in the character gallery and selects it as the sheet; the reference-use switch is a separate setting. Save the character changes and verify the selection. Do not place `character_identity_sheet.png` inside either sprite-upload folder, where its filename would instead become an expression label.

### Verified embedded-sprite limits

The checked native importer allows at most **256 embedded sprites**, at most **10 MiB of decoded bytes per sprite**, and at most **32 MiB of decoded bytes across the embedded sprite collection**. The total character file is larger because base64 adds approximately one-third to binary size, plus the remaining character content. These are the sprite restoration checks, not a promise that every deployment accepts a JSON file of any particular total size.

If the collection exceeds the checked limits, the importer can skip restoring the collection. A successfully created character therefore does not prove its images imported successfully. Resize or optimize the delivery images as needed while retaining original masters. Do not infer a smaller sprite count limit from the app's image-generation batch limits.

## 9. In-app validation

1. Open the imported or updated character and verify 16 facial entries and 16 full-body entries, or the exact counts specified in the production brief.
2. Inspect `neutral`, `happy`, `crying`, `full_neutral`, `full_happy`, and `full_crying` at minimum. Confirm both categories contain the correct framing.
3. Enable/configure the Expression Engine agent for the roleplay chat and select the intended sprite display mode. Confirm the character is included in the relevant chat setup.
4. Test several contrasting emotional turns. Check whether the requested emotion resolves to an appropriate image and whether expression changes preserve position and apparent scale.
5. Test facial and full-body display modes separately. In the checked overlay, full-body images are searched before facial images when both pools are enabled; do not assume both versions will appear simultaneously.
6. If a custom expression never appears, inspect the emitted label and matching behavior before regenerating art. File availability and runtime selection are separate checks.
7. Export the completed character in native format and confirm that its `data.sprites` contains the expected image entries. Keep the validated export as the distributable release.
8. Verify the identity sheet appears in the Character Sheet preview, has the intended reference-use setting, and is embedded in the export's `data.gallery` with `isCharacterSheet: true`. Confirm the package contains 32 sprites plus one selected identity sheet, in addition to any preserved existing gallery assets.

## 10. Optional expansion: full-body pose library

After the matched expression set is complete, additional full-body poses can be useful: seated listening, folded arms, hands on hips, walking, or reaching. Treat these as a separate art set with its own pose directions. Use the approved body master for identity and wardrobe and a separate pose reference only for articulated body geometry.

These are custom labels; adding `full_seated.png` or `full_arms_crossed.png` does not itself define when roleplay or Game mode will select them. Verify the active mode's pose-selection logic before promising automatic use. Props, chairs, and wide gestures may also require different framing or compositing decisions. Do not mix these pose changes into the core emotion set by accident.

## 11. Reusable instruction for an AI production agent

```text
Create a photorealistic Marinara portrait package for the supplied character using this workflow and the attached references.

Deliver one character_identity_sheet.png, the complete 16-expression facial set, and matching 16-expression full-body set, including neutral.png and full_neutral.png. Use the supplied character's established appearance and personality. References own visible stable appearance; do not repeatedly redescribe that appearance in image prompts. Resolve unseen body and wardrobe details from the supplied specification, marking any unresolved design choices for review.

First establish the neutral portrait and neutral full-body masters. Present them for visual review before generating their dependent sets unless the user has delegated visual acceptance or supplied already approved masters. Generate each portrait independently from the neutral portrait master. Generate each body expression from the approved neutral body master and its matching accepted facial portrait. Keep matched body poses, clothing, lighting, framing, and scale constant.

Build the identity sheet from the approved identity and body masters: exactly three full-body views, left to right three-quarter-front, three-quarter-rear, and direct-rear, at identical scale on a plain warm-gray landscape canvas. Prefer individually approved view renders assembled without generative repainting. Check rear-surface design, garment continuity, and anatomical left/right consistency. Keep the individual references available; the sheet is a reference artifact, not an expression sprite.

Use the filenames and expression recipes in this guide. Render individual images, preserve source masters, finish accepted delivery images as transparent PNGs, and inspect identity, expression readability, anatomy, alpha edges, and cross-set alignment. Maintain a production ledger with the actual prompts, reference roles, generation settings, filenames, and acceptance results.

For a single uploadable file, preserve the complete supplied native character export and merge accepted images into outer data.sprites using real image data URLs. Preserve unrelated existing images and all character text and metadata. Do not ship placeholders, local file links, or invented schema fields. Validate JSON, decoded image bytes, naming, count, and current importer limits. State that native import creates a character copy; provide category-separated image folders when updating an existing character is required.

Embed the identity sheet in outer data.gallery with isCharacterSheet: true, marking only that selected sheet. Set the nested character extension useCharacterSheetAsReference to the intended boolean value; do not supply a fabricated or stale characterSheetImageId. Let import bind the restored gallery image. For existing-character updates, supply the sheet separately for the Character Sheet upload control. Validate its bytes and verify sheet selection separately from sprite counts.

Deliver the assembled character file, the accepted images grouped by category, and a brief QA report with image counts and any unresolved issues. Report packaging validation separately from an actual in-app import test. If no source character card was supplied, finish the image set and identify that missing packaging input; do not invent a replacement personality card.
```

## 12. Source references

Checked release notes: [Engine v2.5.2](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.2) (sprite folders, faceted names, Upload Folder removal, avatar visibility) and [v2.5.1](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.1) (2D/3D Avatars and character import/export changes). These links pin the checked revision. Recheck them against the user's installed version before changing import mechanics or promising new runtime behavior.

- [Character editor: expression labels, category normalization, image upload](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/components/characters/CharacterEditor.tsx)
- [Shared sprite label normalization](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/utils/sprite-labels.ts)
- [Native character export envelope and embedded sprites](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/characters.routes.ts)
- [Native importer: character creation, sprite decoding, and collection limits](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/import/marinara.importer.ts)
- [Shared file-size constants](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/constants/defaults.ts)
- [Sprite routes: image upload, ZIP export, and matched-body references](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/sprites.routes.ts)
- [Sprite overlay: display pools and expression selection](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/components/chat/SpriteOverlay.tsx)
- [Expression matching and semantic fallbacks](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/lib/sprite-expression-match.ts)

End of workflow.
