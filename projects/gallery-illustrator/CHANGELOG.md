# Changelog

## 1.0.1 — 2026-11-27

- PATCH11 applies after PATCH10. Explicit person letters and gallery owner IDs keep identities stable after a refused pick and distinguish same-name cards. Legacy records can still regenerate. A missing recorded image stops the request and reports its ID.
- The Engine filters the shared catalog for the running chat before selecting up to 120 rows. Cast faces have first priority. Existing gallery URLs supply source IDs on the next sync.
- The extension offers Retry when it cannot read saved tags. Tag edits and sync become available after a successful read.
- Body references supply proportions, scene action controls the pose, and each wearer uses their own wardrobe state. An explicitly unclothed person is described as nude. Background and Comic use their own composition rules.

## 1.0.0 — 2026-11-27

First release, for Marinara Engine staging `df60575` with local PATCH2–9.

- **Gallery Illustrator** custom Agent (post-processing, `image_prompt`, Image generation ability). It decides
  when to draw, picks up to 10 references from a tagged gallery pool by role, and writes a Seedream-style prompt
  that names people as person A, B… Modes: Illustration, Selfie, Comic, Background, Custom.
- **Gallery Reference Pool** External Extension (full page access). A Pool panel to browse character, persona,
  Global Gallery and chat galleries, tag pictures (face, expression, body, outfit, location, prop, style), and
  sync the pool into every prompt of the Agent.
- **PATCH10 `gallery-reference-pool`**. A custom image agent's `references` replace the automatic avatar,
  location and lorebook references. Picks are checked against the chat's cast, ordered faces first, numbered in
  the prompt as Image 1, Image 2… (SpicyAPI's Seedream 5.5 convention, also written next to each person's first
  mention), capped at 10 (Seedream 5.5 Edit's `image_urls` maximum), and recorded so **Regenerate image** reuses
  them. People are matched by name across galleries, and letters follow the Agent's face order. Ships with a
  regression test.
- The extension finds the Agent under the type the Engine gives it on import (`custom-import-gallery-illustrator-…`)
  and syncs every imported copy.
- **PATCH8b**: optional fix for PATCH8's `atomicWriteBuffer`, which does not exist on staging.
