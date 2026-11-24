# Generated answer evaluation

The RAG pipeline generates an answer from passages returned by the existing 360-provision corpus. This benchmark adds six questions with expected citations and qualifiers, and six inputs that should abstain before a model call.

## Results

| Check | Outcome |
| --- | --- |
| Existing labeled retrieval benchmark | 43 of 43 passed |
| New deterministic RAG contract tests | 19 of 19 passed |
| Local Python and Playwright suite | 59 passed, six optional citation-selection checks skipped |
| Local Qwen3 4B generation smoke run | 10 of 12 passed |

The local model passed four of six answerable cases and all six abstentions. Complaint eligibility was cited correctly but the answer omitted the market surveillance authority. The deepfake draft was withheld and the browser can still render the original evidence. Answerable cases took roughly 1.8 to 3.0 seconds in this local run.

The first run also caught a workplace emotion recognition answer that reversed a prohibition. Its model reviewer approved it. The follow-up run included the verified provision title in context and checked the baseline rule before exceptions. A deterministic regression test now rejects the observed wording. The regression is specific to that failure pattern.

## What the automated checks cover

- Required provisions, irrelevant citations, verbatim source evidence and abstention in the existing retrieval benchmark.
- Expected citation IDs and legal terms in generated answers, and zero model calls for out-of-scope questions, individual compliance verdicts, direct browse, unsupported editions and empty input.
- Server-owned quotes and URLs, unknown source IDs, unsupported numbers, invalid responses, excluded test-only context and rejected review.
- Browser interactions for the generated answer, its citations and quotations, fallback when a draft is rejected, and abstention with no API request.

The automated vocabulary checks measure selected requirements. Use the saved generated claims for human review of completeness, relevance and legal meaning. The same model drafts and reviews answers, so both passes can share an error. The framework results on the site are retrieval results. The hosted desk defaults to evidence lookup until generation has a configured provider.

## Reproduce

Run from the repository root with Node 22:

```sh
node --test eu-ai-act/rag.test.mjs
EU_AI_ACT_OLLAMA_MODEL=qwen3:4b node eu-ai-act/rag-eval.mjs rag-live-results.json
```

The live runner writes per-case outcomes, generated claims, missing checks, latency and model call counts. A failing scenario sets a nonzero exit code. [Download the recorded case results](eu-ai-act/rag-live-report.json) or [open GitHub Actions for the offline regression artifacts](https://github.com/zinaelnahel/eu-ai-act-research-desk/actions/workflows/eu-ai-act.yml).
