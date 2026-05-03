"""Per-user scoring — ranks fetched articles against a user's topic weights."""
from typing import Any


def rank_articles(
    articles: list[dict[str, Any]],
    user_topics: list[str],
) -> list[dict[str, Any]]:
    """Return articles sorted by relevance to the user's topics."""
    # TODO: implement scoring (keyword match, embedding similarity, etc.)
    return articles
