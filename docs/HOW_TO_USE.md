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

## Troubleshooting

- If no tests are present, add a test file or include examples in the problem text.
- If you see timeouts, the student code likely has non-terminating recursion.
