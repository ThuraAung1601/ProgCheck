#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p outputs

python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_correct.pl --output outputs/factorial_correct.txt
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_no_base.pl --output outputs/factorial_no_base.txt
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_wrong_base.pl --output outputs/factorial_wrong_base.txt
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_swapped_args.pl --output outputs/factorial_swapped_args.txt
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_arity_mismatch.pl --output outputs/factorial_arity_mismatch.txt
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_over_general_base.pl --output outputs/factorial_over_general_base.txt

# python check_prolog.py --problem examples/list_append_problem.txt --student_code student_codes/append_correct.pl --test_cases test_files/append_test.pl --output outputs/append_correct.txt
# python check_prolog.py --problem examples/list_append_problem.txt --student_code student_codes/append_missing_clause.pl --test_cases test_files/append_test.pl --output outputs/append_missing_clause.txt
# python check_prolog.py --problem examples/list_append_problem.txt --student_code student_codes/append_wrong_base.pl --test_cases test_files/append_test.pl --output outputs/append_wrong_base.txt
# python check_prolog.py --problem examples/list_append_problem.txt --student_code student_codes/append_swapped_args.pl --test_cases test_files/append_test.pl --output outputs/append_swapped_args.txt
# python check_prolog.py --problem examples/list_append_problem.txt --student_code student_codes/append_arity_mismatch.pl --test_cases test_files/append_test.pl --output outputs/append_arity_mismatch.txt
# python check_prolog.py --problem examples/list_append_problem.txt --student_code student_codes/append_over_general_base.pl --test_cases test_files/append_test.pl --output outputs/append_over_general_base.txt

# python check_prolog.py --problem examples/list_member_problem.txt --student_code student_codes/member_correct.pl --output outputs/member_correct.txt
# python check_prolog.py --problem examples/list_member_problem.txt --student_code student_codes/member_unbound_var.pl --output outputs/member_unbound_var.txt
# python check_prolog.py --problem examples/list_member_problem.txt --student_code student_codes/member_wrong_base.pl --output outputs/member_wrong_base.txt
# python check_prolog.py --problem examples/list_member_problem.txt --student_code student_codes/member_swapped_args.pl --output outputs/member_swapped_args.txt
# python check_prolog.py --problem examples/list_member_problem.txt --student_code student_codes/member_arity_mismatch.pl --output outputs/member_arity_mismatch.txt
# python check_prolog.py --problem examples/list_member_problem.txt --student_code student_codes/member_over_general_base.pl --output outputs/member_over_general_base.txt

# python check_prolog.py --problem examples/family_relations_problem.txt --student_code student_codes/family_correct.pl --output outputs/family_correct.txt
# python check_prolog.py --problem examples/family_relations_problem.txt --student_code student_codes/family_reversed_logic.pl --output outputs/family_reversed_logic.txt
# python check_prolog.py --problem examples/family_relations_problem.txt --student_code student_codes/family_wrong_base.pl --output outputs/family_wrong_base.txt
# python check_prolog.py --problem examples/family_relations_problem.txt --student_code student_codes/family_swapped_args.pl --output outputs/family_swapped_args.txt
# python check_prolog.py --problem examples/family_relations_problem.txt --student_code student_codes/family_arity_mismatch.pl --output outputs/family_arity_mismatch.txt
# python check_prolog.py --problem examples/family_relations_problem.txt --student_code student_codes/family_over_general_base.pl --output outputs/family_over_general_base.txt

# python check_prolog.py --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_correct.pl --output outputs/sum_correct.txt
# python check_prolog.py --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_no_base.pl --output outputs/sum_no_base.txt
# python check_prolog.py --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_wrong_base.pl --output outputs/sum_wrong_base.txt
# python check_prolog.py --problem examples/arithmetic_sum_problem.txt --student_code student_codes/arithmetic_missing_base_case.pl --output outputs/arithmetic_missing_base_case.txt
# python check_prolog.py --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_swapped_args.pl --output outputs/sum_swapped_args.txt
# python check_prolog.py --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_arity_mismatch.pl --output outputs/sum_arity_mismatch.txt
# python check_prolog.py --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_over_general_base.pl --output outputs/sum_over_general_base.txt
