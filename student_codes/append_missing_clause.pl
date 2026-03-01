% Append - missing clause (error)
% No clause for appending to empty list
% ERROR: missing_clause, confidence: 85%

% BUG: Missing base case append([], L, L).

append_wrong([H|T1], L2, [H|T3]) :-
    append_wrong(T1, L2, T3).
