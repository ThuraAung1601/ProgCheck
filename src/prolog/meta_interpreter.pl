:- module(meta_interpreter, [
    solve_with_trace/2,
    print_proof_tree/1,
    detect_errors/2,
    validate_with_tests/3,
    compare_results/2,
    builtin/1,
    solve_with_depth/2,
    contains_goal/2,
    contains_recursive_call/2
]).

% builtin/1 - Define Prolog built-in predicates
builtin(_ is _).
builtin(_ =:= _).
builtin(_ < _).
builtin(_ > _).
builtin(_ =< _).
builtin(_ >= _).
builtin(_ = _).
builtin(_ \= _).
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

% print_proof_tree(+Tree)
% Pretty prints a proof tree with arrows and indentation
print_proof_tree(Tree) :-
    print_tree(Tree, 0).

print_tree(true, Indent) :-
    print_indent(Indent),
    writeln('true').

print_tree(builtin(Goal), Indent) :-
    print_indent(Indent),
    write('⚙ '),
    writeln(Goal).

print_tree((Tree1, Tree2), Indent) :-
    print_tree(Tree1, Indent),
    print_tree(Tree2, Indent).

print_tree(proof(Goal, Body, SubTree), Indent) :-
    print_indent(Indent),
    write('→ '),
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

% Check if goal appears in body
contains_goal(Goal, Goal) :- !.
contains_goal(Goal, (G, _)) :- contains_goal(Goal, G), !.
contains_goal(Goal, (_, G)) :- contains_goal(Goal, G), !.
contains_goal(_, _) :- fail.

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
    findall(Goal, safe_goal(Goal), Results).

safe_goal(Goal) :-
    catch(call_with_time_limit(1, call_with_depth_limit(Goal, 200, R)), _, fail),
    R \= depth_limit_exceeded.

