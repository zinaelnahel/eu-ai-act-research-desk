# EU AI Act Research Desk

[Open the desk](https://eu-ai-act-research-desk.vercel.app/) · [Read the evaluation](https://eu-ai-act-research-desk.vercel.app/evaluation.html)

Ask a question about Regulation (EU) 2024/1689 or browse its articles, annexes and recitals. The desk runs in the browser. Direct lookups resolve provision IDs, common questions use reviewed mappings, and other questions use weighted passage retrieval. Every result includes an extract from the law and a link to its official source. For open-ended questions the desk distinguishes possible source matches from reviewed answers.

## Source editions

- [27 July 2026 consolidated English edition](https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng), including 119 articles and 14 annexes.
- [Original Official Journal edition](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) and [2026 amending regulation](https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng), which supply 227 recitals.

The snapshot is pinned. Questions about newer versions are redirected to EUR-Lex. The desk supplies evidence for research, uses no live language model, and does not decide how the law applies to a particular system.

## Run and verify

Use Node.js 22 and Python 3.12. From the repository root:

```sh
python -m http.server --directory public 8000
# Open http://localhost:8000/eu-ai-act/index.html
node --test eu-ai-act/desk.test.mjs
node eu-ai-act/evaluate.mjs --write
```

The 42 labeled cases check first-ranked provisions, supporting sources, verbatim evidence, exceptions and abstention. The suite also checks direct lookup for all 360 corpus entries and verifies that the published report matches a fresh run. The labeled cases are a regression benchmark, and their results apply to the tested questions and pinned text.

## Rebuild the corpus

Install Beautiful Soup with `python -m pip install beautifulsoup4`. Download the official XHTML from the EU Publications Office in English using headers `Accept: application/xhtml+xml` and `Accept-Language: en`.

- Consolidated `https://publications.europa.eu/resource/celex/02024R1689-20260727`
- Original `https://publications.europa.eu/resource/celex/32024R1689`
- Amendment `https://publications.europa.eu/resource/celex/32026R1744`

Run `python eu-ai-act/build_corpus.py consolidated.xhtml original.xhtml amendment.xhtml` and re-run the evaluation. The importer preserves provision IDs, normalizes whitespace, and removes inline edition markers. Update the edition, fixture expectations and source anchors as part of a source refresh.
