sum_list([]).
sum_list([_|T]) :-
    sum_list(T).
