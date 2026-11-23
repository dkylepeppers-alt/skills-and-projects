"""Plan sets: dimensioned shop drawings from the same build123d model, as one PDF.

A plan set has
  1. an assembly sheet: top, front and right views, overall sizes, numbered parts and the
     parts list;
  2. one sheet per section the design calls for, with the cut faces hatched;
  3. a master sheet per distinct part with overall sizes; conventional, arrowed feature
     dimensions on separate enlarged views whenever the master would be crowded;
  4. a cut list sheet; and 5. the shop notes (settings, sequence, checks).

Views are third-angle orthographic, drawn with hidden lines. Dimensions are inches.
Reference edges remain fixed; extension lines terminate at projected geometry, not
displaced ordinate labels. Dense dimensions are paginated rather than compressed.

Requires build123d and matplotlib (requirements.txt).
"""
from __future__ import annotations

import datetime
from math import atan2, tau
from dataclasses import dataclass, field, replace
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from build123d import IN, Compound, GeomType, Keep, Plane, Vector, split  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import Circle, PathPatch, Polygon, Rectangle  # noqa: E402
from matplotlib.path import Path as MPath  # noqa: E402
from matplotlib.transforms import Bbox, TransformedBbox  # noqa: E402

from .drafting import choose_scale, edge_angle_label, fmt_in, ordinates, wrap  # noqa: E402

PAGES = {"letter": (11.0, 8.5), "tabloid": (17.0, 11.0)}
FAR = 1.0e5   # mm: viewpoint distance for the hidden-line projector

# view name -> (direction from the model toward the viewer, up)
VIEWS = {
    "top": ((0, 0, 1), (0, 1, 0)),
    "front": ((0, -1, 0), (0, 0, 1)),
    "right": ((1, 0, 0), (0, 0, 1)),
    "bottom": ((0, 0, -1), (0, 1, 0)),
    "left": ((-1, 0, 0), (0, 0, 1)),
    "back": ((0, 1, 0), (0, 0, 1)),
}
VIEW_TITLES = {"top": "TOP", "front": "FRONT", "right": "RIGHT SIDE", "bottom": "UNDERSIDE",
               "left": "LEFT SIDE", "back": "BACK"}
INK, QUIET, LIGHT = "#111111", "#555555", "#9a9a9a"


# --------------------------------------------------------------------------- data

@dataclass
class PartSpec:
    """One part to detail. `shape` is in assembly position; `frame` (a build123d Plane)
    re-expresses it in the part's own drawing frame when the part sits rotated."""
    name: str
    shape: object
    qty: int = 1
    material: str = ""
    notes: list[str] = field(default_factory=list)
    frame: Plane | None = None
    views: tuple[str, str, str] = ("top", "front", "right")
    match: str | tuple | None = None   # assembly labels this part covers: a prefix or a tuple of labels
    fit_dimensions: bool = False  # retain sub-fraction fit allowances
    features: list[FeatureSpec] = field(default_factory=list)
    stock_size: str = ""  # explicit rough stock T x W x L; required if extents understate blank
    datum: tuple[float,float,float] | None = None  # physical datum in local inches
    grain: str = ""  # physical stock/grain direction in local coordinates

    def covers(self, label: str) -> bool:
        if self.match is None:
            return label == self.name
        if isinstance(self.match, str):
            return label.startswith(self.match)
        return label in self.match

    def local(self):
        return self.frame.to_local_coords(self.shape) if self.frame is not None else self.shape


@dataclass
class FeatureSpec:
    """Actual mating tongue or clipped removal volume, in assembly coordinates.

    Name the cut and mating part; project the same tool/solid used in the model.
    For holes, retain the physical bore trajectory and depth in notes. An angled
    bore also needs a normal-to-axis view or section supplied by the designer.
    """
    name: str
    shape: object
    role: str
    mate: str = ""
    views: tuple[str, ...] = ("front", "top")
    notes: list[str] = field(default_factory=list)
    datum: tuple[float,float,float] | None = None  # inherited from PartSpec, local inches


@dataclass
class Section:
    name: str
    point: tuple[float, float, float]
    view: str = "front"          # look the way this view looks; keep material beyond the cut


@dataclass
class PlanSet:
    title: str
    assembly: dict                # label -> positioned shape
    parts: list[PartSpec]
    notes: list[str] = field(default_factory=list)
    sections: list[Section] = field(default_factory=list)
    shop_notes: str = ""
    verify: list[str] = field(default_factory=list)   # figures still to be measured
    page: str = "letter"
    # Named pair of assembly parts. Dimension between their front faces in the top view.
    front_setback: tuple[str, str] | None = None


# --------------------------------------------------------------------------- projection

def _axes(view: str):
    d, up = VIEWS[view]
    fwd = (-d[0], -d[1], -d[2])
    right = (fwd[1] * up[2] - fwd[2] * up[1], fwd[2] * up[0] - fwd[0] * up[2],
             fwd[0] * up[1] - fwd[1] * up[0])
    return d, up, right


def to_view(p, view: str) -> tuple[float, float]:
    """Model point (inches) to drawing coordinates (inches) for a view."""
    _, up, right = _axes(view)
    return (p[0] * right[0] + p[1] * right[1] + p[2] * right[2],
            p[0] * up[0] + p[1] * up[1] + p[2] * up[2])


@dataclass
class View2D:
    visible: list
    hidden: list
    lines: list            # visible straight edges (x1, y1, x2, y2)
    circles: list          # (cx, cy, r, hidden)
    box: tuple
    hidden_lines: list = field(default_factory=list)
    arcs: list = field(default_factory=list)  # (x, y, r, hidden), anchored on the arc

    @property
    def width(self):
        return self.box[2] - self.box[0]

    @property
    def height(self):
        return self.box[3] - self.box[1]


def _polyline(edge) -> list[tuple[float, float]]:
    if edge.geom_type == GeomType.LINE:
        pts = [edge.position_at(0), edge.position_at(1)]
    else:
        n = max(72 if edge.geom_type == GeomType.CIRCLE else 24, int(edge.length / IN * 24))
        pts = [edge.position_at(i / n) for i in range(n + 1)]
    return [(p.X / IN, p.Y / IN) for p in pts]


def _round_features(visible, hidden):
    """Reassemble circular projections split by visibility or seams before labeling them."""
    groups = {}
    for edges, is_hidden in ((visible, False), (hidden, True)):
        for edge in edges:
            if edge.geom_type != GeomType.CIRCLE:
                continue
            c = edge.arc_center
            key = (round(c.X / IN, 4), round(c.Y / IN, 4), round(edge.radius / IN, 4))
            mid = edge.position_at(0.5)
            anchor = (round(mid.X / IN, 4), round(mid.Y / IN, 4))
            spans = groups.setdefault(key, [])
            if edge.is_closed:
                spans.append((0, tau, anchor, is_hidden))
                continue
            start, middle, end = [atan2(p.Y - c.Y, p.X - c.X) % tau
                                  for p in (edge.position_at(0), mid, edge.position_at(1))]
            if (middle - start) % tau > (end - start) % tau:
                start, end = end, start
            if end < start:
                spans.append((start, tau, anchor, is_hidden))
                start = 0
            spans.append((start, end, anchor, is_hidden))
    circles, arcs = [], []
    for (cx, cy, r), spans in groups.items():
        end = 0
        for a, b, _, _ in sorted(spans):
            if a > end + 1e-6:
                break
            end = max(end, b)
        hidden_only = all(h for _, _, _, h in spans)
        if end >= tau - 1e-6:
            circles.append((cx, cy, r, hidden_only))
        else:
            # A split or duplicate span can have the same anchor on the same edge.
            anchors = {}
            for _, _, anchor, h in spans:
                anchors[anchor] = anchors.get(anchor, True) and h
            arcs.extend((*anchor, r, h) for anchor, h in anchors.items())
    return sorted(circles), sorted(arcs)


def project(shape, view: str) -> View2D:
    """Hidden-line projection of a shape (or {label: shape}) in a view, in inches."""
    if isinstance(shape, dict):
        shape = Compound(children=list(shape.values()))
    d, up, _ = _axes(view)
    vis, hid = shape.project_to_viewport((d[0] * FAR, d[1] * FAR, d[2] * FAR),
                                         viewport_up=up, look_at=(0, 0, 0))
    visible = [_polyline(e) for e in vis]
    hidden = [_polyline(e) for e in hid]
    lines = [(*pl[0], *pl[-1]) for e, pl in zip(vis, visible) if e.geom_type == GeomType.LINE]
    hidden_lines = [(*pl[0], *pl[-1]) for e, pl in zip(hid, hidden) if e.geom_type == GeomType.LINE]
    circles, arcs = _round_features(vis, hid)
    pts = [p for pl in visible + hidden for p in pl]
    box = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
    return View2D(visible, hidden, lines, circles, box, hidden_lines, arcs)


# --------------------------------------------------------------------------- drawing primitives

def _page(pdf_w, pdf_h):
    fig = plt.figure(figsize=(pdf_w, pdf_h))
    ax = fig.add_axes((0, 0, 1, 1))
    ax.set_xlim(0, pdf_w)
    ax.set_ylim(0, pdf_h)
    ax.set_aspect("equal")
    ax.axis("off")
    return fig, ax


def _text(ax, x, y, s, size=6.5, **kw):
    kw.setdefault("color", INK)
    kw.setdefault("family", "DejaVu Sans")
    ax.text(x, y, s, fontsize=size, **kw)


def _draw_geometry(ax, v: View2D, ox, oy, s, context=False, clip=None):
    x0, y0 = v.box[0], v.box[1]
    artists=[]
    for pl in v.hidden:
        artists.extend(ax.plot([ox + (p[0] - x0) * s for p in pl], [oy + (p[1] - y0) * s for p in pl],
                color=LIGHT if context else QUIET, lw=0.35, ls=(0, (3, 2))))
    for pl in v.visible:
        artists.extend(ax.plot([ox + (p[0] - x0) * s for p in pl], [oy + (p[1] - y0) * s for p in pl],
                color=LIGHT if context else INK, lw=0.5 if context else 0.85,
                solid_capstyle="round"))
    if clip is not None:
        box=TransformedBbox(Bbox.from_bounds(*clip),ax.transData)
        for artist in artists:
            artist.set_clip_box(box)


def _ordinate_points(v: View2D):
    """Coordinates to dimension: ends of straight edges (visible and hidden, so depths of
    hidden grooves and recesses are located) and circle centres. Seam points on circles are
    left out."""
    xs, ys = [], []
    for x1, y1, x2, y2 in v.lines + v.hidden_lines:
        xs += [x1, x2]
        ys += [y1, y2]
    for cx, cy, _r, _h in v.circles:
        xs.append(cx)
        ys.append(cy)
    return xs, ys


def _points(v):
    pts = [(a, b) for x, y, u, w in v.lines + v.hidden_lines
           for a, b in ((x, y), (u, w))]
    pts.extend((x, y) for x, y, _, _ in v.circles)
    return pts


def _anchor(v, axis, value, high=False):
    """True projected endpoint or centre; never a displaced label."""
    points = _points(v)
    matches = [p[1-axis] for p in points if abs(p[axis] - value) < 1e-4]
    if matches:
        return (max if high else min)(matches)
    return v.box[1-axis + (2 if high else 0)]  # silhouette extrema of curved outlines


def _dimension_pairs(v, axis):
    """Interior baseline locations and local widths between consecutive edges.

    Keep CAD precision when collecting coordinates. Merging close coordinates at
    1/64 in silently loses model-scale joints and fit offsets.
    """
    if len(v.circles)==1 and not v.lines and not v.hidden_lines:
        return []  # Ø alone defines a circle; the locator defines its centre
    lo, hi = v.box[axis], v.box[axis+2]
    vals = [lo + x for x in ordinates([p[axis] for p in _points(v)] + [lo, hi], 1e-5)]
    inner = [x for x in vals if lo + 1e-5 < x < hi - 1e-5]
    # Give location from datum; only adjacent interior edges establish local
    # widths (not widths between unrelated features on a named detail).
    return list(zip(inner, inner[1:])) + [(lo, x) for x in inner]


def _batches(v, count=3):
    """Hard limit on dimension lanes; generate extra sheets, never fan labels."""
    x, y = (_dimension_pairs(v, i) for i in (0, 1))
    return [(x[i*count:(i+1)*count], y[i*count:(i+1)*count])
            for i in range(max(1, -(-max(len(x), len(y)) // count)))]


def _arrow_dimensions(ax, v, ox, oy, s, batch=((), ()), fit=False, overall=True):
    if len(v.circles)==1 and not v.lines and not v.hidden_lines:
        return
    x0, y0, x1, y1 = v.box
    fx = lambda x: ox + (x - x0) * s
    fy = lambda y: oy + (y - y0) * s
    for axis, pairs in enumerate(batch):
        pairs = list(pairs)
        if overall:
            pairs.append((v.box[axis], v.box[axis+2]))
        for i, (a, b) in enumerate(pairs):
            label = fmt_in(b-a, 64, fit=True)
            if axis == 0:
                _dim_h(ax, fx(a), fx(b), oy - .24 - i*.32, label,
                       fy(_anchor(v, axis, a)), fy(_anchor(v, axis, b)))
            else:
                _dim_v(ax, ox - .24 - i*.32, fy(a), fy(b), label,
                       fx(_anchor(v, axis, a)), fx(_anchor(v, axis, b)))


def _callouts(ax, v, ox, oy, s, fit=False):
    x0, y0 = v.box[0], v.box[1]
    stack = {}
    for cx, cy, r, hidden in v.circles:
        key = (round(cx, 3), round(cy, 3))
        k = stack.get(key, 0)
        stack[key] = k + 1
        px, py = ox + (cx - x0) * s, oy + (cy - y0) * s
        label = f"\u00d8{fmt_in(2 * r, 64, fit=True)}" + (" (hidden)" if hidden else "")
        arm = min(r*s*.75,.10)
        ax.plot([px-arm,px+arm],[py,py],color=QUIET,lw=.45,ls="-.")
        ax.plot([px,px],[py-arm,py+arm],color=QUIET,lw=.45,ls="-.")
        # Leader starts on actual circumference, with centred hole cross.
        anchor = (px+r*s*.7071,py+r*s*.7071)
        ax.annotate(label,xy=anchor,xytext=(9,9+12*k),textcoords="offset points",
                    fontsize=8,color=QUIET,arrowprops=dict(arrowstyle="->",lw=.45,color=QUIET),
                    bbox=dict(facecolor="white",edgecolor="none",pad=.3))
    for u, w, radius, hidden in v.arcs:
        point = (ox + (u - x0) * s, oy + (w - y0) * s)
        label = "R" + fmt_in(radius, 64, fit=fit) + (" (hidden)" if hidden else "")
        ax.annotate(label, xy=point, xytext=(8, 5), textcoords="offset points", fontsize=5.6,
                    color=QUIET, arrowprops=dict(arrowstyle="-", color=QUIET, lw=0.4))
    count = {}
    for x1, y1, x2, y2 in v.lines:
        if ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 < 0.2:
            continue
        lab = edge_angle_label(x2 - x1, y2 - y1)
        if not lab or count.get(lab, 0) >= 2:
            continue
        count[lab] = count.get(lab, 0) + 1
        mx, my = ox + ((x1 + x2) / 2 - x0) * s, oy + ((y1 + y2) / 2 - y0) * s
        _text(ax, mx + 0.05, my + 0.05, lab, size=5.5, color=QUIET,
              bbox=dict(facecolor="white", edgecolor="none", pad=0.4))


def _ref_mark(ax, ox, oy):
    ax.add_patch(Polygon([(ox, oy), (ox - 0.09, oy - 0.05), (ox - 0.05, oy - 0.09)], closed=True,
                         facecolor=INK, edgecolor=INK, lw=0.3))
    _text(ax, ox - 0.07, oy - 0.07, "REF", size=4.8, ha="right", va="top", color=QUIET)


def _view_title(ax, x, y, view, scale_label):
    _text(ax, x, y, f"{VIEW_TITLES.get(view, view.upper())}", size=7, weight="bold")


def _frame_and_title(ax, W, H, title, sheet_title, n, total, scale_label, rows):
    m = 0.3
    ax.add_patch(Rectangle((m, m), W - 2 * m, H - 2 * m, fill=False, lw=1.0, edgecolor=INK))
    ax.plot([m, W - m - 4.4], [m + 1.25, m + 1.25], color=INK, lw=0.6)
    tb_w, tb_h = 4.4, 1.25
    x0, y0 = W - m - tb_w, m
    ax.add_patch(Rectangle((x0, y0), tb_w, tb_h, fill=False, lw=0.8, edgecolor=INK))
    _text(ax, x0 + 0.08, y0 + tb_h - 0.2, title, size=9, weight="bold")
    _text(ax, x0 + 0.08, y0 + tb_h - 0.4, sheet_title, size=8)
    yy = y0 + tb_h - 0.58
    for line in rows:
        _text(ax, x0 + 0.08, yy, line, size=6, color=QUIET)
        yy -= 0.14
    _text(ax, x0 + tb_w - 0.08, y0 + 0.1,
          f"SHEET {n} OF {total}   INCHES   {datetime.date.today():%Y-%m-%d}   DO NOT SCALE: USE DIMENSIONS",
          size=5.8, ha="right")
    return (m, m + tb_h + 0.05, W - m, H - m)    # drawing area (x0, y0, x1, y1)


def _notes_box(ax, x, y, w, lines, size=6.2, title="NOTES"):
    _text(ax, x, y, title, size=7, weight="bold")
    yy = y - 0.17
    width_chars = int(w / (size * 0.0075))
    for line in lines:
        for i, piece in enumerate(wrap(line, width_chars)):
            _text(ax, x + (0.0 if i == 0 else 0.12), yy, ("- " if i == 0 else "") + piece, size=size)
            yy -= size * 0.022
    return yy


# --------------------------------------------------------------------------- sheets

def _three_views(ax, area, views: dict, dims: bool, fixed=None):
    """Place top over front with right beside front. Returns scale, label and placements."""
    ax0, ay0, ax1, ay1 = area
    top, front, right = views["top"], views["front"], views["right"]
    dim_l, dim_b, gap_v, gap_h, head = (0.75, 0.65, 0.95, 0.95, 0.3) if dims else (0.5, 0.5, 0.55, 0.55, 0.3)
    need_w = max(top.width, front.width) + right.width
    need_h = front.height + top.height
    s, label = choose_scale(need_w, need_h, ax1 - ax0, ay1 - ay0,
                            fixed_w=dim_l + gap_h + 0.2, fixed_h=dim_b + gap_v + head + 0.2)
    group_w = dim_l + max(top.width, front.width) * s + gap_h + right.width * s
    group_h = dim_b + front.height * s + gap_v + top.height * s + head
    pad_x = max(0.0, (ax1 - ax0 - group_w) / 2)
    pad_y = max(0.0, (ay1 - ay0 - group_h) / 2)
    fx, fy = ax0 + pad_x + dim_l, ay0 + pad_y + dim_b
    tx, ty = fx, fy + front.height * s + gap_v
    rx, ry = fx + front.width * s + gap_h, fy
    return s, label, {"front": (fx, fy), "top": (tx, ty), "right": (rx, ry)}


def _assembly_sheet(pdf, ps: PlanSet, n, total):
    W, H = PAGES[ps.page]
    fig, ax = _page(W, H)
    # one number per distinct part; assembly items no part covers are numbered after them
    specs = _unique_parts(ps)
    numbers, extra = {}, []
    for label in ps.assembly:
        hit = next((i for i, p in enumerate(specs) if p.covers(label)), None)
        if hit is None:
            extra.append(label)
            numbers[label] = len(specs) + len(extra)
        else:
            numbers[label] = hit + 1
    area = _frame_and_title(ax, W, H, ps.title, "ASSEMBLY", n, total, "", [
        "Third-angle views; hidden edges dashed.", "Overall sizes shown; parts detailed on later sheets."])
    views = {k: project(ps.assembly, k) for k in ("top", "front", "right")}
    a0, a1, a2, a3 = area
    s, label, at = _three_views(ax, (a0, a1, a2, a3), views, dims=False)
    for k, (x, y) in at.items():
        _draw_geometry(ax, views[k], x, y, s)
        _view_title(ax, x, y + views[k].height * s + 0.08, k, label)
    # overall sizes
    t, f = views["top"], views["front"]
    tx, ty = at["top"]
    fx, fy = at["front"]
    _dim_h(ax, tx, tx + t.width * s, ty + t.height * s + 0.25, fmt_in(t.width),
           ty+(_anchor(t,0,t.box[0],True)-t.box[1])*s, ty+(_anchor(t,0,t.box[2],True)-t.box[1])*s)
    _dim_v(ax, tx - 0.25, ty, ty + t.height * s, fmt_in(t.height),
           tx+(_anchor(t,1,t.box[1])-t.box[0])*s,tx+(_anchor(t,1,t.box[3])-t.box[0])*s)
    _dim_v(ax, fx - 0.25, fy, fy + f.height * s, fmt_in(f.height),
           fx+(_anchor(f,1,f.box[1])-f.box[0])*s,fx+(_anchor(f,1,f.box[3])-f.box[0])*s)
    if ps.front_setback:
        base, target = (ps.assembly[name].bounding_box() for name in ps.front_setback)
        lo, hi = base.min.Y / IN, target.min.Y / IN
        x = tx + (min(base.max.X, target.max.X) / IN - t.box[0]) * s - 0.3
        _dim_v(ax, x, ty + (lo - t.box[1]) * s, ty + (hi - t.box[1]) * s, fmt_in(hi - lo))
    # part numbers at each item's centre in the top view
    placed = []
    for name, shape in ps.assembly.items():
        c = shape.bounding_box().center()
        u, v = to_view((c.X / IN, c.Y / IN, c.Z / IN), "top")
        px, py = tx + (u - t.box[0]) * s, ty + (v - t.box[1]) * s
        if any(abs(px - qx) < 0.2 and abs(py - qy) < 0.2 for qx, qy in placed):
            continue
        placed.append((px, py))
        ax.add_patch(Circle((px, py), 0.085, facecolor="white", edgecolor=INK, lw=0.5))
        _text(ax, px, py, str(numbers[name]), size=5.4, ha="center", va="center")
    # parts list in the box beside the title block
    _text(ax, 0.42, 0.3 + 1.25 - 0.13, "PARTS", size=7, weight="bold")
    rows = [(i + 1, p.name, p.qty, _stock_size(p)) for i, p in enumerate(specs)]
    rows += [(numbers[lb], lb + " (reference)", 1, _blank_size(ps.assembly[lb])) for lb in extra]
    per_col, col_w = 7, 2.05
    for k, (num, name, qty, size) in enumerate(rows):
        col, row = divmod(k, per_col)
        if col >= 3:
            _text(ax, 0.42 + 2 * col_w, 0.42, f"... {len(rows) - k} more: see the cut list", size=5.6, color=QUIET)
            break
        x = 0.42 + col * col_w
        y = 0.3 + 1.25 - 0.3 - row * 0.13
        _text(ax, x, y, f"{num:>2} {name[:14]} x{qty}", size=5.5)
        _text(ax, x + col_w - 0.1, y, size, size=5.0, ha="right", color=QUIET)
    _text(ax, a2 - 0.05, a1 + 0.05, f"SCALE {label}", size=6.5, ha="right")
    pdf.savefig(fig)
    plt.close(fig)


def _extensions(ax, a, b, end):
    sign = 1 if end >= b else -1
    return a, b + sign * .025, end + sign * .045


def _dim_h(ax, x1, x2, y, text, ya=None, yb=None):
    if x2<x1:
        x1,x2,ya,yb=x2,x1,yb,ya
    if abs(x2-x1) < 1e-7:
        return
    ya = y - .2 if ya is None else ya
    yb = y - .2 if yb is None else yb
    for x, a in ((x1, ya), (x2, yb)):
        _, start, end = _extensions(ax, x, a, y)
        ax.plot([x, x], [start, end], color=LIGHT, lw=0.45)
    _dimension_line(ax, (x1, y), (x2, y), text, False)


def _dim_v(ax, x, y1, y2, text, xa=None, xb=None):
    if y2<y1:
        y1,y2,xa,xb=y2,y1,xb,xa
    if abs(y2-y1) < 1e-7:
        return
    xa = x + .2 if xa is None else xa
    xb = x + .2 if xb is None else xb
    for y, a in ((y1, xa), (y2, xb)):
        _, start, end = _extensions(ax, y, a, x)
        ax.plot([start, end], [y, y], color=LIGHT, lw=0.45)
    _dimension_line(ax, (x, y1), (x, y2), text, True)


def _dimension_line(ax, a, b, label, vertical):
    """Arrowheads outside short spans, with readable text outside the arrows."""
    axis = int(vertical)
    span = abs(b[axis] - a[axis])
    # Keep the value away from the arrowheads and neighboring dimension strings.
    short = span < max(.22, len(label)*.055)
    props = dict(arrowstyle="<->", lw=.65, color=INK, shrinkA=0, shrinkB=0,
                 mutation_scale=8)
    if short:
        ax.plot([a[0], b[0]], [a[1], b[1]], color=INK, lw=.65)
        for p, sign in ((a, -1), (b, 1)):
            q = list(p)
            q[axis] += sign*.12
            ax.annotate("", p, q, arrowprops={**props, "arrowstyle": "->"})
    else:
        ax.annotate("", b, a, arrowprops=props)
    x, y = ((a[0]+b[0])/2, (a[1]+b[1])/2)
    if vertical:
        _text(ax, x-.045, y, label, size=8, ha="right", va="center", rotation=90,
              bbox=dict(facecolor="white", edgecolor="none", pad=.1))
    else:
        _text(ax, x, y+.045, label, size=8, ha="center", va="bottom",
              bbox=dict(facecolor="white", edgecolor="none", pad=.1))


def _bbox_in(shape):
    b = shape.bounding_box().size
    return (b.X / IN, b.Y / IN, b.Z / IN)


def _blank_size(shape, fit=False):
    return " x ".join(fmt_in(d, fit=fit) for d in sorted(_bbox_in(shape)))


def _stock_size(part):
    return part.stock_size or _blank_size(part.local(), part.fit_dimensions)


def _part_sheet(pdf, ps: PlanSet, part: PartSpec, n, total, views, detail_count):
    W, H = PAGES[ps.page]
    fig, ax = _page(W, H)
    shape = part.local()
    fit = part.fit_dimensions
    area = _frame_and_title(ax, W, H, ps.title, f"PART: {part.name}  (QTY {part.qty})", n, total, "", [
        f"Material: {part.material or '-'}",
        f"Stock: {_stock_size(part)}",
        f"{detail_count} dimension/detail sheets follow." if detail_count else "Overall dimensions."])
    keys = part.views
    a0, a1, a2, a3 = area
    s, label, at = _three_views(ax, (a0, a1, a2, a3), views, dims=True)
    for slot, view_name in zip(("top", "front", "right"), keys):
        v = views[slot]
        x, y = at[slot]
        _draw_geometry(ax, v, x, y, s)
        _view_title(ax, x, y + v.height * s + (0.08 if slot != "front" else 0.08), view_name, label)
        _arrow_dimensions(ax, v, x, y, s, fit=fit)
    _text(ax, a2 - 0.05, a1 + 0.05, f"SCALE {label}", size=6.5, ha="right")
    notes=([f"Grain: {part.grain}"] if part.grain else [])+part.notes
    _notes_box(ax, 0.42, 0.3 + 1.25 - 0.12, W - 0.3 - 4.4 - 0.55, notes or ["-"], size=6.0)
    pdf.savefig(fig)
    plt.close(fig)


def _detail_jobs(part, views):
    """Plan all detail sheets before numbering the PDF. Do not merge opposite faces."""
    jobs = []
    # Named features are the complete machining register. Do not repeat an
    # indiscriminate vertex schedule on their parent. Include stock trimming
    # operations in the register whenever the blank is not rectangular.
    for slot, name in (() if part.features else zip(("top", "front", "right"), part.views)):
        v = views[slot]
        if any(_dimension_pairs(v, a) for a in (0, 1)) or v.circles or v.arcs or any(
                edge_angle_label(x2-x1, y2-y1) for x1, y1, x2, y2 in v.lines):
            for i, batch in enumerate(_batches(v), 1):
                jobs.append((name, v, batch, f"{name.upper()} / LAYOUT {i}", None, None))
    for feature in part.features:
        if feature.datum is None:
            point=part.local().bounding_box().min
            feature=replace(feature,datum=part.datum or (point.X/IN,point.Y/IN,point.Z/IN))
        local = part.frame.to_local_coords(feature.shape) if part.frame is not None else feature.shape
        feature_jobs = []
        for name in feature.views:
            child = project(local, name)
            parent = project(part.local(), name)
            for i, batch in enumerate(_batches(child), 1):
                feature_jobs.append((name, child, batch, f"{name.upper()} {i}", parent, feature))
        # Two true-shape views per feature sheet, same scale. A third view or
        # a complex polygon becomes the next sheet, not a crowded label stack.
        jobs.extend(tuple(feature_jobs[i:i+2]) for i in range(0,len(feature_jobs),2))
    return jobs


def _feature_sheet(pdf, ps, title, jobs, n, total, fit):
    W,H=PAGES[ps.page]
    fig,ax=_page(W,H)
    feature=jobs[0][-1]
    a0,a1,a2,a3=_frame_and_title(ax,W,H,ps.title,title,n,total,"",[
        f"{feature.name} / {feature.role}",f"MATES: {feature.mate or '-'}"])
    _text(ax,a0+.18,a3-.27,f"{feature.name}  /  {feature.role}",size=11,weight="bold")
    cell=(a2-a0)/len(jobs)
    width=max(.3,cell-2.2)
    height=max(.3,a3-a1-3.9)
    scale=min(12,*(width/max(j[1].width,.001) for j in jobs),
              *(height/max(j[1].height,.001) for j in jobs))
    for i,(name,v,batch,caption,parent,_) in enumerate(jobs):
        left=a0+i*cell
        lx=left+1.4
        ly=a3-1.65
        ls=min(width/max(parent.width,.001),.65/max(parent.height,.001))
        _draw_geometry(ax,parent,lx,ly,ls)
        x0,y0=parent.box[:2]
        x1,y1,x2,y2=v.box
        # Normal-view bores locate their actual centre, not a tangent edge.
        circles=[c for c in v.circles if not c[3]]
        cx,cy=(circles[0][:2] if len(circles)==1 else (x1,y1))
        du,dv=to_view(feature.datum,name)
        fx=lx+(cx-x0)*ls; fy=ly+(cy-y0)*ls
        dx=lx+(du-x0)*ls; dy=ly+(dv-y0)*ls
        ax.add_patch(Rectangle((lx+(x1-x0)*ls,ly+(y1-y0)*ls),
                               (x2-x1)*ls,(y2-y1)*ls,fill=False,edgecolor="#06728a",lw=1.2))
        ax.plot(dx,dy,marker="o",ms=2.7,color="#06728a")
        _dim_h(ax,dx,fx,ly-.20,fmt_in(abs(cx-du),64,fit=True),dy,fy)
        _dim_v(ax,lx-.22,dy,fy,fmt_in(abs(cy-dv),64,fit=True),dx,fx)
        _text(ax,lx,ly-.45,"REF / LOCATION",size=7,weight="bold")
        _text(ax,left+.15,a3-.65,caption,size=8,weight="bold")
        x=lx+max(0,(width-v.width*scale)/2)
        y=a1+1.48+max(0,(height-v.height*scale)/2)
        # Show neighboring wood at the exact same scale, but only around the
        # cut; otherwise a mortise detail is just an isolated rectangle.
        clip=(max(left+.25,x-.30),max(a1+1.35,y-.18),v.width*scale+.60,v.height*scale+.36)
        _draw_geometry(ax,parent,x+(parent.box[0]-v.box[0])*scale,
                       y+(parent.box[1]-v.box[1])*scale,scale,True,clip)
        _draw_geometry(ax,v,x,y,scale)
        _arrow_dimensions(ax,v,x,y,scale,batch,fit=True)
        _callouts(ax,v,x,y,scale,fit=True)
        if i:
            ax.plot([left,left],[a1+.1,a3-.5],color=LIGHT,lw=.4)
    if feature.notes:
        _notes_box(ax,.42,1.42,W-5.1,feature.notes,size=7)
    _text(ax,a2-.12,a1+.04,f"DETAIL SCALE {scale:.3g}:1",size=7,ha="right")
    pdf.savefig(fig)
    plt.close(fig)


def _detail_sheet(pdf, ps, title, job, n, total, fit=False):
    name, v, batch, caption, parent, feature = job
    W, H = PAGES[ps.page]
    fig, ax = _page(W, H)
    rows = ["Conventional arrow dimensions; inches.",
            f"Mates: {feature.mate}" if feature and feature.mate else "REF at low edges of this view."]
    a0, a1, a2, a3 = _frame_and_title(ax, W, H, ps.title, title, n, total, "", rows)
    _text(ax, a0+.18, a3-.3, caption, size=10, weight="bold")
    top = a3-.7
    if parent:
        # Keep the location on the actual full-part projection, rather than a
        # bare datum register or an unscaled schematic.
        ls = min((a2-a0-2.3)/max(parent.width, .01), .65/max(parent.height,.01))
        lx, ly = a0+1.6, top-.9
        _draw_geometry(ax, parent, lx, ly, ls)
        x0, y0, _, _ = parent.box
        x1, y1, x2, y2 = v.box
        ax.add_patch(Rectangle((lx+(x1-x0)*ls,ly+(y1-y0)*ls),
                               (x2-x1)*ls,(y2-y1)*ls,fill=False,edgecolor="#06728a",lw=1.2))
        _dim_h(ax,lx,lx+(x1-x0)*ls,ly-.23,fmt_in(x1-x0,fit=True),ly,ly+(y1-y0)*ls)
        _dim_v(ax,lx-.24,ly,ly+(y1-y0)*ls,fmt_in(y1-y0,fit=True),lx,lx+(x1-x0)*ls)
        _text(ax,lx,ly-.5,"REF / FEATURE LOCATION (highlighted)",size=7,weight="bold")
        top = ly-.65
    # Detail views may enlarge; fixed paper allowance for three dimension lanes.
    avail_w, avail_h = a2-a0-2.35, top-a1-1.65
    s = min(avail_w/max(v.width,.001), avail_h/max(v.height,.001), 12)
    if s <= 0:
        raise ValueError("Detail will not fit; use tabloid or fewer views")
    x = a0+1.65+max(0,(avail_w-v.width*s)/2)
    y = a1+1.45+max(0,(avail_h-v.height*s)/2)
    _draw_geometry(ax,v,x,y,s)
    _arrow_dimensions(ax,v,x,y,s,batch,fit=fit)
    _callouts(ax,v,x,y,s,fit=fit)
    if feature and feature.notes:
        _notes_box(ax,.42,1.42,W-5.1,feature.notes,size=7)
    _text(ax,a2-.12,a1+.04,f"DETAIL SCALE {s:.3g}:1",size=7,ha="right")
    pdf.savefig(fig)
    plt.close(fig)


def _signed_area(ring):
    return 0.5 * sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(ring, ring[1:] + ring[:1]))


def hatch_path(rings, to_paper=lambda p: p):
    """Compound path for a cut face: the outer ring, then each hole wound the other way, so
    the hatch fills material only and leaves holes empty."""
    verts, codes = [], []
    outer_sign = None
    for i, ring in enumerate(rings):
        pts = [to_paper(p) for p in ring]
        sign = _signed_area(pts) > 0
        if i == 0:
            outer_sign = sign
        elif sign == outer_sign:
            pts = pts[::-1]
        verts += pts + [pts[0]]
        codes += [MPath.MOVETO] + [MPath.LINETO] * (len(pts) - 1) + [MPath.CLOSEPOLY]
    return MPath(verts, codes)


def _section_data(ps, sec):
    d, _, _ = _axes(sec.view)
    normal = (-d[0], -d[1], -d[2])               # points away from the viewer
    plane = Plane(origin=Vector(*(c * IN for c in sec.point)), z_dir=Vector(*normal))
    kept, faces = {}, []
    for name, shape in ps.assembly.items():
        piece = split(shape, bisect_by=plane, keep=Keep.TOP)
        if piece is None or not piece.solids():
            continue
        kept[name] = piece
        for f in piece.faces():
            if f.geom_type != GeomType.PLANE:
                continue
            nrm, ctr = f.normal_at(f.center()), f.center()
            on_plane = abs((ctr - plane.origin).dot(plane.z_dir)) < 1e-3
            if on_plane and abs(abs(nrm.dot(plane.z_dir)) - 1) < 1e-6:
                rings = []
                for wire in [f.outer_wire(), *f.inner_wires()]:
                    n_pts = max(16, int(wire.length / IN * 6))
                    pts = [wire.position_at(i / n_pts) for i in range(n_pts)]
                    rings.append([to_view((p.X / IN, p.Y / IN, p.Z / IN), sec.view) for p in pts])
                faces.append(rings)
    return project(kept, sec.view), faces


def _section_sheet(pdf, ps: PlanSet, sec: Section, n, total, data, batch, index):
    W, H = PAGES[ps.page]
    fig, ax = _page(W, H)
    area = _frame_and_title(ax, W, H, ps.title, f"SECTION {sec.name} / {index}", n, total, "", [
        "Cut faces hatched. Material beyond the cut shown.", "Dimensions reference actual cut edges."])
    v, faces = data
    a0, a1, a2, a3 = area
    s, label = choose_scale(v.width, v.height, a2 - a0, a3 - a1, fixed_w=2.4, fixed_h=2.4)
    x = a0 + max(1.65, (a2 - a0 - v.width * s) / 2)
    y = a1 + max(1.45, (a3 - a1 - v.height * s) / 2)
    for rings in faces:
        ax.add_patch(PathPatch(hatch_path(rings, lambda p: (x + (p[0] - v.box[0]) * s, y + (p[1] - v.box[1]) * s)),
                               facecolor="none", edgecolor=INK, hatch="////", lw=0.4))
    _draw_geometry(ax, v, x, y, s)
    _view_title(ax, x, y + v.height * s + 0.12, f"SECTION {sec.name} (looking as the {sec.view} view)", label)
    _arrow_dimensions(ax, v, x, y, s, batch)
    _text(ax, a2 - 0.1, a1 + 0.05, f"SCALE {label}", size=6, ha="right")
    pdf.savefig(fig)
    plt.close(fig)


def _text_lines(ps: PlanSet, cut_rows) -> list[str]:
    lines = ["CUT LIST", ""]
    lines.append(f"{'#':>2}  {'PART':<28}{'QTY':>4}   {'T x W x L (in)':<34}{'MATERIAL'}")
    for i, (name, qty, size, mat) in enumerate(cut_rows, 1):
        lines.append(f"{i:>2}  {name[:27]:<28}{qty:>4}   {size:<34}{mat}")
    lines += ["", "NOTES", ""] + [f"- {x}" for x in ps.notes]
    if ps.verify:
        lines += ["", "MEASURE BEFORE BUILDING (values in these plans that use placeholders)", ""]
        lines += [f"- {x}" for x in ps.verify]
    if ps.shop_notes:
        lines += ["", "SHOP NOTES", ""] + [ln.lstrip("#").strip() if ln.startswith("#") else ln
                                           for ln in ps.shop_notes.splitlines()]
    out = []
    for line in lines:
        out += wrap(line, 118) if line else [""]
    return out


LINE_STEP, TEXT_TOP, TITLE_TOP = 0.118, 0.55, 0.3 + 1.25 + 0.1


def lines_per_page(page: str) -> int:
    """Text rows that fit between the top margin and the title block's top edge."""
    _, H = PAGES[page]
    return int((H - TEXT_TOP - TITLE_TOP) / LINE_STEP) + 1


def _text_sheets(pdf, ps: PlanSet, n0, total, lines):
    W, H = PAGES[ps.page]
    per = lines_per_page(ps.page)
    pages = [lines[i:i + per] for i in range(0, len(lines), per)] or [[]]
    for k, chunk in enumerate(pages):
        fig, ax = _page(W, H)
        _frame_and_title(ax, W, H, ps.title, "CUT LIST AND NOTES", n0 + k, total, "-", [])
        yy = H - TEXT_TOP
        for line in chunk:
            _text(ax, 0.5, yy, line, size=6.4, family="DejaVu Sans Mono")
            yy -= LINE_STEP
        pdf.savefig(fig)
        plt.close(fig)


def _unique_parts(ps: PlanSet) -> list:
    unique, seen = [], set()
    for p in ps.parts:
        if p.name not in seen:
            seen.add(p.name)
            unique.append(p)
    return unique


def coverage_report(ps: PlanSet):
    """Report occurrence-to-detail omissions/duplicates and quantities.

    Unmatched assembly items may be intentional machine references; document
    them rather than silently treating them as fabricated components.
    """
    unique=_unique_parts(ps)
    counts={p.name:0 for p in unique}
    unmatched,ambiguous=[],[]
    for mark in ps.assembly:
        matches=[p.name for p in unique if p.covers(mark)]
        if not matches:
            unmatched.append(mark)
        elif len(matches)>1:
            ambiguous.append((mark,matches))
        else:
            counts[matches[0]]+=1
    return {"unmatched":unmatched,"ambiguous":ambiguous,
            "quantity_mismatches":[(p.name,p.qty,counts[p.name]) for p in unique
                                   if counts[p.name]!=p.qty],
            "duplicate_part_names":len(ps.parts)-len(unique),
            "feature_counts":{p.name:len(p.features) for p in unique},
            "duplicate_feature_ids":[p.name for p in unique if
                                     len({f.name for f in p.features})!=len(p.features)]}


def write_plan_set(ps: PlanSet, path) -> Path:
    """Write the plan set as one multi-page PDF and return its path."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    unique = _unique_parts(ps)
    cut_rows = [(p.name, p.qty, _stock_size(p), p.material) for p in unique]
    part_jobs = []
    for p in unique:
        views = {slot: project(p.local(), name)
                 for slot, name in zip(("top", "front", "right"), p.views)}
        part_jobs.append((p, views, _detail_jobs(p, views)))
    section_jobs = [(sec, _section_data(ps, sec)) for sec in ps.sections]
    lines = _text_lines(ps, cut_rows)
    text_pages = max(1, -(-len(lines) // lines_per_page(ps.page)))
    total = 1 + sum(len(_batches(data[0])) for _, data in section_jobs) + sum(
        1+len(jobs) for _, _, jobs in part_jobs) + text_pages
    toc=[[1,"Assembly",1]]
    with PdfPages(path) as pdf:
        n = 1
        _assembly_sheet(pdf, ps, n, total)
        for sec, data in section_jobs:
            for i, batch in enumerate(_batches(data[0]), 1):
                n += 1
                _section_sheet(pdf, ps, sec, n, total, data, batch, i)
                toc.append([1,f"Section {sec.name} / {i}",n])
        for part, views, jobs in part_jobs:
            n += 1
            _part_sheet(pdf, ps, part, n, total, views, len(jobs))
            toc.append([1,f"Part {part.name}",n])
            for job in jobs:
                n += 1
                if isinstance(job[0],tuple):
                    _feature_sheet(pdf, ps, f"PART: {part.name} / DETAIL",job,n,total,part.fit_dimensions)
                    toc.append([2,f"{job[0][-1].name} / {', '.join(j[3] for j in job)}",n])
                else:
                    _detail_sheet(pdf, ps, f"PART: {part.name} / DETAIL", job, n, total, part.fit_dimensions)
                    toc.append([2,job[3],n])
        _text_sheets(pdf, ps, n + 1, total, lines)
        toc.extend([1,f"Cut list and notes / {i+1}",n+i+1] for i in range(text_pages))
        meta = pdf.infodict()
        meta["Title"] = ps.title
        meta["Creator"] = "wood-stereotomy plans.py"
    # A navigable set is especially important when joint details expand to
    # many sheets. PyMuPDF changes PDF structure only, never drawing geometry.
    import pymupdf
    with pymupdf.open(path) as doc:
        doc.set_toc(toc)
        doc.saveIncr()
    return path
