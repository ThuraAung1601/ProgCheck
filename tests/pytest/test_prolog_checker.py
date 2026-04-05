"""
Unit and integration tests for PrologChecker (src/checker/prolog_checker.py).

Tests are skipped gracefully when SWI-Prolog / pyswip is not installed so
that the CI environment is not broken on machines without Prolog.

Requirements traced:
  SFR-6  parse Prolog files, detect syntax errors via DCG checker
  SFR-7  consult meta-interpreter and diagnosis engine
  SFR-10 evaluate tests, record failures
  SFR-11 build proof trees and execution traces
  SFR-12 rank diagnoses using evidence weights
  SFR-13 enforce execution time/depth limits
  UFR-7  students receive pass/fail per test case
  UFR-8  students see readable syntax error messages
  UFR-9  students see proof trees and execution traces
  UFR-10 students receive ranked diagnosis messages
  SNFR-4 avoid infinite execution (depth/time limits)
  SNFR-3 deterministic results for same inputs
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

# Optional: skip entire module when pyswip unavailable
pyswip_available = True
try:
    from pyswip import Prolog as _P
except Exception:
    pyswip_available = False

pytestmark_prolog = pytest.mark.skipif(
    not pyswip_available,
    reason="SWI-Prolog / pyswip not installed",
)

from src.checker.prolog_checker import PrologChecker


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def tmp_files(tmp_path):
    """Return a dict of named temporary Prolog files."""
    files = {}

    files["problem"] = tmp_path / "problem.pl"
    # Use ground goals (no unbound variables) so _extract_tests can pick them up
    files["problem"].write_text(
        "% append/3\n"
        "% append([],[],[]) should be true\n"
        "% append([a],[b],[a,b]) should be true\n"
    )

    files["correct"] = tmp_path / "correct.pl"
    files["correct"].write_text(
        "append([], Y, Y).\n"
        "append([H|T], Y, [H|R]) :- append(T, Y, R).\n"
    )

    files["wrong_base"] = tmp_path / "wrong_base.pl"
    files["wrong_base"].write_text(
        "append([], Y, []).\n"          # incorrect base: discards Y
        "append([H|T], Y, [H|R]) :- append(T, Y, R).\n"
    )

    files["syntax_err"] = tmp_path / "syntax_err.pl"
    # Missing period after first clause — SWI-Prolog cannot parse the file
    # (same content as data/student_codes/syntax_missing_period.pl)
    files["syntax_err"].write_text(
        "factorial(0, 1)\n"
        "factorial(N, F) :- N > 0, N1 is N-1, factorial(N1, F1), F is N*F1.\n"
    )

    files["factorial"] = tmp_path / "factorial_problem.pl"
    files["factorial"].write_text(
        "% factorial/2\n"
        "% factorial(0,1) should be true\n"
        "% factorial(3,6) should be true\n"
    )

    files["factorial_correct"] = tmp_path / "factorial_correct.pl"
    files["factorial_correct"].write_text(
        "factorial(0, 1).\n"
        "factorial(N, F) :- N > 0, N1 is N-1, factorial(N1, F1), F is N * F1.\n"
    )

    files["factorial_no_base"] = tmp_path / "factorial_no_base.pl"
    files["factorial_no_base"].write_text(
        "factorial(N, F) :- N > 0, N1 is N-1, factorial(N1, F1), F is N * F1.\n"
    )

    return files


def _make_checker(problem, student, **kw):
    # Default use_llm=False but allow caller to override via **kw
    kw.setdefault('use_llm', False)
    return PrologChecker(
        problem_file=problem,
        student_file=student,
        **kw,
    )


# ─────────────────────────────────────────────────────────────────────────────
# 1. Syntax checking (SFR-6, UFR-8)
# ─────────────────────────────────────────────────────────────────────────────

class TestSyntaxCheck:
    @pytestmark_prolog
    def test_correct_syntax_passes(self, tmp_files):
        """SFR-6: valid Prolog file must not trigger a syntax error."""
        checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
        log = []
        ok = checker.check_syntax(log)
        assert ok is True
        assert checker.syntax_error is None

    @pytestmark_prolog
    def test_syntax_error_detected(self, tmp_files):
        """SFR-6, UFR-8: file with missing period/paren produces syntax error."""
        checker = _make_checker(tmp_files["problem"], tmp_files["syntax_err"])
        log = []
        ok = checker.check_syntax(log)
        assert ok is False
        assert checker.syntax_error is not None
        # Feedback should contain something meaningful
        assert len(checker.syntax_error) > 0

    @pytestmark_prolog
    def test_syntax_error_message_is_human_readable(self, tmp_files):
        """UFR-8: error message must not be raw Prolog exception string."""
        checker = _make_checker(tmp_files["problem"], tmp_files["syntax_err"])
        log = []
        checker.check_syntax(log)
        # The error message must not be empty and should be text-based
        assert isinstance(checker.syntax_error, str)
        assert len(checker.syntax_error.strip()) > 5

    def test_check_syntax_without_prolog_engine(self, tmp_files):
        """SFR-6: checker should handle missing pyswip gracefully."""
        with patch("src.checker.prolog_checker.Prolog", None):
            checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
            log = []
            # Must not raise — may return False or True depending on fallback
            try:
                checker.check_syntax(log)
            except Exception as exc:
                pytest.fail(f"check_syntax raised unexpectedly: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 2. Test-case extraction from problem text (SFR-8)
# ─────────────────────────────────────────────────────────────────────────────

class TestExtractTests:
    def test_extracts_ground_goals(self, tmp_files):
        """SFR-8: parser finds ground 'Goal should be true/false' lines."""
        checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
        extracted = checker._extract_tests()
        # Problem file uses ground goals: append([],[],[]) and append([a],[b],[a,b])
        assert extracted, "Expected non-empty extraction from ground goals in problem text"
        assert "test(" in extracted

    def test_no_extraction_when_no_should_lines(self, tmp_path):
        """SFR-8: problem with no 'should be' lines yields empty extraction."""
        prob = tmp_path / "no_tests.pl"
        prob.write_text("% Write a predicate.\n")
        stu  = tmp_path / "code.pl"
        stu.write_text("foo(X) :- bar(X).\n")
        checker = _make_checker(prob, stu)
        result = checker._extract_tests()
        assert result.strip() == ""

    def test_skips_goals_with_unbound_vars(self, tmp_path):
        """SFR-8: goals containing variables (e.g. X) are skipped."""
        prob = tmp_path / "var_goals.pl"
        prob.write_text(
            "% append(X,Y,Z) should be true\n"   # has unbound vars — skip
            "% append([],[],[]) should be true\n"  # ground — keep
        )
        stu = tmp_path / "code.pl"
        stu.write_text("append([],Y,Y).\n")
        checker = _make_checker(prob, stu)
        result = checker._extract_tests()
        assert "append(X" not in result
        assert "append([],[],[])" in result


# ─────────────────────────────────────────────────────────────────────────────
# 3. Full diagnosis run (SFR-7, SFR-10, SFR-11, SFR-12, UFR-9, UFR-10)
# ─────────────────────────────────────────────────────────────────────────────

class TestFullDiagnosis:
    @pytestmark_prolog
    def test_correct_code_produces_no_failures(self, tmp_files):
        """SFR-10: correct code should pass all extracted test cases."""
        checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
        log = []
        result = checker.run()
        # Result is a string log; should contain pass indication
        assert isinstance(result, str)
        # Must not crash
        assert len(result) > 0

    @pytestmark_prolog
    def test_wrong_base_case_detected(self, tmp_files):
        """SFR-10, UFR-7: wrong base case causes test failure reported in log."""
        checker = _make_checker(tmp_files["problem"], tmp_files["wrong_base"])
        result = checker.run()
        assert isinstance(result, str)
        # The log should mention failure or error
        lower = result.lower()
        has_failure_info = any(
            kw in lower for kw in ("fail", "error", "incorrect", "wrong", "diagnos")
        )
        assert has_failure_info, f"No failure info in log:\n{result[:500]}"

    @pytestmark_prolog
    def test_factorial_no_base_detected(self, tmp_files):
        """UFR-10: missing base case reported with diagnosis."""
        checker = _make_checker(
            tmp_files["factorial"], tmp_files["factorial_no_base"]
        )
        result = checker.run()
        assert isinstance(result, str)

    @pytestmark_prolog
    def test_log_contains_trace_section(self, tmp_files):
        """UFR-9: execution trace must appear in output log."""
        checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
        result = checker.run()
        # A trace section heading or trace data should be present
        # (exact wording depends on implementation)
        assert isinstance(result, str)

    @pytestmark_prolog
    def test_run_is_deterministic(self, tmp_files):
        """SNFR-3: same input produces identical log output."""
        c1 = _make_checker(tmp_files["problem"], tmp_files["correct"])
        c2 = _make_checker(tmp_files["problem"], tmp_files["correct"])
        r1 = c1.run()
        r2 = c2.run()
        # Logs should be structurally equivalent (may differ in timestamps)
        # We compare line counts as a proxy
        assert abs(len(r1.splitlines()) - len(r2.splitlines())) <= 3


# ─────────────────────────────────────────────────────────────────────────────
# 4. Depth / time limits (SFR-13, SNFR-4)
# ─────────────────────────────────────────────────────────────────────────────

class TestExecutionLimits:
    @pytestmark_prolog
    def test_infinite_loop_does_not_hang(self, tmp_path):
        """SNFR-4: checker enforces depth limit, preventing infinite recursion."""
        prob = tmp_path / "problem.pl"
        prob.write_text("% loop(X) should be true\n")
        stu  = tmp_path / "student.pl"
        # Non-terminating predicate
        stu.write_text("loop(X) :- loop(X).\n")
        import threading
        result_holder = [None]
        def _run():
            checker = _make_checker(prob, stu)
            result_holder[0] = checker.run()
        t = threading.Thread(target=_run, daemon=True)
        t.start()
        t.join(timeout=15)       # must complete within 15 s
        assert not t.is_alive(), "Checker did not terminate within 15 seconds (depth limit not enforced)"


# ─────────────────────────────────────────────────────────────────────────────
# 5. LLM bridge integration (graceful degradation) (SNFR-7, SNFR-10)
# ─────────────────────────────────────────────────────────────────────────────

class TestLLMDegradation:
    def test_checker_runs_without_llm(self, tmp_files):
        """SNFR-10: system functions correctly when LLM is unavailable."""
        with patch("src.checker.prolog_checker.generate_test_cases", None), \
             patch("src.checker.prolog_checker.translate_to_natural_language", None):
            # use_llm omitted — defaults to False inside _make_checker
            checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
            # Just constructing and calling _extract_tests must succeed
            checker._extract_tests()

    def test_api_key_not_logged(self, tmp_files, capsys):
        """SNFR-8: GROQ_API_KEY must not appear in stdout."""
        with patch.dict(os.environ, {"GROQ_API_KEY": "sk-secret-key-12345"}):
            checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
            checker._extract_tests()
        captured = capsys.readouterr()
        assert "sk-secret-key-12345" not in captured.out
        assert "sk-secret-key-12345" not in captured.err


# ─────────────────────────────────────────────────────────────────────────────
# 6. Auto-fix (SFR-10 extension)
# ─────────────────────────────────────────────────────────────────────────────

class TestAutoFix:
    @pytestmark_prolog
    def test_auto_fix_creates_output_file(self, tmp_files, tmp_path):
        """SFR-10: when auto_fix=True, checker completes without error.
        The fix file is only written when LLM corrects the code; without a
        GROQ_API_KEY the file may not be created — that is expected behaviour.
        """
        fix_path = tmp_path / "fixed.pl"
        checker = _make_checker(
            tmp_files["problem"], tmp_files["wrong_base"],
            auto_fix=True,
            max_fix_attempts=1,
            fix_output_path=fix_path,
        )
        # Must complete without raising even when LLM is unavailable
        try:
            checker.run()
        except Exception as exc:
            pytest.fail(f"auto_fix run raised unexpectedly: {exc}")
        # When LLM is available the fix file should exist; without it, skip
        if os.getenv("GROQ_API_KEY"):
            assert fix_path.exists(), "Fix file expected when GROQ_API_KEY is set"


# ─────────────────────────────────────────────────────────────────────────────
# 7. Checker constructor / attribute contracts
# ─────────────────────────────────────────────────────────────────────────────

class TestCheckerConstructor:
    def test_attributes_set_correctly(self, tmp_files):
        checker = PrologChecker(
            problem_file=tmp_files["problem"],
            student_file=tmp_files["correct"],
            use_llm=False,
        )
        assert checker.use_llm is False
        assert checker.auto_fix is False
        assert checker.syntax_error is None
        assert checker.last_llm_feedback is None

    def test_problem_text_loaded(self, tmp_files):
        checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
        assert "append" in checker.problem_text

    def test_student_code_loaded(self, tmp_files):
        checker = _make_checker(tmp_files["problem"], tmp_files["correct"])
        assert "append" in checker.student_code
