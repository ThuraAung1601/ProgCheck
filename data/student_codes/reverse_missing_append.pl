reverse_list([], []).
reverse_list([H|T], R) :-
    reverse_list(T, RT),
    append([H], RT, R).
