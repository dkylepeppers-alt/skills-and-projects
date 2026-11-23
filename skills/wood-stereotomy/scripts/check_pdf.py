"""Check printable drawing PDFs for text overflow and severe label collisions.

Run after generating plans/patterns, before reviewing their rendered pages.
Warnings are candidates for visual review, not proof that a drawing is correct.
"""
from __future__ import annotations

import argparse
from itertools import combinations

import pymupdf


def inspect_pdf(path, expected_size=None):
    report = {"pages": 0, "bad_size": [], "overflow": [], "collisions": []}
    with pymupdf.open(path) as doc:
        report["pages"] = len(doc)
        for i,page in enumerate(doc,1):
            if expected_size and any(abs(a-b)>.1 for a,b in
                                     zip((page.rect.width,page.rect.height),expected_size)):
                report["bad_size"].append(i)
            spans=[]
            for block in page.get_text("dict")["blocks"]:
                if block["type"]!=0:
                    continue
                for line in block["lines"]:
                    for span in line["spans"]:
                        t=span["text"].strip()
                        if not t:
                            continue
                        r=pymupdf.Rect(span["bbox"])
                        if not page.rect.contains(r):
                            report["overflow"].append((i,t))
                        spans.append((t,r))
            for (a,r),(b,s) in combinations(spans,2):
                if r.intersects(s) and (r&s).get_area()/max(.001,min(r.get_area(),s.get_area()))>.32:
                    report["collisions"].append((i,a,b))
    return report


def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("pdf",nargs="+")
    p.add_argument("--paper",choices=("letter","tabloid"))
    args=p.parse_args()
    size={"letter":(792,612),"tabloid":(1224,792)}.get(args.paper)
    bad=False
    for path in args.pdf:
        report=inspect_pdf(path,size)
        print(path,report)
        bad |= bool(not report["pages"] or report["bad_size"] or report["overflow"] or report["collisions"])
    return int(bad)


if __name__=="__main__":
    raise SystemExit(main())
