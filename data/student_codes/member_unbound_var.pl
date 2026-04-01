member_wrong(X, [H|_]) :-
    X > 0,
    X = H.
member_wrong(X, [_|T]) :-
    member_wrong(X, T).
