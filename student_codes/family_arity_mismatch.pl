% Family relations - ARITY MISMATCH

parent(tom, bob).
parent(bob, ann).

grandparent(X, Y, Z) :-
    parent(X, Y),
    parent(Y, Z).
