#!/usr/bin/env python3
"""Validate Nevermore companion world pack against v2 map inventory (Task 5).

Does not modify map/art/presets. Exit 0 on success; non-zero with JSON report on failure.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

EXPECTED_LOCATIONS = 79
EXPECTED_ASSETS = 82
EXPECTED_MAP_SHA = "d10bef3e1d39945224d3981767fdb4c6a7a018b0710efb7322dd790be0dfd2fa"
PROFILE_KINDS = {"playable-scene", "circulation", "boundary-gate", "regional-container"}
LINK_STATES = {"available", "hidden", "blocked"}
REQUIRED_PACK_FILES = [
    "manifest.json",
    "locations.json",
    "npcs.json",
    "aliases.json",
    "schedules.json",
    "services.json",
    "events.json",
    "profiles.json",
]
CONTROLLED_ENTRANCES = {
    ("nevermore-poe-statue", "crypts-stair-mouth"),
    ("ravencroft-iron-maiden", "crypts-tunnel-mouth"),
    ("dorms-common", "crypts-crawlspace"),
}
PROGRESSION_GATES = {
    ("crypts-door-1", "crypts-breath"),
    ("crypts-door-2", "crypts-chamber-3"),
    ("crypts-door-3", "crypts-approach"),
}
CRYPT_ROOTS = {
    "crypts-labyrinth",
    "crypts-second-rite",
    "crypts-union",
    "crypts-covenant",
}


def load(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def repo_root_from_script() -> Path:
    # projects/world-map-companion/scripts/validate-world-pack.py -> repo root
    return Path(__file__).resolve().parents[3]


def build_reachability(locations: list[dict], edges: list[dict], open_states: set[str]):
    by_id = {l["id"]: l for l in locations}
    graph: dict[str, set[str]] = {l["id"]: set() for l in locations}
    for loc in locations:
        pid = loc.get("parentId")
        if pid in graph:
            graph[loc["id"]].add(pid)
            graph[pid].add(loc["id"])
    for e in edges:
        if e.get("state", "available") not in open_states:
            continue
        a, b = e["fromId"], e["toId"]
        if a in graph and b in graph:
            graph[a].add(b)
            if e.get("bidirectional"):
                graph[b].add(a)
            # unidirectional still allows reverse only if reverse edge exists separately
    return graph


def reachable_from(graph: dict[str, set[str]], start: str) -> set[str]:
    seen = {start}
    stack = [start]
    while stack:
        cur = stack.pop()
        for nxt in graph.get(cur, ()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=None,
        help="Repository root (default: inferred from script location)",
    )
    parser.add_argument(
        "--pack",
        type=Path,
        default=None,
        help="Companion pack directory (default: projects/nevermore/companion)",
    )
    parser.add_argument(
        "--map",
        type=Path,
        default=None,
        help="v2 world-map JSON (default: projects/nevermore/releases/v2/...)",
    )
    parser.add_argument("--json", action="store_true", help="Print full JSON report")
    args = parser.parse_args()

    root = args.repo_root or repo_root_from_script()
    pack_dir = args.pack or (root / "projects/nevermore/companion")
    map_path = args.map or (
        root / "projects/nevermore/releases/v2/Nevermore-Woodlands-Crypts-v2.world-map.json"
    )

    errors: list[str] = []
    warnings: list[str] = []
    info: dict = {"packDir": str(pack_dir), "mapPath": str(map_path)}

    if not pack_dir.is_dir():
        errors.append(f"pack directory missing: {pack_dir}")
        print(json.dumps({"ok": False, "errors": errors}, indent=2))
        return 1

    for name in REQUIRED_PACK_FILES:
        if not (pack_dir / name).is_file():
            errors.append(f"missing pack file: {name}")

    if errors:
        print(json.dumps({"ok": False, "errors": errors}, indent=2))
        return 1

    if not map_path.is_file():
        errors.append(f"map file missing: {map_path}")
        print(json.dumps({"ok": False, "errors": errors}, indent=2))
        return 1

    raw = map_path.read_bytes()
    # Allow LFS pointer failure to surface clearly
    if raw.startswith(b"version https://git-lfs.github.com/spec/v1"):
        errors.append("map file is still a Git LFS pointer; run git lfs pull before validating")
        print(json.dumps({"ok": False, "errors": errors}, indent=2))
        return 1

    map_sha = hashlib.sha256(raw).hexdigest()
    info["mapSha256"] = map_sha
    if map_sha != EXPECTED_MAP_SHA:
        errors.append(f"map SHA-256 mismatch: got {map_sha}, expected {EXPECTED_MAP_SHA}")

    world = json.loads(raw.decode("utf-8"))
    definition = world["definition"]
    map_locations = definition["locations"]
    map_ids = [l["id"] for l in map_locations]
    map_id_set = set(map_ids)
    if len(map_locations) != EXPECTED_LOCATIONS:
        errors.append(f"map location count {len(map_locations)} != {EXPECTED_LOCATIONS}")
    if len(map_ids) != len(map_id_set):
        errors.append("duplicate location IDs in map definition")

    artwork = world.get("artwork") or []
    art_ids = [a.get("sourceImageId") for a in artwork]
    if len(art_ids) != EXPECTED_ASSETS:
        errors.append(f"map artwork count {len(art_ids)} != {EXPECTED_ASSETS}")
    if len(set(art_ids)) != len(art_ids):
        errors.append("duplicate artwork sourceImageId values in map")

    map_edges = []
    for loc in map_locations:
        for link in loc.get("links") or []:
            map_edges.append(
                {
                    "fromId": loc["id"],
                    "toId": link["targetId"],
                    "bidirectional": bool(link.get("bidirectional", False)),
                    "state": link.get("state") or "available",
                    "label": link.get("label"),
                }
            )

    manifest = load(pack_dir / "manifest.json")
    locations_doc = load(pack_dir / "locations.json")
    npcs_doc = load(pack_dir / "npcs.json")
    aliases_doc = load(pack_dir / "aliases.json")
    schedules_doc = load(pack_dir / "schedules.json")
    services_doc = load(pack_dir / "services.json")
    events_doc = load(pack_dir / "events.json")
    profiles_doc = load(pack_dir / "profiles.json")

    pack_locs = locations_doc.get("locations") or []
    pack_edges = locations_doc.get("edges") or []
    pack_assets = locations_doc.get("assets") or []
    pack_loc_ids = [p.get("locationId") for p in pack_locs]

    info["packLocationCount"] = len(pack_locs)
    info["packEdgeCount"] = len(pack_edges)
    info["packAssetCount"] = len(pack_assets)
    info["npcCount"] = len(npcs_doc.get("npcs") or [])

    if len(pack_locs) != EXPECTED_LOCATIONS:
        errors.append(f"pack locations {len(pack_locs)} != {EXPECTED_LOCATIONS}")
    if set(pack_loc_ids) != map_id_set:
        missing = sorted(map_id_set - set(pack_loc_ids))
        extra = sorted(set(pack_loc_ids) - map_id_set)
        if missing:
            errors.append(f"pack missing location IDs: {missing}")
        if extra:
            errors.append(f"pack has unknown location IDs: {extra}")
    if len(pack_loc_ids) != len(set(pack_loc_ids)):
        errors.append("duplicate locationId in pack locations.json")

    for p in pack_locs:
        lid = p.get("locationId")
        kind = p.get("kind")
        if kind not in PROFILE_KINDS:
            errors.append(f"location {lid}: invalid kind {kind!r}")
        if not isinstance(p.get("affordances"), list):
            errors.append(f"location {lid}: affordances must be a list")

    # Edges: exact join to map (fromId,toId,state,bidirectional)
    def edge_key(e):
        return (e["fromId"], e["toId"], e.get("state", "available"), bool(e.get("bidirectional")))

    map_edge_keys = sorted(edge_key(e) for e in map_edges)
    pack_edge_keys = sorted(edge_key(e) for e in pack_edges)
    info["mapEdgeCount"] = len(map_edges)
    if pack_edge_keys != map_edge_keys:
        errors.append(
            "pack edges do not match map link records "
            f"(map={len(map_edge_keys)} pack={len(pack_edge_keys)})"
        )
        # detail small diffs
        ms, ps = set(map_edge_keys), set(pack_edge_keys)
        only_map = sorted(ms - ps)[:10]
        only_pack = sorted(ps - ms)[:10]
        if only_map:
            errors.append(f"edges only in map (sample): {only_map}")
        if only_pack:
            errors.append(f"edges only in pack (sample): {only_pack}")

    for e in pack_edges:
        if e["fromId"] not in map_id_set or e["toId"] not in map_id_set:
            errors.append(f"dangling edge endpoint: {e['fromId']} -> {e['toId']}")
        if e.get("state") not in LINK_STATES:
            errors.append(f"invalid edge state: {e}")

    # Assets: 82, join by ID to map artwork + location bindings
    pack_asset_ids = [a.get("assetId") for a in pack_assets]
    if len(pack_assets) != EXPECTED_ASSETS:
        errors.append(f"pack assets {len(pack_assets)} != {EXPECTED_ASSETS}")
    if set(pack_asset_ids) != set(art_ids):
        errors.append("pack asset IDs do not match map artwork sourceImageId set")
    if len(pack_asset_ids) != len(set(pack_asset_ids)):
        errors.append("duplicate assetId in pack assets")
    for a in pack_assets:
        if a.get("locationId") not in map_id_set:
            errors.append(f"asset {a.get('assetId')} dangling locationId {a.get('locationId')}")

    # Verify each map location's reference/background appears in pack assets
    bound = {(a["locationId"], a["role"], a["assetId"]) for a in pack_assets}
    for loc in map_locations:
        ref = loc.get("referenceImageId")
        if ref and (loc["id"], "reference", ref) not in bound:
            errors.append(f"missing reference asset join for {loc['id']}")
        bg = loc.get("mapBackgroundImageId")
        if bg and (loc["id"], "background", bg) not in bound:
            errors.append(f"missing background asset join for {loc['id']}")

    # NPCs
    npcs = npcs_doc.get("npcs") or []
    npc_ids = [n.get("npcId") for n in npcs]
    if len(npc_ids) != len(set(npc_ids)):
        errors.append("duplicate npcId values")
    npc_id_set = set(npc_ids)
    display_names = [n.get("displayName") for n in npcs]
    if len(display_names) != len(set(display_names)):
        errors.append("duplicate NPC displayName values")

    for n in npcs:
        nid = n.get("npcId")
        for field in ("homeLocationIds", "workLocationIds"):
            for lid in n.get(field) or []:
                if lid not in map_id_set:
                    errors.append(f"{nid} {field} dangling location {lid}")
        placement = n.get("initialPlacement") or {}
        plid = placement.get("locationId")
        if plid is not None and plid not in map_id_set:
            errors.append(f"{nid} initialPlacement locationId dangling: {plid}")
        for sid in n.get("scheduleIds") or []:
            # checked against schedules below
            pass
        if n.get("nativeCharacterIds"):
            # allowed only if sourced; still warn if present without note
            if not n.get("nativeCharacterBinding"):
                warnings.append(f"{nid} has nativeCharacterIds without binding note")

    # Aliases should not invent npc ids
    for row in aliases_doc.get("aliases") or []:
        for cid in row.get("candidates") or []:
            if cid not in npc_id_set:
                errors.append(f"alias {row.get('alias')!r} candidate unknown npc {cid}")
        pref = row.get("preferredNpcId")
        if pref is not None and pref not in npc_id_set:
            errors.append(f"alias {row.get('alias')!r} preferredNpcId unknown {pref}")

    # Schedules
    schedules = schedules_doc.get("schedules") or []
    schedule_ids = [s.get("scheduleId") for s in schedules]
    if len(schedule_ids) != len(set(schedule_ids)):
        errors.append("duplicate scheduleId values")
    schedule_id_set = set(schedule_ids)
    for n in npcs:
        for sid in n.get("scheduleIds") or []:
            if sid not in schedule_id_set:
                errors.append(f"{n.get('npcId')} references missing schedule {sid}")
    for s in schedules:
        if s.get("npcId") not in npc_id_set:
            errors.append(f"schedule {s.get('scheduleId')} unknown npc {s.get('npcId')}")
        for w in s.get("windows") or []:
            lid = w.get("locationId")
            if lid not in map_id_set:
                errors.append(
                    f"schedule {s.get('scheduleId')} window {w.get('id')} dangling location {lid}"
                )

    # Services
    for svc in services_doc.get("services") or []:
        if svc.get("locationId") not in map_id_set:
            errors.append(f"service {svc.get('serviceId')} dangling location {svc.get('locationId')}")

    # Events / gates
    entrances = {
        (e["fromId"], e["toId"]) for e in events_doc.get("controlledEntrances") or []
    }
    gates = {(e["fromId"], e["toId"]) for e in events_doc.get("progressionGates") or []}
    if entrances != CONTROLLED_ENTRANCES:
        errors.append(f"controlledEntrances mismatch: {entrances}")
    if gates != PROGRESSION_GATES:
        errors.append(f"progressionGates mismatch: {gates}")

    # Verify gate edges exist on map with expected default states
    edge_lookup = {(e["fromId"], e["toId"]): e for e in map_edges}
    for a, b in CONTROLLED_ENTRANCES:
        e = edge_lookup.get((a, b))
        if not e:
            errors.append(f"controlled entrance missing on map: {a}->{b}")
        elif e["state"] != "hidden":
            errors.append(f"controlled entrance {a}->{b} expected hidden, got {e['state']}")
    for a, b in PROGRESSION_GATES:
        e = edge_lookup.get((a, b))
        if not e:
            errors.append(f"progression gate missing on map: {a}->{b}")
        elif e["state"] != "blocked":
            errors.append(f"progression gate {a}->{b} expected blocked, got {e['state']}")

    roots = set((events_doc.get("intentionalTopology") or {}).get("roots") or [])
    expected_roots = {"jericho-woods"} | CRYPT_ROOTS
    if roots != expected_roots:
        errors.append(f"intentionalTopology.roots mismatch: {roots} vs {expected_roots}")

    # Topology: pack must not invent edges (already exact-match). Confirm crypt roots still parentless as in map.
    for loc in map_locations:
        if loc["id"] in expected_roots and loc.get("parentId") is not None:
            errors.append(f"root {loc['id']} unexpectedly has parentId {loc.get('parentId')}")

    # Schedule leg reachability under containment + available edges (default map: crypts sealed)
    graph_default = build_reachability(map_locations, map_edges, {"available"})
    start = definition.get("startingLocationId")
    surface_reach = reachable_from(graph_default, start) if start else set()
    info["defaultReachableFromStart"] = len(surface_reach)

    # Required schedule legs: treat windows with certainty in {sourced-home, sourced-intent, assumption, sourced-behavior, sourced-visit-pattern}
    # as required expectations — they must reference existing IDs (done) and not demand travel through sealed crypts.
    for s in schedules:
        for w in s.get("windows") or []:
            lid = w["locationId"]
            if lid.startswith("crypts-") and lid not in surface_reach:
                # visiting crypt on a routine schedule would be unreachable at default topology
                errors.append(
                    f"schedule {s.get('scheduleId')} window {w.get('id')} requires unreachable crypt location {lid} under default topology"
                )

    # Profiles
    profile_ids = [p.get("id") for p in profiles_doc.get("profiles") or []]
    expected_profiles = {"freeform", "social-schedule", "exploration-mystery", "tactical-travel"}
    if set(profile_ids) != expected_profiles:
        errors.append(f"profiles mismatch: {set(profile_ids)}")

    # Manifest coverage claims
    cov = manifest.get("coverage") or {}
    if cov.get("locations") != f"{EXPECTED_LOCATIONS}/{EXPECTED_LOCATIONS}":
        warnings.append(f"manifest coverage.locations={cov.get('locations')}")
    if cov.get("assets") != f"{EXPECTED_ASSETS}/{EXPECTED_ASSETS}":
        warnings.append(f"manifest coverage.assets={cov.get('assets')}")

    # Source hash recorded in pack
    if locations_doc.get("sourceMapContentHash") != EXPECTED_MAP_SHA:
        errors.append("locations.json sourceMapContentHash mismatch")
    if (manifest.get("sourceMap") or {}).get("contentHash") != EXPECTED_MAP_SHA:
        errors.append("manifest sourceMap.contentHash mismatch")

    report = {
        "ok": not errors,
        "errors": errors,
        "warnings": warnings,
        "info": info,
        "counts": {
            "locations": len(pack_locs),
            "edges": len(pack_edges),
            "assets": len(pack_assets),
            "npcs": len(npcs),
            "schedules": len(schedules),
            "services": len(services_doc.get("services") or []),
            "profiles": len(profile_ids),
        },
    }

    if args.json or errors or warnings:
        print(json.dumps(report, indent=2))
    else:
        print(
            f"OK: {EXPECTED_LOCATIONS} locations, {EXPECTED_ASSETS} assets, "
            f"{len(pack_edges)} edges, {len(npcs)} npcs"
        )
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
