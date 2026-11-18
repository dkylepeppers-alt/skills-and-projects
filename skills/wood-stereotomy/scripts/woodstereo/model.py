"""build123d modeling helpers. Requires build123d (see requirements.txt).

build123d works in millimetres. Callers pass inches; these helpers multiply by IN going in
and divide coming out, so every number in a script and every report stays in inches.
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path

from build123d import (IN, Box, Compound, GeomType, Keep, Location, Plane, Pos, Solid, Vector,
                       export_step, split)

from .geometry import Frame, Vec


def _mm(p: Vec) -> Vector:
    return Vector(p[0] * IN, p[1] * IN, p[2] * IN)


def member_plane(origin: Vec, frame: Frame) -> Plane:
    """Local plane of a member: local x = u, y = v, z = w, at `origin` (inches)."""
    return Plane(origin=_mm(origin), x_dir=Vector(*frame.u), z_dir=Vector(*frame.w))


def blank(origin: Vec, frame: Frame, size_v: float, size_w: float, back: float,
          forward: float) -> Solid:
    """Rectangular blank on a member axis, from `back` behind `origin` to `forward` beyond
    it along +u. The roll is whatever `frame` says: build the frame deliberately."""
    length = back + forward
    box = Box(length * IN, size_v * IN, size_w * IN)
    box = Pos(((forward - back) / 2) * IN, 0, 0) * box
    return member_plane(origin, frame).location * box


def cut_plane(point: Vec, normal: Vec) -> Plane:
    """A cutting plane through `point` with `normal` (inches)."""
    return Plane(origin=_mm(point), z_dir=Vector(*normal))


def split_at(shape, point: Vec, normal: Vec):
    """Split one solid with a shared interface plane and return (behind, ahead): the piece on
    the -normal side and the piece on the +normal side. Cutting both mating parts from the
    same plane is what makes them mate by construction."""
    plane = cut_plane(point, normal)
    return split(shape, bisect_by=plane, keep=Keep.BOTTOM), split(shape, bisect_by=plane, keep=Keep.TOP)


def trim(shape, point: Vec, normal: Vec):
    """Keep the part of `shape` on the -normal side of the plane (normal points at the waste)."""
    return split(shape, bisect_by=cut_plane(point, normal), keep=Keep.BOTTOM)


def box_at(center: Vec, size: Vec) -> Solid:
    """Axis-aligned box by center and size, inches."""
    return Pos(*(c * IN for c in center)) * Box(*(s * IN for s in size))


# --------------------------------------------------------------------------- checks

ALLOWED_SURFACES = {GeomType.PLANE, GeomType.CYLINDER}


def surface_audit(shape) -> dict:
    """Count faces by surface type and flag anything outside the non-CNC envelope.
    Planes come from saws, planes and chisels; cylinders from drills and router bits.
    A cylinder can also be a curved profile cut straight through (bandsaw, template):
    confirm by eye that its axis runs through the thickness."""
    counts = Counter(f.geom_type for f in shape.faces())
    outside = {str(k): v for k, v in counts.items() if k not in ALLOWED_SURFACES}
    return {"faces": {str(k): v for k, v in counts.items()}, "outside_envelope": outside,
            "ok": not outside}


def volume_in3(shape) -> float:
    return shape.volume / IN ** 3


def interference_in3(a, b) -> float:
    """Volume shared by two parts, cubic inches. Mating parts should give ~0."""
    common = a & b
    if common is None:
        return 0.0
    try:
        return abs(common.volume) / IN ** 3
    except AttributeError:
        return sum(abs(s.volume) for s in common) / IN ** 3


def contact_area_in2(a, b, tol_in: float = 1e-4) -> float:
    """Approximate bearing area between two touching parts, square inches. Extrudes each
    planar face of `a` outward by a hair and measures how much of that sliver lies in `b`."""
    total = 0.0
    t = tol_in * IN
    for face in a.faces():
        if face.geom_type != GeomType.PLANE:
            continue
        normal = face.normal_at(face.center())
        slab = Solid.extrude(face, normal * t)
        common = slab & b
        if common is None:
            continue
        vol = common.volume if hasattr(common, "volume") else sum(s.volume for s in common)
        total += abs(vol) / t
    return total / IN ** 2


def bbox_in(shape) -> tuple[float, float, float]:
    size = shape.bounding_box().size
    return (size.X / IN, size.Y / IN, size.Z / IN)


def min_edge_angle_deg(shape) -> float:
    """Sharpest dihedral between adjacent planar faces: a small value means a feather edge."""
    from math import acos, degrees
    sharpest = 180.0
    for edge in shape.edges():
        faces = [f for f in shape.faces() if f.geom_type == GeomType.PLANE and
                 any(e.is_same(edge) for e in f.edges())]
        if len(faces) != 2:
            continue
        mid = edge.center()
        n1, n2 = faces[0].normal_at(mid), faces[1].normal_at(mid)
        inside = 180 - degrees(acos(max(-1.0, min(1.0, n1.dot(n2)))))
        sharpest = min(sharpest, inside)
    return sharpest


# --------------------------------------------------------------------------- output

def save_step(shape, path: str | Path, label: str | None = None) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if label:
        shape.label = label
    export_step(shape, str(path))
    return path


def assembly(parts: dict) -> Compound:
    """Labeled compound from {label: shape}. Children are copies, so the originals stay free
    to be exported or reused on their own."""
    from copy import copy
    children = []
    for label, shape in parts.items():
        child = copy(shape)
        child.label = label
        children.append(child)
    return Compound(label="assembly", children=children)


def save_preview_svg(shape, path: str | Path, view_from: Vec = (-1.0, -1.6, 1.0)) -> Path:
    """Hidden-line preview from a viewpoint, for a visual check without a CAD viewer."""
    from build123d import ExportSVG, LineType
    path = Path(path)
    box = shape.bounding_box()
    center = box.center()
    reach = max(box.size.X, box.size.Y, box.size.Z) * 3
    origin = center + Vector(*view_from).normalized() * reach
    visible, hidden = shape.project_to_viewport(tuple(origin), viewport_up=(0, 0, 1),
                                                look_at=tuple(center))
    size = max(*Compound(children=visible + hidden).bounding_box().size)
    svg = ExportSVG(scale=180 / size)
    svg.add_layer("visible", line_weight=0.35)
    svg.add_layer("hidden", line_weight=0.15, line_type=LineType.ISO_DOT)
    svg.add_shape(visible, layer="visible")
    svg.add_shape(hidden, layer="hidden")
    svg.write(str(path))
    return path
