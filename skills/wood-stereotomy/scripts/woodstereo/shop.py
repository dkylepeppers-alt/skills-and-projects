"""Shop profile and feasibility checks. Standard library only."""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from .geometry import Orientation

DEFAULT_PROFILE = Path(__file__).resolve().parents[2] / "assets" / "shop-profile.json"


def load_shop(path: str | Path | None = None) -> dict:
    """Load a shop profile. With no path, loads the skill's default profile."""
    return json.loads(Path(path or DEFAULT_PROFILE).read_text(encoding="utf-8"))


def table_saw_depth(shop: dict, tilt_deg: float) -> float:
    """Estimated vertical depth of cut at a tilt, interpolated linearly between the
    profile's 0 and 45 degree figures. An estimate: confirm on the saw near the limit."""
    saw = shop["table_saw"]
    d0, d45 = saw["depth_at_0_tilt"], saw["depth_at_45_tilt"]
    return d0 + (d45 - d0) * min(max(tilt_deg, 0.0), 45.0) / 45.0


@dataclass(frozen=True)
class Verdict:
    orientation: Orientation
    feasible: bool
    reasons: tuple[str, ...]
    at_stop: bool


def check_table_saw(shop: dict, orientation: Orientation, tol: float = 0.05) -> Verdict:
    """Can the table saw with a miter gauge make this cut in this orientation?"""
    saw = shop["table_saw"]
    reasons = []
    if not saw.get("available", False):
        reasons.append("no table saw in the shop profile")
    if orientation.tilt > saw["tilt_max_deg"] + tol:
        reasons.append(f"tilt {orientation.tilt:.2f} exceeds the saw's {saw['tilt_max_deg']} max")
    if orientation.tilt < saw["tilt_min_deg"] - tol:
        reasons.append(f"tilt {orientation.tilt:.2f} is below the saw's {saw['tilt_min_deg']} min")
    if orientation.miter > saw["miter_gauge_max_deg"] + tol:
        reasons.append(f"miter {orientation.miter:.2f} exceeds the gauge's "
                       f"{saw['miter_gauge_max_deg']} max")
    depth = table_saw_depth(shop, orientation.tilt)
    if orientation.height > depth:
        reasons.append(f"stock stands {orientation.height:.3f} in, over the estimated "
                       f"{depth:.3f} in depth of cut at this tilt")
    at_stop = abs(orientation.tilt - saw["tilt_max_deg"]) <= tol or \
        (orientation.tilt > tol and abs(orientation.tilt - saw["tilt_min_deg"]) <= tol)
    return Verdict(orientation, not reasons, tuple(reasons), at_stop)


def plan_cut(shop: dict, orientations: list[Orientation]) -> tuple[list[Verdict], str]:
    """Check every orientation and name the method. Falls back to a hand cut against a
    paring block or saw guide when no orientation fits the saw."""
    verdicts = [check_table_saw(shop, o) for o in orientations]
    good = [v for v in verdicts if v.feasible]
    if good:
        # Prefer the orientation with the smaller miter: better support on the gauge.
        best = min(good, key=lambda v: (v.orientation.miter, v.orientation.height))
        method = (f"table saw, on the {best.orientation.face_down}: tilt "
                  f"{best.orientation.tilt:.2f}, miter {best.orientation.miter:.2f}")
        if best.at_stop:
            method += " (on the tilt stop: verify the stop with a gauge)"
        return verdicts, method
    hand = shop.get("hand_tools", {})
    if hand.get("saws") and hand.get("chisels"):
        return verdicts, ("hand cut: knife the four traces, saw on the waste side against a "
                          "guide block sawn to the trace angle, pare to the lines")
    return verdicts, "NOT MAKEABLE with this shop profile: redesign the cut or change the stock"
