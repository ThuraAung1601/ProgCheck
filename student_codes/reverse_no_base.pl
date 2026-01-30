% Reverse list - MISSING BASE CASE

reverse_list([H|T], R) :- 
    reverse_list(T, RevT),
    append(RevT, [H], R).

% Missing: reverse_list([], []).
