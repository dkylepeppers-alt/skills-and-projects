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
| Part master (one per distinct part) | True-shape orthographic views; overall finished sizes, stock cross-section, reference faces, quantity, grain and feature IDs | A builder can identify the timber, orient it on the bench and find each detail |
| Enlarged feature details | Actual tool or tongue profile, overall locator, size, position, depth, angles, bore centreline and diameter, mating part ID | A builder can knife, drill and cut every feature without guessing or reading a separate coordinate schedule |
| Cut list and notes | Blank sizes T x W x L, quantities, materials; hardware; build sequence; settings; MEASURE BEFORE BUILDING list | Every placeholder is listed |

Rules the drawings follow:

- **Conventional dimensioning.** Use dimension lines parallel to the measured distance,
  paired arrowheads, thin extension lines from actual edges or centre marks, readable
  values and consistent text orientation. Short spans get exterior arrows. Put local
  widths and depths nearest the object, overall size outside. Measure position from the
  same physical REF end/face; never move the datum merely to fit a view. Chain dimensions
  may communicate spacing but must not replace a fit-critical datum location.
- **No ordinate fans.** Do not automatically label every vertex in a tight column or
  displaced leader stack. Use a local detail at a larger scale and labelled locator on
  the main part. Three lanes per axis is the default ceiling; use another sheet instead
  of shrinking type. Do not crowd diameter leaders into hidden edges.
- **True shape.** A part that sits rotated in the assembly (a brace, a hopper side) is given
  a `frame` so its detail sheet shows it flat, with real lengths and angles.
- **Exact dimensions.** Prefer clean fractions when exact, otherwise decimal inches to
  sufficient precision for the cut (especially miniature stock and fit relief).
  Set `PartSpec.fit_dimensions=True` for fitted parts. A displayed 0 for a nonzero cut
  is a defect. Distinguish rough blank from finished bounding box: use
  `PartSpec.stock_size` whenever they differ.
- **Hidden features are dimensioned.** A dashed edge is not a depth specification.
  Use a section or complementary view showing the actual bottom/shoulder. A drilled
  hole needs Ø, centre position, drill path (through or blind depth) and axis direction.
  For skew bores provide a true axis-normal view and section; an oval projection is not diameter.
- **Placeholders are listed, not hidden.** Anything drawn from an unmeasured figure goes in
  `verify`, and the build sequence should mark such features from the real machine where it
  can (the circle sled's pivot line is marked from the blade, not from the table figure).
- **Look at every page** before delivering. The generator paginates dimension lanes
  but does not infer machining intent or guarantee collision-free leaders. Review at
  intended print size. Supplement or customize it when needed.

## Timber-frame detailing and drawing coverage

Design traditional joints as actual solids: housed or shouldered mortise-and-tenon,
braces with angled shoulders and tenons, rafter seats/housings, purlin or ridge joints,
laps or scarfs where needed, and pegs where they actually retain a joint. Do not use
butt connections hidden under sketches or arbitrary cross-member overlaps. Check the
remaining section, bearing, cheeks, end distances, grain and assembly order;
proportion to actual miniature stock instead of blindly applying full-size offsets.
Pegs must pass through intended members without colliding with other mortises.

Retain blanks, trimmed bodies, finished solids, mating tongues and actual clipped cut
volumes. For each joint record a stable ID, male/female marks, cut role, reference
frame, clipping against stock, and intended fit. Pass the same shapes to
`PartSpec(features=[plans.FeatureSpec("J01", cut, "MORTISE", mate="T01",
notes=["Blind depth ..."])])`. Shapes are in assembly coordinates; the part frame
transforms them into true local views. The cut is enlarged on the detail sheet and
located on the full part locator. Select views that convey the cut; add a custom
section for nonorthogonal features. For complex parts named feature details, not the
generic projected-edge fallback, are authoritative. Include stock-profile cuts as
features too. Provide stable drawing IDs and locator labels on master views; group
only identical geometry with matching handedness.

Set `PartSpec.datum=(x,y,z)` in local inches for the physical datum (default:
local finished bounding-box minimum); it is projected into every feature view,
including reversed views. Set `grain` and state the actual reference faces in
the part notes. Use a visible-opening view for a blind recess, even if that
requires "back", "bottom" or "left". Two complementary feature views are paired
at one scale; request the third only if it conveys additional machining geometry.
Specifying features declares a complete feature register and suppresses the
repetitive projected-edge fallback. Record stock profiles and all other cuts.

Before delivery reconcile the assembly occurrence list, unique marks, quantity,
cut list, features per part, mating feature IDs and dimensioned drawing references.
Every modeled feature must have a drawing; every drawn feature must come from
the same model. For drafting-only revisions freeze the STEP and compare regenerated
solids' count, bounds and volume (and relevant feature coordinates) before claiming
geometry is unchanged. Preserve the prior revision; do not quietly redesign.
Use `plans.coverage_report(plan)` to identify unmatched marks, ambiguous matches,
quantity discrepancies and duplicate feature IDs; explicitly document machine
reference geometry. The report cannot infer unrecorded machining features.

## Printing 1:1

Print scaling is the commonest hidden error. Known traps: a "shrink to fit" setting
([Maker Forums](https://forum.makerforums.info/t/freecad-innacurate-1-1-printing/88136));
fit-to-page and model-extents options in SketchUp
([SketchUp forum](https://forums.sketchup.com/t/1-1-printing-plans-for-woodworking/163995)).
The SVG files from `templates.write_svg` carry their size in inches. Print at 100%, tile
if needed, and measure the 2 in calibration square with a steel rule before using any
other line ([Docuslice](https://docuslice.com/blog/2026-08-05-How-to-Print-a-Life-Size-Template-at-1-to-1-Scale/)).
Label each template with the part, its reference face and its grain direction.

Keep patterns in a separate printer-friendly PDF from the scaled construction set.
Use `templates.write_pdf(path, lines, labels, title="P01", orientation="REF at left; grain along length")`
to produce actual-size letter sheets directly; it tiles oversized layouts without rescaling.
If a 1:1 piece fits on one letter page, print it whole, with margin for a physical
printer. If not, use overlapping tiles with registration marks, row/column and
part IDs, orientation and a calibration square or check bar on every sheet. Never
fit-to-page or crop the cut line silently. Verify the exported PDF media box and
actual PDF line lengths, all template ink inside printable margins, registration
between adjacent tiles, and every labeled feature against the model. Render and
inspect all pattern pages as well as drawings.

The development is drawn as seen from outside the blank with the cut end toward the top of
the sheet, so the paper wraps the stock the right way round: A, B, C, D, A when the waste
is toward +u, the mirror order when it is toward -u. The cut normal always points at the
waste (`geometry.waste_direction`), the same convention as `model.trim`.
