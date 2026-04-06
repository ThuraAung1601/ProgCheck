"""
Unit tests for text-processing utilities (src/utils.py).

All functions are pure (no I/O, no database), so tests exercise the regex
patterns and mapping tables directly.

Requirements traced:
  UFR-7   human-readable diagnosis output (human_error_type)
  UFR-8   human-readable syntax error messages
  UFR-9   proof tree nodes available for display (extract_evidence_items)
  UFR-10  failed tests summarised for student feedback (summarize_failed_tests)
"""
import sys
import pytest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from src.utils import (
    normalize_goal_text,
    extract_evidence_items,
    parse_diagnoses_text,
    summarize_failed_tests,
    human_error_type,
)


# ── normalize_goal_text ───────────────────────────────────────────────────────

class TestNormalizeGoalText:

    def test_none_returns_none(self):
        assert normalize_goal_text(None) is None

    def test_bytes_decoded_to_string(self):
        assert normalize_goal_text(b"append([],Y,Y)") == "append([],Y,Y)"

    def test_string_passthrough(self):
        assert normalize_goal_text("foo(bar)") == "foo(bar)"

    def test_integer_converted_to_string(self):
        assert normalize_goal_text(42) == "42"

    def test_empty_string_passthrough(self):
        assert normalize_goal_text("") == ""

    def test_bytes_with_non_ascii_does_not_raise(self):
        result = normalize_goal_text(b"caf\xe9")
        assert isinstance(result, str)


# ── extract_evidence_items ────────────────────────────────────────────────────

class TestExtractEvidenceItems:

    _SAMPLE = (
        "diagnosis(1, goal, 'INCORRECT', 'reason', [evidence_a, evidence_b]) "
        "diagnosis(2, goal2, 'OK', 'none', []) "
    )

    def test_none_returns_empty_list(self):
        assert extract_evidence_items(None) == []

    def test_empty_string_returns_empty_list(self):
        assert extract_evidence_items("") == []

    def test_no_diagnosis_terms_returns_empty(self):
        assert extract_evidence_items("some random text with no terms") == []

    def test_extracts_evidence_brackets(self):
        result = extract_evidence_items(self._SAMPLE)
        assert len(result) == 2
        assert "[evidence_a, evidence_b]" in result
        assert "[]" in result

    def test_single_diagnosis_returns_one_item(self):
        text = "diagnosis(1, g, 't', 'r', [x, y])"
        result = extract_evidence_items(text)
        assert len(result) == 1


# ── parse_diagnoses_text ──────────────────────────────────────────────────────

class TestParseDiagnosesText:

    _SAMPLE = (
        "diagnosis(1, goal, 'INCORRECT', 'base case wrong', [e1]) "
        "diagnosis(2, goal2, 'OK', 'looks correct', []) "
    )

    def test_none_returns_empty_list(self):
        assert parse_diagnoses_text(None) == []

    def test_empty_string_returns_empty_list(self):
        assert parse_diagnoses_text("") == []

    def test_bracket_only_returns_empty(self):
        assert parse_diagnoses_text("[]") == []

    def test_parses_verdict_and_reason_tuples(self):
        result = parse_diagnoses_text(self._SAMPLE)
        assert len(result) == 2
        verdicts = [r[0] for r in result]
        reasons  = [r[1] for r in result]
        assert "INCORRECT" in verdicts
        assert "OK" in verdicts
        assert "base case wrong" in reasons

    def test_returns_list_of_tuples(self):
        result = parse_diagnoses_text(self._SAMPLE)
        for item in result:
            assert isinstance(item, tuple)
            assert len(item) == 2

    def test_no_match_returns_empty(self):
        assert parse_diagnoses_text("nothing here") == []


# ── summarize_failed_tests ────────────────────────────────────────────────────

class TestSummarizeFailedTests:

    def test_none_returns_none(self):
        assert summarize_failed_tests(None) is None

    def test_empty_string_returns_none(self):
        assert summarize_failed_tests("") is None

    def test_no_failures_returns_none(self):
        assert summarize_failed_tests("no test_failure terms here") is None

    def test_single_failure_summarised(self):
        text = "[test_failure(append([],[],[]), [append([],[],[])])]"
        result = summarize_failed_tests(text)
        assert result is not None
        assert "append" in result

    def test_multiple_failures_listed(self):
        text = (
            "[test_failure(append([],[],[]), []), "
            "test_failure(append([a],[b],[a,b]), [])]"
        )
        result = summarize_failed_tests(text)
        assert result is not None
        assert "append" in result

    def test_more_than_4_goals_truncated_with_ellipsis(self):
        text = " ".join(
            f"test_failure(pred{i}(x), [pred{i}(x)])" for i in range(6)
        )
        result = summarize_failed_tests(text)
        assert "..." in result

    def test_exactly_4_goals_no_ellipsis(self):
        text = " ".join(
            f"test_failure(pred{i}(x), [pred{i}(x)])" for i in range(4)
        )
        result = summarize_failed_tests(text)
        assert "..." not in result

    def test_duplicate_goals_deduplicated(self):
        text = (
            "test_failure(foo(1), []) "
            "test_failure(foo(1), []) "
            "test_failure(foo(1), []) "
        )
        result = summarize_failed_tests(text)
        # Should appear only once (dedup)
        assert result.count("foo(1)") == 1

    def test_result_starts_with_prefix(self):
        text = "test_failure(bar(x), [bar(x)])"
        result = summarize_failed_tests(text)
        assert result.startswith("Tests failed for:")


# ── human_error_type ──────────────────────────────────────────────────────────

class TestHumanErrorType:

    def test_none_returns_unknown(self):
        assert human_error_type(None) == "Unknown Syntax Error"

    def test_empty_string_returns_unknown(self):
        assert human_error_type("") == "Unknown Syntax Error"

    @pytest.mark.parametrize("key,expected", [
        ("invalid_operator",     "Invalid Operator"),
        ("missing_period",       "Missing Period"),
        ("unmatched_parentheses","Unmatched Parentheses"),
        ("unmatched_brackets",   "Unmatched Brackets"),
        ("variable_lowercase",   "Variable Starts Lowercase"),
        ("double_period",        "Double Period"),
        ("space_in_atom",        "Space in Atom"),
        ("missing_clause_body",  "Missing Clause Body"),
        ("parser_error",         "Parser Error"),
        ("unknown",              "Unknown Syntax Error"),
    ])
    def test_known_keys_mapped_correctly(self, key, expected):
        assert human_error_type(key) == expected

    def test_unknown_key_title_cased(self):
        result = human_error_type("some_new_error")
        assert result == "Some New Error"

    def test_unknown_key_with_single_word(self):
        result = human_error_type("overflow")
        assert result == "Overflow"
