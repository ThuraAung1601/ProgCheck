% Member - ARGUMENT ORDER SWAPPED
% member(List, Element)

member([X|_], X).
member([_|T], X) :-
    member(T, X).
