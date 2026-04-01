sum_list([H|T], Sum) :-
    sum_list(T, RestSum),
    Sum is H + RestSum.
