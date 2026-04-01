% =============================================================================
% DIAGNOSIS ENGINE  (Shapiro-based, replaces evidence-scoring system)
%
% Thin wrapper around the four Shapiro meta-interpreters in meta_interpreter.pl.
% The evidence-weight / pattern-scoring system has been fully removed.
% All diagnosis is now driven by the LLM oracle via algorithmic_debugger.py.
%
% Entry points
% ------------
%   shapiro_diagnose(+Goal, -Mode, -Data)
%       Unified dispatcher -- delegates to meta_interpreter:shapiro_mode/3.
%       Mode in { nonterminating, incomplete, incorrect, ok }
%
%   shapiro_nodes_text(+Mode, +Data, -Text)
%       Human-readable serialisation for Python-side logging.
%
% Node formats in Data
% --------------------
%   nonterminating  ->  [non_progressing(Head, Body, RecCall), ...]
%   incomplete      ->  [clause(Head, Body), ...]
%   incorrect       ->  [node(Goal, Body, Depth), ...]
%   ok              ->  []
% =============================================================================

:- module(diagnosis_engine, [
    shapiro_diagnose/3,
    shapiro_nodes_text/3
]).

:- use_module('./meta_interpreter', [
    shapiro_mode/3,
    debug_incomplete/2,
    debug_nonterminating/2
]).

% ---------------------------------------------------------------------------
% shapiro_diagnose(+Goal, -Mode, -Data)
% Unified Shapiro dispatcher.
% ---------------------------------------------------------------------------

shapiro_diagnose(Goal, Mode, Data) :-
    meta_interpreter:shapiro_mode(Goal, Mode, Data).

% ---------------------------------------------------------------------------
% shapiro_nodes_text(+Mode, +Data, -Text)
% Human-readable serialisation for Python-side logging.
% ---------------------------------------------------------------------------

shapiro_nodes_text(ok, [], 'No issues found (goal behaves correctly).') :- !.

shapiro_nodes_text(nonterminating, [], 'Non-termination detected but no non-progressing clause found.') :- !.

shapiro_nodes_text(nonterminating, Nodes, Text) :-
    !,
    with_output_to(atom(Text), (
        write('TERMINATION DEBUGGER -- non-progressing clauses:\n'),
        forall(
            member(non_progressing(H, B, Rec), Nodes),
            format('  Head   : ~w\n  Body   : ~w\n  RecCall: ~w\n\n', [H, B, Rec])
        )
    )).

shapiro_nodes_text(incomplete, [], 'Incompleteness suspected but predicate is undefined.') :- !.

shapiro_nodes_text(incomplete, Nodes, Text) :-
    !,
    with_output_to(atom(Text), (
        write('INCOMPLETENESS DEBUGGER -- existing clauses shown to oracle:\n'),
        forall(
            member(clause(H, B), Nodes),
            (   B == true
            ->  format('  ~w.  (fact)\n', [H])
            ;   format('  ~w :-\n    ~w\n', [H, B])
            )
        )
    )).

shapiro_nodes_text(incorrect, [], 'Incorrectness mode: goal succeeded but proof tree was empty.') :- !.

shapiro_nodes_text(incorrect, Nodes, Text) :-
    !,
    with_output_to(atom(Text), (
        write('INCORRECTNESS DEBUGGER -- proof-tree nodes queued for oracle:\n'),
        forall(
            member(node(G, B, D), Nodes),
            (   B == true
            ->  format('  [depth ~w] ~w  (fact)\n', [D, G])
            ;   format('  [depth ~w] ~w :-\n    ~w\n', [D, G, B])
            )
        )
    )).

shapiro_nodes_text(_, _, 'Unknown Shapiro mode.').
