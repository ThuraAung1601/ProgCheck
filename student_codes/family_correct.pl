% Family relations - CORRECT implementation

% Background facts
parent(tom, bob).
parent(tom, liz).
parent(bob, ann).
parent(bob, pat).
parent(pat, jim).

% Grandparent relation
grandparent(X, Y) :-
    parent(X, Z),
    parent(Z, Y).

% Sibling relation
sibling(X, Y) :-
    parent(P, X),
    parent(P, Y),
    X \= Y.
