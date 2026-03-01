% Max - SWAPPED RESULT ARGUMENT
% Returns Y when X >= Y (wrong), so max(7, 2, Max)
% gives Max = 2 instead of Max = 7.

max(X, Y, Y) :- X >= Y, !.
max(_, Y, Y).
