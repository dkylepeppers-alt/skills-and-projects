# Write location text and symbols

| Field | Purpose | Boundary |
| --- | --- | --- |
| name | Recognizable, in-world, non-spoiling identity | Bounded index may expose it before discovery |
| description | Present, observable orientation and playable affordances | Author/UI visible; only current text projected automatically |
| modelMemory | Conditional scene guidance, secrets, social defaults and adjudication | Model/author visible, not secure storage or deterministic state |
| link label | Route name or directional transit cue | Available destination label, not a conditional access program |
| awarenessSummary | Optional short orientation metadata | No audited owner-prompt consumer |
| icon | Compact literal emoji or symbol | Not a Lucide name, shortcode, SVG or image attachment |

## Description

Lead with the dominant physical fact. Add one sensory detail, usable scale, an
affordance and important orientation. Prefer facts the model can turn into actions.
At a hub, name compass relationships if they matter: “Dormitories east; the lake
downhill south.” A canvas marker does not convey that to the prose model.

For an ordinary room, a few sentences often suffice. Roughly 250–800 characters is
a starting preference, not a minimum or validation rule. Spend more where the space
has complex scene needs. Avoid history dumps, generic mood labels and instructions
that decide how the user's character feels.

Keep canon facts distinct from invented embellishments. Qualify routine occupancy,
time and weather when they can change. If making art externally, write a separate
camera prompt; prose need not serve two incompatible jobs.

## Model memory

Supply information the public description cannot safely or efficiently carry:

- Who normally uses the place and what they want.
- What an observable clue means, and what would justify revealing it.
- Local social expectations and consequences.
- Adjudication guidance and limits on supernatural claims.
- Nonvisual continuity facts needed during this scene.

Write instructions to a collaborator, not a second description. Avoid repeating lore.
A prose condition can guide narration but does not change stored link state or enforce
permissions. Never label this field private from the author, map recipient or model.

## Worked contrast

Weak: “An old, creepy archive full of mysterious secrets.”

Stronger public description:
> Shelves of tide-stained ledgers lean toward a long oak reading table. Salt air
> whistles through the north window; the staff stair is behind the brass grille.
> One lower shelf is scrubbed cleaner than its neighbours.

Model memory:
> The clean shelf held the missing harbour register. The attendant knows who
> borrowed it but fears losing her post. Let respectful questions reveal the
> borrowing procedure; do not announce the thief without evidence.

This supplies observation, opportunity and social pressure without revealing the
answer in a name. If the grille is mechanically blocked, track that separately.

## Names and symbols

Use residents' names for places: Quay Steps, West Common, Ring Three. Duplicate
“Storeroom” labels are legal but ambiguous; qualify by wing/deck without changing
stable IDs. Neutral names protect twists better than “Secret Murder Cellar.”

Choose a compact, readable icon family for classes of location, then a few deliberate
exceptions. Examples: 🌲 region, 🏘️ settlement, 🏛️ institution, 🪜 floor/stair,
🚪 room. These are suggestions, not a fixed mapping. Plain symbols are supported as
literal strings too. Preview glyphs in the target UI; platforms render them differently.

Validate emoji by grapheme cluster, not Unicode code point count: skin tones,
variation selectors and ZWJ combinations can be one glyph. The schema permits 64
trimmed UTF-16 characters, while editor input is capped at 16. Do not fabricate a
hard “one emoji” parser rule or treat an English icon name as a graphics asset.
