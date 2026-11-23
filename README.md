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

Run the Python and pytest suites with Python 3.12 and Node.js 22:

```sh
python -m pip install -r eu-ai-act/requirements-test.txt
python -m playwright install chromium
python -m pytest eu-ai-act -v --junitxml=pytest-results.xml
```

Pytest runs every labeled question through the same JavaScript search engine the browser uses. It checks ranking, citation text, required phrases, irrelevant or duplicate sources, and abstention. The Playwright fixtures serve the deployed files over an ephemeral local HTTP server and cover desktop and mobile navigation, keyboard interaction, source links, quiz progress persistence, and the report. GitHub Actions runs both suites and uploads the JUnit XML alongside the public benchmark report. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium installation or `EU_AI_ACT_NODE` to point to a Node executable outside your PATH.

## LangSmith, DeepEval, Promptfoo and Ragas

The [framework adapters](eu-ai-act/frameworks) run against the Research Desk’s bundled search engine and reuse its labeled EU AI Act dataset. They use deterministic checks and do not require API keys. The local LangSmith experiment does not upload results.

| Framework | What it checks | Verified results |
| --- | --- | ---: |
| LangSmith | First-ranked provision and correct abstention behavior in a local dataset experiment. | 43/43 |
| DeepEval | A custom metric checks that citation text and links match the indexed legal provision. | 36/36 |
| Promptfoo | A custom provider runs the real search engine and gates on citations, required sources, unexpected sources, and abstention. | 43/43 |
| Ragas | ID-based context precision and recall for answerable questions. | 36/36 |

Python 3.12 and Node.js 22.23.5 reproduce the CI checks from the repository root:

```sh
python -m pip install -r eu-ai-act/frameworks/requirements.txt
python eu-ai-act/frameworks/evaluate_frameworks.py --output framework-results/python-frameworks.json
cd eu-ai-act/frameworks
npx --yes promptfoo@0.126.0 eval -c promptfooconfig.yaml --no-cache -o ../../framework-results/promptfoo.json
node check_promptfoo.mjs ../../framework-results/promptfoo.json
```

GitHub Actions uploads the per-case results as `eu-ai-act-framework-results`. The checks are complementary views of the same benchmark. Ragas scores source IDs on answerable cases, and the local Ollama smoke run is reported separately.

## Model safety and local Ollama evaluation

The [model safety tests](eu-ai-act/test_model_security.py) use the same retrieval engine as the Research Desk. They simulate instruction-bearing draft text, restricted records, unexpected model responses and insufficient evidence. The model adapter sends only excerpts that match the pinned corpus and accepts one approved source ID. Eight deterministic checks run in CI with mocked model responses.

The optional Ollama run tests citation selection behind that boundary. It includes four questions with approved sources and two abstentions. Each scenario runs twice. The public site uses deterministic retrieval.

To reproduce the local run, start Ollama with `qwen3:4b` installed and run:

```sh
EU_AI_ACT_OLLAMA_MODEL=qwen3:4b python -m pytest eu-ai-act/test_model_security.py -v --junitxml=model-smoke.xml
```

In PowerShell, set `$env:EU_AI_ACT_OLLAMA_MODEL = 'qwen3:4b'` before running the pytest command. See the [local smoke report](MODEL_EVALUATION.md) for the observed outcomes and scope.

## Performance and visual regression evidence

The [CI workflow](https://github.com/zinaelnahel/eu-ai-act-research-desk/actions/workflows/eu-ai-act.yml) uploads `eu-ai-act-quality-evidence` with viewport screenshots, pixel diffs, and a k6 summary and JSON report.

- Playwright captures the desktop research desk and mobile quiz from the candidate and its Git baseline in the same Chromium session. CI uses the pull request base commit, or the pinned release commit on pushes. Intentional design changes require reviewing the screenshots before updating the pinned baseline. To run locally, set `EU_AI_ACT_VISUAL_BASELINE` to an extracted baseline's `public/eu-ai-act` directory and run `python -m pytest eu-ai-act/test_visual.py -v`.
- k6 sends 144 asset requests across four virtual users to a loopback server. It checks response status, expected contents, and p95 request duration. The results describe the test runner's static file delivery and provide a bounded regression check.

## Rebuild the corpus

Install Beautiful Soup with `python -m pip install beautifulsoup4`. Download the official XHTML from the EU Publications Office in English using headers `Accept: application/xhtml+xml` and `Accept-Language: en`.

- Consolidated `https://publications.europa.eu/resource/celex/02024R1689-20260727`
- Original `https://publications.europa.eu/resource/celex/32024R1689`
- Amendment `https://publications.europa.eu/resource/celex/32026R1744`

Run `python eu-ai-act/build_corpus.py consolidated.xhtml original.xhtml amendment.xhtml` and re-run the evaluation. The importer preserves provision IDs, normalizes whitespace, and removes inline edition markers. Update the edition, fixture expectations and source anchors as part of a source refresh.

## Deploy on Vercel

Import this repository as a separate Vercel project. The repository's `vercel.json` serves `public/eu-ai-act` at the domain root with no install or build step.
