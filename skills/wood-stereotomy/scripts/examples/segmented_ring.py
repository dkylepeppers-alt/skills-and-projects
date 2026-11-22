"""Mitered polygon ring with chordwise grain: the twelve-segment ring from the source report."""
from math import cos, pi, sin

from _common import finish, out_dir
from build123d import Rot

from woodstereo import geometry as g
from woodstereo import model as m
from woodstereo import plans
from woodstereo import shop

# ---- parameters (inches)
SEGMENTS = 12
OUTER_APOTHEM, INNER_APOTHEM = 6.0, 4.5
THICKNESS = 0.75

folder = out_dir("segmented_ring")
half = pi / SEGMENTS
outer = g.polygon_side(OUTER_APOTHEM, SEGMENTS)
inner = g.polygon_side(INNER_APOTHEM, SEGMENTS)
strip = OUTER_APOTHEM - INNER_APOTHEM
miter_deg = 180 / SEGMENTS
shop_profile = shop.load_shop()

# ---- one segment: a strip along the chord, trimmed by two radial planes through the axis
mid = (INNER_APOTHEM + OUTER_APOTHEM) / 2
seg = m.box_at((0.0, -mid, THICKNESS / 2), (outer + 2.0, strip, THICKNESS))
seg = m.trim(seg, (0, 0, 0), (cos(half), sin(half), 0.0))
seg = m.trim(seg, (0, 0, 0), (-cos(half), sin(half), 0.0))
ring = {f"segment-{i + 1:02d}": Rot(0, 0, 360 / SEGMENTS * i) * seg for i in range(SEGMENTS)}

verdicts, method = shop.plan_cut(shop_profile, [g.Orientation("face", THICKNESS, 0.0, miter_deg)])
text = "\n".join([
    f"## {SEGMENTS}-segment ring", "",
    "| Item | Value |", "| --- | --- |",
    f"| Strip width (radial) | {strip:.3f} in |",
    f"| Outer flat length | {outer:.3f} in ({g.frac(outer)}) |",
    f"| Inner flat length | {inner:.3f} in ({g.frac(inner)}) |",
    f"| Miter each end | {miter_deg:.2f} deg from square, traces converging inward |",
    f"| Closure error at 0.25 deg per face | {g.ring_closure_error(SEGMENTS, 0.25):.1f} deg |",
    "", f"**Method:** {method}. Grain runs along each chord. Dry-fit two half rings and check "
    "each half's end faces against a straightedge through the center before gluing.", ""])

names = list(ring)
m.save_step(m.assembly(ring), folder / "segmented-ring.step")
m.save_preview_svg(m.assembly(ring), folder / "segmented-ring-preview.svg")
checks = {
    "segment surfaces inside the hand-tool envelope": m.surface_audit(seg)["ok"],
    "interference between neighbours, cu in": round(m.interference_in3(ring[names[0]], ring[names[1]]), 6),
    "seam contact area, sq in": round(m.contact_area_in2(ring[names[0]], ring[names[1]]), 3),
    "expected seam area (strip x thickness / cos), sq in": round(strip / cos(half) * THICKNESS, 3),
}
plan = plans.PlanSet(
    title=f"{SEGMENTS}-segment ring",
    assembly=ring,
    parts=[plans.PartSpec("Segment", seg, SEGMENTS, f"{THICKNESS:g} stock, grain along the chord", [
        f"Miter each end {miter_deg:.2f} deg from square on a segment sled with a stop.",
        "Dry-fit two half rings and true their end faces before gluing them together."], match="segment-")],
    notes=["Rout or saw the round outline after the glue-up if a round ring is wanted."],
    shop_notes=text,
)
checks["plan set"] = plans.write_plan_set(plan, folder / "segmented-ring-plans.pdf").name
finish(folder, text, checks)
