"""Browser tests for the same static files deployed to Vercel."""

from playwright.sync_api import expect


def assert_no_page_overflow(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


def test_gpai_cutoff_and_distributor_routes_show_exact_fallback(open_page):
    page = open_page(mobile=True)
    page.route("**/api/answer", lambda route: route.fulfill(status=503, json={"error": "Unavailable"}))
    field = page.get_by_role("searchbox", name="Your question")
    answer = page.locator("#answer")
    expect(page.get_by_role("button", name="Ask AI")).to_be_enabled()

    for prompt, clause, text in [
        ("When does a distributor become the provider by putting its own trademark on a high-risk AI system?",
         "Article 25(1)(a)", "contractual arrangements"),
        ("Does a distributor become a provider if it substantially modifies an existing high-risk AI system that remains high-risk?",
         "Article 25(1)(b)", "it remains a high-risk AI system"),
        ("Does a distributor become the provider if it changes the intended purpose so an existing system becomes high-risk, without rebranding?",
         "Article 25(1)(c)", "has not been classified as high-risk"),
    ]:
        field.fill(prompt)
        field.press("Enter")
        expect(page.get_by_role("status")).to_contain_text("temporarily unavailable")
        expect(answer.get_by_role("heading", name=clause, exact=False)).to_be_visible()
        expect(answer.get_by_text(text, exact=False).first).to_be_visible()

    field.fill("When must providers comply for GPAI models already on the market before 2 August 2025?")
    field.press("Enter")
    expect(answer.get_by_role("heading", name="Article 111(3)", exact=False)).to_be_visible()
    for day, result in [(1, "before"), (2, "on"), (3, "after")]:
        field.fill(f"What if it was first placed on the market on {day} August 2025?")
        field.press("Enter")
        expect(answer).to_contain_text("Following up on Article 111(3)")
        expect(answer.get_by_role("heading", name="Article 111(3)", exact=False)).to_be_visible()
        expect(answer).to_contain_text(f"{day} August 2025 is {result} the cutoff.")
    assert_no_page_overflow(page)


def test_ask_ai_greeting_from_library(open_page):
    page = open_page("/index.html#library", mobile=True)
    search = page.get_by_role("searchbox", name="Your question")
    expect(page.get_by_role("button", name="Ask AI")).to_be_enabled()
    search.fill("Hi!")
    search.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("Hi! I can help you explore the EU AI Act.")
    expect(page.get_by_role("heading", name="Source-grounded answers")).to_be_focused()


def test_missing_article_and_model_failure_give_specific_next_steps(open_page):
    page = open_page()
    page.route("**/api/answer", lambda route: route.fulfill(status=503, json={"error": "Unavailable"}))
    search = page.get_by_role("searchbox", name="Your question")
    expect(page.get_by_role("button", name="Ask AI")).to_be_enabled()
    search.fill("What does Article 999 say?")
    search.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("Article 999 was not found in this edition. Try searching by topic instead.")
    search.fill("When must a chatbot disclose it is AI?")
    search.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("temporarily unavailable")
    expect(page.locator("#answer")).to_contain_text("Article 50(5) · Timing")
    expect(page.locator("#answer")).to_contain_text("at the time of the first interaction or exposure")


def test_incident_fallback_shows_answering_paragraph_and_handles_followup(open_page):
    page = open_page(mobile=True)
    page.route("**/api/answer", lambda route: route.fulfill(status=503, json={"error": "Unavailable"}))
    search = page.get_by_role("searchbox", name="Your question")
    expect(page.get_by_role("button", name="Ask AI")).to_be_enabled()
    search.fill("Does a provider always have 15 days to report a serious incident, including when someone dies?")
    search.press("Enter")
    answer = page.locator("#answer")
    expect(answer.get_by_role("heading", name="Article 73(4)", exact=False)).to_be_visible()
    expect(answer.get_by_text("not later than 10 days", exact=False).first).to_be_visible()
    expect(answer.get_by_role("heading", name="Article 73(2)", exact=True)).to_be_visible()
    search.fill("What if the incident disrupts critical infrastructure?")
    search.press("Enter")
    expect(answer).to_contain_text("Following up on Article 73")
    expect(answer.get_by_role("heading", name="Article 73(3)", exact=False)).to_be_visible()
    expect(answer.get_by_text("not later than two days", exact=False).first).to_be_visible()
    expect(answer.get_by_text("serious and irreversible disruption", exact=False).first).to_be_visible()
    search.fill("Can a provider file an incomplete initial incident report and send the rest later?")
    search.press("Enter")
    expect(answer.get_by_role("heading", name="Article 73(5)", exact=False)).to_be_visible()
    expect(answer.get_by_text("Where necessary to ensure timely reporting", exact=False).first).to_be_visible()
    search.fill("How many moons does Mars have?")
    search.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("did not find enough matching evidence")
    assert_no_page_overflow(page)


def test_plain_language_fallback_and_complaint_followup(open_page):
    page = open_page(mobile=True)
    page.route("**/api/answer", lambda route: route.fulfill(status=503, json={"error": "Unavailable"}))
    search = page.get_by_role("searchbox", name="Your question")
    expect(page.get_by_role("button", name="Ask AI")).to_be_enabled()
    answer = page.locator("#answer")

    for prompt, provision, wording in [
        ("When does a distributor become the provider by putting its own trademark on a high-risk AI system?",
         "Article 25(1)(a)", "contractual arrangements stipulating that the obligations are otherwise allocated"),
        ("What happens to a fundamental rights impact assessment if relevant facts change during use?",
         "Article 27(2)", "update the information"),
        ("When must providers comply for GPAI models already on the market before 2 August 2025?",
         "Article 111(3)", "2 August 2027"),
    ]:
        search.fill(prompt)
        search.press("Enter")
        expect(page.get_by_role("status")).to_contain_text("temporarily unavailable")
        expect(answer.get_by_role("heading", name=provision, exact=False)).to_be_visible()
        expect(answer.get_by_text(wording, exact=False).first).to_be_visible()

    search.fill("What does Article 25(1)(a) say about a distributor’s trademark?")
    search.press("Enter")
    expect(page.get_by_role("status")).to_have_text("Requested source")
    expect(answer.get_by_text("they put their name or trademark", exact=False).first).to_be_visible()
    search.fill("Who can lodge an AI Act complaint?")
    search.press("Enter")
    expect(answer.get_by_role("heading", name="Article 85", exact=False)).to_be_visible()
    search.fill("Is that the same as asking for compensation?")
    search.press("Enter")
    expect(answer).to_contain_text("Following up on Article 85")
    expect(answer.get_by_text("Without prejudice to other administrative or judicial remedies", exact=False).first).to_be_visible()
    assert_no_page_overflow(page)


def test_new_legal_records_show_review_notice_and_official_link(open_page):
    page = open_page("/index.html#library", mobile=True)
    page.route("**/api/source-status", lambda route: route.fulfill(json={
        "checkedAt": "2026-11-24T06:27:00Z",
        "changes": [{"id": "02024R1689-20270101"}],
    }))
    page.reload()
    notice = page.locator("#source-check")
    expect(notice).to_contain_text("24 Nov 2026 (UTC)")
    expect(notice).to_contain_text("awaiting review")
    expect(notice.get_by_role("link")).to_have_attribute(
        "href", "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A02024R1689-20270101"
    )
    assert_no_page_overflow(page)


def test_mobile_generated_answer_cites_evidence_and_keeps_fallback(open_page):
    page = open_page(mobile=True)
    requests = []
    url = "https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng#art_5"

    def answer(route):
        if route.request.method == "GET":
            route.fulfill(json={"available": True})
            return
        requests.append(route.request.post_data_json["question"])
        if len(requests) == 1:
            route.fulfill(json={"status": "answered", "claims": [{
                "text": "The ban includes workplace emotion inference.",
                "label": "Article 5", "url": url, "quote": "medical or safety reasons",
            }]})
        elif len(requests) == 2:
            route.fulfill(json={"status": "rejected", "claims": []})
        else:
            route.fulfill(status=429, json={"error": "Too many requests"})

    page.route("**/api/answer", answer)
    page.reload()
    search = page.get_by_role("searchbox", name="Your question")
    generate = page.get_by_role("button", name="Ask AI")
    expect(generate).to_be_enabled()
    assert generate.bounding_box()["y"] < page.get_by_role("link", name="Learn with scenario quizzes").bounding_box()["y"]
    search.fill("Is emotion recognition allowed at work?")
    search.press("Enter")
    generated = page.locator("#answer .generated-answer")
    expect(generated.get_by_role("link", name="Article 5")).to_have_attribute("href", url)
    generated.get_by_text("Read supporting quote").press("Enter")
    expect(generated.get_by_text("medical or safety reasons")).to_be_visible()
    expect(page.get_by_text("You asked: Is emotion recognition allowed at work?")).to_be_visible()
    assert_no_page_overflow(page)
    generate.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("supported generated answer was unavailable")
    expect(generated).to_have_count(0)
    expect(page.get_by_role("link", name="Read the consolidated provision")).to_have_attribute("href", url)
    page.get_by_role("button", name="Find evidence only").click()
    expect(page.get_by_role("status")).to_contain_text("Relevant provisions")
    generate.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("too many requests")
    expect(page.get_by_role("link", name="Read the consolidated provision")).to_have_attribute("href", url)
    search.fill("What is the capital of Canada?")
    generate.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("did not find enough")
    assert len(requests) == 3


def test_conversation_keeps_citations_and_requires_clear_context(open_page):
    page = open_page(mobile=True)
    submitted = []
    url = "https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng#art_5"

    def answer(route):
        submitted.append(route.request.post_data_json["question"])
        route.fulfill(json={"status": "answered", "claims": [{
            "text": "The prohibition includes education, with medical and safety exceptions.",
            "sourceId": "art_5", "label": "Article 5", "url": url,
            "quote": "medical or safety reasons",
        }]})

    page.route("**/api/answer", answer)
    search = page.get_by_role("searchbox", name="Your question")
    expect(page.get_by_role("button", name="Ask AI")).to_be_enabled()
    search.fill("Does that also apply to schools?")
    search.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("Which topic or provision")
    assert not submitted
    search.fill("Is emotion recognition allowed at work?")
    search.press("Enter")
    expect(page.locator("#answer .generated-answer")).to_be_visible()
    search.fill("Does that also apply to schools?")
    search.press("Enter")
    expect(page.locator("#answer")).to_contain_text("Following up on Article 5")
    expect(page.locator("#answer .generated-answer")).to_be_visible()
    assert "Could a school use AI to infer" in submitted[-1]
    quote = page.locator("#answer .generated-answer").get_by_text("Read supporting quote")
    quote.click()
    page.locator("#answer").get_by_text("Read the surrounding provision").first.click()
    expect(page.locator("#answer").get_by_text("The following AI practices shall be prohibited", exact=False).first).to_be_visible()
    history = page.get_by_role("region", name="Previous questions and answers")
    history.get_by_text("Is emotion recognition allowed at work?", exact=True).click()
    expect(history.get_by_role("link", name="Article 5", exact=True)).to_be_visible()
    page.get_by_role("button", name="Start a new conversation").click()
    expect(search).to_be_focused()
    expect(history).to_have_count(0)
    assert_no_page_overflow(page)


def test_desktop_keyboard_question_abstention_and_annex_browse(open_page):
    page = open_page()
    search = page.get_by_role("searchbox", name="Your question")
    evidence = page.get_by_role("button", name="Find evidence only")
    expect(evidence).to_be_enabled()
    search.fill("Could a school use AI to infer pupils’ emotions?")
    evidence.press("Enter")
    answers = page.locator("#answer")
    expect(page.get_by_role("heading", name="Source-grounded answers")).to_be_focused()
    expect(answers.get_by_role("link", name="Read the consolidated provision")).to_have_count(1)
    expect(answers.get_by_role("link")).to_have_attribute(
        "href", "https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng#art_5"
    )
    expect(answers).to_contain_text("medical or safety reasons")
    search.fill("What is the capital of Canada?")
    search.press("Enter")
    expect(page.get_by_role("status")).to_contain_text("did not find enough")
    expect(answers.get_by_role("link")).to_have_count(0)
    page.get_by_label("Source type").select_option("annex")
    page.get_by_label("Provision", exact=True).select_option("anx_XIV")
    expect(answers.get_by_role("heading")).to_contain_text("Annex XIV")
    expect(answers).to_contain_text("AIA Code")

def test_official_journal_and_consolidated_links_are_distinct(open_page):
    page = open_page()
    sources = page.get_by_role("complementary")
    expect(sources).to_contain_text("documentation tool without legal effect")
    expect(sources.get_by_role("link", name="Consolidated reading copy")).to_have_attribute(
        "href", "https://eur-lex.europa.eu/eli/reg/2024/1689/2026-07-27/eng"
    )
    expect(sources.get_by_role("link", name="Original AI Act · Official Journal")).to_have_attribute(
        "href", "https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng"
    )
    expect(sources.get_by_role("link", name="2026 amendment · Official Journal")).to_have_attribute(
        "href", "https://eur-lex.europa.eu/eli/reg/2026/1744/oj/eng"
    )

def test_mobile_quiz_keyboard_feedback_and_saved_xp(open_page):
    page = open_page(mobile=True)
    assert_no_page_overflow(page)
    page.get_by_role("link", name="Learn with scenario quizzes").press("Enter")
    assert_no_page_overflow(page)
    start = page.get_by_role("button", name="Start learning")
    expect(start).to_be_enabled()
    start.press("Enter")
    expect(page.get_by_role("heading", name="Who is covered?", exact=True, level=2)).to_be_focused()
    page.keyboard.press("Tab")
    wrong = page.get_by_role("radio").first
    expect(wrong).to_be_focused()
    page.keyboard.press("Space")
    page.keyboard.press("Tab")
    check = page.get_by_role("button", name="Check answer")
    expect(check).to_be_focused()
    page.keyboard.press("Enter")
    expect(page.get_by_role("heading", name="Take another look")).to_be_focused()
    expect(page.get_by_role("link", name="Read Article 2", exact=True)).to_be_visible()
    page.get_by_role("button", name="Next question").press("Enter")
    page.get_by_role("radio").first.press("Space")
    check.press("Enter")
    expect(page.get_by_role("heading", name="Correct", exact=True)).to_be_focused()
    page.get_by_role("button", name="See results").press("Enter")
    expect(page.get_by_text("1 of 2 correct", exact=True)).to_be_visible()
    expect(page.get_by_text("100 XP", exact=True)).to_be_visible()
    page.reload()
    expect(page.get_by_text("100 XP", exact=True)).to_be_visible()
    page.get_by_role("button", name="Mixed challenge").press("Enter")
    expect(page.get_by_text("Question 1 of 8", exact=True)).to_be_visible()
    assert_no_page_overflow(page)

def test_mobile_report_scrolls_without_overflowing_the_page(open_page):
    page = open_page("/evaluation.html", mobile=True)
    expect(page.get_by_role("status")).to_contain_text("scenarios passed")
    expect(page.locator("#precision")).to_contain_text("100% provision precision")
    region = page.get_by_role("region", name="Evaluation results")
    nav = page.get_by_role("navigation", name="Main navigation")
    expect(nav.get_by_role("link", name="Testing evidence")).to_have_attribute("aria-current", "page")
    nav.get_by_role("link", name="Learn").focus()
    page.keyboard.press("Tab")
    expect(region).to_be_focused()
    assert region.evaluate("(el) => el.scrollWidth > el.clientWidth")
    assert_no_page_overflow(page)
