% =============================================================================
% META INTERPRETER
% Core proof tracing, validation, and execution tracing utilities.
% =============================================================================

:- module(meta_interpreter, [
    solve_with_trace/2,
    print_proof_tree/1,
    detect_errors/2,
    validate_with_tests/3,
    builtin/1,
    solve_with_depth/2,
    contains_goal/2,
    contains_recursive_call/2,
    tail_recursive/1,
    mutual_recursion/2,
    wf_smaller/2,
    trace_execution_with_failure/2,
    format_execution_trace/2
]).

% ----------------------------------------------------------------------------
% Built-ins
% ----------------------------------------------------------------------------

% builtin/1 - Define Prolog built-in predicates
builtin(_ is _).
builtin(_ =:= _).
builtin(_ < _).
builtin(_ > _).
builtin(_ =< _).
builtin(_ >= _).
builtin(_ = _).
builtin(_ \= _).
builtin(!).
builtin(true).
builtin(atom(_)).
builtin(number(_)).
builtin(var(_)).
builtin(nonvar(_)).
builtin(append(_, _, _)).
builtin(member(_, _)).
builtin(length(_, _)).
builtin(write(_)).
builtin(writeln(_)).
builtin(nl).
builtin(assert(_)).
builtin(retract(_)).

% ----------------------------------------------------------------------------
% Proof tree generation
% ----------------------------------------------------------------------------

% solve_with_trace(+Goal, -ProofTree)
% Core meta-interpreter - generates proof tree for a goal
solve_with_trace(true, true) :- !.

solve_with_trace((Goal1, Goal2), (Tree1, Tree2)) :-
    !,
    solve_with_trace(Goal1, Tree1),
    solve_with_trace(Goal2, Tree2).

solve_with_trace(Goal, builtin(Goal)) :-
    builtin(Goal),
    !,
    Goal.

solve_with_trace(Goal, proof(Goal, Body, SubTree)) :-
    clause(Goal, Body),
    solve_with_trace(Body, SubTree).

% ----------------------------------------------------------------------------
% Proof tree formatting
% ----------------------------------------------------------------------------

% print_proof_tree(+Tree)
% Pretty prints a proof tree with indentation
print_proof_tree(Tree) :-
    print_tree(Tree, 0).

print_tree(true, Indent) :-
    print_indent(Indent),
    writeln('true').

print_tree(builtin(Goal), Indent) :-
    print_indent(Indent),
    write('Builtin: '),
    writeln(Goal).

print_tree((Tree1, Tree2), Indent) :-
    print_tree(Tree1, Indent),
    print_tree(Tree2, Indent).

print_tree(proof(Goal, Body, SubTree), Indent) :-
    print_indent(Indent),
    write('Goal: '),
    write(Goal),
    (Body = true ->
        writeln(' (fact)')
    ;
        write(' :- '),
        writeln(Body),
        NewIndent is Indent + 2,
        print_tree(SubTree, NewIndent)
    ).

print_indent(0) :- !.
print_indent(N) :-
    N > 0,
    write('  '),
    N1 is N - 1,
    print_indent(N1).

% ----------------------------------------------------------------------------
% Error detection (legacy helpers)
% ----------------------------------------------------------------------------

% detect_errors(+Goal, -Errors)
% Analyzes goal and detects common errors by examining code structure
detect_errors(Goal, Errors) :-
    findall(Error, check_error(Goal, Error), Errors).

% Check for missing base case
check_error(Goal, missing_base_case(Predicate)) :-
    functor(Goal, Functor, Arity),
    Predicate = Functor/Arity,
    \+ has_base_case(Goal).

% Check for infinite recursion (depth limit exceeded)
check_error(Goal, infinite_recursion(Predicate)) :-
    functor(Goal, Functor, Arity),
    Predicate = Functor/Arity,
    \+ solve_with_depth(Goal, 100).

% Check if predicate has a base case
has_base_case(Goal) :-
    functor(Goal, F, A),
    functor(GenericGoal, F, A),
    clause(GenericGoal, Body),
    \+ contains_recursive_call(GenericGoal, Body), !.

% Check if body contains recursive call
contains_recursive_call(Goal, Body) :-
    functor(Goal, F, A),
    functor(RecCall, F, A),
    contains_goal(RecCall, Body).

% ----------------------------------------------------------------------------
% Goal/recursion helpers
% ----------------------------------------------------------------------------

% Check if goal appears in body
contains_goal(Goal, Goal) :- !.
contains_goal(Goal, (G, _)) :- contains_goal(Goal, G), !.
contains_goal(Goal, (_, G)) :- contains_goal(Goal, G), !.
contains_goal(_, _) :- fail.

% tail_recursive(+Predicate)
% True when there is a clause whose recursive call is in tail position.
tail_recursive(Predicate) :-
    functor(Head, F, A),
    Predicate = F/A,
    clause(Head, Body),
    last_goal(Body, LastGoal),
    functor(LastGoal, F, A), !.

% mutual_recursion(+Pred1, +Pred2)
% Detects simple mutual recursion between two predicates (Pred1 calls Pred2 and vice versa).
mutual_recursion(P1, P2) :-
    P1 \= P2,
    calls_predicate(P1, P2),
    calls_predicate(P2, P1).

% last_goal(+Body, -Last) extracts the final goal in a conjunction.
last_goal((_, Rest), Last) :- !, last_goal(Rest, Last).
last_goal(Last, Last).

% calls_predicate(+Caller, +Callee) succeeds when Caller has a clause whose body contains Callee.
calls_predicate(Caller, Callee) :-
    functor(CallerHead, CF, CA), Caller = CF/CA,
    clause(CallerHead, Body),
    functor(CalleeGoal, DF, DA), Callee = DF/DA,
    contains_goal(CalleeGoal, Body), !.

% ----------------------------------------------------------------------------
% Well-founded measure (induction helper)
% ----------------------------------------------------------------------------

% wf_smaller(+Bigger, +Smaller) holds when Smaller is structurally smaller.
% - Numbers: strictly decreasing
% - Lists: tail is smaller than whole list
% - Compound: any argument subterm is smaller
wf_smaller(B, S) :- number(B), number(S), S < B, !.
wf_smaller([_|T], S) :- S == T, !.
wf_smaller([_|T], S) :- wf_smaller(T, S), !.
wf_smaller(Term, Sub) :- compound(Term), Term =.. [_|Args], member(A, Args), (Sub == A ; wf_smaller(A, Sub)).

% ----------------------------------------------------------------------------
% Depth-limited solving
% ----------------------------------------------------------------------------

% solve_with_depth(+Goal, +MaxDepth)
% Solve with depth limit to detect infinite recursion
solve_with_depth(_, MaxDepth) :- MaxDepth =< 0, !, fail.
solve_with_depth(true, _) :- !.
solve_with_depth((G1, G2), MaxDepth) :-
    !,
    solve_with_depth(G1, MaxDepth),
    NewDepth is MaxDepth - 1,
    solve_with_depth(G2, NewDepth).
solve_with_depth(Goal, _) :-
    builtin(Goal), !, Goal.
solve_with_depth(Goal, MaxDepth) :-
    MaxDepth > 0,
    clause(Goal, Body),
    NewDepth is MaxDepth - 1,
    solve_with_depth(Body, NewDepth).

% ----------------------------------------------------------------------------
% Test validation helpers
% ----------------------------------------------------------------------------

% compare_results(+Actual, +Expected)
% Compares actual and expected results (order-independent)
compare_results(Actual, Expected) :-
    length(Actual, Len),
    length(Expected, Len),
    forall(member(X, Expected), member(X, Actual)),
    forall(member(X, Actual), member(X, Expected)).

% validate_with_tests(+Goal, +TestCases, -Errors)
% Validates a goal against test cases and returns errors
validate_with_tests(_, [], []).
validate_with_tests(GoalTemplate, [test(TestGoal, Expected)|Rest], Errors) :-
    functor(GoalTemplate, F, A),
    functor(TestGoal, F, A),
    !,
    safe_findall(TestGoal, Actual),
    (compare_results(Actual, Expected) ->
        validate_with_tests(GoalTemplate, Rest, Errors)
    ;
        validate_with_tests(GoalTemplate, Rest, RestErrors),
        Errors = [test_failure(TestGoal, Expected, Actual)|RestErrors]
    ).
validate_with_tests(GoalTemplate, [_|Rest], Errors) :-
    validate_with_tests(GoalTemplate, Rest, Errors).

safe_findall(Goal, Results) :-
    % Run goal safely with depth/time limits to avoid non-termination
    findall(Goal, safe_goal(Goal), Results).

safe_goal(Goal) :-
    % Limit execution to avoid infinite recursion during tests
    catch(call_with_time_limit(1, call_with_depth_limit(Goal, 200, R)), _, fail),
    R \= depth_limit_exceeded.

% ----------------------------------------------------------------------------
% Execution tracing
% ----------------------------------------------------------------------------

% trace_execution_with_failure(+Goal, -Trace)
% Generates an execution trace that also records failures
trace_execution_with_failure(Goal, Trace) :-
    % Start tracing at depth 1 and accumulate steps
    trace_with_depth_failure(Goal, 1, [], Trace).

trace_with_depth_failure(_, Depth, Acc, [depth_limit_exceeded|Acc]) :-
    Depth > 100, !.

trace_with_depth_failure(true, _, Acc, Acc) :- !.

trace_with_depth_failure((G1, G2), Depth, Acc, Trace) :-
    !,
    trace_with_depth_failure(G1, Depth, Acc, Trace1),
    trace_with_depth_failure(G2, Depth, Trace1, Trace).

trace_with_depth_failure(Goal, Depth, Acc, Trace) :-
    builtin(Goal), !,
    (call(Goal) ->
        Trace = Acc
    ;
        append(Acc, [failed(Depth, Goal)], Trace)
    ).

trace_with_depth_failure(Goal, Depth, Acc, Trace) :-
    Depth =< 100,
    (clause(Goal, Body) ->
        append(Acc, [step(Depth, Goal)], NewAcc),
        NextDepth is Depth + 1,
        (trace_with_depth_failure(Body, NextDepth, NewAcc, Trace) -> true ;
            append(NewAcc, [failed(Depth, Goal)], Trace))
    ;
        append(Acc, [failed(Depth, Goal)], Trace)
    ).

% format_execution_trace(+Trace, -FormattedString)
% Formats the execution trace as a readable string with depth info
format_execution_trace(Trace, String) :-
    format_trace_steps(Trace, Lines),
    atomic_list_concat(Lines, '\n', String).

format_trace_steps([], []).
format_trace_steps([depth_limit_exceeded|_], ['... Depth limit exceeded (100+ steps) - Likely INFINITE RECURSION']) :- !.
format_trace_steps([step(Depth, Goal)|Rest], [Line|RestLines]) :-
    format(atom(Line), 'Depth ~w: ~w', [Depth, Goal]),
    format_trace_steps(Rest, RestLines).
format_trace_steps([failed(Depth, Goal)|Rest], [Line|RestLines]) :-
    format(atom(Line), 'Depth ~w: ~w (failed)', [Depth, Goal]),
    format_trace_steps(Rest, RestLines).


