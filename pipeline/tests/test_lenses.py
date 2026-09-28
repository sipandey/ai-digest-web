"""
Unit and integration tests for multi-lens digest functionality.

Covers:
  - Lens resolution priority (_resolve_lens)
  - ArXiv category selection across lenses (get_categories_for_lenses)
  - Active scoring criteria per lens (_active_criteria)
  - Profile hash isolation across lenses (_profile_hash)
  - Prompt construction for builder, founder, and researcher lenses
  - Notion block rendering with lens-specific callouts and toggles
"""

import pytest

from pipeline_config import (
    LENS_BUILDER,
    LENS_FOUNDER,
    LENS_RESEARCHER,
    VALID_LENSES,
    ARXIV_CATEGORIES,
    ARXIV_CATEGORIES_EXTRA,
    ARXIV_CATEGORIES_RESEARCHER,
    get_categories_for_lenses,
    DEFAULT_ACTIVE_CRITERIA,
    ACTIVE_CRITERIA_FOUNDER,
    ACTIVE_CRITERIA_RESEARCHER,
    LENS_NOTION_LABELS,
)
from ranker import (
    _resolve_lens,
    _active_criteria,
    _profile_hash,
    _build_score_prompt,
    _build_summary_prompt,
)
from notion_client import _paper_blocks


SAMPLE_PAPER = {
    "arxiv_id": "2401.00001",
    "title": "Universal Graph Transformers for High-Dimensional Manifolds",
    "abstract": "We present a unified graph transformer architecture...",
    "authors": "Alice Researcher, Bob Scientist",
    "category": "cs.LG",
    "published_date": "2026-09-28",
    "matched_group": "Machine Learning",
    "score": 8.7,
    "problem": "Existing graph neural networks struggle with curvature distortion on complex non-Euclidean manifolds.",
    "approach": "We formulate a unified attention mechanism over Ricci curvature flows and harmonic analysis.",
    "results": "Achieves 4.2% higher accuracy on molecular geometry benchmarks with 35% fewer parameters.",
    "builder_takeaway": "Enables robust geometric representations without custom manifold discretization.",
    "learning_path": "Requires familiarity with Riemannian geometry and spectral graph theory.",
    "pdf_url": "https://arxiv.org/pdf/2401.00001.pdf",
}


# ── Lens Resolution ───────────────────────────────────────────────────────────

class TestResolveLens:
    def test_explicit_lens_takes_top_priority(self):
        cfg = {"digest_lens": LENS_BUILDER}
        assert _resolve_lens(cfg, owner_mode=True, lens=LENS_RESEARCHER) == LENS_RESEARCHER

    def test_user_config_lens_overrides_owner_mode(self):
        cfg = {"digest_lens": LENS_RESEARCHER}
        assert _resolve_lens(cfg, owner_mode=True) == LENS_RESEARCHER

    def test_owner_mode_resolves_to_founder(self):
        cfg = {}
        assert _resolve_lens(cfg, owner_mode=True) == LENS_FOUNDER

    def test_default_is_builder(self):
        assert _resolve_lens({}) == LENS_BUILDER
        assert _resolve_lens(None) == LENS_BUILDER

    def test_invalid_lens_falls_back_to_builder(self):
        cfg = {"digest_lens": "unknown_lens"}
        assert _resolve_lens(cfg) == LENS_BUILDER


# ── Category Selection ────────────────────────────────────────────────────────

class TestCategoriesForLenses:
    def test_builder_lens_categories(self):
        cats = get_categories_for_lenses([LENS_BUILDER])
        assert set(cats) == set(ARXIV_CATEGORIES)

    def test_founder_lens_adds_extra_categories(self):
        cats = get_categories_for_lenses([LENS_FOUNDER])
        assert set(cats) == set(ARXIV_CATEGORIES + ARXIV_CATEGORIES_EXTRA)
        assert "econ.GN" in cats
        assert "q-fin.GN" in cats

    def test_researcher_lens_adds_researcher_categories(self):
        cats = get_categories_for_lenses([LENS_RESEARCHER])
        assert set(cats) == set(ARXIV_CATEGORIES + ARXIV_CATEGORIES_RESEARCHER)
        assert "stat.ML" in cats
        assert "stat.TH" in cats

    def test_multiple_lenses_union_deduplicated(self):
        cats = get_categories_for_lenses([LENS_BUILDER, LENS_FOUNDER, LENS_RESEARCHER])
        assert "cs.AI" in cats
        assert "econ.GN" in cats
        assert "stat.ML" in cats
        # Verify no duplicates
        assert len(cats) == len(set(cats))


# ── Active Criteria per Lens ──────────────────────────────────────────────────

class TestActiveCriteriaPerLens:
    def test_builder_criteria(self):
        crit = _active_criteria({}, lens=LENS_BUILDER)
        assert set(crit) == set(DEFAULT_ACTIVE_CRITERIA)

    def test_founder_criteria(self):
        crit = _active_criteria({}, lens=LENS_FOUNDER)
        assert set(crit) == set(ACTIVE_CRITERIA_FOUNDER)
        assert "problem_sharpness" in crit
        assert "opportunity_fit" in crit

    def test_researcher_criteria(self):
        crit = _active_criteria({}, lens=LENS_RESEARCHER)
        assert set(crit) == set(ACTIVE_CRITERIA_RESEARCHER)
        assert "theoretical_novelty" in crit
        assert "methodological_rigor" in crit
        assert "empirical_significance" in crit


# ── Profile Hash Isolation ────────────────────────────────────────────────────

class TestProfileHashLensIsolation:
    BASE_CONFIG = {
        "user_id": "u123",
        "profile_description": "AI engineer exploring modern architectures",
        "experience_level": "developer_learning_ai",
        "topics": ["transformers", "graph neural networks"],
    }

    def test_hashes_differ_across_lenses(self):
        builder_hash = _profile_hash(self.BASE_CONFIG, lens=LENS_BUILDER)
        founder_hash = _profile_hash(self.BASE_CONFIG, lens=LENS_FOUNDER)
        researcher_hash = _profile_hash(self.BASE_CONFIG, lens=LENS_RESEARCHER)

        assert builder_hash != founder_hash
        assert builder_hash != researcher_hash
        assert founder_hash != researcher_hash

    def test_hash_incorporates_config_digest_lens(self):
        cfg_builder = {**self.BASE_CONFIG, "digest_lens": LENS_BUILDER}
        cfg_founder = {**self.BASE_CONFIG, "digest_lens": LENS_FOUNDER}
        cfg_researcher = {**self.BASE_CONFIG, "digest_lens": LENS_RESEARCHER}

        assert _profile_hash(cfg_builder) != _profile_hash(cfg_founder)
        assert _profile_hash(cfg_founder) != _profile_hash(cfg_researcher)


# ── Prompt Construction ───────────────────────────────────────────────────────

class TestPromptConstruction:
    PAPERS = [{
        "arxiv_id": "2401.00001",
        "title": "Universal Graph Transformers",
        "abstract": "A novel framework for graphs.",
    }]

    def test_score_prompt_includes_lens_criteria(self):
        builder_prompt = _build_score_prompt(self.PAPERS, {}, lens=LENS_BUILDER)
        assert "builder_relevance" in builder_prompt
        assert "understandability" in builder_prompt

        founder_prompt = _build_score_prompt(self.PAPERS, {}, lens=LENS_FOUNDER)
        assert "problem_sharpness" in founder_prompt
        assert "opportunity_fit" in founder_prompt

        researcher_prompt = _build_score_prompt(self.PAPERS, {}, lens=LENS_RESEARCHER)
        assert "theoretical_novelty" in researcher_prompt
        assert "methodological_rigor" in researcher_prompt

    def test_summary_prompt_includes_lens_instructions(self):
        builder_summary = _build_summary_prompt(self.PAPERS, {}, lens=LENS_BUILDER)
        assert "builder_takeaway" in builder_summary

        founder_summary = _build_summary_prompt(self.PAPERS, {}, lens=LENS_FOUNDER)
        assert "opportunity-scouting" in founder_summary.lower()

        researcher_summary = _build_summary_prompt(self.PAPERS, {}, lens=LENS_RESEARCHER)
        assert "theoretical" in researcher_summary.lower()


# ── Notion Formatting ─────────────────────────────────────────────────────────

class TestNotionBlockRendering:
    def test_notion_blocks_use_builder_labels(self):
        blocks = _paper_blocks(SAMPLE_PAPER, index=0, total=1, lens=LENS_BUILDER)
        block_text = str(blocks)
        assert "Builder Takeaway" in block_text

    def test_notion_blocks_use_founder_labels(self):
        blocks = _paper_blocks(SAMPLE_PAPER, index=0, total=1, lens=LENS_FOUNDER)
        block_text = str(blocks)
        assert "Product Opportunity" in block_text

    def test_notion_blocks_use_researcher_labels(self):
        blocks = _paper_blocks(SAMPLE_PAPER, index=0, total=1, lens=LENS_RESEARCHER)
        block_text = str(blocks)
        assert "Theoretical Insight" in block_text
        assert "Research Question" in block_text
