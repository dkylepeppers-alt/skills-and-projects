# Sources

**Source reports.** *Stereotomy in wood: spatial joinery, compound cuts, and assemblies
shaped by grain* (design principles, the brace and ring examples, white-oak coefficients,
fit strategies), and the follow-up deep dive *Drafting Wood Stereotomy in CAD for Hand and
Power Tools* (drafting methods, saw-settings math, hopper and Abeille examples, error
tables, checklist). The first report's own references include Sakarovitch on stereotomy,
the UNESCO scribing-tradition entry, the Timber Framers Guild curriculum, the USDA Wood
Handbook (2021) chapters 4, 5, 10, 11 and 13, the AWC National Design Specification,
TFEC 1-2019, and Robeller et al. on interlocking folded plates.

All saw settings, panel and block dimensions and error tables in this skill are computed
by `scripts/woodstereo/geometry.py` and checked in `tests/`; the examples also check them
against the solid models.

**Drafting traditions**
- [French Timber Framing: rembarrement, epure, herse](https://frenchtimberframing.blogspot.com/2014)
- [Rabattement (drafting)](https://wiki.riteme.site/wiki/Folding_line)
- [SBE Builders: layout using the rabattement surface](https://sbebuilders.blogspot.com/2013/04/traditional-layout-using-rabattement.html)
- [JAANUS: kiku](https://projects.mcah.columbia.edu/jaanus/node/3075), [kanejaku](https://aisf.or.jp/~jaanus/deta/k/kanejaku.htm)

**Interlocking assemblies**
- [Lecci, Mazzoli, Bartolomei et al., Design of Flat Vaults with Topological Interlocking Solids, Nexus Network Journal 2021](https://link.springer.com/article/10.1007/s00004-020-00541-w)

**Shop practice and tools**
- [Woodgears: splayed miter joints](https://woodgears.ca/miter/)
- [Compound Angles Without Math](https://www.mathscinotes.com/wp-content/uploads/2014/08/Compound-Angles-Without-Math.pdf)
- [WOODWEB: complex leg angles](https://woodweb.com/knowledge_base/Figuring_Complex_Leg_Angles_for_Furniture.html)
- [DeWalt DWE7491RS](https://dewalt.ca/product/dwe7491rs/10-jobsite-table-saw-and-rolling-stand), [Rikon 10-205](https://toolstoday.com/rikon-10-205-10-inch-contractor-saw-with-steel-wings.html)
- [Maker Forums: FreeCAD 1:1 printing](https://forum.makerforums.info/t/freecad-innacurate-1-1-printing/88136), [SketchUp forum: 1:1 printing](https://forums.sketchup.com/t/1-1-printing-plans-for-woodworking/163995), [Docuslice: printing at 1:1](https://docuslice.com/blog/2026-08-05-How-to-Print-a-Life-Size-Template-at-1-to-1-Scale/)

**Joinery proportions**
- [Woodworker's Journal: real-life mortise and tenon dimensions](https://woodworkersjournal.com/?p=42937)
- [Fine Woodworking: joining legs to aprons](https://finewoodworking.com/2003/02/01/joining-legs-to-aprons)
- [Mother Earth News: how to cut a mortise](https://www.motherearthnews.com/diy/crafting/how-to-cut-a-mortise-ze0z1307zwar)
- [WoodCentral: dovetail slopes](https://www.woodcentral.com/forums/topic/3099457/hand-cut-dovetaiols)
- [The Wood Whisperer: drawbored mortise and tenon](https://thewoodwhisperer.com/videos/drawbored-mortise-tenon/)

**CAD.** build123d 0.12; the modeling conventions (STEP-first, named parameters, inches
via `IN`, source over generated artifacts) follow the user's `cad` skill, which is based on
earthtojake/text-to-cad (MIT). No code from that project is included here.
