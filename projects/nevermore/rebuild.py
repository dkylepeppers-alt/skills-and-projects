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

# Each hard boundary separates containment components. Roots are deliberate.
for l in locs:
    if l['id'].startswith('crypts-'):
        l['links']=[]
    else:
        l['links']=[a for a in l['links'] if not a['targetId'].startswith('crypts-')]
update('crypts-labyrinth',parentId=None)
by['crypts-labyrinth'].pop('placement',None)
for id in ['crypts-second-rite','crypts-union','crypts-covenant']:
    update(id,parentId=None);by[id].pop('layerOrder',None)
update('crypts-breath',parentId='crypts-second-rite',sortOrder=0)
update('crypts-vestment',parentId='crypts-threshold',sortOrder=6)
update('crypts-holding',name='Threshold Hall',description='The main arrival chamber immediately inside the Iron Gate. Blue-flame sconces mark an open stone floor and a low waiting ledge. The Living Portrait hangs on the left-hand wall; the Vestment Alcove opens to one side. A descending passage leads toward the First Rite chamber. The entrance mouths lie beyond the gate behind you.',awarenessSummary='Arrival hall with portrait, preparation alcove and the route to First Rite.')
update('crypts-gate',description='An ordinary iron gate beneath a rune-cut arch, between the three arrival mouths and Threshold Hall. Beyond it the hall opens, with the Living Portrait on the left. This entrance gate is distinct from the three progression doors deeper below.')
update('crypts-first-rite',description='The first ritual level below Threshold Hall: a landing opening into the Chamber of Caresses, then the Door of First Touch at its far exit. Beyond that door the Breath Passage descends to Second Rite.')
update('crypts-door-1',description='A massive iron door at the far end of the Chamber of Caresses. Its carved relief belongs to the first stage. The runes warm in response to completion within this chamber; beyond the threshold lies the descending Breath Passage.')
memory('crypts-door-1','This is the exit from the first chamber, not its entrance. The established First Rite requirement is completed in the Chamber of Caresses. Success satisfies this door only. The onward connection leads to Breath Passage and begins blocked; the map owner must explicitly make it available. Retreat within First Rite remains possible.')
memory('crypts-chamber-1','The First Rite takes place here before the Door of First Touch. Apply the attached First Rite requirements. Completion satisfies that exit door, leading to Breath Passage; it does not satisfy any later stage.')
update('crypts-chamber-1',sortOrder=0)
update('crypts-door-1',sortOrder=1)
update('crypts-breath',description='A short descending stone hall immediately beyond the Door of First Touch. The air grows warmer between the first and second levels. Back up is the first door; ahead the passage opens into the Chamber of Mouths.')
update('crypts-door-2',description='The second carved iron door stands at the far exit of the Chamber of Mouths. The room and its side recess lie behind it; the stair toward the Chamber of Harmonies lies beyond. Warmth gathers at the seams.')
memory('crypts-door-2','This is the exit from Second Rite. The established Second Rite requirement is completed in the Chamber of Mouths. Success satisfies this door only. Its connection to the Chamber of Harmonies begins blocked and needs an explicit owner edit. Echo Niche is a side recess, not the route onward.')
memory('crypts-chamber-2','The Second Rite takes place here before the Door of Worship. Completion satisfies that exit door toward the Chamber of Harmonies. Echo Niche is an optional side recess, freely accessible from this chamber; entering it is not another stage.')
update('crypts-chamber-2',sortOrder=1);update('crypts-door-2',sortOrder=2);update('crypts-echo',sortOrder=3)
update('crypts-door-3',description='The third carved iron door occupies the far exit of the Chamber of Harmonies. Its three-figure relief faces into the chamber. Beyond the sealed threshold, a descending stair leads to Covenant and Approach Hall.')
memory('crypts-door-3','This is the exit from Union. The established Union requirement is completed in the Chamber of Harmonies. Success satisfies the Door of Three and permits the descent to Approach Hall after the owner opens its link. Physical admission to Covenant does not itself grant the altar boon.')
memory('crypts-chamber-3','The Union stage takes place here before the Door of Three. Apply its attached requirements. Completion satisfies that exit door toward Approach Hall; the final boon belongs at the Obsidian Altar. Vestment Alcove is upstairs beside Threshold Hall, not on this level.')
update('crypts-chamber-3',sortOrder=0);update('crypts-door-3',sortOrder=1)
update('crypts-approach',description='A long, damp stone hall reached by descending beyond the Door of Three. Blue flame here is almost white. Behind lies Union; ahead the hall opens onto the Obsidian Altar. Footsteps return with an unfamiliar delay.')
memory('crypts-vestment','Preparation and recovery alcove off Threshold Hall. Shelves hold the existing wraps, oils and belongings. It is not a rite chamber and does not lead around any progression door.')
by['crypts-vestment']['lorebookEntryIds']=['kgb9TZFKAi76k_WS1XGKe','ip_IdAbOuzBNe3y9zStfu']
