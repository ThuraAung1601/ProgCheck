#!/usr/bin/env python3
"""Compatibility entrypoint for Prolog checker.

This thin wrapper keeps existing imports and CLI usage stable while the
implementation lives under src/checker/prolog_checker.py.
"""

from src.checker.prolog_checker import PrologChecker, Prolog, parse_args
from pathlib import Path


def main() -> None:
    args = parse_args()
    checker = PrologChecker(
        args.problem,
        args.student_code,
        True,
        args.test_cases,
        auto_fix=args.auto_fix,
        max_fix_attempts=args.max_fix_attempts,
        fix_output_path=args.fix_output,
    )
    output_text = checker.run()
    Path(args.output).write_text(output_text)
    print(output_text)


if __name__ == "__main__":
    main()
