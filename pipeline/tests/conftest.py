"""
Global pytest configuration.

Pipeline modules import 'config' at the top level, which reads env vars and
opens a Supabase connection.  We:

  1. Set dummy env vars so os.environ lookups succeed.
  2. Mock the 'supabase' *package* so create_client() returns a MagicMock
     instead of opening a real connection.
  3. Mock 'dotenv' so load_dotenv() is a no-op.

This lets the real config.py (and therefore get_active_users, etc.) load and
execute normally.  Individual tests that control Supabase behaviour should
patch the name in the module under test, e.g. @patch("config.supabase") or
@patch("fetcher.supabase").
"""

import os
import sys
from unittest.mock import MagicMock

# ── 1. dummy env vars (must come before any pipeline module is imported) ───────
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault("OPENAI_API_KEY", "sk-test-openai-key")

# ── 2. mock supabase PACKAGE so create_client() doesn't open a connection ─────
_mock_sb_client = MagicMock()
_mock_sb_pkg = MagicMock()
_mock_sb_pkg.create_client.return_value = _mock_sb_client
sys.modules.setdefault("supabase", _mock_sb_pkg)

# ── 3. mock dotenv so load_dotenv() is a no-op ────────────────────────────────
sys.modules.setdefault("dotenv", MagicMock())
