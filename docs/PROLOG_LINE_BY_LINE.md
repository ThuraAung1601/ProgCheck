# Line-by-Line Guide for Prolog Modules

This guide explains every definition and logical step in the Prolog modules:

- [src/prolog/meta_interpreter.pl](../src/prolog/meta_interpreter.pl)
- [src/prolog/diagnosis_engine.pl](../src/prolog/diagnosis_engine.pl)

The goal is clarity: each predicate and clause is described in the order it appears in the files.

---

## 1) meta_interpreter.pl

### Module header and exports

- `:- module(meta_interpreter, [...]).`
  - Declares the module name and exports public predicates. This is the API used by `check_prolog.py`.
  - Exported predicates:
    - `solve_with_trace/2`: proof-tree generator
    - `print_proof_tree/1`: pretty printer for proof trees
    - `detect_errors/2`: basic error collection
    - `validate_with_tests/3`: test-case evaluator
    - `compare_results/2`: multiset comparison
    - `builtin/1`: built-in predicate registry
    - `solve_with_depth/2`: depth-limited solver
    - `contains_goal/2`: subgoal membership test
    - `contains_recursive_call/2`: recursion detector

### Built-in predicates list

- `builtin(_ is _).` through `builtin(nl).`
  - Declares which goals are treated as built-ins (executed directly rather than resolved via clauses).
  - This list controls what is allowed to run as a base case in the meta-interpreter.

### Proof-tree generator

- `solve_with_trace(true, true) :- !.`
  - Base case: the goal `true` succeeds with a trivial proof tree. Cut prevents backtracking.

- `solve_with_trace((Goal1, Goal2), (Tree1, Tree2)) :- ...`
  - Conjunction handling: solve each subgoal and build a pair of proof trees.

- `solve_with_trace(Goal, builtin(Goal)) :- builtin(Goal), !, Goal.`
  - If the goal is a built-in, execute it directly and wrap the proof as `builtin(Goal)`.

- `solve_with_trace(Goal, proof(Goal, Body, SubTree)) :- clause(Goal, Body), solve_with_trace(Body, SubTree).`
  - Resolves a user-defined goal by selecting a clause, then solving its body.
  - The proof tree records the head, body, and subtree.

### Proof-tree pretty printing

- `print_proof_tree/1` and `print_tree/2` clauses
  - Render the proof tree using indentation.
  - `print_tree(true, ...)` prints `true`.
  - `print_tree(builtin(Goal), ...)` prints a gear icon and the built-in.
  - `print_tree((Tree1, Tree2), ...)` prints both conjunctive branches.
  - `print_tree(proof(Goal, Body, SubTree), ...)` prints a rule and then its subtree.
  - `print_indent/1` prints spaces recursively for visual nesting.

### Error detection (basic)

- `detect_errors(Goal, Errors) :- findall(Error, check_error(Goal, Error), Errors).`
  - Collects all errors for a given goal.

- `check_error(Goal, missing_base_case(Predicate)) :- ...`
  - Uses `has_base_case/1` to detect when a predicate lacks a non-recursive clause.

- `check_error(Goal, infinite_recursion(Predicate)) :- ...`
  - Uses `solve_with_depth/2` to detect non-termination within a depth limit.

### Base-case and recursion checks

- `has_base_case/1`
  - Builds a generic goal with the same functor and arity.
  - Succeeds if there is a clause whose body does not contain a recursive call.

- `contains_recursive_call/2`
  - Checks whether a predicate’s body contains a call to itself.

- `contains_goal/2`
  - True if a goal occurs in a body, handling conjunctions.

### Depth-limited evaluation

- `solve_with_depth(_, MaxDepth) :- MaxDepth =< 0, !, fail.`
  - Stops when depth is exhausted.

- `solve_with_depth(true, _) :- !.`
  - Base case for `true`.

- `solve_with_depth((G1, G2), MaxDepth) :- ...`
  - Solves conjunctions with depth decrement for the second goal.

- `solve_with_depth(Goal, _) :- builtin(Goal), !, Goal.`
  - Executes built-ins directly.

- `solve_with_depth(Goal, MaxDepth) :- ...`
  - Resolves a clause and recurses into the body with reduced depth.

### Test result comparison

- `compare_results/2`
  - Checks that two result lists contain the same elements, order-independent.
  - Uses `length/2` plus mutual membership to enforce multiset equality.

### Test-case validation

- `validate_with_tests/3`
  - Evaluates each test case against the program.
  - If a test matches the goal’s functor/arity, runs `safe_findall/2`.
  - Compares the actual results with expected results.
  - Collects `test_failure(...)` items when mismatches occur.

- `safe_findall/2`
  - Wraps `findall/3` to ensure time/depth limits are applied per goal.

- `safe_goal/1`
  - Executes a goal with both time and depth limits, failing safely on errors.

---

## 2) diagnosis_engine.pl

### Module header and imports

- `:- module(diagnosis_engine, [...]).`
  - Exports the public diagnosis API: `generate_diagnoses/2`, `enhanced_detect_errors/2`, `print_diagnoses/1`.

- `:- use_module('./meta_interpreter', [...]).`
  - Imports helpers for built-ins, recursion detection, and depth-limited solving.

### Evidence weights

- `evidence_weight/2` facts
  - Assign weights to evidence items. Every detected evidence item contributes to a diagnosis score.
  - All weights are currently set to 1 for simplicity.

### Error pattern definitions

- `error_pattern(Name, Detector, Message, Suggestion).`
  - Maps each pattern to its detection predicate and report text.
  - Patterns include missing base case, infinite recursion, wrong variable binding, missing clause, non-decreasing recursion, wrong base case, swapped arguments, arity mismatch, overly general base case, cut/negation misuse, and operator-precedence ambiguity.

### Missing base case

- `detect_missing_base_case/2`
  - Builds a generic goal and collects evidence via `evidence_for_missing_base/2`.
  - Succeeds only if at least one evidence item is found.

- `evidence_for_missing_base/2`
  - `missing_base_case_fact`: no non-recursive clause exists.
  - `non_terminating_execution`: depth-limited solving fails to terminate.

### Infinite recursion

- `detect_infinite_recursion/2`
  - Collects evidence via `evidence_for_infinite_recursion/2`.

- `evidence_for_infinite_recursion/2`
  - `non_terminating_execution`: depth-limited solving fails.
  - `recursive_call_without_progress`: recursive call does not reduce the input.

### Wrong variable binding

- `detect_wrong_variable/2`
  - Collects evidence via `evidence_for_wrong_variable/2`.

- `evidence_for_wrong_variable/2`
  - `unbound_variable_usage`: detects variables used in a built-in before being bound.

### Missing clause

- `detect_missing_clause/2`
  - Evidence-based wrapper for missing clause detection.

- `evidence_for_missing_clause/2`
  - `no_matching_clause`: no clause matches a specific goal.
  - `unexpected_failure`: predicate exists, but this specific goal does not match.

### Non-decreasing recursion

- `detect_non_decreasing_recursion/2`
  - Collects evidence from `evidence_for_non_decreasing/2`.

- `evidence_for_non_decreasing/2`
  - `recursive_call_without_progress`: recursion does not shrink the input.
  - `clause_never_succeeds`: the goal fails even with safe execution.

### Wrong base case

- `detect_wrong_base_case/2`
  - Checks that a base case exists but the ground goal still fails, indicating a wrong fact.

### Argument order swapped

- `detect_argument_order_swapped/2`
  - Swaps the first two arguments and checks if that swapped call succeeds.

### Arity mismatch

- `detect_arity_mismatch/2`
  - Ensures that no clause matches the goal but another predicate of the same name exists.

### Overly general base case

- `detect_overly_general_base_case/2`
  - Detects a fact with all-variables (fully generic), implying it matches everything.

### Cut/negation misuse

- `detect_cut_negation_misuse/2`
  - Aggregates evidence for possible misuse of `!` and `\+`.

- `evidence_for_cut_negation/2`
  - `negation_with_unbound_var`: the negated goal contains variables that are still unbound.
  - `unconditional_cut`: a cut is placed unconditionally in the body.

- `contains_negation/2`
  - Walks a body to find `\+ Goal`.

- `has_unconditional_cut/1`
  - Detects cut that is not guarded by a condition.

### Operator precedence ambiguity

- `detect_operator_precedence_ambiguity/2`
  - Flags bodies that mix conjunction with disjunction or if-then without explicit grouping.

- `evidence_for_operator_precedence/2`
  - `ambiguous_operator_precedence`: present when both conjunction and either disjunction or if-then appear.

- `contains_conjunction/1`, `contains_disjunction/1`, `contains_if_then/1`
  - Structural checks for `,`, `;`, and `->`/`*->` usage in bodies.

### Base-case utility

- `base_case_clause_exists/1`
  - Checks whether a predicate has any clause without a recursive call.

### Safe execution helper

- `safe_call/1`
  - Executes a goal with time and depth limits and fails safely on errors.

### Unbound variable usage heuristic

- `has_unbound_variable_usage/3`
  - Detects when a variable from the head appears in a built-in before being bound.

### Recursion analysis helpers

- `extract_recursive_call/3`
  - Extracts the recursive call for a predicate from a clause body.

- `is_decreasing_call/2`
  - Heuristic that checks if the first argument gets smaller (list tail or numeric decrement).

- `appears_in_term/2`
  - Checks whether a variable appears within a compound term or list.

### Diagnosis ranking

- `generate_diagnoses/2`
  - Collects all diagnoses with evidence and sorts by evidence score.

- `detect_with_evidence_score/6`
  - Runs a detector, then totals evidence weights.

- `calculate_evidence_score/2`
  - Sums weights for evidence items.

- `sort_by_evidence_score/2`, `map_score/2`, `extract_values/2`
  - Converts diagnoses into sortable pairs, sorts them, and restores the list.

### Report formatting

- `enhanced_detect_errors/2`
  - Returns a structured list of detailed errors (pattern, score, message, suggestion, evidence).

- `format_detailed_errors/2`
  - Builds the structured list recursively.

- `print_diagnoses/1`, `print_diagnosis/1`, `print_evidence_items/1`
  - Pretty-print diagnostics for console output.
