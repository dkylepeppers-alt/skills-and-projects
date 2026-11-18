"""Solid-model tests. Skipped when build123d is not installed."""
import sys
import unittest
from math import atan, degrees, sqrt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

try:
    from woodstereo import model as m
    HAVE = True
except ImportError:
    HAVE = False

from woodstereo import geometry as g  # noqa: E402


@unittest.skipUnless(HAVE, "build123d not installed")
class BraceModel(unittest.TestCase):
    def test_shared_plane_mates(self):
        frame = g.member_frame(45, degrees(atan(1 / sqrt(8))))
        stock = m.blank((0, 0, 0), frame, 1.5, 3.5, 10, 5)
        behind, ahead = m.split_at(stock, (0, 0, 0), (1, 0, 0))
        self.assertAlmostEqual(m.volume_in3(behind) + m.volume_in3(ahead), 1.5 * 3.5 * 15, 4)
        self.assertAlmostEqual(m.interference_in3(behind, ahead), 0, 6)
        self.assertAlmostEqual(m.contact_area_in2(behind, ahead), 7.875, 2)
        self.assertTrue(m.surface_audit(behind)["ok"])

    def test_audit_flags_sphere(self):
        from build123d import Sphere
        self.assertFalse(m.surface_audit(Sphere(10))["ok"])


if __name__ == "__main__":
    unittest.main()


@unittest.skipUnless(HAVE, "build123d not installed")
class MachineModel(unittest.TestCase):
    def test_blade_height_and_lean(self):
        from woodstereo import jigmodels as jm
        from woodstereo import shop
        saw = shop.load_shop()["table_saw"]
        from math import radians, sin
        for tilt, h in ((0, 3.0), (45, 2.125)):
            b = jm.blade(saw, h, tilt, 17.0)
            # mid-plane rim at h; the tilted kerf's upper corner sits kerf/2 * sin(tilt) higher
            want = h + saw["kerf"] / 2 * sin(radians(tilt))
            self.assertAlmostEqual(b.bounding_box().max.Z / m.IN, want, 3)
        leaning = jm.blade(saw, 2.125, 45, 17.0).bounding_box()
        self.assertLess(leaning.min.X / m.IN, -1.5)   # left tilt: top leans toward -x

    def test_sled_clear_of_blade(self):
        from woodstereo import jigmodels as jm
        from woodstereo import jigs, shop
        saw = shop.load_shop()["table_saw"]
        p = dict(base_t=0.71875, width=30.0, x_left=-14.0, depth=20.0, fence_y=3.5, fence_t=1.4375,
                 fence_h=3.5, rear_t=0.71875, rear_h=2.5, block_depth=3.0, block_height=3.5,
                 block_width_left=3.5, block_width_right=1.5, screw_xs=[-4.5, 4.0], cleat_len=3.0)
        parts, hardware = jm.crosscut_sled(saw, p)
        t = jigs.sled_travel(saw, 0.71875, 2.03125, 3.5, 1.4375, 3.0, 3.5, 5.0)
        b = jm.blade(saw, t.blade_height, 0, t.arbor_y)
        for name, solid in hardware.items():
            self.assertAlmostEqual(m.interference_in3(b, solid), 0, 6, name)
