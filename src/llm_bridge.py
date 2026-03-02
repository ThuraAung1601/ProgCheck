"""LLM bridge (translation only, Groq-only)."""

import os
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
- Only suggest adding parentheses where , ; -> *-> \+ may be ambiguous.
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
Diagnoses: {analysis.get('diagnoses', [])}

Rules:
1. If Diagnoses is non-empty, mention every diagnosis explicitly.
2. If Diagnoses is empty, say tests failed but no specific diagnosis was produced.
3. Do NOT guess a diagnosis.
4. If there are multiple diagnoses, list them as separate sentences.

Use simple language (3-5 sentences)."""
    
    
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
