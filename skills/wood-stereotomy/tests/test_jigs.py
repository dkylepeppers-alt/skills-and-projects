"""Standard-library tests for the jig math, using the shop profile's machines."""
import random
import sys
import unittest
from math import cos, radians, sin, sqrt
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from woodstereo import geometry as g  # noqa: E402
from woodstereo import jigs, shop  # noqa: E402

SAW = shop.load_shop()["table_saw"]


class Profile(unittest.TestCase):
    def test_machines(self):
        p = shop.load_shop()
        self.assertEqual(SAW["tilt_direction"], "left")
        self.assertEqual(SAW["depth_at_0_tilt"], 3.0)
        self.assertEqual(SAW["front_of_table_to_blade_center"], 17.0)
        self.assertEqual(SAW["fence"]["aux_fence_height"], 4.5)
        self.assertEqual(p["bandsaw"]["resaw_height"], 14.0)
        self.assertIn("W1849", p["bandsaw"]["model"])


class Blade(unittest.TestCase):
    def test_half_chord(self):
        # 10 in blade raised 3: arbor 2 below the table; at the table the chord is 2*sqrt(21)
        self.assertAlmostEqual(jigs.blade_half_chord(5, 3, 0), sqrt(21), 9)
        self.assertEqual(jigs.blade_half_chord(5, 3, 3.5), 0.0)
        # tilted: the top of the blade is still `height` above the table
        self.assertAlmostEqual(jigs.blade_half_chord(5, 2.125, 2.125, 45), 0.0, 9)

    def test_tilt_offset(self):
        self.assertAlmostEqual(jigs.tilt_offset(2.0, 45), 2.0, 9)


class Sled(unittest.TestCase):
    def test_travel_square(self):
        t = jigs.sled_travel(SAW, 0.71875, 2.03125, 3.5, 1.4375, 3.0, 3.5, 5.0)
        self.assertTrue(t.ok, t.reasons)
        self.assertAlmostEqual(t.blade_height, 3.0, 9)
        # complete cut: the blade reaches 1/4 past the work face at the stock top
        reach_top = jigs.blade_half_chord(5, 3.0, 0.71875 + 2.03125)
        self.assertAlmostEqual(t.arbor_y - reach_top, 3.5 + 1.4375 - 0.25, 9)
        self.assertAlmostEqual(t.sled_origin_at_stop, 17.0 - t.arbor_y, 9)

    def test_travel_flags_small_block_and_tall_blade(self):
        t = jigs.sled_travel(SAW, 0.71875, 2.0, 3.5, 1.4375, 0.5, 1.0, 1.0)
        self.assertFalse(t.ok)
        self.assertEqual(len(t.reasons), 3)
        t = jigs.sled_travel(SAW, 0.71875, 1.5, 3.5, 1.4375, 3.0, 3.5, 5.0, tilt_deg=45)
        self.assertIn("exceeds", t.reasons[0])

    def test_shared_stop_must_finish_the_cut(self):
        t = jigs.sled_travel(SAW, 0.71875, 2.03125, 3.5, 1.4375, 3.0, 3.5, 5.0)
        late = jigs.sled_travel(SAW, 0.71875, 2.03125, 3.5, 1.4375, 3.0, 3.5, 5.0, arbor_y=t.arbor_y + 0.3)
        self.assertFalse(late.ok)
        self.assertIn("short of finishing", late.reasons[0])
        deeper = jigs.sled_travel(SAW, 0.71875, 2.03125, 3.5, 1.4375, 3.0, 3.5, 5.0, arbor_y=t.arbor_y - 0.3)
        self.assertTrue(deeper.ok)
        self.assertAlmostEqual(deeper.exit_block_depth, t.exit_block_depth + 0.3, 9)

    def test_runner(self):
        r = jigs.runner_section(SAW["miter_slot"])
        self.assertAlmostEqual(r.width, 0.745, 9)
        self.assertAlmostEqual(r.height, 0.34375, 9)

    def test_five_cut(self):
        f = jigs.five_cut(3.010, 3.002, 20, 24)
        self.assertAlmostEqual(f.error_per_inch, 0.0001, 9)
        self.assertAlmostEqual(f.correction_at_fence_end, 0.0024, 9)


class Hardware(unittest.TestCase):
    def test_lean_side(self):
        screw_left = jigs.hardware_at("left screw", -2.1, -1.9, 0, 2)
        screw_right = jigs.hardware_at("right screw", 1.9, 2.1, 0, 2)
        self.assertFalse(jigs.blade_hits(screw_left, 0.125, 3.0, 0))
        self.assertTrue(jigs.blade_hits(screw_left, 0.125, 2.125, 45))   # the blade leans onto it
        self.assertFalse(jigs.blade_hits(screw_right, 0.125, 2.125, 45))
        high = jigs.hardware_at("high", -0.2, 0.2, 3.5, 4.0)
        self.assertFalse(jigs.blade_hits(high, 0.125, 3.0, 0))


class Stops(unittest.TestCase):
    def test_rules(self):
        ok = jigs.check_stops([jigs.Stop("sled stop", "jig", "keeper"),
                               jigs.Stop("stand-off on the rip fence", "table", "offcut", standoff=True)])
        self.assertEqual(ok, [])
        bad = jigs.check_stops([jigs.Stop("rip fence as stop", "table", "offcut")])
        self.assertEqual(len(bad), 2)


class Carrier(unittest.TestCase):
    def test_steep_bevel(self):
        n = (cos(radians(60)), 0.0, sin(radians(60)))
        c = jigs.carrier_for_tilt(n, "across", 45)
        self.assertAlmostEqual(abs(c.wedge_deg), 15.0, 6)
        self.assertAlmostEqual(c.miter, 0.0, 6)
        opts = jigs.carrier_options(n, SAW)
        self.assertEqual(opts[0].axis, "across")
        self.assertIsNone(jigs.bevel_hand(jigs.normal_after_carrier(n, c), "left"))
        self.assertIsNotNone(jigs.bevel_hand(jigs.normal_after_carrier(n, c), "right"))

    def test_random_normals_hit_target(self):
        rng = random.Random(7)
        for _ in range(200):
            n = (rng.uniform(0.2, 1), rng.uniform(-1, 1), rng.uniform(-1, 1))
            for axis in ("along", "across"):
                for target in (0.0, 30.0, 45.0):
                    c = jigs.carrier_for_tilt(n, axis, target)
                    if c is None:
                        continue
                    tilt, miter = g.saw_settings(jigs.normal_after_carrier(n, c), (1, 0, 0), (0, 1, 0), (0, 0, 1))
                    self.assertAlmostEqual(tilt, target, 6)
                    self.assertAlmostEqual(miter, c.miter, 6)


class OtherJigs(unittest.TestCase):
    def test_circle_and_straddle(self):
        cj = jigs.circle_jig(4.0, 8.0)
        self.assertAlmostEqual(cj.pivot_line_from_sled_front, 8.5, 9)
        self.assertAlmostEqual(cj.pivot_from_blade, 4.0, 9)
        s = jigs.straddle_fit(2.75)
        self.assertAlmostEqual(s.inner_width, 2.765625, 9)

    def test_base_kerf_reach(self):
        r = jigs.base_kerf_reach(SAW, 3.0, 0.71875)
        self.assertAlmostEqual(r, sqrt(21) - jigs.blade_half_chord(5, 3.0, 0.71875), 9)


if __name__ == "__main__":
    unittest.main()
