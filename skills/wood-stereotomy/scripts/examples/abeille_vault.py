"""Abeille-type interlocking flat vault: identical blocks, every side at one blade tilt."""
from math import cos, radians, sin

from _common import finish, out_dir
from build123d import Rot

from woodstereo import geometry as g
from woodstereo import model as m
from woodstereo import shop

# ---- parameters (inches, degrees)
BASE, HEIGHT, SLOPE = 2.0, 1.0, 25.0
ROWS = COLS = 4
STRIP = 0.75                         # frame strip width at the base
MC_SWING = 4.0                       # % moisture content, e.g. 8 -> 12
C_RADIAL, C_TANGENTIAL = 0.00194, 0.00376   # white oak, per % MC (Wood Handbook table 13-5)

folder = out_dir("abeille_vault")
block = g.abeille_block(BASE, HEIGHT, SLOPE)
a, h = radians(SLOPE), BASE / 2
shop_profile = shop.load_shop()


def make_block():
    """Ramps on the +-x sides lean in; overhangs on the +-y sides lean out. Grain along y."""
    body = m.box_at((0, 0, HEIGHT / 2), (BASE, block.top_across_overhangs, HEIGHT))
    body = m.trim(body, (h, 0, 0), (cos(a), 0, sin(a)))        # ramp, +x
    body = m.trim(body, (-h, 0, 0), (-cos(a), 0, sin(a)))      # ramp, -x
    body = m.trim(body, (0, h, 0), (0, cos(a), -sin(a)))       # overhang, +y
    body = m.trim(body, (0, -h, 0), (0, -cos(a), -sin(a)))     # overhang, -y
    return body


def strip_piece(under_block: bool):
    """Frame strip, BASE long, against a block side on the strip's -x face (strip at x > 0).
    under_block=True carries a block's overhang; False leans over a block's ramp."""
    lean = 1 if under_block else -1
    body = m.box_at((STRIP / 2, 0, HEIGHT / 2), (STRIP + 4 * block.shift, BASE, HEIGHT))
    body = m.trim(body, (0, 0, 0), (-cos(a), 0, lean * sin(a)))   # the working face
    return m.trim(body, (STRIP, 0, 0), (1, 0, 0))                 # square outer face


unit = make_block()
parts = {}
grid = {}
for i in range(COLS):
    for j in range(ROWS):
        turned = (i + j) % 2 == 1
        piece = Rot(0, 0, 90) * unit if turned else unit
        x, y = (i - (COLS - 1) / 2) * BASE, (j - (ROWS - 1) / 2) * BASE
        grid[(i, j)] = piece.moved(m.Location((x * m.IN, y * m.IN, 0)))
        parts[f"block-{i + 1}-{j + 1}"] = grid[(i, j)]

# frame strips along all four sides: each strip mirrors the block side it meets
edge = COLS * BASE / 2
for k in range(COLS):
    pos = (k - (COLS - 1) / 2) * BASE
    for side, (rot, at, ij) in enumerate([
            (0, (edge, pos), (COLS - 1, k)), (180, (-edge, pos), (0, k)),
            (90, (pos, edge), (k, ROWS - 1)), (270, (pos, -edge), (k, 0))]):
        i, j = ij
        turned = (i + j) % 2 == 1
        x_side_is_ramp = not turned              # unturned blocks present ramps on +-x
        faces_ramp = x_side_is_ramp if side < 2 else not x_side_is_ramp
        piece = Rot(0, 0, rot) * strip_piece(under_block=not faces_ramp)
        parts[f"strip-{side + 1}-{k + 1}"] = piece.moved(m.Location((at[0] * m.IN, at[1] * m.IN, 0)))

# ---- saw settings: both the rip and the crosscut are single bevels at the slope
rip = g.Orientation("base or top face", HEIGHT, SLOPE, 0.0)
verdicts, method = shop.plan_cut(shop_profile, [rip])
row = COLS * BASE
worst, rss = g.stack_error(0.005, COLS)
text = "\n".join([
    f"## Abeille-type vault, {COLS} x {ROWS} blocks", "",
    "| Item | Value |", "| --- | --- |",
    f"| Block base | {BASE:.3f} in square, {HEIGHT:.3f} in thick |",
    f"| Side slope | {SLOPE:g} deg from vertical, all four sides |",
    f"| Side travel base to top | {block.shift:.3f} in |",
    f"| Top across ramps | {block.top_across_ramps:.3f} in |",
    f"| Top across overhangs | {block.top_across_overhangs:.3f} in |",
    f"| Thrust per ramp face | {block.thrust_per_face:.2f} x one block's load |",
    f"| Row length | {row:.3f} in |",
    f"| Row movement, half the blocks cross-grain, quartersawn | "
    f"{g.movement(row / 2, C_RADIAL, MC_SWING):.3f} in |",
    f"| Row movement, half the blocks cross-grain, flatsawn | "
    f"{g.movement(row / 2, C_TANGENTIAL, MC_SWING):.3f} in |",
    f"| Row stack-up at +-0.005 in per block | {worst:.3f} in worst, {rss:.3f} in RSS |",
    "", f"**Method:** {method}. Rip the stick's two long edges at {SLOPE:g} deg turning it "
    "end-for-end so the bevels converge (ramps). Crosscut each end at the same tilt, miter 0, "
    "widening upward (overhangs), on a sled with a stop and hold-down. Grain runs between the "
    "overhangs. Fit the frame with folding wedges on two adjacent sides.", ""])

A, B = grid[(0, 0)], grid[(1, 0)]
m.save_step(m.assembly(parts), folder / "abeille-vault.step")
m.save_step(unit, folder / "abeille-block.step", label="block")
m.save_preview_svg(m.assembly(parts), folder / "abeille-vault-preview.svg", view_from=(-1, -1.4, 1.6))
finish(folder, text, {
    "block surfaces inside the hand-tool envelope": m.surface_audit(unit)["ok"],
    "block volume, cu in": round(m.volume_in3(unit), 4),
    "interference between neighbouring blocks, cu in": round(m.interference_in3(A, B), 6),
    "bearing area per ramp/overhang contact, sq in": round(m.contact_area_in2(A, B), 3),
    "interference block/frame strip, cu in":
        round(m.interference_in3(grid[(COLS - 1, 0)], parts["strip-1-1"]), 6),
    "contact area block/frame strip, sq in":
        round(m.contact_area_in2(grid[(COLS - 1, 0)], parts["strip-1-1"]), 3),
    "sharpest edge on a block, deg": round(m.min_edge_angle_deg(unit), 2),
})
