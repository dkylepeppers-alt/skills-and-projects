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
for a,b,label in [
 ('crypts-stair-mouth','crypts-gate','Poe entrance passage'),('crypts-tunnel-mouth','crypts-gate','Ravencroft entrance passage'),('crypts-crawlspace','crypts-gate','Crawlspace entrance passage'),
 ('crypts-gate','crypts-holding','Iron Gate and Threshold Hall'),('crypts-holding','crypts-portrait','Portrait recess on the hall’s left wall'),('crypts-holding','crypts-vestment','Preparation alcove'),
 ('crypts-holding','crypts-chamber-1','Stair between Threshold Hall and First Rite'),('crypts-chamber-1','crypts-door-1','First chamber’s far exit'),
 ('crypts-breath','crypts-chamber-2','Breath Passage and second chamber'),('crypts-chamber-2','crypts-echo','Side recess'),('crypts-chamber-2','crypts-door-2','Second chamber’s far exit'),
 ('crypts-chamber-3','crypts-door-3','Union chamber’s far exit'),('crypts-approach','crypts-altar','Sanctuary approach'),('crypts-altar','crypts-vault','Side vault'),('crypts-altar','crypts-seed','Niche behind the altar')]: edge(a,b,label)
gates=[('crypts-door-1','crypts-breath'),('crypts-door-2','crypts-chamber-3'),('crypts-door-3','crypts-approach')]
for a,b in gates:edge(a,b,'Progression door: '+by[a]['name'],'blocked')
entrances=[('nevermore-poe-statue','crypts-stair-mouth'),('ravencroft-iron-maiden','crypts-tunnel-mouth'),('dorms-common','crypts-crawlspace')]
for a,b in entrances:edge(a,b,'Concealed passage: '+by[b]['name'],'hidden')
memory('crypts-labyrinth','Physical order: Threshold, First Rite, Second Rite, Union, Covenant. Chamber precedes its progression door on each ritual level. Threshold and First Rite form the initial connected group; later stages are separate map roots to prevent parent-traversal bypasses. Their physical setting remains underground beneath Nevermore. Three concealed surface entrances require explicit reveal edits; narrative discovery does not change stored links. Preserve the existing stage requirements. No failed attempt relocates the party to another stage.')
memory('crypts-threshold','Arrival floor only. Three entrance mouths converge at the Iron Gate and Threshold Hall. The Living Portrait occupies the left wall inside; the Vestment Alcove branches from the hall. First Rite is below. No progression rite is performed on this floor.')
memory('dorms-common','A low service grille near the mail slots carries an intermittent cool draught and fine stone dust. Thing knows the crawlspace route behind it. This is the near-side clue to Crawlspace Mouth; the entrance remains concealed until deliberately revealed and its hidden connection is made available.')

# Ordinary circulation uses already-existing corridor/landing nodes.
rooms=['dorm-wednesday-enid','dorm-pugsley','dorm-bianca','dorm-nerissa']
for a in rooms:
    for b in rooms:unlink(a,b)
    unlink(a,'dorms-common');unlink('dorms-common',a)
update('dorms-upper',description='The shared upper corridor reached from the common-room stair. Wednesday and Enid’s door is at one end; Pugsley’s single, Bianca’s room and Nerissa’s room open from the same hall. Ordinary visits use this corridor, not connecting doors between bedrooms.')
bedrooms=['ravencroft-morticia-chamber','ravencroft-gomez-room','ravencroft-spare']
for a in bedrooms:
    for b in bedrooms:unlink(a,b)
for b in ['ravencroft-parlor','ravencroft-upper','ravencroft-walk']:
    unlink('ravencroft-morticia-chamber',b);unlink(b,'ravencroft-morticia-chamber')
edge('ravencroft-family','ravencroft-upper','Stair between family gallery and roof landing')
memory('ravencroft-family',by['ravencroft-family']['modelMemory']+' The gallery connects the bedrooms and the stair to the roof landing; the roof route does not pass through Morticia’s private room.')

# Approved woodland expansion: three sectors, nine detailed destinations.
woods=[
 ('woods-ridge','Ridge Woods','jericho-woods','region','🌲',84,24,
  'The higher woods outside the academy approach. Slate ledges break through damp leaf litter beneath spruce and bare hardwoods. A narrow ridge trail reaches Boundary Trail Junction; branches lead to Ridge Lookout and a weathered ranger cabin. Through gaps in the trees, Nevermore stands on the neighboring rise. The wind carries farther here than voices from the hollow.',
  'Outside the academy boundary. The junction leads to Academy Gates, Blackwater Hollow and Western Old Woods. The sector is usable as a forest scene, not merely a folder. No new crypt entrance is established here.'),
 ('woods-blackwater','Blackwater Hollow','jericho-woods','region','💧',46,71,
  'A lower wooded drainage on the townward side of the ridge. A dark stream works around mossed stones beneath alder and spruce; wet leaves collect in its shallows. Old Stone Bridge carries a narrow track across it. The abandoned sawmill lies along that track, with an old haul road continuing to a flooded quarry. Moving water masks quiet footsteps nearby.',
  'This is an outdoor drainage sector, separate from the academy lake. The stream is not a newly invented crypt route. Terrain and difficult crossings are narrative conditions unless separately implemented in travel state.'),
 ('woods-western','Western Old Woods','jericho-woods','region','🌳',28,33,
  'Older mixed forest beyond Nevermore’s western boundary. Massive roots climb over broken dry-stone field walls, and the canopy muffles the road. A faded track opens into Charcoal Clearing; lesser paths follow a ruined homestead wall toward a root cellar and bend deeper toward a standing-stone ring. Ravencroft remains inside the academy boundary, not in this sector.',
  'Reached from the boundary junction without passing through Ravencroft. No additional gate through the academy’s western wall is established. The ruins and stones have uncertain histories until play establishes more.'),
 ('woods-junction','Boundary Trail Junction','woods-ridge','place','🪧',50,66,
  'Three narrow tracks meet on a triangular patch of packed gravel beside a low boundary stone and two weathered timber posts. One rises toward Ridge Lookout, one descends toward the sawmill and Old Stone Bridge, and one follows a broken wall into Western Old Woods. The academy approach joins nearby on the gateward side. Footprints remain legible in the damp gravel.',
  'Primary woodland meeting and navigation point. The academy route ends at Academy Gates, not inside the walls. Trails are wide enough for walkers; this is not a paved vehicle junction.'),
 ('woods-lookout','Ridge Lookout','woods-ridge','place','🔭',75,25,
  'A wind-scoured slate ledge interrupts the ridge trees. Nevermore’s distant spires stand on a separate rise, while Jericho’s roofs lie lower through the mist. A leaning spruce and a split boulder identify the return path to Boundary Trail Junction. The open ledge exposes silhouettes against the sky; the forest edge offers shelter for a quiet conversation.',
  'Views are distant and weather-dependent; windows and individual people cannot be resolved by unaided sight. Return via the marked physical landmarks, not a direct descent over the ledge.'),
 ('woods-cabin','Weathered Ranger Cabin','woods-ridge','building','🛖',25,28,
  'A small weathered timber cabin stands back from the ridge trail under tall spruce. A shallow porch shelters a bench, a plain notice board and a stack of old firewood. Inside is a single modest room with a table, shelves and an unlit iron stove. Damp marks at the sill suggest intermittent use. The path returns toward the junction and lookout.',
  'One modest intermittently used shelter, not another permanent household. Do not assume an occupant, working utilities, stocked supplies or an established ownership history unless the scene provides them.'),
 ('woods-bridge','Old Stone Bridge','woods-blackwater','place','🌉',25,36,
  'A narrow, single-arch stone bridge spans the hollow’s stream. Low mossed parapets border a worn gravel deck, and a cracked capstone distinguishes the townward approach. The old track continues toward the sawmill; a return lane leads toward Jericho. Water sounds beneath the arch while the surrounding trees hide the next bend in either direction.',
  'The bridge is a landmark on the old woodland route, separate from the maintained academy drive. It is not the only mechanically possible passage through the sector; no hard crossing gate is implied.'),
 ('woods-sawmill','Abandoned Sawmill','woods-blackwater','building','🪵',60,47,
  'A roof-broken timber mill occupies a stone platform beside a remnant mill channel. An open loading yard faces the old track; rusted machinery stands beneath the surviving rafters. The bridge road approaches from the townward side, the ridge trail climbs beyond the yard, and a rutted haul track leads toward the flooded quarry. Wet boards and exposed iron give each footstep a different sound.',
  'Treat yard and visible mill shell as one scene location. No functioning machinery or detailed extra interior rooms are established. Routes toward bridge, junction and quarry are distinct and available.'),
 ('woods-quarry','Flooded Quarry','woods-blackwater','place','🪨',80,77,
  'The old haul track ends at a flooded stone excavation. Stepped grey faces descend into a dark pool, with drill scars and a rusted anchor ring remaining on the upper bench. Sparse birch grows in the spoil. The accessible rim offers a view across the cut; the same haul track returns to the sawmill. The industrial geometry makes this place unmistakably different from the academy lake.',
  'No submerged tunnel, crypt entrance, boat or automatic supernatural property is established. Distances and water depth are unspecified. Use the rim and haul track as the default arrival and return route.'),
 ('woods-clearing','Charcoal Clearing','woods-western','place','🪵',55,35,
  'A modest opening in the old forest holds two low circular earth platforms and scattered charcoal beneath the leaves. Grass has reclaimed the edges but the center remains open enough for a small gathering. The main track returns to Boundary Trail Junction; a broken field wall leads toward the root cellar, and a narrower path bends toward the standing stones.',
  'Former working clearing with no mandatory supernatural effect. It can host an ordinary meeting, rest stop or camp scene. Do not turn every visit into a ritual or encounter.'),
 ('woods-cellar','Root Cellar Ruin','woods-western','place','🧱',25,65,
  'A collapsed homestead foundation survives as low stone rectangles around a leaf-filled hollow. At one end, a short stair descends beneath a shallow surviving stone vault. The empty cellar is cool and close, with roots pressing between the joints. A broken boundary wall leads back to Charcoal Clearing. The foundation gives scale to the vanished house without explaining who lived there.',
  'A small physical cellar, not a passage into the crypt system. Ownership, abandonment date and any discoveries remain unestablished. Treat the foundation and cellar as one scene node until play justifies expansion.'),
 ('woods-stones','Standing-Stone Ring','woods-western','place','🗿',78,64,
  'Several waist- to shoulder-high weathered stones form a loose ring in a quiet forest pocket. Their rough surfaces carry lichen and natural cracks; a fallen stone leaves one obvious gap. Old trunks stand beyond the circle and a faint footpath returns toward Charcoal Clearing. No inscription explains the arrangement. In still weather, a dropped twig sounds conspicuously loud.',
  'Origin and purpose are unresolved. Do not assert a curse, portal, rite or historical culture from the arrangement alone. It is a revisitable landmark whose meaning can develop through evidence in play.')]
for id,name,parent,kind,icon,x,y,description,mem in woods:
    l=dict(id=id,parentId=parent,name=name,kind=kind,description=description,modelMemory=mem,icon=icon,lorebookEntryIds=[],childPresentation='list',placement=dict(x=x,y=y),links=[],status='active',sortOrder=len(locs),useReferenceImage=False)
    locs.append(l);by[id]=l;pack['hierarchyProfile']['locationTypeIds'][id]='type_'+kind
for a,b,label in [
 ('jericho-town','woods-bridge','Old town track'),('woods-bridge','woods-sawmill','Mill track'),('woods-sawmill','woods-junction','Ridge trail'),('woods-junction','nevermore-gates','Academy approach'),
 ('woods-junction','woods-lookout','Upper ridge path'),('woods-junction','woods-cabin','Cabin path'),('woods-lookout','woods-cabin','Sheltered ridge spur'),('woods-sawmill','woods-quarry','Old haul track'),
 ('woods-junction','woods-clearing','Western boundary trail'),('woods-clearing','woods-cellar','Broken field-wall path'),('woods-clearing','woods-stones','Old forest footpath')]:edge(a,b,label)
by['jericho-woods']['description'] += ' Ridge Woods occupy the higher academy approach; Blackwater Hollow is the lower townward drainage; Western Old Woods lie beyond the academy’s western boundary. The maintained town-to-academy road and the old woodland tracks are separate routes.'
by['nevermore-gates']['description'] += ' A woodland footpath from Boundary Trail Junction meets the approach outside these gates.'
by['jericho-town']['description'] += ' An old track leaves toward Old Stone Bridge and the abandoned mill in Blackwater Hollow.'
# Marker positions follow the reviewed high-oblique regional overview, not distances.
for id,x,y in [('jericho-town',16,74),('nevermore-grounds',76,17),('woods-ridge',87,38),('woods-western',25,28),('woods-blackwater',60,77)]:
    by[id]['placement']={'x':x,'y':y}

# Preserve directional labels using two unidirectional records when both exist.
# A sole symmetric record stays bidirectional; blocked/hidden controls stay canonical.
seen=set()
for l in locs:
    for a in l['links']:
        key=tuple(sorted([l['id'],a['targetId']]))
        if key in seen:continue
        seen.add(key)
        rev=next((v for v in by[a['targetId']]['links'] if v['targetId']==l['id']),None)
        if rev and a.get('state')==rev.get('state')=='available':
            a['bidirectional']=False;rev['bidirectional']=False

global_ids='''jericho-woods jericho-town jericho-main-street nevermore-grounds
nevermore-gates nevermore-quad nevermore-poe-statue nevermore-lake nevermore-oaks nevermore-cemetery nevermore-dead-gardens nevermore-botany nevermore-main-hall nevermore-dorms
main-hall-foyer main-hall-weems main-hall-dining main-hall-classrooms main-hall-fencing
dorms-common dorms-upper dorm-wednesday-enid
ravencroft-gates ravencroft-manor ravencroft-basement ravencroft-iron-maiden ravencroft-parlor ravencroft-family ravencroft-morticia-chamber ravencroft-walk
crypts-labyrinth crypts-holding crypts-first-rite crypts-chamber-1 crypts-door-1 crypts-second-rite crypts-chamber-2 crypts-door-2 crypts-union crypts-chamber-3 crypts-door-3 crypts-covenant crypts-altar
woods-ridge woods-blackwater woods-western woods-junction woods-bridge woods-sawmill woods-lookout'''.split()
index_path=ROOT/'source/global-index.json'
if index_path.exists():global_ids=read(index_path)['globalIndexIds']
assert len(global_ids)==len(set(global_ids))==50
assert all(id in by and by[id]['status']=='active' for id in global_ids)
pack['definition']['locations']=[by[i] for i in global_ids]+[l for l in locs if l['id'] not in global_ids]
assert len(pack['definition']['locations'])==79
write(ROOT/'source/global-index.json',dict(globalIndexIds=global_ids,policy='First 50 active records; remaining records retain regional source order. Promote deliberately, never drop a location.'))

# Correct only affected spatial facts in recovered lore; original export is retained.
lore_source=ROOT/'source/original-lore.marinara.json'
if not lore_source.exists():
    raise FileNotFoundError('Missing source/original-lore.marinara.json; restore the tracked source lorebook.')
lore=read(lore_source);entries={e['name']:e for e in lore['data']['entries']}
entries['First Rite']['content']=entries['First Rite']['content'].replace('Chamber of Caresses beyond is','Chamber of Caresses before the door is').replace('Breath Passage continues down toward Second Rite when the door has opened.','The chamber is entered first. Completion satisfies the Door of First Touch at its far exit, beyond which Breath Passage descends into Second Rite.')
entries['Second Rite']['content'] += ' Spatial order: Breath Passage, Chamber of Mouths, then Door of Worship at the chamber’s far exit. Completion satisfies that door toward the Chamber of Harmonies. Echo Niche is a side recess, not the onward route.'
entries['Union']['content']=entries['Union']['content'].replace('Vestment Alcove holds what previous descents left: wraps, oils, nothing modern.','Vestment Alcove is upstairs off Threshold Hall and holds wraps, oils and belongings.').replace('Completing Union does not open Covenant.','Completion satisfies the Door of Three at the far exit of the Chamber of Harmonies, permitting the descent to Approach Hall. Admission to Covenant does not itself grant the altar boon.')
entries['Crypt laterals']['content']='Crypt laterals and arrival circulation. Threshold Hall, formerly called Holding Dark, is the main arrival hall immediately inside the Iron Gate. The Living Portrait hangs on its left wall; Vestment Alcove opens to one side for preparation, waiting and recovery. Poe Stair-Mouth, Ravencroft Tunnel-Mouth and Crawlspace Mouth converge at the gate. These are arrivals, not rites. The Iron Gate is an ordinary arrival gate, distinct from the three controlled progression doors. Echo Niche branches from the second chamber; Relic Vault and Seed Niche branch from the altar sanctuary.'
entries['The Crypts of Nevermore']['content'] += ' The chamber comes before its progression door on each ritual floor. The full physical sequence is Threshold Hall, first chamber, first door, Breath Passage, second chamber, second door, third chamber, third door, Approach Hall, altar. Separate map roots express access boundaries, not separate geographic crypts.'
entries['Ravencroft wings']['content'] += ' Ordinary bedroom visits and access to the roof landing use the family gallery; no route requires passage through Morticia’s bedroom.'
write(ROOT/'source/revised-lore.marinara.json',lore)

directory_book={'lorebook':{'id':'nevermore-v2-directories','name':'Nevermore Regional Directories v2','enabled':True,'tokenBudget':4096,'entryLimit':4,'recursiveScanning':False,'maxRecursionDepth':1},'entries':[],'folders':[]}
directory_specs=[
 ('woods','Jericho Woodlands Directory',[l['id'] for l in locs if l['id'].startswith('woods-')]+['jericho-woods','jericho-town','jericho-main-street'],
  'Outdoor sectors of Jericho Woodlands: Ridge Woods [woods-ridge], Blackwater Hollow [woods-blackwater], Western Old Woods [woods-western]. Main woodland loop: Jericho > Old Stone Bridge [woods-bridge] > Abandoned Sawmill [woods-sawmill] > Boundary Trail Junction [woods-junction] > Academy Gates. Ridge branches: Ridge Lookout [woods-lookout], Weathered Ranger Cabin [woods-cabin]. Sawmill haul track: Flooded Quarry [woods-quarry]. Western branch: Charcoal Clearing [woods-clearing], then Root Cellar Ruin [woods-cellar] or Standing-Stone Ring [woods-stones]. Ravencroft remains inside academy grounds. These woods add no crypt entrances.'),
 ('campus','Nevermore Campus Directory',[l['id'] for l in locs if (l['id'].startswith(('nevermore-','main-hall-','dorm')))],
  'Nevermore: Academy Gates [nevermore-gates], Quad [nevermore-quad], Poe Statue [nevermore-poe-statue], Lake [nevermore-lake], Old Oaks [nevermore-oaks], Dead Gardens [nevermore-dead-gardens], Cemetery [nevermore-cemetery], Botany Houses [nevermore-botany]. Main Academic Hall: Foyer, Weems’s Office, Dining Hall; upper Classroom Corridor and Fencing Salle. Dorm Common Room [dorms-common] leads to Dorm Upper Floor [dorms-upper], the shared corridor for Wednesday and Enid [dorm-wednesday-enid], Pugsley [dorm-pugsley], Bianca [dorm-bianca], Nerissa [dorm-nerissa]. Ravencroft occupies western academy land. Boundary Trail Junction [woods-junction] joins the approach outside Academy Gates.'),
 ('ravencroft','Ravencroft Directory',[l['id'] for l in locs if l['id'].startswith('ravencroft-')],
  'One house on western Nevermore grounds. Gates [ravencroft-gates] connect to Dead Gardens and Cemetery. Main floor: Parlor [ravencroft-parlor], Morticia’s Greenhouse [ravencroft-greenhouse]. Basement [ravencroft-basement]: Meditation Chamber [ravencroft-meditation], Iron Maiden Closet [ravencroft-iron-maiden]. Family Wing [ravencroft-family] is the shared gallery for Morticia [ravencroft-morticia-chamber], Gomez [ravencroft-gomez-room], Spare Chamber [ravencroft-spare]; it connects to the roof landing [ravencroft-upper] and Widow’s Walk [ravencroft-walk]. Bedrooms have no connecting doors. Wednesday and Pugsley live in the dorms.'),
 ('crypt','Crypt Route and Stage Directory',[l['id'] for l in locs if l['id'].startswith('crypts-')],
  'One underground complex with five physical levels. Arrival mouths converge at Iron Gate, then Threshold Hall [crypts-holding]; Living Portrait and Vestment Alcove branch here. Descent: Chamber of Caresses [crypts-chamber-1] > Door of First Touch [crypts-door-1] > Breath Passage [crypts-breath] > Chamber of Mouths [crypts-chamber-2] > Door of Worship [crypts-door-2] > Chamber of Harmonies [crypts-chamber-3] > Door of Three [crypts-door-3] > Approach Hall [crypts-approach] > Obsidian Altar [crypts-altar]. Echo Niche branches from the second chamber. Relic Vault and Seed Niche branch from the altar. Each stage satisfies only its exit door; reaching the altar is not the boon. Later map roots preserve gate boundaries; stored hidden/blocked links need explicit owner edits.')]
for key,name,targets,content in directory_specs:
    id='nevermore-directory-v2-'+key
    directory_book['entries'].append(dict(id=id,name=name,content=content,folderId=None,enabled=True,constant=False,keys=[],position=0,order=100,preventRecursion=True,excludeRecursion=True,probability=100))
    for target in targets:by[target]['lorebookEntryIds']=[id]+by[target]['lorebookEntryIds']
write(ROOT/'source/directories.marinara.json',directory_book)
write(ROOT/'source/lore-links.json',{l['id']:[{'id':id} for id in l['lorebookEntryIds']] for l in pack['definition']['locations']})
write(ROOT/'source/map.json',pack)
old={l['id']:l for l in original['definition']['locations']}
changes=[]
for l in pack['definition']['locations']:
    if l['id'] not in old:changes.append({'id':l['id'],'operation':'add','parentId':l['parentId']});continue
    changes.append({'id':l['id'],'fields':{k:{'before':old[l['id']].get(k),'after':l.get(k)} for k in sorted(set(l)|set(old[l['id']])) if old[l['id']].get(k)!=l.get(k)}})
write(ROOT/'source/change-manifest.json',dict(sourceSha256=hashlib.sha256((ROOT/'source/original.world-map.json').read_bytes()).hexdigest(),changes=changes,controlledEntrances=entrances,progressionGates=gates))
print('Built editable source:',len(locs),'locations; 50 strategic records; 26 recovered source lore entries available plus four directories.')
