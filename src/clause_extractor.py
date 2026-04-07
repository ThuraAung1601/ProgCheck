"""Extract and normalize clauses from Prolog source code.

This module parses Prolog source and extracts clause definitions,
enabling the debugger to query oracle with original clause patterns
instead of instantiated proof tree nodes.

Examples:
    >>> source = '''
    ... factorial(0, 1).
    ... factorial(N, F) :- N > 1, N1 is N - 1, factorial(N1, F1), F is N * F1.
    ... '''
    >>> db = ClauseDatabase.from_source(source)
    >>> original = db.find_original_clause("factorial", 2, "factorial(3, 6)")
    >>> print(original)
    factorial(N, F) :- N > 1, N1 is N - 1, factorial(N1, F1), F is N * F1
"""

import re
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass


@dataclass
class Clause:
    """Represents a single Prolog clause."""
    head: str           # e.g., "factorial(N, F)"
    body: str           # e.g., "N > 1, N1 is N - 1, ..." or "true" for facts
    is_fact: bool       # True if body is "true" or missing
    original_text: str  # Full clause as it appears in source

    def __str__(self) -> str:
        """Return clause in Prolog syntax."""
        if self.is_fact:
            return f"{self.head}."
        else:
            return f"{self.head} :- {self.body}."

    def signature(self) -> Tuple[str, int]:
        """Return (predicate_name, arity) tuple."""
        match = re.match(r"(\w+)\s*\(", self.head)
        if not match:
            return ("", 0)

        name = match.group(1)
        # Count commas + 1 to get arity (or 0 if no args)
        args = self.head[match.end():-1]  # Extract args between parens
        arity = len(args.split(",")) if args.strip() else 0
        return (name, arity)


class ClauseDatabase:
    """Database of clauses extracted from Prolog source."""

    def __init__(self):
        self.clauses: List[Clause] = []
        self.index: Dict[Tuple[str, int], List[Clause]] = {}  # (name, arity) -> [Clause]

    @staticmethod
    def from_source(prolog_source: str) -> "ClauseDatabase":
        """Extract clauses from Prolog source code.

        Handles:
        - Simple facts: foo(1).
        - Rules: bar(X, Y) :- foo(X), baz(Y).
        - Comments (% and /* */)
        - Multiline clauses

        Parameters
        ----------
        prolog_source : str
            Full Prolog source code

        Returns
        -------
        ClauseDatabase
            Populated clause database
        """
        db = ClauseDatabase()

        # Remove comments
        source = ClauseDatabase._remove_comments(prolog_source)

        # Split into individual clauses (terminated by .)
        clause_texts = ClauseDatabase._split_clauses(source)

        for clause_text in clause_texts:
            clause = ClauseDatabase._parse_clause(clause_text)
            if clause:
                db.add_clause(clause)

        return db

    def add_clause(self, clause: Clause) -> None:
        """Add a clause to the database and index it."""
        self.clauses.append(clause)
        sig = clause.signature()
        if sig not in self.index:
            self.index[sig] = []
        self.index[sig].append(clause)

    def get_clauses(self, predicate_name: str, arity: int) -> List[Clause]:
        """Get all clauses for a predicate."""
        return self.index.get((predicate_name, arity), [])

    def find_original_clause(
        self,
        predicate_name: str,
        arity: int,
        instantiated_goal: str
    ) -> Optional[Clause]:
        """Find the original clause that matches an instantiated proof tree node.

        Parameters
        ----------
        predicate_name : str
            Name of the predicate (e.g., "factorial")
        arity : int
            Arity of the predicate (e.g., 2)
        instantiated_goal : str
            Instantiated goal from proof tree (e.g., "factorial(3, 6)")

        Returns
        -------
        Optional[Clause]
            The matching original clause, or None if not found

        Logic
        -----
        For a given instantiated goal like factorial(3,6), try to match it
        against clauses. We return the first clause that could have produced
        this instantiation by unification.

        Example:
            - Instantiated: factorial(2, 2) :- 2>1, 1 is 2-1, ...
            - Original:     factorial(N, F) :- N>1, N1 is N-1, ...
            - Match: YES (structure is identical when N=2, F=2)
        """
        clauses = self.get_clauses(predicate_name, arity)

        if not clauses:
            return None

        # For now, return the first matching clause
        # (In most cases, there's only one clause per signature anyway)
        # A more sophisticated match could check structure compatibility
        for clause in clauses:
            if clause.is_fact:
                # Facts match if the pattern fits
                if _could_unify(clause.head, instantiated_goal):
                    return clause
            else:
                # Rules: simple heuristic - return if head has same functor/arity
                return clause

        # Fallback: return first clause
        return clauses[0] if clauses else None

    @staticmethod
    def _remove_comments(source: str) -> str:
        """Remove % comments and /* */ block comments from Prolog source."""
        # Remove /* */ block comments
        source = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
        # Remove % line comments
        source = re.sub(r"%.*$", "", source, flags=re.MULTILINE)
        return source

    @staticmethod
    def _split_clauses(source: str) -> List[str]:
        """Split source into individual clause texts (terminated by .)."""
        clauses = []
        current = []
        paren_depth = 0

        for char in source:
            if char == "(":
                paren_depth += 1
            elif char == ")":
                paren_depth -= 1
            elif char == "." and paren_depth == 0:
                # End of clause
                current.append(char)
                clause_text = "".join(current).strip()
                if clause_text:
                    clauses.append(clause_text)
                current = []
                continue

            current.append(char)

        return clauses

    @staticmethod
    def _parse_clause(clause_text: str) -> Optional[Clause]:
        """Parse a single clause text into a Clause object.

        Handles:
        - Facts: foo(a).
        - Rules: bar(X) :- foo(X).
        """
        clause_text = clause_text.strip()
        if not clause_text or clause_text.startswith("%"):
            return None

        # Remove trailing period
        if clause_text.endswith("."):
            clause_text = clause_text[:-1].strip()

        # Split into head and body
        if ":-" in clause_text:
            # Rule
            parts = clause_text.split(":-", 1)
            head = parts[0].strip()
            body = parts[1].strip()
            is_fact = False
        else:
            # Fact
            head = clause_text.strip()
            body = "true"
            is_fact = True

        if not head:
            return None

        return Clause(
            head=head,
            body=body,
            is_fact=is_fact,
            original_text=clause_text
        )


def _could_unify(pattern: str, instantiated: str) -> bool:
    """Check if a pattern could unify with an instantiated term.

    Simple heuristic: both should have the same functor and arity.

    Examples:
        - pattern="foo(X, Y)", instantiated="foo(1, 2)" → True
        - pattern="foo(X)", instantiated="foo(1, 2)" → False
    """
    # Extract functor and arity from both
    pat_match = re.match(r"(\w+)\s*\((.*)\)", pattern)
    inst_match = re.match(r"(\w+)\s*\((.*)\)", instantiated)

    if not pat_match or not inst_match:
        return False

    pat_name, pat_args_str = pat_match.groups()
    inst_name, inst_args_str = inst_match.groups()

    if pat_name != inst_name:
        return False

    # Count arguments
    pat_arity = len(pat_args_str.split(",")) if pat_args_str.strip() else 0
    inst_arity = len(inst_args_str.split(",")) if inst_args_str.strip() else 0

    return pat_arity == inst_arity


def extract_predicate_name_and_arity(goal: str) -> Tuple[str, int]:
    """Extract predicate name and arity from a goal string.

    Examples:
        - "factorial(3, 6)" → ("factorial", 2)
        - "append([1,2], [3], X)" → ("append", 3)
    """
    match = re.match(r"(\w+)\s*\((.*)\)", goal)
    if not match:
        return ("", 0)

    name = match.group(1)
    args_str = match.group(2)
    if not args_str.strip():
        return (name, 0)

    # Count top-level commas only (ignore commas inside [], (), {})
    depth = 0
    arity = 1
    for ch in args_str:
        if ch in "([{":
            depth += 1
        elif ch in ")]}":
            depth -= 1
        elif ch == "," and depth == 0:
            arity += 1

    return (name, arity)