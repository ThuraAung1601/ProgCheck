% Sum list - WRONG BASE CASE
% Base case incorrectly sets sum of empty list to 1

sum_list([], 1).
sum_list([H|T], Sum) :-
    sum_list(T, RestSum),
    Sum is H + RestSum.
