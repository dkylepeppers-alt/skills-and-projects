"""Conventional starting proportions for ordinary joints. Standard library only.

These are rules of thumb used as first-pass defaults, not structural sizing. Each one is a
named parameter in a model so it can be changed. Sources: references/joinery.md.
"""
from __future__ import annotations

from math import atan, degrees


def tenon_thickness(stock_thickness: float, chisel_widths: list[float]) -> float:
    """Tenon thickness: the available chisel width nearest one third of the stock."""
    target = stock_thickness / 3
    return min(chisel_widths, key=lambda c: (abs(c - target), c))


def tenon_width_limit(tenon_thickness_: float) -> float:
    """Widest single tenon before splitting into two: about five times its thickness."""
    return 5 * tenon_thickness_


def mortise_depth(tenon_length: float, relief: float = 1 / 16) -> float:
    """Blind mortise depth: tenon length plus relief so the shoulder, not the end, seats."""
    return tenon_length + relief


def dovetail_angle(slope_ratio: float) -> float:
    """Dovetail flank angle from square for a 1:N slope, degrees (1:6 -> 9.46, 1:8 -> 7.13)."""
    return degrees(atan(1 / slope_ratio))


DRAWBORE_OFFSET = {
    "dense hardwood, small frame": 1 / 32,
    "furniture, typical": 1 / 16,
    "softwood or heavy bench work": 1 / 8,
}
"""Peg-hole offset toward the tenon shoulder. Start at the furniture value."""
