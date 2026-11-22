# Worked examples

Run any of them with `python scripts/examples/<name>.py --out build`. The four jig
examples use the machines in the shop profile. Each writes its plan set
(`<name>-plans.pdf`: assembly, sections, a dimensioned sheet per part, cut list and notes),
a STEP file, a hidden-line preview SVG and `shop-sheet.md`; the brace also writes a 1:1
development as DXF and SVG. Copy the nearest one as the starting point for a new design.

| Example | Shows | Must reproduce |
| --- | --- | --- |
| `brace.py` | A skewed brace cut to a vertical face: frames, one interface plane, corner offsets, choosing the face that goes down | Offsets 0.586 / 2.177 / 3.414 / 1.823 in from a 2 in datum; A+C = B+D = 4.000; on the 3-1/2 face: tilt 45.00, miter 19.47 (fits); on the 1-1/2 face: tilt 13.63, miter 46.69 (too tall); bearing area 7.875 sq in; friction would need about 1.12 |
| `hopper.py` | A splayed polygon box built from half-spaces, with closed-form settings asserted against the model | 4 sides at 15 deg: tilt 43.08, miter 14.51, edge bevel 15; slant 6.212; inside 8.000 / 11.215; outside 9.553 / 12.768; blank 6.413 (6-13/32) |
| `segmented_ring.py` | A mitered ring with chordwise grain and the closure-error rule | 12 segments: outer flat 3.215, inner 2.412, 15 deg miters; 0.25 deg per face gives 6 deg around |
| `abeille_vault.py` | Identical interlocking blocks, frame strips, grain choice, thrust, movement and stack-up | 2 x 2 x 1 in block at 25 deg: travel 0.466, tops 1.067 and 2.933; zero interference with neighbours and frame; thrust 1.07 per face |
| `mortise_tenon.py` | Ordinary joinery by the same rules: shared envelope, relieved bottom, drawbore | 3/4 rail: 1/4 tenon; zero interference; 1/16 gap behind the tenon end |
| `crosscut_sled.py` | G1023RLWX sled: runners, reference fence, guard block, travel stop, checked against the blade at 0 and 45 deg | Blade 3.000 for 2.031 stock; one travel stop (cleat face 13.75 in from the table front) for square and 45 deg; guard block needs 1.95 deep x 2.78 tall square, 3.25 wide at 45; no hardware touched; zero blade volume outside the block |
| `carrier_wedge.py` | A 60 deg end bevel past the 45 deg limit: 15 deg ramp on the sled + 45 deg blade | Bevel measured on the model 60.00 deg; blade 2.074 of 2.125 at 45; ramp clear of the leaning blade |
| `tenon_jig.py` | Straddle jig on the 4.5 in aux fence with a sacrificial work stop | Zero overlap with fence and track; 1/64 side play; blade path meets only the stop; fence thickness is a placeholder |
| `circle_jig.py` | W1849 circle sled: runner, front lip stop, sliding pivot bar | Pin on the pivot line; blade at the stop clear of bar, pin, runner and lip from 2.5 to 11 in radius; slot and table-front figures are placeholders |

## Notes that carry over to new designs

**Brace.** The receiving face gives only a normal reaction, so add a seat or side shoulder
for the in-plane part of the load (about three quarters of the axial force here). A 45.00 tilt sits on the stop: verify it and
pare to the knifed traces.

**Hopper.** A miter-gauge error acts over the slant (0.027 in at 0.25 deg here); a tilt
error acts over the thickness (0.003 in). Calibrate the gauge first. Cut and tape-fit
four scrap sides before the good stock.

**Ring.** A single layer puts every near-end-grain seam across the hoop load. For handling
or bending, add a second ring turned half a segment so its pieces bridge the seams. Rout
or saw the round outline after gluing.

**Abeille vault.** Grain runs between the overhangs, so each lip has continuous fibers
behind it; the price is end grain bearing on side grain at every contact, so use a dense
species. A shallow slope wedges harder against the frame (thrust per face is
1 / (2 tan slope) of a block's load); a steep one thins the top across the ramps. Blocks
cannot share a crosscut, so allow a wedge and kerf per end. The frame needs folding wedges
on two adjacent sides: rows change length with moisture and with stack-up. A peripheral
frame in compression is what holds such a field together
([Lecci et al. 2021](https://link.springer.com/article/10.1007/s00004-020-00541-w)).
The numbers cover geometry and one block's own load only.
