% =============================================================================
% PROLOG PARSER (BNF-based with explicit difference lists)
% Grammar-based syntax checker using normal Prolog syntax (not DCG)
% Replaces regex-based approach with proper BNF grammar implementation
% =============================================================================

:- module(prolog_parser, [
    parse_prolog_file/2,
    parse_prolog_string/2,
    format_parse_errors/2
]).

% =============================================================================
% PUBLIC INTERFACE
% =============================================================================

% parse_prolog_file(+FilePath, -Result)
% Result is either ok or errors(ErrorList)
parse_prolog_file(FilePath, Result) :-
    catch(
        read_file_to_string(FilePath, Content, []),
        Error,
        (Result = errors([file_read_error(FilePath, Error)]), !)
    ),
    !,
    parse_prolog_string(Content, Result).

% parse_prolog_string(+CodeString, -Result)
% Parse Prolog code and return ok or errors(List)
parse_prolog_string(CodeString, Result) :-
    tokenize(CodeString, Tokens),
    (   program(AST, Tokens, Remaining)
    ->  (   Remaining = []
        ->  Result = ok(AST)
        ;   Result = errors([unexpected_tokens(Remaining)])
        )
    ;   collect_parse_errors(CodeString, Tokens, Errors),
        Result = errors(Errors)
    ).

% format_parse_errors(+ErrorList, -FormattedMessages)
% Convert error terms to student-friendly messages
format_parse_errors([], []).
format_parse_errors([Error|Rest], [Msg|Msgs]) :-
    error_to_message(Error, Msg),
    format_parse_errors(Rest, Msgs).

% =============================================================================
% TOKENIZER (using difference lists)
% =============================================================================

tokenize(String, Tokens) :-
    string_codes(String, Codes0),
    strip_comments(Codes0, Codes),
    token_list(RawTokens, Codes, []),
    map_ops(RawTokens, Tokens).

% Remove line comments (%) and block comments (/* ... */)
strip_comments([], []).
strip_comments([0'%|Rest], Clean) :-  % line comment
    skip_to_eol(Rest, After),
    strip_comments(After, Clean).
strip_comments([0'/,0'*|Rest], Clean) :-  % block comment start
    skip_block_comment(Rest, After),
    strip_comments(After, Clean).
strip_comments([C|Rest], [C|CleanRest]) :-
    strip_comments(Rest, CleanRest).

skip_to_eol([], []).
skip_to_eol([0'\n|Rest], Rest) :- !.
skip_to_eol([_|Rest], Out) :- skip_to_eol(Rest, Out).

skip_block_comment([], []).
skip_block_comment([0'*,0'/|Rest], Rest) :- !.
skip_block_comment([_|Rest], Out) :- skip_block_comment(Rest, Out).

% Main tokenization rule
token_list([], S, S) :- skip_whites(S, S1), S1 = [].
token_list([T|Ts], S0, S) :-
    skip_whites(S0, S1),
    S1 \= [],
    token(T, S1, S2),
    !,
    token_list(Ts, S2, S).
token_list([], S0, S) :- skip_whites(S0, S).

% Reclassify atoms that are declared operators in the current Prolog environment
map_ops([], []).
map_ops([atom(A)|Rest], [op(A)|Out]) :-
    current_op(_, _, A),
    !,
    map_ops(Rest, Out).
map_ops([T|Rest], [T|Out]) :-
    map_ops(Rest, Out).

% Individual token patterns
token(period, [46|S], S) :- !.  % 0'.
token(comma, [44|S], S) :- !.  % 0',
token(lparen, [40|S], S) :- !.  % 0'(
token(rparen, [41|S], S) :- !.  % 0')
token(lbracket, [91|S], S) :- !.  % 0'[
token(rbracket, [93|S], S) :- !.  % 0']
token(pipe, [124|S], S) :- !.  % 0'|
token(neck, [58, 45|S], S) :- !.  % :-
token(query_start, [63, 45|S], S) :- !.  % ?-
token(semicolon, [59|S], S) :- !.  % 0';
token(cut, [33|S], S) :- !.  % 0'!

% Numbers
token(number(N), S0, S) :-
    optional_sign(Sign, S0, S1),
    S1 = [D0|_],
    is_digit(D0),
    collect_digits(Ds, S1, S2),
    optional_fraction(Frac, S2, S),
    number_codes(Base, Ds),
    (Frac = none -> N is Sign * Base ; N is Sign * (Base + Frac)).

optional_sign(-1, [45|S], S) :- !.  % 0'-
optional_sign(1, S, S).

optional_fraction(Frac, [46|S0], S) :-  % 0'.
    !,
    S0 = [D|_],
    is_digit(D),
    collect_digits(Ds, S0, S),
    number_codes(F, Ds),
    length(Ds, Len),
    Frac is F / (10 ** Len).
optional_fraction(none, S, S).

is_digit(C) :- C >= 48, C =< 57.  % 0'0 to 0'9

collect_digits([D|Ds], [D|S0], S) :-
    is_digit(D),
    !,
    collect_digits(Ds, S0, S).
collect_digits([], S, S).

% Variables (start with uppercase or underscore)
token(var(Name), [C|S0], S) :-
    (code_type(C, upper) ; C = 95),  % 0'_
    !,
    alphanum_codes(Cs, S0, S),
    atom_codes(Name, [C|Cs]).

% Atoms (start with lowercase)
token(atom(Name), [C|S0], S) :-
    code_type(C, lower),
    !,
    alphanum_codes(Cs, S0, S),
    atom_codes(Name, [C|Cs]).

% Quoted atoms
token(atom(Name), [39|S0], S) :-  % 0''
    !,
    quoted_chars(Cs, S0, [39|S]),  % 0''
    atom_codes(Name, Cs).

% Strings
token(string(Str), [34|S0], S) :-  % 0'"
    !,
    string_chars(Cs, S0, [34|S]),  % 0'"
    atom_codes(Str, Cs).

% Operators
token(op(is), [105, 115|S0], S) :- ws_boundary(S0), S = S0, !.  % is
token(op('='), [61|S], S) :- !.  % =
token(op('\\='), [92, 61|S], S) :- !.  % \=
token(op('=='), [61, 61|S], S) :- !.  % ==
token(op('\\=='), [92, 61, 61|S], S) :- !.  % \==
token(op('<'), [60|S], S) :- !.  % <
token(op('>'), [62|S], S) :- !.  % >
token(op('=<'), [61, 60|S], S) :- !.  % =<
token(op('>='), [62, 61|S], S) :- !.  % >=
token(op('+'), [43|S], S) :- !.  % +
token(op('-'), [45|S], S) :- !.  % -
token(op('*'), [42|S], S) :- !.  % *
token(op('/'), [47|S], S) :- S \= [42|_], !.  % / (not /*)
token(op('//'), [47, 47|S], S) :- !.  % //
token(op(mod), [109, 111, 100|S0], S) :- ws_boundary(S0), S = S0, !.  % mod
token(op('=..'), [61, 46, 46|S], S) :- !.  % =..
token(op('\\+'), [92, 43|S], S) :- !.  % \+

% Invalid operators (common mistakes)
token(invalid_op(':='), [58, 61|S], S) :- !.  % :=
token(invalid_op('!='), [33, 61|S], S) :- !.  % !=
token(invalid_op('&&'), [38, 38|S], S) :- !.  % &&
token(invalid_op('||'), [124, 124|S], S) :- !.  % ||

% Helper predicates
ws_boundary([]).
ws_boundary([C|_]) :-
    \+ code_type(C, alnum),
    C \= 95.  % 0'_

skip_whites([C|S0], S) :-
    code_type(C, space),
    !,
    skip_whites(S0, S).
skip_whites(S, S).

alphanum_codes([C|Cs], [C|S0], S) :-
    (code_type(C, alnum) ; C = 95),  % 0'_
    !,
    alphanum_codes(Cs, S0, S).
alphanum_codes([], S, S).

quoted_chars([C|Cs], [C|S0], S) :-
    C \= 39,  % 0''
    !,
    quoted_chars(Cs, S0, S).
quoted_chars([], S, S).

string_chars([C|Cs], [C|S0], S) :-
    C \= 34,  % 0'"
    !,
    string_chars(Cs, S0, S).
string_chars([], S, S).

% =============================================================================
% BNF GRAMMAR RULES (using explicit difference lists)
% =============================================================================

% Top-level program
program([], S, S).
program([Clause|Clauses], S0, S) :-
    clause(Clause, S0, S1),
    program(Clauses, S1, S).

% Clause types
clause(fact(Term), S0, S) :-
    term(Term, S0, [period|S]),
    !.

clause(rule(Head, Body), S0, S) :-
    term(Head, S0, [neck|S1]),
    body(Body, S1, [period|S]),
    !.

clause(query(Body), [query_start|S0], S) :-
    body(Body, S0, [period|S]),
    !.

clause(error(invalid_operator(Op)), [invalid_op(Op)|S], S) :- !.

% Clause body (goals separated by comma or semicolon)
body(conjunction(G1, G2), S0, S) :-
    goal(G1, S0, [comma|S1]),
    !,
    body(G2, S1, S).

body(disjunction(G1, G2), S0, S) :-
    goal(G1, S0, [semicolon|S1]),
    !,
    body(G2, S1, S).

body(Goal, S0, S) :-
    goal(Goal, S0, S).

% Goal is a term
goal(Term, S0, S) :- term(Term, S0, S).

% Terms
% Try infix expressions first so constructs like X >= Y are parsed as a single term.
term(Term, S0, S) :- infix_expr(Term, S0, S), !.
term(Term, S0, S) :- simple_term(Term, S0, S).

% Basic term forms (no infix operators)
simple_term(var(V), [var(V)|S], S) :- !.
simple_term(number(N), [number(N)|S], S) :- !.
simple_term(string(Str), [string(Str)|S], S) :- !.
simple_term(cut, [cut|S], S) :- !.
simple_term(Compound, S0, S) :- compound_term(Compound, S0, S), !.
simple_term(List, S0, S) :- parse_list(List, S0, S), !.
simple_term(atom(A), [atom(A)|S], S) :- !.

% Compound terms: functor(arg1, arg2, ...)
compound_term(compound(Functor, Args), [atom(Functor), lparen|S0], S) :-
    arguments(Args, S0, [rparen|S]).

% Arguments
arguments([Arg], S0, S) :- term(Arg, S0, S), !.
arguments([Arg|Args], S0, S) :-
    term(Arg, S0, [comma|S1]),
    arguments(Args, S1, S).

% Infix expressions (simplified)
% Parse a simple term, followed by an operator token, then any term on the right.
% Using simple_term on the left avoids infinite recursion while still allowing
% nested infix expressions on the right via term/3.
infix_expr(infix(Op, Left, Right), S0, S) :-
    simple_term(Left, S0, [op(Op)|S1]),
    term(Right, S1, S).

% Lists
parse_list(empty_list, [lbracket, rbracket|S], S) :- !.
parse_list(list(Elements), [lbracket|S0], S) :-
    list_elements(Elements, S0, [rbracket|S]),
    !.
parse_list(list_cons(Elements, Tail), [lbracket|S0], S) :-
    list_elements(Elements, S0, [pipe|S1]),
    term(Tail, S1, [rbracket|S]),
    !.

list_elements([E], S0, S) :- term(E, S0, S), !.
list_elements([E|Es], S0, S) :-
    term(E, S0, [comma|S1]),
    list_elements(Es, S1, S).

% =============================================================================
% ERROR DETECTION AND RECOVERY
% =============================================================================

collect_parse_errors(_CodeString, Tokens, Errors) :-
    findall(Error, detect_token_error(Tokens, Error), TokenErrors),
    findall(Error, detect_structural_error(Tokens, Error), StructErrors),
    append(TokenErrors, StructErrors, Errors).

% Detect errors in token stream
detect_token_error(Tokens, error(invalid_operator(Op))) :-
    member(invalid_op(Op), Tokens).

detect_token_error(Tokens, error(lowercase_variable(Var))) :-
    member(atom(Var), Tokens),
    is_likely_variable(Var).

% Detect structural errors
detect_structural_error(Tokens, error(missing_period)) :-
    \+ member(period, Tokens),
    (member(neck, Tokens) ; member(atom(_), Tokens)).

detect_structural_error(Tokens, error(unmatched_parentheses)) :-
    count_tokens(Tokens, lparen, Open),
    count_tokens(Tokens, rparen, Close),
    Open \= Close.

detect_structural_error(Tokens, error(unmatched_brackets)) :-
    count_tokens(Tokens, lbracket, Open),
    count_tokens(Tokens, rbracket, Close),
    Open \= Close.

detect_structural_error(Tokens, error(missing_clause_body)) :-
    append(_Before, [neck, period|_], Tokens).

detect_structural_error(Tokens, error(trailing_comma)) :-
    append(_, [comma, period], Tokens).

% Helpers
count_tokens(Tokens, Type, Count) :-
    findall(1, member(Type, Tokens), Ones),
    length(Ones, Count).

is_likely_variable(Atom) :-
    atom_chars(Atom, [First|Rest]),
    char_type(First, lower),
    length(Rest, Len),
    Len =< 2,
    \+ member(Atom, [is, mod, div, abs, sin, cos, exp, log, max, min, true, false, fail]).

% =============================================================================
% ERROR MESSAGES
% =============================================================================

error_to_message(file_read_error(File, Details), Message) :-
    format(string(Message), 
        "Cannot read file '~w'~n  Details: ~w~n  Hint: Check if the file exists and is readable.", 
        [File, Details]).

error_to_message(error(invalid_operator(Op)), Message) :-
    operator_suggestion(Op, Suggestion),
    format(string(Message),
        "Invalid operator: ~w~n  Hint: ~w",
        [Op, Suggestion]).

error_to_message(error(lowercase_variable(Var)), Message) :-
    upcase_atom(Var, Upper),
    format(string(Message),
        "Variable '~w' starts with lowercase~n  Hint: Variables must start with uppercase or underscore. Try: ~w",
        [Var, Upper]).

error_to_message(error(missing_period), Message) :-
    Message = "Missing period at end of clause~n  Hint: Every Prolog fact or rule must end with a period (.)".

error_to_message(error(unmatched_parentheses), Message) :-
    Message = "Unmatched parentheses~n  Hint: Every ( must have a matching )".

error_to_message(error(unmatched_brackets), Message) :-
    Message = "Unmatched brackets~n  Hint: Every [ must have a matching ]".

error_to_message(error(missing_clause_body), Message) :-
    Message = "Missing clause body after :-~n  Hint: Add goals after :- or remove :- to make it a fact".

error_to_message(error(trailing_comma), Message) :-
    Message = "Trailing comma before period~n  Hint: Remove the comma before the period".

error_to_message(unexpected_tokens(Tokens), Message) :-
    format(string(Message),
        "Unexpected tokens at end: ~w~n  Hint: Check for extra text after the last period",
        [Tokens]).

error_to_message(Error, Message) :-
    format(string(Message), "Parse error: ~w", [Error]).

% Operator suggestions
operator_suggestion(':=', 'Use "is" for arithmetic assignment (X is 5)').
operator_suggestion('!=', 'Use "\\=" for inequality (X \\= Y)').
operator_suggestion('&&', 'Use "," for conjunction (goal1, goal2)').
operator_suggestion('||', 'Use ";" for disjunction (goal1 ; goal2)').
operator_suggestion(Op, 'Invalid operator') :- atom(Op).
