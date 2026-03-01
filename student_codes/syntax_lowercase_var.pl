% Test file with LOWERCASE VARIABLE error
factorial(0, 1).
factorial(N, f) :- N > 0, N1 is N-1, factorial(N1, F1), f is N*F1.
