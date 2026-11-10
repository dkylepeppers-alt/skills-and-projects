"""Map canvases: child placement and schematic SVG backgrounds.

Every canvas is a 100x100 square, north up. A block (x, y, w, h) is drawn on
the background and its centre becomes the child's `placement`, so markers and
art cannot drift apart.
"""

import re

FONT = "DejaVu Sans, Roboto, sans-serif"

# palettes
LAND, FOREST, WATER, TOWN = "#E8E2D0", "#C9D8B4", "#9EC4D6", "#D9CFB8"
ROAD, ROAD_EDGE, HWY = "#FFFFFF", "#B5AD9A", "#F0BE4A"
INK, MUTED = "#3A4250", "#7A7F87"
PAGE, FLOOR, TILE, GRASS, PAVE, DECK = "#F4F0E6", "#E6CFA8", "#DCE6E8", "#CFE0BC", "#D8D5CC", "#D2B48C"


def rect(x, y, w, h, fill, stroke="none", sw=0, rx=0, extra=""):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="{sw}" {extra}/>'


def line(pts, color, width, dash=None, cap="round"):
    d = " ".join(f"{x},{y}" for x, y in pts)
    da = f' stroke-dasharray="{dash}"' if dash else ""
    return f'<polyline points="{d}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="{cap}" stroke-linejoin="round"{da}/>'


def road(pts, width=1.6, color=ROAD):
    return line(pts, ROAD_EDGE, width + 0.6) + line(pts, color, width)


def highway(pts):
    return line(pts, "#8C6D1F", 3.0) + line(pts, HWY, 2.2) + line(pts, "#FFFFFF", 0.25, dash="1.5 1.5", cap="butt")


def text(x, y, s, size=2.2, fill=INK, weight=600, anchor="middle", spacing=0.12, italic=False, rot=None):
    st = ' font-style="italic"' if italic else ""
    tr = f' transform="rotate({rot} {x} {y})"' if rot is not None else ""
    s = s.replace("&", "&amp;")
    return (f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}" letter-spacing="{spacing}"{st}{tr}>{s}</text>')


def blob(cx, cy, rx, ry, fill, opacity=1):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}" opacity="{opacity}"/>'


def trees(points, r=1.6):
    return "".join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#9DBB84" stroke="#7FA067" stroke-width="0.25"/>' for x, y in points)


def compass(x=92, y=9):
    return (f'<g><circle cx="{x}" cy="{y}" r="4" fill="#FFFFFF" opacity="0.8" stroke="{MUTED}" stroke-width="0.25"/>'
            f'<path d="M{x} {y-3.2} L{x+1.1} {y+0.6} L{x} {y} L{x-1.1} {y+0.6} Z" fill="{INK}"/>'
            + text(x, y + 3.1, "N", 1.6, INK, 700) + "</g>")


def title(s, sub=None):
    width = max(len(s) * 2.35, len(sub or "") * 0.98) + 5
    out = '<g data-title="1">' + rect(2, 2, round(width, 1), 9.2 if sub else 6.4, "#FFFFFF", MUTED, 0.2, 1.2, 'opacity="0.86"')
    out += text(4, 6.2, s.upper(), 2.6, INK, 700, "start", 0.35)
    if sub:
        out += text(4, 9.3, sub, 1.7, MUTED, 500, "start", 0.1, italic=True)
    return out + "</g>"


# block styles for plan canvases ------------------------------------------------
def room(x, y, w, h, label, fill=FLOOR):
    size = round(min(1.55, (w - 2.5) / (len(label) * 0.92)), 2)
    return (rect(x, y, w, h, fill, INK, 0.7)
            + text(x + w / 2, y + 3.4, label.upper(), size, "#5B4A30" if fill == FLOOR else INK, 700, spacing=0.22))


def area(x, y, w, h, label, fill=GRASS, stroke="#9DB389"):
    return (rect(x, y, w, h, fill, stroke, 0.3, rx=1.2)
            + text(x + w / 2, y + 3.4, label.upper(), 1.5, "#4E6B3A" if fill == GRASS else "#5A5A5A", 700, spacing=0.22))


def site(x, y, w, h, label, fill="#FFFFFF", stroke=INK, size=1.7):
    """Building footprint on a geographic canvas; label sits above the block."""
    return (rect(x, y, w, h, fill, stroke, 0.45, rx=0.8)
            + text(x + w / 2, y - 1.2, label, size, INK, 700))


def door(x, y, horizontal=True):
    return rect(x - 1.6, y - 0.45, 3.2, 0.9, PAGE) if horizontal else rect(x - 0.45, y - 1.6, 0.9, 3.2, PAGE)


# --------------------------------------------------------------------------
# Canvases. blocks: child id -> (x, y, w, h, drawer, label)
# --------------------------------------------------------------------------
M = {}

# Region --------------------------------------------------------------------
M["setx"] = dict(
    base=[
        rect(0, 0, 100, 100, LAND),
        blob(50, 20, 34, 16, FOREST, 0.85), blob(60, 78, 30, 14, FOREST, 0.7), blob(12, 88, 16, 10, FOREST, 0.5),
        # Neches (north to south-east, then the lake) and Sabine
        line([(31, 0), (32, 18), (29, 34), (33, 48), (38, 62), (46, 78), (52, 100)], WATER, 2.6),
        line([(95, 0), (93, 22), (95, 44), (92, 66), (90, 84), (86, 100)], WATER, 2.8),
        blob(70, 97, 26, 7, WATER),
        text(69, 97.5, "Sabine Lake", 1.8, "#4F7F95", 600, italic=True),
        text(27, 30, "Neches River", 1.7, "#4F7F95", 600, italic=True, rot=-85),
        text(97.3, 30, "Sabine River", 1.7, "#4F7F95", 600, italic=True, rot=88),
        text(98.6, 60, "LOUISIANA", 1.6, MUTED, 700, spacing=0.4, rot=90),
        road([(50, 46), (50, 22), (51, 6)], 1.0),
        text(52.5, 15, "FM 105", 1.3, MUTED, 600, "start"),
        road([(16, 47), (15, 66), (20, 84)], 1.0),
        title("Golden Triangle", "Southeast Texas · schematic, not to scale"), compass(),
    ],
    blocks={
        "beaumont": (6, 38, 22, 24, lambda x, y, w, h, l: blob(x + w / 2, y + h / 2, w / 2, h / 2, TOWN) + text(x + w / 2, y + h - 1, l.upper(), 2.3, INK, 700, spacing=0.4), "Beaumont"),
        "setx.i10": (29, 41, 8, 8, lambda x, y, w, h, l: text(x + w / 2, y + h + 4.4, "Neches bridge", 1.5, MUTED, 600, italic=True), ""),
        "vidor": (41, 33, 18, 20, lambda x, y, w, h, l: blob(x + w / 2, y + h / 2, w / 2, h / 2, TOWN) + text(x + w / 2, y - 1.2, l.upper(), 2.3, INK, 700, spacing=0.4), "Vidor"),
        "orange": (74, 28, 18, 22, lambda x, y, w, h, l: blob(x + w / 2, y + h / 2, w / 2, h / 2, TOWN) + text(x + w / 2, y + h + 3.2, l.upper(), 2.3, INK, 700, spacing=0.4), "Orange"),
    },
    over=[highway([(0, 50), (16, 47), (31, 45), (50, 46), (70, 43), (84, 40), (100, 37)]),
          text(66.5, 41.6, "INTERSTATE 10", 1.5, "#7A5E12", 700, spacing=0.35, rot=-8)],
)

# Vidor ---------------------------------------------------------------------
M["vidor"] = dict(
    base=[
        rect(0, 0, 100, 100, LAND),
        blob(78, 10, 30, 14, FOREST, 0.9), blob(8, 12, 16, 16, FOREST, 0.6), blob(90, 68, 16, 14, FOREST, 0.9), blob(10, 64, 14, 18, FOREST, 0.4),
        highway([(0, 86), (30, 85), (60, 84), (100, 80)]),
        text(4, 90.5, "INTERSTATE 10  ·  Beaumont west", 1.5, "#7A5E12", 700, "start", 0.25), text(96, 86.6, "Orange east", 1.5, "#7A5E12", 700, "end", 0.25),
        road([(50, 100), (50, 84), (50, 50), (51, 20), (52, 0)], 1.8),
        text(53.4, 24, "MAIN STREET · FM 105", 1.4, MUTED, 700, "start", 0.25, rot=90),
        road([(50, 44), (36, 44), (24, 40)], 1.1), road([(24, 40), (24, 28)], 1.1),
        road([(50, 52), (64, 52)], 1.1), road([(50, 74), (62, 74)], 1.1),
        road([(51, 20), (64, 16), (74, 14)], 1.1), road([(60, 84), (78, 78), (86, 70)], 1.0),
        title("Vidor", "Orange County, Texas · schematic"), compass(),
    ],
    blocks={
        "vidor.street": (14, 14, 20, 16, lambda x, y, w, h, l: rect(x, y, w, h, "#EDE6D2", ROAD_EDGE, 0.3, 1.5) + "".join(rect(x + 2 + i * 4.4, y + 3 + j * 6, 3.2, 3.6, "#FFFFFF", MUTED, 0.2) for i in range(4) for j in range(2)) + text(x + w / 2, y - 1.2, l, 1.7, INK, 700), "The Thompsons' Street"),
        "vidor.high": (26, 46, 14, 9, site, "Vidor High School"),
        "vidor.main": (46, 60, 8, 8, lambda *a: "", ""),
        "vidor.church": (62, 47, 9, 8, site, "Family Church"),
        "vidor.market": (60, 68, 13, 9, site, "Market Basket"),
        "vidor.park": (82, 60, 14, 14, lambda x, y, w, h, l: rect(x, y, w, h, "#BBD4A2", "#8FB077", 0.3, 2) + blob(x + 5, y + 9, 2.4, 1.5, WATER) + text(x + w / 2, y - 1.2, l, 1.7, INK, 700), "Claiborne West Park"),
        "macy.home": (70, 9, 10, 8, site, "Macy's House"),
    },
)

# The Thompsons' street -------------------------------------------------------
def _lot(x, y, w, h, l, hi=True):
    return (rect(x, y, w, h, GRASS, "#8B7A55", 0.35)
            + rect(x + w * 0.22, y + h * 0.2, w * 0.3, h * 0.6, "#5C6470" if hi else "#A7ABB2")
            + (text(x + w / 2, y - 1.2, l, 1.8, INK, 700) if l else ""))


M["vidor.street"] = dict(
    base=[
        rect(0, 0, 100, 100, "#DDE5CD"),
        road([(30, 0), (30, 92)], 5.5, "#BFC1C4"), line([(30, 0), (30, 92)], "#FFFFFF", 0.25, dash="2 2", cap="butt"),
        road([(0, 93), (100, 93)], 4.0, "#BFC1C4"),
        text(27, 46, "THE THOMPSONS' STREET", 1.6, MUTED, 700, spacing=0.3, rot=-90),
        text(70, 97.6, "feeder road to Main Street", 1.5, MUTED, 600, italic=True),
        # neighbours (unmapped)
        _lot(36, 36, 44, 12, "", False), _lot(36, 51, 44, 12, "", False),
        _lot(2, 12, 22, 14, "", False), _lot(2, 30, 22, 14, "", False), _lot(2, 48, 22, 14, "", False), _lot(2, 66, 22, 14, "", False),
        text(58, 43, "neighbors", 1.4, MUTED, 500, italic=True), text(58, 58, "neighbors", 1.4, MUTED, 500, italic=True),
        trees([(84, 8), (90, 30), (86, 52), (92, 70), (18, 88)]),
        title("The Thompsons' Street", "Vidor subdivision · street west of the lots"), compass(),
    ],
    blocks={
        "thompson.property": (36, 14, 48, 18, lambda x, y, w, h, l: _lot(x, y, w, h, l) + rect(x + w * 0.58, y + h * 0.3, w * 0.09, h * 0.42, WATER) + rect(x + w * 0.86, y + h * 0.55, w * 0.08, h * 0.3, "#5E8C6A"), "Thompson Property"),
        "raelynn.property": (36, 68, 40, 14, _lot, "Raelynn's Place"),
        "vidor.street.entrance": (25, 88, 10, 10, lambda x, y, w, h, l: rect(x + 8.5, y - 2.5, 5, 2, "#B5654A", INK, 0.2) + text(x + 22, y + 2.2, "", 1.5), "Subdivision Entrance"),
    },
)

# Raelynn's lot ----------------------------------------------------------------
M["raelynn.property"] = dict(
    base=[
        rect(0, 0, 100, 100, PAGE),
        rect(0, 12, 8, 76, "#BFC1C4"), text(4, 52, "STREET", 1.5, "#FFFFFF", 700, spacing=0.3, rot=-90),
        rect(8, 12, 88, 76, GRASS, "#8B7A55", 0.5),
        line([(34, 12), (96, 12), (96, 88), (34, 88)], "#8B6B43", 0.9, dash="2.2 0.8", cap="butt"),
        trees([(88, 22), (84, 26)], 3.2), rect(84, 70, 8, 10, "#A68B67", INK, 0.3), text(88, 76, "shed", 1.3, "#FFFFFF", 600),
        title("Raelynn's Place", "Fenced lot · a few houses south of the Thompsons"), compass(),
    ],
    blocks={
        "raelynn.front": (10, 30, 22, 44, lambda x, y, w, h, l: rect(x + 2, y + 22, w, 14, PAVE, MUTED, 0.2) + text(x + w / 2 + 1, y + 6, "FRONT YARD", 1.5, "#4E6B3A", 700, spacing=0.22) + text(x + w / 2 + 2, y + 30, "DRIVEWAY", 1.4, "#5A5A5A", 700, spacing=0.22), ""),
        "raelynn.house": (34, 28, 28, 46, lambda x, y, w, h, l: rect(x, y, w, h, "#6B7280", INK, 0.6) + text(x + w / 2, y + 5, "HOUSE", 1.7, "#FFFFFF", 700, spacing=0.3), ""),
        "raelynn.porch": (62, 34, 9, 30, lambda x, y, w, h, l: rect(x, y, w, h, DECK, INK, 0.4) + text(x + w / 2, y + h + 2.6, "PORCH", 1.4, "#5B4A30", 700, spacing=0.22), ""),
        "raelynn.yard": (73, 30, 20, 40, lambda x, y, w, h, l: text(x + w / 2, y + 6, "BACKYARD", 1.5, "#4E6B3A", 700, spacing=0.22), ""),
    },
)

# Raelynn's house plan (front door west, back door east) ------------------------
M["raelynn.house"] = dict(
    base=[rect(0, 0, 100, 100, PAGE), rect(9, 13, 82, 78, INK),
          title("Raelynn's House", "Single story · front door west, back door east"), compass()],
    blocks={
        "raelynn.living": (10, 14, 38, 38, room, "Living Room"),
        "raelynn.kitchen": (48, 14, 42, 30, room, "Kitchen"),
        "raelynn.hall": (48, 44, 22, 16, room, "Hall"),
        "raelynn.laundry": (70, 44, 20, 16, lambda x, y, w, h, l: room(x, y, w, h, l, TILE), "Laundry"),
        "raelynn.kenna": (10, 52, 38, 38, room, "Kenna's Room"),
        "raelynn.bath": (48, 60, 16, 30, lambda x, y, w, h, l: room(x, y, w, h, l, TILE), "Bath"),
        "raelynn.bedroom": (64, 60, 26, 30, room, "Raelynn's Bedroom"),
    },
    over=[door(10, 33, False), door(90, 30, False), door(48, 30, False), door(48, 48, False), door(40, 52), door(56, 60), door(72, 60), door(78, 44),
          text(6, 34, "front", 1.3, MUTED, 600, italic=True, rot=-90), text(95, 31, "porch", 1.3, MUTED, 600, italic=True, rot=90)],
)

# Macy's ------------------------------------------------------------------------
M["macy.home"] = dict(
    base=[
        rect(0, 0, 100, 100, "#DDE5CD"),
        rect(0, 0, 100, 9, "#B9CFA0"), trees([(6 + i * 8.2, 5 + (i % 2) * 2) for i in range(12)], 3.4),
        trees([(8, 30), (10, 52), (90, 40), (92, 62)], 3),
        road([(0, 94), (100, 94)], 3.6, "#BFC1C4"), text(78, 98.3, "two-lane road", 1.4, MUTED, 600, italic=True),
        rect(22, 23, 61, 47, INK),
        title("Macy's House", "Wooded edge of Vidor · tree line north and west"), compass(92, 16),
    ],
    blocks={
        "macy.deck": (38, 11, 26, 12, lambda x, y, w, h, l: rect(x, y, w, h, DECK, INK, 0.4) + text(x + w / 2, y + 3.4, "BACK DECK", 1.5, "#5B4A30", 700, spacing=0.22), ""),
        "macy.kitchen": (23, 24, 30, 20, room, "Kitchen"),
        "macy.bedroom": (53, 24, 29, 22, room, "Macy's Bedroom"),
        "macy.living": (23, 44, 30, 25, room, "Living Room"),
        "macy.bath": (53, 46, 12, 23, lambda x, y, w, h, l: room(x, y, w, h, l, TILE), "Bath"),
        "macy.brody": (65, 46, 17, 23, room, "Brody's Room"),
        "macy.porch": (23, 70, 34, 8, lambda x, y, w, h, l: rect(x, y, w, h, DECK, INK, 0.4) + text(x + w / 2, y + 3.4, "FRONT PORCH", 1.5, "#5B4A30", 700, spacing=0.22), ""),
        "macy.drive": (6, 76, 14, 16, lambda x, y, w, h, l: rect(x, y, w, h + 2, PAVE, MUTED, 0.2) + text(x + w / 2, y + 3.4, "DRIVE", 1.5, "#5A5A5A", 700, spacing=0.22), ""),
    },
    over=[door(46, 24), door(38, 44), door(53, 56, False), door(38, 69), door(60, 46), door(72, 46)],
)

# Orange ------------------------------------------------------------------------
M["orange"] = dict(
    base=[
        rect(0, 0, 100, 100, LAND),
        blob(20, 84, 24, 14, FOREST, 0.7), blob(78, 94, 16, 8, "#B7D0C0", 0.9),
        line([(92, 0), (90, 26), (93, 50), (89, 74), (86, 100)], WATER, 5.5),
        line([(64, 100), (70, 92), (78, 88), (89, 84)], WATER, 1.2), text(76, 95, "bayou", 1.4, "#4F7F95", 600, italic=True),
        text(96.6, 36, "SABINE RIVER", 1.5, "#4F7F95", 700, spacing=0.3, rot=90), text(99, 70, "LOUISIANA", 1.3, MUTED, 700, spacing=0.3, rot=90),
        highway([(0, 22), (40, 20), (70, 17), (100, 12)]), text(4, 17.6, "INTERSTATE 10  ·  Vidor west", 1.5, "#7A5E12", 700, "start", 0.25),
        road([(46, 20), (48, 44), (60, 58), (80, 62)], 1.5), road([(48, 44), (30, 46)], 1.1), road([(60, 58), (58, 78)], 1.1),
        rect(70, 50, 14, 22, TOWN, ROAD_EDGE, 0.3, 1.5), text(77, 48.6, "downtown", 1.5, MUTED, 600, italic=True),
        title("Orange", "County seat on the Sabine · schematic"), compass(8, 92),
    ],
    blocks={
        "lacy.home": (22, 40, 12, 10, site, "Lacy's House"),
        "ashton.home": (50, 77, 12, 9, site, "Ashton's House"),
        "orange.riverfront": (80, 56, 8, 12, lambda x, y, w, h, l: rect(x, y, w, h, "#C9B38C", INK, 0.3, 0.6) + text(x - 1, y + h + 3, "Riverfront", 1.6, INK, 700), ""),
    },
)

# Lacy's -------------------------------------------------------------------------
M["lacy.home"] = dict(
    base=[
        rect(0, 0, 100, 100, "#DDE5CD"),
        rect(18, 15, 16, 2.4, "#7FA067", rx=1.2), rect(66, 15, 16, 2.4, "#7FA067", rx=1.2),
        rect(17, 21, 66, 55, INK),
        f'<path d="M30 100 C30 84 70 84 70 100" fill="none" stroke="{PAVE}" stroke-width="7"/>',
        trees([(8, 30), (92, 30), (8, 64), (92, 64)], 3.2),
        title("Lacy's House", "Orange · front entry south"), compass(92, 16),
    ],
    blocks={
        "lacy.patio": (36, 9, 28, 12, lambda x, y, w, h, l: rect(x, y, w, h, "#D9D2C2", INK, 0.4) + text(x + w / 2, y + 3.4, "BACK PATIO", 1.5, "#5A5A5A", 700, spacing=0.22), ""),
        "lacy.mason": (18, 22, 22, 23, room, "Mason's Room"),
        "lacy.great": (40, 22, 24, 53, lambda x, y, w, h, l: room(x, y, w, h, l, "#E9DCC2"), "Great Room"),
        "lacy.suite": (64, 22, 18, 28, room, "Lacy's Bedroom"),
        "lacy.bath": (64, 50, 18, 25, lambda x, y, w, h, l: room(x, y, w, h, l, TILE), "Bath"),
        "lacy.kitchen": (18, 45, 22, 30, lambda x, y, w, h, l: room(x, y, w, h, l, "#E4E1DA"), "Kitchen"),
        "lacy.drive": (40, 80, 20, 12, lambda x, y, w, h, l: text(x + w / 2, y + 3, "FRONT ENTRY", 1.5, "#5A5A5A", 700, spacing=0.22), ""),
    },
    over=[door(52, 22), door(52, 75), door(40, 34, False), door(40, 60, False), door(64, 36, False), door(73, 50)],
)

# Ashton's -----------------------------------------------------------------------
M["ashton.home"] = dict(
    base=[
        rect(0, 0, 100, 100, "#DDE5CD"),
        blob(50, 2, 60, 7, "#B7D0C0"), text(50, 4.6, "cypress and standing water", 1.4, "#4F7F95", 600, italic=True),
        rect(14, 21, 72, 55, INK),
        rect(44, 76, 12, 24, "#E6DFCB", MUTED, 0.2),
        trees([(22, 88), (80, 86)], 6),
        title("Ashton's House", "Orange, river side · front door south"), compass(92, 16),
    ],
    blocks={
        "ashton.porch": (30, 9, 40, 12, lambda x, y, w, h, l: rect(x, y, w, h, "#CFC7B2", INK, 0.4, extra='stroke-dasharray="0.8 0.6"') + text(x + w / 2, y + 3.4, "SCREENED PORCH", 1.5, "#5A5A5A", 700, spacing=0.22), ""),
        "ashton.beau": (15, 22, 28, 24, room, "Beau's Room"),
        "ashton.hall": (43, 22, 14, 53, lambda x, y, w, h, l: room(x, y, w, h, l, "#EBDDBF"), "Hall"),
        "ashton.bedroom": (57, 22, 28, 24, room, "Ashton's Bedroom"),
        "ashton.living": (15, 46, 28, 29, room, "Living Room"),
        "ashton.kitchen": (57, 46, 28, 29, room, "Kitchen"),
        "ashton.drive": (40, 80, 20, 14, lambda x, y, w, h, l: text(x + w / 2, y + 12, "DRIVE", 1.5, "#5A5A5A", 700, spacing=0.22), ""),
    },
    over=[door(43, 34, False), door(57, 34, False), door(43, 60, False), door(57, 60, False), door(29, 75), door(71, 22)],
)

# Beaumont -----------------------------------------------------------------------
M["beaumont"] = dict(
    base=[
        rect(0, 0, 100, 100, LAND), rect(8, 14, 70, 78, "#E2DAC4", "none", 0, 4),
        line([(84, 0), (88, 18), (82, 34), (90, 52), (94, 72), (100, 84)], WATER, 6),
        text(93.5, 30, "NECHES RIVER", 1.5, "#4F7F95", 700, spacing=0.3, rot=78),
        highway([(0, 30), (30, 26), (60, 22), (84, 14), (100, 8)]), text(8, 24.4, "INTERSTATE 10", 1.5, "#7A5E12", 700, "start", 0.3),
        text(90, 7.4, "to Vidor", 1.5, "#7A5E12", 700, italic=True),
        road([(40, 26), (40, 60), (38, 96)], 1.8), text(42.4, 29, "MLK JR. PARKWAY", 1.4, MUTED, 700, "start", 0.25, rot=90),
        road([(40, 40), (64, 38)], 1.1), road([(40, 60), (66, 62)], 1.1),
        title("Beaumont", "West bank of the Neches · schematic"), compass(8, 92),
    ],
    blocks={
        "beaumont.crockett": (58, 30, 12, 10, lambda x, y, w, h, l: rect(x, y, w, h, TOWN, ROAD_EDGE, 0.3, 1) + "".join(rect(x + 1.5 + i * 3.4, y + 2, 2.4, 6, "#B5654A") for i in range(3)) + text(x + w / 2, y - 1.2, "Crockett Street", 1.7, INK, 700), ""),
        "refinery": (62, 50, 24, 24, lambda x, y, w, h, l: rect(x, y, w, h, "#CBCED3", INK, 0.4, 1) + "".join(f'<circle cx="{x + 4 + i * 5.2}" cy="{y + 6 + j * 5.5}" r="1.8" fill="#FFFFFF" stroke="{MUTED}" stroke-width="0.25"/>' for i in range(4) for j in range(2)) + rect(x + 3, y + 16, 18, 4, "#8F96A3") + text(x + w / 2, y - 1.2, "ExxonMobil Refinery", 1.7, INK, 700), ""),
        "lamar": (20, 66, 30, 20, lambda x, y, w, h, l: rect(x, y, w, h, "#D5E2C4", "#C8102E", 0.5, 1.5) + text(x + w / 2, y + 4, "Lamar University", 1.7, INK, 700), ""),
    },
)

# Lamar --------------------------------------------------------------------------
def _hall(x, y, w, h, l):
    return site(x, y, w, h, l, "#C96F5A", "#7A3A2C", 1.55)


M["lamar"] = dict(
    base=[
        rect(0, 0, 100, 100, "#DCE6CC"),
        road([(30, 0), (30, 100)], 3.4, "#BFC1C4"), text(27.2, 50, "MARTIN LUTHER KING JR. PARKWAY", 1.4, MUTED, 700, spacing=0.3, rot=-90),
        road([(30, 92), (100, 92)], 2.0, "#BFC1C4"),
        line([(52, 50), (52, 28)], "#E8DCC0", 1.1), line([(52, 50), (70, 50)], "#E8DCC0", 1.1), line([(52, 50), (48, 72)], "#E8DCC0", 1.1),
        line([(52, 50), (72, 70)], "#E8DCC0", 1.1), line([(52, 50), (80, 26)], "#E8DCC0", 1.1), line([(52, 50), (30, 62)], "#E8DCC0", 1.1),
        line([(48, 72), (46, 84)], "#E8DCC0", 1.1),
        trees([(40, 16), (62, 14), (90, 46), (40, 60), (62, 60), (90, 62), (60, 82)], 2.2),
        title("Lamar University", "Beaumont · schematic campus"), compass(10, 88),
    ],
    blocks={
        "lamar.stadium": (5, 16, 18, 26, lambda x, y, w, h, l: f'<ellipse cx="{x + w / 2}" cy="{y + h / 2}" rx="{w / 2}" ry="{h / 2}" fill="#B8BCC4" stroke="{INK}" stroke-width="0.4"/>' + rect(x + 5, y + 5, w - 10, h - 10, "#7FB069", "#FFFFFF", 0.3) + text(x + w / 2, y - 1.2, "Provost Umphrey Stadium", 1.45, INK, 700), ""),
        "lamar.montagne": (6, 56, 16, 16, lambda x, y, w, h, l: f'<circle cx="{x + w / 2}" cy="{y + h / 2}" r="{w / 2}" fill="#C96F5A" stroke="#7A3A2C" stroke-width="0.45"/>' + text(x + w / 2, y - 1.2, "Montagne Center", 1.55, INK, 700), ""),
        "lamar.library": (46, 20, 12, 12, _hall, "Gray Library"),
        "lamar.quad": (44, 42, 16, 16, lambda x, y, w, h, l: rect(x, y, w, h, "#C3D9A8", "#8FB077", 0.3, 3) + text(x + w / 2, y + h + 2.6, "Quad", 1.55, "#4E6B3A", 700), ""),
        "lamar.ssc": (66, 44, 14, 11, _hall, "Setzer Student Center"),
        "lamar.village": (72, 14, 20, 18, lambda x, y, w, h, l: "".join(rect(x + dx, y + dy, 7.5, 6.5, "#C96F5A", "#7A3A2C", 0.4, 0.6) for dx, dy in ((0, 0), (12, 0), (0, 11), (12, 11))) + text(x + w / 2, y - 1.2, "Cardinal Village", 1.55, INK, 700), ""),
        "lamar.dining": (66, 66, 14, 9, _hall, "Brooks-Shivers Dining"),
        "lamar.rec": (40, 68, 14, 9, _hall, "Rec Sports Center"),
        "lamar.parking": (36, 80, 24, 9, lambda x, y, w, h, l: rect(x, y, w, h, "#C9CBCF", MUTED, 0.3) + "".join(line([(x + 2 + i * 2.2, y + 1), (x + 2 + i * 2.2, y + h - 1)], "#FFFFFF", 0.2, cap="butt") for i in range(10)) + text(x + w + 1.5, y + 5.4, "Student Parking", 1.55, INK, 700, "start"), ""),
    },
)

M["lamar.village"] = dict(
    base=[
        rect(0, 0, 100, 100, "#DCE6CC"),
        rect(30, 30, 40, 44, "#E7DFCB", ROAD_EDGE, 0.3, 2),
        rect(57, 54, 10, 14, "#E9D9A8", "#B59F62", 0.3), text(62, 71, "volleyball", 1.3, MUTED, 600, italic=True),
        rect(46, 12, 20, 12, "#D7A99C", "#7A3A2C", 0.35, 0.8), rect(40, 82, 20, 13, "#D7A99C", "#7A3A2C", 0.35, 0.8),
        text(56, 18.8, "other halls", 1.4, "#7A3A2C", 600, italic=True), text(50, 89.6, "other halls", 1.4, "#7A3A2C", 600, italic=True),
        line([(50, 74), (50, 82)], "#E8DCC0", 1.2), line([(30, 96), (0, 100)], "#E8DCC0", 1.2),
        text(14, 96, "to dining hall and quad", 1.4, MUTED, 600, italic=True),
        trees([(34, 34), (66, 34), (34, 70)], 2.2),
        title("Cardinal Village", "Lamar residence halls · keycard entry"), compass(),
    ],
    blocks={
        "lamar.morris": (6, 30, 20, 40, lambda x, y, w, h, l: rect(x, y, w, h, "#C96F5A", "#7A3A2C", 0.5, 0.8) + text(x + w / 2, y - 1.4, "Morris Hall", 1.9, INK, 700) + text(x + w / 2, y + h + 2.8, "Jennifer & Melissa", 1.4, MUTED, 600, italic=True), ""),
        "lamar.village.courtyard": (40, 40, 20, 16, lambda x, y, w, h, l: text(x + w / 2, y - 3, "COURTYARD", 1.6, "#6B6350", 700, spacing=0.3), ""),
        "lamar.combs": (74, 30, 20, 40, lambda x, y, w, h, l: rect(x, y, w, h, "#C96F5A", "#7A3A2C", 0.5, 0.8) + text(x + w / 2, y - 1.4, "Combs Hall", 1.9, INK, 700) + text(x + w / 2, y + h + 2.8, "Kenna", 1.4, MUTED, 600, italic=True), ""),
    },
)

# Refinery -----------------------------------------------------------------------
def _tank_farm(x, y, w, h, l):
    out = rect(x, y, w, h, "#D9D3C0", "#A89F86", 0.3, 1)
    out += "".join(f'<circle cx="{x + 4.6 + i * 6.2}" cy="{y + 4.8 + j * 7.4}" r="2.5" fill="#FFFFFF" stroke="{MUTED}" stroke-width="0.3"/>' for i in range(5) for j in range(2))
    return out + text(x + w / 2, y - 1.2, "Tank Farm", 1.6, INK, 700)


def _units(x, y, w, h, l):
    out = rect(x, y, w, h, "#C3C7CE", INK, 0.35, 0.8)
    out += "".join(line([(x + 2, y + 4 + i * 4.4), (x + w - 2, y + 4 + i * 4.4)], "#8F96A3", 0.7, cap="butt") for i in range(5))
    out += "".join(f'<circle cx="{x + 5 + i * 6.5}" cy="{y + 6.2 + (i % 2) * 8.8}" r="1.5" fill="#E8743B" opacity="0.85"/>' for i in range(4))
    return out + text(x + w / 2, y - 1.2, "Process Units & Pipe Alley", 1.6, INK, 700)


def _pb(x, y, w, h, l):
    return site(x, y, w, h, l, "#EEF0F3", INK, 1.5)


M["refinery"] = dict(
    base=[
        rect(0, 0, 100, 100, "#E3E0D6"),
        f'<path d="M62 0 C70 10 86 12 100 26 L100 0 Z" fill="{WATER}"/>', line([(60, 0), (70, 11), (86, 14), (100, 28)], "#7FAEC4", 0.5),
        text(88, 7, "NECHES RIVER", 1.5, "#4F7F95", 700, spacing=0.3, rot=24),
        rect(84, 16, 9, 2.6, "#6B7280", extra='transform="rotate(34 88 17)"'),
        # security fence
        line([(22, 14), (58, 10), (70, 20), (86, 24), (96, 34), (96, 92), (22, 92), (22, 14)], "#B03A2E", 0.5, dash="1.4 0.9", cap="butt"),
        text(59, 95.4, "security fence · badge access only inside", 1.4, "#B03A2E", 600, italic=True),
        road([(0, 62), (20, 62)], 2.2, "#BFC1C4"), road([(28, 62), (60, 62), (78, 44)], 1.2, "#D2D4D8"), road([(60, 62), (60, 26)], 1.2, "#D2D4D8"),
        title("ExxonMobil Beaumont Refinery", "Schematic site plan · not a facility survey"), compass(8, 22),
    ],
    blocks={
        "refinery.parking": (2, 70, 18, 20, lambda x, y, w, h, l: rect(x, y, w, h, "#C9CBCF", MUTED, 0.3) + "".join(line([(x + 1.5, y + 3 + i * 3.4), (x + w - 1.5, y + 3 + i * 3.4)], "#FFFFFF", 0.2, cap="butt") for i in range(5)) + text(x + w / 2, y - 1.2, "Employee Lot", 1.5, INK, 700), ""),
        "refinery.gate": (19, 57, 9, 10, lambda x, y, w, h, l: rect(x, y, w, h, "#F0BE4A", INK, 0.45, 0.8) + text(x + w / 2, y - 1.2, "Main Gate", 1.5, INK, 700), ""),
        "refinery.admin": (30, 40, 14, 9, _pb, "Administration"),
        "refinery.change": (30, 68, 13, 9, _pb, "Change House"),
        "refinery.break": (46, 74, 11, 8, _pb, "Break Room"),
        "refinery.office": (44, 52, 12, 8, lambda x, y, w, h, l: site(x, y, w, h, "Shift Supervisor", "#FFE9B8", INK, 1.5), ""),
        "refinery.control": (62, 32, 13, 9, _pb, "Control Room"),
        "refinery.units": (64, 54, 28, 26, _units, ""),
        "refinery.tanks": (26, 17, 34, 17, _tank_farm, ""),
        "refinery.docks": (78, 26, 14, 9, lambda x, y, w, h, l: rect(x, y, w, h, "#B9A27C", INK, 0.35, 0.6) + text(x + w / 2, y + h + 2.6, "River Docks", 1.5, INK, 700), ""),
    },
)


def svg_for(parent_id):
    m = M[parent_id]
    parts = list(m["base"])
    for cid, (x, y, w, h, drawer, label) in m["blocks"].items():
        parts.append(drawer(x, y, w, h, label))
    parts += m.get("over", [])
    titles = [p for p in parts if 'data-title="1"' in p]
    parts = [p for p in parts if p not in titles] + titles
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="1254" height="1254">'
            + "".join(parts) + "</svg>")


def placements(parent_id):
    return {cid: {"x": round(x + w / 2, 1), "y": round(y + h / 2, 1)} for cid, (x, y, w, h, _, _) in M[parent_id]["blocks"].items()}
