#!/usr/bin/env python
"""
Reset the ProgCheck ZODB database.

Deletes all existing database files and creates a fresh, empty database
that matches the current class diagram models.

Usage:
    python reset_db.py               # reset with no seed data
    python reset_db.py --seed        # reset + full demo data
    python reset_db.py --path PATH   # custom .fs file path
"""
import sys
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from ZODB import FileStorage, DB
    import transaction
except ImportError:
    print("[ERROR] ZODB not installed. Run: pip install ZODB")
    sys.exit(1)

from datetime import datetime, timedelta
from src.database.models import (
    Database, Teacher, Student,
    Classroom, Lab, LabQuestion, TestCase,
)


ZODB_EXTENSIONS = ["", ".index", ".tmp", ".lock"]


# ── helpers ──────────────────────────────────────────────────────────────────

def delete_db_files(db_path: Path) -> int:
    deleted = 0
    for ext in ZODB_EXTENSIONS:
        f = Path(str(db_path) + ext)
        if f.exists():
            try:
                f.unlink()
                print(f"  deleted: {f.name}")
                deleted += 1
            except PermissionError:
                print(f"  [ERROR] Cannot delete {f.name} - file is locked.")
                print(f"          Stop the server first (Ctrl+C), then re-run this script.")
                sys.exit(1)
    return deleted


def create_fresh_db(db_path: Path) -> DB:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    s = FileStorage.FileStorage(str(db_path))
    db = DB(s)
    conn = db.open()
    conn.root()["database"] = Database()
    transaction.commit()
    conn.close()
    print(f"[OK] Fresh database created at {db_path}")
    return db


def _make_question(qid: int, qnum: int, title: str, problem: str,
                   test_cases: list[tuple[str, str]]) -> LabQuestion:
    """Build a LabQuestion with attached TestCases."""
    q = LabQuestion(qid, title, problem, question_number=qnum)
    for i, (inp, expected) in enumerate(test_cases, start=1):
        tc = TestCase(qid * 100 + i)
        tc.create_testcase(inp, expected)
        q.add_testcase(tc)
    return q


def _make_lab(lab_id: int, title: str, classroom_id: int,
              questions: list[LabQuestion],
              active_time: datetime = None,
              complete_time: datetime = None) -> Lab:
    """Build a Lab with attached LabQuestions."""
    lab = Lab(lab_id, title)
    lab.classroom_id = classroom_id
    lab.active_time = active_time
    lab.complete_time = complete_time
    for q in questions:
        lab.add_question(q)
    return lab


# ── seed data ────────────────────────────────────────────────────────────────

def seed_demo_data(db: DB):
    conn = db.open()
    data = conn.root()["database"]

    # ── Teachers ──────────────────────────────────────────────────────────

    t1 = Teacher("T001", "prof_anderson", "anderson123")
    t1.settings.display_name = "Prof. Anderson"
    t1.settings.email = "anderson@uni.edu"
    data.teachers["T001"] = t1

    t2 = Teacher("T002", "prof_smith", "smith456")
    t2.settings.display_name = "Prof. Smith"
    t2.settings.email = "smith@uni.edu"
    data.teachers["T002"] = t2

    teacher = t1   # alias used below for classroom ownership

    # ── Students ──────────────────────────────────────────────────────────
    # S001 enrolled in C101 + C202  (NOT C303)
    # S002 enrolled in C101 only
    # S003 enrolled in C101 + C202 + C303
    # S004 enrolled in C202 only

    s1 = Student("S001", "alice", "alice123")
    s1.settings.display_name = "Alice"
    s1.settings.email = "alice@student.edu"
    data.students["S001"] = s1

    s2 = Student("S002", "bob", "bob456")
    s2.settings.display_name = "Bob"
    s2.settings.email = "bob@student.edu"
    data.students["S002"] = s2

    s3 = Student("S003", "charlie", "charlie789")
    s3.settings.display_name = "Charlie"
    s3.settings.email = "charlie@student.edu"
    data.students["S003"] = s3

    s4 = Student("S004", "diana", "diana000")
    s4.settings.display_name = "Diana"
    s4.settings.email = "diana@student.edu"
    data.students["S004"] = s4

    # ── Classroom 101 : Introduction to Prolog  (S001, S002, S003) ────────

    c101 = Classroom(101, "Introduction to Prolog", "T001")
    c101.prerequisites = "None"
    c101.add_student("S001")
    c101.add_student("S002")
    c101.add_student("S003")
    teacher.courses_teach.append(101)

    _now = datetime.now()
    _yesterday = _now - timedelta(days=1)
    _next_week = _now + timedelta(days=7)
    _two_weeks = _now + timedelta(days=14)
    _past_end = _now - timedelta(hours=1)   # already completed

    lab1 = _make_lab(
        lab_id=1001,
        title="Basic Facts & Queries",
        classroom_id=101,
        active_time=_yesterday,
        complete_time=_next_week,
        questions=[
            _make_question(
                qid=10011, qnum=1, title="Parent Fact",
                problem=(
                    "Write a Prolog fact that states 'alice is a parent of bob'.\n"
                    "Then write a query to check if alice is a parent of bob."
                ),
                test_cases=[
                    ("parent(alice, bob)", "true"),
                    ("parent(bob, alice)", "false"),
                ],
            ),
            _make_question(
                qid=10012, qnum=2, title="Parent Fact",
                problem=(
                    "Define facts for the following: john likes pizza, "
                    "mary likes pasta, john likes pasta.\n"
                    "Write a rule 'both_like(X, Y)' that is true when X and Y "
                    "both like the same food."
                ),
                test_cases=[
                    ("both_like(john, mary)", "true"),
                    ("both_like(john, john)", "true"),
                    ("both_like(mary, john)", "true"),
                ],
            ),
        ],
    )

    lab2 = _make_lab(
        lab_id=1002,
        title="Unification & Variables",
        classroom_id=101,
        active_time=_next_week,
        complete_time=_two_weeks,
        questions=[
            _make_question(
                qid=10021, qnum=1, title="Unification Example",
                problem=(
                    "Explain what happens when Prolog evaluates the query:\n"
                    "  ?- X = foo(Y), Y = bar.\n"
                    "Write a predicate 'unified(X)' that unifies X with foo(bar)."
                ),
                test_cases=[
                    ("unified(foo(bar))", "true"),
                    ("unified(foo(baz))", "false"),
                ],
            ),
        ],
    )

    data.labs[lab1.lab_id] = lab1
    data.labs[lab2.lab_id] = lab2
    c101.lab_ids.append(lab1.lab_id)
    c101.lab_ids.append(lab2.lab_id)
    data.classrooms[101] = c101

    # ── Classroom 202 : Logic Programming  (S001, S003, S004) ─────────────

    c202 = Classroom(202, "Logic Programming", "T001")
    c202.prerequisites = "Introduction to Prolog"
    c202.add_student("S001")
    c202.add_student("S003")
    c202.add_student("S004")
    teacher.courses_teach.append(202)

    lab3 = _make_lab(
        lab_id=2001,
        title="Recursive Predicates",
        classroom_id=202,
        active_time=_yesterday,
        complete_time=_next_week,
        questions=[
            _make_question(
                qid=20011, qnum=1, title="Factorial",
                problem=(
                    "Write a recursive predicate 'factorial(N, F)' where F is "
                    "the factorial of N.\n"
                    "Base case: factorial(0, 1)."
                ),
                test_cases=[
                    ("factorial(0, 1)", "true"),
                    ("factorial(3, 6)", "true"),
                    ("factorial(5, 120)", "true"),
                ],
            ),
            _make_question(
                qid=20012, qnum=2, title="List Length",
                problem=(
                    "Write a predicate 'list_length(List, Len)' that computes "
                    "the length of a list using recursion.\n"
                    "Do not use the built-in length/2."
                ),
                test_cases=[
                    ("list_length([], 0)", "true"),
                    ("list_length([a,b,c], 3)", "true"),
                    ("list_length([1,2,3,4,5], 5)", "true"),
                ],
            ),
        ],
    )

    lab4 = _make_lab(
        lab_id=2002,
        title="List Operations",
        classroom_id=202,
        active_time=_yesterday,
        complete_time=_next_week,
        questions=[
            _make_question(
                qid=20021, qnum=1, title="List Append",
                problem=(
                    "Write a predicate 'my_append(L1, L2, L3)' that appends "
                    "list L2 to L1, giving L3.\n"
                    "Base case: my_append([], L, L)."
                ),
                test_cases=[
                    ("my_append([], [1,2], [1,2])", "true"),
                    ("my_append([a,b], [c], [a,b,c])", "true"),
                ],
            ),
            _make_question(
                qid=20022, qnum=2,  title="List Reverse",
                problem=(
                    "Write a predicate 'my_reverse(List, Reversed)' that reverses "
                    "a list.\n"
                    "Hint: use an accumulator."
                ),
                test_cases=[
                    ("my_reverse([1,2,3], [3,2,1])", "true"),
                    ("my_reverse([], [])", "true"),
                ],
            ),
            _make_question(
                qid=20023, qnum=3, title="List Member",
                problem=(
                    "Write a predicate 'my_member(X, List)' that succeeds when "
                    "X is a member of List."
                ),
                test_cases=[
                    ("my_member(2, [1,2,3])", "true"),
                    ("my_member(5, [1,2,3])", "false"),
                ],
            ),
        ],
    )

    data.labs[lab3.lab_id] = lab3
    data.labs[lab4.lab_id] = lab4
    c202.lab_ids.append(lab3.lab_id)
    c202.lab_ids.append(lab4.lab_id)
    data.classrooms[202] = c202

    # ── Classroom 303 : AI Fundamentals  (S003 only — owned by T002) ──────

    c303 = Classroom(303, "AI Fundamentals", "T002")
    c303.prerequisites = "Logic Programming"
    c303.add_student("S003")   # S001, S002, S004 are NOT enrolled here
    t2.courses_teach.append(303)

    lab5 = _make_lab(
        lab_id=3001,
        title="Search Algorithms in Prolog",
        classroom_id=303,
        active_time=None,
        complete_time=None,
        questions=[
            _make_question(
                qid=30011, qnum=1, title="Depth-First Search",
                problem=(
                    "Implement a depth-first search predicate 'dfs(Start, Goal, Path)' "
                    "over an edge/2 graph.\n"
                    "Represent the graph as a set of edge(X,Y) facts."
                ),
                test_cases=[
                    ("dfs(a, c, Path)", "[a,b,c]"),
                    ("dfs(a, a, Path)", "[a]"),
                ],
            ),
        ],
    )

    lab6 = _make_lab(
        lab_id=3002,
        title="Cut & Negation",
        classroom_id=303,
        active_time=None,
        complete_time=None,
        questions=[
            _make_question(
                qid=30021, qnum=1, title="Cut - Maximum of Two Numbers",
                problem=(
                    "Write a predicate 'max(X, Y, Max)' that returns the maximum "
                    "of two numbers using cut."
                ),
                test_cases=[
                    ("max(3, 5, 5)", "true"),
                    ("max(7, 2, 7)", "true"),
                ],
            ),
        ],
    )

    data.labs[lab5.lab_id] = lab5
    data.labs[lab6.lab_id] = lab6
    c303.lab_ids.append(lab5.lab_id)
    c303.lab_ids.append(lab6.lab_id)
    data.classrooms[303] = c303

    # ── Playground Lab (global practice) ─────────────────────────

    playground_lab = _make_lab(
        lab_id=9999,
        title="Playground",
        classroom_id=None,  # not tied to one class
        active_time=_yesterday,
        complete_time=_two_weeks,
        questions=[
            _make_question(
                qid=99991,
                qnum=1,
                title="Ambiguous Operator Precedence",
                problem=(
                    "Problem: Ambiguous operator precedence example\n"
                    "Define predicate p/0 that succeeds if both a and b hold; otherwise, it should also succeed if both c and d hold. Facts a/0, b/0, c/0, d/0 are provided.\n"
                    "Clarify your intended precedence with parentheses if needed."
                ),
                test_cases=[
                    ("p", "true"),
                ]
            ),
            _make_question(
                qid=99992,
                qnum=2,
                title="Sum of Numbers in a List",
                problem=(
                    "Sum of Numbers Problem\n"
                    "Write a Prolog predicate sum_list/2 that computes the sum of all numbers in a list.\n"
                    "sum_list(L, S) should be true when S is the sum of all numbers in list L.\n"
                    "Requirements:\n"
                    "- Sum of empty list is 0\n"
                    "- Sum of [H|T] is H + sum of T"
                ),
                test_cases=[
                    ("sum_list([], 0)", "true"),
                    ("sum_list([1,2,3], 6)", "true"),
                    ("sum_list([5], 5)", "true"),
                    ("sum_list([1,2,3,4,5], 15)", "true"),
                ]
            ),
            _make_question(
                qid=99993,
                qnum=3,
                title="Cut - Maximum of Two Numbers",
                problem=(
                    "Cut - Maximum of Two Numbers Problem\n"
                    "Write a Prolog predicate max/3 that finds the maximum of two numbers using cut (!).\n"
                    "max(X, Y, Max) should be true when Max is the greater of X and Y.\n"
                    "Requirements:\n"
                    "- max(3, 5, 5) should be true\n"
                    "- max(7, 2, 7) should be true\n"
                    "- max(4, 4, 4) should be true\n"
                    "- max(0, 1, 1) should be true\n"
                    "- max(10, 3, 10) should be true\n"
                    "The predicate should handle:\n"
                    "- When X >= Y: Max is X (commit with cut to avoid redundant backtracking)\n"
                    "- When X < Y:  Max is Y (fallback clause)\n"
                    "Use cut (!) to make the predicate deterministic:\n"
                    "max(X, Y, X) :- X >= Y, !.\n"
                    "max(_, Y, Y)."
                ),
                test_cases=[
                    ("max(3, 5, 5)", "true"),
                    ("max(7, 2, 7)", "true"),
                    ("max(4, 4, 4)", "true"),
                    ("max(0, 1, 1)", "true"),
                    ("max(10, 3, 10)", "true"),
                ]
            ),
            _make_question(
                qid=99994,
                qnum=4,
                title="Factorial Problem",
                problem=(
                    "Factorial Problem\n"
                    "Write a Prolog predicate factorial/2 that computes the factorial of a number.\n"
                    "factorial(N, F) should be true when F is the factorial of N.\n"
                    "Requirements:\n"
                    "- factorial(0, 1) should be true (base case)\n"
                    "- factorial(1, 1) should be true\n"
                    "- factorial(3, 6) should be true\n"
                    "- factorial(5, 120) should be true\n"
                    "The predicate should handle:\n"
                    "- Base case: factorial of 0 is 1\n"
                    "- Recursive case: factorial of N is N * factorial(N-1)"
                ),
                test_cases=[
                    ("factorial(0, 1)", "true"),
                    ("factorial(1, 1)", "true"),
                    ("factorial(3, 6)", "true"),
                    ("factorial(5, 120)", "true"),
                ]
            ),
            _make_question(
                qid=99995,
                qnum=5,
                title="Family Relations Problem",
                problem=(
                    "Family Relations Problem\n"
                    "Given facts about parent relationships, implement predicates for family relationships.\n"
                    "Background Facts:\n"
                    "parent(tom, bob).\n"
                    "parent(tom, liz).\n"
                    "parent(bob, ann).\n"
                    "parent(bob, pat).\n"
                    "parent(pat, jim)."
                    "Task: Write predicates for:\n"
                    "1. grandparent(X, Y) - X is grandparent of Y\n"
                    "2. sibling(X, Y) - X and Y are siblings (same parents)\n"
                    "Rules:\n"
                    "- X is grandparent of Y if X is parent of Z and Z is parent of Y\n"
                    "- X and Y are siblings if they have the same parent P and X != Y"
                ),
                test_cases=[
                    ("grandparent(tom, ann)", "true"),
                    ("grandparent(tom, pat)", "true"),
                    ("grandparent(bob, jim)", "true"),
                    ("sibling(ann, pat)", "true"),
                    ("sibling(bob, liz)", "true"),
                ]
            ),
            _make_question(
                qid=99996,
                qnum=6,
                title="List Append Problem",
                problem=(
                    "List Append Problem\n"
                    "Write a Prolog predicate append/3 that concatenates two lists.\n"
                    "append(L1, L2, L3) should be true when L3 is the result of appending list L2 to list L1.\n"
                    "Test Cases:\n"
                    "- append([], [1,2,3], [1,2,3]) should be true\n"
                    "- append([1,2], [3,4], [1,2,3,4]) should be true\n"
                    "- append([a], [b,c], [a,b,c]) should be true\n"
                    "- append([1,2,3], [], [1,2,3]) should be true\n"
                    "- append([], [], []) should be true\n"
                    "Requirements:\n"
                    "- Base case: appending anything to empty list gives that list\n"
                    "- Recursive case: move first element from L1 to result, append rest\n"
                    "Expected behavior:\n"
                    "append([], L, L).\n"
                    "append([H|T1], L2, [H|T3]) :- append(T1, L2, T3)."
                ),
                test_cases=[
                    ("append([], [1,2,3], [1,2,3])", "true"),
                    ("append([1,2], [3,4], [1,2,3,4])", "true"),
                    ("append([a], [b,c], [a,b,c])", "true"),
                    ("append([1,2,3], [], [1,2,3])", "true"),
                    ("append([], [], [])", "true"),
                ]
            ),
            _make_question(
                qid=99997,
                qnum=7,
                title="List Member Problem",
                problem=(
                    "List Member Problem\n"
                    "Write a Prolog predicate member/2 that checks if an element is in a list.\n"
                    "member(X, L) should be true when X is an element of list L.\n"
                    "Requirements:\n"
                    "- An element X is a member of a list if it's the head\n"
                    "- An element X is a member if it's in the tail\n"
                    "- Empty list has no members\n"
                    "Expected test cases:\n"
                    "- member(2, [1,2,3]) should be true\n"
                    "- member(a, [a,b,c]) should be true\n"
                    "- member(3, [1,2]) should be false\n"
                    "- member(x, []) should be false\n"
                    "- member(1, [1,1,2]) should be true (duplicates ok)"
                ),
                test_cases=[
                    ("member(2, [1,2,3])", "true"),
                    ("member(a, [a,b,c])", "true"),
                    ("member(3, [1,2])", "false"),
                    ("member(x, [])", "false"),
                    ("member(1, [1,1,2])", "true"),
                ]
            ),
            _make_question(
                qid=99998,
                qnum=8,
                title="List Reverse Problem",
                problem=(
                    "Problem: List Reversal\n"
                    "Write a Prolog predicate `reverse_list(L, R)` that reverses a list.\n"
                    "The predicate should be true when R is the reverse of list L.\n"
                    "For example:\n"
                    "- reverse_list([1,2,3], [3,2,1]) should succeed\n"
                    "- reverse_list([], []) should succeed\n"
                    "- reverse_list([a], [a]) should succeed\n"
                    "This is a classic recursive problem. Think about:\n"
                    "1. What is the base case? (empty list)\n"
                    "2. How to reverse the tail and append the head at the end?"
                ),
                test_cases=[
                    ("reverse_list([1,2,3], [3,2,1])", "true"),
                    ("reverse_list([], [])", "true"),
                    ("reverse_list([a], [a])", "true"),
                ]
            ),
            _make_question(
                qid=121219,
                qnum=9,
                title="Homemade Meal and Fruit Selection",
                problem=(
                    "Write a Prolog program to represent a simple meal selection system.\n\n"
                    "Define facts to represent foods that are homemade. The homemade foods are:\n"
                    "- pizza\n"
                    "- soup\n"
                    "- fish\n"
                    "Define facts to represent ripe fruits. The ripe fruits are:\n"
                    "- apple\n"
                    "- orange\n"
                    "- banana\n"
                    "Write a rule called meal(Main, Fruit) that succeeds when:\n"
                    "- Main is a homemade food, and\n"
                    "- Fruit is a ripe fruit.\n"
                    "Use the cut operator (!) after confirming that Main is homemade to prevent Prolog from backtracking to other homemade options once one is chosen."
                ),
                test_cases=[
                    ("meal(pizza, apple)", "true"),
                    ("meal(soup, banana)", "true"),
                    ("meal(fish, orange)", "true"),
                ]
            ),
            _make_question(
                qid=298615,
                qnum=10,
                title="new problem",
                problem="can try any code here",
                test_cases=[
                    ("test(true)", "true"),
                ]
            ),
        ],
    )

    data.labs[playground_lab.lab_id] = playground_lab

    transaction.commit()
    conn.close()

    print("[OK] Seed data inserted:")
    print()
    print("  Teachers")
    print("    id=T001  username=prof_anderson  password=anderson123")
    print("    id=T002  username=prof_smith     password=smith456")
    print()
    print("  Students")
    print("    id=S001  username=alice    password=alice123")
    print("    id=S002  username=bob      password=bob456")
    print("    id=S003  username=charlie  password=charlie789")
    print("    id=S004  username=diana    password=diana000")
    print()
    print("  Classrooms  (teacher / enrolled students)")
    print("    [101] Introduction to Prolog  T001 / S001 alice, S002 bob, S003 charlie — 2 labs")
    print("    [202] Logic Programming       T001 / S001 alice, S003 charlie, S004 diana — 2 labs")
    print("    [303] AI Fundamentals         T002 / S003 charlie only — 2 labs")
    print()
    print("  What each student sees on ClassroomPage:")
    print("    alice   (S001) -> C101, C202")
    print("    bob     (S002) -> C101 only")
    print("    charlie (S003) -> C101, C202, C303")
    print("    diana   (S004) -> C202 only")
    print()
    print("  Labs & questions")
    print("    Lab 1001  Basic Facts & Queries       (active: yesterday→+7d)  2 questions")
    print("    Lab 1002  Unification & Variables     (inactive: opens +7d)    1 question")
    print("    Lab 2001  Recursive Predicates        (active: yesterday→+7d)  2 questions")
    print("    Lab 2002  List Operations             (active: yesterday→+7d)  3 questions")
    print("    Lab 3001  Search Algorithms in Prolog (inactive: no schedule)  1 question")
    print("    Lab 3002  Cut & Negation              (inactive: no schedule)  1 question")
    print("    Playground                            (active: yesterday→+14d) 10 questions")


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Reset ProgCheck ZODB database")
    parser.add_argument("--path", default="data/progcheck.fs", help="Path to .fs file")
    parser.add_argument("--seed", action="store_true",
                        help="Insert demo teacher, student, classrooms, labs, questions")
    args = parser.parse_args()

    db_path = ROOT / args.path

    print(f"\nResetting database: {db_path}")
    print("-" * 48)

    n = delete_db_files(db_path)
    if n == 0:
        print("  (no existing files found)")

    print()
    db = create_fresh_db(db_path)

    if args.seed:
        print()
        seed_demo_data(db)

    db.close()
    print()
    print("Done.  Start the server:  python start_server.py")
    print()


if __name__ == "__main__":
    main()
