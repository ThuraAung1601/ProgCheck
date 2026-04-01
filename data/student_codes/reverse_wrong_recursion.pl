reverse_wrong([], []).
reverse_wrong([H|T], R) :-
    reverse_wrong([H|T], RT),
    append(RT, [H], R).
