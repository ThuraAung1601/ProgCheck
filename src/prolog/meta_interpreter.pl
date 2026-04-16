% =============================================================================
% META INTERPRETER
% Core proof tracing, validation, and execution tracing utilities.
% =============================================================================

:- module(meta_interpreter, [
    % 1. Execution Tracer
    solve_with_trace/2,
    print_proof_tree/1,
    extract_proof_nodes/2,
    % 1b. Failure-aware tracer
    solve_fail_trace/3,
    print_fail_tree/1,
    % 1c. Source graph extractor
    extract_source_graph/2,
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
    NextIndent is Indent + 2,
    print_tree(Tree2, NextIndent).

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
% Failure-aware trace
% ----------------------------------------------------------------------------

% solve_fail_trace(+Goal, -Tree, -Succeeded)
%
% Simulates Prolog execution exactly:
%   - Tries every clause whose HEAD unifies with Goal, in order.
%   - Uses nth_clause/3 + clause/3 with copy_term so variable bindings
%     from the head unification are properly propagated into the body,
%     while Goal's own variables stay unbound for the next iteration.
%   - For each clause entered, recursively traces the body.
%   - If the body fails, records it and moves to the next clause.
%   - Stops at the first clause whose body succeeds.
%   - If all fail (or no head unifies), records the full attempted set.
%
% Tree node types:
%   proof(Goal, Body, Sub)        — clause succeeded
%   failed_proof(Goal, Body, Sub) — clause entered, body failed
%   no_clause(Goal)               — no clause head unified at all
%   builtin(Goal)                 — builtin succeeded
%   failed_builtin(Goal)          — builtin called but failed
%   skipped                       — conjunction tail after earlier failure
%   seq(T1, T2)                   — sibling clause attempts (same Goal level)

solve_fail_trace(true, true, true) :- !.

solve_fail_trace((G1, G2), (T1, T2), Succ) :- !,
    solve_fail_trace(G1, T1, S1),
    ( S1 = true
    -> solve_fail_trace(G2, T2, Succ)
    ;  T2 = skipped, Succ = false
    ).

solve_fail_trace(!, builtin(!), true) :- !.

solve_fail_trace(Goal, builtin(Goal), true) :-
    builtin(Goal), !, call(Goal).

solve_fail_trace(Goal, failed_builtin(Goal), false) :-
    builtin(Goal), !.

% User-defined predicate:
%   1. Collect ALL clause references for Goal's functor/arity (not just unifiable ones).
%   2. Try each in order; record head-unification failures AND body failures.
solve_fail_trace(Goal, Tree, Succ) :-
    functor(Goal, F, A),
    functor(Template, F, A),          % generic template — same functor/arity, all vars free
    catch(
        findall(Ref, nth_clause(Template, _, Ref), Refs),
        _, Refs = []
    ),
    ( Refs = []
    -> Tree = no_clause(Goal), Succ = false
    ;  try_clause_refs(Goal, Refs, Tree, Succ)
    ).

% try_clause_refs(+Goal, +Refs, -Tree, -Succ)
% Tries each clause reference in order. Uses copy_term so successive
% iterations do not see bindings from earlier clause attempts.
% When clause/3 fails the head didn't unify — record as head_fail node.
try_clause_refs(Goal, [Ref], Tree, Succ) :- !,
    copy_term(Goal, GC),
    ( clause(GC, Body, Ref)
    -> solve_fail_trace(Body, SubTree, Succ),
       ( Succ = true
       -> Tree = proof(GC, Body, SubTree)
       ;  Tree = failed_proof(GC, Body, SubTree)
       )
    ;  clause_head_term(Ref, HeadTerm),
       Tree = head_fail(Goal, HeadTerm), Succ = false
    ).
try_clause_refs(Goal, [Ref|Rest], Tree, Succ) :-
    copy_term(Goal, GC),
    ( clause(GC, Body, Ref)
    -> solve_fail_trace(Body, SubTree, S1),
       ( S1 = true
       -> Tree = proof(GC, Body, SubTree), Succ = true
       ;  try_clause_refs(Goal, Rest, RestTree, Succ),
          Tree = seq(failed_proof(GC, Body, SubTree), RestTree)
       )
    ;  % Head didn't unify — record as head_fail and continue
       clause_head_term(Ref, HeadTerm),
       try_clause_refs(Goal, Rest, RestTree, Succ),
       Tree = seq(head_fail(Goal, HeadTerm), RestTree)
    ).

% Retrieve the head term for a clause ref (for head_fail display).
clause_head_term(Ref, Head) :-
    ( catch(clause(Head, _, Ref), _, fail) -> true
    ; Head = unknown
    ).

% print_fail_tree(+Tree)
print_fail_tree(Tree) :- print_fail_i(Tree, 0).

print_fail_i(true,    I) :- !, print_indent(I), writeln(true).
print_fail_i(skipped, _) :- !.
print_fail_i(seq(T1, T2), I) :- !, print_fail_i(T1, I), print_fail_i(T2, I).
print_fail_i((T1,T2), I) :- !,
    print_fail_i(T1, I),
    I2 is I + 2,
    print_fail_i(T2, I2).
print_fail_i(builtin(G), I) :- !,
    pfi_write_term(G, I, 'Builtin: ').
print_fail_i(failed_builtin(G), I) :- !,
    pfi_write_term(G, I, 'Failed: ').
print_fail_i(no_clause(G), I) :- !,
    pfi_write_term(G, I, 'Failed: ').
print_fail_i(head_fail(Goal, HeadTerm), I) :- !,
    copy_term(Goal-HeadTerm, GC-HC), numbervars(GC-HC, 0, _),
    print_indent(I), write('Head Fail: '),
    write_term(GC, [numbervars(true), quoted(false)]),
    write(' (tried '),
    write_term(HC, [numbervars(true), quoted(false)]),
    writeln(').').
print_fail_i(proof(Goal, Body, Sub), I) :- !,
    pfi_goal_line('Goal: ', Goal, Body, I),
    I2 is I + 2, print_fail_i(Sub, I2).
print_fail_i(failed_proof(Goal, Body, Sub), I) :- !,
    pfi_goal_line('Failed Goal: ', Goal, Body, I),
    I2 is I + 2, print_fail_i(Sub, I2).

% Write a single term on one line with nice variable names via numbervars.
pfi_write_term(T, I, Prefix) :-
    copy_term(T, TC), numbervars(TC, 0, _),
    print_indent(I), write(Prefix),
    write_term(TC, [numbervars(true), quoted(false)]), nl.

% Write "Prefix: Goal :- Body" or "Prefix: Goal (fact)" with nice var names.
pfi_goal_line(Prefix, Goal, Body, I) :-
    copy_term(Goal-Body, GC-BC), numbervars(GC-BC, 0, _),
    print_indent(I), write(Prefix),
    write_term(GC, [numbervars(true), quoted(false)]),
    ( BC = true
    -> writeln(' (fact)')
    ;  write(' :- '),
       write_term(BC, [numbervars(true), quoted(false)]), nl
    ).

% ============================================================================
% SOURCE GRAPH EXTRACTION
% ============================================================================
%
% extract_source_graph(+Source, -JSON)
%
% Uses read_term/3 with variable_names(VN) so variable identity is preserved:
%   - The same Prolog variable appearing in both the head and the body gets
%     instantiated to the SAME '$VAR'(Name) term, so we can draw "used-in"
%     edges between head-arg nodes and body-goal nodes.
%
% Node types: predicate, var, atom, builtin
% Edge labels/styles:
%   arg1/arg2/… solid     — predicate → head argument
%   calls       dashed    — predicate → called predicate (user-defined)
%   calls       dashed    — predicate → builtin goal node
%   uses        solid     — predicate → var node for body variable
%
% JSON output: {"nodes":[{id,label,type,arity},...], "edges":[{from,to,label,style},...]}

extract_source_graph(Source, JSON) :-
    atom_string(SAtom, Source),
    catch(
        setup_call_cleanup(
            open_string(SAtom, Strm),
            sg_read_all(Strm, CDs),
            close(Strm)
        ),
        _, CDs = []
    ),
    % Collect all user-defined functor/arity pairs
    findall(F/A, (member(cd(H,_), CDs), sg_head_fa(H,F,A)), FAs0),
    sort(FAs0, UserFAs),
    % Determine which are rules (have a non-trivial body)
    findall(F/A, (member(cd(H,B), CDs), B \= true, sg_head_fa(H,F,A)), RFAs0),
    sort(RFAs0, RuleFAs),
    % Build predicate nodes
    findall(N, (member(FA, UserFAs), sg_pred_node(FA, RuleFAs, N)), PredNodes),
    % Build per-clause arg/body nodes and edges, accumulating into sets
    foldl(sg_clause_elements(UserFAs), CDs, []-[], ClauseNodes-ClauseEdges),
    % Merge, dedup
    append(PredNodes, ClauseNodes, AllNodes0),
    sort(AllNodes0, AllNodes),
    sort(ClauseEdges, AllEdges),
    with_output_to(string(JSON), sg_emit_json(AllNodes, AllEdges)).

% sg_read_all(+Stream, -CDs)
% CD = cd(Head, Body) where all variables are '$VAR'(Name) atoms for display.
sg_read_all(Strm, CDs) :-
    catch(read_term(Strm, T, [variable_names(VN)]), _, (CDs=[], !)),
    ( T = end_of_file -> CDs = []
    ;   % Bind each var to '$VAR'(Name) so write_term(numbervars(true)) prints the name
        maplist([N=V]>>(V='$VAR'(N)), VN),
        ( T = (H :- B) -> Head=H, Body=B ; Head=T, Body=true ),
        sg_read_all(Strm, Rest),
        CDs = [cd(Head,Body)|Rest]
    ).

sg_head_fa(H, F, A) :- compound(H), !, functor(H,F,A), atom(F).
sg_head_fa(H, H, 0) :- atom(H).

sg_pred_node(F/A, RuleFAs, node(Id,Label,Type,A)) :-
    atomic_list_concat(['pred:',F,'/',A], Id),
    atomic_list_concat([F,'/',A], Label),
    (member(F/A, RuleFAs) -> Type = rule ; Type = fact).

% sg_clause_elements: for one cd(Head,Body), add arg nodes/edges and body nodes/edges
sg_clause_elements(UserFAs, cd(Head,Body), Ns0-Es0, Ns1-Es1) :-
    sg_head_fa(Head, F, A),
    atomic_list_concat(['pred:',F,'/',A], PId),
    % --- Head arguments ---
    ( compound(Head)
    -> Head =.. [_|Args],
       numlist(1, A, Idxs),
       maplist(sg_arg_ne(PId, F, A), Args, Idxs, ANss, AEss),
       flatten(ANss, ANs), flatten(AEss, AEs)
    ;  ANs=[], AEs=[]
    ),
    % --- Body goals ---
    sg_conj_list(Body, Goals),
    maplist(sg_body_ne(PId, UserFAs), Goals, GNss, GEss),
    flatten(GNss, GNs), flatten(GEss, GEs),
    % --- Variable "uses" edges: vars that appear in body but were also head args ---
    sg_var_uses(PId, F, A, Args0, Goals, VEs),
    ( compound(Head) -> Head=..[_|Args0] ; Args0=[] ),
    append([ANs,GNs], Ns0, Ns1),
    append([AEs,GEs,VEs], Es0, Es1).

% sg_arg_ne: produce node+edge for one head argument
sg_arg_ne(PId, F, A, Arg, Idx, Nodes, Edges) :-
    with_output_to(atom(ArgStr), write_term(Arg,[numbervars(true),quoted(false)])),
    atomic_list_concat(['arg',Idx], EdgeLabel),
    ( Arg = '$VAR'(VName)
    ->  atomic_list_concat(['var:',F,'/',A,':',VName], NId),
        Type = var, Label = VName
    ; number(Arg)
    ->  atomic_list_concat(['num:',Arg], NId),
        Type = atom, Label = ArgStr
    ; atom(Arg)
    ->  atomic_list_concat(['atom:',Arg], NId),
        Type = atom, Label = ArgStr
    ;   % compound argument — show as atom-type node with written form
        functor(Arg, AF, AA),
        atomic_list_concat(['compound:',AF,'/',AA], NId),
        Type = atom, Label = ArgStr
    ),
    Nodes = [node(NId, Label, Type, 0)],
    Edges = [edge(PId, NId, EdgeLabel, solid)].

% sg_body_ne: produce nodes+edges for one body goal
sg_body_ne(PId, UserFAs, Goal, Nodes, Edges) :-
    with_output_to(atom(GoalStr), write_term(Goal,[numbervars(true),quoted(false)])),
    ( Goal = '!'
    ->  GId = 'builtin:!',
        Nodes = [node(GId, '!', builtin, 0)],
        Edges = [edge(PId, GId, calls, dashed)]
    ; sg_head_fa(Goal, GF, GA), member(GF/GA, UserFAs)
    ->  atomic_list_concat(['pred:',GF,'/',GA], GId),
        Nodes = [],
        Edges = [edge(PId, GId, calls, dashed)]
    ;   % Builtin or arithmetic expression
        ( atom_length(GoalStr, L), L > 15
        -> sub_atom(GoalStr, 0, 14, _, L0), atom_concat(L0, '…', Lbl)
        ;  Lbl = GoalStr
        ),
        atomic_list_concat(['builtin:',PId,':',GoalStr], GId),
        Nodes = [node(GId, Lbl, builtin, 0)],
        Edges = [edge(PId, GId, calls, dashed)]
    ).

% sg_var_uses: for each head-arg var that also appears in a body goal, add a uses edge
sg_var_uses(PId, F, A, HeadArgs, Goals, Edges) :-
    % Collect head var names
    include(['$VAR'(_)]>>true, HeadArgs, HeadVars),
    maplist(['$VAR'(N), N]>>true, HeadVars, HeadVarNames),
    sort(HeadVarNames, HVNs),
    % Collect body vars
    term_to_atom(Goals, GoalsAtom),
    atom_string(GoalsAtom, GoalsStr),
    findall(VN,
        (member(VN, HVNs),
         atomic_list_concat(['$VAR'(VN)|_], _, _),  % just check membership
         sg_occurs_in_body(VN, Goals)),
        BodyUsedVars0),
    sort(BodyUsedVars0, BodyUsedVars),
    maplist([VN, edge(PId, NId, uses, solid)]>>(
        atomic_list_concat(['var:',F,'/',A,':',VN], NId)
    ), BodyUsedVars, Edges).

% sg_occurs_in_body: check if '$VAR'(VN) occurs somewhere in the body goals
sg_occurs_in_body(VN, Goals) :-
    with_output_to(atom(S), write_term(Goals,[numbervars(true),quoted(false)])),
    atom_concat(_, VN, _),      % VN is an atom
    sub_atom(S, _, _, _, VN).   % appears somewhere in the written body

% sg_conj_list: flatten (A,B,C) conjunction into a list
sg_conj_list(true, []) :- !.
sg_conj_list((A,B), [A|Rest]) :- !, sg_conj_list(B, Rest).
sg_conj_list(G, [G]).

% ── JSON output ──────────────────────────────────────────────────────────────

sg_emit_json(Nodes, Edges) :-
    write('{"nodes":['),
    sg_write_list(Nodes, sg_write_node),
    write('],"edges":['),
    sg_write_list(Edges, sg_write_edge),
    write(']}').

sg_write_list([], _) :- !.
sg_write_list([X], Pred) :- !, call(Pred, X).
sg_write_list([X|Xs], Pred) :- call(Pred, X), write(','), sg_write_list(Xs, Pred).

sg_write_node(node(Id,Label,Type,Arity)) :-
    write('{'),
    sg_kv(id,    Id),    write(','),
    sg_kv(label, Label), write(','),
    sg_kv(type,  Type),  write(','),
    format('"arity":~w', [Arity]),
    write('}').

sg_write_edge(edge(From,To,Label,Style)) :-
    write('{'),
    sg_kv(from,  From),  write(','),
    sg_kv(to,    To),    write(','),
    sg_kv(label, Label), write(','),
    sg_kv(style, Style),
    write('}').

% sg_kv: write "key":"value" with JSON string escaping
sg_kv(Key, Val) :-
    atom_string(Key, KS), atom_string(Val, VS),
    sg_json_str(KS), write(':'), sg_json_str(VS).

sg_json_str(S) :-
    write('"'),
    string_codes(S, Codes),
    maplist(sg_json_char, Codes),
    write('"').

sg_json_char(0'") :- !, write('\\\"').
sg_json_char(0'\\) :- !, write('\\\\').
sg_json_char(0'\n) :- !, write('\\n').
sg_json_char(0'\r) :- !, write('\\r').
sg_json_char(0'\t) :- !, write('\\t').
sg_json_char(C)   :- put_code(C).

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