# Design principles

Condensed from the source report *Stereotomy in wood: spatial joinery, compound cuts, and
assemblies shaped by grain*. Stereotomy is the design and cutting of solid pieces to fit a
three-dimensional assembly; wood adds a directional material whose fibers run through
every cut.

## Four questions for every joint

| Question | Establish |
| --- | --- |
| Where do the parts meet? | Stock axes and reference faces; the shared interface. |
| How does the force cross? | Each bearing face, the retained section, each restraint; grain direction in both pieces. |
| How do the parts go together? | A tool path and a collision-free insertion path; the last piece of any closed assembly. |
| How does the fit change? | Assembly moisture, the datum, and room to move where restraint is not needed. |

## Geometry of a flat interface

With unit vectors u along the member, v across its width and w across its depth, a point
on a corner edge is P = O + t u + a v + b w, where O is where the centerline meets the cut
plane and (a, b) are the signed half-sizes. The plane n . (P - O) = 0 gives

    t = -[a (n.v) + b (n.w)] / (n.u)

Solve once per corner and join adjacent points on each face (`geometry.corner_offsets`).
When n.u is zero the edges run parallel to the plane and no end cut exists. A small n.u
gives a long cut and a thin feather edge: check stock length and tool reach.

Roll is a design decision. An axis fixes yaw and pitch only; the blank can still turn about
it. State which face stays upright, which edge follows a surface or which face meets the
fixture. Two blanks on one axis with different roll need different traces.

True pitch uses total horizontal run. A member rising 1 for 2 in x and 2 in y has an
apparent 1:2 slope in the x-z elevation but a true pitch of atan(1/sqrt 8) = 19.47 deg.

## Give each face a job

- Start from a free-body sketch: compression, tension, shear, rotation, load reversal.
- A bearing face supplies only a reaction normal to itself. In-plane load needs friction,
  a second shoulder, a key or a fastener. Uplift and withdrawal need a restraint that stays
  engaged when a compression face opens.
- Resolve the member force at the face (`geometry.force_components`). For the report's
  brace, the normal part is 2/3 and the in-plane part is sqrt(5)/3 of the axial force, so
  friction alone would need a coefficient of about 1.12. Add a seat and side shoulder.
- Oblique face area is the square section divided by |n.u|. Real contact can be far less:
  a high corner or interrupted face concentrates load.
- Check bearing direction in each piece. One shoulder can load the brace along its grain
  and crush the receiver across its grain.

## Keep long grain behind the feature

| Inspect | Failure to look for |
| --- | --- |
| Bearing face and shoulder | Crushing, indentation, gaps that close only under deflection |
| Mortise cheeks, notch roots | Splitting across grain, short grain, sharp re-entrant corners |
| Loaded end, remaining section | Shear-out along grain, reduced section, a split at a peg |
| Keys, pegs, wedges | Withdrawal, peg bending or shear, hole bearing, wedging across grain |

A peg hole near an end, a thin dovetail lip or a swept cut across the fibers leaves a short
length of grain behind the load. Turn the stock, move the feature or thicken its root. A
deeper notch adds bearing area and removes section: check both. A seat that closes under
gravity may need positive restraint when lifting or racking reverses the reaction.

## Seasonal movement

Wood moves most tangentially (flatsawn width), less radially (quartersawn width) and very
little along the grain. Estimate with change = D x C x dMC, valid over about 6-14% moisture
content (`geometry.movement`). White oak: C_radial 0.00194, C_tangential 0.00376 per
percent. Six inches from 8% to 12% moves about 0.047 in radially and 0.090 in tangentially.

| Feature | Fit strategy |
| --- | --- |
| Primary bearing or locating face | Seat from a known datum; mark contact in dry fit; pare high spots first. |
| Guided faces, hidden bottoms | Lead-in on guiding edges; relieve inactive surfaces so a hidden high spot cannot hold a shoulder open. |
| Wide cross-grain interface | Fix the functional datum; float the rest in a groove or slot. |
| Green or exposed timber | Map drying shrinkage, checking and drainage; no deep water-trapping pockets. |

Budget machining variation, stock distortion, moisture change and finish thickness as
separate lines. A wedged or drawbored joint needs room for its pull without splitting.

## Whole assemblies

| Type | What sets the cuts |
| --- | --- |
| Segmented compression arch | Joint layout around the arch; thrust line, slip and support thrust; blocks must not bear toward short grain. |
| Curved lamination | Mold surface and final cutting envelope are separate; fibers tangent to the curve; springback and machining allowance. |
| Reciprocal frame | Support loop and overlaps before notches; eccentric reactions; erection order of the last members. |
| Folded panel shell | Folds and edge load paths first; one coordinated insertion direction per panel. |

Planar facets can stand in for curved work: choose the seams first and compare the facet
mismatch with the finish needed. With stock of real thickness, derive the inside and
outside traces from the same interface plane. Decomposing a node into parts that can each
be cut also decides which pieces can later be removed or replaced.
