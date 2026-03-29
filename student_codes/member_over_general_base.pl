member(_, _).
member(X, [_|T]) :-
    member(X, T).
