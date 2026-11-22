# Drafting workflow

Model the shared interfaces first, cut both mating parts from the same surface, then give
each part a coordinate frame that can be found on the wood. Every number sent to the shop
is measured in that frame.

## Steps

1. **Skeleton.** Member axes and interface planes as parameters and frames, before any
   solid. A design change then moves the planes and every part follows.
2. **Blanks with explicit roll.** `model.blank(origin, frame, size_v, size_w, back, forward)`.
   Fix the roll in `member_frame(yaw, pitch, roll)` and say in a comment what it means
   (which face is up, which edge follows a surface).
3. **Split, don't draw twice.** `model.split_at(shape, point, normal)` returns both sides of
   one plane; `model.trim` keeps the side behind the normal. Both parts reference one
   surface and mate by construction.
4. **Fit offsets by function.** Separate named parameters. Zero on bearing and locating
   faces; relief only on inactive faces.
5. **Part frame.** Reference face (planed flat), reference edge (square to it), datum end
   (square to both). The shop reproduces this with a square and a rule.
6. **Extract per cut.** Normal in the part frame, then: saw settings for each table
   orientation; corner-edge offsets from the datum line; trace angle on each face.
7. **Templates only where they help.** Planar cuts transfer better by measured offsets.
   Curved outlines and fiddly developments get a 1:1 template.
8. **Check against the shop before cutting.** Depth of cut at that tilt, feather edges,
   insertion path, grain arrow on every part.

## What the hand traditions map to

Every hand-drafting tradition for spatial joinery draws the assembly full size, turns each
cut face into the drawing plane to see its true shape, and carries points from the drawing
onto the stock. CAD replaces the first two; the third still has to be designed.

| Traditional operation | Finds | Here |
| --- | --- | --- |
| Epure, the full-size floor drawing used to mark timbers ([French Timber Framing](https://frenchtimberframing.blogspot.com/2014)) | Axes and intersections at 1:1 | Model space; the parameter skeleton |
| Rabattement: turning a plane about a fold line into the drawing plane ([Rabattement](https://wiki.riteme.site/wiki/Folding_line)); the herse is that view of a roof plane | True shape of a face | A view normal to the face; `templates.end_cut_development` |
| Rembarrement: carrying points from plan to elevation to the timber; straight, square stock only ([French Timber Framing](https://frenchtimberframing.blogspot.com/2014)) | Points on the stock | `geometry.layout_lengths` from a datum line |
| Rabattement surface for hip and jack rafters ([SBE Builders](https://sbebuilders.blogspot.com/2013/04/traditional-layout-using-rabattement.html)) | Edge and side bevels | `geometry.face_trace_angles` |
| Kiku-jutsu and the sashigane's back scale, devised for roof corners ([JAANUS kiku](https://projects.mcah.columbia.edu/jaanus/node/3075), [JAANUS kanejaku](https://aisf.or.jp/~jaanus/deta/k/kanejaku.htm)) | Hip proportions without drawing | Closed-form functions in `geometry.py` |
| Square rule | Repeatable joints on slightly irregular stock | Housing to a defined internal section, measured from reference faces |
| Scribe rule | Fit to irregular real stock | No CAD equivalent: scribe from the mating piece |

For straight, square stock everything can be measured from datums. For round or crooked
timber the model gives only the nominal design; the scribe happens on the real parts.

## Plan sets

The plan set is what the user builds from. `plans.write_plan_set` draws it from the model,
so the drawings and the checked geometry cannot disagree.

| Sheet | Shows | Done when |
| --- | --- | --- |
| Assembly | Top, front, right views; overall sizes; a number on every part; parts list with quantities | Every part is numbered and listed |
| Section | The cut faces hatched where a groove, recess, joint or stacked part hides in the outside views | Every hidden depth is drawn and dimensioned somewhere |
| Part detail (one per distinct part) | Three views; ordinate dimensions from the REF corner to every edge, hole centre and recess, visible or hidden; hole sizes; angle of every edge that is not square; material, blank size, quantity, notes | A builder can lay out every cut with a rule from the reference edges |
| Cut list and notes | Blank sizes T x W x L, quantities, materials; hardware; build sequence; settings; MEASURE BEFORE BUILDING list | Every placeholder is listed |

Rules the drawings follow:

- **Ordinate dimensions from a REF corner.** Zero is the lower-left of each view: mark those
  faces as the reference face and edge on the part. Every layout mark is measured from them,
  never from a neighbouring feature, so errors do not add up.
- **True shape.** A part that sits rotated in the assembly (a brace, a hopper side) is given
  a `frame` so its detail sheet shows it flat, with real lengths and angles.
- **Fractions with a safety net.** Sizes print to 1/32; when rounding moves a value more than
  1/128, the decimal follows in brackets. Set `PartSpec.fit_dimensions=True` for runners
  and other fitted parts to preserve decimal targets on their detail sheets and cut lists.
- **Hidden features are dimensioned.** Ordinates include hidden edges, so a groove depth or a
  recess from below is located even when it only shows dashed.
- **Placeholders are listed, not hidden.** Anything drawn from an unmeasured figure goes in
  `verify`, and the build sequence should mark such features from the real machine where it
  can (the circle sled's pivot line is marked from the blade, not from the table figure).
- **Look at every page** before delivering. The generator lays out views and labels
  automatically; a crowded part may need a section or a split into sub-parts to read well.

## Printing 1:1

Print scaling is the commonest hidden error. Known traps: a "shrink to fit" setting
([Maker Forums](https://forum.makerforums.info/t/freecad-innacurate-1-1-printing/88136));
fit-to-page and model-extents options in SketchUp
([SketchUp forum](https://forums.sketchup.com/t/1-1-printing-plans-for-woodworking/163995)).
The SVG files from `templates.write_svg` carry their size in inches. Print at 100%, tile
if needed, and measure the 2 in calibration square with a steel rule before using any
other line ([Docuslice](https://docuslice.com/blog/2026-08-05-How-to-Print-a-Life-Size-Template-at-1-to-1-Scale/)).
Label each template with the part, its reference face and its grain direction.

The development is drawn as seen from outside the blank with the cut end toward the top of
the sheet, so the paper wraps the stock the right way round: A, B, C, D, A when the waste
is toward +u, the mirror order when it is toward -u. The cut normal always points at the
waste (`geometry.waste_direction`), the same convention as `model.trim`.
