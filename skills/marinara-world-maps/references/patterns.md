# World patterns and their tradeoffs

These are design recipes, not mandatory schemas. Encode complete objects using the
templates. Every example must respect native containment traversal: explicit links do
not disable parent/child routes. Review runtime.md for actual travel and gate behavior.

| Setting | Suggested containment | Travel and creative checks | Art plan |
| --- | --- | --- | --- |
| House/manor | Building → sibling floors → selected rooms | Public/private/service paths; audible adjacency; ordinary routines | Building plate, every floor landing policy, room plates; floor plans only for map parents |
| Academy/campus | Grounds → buildings/places → floors → rooms | Student, staff and maintenance routes; social territories; shared landmarks | Distinct overview canvas plus grounds plate; all wrapper floors counted |
| Town | Settlement → landmarks/districts → scene interiors | Streets and loops; food, water, worship, work; unequal detail | Navigational town canvas; exteriors and important interiors |
| City | City → districts → buildings → scenes | Transit connections, class/authority gradients, different night geographies | District canvases where useful, coherent neighbourhood palettes |
| Tower | Building → sibling floors with layerOrder | Adjacent stairs/lifts; root containment may bypass intended sequence | Shared architecture, identifiable landings; vertical plates when useful |
| Vessel/station | Vessel → decks/rings → compartments | Forward/aft and emergency routes, maintenance access, isolation | Materials/camera family; deck backgrounds separate from corridor references |
| Wilderness | Region → meaningful landmarks | Terrain, water, weather exposure and journey texture; sparse roads/trails | Broad views and readable regional canvas; no implied exact survey |
| Dungeon | Spatial zones → meaningful chambers | Loops, thresholds, resource decisions, return routes, actual gates | Viewpoint continuity at doors/stairs; clear geometry where navigation matters |

## Small house

Place ground floor, upper floor and cellar as siblings with layerOrder 0, 1 and -1.
The building uses layers; each floor may use list or map. Doors and stairs can be
explicit links between the rooms where they physically begin. Keep a floor node if it
provides meaningful orientation or a landing scene. A bathroom can be a child of its
suite if that reflects access, but check what default containment makes traversable.

## Tall structures

A 25-floor building is feasible with sibling floors; a 25-deep containment chain exceeds
the 20-level bound. Name floors in the setting's voice using profile labels and stable
IDs. Do not claim that a stair-link chain forces visiting each level: ordinary containment
can offer building → any active floor. If enforced sequence is essential, design and
test a separate accessibility structure or supported state changes, and explain the
tradeoff in hierarchical browsing.

## Social places

Give a hub a reason people return: meals, transport, gossip, study, repairs or a view.
Connect it to a few contrasting places. Seed observable traces of activity, not a fixed
cast baked into every image. Pin stationary lore only where appropriate; roaming NPCs
need their own activation logic. “Usually here” does not become an automatic schedule.

## Gated zones and passages

Separate route discovery, story permission and actual availability. A hidden outward
link plus an available return can express asymmetry, but only after testing parent
routes and reverse bidirectional links. An available edge elsewhere may intentionally
make a blocked door a detour rather than a sealed room; do not “fix” that without asking.

For a genuinely sealed island/otherworld, separate roots can avoid an active shared-root
shortcut. This is valid but changes browsing. Alternatively, keep future content outside
the active definition or archive coherently until an authored change. Names and memories
are not a secure fog-of-war system.

## One-way routes

Chutes, currents, gates and portals need a deliberate return/escape policy. Verify it
with the complete graph. A pit under a public parent is not mechanically inescapable
because its link is one-way. A blocked hatch plus an available parent route may defeat
the intended trap. Avoid accidental soft-locks and do not promise game adjudication
from a descriptive warning.

## Tides and other conditions

A prose rule such as “the causeway floods at high tide” guides narration, not an
automatic timed link mutation. Choose manual state updates, a separately implemented
mechanic, or an explicitly narrative constraint. Keep current state distinct from
default environmental description and mention the enforcement level in the handoff.

## Mobile places

A vessel can remain a stable separate root while its connection to a port is updated
deliberately, or be reparented with care. Neither happens automatically from naming it
a ship. Preserve IDs and review history/bindings. Moving vehicles are not automatically
valid durable-discovery targets just because a model mentions them.

## Placement

For a first draft, radial layout can provide nonidentical coordinates; it is not real
geography. Prefer authored geographic placement once a canvas exists. Choose a margin
and spacing appropriate to marker size and screen shape; a fixed four-unit separation
is a heuristic, not a guarantee against overlaps. Keep important transit directions in
text even when the marker layout looks obvious.
