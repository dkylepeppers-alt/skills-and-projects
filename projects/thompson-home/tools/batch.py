"""Batch art for the Thompson Home expansion via SpicyAPI. Resumable; skips files that exist."""
import sys, pathlib, concurrent.futures as cf, json
sys.path.insert(0, "thompson-home")
import world, gen

BG = pathlib.Path("gen/background"); REF = pathlib.Path("gen/reference")
BG.mkdir(parents=True, exist_ok=True); REF.mkdir(parents=True, exist_ok=True)
SCHEM = "thompson-home/art/background/{}.png"
PLAN_STYLE, AERIAL_STYLE = "oldbg-thompson.first-floor.png", "oldbg-thompson.lot.png"
KEEP = (" Keep every road, river, wall, building and open area exactly where image 1 places it, with the same proportions and north at the top, "
        "so that map markers placed on image 1 still line up. Remove all text: no labels, no titles, no compass, no legends, no people.")
AERIAL = "Image 1 is a schematic map; image 2 shows the target photographic style. Recreate image 1 as a photorealistic straight-down drone aerial photograph in the style of image 2: humid Southeast Texas, late-afternoon light, live oaks and pines, St. Augustine lawns. "
PLAN = "Image 1 is a schematic floor plan with its yard; image 2 shows the target art style. Redraw image 1 as a photorealistic top-down architectural 3D floor-plan render in the style of image 2: orthographic overhead view, dark slate walls, furnished rooms, with the surrounding yard, drive and porch shown as a realistic aerial view. "
BACKGROUNDS = {
    "setx": (AERIAL + "Subject: a high-altitude satellite view of the region. Three towns sit where the tan ovals are, as dense street grids: a larger city on the left, a small town in the centre, a small city on the right. A wide brown river runs north-south on the left, another on the far right, with a broad lake at the bottom. One interstate highway crosses left to right through all three towns. Pine forest and coastal prairie between." + KEEP, AERIAL_STYLE),
    "vidor": (AERIAL + "Subject: a small pine-country town from high above. One main road runs top to bottom; an interstate highway crosses along the bottom. A residential subdivision upper-left, a high school with a football field left of centre, a brick church right of centre, a grocery store with a large parking lot lower-right, a wooded park with a pond at far right, one house in dense pines at upper-right." + KEEP, AERIAL_STYLE),
    "vidor.street": (AERIAL + "Subject: a quiet suburban street running top to bottom on the left, with houses on deep fenced lots on both sides. The top-right lot is a two-story brick house with a pool and a green-roofed shed behind it; the bottom-right lot is a smaller single-story house. A cross road runs along the bottom with a brick subdivision sign." + KEEP, AERIAL_STYLE),
    "raelynn.property": (AERIAL + "Subject: one modest single-story house on a fenced lot. Street on the left edge, concrete driveway and front lawn, the house roof in the centre, a covered wooden back porch on its right side, a fenced back lawn with a shade tree, clothesline and small storage shed on the right." + KEEP, AERIAL_STYLE),
    "macy.home": (PLAN + "Kitchen top-left with a west window, bedroom top-right, living room bottom-left, small bathroom and a teenager's bedroom bottom-right. Wooden back deck above the house, covered front porch with a swing below it, driveway at bottom-left, a two-lane road along the bottom, dense pine tree line along the top." + KEEP, PLAN_STYLE),
    "orange": (AERIAL + "Subject: a small river city from high above. A wide brown river runs down the right edge with forest on its far bank. An interstate highway crosses near the top. A compact brick downtown with a riverfront boardwalk at right-centre, one large upscale house in a leafy neighbourhood at left-centre, one house under live oaks at bottom-centre near a cypress bayou." + KEEP, AERIAL_STYLE),
    "lacy.home": (PLAN + "An upscale house: teenager's bedroom top-left, a tall great room down the centre, primary bedroom top-right, primary bathroom with a soaking tub bottom-right, kitchen with a marble island bottom-left. Covered back patio above the house, hedges, a curved driveway to the front door at the bottom." + KEEP, PLAN_STYLE),
    "ashton.home": (PLAN + "A single-story house: teenager's bedroom top-left, a central hallway with a long mirror, bedroom top-right, living room with a ceiling fan bottom-left, kitchen with an island bottom-right. Screened back porch above the house facing cypress and still water at the top edge, shell-gravel driveway at the bottom between two large live oaks." + KEEP, PLAN_STYLE),
    "beaumont": (AERIAL + "Subject: a mid-sized Gulf Coast city from high above. A wide brown river runs down the right side. An interstate highway crosses the upper part. A parkway runs top to bottom left of centre. A small historic brick entertainment district upper-right of centre, a large oil refinery with white storage tanks beside the river at right-centre, a university campus with red-brick buildings and lawns at lower-left." + KEEP, AERIAL_STYLE),
    "lamar": (AERIAL + "Subject: a university campus. A wide parkway runs top to bottom on the left. West of it, a football stadium at upper-left and a round arena at lower-left. East of it, red-brick buildings around a central oak-shaded lawn: a tall library above the lawn, a student centre to its right, four brick residence halls at upper-right, a dining hall at lower-right, a recreation centre below the lawn, a large parking lot at the bottom." + KEEP, AERIAL_STYLE),
    "lamar.village": (AERIAL + "Subject: a cluster of four-story red-brick university residence halls around a paved courtyard. A long hall on the left, a matching hall on the right, smaller halls top and bottom. The courtyard has benches, bike racks, small trees and a sand volleyball court." + KEEP, AERIAL_STYLE),
    "refinery": (AERIAL + "Subject: a large oil refinery beside a wide brown river at the upper-right. A fenced site: rows of white storage tanks at the top, a ship dock on the river, a dense process area of towers and pipe racks at right, low office and control buildings in the centre, a guarded gate on the left edge with a road in, a large gravel employee parking lot outside the fence at lower-left." + KEEP, AERIAL_STYLE),
}

INT = "Image 1 is a style reference only: match its ultra-photorealistic look, neutral daylight and true-to-life textures, but do not reproduce its room. Create one new reusable environment photograph, landscape 3:2, eye-level wide shot. "
EXT = "Image 1 is a style reference only: match its ultra-photorealistic look, humid Southeast Texas light and true-to-life textures, but do not reproduce its house. Create one new reusable environment photograph, landscape 3:2, eye-level wide shot. "
END = " The place is empty: no people, no animals in focus, no readable text, no logos, no watermarks."
FLAVOR = {
    "plant": "Setting: a Gulf Coast oil refinery. ", "plant-area": "Setting: inside a Gulf Coast oil refinery. ", "plant-building": "Setting: a utilitarian building at a Gulf Coast oil refinery. ",
    "campus": "Setting: a red-brick Texas university campus under live oaks. ", "campus-hall": "Setting: a red-brick Texas university building. ",
    "dorm": "Setting: a four-story red-brick university residence hall. ", "dorm-floor": "Setting: inside a university residence hall. ",
    "home": "Setting: a family home in small-town Southeast Texas, seen from the front yard. ", "civic": "Setting: small-town Southeast Texas. ",
    "venue": "Setting: Southeast Texas. ", "road": "Setting: Southeast Texas, seen from the roadside. ", "street": "Setting: a suburban street in small-town Southeast Texas. ",
    "town": "Setting: an establishing view of a Southeast Texas town. ", "area": "Setting: a wide establishing landscape of Southeast Texas pine flats and refinery horizon at dusk. ",
    "grounds": "Setting: the yard of a modest family home in small-town Southeast Texas. ", "room": "", "passage": "",
}
INTERIOR_IDS = {"refinery.break", "refinery.office", "refinery.control", "refinery.change", "refinery.admin", "lamar.morris.lobby", "lamar.combs.lobby", "lamar.morris.floor3",
                "lamar.library", "lamar.ssc", "lamar.dining", "lamar.rec", "lamar.montagne", "vidor.market", "vidor.church"}
def ref_job(n):
    interior = n["type"] in ("room", "passage") or n["id"] in INTERIOR_IDS
    if n["id"].startswith("lamar.") and n["type"] == "room": extra = "Setting: a modest university dorm room or dorm facility with institutional furniture. "
    elif n["id"].startswith("refinery.") and n["type"] == "room": extra = "Setting: a utilitarian industrial plant office building. "
    elif n["id"] in INTERIOR_IDS: extra = FLAVOR.get(n["type"], "") + "Interior view. "
    elif n["type"] in ("room", "passage"): extra = "Setting: inside a lived-in family home in small-town Southeast Texas, not a mansion. " if not n["id"].startswith("lacy.") else "Setting: inside an upscale, showpiece suburban home in Southeast Texas. "
    else: extra = FLAVOR.get(n["type"], "")
    prompt = (INT if interior else EXT) + extra + f"Subject: {n['name']}. " + n["desc"] + END
    style = "style-thompson.kitchen.jpg" if interior else ("style-thompson.patio.jpg" if n["type"] == "grounds" else "style-thompson.house.jpg")
    return (n["id"], prompt, [style], str(REF / f"{n['id']}.png"), 1536, 1024)

jobs = [(pid, p, [SCHEM.format(pid), style], str(BG / f"{pid}.png"), 1024, 1024) for pid, (p, style) in BACKGROUNDS.items()]
if "--refs" in sys.argv: jobs = [ref_job(n) for n in world.N]
only = [a for a in sys.argv[1:] if not a.startswith("--")]
if only: jobs = [j for j in jobs if j[0] in only]
jobs = [j for j in jobs if not pathlib.Path(j[3]).exists()]
print(len(jobs), "jobs", flush=True)
def run(j):
    for attempt in (1, 2):
        try:
            if gen.generate(j[0], j[1], j[2], j[3], j[4], j[5]): return j[0], True
        except Exception as e: print(j[0], "error", e, flush=True)
    return j[0], False
with cf.ThreadPoolExecutor(3) as ex:
    res = list(ex.map(run, jobs))
print("failed:", [i for i, ok in res if not ok], flush=True)
