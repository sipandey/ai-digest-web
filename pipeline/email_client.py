"""HTML Email client for delivering daily AI Research Digests (via Resend API or SMTP fallback)."""

import html
import logging
import os
from typing import Any, Dict, List, Optional
import requests

log = logging.getLogger(__name__)

LENS_LABELS: Dict[str, str] = {
    "builder": "🛠️ Builder Lens",
    "founder": "💡 Founder Lens",
    "researcher": "🔬 Researcher Lens",
}


def generate_digest_html(papers: List[Dict[str, Any]], run_date: str, lens: str = "builder") -> str:
    lens_label = LENS_LABELS.get(lens, "🛠️ Builder Lens")
    web_url = os.environ.get("NEXT_PUBLIC_APP_URL", "https://aidigest.net")

    paper_cards_html = ""
    for idx, paper in enumerate(papers, 1):
        title = html.escape(paper.get("title", "Untitled"))
        arxiv_id = html.escape(paper.get("arxiv_id", ""))
        score = round(float(paper.get("score", 0.0)), 1)
        category = html.escape(paper.get("category", ""))
        authors = html.escape(paper.get("authors", ""))
        takeaway = html.escape(
            paper.get("builder_takeaway")
            or paper.get("problem")
            or paper.get("abstract", "")[:200]
        )
        url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "https://arxiv.org"

        score_bg = "#ecfdf5" if score >= 8.5 else "#eef2ff"
        score_color = "#065f46" if score >= 8.5 else "#3730a3"

        paper_cards_html += f"""
        <div style="background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
          <div style="margin-bottom: 10px;">
            <span style="font-family: monospace; font-size: 12px; font-weight: bold; color: #6b7280; background: #f3f4f6; padding: 3px 8px; border-radius: 6px;">#{idx}</span>
            <span style="font-size: 12px; font-weight: 600; color: {score_color}; background-color: {score_bg}; padding: 3px 8px; border-radius: 6px; margin-left: 6px;">{score}/10</span>
            {f'<span style="font-family: monospace; font-size: 12px; color: #4b5563; background: #f3f4f6; padding: 3px 8px; border-radius: 6px; margin-left: 6px;">{category}</span>' if category else ''}
          </div>
          <h2 style="font-size: 16px; font-weight: 700; color: #111827; margin: 0 0 8px 0; line-height: 1.4;">
            <a href="{url}" style="color: #4f46e5; text-decoration: none;">{title}</a>
          </h2>
          {f'<p style="font-size: 12px; color: #6b7280; margin: 0 0 12px 0;">{authors}</p>' if authors else ''}
          <div style="background-color: #f5f3ff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 12px; margin-top: 10px;">
            <p style="font-size: 11px; font-weight: 700; color: #3730a3; text-transform: uppercase; margin: 0 0 4px 0;">Key Takeaway</p>
            <p style="font-size: 13px; color: #1e1b4b; line-height: 1.5; margin: 0;">{takeaway}</p>
          </div>
        </div>
        """

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Research Digest - {run_date}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb; margin: 0; padding: 24px; color: #111827;">
  <div style="max-width: 600px; margin: 0 auto;">
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 28px;">
      <h1 style="font-size: 24px; font-weight: 800; color: #111827; margin: 0 0 6px 0;">AI Digest</h1>
      <p style="font-size: 14px; color: #4f46e5; font-weight: 600; margin: 0;">
        {lens_label} &middot; {run_date}
      </p>
    </div>

    <!-- Paper List -->
    {paper_cards_html}

    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
      <p style="margin: 0 0 8px 0;">You are receiving this daily research briefing based on your AI Digest topics.</p>
      <p style="margin: 0;">
        <a href="{web_url}/dashboard" style="color: #4f46e5; text-decoration: none; font-weight: 600;">View in Web Dashboard</a> &middot;
        <a href="{web_url}/settings" style="color: #6b7280; text-decoration: none;">Manage Preferences</a>
      </p>
    </div>
  </div>
</body>
</html>"""


def deliver_to_email(
    papers: List[Dict[str, Any]],
    user_config: Dict[str, Any],
    run_date: str,
    lens: str = "builder",
) -> bool:
    if not user_config.get("email_digest_enabled"):
        return False

    recipient: Optional[str] = (
        user_config.get("delivery_email")
        or user_config.get("users", {}).get("email")
    )
    if not recipient:
        log.warning("Email digest enabled but no delivery email available")
        return False

    html_content = generate_digest_html(papers, run_date, lens=lens)
    lens_label = LENS_LABELS.get(lens, "🛠️ Builder Lens")
    subject = f"Your Daily AI Digest ({lens_label}) - {run_date}"

    resend_api_key = os.environ.get("RESEND_API_KEY")
    if not resend_api_key:
        log.info(
            "RESEND_API_KEY not configured — logged email preview (dry-run)",
            extra={"recipient": recipient, "run_date": run_date, "papers_count": len(papers)},
        )
        return True

    try:
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": "AI Digest <digest@aidigest.net>",
                "to": [recipient],
                "subject": subject,
                "html": html_content,
            },
            timeout=10,
        )
        resp.raise_for_status()
        log.info(
            "Email digest sent successfully via Resend",
            extra={"recipient": recipient, "run_date": run_date, "resend_id": resp.json().get("id")},
        )
        return True
    except Exception as exc:
        log.error("Failed to send email digest via Resend: %s", exc)
        return False
