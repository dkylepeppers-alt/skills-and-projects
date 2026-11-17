"""Blind mortise and tenon, rail into leg, with an optional drawbore: ordinary joinery
drafted by the same rules (shared interface, relief on inactive faces, shop-ready checks)."""
from _common import finish, out_dir
from build123d import Axis, Cylinder, Pos, Rot

from woodstereo import geometry as g
from woodstereo import joinery
from woodstereo import model as m
from woodstereo import shop

shop_profile = shop.load_shop()

# ---- parameters (inches)
LEG = 1.75                      # square leg, grain vertical
LEG_LENGTH = 12.0
RAIL_T, RAIL_W, RAIL_L = 0.75, 2.0, 10.0     # rail thickness (y), width (z), visible length (x)
RAIL_TOP_BELOW_LEG_TOP = 1.0
TENON_T = joinery.tenon_thickness(RAIL_T, shop_profile["hand_tools"]["chisel_widths"])
TENON_L = 1.25                  # about 0.7 of the leg width
SHOULDER_EDGE = 0.375           # top and bottom edge shoulders
TENON_W = RAIL_W - 2 * SHOULDER_EDGE
MORTISE_RELIEF = 1 / 16         # inactive bottom of the mortise
DRAWBORE = True
PEG_D = 0.25
PEG_FROM_SHOULDER = 0.5
DRAWBORE_OFFSET = joinery.DRAWBORE_OFFSET["furniture, typical"]

folder = out_dir("mortise_tenon")
assert TENON_W <= joinery.tenon_width_limit(TENON_T) + 1e-9, "tenon too wide: use twin tenons"

face = LEG / 2                                  # leg face the rail meets, at x = +face
rail_z = LEG_LENGTH - RAIL_TOP_BELOW_LEG_TOP - RAIL_W / 2
leg = m.box_at((0, 0, LEG_LENGTH / 2), (LEG, LEG, LEG_LENGTH))
rail_body = m.box_at((face + RAIL_L / 2, 0, rail_z), (RAIL_L, RAIL_T, RAIL_W))
tenon = m.box_at((face - TENON_L / 2, 0, rail_z), (TENON_L, TENON_T, TENON_W))
socket = m.box_at((face - (TENON_L + MORTISE_RELIEF) / 2, 0, rail_z),
                  (TENON_L + MORTISE_RELIEF, TENON_T, TENON_W))
rail = rail_body + tenon
leg = leg - socket

if DRAWBORE:
    def peg_hole(x):
        return Pos(x * m.IN, 0, rail_z * m.IN) * (Rot(90, 0, 0) * Cylinder(PEG_D / 2 * m.IN, LEG * m.IN))
    leg = leg - peg_hole(face - PEG_FROM_SHOULDER)
    # The tenon's hole sits closer to the shoulder, so the peg draws the shoulder tight.
    rail = rail - peg_hole(face - PEG_FROM_SHOULDER + DRAWBORE_OFFSET)

cheek_wall = (LEG - TENON_T) / 2
text = "\n".join([
    "## Blind mortise and tenon, rail to leg", "",
    "| Item | Value |", "| --- | --- |",
    f"| Tenon thickness | {TENON_T:.4f} in ({g.frac(TENON_T)}): chisel nearest 1/3 of {RAIL_T:g} |",
    f"| Tenon width x length | {TENON_W:.3f} x {TENON_L:.3f} in |",
    f"| Edge shoulders | {SHOULDER_EDGE:.3f} in top and bottom |",
    f"| Face shoulders | {(RAIL_T - TENON_T) / 2:.3f} in each side |",
    f"| Mortise depth | {TENON_L + MORTISE_RELIEF:.4f} in (tenon + {g.frac(MORTISE_RELIEF)} relief) |",
    f"| Mortise wall each side | {cheek_wall:.3f} in |",
    f"| Mortise top to leg end | {RAIL_TOP_BELOW_LEG_TOP + SHOULDER_EDGE:.3f} in of long grain |",
    f"| Peg | {PEG_D:g} in, {PEG_FROM_SHOULDER:g} in from the shoulder in the leg; tenon hole "
    f"{g.frac(DRAWBORE_OFFSET)} closer to the shoulder |" if DRAWBORE else "| Peg | none |",
    "", "**Method:** mortise by drill press and chisel or router with square-chiseled ends, "
    "to knifed lines from the leg's reference faces. Tenon cheeks on the table saw or by "
    "handsaw; shoulders knifed all round and pared. The shoulder is the bearing and locating "
    "face (zero offset); the mortise bottom is relieved.", ""])

m.save_step(m.assembly({"leg": leg, "rail": rail}), folder / "mortise-tenon.step")
m.save_preview_svg(m.assembly({"leg": leg, "rail": rail}), folder / "mortise-tenon-preview.svg")
finish(folder, text, {
    "leg surfaces inside the hand-tool envelope": m.surface_audit(leg)["ok"],
    "rail surfaces inside the hand-tool envelope": m.surface_audit(rail)["ok"],
    "interference leg/rail, cu in": round(m.interference_in3(leg, rail), 6),
    "contact area leg/rail (shoulders + cheeks + edges), sq in": round(m.contact_area_in2(rail, leg), 3),
    "shoulder area alone, sq in": round(RAIL_T * RAIL_W - TENON_T * TENON_W, 3),
    "gap behind the tenon end, in": MORTISE_RELIEF,
})
