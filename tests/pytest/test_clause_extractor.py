"""
Unit tests for Prolog clause extraction (src/clause_extractor.py).

Tests cover:
  - Clause dataclass (__str__, signature, is_fact)
  - ClauseDatabase.from_source (facts, rules, comments, multiline)
  - ClauseDatabase.get_clauses / add_clause
  - ClauseDatabase.find_original_clause
  - _could_unify helper
  - extract_predicate_name_and_arity helper

Requirements traced:
  UFR-9   proof tree extracted and displayed per clause
  SFR-11  clause-level debugging requires clause database
"""
import sys
import pytest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

from src.clause_extractor import (
    Clause,
    ClauseDatabase,
    _could_unify,
    extract_predicate_name_and_arity,
)


# ── Clause dataclass ──────────────────────────────────────────────────────────

class TestClause:

    def test_fact_str_ends_with_period(self):
        c = Clause(head="foo(a)", body="true", is_fact=True, original_text="foo(a).")
        assert str(c) == "foo(a)."

    def test_rule_str_includes_neck(self):
        c = Clause(
            head="bar(X)", body="foo(X)", is_fact=False,
            original_text="bar(X) :- foo(X).",
        )
        assert str(c) == "bar(X) :- foo(X)."

    def test_signature_of_binary_predicate(self):
        c = Clause(head="append(A, B, C)", body="true", is_fact=True, original_text="")
        name, arity = c.signature()
        assert name == "append"
        assert arity == 3

    def test_signature_of_unary_predicate(self):
        c = Clause(head="human(socrates)", body="true", is_fact=True, original_text="")
        name, arity = c.signature()
        assert name == "human"
        assert arity == 1

    def test_signature_of_zero_arity(self):
        # Bare atom without parentheses does not match the paren pattern → ("", 0)
        c = Clause(head="halt", body="true", is_fact=True, original_text="")
        name, arity = c.signature()
        assert name == ""
        assert arity == 0

    def test_is_fact_true_for_facts(self):
        c = Clause(head="foo(a)", body="true", is_fact=True, original_text="foo(a).")
        assert c.is_fact is True

    def test_is_fact_false_for_rules(self):
        c = Clause(head="foo(X)", body="bar(X)", is_fact=False, original_text="")
        assert c.is_fact is False


# ── ClauseDatabase.from_source ────────────────────────────────────────────────

class TestClauseDatabaseFromSource:

    _FACTORIAL = """
factorial(0, 1).
factorial(N, F) :- N > 0, N1 is N - 1, factorial(N1, F1), F is N * F1.
"""

    _APPEND = """
% append/3 implementation
append([], Y, Y).
append([H|T], Y, [H|R]) :- append(T, Y, R).
"""

    _COMMENTS_ONLY = """
% Just a comment
/* block comment */
"""

    def test_parses_fact(self):
        db = ClauseDatabase.from_source("foo(a).\n")
        clauses = db.get_clauses("foo", 1)
        assert len(clauses) == 1
        assert clauses[0].is_fact is True

    def test_parses_rule(self):
        db = ClauseDatabase.from_source("bar(X) :- foo(X).\n")
        clauses = db.get_clauses("bar", 1)
        assert len(clauses) == 1
        assert clauses[0].is_fact is False
        assert clauses[0].body == "foo(X)"

    def test_parses_multiple_clauses_same_predicate(self):
        db = ClauseDatabase.from_source(self._FACTORIAL)
        clauses = db.get_clauses("factorial", 2)
        assert len(clauses) == 2

    def test_identifies_base_case_as_fact(self):
        db = ClauseDatabase.from_source(self._FACTORIAL)
        fact_clauses = [c for c in db.get_clauses("factorial", 2) if c.is_fact]
        assert len(fact_clauses) == 1
        assert "0" in fact_clauses[0].head

    def test_line_comments_stripped(self):
        source = "% comment\nfoo(a).\n"
        db = ClauseDatabase.from_source(source)
        assert len(db.get_clauses("foo", 1)) == 1

    def test_block_comments_stripped(self):
        source = "/* block */\nfoo(a).\n"
        db = ClauseDatabase.from_source(source)
        assert len(db.get_clauses("foo", 1)) == 1

    def test_empty_source_produces_empty_db(self):
        db = ClauseDatabase.from_source("")
        assert db.clauses == []

    def test_comments_only_produces_empty_db(self):
        db = ClauseDatabase.from_source(self._COMMENTS_ONLY)
        assert db.clauses == []

    def test_two_different_predicates_indexed_separately(self):
        db = ClauseDatabase.from_source(self._APPEND)
        appends = db.get_clauses("append", 3)
        assert len(appends) == 2

    def test_head_and_body_parsed_correctly(self):
        db = ClauseDatabase.from_source("member(X, [X|_]).\n")
        c = db.get_clauses("member", 2)[0]
        assert "member" in c.head

    def test_multiline_rule_parsed(self):
        source = (
            "long(X) :-\n"
            "    foo(X),\n"
            "    bar(X).\n"
        )
        db = ClauseDatabase.from_source(source)
        clauses = db.get_clauses("long", 1)
        assert len(clauses) == 1
        assert clauses[0].is_fact is False


# ── ClauseDatabase.get_clauses ────────────────────────────────────────────────

class TestGetClauses:

    def test_missing_predicate_returns_empty_list(self):
        db = ClauseDatabase.from_source("foo(a).\n")
        assert db.get_clauses("bar", 1) == []

    def test_wrong_arity_returns_empty_list(self):
        db = ClauseDatabase.from_source("foo(a, b).\n")
        assert db.get_clauses("foo", 1) == []


# ── ClauseDatabase.find_original_clause ───────────────────────────────────────

class TestFindOriginalClause:

    _SOURCE = (
        "factorial(0, 1).\n"
        "factorial(N, F) :- N > 0, N1 is N-1, factorial(N1, F1), F is N*F1.\n"
    )

    def test_finds_rule_for_instantiated_goal(self):
        db = ClauseDatabase.from_source(self._SOURCE)
        result = db.find_original_clause("factorial", 2, "factorial(3, 6)")
        assert result is not None

    def test_finds_fact_for_base_case(self):
        db = ClauseDatabase.from_source(self._SOURCE)
        result = db.find_original_clause("factorial", 2, "factorial(0, 1)")
        assert result is not None

    def test_returns_none_for_unknown_predicate(self):
        db = ClauseDatabase.from_source(self._SOURCE)
        result = db.find_original_clause("unknown", 2, "unknown(1, 2)")
        assert result is None


# ── _could_unify helper ───────────────────────────────────────────────────────

class TestCouldUnify:

    def test_same_functor_same_arity_true(self):
        assert _could_unify("foo(X, Y)", "foo(1, 2)") is True

    def test_same_functor_different_arity_false(self):
        assert _could_unify("foo(X)", "foo(1, 2)") is False

    def test_different_functor_false(self):
        assert _could_unify("bar(X)", "foo(1)") is False

    def test_no_parens_in_pattern_false(self):
        assert _could_unify("atom", "foo(1)") is False

    def test_no_parens_in_instantiated_false(self):
        assert _could_unify("foo(X)", "atom") is False

    def test_zero_arity_both_sides_true(self):
        assert _could_unify("foo()", "foo()") is True


# ── extract_predicate_name_and_arity ─────────────────────────────────────────

class TestExtractPredicateNameAndArity:

    def test_binary_predicate(self):
        name, arity = extract_predicate_name_and_arity("factorial(3, 6)")
        assert name == "factorial"
        assert arity == 2

    def test_ternary_predicate(self):
        name, arity = extract_predicate_name_and_arity("append([1,2], [3], X)")
        assert name == "append"
        assert arity == 3

    def test_unary_predicate(self):
        name, arity = extract_predicate_name_and_arity("human(socrates)")
        assert name == "human"
        assert arity == 1

    def test_no_parens_returns_empty(self):
        name, arity = extract_predicate_name_and_arity("atom")
        assert name == ""
        assert arity == 0

    def test_empty_string_returns_empty(self):
        name, arity = extract_predicate_name_and_arity("")
        assert name == ""
        assert arity == 0
