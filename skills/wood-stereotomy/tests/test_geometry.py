"""Standard-library tests: reproduce the numbers in the two source reports."""
import sys
import tempfile
import unittest
from math import atan, degrees, sqrt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from woodstereo import geometry as g  # noqa: E402
from woodstereo import joinery, sheet, shop, templates  # noqa: E402



class NoNegativeZero(unittest.TestCase):
    def test_values_rounding_to_zero_drop_the_sign(self):
        from woodstereo.drafting import fmt_in
        self.assertEqual(g.frac(-0.005), "0")
        self.assertEqual(g.frac(-0.5), "-1/2")
        self.assertEqual(fmt_in(-0.01), "0 (-0.010)")

class Brace(unittest.TestCase):
    """1-1/2 x 3-1/2 brace, axis (2, 2, 1)/3, cut to the plane x = 0."""

    def setUp(self):
        self.f = g.member_frame(45, degrees(atan(1 / sqrt(8))))
        self.n = (1.0, 0.0, 0.0)

    def test_frame(self):
        for got, want in zip(self.f.u, (2 / 3, 2 / 3, 1 / 3)):
            self.assertAlmostEqual(got, want, 9)
        for got, want in zip(self.f.w, (-1 / (3 * sqrt(2)), -1 / (3 * sqrt(2)), 4 / (3 * sqrt(2)))):
            self.assertAlmostEqual(got, want, 9)

    def test_corner_offsets(self):
        t = g.corner_offsets(self.n, self.f, 1.5, 3.5)
        want = {"A": 0.586, "B": 2.177, "C": 3.414, "D": 1.823}
        for k, v in want.items():
            self.assertAlmostEqual(2 + t[k], v, 3)
        self.assertAlmostEqual(t["A"] + t["C"], 0, 9)
        self.assertAlmostEqual(t["B"] + t["D"], 0, 9)

    def test_saw_orientations(self):
        flat, edge = g.cut_orientations(self.n, self.f, 1.5, 3.5)
        self.assertAlmostEqual(flat.tilt, 45.00, 2)
        self.assertAlmostEqual(flat.miter, 19.47, 2)
        self.assertAlmostEqual(flat.height, 1.5)
        self.assertAlmostEqual(edge.tilt, 13.63, 2)
        self.assertAlmostEqual(edge.miter, 46.69, 2)

    def test_shop_plan(self):
        s = shop.load_shop()
        verdicts, method = shop.plan_cut(s, g.cut_orientations(self.n, self.f, 1.5, 3.5))
        self.assertTrue(verdicts[0].feasible)
        self.assertTrue(verdicts[0].at_stop)
        self.assertFalse(verdicts[1].feasible)
        self.assertIn("table saw", method)

    def test_area_and_force(self):
        self.assertAlmostEqual(g.oblique_area(self.n, self.f, 1.5, 3.5), 7.875, 6)
        normal, in_plane = g.force_components(self.n, self.f.u)
        self.assertAlmostEqual(normal, 2 / 3, 9)
        self.assertAlmostEqual(in_plane, sqrt(5) / 3, 9)

    def test_sheet_and_template(self):
        s = shop.load_shop()
        text = sheet.end_cut_sheet("Brace foot", self.n, self.f, 1.5, 3.5, s, 2.0)
        self.assertIn("3 13/32", text)
        lines, labels = templates.end_cut_development(
            g.layout_lengths(self.n, self.f, 1.5, 3.5, 2.0), 1.5, 3.5)
        labels.append((0.0, -0.3, "Rail & stile <A>"))
        with tempfile.TemporaryDirectory() as d:
            dxf = templates.write_dxf(Path(d) / "t.dxf", lines)
            svg = templates.write_svg(Path(d) / "t.svg", lines, labels)
            self.assertTrue(dxf.read_text().rstrip().endswith("EOF"))
            self.assertIn('width="', svg.read_text())
            import xml.etree.ElementTree as ET
            ET.parse(svg)                      # labels with & and < must stay valid XML

    def test_waste_side_follows_the_normal(self):
        """A cut at the near end keeps the +u side, so L runs back from a datum ahead of it."""
        f = g.member_frame(0, 0)
        tilted = (-1.0, 0.0, 0.5)             # near-end cut, normal pointing at the waste
        self.assertEqual(g.waste_direction(tilted, f), -1)
        self.assertEqual(g.waste_direction((1.0, 0.0, 0.0), f), 1)
        near = g.layout_lengths(tilted, f, 1.5, 3.5, 2.0)
        far = g.layout_lengths((1.0, 0.0, -0.5), f, 1.5, 3.5, 2.0)   # same plane, other side kept
        for k in "ABCD":
            self.assertAlmostEqual(near[k] + far[k], 4.0, 9)
        # top (+w) corners: the plane leans toward +u going up, so the kept +u stock is
        # shorter there: L from a datum 2 in ahead is 2 - 0.875
        self.assertAlmostEqual(near["C"], 2 - 0.875, 9)
        text = sheet.end_cut_sheet("Near end", tilted, f, 1.5, 3.5, shop.load_shop(), 2.0)
        self.assertIn("toward -u", text)
        lines, _ = templates.end_cut_development(near, 1.5, 3.5, waste_toward_plus_u=False)
        self.assertEqual(lines[1 + 5][:2], (0.0, near["A"]))          # first trace starts at A
        self.assertAlmostEqual(lines[1 + 5][2], 3.5)                  # and crosses the -v face


class Polygons(unittest.TestCase):
    def test_hopper_against_published(self):
        tilt, miter = g.hopper_settings(10, 40)       # Woodgears: 13.69 tilt, 11.8 miter
        self.assertAlmostEqual(tilt, 13.69, 2)
        self.assertAlmostEqual(miter, 11.80, 2)

    def test_square_hopper(self):
        p = g.hopper_panel(4, 15, 8.0, 6.0, 0.75)
        self.assertAlmostEqual(p.tilt, 43.08, 2)
        self.assertAlmostEqual(p.miter, 14.51, 2)
        self.assertAlmostEqual(p.slant, 6.212, 3)
        self.assertAlmostEqual(p.inside_top, 11.215, 3)
        self.assertAlmostEqual(p.outside_bottom, 9.553, 3)
        self.assertAlmostEqual(p.outside_top, 12.768, 3)
        self.assertAlmostEqual(p.blank_width, 6.413, 3)
        self.assertAlmostEqual(g.hopper_dihedral(4, 15), 93.84, 2)

    def test_plain_column(self):
        tilt, miter = g.hopper_settings(8, 0)
        self.assertAlmostEqual(tilt, 22.5, 9)
        self.assertAlmostEqual(miter, 0, 9)

    def test_ring(self):
        self.assertAlmostEqual(g.polygon_side(6.0, 12), 3.215, 3)
        self.assertAlmostEqual(g.polygon_side(4.5, 12), 2.412, 3)
        self.assertAlmostEqual(g.ring_closure_error(12, 0.25), 6.0, 9)


class BlocksMovementError(unittest.TestCase):
    def test_abeille(self):
        b = g.abeille_block(2.0, 1.0, 25)
        self.assertAlmostEqual(b.shift, 0.466, 3)
        self.assertAlmostEqual(b.top_across_ramps, 1.067, 3)
        self.assertAlmostEqual(b.top_across_overhangs, 2.933, 3)
        self.assertAlmostEqual(b.thrust_per_face, 1.072, 3)
        with self.assertRaises(ValueError):
            g.abeille_block(2.0, 1.0, 45)

    def test_movement(self):
        self.assertAlmostEqual(g.movement(6, 0.00376, 4), 0.090, 3)
        self.assertAlmostEqual(g.movement(6, 0.00194, 4), 0.047, 3)

    def test_error(self):
        self.assertAlmostEqual(g.angle_error_offset(12, 0.25), 0.052, 3)
        worst, rss = g.stack_error(0.005, 10)
        self.assertAlmostEqual(worst, 0.05)
        self.assertAlmostEqual(rss, 0.0158, 4)

    def test_frac(self):
        self.assertEqual(g.frac(3.414), "3 13/32")
        self.assertEqual(g.frac(0.586), "19/32")
        self.assertEqual(g.frac(2.0), "2")

    def test_parallel_plane_rejected(self):
        f = g.member_frame(0, 0)
        with self.assertRaises(ValueError):
            g.corner_offsets((0, 0, 1), f, 1.5, 3.5)


class Joinery(unittest.TestCase):
    def test_defaults(self):
        chisels = [0.25, 0.3125, 0.375, 0.5]
        self.assertEqual(joinery.tenon_thickness(0.75, chisels), 0.25)
        self.assertEqual(joinery.tenon_thickness(1.0, chisels), 0.3125)
        self.assertAlmostEqual(joinery.dovetail_angle(6), 9.46, 2)
        self.assertAlmostEqual(joinery.dovetail_angle(8), 7.13, 2)


if __name__ == "__main__":
    unittest.main()
