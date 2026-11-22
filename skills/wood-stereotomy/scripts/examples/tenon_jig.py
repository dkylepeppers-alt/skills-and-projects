"""Tenoning jig that straddles the auxiliary rip fence on the G1023RLWX. The work stands on
end against the jig's face; the blade cuts the cheek with the offcut falling free on the
far side of the blade."""
from _common import finish, out_dir

from woodstereo import geometry as g
from woodstereo import jigs
from woodstereo import model as m
from woodstereo import plans
from woodstereo import shop

profile = shop.load_shop()
saw = profile["table_saw"]
fence = saw["fence"]
PLY = profile["sheet_stock"]["plywood_3_4_actual"]

# ---- parameters (inches)
FENCE_H = fence["aux_fence_height"]                    # 4.5, measured by the owner
FENCE_T = fence["aux_fence_thickness"] or 2.75         # MEASURE: placeholder until measured
TOP_CLEAR = 0.5            # MEASURE: height of the top T-track above the fence top, plus room
FENCE_X = 3.0              # blade-side face of the aux fence, right of the kerf centerline
JIG_LEN = 14.0
TALL_H, TALL_T = 10.0, 2 * PLY                         # tall upright: two plies laminated
SHORT_T = PLY
BRIDGE_T = 2 * PLY
STOP_W, STOP_PROJ, STOP_H = 1.5, 1.5, 8.0              # sacrificial work stop strip
STOP_SCREW_Z = (4.0, 7.0)                              # screws through the upright into the stop
CLAMP_Z = 6.5                                          # toggle clamp base on the stop block
RAIL_T, TENON_T = 0.75, 0.25
fit = jigs.straddle_fit(FENCE_T)

folder = out_dir("tenon_jig")
face_x = FENCE_X - TALL_T                               # work face of the jig (blade side)
shoulder = (RAIL_T - TENON_T) / 2
blade_x = face_x - (RAIL_T - shoulder)                  # kerf's near face: keeper between it and the jig
kerf_c = blade_x - saw["kerf"] / 2
gap_z = fit.upright_bottom_gap
inner = fit.inner_width
bridge_z0 = FENCE_H + TOP_CLEAR

# ---- parts (y along the feed; the jig spans y 0 .. JIG_LEN; stop at the operator end)
tall = m.box_at((FENCE_X - TALL_T / 2, JIG_LEN / 2, gap_z + TALL_H / 2), (TALL_T, JIG_LEN, TALL_H))
short_h = bridge_z0 - 2.0  # short upright butts against the underside of the bridge
short = m.box_at((FENCE_X + inner + SHORT_T / 2, JIG_LEN / 2, 2.0 + short_h / 2), (SHORT_T, JIG_LEN, short_h))
bridge_w = inner + SHORT_T
bridge = m.box_at((FENCE_X + bridge_w / 2, JIG_LEN / 2, bridge_z0 + BRIDGE_T / 2), (bridge_w, JIG_LEN, BRIDGE_T))
stop = m.box_at((face_x - STOP_PROJ / 2, STOP_W / 2, gap_z + STOP_H / 2), (STOP_PROJ, STOP_W, STOP_H))
bridge_overlap = m.interference_in3(short, bridge)
bridge_bearing = m.contact_area_in2(short, bridge)
assert bridge_overlap < 1e-6 and abs(bridge_bearing - SHORT_T * JIG_LEN) < 1e-5, "bridge joint does not seat"
parts = {"tall-upright": tall, "short-upright": short, "bridge": bridge, "work-stop": stop}

aux = m.box_at((FENCE_X + FENCE_T / 2, JIG_LEN / 2, FENCE_H / 2), (FENCE_T, JIG_LEN + 20, FENCE_H))
track = m.box_at((FENCE_X + FENCE_T / 2, JIG_LEN / 2, FENCE_H + (TOP_CLEAR - 0.125) / 2),
                 (1.25, JIG_LEN + 20, TOP_CLEAR - 0.125))

screws = {f"stop-screw-{i + 1}": m.box_at((face_x - 0.6, STOP_W / 2, z), (1.4 + TALL_T, 0.164, 0.164))
          for i, z in enumerate(STOP_SCREW_Z)}
screws["bridge-screws"] = m.box_at((FENCE_X - TALL_T / 2, JIG_LEN / 2, bridge_z0 + BRIDGE_T / 2 - 0.5),
                                   (0.164, JIG_LEN - 2, 2.5))
screws["toggle-clamp"] = m.box_at((face_x - STOP_PROJ - 1.0, STOP_W / 2, CLAMP_Z + 0.5), (2.0, 1.5, 1.0))

# ---- blade path: kerf-thick slab along the whole travel, at full height, square and tilted
def path(tilt):
    """Kerf-thick slab along the whole travel, blade top at the saw's limit for that tilt,
    leaning left about the line where the kerf meets the table."""
    import build123d as bd
    from math import cos, radians
    c = cos(radians(tilt))
    h = saw["depth_at_45_tilt"] if tilt else saw["depth_at_0_tilt"]
    slab = m.box_at((kerf_c, JIG_LEN / 2, h / (2 * c)), (saw["kerf"], JIG_LEN + 30, h / c))
    if tilt:
        slab = bd.Pos(kerf_c * m.IN, 0, 0) * (bd.Rot(0, -tilt, 0) * (bd.Pos(-kerf_c * m.IN, 0, 0) * slab))
    return slab


hits = {}
for tilt in (0, 45):
    p = path(tilt)
    hits[tilt] = [k for k, v in {**screws, "tall-upright": tall, "short-upright": short, "bridge": bridge}.items()
                  if m.interference_in3(p, v) > 1e-6]
    stop_cut = m.interference_in3(p, stop) > 1e-6

fence_clash = {k: round(m.interference_in3(v, aux) + m.interference_in3(v, track), 6) for k, v in parts.items()}
side_play = inner - FENCE_T
offcut_side = "left of the blade, away from the jig: falls free" if blade_x < face_x - shoulder else "TRAPPED"

hw = [jigs.hardware_at(f"stop screw at z {z:g}", face_x - 2.02, face_x + 0.82, z - 0.08, z + 0.08,
                      kerf_c, saw["tilt_direction"]) for z in STOP_SCREW_Z]
hw.append(jigs.hardware_at("toggle clamp", face_x - STOP_PROJ - 2.0, face_x - STOP_PROJ, CLAMP_Z, CLAMP_Z + 1.0,
                           kerf_c, saw["tilt_direction"]))
R = saw["blade_diameter"] / 2
formula = jigs.check_hardware(hw, saw["kerf"], saw["depth_at_0_tilt"], (0.0,), radius=R) + \
    jigs.check_hardware(hw, saw["kerf"], saw["depth_at_45_tilt"], (45.0,), radius=R)

text = "\n".join([
    "## Tenoning jig, straddling the auxiliary fence", "",
    "| Part | Size, in | Notes |", "| --- | --- | --- |",
    f"| Tall upright (blade side) | {JIG_LEN:g} x {TALL_H:g} x {TALL_T:.3f} | two plies; face must be flat and square to the table |",
    f"| Short upright | {JIG_LEN:g} x {short_h:.2f} x {SHORT_T:.3f} | traps the jig on the fence |",
    f"| Bridge | {JIG_LEN:g} x {bridge_w:.3f} x {BRIDGE_T:.3f} | underside {bridge_z0:g} above the table, clear of the top T-track |",
    f"| Work stop | {STOP_W:g} x {STOP_PROJ:g} x {STOP_H:g} | sacrificial: the blade kerfs it; at the operator end, screwed from inside at z {', '.join(str(z) for z in STOP_SCREW_Z)} |",
    "",
    f"**Fit:** inside width {inner:.4f} for a {FENCE_T:g} fence ({'measured' if fence['aux_fence_thickness'] else 'PLACEHOLDER: measure the aux fence thickness'}). "
    "Build to it, then shim so the jig slides with no side play.",
    f"**Before use:** take the JessEm stock guides off the top track. Keep T-bolt heads in the face slot (at {fence['aux_fence_face_tslot_center_height']:g} in) "
    "flush or removed: the tall upright slides over that face.",
    f"**Setting a 1/4 tenon in 3/4 stock:** blade {RAIL_T - shoulder:.3f} in from the jig face (keeper between blade and jig), "
    f"blade height = tenon length; cut, turn the rail face for face, cut again. Offcut: {offcut_side}.",
    "**Tilt:** this saw tilts left, away from the jig, so angled tenons add clearance rather than remove it.",
    "**Guard:** the overhead guard comes off for this cut; follow the saw manual on the riving knife for non-through cuts.",
    ""])

checks = {
    "jig overlaps the fence or track, cu in": fence_clash,
    "bridge / short upright overlap, cu in": round(bridge_overlap, 6),
    "bridge bearing on short upright, sq in": round(bridge_bearing, 4),
    "side play built in, in": round(side_play, 4),
    "blade path meets screws, clamp or jig body, square": hits[0] or "none",
    "blade path meets screws, clamp or jig body, 45 deg": hits[45] or "none",
    "blade kerfs only the sacrificial stop": "yes" if stop_cut else "no",
    "screws or clamp within reach of the blade (formula, 0 and 45 deg)": formula or "none",
    "fence thickness": FENCE_T if fence["aux_fence_thickness"] else f"{FENCE_T} PLACEHOLDER",
    "parts inside the hand-tool envelope": all(m.surface_audit(v)["ok"] for v in parts.values()),
}
m.save_step(m.assembly({**parts, **screws, "aux-fence": aux, "top-track": track}), folder / "tenon-jig-on-fence.step")
m.save_step(m.assembly(parts), folder / "tenon-jig.step")
m.save_preview_svg(m.assembly({**parts, "aux-fence": aux}), folder / "tenon-jig-preview.svg", view_from=(-1.2, -1.0, 0.8))
plan = plans.PlanSet(
    title="Tenoning jig for the 4.5 in aux fence",
    assembly={"Tall upright": tall, "Short upright": short, "Bridge": bridge, "Work stop": stop},
    parts=[
        plans.PartSpec("Tall upright", tall, 1, "two plies of 3/4 plywood, laminated", [
            "Work face must be flat and square to the table. No screws below 3-1/2 in on the work face."]),
        plans.PartSpec("Short upright", short, 1, "3/4 plywood", ["Seat its square top against the underside of the bridge."]),
        plans.PartSpec("Bridge", bridge, 1, "two plies of 3/4 plywood, laminated", [
            f"Inside width between the uprights {inner:.4f} in: fit with shims for no side play."]),
        plans.PartSpec("Work stop", stop, 1, "hardwood, sacrificial", [
            f"Screwed from inside the tall upright at {', '.join(str(z) for z in STOP_SCREW_Z)} in up only; replace when kerfed."]),
    ],
    notes=["Remove the JessEm stock guides before use; keep T-bolt heads in the face slot flush."],
    verify=[f"Aux fence thickness: drawn at {FENCE_T:g} in." if not fence["aux_fence_thickness"] else "",
            "Top T-track height above the fence: drawn with 1/2 in clearance."],
    shop_notes=text,
)
checks["plan set"] = plans.write_plan_set(plan, folder / "tenon-jig-plans.pdf").name
finish(folder, text, checks)
