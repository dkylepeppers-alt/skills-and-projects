"""Second pass: scene-specific removal for foreground portraits the generic edit kept."""
import sys, pathlib, concurrent.futures as cf, time
import gen
BASE = ("Edit image 1. Delete every person or human head in the photograph entirely: "
        "no head, face, hair, shoulders, torso, clothing or shadow may remain, and do not replace them with anyone else. "
        "Where the person was, continue the background naturally: {fill} Keep everything else in the photograph unchanged: same place, "
        "camera position, framing, colours and light. Output one photorealistic photograph of the empty place, with no people anywhere and no added text.")
FILL = {
    "lamar.montagne": "the polished hardwood basketball court, its painted lines and the red arena seating behind it.",
    "lamar.parking": "the empty asphalt parking lot with painted lines and the curb, landscaping island and live oak.",
    "lamar.quad": "the brick walkway, green lawn and the student-organization tables under the live oaks; keep the camera tripod if it does not touch the person.",
    "lamar.ssc": "the tiled atrium floor, food-court seating, information boards and the balcony railing in the lower foreground.",
    "setx.i10": "the grassy roadside verge and curb in the foreground, the interstate bridge with traffic crossing the river, pines and the distant refinery stacks.",
    "vidor.street": "the mown front lawn in the foreground, the sidewalk and street, the brick houses, mailboxes and live oaks beyond.",
    "refinery.change": "the inside of that open locker: its back wall and the hanging coveralls beside it. Also remove the small crown above it.",
    "lamar.combs.lobby": "the front desk, lobby furniture and walls behind them.",
}
only = sys.argv[1:] or list(FILL)
pathlib.Path("gen/edited2").mkdir(exist_ok=True)
def run(i):
    for attempt in (1, 2, 3):
        try:
            if gen.generate(i + "-edit2", BASE.format(fill=FILL[i]), [f"gen/final/{i}.png"], f"gen/edited2/{i}.png", 1536, 1024): return i, True
        except Exception as e: print(i, "error", e, flush=True)
        time.sleep(20)
    return i, False
with cf.ThreadPoolExecutor(2) as ex:
    res = list(ex.map(run, [i for i in only if not pathlib.Path(f"gen/edited2/{i}.png").exists()]))
print("failed:", [i for i, ok in res if not ok], flush=True)
