% Sum of numbers - BUGGY (missing base case)

% BUG: No base case for empty list
% This will cause infinite recursion or failure

sum_list([H|T], Sum) :-
    sum_list(T, RestSum),
    Sum is H + RestSum.
