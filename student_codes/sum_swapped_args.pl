% Sum list - ARGUMENT ORDER SWAPPED
% sum_list(Sum, List)

sum_list(0, []).
sum_list(Sum, [H|T]) :-
    sum_list(Rest, T),
    Sum is H + Rest.
