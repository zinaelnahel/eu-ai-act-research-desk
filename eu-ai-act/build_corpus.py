"""Build the browser corpus from three official EU Publications Office XHTML editions."""

import argparse
import json
import re
from pathlib import Path

from bs4 import BeautifulSoup

CURRENT = "https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng"
ORIGINAL = "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng"
AMENDMENT = "https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng"
OUTPUT = Path(__file__).resolve().parents[1] / "public" / "eu-ai-act" / "corpus.json"


def read(path):
    return BeautifulSoup(path.read_bytes(), "html.parser", from_encoding="utf-8")


def text(node):
    return " ".join(node.get_text(" ", strip=True).split())


def provisions(soup):
    for node in soup.find_all(id=re.compile(r"^(?:art_\d+[a-z]?|anx_[IVX]+)$")):
        key = node["id"]
        article = key.startswith("art_")
        label = ("Article " if article else "Annex ") + key.split("_", 1)[1]
        selector = ".eli-title" if article else ".title-annex-2"
        heading = node.select_one(selector)
        blocks = []
        for child in node.find_all(recursive=False):
            classes = child.get("class", [])
            if any(name in classes for name in (
                "eli-title", "title-article-norm", "title-annex-1", "title-annex-2", "modref",
            )):
                continue
            for marker in child.select(".modref"):
                marker.decompose()
            passage = text(child)
            if not passage:
                continue
            # Keep unnumbered continuation text with the preceding article paragraph.
            if article and child.name == "p" and blocks and key != "art_113":
                blocks[-1] += "\n" + passage
            else:
                blocks.append(passage)
        if not blocks:
            raise ValueError(f"Empty scraped source: {key}")
        yield dict(id=key, kind="article" if article else "annex", label=label,
                   title=text(heading) if heading else "", blocks=blocks, url=f"{CURRENT}#{key}")


def recitals(soup, *, amendment=False):
    source = AMENDMENT if amendment else ORIGINAL
    for node in soup.find_all(id=re.compile(r"^rct_\d+$")):
        anchor = node["id"]
        number = anchor.split("_")[1]
        yield dict(id=f"amend_{anchor}" if amendment else anchor, kind="recital",
                   label=f"{'Amendment recital' if amendment else 'Recital'} {number}",
                   title="", blocks=[text(node)], url=f"{source}#{anchor}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("consolidated", type=Path)
    parser.add_argument("original", type=Path)
    parser.add_argument("amendment", type=Path)
    args = parser.parse_args()
    docs = [*provisions(read(args.consolidated)), *recitals(read(args.original)),
            *recitals(read(args.amendment), amendment=True)]
    counts = {kind: sum(doc["kind"] == kind for doc in docs)
              for kind in ("article", "annex", "recital")}
    if counts["article"] != 119 or counts["annex"] != 14 or counts["recital"] <= 180:
        raise ValueError(f"Unexpected source coverage: {counts}")
    corpus = dict(version="Consolidated edition · 27 July 2026", currentSource=CURRENT,
                  originalSource=ORIGINAL, amendmentSource=AMENDMENT, documents=docs)
    OUTPUT.write_text(json.dumps(corpus, ensure_ascii=False, separators=(",", ":")) + "\n",
                      encoding="utf-8")
    print(counts)


if __name__ == "__main__":
    main()
