:- module(diagnosis_engine, [
    generate_diagnoses/2,
    enhanced_detect_errors/2,
    print_diagnoses/1
]).

:- use_module('./meta_interpreter', [
    builtin/1,
    solve_with_depth/2,
    contains_goal/2,
    contains_recursive_call/2
]).

evidence_weight(non_terminating_execution, 1).
evidence_weight(recursive_call_without_progress, 1).
evidence_weight(no_matching_clause, 1).
evidence_weight(missing_base_case_fact, 1).
evidence_weight(unbound_variable_usage, 1).
evidence_weight(unexpected_failure, 1).
evidence_weight(clause_never_succeeds, 1).
evidence_weight(all_clauses_checked, 1).
evidence_weight(wrong_base_case_fact, 1).
evidence_weight(swapped_arguments, 1).
evidence_weight(arity_mismatch, 1).
evidence_weight(overly_general_base_case, 1).
evidence_weight(negation_with_unbound_var, 1).
evidence_weight(unconditional_cut, 1).
evidence_weight(ambiguous_operator_precedence, 1).

error_pattern(
    missing_base_case,
    detect_missing_base_case,
    'No base case found - likely infinite recursion',
    'Add a base case that matches simple inputs (e.g., empty list, zero)'
).

error_pattern(
    infinite_recursion,
    detect_infinite_recursion,
    'Predicate does not terminate within reasonable depth',
    'Ensure recursive calls make progress toward base case'
).

error_pattern(
    wrong_variable_binding,
    detect_wrong_variable,
    'Variable appears to be used before being bound',
    'Check variable ordering in clauses - ensure variables are bound before use'
).

error_pattern(
    missing_clause,
    detect_missing_clause,
    'No clause matches this input pattern',
    'Add clause to handle this case, or check for typos in predicate name'
).

error_pattern(
    non_decreasing_recursion,
    detect_non_decreasing_recursion,
    'Recursive call does not make input smaller',
    'Ensure recursive calls use a smaller/simpler version of the input'
).

error_pattern(
    wrong_base_case,
    detect_wrong_base_case,
    'Base case exists but is incorrect',
    'Fix the base case clause to match the expected output'
).

error_pattern(
    argument_order_swapped,
    detect_argument_order_swapped,
    'Arguments appear to be in the wrong order',
    'Check the order of arguments in the predicate definition'
).

error_pattern(
    arity_mismatch,
    detect_arity_mismatch,
    'Predicate arity does not match expected arity',
    'Check the predicate name and arity in your code'
).

error_pattern(
    overly_general_base_case,
    detect_overly_general_base_case,
    'Base case is too general and matches too many inputs',
    'Restrict the base case to the intended simplest input'
).

error_pattern(
    cut_negation_misuse,
    detect_cut_negation_misuse,
    'Cut or negation may be used incorrectly',
    'Review use of ! and \\+ to ensure they do not prune valid solutions'
).

error_pattern(
    operator_precedence_ambiguity,
    detect_operator_precedence_ambiguity,
    'Potentially ambiguous operator precedence in clause body',
    'Add parentheses to make precedence explicit for , ; and ->'
).

detect_missing_base_case(Goal, Evidence) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    
    % Collect evidence
    findall(E, evidence_for_missing_base(GenericGoal, E), EvidenceItems),
    EvidenceItems \= [],
    
    % Structure evidence
    Evidence = EvidenceItems.

evidence_for_missing_base(Goal, missing_base_case_fact) :-
    % No non-recursive clause exists
    \+ (clause(Goal, Body), \+ contains_recursive_call(Goal, Body)).

evidence_for_missing_base(Goal, non_terminating_execution) :-
    % Does not terminate within depth limit
    \+ solve_with_depth(Goal, 100).

% detect_infinite_recursion(+Goal, -EvidenceList)
detect_infinite_recursion(Goal, Evidence) :-
    % Collect evidence
    findall(E, evidence_for_infinite_recursion(Goal, E), EvidenceItems),
    EvidenceItems \= [],
    
    Evidence = EvidenceItems.

evidence_for_infinite_recursion(Goal, non_terminating_execution) :-
    \+ solve_with_depth(Goal, 100).

evidence_for_infinite_recursion(Goal, recursive_call_without_progress) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    clause(GenericGoal, Body),
    contains_recursive_call(GenericGoal, Body),
    extract_recursive_call(GenericGoal, Body, RecCall),
    \+ is_decreasing_call(GenericGoal, RecCall).

% detect_wrong_variable(+Goal, -EvidenceList)
detect_wrong_variable(Goal, Evidence) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    
    % Collect evidence
    findall(E, evidence_for_wrong_variable(GenericGoal, E), EvidenceItems),
    EvidenceItems \= [],
    
    Evidence = EvidenceItems.

evidence_for_wrong_variable(Goal, unbound_variable_usage) :-
    clause(Goal, Body),
    has_unbound_variable_usage(Goal, Body, _).

% detect_missing_clause(+Goal, -EvidenceList)
detect_missing_clause(Goal, Evidence) :-
    % Collect evidence
    findall(E, evidence_for_missing_clause(Goal, E), EvidenceItems),
    EvidenceItems \= [],
    
    Evidence = EvidenceItems.

evidence_for_missing_clause(Goal, no_matching_clause) :-
    \+ clause(Goal, _).

evidence_for_missing_clause(Goal, unexpected_failure) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    clause(GenericGoal, _),  % Predicate exists
    \+ clause(Goal, _).      % But this specific goal has no match

% detect_non_decreasing_recursion(+Goal, -EvidenceList)
detect_non_decreasing_recursion(Goal, Evidence) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    
    % Collect evidence
    findall(E, evidence_for_non_decreasing(GenericGoal, E), EvidenceItems),
    EvidenceItems \= [],
    
    Evidence = EvidenceItems.

evidence_for_non_decreasing(Goal, recursive_call_without_progress) :-
    clause(Goal, Body),
    contains_recursive_call(Goal, Body),
    extract_recursive_call(Goal, Body, RecCall),
    \+ is_decreasing_call(Goal, RecCall).

evidence_for_non_decreasing(Goal, clause_never_succeeds) :-
    \+ safe_call(Goal).

detect_wrong_base_case(Goal, Evidence) :-
    ground(Goal),
    base_case_clause_exists(Goal),
    \+ safe_call(Goal),
    Evidence = [wrong_base_case_fact].

detect_argument_order_swapped(Goal, Evidence) :-
    ground(Goal),
    Goal =.. [F, A1, A2 | Rest],
    Swapped =.. [F, A2, A1 | Rest],
    A1 \= A2,
    safe_call(Swapped),
    Evidence = [swapped_arguments].

detect_arity_mismatch(Goal, Evidence) :-
    functor(Goal, F, A),
    \+ clause(Goal, _),
    current_predicate(F/OtherA),
    OtherA \= A,
    Evidence = [arity_mismatch].

detect_overly_general_base_case(Goal, Evidence) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    clause(GenericGoal, Body),
    Body == true,
    term_variables(GenericGoal, Vars),
    length(Vars, A),
    Evidence = [overly_general_base_case].

detect_cut_negation_misuse(Goal, Evidence) :-
    findall(E, evidence_for_cut_negation(Goal, E), EvidenceItems),
    EvidenceItems \= [],
    Evidence = EvidenceItems.

detect_operator_precedence_ambiguity(Goal, Evidence) :-
    findall(E, evidence_for_operator_precedence(Goal, E), EvidenceItems),
    EvidenceItems \= [],
    Evidence = EvidenceItems.

evidence_for_cut_negation(Goal, negation_with_unbound_var) :-
    clause(Goal, Body),
    contains_negation(Body, NegGoal),
    term_variables(NegGoal, Vars),
    member(V, Vars),
    var(V).

evidence_for_cut_negation(Goal, unconditional_cut) :-
    clause(Goal, Body),
    has_unconditional_cut(Body).

evidence_for_operator_precedence(Goal, ambiguous_operator_precedence) :-
    clause(Goal, Body),
    contains_conjunction(Body),
    (contains_disjunction(Body) ; contains_if_then(Body)).

contains_negation(\+ G, G) :- !.
contains_negation((A, _), G) :- contains_negation(A, G), !.
contains_negation((_, B), G) :- contains_negation(B, G), !.
contains_negation(_, _) :- fail.

has_unconditional_cut(!) :- !.
has_unconditional_cut((!, _)) :- !.
has_unconditional_cut((A, _)) :- has_unconditional_cut(A), !.
has_unconditional_cut((_, B)) :- has_unconditional_cut(B), !.
has_unconditional_cut(_) :- fail.

contains_conjunction((_, _)) :- !.
contains_conjunction((A ; B)) :- (contains_conjunction(A) ; contains_conjunction(B)), !.
contains_conjunction((A -> B)) :- (contains_conjunction(A) ; contains_conjunction(B)), !.
contains_conjunction((A *-> B)) :- (contains_conjunction(A) ; contains_conjunction(B)), !.
contains_conjunction(_) :- fail.

contains_disjunction((_; _)) :- !.
contains_disjunction((A, B)) :- (contains_disjunction(A) ; contains_disjunction(B)), !.
contains_disjunction((A -> B)) :- (contains_disjunction(A) ; contains_disjunction(B)), !.
contains_disjunction((A *-> B)) :- (contains_disjunction(A) ; contains_disjunction(B)), !.
contains_disjunction(_) :- fail.

contains_if_then((A -> B)) :- (A \= true ; B \= true), !.
contains_if_then((A *-> B)) :- (A \= true ; B \= true), !.
contains_if_then((A, B)) :- (contains_if_then(A) ; contains_if_then(B)), !.
contains_if_then((A ; B)) :- (contains_if_then(A) ; contains_if_then(B)), !.
contains_if_then(_) :- fail.

base_case_clause_exists(Goal) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    clause(GenericGoal, Body),
    \+ contains_recursive_call(GenericGoal, Body).

safe_call(Goal) :-
    catch(call_with_time_limit(1, call_with_depth_limit(Goal, 10, R)), _, fail),
    R \= depth_limit_exceeded.

has_unbound_variable_usage(Head, Body, var_in_builtin(Var, Pos)) :-
    % Check if variable appears in builtin before being unified in head
    arg(Pos, Head, Var),
    var(Var),
    Body = (_, Builtin, _),
    builtin(Builtin),
    term_variables(Builtin, BuiltinVars),
    member(Var, BuiltinVars).

extract_recursive_call(Goal, Body, RecCall) :-
    functor(Goal, F, A),
    functor(RecCall, F, A),
    contains_goal(RecCall, Body).

is_decreasing_call(Goal, RecCall) :-
    % Heuristic: check if first argument gets smaller
    arg(1, Goal, OrigArg),
    arg(1, RecCall, RecArg),
    
    % Simple checks for common patterns
    (   % List recursion: [H|T] -> T
        nonvar(OrigArg),
        OrigArg = [_|Tail],
        RecArg == Tail
    ;   % Number recursion: N -> N-1 or similar
        nonvar(OrigArg),
        number(OrigArg),
        (   RecArg = OrigArg - 1
        ;   RecArg = OrigArg - _
        )
    ;   % Variable that appears to be from decomposition
        var(RecArg),
        appears_in_term(RecArg, OrigArg)
    ).

appears_in_term(Var, [H|_]) :- Var == H, !.
appears_in_term(Var, [_|T]) :- !, appears_in_term(Var, T).
appears_in_term(Var, Term) :-
    compound(Term),
    Term =.. [_|Args],
    member(Arg, Args),
    appears_in_term(Var, Arg).

% generate_diagnoses(+Goal, -RankedDiagnoses)
% Returns list of diagnosis(Pattern, Score, Message, Suggestion, Evidence)
% Sorted by evidence score (highest first)
% NO confidence scores - ranking based on cumulative evidence strength!

generate_diagnoses(Goal, RankedDiagnoses) :-
    findall(
        diagnosis(Pattern, Score, Message, Suggestion, EvidenceList),
        detect_with_evidence_score(Goal, Pattern, Score, Message, Suggestion, EvidenceList),
        Diagnoses
    ),
    sort_by_evidence_score(Diagnoses, RankedDiagnoses).

% detect_with_evidence_score(+Goal, -Pattern, -Score, -Message, -Suggestion, -Evidence)
detect_with_evidence_score(Goal, Pattern, Score, Message, Suggestion, EvidenceList) :-
    error_pattern(Pattern, DetectionPred, Message, Suggestion),
    call(DetectionPred, Goal, EvidenceList),
    calculate_evidence_score(EvidenceList, Score).

% calculate_evidence_score(+EvidenceList, -Score)
% Sum weights of all evidence items
calculate_evidence_score(EvidenceList, Score) :-
    findall(Weight,
            (member(EvidenceItem, EvidenceList),
             evidence_weight(EvidenceItem, Weight)),
            Weights),
    sum_list(Weights, Score).

% sort_by_evidence_score(+Diagnoses, -Sorted)
sort_by_evidence_score(Diagnoses, Sorted) :-
    % Extract score and pair with diagnosis
    map_score(Diagnoses, Paired),
    % Sort by score (descending)
    keysort(Paired, SortedAsc),
    reverse(SortedAsc, SortedDesc),
    % Extract diagnoses
    extract_values(SortedDesc, Sorted).

map_score([], []).
map_score([diagnosis(P, Score, M, S, E)|Rest], [NegScore-diagnosis(P, Score, M, S, E)|Mapped]) :-
    NegScore is -Score,  % Negative for descending sort
    map_score(Rest, Mapped).

extract_values([], []).
extract_values([_-Value|Rest], [Value|Values]) :-
    extract_values(Rest, Values).

% enhanced_detect_errors(+Goal, -DetailedErrors)
% Enhanced version with evidence-based ranking
enhanced_detect_errors(Goal, DetailedErrors) :-
    generate_diagnoses(Goal, Diagnoses),
    format_detailed_errors(Diagnoses, DetailedErrors).

format_detailed_errors([], []).
format_detailed_errors([diagnosis(Pattern, Score, Message, Suggestion, Evidence)|Rest],
                       [detailed_error(Pattern, Score, Message, Suggestion, Evidence)|Formatted]) :-
    format_detailed_errors(Rest, Formatted).

% print_diagnoses(+Diagnoses)
print_diagnoses([]) :-
    writeln('No error patterns detected.').
print_diagnoses([Diagnosis|Rest]) :-
    print_diagnosis(Diagnosis),
    writeln(''),
    print_diagnoses(Rest).

print_diagnosis(diagnosis(Pattern, Score, Message, Suggestion, EvidenceList)) :-
    format('Error Pattern: ~w~n', [Pattern]),
    format('Evidence Score: ~w~n', [Score]),
    format('Problem: ~w~n', [Message]),
    format('Suggestion: ~w~n', [Suggestion]),
    writeln('Supporting Evidence:'),
    print_evidence_items(EvidenceList).

print_evidence_items([]).
print_evidence_items([Evidence|Rest]) :-
    evidence_weight(Evidence, Weight),
    format('- ~w (weight: ~w)~n', [Evidence, Weight]),
    print_evidence_items(Rest).

