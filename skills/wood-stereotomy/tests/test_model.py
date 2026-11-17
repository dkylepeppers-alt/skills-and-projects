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
