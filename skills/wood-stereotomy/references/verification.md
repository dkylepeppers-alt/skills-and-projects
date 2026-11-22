# Tolerance, verification and the shop-ready checklist

Angle error times reach sets the fit; a closed loop multiplies it by the number of joints.

| Error per face | At 3-1/2 in | At 12 in |
| --- | --- | --- |
| 0.10 deg | 0.006 in | 0.021 in |
| 0.25 deg | 0.015 in | 0.052 in |
| 0.50 deg | 0.031 in | 0.105 in |
| 1.00 deg | 0.061 in | 0.209 in |

`geometry.angle_error_offset`, `ring_closure_error` and `stack_error` compute these for
the design in hand. Put bearing faces where the reach is short. Keep machining, stock
distortion, moisture and finish as separate lines in the budget.

Leave one part to fit. In any ring, polygon or framed field, cut all but one part to
number and the last to the measured opening, or design in a wedge, key or drawbore.

## Verification sequence

1. Check the saw against a gauge, not only its scale
   ([Woodgears](https://woodgears.ca/miter/) describes checking with a bevel gauge).
2. Cut the setting in scrap of the same thickness; for closed assemblies cut and close a
   whole loop in scrap.
3. Knife the traces from the model's offsets on every part, machine-cut ones included.
   Saw on the waste side, pare to the line.
4. Dry-fit with chalk or transfer pigment; confirm contact lands on the named bearing faces.
5. Measure each part from its own datum, never from its neighbour.
6. Record moisture content, the settings used and any relief pared, with the generator.

## Shop-ready checklist

Report each line as pass, fail or not checked.

Plan set
- A plan set PDF was produced from the model and every page was looked at.
- Every part has a detail sheet; repeated parts carry their quantity.
- Every edge, hole and recess is located from the REF corner, hidden ones included.
- Rotated parts are drawn in true shape.
- Every placeholder figure is in the MEASURE BEFORE BUILDING list.

Geometry
- Every surface is a plane, a through-cut profile, a hole or a ruled face between straight
  guides (`model.surface_audit`).
- Mating faces come from one shared plane.
- Every member's roll is fixed and stated.
- No feather edge thinner than the profile's `min_feather_edge`; small n.u cuts checked.
- Inside corners are chisel-reachable or carry the bit radius.

Tooling
- Every planar cut has settings in a feasible orientation (`shop.plan_cut`), or a named
  hand method with its guide block or wedge in the model.
- Mirrored parts are identified with the slot or flip that makes them.
- Curved outlines have a 1:1 template with calibration square, reference face and grain.

Material and assembly
- Grain arrow on every part; no short grain behind a loaded lip, peg or tenon.
- Grain direction checked on both sides of each bearing face.
- Movement computed across the widest cross-grain run and allowed for.
- Every captured part has an insertion path; each closed loop has a fitted last part or
  an adjuster.
- Every part has a reference face, edge and end, and all numbers are measured from them.

Jigs
- Registers on a named machine feature; fit built from runner_section or straddle_fit.
- No hardware in the blade's path at 0 deg and at full tilt (model and formula).
- No stop traps an offcut; the rip fence is never a stop with a sled or miter gauge.
- Guard block and travel stop contain the blade where it exits; checked on the model.
- Placeholders in the shop profile replaced with measurements, or listed as open.

Model
- Interference between mating parts is zero (`model.interference_in3`).
- Contact area matches the intended bearing (`model.contact_area_in2`).
- A preview or viewer check was looked at.
