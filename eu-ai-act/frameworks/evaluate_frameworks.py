"""Run offline evaluation frameworks against the Research Desk's live search code."""

import argparse
import asyncio
import json
import os
import sys
from importlib.metadata import version
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5

os.environ["LANGSMITH_TRACING"] = "false"
os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "1"
os.environ["RAGAS_DO_NOT_TRACK"] = "true"

from deepeval.evaluate import AsyncConfig, CacheConfig, DisplayConfig, evaluate as deepeval_evaluate
from deepeval.metrics import BaseMetric
from deepeval.test_case import LLMTestCase
from langsmith.evaluation import evaluate
from langsmith.schemas import Example
from ragas import SingleTurnSample
from ragas.metrics import IDBasedContextPrecision, IDBasedContextRecall

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from model_evaluation import ask_desk


def read(path):
    return json.loads(path.read_text(encoding="utf-8"))


def langsmith_results(cases, answers):
    examples = [
        Example(id=uuid5(NAMESPACE_URL, "eu-ai-act/" + case["name"]),
                inputs={"case": case["name"], "question": case["question"]}, outputs=case)
        for case in cases
    ]

    def target(inputs):
        return answers[inputs["case"]]

    def ranked_outcome(outputs, reference_outputs):
        evidence = outputs["evidence"]
        if reference_outputs.get("kind"):
            return outputs["kind"] == reference_outputs["kind"] and not evidence
        return bool(evidence) and evidence[0]["id"] == reference_outputs["sources"][0]

    experiment = evaluate(
        target, data=examples, evaluators=[ranked_outcome], upload_results=False,
        max_concurrency=0, experiment_prefix="eu-ai-act-retrieval",
    )
    return [
        {"case": row["example"].inputs["case"],
         "passed": row["evaluation_results"]["results"][0].score == 1}
        for row in experiment
    ]


class VerbatimCitationMetric(BaseMetric):
    """Check that actual citation text appears verbatim in its cited provision."""

    threshold = 1.0
    async_mode = False

    def measure(self, test_case, **_):
        evidence = json.loads(test_case.actual_output)
        documents = json.loads(test_case.expected_output)
        self.score = float(bool(evidence) and all(
            item["id"] in documents and item["url"] == documents[item["id"]]["url"]
            and bool(item["quote"].strip())
            and item["quote"] in "\n\n".join(documents[item["id"]]["blocks"])
            for item in evidence
        ))
        self.success = self.score >= self.threshold
        self.reason = "Each quote must occur verbatim in its cited provision and use the indexed source URL."
        return self.score

    async def a_measure(self, test_case):
        return self.measure(test_case)

    def is_successful(self):
        return self.success

    @property
    def __name__(self):
        return "Verbatim citation grounding"


def deepeval_results(cases, answers, documents):
    samples = []
    for case in cases:
        if case.get("kind"):
            continue
        evidence = answers[case["name"]]["evidence"]
        samples.append(LLMTestCase(
            name=case["name"],
            input=case["question"],
            actual_output=json.dumps(evidence),
            expected_output=json.dumps({item["id"]: documents[item["id"]] for item in evidence
                                        if item["id"] in documents}),
        ))
    evaluation = deepeval_evaluate(
        test_cases=samples,
        metrics=[VerbatimCitationMetric()],
        async_config=AsyncConfig(run_async=False),
        display_config=DisplayConfig(show_indicator=False, print_results=False, inspect_after_run=False),
        cache_config=CacheConfig(write_cache=False, use_cache=False),
    )
    return [
        {"case": row.name, "score": row.metrics_data[0].score, "passed": row.success}
        for row in evaluation.test_results
    ]


async def ragas_results(cases, answers):
    precision = IDBasedContextPrecision()
    recall = IDBasedContextRecall()
    results = []
    for case in cases:
        required = case["sources"]
        if not required:
            continue
        allowed = [*required, *case.get("optionalSources", {})]
        actual = [item["id"] for item in answers[case["name"]]["evidence"]]
        precision_score = await precision.single_turn_ascore(
            SingleTurnSample(retrieved_context_ids=actual, reference_context_ids=allowed)
        ) if actual else None
        recall_score = await recall.single_turn_ascore(
            SingleTurnSample(retrieved_context_ids=actual, reference_context_ids=required)
        )
        results.append({"case": case["name"], "precision": precision_score, "recall": recall_score,
                        "passed": precision_score == 1 and recall_score == 1})
    return results


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cases = read(ROOT / "cases.json")
    corpus = read(ROOT.parent / "public" / "eu-ai-act" / "corpus.json")
    documents = {item["id"]: item for item in corpus["documents"]}
    answers = dict(zip((case["name"] for case in cases),
                       ask_desk([case["question"] for case in cases]), strict=True))
    metrics = {
        "langsmith": langsmith_results(cases, answers),
        "deepeval": deepeval_results(cases, answers, documents),
        "ragas": asyncio.run(ragas_results(cases, answers)),
    }
    results = {}
    expected_answerable = sum(bool(case["sources"]) for case in cases)
    for name, scores in metrics.items():
        results[name] = {"version": version(name), "passed": sum(item["passed"] for item in scores),
                         "total": len(scores), "cases": scores}
        print(f"{name}: {results[name]['passed']}/{len(scores)} passed")
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"edition": corpus["version"], "results": results}, indent=2, allow_nan=False) + "\n",
                           encoding="utf-8")
    expected_counts = {"langsmith": len(cases), "deepeval": expected_answerable, "ragas": expected_answerable}
    return 0 if all(row["passed"] == row["total"] == expected_counts[name]
                    for name, row in results.items()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
