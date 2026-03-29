"""Algorithmic Debugging with LLM as Oracle.

Implements a variant of Shapiro's Algorithmic Debugging where the LLM
plays the role of the oracle — judging whether each proof tree node is
semantically correct according to the problem specification.

Shapiro's Algorithm (simplified):
  1. Build proof tree for a failing/incorrect goal.
  2. For each node (subgoal computation) in the tree:
       Ask oracle: "Is this step correct?"
  3. Find the faulty clause:
       - A node is BUGGY if oracle says it is WRONG.
       - The most specific BUGGY node (deepest in tree) is the
         likely faulty clause, because all its sub-computations
         (its children) were judged CORRECT by the oracle.

Usage:
    from algorithmic_debugger import AlgorithmicDebugger, parse_proof_tree_nodes

    nodes  = parse_proof_tree_nodes(proof_tree_text)
    debugger = AlgorithmicDebugger(problem_text, api_key, log_fn=print)
    results  = debugger.run(nodes)
    report   = debugger.format_report(results)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable, List, Optional, Union


# ---------------------------------------------------------------------------
# Proof-tree node
# ---------------------------------------------------------------------------

@dataclass
class ProofNode:
    """Incorrectness Debugger: a node from a proof tree of a SUCCEEDING goal."""
    goal:  str
    body:  str          # clause body; 'true' for facts
    depth: int
    is_fact: bool = False
    failing_goal: str = ""  # set when node came from clause-inspection fallback

    # Filled in after oracle query
    oracle_verdict: str = ""        # 'YES' | 'NO' | 'UNKNOWN'
    oracle_correct: Optional[bool] = None
    oracle_reason:  str = ""
    debug_mode: str = "incorrect"


@dataclass
class IncompleteNode:
    """Incompleteness Debugger: an existing clause for a FAILING goal."""
    goal:  str           # clause head
    body:  str           # clause body
    depth: int = 0
    is_fact: bool = False
    failing_goal: str = ""  # the specific test goal that produced no answer

    oracle_verdict: str = ""
    oracle_correct: Optional[bool] = None
    oracle_reason:  str = ""
    debug_mode: str = "incomplete"


@dataclass
class TerminationNode:
    """Termination Debugger: a clause whose recursive call does not decrease."""
    goal:    str     # clause head
    body:    str     # clause body
    rec_call: str    # the non-decreasing recursive call
    depth:   int = 0
    is_fact: bool = False
    failing_goal: str = ""

    oracle_verdict: str = ""
    oracle_correct: Optional[bool] = None
    oracle_reason:  str = ""
    debug_mode: str = "nonterminating"


# Union type for any Shapiro node
AnyNode = Union[ProofNode, IncompleteNode, TerminationNode]


# ---------------------------------------------------------------------------
# Proof-tree text parser (for incorrectness nodes)
# ---------------------------------------------------------------------------

def parse_proof_tree_nodes(proof_tree_text) -> List[ProofNode]:
    """Parse text from print_proof_tree/1 into ProofNode objects."""
    if not proof_tree_text:
        return []
    if isinstance(proof_tree_text, bytes):
        proof_tree_text = proof_tree_text.decode("utf-8", errors="replace")

    nodes: List[ProofNode] = []
    for raw_line in proof_tree_text.splitlines():
        stripped = raw_line.lstrip(" ")
        depth = (len(raw_line) - len(stripped)) // 2

        m_fact = re.match(r"Goal:\s+(.+?)\s+\(fact\)\s*$", stripped)
        if m_fact:
            nodes.append(ProofNode(
                goal=m_fact.group(1).strip(), body="true",
                depth=depth, is_fact=True,
            ))
            continue

        m_rule = re.match(r"Goal:\s+(.+?)\s+:-\s+(.+)", stripped)
        if m_rule:
            nodes.append(ProofNode(
                goal=m_rule.group(1).strip(), body=m_rule.group(2).strip(),
                depth=depth, is_fact=False,
            ))
    return nodes


# ---------------------------------------------------------------------------
# Algorithmic Debugger (all four Shapiro modes)
# ---------------------------------------------------------------------------

class AlgorithmicDebugger:
    """Shapiro's Algorithmic Debugger with LLM as oracle.

    Handles all four debugging modes:
      incorrect       - goal succeeds with wrong answer  (ProofNode list)
      incomplete      - goal fails when it should succeed (IncompleteNode list)
      nonterminating  - goal does not terminate           (TerminationNode list)
      ok              - no bug expected                   (empty list)

    Parameters
    ----------
    problem_text : str
        Full problem specification (used verbatim in oracle prompts).
    api_key : str
        Groq API key.
    log_fn : callable, optional
        Function accepting a single string; defaults to no-op.
    oracle_timeout : int
        Per-node LLM call timeout in seconds.
    """

    def __init__(
        self,
        problem_text: str,
        api_key: str,
        log_fn: Optional[Callable[[str], None]] = None,
        oracle_timeout: int = 20,
    ):
        self.problem_text   = problem_text
        self.api_key        = api_key
        self._log           = log_fn or (lambda _: None)
        self.oracle_timeout = oracle_timeout

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def run(self, nodes: List[AnyNode]) -> List[AnyNode]:
        """Query the LLM oracle for every Shapiro node.

        Routing by node type:
          ProofNode       -> incorrectness oracle  (ask_oracle_node)
          IncompleteNode  -> incompleteness oracle (ask_oracle_incomplete)
          TerminationNode -> termination oracle    (ask_oracle_termination)

        Applies Shapiro's algorithm inside each mode:
          - Bottom-up query order (deepest first).
          - The deepest WRONG node is the primary faulty clause.
        """
        if not nodes:
            self._log("[AlgoDebug] No nodes to analyse.")
            return []

        # Infer mode from node types
        modes = {n.debug_mode for n in nodes}
        mode_label = "/".join(sorted(modes))

        # De-duplicate by (goal, body)
        seen: dict[tuple[str, str], AnyNode] = {}
        unique: List[AnyNode] = []
        for node in nodes:
            key = (node.goal, node.body if isinstance(node, (ProofNode, IncompleteNode))
                   else node.body)
            if key not in seen:
                seen[key] = node
                unique.append(node)

        self._log(
            f"[AlgoDebug] Mode: {mode_label} | "
            f"{len(unique)} unique node(s) (of {len(nodes)} total)"
        )
        self._log("[AlgoDebug] " + "-" * 58)

        # Query deepest first for efficient short-circuit
        sorted_nodes = sorted(unique, key=lambda n: -n.depth)

        for node in sorted_nodes:
            if isinstance(node, TerminationNode):
                self._query_oracle_termination(node)
            elif isinstance(node, IncompleteNode):
                self._query_oracle_incomplete(node)
            else:  # ProofNode (incorrectness)
                self._query_oracle_incorrect(node)

        # Propagate verdicts back to duplicates
        for node in nodes:
            key = (node.goal, node.body if hasattr(node, 'body') else '')
            canonical = seen.get(key)
            if canonical:
                node.oracle_verdict = canonical.oracle_verdict
                node.oracle_correct = canonical.oracle_correct
                node.oracle_reason  = canonical.oracle_reason

        return nodes

    def find_faulty_clauses(self, results: List[AnyNode]) -> List[AnyNode]:
        """Return the primary faulty clause(s) using Shapiro's algorithm.

        The deepest WRONG node(s) are primary suspects because their
        children (if any) were all judged CORRECT by the oracle.
        """
        wrong = [n for n in results if n.oracle_correct is False]
        if not wrong:
            return []
        max_depth = max(n.depth for n in wrong)
        primary   = [n for n in wrong if n.depth == max_depth]
        seen: set = set()
        unique: List[AnyNode] = []
        for n in primary:
            k = (n.goal, n.body if hasattr(n, 'body') else '')
            if k not in seen:
                seen.add(k)
                unique.append(n)
        return unique

    def format_report(self, results: List[AnyNode]) -> str:
        """Format the complete oracle session as a human-readable report."""
        if not results:
            return "[AlgoDebug] No nodes were analysed."

        # Determine dominant mode
        modes = {n.debug_mode for n in results}
        if "nonterminating" in modes:
            mode_header = "TERMINATION"
        elif "incomplete" in modes:
            mode_header = "INCOMPLETENESS"
        else:
            mode_header = "INCORRECTNESS"

        lines: List[str] = []
        lines.append(f"ALGORITHMIC DEBUGGING ({mode_header} DEBUGGER) — LLM ORACLE SESSION")
        lines.append("=" * 62)
        lines.append("Oracle: LLM judging each node against the problem specification")
        lines.append(f"Method: Shapiro's Algorithmic Debugging (1982) — {mode_header} mode")
        lines.append("")

        correct = [n for n in results if n.oracle_correct is True]
        wrong   = [n for n in results if n.oracle_correct is False]
        unknown = [n for n in results if n.oracle_correct is None]

        def _node_line(n: AnyNode, label: str) -> str:
            depth_pad = "  " * getattr(n, 'depth', 0)
            body = getattr(n, 'body', getattr(n, 'rec_call', ''))
            body_tag = " (fact)" if getattr(n, 'is_fact', False) else f" :- {body}"
            extra = ""
            if isinstance(n, TerminationNode):
                extra = f"\n{depth_pad}       RecCall: {n.rec_call}"
            fail_tag = (f"  [failing goal: {n.failing_goal}]"
                        if getattr(n, 'failing_goal', '') else "")
            return (
                f"{depth_pad}[{label}] {n.goal}{body_tag}{fail_tag}{extra}\n"
                f"{depth_pad}       Reason: {n.oracle_reason}"
            )

        if correct:
            lines.append(f"CORRECT nodes ({len(correct)}):")
            for n in sorted(correct, key=lambda x: x.depth):
                lines.append(_node_line(n, "OK "))
            lines.append("")

        if wrong:
            lines.append(f"WRONG nodes ({len(wrong)}):")
            for n in sorted(wrong, key=lambda x: -x.depth):
                lines.append(_node_line(n, "BUG"))
            lines.append("")

        if unknown:
            lines.append(f"UNKNOWN nodes ({len(unknown)}) — oracle inconclusive:")
            for n in unknown:
                lines.append(_node_line(n, "?  "))
            lines.append("")

        faulty = self.find_faulty_clauses(results)
        lines.append("=" * 62)
        if faulty:
            lines.append(f"PRIMARY FAULT LOCALISATION ({mode_header} DEBUGGER — Shapiro):")
            lines.append(f"  Deepest WRONG node pinpoints the faulty clause.")
            lines.append("")
            for i, n in enumerate(faulty, 1):
                body = getattr(n, 'body', '')
                body_tag = " (fact)" if getattr(n, 'is_fact', False) else f" :- {body}"
                lines.append(f"  Faulty clause #{i}: {n.goal}{body_tag}")
                if isinstance(n, TerminationNode):
                    lines.append(f"  Non-progressing:   {n.rec_call}")
                lines.append(f"  Oracle reason    : {n.oracle_reason}")
                lines.append("")
        else:
            lines.append("No faulty clause identified by oracle.")
            if unknown:
                lines.append("(Some nodes inconclusive — check API key / connectivity.)")
        lines.append("=" * 62)
        return "\n".join(lines)

    # ------------------------------------------------------------------
    # Internal oracle dispatchers
    # ------------------------------------------------------------------

    def _query_oracle_incorrect(self, node: ProofNode) -> None:
        """Incorrectness Debugger: is this proof-tree step semantically correct?"""
        try:
            from llm_bridge import ask_oracle_node
        except ImportError as e:
            node.oracle_verdict = "UNKNOWN"
            node.oracle_correct = None
            node.oracle_reason  = f"llm_bridge import failed: {e}"
            return
        self._call_oracle(node, ask_oracle_node, [
            self.problem_text, node.goal, node.body, self.api_key,
            node.failing_goal or None,
        ])
        self._log_node(node, "INCORRECTNESS")

    def _query_oracle_incomplete(self, node: IncompleteNode) -> None:
        """Incompleteness Debugger: is this clause correct and complete?"""
        try:
            from llm_bridge import ask_oracle_incomplete
        except ImportError as e:
            node.oracle_verdict = "UNKNOWN"
            node.oracle_correct = None
            node.oracle_reason  = f"llm_bridge import failed: {e}"
            return
        self._call_oracle(node, ask_oracle_incomplete, [
            self.problem_text, node.goal, node.body, self.api_key,
            node.failing_goal or None,
        ])
        self._log_node(node, "INCOMPLETENESS")

    def _query_oracle_termination(self, node: TerminationNode) -> None:
        """Termination Debugger: does this non-progressing clause cause infinite recursion?"""
        try:
            from llm_bridge import ask_oracle_termination
        except ImportError as e:
            node.oracle_verdict = "UNKNOWN"
            node.oracle_correct = None
            node.oracle_reason  = f"llm_bridge import failed: {e}"
            return
        self._call_oracle(node, ask_oracle_termination, [
            self.problem_text, node.goal, node.body, node.rec_call, self.api_key,
        ])
        self._log_node(node, "TERMINATION")

    def _call_oracle(
        self,
        node: AnyNode,
        oracle_fn: Callable,
        oracle_args: list,
    ) -> None:
        """Run oracle_fn(*oracle_args) with timeout; populate node oracle fields."""
        import concurrent.futures
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
                future = ex.submit(oracle_fn, *oracle_args)
                result = future.result(timeout=self.oracle_timeout)
        except concurrent.futures.TimeoutError:
            result = {"correct": None, "verdict": "UNKNOWN", "reason": "Oracle timed out."}
        except Exception as e:
            result = {"correct": None, "verdict": "UNKNOWN", "reason": f"Oracle error: {e}"}

        node.oracle_verdict = result.get("verdict", "UNKNOWN")
        node.oracle_correct = result.get("correct")
        node.oracle_reason  = result.get("reason", "")

    def _log_node(self, node: AnyNode, mode: str) -> None:
        label = {"YES": "OK ", "NO": "BUG", "UNKNOWN": "?  "}.get(node.oracle_verdict, "?  ")
        depth_pad = "  " * getattr(node, 'depth', 0)
        body = getattr(node, 'body', '')
        body_tag = " (fact)" if getattr(node, 'is_fact', False) \
            else f" :- {body[:60]}{'…' if len(body) > 60 else ''}"
        extra = ""
        if isinstance(node, TerminationNode):
            extra = f"  [rec: {node.rec_call[:40]}]"
        fail_tag = (f"  [failing: {node.failing_goal}]"
                    if getattr(node, 'failing_goal', '') else "")
        self._log(f"[{mode[:3]}] {depth_pad}[{label}] {node.goal}{body_tag}{extra}{fail_tag}")
        if node.oracle_reason:
            self._log(f"       {depth_pad}{node.oracle_reason}")

    # ------------------------------------------------------------------
    # Legacy compatibility: _query_oracle kept for any external callers
    # ------------------------------------------------------------------

    def _query_oracle(self, node: ProofNode) -> None:
        """Compatibility shim — routes to _query_oracle_incorrect."""
        self._query_oracle_incorrect(node)
