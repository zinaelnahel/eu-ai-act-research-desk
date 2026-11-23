"""Shared HTTP server and Chromium fixtures."""

import os
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1] / "public" / "eu-ai-act"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        pass


@contextmanager
def serve(directory):
    handler = partial(QuietHandler, directory=directory)
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}"
        finally:
            server.shutdown()
            thread.join()


@pytest.fixture(scope="session")
def base_url():
    with serve(ROOT) as url:
        yield url


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as playwright:
        instance = playwright.chromium.launch(
            executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE")
        )
        try:
            yield instance
        finally:
            instance.close()


@pytest.fixture
def open_page(browser, base_url):
    contexts = []

    def open_path(path="/", *, mobile=False, origin=base_url):
        viewport = {"width": 320, "height": 740} if mobile else {"width": 1440, "height": 900}
        context = browser.new_context(viewport=viewport, is_mobile=mobile, has_touch=mobile)
        contexts.append(context)
        page = context.new_page()
        page.goto(origin + path)
        return page

    yield open_path
    for context in contexts:
        context.close()


@pytest.fixture(scope="session")
def baseline_url():
    baseline = os.environ.get("EU_AI_ACT_VISUAL_BASELINE")
    if not baseline:
        pytest.skip("Set EU_AI_ACT_VISUAL_BASELINE to a baseline project's public/eu-ai-act directory")
    directory = Path(baseline)
    assert (directory / "index.html").is_file(), directory
    with serve(directory) as url:
        yield url
