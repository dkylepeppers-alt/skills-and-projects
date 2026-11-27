# v1.0.0 validation record

Recorded 2026-11-27 for the files listed in `SHA256SUMS`. Target: Marinara Engine staging commit
`df60575b762b1fd3107874a5e8a852f2bee78957` with the user's local PATCH2–PATCH9 (`marinara-patches-20261127.zip`).
The Agent was also checked on the skill's pinned v2.5.2, `fc0333c3fe978cda5e0b919bd6faec985901704e`.

## Passed

- `node --test tests/agent.test.mjs tests/extension.test.mjs`: 15/15. Covers:
  - the Agent's import shape: post-processing, `image_prompt`, the Image generation ability only, context sources
  - one pool marker pair in every prompt option, which the extension's rewrite replaces without touching other text
  - shared reference rules and output contract in every mode, a valid example, and names kept out of `prompt`
  - the extension's pure logic: id, tag and text validation; pool lines; warnings; settings kept on sync
  - the built script parses inside the Engine's full-page wrapper, sends the CSRF header on writes, and uses
    `marinara.fetch`
  - the ZIP is reproducible and matches the folder
- `tests/check-engine.mts`, using the Engine's own `normalizeAgentImportEntry`, `importAgentConfigSchema`,
  `collectFolderPackageEntries` and capability helpers:
  - On v2.5.2 (zod 4.6.7, tsx 4.20.6) and on patched staging (the Engine's own tsx): the single file and the
    folder both pass, request only `trigger_image_generation`, keep four named prompt options, and the
    folder's `promptTemplatePath` and `settingsPath` resolve.
  - On patched staging, PATCH10's parser reads the documented example references faces first, with the
    same cap (10) as the prompt.
- Extension: `lint-extension.mjs` reports no errors. The skill's `validate-artifact.ts` passes with the Engine's
  folder importer and `createPersonalExtensionSchema` on v2.5.2 and on patched staging, with the expected
  warning that full page access runs unsandboxed.
- `node tests/extension.browser.mjs` (Chromium 412×860, mock Engine API). The built script ran inside the
  Engine's full-page wrapper with a host shim that mirrors `createFullPageExtensionApi`. Checked: open the
  panel; tag a character's face and body and a Global Gallery location; auto-sync and manual Sync send `PATCH
  /api/agents/agent-1` with `x-marinara-csrf: 1`; the pool block is updated in all 5 prompts with other settings
  kept; tags are stored; the missing-face warning appears; cleanup removes the launcher and panel; no page errors.
- PATCH10 and PATCH8b:
  - Both apply in order after PATCH2–9 on a clean `df60575` worktree, one at a time or as the combined diff, and
    PATCH10 also applies without PATCH8b.
  - With all of them applied: `tsc -b ../shared` and `tsc --noEmit` for `packages/server` pass. Without PATCH8b,
    the server typecheck reports PATCH8's `Cannot find name 'atomicWriteBuffer'`.
  - Regressions pass: `agents/gallery-reference-pool` (new), `agents/illustrator-reference-scope` (PATCH6's),
    `spatial-location-reference`, `active-character-reference`, `media-reference-scope` and
    `image/image-edit-reference`.
  - The shipped patch files are byte-identical to the tested tree (same SHA-256).
- `python3 scripts/validate.py` passes with this project's tests and checksums added.

## Not verified

- No live run. Not checked: a Marinara install importing these files, approving the extension hash, the Pool
  panel on a phone browser against the real API, the Agent running in a chat, or a SpicyAPI Seedream 5.5 request.
  SpicyAPI is not reachable from the build environment. On first use, check the server log for
  `Sending N gallery pool reference(s)` and the SpicyAPI debug payload for N `spicy://` references.
- Of the 62 Engine regressions that read the routes PATCH10 touches, 9 could not load here because client
  dependencies were not installed. Three more fail identically on unmodified `df60575` (and with PATCH2–9
  without PATCH10): `agents/manual-agent-retry-resolution`, `chat/conversation-prompts` and
  `generate-reply-commands`. They are not caused by these patches.
- `writer-reference-pictures` printed a `sharp` stack trace but exited 0, because sharp's native binary was not
  installed here (dependencies were installed with `--ignore-scripts`).
- The extension's thumbnail width parameter (`?w=320`) is only added for chat and Global Gallery URLs, which
  support it at staging. Character and persona pictures load full size in the panel.

## SpicyAPI Seedream 5.5 Edit (from its API page, 2026-11-27)

Source: https://spicyapi.ai/models/seedream-5-5/edit/api (model `bytedance/seedream-5.5/edit`).

- `image_urls`: required, `minItems` 1, `maxItems` 10 ("Supplies 1 to 10 reference images"). PATCH10's cap of 10
  matches, so the adapter never trims the Agent's picks for this model.
- The prompt should "Refer to the images as Image 1, Image 2 and so on" (`reference_tokens`: `Image {index}`).
  PATCH10 numbers its order line that way and writes each person's numbers next to their first mention.
- Prompt `maxLength` 5000 characters (ByteDance recommends at most 600 English words). Files: JPG, PNG, WEBP, GIF,
  up to 10 MB each. Every input image adds a separate charge on top of the per-picture price.
- Not checked: the authenticated live model list (`GET /api/v1/models`), which the docs say is the authority for
  callable ids.

## PATCH10 revision (same day)

Fixed after review: a person whose pictures came from two galleries (a character gallery face and a Global
Gallery outfit owned by the same name) got two letters, and a deleted face picture shifted every later person's
letter. People are now matched by name, letters follow the Agent's face order, and the prompt gets `Image N`
annotations. Checked on the live install (`df60575` + PATCH2–9 + PATCH10 + PATCH8b): the
`gallery-reference-pool` and `illustrator-reference-scope` regressions pass, and `tsc --noEmit` on the server
reports no errors.

## Live install (2026-11-27)

Imported into the user's Engine through its own API (`POST /api/agents/import`, `POST /api/personal-extensions`).
The Engine stored the Agent as `custom-import-gallery-illustrator-<uuid>`, because every import gets a fresh type.
The extension looked for the bare `gallery-illustrator` type, so Sync would have reported "Import the Gallery
Illustrator agent first". Fixed: the extension now matches both the authored and the imported type, and syncs
every copy (importing twice makes two). The unit test and the browser test's mock now use the imported type. The
browser test passes.
