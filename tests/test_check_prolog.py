"""Unit tests for helper logic in src.check_prolog"""

from pathlib import Path
import sys

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from check_prolog import PrologChecker


def make_checker(tmp_path, problem_text="parent(a,b) should be true", student_text="parent(a,b)."):  # pragma: no cover
    problem_file = tmp_path / "problem.txt"
    student_file = tmp_path / "student.pl"
    problem_file.write_text(problem_text)
    student_file.write_text(student_text)
    return PrologChecker(problem_file, student_file)


def test_extract_tests_skips_variable_goals(tmp_path):
    problem_text = (
        "sum(1,2,3) should be true\n"
        "sum(X,2,3) should be true\n"
        "sum(2,2,5) should be false"
    )
    checker = make_checker(tmp_path, problem_text=problem_text)

    tests_text = checker._extract_tests()

    assert tests_text is not None
    lines = [line.strip() for line in tests_text.splitlines() if line.strip()]
    assert "test(sum(1,2,3), [sum(1,2,3)])." in lines
    assert "test(sum(2,2,5), [])." in lines
    assert all("X" not in line for line in lines)


def test_parse_tests_to_goals_ignores_comments(tmp_path):
    tests_blob = (
        "test(sum(1,2,3), [sum(1,2,3)]).\n"
        "% comment\n"
        "test(sum(2,2,5), [])."
    )
    checker = make_checker(tmp_path)

    goals = checker._parse_tests_to_goals(tests_blob)

    assert goals == ["sum(1,2,3)", "sum(2,2,5)"]


def test_load_test_cases_file_strips_comments(tmp_path):
    test_case_file = tmp_path / "cases.pl"
    test_case_file.write_text(
        "sum(1,2,3).\n"
        "% explain later\n"
        "sum(2,2,4).  % inline comment\n"
        "sum(3,3,6)."
    )
    checker = make_checker(
        tmp_path,
        problem_text="sum(1,2,3) should be true",
    )
    checker.test_cases_file = test_case_file

    goals = checker._load_test_cases_file()

    assert goals == ["sum(1,2,3)", "sum(2,2,4)", "sum(3,3,6)"]


def test_normalize_goal_text_handles_bytes(tmp_path):
    checker = make_checker(tmp_path)

    assert checker._normalize_goal_text(b"goal(a)") == "goal(a)"
    assert checker._normalize_goal_text(None) is None


def test_summarize_failed_tests_lists_unique_goals(tmp_path):
    checker = make_checker(tmp_path)
    errors = (
        "test_failure(sum(1,2,3), []). "
        "test_failure(sum(1,2,3), []). "
        "test_failure(sum(2,2,4), []). "
        "test_failure(sum(3,3,6), [])."
    )

    summary = checker._summarize_failed_tests(errors)

    assert "sum(1,2,3)" in summary
    assert "sum(2,2,4)" in summary
    assert "sum(3,3,6)" in summary


def test_build_human_feedback_prefers_diagnoses(tmp_path):
    checker = make_checker(tmp_path)
    analysis = {
        "status": "logic_error",
        "diagnoses_text": "diagnosis(foo,1,'Wrong base','Add base case',[]).",
        "error": "test_failure(sum(1,2,3), [])",
    }

    feedback = checker._build_human_feedback(analysis)

    assert "Wrong base." in feedback
    assert "Suggestion: Add base case." in feedback


def test_build_human_feedback_for_syntax_error(tmp_path):
    checker = make_checker(tmp_path)
    analysis = {
        "status": "syntax_error",
        "syntax_error": {
            "line": 2,
            "type": "missing_period",
            "line_text": "sum(1,2,3)",
            "friendly_message": "Add the missing period.",
        },
    }

    feedback = checker._build_human_feedback(analysis)

    assert "missing period" in feedback.lower()
    assert "Add the missing period." in feedback


def test_build_human_feedback_for_success(tmp_path):
    checker = make_checker(tmp_path)
    analysis = {
        "status": "correct",
        "proof_tree": "proof",
    }

    feedback = checker._build_human_feedback(analysis)

    assert "passed all tests" in feedback


def test_human_error_type_defaults_to_title(tmp_path):
    checker = make_checker(tmp_path)

    assert checker._human_error_type("invalid_operator") == "Invalid Operator"
    assert checker._human_error_type("custom_error") == "Custom Error"
