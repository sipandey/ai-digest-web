# Uses requests directly — importing the `notion_client` package here would
# collide with this module's own name under Python's absolute import rules.
import logging

import requests

log = logging.getLogger(__name__)

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
# Notion enforces a 100-block limit per blocks/append request
BLOCK_LIMIT = 100


# ── block helpers ──────────────────────────────────────────────────────────────


def _rich_text(content: str) -> list[dict]:
    return [{"type": "text", "text": {"content": content}}]


def _paragraph(content: str) -> dict:
    return {"object": "block", "type": "paragraph", "paragraph": {"rich_text": _rich_text(content)}}


def _heading(level: int, content: str) -> dict:
    key = f"heading_{level}"
    return {"object": "block", "type": key, key: {"rich_text": _rich_text(content)}}


def _divider() -> dict:
    return {"object": "block", "type": "divider", "divider": {}}


def _toggle(label: str, body: str) -> dict:
    return {
        "object": "block",
        "type": "toggle",
        "toggle": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": label},
                    "annotations": {"bold": True},
                }
            ],
            "children": [_paragraph(body)],
        },
    }


def _link_paragraph(label: str, url: str) -> dict:
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
            "rich_text": [
                {
                    "type": "text",
                    "text": {"content": label, "link": {"url": url}},
                }
            ]
        },
    }


# ── paper → blocks ─────────────────────────────────────────────────────────────


def _paper_blocks(paper: dict, index: int, total: int) -> list[dict]:
    score = paper.get("score", "—")
    title = paper.get("title", "Untitled")
    blocks: list[dict] = []

    blocks.append(_heading(3, f"[{score}/10] {title}"))

    meta_parts = [
        paper.get("authors", ""),
        paper.get("category", ""),
        paper.get("published_date", ""),
        paper.get("matched_group", ""),
    ]
    blocks.append(_paragraph("  ·  ".join(p for p in meta_parts if p)))

    for emoji, key, label in [
        ("🔍", "problem", "Problem"),
        ("⚙️", "approach", "Approach"),
        ("📊", "results", "Results"),
        ("🏗️", "builder_takeaway", "Builder Takeaway"),
        ("📚", "learning_path", "Before Reading"),
    ]:
        if paper.get(key):
            blocks.append(_toggle(f"{emoji} {label}", paper[key]))

    if paper.get("pdf_url"):
        blocks.append(_link_paragraph("Read paper →", paper["pdf_url"]))

    if index < total - 1:
        blocks.append(_divider())

    return blocks


# ── delivery ───────────────────────────────────────────────────────────────────


def deliver_to_notion(
    papers: list[dict],
    user_config: dict,
    run_date: str,
) -> str:
    """Create a digest page in the user's Notion database. Return page URL."""
    token = user_config["notion_token"]
    database_id = user_config["notion_database_id"].replace("-", "")
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

    # Build full block list
    all_blocks: list[dict] = [
        _heading(1, f"arXiv Digest — {run_date}"),
        _paragraph(f"{len(papers)} paper{'s' if len(papers) != 1 else ''} matched your profile today."),
        _divider(),
    ]
    for i, paper in enumerate(papers):
        all_blocks.extend(_paper_blocks(paper, i, len(papers)))

    # Create page with first BLOCK_LIMIT blocks
    payload = {
        "parent": {"database_id": database_id},
        "properties": {
            "Name": {
                "title": [{"text": {"content": f"arXiv Digest — {run_date}"}}]
            }
        },
        "children": all_blocks[:BLOCK_LIMIT],
    }

    resp = requests.post(f"{NOTION_API}/pages", headers=headers, json=payload, timeout=30)
    resp.raise_for_status()

    page = resp.json()
    page_id = page["id"]
    page_url = page["url"]
    log.info("Created Notion page %s", page_url)

    # Append remaining blocks in BLOCK_LIMIT-sized chunks
    remaining = all_blocks[BLOCK_LIMIT:]
    for chunk_start in range(0, len(remaining), BLOCK_LIMIT):
        chunk = remaining[chunk_start : chunk_start + BLOCK_LIMIT]
        r = requests.patch(
            f"{NOTION_API}/blocks/{page_id}/children",
            headers=headers,
            json={"children": chunk},
            timeout=30,
        )
        r.raise_for_status()

    return page_url
