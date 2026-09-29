"""Unit tests for pipeline multi-channel delivery (Slack/Discord Webhooks and HTML Email)."""

import json
from unittest.mock import MagicMock, patch
import pytest

from webhook_client import (
    deliver_to_webhook,
    format_slack_payload,
    format_discord_payload,
    format_generic_payload,
)
from email_client import (
    deliver_to_email,
    generate_digest_html,
)


@pytest.fixture
def sample_papers():
    return [
        {
            "arxiv_id": "2401.12345",
            "title": "Scaling Autonomous Agents with Memory Buffers",
            "score": 9.2,
            "category": "cs.AI",
            "authors": "Alice Smith, Bob Jones",
            "builder_takeaway": "Direct drop-in for Redis state management.",
            "learning_path": "Read the 2023 LangChain memory architecture paper first.",
            "problem": "Context windows fill up too quickly.",
            "results": "Reduces token consumption by 45%.",
        },
        {
            "arxiv_id": "2401.67890",
            "title": "Fast Inference with Quantized Attention",
            "score": 8.7,
            "category": "cs.LG",
            "authors": "Charlie Brown",
            "builder_takeaway": "Useful for Edge deployments with vLLM.",
            "learning_path": "Understand 4-bit AWQ basics.",
        },
    ]


@pytest.fixture
def user_config_slack():
    return {
        "user_id": "user-uuid-1",
        "webhook_url": "https://hooks.slack.com/services/T00/B00/XXXX",
        "webhook_platform": "slack",
        "digest_lens": "builder",
    }


@pytest.fixture
def user_config_discord():
    return {
        "user_id": "user-uuid-2",
        "webhook_url": "https://discord.com/api/webhooks/123/XXXX",
        "webhook_platform": "discord",
        "digest_lens": "founder",
    }


@pytest.fixture
def user_config_email():
    return {
        "user_id": "user-uuid-3",
        "email_digest_enabled": True,
        "delivery_email": "engineer@company.com",
        "digest_lens": "researcher",
        "users": {"email": "account@company.com"},
    }


# ── Webhook Client Tests ───────────────────────────────────────────────────────

class TestWebhookPayloads:
    def test_format_slack_payload(self, sample_papers):
        payload = format_slack_payload(sample_papers, "2026-09-28", lens="builder")
        assert "blocks" in payload
        blocks = payload["blocks"]
        # Header block
        assert blocks[0]["type"] == "header"
        assert "AI Research Digest" in blocks[0]["text"]["text"]
        # Paper text
        content_text = json.dumps(payload)
        assert "Scaling Autonomous Agents" in content_text
        assert "Redis state management" in content_text

    def test_format_discord_payload(self, sample_papers):
        payload = format_discord_payload(sample_papers, "2026-09-28", lens="founder")
        assert "embeds" in payload
        embed = payload["embeds"][0]
        assert "AI Research Digest" in embed["title"]
        assert len(embed["fields"]) == 2
        assert "Scaling Autonomous Agents" in embed["fields"][0]["name"]
        assert "https://arxiv.org/abs/2401.12345" in embed["fields"][0]["value"]

    def test_format_generic_payload(self, sample_papers):
        payload = format_generic_payload(sample_papers, "2026-09-28", lens="builder")
        assert payload["run_date"] == "2026-09-28"
        assert payload["lens"] == "builder"
        assert len(payload["papers"]) == 2

    @patch("webhook_client.requests.post")
    def test_deliver_to_webhook_slack_success(self, mock_post, sample_papers, user_config_slack):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        ok = deliver_to_webhook(sample_papers, user_config_slack, "2026-09-28", lens="builder")
        assert ok is True
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert kwargs["timeout"] == 10
        assert "blocks" in kwargs["json"]

    @patch("webhook_client.requests.post")
    def test_deliver_to_webhook_discord_success(self, mock_post, sample_papers, user_config_discord):
        mock_resp = MagicMock()
        mock_resp.status_code = 204
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        ok = deliver_to_webhook(sample_papers, user_config_discord, "2026-09-28", lens="founder")
        assert ok is True
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert "embeds" in kwargs["json"]

    def test_deliver_to_webhook_missing_url(self, sample_papers):
        ok = deliver_to_webhook(sample_papers, {}, "2026-09-28")
        assert ok is False


# ── Email Client Tests ─────────────────────────────────────────────────────────

class TestEmailClient:
    def test_generate_digest_html(self, sample_papers):
        html = generate_digest_html(sample_papers, "2026-09-28", lens="builder")
        assert "<!DOCTYPE html>" in html
        assert "AI Digest" in html
        assert "Scaling Autonomous Agents" in html
        assert "Redis state management" in html
        assert "https://arxiv.org/abs/2401.12345" in html

    @patch("email_client.requests.post")
    def test_deliver_to_email_resend_api(self, mock_post, sample_papers, user_config_email, monkeypatch):
        monkeypatch.setenv("RESEND_API_KEY", "re_test_123456789")
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"id": "email-msg-123"}
        mock_resp.raise_for_status.return_value = None
        mock_post.return_value = mock_resp

        ok = deliver_to_email(sample_papers, user_config_email, "2026-09-28", lens="researcher")
        assert ok is True
        mock_post.assert_called_once()
        args, kwargs = mock_post.call_args
        assert kwargs["headers"]["Authorization"] == "Bearer re_test_123456789"
        assert kwargs["json"]["to"] == ["engineer@company.com"]

    def test_deliver_to_email_dry_run_without_key(self, sample_papers, user_config_email, monkeypatch):
        monkeypatch.delenv("RESEND_API_KEY", raising=False)
        ok = deliver_to_email(sample_papers, user_config_email, "2026-09-28", lens="builder")
        # In dry run mode without API key, it generates email and logs dry run, returning True
        assert ok is True

    def test_deliver_to_email_disabled_skips(self, sample_papers):
        ok = deliver_to_email(sample_papers, {"email_digest_enabled": False}, "2026-09-28")
        assert ok is False
