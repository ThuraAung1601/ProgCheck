"""LLM bridge (translation only)."""

from groq import Groq

def extract_knowledge_base(problem_text, api_key):
    """Extract facts and background rules from the problem text."""
    client = Groq(api_key=api_key)
    
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
    
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1
    )
    
    result = response.choices[0].message.content.strip()
    
    if "```prolog" in result:
        result = result.split("```prolog")[1].split("```")[0].strip()
    elif "```" in result:
        result = result.split("```")[1].split("```")[0].strip()
    
    return result


def generate_test_cases(problem_text, student_code, api_key):
    """Generate Prolog test cases from the problem and student code."""
    client = Groq(api_key=api_key)
    
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
    
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1
    )
    
    result = response.choices[0].message.content.strip()
    
    if "```prolog" in result:
        result = result.split("```prolog")[1].split("```")[0].strip()
    elif "```" in result:
        result = result.split("```")[1].split("```")[0].strip()
    
    return result


def translate_to_natural_language(analysis, problem_text, student_code, api_key):
    """Translate analysis output into natural language feedback."""
    client = Groq(api_key=api_key)
    
    if analysis['status'] == 'syntax_error':
        prompt = f"""Translate this Prolog syntax error to simple English:

Error: {analysis['error']}

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
    
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3
    )
    
    return response.choices[0].message.content.strip()
