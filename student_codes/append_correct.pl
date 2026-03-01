% List append - CORRECT implementation
% Concatenates two lists

append([], L, L).
append([H|T1], L2, [H|T3]) :-
    append(T1, L2, T3).
