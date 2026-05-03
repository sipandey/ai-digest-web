"""Orchestrator — fetches once, then ranks and delivers per user."""
from config import get_all_users
from fetcher import fetch_articles
from ranker import rank_articles
from notion_client import deliver_digest


def run(user_id: str | None = None) -> None:
    users = get_all_users()
    if user_id:
        users = [u for u in users if u["id"] == user_id]

    all_topics = list({t for u in users for t in u.get("topics", [])})
    articles = fetch_articles(all_topics)

    for user in users:
        ranked = rank_articles(articles, user.get("topics", []))
        deliver_digest(
            notion_token=user["notion_token"],
            page_id=user["notion_page_id"],
            articles=ranked,
        )


if __name__ == "__main__":
    import sys
    run(user_id=sys.argv[1] if len(sys.argv) > 1 else None)
