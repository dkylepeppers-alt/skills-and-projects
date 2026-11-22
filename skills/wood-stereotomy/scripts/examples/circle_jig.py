"""Circle-cutting sled for the Shop Fox W1849 bandsaw: runner in the miter slot, a front lip
that stops the sled with the teeth on the pivot line, and a sliding pivot bar locked by a
knob. Writes the model, the checks and a dimensioned plan set (PDF)."""
from _common import finish, out_dir
from build123d import Cylinder, Pos

from woodstereo import geometry as g
from woodstereo import jigs
from woodstereo import model as m
from woodstereo import plans
from woodstereo import shop

profile = shop.load_shop()
bs = profile["bandsaw"]
PLY = profile["sheet_stock"]["plywood_3_4_actual"]

# ---- parameters (inches). Frame: x across (+right), y along the feed (+ away from you),
# z up from the table. y = 0 is the lip's contact face, the face that meets the table edge.
F = bs["front_of_table_to_blade_front"]     # MEASURE: placeholder in the profile
LIP, LIP_DROP = 0.5, 0.75                     # lip thickness, and how far it hangs below the base
BLADE_W, KERF = 0.5, 0.035                    # 1/2 in blade; kerf: measure on a test cut
MIN_RADIUS, MAX_RADIUS = 2.5, 11.0            # a 1/2 in blade handles circles over 5 in diameter
SLOT_X = 5.0                                  # MEASURE: miter slot centerline right of the blade
X_LEFT, BASE_W = -4.0, 18.0
BAR_W, BAR_T, BAR_LEN = 0.75, 0.375, 10.25    # hardwood pivot bar in a 3/4 x 3/8 groove
PIN_D, PIN_LEN = 0.25, 0.75                   # steel pin pressed into the bar
KNOB_X = 11.5                                 # knob bolt (1/4-20) fixed in the base
BAR_SLOT_W, BAR_SLOT_START, BAR_SLOT_END = 0.28, 0.75, 9.75  # along the bar from its left end
SHANK_R, SLIDE = 0.125, 1 / 32                # 1/4-20 stud radius, running clearance at the slot ends
BOLT_HOLE, TNUT_BORE, TNUT_DEPTH = 5 / 16, 0.75, 1 / 16

folder = out_dir("circle_jig")
cj = jigs.circle_jig(MIN_RADIUS, F, LIP)
pivot_y = cj.pivot_line_from_sled_front - LIP     # = F, from the contact face
BASE_D = pivot_y + 7.0
runner = jigs.runner_section(bs["miter_slot"])
x_right = X_LEFT + BASE_W

# ---- base: kerf slot (cut by the blade), groove for the bar, knob bolt hole with T-nut bore
base = m.box_at((X_LEFT + BASE_W / 2, BASE_D / 2, PLY / 2), (BASE_W, BASE_D, PLY))
kerf_slot = m.box_at((0, (pivot_y + BASE_D) / 2 + 0.5, PLY / 2), (KERF, BASE_D - pivot_y + 1, PLY + 0.1))
groove_x0 = KERF / 2 + MIN_RADIUS - 0.5 - 0.125
groove = m.box_at(((groove_x0 + x_right) / 2 + 0.05, pivot_y, PLY - BAR_T / 2),
                  (x_right - groove_x0 + 0.1, BAR_W, BAR_T + 0.001))
bolt = Pos(KNOB_X * m.IN, pivot_y * m.IN, PLY / 2 * m.IN) * Cylinder(BOLT_HOLE / 2 * m.IN, PLY * m.IN + 0.2)
tnut = Pos(KNOB_X * m.IN, pivot_y * m.IN, TNUT_DEPTH / 2 * m.IN) * Cylinder(TNUT_BORE / 2 * m.IN, TNUT_DEPTH * m.IN + 0.01)
base = base - kerf_slot - groove - bolt - tnut
# The knob's stud, with its radius and running clearance, must sit inside the bar's slot at
# both ends of the radius range (the knob is fixed; the bar slides past it).
knob_along_min_r = KNOB_X - (KERF / 2 + MIN_RADIUS - 0.5)     # stud position along the bar
knob_along_max_r = KNOB_X - (KERF / 2 + MAX_RADIUS - 0.5)
slot_margin = min(BAR_SLOT_END - (knob_along_min_r + SHANK_R + SLIDE),
                  (knob_along_max_r - SHANK_R - SLIDE) - BAR_SLOT_START)
assert slot_margin >= 0, f"knob stud leaves the bar slot by {-slot_margin:.3f} in at a radius limit"
assert BAR_LEN - BAR_SLOT_END >= 0.375, "bar end wall past the slot is too thin"


def bar_at(radius):
    pin_x = KERF / 2 + radius
    x0 = pin_x - 0.5
    bar = m.box_at((x0 + BAR_LEN / 2, pivot_y, PLY - BAR_T / 2), (BAR_LEN, BAR_W - 0.01, BAR_T))
    slot = m.box_at((x0 + (BAR_SLOT_START + BAR_SLOT_END) / 2, pivot_y, PLY - BAR_T / 2),
                    (BAR_SLOT_END - BAR_SLOT_START, BAR_SLOT_W, BAR_T + 0.01))
    hole = Pos(pin_x * m.IN, pivot_y * m.IN, (PLY - BAR_T / 2) * m.IN) * Cylinder(PIN_D / 2 * m.IN, BAR_T * m.IN + 0.01)
    pin = Pos(pin_x * m.IN, pivot_y * m.IN, (PLY - BAR_T + PIN_LEN / 2) * m.IN) * Cylinder(PIN_D / 2 * m.IN, PIN_LEN * m.IN)
    return bar - slot - hole, pin


lip = m.box_at((X_LEFT + BASE_W / 2, -LIP / 2, (PLY - LIP_DROP) / 2), (BASE_W, LIP, PLY + LIP_DROP))
run = m.box_at((SLOT_X, BASE_D / 2, -runner.height / 2), (runner.width, BASE_D - 1, runner.height))

# ---- checks: blade placed from the machine and the stop, not from the pivot
teeth_y = 0.0 + F
blade = m.box_at((0, teeth_y + BLADE_W / 2, 3.0), (KERF, BLADE_W, 8.0))
results = {}
for r in (MIN_RADIUS, MAX_RADIUS):
    bar, pin = bar_at(r)
    results[r] = {k: round(m.interference_in3(blade, v), 6) for k, v in
                  {"pivot bar": bar, "pin": pin, "runner": run, "lip": lip}.items()}
    results[r]["bar in groove"] = round(m.interference_in3(bar, base), 6)
bar_min, pin_min = bar_at(MIN_RADIUS)
pin_line_error = abs(pin_min.center().Y / m.IN - teeth_y)
base_at_stop = m.interference_in3(blade, base)
bar_overhang = (KERF / 2 + MAX_RADIUS - 0.5 + BAR_LEN) - x_right

text = "\n".join([
    "## Bandsaw circle sled, Shop Fox W1849", "",
    f"Pivot line: {cj.pivot_line_from_sled_front:.3f} in from the lip's front face ({F:g} from its contact face + {LIP:g} lip). "
    f"The {F:g} figure is a PLACEHOLDER and only sizes the base: the pivot line is marked from the real teeth (sequence below).",
    f"Radius scale: zero at the blade's right side, {KERF / 2:.4f} in right of the kerf centerline; radius = scale reading at the pin.",
    f"Range: radius {MIN_RADIUS:g} to {MAX_RADIUS:g} with a {BLADE_W:g} in blade. At full radius the bar overhangs the base by {bar_overhang:.2f} in.",
    "",
    "Build sequence:",
    "1. Cut the base and lip; glue and screw the lip flush with the base's front edge, hanging below.",
    "2. Fit the runner to the W1849's slot, then fix it to the base with the base square to the blade.",
    "3. Push the sled into the running blade until the lip stops it. The blade cuts its own kerf slot.",
    "4. With the sled at the stop, mark the pivot line across the base at the front of the teeth, square to the kerf.",
    "5. Cut the 3/4 x 3/8 groove centered on that line (dado stack on the G1023RLWX or router table).",
    "6. Bore the knob hole and T-nut recess on the groove centerline at the knob position; seat the T-nut from below.",
    "7. Make the bar, slot it, press in the pin, and fit it to slide in the groove without play.",
    "",
    "Use: cut the blank about 1 in oversize, drill the pivot hole on its underside, set the radius, lock the knob, "
    "push the sled to its stop, then turn the blank on the pin. Let the blade stop before lifting the disk.",
    ""])

checks = {
    "pin centre vs the teeth at the stop, in": round(pin_line_error, 6),
    "blade at the stop meets bar, pin, runner or lip; bar overlaps groove (min / max radius)": results,
    "blade runs only in the base's kerf slot, cu in": round(base_at_stop, 6),
    "knob stud inside the bar slot at both radius limits (margin incl. 1/32 clearance), in": round(slot_margin, 4),
    "front of table to blade front": f"{F:g} ({bs['front_of_table_to_blade_front_is']})",
    "parts inside the hand-tool envelope": all(m.surface_audit(x)["ok"] for x in (base, lip, run, bar_min)),
}

assembly = {"Base": base, "Front lip": lip, "Runner": run, "Pivot bar": bar_min, "Pivot pin": pin_min}
plan = plans.PlanSet(
    title="Bandsaw circle sled - Shop Fox W1849",
    assembly=assembly,
    parts=[
        plans.PartSpec("Base", base, 1, "3/4 plywood (measure: drawn at 23/32)", [
            "REF corner: front-left (lip side, left end).",
            "Kerf slot is cut by the blade itself (sequence step 3), drawn here for reference.",
            "Groove: mark its centerline from the real teeth with the sled at its stop (step 4); "
            f"drawn at {pivot_y:g} from the contact face using a placeholder.",
            "Knob hole 5/16 through; T-nut recess 3/4 dia x 1/16 deep from below.",
        ]),
        plans.PartSpec("Front lip", lip, 1, "3/4 plywood or hardwood", [
            "Glue and screw to the base's front edge, top flush; screws clear of the blade line (x = 0).",
            f"Hangs {LIP_DROP:g} below the base to hook the table's front edge."]),
        plans.PartSpec("Runner", run, 1, "hardwood or UHMW", [
            f"Section drawn {runner.width:.3f} x {runner.height:.3f} for a 3/4 x 3/8 slot: PLACEHOLDER, measure the W1849 slot.",
            "Plane or scrape to slide with no side play; it must not touch the slot floor."]),
        plans.PartSpec("Pivot bar", bar_min, 1, "hardwood (maple or oak)", [
            f"Slot {BAR_SLOT_W:g} wide from {BAR_SLOT_START:g} to {BAR_SLOT_END:g} along the bar for the 1/4-20 knob.",
            f"Pin hole {PIN_D:g} dia, 1/2 in from the left end; press the pin in flush with the bottom.",
            "Fit to slide in the groove without play."]),
        plans.PartSpec("Pivot pin", pin_min, 1, "1/4 steel rod (drill rod or a bolt shank)", [
            f"{PIN_LEN:g} long; stands {PIN_LEN - BAR_T:.3f} above the base. Ease the top edge."]),
    ],
    sections=[plans.Section("A-A (just behind the pivot line)", (0.0, pivot_y + 0.03, 0.0), "front")],
    notes=[
        "Hardware: 1/4-20 T-nut, 1/4-20 knob with 1-1/4 in stud, wood screws for lip and runner.",
        "Units are inches. Ordinate dimensions start at the REF corner shown in each view.",
        f"Blade: {BLADE_W:g} in; narrower blades cut smaller circles, change MIN_RADIUS in the generator to suit.",
    ],
    verify=[
        f"W1849 table front edge to blade teeth: drawn at {F:g} in (sizes the base; the pivot line is marked from the blade).",
        "W1849 miter slot width, depth and distance from the blade: drawn as 3/4 x 3/8, 5 in right of the blade.",
        f"Blade kerf: drawn at {KERF:g} in.",
        "Plywood thickness: drawn at 23/32 in.",
    ],
    shop_notes=text,
)
pdf = plans.write_plan_set(plan, folder / "circle-jig-plans.pdf")

m.save_step(m.assembly(assembly), folder / "circle-jig.step")
m.save_preview_svg(m.assembly(assembly), folder / "circle-jig-preview.svg", view_from=(-0.8, -1.2, 1.4))
checks["plan set"] = pdf.name
finish(folder, text, checks)
