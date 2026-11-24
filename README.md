# EU AI Act Research Desk

[Open the desk](https://eu-ai-act-research-desk.vercel.app/) · [Try learning mode](https://eu-ai-act-research-desk.vercel.app/learn.html) · [Read the evaluation](https://eu-ai-act-research-desk.vercel.app/evaluation.html)

Ask a question about Regulation (EU) 2024/1689 or browse its articles, annexes and recitals. Direct lookups resolve provision IDs, reviewed mappings select answer-bearing paragraphs for common questions, and weighted passage retrieval handles other wording. The live Ask AI flow generates cited answers with OpenAI and keeps the supporting text available when generation falls back.

Learning mode has 12 topics spanning the Act’s chapters, 27 sourced scenarios and a mixed challenge. Read the explanation and linked provision after each decision. Chapter completions, best scores and XP are saved in browser storage on the current device.

## Source editions

- [27 July 2026 consolidated English edition](https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng), including 119 articles and 14 annexes.
- [Original Official Journal edition](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) and [2026 amending regulation](https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng), which supply 227 recitals.

The snapshot is pinned. Questions about newer versions are redirected to EUR-Lex. The consolidated edition is a documentation tool without legal effect. The authentic texts are published in the Official Journal. The desk supplies evidence for research and leaves determinations about individual systems to qualified professionals.

Search and answers use the English corpus. The Legal sources panel also links to the German and Spanish Official Journal texts.

## Cited answer generation

The [course RAG notebook](https://github.com/zinaelnahel/demos_ai_engineering_sept2026/blob/6145ed38e441875e5c1a6c2d65af31da38ac0685/N_LangChain/03_langchain-RAG.ipynb) uses LangChain and embedding-based retrieval. This project uses indexed legal provisions, reviewed mappings and weighted passage retrieval. Both retrieve context before calling the answer model. The legal index makes direct provision lookups and exact citation checks repeatable.

The server retrieves from the same pinned corpus used by the evidence view. It gives the model verified passages and their titles, checks selected source IDs, attaches the original quotations and official links itself, then asks the model to review the draft for grounding and material exceptions. Unsupported or unreviewed drafts fall back to the evidence view. Both passes use the configured model, so the review can repeat the drafting model's mistakes.

If the first draft fails validation or review, the server attempts one shorter draft before falling back to the sources. Every published draft still goes through the same validation and review.

[Starter prompt checks](https://github.com/zinaelnahel/eu-ai-act-research-desk/actions/workflows/starter-smoke.yml) run the three built-in questions against the live deployment weekly. Each run records outcomes, fallback reasons and citations. These checks use the configured hosted model.

Ask AI keeps a short conversation on the current page. It shows the provision carried forward and asks for clarification when the reference is ambiguous. Expand an earlier question to revisit its answer, or select Start a new conversation to clear the page's history. For generated answers, the model receives a standalone question.

Two narrow cases use direct source-based answers: whether the Article 5 workplace prohibition also applies in schools, and whether a placement date falls before the Article 111(3) GPAI cutoff. The school follow-up opens with “Yes, the prohibition also applies in schools” and keeps the medical or safety exception. The cutoff comparison uses the date stated in the pinned provision. Both flows display the supporting excerpt and make zero model calls.

With Ollama running locally and the model installed, run these commands from the repository root:

```sh
export EU_AI_ACT_OLLAMA_MODEL=qwen3:4b
node eu-ai-act/serve.mjs
# Open http://127.0.0.1:8080 and select Ask AI.
# In a separate terminal with the same environment variable:
node eu-ai-act/rag-eval.mjs rag-live-results.json
```

In PowerShell use `$env:EU_AI_ACT_OLLAMA_MODEL = 'qwen3:4b'`. On Vercel, the API can use a structured-output model through server-side `EU_AI_ACT_OPENAI_KEY` and `EU_AI_ACT_OPENAI_MODEL`. Without a configured provider, the hosted desk serves its evidence and quiz features.

[Read the generated-answer evaluation](RAG_EVALUATION.md) for the offline regression checks, local model results and known failures.

Vercel Firewall limits `POST /api/answer` to 20 requests per minute per client IP at the edge. The application also limits each warm function instance. The UI keeps the retrieved passages visible on HTTP 429.

## Monitor official source changes

[GitHub Actions](https://github.com/zinaelnahel/eu-ai-act-research-desk/actions/workflows/source-monitor.yml) checks the Publications Office’s CELLAR metadata daily for new consolidations, amendments and corrigenda linked to the AI Act. It records each check and opens a deduplicated review issue with official links when it finds a change. The Legal sources panel shows when the latest metadata check ran and identifies new records awaiting review. The metadata baseline records known documents and does not certify that every record applies to the English text.

An update is reviewed against the Official Journal and checked for applicability before the corpus is rebuilt. Use the corpus rebuild and evaluation steps below and review quiz citations before publishing any new snapshot.

[Interview infographic](https://eu-ai-act-research-desk.vercel.app/architecture.html) · [One-page PDF](https://eu-ai-act-research-desk.vercel.app/architecture.pdf)

## Run and verify

The separate [10-case authored challenge set](eu-ai-act/challenge-cases.json) exercises paraphrased conditions, obligations and abstention. It passed 4 of 10 before retrieval changes and 10 of 10 after them. CI keeps that development baseline under regression. The [independent review pack](INDEPENDENT_REVIEW.md) explains how a legal reviewer can score outputs blind and contribute unseen questions.

Use Node.js 22 and Python 3.12. From the repository root:

```sh
python -m http.server --directory public 8000
# Open http://localhost:8000/eu-ai-act/index.html
node --test eu-ai-act/*.test.mjs
node eu-ai-act/evaluate.mjs --write
node eu-ai-act/challenge-eval.mjs challenge-results.json --gate
```

The 43 labeled cases check first-ranked provisions, required supporting sources, verbatim evidence, exceptions and abstention. Irrelevant and duplicate provisions fail the case even when every required source is present. Optional sources require a documented rationale. The report shows micro-averaged provision precision across returned citations and marks abstentions separately. The suite checks direct lookup for all 360 corpus entries and verifies that the report matches a fresh run.

Run the Python and pytest suites with Python 3.12 and Node.js 22:

```sh
python -m pip install -r eu-ai-act/requirements-test.txt
python -m playwright install chromium
python -m pytest eu-ai-act -v --junitxml=pytest-results.xml
```

Pytest runs every labeled question through the same JavaScript search engine the browser uses. It checks ranking, citation text, required phrases, irrelevant or duplicate sources, and abstention. The Playwright fixtures serve the deployed files over an ephemeral local HTTP server and cover desktop and mobile navigation, keyboard interaction, source links, quiz progress persistence, and the report. GitHub Actions runs both suites and uploads the JUnit XML alongside the public benchmark report. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an existing Chromium installation or `EU_AI_ACT_NODE` to point to a Node executable outside your PATH.

Run hosted tests separately from the offline suite. They use the deployed model for generation cases, and score the GPAI date comparisons as source-based answers:

```sh
node eu-ai-act/rag-eval.mjs --hosted hosted-results.json
node eu-ai-act/rag-eval.mjs --hosted boundary-results.json --boundary-feedback
```

See the [recorded runs](RAG_EVALUATION.md#production-verification) for the browser-feedback, paragraph-selection and boundary cases, including observed fallbacks. Independent legal review is pending.

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

The optional Ollama run tests citation selection behind that boundary. It includes four questions with approved sources and two abstentions. Each scenario runs twice. The deployed Ask AI generation pipeline has its own [regression suite and hosted results](RAG_EVALUATION.md).

To reproduce the local run, start Ollama with `qwen3:4b` installed and run:

```sh
EU_AI_ACT_OLLAMA_MODEL=qwen3:4b python -m pytest eu-ai-act/test_model_security.py -v --junitxml=model-smoke.xml
```

In PowerShell, set `$env:EU_AI_ACT_OLLAMA_MODEL = 'qwen3:4b'` before running the pytest command. See the [local smoke report](MODEL_EVALUATION.md) for the observed outcomes and scope.

## Performance and visual regression evidence

The [CI workflow](https://github.com/zinaelnahel/eu-ai-act-research-desk/actions/workflows/eu-ai-act.yml) uploads `eu-ai-act-quality-evidence` with viewport screenshots, pixel diffs, and a k6 summary and JSON report.

- Playwright captures the desktop research desk, desktop evaluation report and mobile quiz from the candidate and its Git baseline in the same Chromium session. CI uses the pull request base commit, or the pinned release commit on pushes. Intentional design changes require reviewing the screenshots before updating the pinned baseline. To run locally, set `EU_AI_ACT_VISUAL_BASELINE` to an extracted baseline's `public/eu-ai-act` directory and run `python -m pytest eu-ai-act/test_visual.py -v`.
- k6 sends 144 asset requests across four virtual users to a loopback server. It checks response status, expected contents, and p95 request duration. The results describe the test runner's static file delivery and provide a bounded regression check.

## Rebuild the corpus

Install Beautiful Soup with `python -m pip install beautifulsoup4`. Download the official XHTML from the EU Publications Office in English using headers `Accept: application/xhtml+xml` and `Accept-Language: en`.

- Consolidated `https://publications.europa.eu/resource/celex/02024R1689-20260727`
- Original `https://publications.europa.eu/resource/celex/32024R1689`
- Amendment `https://publications.europa.eu/resource/celex/32026R1744`

Run `python eu-ai-act/build_corpus.py consolidated.xhtml original.xhtml amendment.xhtml` and re-run the evaluation. The importer preserves provision IDs, normalizes whitespace, and removes inline edition markers. Update the edition, fixture expectations and source anchors as part of a source refresh.

## Deploy on Vercel

Import this repository as a separate Vercel project. The repository's `vercel.json` serves `public/eu-ai-act` at the domain root with no install or build step.
