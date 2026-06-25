"""Extract and clean page-preserving text from a PDF using PyMuPDF."""

from __future__ import annotations

import json
import math
import re
import sys
import unicodedata
from collections import Counter
from pathlib import Path

import fitz


PAGE_NUMBER = re.compile(
    r"^\s*(?:page\s+)?(?:\d+|[ivxlcdm]+)(?:\s+(?:of|/)\s+\d+)?\s*$",
    re.IGNORECASE,
)
BROKEN_WORD = re.compile(r"(?<=\w)-\s*\n\s*(?=\w)")
MULTIPLE_SPACES = re.compile(r"[ \t]+")
EXCESS_BLANK_LINES = re.compile(r"\n{3,}")


def normalize_line(line: str) -> str:
    return MULTIPLE_SPACES.sub(" ", unicodedata.normalize("NFKC", line)).strip()


def boundary_candidates(text: str) -> tuple[list[str], list[str]]:
    lines = [normalize_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    return lines[:2], lines[-2:]


def repeated_boundaries(raw_pages: list[str]) -> set[str]:
    if len(raw_pages) < 2:
        return set()

    counter: Counter[str] = Counter()
    for text in raw_pages:
        headers, footers = boundary_candidates(text)
        counter.update(set(headers + footers))

    threshold = max(2, math.ceil(len(raw_pages) * 0.6))
    return {
        line
        for line, count in counter.items()
        if count >= threshold and len(line) <= 160
    }


def clean_page(text: str, repeated: set[str]) -> str:
    text = text.replace("\x00", "")
    text = BROKEN_WORD.sub("", text)

    paragraphs: list[str] = []
    current: list[str] = []

    for raw_line in text.splitlines():
        line = normalize_line(raw_line)
        if not line:
            if current:
                paragraphs.append(" ".join(current))
                current = []
            continue
        if line in repeated or PAGE_NUMBER.fullmatch(line):
            continue
        current.append(line)

    if current:
        paragraphs.append(" ".join(current))

    cleaned = "\n\n".join(paragraphs)
    return EXCESS_BLANK_LINES.sub("\n\n", cleaned).strip()


def join_pages(pages: list[dict[str, object]]) -> str:
    sections = [str(page["text"]).strip() for page in pages if str(page["text"]).strip()]
    if not sections:
        return ""

    joined = sections[0]
    for section in sections[1:]:
        previous = joined.rstrip()
        current = section.lstrip()

        if previous.endswith("-") and current[:1].islower():
            joined = previous[:-1] + current
        elif previous[-1:] not in ".!?;:" and current[:1].islower():
            joined = previous + " " + current
        else:
            joined = previous + "\n\n" + current

    return joined.strip()


def extract(pdf_path: Path) -> dict[str, object]:
    try:
        document = fitz.open(pdf_path)
    except Exception as exc:
        raise RuntimeError(f"Unable to open PDF: {exc}") from exc

    try:
        if document.page_count < 1:
            raise RuntimeError("PDF contains no pages")

        raw_pages = [page.get_text("text", sort=True) for page in document]
        repeated = repeated_boundaries(raw_pages)
        pages = [
            {"page": index + 1, "text": clean_page(text, repeated)}
            for index, text in enumerate(raw_pages)
        ]
        full_text = join_pages(pages)

        if not full_text:
            raise RuntimeError(
                "No extractable text found; the PDF may contain only scanned images"
            )

        return {
            "pageCount": document.page_count,
            "pages": pages,
            "text": full_text,
        }
    finally:
        document.close()


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    if len(sys.argv) != 2:
        print("Usage: extract_pdf.py <pdf-path>", file=sys.stderr)
        return 2

    try:
        result = extract(Path(sys.argv[1]))
        json.dump(result, sys.stdout, ensure_ascii=False)
        return 0
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
