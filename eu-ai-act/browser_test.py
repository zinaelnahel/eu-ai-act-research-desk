"""Browser tests for the same static files deployed to Vercel."""

import os
import threading
import unittest
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "public" / "eu-ai-act"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


class DeskBrowserTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=ROOT))
        cls.addClassCleanup(server.server_close)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        cls.addClassCleanup(server.shutdown)
        cls.base = f"http://127.0.0.1:{server.server_port}"
        playwright = sync_playwright().start()
        cls.addClassCleanup(playwright.stop)
        cls.browser = playwright.chromium.launch(
            executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        )
        cls.addClassCleanup(cls.browser.close)

    def page(self, path="/", *, mobile=False):
        viewport = {"width": 320, "height": 740} if mobile else {"width": 1440, "height": 900}
        context = self.browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
        self.addCleanup(context.close)
        page = context.new_page()
        page.goto(self.base + path)
        return page

    def assert_no_page_overflow(self, page):
        self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= innerWidth"))

    def test_desktop_keyboard_question_abstention_and_annex_browse(self):
        page = self.page()
        search = page.get_by_role("searchbox", name="Your question")
        expect(page.get_by_role("button", name="Find evidence")).to_be_enabled()
        search.fill("Could a school use AI to infer pupils’ emotions?")
        search.press("Enter")
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

    def test_official_journal_and_consolidated_links_are_distinct(self):
        page = self.page()
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

    def test_mobile_quiz_keyboard_feedback_and_saved_xp(self):
        page = self.page(mobile=True)
        self.assert_no_page_overflow(page)
        page.get_by_role("link", name="Learn with scenario quizzes").press("Enter")
        self.assert_no_page_overflow(page)
        page.get_by_role("button", name="Start learning").press("Enter")
        expect(page.get_by_role("heading", name="Who is covered?", exact=True).first).to_be_focused()
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
        self.assert_no_page_overflow(page)

    def test_mobile_report_scrolls_without_overflowing_the_page(self):
        page = self.page("/evaluation.html", mobile=True)
        expect(page.get_by_role("status")).to_contain_text("43 of 43 scenarios passed")
        expect(page.locator("#precision")).to_contain_text("100% provision precision")
        region = page.get_by_role("region", name="Evaluation results")
        page.get_by_role("link", name="Back to research desk").focus()
        page.keyboard.press("Tab")
        expect(region).to_be_focused()
        self.assertTrue(region.evaluate("(el) => el.scrollWidth > el.clientWidth"))
        self.assert_no_page_overflow(page)


if __name__ == "__main__":
    unittest.main()
