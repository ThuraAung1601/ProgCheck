#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
mkdir -p outputs

# Use the conda env that has groq installed
# PYTHON_BIN="conda run -n team_proj python"

# ---------------------------------------------------------------------------
# Factorial problems — all cases with algorithmic debugging (LLM oracle)
# ---------------------------------------------------------------------------
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_correct.pl            --output outputs/factorial_correct.txt            --algo_debug
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_no_base.pl             --output outputs/factorial_no_base.txt             --algo_debug --auto_fix --max_fix_attempts 2 --fix_output outputs/factorial_no_base_fixed.pl
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_wrong_base.pl          --output outputs/factorial_wrong_base.txt          --algo_debug --auto_fix --max_fix_attempts 2 --fix_output outputs/factorial_wrong_base_fixed.pl
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_swapped_args.pl        --output outputs/factorial_swapped_args.txt        --algo_debug --auto_fix --max_fix_attempts 2 --fix_output outputs/factorial_swapped_args_fixed.pl
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_arity_mismatch.pl      --output outputs/factorial_arity_mismatch.txt      --algo_debug
python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/factorial_over_general_base.pl   --output outputs/factorial_over_general_base.txt   --algo_debug

# Syntax error cases (no algo_debug — no proof tree is generated on syntax failure)
# python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/syntax_invalid_operator.pl      --output outputs/syntax_invalid_operator.txt
# python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/syntax_lowercase_var.pl          --output outputs/syntax_lowercase_var.txt
# python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/syntax_missing_period.pl         --output outputs/syntax_missing_period.txt
# python check_prolog.py --problem examples/factorial_problem.txt --student_code student_codes/syntax_unmatched_parens.pl       --output outputs/syntax_unmatched_parens.txt

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

# python check_prolog.py --problem examples/cut_max_problem.txt --student_code student_codes/cut_correct.pl --output outputs/cut_correct.txt --cut_debug
# python check_prolog.py --problem examples/cut_max_problem.txt --student_code student_codes/cut_missing_cut.pl --output outputs/cut_missing_cut.txt --auto_fix --max_fix_attempts 2 --fix_output outputs/cut_missing_cut_fixed.pl --cut_debug
# Ambiguity test (operator precedence): enable hinting to see LLM suggestion
# ENABLE_LLM_AMBIGUITY_HINTS=true python check_prolog.py --problem examples/ambiguous_op_problem.txt --student_code student_codes/ambiguous_op.pl --output outputs/ambiguous_op.txt
python check_prolog.py --problem examples/cut_max_problem.txt --student_code student_codes/cut_wrong_position.pl --output outputs/cut_wrong_position.txt --auto_fix --max_fix_attempts 2 --fix_output outputs/cut_wrong_position_fixed.pl --cut_debug
python check_prolog.py --problem examples/cut_max_problem.txt --student_code student_codes/cut_no_fallback.pl --output outputs/cut_no_fallback.txt --auto_fix --max_fix_attempts 2 --fix_output outputs/cut_no_fallback_fixed.pl --cut_debug
# python check_prolog.py --problem examples/cut_max_problem.txt --student_code student_codes/cut_swapped_result.pl --output outputs/cut_swapped_result.txt --auto_fix --max_fix_attempts 2 --fix_output outputs/cut_swapped_result_fixed.pl --cut_debug
# python check_prolog.py --problem examples/cut_max_problem.txt --student_code student_codes/cut_over_cut.pl --output outputs/cut_over_cut.txt --auto_fix --max_fix_attempts 2 --fix_output outputs/cut_over_cut_fixed.pl --cut_debug
python check_prolog.py --problem examples/meal_cut_problem.txt --student_code student_codes/meal_cut_correct.pl --test_cases test_files/meal_cut_test.pl --output outputs/meal_cut_correct.txt --cut_debug
