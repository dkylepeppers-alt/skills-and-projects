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
        for name in ("front-fence", "rear-fence", "guard-block"):
            self.assertEqual(len(parts[name].solids()), 1, f"{name} cut in two by the kerf")
        self.assertEqual(len(parts["base"].solids()), 2)   # the base is split by design
        for name, solid in hardware.items():
            self.assertAlmostEqual(m.interference_in3(b, solid), 0, 6, name)


try:
    import matplotlib  # noqa: F401
    HAVE_MPL = True
except ImportError:
    HAVE_MPL = False


@unittest.skipUnless(HAVE and HAVE_MPL, "build123d or matplotlib not installed")
class PlanSet(unittest.TestCase):
    def test_plan_set_pages_and_projection(self):
        import tempfile
        from build123d import Cylinder, Pos
        from woodstereo import plans
        part = m.box_at((2, 3, 0.5), (4, 6, 1)) - Pos(1 * m.IN, 1 * m.IN, 0) * Cylinder(0.25 * m.IN, 3 * m.IN)
        v = plans.project(part, "top")
        self.assertAlmostEqual(v.width, 4.0, 4)
        self.assertAlmostEqual(v.height, 6.0, 4)
        self.assertIn((1.0, 1.0, 0.25, False), v.circles)
        ps = plans.PlanSet("Test", {"Plate": part}, [plans.PartSpec("Plate", part, 2, "plywood")],
                           sections=[plans.Section("A-A", (0, 1.0, 0), "front")], verify=["thing"])
        with tempfile.TemporaryDirectory() as d:
            out = plans.write_plan_set(ps, Path(d) / "p.pdf")
            data = out.read_bytes()
        import re
        self.assertTrue(data.startswith(b"%PDF"))
        pages = len(re.findall(rb"/Type\s*/Page[^s]", data))
        self.assertEqual(pages, 4)   # assembly, section, one part, cut list and notes

    def test_fillet_radius_and_bore_diameter_callouts(self):
        from build123d import Axis, Box, Cylinder, IN, fillet
        from woodstereo import plans
        plate = Box(4 * IN, 3 * IN, IN)
        plate = fillet(plate.edges().filter_by(Axis.Z), IN / 4) - Cylinder(IN / 8, 2 * IN)
        view = plans.project(plate, "top")
        fig, ax = plans._page(11, 8.5)
        try:
            plans._callouts(ax, view, 0, 0, 1)
            labels = [t.get_text() for t in ax.texts]
            self.assertCountEqual(labels, ["R1/4"] * 4 + ["Ø1/4"])
        finally:
            plans.plt.close(fig)

    def test_split_bore_retains_diameter(self):
        from build123d import Edge, IN
        from woodstereo import plans
        first = Edge.make_circle(IN, start_angle=30, end_angle=175)
        second = Edge.make_circle(IN, start_angle=175, end_angle=390)
        circles, arcs = plans._round_features([first], [second])
        self.assertEqual(circles, [(0, 0, 1, False)])
        self.assertFalse(arcs)

    def test_hatch_leaves_holes_empty(self):
        from woodstereo import plans
        outer = [(0, 0), (4, 0), (4, 4), (0, 4)]
        hole = [(1, 1), (2, 1), (2, 2), (1, 2)]          # same winding as the outer ring
        path = plans.hatch_path([outer, hole])
        # Render it (fill follows winding; Path.contains_point does not) and sample pixels.
        import numpy as np
        import matplotlib.pyplot as plt
        from matplotlib.patches import PathPatch
        fig = plt.figure(figsize=(4, 4), dpi=50)
        ax = fig.add_axes((0, 0, 1, 1))
        ax.set_xlim(0, 4)
        ax.set_ylim(0, 4)
        ax.axis("off")
        ax.add_patch(PathPatch(path, facecolor="black", edgecolor="none"))
        fig.canvas.draw()
        img = np.asarray(fig.canvas.buffer_rgba())
        plt.close(fig)

        def dark(x, y):
            return img[int((4 - y) * 50), int(x * 50), 0] < 128

        self.assertTrue(dark(3, 3))          # material
        self.assertFalse(dark(1.5, 1.5))     # hole

    def test_text_rows_clear_the_title_block(self):
        from woodstereo import plans
        rows = plans.lines_per_page("letter")
        last = plans.PAGES["letter"][1] - plans.TEXT_TOP - (rows - 1) * plans.LINE_STEP
        self.assertGreaterEqual(last, plans.TITLE_TOP)
