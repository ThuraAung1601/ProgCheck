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


def _make_question(qid: int, qnum: int, problem: str,
                   test_cases: list[tuple[str, str]]) -> LabQuestion:
    """Build a LabQuestion with attached TestCases."""
    q = LabQuestion(qid, problem, question_number=qnum)
    for i, (inp, expected) in enumerate(test_cases, start=1):
        tc = TestCase(qid * 100 + i)
        tc.create_testcase(inp, expected)
        q.add_testcase(tc)
    return q


def _make_lab(lab_id: int, title: str, classroom_id: int,
              questions: list[LabQuestion], active: bool = False) -> Lab:
    """Build a Lab with attached LabQuestions."""
    lab = Lab(lab_id, title)
    lab.classroom_id = classroom_id
    for q in questions:
        lab.add_question(q)
    if active:
        lab.activate()
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

    lab1 = _make_lab(
        lab_id=1001,
        title="Basic Facts & Queries",
        classroom_id=101,
        active=True,
        questions=[
            _make_question(
                qid=10011, qnum=1,
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
                qid=10012, qnum=2,
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
        active=False,
        questions=[
            _make_question(
                qid=10021, qnum=1,
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
        active=True,
        questions=[
            _make_question(
                qid=20011, qnum=1,
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
                qid=20012, qnum=2,
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
        active=True,
        questions=[
            _make_question(
                qid=20021, qnum=1,
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
                qid=20022, qnum=2,
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
                qid=20023, qnum=3,
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
        active=False,
        questions=[
            _make_question(
                qid=30011, qnum=1,
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
        active=False,
        questions=[
            _make_question(
                qid=30021, qnum=1,
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
    print("    Lab 1001  Basic Facts & Queries       (active)   2 questions")
    print("    Lab 1002  Unification & Variables     (inactive) 1 question")
    print("    Lab 2001  Recursive Predicates        (active)   2 questions")
    print("    Lab 2002  List Operations             (active)   3 questions")
    print("    Lab 3001  Search Algorithms in Prolog (inactive) 1 question")
    print("    Lab 3002  Cut & Negation              (inactive) 1 question")


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
