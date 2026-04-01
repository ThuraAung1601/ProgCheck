append([], L).
append([H|T], L) :-
    append(T, L).
