"""Circle-cutting sled for the Shop Fox W1849 bandsaw: runner in the miter slot, a front lip
that stops the sled with the teeth on the pivot line, and a sliding pivot bar."""
from _common import finish, out_dir
from build123d import Cylinder, Pos

from woodstereo import geometry as g
from woodstereo import jigs
from woodstereo import model as m
from woodstereo import shop

profile = shop.load_shop()
bs = profile["bandsaw"]
PLY = profile["sheet_stock"]["plywood_3_4_actual"]

# ---- parameters (inches). Frame: x across (+right), y along the feed, sled front edge y = 0.
F = bs["front_of_table_to_blade_front"]     # MEASURE: placeholder in the profile
LIP = 0.5                                     # front lip that hooks the table's front edge
BLADE_W, KERF = 0.5, 0.035                    # 1/2 in blade; kerf: measure on a test cut
MIN_RADIUS = 2.5                              # a 1/2 in blade handles circles over 5 in diameter
MAX_RADIUS = 11.0
SLOT_X = 5.0                                  # MEASURE: miter slot centerline right of the blade
BASE_W, BASE_D = 18.0, F + LIP + 7.0
X_LEFT = -4.0
BAR_W, BAR_T, BAR_LEN = 0.75, 0.375, 10.0
PIN_D = 0.25
MARGIN = 0.25

folder = out_dir("circle_jig")
cj = jigs.circle_jig(MIN_RADIUS, F, LIP)
# Sled frame: y = 0 is the lip's contact face, the face that meets the table's front edge.
# The lip hangs in front of it (y = -LIP .. 0), so the lip's front face is at y = -LIP.
pivot_y = cj.pivot_line_from_sled_front - LIP
runner = jigs.runner_section(bs["miter_slot"])

base = m.box_at((X_LEFT + BASE_W / 2, BASE_D / 2, PLY / 2), (BASE_W, BASE_D, PLY))
kerf_slot = m.box_at((0, (pivot_y + BASE_D) / 2 + 0.5, PLY / 2), (KERF, BASE_D - pivot_y + 1, PLY + 0.1))
groove_x0 = KERF / 2 + MIN_RADIUS - 0.5
groove = m.box_at(((groove_x0 + X_LEFT + BASE_W) / 2, pivot_y, PLY - BAR_T / 2),
                  (X_LEFT + BASE_W - groove_x0 + 0.1, BAR_W, BAR_T + 0.001))
base = base - kerf_slot - groove


def bar_at(radius):
    pin_x = KERF / 2 + radius
    bar = m.box_at((pin_x - 0.5 + BAR_LEN / 2, pivot_y, PLY - BAR_T / 2), (BAR_LEN, BAR_W - 0.01, BAR_T))
    pin = Pos(pin_x * m.IN, pivot_y * m.IN, (PLY + 0.125) * m.IN) * Cylinder(PIN_D / 2 * m.IN, 0.75 * m.IN)
    return bar, pin


lip = m.box_at((X_LEFT + BASE_W / 2, -LIP / 2, -0.75 / 2 + PLY / 2), (BASE_W, LIP, 0.75 + PLY))
run = m.box_at((SLOT_X, BASE_D / 2, -runner.height / 2), (runner.width, BASE_D - 1, runner.height))

# ---- blade at the stop, placed from the machine and the stop, not from the pivot: the
# lip's contact face meets the table's front edge, so the teeth are F behind it.
teeth_y = 0.0 + F
blade = m.box_at((0, teeth_y + BLADE_W / 2, 3.0), (KERF, BLADE_W, 8.0))
results = {}
for r in (MIN_RADIUS, MAX_RADIUS):
    bar, pin = bar_at(r)
    results[r] = {k: round(m.interference_in3(blade, v), 6) for k, v in
                  {"pivot bar": bar, "pin": pin, "runner": run, "lip": lip}.items()}
bar_min, pin_min = bar_at(MIN_RADIUS)
pin_line_error = abs(pin_min.center().Y / m.IN - teeth_y)   # pin vs the real teeth
base_at_stop = m.interference_in3(blade, base)

text = "\n".join([
    "## Bandsaw circle sled, Shop Fox W1849", "",
    "| Part | Size, in | Notes |", "| --- | --- | --- |",
    f"| Base | {BASE_W:g} x {BASE_D:.2f} x {g.frac(PLY)} | kerf slot from the rear edge to the pivot line |",
    f"| Front lip | {BASE_W:g} x {LIP:g} x {0.75 + PLY:.2f} deep | hooks the table's front edge as the travel stop |",
    f"| Runner | {runner.width:.3f} x {runner.height:.3f} x {BASE_D - 1:.2f} | slot size is a PLACEHOLDER: measure the W1849's slot |",
    f"| Pivot bar | {BAR_LEN:g} x {BAR_W:g} x {BAR_T:g} in a groove square to the blade | lock with a knob and T-nut from below |",
    f"| Pivot pin | {PIN_D:g} dia | at the bar's left end; drill the blank's underside {PIN_D:g} to match |",
    "",
    f"**Pivot line:** {cj.pivot_line_from_sled_front:.3f} in from the lip's front face ({F:g} from its contact face, plus the {LIP:g} lip; the table-front figure is a PLACEHOLDER). "
    "Confirm by sliding the sled to its stop and sighting the teeth on the line before cutting the groove.",
    f"**Radius scale:** zero at the blade's right side, {KERF / 2:.4f} in right of the kerf centerline; radius = scale reading at the pin.",
    f"**Range:** radius {MIN_RADIUS:g} to {MAX_RADIUS:g} with a {BLADE_W:g} in blade; narrower blades go smaller.",
    "**Use:** cut the blank about 1 in oversize, drill the pivot hole, set the bar, push the sled until the lip stops it, "
    "then turn the blank on the pin. Let the blade stop before lifting the disk.",
    ""])

checks = {
    "pin centre vs the teeth at the stop, in": round(pin_line_error, 6),
    "blade at the stop meets pivot bar, pin, runner or lip (min / max radius)": results,
    "blade runs only in the base's kerf slot, cu in": round(base_at_stop, 6),
    "front of table to blade front": f"{F:g} ({bs['front_of_table_to_blade_front_is']})",
    "parts inside the hand-tool envelope": m.surface_audit(base)["ok"],
}
m.save_step(m.assembly({"base": base, "lip": lip, "runner": run, "pivot-bar": bar_min, "pin": pin_min}),
            folder / "circle-jig.step")
m.save_preview_svg(m.assembly({"base": base, "lip": lip, "runner": run, "pivot-bar": bar_min, "pin": pin_min}),
                   folder / "circle-jig-preview.svg", view_from=(-0.8, -1.2, 1.4))
finish(folder, text, checks)
