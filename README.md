# EU AI Act Research Desk

[Open the desk](https://eu-ai-act-research-desk.vercel.app/) · [Try learning mode](https://eu-ai-act-research-desk.vercel.app/learn.html) · [Read the evaluation](https://eu-ai-act-research-desk.vercel.app/evaluation.html)

Ask a question about Regulation (EU) 2024/1689 or browse its articles, annexes and recitals. The desk runs in the browser. Direct lookups resolve provision IDs, common questions use reviewed mappings, and other questions use weighted passage retrieval. Every result includes an extract from the law and a link to its official source. For open-ended questions the desk distinguishes possible source matches from reviewed answers.

Learning mode has 12 topics spanning the Act’s chapters, 27 sourced scenarios and a mixed challenge. Read the explanation and linked provision after each decision. Chapter completions, best scores and XP are saved in browser storage on the current device.

## Source editions

- [27 July 2026 consolidated English edition](https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng), including 119 articles and 14 annexes.
- [Original Official Journal edition](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) and [2026 amending regulation](https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng), which supply 227 recitals.

The snapshot is pinned. Questions about newer versions are redirected to EUR-Lex. The consolidated edition is a documentation tool without legal effect. The authentic texts are published in the Official Journal. The desk supplies evidence for research, uses no live language model, and does not decide how the law applies to a particular system.

## Run and verify

Use Node.js 22 and Python 3.12. From the repository root:

```sh
python -m http.server --directory public 8000
# Open http://localhost:8000/eu-ai-act/index.html
node --test eu-ai-act/*.test.mjs
node eu-ai-act/evaluate.mjs --write
```

The 43 labeled cases check first-ranked provisions, required supporting sources, verbatim evidence, exceptions and abstention. Irrelevant and duplicate provisions fail the case even when every required source is present. Optional sources require a documented rationale. The report shows micro-averaged provision precision across returned citations and marks abstentions separately. The suite checks direct lookup for all 360 corpus entries and verifies that the report matches a fresh run.

Run the Playwright browser suite with Python 3.12:

```sh
python -m pip install -r eu-ai-act/requirements-browser.txt
python -m playwright install chromium
python -m unittest discover -s eu-ai-act -p browser_test.py -v
```

The tests use an ephemeral local HTTP server and cover desktop and mobile navigation, keyboard interaction, source links, quiz progress persistence, and the evaluation report. GitHub Actions runs both suites. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium installation.

## Rebuild the corpus

Install Beautiful Soup with `python -m pip install beautifulsoup4`. Download the official XHTML from the EU Publications Office in English using headers `Accept: application/xhtml+xml` and `Accept-Language: en`.

- Consolidated `https://publications.europa.eu/resource/celex/02024R1689-20260727`
- Original `https://publications.europa.eu/resource/celex/32024R1689`
- Amendment `https://publications.europa.eu/resource/celex/32026R1744`

Run `python eu-ai-act/build_corpus.py consolidated.xhtml original.xhtml amendment.xhtml` and re-run the evaluation. The importer preserves provision IDs, normalizes whitespace, and removes inline edition markers. Update the edition, fixture expectations and source anchors as part of a source refresh.

## Deploy on Vercel

Import this repository as a separate Vercel project. The repository's `vercel.json` serves `public/eu-ai-act` at the domain root with no install or build step.
