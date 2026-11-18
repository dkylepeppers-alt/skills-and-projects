# build123d notes

Verified with build123d 0.12.0 and cadquery-ocp 7.9.x. Keep within `requirements.txt`.

- **Units.** build123d and STEP are in millimetres. Scripts here pass inches to the
  `model` helpers, which multiply by `IN` (25.4) going in and divide coming out. When
  calling build123d directly, write `2.5 * IN`. Reports are in inches.
- **Member placement.** `model.member_plane` builds `Plane(origin, x_dir=u, z_dir=w)`, so
  local x is the member axis, y is v and z is w. `model.blank` places a `Box` there.
- **Planar cuts.** `split(shape, bisect_by=Plane, keep=Keep.BOTTOM)` keeps the side behind
  the plane's normal. `model.trim` wraps it with the normal pointing at the waste;
  `model.split_at` returns both sides.
- **Half-space construction.** Parts bounded only by planes (hopper sides, ring segments,
  interlocking blocks) are easiest as an oversized box trimmed by each bounding plane.
  That mirrors how they are cut and keeps every face planar.
- **Copies.** `Rot(0, 0, angle) * shape` for rings and polygons;
  `shape.moved(Location((x*IN, y*IN, 0)))` for grids.
- **Booleans.** `a + b`, `a - b`, `a & b`. `model.interference_in3` handles the empty and
  multi-solid results of `&`.
- **Assemblies.** `model.assembly({label: shape})` gives a labeled compound for STEP.
- **Preview.** `model.save_preview_svg` projects visible and hidden edges from a viewpoint
  with `project_to_viewport`. Convert to PNG (`rsvg-convert -b white -w 900`) to look at it.
- **Surface audit.** `face.geom_type` is `GeomType.PLANE` for sawn and planed faces and
  `GeomType.CYLINDER` for drilled holes and for curved profiles extruded straight through.
  Anything else is outside the hand-tool envelope.

- **Machine models.** `jigmodels.blade(saw, height, tilt, center_y)` raises and tilts a
  kerf-thick disk the saw's way about the table line; `table_top` adds rectangular miter
  slots; `crosscut_sled` and `ramp` build jigs. Copy shapes freely: `model.assembly`
  copies its children, so a part can be exported alone after it was assembled.

## With the cad skill

This skill does not depend on `cad`. When it is installed, its tools add value on the STEP
files produced here: `inspect refs --facts --planes` for independent measurements,
`snapshot` for shaded views, and `cad-viewer` for an interactive look. Its reports are in
millimetres: divide by 25.4. A generator written for this skill can expose a `gen_step()`
function returning the assembly if it should also run under `cad`'s `scripts/step`.
