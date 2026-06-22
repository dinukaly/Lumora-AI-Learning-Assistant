from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

import fitz

WORKER_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(WORKER_DIR))

from extract_pdf import extract


class ExtractPdfTests(unittest.TestCase):
    def test_extracts_pages_and_removes_repeated_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pdf_path = Path(directory) / "sample.pdf"
            document = fitz.open()

            for page_number in range(1, 4):
                page = document.new_page()
                page.insert_text(
                    (72, 72),
                    "Lumora Course Notes\n"
                    f"Page {page_number}\n\n"
                    f"This is the unique lesson content for page {page_number}.\n"
                    "A hyphen-\nated term should be repaired.\n\n"
                    "Confidential",
                )

            document.save(pdf_path)
            document.close()

            result = extract(pdf_path)

        self.assertEqual(result["pageCount"], 3)
        self.assertEqual(len(result["pages"]), 3)
        self.assertNotIn("Lumora Course Notes", result["text"])
        self.assertNotIn("Confidential", result["text"])
        self.assertIn("hyphenated", result["text"])
        self.assertIn("unique lesson content for page 3", result["text"])

    def test_rejects_pdf_without_extractable_text(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            pdf_path = Path(directory) / "blank.pdf"
            document = fitz.open()
            document.new_page()
            document.save(pdf_path)
            document.close()

            with self.assertRaisesRegex(RuntimeError, "No extractable text"):
                extract(pdf_path)


if __name__ == "__main__":
    unittest.main()
