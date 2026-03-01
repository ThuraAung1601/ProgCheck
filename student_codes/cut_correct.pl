% Max - CORRECT implementation using cut

max(X, Y, X) :- X >= Y, !.
max(_, Y, Y).
