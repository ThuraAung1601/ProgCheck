% Reverse - non-decreasing recursion (error)
% Recursive call doesn't make list smaller
% ERROR: non_decreasing_recursion, confidence: 80%

reverse_wrong([], []).
reverse_wrong([H|T], R) :-
    % BUG: Should use T, not [H|T]
    reverse_wrong([H|T], RT),
    append(RT, [H], R).
