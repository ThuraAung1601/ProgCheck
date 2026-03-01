% Max - MISSING FALLBACK CLAUSE
% No second clause to handle the case when X < Y,
% so max(2, 5, _) fails entirely.

max(X, Y, X) :- X >= Y, !.
