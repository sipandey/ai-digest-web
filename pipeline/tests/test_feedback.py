"""Unit tests for user personalization feedback in pipeline paper ranking."""

from unittest.mock import MagicMock
import pytest
from ranker import rank_papers


@pytest.fixture
def sample_papers():
    return [
        {
            "arxiv_id": "2401.1001",
            "title": "Reinforcement Learning from Human Feedback for Code Generation",
            "abstract": "We explore RLHF applied to code LLMs with test case validation.",
            "category": "cs.AI",
            "score": 8.0,
        },
        {
            "arxiv_id": "2401.1002",
            "title": "Quantum Error Correction on Noisy Superconducting Qubits",
            "abstract": "Topological surface codes evaluated on 127-qubit processors.",
            "category": "quant-ph",
            "score": 8.0,
        },
    ]


@pytest.fixture
def user_config():
    return {
        "user_id": "user-uuid-1",
        "topics": ["code generation", "llm", "quantum"],
        "digest_lens": "builder",
    }


class TestPersonalizationFeedback:
    def test_positive_feedback_boosts_relevant_category(self, sample_papers, user_config, monkeypatch):
        monkeypatch.setattr("ranker.OpenAI", MagicMock())
        monkeypatch.setattr(
            "ranker._score_batches",
            lambda papers, uc, cl, **kw: (
                {p["arxiv_id"]: {"score": 8.0, "include": True} for p in papers},
                1,
            ),
        )
        monkeypatch.setattr(
            "ranker._summarize_batches",
            lambda papers, uc, cl, **kw: (
                {p["arxiv_id"]: {"builder_takeaway": "Takeaway"} for p in papers},
                1,
            ),
        )

        feedback = {
            "more_categories": ["cs.AI"],
            "less_categories": ["quant-ph"],
        }

        ranked = rank_papers(
            sample_papers,
            user_config,
            use_batch=False,
            user_feedback=feedback,
        )

        assert len(ranked) == 2
        ai_paper = next(p for p in ranked if p["arxiv_id"] == "2401.1001")
        quant_paper = next(p for p in ranked if p["arxiv_id"] == "2401.1002")

        # cs.AI paper received positive feedback boost
        assert ai_paper["score"] > quant_paper["score"]
        assert ai_paper["score"] >= 8.5
        assert quant_paper["score"] <= 7.5

    def test_ranking_without_feedback_retains_base_score(self, sample_papers, user_config, monkeypatch):
        monkeypatch.setattr("ranker.OpenAI", MagicMock())
        monkeypatch.setattr(
            "ranker._score_batches",
            lambda papers, uc, cl, **kw: (
                {p["arxiv_id"]: {"score": 8.0, "include": True} for p in papers},
                1,
            ),
        )
        monkeypatch.setattr(
            "ranker._summarize_batches",
            lambda papers, uc, cl, **kw: (
                {p["arxiv_id"]: {"builder_takeaway": "Takeaway"} for p in papers},
                1,
            ),
        )

        ranked = rank_papers(
            sample_papers,
            user_config,
            use_batch=False,
            user_feedback=None,
        )

        assert len(ranked) == 2
        assert ranked[0]["score"] == 8.0
        assert ranked[1]["score"] == 8.0
