"""Plan sets: dimensioned shop drawings from the same build123d model, as one PDF.

A plan set has
  1. an assembly sheet: top, front and right views, overall sizes, numbered parts and the
     parts list;
  2. one sheet per section the design calls for, with the cut faces hatched;
  3. one detail sheet per distinct part: three views, every corner, hole and edge located
     by ordinate dimensions from the part's reference corner, hole sizes, angles of every
     edge that is not square;
  4. a cut list sheet; and 5. the shop notes (settings, sequence, checks).

Views are third-angle orthographic, drawn with hidden lines. Dimensions are inches, as
fractions to 1/32 with the decimal added where rounding would mislead. Ordinate zero in
each view is the lower-left corner of that view: mark those faces as the reference face and
edge on the part, and measure every layout mark from them.

Requires build123d and matplotlib (requirements.txt).
"""
from __future__ import annotations

import datetime
from dataclasses import dataclass, field
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from build123d import IN, Compound, GeomType, Keep, Plane, Vector, split  # noqa: E402
from matplotlib.backends.backend_pdf import PdfPages  # noqa: E402
from matplotlib.patches import Circle, PathPatch, Polygon, Rectangle  # noqa: E402
from matplotlib.path import Path as MPath  # noqa: E402

from .drafting import choose_scale, edge_angle_label, fmt_in, ordinates, spread, wrap  # noqa: E402

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

    def covers(self, label: str) -> bool:
        if self.match is None:
            return label == self.name
        if isinstance(self.match, str):
            return label.startswith(self.match)
        return label in self.match

    def local(self):
        return self.frame.to_local_coords(self.shape) if self.frame is not None else self.shape


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
        n = max(12, int(edge.length / IN * 8))
        pts = [edge.position_at(i / n) for i in range(n + 1)]
    return [(p.X / IN, p.Y / IN) for p in pts]


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
    circles = set()
    for group, flag in ((vis, False), (hid, True)):
        for e in group:
            if e.geom_type == GeomType.CIRCLE:
                c = e.arc_center
                circles.add((round(c.X / IN, 4), round(c.Y / IN, 4), round(e.radius / IN, 4), flag))
    # a circle seen both ways is visible
    circles = {c for c in circles if not (c[3] and (c[0], c[1], c[2], False) in circles)}
    pts = [p for pl in visible + hidden for p in pl]
    box = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
    return View2D(visible, hidden, lines, sorted(circles), box, hidden_lines)


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


def _draw_geometry(ax, v: View2D, ox, oy, s):
    x0, y0 = v.box[0], v.box[1]
    for pl in v.hidden:
        ax.plot([ox + (p[0] - x0) * s for p in pl], [oy + (p[1] - y0) * s for p in pl],
                color=QUIET, lw=0.35, ls=(0, (3, 2)))
    for pl in v.visible:
        ax.plot([ox + (p[0] - x0) * s for p in pl], [oy + (p[1] - y0) * s for p in pl],
                color=INK, lw=0.7, solid_capstyle="round")


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


def _ordinates_x(ax, v, ox, oy, s, skip=(), below=True):
    xs, _ = _ordinate_points(v)
    allv = ordinates(xs + [v.box[0], v.box[2]])
    vals = [x for x in allv if not any(abs(x - k) < 1 / 64 for k in skip)]
    if not vals:
        return []
    if vals[0] != 0:
        vals = [0.0] + vals              # always show the datum the new values are measured from
    base = oy - 0.1 if below else oy + v.height * s + 0.1
    feats = [ox + x * s for x in vals]
    labels = spread(feats, 0.135)
    sign = -1 if below else 1
    for fx, lx, val in zip(feats, labels, vals):
        ax.plot([fx, fx, lx], [base, base + sign * 0.1, base + sign * 0.2], color=LIGHT, lw=0.3)
        _text(ax, lx, base + sign * 0.23, fmt_in(val), size=5.8, rotation=90,
              ha="center", va="top" if below else "bottom")
    ax.plot([feats[0], feats[-1]], [base, base], color=LIGHT, lw=0.3)
    return vals


def _ordinates_y(ax, v, ox, oy, s, skip=(), left=True):
    _, ys = _ordinate_points(v)
    allv = ordinates(ys + [v.box[1], v.box[3]])
    vals = [y for y in allv if not any(abs(y - k) < 1 / 64 for k in skip)]
    if not vals:
        return []
    if vals[0] != 0:
        vals = [0.0] + vals              # always show the datum the new values are measured from
    base = ox - 0.1 if left else ox + v.width * s + 0.1
    feats = [oy + y * s for y in vals]
    labels = spread(feats, 0.115)
    sign = -1 if left else 1
    for fy, ly, val in zip(feats, labels, vals):
        ax.plot([base, base + sign * 0.1, base + sign * 0.2], [fy, fy, ly], color=LIGHT, lw=0.3)
        _text(ax, base + sign * 0.23, ly, fmt_in(val), size=5.8, ha="right" if left else "left", va="center")
    ax.plot([base, base], [feats[0], feats[-1]], color=LIGHT, lw=0.3)
    return vals


def _callouts(ax, v, ox, oy, s):
    x0, y0 = v.box[0], v.box[1]
    stack = {}
    for cx, cy, r, hidden in v.circles:
        key = (round(cx, 3), round(cy, 3))
        k = stack.get(key, 0)
        stack[key] = k + 1
        px, py = ox + (cx - x0) * s, oy + (cy - y0) * s
        label = f"\u00d8{fmt_in(2 * r, 64)}" + (" (hidden)" if hidden else "")
        _text(ax, px + 0.12, py + 0.05 + 0.11 * k, label, size=5.6, color=QUIET,
              bbox=dict(facecolor="white", edgecolor="none", pad=0.3))
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
    dim_l, dim_b, gap_v, gap_h, head = (1.05, 0.95, 1.05, 0.55, 0.3) if dims else (0.5, 0.5, 0.55, 0.55, 0.3)
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
    _dim_h(ax, tx, tx + t.width * s, ty + t.height * s + 0.25, fmt_in(t.width))
    _dim_v(ax, tx - 0.25, ty, ty + t.height * s, fmt_in(t.height))
    _dim_v(ax, fx - 0.25, fy, fy + f.height * s, fmt_in(f.height))
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
    rows = [(i + 1, p.name, p.qty, p.local()) for i, p in enumerate(specs)]
    rows += [(numbers[lb], lb + " (reference)", 1, ps.assembly[lb]) for lb in extra]
    per_col, col_w = 7, 2.05
    for k, (num, name, qty, shape) in enumerate(rows):
        col, row = divmod(k, per_col)
        if col >= 3:
            _text(ax, 0.42 + 2 * col_w, 0.42, f"... {len(rows) - k} more: see the cut list", size=5.6, color=QUIET)
            break
        x = 0.42 + col * col_w
        y = 0.3 + 1.25 - 0.3 - row * 0.13
        dims = sorted(_bbox_in(shape))
        size = " x ".join(fmt_in(d, 32) for d in dims)
        _text(ax, x, y, f"{num:>2} {name[:14]} x{qty}", size=5.5)
        _text(ax, x + col_w - 0.1, y, size, size=5.0, ha="right", color=QUIET)
    _text(ax, a2 - 0.05, a1 + 0.05, f"SCALE {label}", size=6.5, ha="right")
    pdf.savefig(fig)
    plt.close(fig)


def _dim_h(ax, x1, x2, y, text):
    ax.annotate("", (x1, y), (x2, y), arrowprops=dict(arrowstyle="<->", lw=0.5, color=INK, shrinkA=0, shrinkB=0))
    ax.plot([x1, x1], [y - 0.2, y + 0.05], color=LIGHT, lw=0.3)
    ax.plot([x2, x2], [y - 0.2, y + 0.05], color=LIGHT, lw=0.3)
    _text(ax, (x1 + x2) / 2, y + 0.04, text, size=6.5, ha="center", va="bottom")


def _dim_v(ax, x, y1, y2, text):
    ax.annotate("", (x, y1), (x, y2), arrowprops=dict(arrowstyle="<->", lw=0.5, color=INK, shrinkA=0, shrinkB=0))
    ax.plot([x - 0.05, x + 0.2], [y1, y1], color=LIGHT, lw=0.3)
    ax.plot([x - 0.05, x + 0.2], [y2, y2], color=LIGHT, lw=0.3)
    _text(ax, x - 0.05, (y1 + y2) / 2, text, size=6.5, ha="right", va="center", rotation=90)


def _bbox_in(shape):
    b = shape.bounding_box().size
    return (b.X / IN, b.Y / IN, b.Z / IN)


def _part_sheet(pdf, ps: PlanSet, part: PartSpec, n, total):
    W, H = PAGES[ps.page]
    fig, ax = _page(W, H)
    t_, w_, l_ = sorted(_bbox_in(part.local()))
    area = _frame_and_title(ax, W, H, ps.title, f"PART: {part.name}  (QTY {part.qty})", n, total, "", [
        f"Material: {part.material or '-'}",
        f"Blank: {fmt_in(t_, 32)} x {fmt_in(w_, 32)} x {fmt_in(l_, 32)}",
        "Ordinates from the REF corner of each view."])
    shape = part.local()
    keys = part.views
    views = {"top": project(shape, keys[0]), "front": project(shape, keys[1]), "right": project(shape, keys[2])}
    a0, a1, a2, a3 = area
    s, label, at = _three_views(ax, (a0, a1, a2, a3), views, dims=True)
    done_x, done_y = [], []
    for slot, view_name in zip(("top", "front", "right"), keys):
        v = views[slot]
        x, y = at[slot]
        _draw_geometry(ax, v, x, y, s)
        _view_title(ax, x, y + v.height * s + (0.08 if slot != "front" else 0.08), view_name, label)
        _callouts(ax, v, x, y, s)
        if slot == "top":
            done_x = _ordinates_x(ax, v, x, y, s)
            done_y_top = _ordinates_y(ax, v, x, y, s)
            _ref_mark(ax, x, y)
        elif slot == "front":
            _ordinates_x(ax, v, x, y, s, skip=done_x)
            _ordinates_y(ax, v, x, y, s)
            _ref_mark(ax, x, y)
        else:
            _ordinates_y(ax, v, x, y, s, skip=[], left=False) if v.height * s > 0.6 else None
            _ordinates_x(ax, v, x, y, s, skip=done_y_top)
    _text(ax, a2 - 0.05, a1 + 0.05, f"SCALE {label}", size=6.5, ha="right")
    _notes_box(ax, 0.42, 0.3 + 1.25 - 0.12, W - 0.3 - 4.4 - 0.55, part.notes or ["-"], size=6.0)
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


def _section_sheet(pdf, ps: PlanSet, sec: Section, n, total):
    W, H = PAGES[ps.page]
    fig, ax = _page(W, H)
    area = _frame_and_title(ax, W, H, ps.title, f"SECTION {sec.name}", n, total, "", [
        "Cut faces hatched. Material beyond the cut shown.", "Ordinates from the REF corner."])
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
    v = project(kept, sec.view)
    a0, a1, a2, a3 = area
    s, label = choose_scale(v.width, v.height, a2 - a0, a3 - a1, fixed_w=1.6, fixed_h=2.2)
    x = a0 + max(1.1, (a2 - a0 - v.width * s) / 2)
    y = a1 + max(1.0, (a3 - a1 - v.height * s) / 2)
    for rings in faces:
        ax.add_patch(PathPatch(hatch_path(rings, lambda p: (x + (p[0] - v.box[0]) * s, y + (p[1] - v.box[1]) * s)),
                               facecolor="none", edgecolor=INK, hatch="////", lw=0.4))
    _draw_geometry(ax, v, x, y, s)
    _view_title(ax, x, y + v.height * s + 0.12, f"SECTION {sec.name} (looking as the {sec.view} view)", label)
    _ordinates_x(ax, v, x, y, s)
    _ordinates_y(ax, v, x, y, s)
    _ref_mark(ax, x, y)
    _text(ax, a2 - 0.1, a1 + 0.05, f"SCALE {label}", size=6, ha="right")
    pdf.savefig(fig)
    plt.close(fig)


def _text_lines(ps: PlanSet, cut_rows) -> list[str]:
    lines = ["CUT LIST", ""]
    lines.append(f"{'#':>2}  {'PART':<28}{'QTY':>4}   {'T x W x L (in)':<34}{'MATERIAL'}")
    for i, (name, qty, dims, mat) in enumerate(cut_rows, 1):
        size = " x ".join(fmt_in(d, 32) for d in dims)
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


def write_plan_set(ps: PlanSet, path) -> Path:
    """Write the plan set as one multi-page PDF and return its path."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    unique = _unique_parts(ps)
    cut_rows = [(p.name, p.qty, sorted(_bbox_in(p.local())), p.material) for p in unique]
    lines = _text_lines(ps, cut_rows)
    text_pages = max(1, -(-len(lines) // lines_per_page(ps.page)))
    total = 1 + len(ps.sections) + len(unique) + text_pages
    with PdfPages(path) as pdf:
        n = 1
        _assembly_sheet(pdf, ps, n, total)
        for sec in ps.sections:
            n += 1
            _section_sheet(pdf, ps, sec, n, total)
        for part in unique:
            n += 1
            _part_sheet(pdf, ps, part, n, total)
        _text_sheets(pdf, ps, n + 1, total, lines)
        meta = pdf.infodict()
        meta["Title"] = ps.title
        meta["Creator"] = "wood-stereotomy plans.py"
    return path
