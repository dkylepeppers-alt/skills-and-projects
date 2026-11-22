---
name: wood-stereotomy
description: Design, draft and model wood stereotomy, joinery and shop jigs that can be cut with non-CNC power tools and hand tools, as parametric build123d CAD with shop-ready output. Use for compound and skewed cuts, braces meeting faces at an angle, hoppers and splayed boxes, polygon columns, segmented rings, interlocking blocks and flat vaults, hip/valley-type intersections, mortise and tenon, dovetails, laps and scarfs, saw tilt and miter settings, corner-offset layout, 1:1 templates, grain and seasonal-movement checks, jigs and fixtures for the table saw, router table and bandsaw (sleds, carrier wedges, tenoning jigs, circle jigs, stops, guard blocks), and "can my shop cut this" reviews of a wood design.
---

# Wood stereotomy and joinery

**The deliverable is a plan set**: dimensioned shop drawings the user can build from, one
PDF from `plans.write_plan_set`. The model, the checks, the shop sheet and the templates
exist to make those drawings right; none of them replaces the drawings. A delivery without
a plan set is incomplete.

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
templates, jigs, model, jigmodels, plans`.

## The shop

Read `assets/shop-profile.json` first. It lists the machines the design may assume and
their limits; every cut is checked against it. The shop is a Grizzly G1023RLWX 10 in
cabinet saw (left tilt, 0-45, miter gauge, built-in router table extension, Shop Fox
Classic T-square fence with a 4.5 in auxiliary fence carrying a face T-slot and top
T-track), a Shop Fox W1849 14 in bandsaw, a handheld router, drill press, handsaws,
chisels and planes. No miter saw, no mill, no CNC. Each value is marked spec
(manufacturer data) or measure (placeholder). Ask for a measured value when a cut lands
within about 1/4 in of a depth limit or on a tilt stop, or when a jig is built to a
placeholder. For another shop, copy the file into the project, edit it and pass its path
to `shop.load_shop()`.

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
11. **Jigs, when the work needs one or the user asks.** Draft the jig with the machine
    feature it rides on and the blade, per `references/jigs.md`: register on a named
    feature, keep hardware out of the blade's path at 0 deg and full tilt, no trapped
    offcuts, contain the blade where it exits, and check all of it on the model
    (`jigs.py`, `jigmodels.py`). Use a carrier wedge when a cut is outside the saw's range.
12. **Draw the plan set (required).** Build a `plans.PlanSet` from the same model:
    the assembly (every part, positioned), one `PartSpec` per distinct part with quantity,
    material and notes (a `frame` for any part that sits rotated, so it is drawn in true
    shape; `match` for repeated parts), a `Section` wherever a joint, groove or recess is
    hidden in the outside views, the build sequence and shop notes, and every placeholder
    figure under `verify`. `plans.write_plan_set` produces: assembly sheet with overall
    sizes and parts list; section sheets with cut faces hatched; one detail sheet per part
    with every edge, hole and recess located by ordinate dimensions from the part's REF
    corner, hole sizes and the angle of every edge that is not square; a cut list; the shop
    notes. Then render every page to PNG (`pdftoppm -r 110 -png plans.pdf pg`) and look at
    each one: overlapping labels, a missing depth, a feature with no dimension, or a part
    drawn out of true shape is a defect to fix before delivery.
13. **Deliver.** The plan set first. With it: the STEP file, the generator source, the shop
    sheet (Markdown) and 1:1 templates (`geometry.layout_lengths` into
    `templates.end_cut_development`, DXF and SVG) where a full-size template helps. Run the
    shop-ready checklist in `references/verification.md` and report each item honestly.

## Reporting rules

- Never deliver a model or a cut list in place of plans. If a plan set cannot be produced,
  say so plainly and say what is missing.
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
  traditions map to it, plan sets (what each sheet must show), 1:1 printing. Read before
  modeling.
- `references/shop-envelope.md` — what each tool can make, saw-settings math, choosing the
  face that goes down, mirrored parts, fixtures. Read before producing shop data.
- `references/joinery.md` — ordinary joints (mortise and tenon, dovetail, lap, scarf,
  housing) drafted by the same rules, with default proportions and their sources.
- `references/jigs.md` — machines on file, jig safety rules, jig types and their math,
  modeling a jig against the blade. Read before designing any jig or fixture.
- `references/worked-examples.md` — the nine runnable examples (five joints, four jigs),
  what each proves, and the numbers they must reproduce.
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
