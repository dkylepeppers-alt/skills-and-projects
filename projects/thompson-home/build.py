#!/usr/bin/env python3
"""Merge the Golden Triangle expansion onto the live "Thompson Home" map.

  python3 build.py            # offline: build/thompson-home.world-map.json from source/live-template.json
  python3 build.py --apply    # also upload backgrounds, create lore, and save the template in the Engine

The Engine secret is read from the Android secret file and never printed.
state.json remembers created Gallery images and lore entries so a re-run does
not duplicate them.
"""
import copy, json, pathlib, subprocess, sys

import maps
import world

HERE = pathlib.Path(__file__).parent
STATE = HERE / "state.json"
BASE = "http://127.0.0.1:7860/api"
SECRET_FILE = "/data/data/com.termux/files/home/.marinara-engine/android-secret"
TEMPLATE_ID = "00mw8m8yr40000YY4voq-"
LOREBOOK_ID = "oQXwJ10lq7gbRNYjAzKyT"  # Thompson Property - Spatial Canon
APPLY = "--apply" in sys.argv


def curl(method, path, body=None, form=None):
    secret = open(SECRET_FILE).read().strip()
    cmd = ["curl", "-sS", "-X", method, BASE + path, "-H", "x-marinara-android-secret: " + secret, "-H", "x-marinara-csrf: 1"]
    if body is not None:
        cmd += ["-H", "content-type: application/json", "--data-binary", "@-"]
    for f in form or []:
        cmd += ["-F", f]
    out = subprocess.run(cmd, input=json.dumps(body) if body is not None else None, capture_output=True, text=True, check=True).stdout
    return json.loads(out) if out.strip() else None


def link_key(a, b):
    return "|".join(sorted([a, b]))  # spatialLinkPresentationKey (ASCII ids, so plain sort matches localeCompare)


def main():
    state = json.loads(STATE.read_text()) if STATE.exists() else {"art": {}, "lore": {}}
    if APPLY:
        live = next(t for t in curl("GET", "/chats/spatial-context/templates") if t["id"] == TEMPLATE_ID)
        (HERE / "source").mkdir(exist_ok=True)
        if not state.get("applied"):
            (HERE / "source" / "live-template-rev2.json").write_text(json.dumps(live, indent=1, ensure_ascii=False))
    else:
        live = json.loads((HERE / "source" / "live-template-rev2.json").read_text())
    definition = copy.deepcopy(live["data"]["definition"])
    profile = copy.deepcopy(live["data"]["hierarchyProfile"])
    locs = {l["id"]: l for l in definition["locations"]}
    original_order = [l["id"] for l in definition["locations"]]
    new_ids = [n["id"] for n in world.N]
    already = [i for i in new_ids if i in locs]
    if already and not state.get("applied"):
        sys.exit(f"live map already contains new ids: {already[:5]}")
    for i in already:  # re-run: rebuild the new nodes from source
        del locs[i]
    original_order = [i for i in original_order if i not in new_ids]

    # ---- side effects: art and lore -------------------------------------
    lore_ids = {}
    for key, entry in world.LORE.items():
        if APPLY and key not in state["lore"]:
            res = curl("POST", f"/lorebooks/{LOREBOOK_ID}/entries/bulk", {"entries": [{
                "name": entry["name"], "content": entry["content"], "keys": entry["keys"],
                "enabled": True, "constant": False, "position": 0, "depth": 4, "role": "system",
                "order": 110 + list(world.LORE).index(key), "excludeFromVectorization": True,
            }]})
            created = res if isinstance(res, list) else res.get("entries") or res.get("data") or [res]
            state["lore"][key] = created[0]["id"]
            STATE.write_text(json.dumps(state, indent=1))
        lore_ids[key] = state["lore"].get(key, f"pending-lore-{key}")
    # Seedream 5.5 art (art-final/). state["art"] holds the superseded schematic uploads.
    def upload(path, prompt, w, h):
        res = curl("POST", "/global-gallery/upload", form=[
            f"file=@{path};type=image/jpeg", f"width={w}", f"height={h}", f"prompt={prompt}",
            "provider=spicyapi", "model=bytedance/seedream-5.5/edit"])
        image = res.get("image") or res.get("data") or res
        if "id" not in image:
            sys.exit(f"upload failed for {path.name}: {json.dumps(res)[:300]}")
        return image["id"]
    art_ids, ref_ids = {}, {}
    for kind, folder, ids, w, h in (("bg", "background", art_ids, 2048, 2048), ("ref", "reference", ref_ids, 1536, 1024)):
        store = state.setdefault(kind, {})
        for path in sorted((HERE / "art-final" / folder).glob("*.jpg")):
            lid = path.stem
            if APPLY and lid not in store:
                store[lid] = upload(path, f"Thompson Home world map {folder} for {lid}", w, h)
                STATE.write_text(json.dumps(state, indent=1))
            ids[lid] = "global-gallery:" + store.get(lid, f"pending-{kind}-{lid}")
    assert set(art_ids) == set(maps.M), set(art_ids) ^ set(maps.M)

    def lore_list(keys):
        return [lore_ids[k] for k in keys]

    # ---- existing node patches --------------------------------------------
    for lid, patch in world.EXISTING_PATCH.items():
        loc = locs[lid]
        if "parentId" in patch:
            loc["parentId"] = patch["parentId"]
        if "replace_memory" in patch:
            old, new = patch["replace_memory"]
            if old in loc.get("modelMemory", ""):
                loc["modelMemory"] = loc["modelMemory"].replace(old, new)
            elif new not in loc.get("modelMemory", ""):
                sys.exit(f"memory anchor missing on {lid}")
        for lid2 in lore_list(patch.get("add_lore", "")):
            if lid2 not in loc["lorebookEntryIds"]:
                loc["lorebookEntryIds"].append(lid2)

    # ---- new nodes ------------------------------------------------------------
    for index, n in enumerate(world.N):
        loc = {
            "id": n["id"], "parentId": n["parent"], "name": n["name"], "kind": n["kind"],
            "description": n["desc"],
            **({"modelMemory": n["mem"]} if n["mem"] else {}),
            "icon": n["icon"],
            "lorebookEntryIds": lore_list(n["lore"]),
            **({"referenceImageId": ref_ids[n["id"]], "useReferenceImage": True} if n["id"] in ref_ids else {}),
            "childPresentation": n["pres"],
            **({"layerOrder": n["layer"]} if n["layer"] is not None else {}),
            "links": [], "status": "active", "sortOrder": 100 + index,
        }
        locs[n["id"]] = loc
        profile["locationTypeIds"][n["id"]] = n["type"]

    # ---- canvases ---------------------------------------------------------------
    for pid in maps.M:
        parent = locs[pid]
        assert parent["childPresentation"] == "map", pid
        parent["mapBackgroundImageId"] = art_ids[pid]
        parent["mapBackgroundPosition"] = {"x": 50, "y": 50}
        placed = maps.placements(pid)
        children = [l["id"] for l in locs.values() if l["parentId"] == pid and l["status"] == "active"]
        assert set(children) == set(placed), (pid, set(children) ^ set(placed))
        for cid, xy in placed.items():
            locs[cid]["placement"] = xy

    # ---- links and their styles ------------------------------------------------
    presentations = {}
    for row in world.L:
        src, dst, label, cat = row[:4]
        state_ = row[4] if len(row) > 4 else "available"
        both = row[5] if len(row) > 5 else True
        assert src in locs and dst in locs and src != dst, row
        locs[src]["links"] = [k for k in locs[src]["links"] if k["targetId"] != dst]
        assert not any(k["targetId"] == src for k in locs[dst]["links"]), ("reverse duplicate", row)
        locs[src]["links"].append({"targetId": dst, "label": label, "bidirectional": both, "state": state_})
        if world.STYLES[cat]:
            presentations[link_key(src, dst)] = world.STYLES[cat]
    for src, dst, cat in world.EXISTING_STYLED:
        assert any(k["targetId"] == dst for k in locs[src]["links"]), (src, dst)
        presentations[link_key(src, dst)] = world.STYLES[cat]
    profile["linkPresentations"] = presentations
    have = {t["id"] for t in profile["types"]}
    profile["types"] += [t for t in world.NEW_TYPES if t["id"] not in have]
    used = set(profile["locationTypeIds"].values())
    assert used <= {t["id"] for t in profile["types"]}, used
    assert len(profile["types"]) <= 40

    # ---- order: strategic spine first (owner prompt indexes the first 50) -----
    order = list(world.SPINE)
    assert len(order) == 50 and len(set(order)) == 50 and all(i in locs for i in order)
    order += [i for i in original_order if i not in order]
    order += [i for i in new_ids if i not in order]
    assert set(order) == set(locs) and len(order) == len(locs)
    definition["locations"] = [locs[i] for i in order]

    envelope = {
        "format": "marinara-hierarchical-map", "formatVersion": 4, "name": "Thompson Home",
        "definition": definition, "hierarchyProfile": profile,
    }
    (HERE / "build").mkdir(exist_ok=True)
    out = HERE / "build" / "thompson-home.world-map.json"
    out.write_text(json.dumps(envelope, indent=1, ensure_ascii=False))
    print(f"built {out.name}: {len(order)} locations ({len(new_ids)} new), "
          f"{sum(len(l['links']) for l in locs.values())} links, {len(presentations)} styled, {len(profile['types'])} types")

    if APPLY:
        body = {
            "name": "Thompson Home",
            "description": "The Thompson house and lot in Vidor, plus the family's wider world: Raelynn's place down the street, "
                           "the book-club homes (Macy, Lacy, Ashton), Vidor landmarks, Lamar University with the twins' and Kenna's dorms, "
                           "and the ExxonMobil Beaumont refinery where Kyle Sr. works.",
            "definition": definition, "hierarchyProfile": profile, "expectedRevision": live["revision"],
        }
        res = curl("PUT", f"/chats/spatial-context/templates/{TEMPLATE_ID}", body)
        if "error" in res:
            sys.exit("save failed: " + json.dumps(res)[:1500])
        state["applied"] = True
        STATE.write_text(json.dumps(state, indent=1))
        print("saved template revision", res.get("revision"), "locations", len(res["data"]["definition"]["locations"]))


if __name__ == "__main__":
    main()
