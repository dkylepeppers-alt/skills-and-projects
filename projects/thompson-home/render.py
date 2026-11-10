import subprocess, maps, pathlib, sys
out = pathlib.Path("art/background")
for pid in maps.M:
    svg = out / f"{pid}.svg"; png = out / f"{pid}.png"
    svg.write_text(maps.svg_for(pid))
    subprocess.run(["rsvg-convert", str(svg), "-w", "1254", "-h", "1254", "-o", str(png)], check=True)
    print(pid, png.stat().st_size)
