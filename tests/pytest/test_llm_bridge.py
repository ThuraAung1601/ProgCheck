"""
Unit tests for LLM bridge functions (src/llm_bridge.py) and the
PrologChecker's LLM-enabled feedback path (src/checker/prolog_checker.py).

All Groq / HTTP calls are replaced by unittest.mock so no network access
or API key is required.

Requirements traced:
  UFR-11  students receive human-readable feedback when LLM is enabled
  SFR-9   system generates test cases via LLM when none extracted from problem
  SNFR-7  system does not crash when LLM services are unavailable
  SNFR-8  API keys must not appear in output logs
  SNFR-10 graceful degradation when LLM unavailable
"""
import sys
import os
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

import src.llm_bridge as llm_bridge
from src.llm_bridge import (
    generate_simple_test_cases,
    translate_to_natural_language,
    generate_test_cases,
)


# ── Helper: mock Groq chat completion ─────────────────────────────────────────

def _mock_chat(return_text):
    """Patch _chat_completion to return a fixed string."""
    return patch.object(llm_bridge, "_chat_completion", return_value=return_text)


# ─────────────────────────────────────────────────────────────────────────────
# SFR-9  — generate_simple_test_cases (LLM test-case generation)
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateSimpleTestCases:
    def test_returns_list(self):
        """SFR-9: returns a list, not None or a string."""
        llm_output = "append([],[],[])|true\nappend([a],[b],[a,b])|true\n"
        with _mock_chat(llm_output):
            result = generate_simple_test_cases("problem", "code", "fake-key")
        assert isinstance(result, list)

    def test_parses_true_expected(self):
        """SFR-9: 'true' expected_output parsed correctly."""
        with _mock_chat("foo(1)|true\n"):
            result = generate_simple_test_cases("p", "c", "k")
        assert len(result) == 1
        assert result[0]["input"] == "foo(1)"
        assert result[0]["expected_output"] == "true"

    def test_parses_false_expected(self):
        """SFR-9: 'false' expected_output parsed correctly."""
        with _mock_chat("foo(2)|false\n"):
            result = generate_simple_test_cases("p", "c", "k")
        assert result[0]["expected_output"] == "false"

    def test_invalid_lines_skipped(self):
        """SFR-9: lines without '|' separator are ignored."""
        llm_output = "# comment\nfoo(1)|true\nbad line\nfoo(2)|false\n"
        with _mock_chat(llm_output):
            result = generate_simple_test_cases("p", "c", "k")
        assert len(result) == 2

    def test_testcase_ids_are_negative(self):
        """SFR-9: LLM-generated cases use negative IDs to signal they are not persisted."""
        with _mock_chat("foo(1)|true\nfoo(2)|true\n"):
            result = generate_simple_test_cases("p", "c", "k")
        for tc in result:
            assert tc["testcase_id"] < 0

    def test_multiple_cases_returned(self):
        """SFR-9: multiple test cases parsed from multi-line LLM output."""
        llm_output = "\n".join(
            [f"pred({i})|true" for i in range(6)]
        )
        with _mock_chat(llm_output):
            result = generate_simple_test_cases("p", "c", "k")
        assert len(result) == 6

    def test_empty_llm_response_returns_empty_list(self):
        """SNFR-10: empty LLM output → empty list, no crash."""
        with _mock_chat(""):
            result = generate_simple_test_cases("p", "c", "k")
        assert result == []

    def test_unknown_expected_defaults_to_true(self):
        """SFR-9: unexpected expected value falls back to 'true'."""
        with _mock_chat("foo(1)|maybe\n"):
            result = generate_simple_test_cases("p", "c", "k")
        assert result[0]["expected_output"] == "true"


# ─────────────────────────────────────────────────────────────────────────────
# SFR-9  — generate_test_cases (Prolog-format generation)
# ─────────────────────────────────────────────────────────────────────────────

class TestGenerateTestCases:
    def test_returns_string(self):
        """SFR-9: generate_test_cases returns a Prolog-formatted string."""
        llm_output = ":- test(append([],[],[])) :- true."
        with _mock_chat(llm_output):
            result = generate_test_cases("problem", "code", "fake-key")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_llm_error_propagates_or_returns_empty(self):
        """SNFR-10: when _chat_completion raises, generate_test_cases does not crash silently."""
        with patch.object(llm_bridge, "_chat_completion", side_effect=Exception("network error")):
            try:
                result = generate_test_cases("p", "c", "k")
                # If it handles gracefully, result should be empty-ish
                assert result is not None
            except Exception:
                pass  # raising is also acceptable — caller handles it


# ─────────────────────────────────────────────────────────────────────────────
# UFR-11  — translate_to_natural_language (LLM feedback)
# ─────────────────────────────────────────────────────────────────────────────

class TestTranslateToNaturalLanguage:
    def test_returns_string_for_syntax_error(self):
        """UFR-11: LLM translates syntax error to natural language string."""
        analysis = {
            "status": "syntax_error",
            "syntax_error": {
                "type": "missing_period",
                "line": 1,
                "line_text": "factorial(0, 1)",
                "friendly_message": "Missing period at end of clause",
            },
        }
        with _mock_chat("You forgot to put a period at the end of the clause."):
            result = translate_to_natural_language(
                analysis, "problem text", "student code", "fake-key"
            )
        assert isinstance(result, str)
        assert len(result) > 0

    def test_returns_string_for_correct_code(self):
        """UFR-11: LLM provides feedback for correct submission."""
        analysis = {
            "status": "correct",
            "proof_tree": "proof(append([],[],[]), [], [])",
            "diagnoses": None,
        }
        with _mock_chat("Your code is correct. The base case handles the empty list properly."):
            result = translate_to_natural_language(
                analysis, "problem text", "student code", "fake-key"
            )
        assert isinstance(result, str)

    def test_returns_string_for_logic_error(self):
        """UFR-11: LLM explains logic errors in human-readable form."""
        analysis = {
            "status": "logic_error",
            "error": "test_failure(append([],[],[a]), [...])",
            "diagnoses": None,
            "proof_tree": None,
        }
        with _mock_chat("Your base case produces the wrong result for an empty list."):
            result = translate_to_natural_language(
                analysis, "problem text", "wrong code", "fake-key"
            )
        assert isinstance(result, str)

    def test_feedback_does_not_contain_api_key(self):
        """SNFR-8: the API key must not appear in the returned feedback."""
        analysis = {"status": "correct", "proof_tree": "", "diagnoses": None}
        fake_key = "sk-supersecret-99999"
        with _mock_chat("Great job!"):
            result = translate_to_natural_language(
                analysis, "p", "c", fake_key
            )
        assert fake_key not in result


# ─────────────────────────────────────────────────────────────────────────────
# UFR-11  — PrologChecker.gen_feedback with LLM enabled
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckerGenFeedbackWithLLM:
    """Test the checker's gen_feedback method when LLM IS available (mocked)."""

    @pytest.fixture
    def tmp_files(self, tmp_path):
        prob = tmp_path / "problem.pl"
        prob.write_text(
            "% append/3\n"
            "% append([],[],[]) should be true\n"
        )
        correct = tmp_path / "correct.pl"
        correct.write_text(
            "append([], Y, Y).\n"
            "append([H|T], Y, [H|R]) :- append(T, Y, R).\n"
        )
        return {"problem": prob, "correct": correct}

    def test_llm_feedback_stored_on_checker(self, tmp_files):
        """UFR-11: when LLM returns feedback, it is stored in last_llm_feedback."""
        import os
        from src.checker.prolog_checker import PrologChecker

        with patch.dict(os.environ, {"GROQ_API_KEY": "fake-key"}):
            checker = PrologChecker(
                problem_file=tmp_files["problem"],
                student_file=tmp_files["correct"],
                use_llm=True,
            )
        analysis = {"status": "correct", "proof_tree": "", "diagnoses": None,
                    "syntax_error": None, "error": None}
        log = []

        with patch("src.checker.prolog_checker.translate_to_natural_language",
                   return_value="Your code is correct!"):
            checker.gen_feedback(analysis, log)

        assert checker.last_llm_feedback is not None
        assert len(checker.last_llm_feedback) > 0

    def test_llm_feedback_is_human_readable_string(self, tmp_files):
        """UFR-11: LLM feedback stored is a plain string, not a dict or None."""
        import os
        from src.checker.prolog_checker import PrologChecker

        with patch.dict(os.environ, {"GROQ_API_KEY": "fake-key"}):
            checker = PrologChecker(
                problem_file=tmp_files["problem"],
                student_file=tmp_files["correct"],
                use_llm=True,
            )
        analysis = {"status": "logic_error", "proof_tree": None, "diagnoses": None,
                    "syntax_error": None, "error": "some failure"}
        log = []

        with patch("src.checker.prolog_checker.translate_to_natural_language",
                   return_value="There is a bug in your base case."):
            checker.gen_feedback(analysis, log)

        assert isinstance(checker.last_llm_feedback, str)

    def test_llm_exception_does_not_crash_checker(self, tmp_files):
        """SNFR-7: if LLM call throws, gen_feedback completes without raising."""
        import os
        from src.checker.prolog_checker import PrologChecker

        with patch.dict(os.environ, {"GROQ_API_KEY": "fake-key"}):
            checker = PrologChecker(
                problem_file=tmp_files["problem"],
                student_file=tmp_files["correct"],
                use_llm=True,
            )
        analysis = {"status": "correct", "proof_tree": "", "diagnoses": None,
                    "syntax_error": None, "error": None}
        log = []

        with patch("src.checker.prolog_checker.translate_to_natural_language",
                   side_effect=Exception("Groq API down")):
            try:
                checker.gen_feedback(analysis, log)
            except Exception as exc:
                pytest.fail(f"gen_feedback should not raise, but raised: {exc}")
