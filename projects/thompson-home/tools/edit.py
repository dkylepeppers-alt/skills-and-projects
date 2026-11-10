"""Remove people from generated scene images with Seedream 5.5 edit. Originals stay in gen/reference."""
import sys, pathlib, concurrent.futures as cf, time
import gen
IDS = ["lacy.kitchen", "lacy.suite", "lamar.kenna", "lamar.montagne", "lamar.parking", "lamar.quad", "lamar.rec", "lamar.ssc",
       "macy.kitchen", "raelynn.yard", "refinery.break", "refinery.control", "refinery.parking", "setx.i10", "vidor.market", "vidor.street"]
PROMPT = ("Edit image 1. Remove every person from the photograph completely, including any face, head, body, hand, and any portrait, "
          "selfie or photo of a person pasted or inset into the frame. Fill each removed area with the scene that would naturally be behind it, "
          "matching the surrounding surfaces, lighting, perspective and grain. Keep everything else exactly the same: same room or place, "
          "same furniture, objects, camera position, framing, colours and light. Output one photorealistic image of the empty place, "
          "with no people anywhere and no added text.")
only = sys.argv[1:] or IDS
jobs = [i for i in only if not pathlib.Path(f"gen/edited/{i}.png").exists()]
print(len(jobs), "edits", flush=True)
def run(i):
    for attempt in (1, 2, 3):
        try:
            if gen.generate(i + "-edit", PROMPT, [f"gen/reference/{i}.png"], f"gen/edited/{i}.png", 1536, 1024): return i, True
        except Exception as e: print(i, "error", e, flush=True)
        time.sleep(20)
    return i, False
with cf.ThreadPoolExecutor(3) as ex:
    res = list(ex.map(run, jobs))
print("failed:", [i for i, ok in res if not ok], flush=True)
