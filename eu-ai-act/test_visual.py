"""Compare screenshots of the release baseline and candidate in the same browser."""

import os
from pathlib import Path

import pytest
from PIL import Image, ImageChops
from playwright.sync_api import expect

def screenshot(page, path, mobile):
    if mobile:
        start = page.get_by_role("button", name="Start learning")
        expect(start).to_be_enabled()
        start.evaluate("(button) => button.click()")
        expect(page.get_by_role("button", name="Check answer")).to_be_visible()
        page.evaluate("document.fonts.ready")
        page.locator("#quiz").screenshot(path=path, animations="disabled")
    else:
        if page.locator("#metrics").count():
            expect(page.locator("#metrics")).to_contain_text("scenarios passed")
        else:
            expect(page.get_by_role("button", name="Ask AI", exact=True)).to_be_enabled()
        page.evaluate("document.fonts.ready")
        page.screenshot(path=path, animations="disabled", full_page=True)


@pytest.mark.parametrize(("name", "route", "mobile"), [
    ("desktop-research-desk", "/", False),
    ("desktop-testing-evidence", "/evaluation.html", False),
    ("mobile-quiz", "/learn.html", True),
])
def test_visual_regression(name, route, mobile, baseline_url, open_page):
    output = Path(os.environ.get("EU_AI_ACT_VISUAL_RESULTS", "quality-results/visual"))
    output.mkdir(parents=True, exist_ok=True)
    before = output / f"{name}-baseline.png"
    after = output / f"{name}-candidate.png"
    screenshot(open_page(route, mobile=mobile, origin=baseline_url), before, mobile)
    screenshot(open_page(route, mobile=mobile), after, mobile)

    with Image.open(before) as baseline, Image.open(after) as candidate:
        assert baseline.size == candidate.size, f"Screenshot dimensions changed: {baseline.size} → {candidate.size}"
        difference = ImageChops.difference(baseline.convert("RGB"), candidate.convert("RGB"))
        difference.save(output / f"{name}-diff.png")
        assert difference.getbbox() is None, f"Visual difference found. Inspect {output}."
