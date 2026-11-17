"""Shop sheets: the numbers a cut needs at the bench, as Markdown. Standard library only."""
from __future__ import annotations

from .geometry import (Frame, Vec, cut_orientations, face_trace_angles, frac, layout_lengths,
                       oblique_area, waste_direction)
from .shop import plan_cut


def end_cut_sheet(name: str, n: Vec, frame: Frame, size_v: float, size_w: float,
                  shop: dict, datum_back: float) -> str:
    """Markdown shop sheet for one planar end cut on a rectangular blank.
    `n` points at the waste, the same convention as model.trim."""
    denom = shop.get("layout_resolution_denominator", 32)
    lengths = layout_lengths(n, frame, size_v, size_w, datum_back)
    toward = "+u" if waste_direction(n, frame) > 0 else "-u"
    traces = face_trace_angles(n, frame)
    verdicts, method = plan_cut(shop, cut_orientations(n, frame, size_v, size_w))
    out = [f"## {name}", "",
           f"Blank {size_v:g} x {size_w:g} in (v x w). The cut normal points at the waste, "
           f"which lies toward {toward} of the cut. L is measured along each corner edge, "
           f"toward the cut, from a square datum line on the kept stock {datum_back:g} in "
           "from the centerline point. Waste lies beyond the trace.", "",
           "| Corner | (v, w) side | L, in | Nearest 1/%d |" % denom, "| --- | --- | --- | --- |"]
    sides = {"A": "-v, -w", "B": "+v, -w", "C": "+v, +w", "D": "-v, +w"}
    for k, length in lengths.items():
        out.append(f"| {k} | {sides[k]} | {length:.3f} | {frac(length, denom)} |")
    out += ["",
            f"Check: A + C = B + D = {2 * datum_back:.3f} in.",
            f"Trace angle from square: {traces['w_faces']:.2f} deg on the w faces, "
            f"{traces['v_faces']:.2f} deg on the v faces.",
            f"Cut face area: {oblique_area(n, frame, size_v, size_w):.3f} sq in.", "",
            "| Face on the table | Stock height | Blade tilt | Miter | Table saw |",
            "| --- | --- | --- | --- | --- |"]
    for v in verdicts:
        o = v.orientation
        status = "fits" if v.feasible else "no: " + "; ".join(v.reasons)
        out.append(f"| {o.face_down} | {o.height:g} in | {o.tilt:.2f} | {o.miter:.2f} | {status} |")
    out += ["", f"**Method:** {method}", ""]
    return "\n".join(out)
