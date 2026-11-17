# Ordinary joinery, drafted the same way

The same rules apply to everyday joints: one shared interface, each face given a job,
relief only on inactive faces, grain checked on both sides, every cut stated as a mark or
a setting. Proportions below are conventional starting points, held as named parameters.
They are not structural sizing.

## Interfaces and what they do

| Interface | Load path | Draft it so that |
| --- | --- | --- |
| Housed mortise and tenon | Shoulder or housing carries compression and vertical bearing; a peg, key or wedge resists withdrawal | The shoulder is the locating face at zero offset; the mortise bottom is relieved; the cheeks keep their walls |
| Dovetail or sliding key | Flanks turn pull-out into bearing plus sideways pressure | Flank slope and socket wall are checked for splitting; the entry direction is free before the taper is fixed |
| Lap or scarf | Long overlap spreads transfer | The root and step leave enough section; a tension splice has keys, fasteners or a qualified bond |
| Notch or saddle (reciprocal crossing) | Locates the next member and directs bearing | Off-center reactions and the section left under the notch are checked |
| Housing or dado | Bearing on the housing floor and walls | One wall locates; the other clears; wide cross-grain panels float |

## Default proportions

| Parameter | Default | Source |
| --- | --- | --- |
| Tenon thickness | About one third of the mortised stock, rounded to an owned chisel (`joinery.tenon_thickness`) | [Woodworker's Journal](https://woodworkersjournal.com/?p=42937); chisel rounding per [Mother Earth News](https://www.motherearthnews.com/diy/crafting/how-to-cut-a-mortise-ze0z1307zwar) |
| Tenon width | No more than about five times its thickness before using twin tenons (`joinery.tenon_width_limit`) | [Woodworker's Journal](https://woodworkersjournal.com/?p=42937) |
| When the third is too thin | In soft species or thin aprons, go thicker and keep enough mortise wall | [Fine Woodworking](https://finewoodworking.com/2003/02/01/joining-legs-to-aprons) |
| Mortise depth | Tenon length plus 1/16 in relief, so the shoulder seats before the end bottoms (`joinery.mortise_depth`) | Relief principle from the source report; 1/16 is this skill's default |
| Dovetail slope | 1:6 (9.46 deg) or 1:8 (7.13 deg) (`joinery.dovetail_angle`). Sources disagree on why: softwood versus hardwood, or strength versus show. Pick one and state it. | [WoodCentral](https://www.woodcentral.com/forums/topic/3099457/hand-cut-dovetaiols) |
| Drawbore offset | 1/16 in for typical furniture; about 1/32 in dense hardwood; up to 1/8 in softer wood or heavier work; always toward the shoulder (`joinery.DRAWBORE_OFFSET`) | [The Wood Whisperer](https://thewoodwhisperer.com/videos/drawbored-mortise-tenon/) |

## Tooling notes for this shop

- Mortises: drill press to remove waste then chisel to the knife lines, or router with the
  ends squared by chisel. If the ends stay round, model the radius and round the tenon.
- Tenon cheeks: table saw with the rail on end against a tall fence or tenoning jig, or by
  handsaw; shoulders knifed all round and pared or shot.
- Dovetails: sawn by hand to knifed lines. A router dovetail bit fixes the flank angle to
  the bit, so model the bit's angle rather than a slope ratio.
- Angled joinery: an angled tenon shoulder is a planar end cut. Run it through
  `sheet.end_cut_sheet` like any other, and keep the tenon itself square to the mortise
  wherever the design allows, so the mortise stays a simple square cut.

`examples/mortise_tenon.py` shows the full pattern, including a drawbore whose tenon hole
sits nearer the shoulder than the leg hole.
