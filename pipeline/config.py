import os
from typing import Optional
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_API_KEY: str = os.environ["OPENAI_API_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


_PAGE_SIZE = 1000  # Supabase default cap; fetch in pages to handle > 1000 users


def get_active_users(user_id: Optional[str] = None) -> list[dict]:
    """Return user_config rows for all active users with Notion connected.

    Joins user_configs → users. Filters out deactivated parent accounts.
    Paginates in chunks of _PAGE_SIZE so the result is never silently
    truncated (Supabase returns at most 1000 rows per request with no error).
    """
    if user_id:
        # Single-user lookup — no pagination needed.
        response = (
            supabase.table("user_configs")
            .select("*, users!inner(id, clerk_id, email, name, tier, active)")
            .eq("active", True)
            .eq("notion_connected", True)
            .eq("user_id", user_id)
            .execute()
        )
        return [r for r in response.data if r.get("users", {}).get("active", True)]

    all_rows: list[dict] = []
    offset = 0
    while True:
        response = (
            supabase.table("user_configs")
            .select("*, users!inner(id, clerk_id, email, name, tier, active)")
            .eq("active", True)
            .eq("notion_connected", True)
            .range(offset, offset + _PAGE_SIZE - 1)
            .execute()
        )
        page = response.data or []
        all_rows.extend(r for r in page if r.get("users", {}).get("active", True))
        if len(page) < _PAGE_SIZE:
            break  # last page
        offset += _PAGE_SIZE

    return all_rows
