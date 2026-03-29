reverse_list([H|T], R) :-
    reverse_list(T, RevT),
    append(RevT, [H], R).
