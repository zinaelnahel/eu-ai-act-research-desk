# Independent review pack

**Status: awaiting an independent reviewer.** The repository’s challenge cases and labels were prepared during development. Their pass rate measures reproducible agreement with those labels.

## Prepare a blind review

Export the prompts without the repository’s expected provisions:

```sh
node -e "console.log(JSON.stringify(require('./eu-ai-act/challenge-cases.json').map(({name,question})=>({id:name,question})),null,2))" > reviewer-prompts.json
```

1. Give the reviewer the prompts, the official edition, and the blank scoring fields below. Ask them to write a reference conclusion, required provisions and material qualifications without seeing the desk’s answers or author labels. Ask them to add at least three original difficult questions, including a cross-provision case and an ambiguous fact pattern.
2. Freeze the questions and reference conclusions before testing. Record the edition, commit, provider/model version, and date. Run each prompt once, retaining both the answer and the fallback evidence. Repeat model runs separately to measure instability.
3. Have the reviewer score each output against their reference. Publish aggregate counts alongside anonymised disagreement notes with permission. Keep reviewer-added cases separate from the development suite until the independent baseline is recorded.

| Field | Record |
| --- | --- |
| Case ID and response mode | Generated answer, source-based answer, excerpts, or abstention |
| Expected conclusion | One or two sentences with provision and paragraph |
| Mandatory qualifications | Trigger, regulated party, exception, timing, or other limits that change the conclusion |
| Retrieval | Required passage present, missing, or obscured by irrelevant results |
| Answer | Complete, incomplete, incorrect, or appropriate abstention |
| Citation | Each material claim supported by the cited passage |
| Severity and notes | Material legal error, minor ambiguity, or pass |

For the English snapshot, consult the [consolidated reading copy](https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng) and check the [original Official Journal text](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng) and [amendment](https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng) when verifying wording and applicability.
