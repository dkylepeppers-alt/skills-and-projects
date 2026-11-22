"""Dimension text and layout helpers for plan sets. Standard library only."""
from __future__ import annotations

from math import atan2, degrees

from .geometry import frac


def fmt_in(value: float, denom: int = 32, *, fit: bool = False) -> str:
    """Shop dimension: nearest 1/denom in, with the decimal added when rounding moves it
    more than 1/128 in. For fitted parts show non-fractional targets in decimal inches."""
    error = abs(round(value * denom) / denom - value)
    if fit and error > 1e-6:
        return f"{value:.4f}".rstrip("0").rstrip(".")
    text = frac(value, denom)
    if error > 1 / 128:
        text += f" ({value:.3f})"
    return text


def ordinates(values: list[float], tol: float = 1 / 64) -> list[float]:
    """Distinct coordinates measured from the smallest, merging any within `tol`."""
    if not values:
        return []
    lo = min(values)
    out: list[float] = []
    for v in sorted(x - lo for x in values):
        if not out or v - out[-1] > tol:
            out.append(v)
    return out


def spread(positions: list[float], min_gap: float, lo: float | None = None,
           hi: float | None = None) -> list[float]:
    """Label positions for sorted feature positions, at least `min_gap` apart, kept as close
    to their features as possible and inside [lo, hi] when there is room."""
    out = []
    for p in positions:
        out.append(max(p, out[-1] + min_gap) if out else p)
    if hi is not None and out and out[-1] > hi:
        shift = out[-1] - hi
        out = [x - shift for x in out]
        for i in range(len(out) - 2, -1, -1):          # restore spacing from the top down
            out[i] = min(out[i], out[i + 1] - min_gap)
    if lo is not None and out and out[0] < lo:
        shift = lo - out[0]
        out = [x + shift for x in out]
    return out


def edge_angle_label(dx: float, dy: float, tol_deg: float = 0.3) -> str | None:
    """Angle of an edge to the nearer drawing axis, as a callout, or None when the edge is
    square to the sheet within `tol_deg`."""
    a = abs(degrees(atan2(dy, dx))) % 180
    a = min(a, 180 - a)                 # 0..90 from horizontal
    if a < tol_deg or 90 - a < tol_deg:
        return None
    if a <= 45:
        return f"{a:.2f}° to horiz."
    return f"{90 - a:.2f}° to vert."


def choose_scale(need_w: float, need_h: float, avail_w: float, avail_h: float,
                 fixed_w: float = 0.0, fixed_h: float = 0.0) -> tuple[float, str]:
    """Largest common drawing scale at which model sizes `need_*` (inches) plus fixed paper
    allowances fit the available paper."""
    for s, label in ((1, "1:1"), (1 / 2, "1:2"), (1 / 3, "1:3"), (1 / 4, "1:4"), (1 / 5, "1:5"),
                     (1 / 6, "1:6"), (1 / 8, "1:8"), (1 / 10, "1:10"), (1 / 12, "1:12"),
                     (1 / 16, "1:16"), (1 / 24, "1:24"), (1 / 32, "1:32")):
        if need_w * s + fixed_w <= avail_w and need_h * s + fixed_h <= avail_h:
            return s, label
    return 1 / 48, "1:48"


def wrap(text: str, width: int) -> list[str]:
    """Greedy word wrap that keeps existing line breaks."""
    lines = []
    for para in text.splitlines() or [""]:
        line = ""
        for word in para.split(" "):
            if len(line) + len(word) + (1 if line else 0) > width and line:
                lines.append(line)
                line = word
            else:
                line = f"{line} {word}" if line else word
        lines.append(line)
    return lines
