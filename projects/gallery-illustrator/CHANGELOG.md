# Changelog

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
  the prompt, capped at 10, and recorded so **Regenerate image** reuses them. Ships with a regression test.
- **PATCH8b**: optional fix for PATCH8's `atomicWriteBuffer`, which does not exist on staging.
