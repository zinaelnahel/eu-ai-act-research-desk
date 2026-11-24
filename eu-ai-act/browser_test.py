"""Browser tests for the same static files deployed to Vercel."""

from playwright.sync_api import expect


def assert_no_page_overflow(page):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")


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
    generated = page.locator(".generated-answer")
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
