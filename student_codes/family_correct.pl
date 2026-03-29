parent(tom, bob).
parent(tom, liz).
parent(bob, ann).
parent(bob, pat).
parent(pat, jim).
grandparent(X, Y) :-
    parent(X, Z),
    parent(Z, Y).
sibling(X, Y) :-
    parent(P, X),
    parent(P, Y),
    X \= Y.
