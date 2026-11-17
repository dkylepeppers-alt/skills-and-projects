"""Shared plumbing for the examples: import path, output folder, report writing."""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def out_dir(name: str) -> Path:
    parser = argparse.ArgumentParser(description=f"{name} example")
    parser.add_argument("--out", default="build", help="output folder (default: ./build)")
    path = Path(parser.parse_args().out) / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def finish(folder: Path, sheet: str, checks: dict) -> None:
    lines = [sheet, "## Model checks", ""]
    lines += [f"- {k}: {v}" for k, v in checks.items()]
    (folder / "shop-sheet.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWrote {sorted(p.name for p in folder.iterdir())} to {folder}")
