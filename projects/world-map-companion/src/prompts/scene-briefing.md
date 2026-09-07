# World Map Companion — Scene Briefing Template

**Status:** Companion prompt module (Task 9). Not part of the frozen FF5.4 preset.
**Invocation:** Deterministic scene builder every applicable generation — **no model call** to assemble facts.
**Budget target:** ~1,200–2,000 tokens for ordinary scenes (measure; never trim the original preset).

## Assembly order (mandatory first)

1. Safety / access of the current location (known hazards, sealed doors the player may attempt)
2. Current place identity (locationId + display name) — may be **outside** the native first-50 known-name index
3. Story time / weather facts for the preset header (Fahrenheit); do not emit a competing header
4. Known occupants / last-seen / expected (labeled; expected ≠ sighting)
5. Available affordances the player knows about (propose only — never silently perform)
6. Relevant routes / travel options from the effective map
7. Optional distant context only when relevant; track omissions explicitly

## Labels

- `actual` — author/system only unless earned
- `known` / `sighting` / `communicated` / `rumor` — observer knowledge
- `last-seen` — timed observation
- `expected` — schedule prediction, not a sighting
- `UNVERIFIED` / `PROPOSED` — honesty markers for host wiring

## Forbidden

- Duplicate tracker dumps already gated by FF5.4 `state_mode`
- Second dice rolls or World Sim ticks
- Omniscient NPC knowledge when ANTIOMNI is on
- Trimming or rewriting frozen FF5.4 sections to meet budget
