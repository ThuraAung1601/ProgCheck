from pathlib import Path
import sys

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from check_prolog import Prolog, PrologChecker


pytestmark = pytest.mark.skipif(Prolog is None, reason="pyswip/SWI-Prolog is not available")


def test_python_to_prolog_boundary_success_case(tmp_path):
    problem_file = tmp_path / "problem.txt"
    student_file = tmp_path / "student.pl"

    problem_file.write_text("simple predicate check")
    student_file.write_text("p(a).\n")

    checker = PrologChecker(
        problem_file,
        student_file,
        use_llm=False,
    )

    log = []
    assert checker.check_syntax(log) is True
    analysis = checker.run_analysis("test(p(a), [p(a)]).", log)

    assert isinstance(analysis, dict)
    assert analysis["status"] == "correct"
    assert "proof_tree" in analysis


def test_python_to_prolog_boundary_failure_case(tmp_path):
    problem_file = tmp_path / "problem.txt"
    student_file = tmp_path / "student.pl"

    problem_file.write_text("simple predicate check")
    student_file.write_text("p(a).\n")

    checker = PrologChecker(
        problem_file,
        student_file,
        use_llm=False,
    )

    log = []
    assert checker.check_syntax(log) is True

    analysis = checker.run_analysis("test(p(b), [p(b)]).", log)

    assert isinstance(analysis, dict)
    assert analysis["status"] == "logic_error"
    assert analysis.get("error") is not None
