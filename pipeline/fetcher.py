"""Shared daily fetch — runs once, returns articles for all topics."""
import httpx
from typing import Any


def fetch_articles(topics: list[str]) -> list[dict[str, Any]]:
    """Fetch articles for a list of topics. Called once per pipeline run."""
    articles = []
    for topic in topics:
        # TODO: implement real source fetching (RSS, HN, Reddit, etc.)
        pass
    return articles
