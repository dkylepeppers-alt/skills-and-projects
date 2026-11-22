"""Cut-plane geometry for straight, square stock. Standard library only.

Conventions
-----------
Assembly frame: x, y horizontal, z up. Lengths are in inches unless a caller says otherwise.
Member frame: `u` along the member, `v` across its width, `w` across its depth, right-handed
(u x v = w). With roll 0, `v` is horizontal and `w` is the member's "top" side.
A cut plane is given by a point `O` on the member centerline and a normal `n`.
"""
from __future__ import annotations

from dataclasses import dataclass
from fractions import Fraction
from math import acos, asin, atan, atan2, cos, degrees, hypot, pi, radians, sin, sqrt, tan

Vec = tuple[float, float, float]


def dot(a: Vec, b: Vec) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a: Vec, b: Vec) -> Vec:
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def add(a: Vec, b: Vec) -> Vec:
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def sub(a: Vec, b: Vec) -> Vec:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def scale(a: Vec, k: float) -> Vec:
    return (a[0] * k, a[1] * k, a[2] * k)


def norm(a: Vec) -> float:
    return sqrt(dot(a, a))


def unit(a: Vec) -> Vec:
    length = norm(a)
    if length == 0:
        raise ValueError("zero-length vector")
    return scale(a, 1 / length)


# --------------------------------------------------------------------------- member frames

@dataclass(frozen=True)
class Frame:
    """Right-handed member frame."""
    u: Vec
    v: Vec
    w: Vec


def member_frame(yaw_deg: float, pitch_deg: float, roll_deg: float = 0.0) -> Frame:
    """Frame for a member whose axis has the given yaw (in plan, from +x toward +y) and
    pitch (above horizontal). Roll rotates v and w about u; roll 0 keeps v horizontal."""
    y, p, r = radians(yaw_deg), radians(pitch_deg), radians(roll_deg)
    u = (cos(p) * cos(y), cos(p) * sin(y), sin(p))
    v0 = (-sin(y), cos(y), 0.0)
    w0 = cross(u, v0)
    v = add(scale(v0, cos(r)), scale(w0, sin(r)))
    w = sub(scale(w0, cos(r)), scale(v0, sin(r)))
    return Frame(u, v, w)


def frame_from_axis(axis: Vec, roll_deg: float = 0.0) -> Frame:
    """Frame from an axis direction. A vertical axis has no defined yaw; give yaw explicitly
    with `member_frame` in that case."""
    u = unit(axis)
    run = hypot(u[0], u[1])
    if run < 1e-12:
        raise ValueError("vertical axis: use member_frame(yaw, 90, roll) to fix the roll")
    return member_frame(degrees(atan2(u[1], u[0])), degrees(atan2(u[2], run)), roll_deg)


# --------------------------------------------------------------------------- planar end cuts

CORNERS = (("A", -1, -1), ("B", +1, -1), ("C", +1, +1), ("D", -1, +1))
"""Corner edges going round the blank: A (-v, -w), B (+v, -w), C (+v, +w), D (-v, +w)."""


def corner_offsets(n: Vec, frame: Frame, size_v: float, size_w: float) -> dict[str, float]:
    """Signed distance t along each corner edge from the point where the centerline meets
    the cut plane to where that edge meets it. Positive t is toward +u.

    Solves n . (t u + a v + b w) = 0 for the four corners (a, b) = (+-size_v/2, +-size_w/2).
    """
    n = unit(n)
    nu, nv, nw = dot(n, frame.u), dot(n, frame.v), dot(n, frame.w)
    if abs(nu) < 1e-9:
        raise ValueError("cut plane is parallel to the member axis: no end cut exists")
    return {
        name: -(sa * size_v / 2 * nv + sb * size_w / 2 * nw) / nu
        for name, sa, sb in CORNERS
    }


def waste_direction(n: Vec, frame: Frame) -> int:
    """+1 when the waste lies toward +u of the cut, -1 when it lies toward -u.

    Convention, shared with model.trim: the cut normal points at the waste. An end cut at
    the far (+u) end of a member has n . u > 0; one at the near end has n . u < 0."""
    nu = dot(unit(n), frame.u)
    if abs(nu) < 1e-9:
        raise ValueError("cut plane is parallel to the member axis: no end cut exists")
    return 1 if nu > 0 else -1


def layout_lengths(n: Vec, frame: Frame, size_v: float, size_w: float,
                   datum_back: float) -> dict[str, float]:
    """Distance L along each corner edge from a square datum line on the kept stock,
    `datum_back` from the centerline point, to the cut. Waste is always beyond L."""
    side = waste_direction(n, frame)
    return {k: datum_back + side * t
            for k, t in corner_offsets(n, frame, size_v, size_w).items()}


def face_trace_angles(n: Vec, frame: Frame) -> dict[str, float]:
    """Angle from square (degrees) of the cut's trace on each pair of faces.

    `w_faces`: the two faces whose normal is +-w (top and bottom at roll 0).
    `v_faces`: the two faces whose normal is +-v (the sides at roll 0).
    Set a bevel gauge to 90 minus these values against the reference edge.
    """
    n = unit(n)
    nu, nv, nw = abs(dot(n, frame.u)), abs(dot(n, frame.v)), abs(dot(n, frame.w))
    return {"w_faces": degrees(atan2(nv, nu)), "v_faces": degrees(atan2(nw, nu))}


def saw_settings(n: Vec, along: Vec, across: Vec, up: Vec) -> tuple[float, float]:
    """(blade tilt from vertical, miter from square), degrees, for a part lying on the saw
    table with `along` running toward the blade, `across` on the table and `up` out of it."""
    n = unit(n)
    nx, ny, nz = abs(dot(n, along)), abs(dot(n, across)), abs(dot(n, up))
    return degrees(asin(min(1.0, nz))), degrees(atan2(ny, nx))


@dataclass(frozen=True)
class Orientation:
    face_down: str        # which pair of faces can sit on the table
    height: float         # stock height standing on the table
    tilt: float           # blade tilt from vertical, degrees
    miter: float          # miter from square, degrees


def cut_orientations(n: Vec, frame: Frame, size_v: float, size_w: float) -> list[Orientation]:
    """The two distinct ways to lay a rectangular blank on the table for one cut plane.
    Flipping onto the opposite face gives the same magnitudes, mirrored left to right."""
    t1, m1 = saw_settings(n, frame.u, frame.w, frame.v)   # a v-face down
    t2, m2 = saw_settings(n, frame.u, frame.v, frame.w)   # a w-face down
    return [
        Orientation("v-face (the size_w-wide face)", size_v, t1, m1),
        Orientation("w-face (the size_v-wide face)", size_w, t2, m2),
    ]


def oblique_area(n: Vec, frame: Frame, size_v: float, size_w: float) -> float:
    """Area of the oblique cut face: square section divided by |n . u|."""
    return size_v * size_w / abs(dot(unit(n), frame.u))


def force_components(n: Vec, axis: Vec) -> tuple[float, float]:
    """(normal, in-plane) fractions of a unit force acting along `axis` at a face with normal n."""
    c = abs(dot(unit(n), unit(axis)))
    return c, sqrt(max(0.0, 1 - c * c))


# --------------------------------------------------------------------------- polygons and hoppers

def hopper_settings(sides: int, splay_deg: float) -> tuple[float, float]:
    """(blade tilt, miter) for butt-mitered corners of an N-sided hopper whose sides lean
    `splay_deg` from vertical. Splay 0 is a plain polygon column: tilt 180/N, miter 0."""
    s, h = radians(splay_deg), pi / sides
    return degrees(asin(cos(s) * sin(h))), degrees(atan(sin(s) * tan(h)))


def hopper_dihedral(sides: int, splay_deg: float) -> float:
    """Inside dihedral angle between two neighbouring sides, degrees."""
    tilt, _ = hopper_settings(sides, splay_deg)
    return 180 - 2 * tilt


@dataclass(frozen=True)
class HopperPanel:
    tilt: float
    miter: float
    edge_bevel: float
    slant: float
    inside_bottom: float
    inside_top: float
    outside_bottom: float
    outside_top: float
    blank_width: float


def hopper_panel(sides: int, splay_deg: float, inside_bottom: float, height: float,
                 thickness: float) -> HopperPanel:
    """One side of a hopper with level top and bottom edges. `inside_bottom` is the length
    of the inside face along its bottom edge; `height` is vertical."""
    s, h = radians(splay_deg), pi / sides
    tilt, miter = hopper_settings(sides, splay_deg)
    grow = 2 * height * tan(s) * tan(h)
    thick = 2 * thickness / cos(s) * tan(h)
    slant = height / cos(s)
    return HopperPanel(tilt, miter, splay_deg, slant, inside_bottom, inside_bottom + grow,
                       inside_bottom + thick, inside_bottom + grow + thick,
                       slant + thickness * tan(s))


def polygon_side(apothem: float, sides: int) -> float:
    """Flat side length of a regular polygon from its center-to-flat distance."""
    return 2 * apothem * tan(pi / sides)


def ring_closure_error(sides: int, err_deg_per_face: float) -> float:
    """Total angular closure error of a mitered ring when every miter face is off by the
    same amount: two faces per segment."""
    return 2 * sides * err_deg_per_face


# --------------------------------------------------------------------------- interlocking blocks

@dataclass(frozen=True)
class AbeilleBlock:
    base: float
    height: float
    slope: float
    shift: float           # horizontal travel of each side between base and top
    top_across_ramps: float
    top_across_overhangs: float
    thrust_per_face: float  # horizontal thrust on each ramp per unit of block load


def abeille_block(base: float, height: float, slope_deg: float) -> AbeilleBlock:
    """Square-based block with two inward-leaning sides (ramps) and two outward-leaning
    sides (overhangs), all at `slope_deg` from vertical."""
    t = tan(radians(slope_deg))
    shift = height * t
    if base - 2 * shift <= 1e-9:
        raise ValueError("slope too steep: the ramps meet before the top face")
    return AbeilleBlock(base, height, slope_deg, shift, base - 2 * shift, base + 2 * shift,
                        1 / (2 * t))


# --------------------------------------------------------------------------- movement and error

def movement(dimension: float, coefficient: float, mc_change: float) -> float:
    """Dimensional change = D x C x dMC (Wood Handbook coefficient method, 6-14% MC)."""
    return dimension * coefficient * mc_change


def angle_error_offset(reach: float, err_deg: float) -> float:
    """Lateral offset produced by an angle error over a reach."""
    return reach * tan(radians(err_deg))


def stack_error(per_part: float, count: int) -> tuple[float, float]:
    """(worst case, root-sum-square) accumulation of a per-part error over `count` parts."""
    return per_part * count, per_part * sqrt(count)


# --------------------------------------------------------------------------- shop fractions

def frac(x: float, denom: int = 32) -> str:
    """Nearest fraction of an inch as a shop string, e.g. 3.414 -> '3 13/32'."""
    f = Fraction(round(abs(x) * denom), denom)
    sign = "-" if x < 0 and f else ""            # no "-0" when the value rounds to zero
    whole, rem = divmod(f.numerator, f.denominator)
    if rem == 0:
        return f"{sign}{whole}"
    part = f"{rem}/{f.denominator}"
    return f"{sign}{whole} {part}" if whole else f"{sign}{part}"


def dihedral_between(n1: Vec, n2: Vec) -> float:
    """Angle between two outward face normals, degrees."""
    return degrees(acos(max(-1.0, min(1.0, dot(unit(n1), unit(n2))))))
