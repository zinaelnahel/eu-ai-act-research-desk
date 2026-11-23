"""Exercise the shipped JavaScript search engine against the labeled cases in pytest."""

import json
import os
import subprocess
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public" / "eu-ai-act"
CASES = json.loads((HERE / "cases.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def corpus():
    return json.loads((PUBLIC / "corpus.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def documents(corpus):
    return {source["id"]: source for source in corpus["documents"]}


@pytest.fixture(scope="module")
def answers():
    completed = subprocess.run(
        [os.environ.get("EU_AI_ACT_NODE", "node"), str(HERE / "query-desk.mjs")],
        input=json.dumps([case["question"] for case in CASES]),
        encoding="utf-8", capture_output=True, timeout=20,
    )
    assert completed.returncode == 0, completed.stderr
    responses = json.loads(completed.stdout)
    return dict(zip((case["name"] for case in CASES), responses, strict=True))


@pytest.mark.parametrize("case", CASES, ids=[case["name"] for case in CASES])
def test_labeled_retrieval(case, answers, documents):
    response = answers[case["name"]]
    evidence = response["evidence"]
    if case.get("kind"):
        assert response["kind"] == case["kind"]
        assert evidence == []
        return

    required = case["sources"]
    ids = [item["id"] for item in evidence]
    assert ids, "No evidence returned for an answerable question"
    assert ids[0] == required[0]
    assert set(required) <= set(ids), f"Missing required provisions: {set(required) - set(ids)}"
    allowed = set(required) | set(case.get("optionalSources", {}))
    assert set(ids) <= allowed, f"Unexpected provisions: {set(ids) - allowed}"
    assert len(ids) == len(set(ids)), f"Duplicate provisions: {ids}"
    for item in evidence:
        source = documents[item["id"]]
        assert item["url"] == source["url"]
        assert item["quote"].strip()
        assert item["quote"] in "\n\n".join(source["blocks"])
    for phrase in case["phrases"]:
        assert any(phrase.casefold() in item["quote"].casefold()
                   for item in evidence if item["id"] in required), phrase


def test_published_report_covers_the_tested_edition_and_cases(corpus):
    report = json.loads((PUBLIC / "evaluation.json").read_text(encoding="utf-8"))
    assert report["edition"] == corpus["version"]
    assert report["total"] == len(CASES)
    assert [item["name"] for item in report["results"]] == [case["name"] for case in CASES]
    assert report["passed"] == sum(item["passed"] for item in report["results"])
    assert report["unexpected"] == sum(len(item["unexpected"]) for item in report["results"])
