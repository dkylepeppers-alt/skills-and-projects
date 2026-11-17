"""1:1 layout templates as DXF (R12 LINE entities) and SVG. Standard library only.

Drawings are in inches. Every template carries a calibration square: measure it on the
print with a steel rule before trusting any other line.
"""
from __future__ import annotations

from pathlib import Path
from xml.sax.saxutils import escape

Line = tuple[float, float, float, float]
Label = tuple[float, float, str]


def write_dxf(path: str | Path, lines: list[Line]) -> Path:
    out = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "1", "0", "ENDSEC",
           "0", "SECTION", "2", "ENTITIES"]
    for x1, y1, x2, y2 in lines:
        out += ["0", "LINE", "8", "0", "10", f"{x1:.5f}", "20", f"{y1:.5f}", "30", "0.0",
                "11", f"{x2:.5f}", "21", f"{y2:.5f}", "31", "0.0"]
    out += ["0", "ENDSEC", "0", "EOF"]
    path = Path(path)
    path.write_text("\n".join(out) + "\n", encoding="ascii")
    return path


def write_svg(path: str | Path, lines: list[Line], labels: list[Label] = (),
              margin: float = 0.5) -> Path:
    """SVG sized in real inches (width/height in 'in', viewBox in inches)."""
    xs = [c for l in lines for c in (l[0], l[2])] + [l[0] for l in labels]
    ys = [c for l in lines for c in (l[1], l[3])] + [l[1] for l in labels]
    x0, y0 = min(xs) - margin, min(ys) - margin
    w, h = max(xs) - min(xs) + 2 * margin, max(ys) - min(ys) + 2 * margin
    top = y0 + h   # flip y so +y is up on paper

    def fy(y: float) -> float:
        return top - y + y0

    body = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.4f}in" height="{h:.4f}in" '
            f'viewBox="{x0:.4f} {y0:.4f} {w:.4f} {h:.4f}">',
            '<g stroke="black" stroke-width="0.008" fill="none">']
    body += [f'<line x1="{a:.4f}" y1="{fy(b):.4f}" x2="{c:.4f}" y2="{fy(d):.4f}"/>'
             for a, b, c, d in lines]
    body.append("</g>")
    body += [f'<text x="{x:.4f}" y="{fy(y):.4f}" font-size="0.14" font-family="sans-serif">'
             f"{escape(text)}</text>" for x, y, text in labels]
    body.append("</svg>")
    path = Path(path)
    path.write_text("\n".join(body) + "\n", encoding="utf-8")
    return path


def calibration_square(x: float, y: float, size: float = 2.0) -> tuple[list[Line], list[Label]]:
    lines = [(x, y, x + size, y), (x + size, y, x + size, y + size),
             (x + size, y + size, x, y + size), (x, y + size, x, y)]
    return lines, [(x + 0.08, y + size / 2, f"{size:g} in square: measure before use")]


def end_cut_development(lengths: dict[str, float], size_v: float, size_w: float,
                        waste_toward_plus_u: bool = True) -> tuple[list[Line], list[Label]]:
    """Four faces of a blank unfolded side by side, seen from outside, with the cut traces.

    `lengths` comes from geometry.layout_lengths: distance along each corner edge from a
    square datum line on the kept stock to the cut. y on the sheet is that distance, so the
    cut end is toward the top and waste is above each trace. x runs round the blank so the
    paper wraps the stock the right way: A-B-C-D-A when the waste is toward +u, and the
    mirror order A-D-C-B-A when it is toward -u (geometry.waste_direction).
    """
    if waste_toward_plus_u:
        order = ["A", "B", "C", "D", "A"]
        widths = [size_v, size_w, size_v, size_w]
        names = ["-w FACE", "+v FACE", "+w FACE", "-v FACE"]
    else:
        order = ["A", "D", "C", "B", "A"]
        widths = [size_w, size_v, size_w, size_v]
        names = ["-v FACE", "+w FACE", "+v FACE", "-w FACE"]
    xs = [0.0]
    for width in widths:
        xs.append(xs[-1] + width)
    ls = lengths
    if min(ls.values()) < 0:
        raise ValueError("datum is too close: a trace falls behind the datum line")
    top = max(ls.values()) + 0.5
    lines: list[Line] = [(xs[0], 0, xs[-1], 0)]                      # square datum line
    lines += [(x, 0, x, top) for x in xs]                            # arrises
    labels: list[Label] = []
    for i in range(4):
        a, b = order[i], order[i + 1]
        lines.append((xs[i], ls[a], xs[i + 1], ls[b]))               # trace on this face
        labels.append((xs[i] + 0.06, 0.12, names[i]))
        labels.append((xs[i] + 0.04, ls[a] + 0.08, f"{a} {ls[a]:.3f}"))
    labels.append((xs[4] - 0.75, ls["A"] + 0.08, f"A {ls['A']:.3f}"))
    labels.append((xs[0] + 0.06, top - 0.1, "WASTE ABOVE THE TRACE"))
    cal_lines, cal_labels = calibration_square(xs[-1] + 0.75, 0.0)
    return lines + cal_lines, labels + cal_labels
