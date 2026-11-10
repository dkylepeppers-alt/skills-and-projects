"""Authored content for the Thompson Home expansion (Golden Triangle).

Pure data: new locations, links, map canvases, hierarchy types, link styles
and directory lore. build.py merges this onto the live "Thompson Home" map.

Canon sources: the "Thompson Family" lorebook and the character cards in the
user's Marinara install. Anything those do not state (room layouts, hall names,
drive times) is map-authored and says so in modelMemory.
"""

AUTHORED = "Map-authored layout: canon does not describe this place room by room, so the scene may refine fixtures and decor. "

# --------------------------------------------------------------------------
# Hierarchy types added to the existing nine
# --------------------------------------------------------------------------
NEW_TYPES = [
    {"id": "area", "label": "Region", "baseKind": "region", "description": "Multi-town area crossed by car."},
    {"id": "town", "label": "Town / City", "baseKind": "settlement"},
    {"id": "road", "label": "Road / Travel Hub", "baseKind": "place", "description": "Roads, exits and parking where car trips begin and end."},
    {"id": "street", "label": "Residential Street", "baseKind": "place"},
    {"id": "home", "label": "Home", "baseKind": "building", "description": "A family home outside the Thompson lot."},
    {"id": "civic", "label": "Town Landmark", "baseKind": "building", "description": "School, church, store or other public building."},
    {"id": "venue", "label": "Public Venue", "baseKind": "place", "description": "Park, stadium, riverfront or nightlife district."},
    {"id": "campus", "label": "Campus", "baseKind": "place"},
    {"id": "campus-hall", "label": "Campus Building", "baseKind": "building"},
    {"id": "dorm", "label": "Residence Hall", "baseKind": "building"},
    {"id": "dorm-floor", "label": "Dorm Floor", "baseKind": "floor"},
    {"id": "plant", "label": "Industrial Site", "baseKind": "place"},
    {"id": "plant-area", "label": "Plant Area (badge only)", "baseKind": "place", "description": "Inside the refinery fence; badge and PPE required."},
    {"id": "plant-building", "label": "Plant Building", "baseKind": "building"},
]

# --------------------------------------------------------------------------
# Locations. Tuple: id, parent, name, kind, type, icon, presentation, lore keys,
# description, modelMemory
# Lore keys: A orientation, H homes, V Vidor, L Lamar, R refinery
# --------------------------------------------------------------------------
N = []


def add(id, parent, name, kind, type_, icon, desc, mem="", pres="list", lore="A", layer=None):
    N.append(dict(id=id, parent=parent, name=name, kind=kind, type=type_, icon=icon,
                  desc=desc, mem=mem, pres=pres, lore=lore, layer=layer))


# ---- Region ---------------------------------------------------------------
add("setx", None, "Golden Triangle", "region", "area", "🗺️",
    "Southeast Texas between the Neches and Sabine rivers. Interstate 10 runs east-west through all three towns: Beaumont on the west bank of the Neches, Vidor in the pines about ten miles east, and Orange another fifteen miles on, at the Louisiana line. Refinery flares light the western horizon at night.",
    "Regional overview for car travel. Towns are a drive apart, never a walk. Distances and drive times are approximate real-world geography, not canon measurements. Use the directory lore for who lives where.",
    pres="map")
add("setx.i10", "setx", "Interstate 10", "place", "road", "🛣️",
    "The interstate that ties the family's days together. Westbound it climbs the Neches River bridge into Beaumont, with the refinery stacks to the south; eastbound it runs through pine flats past the Vidor exits to Orange and the Sabine. Shift-change traffic thickens it twice a day.",
    "Travel hub, not a destination: use it for scenes in a moving vehicle or to route between towns. Vidor to Beaumont is roughly 15 to 25 minutes; Vidor to Orange roughly 15 to 20. Which vehicle and who is driving must come from the scene.")

# ---- Vidor ----------------------------------------------------------------
add("vidor", "setx", "Vidor", "settlement", "town", "🌲",
    "A small, conservative Orange County town strung along Main Street north of Interstate 10. Subdivisions and older frame houses sit under tall pines; Friday-night football, church on Sunday and who was seen with whom are the local currency. The Thompsons, Raelynn and Macy all live here or just outside it.",
    "Everyone here knows the Thompsons by sight. Public behavior in town is noticed and repeated; private matters stay behind house doors. Street names and addresses beyond Main Street are unspecified.",
    pres="map", lore="AV")
add("vidor.street", "vidor", "The Thompsons' Street", "place", "street", "🏘️",
    "A quiet residential street in a manicured Vidor subdivision, running north-south with houses on deep fenced lots. The Thompson house stands on the east side facing west. Raelynn's place is a few houses down on the same side, close enough to walk in under two minutes. Mailboxes, trimmed St. Augustine lawns and parked pickups line the curb.",
    "The street and subdivision are unnamed in canon; do not invent a street name unless the user supplies one. Neighbors can see front yards and driveways but not fenced backyards. Raelynn habitually walks over and lets herself in through the Thompsons' back door.",
    pres="map", lore="AH")
add("vidor.street.entrance", "vidor.street", "Subdivision Entrance", "place", "road", "🚏",
    "The south end of the street, where it meets the feeder road toward Main Street. A brick entry sign, a stop sign and a cluster of community mailboxes mark the way out of the subdivision.",
    "Map-authored connector. The subdivision name on the sign is unspecified.", lore="AV")
add("vidor.main", "vidor", "Main Street", "place", "road", "🚦",
    "Vidor's north-south spine, Farm Road 105, crossing under Interstate 10 at the south end of town. Gas stations, drive-throughs, a pharmacy and feed-store lots line it; most errands and every trip to the interstate pass along here.",
    "Town travel hub. Businesses other than the named map locations are generic and may be supplied by the scene.", lore="AV")
add("vidor.market", "vidor", "Market Basket", "building", "civic", "🛒",
    "The grocery store anchoring the shopping center near Main Street and the interstate. Hot parking lot, rattling carts, bright aisles, and the same familiar faces at the registers. This is where Laura does the family shopping and where she is most often seen in public.",
    "A public stage: Laura manages her image here and neighbors notice who she is with. Other storefronts in the strip are generic.", lore="AV")
add("vidor.high", "vidor", "Vidor High School", "building", "civic", "🏫",
    "The town's high school and the center of its social life. Kyle Jr. is a senior here, along with Brody Balleaux and his friends Mason and Beau. Jennifer and Melissa co-captained the varsity cheer squad before graduating; Laura cheered here twenty years ago and has never quite left.",
    "Students present are 18-year-old seniors unless the scene states otherwise. Interior rooms are not mapped; classrooms, halls and the gym may be narrated generically. School-day access for adults runs through the front office.",
    lore="AV")
add("vidor.high.parking", "vidor.high", "Student Parking Lot", "place", "road", "🅿️",
    "A sun-bleached asphalt lot beside the school, full of lifted trucks and hand-me-down sedans. Tailgates drop after the last bell; this is where rides are arranged and rumors start.",
    "", lore="AV")
add("vidor.high.stadium", "vidor.high", "Pirate Stadium", "place", "venue", "🏈",
    "The football field and bleachers behind the school. On fall Friday nights most of Vidor is in these stands: band, cheer squad on the track, booster-club mothers in the good seats. Brody plays wide receiver under these lights.",
    "Game nights are public and crowded; on other days the field is used for practice and is otherwise empty.", lore="AV")
add("vidor.church", "vidor", "Family Church", "building", "civic", "⛪",
    "The church the Thompsons attend on Sundays: brick sanctuary, fellowship hall, a gravel overflow lot. Laura treats the pews and the potluck line as part of the family's public image.",
    "Canon says only that the family attends church. The congregation's name, denomination and pastor are unspecified; do not invent them unless the user does.", lore="AV")
add("vidor.park", "vidor", "Claiborne West Park", "place", "venue", "🌳",
    "A wooded county park east of town off the interstate: pine and hardwood shade, picnic shelters, ponds, walking trails and ball fields. It fills for weekend events and is nearly empty on weekday afternoons.",
    "Public outdoor space. Trails offer privacy by distance only; nothing here is enclosed.", lore="AV")

# ---- Raelynn's place -------------------------------------------------------
add("raelynn.property", "vidor.street", "Raelynn's Place", "place", "grounds", "🏡",
    "Raelynn Smith's home, a few houses down from the Thompsons on the same side of the street: a modest single-story house on a fenced lot, street to the west and backyard to the east. She moved here with Kenna after the divorce. The lawn is the one Kyle Jr. mows.",
    AUTHORED + "Canon facts: Raelynn (36) lives here; her daughter Kenna (18) comes home from Lamar most weekends with laundry; Kyle Sr. and increasingly Kyle Jr. handle every repair and yard job. Laura notices each visit and says nothing.",
    pres="map", lore="AH")
add("raelynn.front", "raelynn.property", "Raelynn's Front Yard & Driveway", "place", "grounds", "🚗",
    "A short concrete driveway and a patch of lawn facing the street. Raelynn's car sits here; a second space fills on weekends when Kenna drives in from Beaumont. Flower pots crowd the front step.",
    "Vehicles are unspecified: do not invent makes or models. From here it is a two-minute walk north to the Thompsons' front lawn or round by their north gate to the back.", lore="AH")
add("raelynn.house", "raelynn.property", "Raelynn's House", "building", "home", "🏠",
    "A single-story three-bedroom-sized house lived in by two: living room at the front, kitchen at the back opening onto the porch, a short hall to the bedrooms and bath. Comfortable, a little cluttered, always something baking or something that needs fixing.",
    AUTHORED + "The house is tidy enough but never staged, the opposite of Laura's. Something is usually broken and waiting for Kyle Sr. or Jr.: a dripping faucet, a sticking door, a dead battery.",
    pres="map", lore="AH")
add("raelynn.living", "raelynn.house", "Raelynn's Living Room", "room", "room", "🛋️",
    "The front room: a deep couch with a throw blanket, a television, Kenna's school photos on the wall. The front door opens straight into it from the step.",
    AUTHORED, lore="H")
add("raelynn.kitchen", "raelynn.house", "Raelynn's Kitchen", "room", "room", "🧁",
    "A bright kitchen at the back of the house, counters usually dusted with flour. A small table sits by the window; the back door beside it opens onto the porch. A six-pack of Shiner is rarely far from the refrigerator shelf.",
    AUTHORED + "Raelynn bakes when restless and rearranges things on the counter while she talks.", lore="H")
add("raelynn.laundry", "raelynn.house", "Raelynn's Laundry Nook", "room", "room", "🧺",
    "A washer and dryer behind folding doors off the kitchen. On weekends it runs nonstop with the bag of laundry Kenna brings home from Lamar.",
    AUTHORED, lore="H")
add("raelynn.hall", "raelynn.house", "Raelynn's Hallway", "place", "passage", "🚪",
    "A short hall off the living room with three doors: Kenna's room, the bathroom and Raelynn's bedroom at the back.",
    AUTHORED, lore="H")
add("raelynn.bedroom", "raelynn.house", "Raelynn's Bedroom", "room", "room", "🛏️",
    "The back bedroom, facing the yard: an unmade queen bed, sundresses over a chair, a window unit humming in summer.",
    AUTHORED + "Private space. Raelynn does not discuss her marriage here or anywhere unless she trusts someone completely.", lore="H")
add("raelynn.kenna", "raelynn.house", "Kenna's Room", "room", "room", "💅",
    "Kenna's bedroom at the front of the house, kept as she left it for college: ring light, mirror, cheer ribbons, a closet that still overflows. She sleeps here on the weekends she comes home.",
    AUTHORED + "Kenna (18) lives in a Lamar residence hall during the week and is here most weekends.", lore="H")
add("raelynn.bath", "raelynn.house", "Raelynn's Bathroom", "room", "room", "🚿",
    "The one full bathroom, shared: tub with a shower curtain, a counter split between Raelynn's few products and Kenna's many.",
    AUTHORED + "The faucet and other fixtures are typical candidates for the next handyman call.", lore="H")
add("raelynn.porch", "raelynn.property", "Raelynn's Back Porch", "place", "grounds", "🍺",
    "A covered back porch with a wooden railing and posts, a couple of mismatched chairs and a cooler. Raelynn leans on the post here with a beer in the evenings; the kitchen door is right behind her.",
    "The porch, railing and post are canon. Furniture beyond that is map-authored.", lore="H")
add("raelynn.yard", "raelynn.property", "Raelynn's Backyard", "place", "grounds", "🌿",
    "A fenced back lawn with a clothesline, a shade tree and a storage shed. The grass is kept short because Kyle Jr. keeps it that way.",
    AUTHORED + "No pool. The fence does not adjoin the Thompson lot; other houses sit between.", lore="H")

# ---- Macy's house ----------------------------------------------------------
add("macy.home", "vidor", "Macy's House", "building", "home", "🏠",
    "Macy Balleaux's house on the wooded edge of Vidor: a neat, well-kept place she earned the hard way, with a porch out front and a tree line behind that catches the sunset. She lives here with her son Brody.",
    AUTHORED + "Canon facts: Macy (38) lives near Vidor with Brody (18), a Vidor High senior, and raised him mostly alone. She grew up poor in a single-wide in Orange County; nothing about this house or her shows it, and it must never be played as a trailer-park caricature. Book club meets here when it is her turn.",
    pres="map", lore="AH")
add("macy.drive", "macy.home", "Macy's Driveway", "place", "road", "🚙",
    "A driveway off a two-lane road under the pines. Brody's truck is usually here unless he is at practice or staying at Mason's.",
    "Brody's truck is canon; its make and color are not. Macy's vehicle is unspecified.", lore="AH")
add("macy.porch", "macy.home", "Macy's Front Porch", "place", "grounds", "🪑",
    "A covered front porch with a swing and potted ferns. Evenings out here come with a glass of wine and whoever stopped by.",
    "The porch swing is canon.", lore="H")
add("macy.living", "macy.home", "Macy's Living Room", "room", "room", "🛋️",
    "An easy, lived-in front room: big soft couch, low lamps, a speaker on the shelf. When Macy hosts book club the bottles end up on this coffee table.",
    AUTHORED, lore="H")
add("macy.kitchen", "macy.home", "Macy's Kitchen", "room", "room", "🍷",
    "A warm kitchen that smells of rosemary. Macy stands at the counter with a wine glass and her phone; the window over the sink looks west to the tree line and the last orange light of the day. Bar stools line the counter.",
    "The counter, window to the tree line and bar stools are canon. Other fixtures are map-authored.", lore="H")
add("macy.bedroom", "macy.home", "Macy's Bedroom", "room", "room", "🛏️",
    "Macy's room at the back of the house: a wide bed, jewelry scattered on the dresser, tank tops and cutoffs in the laundry basket.",
    AUTHORED, lore="H")
add("macy.brody", "macy.home", "Brody's Room", "room", "room", "🏈",
    "Brody's bedroom: football gear in the corner, a varsity jacket on the door, a bed that is never made.",
    AUTHORED + "Brody (18) is often out: practice, Mason's place, or with Mason and Beau.", lore="H")
add("macy.bath", "macy.home", "Macy's Bathroom", "room", "room", "🚿",
    "The hall bathroom shared by mother and son, steamed up most evenings after practice.",
    AUTHORED, lore="H")
add("macy.deck", "macy.home", "Macy's Back Deck", "place", "grounds", "🌅",
    "A plank deck off the kitchen facing the pines. A grill, two chairs and nothing behind the yard but trees, so it is private in a way town lots are not.",
    AUTHORED, lore="H")

# ---- Orange ----------------------------------------------------------------
add("orange", "setx", "Orange", "settlement", "town", "🍊",
    "The county seat, on the Sabine River at the Louisiana line, about fifteen miles east of Vidor on Interstate 10. Older money, shipyard history, bayous and cypress at its edges, and a Cajun current that gets stronger toward the river. Lacy and Ashton both live on this side of the county.",
    "Canon places Lacy only in 'Orange County' and Ashton near the 'Golden Triangle / Sabine border'. Putting both homes in Orange is a map-authored choice; neighborhoods and addresses are unspecified.",
    pres="map", lore="AH")
add("orange.riverfront", "orange", "Sabine Riverfront", "place", "venue", "🌊",
    "Orange's downtown edge along the Sabine: a boardwalk, a pavilion, old brick storefronts and the slow brown river with Louisiana on the far bank.",
    "Generic public venue for meetings away from Vidor eyes. Named businesses are unspecified.")
add("lacy.home", "orange", "Lacy's House", "building", "home", "🏡",
    "Lacy Williams's house: the showpiece of the book club circuit. Marble countertops, tile floors, plantation shutters striping the afternoon sun, everything chosen to be noticed. She lives here with her son Mason.",
    AUTHORED + "Canon facts: Lacy (38), former homecoming queen, lives in Orange County with Mason (18). The marble kitchen island, tile floor, plantation shutters and a bathtub she takes calls from are canon. A husband or partner is not established. Book club meets here on her turn and she starts the group chat.",
    pres="map", lore="AH")
add("lacy.drive", "lacy.home", "Lacy's Driveway & Front Entry", "place", "road", "🚘",
    "A wide driveway curving to a double front door flanked by planters. Mason's vehicle is gone most afternoons while he is at practice.",
    AUTHORED + "Vehicles are unspecified.", lore="AH")
add("lacy.great", "lacy.home", "Lacy's Great Room", "room", "room", "🛋️",
    "A tall, open living space with pale furniture, a stone fireplace and shuttered windows. Book club spreads out here with the wine on the low table.",
    AUTHORED, lore="H")
add("lacy.kitchen", "lacy.home", "Lacy's Kitchen", "room", "room", "🥤",
    "Marble island, tile floor, plantation shutters, a blender that sees daily use. Lacy leans a hip on the island with her phone, answering the book-club chat in single lines.",
    "Island, marble, tile and shutters are canon.", lore="H")
add("lacy.suite", "lacy.home", "Lacy's Bedroom", "room", "room", "🛏️",
    "The primary bedroom: a made bed with too many pillows, a full-length mirror and a walk-in closet of fitted jeans and tailored dresses.",
    AUTHORED, lore="H")
add("lacy.bath", "lacy.home", "Lacy's Bathroom", "room", "room", "🛁",
    "The primary bath, built around a deep soaking tub. Lacy has been known to record voice notes for the group chat from it.",
    "The bathtub voice note is canon. Other fixtures are map-authored.", lore="H")
add("lacy.mason", "lacy.home", "Mason's Room", "room", "room", "🎮",
    "Mason's bedroom at the far end of the house: gym bag, game console, protein tubs on the desk.",
    AUTHORED + "Mason (18) is at practice most afternoons. Brody often stays the night here.", lore="H")
add("lacy.patio", "lacy.home", "Lacy's Back Patio", "place", "grounds", "☀️",
    "A covered patio behind the great room with cushioned seating and a ceiling fan, screened from the neighbors by a hedge.",
    AUTHORED + "No pool is established.", lore="H")
add("ashton.home", "orange", "Ashton's House", "building", "home", "🏠",
    "Ashton Cessac's house toward the river side of Orange: single-story, shaded by live oaks, with a ceiling fan turning in every room and something Cajun on the stove more often than not. She lives here with her son Beau.",
    AUTHORED + "Canon facts: Ashton (38), former cheerleader from Laura's squad with Louisiana Cajun roots, lives near the Sabine border with Beau (18). The living-room ceiling fan, hallway mirror, kitchen island and Beau's room down the hall are canon. A husband or partner is not established. Book club meets here on her turn.",
    pres="map", lore="AH")
add("ashton.drive", "ashton.home", "Ashton's Driveway & Front Door", "place", "road", "🚗",
    "A shell-gravel driveway under a live oak, a few steps up to a front door with a wreath on it.",
    AUTHORED + "Vehicles are unspecified.", lore="AH")
add("ashton.living", "ashton.home", "Ashton's Living Room", "room", "room", "🛋️",
    "A comfortable front room where the ceiling fan ticks through lazy rotations, pushing warm air around without accomplishing much.",
    "The ticking ceiling fan is canon.", lore="H")
add("ashton.hall", "ashton.home", "Ashton's Hallway", "place", "passage", "🪞",
    "The central hall, with a full-length mirror Ashton checks every outfit in. Beau's door is at the end; bass from his speaker carries down it.",
    "The hallway mirror and Beau's music are canon.", lore="H")
add("ashton.kitchen", "ashton.home", "Ashton's Kitchen", "room", "room", "🍲",
    "A kitchen built around an island where her phone and a glass of sweet tea usually sit. Rosé for book club chills in the refrigerator door.",
    "The island is canon.", lore="H")
add("ashton.bedroom", "ashton.home", "Ashton's Bedroom", "room", "room", "🛏️",
    "Ashton's bedroom: wrap dresses on the closet door, perfume on the vanity, the shutters half closed against the heat.",
    AUTHORED, lore="H")
add("ashton.beau", "ashton.home", "Beau's Room", "room", "room", "🔊",
    "Beau's bedroom at the end of the hall, door usually shut, a bass speaker thudding behind it.",
    AUTHORED + "Beau (18) runs with Brody and Mason.", lore="H")
add("ashton.porch", "ashton.home", "Ashton's Screened Porch", "place", "grounds", "🦟",
    "A screened back porch with a ceiling fan and wicker chairs, looking onto a yard that slopes toward cypress and standing water.",
    AUTHORED, lore="H")

# ---- Beaumont --------------------------------------------------------------
add("beaumont", "setx", "Beaumont", "settlement", "town", "🏙️",
    "The city across the Neches River, ten miles west of Vidor: where the work and the school are. The refinery spreads along the river on the east side of town; Lamar University sits to the south off Martin Luther King Jr. Parkway; downtown lies between. Far enough from Vidor that people behave differently here.",
    "What happens in Beaumont reaches Vidor only if someone carries it back. Businesses and streets beyond the mapped locations are generic.",
    pres="map")
add("beaumont.crockett", "beaumont", "Crockett Street District", "place", "venue", "🍸",
    "Downtown Beaumont's block of restored brick buildings turned bars, patios and music rooms. Thursday through Saturday it fills with Lamar students and refinery crews off shift.",
    "Beaumont nightlife is canon for Kenna; this district is a map-authored stage for it. Texas drinking age is 21: the twins (19) and Kenna (18) drink here only by whatever means the scene establishes. Named bars are unspecified.", lore="AL")

# Lamar
add("lamar", "beaumont", "Lamar University", "place", "campus", "🎓",
    "The south Beaumont campus where Jennifer, Melissa and their cousin Kenna are freshmen: brick buildings and live oaks east of Martin Luther King Jr. Parkway, with the arena and stadium across it to the west. Cardinal red everywhere. Home is a twenty-minute drive, which is exactly far enough.",
    "Canon facts: the twins (19) share a dorm room and are trying out for Lamar's competitive cheer team; Kenna (18) is rushing a sorority and goes home to Vidor most weekends. Building names are real; their arrangement on this map is schematic, not a campus survey.",
    pres="map", lore="AL")
add("lamar.parking", "lamar", "Lamar Student Parking", "place", "road", "🅿️",
    "The big student lot at the south edge of campus. Every trip home to Vidor starts and ends here; so does every night out.",
    "Campus travel hub. Which car the twins or Kenna drive is unspecified.", lore="AL")
add("lamar.quad", "lamar", "Lamar Quad", "place", "campus", "🌳",
    "The central lawn under live oaks, crossed by brick walks between classes. Student-organization tables, flyers for rush week, someone always filming something.",
    "Hub for foot traffic between campus buildings.", lore="L")
add("lamar.library", "lamar", "Mary and John Gray Library", "building", "campus-hall", "📚",
    "The eight-story library tower at the center of campus, the tallest thing in sight. Quiet floors, group study rooms, a view over south Beaumont from the upper windows. Jennifer's natural habitat.",
    "Upper floors are quiet and sparsely occupied late in the evening.", lore="L")
add("lamar.ssc", "lamar", "Setzer Student Center", "building", "campus-hall", "☕",
    "The student union: food court, coffee line, bookstore, ballroom and meeting rooms. Sorority rush events and student-organization fairs run through here.",
    "", lore="L")
add("lamar.dining", "lamar", "Brooks-Shivers Dining Hall", "building", "campus-hall", "🍽️",
    "The residential dining hall beside Cardinal Village. Trays, long tables, the whole freshman class cycling through three times a day.",
    "", lore="L")
add("lamar.rec", "lamar", "Sheila Umphrey Recreational Sports Center", "building", "campus-hall", "🏋️",
    "The student rec center: weight floor, courts, indoor track, climbing wall, locker rooms.",
    "", lore="L")
add("lamar.montagne", "lamar", "Montagne Center", "building", "campus-hall", "📣",
    "The arena across the parkway from the main campus, home court for Cardinals basketball. Cheer tryouts and practices run on its floor and in the gyms behind it.",
    "The twins' cheer tryouts are canon; holding them here is map-authored. The outcome of tryouts is not established.", lore="L")
add("lamar.stadium", "lamar", "Provost Umphrey Stadium", "place", "venue", "🏟️",
    "The football stadium beside the arena. Saturday home games, tailgates in the lots, the cheer squad on the sideline.",
    "", lore="L")
add("lamar.village", "lamar", "Cardinal Village", "place", "campus", "🏢",
    "Lamar's cluster of residence halls: several multi-story brick buildings around shared courtyards, with keycard doors, front desks and resident assistants on each floor.",
    "Residence halls are keycard-controlled; non-residents are signed in as guests at the front desk. Quiet hours and RA rounds apply at night. Which halls the twins and Kenna live in is map-authored.",
    pres="map", lore="L")
add("lamar.village.courtyard", "lamar.village", "Cardinal Village Courtyard", "place", "campus", "⛲",
    "The paved courtyard between the halls: benches, bike racks, a sand volleyball court, students crossing to the dining hall at all hours.",
    "", lore="L")
add("lamar.morris", "lamar.village", "Morris Hall", "building", "dorm", "🏨",
    "The residence hall where Jennifer and Melissa live: a four-story brick building with a staffed front desk, an elevator and a stairwell at each end.",
    "The twins sharing a dorm room is canon; the hall name and floor are map-authored. Guests must be signed in at the desk.",
    pres="layers", lore="L")
add("lamar.morris.lobby", "lamar.morris", "Morris Hall Lobby", "place", "passage", "🛎️",
    "Ground-floor lobby: front desk, mail lockers, a lounge with a television nobody watches, the elevator and stair doors beyond a keycard reader.",
    "The desk is staffed; after hours the outer door needs a resident keycard.", lore="L", layer=1)
add("lamar.morris.laundry", "lamar.morris", "Morris Hall Laundry Room", "room", "room", "🧺",
    "Second-floor laundry room: a row of washers and dryers, a folding counter, a vending machine. Busy on Sunday nights.",
    "", lore="L", layer=2)
add("lamar.morris.floor3", "lamar.morris", "Morris Hall Third Floor", "floor", "dorm-floor", "3️⃣",
    "A long carpeted corridor of numbered doors with whiteboards and name tags. The RA's room is by the stairwell; a study lounge sits at the far end.",
    "Sound carries through these doors. The RA walks the floor at night.", lore="L", layer=3)
add("lamar.twins", "lamar.morris.floor3", "Jennifer & Melissa's Dorm Room", "room", "room", "👯",
    "The twins' shared room: two beds, two desks, two closets and one clear dividing line. Jennifer's half is organized and color-coded; Melissa's half has string lights, clothes on the floor and whatever she is hiding in the mini-fridge. A door leads to their own bathroom.",
    "Canon facts: Jennifer and Melissa (19) share this room and its bathroom; Melissa keeps cheap vodka here against hall rules. Furniture arrangement is map-authored.", lore="L")
add("lamar.twins.bath", "lamar.twins", "The Twins' Dorm Bathroom", "room", "room", "🪞",
    "A small private bathroom off the dorm room: a mirror over the sink where the twins get ready side by side, a shower stall, makeup covering every flat surface.",
    "The bathroom mirror is canon.", lore="L")
add("lamar.combs", "lamar.village", "Combs Hall", "building", "dorm", "🏨",
    "The neighboring residence hall where Kenna lives, across the courtyard from the twins.",
    "Kenna living on campus at Lamar is canon; the hall is map-authored, as is her being in a different building from her cousins.", lore="L")
add("lamar.combs.lobby", "lamar.combs", "Combs Hall Lobby", "place", "passage", "🛎️",
    "A front desk, a lounge and a keycard door to the stairs and elevator.",
    "", lore="L")
add("lamar.kenna", "lamar.combs", "Kenna's Dorm Room", "room", "room", "📱",
    "Kenna's room: a ring light on the desk, outfits laid out for filming, a laundry bag by the door waiting for the weekend trip home to her mother.",
    "Canon facts: Kenna (18) goes home to Vidor most weekends with her laundry. Whether she has a roommate is not established.", lore="L")

# Refinery
add("refinery", "beaumont", "ExxonMobil Beaumont Refinery", "place", "plant", "🏭",
    "The refining and chemical complex on the Neches River where Kyle Sr. is a shift supervisor: miles of pipe rack, distillation towers, storage tanks and flare stacks behind chain-link and razor wire. From the interstate at night it is a city of white and orange lights. Locals still call it Mobil.",
    "Canon says only 'the local oil refinery' where Kyle Sr. (38) works long shifts as a shift supervisor; identifying it as this Beaumont complex follows the user's direction. Unit names and the site layout are schematic. The plant sets the household clock: his shifts, overtime and exhaustion decide when he is home.",
    pres="map", lore="AR")
add("refinery.parking", "refinery", "Refinery Employee Lot", "place", "road", "🅿️",
    "Acres of gravel and asphalt outside the fence, filling and emptying by shift. Kyle's single-cab pickup has a usual spot near the walkway to the gate.",
    "Outside the security fence: anyone can reach this lot. Family members waiting for Kyle wait here.", lore="AR")
add("refinery.gate", "refinery", "Main Gate & Badge Office", "building", "plant-building", "🪪",
    "Guard shack, vehicle barrier and a row of full-height turnstiles with badge readers. The badge office window handles visitors and contractors.",
    "Access control: employees badge through; visitors need a sponsor, ID and an escort, and are otherwise turned back here. Do not let family members or strangers wander past this point unescorted.", lore="R")
add("refinery.admin", "refinery", "Administration Building", "building", "plant-building", "🏢",
    "A low office block just inside the gate: management, HR, safety department, conference rooms with plant photographs on the walls.",
    "", lore="R")
add("refinery.change", "refinery", "Change House", "building", "plant-building", "🦺",
    "Lockers, showers and benches where operators trade street clothes for flame-resistant coveralls, steel-toes, hard hat, glasses and gas monitor.",
    "PPE is mandatory beyond this building.", lore="R")
add("refinery.break", "refinery", "Shift Break Room", "room", "room", "☕",
    "Burnt coffee, a microwave line, a radio on the counter and a whiteboard of overtime sign-ups. Shift gossip lives here and never reaches Vidor.",
    "", lore="R")
add("refinery.office", "refinery", "Shift Supervisor's Office", "room", "room", "📋",
    "Kyle Sr.'s office: a steel desk, a wall of permits and unit drawings, a radio charger, a window onto the pipe alley. Functional and bare of anything personal.",
    "Kyle Sr.'s workplace. No family photos or personal effects are established; do not invent what he keeps here. He is competent and in command at work in a way his family rarely sees.", lore="R")
add("refinery.control", "refinery", "Central Control Room", "building", "plant-building", "🖥️",
    "A blast-resistant building of console desks and wall displays where board operators run the units. Quiet voices, alarms acknowledged, radios murmuring.",
    "No phones or visitors without authorization.", lore="R")
add("refinery.units", "refinery", "Process Units & Pipe Alley", "place", "plant-area", "🔥",
    "The working heart of the plant: towers, furnaces, exchangers and compressors joined by pipe racks overhead. Steam, heat, a sulfur edge on the wind, and the constant roar that makes people shout.",
    "Hazardous area: full PPE, work permits, no personal phones or ignition sources. Scenes here are loud, hot and supervised.", lore="R")
add("refinery.tanks", "refinery", "Tank Farm", "place", "plant-area", "🛢️",
    "Rows of white storage tanks inside earthen dikes, linked by gravel roads. Wide, quiet and nearly empty of people.",
    "Operators make rounds by truck; otherwise deserted, especially at night.", lore="R")
add("refinery.docks", "refinery", "Neches River Docks", "place", "plant-area", "⚓",
    "The plant's river frontage: loading arms, mooring dolphins and a tanker or barge alongside. Brown water, gulls, tugboats working the ship channel.",
    "Secured waterfront; dock crews and ship personnel only.", lore="R")

# --------------------------------------------------------------------------
# Edits to existing Thompson nodes
# --------------------------------------------------------------------------
EXISTING_PATCH = {
    "thompson.property": {"parentId": "vidor.street", "add_lore": "AH"},
    "thompson.lot": {
        "replace_memory": (
            "No west perimeter fence or street connection beyond the property is invented.",
            "No west perimeter fence is invented. The street beyond the frontage is the separate map location The Thompsons' Street.",
        )
    },
    "thompson.driveway": {"add_lore": "AH"},
    "thompson.pickup": {"add_lore": "A"},
}

# --------------------------------------------------------------------------
# Links: (source, target, label, category[, state[, bidirectional]])
# --------------------------------------------------------------------------
STYLES = {
    "road": {"color": "#D9A441"},
    "commute": {"color": "#E8743B"},
    "bookclub": {"color": "#D46BA3", "lineStyle": "dashed"},
    "walk": {"color": "#5DAE6B", "lineStyle": "dotted"},
    "campus": {"color": "#C8102E"},
    "plant": {"color": "#7C8AA0"},
    "restricted": {"color": "#C0392B", "lineStyle": "dashed"},
    "secret": {"color": "#8E5BD0", "lineStyle": "dashed"},
    "door": None,
}

L = [
    # Thompson lot to the street and to Raelynn
    ("thompson.driveway", "vidor.street", "Driveway apron to the street", "walk"),
    ("thompson.lawn", "vidor.street", "Front lawn to the street", "walk"),
    ("thompson.lawn", "raelynn.front", "A few houses down the street", "walk"),
    ("thompson.patio", "raelynn.front", "Raelynn's back-door route: down the street and in by the north gate", "walk"),
    ("raelynn.front", "vidor.street", "Raelynn's driveway to the street", "walk"),
    ("vidor.street.entrance", "vidor.main", "Feeder road out to Main Street", "road"),
    # Raelynn interior
    ("raelynn.front", "raelynn.living", "Raelynn's front door", "door"),
    ("raelynn.living", "raelynn.kitchen", "Living room to kitchen", "door"),
    ("raelynn.living", "raelynn.hall", "Living room to hall", "door"),
    ("raelynn.hall", "raelynn.kenna", "Kenna's door", "door"),
    ("raelynn.hall", "raelynn.bath", "Bathroom door", "door"),
    ("raelynn.hall", "raelynn.bedroom", "Raelynn's bedroom door", "door"),
    ("raelynn.kitchen", "raelynn.laundry", "Folding doors", "door"),
    ("raelynn.kitchen", "raelynn.porch", "Raelynn's back door", "door"),
    ("raelynn.porch", "raelynn.yard", "Porch steps", "walk"),
    ("raelynn.yard", "raelynn.front", "Side-yard gate", "walk"),
    # Family car trips from the Thompson driveway
    ("thompson.driveway", "vidor.main", "Drive to Main Street", "road"),
    ("thompson.driveway", "vidor.market", "Grocery run", "road"),
    ("thompson.driveway", "vidor.high.parking", "Jr's school run", "road"),
    ("thompson.driveway", "vidor.church", "Sunday drive to church", "road"),
    ("thompson.driveway", "vidor.park", "Drive to the park", "road"),
    ("thompson.driveway", "setx.i10", "Out to the interstate", "road"),
    ("thompson.driveway", "refinery.parking", "Kyle Sr.'s commute over the Neches", "commute"),
    ("thompson.driveway", "lamar.parking", "The twins' drive to campus", "commute"),
    ("thompson.driveway", "macy.drive", "Book club at Macy's", "bookclub"),
    ("thompson.driveway", "lacy.drive", "Book club at Lacy's", "bookclub"),
    ("thompson.driveway", "ashton.drive", "Book club at Ashton's", "bookclub"),
    # Raelynn and Kenna
    ("raelynn.front", "vidor.main", "Drive to Main Street", "road"),
    ("raelynn.front", "vidor.market", "Grocery run", "road"),
    ("raelynn.front", "lamar.parking", "Kenna's weekend drive home", "commute"),
    # Book club circuit
    ("lacy.drive", "ashton.drive", "Across Orange between book-club houses", "bookclub"),
    ("lacy.drive", "macy.drive", "Lacy's to Macy's", "bookclub"),
    ("ashton.drive", "macy.drive", "Ashton's to Macy's", "bookclub"),
    # Macy
    ("macy.drive", "vidor.main", "Into town", "road"),
    ("macy.drive", "vidor.high.parking", "Brody's school run", "road"),
    ("macy.drive", "macy.porch", "Steps to the porch", "walk"),
    ("macy.porch", "macy.living", "Macy's front door", "door"),
    ("macy.living", "macy.kitchen", "Living room to kitchen", "door"),
    ("macy.living", "macy.bath", "Hall bathroom door", "door"),
    ("macy.living", "macy.brody", "Brody's door", "door"),
    ("macy.living", "macy.bedroom", "Macy's bedroom door", "door"),
    ("macy.kitchen", "macy.deck", "Kitchen door to the deck", "door"),
    # Vidor town roads
    ("vidor.main", "vidor.market", "Shopping center turn-in", "road"),
    ("vidor.main", "vidor.high.parking", "School road", "road"),
    ("vidor.main", "vidor.church", "Church turn-in", "road"),
    ("vidor.main", "setx.i10", "Main Street interchange", "road"),
    ("vidor.park", "setx.i10", "Park exit", "road"),
    ("vidor.high.parking", "vidor.high.stadium", "Gate to the stadium", "walk"),
    # Interstate hub
    ("setx.i10", "refinery.parking", "Neches bridge to the plant exit", "road"),
    ("setx.i10", "lamar.parking", "MLK Parkway exit to campus", "road"),
    ("setx.i10", "beaumont.crockett", "Downtown Beaumont exit", "road"),
    ("setx.i10", "orange.riverfront", "Orange exit to the river", "road"),
    ("setx.i10", "lacy.drive", "Orange exit to Lacy's", "road"),
    ("setx.i10", "ashton.drive", "Orange exit to Ashton's", "road"),
    # Orange
    ("lacy.drive", "orange.riverfront", "Into downtown Orange", "road"),
    ("ashton.drive", "orange.riverfront", "Down to the river", "road"),
    ("lacy.drive", "lacy.great", "Lacy's front door", "door"),
    ("lacy.great", "lacy.kitchen", "Open to the kitchen", "door"),
    ("lacy.great", "lacy.suite", "Lacy's bedroom door", "door"),
    ("lacy.suite", "lacy.bath", "Bathroom door", "door"),
    ("lacy.great", "lacy.mason", "Mason's door", "door"),
    ("lacy.great", "lacy.patio", "French doors to the patio", "door"),
    ("ashton.drive", "ashton.living", "Ashton's front door", "door"),
    ("ashton.living", "ashton.hall", "Living room to hall", "door"),
    ("ashton.living", "ashton.kitchen", "Living room to kitchen", "door"),
    ("ashton.hall", "ashton.kitchen", "Hall to kitchen", "door"),
    ("ashton.hall", "ashton.bedroom", "Ashton's bedroom door", "door"),
    ("ashton.hall", "ashton.beau", "Beau's door", "door"),
    ("ashton.kitchen", "ashton.porch", "Screen door to the porch", "door"),
    # Lamar
    ("lamar.parking", "lamar.quad", "Walk in from the lot", "campus"),
    ("lamar.parking", "lamar.montagne", "Across the parkway to the arena", "campus"),
    ("lamar.parking", "beaumont.crockett", "Ten minutes to downtown", "road"),
    ("lamar.quad", "lamar.library", "Library walk", "campus"),
    ("lamar.quad", "lamar.ssc", "Walk to the student center", "campus"),
    ("lamar.quad", "lamar.dining", "Walk to the dining hall", "campus"),
    ("lamar.quad", "lamar.rec", "Walk to the rec center", "campus"),
    ("lamar.quad", "lamar.montagne", "Parkway crosswalk", "campus"),
    ("lamar.quad", "lamar.village.courtyard", "Walk to Cardinal Village", "campus"),
    ("lamar.montagne", "lamar.stadium", "Arena plaza", "campus"),
    ("lamar.village.courtyard", "lamar.dining", "Dining hall path", "campus"),
    ("lamar.village.courtyard", "lamar.morris.lobby", "Morris Hall front door", "door"),
    ("lamar.village.courtyard", "lamar.combs.lobby", "Combs Hall front door", "door"),
    ("lamar.morris.lobby", "lamar.morris.floor3", "Elevator or stairs to three", "door"),
    ("lamar.morris.lobby", "lamar.morris.laundry", "Stairs to the laundry room", "door"),
    ("lamar.morris.floor3", "lamar.morris.laundry", "Stairwell down one flight", "door"),
    ("lamar.morris.floor3", "lamar.twins", "The twins' door", "door"),
    ("lamar.combs.lobby", "lamar.kenna", "Up to Kenna's room", "door"),
    # Refinery
    ("refinery.parking", "refinery.gate", "Walkway to the turnstiles", "plant"),
    ("refinery.gate", "refinery.admin", "Inside the gate", "plant"),
    ("refinery.gate", "refinery.change", "Inside the gate", "plant"),
    ("refinery.change", "refinery.break", "Corridor", "plant"),
    ("refinery.break", "refinery.office", "Down the hall", "plant"),
    ("refinery.office", "refinery.control", "Covered walkway", "plant"),
    ("refinery.office", "refinery.units", "Door to the pipe alley", "plant"),
    ("refinery.control", "refinery.units", "Out to the units", "plant"),
    ("refinery.units", "refinery.tanks", "Plant road", "plant"),
    ("refinery.units", "refinery.docks", "Dock road", "plant"),
    ("refinery.tanks", "refinery.docks", "Dike road", "plant"),
    ("refinery.parking", "refinery.units", "Contractor gate (open only for turnarounds)", "restricted", "blocked", False),
]

# Existing concealed links get a style only (topology untouched)
EXISTING_STYLED = [
    ("thompson.jr-closet", "thompson.lab", "secret"),
    ("thompson.shop-cabinet", "thompson.sanctum", "secret"),
]

# --------------------------------------------------------------------------
# First 50 records = the owner prompt's known-location index. Strategic spine.
# --------------------------------------------------------------------------
SPINE = [
    "setx", "vidor", "vidor.street", "thompson.property", "thompson.house",
    "thompson.first-floor", "thompson.second-floor", "thompson.kitchen", "thompson.family",
    "thompson.master", "thompson.jennifer", "thompson.melissa", "thompson.jr",
    "thompson.garage", "thompson.backyard", "thompson.patio", "thompson.pool", "thompson.woodshop",
    "thompson.driveway",
    "raelynn.property", "raelynn.house", "raelynn.kitchen", "raelynn.porch",
    "macy.home", "vidor.main", "vidor.market", "vidor.high", "vidor.high.stadium", "vidor.church", "vidor.park",
    "setx.i10",
    "orange", "lacy.home", "ashton.home", "orange.riverfront",
    "beaumont", "lamar", "lamar.village", "lamar.morris", "lamar.twins", "lamar.kenna",
    "lamar.montagne", "lamar.library", "lamar.ssc", "lamar.parking", "beaumont.crockett",
    "refinery", "refinery.parking", "refinery.gate", "refinery.office",
]

# --------------------------------------------------------------------------
# Directory lore (location-attached). Keep each well under ~1,000 chars.
# --------------------------------------------------------------------------
LORE = {
    "A": {
        "name": "Golden Triangle Orientation",
        "keys": [],
        "content": (
            "Regional orientation: Vidor lies on Interstate 10 between Beaumont (about 10 miles west, across the Neches River) "
            "and Orange (about 15 miles east, on the Sabine at the Louisiana line). Trips between towns are car trips: "
            "Vidor to the refinery or Lamar is roughly 15 to 25 minutes, Vidor to Orange 15 to 20, errands inside Vidor 5 to 10. "
            "Raelynn's place is a two-minute walk down the Thompsons' street. Travel takes time and a vehicle; do not move people "
            "between towns instantly or on foot. Distances are approximate geography, not canon measurements."
        ),
    },
    "H": {
        "name": "Homes Directory",
        "keys": [],
        "content": (
            "Homes: Thompson House, Vidor [thompson.house] - Kyle Sr., Laura, Jr.; the twins on weekends and breaks. "
            "Raelynn's Place, same street, a few houses down [raelynn.property] - Raelynn; Kenna on weekends. "
            "Macy's House, wooded edge of Vidor [macy.home] - Macy and Brody. "
            "Lacy's House, Orange [lacy.home] - Lacy and Mason. "
            "Ashton's House, Orange near the Sabine [ashton.home] - Ashton and Beau. "
            "The weekly book club rotates between Lacy's, Ashton's, Macy's and Laura's. "
            "Raelynn walks over and enters the Thompsons' by the back door; everyone else drives and knocks."
        ),
    },
    "V": {
        "name": "Vidor Directory",
        "keys": [],
        "content": (
            "Vidor: The Thompsons' Street [vidor.street] > Thompson Property, Raelynn's Place, Subdivision Entrance. "
            "Main Street / FM 105 [vidor.main] - errands and the interstate interchange. "
            "Market Basket [vidor.market] - Laura's grocery run. "
            "Vidor High School [vidor.high] > Student Parking Lot, Pirate Stadium - Jr., Brody, Mason and Beau are seniors; Friday-night football. "
            "Family Church [vidor.church] - Sundays; name unspecified. "
            "Claiborne West Park [vidor.park] - county park east of town. "
            "Macy's House [macy.home] - north edge of town. It is a small town: people notice and talk."
        ),
    },
    "L": {
        "name": "Lamar Campus Directory",
        "keys": [],
        "content": (
            "Lamar University, Beaumont [lamar]: Student Parking [lamar.parking]; Quad [lamar.quad]; Gray Library [lamar.library]; "
            "Setzer Student Center [lamar.ssc]; Brooks-Shivers Dining Hall [lamar.dining]; Rec Center [lamar.rec]; "
            "Montagne Center [lamar.montagne] and Provost Umphrey Stadium [lamar.stadium] across MLK Parkway. "
            "Cardinal Village [lamar.village] > Courtyard; Morris Hall > Lobby, Laundry, Third Floor > Jennifer & Melissa's Dorm Room > bathroom; "
            "Combs Hall > Lobby, Kenna's Dorm Room. Halls are keycard-controlled with a staffed desk, guest sign-in and RAs. "
            "Jennifer and Melissa (19) and Kenna (18) are freshmen. Downtown nightlife: Crockett Street [beaumont.crockett]."
        ),
    },
    "R": {
        "name": "Refinery Directory and Access",
        "keys": [],
        "content": (
            "ExxonMobil Beaumont Refinery [refinery], on the Neches: Employee Lot [refinery.parking] is outside the fence. "
            "Main Gate & Badge Office [refinery.gate] - badge turnstiles; visitors need a sponsor, ID and escort. "
            "Inside: Administration, Change House (PPE), Shift Break Room, Shift Supervisor's Office (Kyle Sr.), Central Control Room, "
            "Process Units & Pipe Alley, Tank Farm, Neches River Docks. Beyond the Change House everyone wears flame-resistant clothing, "
            "hard hat, glasses and a gas monitor; no personal phones in the units. Kyle Sr. is a shift supervisor on long rotating shifts; "
            "family cannot walk in to see him and normally meet him in the lot or reach him by phone."
        ),
    },
}
