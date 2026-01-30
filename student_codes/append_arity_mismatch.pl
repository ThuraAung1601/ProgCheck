% Append - ARITY MISMATCH

append([], L).
append([H|T], L) :-
    append(T, L).
