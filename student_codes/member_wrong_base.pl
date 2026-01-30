% Member - WRONG BASE CASE
% Base case incorrectly claims any element is a member of empty list

member(_, []).
member(X, [X|_]).
member(X, [_|T]) :-
    member(X, T).
