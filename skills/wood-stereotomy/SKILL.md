---
name: wood-stereotomy
description: Design, draft and model wood stereotomy and joinery that can be cut with non-CNC power tools and hand tools, as parametric build123d CAD with shop-ready output. Use for compound and skewed cuts, braces meeting faces at an angle, hoppers and splayed boxes, polygon columns, segmented rings, interlocking blocks and flat vaults, hip/valley-type intersections, mortise and tenon, dovetails, laps and scarfs, saw tilt and miter settings, corner-offset layout, 1:1 templates, grain and seasonal-movement checks, and "can my shop cut this" reviews of a wood design.
---

# Wood stereotomy and joinery

Draft spatial wood joints so that every surface on every part can be stated as a mark on
the stock or a setting on a tool. A design that models cleanly but cannot be stated that
way is not finished. Work in inches. Standalone: this skill carries its own geometry,
checks and templates. When the separate `cad` and `cad-viewer` skills are installed, use
them as extras for richer inspection, snapshots and viewer links on the STEP files made here.

## Setup

`scripts/woodstereo/geometry.py`, `shop.py`, `joinery.py`, `templates.py` and `sheet.py`
run on the Python standard library. Only `model.py` and the examples need build123d:

```bash
python3 -m venv .venv && .venv/bin/pip install -r <skill>/requirements.txt
.venv/bin/python <skill>/scripts/examples/brace.py --out build
python3 -m unittest discover -s <skill>/tests        # no build123d needed for test_geometry
```

Keep build123d in a virtual environment and inside the pinned range: build123d 0.12 with
cadquery-ocp 7.9 is the combination verified here. Put the scripts folder on `sys.path`
(the examples' `_common.py` shows how) and `from woodstereo import geometry, shop, sheet,
templates, model`.

## The shop

Read `assets/shop-profile.json` first. It lists the machines the design may assume and
their limits; every cut is checked against it. The default profile is: table saw with
miter gauge (tilt 0-45, one direction), bandsaw, handheld router and router table, drill
press, handsaws, chisels and planes. No miter saw, no mill, no CNC. Saw capacities in the
default file are typical figures, flagged as such: ask for measured values when a cut lands
within about 1/4 in of a depth limit or on a tilt stop. For another shop, copy the file into
the project, edit it and pass its path to `shop.load_shop()`.

## Required workflow

1. **Frame the job with the four questions** (`references/design-principles.md`): where the
   parts meet, how force crosses, how the parts go together, how the fit changes with
   moisture. Write the answers into the brief before modeling.
2. **Brief in plain words.** Stock sizes, species if known, member axes (yaw, pitch) and an
   explicit roll for every member, interface planes, loads in words, assembly order,
   expected moisture range. Ask one focused question only when a missing fact makes the
   joint impossible, fit-critical or safety-critical; otherwise state assumptions and go on.
3. **Skeleton first.** Name parameters at the top of one Python generator: stock sizes,
   angles, offsets, fit reliefs. Define member frames with `geometry.member_frame` and each
   interface as a point and normal. No solids yet.
4. **Blanks, then one shared cut.** Model each member as a full rectangular blank
   (`model.blank`). Shape both mating parts from the same interface plane (`model.split_at`
   or `model.trim` with the same point and normal). Never sketch a mating face twice.
5. **Fit offsets by function, as named parameters.** Bearing and locating faces stay at
   zero offset. Relief goes on inactive faces only (mortise bottom, guiding cheek).
6. **Check the envelope.** Run `model.surface_audit` on every part. Planes, drilled or
   routed cylinders, profiles cut straight through the thickness and ruled faces between
   straight guides are allowed; facet or redesign anything else
   (`references/shop-envelope.md`).
7. **Turn every cut into shop data.** For each planar end cut call `sheet.end_cut_sheet`:
   corner offsets from a square datum line, trace angles for the bevel gauge, and tilt and
   miter for each way the blank can lie on the table, each checked against the shop
   profile. Cuts that fit no orientation get a hand method and, where useful, a guide block
   or carrier wedge modeled in the same file. Give every cut normal pointing at the waste, the same
   convention as `model.trim`: the sheet and the template take the waste side and the
   datum side from it. Never set the blade to the trace angle on the
   upright edge: that is not the tilt unless the miter is zero.
8. **Check material and assembly.** Grain arrow on every part; no short grain behind a
   loaded lip, peg or tenon; grain direction on both sides of each bearing face; seasonal
   movement across the widest cross-grain run (`geometry.movement`); an insertion path for
   every captured part; a fitted last piece or an adjuster in every closed loop.
9. **Validate the model.** `model.interference_in3` between mating parts must be about
   zero; `model.contact_area_in2` must match the bearing area the design intends;
   `model.min_edge_angle_deg` flags feather edges. Cross-check closed-form settings against
   the model's own plane normals, as `examples/hopper.py` does with an `assert`.
10. **Look at it.** Write `model.save_preview_svg` and view the result, or hand the STEP to
    `cad-viewer` when installed. Do not skip the visual check because the numbers passed.
11. **Deliver.** STEP file, generator source, shop sheet (Markdown), and 1:1 templates
    (`geometry.layout_lengths` into `templates.end_cut_development`, DXF and SVG) where a template helps. Run the
    shop-ready checklist in `references/verification.md` and report each item honestly.

## Reporting rules

- Report only checks that ran. Say which numbers are closed-form, which were measured on
  the model, and which shop capacities are placeholders.
- Decimal inches to three places plus the nearest 1/32 for layout; degrees to two places.
- Geometry and one-part loads are in scope. Structural sizing is not: for building work
  point to the applicable design standard and say so in the report.
- Rules of thumb in `joinery.py` are first-pass defaults. Name them as such in the brief.
- Mark the reference face, reference edge and datum end on every part and measure
  everything from them.

## References (load when the trigger applies)

- `references/design-principles.md` — the four questions, force paths, retained fibers,
  moisture movement, assembly types. Read at the start of every design.
- `references/drafting-workflow.md` — the CAD workflow in detail, how the hand-drafting
  traditions map to it, 1:1 printing. Read before modeling.
- `references/shop-envelope.md` — what each tool can make, saw-settings math, choosing the
  face that goes down, mirrored parts, fixtures. Read before producing shop data.
- `references/joinery.md` — ordinary joints (mortise and tenon, dovetail, lap, scarf,
  housing) drafted by the same rules, with default proportions and their sources.
- `references/worked-examples.md` — the five runnable examples, what each proves, and the
  numbers they must reproduce.
- `references/verification.md` — tolerance tables, the verification sequence and the
  shop-ready checklist. Read before delivering.
- `references/build123d-notes.md` — the build123d patterns this skill relies on, units,
  and how to combine with the `cad` skill.
- `references/sources.md` — where the rules and numbers come from.

## Repository

The canonical copy lives in
[dkylepeppers-alt/skills-and-projects](https://github.com/dkylepeppers-alt/skills-and-projects)
under `skills/wood-stereotomy/`. Read that repository's `AGENTS.md` before editing it; keep
project-specific designs under `projects/<short-name>/`, not in this skill.
