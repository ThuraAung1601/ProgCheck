factorial(0).
factorial(N) :-
    N > 0,
    N1 is N - 1,
    factorial(N1).
