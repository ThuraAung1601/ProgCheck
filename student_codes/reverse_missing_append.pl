% Student's attempt at list reversal - has bugs
reverse_list([], []).
reverse_list([H|T], R) :-
    reverse_list(T, RT),
    append([H], RT, R).  % This works but is inefficient and requires append to be defined
