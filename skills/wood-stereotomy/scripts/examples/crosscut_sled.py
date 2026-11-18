"""Crosscut sled for the Grizzly G1023RLWX: two runners, reference fence nearest the
operator, guard block where the blade exits, travel stop, all checked against the blade
at 0 and 45 deg (left tilt)."""
from _common import finish, out_dir
from build123d import Pos

from woodstereo import geometry as g
from woodstereo import jigmodels as jm
from woodstereo import jigs
from woodstereo import model as m
from woodstereo import shop

profile = shop.load_shop()
saw = profile["table_saw"]

# ---- parameters (inches). Sheet thickness: measure the sheet and replace.
PLY = profile["sheet_stock"]["plywood_3_4_actual"]
P = {
    "base_t": PLY,
    "width": 30.0, "x_left": -14.0,      # base spans x -14 .. +16
    "depth": 20.0,                       # front edge y = 0 .. rear edge y = 20
    "fence_y": 3.5, "fence_t": 2 * PLY, "fence_h": 3.5,   # two laminated plies
    "rear_t": PLY, "rear_h": 2.5,
    "block_depth": 3.0, "block_height": 3.5,
    "block_width_left": 3.5, "block_width_right": 1.5,    # extra on the left: the blade leans left
    "screw_xs": [-12.0, -8.0, -4.5, 4.0, 8.0, 12.0, 15.0],
    "cleat_len": 3.0,
}
DESIGN_STOCK = saw["depth_at_0_tilt"] - P["base_t"] - 0.25   # thickest stock the sled is sized for
BEVEL_STOCK = saw["depth_at_45_tilt"] - P["base_t"] - 0.25

folder = out_dir("crosscut_sled")
parts, hardware = jm.crosscut_sled(saw, P)

# ---- travel stop and guard block, square and at full bevel
square = jigs.sled_travel(saw, P["base_t"], DESIGN_STOCK, P["fence_y"], P["fence_t"],
                          P["block_depth"], P["block_height"],
                          P["block_width_left"] + P["block_width_right"])
bevel = jigs.sled_travel(saw, P["base_t"], BEVEL_STOCK, P["fence_y"], P["fence_t"],
                         P["block_depth"], P["block_height"],
                         P["block_width_left"] + P["block_width_right"], tilt_deg=45)
# One stop serves both: the one that travels further (blade deepest into the fence), then
# re-check both settings at that stop.
arbor_common = min(square.arbor_y, bevel.arbor_y)
args = (P["fence_y"], P["fence_t"], P["block_depth"], P["block_height"],
        P["block_width_left"] + P["block_width_right"])
square = jigs.sled_travel(saw, P["base_t"], DESIGN_STOCK, *args, arbor_y=arbor_common)
bevel = jigs.sled_travel(saw, P["base_t"], BEVEL_STOCK, *args, tilt_deg=45, arbor_y=arbor_common)
stop_origin = square.sled_origin_at_stop
STOP_FACE_TABLE_Y = stop_origin + P["cleat_len"]   # the cleat's leading (far) face, in table y

# ---- hardware clearance by formula (x measured toward the lean, i.e. leftward)
hw = [jigs.hardware_at(f"screw at x {x:+g}", x - 0.082, x + 0.082, 0.0, P["base_t"] + 1.25,
                      0.0, saw["tilt_direction"]) for x in P["screw_xs"]]
slot = saw["miter_slot_center_offsets_from_blade"]
hw += [jigs.hardware_at("left runner", -slot["left"] - 0.4, -slot["left"] + 0.4, -0.4, 0.0),
       jigs.hardware_at("right runner", slot["right"] - 0.4, slot["right"] + 0.4, -0.4, 0.0)]
R = saw["blade_diameter"] / 2
formula_hits = jigs.check_hardware(hw, saw["kerf"], saw["depth_at_0_tilt"], (0.0,), radius=R) + \
    jigs.check_hardware(hw, saw["kerf"], saw["depth_at_45_tilt"], (45.0,), radius=R)

# ---- the same checks on the solid model, sled at its stop, blade at each setting
def solid_checks(travel, tilt):
    b = jm.blade(saw, travel.blade_height, tilt, travel.arbor_y)
    touched = [k for k, v in hardware.items() if m.interference_in3(b, v) > 1e-6]
    zone_front = P["fence_y"] - P["block_depth"]
    operator_zone = m.box_at((0, zone_front - 25, P["base_t"] + 10), (60, 50, 20))
    exposed = m.interference_in3(b, operator_zone)
    above_block = m.box_at((0, P["fence_y"] - P["block_depth"] / 2,
                            P["base_t"] + P["block_height"] + 5), (60, P["block_depth"], 10))
    return touched, exposed, m.interference_in3(b, above_block)

sq_touch, sq_exposed, sq_over = solid_checks(square, 0.0)
bv_touch, bv_exposed, bv_over = solid_checks(bevel, 45.0)
stops = [jigs.Stop("stop block clamped on the sled fence, keeper side", "jig", "keeper")]

runner = jigs.runner_section(saw["miter_slot"])
text = "\n".join([
    "## Crosscut sled, Grizzly G1023RLWX", "",
    "| Part | Size, in | Notes |", "| --- | --- | --- |",
    f"| Base | {P['width']:g} x {P['depth']:g} x {g.frac(P['base_t'])} | plywood; measure the sheet |",
    f"| Runners (2) | {runner.width:.3f} x {runner.height:.3f} x {P['depth']:g} | hardwood or UHMW; fit to the slots on the saw |",
    f"| Front (reference) fence | {P['width']:g} x {P['fence_t']:.3f} x {P['fence_h']:g} tall | two plies laminated; work bears on its far face |",
    f"| Rear fence | {P['width']:g} x {P['rear_t']:.3f} x {P['rear_h']:g} tall | ties the two halves together |",
    f"| Guard block | {P['block_width_left'] + P['block_width_right']:g} wide x {P['block_depth']:g} deep x {P['block_height']:g} tall | behind the front fence on the blade line, {P['block_width_left']:g} left / {P['block_width_right']:g} right of the kerf; paint it red |",
    f"| Stop cleat | 1.5 x {P['cleat_len']:g} | on the base's right edge at the front; meets a stop fixed to the table |",
    "",
    "| Setting | Blade height | Thickest stock | Guard block needs (deep x tall x wide) at the shared stop | Sled front edge at end of travel |",
    "| --- | --- | --- | --- | --- |",
    f"| Square | {square.blade_height:.3f} | {square.max_stock:.3f} | {square.exit_block_depth:.2f} x {square.exit_block_height:.2f} x {square.exit_block_width:.2f} | {square.sled_origin_at_stop:.3f} in past the table's front edge |",
    f"| 45 deg left | {bevel.blade_height:.3f} | {bevel.max_stock:.3f} | {bevel.exit_block_depth:.2f} x {bevel.exit_block_height:.2f} x {bevel.exit_block_width:.2f} | {bevel.sled_origin_at_stop:.3f} in past the table's front edge |",
    "",
    f"**Travel stop:** fix a stop block to the table beside the sled's right edge (right wing or the router table's T-track) with its face toward you {STOP_FACE_TABLE_Y:.2f} in back from the table's front edge, where the cleat's far face meets it. "
    f"The sled's front edge then sits {stop_origin:.2f} in onto the table.",
    f"**Runner fit:** start at {runner.width:.3f} x {runner.height:.3f}; plane to a sliding fit with no side play. "
    "Glue and pin the runners in the slots, set the base on them on the saw, then screw from above.",
    "**Squaring:** fix the fence at one end, run the five-cut test, pivot the other end by "
    "jigs.five_cut's correction, and repeat until it is small enough for the work.",
    "**Blade guard:** the overhead guard comes off for sled work; the guard block and the travel stop take its place. "
    "Never reach past the front fence while the blade turns.",
    f"**Below the base:** at full height the blade reaches {jigs.base_kerf_reach(saw, square.blade_height, P['base_t']):.2f} in "
    "further toward you inside the base's kerf than at its surface; keep hands off the kerf line.",
    "**Stops:** clamp length stops to the sled fence on the keeper side only. Never use the rip fence as a stop with the sled.",
    ""])

checks = {
    "travel and guard block, square": "ok" if square.ok else "; ".join(square.reasons),
    "travel and guard block, 45 deg": "ok" if bevel.ok else "; ".join(bevel.reasons),
    "hardware in the blade path (formula, 0 and 45 deg)": formula_hits or "none",
    "hardware the blade touches on the model, square": sq_touch or "none",
    "hardware the blade touches on the model, 45 deg": bv_touch or "none",
    "blade exposed on the operator side of the guard block, cu in (square / 45)":
        f"{sq_exposed:.4f} / {bv_exposed:.4f}",
    "blade above the guard block, cu in (square / 45)": f"{sq_over:.4f} / {bv_over:.4f}",
    "stop problems": jigs.check_stops(stops) or "none",
    "each fence and the guard block one piece after the kerf": all(len(v.solids()) == 1 for k, v in parts.items() if k != "base"),
    "sheet thickness used": f"{P['base_t']:.4f} (typical, not measured)",
    "miter slot offsets used": f"{slot['left']:g} / {slot['right']:g} ({slot['are']})",
}

table = jm.table_top(saw)
sled = m.assembly({**parts, **hardware})
at_stop = sled.moved(m.Location((0, stop_origin * m.IN, 0)))
show = m.assembly({"table": table, "sled": at_stop,
                   "blade": jm.blade(saw, square.blade_height, 0, saw["front_of_table_to_blade_center"])})
m.save_step(sled, folder / "crosscut-sled.step")
m.save_step(show, folder / "crosscut-sled-on-saw.step")
m.save_preview_svg(sled, folder / "crosscut-sled-preview.svg", view_from=(-1.0, -1.4, 1.1))
finish(folder, text, checks)
