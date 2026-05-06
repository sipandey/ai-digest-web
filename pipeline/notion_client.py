# Uses requests directly — importing the `notion_client` package here would
# collide with this module's own name under Python's absolute import rules.
import logging
from typing import Optional

import requests

log = logging.getLogger(__name__)

NOTION_API = "https://api.notion.com/v1"
NOTION_VERSION = "2022-06-28"
# Notion enforces a 100-block limit per blocks/append request
BLOCK_LIMIT = 100


# ── block helpers ──────────────────────────────────────────────────────────────


def _rich_text(content: str) -> list[dict]:
    # Notion enforces a hard 2000-character limit per rich_text content object.
    # Truncate with an ellipsis so long abstracts or summaries never cause a 400.
    if len(content) > 2000:
        content = content[:1997] + "…"
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


# ── idempotency helpers ────────────────────────────────────────────────────────


def _find_page_for_date(
    database_id: str, run_date: str, headers: dict
) -> Optional[tuple[str, str]]:
    """Query the database for an existing digest page for *run_date*.

    Returns (page_id, page_url) if found, None otherwise.
    On any API error falls back to None so the caller creates a fresh page.
    """
    resp = requests.post(
        f"{NOTION_API}/databases/{database_id}/query",
        headers=headers,
        json={
            "filter": {
                "property": "Name",
                "title": {"equals": f"AI Digest — {run_date}"},
            },
            "page_size": 1,
        },
        timeout=30,
    )
    if not resp.ok:
        log.warning(
            "Notion database query failed (%d) — will create a new page",
            resp.status_code,
        )
        return None

    results = resp.json().get("results", [])
    if not results:
        return None

    page = results[0]
    return page["id"], page["url"]


def _get_child_block_ids(page_id: str, headers: dict) -> list[str]:
    """Return IDs of all direct child blocks of *page_id*, handling pagination."""
    block_ids: list[str] = []
    cursor: Optional[str] = None

    while True:
        params: dict = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor

        resp = requests.get(
            f"{NOTION_API}/blocks/{page_id}/children",
            headers=headers,
            params=params,
            timeout=30,
        )
        if not resp.ok:
            break

        data = resp.json()
        block_ids.extend(b["id"] for b in data.get("results", []))

        if not data.get("has_more"):
            break
        cursor = data.get("next_cursor")

    return block_ids


def _delete_blocks(block_ids: list[str], headers: dict) -> None:
    """Archive (permanently remove) Notion blocks by ID."""
    for block_id in block_ids:
        try:
            requests.delete(
                f"{NOTION_API}/blocks/{block_id}",
                headers=headers,
                timeout=30,
            )
        except Exception as exc:
            log.warning("Failed to delete block %s: %s", block_id, exc)


def _append_blocks(page_id: str, blocks: list[dict], headers: dict) -> None:
    """Append *blocks* to *page_id* in BLOCK_LIMIT-sized chunks."""
    for chunk_start in range(0, len(blocks), BLOCK_LIMIT):
        chunk = blocks[chunk_start : chunk_start + BLOCK_LIMIT]
        r = requests.patch(
            f"{NOTION_API}/blocks/{page_id}/children",
            headers=headers,
            json={"children": chunk},
            timeout=30,
        )
        r.raise_for_status()


# ── delivery ───────────────────────────────────────────────────────────────────


def deliver_to_notion(
    papers: list[dict],
    user_config: dict,
    run_date: str,
) -> str:
    """Upsert a digest page in the user's Notion database. Return page URL.

    If a page titled "AI Digest — {run_date}" already exists in the
    database, its content is cleared and rewritten. Otherwise a new page
    is created. This ensures at most one digest page per day regardless of
    how many times the pipeline runs.
    """
    token = user_config["notion_token"]
    database_id = user_config["notion_database_id"].replace("-", "")
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

    # Build full block list
    all_blocks: list[dict] = [
        _heading(1, f"AI Digest — {run_date}"),
        _paragraph(f"{len(papers)} paper{'s' if len(papers) != 1 else ''} matched your profile today."),
        _divider(),
    ]
    for i, paper in enumerate(papers):
        all_blocks.extend(_paper_blocks(paper, i, len(papers)))

    # Check for an existing page for this date
    existing = _find_page_for_date(database_id, run_date, headers)

    if existing:
        page_id, page_url = existing
        log.info("Existing Notion page found for %s — clearing and rewriting", run_date)

        old_block_ids = _get_child_block_ids(page_id, headers)
        _delete_blocks(old_block_ids, headers)
        log.info("Deleted %d existing block(s)", len(old_block_ids))

        _append_blocks(page_id, all_blocks, headers)
        log.info("Rewrote Notion page %s (%d blocks)", page_url, len(all_blocks))
        return page_url

    # No existing page — create a new one
    payload = {
        "parent": {"database_id": database_id},
        "properties": {
            "Name": {
                "title": [{"text": {"content": f"AI Digest — {run_date}"}}]
            }
        },
        "children": all_blocks[:BLOCK_LIMIT],
    }

    resp = requests.post(f"{NOTION_API}/pages", headers=headers, json=payload, timeout=30)
    resp.raise_for_status()

    page = resp.json()
    page_id = page["id"]
    page_url = page["url"]
    log.info("Created Notion page %s (%d blocks)", page_url, len(all_blocks))

    # Append remaining blocks beyond the initial BLOCK_LIMIT
    _append_blocks(page_id, all_blocks[BLOCK_LIMIT:], headers)

    return page_url
