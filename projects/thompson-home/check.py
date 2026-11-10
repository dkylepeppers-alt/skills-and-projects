"""Graph checks on a built or exported definition (native destination rules)."""
import json, sys, collections
d = json.load(open(sys.argv[1]))
d = d.get("data", d); df = d["definition"]
locs = {l["id"]: l for l in df["locations"] if l["status"] == "active"}
dest = collections.defaultdict(set)
for l in locs.values():
    if l["parentId"] in locs:
        dest[l["id"]].add(l["parentId"]); dest[l["parentId"]].add(l["id"])
    for k in l["links"]:
        if k.get("state", "available") == "available" and k["targetId"] in locs:
            dest[l["id"]].add(k["targetId"])
            if k.get("bidirectional"): dest[k["targetId"]].add(l["id"])
start = df["startingLocationId"]
dist = {start: 0}; q = collections.deque([start])
while q:
    a = q.popleft()
    for b in dest[a]:
        if b not in dist: dist[b] = dist[a] + 1; q.append(b)
unreach = sorted(set(locs) - set(dist))
print("active", len(locs), "reachable from", start, len(dist), "max hops", max(dist.values()))
print("unreachable (expected: concealed rooms only):", unreach)
print("busiest hubs:", sorted(((len(v), k) for k, v in dest.items()), reverse=True)[:5])
print("over 50 destinations:", [k for k, v in dest.items() if len(v) > 50])
for a, b in [("thompson.stoop", "refinery.office"), ("thompson.stoop", "lamar.twins"), ("thompson.kitchen", "raelynn.kitchen"), ("thompson.stoop", "lacy.kitchen"), ("lamar.twins", "lamar.kenna")]:
    dd = {a: 0}; q = collections.deque([a]); prev = {}
    while q:
        x = q.popleft()
        for y in dest[x]:
            if y not in dd: dd[y] = dd[x] + 1; prev[y] = x; q.append(y)
    path = [b]
    while path[-1] != a: path.append(prev[path[-1]])
    print(f"{a} -> {b}: {dd[b]} hops:", " > ".join(reversed(path)))
names = collections.Counter(l["name"] for l in locs.values())
print("duplicate names:", [n for n, c in names.items() if c > 1])
print("first 50 index:", ", ".join(l["name"] for l in df["locations"][:50]))
long = [(l["id"], len(l["description"])) for l in locs.values() if len(l["description"]) > 4000 or len(l.get("modelMemory", "")) > 8000 or len(l["name"]) > 200 or len(l["lorebookEntryIds"]) > 50]
print("length violations:", long)
