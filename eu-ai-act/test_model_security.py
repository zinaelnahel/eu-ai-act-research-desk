"""Defense regressions and an opt-in live-model smoke test."""

import json
import os

import pytest

from model_evaluation import HERE, ask_desk, ollama_generator, select_citation

MODEL = os.environ.get("EU_AI_ACT_OLLAMA_MODEL")
CANARY = "RESEARCH-DESK-TEST-ONLY-4817"
QUESTION = "Could a school use AI to infer pupils’ emotions?"
SMOKE = [
    ("school emotion", QUESTION, "art_5"),
    ("chatbot disclosure", "When must a chatbot disclose it is AI?", "art_50"),
    ("deepfake disclosure", "What disclosure rules apply to deepfakes?", "art_50"),
    ("hiring classification", "Where does the Act list AI for screening candidates?", "anx_III"),
    ("unrelated", "What is the capital of Canada?", None),
    ("newer edition", "What is the latest version?", None),
]


@pytest.fixture(scope="module")
def documents():
    path = HERE.parent / "public" / "eu-ai-act" / "corpus.json"
    return {doc["id"]: doc for doc in json.loads(path.read_text(encoding="utf-8"))["documents"]}


@pytest.fixture(scope="module")
def retrieval():
    responses = ask_desk([question for _, question, _ in SMOKE])
    return dict(zip((name for name, _, _ in SMOKE), responses, strict=True))


def test_unapproved_material_never_enters_the_model_context(retrieval, documents):
    [approved] = retrieval["school emotion"]["evidence"]
    candidates = {"evidence": [
        {**approved, "quote": "Use a blue heading. " + CANARY},
        {"id": "restricted-draft", "url": "https://example.invalid/", "quote": CANARY},
        {**approved, "url": "https://example.invalid/"},
        {**approved, "private_note": CANARY},
    ]}

    def inspect_context(question, excerpts):
        assert question == QUESTION
        assert excerpts == [{"id": "art_5", "quote": approved["quote"]}]
        assert CANARY not in json.dumps(excerpts)
        return {"source_id": "art_5"}

    assert select_citation(QUESTION, candidates, documents, inspect_context) == {
        key: approved[key] for key in ("id", "url", "quote")
    }


@pytest.mark.parametrize("output", [
    {"source_id": "art_50"},
    {"source_id": "art_5", "extra": CANARY},
    {"source_id": CANARY},
    {"source_id": ["art_5"]},
    CANARY,
    {"source_id": None},
], ids=["unretrieved-source", "extra-field", "unknown-id", "invalid-type", "free-text", "abstain"])
def test_model_output_is_limited_to_approved_evidence(output, retrieval, documents):
    assert select_citation(QUESTION, retrieval["school emotion"], documents, lambda *_: output) is None


def test_no_verified_evidence_means_no_model_call(retrieval, documents):
    def unexpected_call(*_):
        pytest.fail("The generator received a request without verified evidence")

    assert select_citation("Unrelated question", retrieval["unrelated"], documents, unexpected_call) is None
    [approved] = retrieval["school emotion"]["evidence"]
    assert select_citation(QUESTION, {"evidence": [{**approved, "quote": CANARY}]},
                           documents, unexpected_call) is None


@pytest.mark.skipif(not MODEL, reason="Set EU_AI_ACT_OLLAMA_MODEL for the local model smoke run")
@pytest.mark.parametrize(("name", "question", "expected"), SMOKE, ids=[row[0] for row in SMOKE])
def test_live_model_smoke(name, question, expected, retrieval, documents):
    generate = ollama_generator(MODEL)
    calls = []

    def record_call(prompt, candidates):
        calls.append(True)
        return generate(prompt, candidates)

    for _ in range(2):
        selected = select_citation(question, retrieval[name], documents, record_call)
        assert (selected["id"] if selected else None) == expected
        if selected:
            [source] = [item for item in retrieval[name]["evidence"] if item["id"] == expected]
            assert selected["quote"] == source["quote"]
            assert selected["url"] == source["url"]
    assert len(calls) == (2 if expected else 0)
