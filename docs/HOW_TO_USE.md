# How to Use

This guide is a short, practical reference. For a full explanation of the Prolog reasoning, see [docs/PROLOG_LINE_BY_LINE.md](docs/PROLOG_LINE_BY_LINE.md).

## Quick Start

```bash
pip install -r requirements.txt
# macOS: brew install swi-prolog
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_correct.pl --output outputs/factorial_correct.txt
```

## Common Commands

```bash
# Run a specific pair
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_no_base.pl --output outputs/factorial_no_base.txt

# Use a test file
python check_prolog.py --problem examples/list_append_problem.txt --student_code student_codes/append_correct.pl --test_cases test_files/append_test.pl --output outputs/append_correct.txt
```

## Input Files

- Problem: .txt under examples/
- Student code: .pl under student_codes/
- Optional tests: .pl under test_files/

## Output

- Writes a report to the file passed via --output
- Includes detected error patterns, evidence items, and proof trees for tests

### Understanding LLM Transparency in Output

The output file shows **complete LLM interactions** when the system uses AI for test generation or feedback translation:

**What you'll see:**
1. **📤 LLM INPUT sections** - Exact prompts sent to the LLM including:
   - Problem text with character count
   - Student code  
   - Analysis results (for feedback generation)

2. **📥 LLM OUTPUT sections** - Complete responses from the LLM:
   - Generated test cases
   - Natural language feedback

**Why this matters:**
- **Transparency**: See exactly what data is sent to external AI services
- **Debugging**: Understand why certain test cases or feedback were generated
- **Learning**: Observe how the system translates between natural language and Prolog
- **Privacy**: Verify what information leaves your system

**Example:**
```
Step 1: Test Case Preparation
Extracted from problem

📤 LLM INPUT (Test Case Generation):
Problem Text (456 chars):
----------------------------------------
Write a Prolog predicate factorial(N, F)...
----------------------------------------

Student Code (145 chars):
factorial(N, F) :- ...
----------------------------------------

⏳ Calling LLM API...

📥 LLM OUTPUT (Generated Test Cases):
test(factorial(0, 1), [factorial(0, 1)]).
test(factorial(5, 120), [factorial(5, 120)]).
```

Note: LLM sections only appear when the API is actually called (when GROQ_API_KEY is set and test cases can't be extracted from the problem text).

## Troubleshooting

- If no tests are present, add a test file or include examples in the problem text.
- If you see timeouts, the student code likely has non-terminating recursion.
