% Family relations - BUGGY (reversed parent arguments)

% Background facts
parent(tom, bob).
parent(tom, liz).
parent(bob, ann).
parent(bob, pat).
parent(pat, jim).

% BUG: Arguments reversed in grandparent rule
% Should be parent(X,Z), parent(Z,Y)
% But written as parent(Z,X), parent(Y,Z)
grandparent(X, Y) :-
    parent(Z, X),
    parent(Y, Z).

% Sibling is correct
sibling(X, Y) :-
    parent(P, X),
    parent(P, Y),
    X \= Y.
