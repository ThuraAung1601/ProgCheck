% Family relations - ARGUMENT ORDER SWAPPED

parent(tom, bob).
parent(tom, liz).
parent(bob, ann).
parent(bob, pat).
parent(pat, jim).

grandparent(Y, X) :-
    parent(Y, Z),
    parent(Z, X).

sibling(X, Y) :-
    parent(P, X),
    parent(P, Y),
    X \= Y.
