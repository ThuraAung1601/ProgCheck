% cut_max_test.pl - test cases for max/3
%
% X < Y variable tests expose cut_wrong_position (cut before guard):
%   Buggy:   max(X,Y,X) :- !, X>=Y  -> cut fires first, guard fails, no backtrack -> Actual=[]
%   Correct: max(X,Y,X) :- X>=Y, !  -> guard fails first, backtracks to clause 2 -> M=larger
%
% NOTE: cut_missing_cut (no cut) CANNOT be detected here because
% call_with_depth_limit is deterministic (only yields the first solution),
% so multi-solution non-determinism is invisible to validate_with_tests.
%
% Ground tests (all correct implementations pass these):
test(max(5, 3, 5),   [max(5, 3, 5)]).
test(max(7, 2, 7),   [max(7, 2, 7)]).
test(max(10, 1, 10), [max(10, 1, 10)]).
test(max(4, 4, 4),   [max(4, 4, 4)]).

% X < Y variable tests -- FAIL with cut_wrong_position only:
test(max(3, 5, X),  [max(3, 5, 5)]).
test(max(1, 10, X), [max(1, 10, 10)]).
test(max(0, 7, X),  [max(0, 7, 7)]).
test(max(2, 8, X),  [max(2, 8, 8)]).
