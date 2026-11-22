"""Splayed N-sided hopper with butt-mitered corners and level top and bottom edges."""
from math import cos, pi, radians, sin, tan

from _common import finish, out_dir
from build123d import Rot

from woodstereo import geometry as g
from woodstereo import model as m
from woodstereo import plans
from build123d import Plane as _P, Vector as _V
from woodstereo import shop

# ---- parameters (inches, degrees)
SIDES = 4
SPLAY = 15.0                 # from vertical
INSIDE_BOTTOM = 8.0          # inside face, bottom edge length
HEIGHT = 6.0                 # vertical
THICKNESS = 0.75

folder = out_dir("hopper")
panel = g.hopper_panel(SIDES, SPLAY, INSIDE_BOTTOM, HEIGHT, THICKNESS)
shop_profile = shop.load_shop()
s, half = radians(SPLAY), pi / SIDES
apothem = INSIDE_BOTTOM / (2 * tan(half))        # center to inside face at the bottom

# ---- model one side on the -y side as an intersection of half-spaces, then copy round
inward = (0.0, cos(s), sin(s))                   # inside-face normal, pointing into the box
outward = (0.0, -cos(s), -sin(s))
reach = HEIGHT * tan(s) + THICKNESS / cos(s)      # how far the outside top sits beyond the inside bottom
span_x = 2 * (panel.outside_top + 1.0)           # wider than the longest edge
span_y = 2 * (reach + 1.0)                       # deeper than the panel's lean and thickness
side = m.box_at((0.0, -apothem, HEIGHT / 2), (span_x, span_y, HEIGHT))    # level top, bottom
side = m.trim(side, (0.0, -apothem, 0.0), inward)                            # inside face
side = m.trim(side, (0.0, -apothem - THICKNESS / cos(s), 0.0), outward)      # outside face
miter_r = (cos(half), sin(half), 0.0)            # corner planes contain the vertical axis
miter_l = (-cos(half), sin(half), 0.0)
side = m.trim(side, (0.0, 0.0, 0.0), miter_r)
side = m.trim(side, (0.0, 0.0, 0.0), miter_l)
sides = {f"side-{i + 1}": Rot(0, 0, 360 / SIDES * i) * side for i in range(SIDES)}

# ---- cross-check the closed-form settings against the model's own miter plane
along = (1.0, 0.0, 0.0)                          # panel length
up_slant = (0.0, -sin(s), cos(s))                # up the panel face
tilt, miter = g.saw_settings(miter_r, along, up_slant, inward)   # panel lying on a face
assert abs(tilt - panel.tilt) < 1e-6 and abs(miter - panel.miter) < 1e-6
assert abs(m.bbox_in(side)[0] - panel.outside_top) < 1e-4, "starting box clipped the panel"
verdicts, method = shop.plan_cut(shop_profile, [g.Orientation("face", THICKNESS, tilt, miter)])

text = "\n".join([
    f"## {SIDES}-sided hopper, {SPLAY:g} deg splay", "",
    "| Item | Value |", "| --- | --- |",
    f"| Corner miters: blade tilt | {panel.tilt:.2f} deg |",
    f"| Corner miters: miter gauge | {panel.miter:.2f} deg from square |",
    f"| Top and bottom edge bevel | {panel.edge_bevel:.2f} deg |",
    f"| Blank width before bevels | {panel.blank_width:.3f} in ({g.frac(panel.blank_width)}) |",
    f"| Inside face height (slant) | {panel.slant:.3f} in |",
    f"| Inside face bottom / top | {panel.inside_bottom:.3f} / {panel.inside_top:.3f} in |",
    f"| Outside face bottom / top | {panel.outside_bottom:.3f} / {panel.outside_top:.3f} in |",
    f"| Inside dihedral between sides | {g.hopper_dihedral(SIDES, SPLAY):.2f} deg |",
    "", f"**Method:** {method}. Rip the two long edges turning the blank face-over so the "
    "bevels come out parallel. Cut mirrored ends from the opposite miter slot.", ""])

names = list(sides)
m.save_step(m.assembly(sides), folder / "hopper.step")
m.save_preview_svg(m.assembly(sides), folder / "hopper-preview.svg")
checks = {
    "side surfaces inside the hand-tool envelope": m.surface_audit(side)["ok"],
    "interference between neighbours, cu in":
        round(m.interference_in3(sides[names[0]], sides[names[1]]), 6),
    "miter contact area, sq in": round(m.contact_area_in2(sides[names[0]], sides[names[1]]), 3),
    "closed-form settings match the model's miter plane": True,
    "outside top edge measured on the model, in": round(m.bbox_in(side)[0], 3),
    "outside top edge expected, in": round(panel.outside_top, 3),
    "0.25 deg miter-gauge error over the slant, in": round(g.angle_error_offset(panel.slant, 0.25), 4),
    "0.25 deg tilt error across the thickness, in": round(g.angle_error_offset(THICKNESS, 0.25), 4),
}
face_plane = _P(origin=_V(0, -apothem * m.IN, 0), x_dir=_V(1, 0, 0),
                     z_dir=_V(*outward))
plan = plans.PlanSet(
    title=f"{SIDES}-sided hopper, {SPLAY:g} deg splay",
    assembly=sides,
    parts=[plans.PartSpec("Side", side, SIDES, f"{THICKNESS:g} stock", [
        "Drawn in true shape: the outside face lies flat in the top view.",
        f"Rip both long edges at {panel.edge_bevel:.2f} deg, turning the blank face-over between rips.",
        f"Corner miters: blade tilt {panel.tilt:.2f}, miter gauge {panel.miter:.2f}; mirrored ends from the other slot."],
        frame=face_plane, match="side-")],
    notes=["Cut and tape-fit four scrap sides before the good stock."],
    shop_notes=text,
)
checks["plan set"] = plans.write_plan_set(plan, folder / "hopper-plans.pdf").name
finish(folder, text, checks)
