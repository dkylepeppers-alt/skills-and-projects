"""Rebuild personal map content; never modifies the supplied original or Engine."""
import copy, hashlib, json, pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent
def read(p): return json.loads(pathlib.Path(p).read_text())
def write(p, d): pathlib.Path(p).write_text(json.dumps(d, ensure_ascii=False, indent=2)+'\n')
original = read(ROOT/'source/original.world-map.json')
pack = copy.deepcopy(original)
pack['name'] = 'Nevermore — Woodlands and Crypt Progression v2'
locs = pack['definition']['locations']; by = {l['id']:l for l in locs}
def update(id, **fields): by[id].update(fields)
def memory(id, text): by[id]['modelMemory'] = text
def unlink(a,b): by[a]['links'] = [x for x in by[a]['links'] if x['targetId'] != b]
def edge(a,b,label,state='available'):
    unlink(a,b); unlink(b,a)
    by[a]['links'].append(dict(targetId=b,label=label,bidirectional=True,state=state))
