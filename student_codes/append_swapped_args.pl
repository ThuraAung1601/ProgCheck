% Append - ARGUMENT ORDER SWAPPED
% Correct logic but argument order is (Result, L1, L2)

append([], L, L).
append([H|T], L2, [H|R]) :-
    append(T, L2, R).
