#!/usr/bin/env bash
# run_all_bugs.sh — Run every buggy student code through the debugger
# Usage: bash run_all_bugs.sh [--no_algo_debug] [--no_auto_fix]
#   --no_algo_debug  disable Shapiro algorithmic debugging (default: on)
#   --no_auto_fix    disable LLM auto-correction (default: on)

set -uo pipefail
cd "$(dirname "$0")"
mkdir -p outputs

# ── flags ──────────────────────────────────────────────────────────────────
ALGO_DEBUG="--algo_debug"
AUTO_FIX="--auto_fix --max_fix_attempts 2"
for arg in "$@"; do
  case $arg in
    --no_algo_debug) ALGO_DEBUG="" ;;
    --no_auto_fix)   AUTO_FIX="" ;;
    --auto_fix)      AUTO_FIX="--auto_fix --max_fix_attempts 2" ;;
  esac
done

# ── helpers ─────────────────────────────────────────────────────────────────
PASS=0; FAIL=0; ERRORS=()

run_case() {
  local label="$1"; shift
  printf "  %-45s" "$label"
  if python check_prolog.py "$@" >/dev/null 2>&1; then
    echo "OK"
    ((PASS++)) || true
  else
    echo "FAILED (exit $?)"
    ERRORS+=("$label")
    ((FAIL++)) || true
  fi
}

section() { echo; echo "══════════════════════════════════════════════════"; echo "  $1"; echo "══════════════════════════════════════════════════"; }

# # ── FACTORIAL ───────────────────────────────────────────────────────────────
# section "FACTORIAL"
# run_case "factorial_correct"           --problem examples/factorial_problem.txt --student_code student_codes/factorial_correct.pl           --output outputs/factorial_correct.txt           $ALGO_DEBUG
# run_case "factorial_no_base"           --problem examples/factorial_problem.txt --student_code student_codes/factorial_no_base.pl            --output outputs/factorial_no_base.txt            $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/factorial_no_base_fixed.pl}
# run_case "factorial_wrong_base"        --problem examples/factorial_problem.txt --student_code student_codes/factorial_wrong_base.pl         --output outputs/factorial_wrong_base.txt         $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/factorial_wrong_base_fixed.pl}
# run_case "factorial_swapped_args"      --problem examples/factorial_problem.txt --student_code student_codes/factorial_swapped_args.pl       --output outputs/factorial_swapped_args.txt       $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/factorial_swapped_args_fixed.pl}
# run_case "factorial_over_general_base" --problem examples/factorial_problem.txt --student_code student_codes/factorial_over_general_base.pl  --output outputs/factorial_over_general_base.txt  $ALGO_DEBUG
# run_case "factorial_arity_mismatch"    --problem examples/factorial_problem.txt --student_code student_codes/factorial_arity_mismatch.pl     --output outputs/factorial_arity_mismatch.txt     $ALGO_DEBUG

# # ── MEMBER ──────────────────────────────────────────────────────────────────
# section "MEMBER (list membership)"
# run_case "member_correct"            --problem examples/list_member_problem.txt --student_code student_codes/member_correct.pl           --output outputs/member_correct.txt           $ALGO_DEBUG
# run_case "member_wrong_base"         --problem examples/list_member_problem.txt --student_code student_codes/member_wrong_base.pl        --output outputs/member_wrong_base.txt        $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/member_wrong_base_fixed.pl}
# run_case "member_swapped_args"       --problem examples/list_member_problem.txt --student_code student_codes/member_swapped_args.pl     --output outputs/member_swapped_args.txt      $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/member_swapped_args_fixed.pl}
# run_case "member_over_general_base"  --problem examples/list_member_problem.txt --student_code student_codes/member_over_general_base.pl --output outputs/member_over_general_base.txt $ALGO_DEBUG
# run_case "member_unbound_var"        --problem examples/list_member_problem.txt --student_code student_codes/member_unbound_var.pl      --output outputs/member_unbound_var.txt       $ALGO_DEBUG
# run_case "member_arity_mismatch"     --problem examples/list_member_problem.txt --student_code student_codes/member_arity_mismatch.pl   --output outputs/member_arity_mismatch.txt    $ALGO_DEBUG

# # ── APPEND ──────────────────────────────────────────────────────────────────
# section "APPEND (list concatenation)"
# run_case "append_correct"            --problem examples/list_append_problem.txt --student_code student_codes/append_correct.pl           --output outputs/append_correct.txt           $ALGO_DEBUG
# run_case "append_wrong_base"         --problem examples/list_append_problem.txt --student_code student_codes/append_wrong_base.pl        --output outputs/append_wrong_base.txt        $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/append_wrong_base_fixed.pl}
# run_case "append_swapped_args"       --problem examples/list_append_problem.txt --student_code student_codes/append_swapped_args.pl     --output outputs/append_swapped_args.txt      $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/append_swapped_args_fixed.pl}
# run_case "append_missing_clause"     --problem examples/list_append_problem.txt --student_code student_codes/append_missing_clause.pl   --output outputs/append_missing_clause.txt    $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/append_missing_clause_fixed.pl}
# run_case "append_over_general_base"  --problem examples/list_append_problem.txt --student_code student_codes/append_over_general_base.pl --output outputs/append_over_general_base.txt $ALGO_DEBUG
# run_case "append_arity_mismatch"     --problem examples/list_append_problem.txt --student_code student_codes/append_arity_mismatch.pl   --output outputs/append_arity_mismatch.txt    $ALGO_DEBUG

# # ── FAMILY ──────────────────────────────────────────────────────────────────
# section "FAMILY RELATIONS"
# run_case "family_correct"            --problem examples/family_relations_problem.txt --student_code student_codes/family_correct.pl           --output outputs/family_correct.txt           $ALGO_DEBUG
# run_case "family_reversed_logic"     --problem examples/family_relations_problem.txt --student_code student_codes/family_reversed_logic.pl    --output outputs/family_reversed_logic.txt    $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/family_reversed_logic_fixed.pl}
# run_case "family_wrong_base"         --problem examples/family_relations_problem.txt --student_code student_codes/family_wrong_base.pl        --output outputs/family_wrong_base.txt        $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/family_wrong_base_fixed.pl}
# run_case "family_swapped_args"       --problem examples/family_relations_problem.txt --student_code student_codes/family_swapped_args.pl     --output outputs/family_swapped_args.txt      $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/family_swapped_args_fixed.pl}
# run_case "family_over_general_base"  --problem examples/family_relations_problem.txt --student_code student_codes/family_over_general_base.pl --output outputs/family_over_general_base.txt $ALGO_DEBUG
# run_case "family_arity_mismatch"     --problem examples/family_relations_problem.txt --student_code student_codes/family_arity_mismatch.pl   --output outputs/family_arity_mismatch.txt    $ALGO_DEBUG

# # ── REVERSE ─────────────────────────────────────────────────────────────────
# section "REVERSE (list reversal)"
# run_case "reverse_no_base"          --problem examples/simple_reverse_problem.txt --student_code student_codes/reverse_no_base.pl          --output outputs/reverse_no_base.txt         $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/reverse_no_base_fixed.pl}
# run_case "reverse_wrong_recursion"  --problem examples/simple_reverse_problem.txt --student_code student_codes/reverse_wrong_recursion.pl  --output outputs/reverse_wrong_recursion.txt  $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/reverse_wrong_recursion_fixed.pl}
# run_case "reverse_missing_append"   --problem examples/simple_reverse_problem.txt --student_code student_codes/reverse_missing_append.pl   --output outputs/reverse_missing_append.txt   $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/reverse_missing_append_fixed.pl}

# # ── SUM ─────────────────────────────────────────────────────────────────────
# section "ARITHMETIC SUM"
# run_case "sum_correct"             --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_correct.pl            --output outputs/sum_correct.txt            $ALGO_DEBUG
# run_case "sum_no_base"             --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_no_base.pl             --output outputs/sum_no_base.txt             $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/sum_no_base_fixed.pl}
# run_case "sum_wrong_base"          --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_wrong_base.pl          --output outputs/sum_wrong_base.txt          $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/sum_wrong_base_fixed.pl}
# run_case "sum_swapped_args"        --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_swapped_args.pl        --output outputs/sum_swapped_args.txt        $ALGO_DEBUG $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/sum_swapped_args_fixed.pl}
# run_case "sum_over_general_base"   --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_over_general_base.pl   --output outputs/sum_over_general_base.txt   $ALGO_DEBUG
# run_case "sum_arity_mismatch"      --problem examples/arithmetic_sum_problem.txt --student_code student_codes/sum_arity_mismatch.pl      --output outputs/sum_arity_mismatch.txt      $ALGO_DEBUG
# run_case "arithmetic_missing_base" --problem examples/arithmetic_sum_problem.txt --student_code student_codes/arithmetic_missing_base_case.pl --output outputs/arithmetic_missing_base_case.txt $ALGO_DEBUG

# ── CUT / MAX ───────────────────────────────────────────────────────────────
section "CUT / MAX"
run_case "cut_correct"        --problem examples/cut_max_problem.txt --student_code student_codes/cut_correct.pl        --test_cases test_files/cut_max_test.pl --output outputs/cut_correct.txt        --cut_debug $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/cut_missing_correct.pl}
run_case "cut_missing_cut"    --problem examples/cut_max_problem.txt --student_code student_codes/cut_missing_cut.pl    --test_cases test_files/cut_max_test.pl --output outputs/cut_missing_cut.txt     --cut_debug $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/cut_missing_cut_fixed.pl}
run_case "cut_wrong_position" --problem examples/cut_max_problem.txt --student_code student_codes/cut_wrong_position.pl --test_cases test_files/cut_max_test.pl --output outputs/cut_wrong_position.txt  --cut_debug $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/cut_wrong_position_fixed.pl}
run_case "cut_over_cut"       --problem examples/cut_max_problem.txt --student_code student_codes/cut_over_cut.pl       --test_cases test_files/cut_max_test.pl --output outputs/cut_over_cut.txt        --cut_debug $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/cut_over_cut_fixed.pl}
run_case "cut_swapped_result" --problem examples/cut_max_problem.txt --student_code student_codes/cut_swapped_result.pl --test_cases test_files/cut_max_test.pl --output outputs/cut_swapped_result.txt  --cut_debug $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/cut_swapped_result_fixed.pl}
run_case "cut_no_fallback"    --problem examples/cut_max_problem.txt --student_code student_codes/cut_no_fallback.pl    --test_cases test_files/cut_max_test.pl --output outputs/cut_no_fallback.txt     --cut_debug $AUTO_FIX ${AUTO_FIX:+--fix_output outputs/cut_no_fallback_fixed.pl}

# # ── MEAL CUT ────────────────────────────────────────────────────────────────
# section "MEAL CUT"
# run_case "meal_cut_correct" --problem examples/meal_cut_problem.txt --student_code student_codes/meal_cut_correct.pl --test_cases test_files/meal_cut_test.pl --output outputs/meal_cut_correct.txt --cut_debug

# # ── SYNTAX ERRORS ───────────────────────────────────────────────────────────
# section "SYNTAX ERRORS (no algo_debug)"
# run_case "syntax_invalid_operator"  --problem examples/factorial_problem.txt --student_code student_codes/syntax_invalid_operator.pl  --output outputs/syntax_invalid_operator.txt
# run_case "syntax_lowercase_var"     --problem examples/factorial_problem.txt --student_code student_codes/syntax_lowercase_var.pl     --output outputs/syntax_lowercase_var.txt
# run_case "syntax_missing_period"    --problem examples/factorial_problem.txt --student_code student_codes/syntax_missing_period.pl    --output outputs/syntax_missing_period.txt
# run_case "syntax_unmatched_parens"  --problem examples/factorial_problem.txt --student_code student_codes/syntax_unmatched_parens.pl  --output outputs/syntax_unmatched_parens.txt

# ── SUMMARY ─────────────────────────────────────────────────────────────────
TOTAL=$((PASS + FAIL))
echo
echo "══════════════════════════════════════════════════"
echo "  SUMMARY: $PASS / $TOTAL cases exited cleanly"
echo "══════════════════════════════════════════════════"
if [[ ${#ERRORS[@]} -gt 0 ]]; then
  echo "  Non-zero exits:"
  for e in "${ERRORS[@]}"; do echo "    - $e"; done
fi
echo
echo "Output files written to: outputs/"
echo "Flags used: ALGO_DEBUG='$ALGO_DEBUG'  AUTO_FIX='$AUTO_FIX'"
