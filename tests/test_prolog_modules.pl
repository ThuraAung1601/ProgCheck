:- begin_tests(prolog_parser).

:- use_module('../src/prolog/prolog_parser').

test(parser_returns_structured_error_for_simple_fact, [nondet]) :-
    parse_prolog_string("parent(alice,bob).", Result),
    assertion(Result = errors(Errors)),
    assertion(member(unexpected_tokens(_), Errors)).

test(missing_period_input_returns_errors, [nondet]) :-
    parse_prolog_string("factorial(0,1)", Result),
    assertion(Result = errors(Errors)),
    assertion(member(unexpected_tokens(_), Errors)).

test(formats_invalid_operator_message, [nondet]) :-
    format_parse_errors([error(invalid_operator(':='))], Messages),
    Messages = [First|_],
    sub_string(First, _, _, _, "Invalid operator").

test(formats_missing_period_message, [nondet]) :-
    format_parse_errors([error(missing_period)], Messages),
    Messages = [First|_],
    sub_string(First, _, _, _, "Missing period").

test(formats_unmatched_parentheses_message, [nondet]) :-
    format_parse_errors([error(unmatched_parentheses)], Messages),
    Messages = [First|_],
    sub_string(First, _, _, _, "Unmatched parentheses").

:- end_tests(prolog_parser).
