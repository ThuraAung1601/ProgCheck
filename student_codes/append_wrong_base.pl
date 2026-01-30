% Append - WRONG BASE CASE
% Base case incorrectly returns empty list

append([], _, []).
append([H|T1], L2, [H|T3]) :-
    append(T1, L2, T3).
