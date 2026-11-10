"""Generate one image through the Engine's SpicyAPI image connection. Saves nothing in the Engine."""
import base64, json, subprocess, sys, time, pathlib
CONN = "DcO-kMNLGbCxlUZSQ2GPu"
def durl(p):
    p = pathlib.Path(p); mime = "image/jpeg" if p.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()
def generate(name, prompt, refs, out, width=1024, height=1024):
    body = {"connectionId": CONN, "name": name, "appearance": prompt, "width": width, "height": height,
            "referenceImages": [durl(r) for r in refs], "promptOverrides": [{"id": f"avatar:{name}", "prompt": prompt}]}
    import threading; fn = f"_gen-{threading.get_ident()}.json"; json.dump(body, open(fn, "w"))
    t = time.time()
    raw = subprocess.run(["./api.sh", "POST", "/characters/avatar-generation", fn], capture_output=True, text=True).stdout
    try: res = json.loads(raw)
    except Exception: print("bad response", raw[:300]); return False
    img = res.get("image") or res.get("dataUrl") or res.get("base64") or ""
    if not img: print("no image:", json.dumps(res)[:400]); return False
    data = img.split(",", 1)[1] if img.startswith("data:") else img
    pathlib.Path(out).write_bytes(base64.b64decode(data))
    print(flush=True, end=""); print(f"{name}: {pathlib.Path(out).stat().st_size} bytes in {time.time()-t:.0f}s; keys {list(res)}")
    return True
if __name__ == "__main__":
    generate("raelynn-house-plan",
        "Image 1 is a schematic floor plan; image 2 shows the target art style. Redraw the floor plan from image 1 as a photorealistic top-down architectural 3D floor-plan render in exactly the style of image 2: straight overhead orthographic view, dark slate walls, warm oak plank floors, pale tile in the bathroom and laundry, soft daylight, white background. "
        "Keep every wall, room and doorway exactly where image 1 places them, same proportions, north up. Furnish each room modestly for a lived-in single-story Texas home: living room top-left with a deep couch and TV; kitchen top-right with counters, a small table and a back door on the right wall; small hall and laundry nook with washer and dryer in the middle right; bedroom bottom-left with a bed, vanity mirror and ring light; narrow bathroom with tub bottom-center; bedroom bottom-right with a queen bed. "
        "No text, no labels, no compass, no title, no people.",
        ["thompson-home/art/background/raelynn.house.png", "oldbg-thompson.first-floor.png"], "gen/raelynn.house.png", 1024, 1024)
