# Worldcraft: build a place worth inhabiting

Contents: brief · causal worldbuilding · granularity · topology · scenes · secrets · scale · play tests.

Treat a map as a set of places plus relationships, not a taxonomic completion exercise.
A convincing world supports ordinary life as well as the plot. Runtime constraints
shape delivery, but should not flatten the user's preferred richness into a tiny demo.

## Begin with a playable promise

Write a compact brief before inventing nodes:

- Experience: exploration, domestic life, school drama, mystery, survival, politics,
  pilgrimage, combat, or a deliberate mixture.
- Perspective: resident or newcomer; familiar home or uncertain frontier.
- Scope: current story territory versus the larger world suggested beyond it.
- Canon: supplied sources, disputed facts, protected landmarks and allowed invention.
- Tensions: two or three ongoing pressures that different places reveal differently.
- Journey examples: routine trip, dangerous crossing, private visit, discovery and return.

Ask for missing choices that genuinely change the work. Do not request approval for
every room or reject a comprehensive map because a smaller one is easier to generate.
For a supplied setting, record canon-backed / inferred / invented facts in a sidecar.
Do not smuggle inference into supposedly exact canon.

## Build causes, then visible consequences

Design the systems that would make the place exist. Trace consequences into locations:

| Cause | Spatial consequences | Story opportunities |
| --- | --- | --- |
| Geography and climate | Water, drainage, shelter, flood line, paths, cultivation | Seasonal isolation, scarce shelter, evidence washed downstream |
| Food, power and waste | Kitchens, stores, service routes, generators, drains | Labour conflicts, shortages, unnoticed access |
| Institution and authority | Public thresholds, offices, records, staff quarters | Surveillance, exceptions, competing jurisdiction |
| Money and class | Unequal maintenance, transport, private space, visibility | Who waits, who enters unseen, who bears hazards |
| History and repair | Extensions, reused foundations, obsolete doors, scars | Conflicting stories, repurposed sacred or industrial spaces |
| Belief and ecology | Ritual routes, protected groves, nesting grounds, taboos | Places with different rules and inhabitants' competing explanations |

Choose a few important systems, not all of them at equal detail. For a gothic academy,
a shared architectural grammar plus modern service infrastructure is more convincing
than 40 interchangeable candlelit chambers. Let residents adapt old spaces imperfectly.

Map at least three overlapping geographies: official/public movement, residents'
everyday shortcuts, and service/maintenance access. Emergency exits and accessible
routes make useful checks against accidental spatial absurdity. State what the app
can enforce versus what remains descriptive.

## Choose node granularity deliberately

Split when a location changes at least one meaningful scene condition: who can hear,
who may enter, what is visible, social power, risk, resources, atmosphere, action or
visual identity. Combine spaces that offer no distinct use unless the user wants
complete architectural coverage.

A wrapper node can still host a scene: a floor landing, district street, grounds
overview or transit concourse. Give it a public orientation and an art decision.
Do not skip floors/rooms in counts just because they feel organizational.

Hierarchy expresses containment; links express extra routes. Floors are normally
siblings under a building, not a chain of children. A single-child node may be useful
for vocabulary, artwork, navigation or a meaningful threshold; it is not automatically
a mistake. Depth affects breadcrumbs and route hops, not a universal fixed turn count.

## Shape travel around the experience

| Topology | Strength | Risk to test |
| --- | --- | --- |
| Hub and spokes | Social convergence, quick returns | Overcrowded destination lists; every route feels identical |
| Spine with branches | Legible journey, escalating zones | Backtracking; false sequential gating due to parent shortcuts |
| Ring with cross-links | Pursuit, avoidance, alternative approaches | Routes lose distinctiveness if everything connects |
| Nested public/private pockets | Gradients of access and intimacy | Assuming containment enforces permission |
| Separate clusters with controlled connections | Islands, portals, sealed zones | Missing return route; accidental bypass via a shared active root |

Use asymmetric branching. A busy market may have many places while an equally large
residential district remains one node. Detail should follow intended play, curiosity
and user preference, not a repeated generated grid.

Label actual routes: Service Stair, East Causeway, Aft Lift. Encode crucial compass
orientation and journey texture in text too; marker positions do not reach the prose
model. Use bidirectionality intentionally. An available route is a mechanical choice;
a warning in prose does not block that route when the user selects it.

## Give locations independent scene value

For each important place, record a tiny scene brief:

1. Immediate orientation: dominant shape, materials, scale, sound/smell.
2. Affordances: two things a visitor can do here, not merely objects to look at.
3. Social default: who normally uses it, who is conspicuously absent, what changes at night.
4. Pressure: a resource, obligation, conflict or unanswered question.
5. Distinctive invariant: a landmark that should recur in text and art.
6. Connection: a sightline, supply route, shared faction or rumour tying it elsewhere.

Do not turn every location into a quest. Quiet places give discoveries contrast.
Allow beauty, routine, hospitality and humour in dark settings. Avoid identical prose
lengths and interchangeable adjectives. If two rooms can swap names/art without anyone
noticing, increase their specificity or merge them.

## Pass the isolated-context test

Read a leaf's description and modelMemory without its ancestors. Can the model run
the expected scene? Repeat only indispensable setting cues at the leaf; put reusable
canon in lore and attach it where needed. Global/constant lore has a context cost too.
Parent lore/text is not inherited automatically.

Keep default conditions qualified: “usually quiet after lessons” leaves room for a
current scene; “always empty” may contradict established play. Define observations
separately from their interpretation. An unexplained fresh repair is a better clue
than repeatedly declaring that a place is sinister.

## Design reveals as both story and state

Plan clue → interpretation → choice → payoff. Put the near-side clue where the player
can encounter it before entering the destination. Do not hide the only reveal trigger
inside the destination's own memory. Keep names, public text and visible art spoiler-aware.

Choose whether a secret is purely narrative, manually unlocked, created by supported
discovery, or controlled by a separately implemented mechanic. Document that choice.
Hidden/blocked link flags do not supply conditional triggers. Neither putting “locked
until midnight” in memory nor reparenting beneath a gate creates a tested hard gate.

Distinguish physical state, NPC beliefs and historical facts. Keep mutable events in
appropriate chat/game state, or provide a deliberate manual revision procedure.
Two copies of the same hall (“before”/“after”) can imply two physically separate places;
prefer updating the same stable location where possible and never silently rename IDs.

## Scale without arbitrary caps

The 500-node storage bound is not a target. The first-50 prompt name index is not an
instruction to discard a 73-node academy. In-app draft presets also do not limit
externally authored worlds. Choose breadth and detail based on the brief.

For large maps: keep descriptions concise, important local facts self-contained,
local destination lists legible, attachments small enough for real lore budgets,
and source inventory complete. Offer layered build milestones when art or review cost
is large. Archive by story lifecycle only after evaluating its effect on reachability,
not just to manipulate a prompt index.

## Walk it before delivery

Walk a day in the life of a resident, a newcomer's arrival and one unusual journey.
Test forward AND return paths, shortcuts, accessibility, emergency routes and gates.
Read actual one-hop lists at crowded hubs. Check routine trips using the intended
travel mode, not a guessed number of turns. Run a secret-bypass check from both sides.

Review every playable leaf alone; compare siblings side-by-side; examine root/floor
coverage; inspect map markers against background landmarks. Preserve growth points
without inventing inaccessible future content as already functional. Report design
tradeoffs and any unresolved canon instead of presenting every lint as a required fix.
