% Family relations - WRONG BASE CASE

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

% Wrong base case for sibling: allows X to be sibling of itself
sibling(X, X).
sibling(X, Y) :-
    parent(P, X),
    parent(P, Y),
    X \= Y.
