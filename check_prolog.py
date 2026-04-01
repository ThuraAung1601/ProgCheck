#!/usr/bin/env python3
"""CLI entry-point for ProgCheck.

Keeps the original command-line interface stable while the implementation
lives in src/checker/prolog_checker.py.

Usage:
    python check_prolog.py --problem examples/factorial_problem.txt \
                           --student_code student_codes/factorial_correct.pl \
                           --output result.txt
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure src/ is importable
ROOT = Path(__file__).resolve().parent
SRC  = ROOT / "src"
for p in [str(ROOT), str(SRC)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from src.checker.prolog_checker import PrologChecker, parse_args


def main() -> None:
    args = parse_args()
    checker = PrologChecker(
        problem_file=args.problem,
        student_file=args.student_code,
        use_llm=True,
        test_cases_file=args.test_cases,
        auto_fix=args.auto_fix,
        max_fix_attempts=args.max_fix_attempts,
        fix_output_path=args.fix_output,
    )
    output_text = checker.run()
    if args.output:
        Path(args.output).write_text(output_text)
    print(output_text)


if __name__ == "__main__":
    main()
