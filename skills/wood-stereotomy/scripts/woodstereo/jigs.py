"""Jig and fixture math for the machines in the shop profile. Standard library only.

Conventions
-----------
Table saw frame: x across the table (+x to the right as the operator faces the saw), y along
the feed (+y away from the operator), z up from the table surface. The blade's center in
plan is at x = 0. A left-tilting blade leans its top toward -x.

Sled frame: same axes, fixed to the sled. The sled moves +y during a cut, so relative to the
sled the blade moves -y, toward the operator.

Every function states which inputs are measured and which are defaults. A default here is a
starting value for a part that gets fitted on the machine, not a tolerance.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import asin, atan, atan2, cos, degrees, hypot, pi, radians, sin, sqrt, tan

from .geometry import Vec, saw_settings, unit, dot


# --------------------------------------------------------------------------- runners

@dataclass(frozen=True)
class Runner:
    width: float
    height: float
    note: str


def runner_section(slot: dict, side_fit: float = 0.005, bottom_gap: float = 1 / 32) -> Runner:
    """Starting section for a sled runner in a miter slot. Width is the slot width less
    `side_fit` (a default: plane or scrape the runner to a sliding fit with no side play);
    height stops `bottom_gap` short of the slot floor so the sled rides on the table."""
    return Runner(slot["width"] - side_fit, slot["depth"] - bottom_gap,
                  "fit to the slot on the saw; a T-slot does not need the undercut filled")


# --------------------------------------------------------------------------- blade geometry

def blade_half_chord(radius: float, height: float, z: float, tilt_deg: float = 0.0) -> float:
    """Half the length of the blade's chord along the feed at height z above the table, with
    the blade's top `height` above the table (vertical) and the blade tilted `tilt_deg`
    about the line where its plane meets the table. Zero above the blade."""
    c = cos(radians(tilt_deg))
    centre = height / c - radius        # disk center, measured up the tilted blade plane
    ds = z / c - centre
    return sqrt(max(0.0, radius * radius - ds * ds))


def blade_height_for(base: float, stock: float, above_stock: float = 0.25) -> float:
    """Blade height above the table to cut `stock` lying on a sled base `base` thick.
    `above_stock` is a default: set the teeth just clear of the work."""
    return base + stock + above_stock


def tilt_offset(z: float, tilt_deg: float) -> float:
    """Sideways lean of a tilted blade at height z. Treats the tilt pivot as lying in the
    table surface at the blade, which is close for trunnion saws; check on the saw near a
    limit."""
    return z * tan(radians(tilt_deg))


# --------------------------------------------------------------------------- crosscut sled travel

@dataclass
class SledTravel:
    blade_height: float
    arbor_y: float            # blade center in sled coordinates at the travel stop
    sled_origin_at_stop: float  # table y of the sled's y = 0 edge at the travel stop
    exit_block_depth: float   # depth of the guard block behind the front fence
    exit_block_height: float  # height of the guard block above the sled base
    exit_block_width: float
    max_stock: float
    ok: bool
    reasons: list = field(default_factory=list)


def sled_travel(saw: dict, base: float, stock: float, fence_y: float, fence_t: float,
                block_depth: float, block_height: float, block_width: float,
                tilt_deg: float = 0.0, overtravel: float = 0.25, margin: float = 0.5,
                above_stock: float = 0.25, arbor_y: float | None = None) -> SledTravel:
    """Travel stop and guard block for a crosscut sled with the reference fence nearest the
    operator.

    The fence's operator-side face is at y = fence_y and it is fence_t thick, so the work
    bears on y = fence_y + fence_t. The guard block sits on the operator side of the fence,
    from fence_y - block_depth to fence_y. The stop hardware is not assumed: the result gives where the sled sits at the end of travel
    (sled_origin_at_stop, in table coordinates from the table's front edge, using the
    saw's front_of_table_to_blade_center spec), so any stop can be placed from it: a stop
    face fixed to the table at table y = Y meets a sled cleat at sled y = Y - origin.

    The stop is placed so the blade has cut `overtravel` past the work's bearing face at the
    top of the stock. The check is that the blade's furthest reach toward the operator,
    which is at the sled base, stays `margin` inside the guard block, and that the block is
    taller than the blade above the base.

    Pass `arbor_y` to check a stop already chosen (for example one stop shared by square
    and bevel settings): the cut must still finish through the work at that stop.
    """
    radius = saw["blade_diameter"] / 2
    height = blade_height_for(base, stock, above_stock)
    reasons = []
    from .shop import table_saw_depth  # local import: shop imports nothing from here
    limit = table_saw_depth({"table_saw": saw}, tilt_deg)
    if height > limit + 1e-9:
        reasons.append(f"blade height {height:.3f} exceeds the saw's {limit:.3f} at {tilt_deg:g} deg")
    reach_top = blade_half_chord(radius, height, base + stock, tilt_deg)
    reach_base = blade_half_chord(radius, height, base, tilt_deg)
    finish_at = fence_y + fence_t + reach_top          # blade just through the work's top
    if arbor_y is None:
        arbor_y = finish_at - overtravel
    elif arbor_y > finish_at + 1e-9:
        reasons.append(f"the cut stops {arbor_y - finish_at:.3f} short of finishing at the top of the stock")
    origin = saw["front_of_table_to_blade_center"] - arbor_y
    furthest = arbor_y - reach_base
    need_depth = fence_y - furthest + margin
    if block_depth < need_depth - 1e-9:
        reasons.append(f"guard block {block_depth:.3f} deep; the blade reaches {fence_y - furthest:.3f} "
                       f"past the fence, so it needs {need_depth:.3f}")
    need_height = height - base + margin
    if block_height < need_height - 1e-9:
        reasons.append(f"guard block {block_height:.3f} tall; needs {need_height:.3f} above the base")
    lean = tilt_offset(height, tilt_deg)
    need_width = saw["kerf"] + lean + 2 * margin
    if block_width < need_width - 1e-9:
        reasons.append(f"guard block {block_width:.3f} wide; needs {need_width:.3f} at {tilt_deg:g} deg")
    max_stock = limit - base - above_stock
    return SledTravel(height, arbor_y, origin, need_depth, need_height, need_width, max_stock,
                      not reasons, reasons)


# --------------------------------------------------------------------------- hardware clearance

@dataclass(frozen=True)
class Hardware:
    """A screw, clamp, track or other part that must never meet the blade. x is measured
    from the kerf centerline at the table, positive toward the side the blade leans
    (left on a left-tilt saw); z from the table surface."""
    name: str
    x_min: float
    x_max: float
    z_min: float
    z_max: float


def hardware_at(name: str, x0: float, x1: float, z0: float, z1: float, kerf_center: float = 0.0,
                tilt_direction: str = "left") -> Hardware:
    """Hardware from table-frame x limits (+x right). Converts to the lean frame used by
    blade_hits: x measured from the kerf centerline, positive toward the side the blade leans."""
    sign = -1 if tilt_direction == "left" else 1
    a, b = sign * (x0 - kerf_center), sign * (x1 - kerf_center)
    return Hardware(name, min(a, b), max(a, b), z0, z1)


def blade_hits(hw: Hardware, kerf: float, height: float, tilt_deg: float,
               margin: float = 0.25) -> bool:
    """True if any part of the hardware lies within `margin` of the blade's path, with the
    blade raised to `height` (vertical) and tilted. The path is taken as unlimited along
    the feed, which is conservative."""
    z0, z1 = max(hw.z_min, 0.0), min(hw.z_max, height)
    if z1 < z0:
        return False
    lo = tilt_offset(z0, tilt_deg) - kerf / 2 - margin
    hi = tilt_offset(z1, tilt_deg) + kerf / 2 + margin
    return not (hw.x_max < lo or hw.x_min > hi)


def check_hardware(items: list[Hardware], kerf: float, height: float,
                   tilts: tuple[float, ...] = (0.0, 45.0), margin: float = 0.25) -> list[str]:
    """Names of hardware the blade would reach at any of the given tilts."""
    return [f"{h.name} at {t:g} deg" for t in tilts for h in items
            if blade_hits(h, kerf, height, t, margin)]


# --------------------------------------------------------------------------- stops and offcuts

@dataclass(frozen=True)
class Stop:
    name: str
    fixed_to: str          # "jig" (moves with the work) or "table" (rip fence, table, clamp)
    side: str              # "keeper" or "offcut"
    standoff: bool = False  # releases the work before the blade reaches it


def check_stops(stops: list[Stop]) -> list[str]:
    """Problems with length stops. A stop on the offcut side traps the offcut between
    itself and the blade unless it is a stand-off that the work leaves before the cut."""
    problems = []
    for s in stops:
        if s.side == "offcut" and not s.standoff:
            problems.append(f"{s.name}: offcut trapped between stop and blade; move it to the "
                            "keeper side or make it a stand-off ahead of the blade")
        if s.fixed_to == "table" and not s.standoff:
            problems.append(f"{s.name}: a table-fixed stop in contact during the cut; use a "
                            "stand-off block ahead of the blade")
    return problems


# --------------------------------------------------------------------------- squaring a sled

@dataclass(frozen=True)
class FiveCut:
    error_per_inch: float
    angle_deg: float
    correction_at_fence_end: float


def five_cut(width_a: float, width_b: float, strip_length: float,
             fence_length: float) -> FiveCut:
    """Five-cut test. Measure the last offcut strip's width at the end cut first (A) and the
    end cut last (B), over `strip_length`. The test multiplies the fence error by four.
    Move the far end of the fence by `correction_at_fence_end`. Which way depends on the
    side of the blade the panel rode on: adjust, then repeat the test to confirm the gap
    shrank."""
    per_inch = (width_a - width_b) / (4 * strip_length)
    return FiveCut(per_inch, degrees(atan(per_inch)), per_inch * fence_length)


# --------------------------------------------------------------------------- carrier wedges

@dataclass(frozen=True)
class Carrier:
    axis: str              # "along" (cradle rolls the part about its length) or "across" (ramp lifts one end)
    wedge_deg: float
    tilt: float
    miter: float


def _rotate(n: Vec, axis: str, ang: float) -> Vec:
    c, s = cos(ang), sin(ang)
    x, y, z = n
    if axis == "along":                      # about x
        return (x, y * c - z * s, y * s + z * c)
    return (x * c + z * s, y, -x * s + z * c)  # about y


def carrier_for_tilt(n: Vec, axis: str, target_tilt: float) -> Carrier | None:
    """Wedge angle that leaves the blade at `target_tilt` for a cut plane whose normal `n`
    is given in the part's table frame (x along the part toward the blade, y across it on
    the table, z up). Returns the smallest wedge, or None if the axis cannot reach the
    target. The miter left over goes to the miter gauge or the sled fence angle."""
    n = unit(n)
    st = sin(radians(target_tilt))
    if axis == "along":
        r, base = hypot(n[1], n[2]), atan2(n[2], n[1])
    elif axis == "across":
        r, base = hypot(n[0], n[2]), atan2(n[2], n[0])
    else:
        raise ValueError("axis is 'along' or 'across'")
    if r < st - 1e-12:
        return None
    a = asin(min(1.0, st / r))
    candidates = []
    for target in (a, -a, pi - a, a - pi):
        ang = target - base if axis == "along" else base - target
        ang = (ang + pi) % (2 * pi) - pi
        m = _rotate(n, axis, ang)
        tilt, miter = saw_settings(m, (1, 0, 0), (0, 1, 0), (0, 0, 1))
        if abs(tilt - target_tilt) < 1e-6:
            candidates.append(Carrier(axis, degrees(ang), tilt, miter))
    return min(candidates, key=lambda c: abs(c.wedge_deg)) if candidates else None


def carrier_options(n: Vec, saw: dict, max_wedge: float = 30.0) -> list[Carrier]:
    """Square-blade and max-tilt carriers on both axes that the saw and gauge can use, with
    a wedge no steeper than `max_wedge` (a default: steeper wedges hold the part poorly)."""
    out = []
    for axis in ("along", "across"):
        for tilt in (0.0, float(saw["tilt_max_deg"])):
            c = carrier_for_tilt(n, axis, tilt)
            if c and abs(c.wedge_deg) <= max_wedge and c.miter <= saw["miter_gauge_max_deg"] + 1e-9:
                out.append(c)
    return sorted(out, key=lambda c: (abs(c.wedge_deg), c.tilt))


def normal_after_carrier(n: Vec, c: Carrier) -> Vec:
    return _rotate(unit(n), c.axis, radians(c.wedge_deg))


# --------------------------------------------------------------------------- bandsaw circle jig

@dataclass(frozen=True)
class CircleJig:
    pivot_line_from_sled_front: float
    pivot_from_blade: float
    note: str


def circle_jig(radius: float, front_of_table_to_teeth: float, lip: float = 0.5) -> CircleJig:
    """Pivot location for a bandsaw circle sled whose front lip hooks the table's front edge
    as its stop. The pivot sits on the line square to the blade through the front of the
    teeth; its distance from the blade's side facing it is the circle's radius."""
    return CircleJig(front_of_table_to_teeth + lip, radius,
                     "confirm by sliding the sled to its stop and sighting the teeth on the pivot line")


# --------------------------------------------------------------------------- fence-riding jigs

@dataclass(frozen=True)
class Straddle:
    inner_width: float
    upright_bottom_gap: float
    note: str


def straddle_fit(fence_thickness: float, fit: float = 1 / 64, bottom_gap: float = 1 / 32) -> Straddle:
    """Inside width of a jig that straddles the rip fence. `fit` is a default: build to it,
    then shim or adjust a pressure bar so the jig slides with no side play."""
    return Straddle(fence_thickness + fit, bottom_gap,
                    "fit on the saw with shims or an adjustable pressure bar")


def base_kerf_reach(saw: dict, height: float, base: float) -> float:
    """How much further toward the operator the blade reaches at the table surface than at
    the top of the sled base. The base's kerf runs that far past the guard block's reach,
    recessed below the base surface: keep hands off the kerf line there too."""
    r = saw["blade_diameter"] / 2
    return blade_half_chord(r, height, 0.0) - blade_half_chord(r, height, base)


def bevel_hand(world_normal: Vec, tilt_direction: str) -> str | None:
    """None if a blade tilting `tilt_direction` makes this cut with the part as placed;
    otherwise what to change. The blade plane's normal on a left-tilt saw has x and z of the
    same sign; on a right-tilt saw, opposite signs."""
    nx, nz = world_normal[0], world_normal[2]
    if abs(nx) < 1e-9 or abs(nz) < 1e-9:
        return None
    same = nx * nz > 0
    if (tilt_direction == "left") == same:
        return None
    return ("the bevel leans the way this saw cannot tilt: turn the part face-down or end "
            "for end and re-derive the setup")
