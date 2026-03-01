% Max - OVERUSE OF CUT
% Cut placed in both clauses prevents backtracking globally,
% but the real problem is the condition in the second clause
% is inverted: it uses X >= Y again, so max(2, 5, _) fails.

max(X, Y, X) :- X >= Y, !.
max(X, Y, Y) :- X >= Y, !.
