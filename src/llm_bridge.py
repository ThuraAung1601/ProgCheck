"""LLM bridge (translation only, Groq-only)."""

import os
import re
from groq import Groq


def _get_model(model_hint=None):
    return model_hint or os.getenv("LLM_MODEL") or "llama-3.3-70b-versatile"


def _chat_completion(prompt, temperature, api_key, model_hint=None):
    model = _get_model(model_hint)
    client = Groq(api_key=api_key)
    response = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
    )
    return response.choices[0].message.content.strip()


def generate_ambiguity_hint(code_snippet, api_key):
    """Ask the LLM to point out operator precedence ambiguities and suggest parentheses only."""
    prompt = f"""You are an assistant that only identifies potentially ambiguous operator precedence in Prolog clauses and suggests parenthesized rewrites.

Rules:
- Do NOT change predicate order or logic semantics.
- Only suggest adding parentheses where , ; -> *-> \\+ may be ambiguous.
- Output as bullet lines: "Span: <snippet> -> Suggest: <parenthesized version>". No prose, no markdown fences.
- If nothing is ambiguous, return "No ambiguity found.".

Code:
{code_snippet[:2000]}
"""
    return _chat_completion(prompt, temperature=0.2, api_key=api_key)

def extract_knowledge_base(problem_text, api_key):
    """Extract facts and background rules from the problem text."""
    prompt = f"""You are a TRANSLATOR (not a problem solver).

Extract ONLY the knowledge base (facts and background rules) from this problem.
DO NOT write solution predicates.
DO NOT solve the problem.
ONLY extract domain facts and rules mentioned in the problem.

Problem:
{problem_text}

Output ONLY valid Prolog facts and rules.
Use exact variable/predicate names from the problem.

Output: Pure Prolog code, no explanations, no markdown.
"""
    
    result = _chat_completion(prompt, temperature=0.1, api_key=api_key)
    
    if "```prolog" in result:
        result = result.split("```prolog")[1].split("```")[0].strip()
    elif "```" in result:
        result = result.split("```")[1].split("```")[0].strip()
    
    return result


def generate_test_cases(problem_text, student_code, api_key):
    """Generate Prolog test cases from the problem and student code."""
    prompt = f"""You are a test case generator for Prolog programs. Generate comprehensive test cases for ANY type of problem.

Problem:
{problem_text}

Student Code:
{student_code}

Your task:
1. Identify what predicates the problem asks to implement
2. Analyze the facts/data in the student code
3. Generate 8-12 test cases PER PREDICATE that cover:
    ✓ Valid inputs that SHOULD succeed
    ✓ Invalid inputs that SHOULD fail
    ✓ Edge cases (empty lists, zero, boundaries, etc.)
    ✓ Reversed/inverted logic tests (to catch argument order bugs)

Output format (pure Prolog):
test(PredicateName(Args), [ExpectedResult1, ExpectedResult2, ...]).

CRITICAL FORMAT RULES:
- If test SHOULD succeed: test(goal(X,Y), [goal(a,b), goal(c,d)])
- If test SHOULD fail: test(goal(X,Y), [])
- DO NOT use [true] or [false] - use actual goals or empty list!

GENERAL TEST GENERATION STRATEGY:

- Include base cases and at least one recursive step if the predicate is recursive.
- Include edge cases relevant to the input domains (empty, zero, boundary).
- Include inverse/reversed argument order cases when applicable.
- Include negative cases that should fail.
- Adapt to the problem domain described in the prompt.

Output ONLY Prolog test case facts, no explanations, no markdown.
"""
    
    result = _chat_completion(prompt, temperature=0.1, api_key=api_key)
    
    if "```prolog" in result:
        result = result.split("```prolog")[1].split("```")[0].strip()
    elif "```" in result:
        result = result.split("```")[1].split("```")[0].strip()
    
    return result


def translate_to_natural_language(analysis, problem_text, student_code, api_key):
    """Translate analysis output into natural language feedback."""
    if analysis['status'] == 'syntax_error':
        err = analysis.get('syntax_error') or {}
        err_type = err.get('type') or analysis.get('error')
        err_line = err.get('line')
        err_code = err.get('line_text')
        err_friendly = err.get('friendly_message')
        prompt = f"""Translate this Prolog syntax error to simple English:

    Error Type: {err_type}
    Line: {err_line}
    Code: {err_code}
    Friendly Message: {err_friendly}

    Explain what's wrong and how to fix it (2-3 sentences)."""
        
    elif analysis['status'] == 'correct':
        prompt = f"""Translate this Prolog proof tree to natural language.

Problem (for context):
{problem_text[:300]}

Proof Tree:
{analysis['proof_tree']}

Tested Query: {analysis.get('test_query', 'N/A')}

Explain step-by-step:
1. What the program proves (based on proof tree arrows →)
2. How each step works
3. Conclude: "Therefore, the program correctly implements..."

Use simple language (4-6 sentences). Follow the proof tree structure."""
        
    else:  # logic_error
        prompt = f"""Explain this Prolog logic error in natural language.

Problem (for context):
{problem_text[:300]}

Student Code:
{student_code[:500]}

Error: {analysis.get('error', 'Logic error detected')}
Shapiro Analysis: {analysis.get('shapiro_mode', 'unknown')} — {analysis.get('shapiro_nodes_text', '')}

Rules:
1. Summarise the Shapiro analysis mode (incorrect/incomplete/nonterminating) and what it means.
2. If no specific Shapiro data is available, say tests failed but no deeper diagnosis was produced.
3. Do NOT guess.
4. Use simple language (3-5 sentences)."""
    
    
    return _chat_completion(prompt, temperature=0.3, api_key=api_key)


def generate_correct_code(problem_text, student_code, llm_feedback, error_summary, api_key):
    """Generate corrected Prolog code based on LLM feedback and current code."""
    prompt = f"""You are a Prolog code corrector.

Problem (context):
{problem_text}

Student Code:
{student_code}

LLM Feedback:
{llm_feedback}

Error Summary:
{error_summary}

Rules:
1. Return ONLY corrected Prolog code.
2. Preserve predicate names and arity.
3. If multiple predicates exist, return the full corrected program.
4. Do NOT add explanations or markdown.
"""

    
    return _chat_completion(prompt, temperature=0.2, api_key=api_key)


def ask_oracle_node(problem_text, goal_str, body_str, api_key, failing_goal=None):
    """Algorithmic debugging oracle: ask the LLM if a proof tree node is semantically correct.

    Two modes:
    - Normal (failing_goal is None): a proof step in a SUCCEEDING execution is judged.
    - Clause inspection (failing_goal is set): the goal *failed*; judge whether the
      clause definition is correct AND complete enough to handle the failing goal.

    Returns a dict:
        {
            'correct': bool or None,
            'verdict': 'YES' | 'NO' | 'UNKNOWN',
            'reason': str
        }
    """
    fact_or_rule = "(fact — no body)" if body_str.strip() in ("true", "") else f":- {body_str}"

    if failing_goal:
        # Clause-inspection mode: goal FAILED — oracle checks if the clause is
        # correct and whether something is missing to handle the failing input.
        prompt = f"""You are an oracle for Prolog algorithmic debugging (Shapiro's method).

PROBLEM SPECIFICATION:
{problem_text}

A student's Prolog program has this clause defined:
  Clause: {goal_str} {fact_or_rule}

However, the following goal FAILED (produced no answer when it should have):
  Failing goal: {failing_goal}

Questions:
1. Is the clause above semantically CORRECT for the cases it handles?
2. Is the clause SUFFICIENT — i.e., does it cover the failing goal, or is
   a base case / additional clause missing?

If the clause is correct but a required base case or additional clause is MISSING,
answer NO and explain what is missing.

Reply in exactly this format (two lines, nothing else):
VERDICT: YES
REASON: <one sentence>

or

VERDICT: NO
REASON: <one sentence explaining what is wrong or missing>
"""
    else:
        # Normal mode: a proof step in a succeeding execution is judged.
        prompt = f"""You are an oracle for Prolog algorithmic debugging (Shapiro's method).

PROBLEM SPECIFICATION:
{problem_text}

A proof step in the student's program is:
  Goal  : {goal_str}
  Clause: {goal_str} {fact_or_rule}

Based ONLY on the problem specification above, is this computation step SEMANTICALLY CORRECT?

Reply in exactly this format (two lines, nothing else):
VERDICT: YES
REASON: <one sentence>

or

VERDICT: NO
REASON: <one sentence explaining what is wrong>
"""

    try:
        response = _chat_completion(prompt, temperature=0.1, api_key=api_key)
    except Exception as e:
        return {"correct": None, "verdict": "UNKNOWN", "reason": f"Oracle call failed: {e}"}

    verdict_match = re.search(r"VERDICT:\s*(YES|NO)", response, re.I)
    reason_match = re.search(r"REASON:\s*(.+)", response, re.I)

    verdict = verdict_match.group(1).upper() if verdict_match else "UNKNOWN"
    reason = reason_match.group(1).strip() if reason_match else response.strip()[:300]

    return {
        "correct": (verdict == "YES") if verdict != "UNKNOWN" else None,
        "verdict": verdict,
        "reason": reason,
    }


def _parse_oracle_response(response: str) -> dict:
    """Extract VERDICT / REASON from a standard oracle LLM response."""
    verdict_match = re.search(r"VERDICT:\s*(YES|NO)", response, re.I)
    reason_match  = re.search(r"REASON:\s*(.+)",      response, re.I)
    verdict = verdict_match.group(1).upper() if verdict_match else "UNKNOWN"
    reason  = reason_match.group(1).strip()  if reason_match  else response.strip()[:300]
    return {
        "correct": (verdict == "YES") if verdict != "UNKNOWN" else None,
        "verdict": verdict,
        "reason":  reason,
    }


def ask_oracle_incomplete(problem_text, clause_head, clause_body, api_key, failing_goal=None):
    """Incompleteness Debugger oracle.

    Judges whether an existing clause is correct AND whether it is sufficient
    to handle the failing goal.  Returns the standard oracle dict.
    """
    fact_or_rule = "(fact)" if str(clause_body).strip() in ("true", "") \
                  else f":- {clause_body}"
    failing_part = (
        f"\n\nThe following goal FAILED (produced no answer when it should have):\n"
        f"  Failing goal: {failing_goal}"
        if failing_goal else ""
    )

    prompt = f"""You are an oracle for Prolog algorithmic debugging (Shapiro's Incompleteness Debugger).

PROBLEM SPECIFICATION:
{problem_text}

The student's Prolog program has this clause:
  {clause_head} {fact_or_rule}{failing_part}

Questions:
1. Is the clause above SEMANTICALLY CORRECT for what it claims to do?
2. Is this clause SUFFICIENT, or is a base case / additional clause missing
   that would be needed to satisfy the problem specification?

If the clause is correct but something is MISSING that causes incompleteness,
reply NO and state clearly what is missing.

Reply in exactly this format (two lines only):
VERDICT: YES
REASON: <one sentence>

or

VERDICT: NO
REASON: <one sentence explaining what is wrong or missing>
"""
    try:
        response = _chat_completion(prompt, temperature=0.1, api_key=api_key)
    except Exception as e:
        return {"correct": None, "verdict": "UNKNOWN", "reason": f"Oracle call failed: {e}"}
    return _parse_oracle_response(response)


def ask_oracle_termination(problem_text, clause_head, clause_body, rec_call, api_key):
    """Termination Debugger oracle.

    Judges whether a specific recursive clause will cause infinite recursion
    (i.e. the recursive call does not make the argument smaller).
    Returns the standard oracle dict — YES means the clause IS correct
    (terminates), NO means it CAUSES infinite recursion.
    """
    prompt = f"""You are an oracle for Prolog algorithmic debugging (Shapiro's Termination Debugger).

PROBLEM SPECIFICATION:
{problem_text}

The student's Prolog program has this recursive clause:
  Head: {clause_head}
  Body: {clause_body}

A potentially non-terminating recursive call has been identified:
  Recursive call: {rec_call}

Question:
Does the recursive call above GUARANTEE termination?
A call is terminating if every recursive invocation uses a structurally or
numerically SMALLER argument (e.g., the tail of a list, N-1 for numbers).

If the recursive call does NOT decrease toward a base case, reply NO.

Reply in exactly this format (two lines only):
VERDICT: YES
REASON: <one sentence explaining why the recursion terminates>

or

VERDICT: NO
REASON: <one sentence explaining why the recursive call causes infinite recursion>
"""
    try:
        response = _chat_completion(prompt, temperature=0.1, api_key=api_key)
    except Exception as e:
        return {"correct": None, "verdict": "UNKNOWN", "reason": f"Oracle call failed: {e}"}
    return _parse_oracle_response(response)
