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

**Machines**
- [Grizzly G1023RLWX product page](https://www.grizzly.com/products/g1023rlwx); [G1023RL series manual, left tilt](https://www.manualslib.com/manual/63197/Grizzly-G1023rl.html); [G1023 FAQ (miter slot)](https://support.grizzly.com/hc/en-us/articles/4411636429463-FAQ-G1023Z-10-Deluxe-Heavy-Duty-3-HP-Table-Saw-Discontinued); [G1023SLWX3 (router table and fence)](https://grizzly.com/products/G1023SLWX3)
- [Shop Fox W1849 manual](https://www.elitemetaltools.com/sites/default/files/product-data/manuals/w1849_m.pdf)
- [JessEm Clear-Cut TS stock guides](https://www.woodworkersjournal.com/jessem-clear-cut-ts-stock-guides/)
- [Actual plywood thickness](https://www.inchcalculator.com/actual-plywood-thickness-size/)

**Jigs**
- [Fine Woodworking: never use the rip fence as a stop](https://www.finewoodworking.com/2017/05/25/clever-stop-block-crosscutting-tablesaw); [stick stops the sled in a safe position](https://finewoodworking.com/2024/12/17/314-small-stick-stops-crosscut-sled-in-safe-position)
- [Woodcraft: sawing small parts (spacer against offcut trapping)](https://www.woodcraft.com/blogs/sanding-finishing/sawing-small-parts-making-little-cuts-with-big-tools)
- [The Wood Whisperer: five-cut error x4](https://thewoodwhisperer.com/articles/how-much-error-is-too-much/)
- [Fine Woodworking: shopmade tenoning jig](https://finewoodworking.com/2021/02/24/shopmade-tablesaw-tenoning-jig)
- [Fine Woodworking: circle-cutting bandsaw jig](https://finewoodworking.com/?p=4213); [Woodcraft: bandsaw circle-cutting jig](https://www.woodcraft.com/blog_entries/bandsaw-circle-cutting-jig)
- [Sawmill Creek: left tilt and crosscut fences](https://sawmillcreek.org/goto/post?id=3323908)

**CAD.** build123d (see `requirements.txt`); the modeling conventions (STEP-first, named
parameters, inches via `IN`, source over generated artifacts) follow the user's `cad` skill, which is based on
earthtojake/text-to-cad (MIT). No code from that project is included here.
