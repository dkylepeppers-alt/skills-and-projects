"""Carrier wedge on the crosscut sled: a cut the saw cannot make directly, split between a
wedge under the part and the blade. Default: a 60 deg end bevel on 3/4 x 3-1/2 stock,
past the G1023RLWX's 45 deg tilt limit."""
from math import acos, cos, degrees, radians, sin

from _common import finish, out_dir
from build123d import Pos, Rot

from woodstereo import geometry as g
from woodstereo import jigmodels as jm
from woodstereo import jigs
from woodstereo import model as m
from woodstereo import shop

profile = shop.load_shop()
saw = profile["table_saw"]

# ---- the cut, in the part's frame lying flat: x along the part toward the blade, y across
# it on the table, z up. The normal points at the waste. 60 deg end bevel from square:
BEVEL = 60.0
TARGET = (cos(radians(BEVEL)), 0.0, sin(radians(BEVEL)))
PART_T, PART_W, PART_L, WASTE = 0.75, 3.5, 12.0, 1.5
RAMP_LOW, RAMP_LEN, MARGIN = 0.25, 10.0, 0.25
SLED = dict(base_t=profile["sheet_stock"]["plywood_3_4_actual"], width=30.0, x_left=-14.0, depth=20.0,
            fence_y=3.5, fence_t=2 * profile["sheet_stock"]["plywood_3_4_actual"], fence_h=3.5,
            rear_t=profile["sheet_stock"]["plywood_3_4_actual"], rear_h=2.5, block_depth=3.0,
            block_height=3.5, block_width_left=3.5, block_width_right=1.5,
            screw_xs=[-12.0, -8.0, -4.5, 4.0, 8.0, 12.0, 15.0], cleat_len=3.0)

folder = out_dir("carrier_wedge")
direct = g.saw_settings(TARGET, (1, 0, 0), (0, 1, 0), (0, 0, 1))
options = jigs.carrier_options(TARGET, saw)
choice = next((c for c in options if c.axis == "across"), None)
assert choice, "no ramp carrier fits this saw: try a cradle (axis 'along') or a hand cut"
world_n = jigs.normal_after_carrier(TARGET, choice)
hand = jigs.bevel_hand(world_n, saw["tilt_direction"])
assert hand is None, hand

# ---- model: sled, ramp left of the kerf rising away from the blade, part on the ramp
parts, hardware = jm.crosscut_sled(saw, SLED)
b = SLED["base_t"]
lean_at_low = jigs.tilt_offset(b + RAMP_LOW, choice.tilt)
x_low = -(lean_at_low + saw["kerf"] / 2 + MARGIN + 0.25)          # set back from the leaning blade
y_work = SLED["fence_y"] + SLED["fence_t"]
wedge = jm.ramp(RAMP_LEN, PART_W, RAMP_LOW, abs(choice.wedge_deg), x_low, -1, y_work, b)
# local frame: x = 0 where the part leaves the ramp's low end; part runs from -(L - waste) to +waste
part = m.box_at(((WASTE - (PART_L - WASTE)) / 2 + 0, PART_W / 2, PART_T / 2), (PART_L, PART_W, PART_T))
part = Pos(x_low * m.IN, y_work * m.IN, (b + RAMP_LOW) * m.IN) * (Rot(0, choice.wedge_deg, 0) * part)
blade_n = (cos(radians(choice.tilt)), 0.0, sin(radians(choice.tilt)))   # left tilt: x and z same sign
keeper = m.trim(part, (0, 0, 0), blade_n)

# ---- measure the cut on the model
along = (cos(radians(choice.wedge_deg)), 0.0, -sin(radians(choice.wedge_deg)))
up = (sin(radians(choice.wedge_deg)), 0.0, cos(radians(choice.wedge_deg)))
cut_face = max(keeper.faces(), key=lambda f: abs(f.normal_at(f.center()).dot(m.Vector(*blade_n))))
fn = cut_face.normal_at(cut_face.center())
measured = degrees(acos(min(1.0, abs(fn.X * along[0] + fn.Z * along[2]))))
z_top = cut_face.bounding_box().max.Z / m.IN
long_point = "bottom" if (fn.X * up[0] + fn.Z * up[2]) * (1 if fn.dot(m.Vector(*blade_n)) > 0 else -1) > 0 else "top"

travel = jigs.sled_travel(saw, b, z_top - b, SLED["fence_y"], SLED["fence_t"], SLED["block_depth"],
                          SLED["block_height"], SLED["block_width_left"] + SLED["block_width_right"],
                          tilt_deg=choice.tilt)
bl = jm.blade(saw, travel.blade_height, choice.tilt, travel.arbor_y)
touched = [k for k, v in {**hardware, "ramp": wedge}.items() if m.interference_in3(bl, v) > 1e-6]

rows = "\n".join(f"| {c.axis} | {c.wedge_deg:+.2f} | {c.tilt:.2f} | {c.miter:.2f} |" for c in options)
text = "\n".join([
    f"## Carrier wedge: {BEVEL:g} deg end bevel", "",
    f"Direct on the saw this needs tilt {direct[0]:.2f} and miter {direct[1]:.2f}: past the {saw['tilt_max_deg']} deg limit.", "",
    "| Carrier axis | Wedge, deg | Blade tilt | Miter |", "| --- | --- | --- | --- |", rows, "",
    "'across' is a ramp along the fence that lifts one end of the part; 'along' is a cradle that rolls it about its length.", "",
    "| Item | Value |", "| --- | --- |",
    f"| Chosen | {choice.axis} ramp, {abs(choice.wedge_deg):.2f} deg, blade {choice.tilt:.2f} deg left, miter {choice.miter:.2f} |",
    f"| Ramp | {RAMP_LEN:g} long x {PART_W:g} wide, {RAMP_LOW:g} thick at the low end, rising away from the blade |",
    f"| Ramp low end | {abs(x_low):.3f} in left of the kerf line (clears the leaning blade) |",
    f"| Part | on the ramp against the fence, end overhanging the ramp by {abs(x_low):.2f} + {WASTE:g} waste |",
    f"| Bevel measured on the model | {measured:.2f} deg from square; long point on the {long_point} face |",
    f"| Top of the cut | {z_top:.3f} in above the table; blade at {travel.blade_height:.3f} (limit {saw['depth_at_45_tilt']} at 45) |",
    "", "**Hold-down:** the part rides on a sloped face: clamp it to the ramp and the ramp to the sled. "
    "Screw the ramp from below, clear of the kerf.",
    "**Check before cutting good stock:** cut a scrap, set a bevel gauge to the scrap's face and compare with the target.", ""])

checks = {
    "blade normal after the wedge matches a left tilt": hand or "yes",
    "bevel angle measured on the model, deg": round(measured, 3),
    "target, deg": BEVEL,
    "travel and guard block": "ok" if travel.ok else "; ".join(travel.reasons),
    "blade touches ramp or sled hardware": touched or "none",
    "ramp and part surfaces inside the hand-tool envelope": m.surface_audit(wedge)["ok"] and m.surface_audit(keeper)["ok"],
}
m.save_step(wedge, folder / "ramp.step", label="ramp")
m.save_preview_svg(m.assembly({"base": parts["base"], "fence": parts["front-fence"], "ramp": wedge, "part": keeper}),
                   folder / "carrier-wedge-preview.svg", view_from=(-0.7, -1.2, 0.7))
show = m.assembly({**parts, **hardware, "ramp": wedge, "part": keeper})
m.save_step(show, folder / "carrier-wedge.step")
finish(folder, text, checks)
