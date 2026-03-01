% Sum list - OVERLY GENERAL BASE CASE

sum_list(_, 0).
sum_list([H|T], Sum) :-
    sum_list(T, RestSum),
    Sum is H + RestSum.
