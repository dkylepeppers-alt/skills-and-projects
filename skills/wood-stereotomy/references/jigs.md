# Jigs and fixtures for the shop's machines

A jig is a part that runs next to a blade, so it is drafted to the same rules as joinery
plus three more: it registers on a known feature of the machine, nothing hard sits in the
blade's path at any setting, and no offcut can be trapped. Model the jig, the machine
feature it rides on and the blade together, then check them together.

## Machines on file (assets/shop-profile.json)

| Machine | Facts the jigs use | Status |
| --- | --- | --- |
| Grizzly G1023RLWX table saw | Left tilt, 0-45 deg ([manual](https://www.manualslib.com/manual/63197/Grizzly-G1023rl.html)); 3 in depth at 90, 2-1/8 in at 45; front of table to blade center 17 in; table 48 x 27 in; rip 32 in right, 14 in left; 13/16 in max dado; riving knife and guard ([Grizzly](https://www.grizzly.com/products/g1023rlwx)) | spec |
| | Miter slots T-type, 3/4 x 3/8 in ([G1023 FAQ](https://support.grizzly.com/hc/en-us/articles/4411636429463-FAQ-G1023Z-10-Deluxe-Heavy-Duty-3-HP-Table-Saw-Discontinued)) | spec for the G1023 family |
| | Slot distance from the blade; blade kerf | measure |
| Router table extension | Cast-iron wing right of the blade; the Shop Fox Classic rip fence doubles as the router fence; universal T-track clamping ([Grizzly](https://grizzly.com/products/G1023SLWX3)) | spec; insert and slot measure |
| Rip fence | T-square (Shop Fox Classic). Owner's auxiliary fence 4.5 in tall with a face T-slot centered 1.75 in up, and a top T-track carrying JessEm Clear-Cut TS stock guides ([WWJ](https://www.woodworkersjournal.com/jessem-clear-cut-ts-stock-guides/)) | owner; fence thickness measure |
| Shop Fox W1849 bandsaw | Table 21-3/4 x 16-1/8 x 1-1/2 in; tilt 5 L / 45 R; 14 in resaw; 13-1/2 in throat (12 with fence); 120 in blade, 1/8-3/4 in; aluminum T-channel fence ([manual](https://www.elitemetaltools.com/sites/default/files/product-data/manuals/w1849_m.pdf)) | spec |
| | Miter slot size; table front edge to the blade's teeth | measure |
| Sheet stock | "3/4 in" plywood is commonly 23/32 in; measure each sheet ([Inch Calculator](https://www.inchcalculator.com/actual-plywood-thickness-size/)) | typical |

Placeholders print as such in every shop sheet. Replace them with measurements before a
jig is built to a number that matters (a straddle fit, a pivot line).

## Rules every jig passes

1. **Register on a machine feature you can name.** Miter slot (runner), rip fence
   (straddle), table edge (stop lip), table surface (base). Build the runner or straddle
   from `jigs.runner_section` / `jigs.straddle_fit`, then fit it on the machine.
2. **Nothing hard in the blade's path at any setting.** Screws, clamps, T-track, runners
   and pins stay out of the kerf zone at 0 deg and at full tilt. On this saw the blade
   leans left, so the zone widens leftward with height (`jigs.check_hardware`,
   `jigs.hardware_at`). Sacrificial wood (sled fences, guard blocks, a work stop strip) may
   be cut; name it as sacrificial.
3. **No trapped offcuts.** A stop on the offcut side, or one fixed to the table, traps the
   offcut against the blade; use the keeper side or a stand-off that the work leaves
   before the blade (`jigs.check_stops`). Never use the rip fence as a stop with a miter
   gauge or sled ([Fine Woodworking](https://www.finewoodworking.com/2017/05/25/clever-stop-block-crosscutting-tablesaw)).
   A spacer prevents trapping the offcut between blade and stop block
   ([Woodcraft](https://www.woodcraft.com/blogs/sanding-finishing/sawing-small-parts-making-little-cuts-with-big-tools)).
4. **Contain the blade where it leaves the work.** On a crosscut sled the hazard is the
   blade's exit at the front fence; fit a guard block there and a travel stop so the blade
   never emerges from it ([Fine Woodworking](https://finewoodworking.com/2024/12/17/314-small-stick-stops-crosscut-sled-in-safe-position)).
   `jigs.sled_travel` sizes both from the blade geometry and the saw's 17 in table-front
   figure, and reports how far the blade reaches inside the base's kerf below the surface.
5. **Hold-downs for anything small, sloped or on end.** Toggle clamps, a clamped part on
   a ramp, a clamp on the tenon jig. Hands stay out of the blade's line front and back.
6. **The overhead guard usually comes off for jig work.** The jig then supplies the
   guarding: guard block, travel stop, enclosed blade. Follow the saw manual on the
   riving knife for each cut.
7. **Left tilt.** A bevelled crosscut on a sled cuts a wider wedge through the sled's left
   side; keep fence screws and clamps clear there. A beveled left-tilt saw can cut into a
   crosscut fence in some setups ([Sawmill Creek](https://sawmillcreek.org/goto/post?id=3323908)),
   which `check_hardware` at 45 deg catches. Fence-riding jigs on the right of the blade
   gain clearance as the blade tilts away.
8. **Check it square, then record it.** Square a sled fence with the five-cut test, which
   multiplies the error by four ([The Wood Whisperer](https://thewoodwhisperer.com/articles/how-much-error-is-too-much/));
   `jigs.five_cut` turns the two strip widths into a correction at the fence's end.

## Jig types and their math

| Jig | Registers on | Key numbers | Function |
| --- | --- | --- | --- |
| Crosscut sled | Both miter slots | Runner section; blade height for the stock; travel stop; guard block depth, height, width | `runner_section`, `blade_height_for`, `sled_travel`, `base_kerf_reach` |
| Carrier wedge (ramp or cradle on the sled) | Sled base and fence | Wedge angle that brings a compound or over-45 cut inside the saw's range | `carrier_for_tilt`, `carrier_options`, `bevel_hand` |
| Tenoning jig | Rip fence (straddle) | Inside width; blade offset from the jig face; hardware above the blade | `straddle_fit`, `check_hardware` |
| Bandsaw circle sled | Miter slot and table front edge | Pivot line on the line square to the blade through the front of the teeth ([Fine Woodworking](https://finewoodworking.com/?p=4213)); lip offset = table front to blade + lip ([Woodcraft](https://www.woodcraft.com/blog_entries/bandsaw-circle-cutting-jig)) | `circle_jig` |
| Paring block, saw guide, shooting board | The work, by clamp | The cut plane's trace angles | `geometry.face_trace_angles` |

**Carrier wedges.** A wedge rotates the part about one axis so the blade sees a different
plane. A ramp ("across") lifts one end of the part along the fence; a cradle ("along")
rolls it about its length. The same rotation can bring a cut past 45 deg inside the saw's
range (a 60 deg end bevel = 15 deg ramp + 45 deg tilt) or turn a compound cut into a
square-blade miter. Keep wedges at or below about 30 deg so the part sits firmly, and check
that the bevel leans the way the saw tilts (`bevel_hand`); otherwise turn the part over.

**Tenoning jig on this fence.** The jig straddles the 4.5 in auxiliary fence; its bridge
clears the top T-track (remove the JessEm stock guides first) and its tall upright slides
over the face slot (keep T-bolt heads flush). Set the blade so the keeper is between the
blade and the jig and the offcut falls free on the far side. A thick laminated bridge
damps vibration, and straddling the fence lets the jig work either side of the blade
([Fine Woodworking](https://finewoodworking.com/2021/02/24/shopmade-tablesaw-tenoning-jig)).

## Modeling a jig

`scripts/woodstereo/jigmodels.py` builds the saw table (with slots), the blade (raised and
tilted the saw's way), screws, the crosscut sled and ramps. Check with
`model.interference_in3`:

- blade vs every hardware solid: zero at 0 deg and at full tilt, with the jig at the end of
  its travel;
- blade vs a box on the operator side of a guard block: zero;
- jig vs the machine feature it rides on: zero, with the designed clearance measured.

Start a new jig by copying the nearest example: `crosscut_sled.py`, `carrier_wedge.py`,
`tenon_jig.py`, `circle_jig.py`.
