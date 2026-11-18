"""build123d models of the saw table, blade and jigs, for checking a jig against the real
blade path. Requires build123d. Inches in, inches out (see model.py).

Frames follow jigs.py: x across the table (+x right), y along the feed (+y away from the
operator), z up from the table surface. The table's front edge is y = 0.
"""
from __future__ import annotations

from math import radians, tan

from build123d import IN, Cylinder, Pos, Rot

from . import jigs
from .model import box_at


def table_top(saw: dict, x_min: float = -20.0, x_max: float = 20.0):
    """Main table slab with plain rectangular miter slots (the T undercut is ignored)."""
    depth = saw["table_depth"]
    top = box_at(((x_min + x_max) / 2, depth / 2, -0.875), (x_max - x_min, depth, 1.75))
    slot = saw["miter_slot"]
    for side, sign in (("left", -1), ("right", 1)):
        x = sign * saw["miter_slot_center_offsets_from_blade"][side]
        top = top - box_at((x, depth / 2, -slot["depth"] / 2), (slot["width"], depth + 1, slot["depth"]))
    return top


def blade(saw: dict, height: float, tilt_deg: float, center_y: float):
    """Saw blade as a disk of kerf thickness, raised so the rim of its mid-plane is `height`
    above the table, and tilted toward the profile's tilt direction about the line x = 0,
    z = 0. When tilted, the kerf's upper corner sits kerf/2 x sin(tilt) higher, which keeps
    clearance checks on the safe side."""
    r = saw["blade_diameter"] / 2
    disk = Rot(0, 90, 0) * Cylinder(r * IN, saw["kerf"] * IN)
    # Raise along the tilted blade plane so the vertical height above the table is `height`.
    from math import cos
    lean = radians(tilt_deg)
    centre_z_in_plane = (height / cos(lean) - r) if tilt_deg else (height - r)
    disk = Pos(0, center_y * IN, centre_z_in_plane * IN) * disk
    sign = -1 if saw.get("tilt_direction", "left") == "left" else 1
    return Rot(0, sign * tilt_deg, 0) * disk


def screw(x: float, y: float, z0: float, length: float, dia: float = 0.164):
    """A #8 screw shank (0.164 in) standing vertically, for clearance checks."""
    return Pos(x * IN, y * IN, (z0 + length / 2) * IN) * Cylinder(dia / 2 * IN, length * IN)


def crosscut_sled(saw: dict, p: dict) -> tuple[dict, dict]:
    """Two-runner crosscut sled with the reference fence nearest the operator, a guard block
    behind it, a rear fence, and a side cleat for a table-mounted travel stop.

    `p` keys (inches): base_t, width, depth, x_left (base's left edge), fence_y, fence_t,
    fence_h, rear_t, rear_h, block_depth, block_height, block_width_left, block_width_right,
    screw_xs (fence screw positions), cleat_len.
    Returns (parts, hardware) where hardware holds screws, runners and the cleat: parts the
    blade must never touch.
    """
    b = p["base_t"]
    runner = jigs.runner_section(saw["miter_slot"])
    xl, w, d = p["x_left"], p["width"], p["depth"]
    base = box_at((xl + w / 2, d / 2, b / 2), (w, d, b))
    front = box_at((xl + w / 2, p["fence_y"] + p["fence_t"] / 2, b + p["fence_h"] / 2),
                   (w, p["fence_t"], p["fence_h"]))
    rear_y = d - p["rear_t"]
    rear = box_at((xl + w / 2, rear_y + p["rear_t"] / 2, b + p["rear_h"] / 2),
                  (w, p["rear_t"], p["rear_h"]))
    bw = p["block_width_left"] + p["block_width_right"]
    block = box_at(((p["block_width_right"] - p["block_width_left"]) / 2,
                    p["fence_y"] - p["block_depth"] / 2, b + p["block_height"] / 2),
                   (bw, p["block_depth"], p["block_height"]))
    # Kerf already cut by the blade at 0 deg through base, fences and block.
    kerf = box_at((0, d / 2, 2.5), (saw["kerf"], d + 2, 5 + 0.01))
    base, front, rear, block = base - kerf, front - kerf, rear - kerf, block - kerf
    hardware = {}
    for side, sign in (("left", -1), ("right", 1)):
        x = sign * saw["miter_slot_center_offsets_from_blade"][side]
        hardware[f"runner-{side}"] = box_at((x, d / 2, -runner.height / 2),
                                           (runner.width, d, runner.height))
    for i, x in enumerate(p["screw_xs"]):
        hardware[f"fence-screw-{i + 1}"] = screw(x, p["fence_y"] + p["fence_t"] / 2, 0.0, b + 1.25)
        hardware[f"rear-screw-{i + 1}"] = screw(x, rear_y + p["rear_t"] / 2, 0.0, b + 1.25)
    hardware["stop-cleat"] = box_at((xl + w + 0.75, p["cleat_len"] / 2, b / 2), (1.5, p["cleat_len"], b))
    parts = {"base": base, "front-fence": front, "rear-fence": rear, "guard-block": block}
    return parts, hardware


def ramp(length: float, width: float, low: float, slope_deg: float, x_low_end: float,
         rises_toward: int, y0: float, z0: float):
    """Wedge `length` long along x, `width` along y from y0, `low` thick at its x_low_end,
    rising at slope_deg toward +x (rises_toward=+1) or -x (-1). Sits on z = z0."""
    high = low + length * tan(radians(slope_deg))
    x_far = x_low_end + rises_toward * length
    cx = (x_low_end + x_far) / 2
    solid = box_at((cx, y0 + width / 2, z0 + high / 2), (length, width, high))
    from .model import trim
    from math import sin, cos
    a = radians(slope_deg)
    # top face passes through (x_low_end, z0 + low); normal points up and back toward the low end
    normal = (-rises_toward * sin(a), 0.0, cos(a))
    return trim(solid, (x_low_end, y0, z0 + low), normal)
