"""Regression coverage for printer-ready patterns and drawing page checks."""
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from woodstereo import templates

try:
    import pymupdf
    import matplotlib
    from check_pdf import inspect_pdf
    HAVE_PDF=True
except ImportError:
    HAVE_PDF=False


@unittest.skipUnless(HAVE_PDF,"PDF requirements not installed")
class PatternPDF(unittest.TestCase):
    def test_oversized_pattern_is_tiled_without_rescaling(self):
        # 15-inch pattern requires two letter sheets. The independent 2-inch
        # cut edge lies entirely on tile one and must remain 144 PDF points.
        lines=[(0,0,15,0),(0,0,0,2),(0,2,15,2),(15,0,15,2)]
        with tempfile.TemporaryDirectory() as d:
            path=templates.write_pdf(Path(d)/"p.pdf",lines,title="P01",
                                     orientation="REF left; grain longitudinal")
            with pymupdf.open(path) as doc:
                self.assertEqual(len(doc),2)
                for page in doc:
                    self.assertAlmostEqual(page.rect.width,792)
                    self.assertAlmostEqual(page.rect.height,612)
                    self.assertIn("2 in calibration bar",page.get_text())
                    # The calibration check bar is exactly two inches.
                    self.assertTrue(any(abs(abs(b.x-a.x)-144)<.02 and abs(b.y-a.y)<.02
                                        for path in page.get_drawings() for item in path["items"]
                                        if item[0]=="l" for a,b in [item[1:3]]))
                self.assertTrue(any(abs(abs(b.y-a.y)-144)<.02 and abs(b.x-a.x)<.02
                                    for path in doc[0].get_drawings() for item in path["items"]
                                    if item[0]=="l" for a,b in [item[1:3]]))
            report=inspect_pdf(path,(792,612))
            self.assertFalse(report["bad_size"] or report["overflow"] or report["collisions"],report)

    def test_unprintable_label_fails(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,"tile seam"):
                templates.write_pdf(Path(d)/"p.pdf",[(0,0,1,1)],
                                    [(1,1,"X"*130)],title="P01",orientation="REF left")
