% Member - wrong variable binding (error)
% Variable used before being bound
% ERROR: wrong_variable_binding, confidence: 70%

member_wrong(X, [H|_]) :-
    % BUG: X used in comparison before being bound
    X > 0,
    X = H.
member_wrong(X, [_|T]) :-
    member_wrong(X, T).
