# Gallery Illustrator

A first-class "Illustrator with a reference pool" for Marinara Engine. The Agent draws scenes like the
built-in Illustrator, but it **chooses up to ten reference pictures** from a pool of gallery images that you
tag by role: a high-quality face close-up, full body, outfit, location, props and an art-style guide. It is
built for reference-guided models such as **Seedream 5.5 on SpicyAPI**, which keep identity far better with a
dedicated face reference plus body and location references.

Why it is needed: the Engine's Illustrator (and every custom image agent) sends **one** picture per named
character (character sheet, else avatar, else sprite), plus the map location, **six at most**. The model
never chooses, and nothing in the stock Engine accepts arbitrary gallery references.

## What is in it

| Part | File | Job |
| --- | --- | --- |
| Custom Agent **Gallery Illustrator** | `gallery-illustrator.marinara-agent.json` or `Gallery-Illustrator/` | Decides when to draw, writes the Seedream prompt, and picks references from the pool by id and role. |
| External Extension **Gallery Reference Pool** | `gallery-reference-pool.personal-extension.zip` or `Gallery-Reference-Pool/` | A **Pool** button and panel: browse character, persona, Global Gallery and chat galleries, tag pictures, and sync the pool into the Agent's prompt. |
| Local Engine patch **PATCH10** | `engine-patch/PATCH10-marinara-gallery-reference-pool.patch` | Makes the Engine send the Agent's picks as the reference images, in role order, with a numbered order line. |
| Fix for your PATCH8 | `engine-patch/PATCH8b-marinara-game-image-refs-fix.patch` | Optional. PATCH8 calls `atomicWriteBuffer`, which does not exist on staging, so "use the map picture as the Game background" always fails quietly. This replaces it with `writeFileAtomicSync`. |

## Requirements

- Marinara Engine **staging `df60575`** with your local PATCH2–PATCH9 (the set in
  `marinara-patches-20261127.zip`). PATCH10 touches the same lines as PATCH5, so apply it after them. It applies
  whether PATCH2–9 go in one at a time or as `all-local-changes-combined.diff`, with or without PATCH8b.
- An image connection that takes reference pictures: SpicyAPI with your Seedream 5.5 model. With your
  PATCH4, references are uploaded at full size (up to 10 MiB, 8 MP each) instead of squeezed into the 2 MB
  request. The model's own `image_urls` limit still applies, and references are ordered so the least important
  are the ones cut.
- Without PATCH10 the Agent still runs, but the Engine ignores its picks and sends the usual avatar references.

## Install

1. **Apply the patch.** In `~/bin/marinara-start`, after PATCH9:

   ```bash
   git apply --check PATCH10-marinara-gallery-reference-pool.patch && git apply PATCH10-marinara-gallery-reference-pool.patch
   ```

   Optionally do the same for `PATCH8b-marinara-game-image-refs-fix.patch`. Restart Marinara.
2. **Import the extension.** Start Marinara with `ENABLE_EXTERNAL_EXTENSIONS=true`, then turn on External
   Extensions in **Settings → Advanced → Danger Zone**. In **Settings → Addons → External Extensions**, use
   **Import Extension File** with the ZIP (or **Import Extension Folder**). Review it and approve the exact hash.
   It asks for **Full page access**: it reads your galleries and updates the Gallery Illustrator's prompt through
   the app's own routes, which a sandboxed extension cannot do. Read `Gallery-Reference-Pool/extension.js` first
   if you want to see exactly what it does.
3. **Import the Agent.** Turn on **Allow custom Agent imports** in **Advanced Settings → Danger Zone**, then
   **Agents → Import agents** and choose the JSON file (or the folder). Approve the one ability it asks for,
   **Image generation**.
4. **Pick the image model.** Open the Gallery Illustrator in the Agents panel and set its image connection to
   your SpicyAPI Seedream 5.5 model, or leave it on the chat's default Images connection.
5. **Tag pictures.** Press **Pool** (bottom right). Choose a character, then for each useful picture set a
   **Role** and a short caption: at least one **face** (a sharp, front-lit close-up), then **body** and
   **outfit** pictures. Add places from the Global Gallery as **location**, with the place name as the owner.
   Every change syncs to the Agent after a second and a half; **Sync** does it now.
6. **Use it.** In a chat, **Chat Settings → Enable Agents → Custom Agents → Gallery Illustrator**. Use it
   instead of the built-in Illustrator in that chat, or you get two pictures per moment. To draw right now, use
   the camera button on the Gallery Illustrator's card.

## How a picture is made

1. Every **3** messages (the Agent's **Run Interval**), after the reply, the Agent reads the recent chat, the
   cards, the persona, tracker data (current outfit and place) and its previous output.
2. It decides whether the moment is worth a picture. If it is, it picks references from the pool: each visible
   person's face first, then body or outfit pictures that match the scene, then a location and any props or a
   style guide, **10 at most**. It writes the prompt with people named **person A, person B…** in face order,
   because image models do not know character names.
3. PATCH10 checks every pick: the id must exist, a character's picture must belong to someone in this chat's
   cast, a persona's to this chat's persona, and a chat picture to this chat. It loads them, sorts them faces
   first, then expression, body, outfit, location, prop and style. Following SpicyAPI's Seedream 5.5 docs
   ("Refer to the images as Image 1, Image 2 and so on"), it points each person's first mention at their pictures
   (`person A (Image 1 and Image 3)`, `the location reference (Image 4)`) and appends a line such as:
   `Reference image order: Image 1 is person A's face; Image 2 is person B's face; Image 3 is person A's full body; Image 4 is the location. …`
   People are matched by name, so Mara's face from her character gallery and her outfit from the Global Gallery
   (owner "Mara") are both person A. Letters follow the Agent's own face order, so a picture that has since been
   deleted does not shift everyone after it to the wrong letter. These replace the automatic avatar, map-location and lorebook references for that picture. Names never
   reach the image model; the server log lists them (`face of Mara (person A)`).
4. The Engine then does everything it does for the Illustrator: your PATCH4 upload path, saving to the chat
   gallery and the depicted characters' galleries, attaching to the reply, clips, and **Regenerate image**.
   The picks are stored with the picture, so a regeneration reuses the same references.

## Prompt modes

| Mode | Use |
| --- | --- |
| **Illustration** (default) | One polished scene picture. |
| **Selfie** | An in-character selfie or casual portrait; face reference first. |
| **Comic** | A short comic or manga page; lettering allowed; the same references in every panel. |
| **Background** | Places only: location and style references, no people. |
| **Custom** | Replace the `[YOUR INSTRUCTIONS]` line; references and output keep working. |

All modes share the pool block, the reference rules and the output contract, and the extension updates the pool
in every mode.

## Tuning

- `src/agent/agent.json` → `promptValues`: `maxReferences` (10) and `maxPromptWords` (180) are written into the
  prompt at build time. PATCH10 never sends more than 10.
- **Run Interval** and **Context Size** are ordinary Agent settings in the editor.
- **Send matching character and persona avatars as reference images** stays on as the fallback for turns where
  the Agent picks nothing. **Attach matching character appearance descriptions to image prompts** is off,
  because the references carry identity and appearance prose can contradict them.
- Edit the Agent's prompt freely, but keep the two `reference-pool` marker lines: the extension rewrites only
  what is between them, and leaves a prompt without markers untouched.

## Edit and build

Edit `src/` and `engine-patch/`, never a release folder.

```bash
node build.mjs                                            # build/ (ignored)
node --test tests/agent.test.mjs tests/extension.test.mjs # offline checks
node tests/extension.browser.mjs                          # the built extension in Chromium against a mock Engine
# Engine import path (a full Engine checkout plus zod 4.6.x and tsx; see the skill's scripts/README.md):
MARINARA_ENGINE_ROOT=/path/to/Marinara-Engine node --import tsx tests/check-engine.mts
node build.mjs --release 1.0.1                            # new release folder with SHA256SUMS
```

PATCH10 is developed in an Engine checkout at `df60575` with PATCH2–9 applied. Its regression lives in the
patch (`scripts/regressions/agents/gallery-reference-pool.regression.ts`); run it with the Engine's tsx after
applying.

Source pins: Engine staging [`df60575`](https://github.com/Pasta-Devs/Marinara-Engine/tree/df60575b762b1fd3107874a5e8a852f2bee78957)
(`routes/generate.routes.ts`, `routes/generate/retry-agents-route.ts`, `routes/gallery.routes.ts`,
`services/image/illustrator-references.ts`, `services/image/spicyapi-image.ts`,
`client/src/components/layout/PersonalExtensionInjector.tsx`, `shared/src/utils/chat-image-generation.ts`).
The Agent also imports on the skill's pinned v2.5.2 (`fc0333c`).
