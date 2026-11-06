# Animated 2D and 3D avatars

Checked against Engine **v2.5.2**, commit `fc0333c3fe978cda5e0b919bd6faec985901704e`, 2026-11-06. The [v2.5.1 release notes](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.1) introduce these agents and confirm the model/card export boundary; [v2.5.2](https://github.com/Pasta-Devs/Marinara-Engine/releases/tag/v2.5.2) adds MMD and GLB/FBX models (#8481, #8656), which move the data folder to storage format 10. This is the animated-avatar contract; static profile pictures, expression sprites and identity sheets remain in `portrait-workflow.md`.

## Choose a deliverable and setup route

Install **2D Avatars** (`2d-avatars`), **3D Avatars** (`3d-avatars`), or both through **Agents → Agent Organizer**. The feature is checked here against Engine 2.5.2 / Capability API 1.73. The companion catalog manifests declare `engine.min: "2.5.0"` plus API 1.73; that formal version floor alone does not prove the renderer exists in an older release. Verify both host capabilities and the feature on any older install. On the agent's page, use **Avatars**, choose a character or persona, then choose the type. Add the matching agent under Chat Settings → Agents → Misc Agents for Roleplay, Visual Novel or Game display. These are Engine renderers with downloadable agent definitions/prompts; they make no extra AI calls while chatting. Creating new images or rigging a sprite uses the selected image/vision connection.

| Deliverable | Authoring input | Setup/import surface | Important boundary |
|---|---|---|---|
| PNGTuber from existing sprites | Facial PNGs plus optional talk/blink variants, uploaded through the owner's Sprites tab | 2D Avatars → PNGTuber sprites → Use my sprites | Usable automatically before saving a setup; portrait family wins whenever any portraits exist, otherwise full-body family; never mixes both |
| PNGTuber Plus avatar | A current PNGTuber Plus `.save` containing its image bytes | 2D Avatars → PNGTuber sprites → Import PNGTuber Plus save | Each costume becomes a flattened face; name its pictures for feelings; not an arbitrary ZIP |
| Mesh avatar | Mesh Avatar Studio **Export .mavatar**, or Engine's Make an avatar from a sprite → Mesh avatar | 2D Avatars → Mesh avatar → Import .mavatar file | `.mavatar` is a validated archive, not a manually zipped project folder; WebGL2 required, with PNGTuber/sprite fallback |
| 3D avatar (VRM) | A self-contained VRM 1.0 or 0.x model from VRoid Studio, Blender VRM add-on or another VRM authoring tool | 3D Avatars → VRM model → Import VRM | `.vrm`; a VRM saved as `.glb` also belongs here, not under GLB/FBX. A portrait prompt does not produce a rigged model |
| 3D avatar (MMD) | A PMX 2.0 (or compatible 2.1) model: a ZIP with one `.pmx` and its pictures (PNG, JPEG, BMP, TGA, `.sph`/`.spa`), keeping original folders and Japanese filenames, or a `.pmx` alone if it needs no pictures | 3D Avatars → MMD PMX model → Import PMX or ZIP | PMD, VPD poses and camera/light motion unsupported; no physics; ≤256 texture paths. Missing pictures, unsafe paths and damaged files are refused before replacing the saved model |
| MMD motion | A `.vmd` made for that model | 3D Avatars → VMD motion | Plays while **Idle motion** is on; replacing the PMX removes it |
| 3D avatar (GLB/FBX) | One rigged character: binary `.glb` with everything embedded, or FBX 2014 (7.4)+ binary or ASCII exported with **Embed Media** | 3D Avatars → GLB or FBX model → Import GLB or FBX | Bones are matched by name (Mixamo, Unity, VRoid, Unreal, Blender, 3ds Max, HumanIK, Character Creator, DAZ); hips, spine, head and both upper and lower arms are required or the import is refused. Faces come from blend shapes. No Draco/meshopt/KTX2, no separate `.gltf`, no built-in animations or physics |
| Idle animation (VRM) | VRM Animation `.vrma` | 3D Avatars → Idle animation → Add animation | Requires a VRM already imported; replacing the VRM keeps the animation; removing the model removes both |

A configured avatar shows only when **Show this avatar in chats** is on. Since 2.5.2 a character with only expression sprites is no longer an avatar automatically: it stays off until that switch is turned on (or **Use my sprites** is saved). A profile picture alone never creates a 2D avatar. If an owner has several kinds, **Show this one** picks the kind; when that kind's agent is off in a chat, another kind whose agent is on is shown.

Live2D is unsupported. Do not promise image-to-VRM generation: the old Tripo generator was removed. Existing models it produced can load and move their bodies but have no working facial expressions. The **Get a 3D model → Copy prompt** action creates a visual reference description, not a VRoid import or rig.

## PNGTuber asset naming and face mappings

Keep all variants of a face at the same canvas size and subject position. The default face has open eyes and a closed mouth; change only the relevant feature in its variants. Preserve the portrait workflow's existing 16-expression recommendation when making its static package; the avatar's six main emotions are a different runtime mapping.

| Picture | Recommended filename | Other recognized suffixes |
|---|---|---|
| Base face | `happy.png` | Any usable normalized face label |
| Mouth open | `happy_talk.png` | `_mouth_open`, `_open_mouth`, `_talking`, `_speaking`, `_speak` |
| Eyes closed | `happy_blink.png` | `_eyes_closed`, `_closed_eyes`, `_eyes_shut`, `_blinking` |
| Both | `happy_blink_talk.png` | Both a mouth and eye suffix, in either order, e.g. `happy_talk_blink` |

Upload to the character/persona's **Facial Expressions** category. Full-body filenames retain `full_` and work only when the owner has no portrait sprites. Variants require their base face; an orphan `happy_talk` creates no face. Missing variants fall back to base; simultaneous blink/talk prefers the combined picture, then mouth, then eyes, then base. These suffixes are reserved as variants for PNGTuber use, rather than distinct emotional labels.

One setup holds at most **64 face layer sets**. Keys are 1–64 Unicode letters/numbers/underscores after sprite normalization. Suggested expression labels and feeling names are prioritized before custom labels at the cap. **Update from sprites** refreshes a saved sprite-based setup while retaining chosen feeling bindings. An imported PNGTuber Plus setup keeps its own faces instead of blending in the owner's sprites.

The six emotion slots are `neutral`, `happy`, `angry`, `sad`, `relaxed`, `surprised`. Exact names win; other sprite labels are mapped by the shared source's names/word stems. The following existing expression labels have these fixed main mappings:

| Sprite labels | Main emotion | Weight |
|---|---|---|
| neutral, thinking | neutral | 1 |
| happy, laughing | happy | 1 |
| embarrassed, smirk, blushing | happy | 0.4 |
| angry | angry | 1 |
| disgusted | angry | 0.5 |
| determined | angry | 0.4 |
| sad, crying | sad | 1 |
| worried | sad | 0.5 |
| hurt | sad | 0.7 |
| love | relaxed | 1 |
| surprised | surprised | 1 |
| scared | surprised | 0.7 |

PNGTuber supports these **23 optional extra feelings**, grouped by their fallback emotion:

| Main emotion | Extra feelings |
|---|---|
| neutral | curiosity |
| happy | admiration, amusement, desire, embarrassment, excitement, gratitude, optimism, pride |
| angry | annoyance, disapproval, disgust |
| sad | disappointment, grief, nervousness, remorse |
| relaxed | approval, caring, love, relief |
| surprised | confusion, fear, realization |

Use the feeling's own name for reliable automatic matching; common synonyms also work (`scared` → fear, `laughing` → amusement). **Face for each feeling → More feelings** assigns or corrects the mapping. An extra feeling with no target falls back to its main emotion. Runtime face choice is: exact Expression Engine/Game Master sprite label if available, then feeling, then main emotion, then resting face. Mesh and VRM show the six main emotions, not 29 distinct feelings.

PNGTuber Plus imports retain positions/layer order and flatten talking/blinking states, with each costume as a face. Wobble, drag, rotation/stretch and animation do not transfer; animated layers use their first frame. Very old saves with only local file paths need resaving in a current PNGTuber Plus. Output is scaled to at most 2048 pixels per side. The importer allows at most 512 source layers and checks PNG dimensions/animation-frame metadata. Server image processing is required; some Android/Termux installs cannot import these saves.

## Mesh and VRM authoring checks

A `.mavatar` contains version-1 `avatar.json`, `rig.json` and built PNG layers. Engine validates the rig, referenced PNGs and mesh complexity (at most 500,000 grid points), then repacks only runtime assets; the original illustration is not preserved. Runtime archive ceilings are 200 entries and 64 MiB per kept entry. Export from Studio instead of hand-authoring the rig from this summary.

Mesh main emotions are built in. Optional drawn mouth sprites map as follows; closed-eye sprites are `eyes_closed_0` and `eyes_closed_1`.

| Shared viseme | Runtime vowel | Drawn mesh sprite |
|---|---|---|
| aa | a | mouth_a |
| ih | i | mouth_i |
| ou | u | mouth_o |
| ee | e | mouth_a_half |
| oh | o | mouth_o |

Mesh **Look for each feeling** can choose the six emotions or Smile, Shy, Half-closed eyes and Wink. Generated mesh rigs move head/eyes/brows/mouth, not hands, individual hair strands or hanging accessories. Use a front-facing bust or full-body source, and inspect the face outlines before saving.

A `.vrm` must be a valid self-contained GLB with VRM metadata, a usable humanoid skeleton and internal textures/data. External references, Draco/meshopt compression and KTX2 textures are refused. The JSON chunk is capped at 16 MiB for parser memory; this is separate from the file upload cap. Up to 256 expression names are retained. Empty expressions cannot bind a moving face/mouth/blink (Neutral can be the model at rest).

| Shared slots | VRM 1.0 | VRM 0.x |
|---|---|---|
| happy / angry / sad / relaxed | happy / angry / sad / relaxed | joy / angry / sorrow / fun |
| surprised | surprised | No preset; add a custom Surprised expression |
| aa / ih / ou / ee / oh | aa / ih / ou / ee / oh | a / i / u / e / o |
| blink | blink | blink |

Names are shown as the renderer uses them (VRM 0.x presets are normalized to 1.0 names). Other clear custom names can be guessed; review **Faces and mouth shapes**, correcting guesses or selecting None. Model terms/meta are read and shown; preserve the author's license/redistribution terms with any delivered model. An imported `.vrma` must contain VRM Animation humanoid data, not an arbitrary GLB animation.

## Settings and API contract

Settings live at `avatar-models/<character|persona>/<real-owner-id>/avatar.json`, separate from static profile pictures in `avatars/` and expression images in `sprites/<id>/`. Owner IDs must match `^[A-Za-z0-9_-]{1,128}$`; do not invent an ID offline and expect import to create its owner.

`avatar.json` is a **strict** `AvatarConfig`, not a `marinara_*` envelope:

- `version: 1`, `owner: { ownerType: "character" | "persona", ownerId }`, `enabled`, nullable `activeKind`, `features`, `kinds`, `updatedAt` (ISO datetime).
- `activeKind` is `pngtuber`, `mesh-avatar`, `vrm`, `mmd`, `glb-fbx`, or null. A non-null kind must be configured. Multiple kinds may coexist.
- `features: { lipSync, blink, idleMotion }`, all true by default. New configs default to enabled, null active kind and empty kinds.
- Each expression binding is `{ target: string | null, source, confidence }`, confidence 0–1; source is `preset`, `name-match`, `sprite-label`, `user`, or `missing`. Expression maps admit only the six emotions, five visemes and `blink`; `feelingMap` admits only the 23 extra feelings.
- PNGTuber kind data: `{ layers, expressionMap, feelingMap?, motion, source }`. Layer set: `{ base, mouthOpen?, eyesClosed?, eyesClosedMouthOpen? }`. Each image ref is `{ source: "sprite", label }` or `{ source: "file", path }`. Motion defaults to `{ bounceOnTalk: true, bounceHeight: 0.06, blinkIntervalSeconds: 4.5 }`; height 0–0.25, blink interval 1–20 seconds. Source is `sprites`, `pngtuber-plus`, or `generated`.
- Mesh data: `{ file, expressionMap, source: "import" | "generated" }`.
- VRM data: `{ file, specVersion: "0.x" | "1.0", expressionMap, idleAnimation?, meta?, expressionNames? }`.
- MMD data: `{ file, texturePaths, expressionMap, expressionNames?, idleAnimation? }`, strict. `file`, every `texturePaths` value (keyed by the PMX's own texture reference) and the nullable `idleAnimation` must start `mmd/`; texture and expression-name counts are capped by `AVATAR_MMD_METADATA_LIMITS`.
- GLB/FBX data: `{ file, format: "glb" | "fbx", bones, expressionMap, expressionNames? }`, strict. `file` matches `glb-fbx/<name>.glb|.fbx` and must end in its `format`; `bones` is a partial map from humanoid bone ids (`AVATAR_HUMANOID_BONES`) to the model's bone names.

File refs are `<kind>/<name>` inside that owner's folder, with no nested directories, `..`, absolute paths, trailing dot or Windows device names. Use the source's `isAvatarFilePath`; never replace it with a generic path test. Mesh file refs must start `mesh-avatar/`; VRM model/animation refs must start `vrm/`; MMD refs `mmd/`; GLB/FBX refs `glb-fbx/`. API updates cannot materialize files merely by naming them.

| Route (under `/api/avatar-models`) | Contract |
|---|---|
| GET `/` | Owner summaries |
| GET `/:ownerType/:ownerId` | Config, JSON null for a known owner without one, 404 for unknown owner |
| PUT `/:ownerType/:ownerId` | Strict partial `{ enabled?, activeKind?, features?, kinds? }`; a supplied kind replaces its data, other kinds remain; partial features merge |
| POST `/:ownerType/:ownerId/import` | One multipart `file`, optional `kind`; validates/extracts/stores the model and returns `{ kind, config, detected, warnings }` |
| DELETE `/:ownerType/:ownerId/kinds/:kind` | Removes that kind's files |
| DELETE `/:ownerType/:ownerId` | Removes the owner's avatar folder |
| GET `/:ownerType/:ownerId/files/:kind/:name` | Validated stored media |

The avatar import cap is **256 MiB**, the normal global upload cap; there is no smaller avatar-specific file cap. Structural/parser/runtime checks above can still refuse a smaller file. This is unrelated to native card embedded-sprite limits.

## Packaging, transfer and acceptance

**Do not place animated model files in `data.sprites`, `data.gallery`, character extensions or a fabricated `marinara_avatar` envelope.** Card/persona exports embed static profile pictures, sprites and gallery assets, but never the separate animated models/settings. Profile exports and full backups include `avatar-models`; deleting the owner removes its models. The avatar-models API has import/settings/file-serving routes, not a standalone model export route. Preserve the original `.save`, `.mavatar`, `.vrm`, `.vrma`, `.pmx`/ZIP, `.vmd`, `.glb` and `.fbx` deliverables when authoring. For a character-only transfer, deliver them alongside the card and tell the recipient to import the card first, then configure that new owner on the matching agent page. For a complete install transfer, use native profile export/backup instead.

Verify: actual file signature and format; accepted owner; no missing layers/textures; import warnings; chosen kind and enabled switch; six faces/mouth/blink preview; animation; per-chat matching agent; actual display and TTS/text behavior. For PNGTuber inspect combined variants without silhouette jumps. Verify imported model/settings separately from card sprites. Record an in-app test only when one was actually run.

Avatars share the full-body sprite's placement and size but do not automatically hide it. VRM framing choices are Portrait (default), Half body, Full body; per-chat arrangement/framing is device-local, not part of the model. Reduced motion keeps faces/mouths while suppressing ambient movement. Since 2.5.2 there is no fixed limit on avatars drawn at once on phones or desktops; group chats show every member with a saved, enabled avatar whose agent is on, in roster order, then the persona. Personas do not lip-sync the user's typed messages.

## Pinned implementation sources

- Companion package gates: [2D Avatars manifest](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/packages/2d-avatars/manifest.json), [3D Avatars manifest](https://github.com/Pasta-Devs/Marinara-Agents/blob/ffde8ea4035868c064eb3b2ffd675f1f807c57ed/packages/3d-avatars/manifest.json).
- [Shared kinds, files, suffix-independent mappings and defaults](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/types/avatars.ts)
- [Strict config/update schemas](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/shared/src/schemas/avatars.schema.ts)
- [Sprite family, suffix parsing, variants and runtime face priority](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/client/src/features/avatars/renderers/pngtuber/pngtuber-layers.ts)
- [Avatar-model routes](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/avatar-models.routes.ts)
- [Storage and upload cap](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/avatars/storage.ts)
- [PNGTuber Plus importer](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/avatars/formats/pngtuber.ts)
- [Mesh importer and viseme mapping](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/avatars/formats/mavatar.ts)
- [MMD importer](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/avatars/formats/mmd.ts) and [GLB/FBX importer](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/avatars/formats/glb-fbx.ts)
- [VRM and VRMA validation/expression detection](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/services/avatars/formats/vrm.ts)
- [Profile/backup asset directories](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/packages/server/src/routes/backup.routes.ts)
- [User setup/authoring guide](https://github.com/Pasta-Devs/Marinara-Engine/blob/fc0333c3fe978cda5e0b919bd6faec985901704e/docs/agents/avatars.md)
