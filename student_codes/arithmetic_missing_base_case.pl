% Factorial - MISSING BASE CASE (will trigger algorithmic debugging!)
% This is WRONG - no base case to stop recursion

factorial(N, F) :- 
    N > 0,
    N1 is N - 1,
    factorial(N1, F1),
    F is N * F1.

% Fibonacci - also missing base cases
fibonacci(N, F) :- 
    N > 1,
    N1 is N - 1,
    N2 is N - 2,
    fibonacci(N1, F1),
    fibonacci(N2, F2),
    F is F1 + F2.

% Sum list - this one is correct (has base case)
sum_list([], 0).
sum_list([H|T], Sum) :- 
    sum_list(T, RestSum),
    Sum is H + RestSum.
