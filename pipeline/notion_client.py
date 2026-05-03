"""Per-user Notion delivery — writes ranked digest to the user's Notion page."""
import os
import httpx

NOTION_API = "https://api.notion.com/v1"


def deliver_digest(
    notion_token: str,
    page_id: str,
    articles: list[dict],
) -> None:
    """Append today's digest as a new block in the user's Notion page."""
    headers = {
        "Authorization": f"Bearer {notion_token}",
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
    }
    # TODO: build block payload from articles and POST to Notion blocks API
