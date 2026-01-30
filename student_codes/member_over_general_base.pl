% Member - OVERLY GENERAL BASE CASE

member(_, _).
member(X, [_|T]) :-
    member(X, T).
