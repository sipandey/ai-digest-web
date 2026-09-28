"""Webhook client for delivering daily AI Digests to team chat channels (Slack, Discord, generic webhooks)."""

import logging
from typing import Any, Dict, List, Optional
import requests

log = logging.getLogger(__name__)

LENS_LABELS: Dict[str, str] = {
    "builder": "🛠️ Builder Lens",
    "founder": "💡 Founder Lens",
    "researcher": "🔬 Researcher Lens",
}

LENS_DISCORD_COLORS: Dict[str, int] = {
    "builder": 0x6366F1,     # Indigo
    "founder": 0x10B981,     # Emerald
    "researcher": 0x8B5CF6,  # Purple
}


def format_slack_payload(papers: List[Dict[str, Any]], run_date: str, lens: str = "builder") -> Dict[str, Any]:
    lens_label = LENS_LABELS.get(lens, "🛠️ Builder Lens")
    blocks: List[Dict[str, Any]] = [
        {
            "type": "header",
            "text": {
                "type": "plain_text",
                "text": f"AI Research Digest · {run_date}",
                "emoji": True,
            },
        },
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": f"*{lens_label}* — Curated top research papers for today.",
            },
        },
        {"type": "divider"},
    ]

    for idx, paper in enumerate(papers[:5], 1):
        title = paper.get("title", "Untitled")
        score = paper.get("score", 0.0)
        arxiv_id = paper.get("arxiv_id", "")
        url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "https://arxiv.org"
        takeaway = (
            paper.get("builder_takeaway")
            or paper.get("problem")
            or paper.get("abstract", "")[:140]
        )

        blocks.append(
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"*#{idx} <{url}|{title}>*  `{round(score, 1)}/10`\n"
                        f"> {takeaway}"
                    ),
                },
            }
        )

    blocks.append({"type": "divider"})
    blocks.append(
        {
            "type": "context",
            "elements": [
                {
                    "type": "mrkdwn",
                    "text": "Delivered daily by *AI Digest* · Click papers to read full research.",
                }
            ],
        }
    )

    return {"blocks": blocks}


def format_discord_payload(papers: List[Dict[str, Any]], run_date: str, lens: str = "builder") -> Dict[str, Any]:
    lens_label = LENS_LABELS.get(lens, "🛠️ Builder Lens")
    color = LENS_DISCORD_COLORS.get(lens, 0x6366F1)

    fields: List[Dict[str, Any]] = []
    for idx, paper in enumerate(papers[:5], 1):
        title = paper.get("title", "Untitled")
        score = paper.get("score", 0.0)
        arxiv_id = paper.get("arxiv_id", "")
        url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else "https://arxiv.org"
        takeaway = (
            paper.get("builder_takeaway")
            or paper.get("problem")
            or paper.get("abstract", "")[:140]
        )

        fields.append(
            {
                "name": f"#{idx} {title} ({round(score, 1)}/10)",
                "value": f"[arXiv: {arxiv_id}]({url})\n{takeaway}",
                "inline": False,
            }
        )

    embed = {
        "title": f"AI Research Digest · {run_date}",
        "description": f"Curated via **{lens_label}** for your team.",
        "color": color,
        "fields": fields,
        "footer": {"text": "AI Digest · arxiv.org daily evaluation"},
    }

    return {"embeds": [embed]}


def format_generic_payload(papers: List[Dict[str, Any]], run_date: str, lens: str = "builder") -> Dict[str, Any]:
    return {
        "event": "daily_digest",
        "run_date": run_date,
        "lens": lens,
        "paper_count": len(papers),
        "papers": papers,
    }


def deliver_to_webhook(
    papers: List[Dict[str, Any]],
    user_config: Dict[str, Any],
    run_date: str,
    lens: str = "builder",
) -> bool:
    webhook_url: Optional[str] = user_config.get("webhook_url")
    if not webhook_url:
        return False

    platform: str = user_config.get("webhook_platform", "slack").lower()

    if platform == "slack":
        payload = format_slack_payload(papers, run_date, lens=lens)
    elif platform == "discord":
        payload = format_discord_payload(papers, run_date, lens=lens)
    else:
        payload = format_generic_payload(papers, run_date, lens=lens)

    try:
        resp = requests.post(webhook_url, json=payload, timeout=10)
        resp.raise_for_status()
        log.info(
            "Webhook digest delivered successfully",
            extra={"platform": platform, "run_date": run_date, "papers_count": len(papers)},
        )
        return True
    except Exception as exc:
        log.warning(
            "Failed to send webhook digest: %s",
            exc,
            extra={"platform": platform, "url": webhook_url[:25] + "..."},
        )
        return False
