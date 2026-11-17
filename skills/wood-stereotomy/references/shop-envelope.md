# The shop envelope and saw settings

Without CNC a part is limited to planar faces, profiles cut straight through the
thickness, holes, and ruled faces worked between straight guides. Draft inside that.

## What each tool makes (default shop)

| Tool | Makes | Design around |
| --- | --- | --- |
| Table saw + miter gauge | Rips, crosscuts, bevels, compound cuts | Tilt one way, 0-45. Typical 10 in saws cut about 3-1/8 in deep at 90 and 2-1/8 to 2-1/4 in at 45 ([DeWalt](https://dewalt.ca/product/dwe7491rs/10-jobsite-table-saw-and-rolling-stand), [Rikon](https://toolstoday.com/rikon-10-205-10-inch-contractor-saw-with-steel-wings.html)). Mirrored compound ends need the other miter slot. Small parts go on a sled. |
| Bandsaw | A 2D profile straight through; tilted table for tilted profiles; two crossing profiles | Surface is straight along the blade. Fair to the line afterwards. |
| Router, handheld or table, with bearings and templates | Copies of a template outline; rebates, grooves, dados; chamfers at the bit's angle | Inside corners keep the bit radius. Bevels only at owned bit angles. |
| Drill press | Holes at a set angle | Axis must be reachable from a stable face. |
| Planes, shooting boards | True flat faces and edges to a knife line | Needs a registration face. |
| Chisels, paring blocks | Flat facets to knife lines; square inside corners | Needs a sight line and a bearing surface for the chisel back. |
| Handsaws with guide blocks | Flat cuts at any angle | As accurate as the guide and the layout. |
| Spokeshave, rasp | Fair curves; twisted faces between two straight edges | Lowest accuracy: keep off bearing and locating faces. |

There is no miter saw in the default profile. Compound crosscuts go to the table saw's
miter gauge or a sled, or are cut by hand.

## From cut plane to settings

Part on the table, x along it toward the blade, y across it on the table, z up, unit
normal n of the cut plane:

    tilt  B = asin |n.z|            (from vertical)
    miter M = atan (|n.y| / |n.x|)  (from square)

M is also the trace angle on the face lying on the table, so the bevel-gauge line and the
miter gauge agree. The trace on the upright edge is atan(|n.z| / |n.x|), which is not B
unless M is zero. `geometry.saw_settings` does this; `geometry.cut_orientations` returns
both ways a rectangular blank can lie; `shop.plan_cut` checks each against the profile.

Choosing the face that goes down: tilt within the saw's range, miter within the gauge's
range, stock height within the depth of cut at that tilt. Depth between 0 and 45 is
interpolated from the profile, which is an estimate: confirm near the limit. A setting
that lands on the 45 stop is flagged: check the stop with a gauge and plan to pare.

Mirrored parts: the saw tilts one way, so the mirrored end is cut with the gauge in the
opposite slot on the other side of the blade
([Compound Angles Without Math](https://www.mathscinotes.com/wp-content/uploads/2014/08/Compound-Angles-Without-Math.pdf)).

When no orientation fits, `plan_cut` returns a hand method: knife the four traces from
the corner offsets, saw on the waste side against a guide block, pare to the lines.

## Polygons and hoppers

N sides, splay S from vertical, butt-mitered corners (`geometry.hopper_settings`):

    B = asin(cos S * sin(180/N))     M = atan(sin S * tan(180/N))

Ten sides at 40 deg give 13.69 and 11.80, matching the published Woodgears figures
([Woodgears](https://woodgears.ca/miter/)). Top and bottom edges are ripped at S.

Two turns that are easy to confuse when ripping both edges of a strip:

- Turn it **face-over** for parallel bevels (hopper sides: a parallelogram section).
- Turn it **end-for-end** for converging bevels (a strip that narrows toward one face).

## Fixtures that simplify cuts

Hold the part at its compound orientation and let the tool make a simple cut. Design the
fixture in the same model from the same planes.

| Fixture | Turns | Note |
| --- | --- | --- |
| Wedge on a sled | A compound cut into a single bevel ([WOODWEB](https://woodweb.com/knowledge_base/Figuring_Complex_Leg_Angles_for_Furniture.html)) | Saw the wedge at the model's angle; label it. |
| Auxiliary fence with stop | One good cut into many | Hold the work down as well as against the fence ([Woodgears](https://woodgears.ca/miter/)). |
| Paring block or saw guide | A machine-cut angle into a hand cut | For parts too tall or long for the saw. |
| Angled shooting board | A sawn face into a true one | One per angle; good for ring segments. |
| Router template from a 1:1 print | A curve into copies | Bearing-guided bit. |
| Bevelled cauls | Clamp pressure square to a miter ([Woodgears](https://woodgears.ca/miter/)) | Scrap cut at the joint angle. |

Glue-up order is part of the design: one joint at a time for mitered loops, and two
halves trued before joining for rings.
