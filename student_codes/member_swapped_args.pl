member([X|_], X).
member([_|T], X) :-
    member(T, X).
