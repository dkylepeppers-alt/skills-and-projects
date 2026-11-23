"""1:1 layout templates as DXF (R12 LINE entities) and SVG. Standard library only.

Drawings are in inches. Every template carries a calibration square: measure it on the
print with a steel rule before trusting any other line.
"""
from __future__ import annotations

from pathlib import Path
from math import ceil
from xml.sax.saxutils import escape

Line = tuple[float, float, float, float]
Label = tuple[float, float, str]


def write_dxf(path: str | Path, lines: list[Line]) -> Path:
    out = ["0", "SECTION", "2", "HEADER", "9", "$INSUNITS", "70", "1", "0", "ENDSEC",
           "0", "SECTION", "2", "ENTITIES"]
    for x1, y1, x2, y2 in lines:
        out += ["0", "LINE", "8", "0", "10", f"{x1:.5f}", "20", f"{y1:.5f}", "30", "0.0",
                "11", f"{x2:.5f}", "21", f"{y2:.5f}", "31", "0.0"]
    out += ["0", "ENDSEC", "0", "EOF"]
    path = Path(path)
    path.write_text("\n".join(out) + "\n", encoding="ascii")
    return path


def write_svg(path: str | Path, lines: list[Line], labels: list[Label] = (),
              margin: float = 0.5) -> Path:
    """SVG sized in real inches (width/height in 'in', viewBox in inches)."""
    xs = [c for l in lines for c in (l[0], l[2])] + [c for x,y,t in labels for c in (x,x+.09*len(t))]
    ys = [c for l in lines for c in (l[1], l[3])] + [c for x,y,t in labels for c in (y,y+.15)]
    x0, y0 = min(xs) - margin, min(ys) - margin
    w, h = max(xs) - min(xs) + 2 * margin, max(ys) - min(ys) + 2 * margin
    top = y0 + h   # flip y so +y is up on paper

    def fy(y: float) -> float:
        return top - y + y0

    body = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.4f}in" height="{h:.4f}in" '
            f'viewBox="{x0:.4f} {y0:.4f} {w:.4f} {h:.4f}">',
            '<g stroke="black" stroke-width="0.008" fill="none">']
    body += [f'<line x1="{a:.4f}" y1="{fy(b):.4f}" x2="{c:.4f}" y2="{fy(d):.4f}"/>'
             for a, b, c, d in lines]
    body.append("</g>")
    body += [f'<text x="{x:.4f}" y="{fy(y):.4f}" font-size="0.14" font-family="sans-serif">'
             f"{escape(text)}</text>" for x, y, text in labels]
    body.append("</svg>")
    path = Path(path)
    path.write_text("\n".join(body) + "\n", encoding="utf-8")
    return path


def write_pdf(path, lines: list[Line], labels: list[Label] = (), *,
              title: str, orientation: str, page=(11.,8.5), margin=.5, overlap=.5) -> Path:
    """Actual-size, printer-ready pattern PDF (matplotlib required).

    Coordinates and page dimensions are inches. The printable field is tiled
    without scaling. Each tile has a genuine 2-inch check bar and overlapping
    registration crosses. Title identifies part; orientation states datum and grain.
    Labels must fit entirely on at least one tile; fail instead of silently clipping.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages
    if not lines or not title.strip() or not orientation.strip():
        raise ValueError("Supply geometry, part ID and datum/grain orientation")
    w,h=page
    fw,fh=w-2*margin,h-2*margin-1.1
    if margin<.25 or not 0<overlap<min(fw,fh)/2:
        raise ValueError("Invalid printable margin or tile overlap")
    # Reserve a little whitespace around geometry and include label extents.
    xs=[v for a,b,c,d in lines for v in (a,c)]+[v for x,y,t in labels for v in (x,x+.085*len(t))]
    ys=[v for a,b,c,d in lines for v in (b,d)]+[v for x,y,t in labels for v in (y-.04,y+.13)]
    x0,y0=min(xs)-.15,min(ys)-.15
    nx=max(1,ceil((max(xs)+.15-x0-overlap)/(fw-overlap)))
    ny=max(1,ceil((max(ys)+.15-y0-overlap)/(fh-overlap)))
    tiles=[(row,col,x0+col*(fw-overlap),y0+row*(fh-overlap))
           for row in range(ny) for col in range(nx)]
    for x,y,t in labels:
        if not any(a<=x and x+.085*len(t)<=a+fw and b<=y-.04 and y+.13<=b+fh
                   for _,_,a,b in tiles):
            raise ValueError(f"Pattern label crosses a tile seam: {t!r}; relocate label")
    path=Path(path)
    path.parent.mkdir(parents=True,exist_ok=True)
    with PdfPages(path) as pdf:
        for row,col,a,b in tiles:
            fig=plt.figure(figsize=(w,h))
            ax=fig.add_axes((margin/w,(margin+.6)/h,fw/w,fh/h))
            ax.set_xlim(a,a+fw); ax.set_ylim(b,b+fh); ax.set_aspect("equal"); ax.axis("off")
            for x,y,u,v in lines:
                ax.plot([x,u],[y,v],color="black",lw=.65,clip_on=True)
            for x,y,t in labels:
                if a<=x and x+.085*len(t)<=a+fw and b<=y-.04 and y+.13<=b+fh:
                    ax.text(x,y,t,fontsize=8,va="baseline",clip_on=True)
            # Identical model-space crosses in every shared overlap strip.
            markers=[]
            for xx in (a+overlap/2,a+fw-overlap/2):
                if (xx<a+fw/2 and col>0) or (xx>a+fw/2 and col<nx-1):
                    markers.extend((xx,b+yy) for yy in (overlap/2,fh/2,fh-overlap/2))
            for yy in (b+overlap/2,b+fh-overlap/2):
                if (yy<b+fh/2 and row>0) or (yy>b+fh/2 and row<ny-1):
                    markers.extend((a+xx,yy) for xx in (overlap/2,fw/2,fw-overlap/2))
            for x,y in markers:
                ax.plot([x-.08,x+.08],[y,y],color=".55",lw=.5)
                ax.plot([x,x],[y-.08,y+.08],color=".55",lw=.5)
            fig.text(margin/w,1-(margin+.1)/h,title,fontsize=11,weight="bold")
            fig.text(1-margin/w,1-(margin+.1)/h,f"ROW {row+1}/{ny}  COL {col+1}/{nx}",ha="right",fontsize=9)
            fig.text(margin/w,margin/h,orientation+" | PRINT ACTUAL SIZE / 100% | Gray crosses: register tiles",
                     fontsize=8)
            ax2=fig.add_axes((margin/w,(margin+.17)/h,2/w,.18/h))
            ax2.set_xlim(0,2); ax2.set_ylim(0,1); ax2.axis("off")
            ax2.plot([0,2],[.5,.5],color="black",lw=1,clip_on=False)
            ax2.plot([0,0],[.15,.85],color="black",lw=1,clip_on=False)
            ax2.plot([2,2],[.15,.85],color="black",lw=1,clip_on=False)
            fig.text((margin+2.14)/w,(margin+.19)/h,"2 in calibration bar",fontsize=8)
            pdf.savefig(fig); plt.close(fig)
    return path


def calibration_square(x: float, y: float, size: float = 2.0) -> tuple[list[Line], list[Label]]:
    lines = [(x, y, x + size, y), (x + size, y, x + size, y + size),
             (x + size, y + size, x, y + size), (x, y + size, x, y)]
    return lines, [(x + 0.08, y + size / 2, f"{size:g} in square: measure before use")]


def end_cut_development(lengths: dict[str, float], size_v: float, size_w: float,
                        waste_toward_plus_u: bool = True) -> tuple[list[Line], list[Label]]:
    """Four faces of a blank unfolded side by side, seen from outside, with the cut traces.

    `lengths` comes from geometry.layout_lengths: distance along each corner edge from a
    square datum line on the kept stock to the cut. y on the sheet is that distance, so the
    cut end is toward the top and waste is above each trace. x runs round the blank so the
    paper wraps the stock the right way: A-B-C-D-A when the waste is toward +u, and the
    mirror order A-D-C-B-A when it is toward -u (geometry.waste_direction).
    """
    if waste_toward_plus_u:
        order = ["A", "B", "C", "D", "A"]
        widths = [size_v, size_w, size_v, size_w]
        names = ["-w FACE", "+v FACE", "+w FACE", "-v FACE"]
    else:
        order = ["A", "D", "C", "B", "A"]
        widths = [size_w, size_v, size_w, size_v]
        names = ["-v FACE", "+w FACE", "+v FACE", "-w FACE"]
    xs = [0.0]
    for width in widths:
        xs.append(xs[-1] + width)
    ls = lengths
    if min(ls.values()) < 0:
        raise ValueError("datum is too close: a trace falls behind the datum line")
    top = max(ls.values()) + 0.5
    lines: list[Line] = [(xs[0], 0, xs[-1], 0)]                      # square datum line
    lines += [(x, 0, x, top) for x in xs]                            # arrises
    labels: list[Label] = []
    for i in range(4):
        a, b = order[i], order[i + 1]
        lines.append((xs[i], ls[a], xs[i + 1], ls[b]))               # trace on this face
        labels.append((xs[i] + 0.06, 0.12, names[i]))
        # Keep identifying text above the cutting trace, including rising
        # traces under the entire label rather than only at its first glyph.
        t=f"{a} {ls[a]:.3f}"
        slope=(ls[b]-ls[a])/widths[i]
        above=max(0,slope)*min(widths[i],.09*len(t)+.04)
        labels.append((xs[i]+.04,ls[a]+above+.16,t))
    labels.append((xs[4] - 0.75, max(.16,ls["A"]-.19), f"A {ls['A']:.3f}"))
    labels.append((xs[0] + 0.06, top + 0.12, "WASTE ABOVE THE TRACE"))
    cal_lines, cal_labels = calibration_square(xs[-1] + 0.75, 0.0)
    return lines + cal_lines, labels + cal_labels
