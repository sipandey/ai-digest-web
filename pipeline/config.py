import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

SUPABASE_URL: str = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY: str = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OPENAI_API_KEY: str = os.environ["OPENAI_API_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_active_users() -> list[dict]:
    """Return user_config rows for all active users with Notion connected.

    Joins user_configs → users. Filters out deactivated parent accounts.
    """
    response = (
        supabase.table("user_configs")
        .select("*, users!inner(id, clerk_id, email, name, tier, active)")
        .eq("active", True)
        .eq("notion_connected", True)
        .execute()
    )
    return [r for r in response.data if r.get("users", {}).get("active", True)]
