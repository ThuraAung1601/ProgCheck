% Max - CUT IN WRONG POSITION
% Cut is placed before the condition check, so it commits
% before verifying X >= Y, causing max(1, 5, _) to fail
% instead of returning 5.

max(X, Y, X) :- !, X >= Y.
max(_, Y, Y).
