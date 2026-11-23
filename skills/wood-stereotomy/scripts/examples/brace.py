"""Skewed brace meeting a vertical face: the compound end cut from the source report.

1-1/2 x 3-1/2 in blank, axis (2, 2, 1)/3, cut to the plane x = 0 of a receiving post.
"""
from math import atan, degrees, sqrt

from _common import finish, out_dir

from woodstereo import geometry as g
from woodstereo import model as m
from woodstereo import plans
from woodstereo import sheet, shop, templates

# ---- parameters (inches, degrees)
SIZE_V, SIZE_W = 1.5, 3.5            # v is horizontal at roll 0; w is the brace's top side
YAW, PITCH, ROLL = 45.0, degrees(atan(1 / sqrt(8))), 0.0
DATUM_BACK = 2.0                     # square datum line behind the centerline point
BLANK_BACK, BLANK_FORWARD = 10.0, 5.0
INTERFACE_POINT, INTERFACE_NORMAL = (0.0, 0.0, 0.0), (1.0, 0.0, 0.0)
POST = (3.5, 3.5, 14.0)

folder = out_dir("brace")
frame = g.member_frame(YAW, PITCH, ROLL)
shop_profile = shop.load_shop()

# ---- model: one interface plane shapes both parts
stock = m.blank(INTERFACE_POINT, frame, SIZE_V, SIZE_W, BLANK_BACK, BLANK_FORWARD)
brace = m.trim(stock, INTERFACE_POINT, INTERFACE_NORMAL)
post = m.box_at((POST[0] / 2, 0.0, 0.0), POST)

# ---- shop data
text = sheet.end_cut_sheet("Brace foot at the post face", INTERFACE_NORMAL, frame, SIZE_V,
                           SIZE_W, shop_profile, DATUM_BACK)
lengths = g.layout_lengths(INTERFACE_NORMAL, frame, SIZE_V, SIZE_W, DATUM_BACK)
lines, labels = templates.end_cut_development(
    lengths, SIZE_V, SIZE_W, g.waste_direction(INTERFACE_NORMAL, frame) > 0)
templates.write_dxf(folder / "brace-foot-development.dxf", lines)
templates.write_svg(folder / "brace-foot-development.svg", lines, labels)
templates.write_pdf(folder / "brace-foot-development.pdf", lines, labels,
                    title="Brace foot / 1:1", orientation="Datum at bottom; grain up")
normal, in_plane = g.force_components(INTERFACE_NORMAL, frame.u)

# ---- outputs and checks
m.save_step(m.assembly({"brace": brace, "post": post}), folder / "brace.step")
m.save_preview_svg(m.assembly({"brace": brace, "post": post}), folder / "brace-preview.svg")
checks = {
    "brace surfaces inside the hand-tool envelope": m.surface_audit(brace)["ok"],
    "interference brace/post, cu in": round(m.interference_in3(brace, post), 6),
    "bearing area brace on post, sq in": round(m.contact_area_in2(brace, post), 3),
    "expected bearing area, sq in": round(g.oblique_area(INTERFACE_NORMAL, frame, SIZE_V, SIZE_W), 3),
    "sharpest edge on the brace, deg": round(m.min_edge_angle_deg(brace), 2),
    "axial force split (normal, in-plane)": f"{normal:.3f}, {in_plane:.3f}",
    "friction alone would need mu >=": round(in_plane / normal, 2),
}
_, method = shop.plan_cut(shop_profile, g.cut_orientations(INTERFACE_NORMAL, frame, SIZE_V, SIZE_W))
plan = plans.PlanSet(
    title="Skewed brace to post",
    assembly={"Brace": brace, "Post": post},
    parts=[
        plans.PartSpec("Brace", brace, 1, f"{SIZE_V:g} x {SIZE_W:g} stock", [
            "Drawn in its own frame: length along x, width v along y, depth w up.",
            "Mark the four corner offsets from the shop notes on the corner edges and join them on each face.",
            f"Method: {method}."],
            frame=m.member_plane(INTERFACE_POINT, frame)),
        plans.PartSpec("Post", post, 1, f"{POST[0]:g} x {POST[1]:g} stock", ["Receiving face is the post's -x face."]),
    ],
    notes=["The brace's end is one plane shared with the post face: both are cut from the same interface.",
           "1:1 development template: brace-foot-development.svg (print at 100 percent, check the 2 in square)."],
    shop_notes=text,
)
checks["plan set"] = plans.write_plan_set(plan, folder / "brace-plans.pdf").name
finish(folder, text, checks)
