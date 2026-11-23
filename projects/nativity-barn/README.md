# Nativity barn workshop

A miniature timber-framed barn with fully modeled mortise-and-tenon, housed
crossings, pegged braces and rafters, keyed king posts, and removable roof panels.

## Releases

| Version | Package | Geometry |
| --- | --- | --- |
| V7 | [Complete workshop ZIP](releases/v7/nativity-workshop-v7.zip) | 24 x 12 in footprint, 1-1/4 in square main posts, approximately 19.108 in overall height |

The V7 ZIP is the exact delivered workshop package. It contains:

- 116-sheet ANSI B construction drawing PDF.
- 34-sheet true-size US Letter cutting-pattern PDF.
- Named 145-component STEP assembly and uncovered frame STEP preview.
- CAD-derived renders, DXF/SVG patterns, shop settings and design brief.
- Parametric build123d 0.13+ source, bundled helpers, reproduction instructions,
  and original geometry, drawing and print validation results.

## Use and reproduce

Download the ZIP and extract it into an ignored working location such as
`projects/nativity-barn/build/v7/`. Follow the included README to reproduce
the model and drawings in a dedicated Python environment. The included source
and verification reports belong to the immutable V7 snapshot; do not overwrite
it with regenerated output. Use a new version directory for future releases.

To inspect individual members in OCP Viewer, import the assembly and show
its named children explicitly:

```python
from build123d import import_step
from ocp_viewer import show

barn = import_step("nativity_v7.step")
show(*barn.children, names=[part.label for part in barn.children])
```

The release archive is checked against
[`SHA256SUMS`](releases/v7/SHA256SUMS) by the repository validator.
