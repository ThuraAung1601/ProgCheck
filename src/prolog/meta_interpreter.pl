% =============================================================================
% META INTERPRETER
% Core proof tracing, validation, and execution tracing utilities.
% =============================================================================

:- module(meta_interpreter, [
    % 1. Execution Tracer
    solve_with_trace/2,
    print_proof_tree/1,
    extract_proof_nodes/2,
    % 2. Incorrectness Debugger
    %    (uses solve_with_trace/2 + extract_proof_nodes/2 above)
    % 3. Incompleteness Debugger
    debug_incomplete/2,
    % 4. Termination Debugger
    debug_nonterminating/2,
    % Unified Shapiro dispatcher
    shapiro_mode/3,
    % Supporting utilities
    validate_with_tests/3,
    first_failing_test/1,
    builtin/1,
    solve_with_depth/2,
    contains_goal/2,
    contains_recursive_call/2,
    extract_recursive_call/3,
    is_decreasing_call/2,
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
builtin(\+ _).
builtin(!).
builtin(true).
builtin(atom(_)).
builtin(number(_)).
builtin(var(_)).
builtin(nonvar(_)).
builtin(append(_, _, _)).
builtin(member(_, _)).
builtin(length(_, _)).
builtin(reverse(_, _)).
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
    call(Goal).   % call/1 makes cut a no-op inside its own call boundary

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
% Proof node extraction (for algorithmic debugging)
% ----------------------------------------------------------------------------

% extract_proof_nodes(+ProofTree, -Nodes)
% Flatten a proof tree into a list of node(Goal, Body, Depth) terms.
% Only user-defined predicate nodes are included (builtins and 'true' are skipped).
% Depth is 0-based; root node is depth 0.
extract_proof_nodes(Tree, Nodes) :-
    collect_proof_nodes(Tree, 0, Nodes).

% collect_proof_nodes(+Tree, +Depth, -Nodes)
collect_proof_nodes(true, _, []) :- !.
collect_proof_nodes(builtin(_), _, []) :- !.
collect_proof_nodes((T1, T2), Depth, Nodes) :-
    !,
    collect_proof_nodes(T1, Depth, N1),
    collect_proof_nodes(T2, Depth, N2),
    append(N1, N2, Nodes).
collect_proof_nodes(proof(Goal, Body, SubTree), Depth, [node(Goal, Body, Depth) | Rest]) :-
    !,
    NextDepth is Depth + 1,
    collect_proof_nodes(SubTree, NextDepth, Rest).
collect_proof_nodes(_, _, []).

% =============================================================================
% SHAPIRO 4 META-INTERPRETERS
% =============================================================================
% 1. Execution Tracer  -> solve_with_trace/2         (see above)
% 2. Incorrectness     -> solve_with_trace/2 + extract_proof_nodes/2
% 3. Incompleteness    -> debug_incomplete/2         (below)
% 4. Termination       -> debug_nonterminating/2     (below)
% Dispatcher           -> shapiro_mode/3             (below)
% =============================================================================

% ----------------------------------------------------------------------------
% 3. INCOMPLETENESS DEBUGGER
% ----------------------------------------------------------------------------

% debug_incomplete(+Goal, -Clauses)
% For a goal that FAILS when it should succeed.
% Enumerates every existing clause of the predicate so the LLM oracle can
% determine which base case or recursive clause is missing or wrong.
% Returns a list of clause(Head, Body) terms.
debug_incomplete(Goal, Clauses) :-
    functor(Goal, F, A),
    functor(Template, F, A),
    findall(
        clause(H, B),
        ( copy_term(Template, H), clause(H, B) ),
        Clauses
    ).

% ----------------------------------------------------------------------------
% 4. TERMINATION DEBUGGER
% ----------------------------------------------------------------------------

% debug_nonterminating(+Goal, -FaultyRecursions)
% For a goal that does not terminate within the depth limit.
% Finds every clause whose recursive call does NOT make the first argument
% structurally/arithmetically smaller, returning
%   non_progressing(Head, Body, RecCall) terms.
debug_nonterminating(Goal, FaultyRecursions) :-
    functor(Goal, F, A),
    functor(GenGoal, F, A),
    findall(
        non_progressing(Head, Body, RecCall),
        (
            copy_term(GenGoal, Head),
            clause(Head, Body),
            extract_recursive_call(Head, Body, RecCall),
            \+ is_decreasing_call(Head, RecCall)
        ),
        FaultyRecursions
    ).

% extract_recursive_call(+Head, +Body, -RecCall)
% Find a recursive call inside Body that has the same functor/arity as Head.
extract_recursive_call(Goal, Body, RecCall) :-
    functor(Goal, F, A),
    functor(RecCall, F, A),
    contains_goal(RecCall, Body).

% is_decreasing_call(+Head, +RecCall)
% Heuristic: the first argument must become structurally or numerically smaller.
is_decreasing_call(Head, RecCall) :-
    arg(1, Head, OrigArg),
    arg(1, RecCall, RecArg),
    (   % List recursion: [H|T] -> T
        nonvar(OrigArg), OrigArg = [_|Tail], RecArg == Tail
    ;   % Number: N -> N-1 or N-_
        nonvar(OrigArg), number(OrigArg),
        (RecArg = OrigArg - 1 ; RecArg = OrigArg - _)
    ;   % Variable from decomposition of OrigArg (e.g., f([H|T]) -> f(T))
        % OrigArg must be compound/list for this to be meaningful
        nonvar(OrigArg), var(RecArg), appears_in_term(RecArg, OrigArg)
    ).

% appears_in_term(+Var, +Term)
% True if the logical variable Var occurs somewhere inside Term.
% Both arguments must be at least partially instantiated to avoid looping.
appears_in_term(_, Term) :- var(Term), !, fail.
appears_in_term(Var, [H|_])  :- Var == H, !.
appears_in_term(Var, [_|T])  :- !, appears_in_term(Var, T).
appears_in_term(Var, Term)   :-
    compound(Term), Term =.. [_|Args],
    member(A, Args), appears_in_term(Var, A).

% ----------------------------------------------------------------------------
% SHAPIRO DISPATCHER
% ----------------------------------------------------------------------------

% shapiro_mode(+Goal, -Mode, -Data)
% Routes to the correct Shapiro meta-interpreter based on goal behaviour.
%
%  Mode = nonterminating  ->  Data = [non_progressing(Head,Body,Rec), ...]
%  Mode = incomplete       ->  Data = [clause(Head,Body), ...]
%  Mode = incorrect        ->  Data = [node(Goal,Body,Depth), ...]
%  Mode = ok               ->  Data = []

% has_base_case(+Goal) - True when the predicate has at least one clause
% whose body contains no recursive self-call (i.e., a proper base clause).
has_base_case(Goal) :-
    functor(Goal, F, A),
    functor(H, F, A),
    clause(H, B),
    \+ contains_recursive_call(H, B).

% goal_cleanly_fails(+Goal)
% True iff Goal deterministically fails WITHOUT throwing an exception.
% This prevents `incomplete` false-positives when the generic goal template
% (e.g. max(_,_,_)) throws instantiation_error from an arithmetic guard
% before backtracking can reach a succeeding clause.
goal_cleanly_fails(Goal) :-
    catch(
        (   catch(
                call_with_time_limit(1, call_with_depth_limit(Goal, 50, _)),
                error(time_limit_exceeded, _),
                fail          % time limit → treat as "not succeeded" → may be incomplete
            )
        ->  fail              % goal succeeded → not incomplete
        ;   true              % goal cleanly failed → IS incomplete
        ),
        _AnyOtherError,
        fail                  % goal threw a non-timeout error → NOT cleanly failing
    ).

shapiro_mode(Goal, nonterminating, FaultyRecursions) :-
    % Recursive predicate with NO base case -> guaranteed nontermination
    functor(Goal, F, A), functor(GenGoal, F, A),
    clause(GenGoal, SomeBody),
    contains_recursive_call(GenGoal, SomeBody),
    \+ has_base_case(Goal), !,
    debug_nonterminating(Goal, FaultyRecursions).

shapiro_mode(Goal, incomplete, Clauses) :-
    % Goal fails cleanly (no matching clause, or all clauses genuinely fail).
    goal_cleanly_fails(Goal), !,
    debug_incomplete(Goal, Clauses).

shapiro_mode(Goal, incorrect, ProofNodes) :-
    % Goal succeeds -> build proof tree and extract nodes for oracle
    solve_with_trace(Goal, Tree), !,
    extract_proof_nodes(Tree, ProofNodes).

shapiro_mode(_, ok, []).

% ----------------------------------------------------------------------------
% Recursive-call helpers (kept for diagnosis_engine compatibility)
% ----------------------------------------------------------------------------

% contains_recursive_call(+Goal, +Body)
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

% first_failing_test(-Goal)
% Find the first test(Goal, Exp) that actually fails (Actual \= Expected).
% Used by shapiro_diagnose calls to get a concrete goal rather than a
% wildcard template that would throw instantiation_error in arithmetic guards.
first_failing_test(Goal) :-
    test(Goal, Exp),
    safe_findall(Goal, Actual),
    \+ compare_results(Actual, Exp),
    !.

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

trace_with_depth_failure(!, Depth, Acc, Trace) :-
    !,
    append(Acc, [cut(Depth)], Trace).

trace_with_depth_failure(Goal, Depth, Acc, Trace) :-
    builtin(Goal), !,
    (call(Goal) ->
        Trace = Acc
    ;
        append(Acc, [failed(Depth, Goal)], Trace)
    ).

trace_with_depth_failure(Goal, Depth, Acc, Trace) :-
    Depth =< 100,
    findall(1, clause(Goal, _), ClauseMarkers),
    length(ClauseMarkers, NumClauses),
    (NumClauses > 0 ->
        append(Acc, [step(Depth, Goal)], StepAcc),
        (NumClauses > 1 ->
            append(StepAcc, [choice_point(Depth, Goal, NumClauses)], NewAcc)
        ;
            NewAcc = StepAcc
        ),
        clause(Goal, Body),
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
format_trace_steps([choice_point(Depth, Goal, NumClauses)|Rest], [Line|RestLines]) :-
    format(atom(Line), 'Depth ~w: choice point ~w (~w clauses)', [Depth, Goal, NumClauses]),
    format_trace_steps(Rest, RestLines).
format_trace_steps([cut(Depth)|Rest], [Line|RestLines]) :-
    format(atom(Line), 'Depth ~w: ! (CUT - pruning alternatives)', [Depth]),
    format_trace_steps(Rest, RestLines).
format_trace_steps([failed(Depth, Goal)|Rest], [Line|RestLines]) :-
    format(atom(Line), 'Depth ~w: ~w (failed)', [Depth, Goal]),
    format_trace_steps(Rest, RestLines).