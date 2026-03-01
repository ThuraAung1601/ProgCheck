% Factorial - ARGUMENT ORDER SWAPPED

factorial(F, N) :-
    N =:= 0,
    F = 1.
factorial(F, N) :-
    N > 0,
    N1 is N - 1,
    factorial(F1, N1),
    F is N * F1.
