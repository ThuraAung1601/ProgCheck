#!/usr/bin/env python
"""
Inspect ProgCheck ZODB database contents.
Run from project root: python inspect_db.py
Optional args:
  --path PATH   database file path (default: data/progcheck.fs)
  --section     one of: all, students, teachers, classrooms, labs, results
"""
import sys
import os
import argparse
from pathlib import Path

# Ensure project root is on sys.path
ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

try:
    from ZODB import FileStorage, DB
    import transaction
except ImportError:
    print("[ERROR] ZODB not installed. Run: pip install ZODB")
    sys.exit(1)


def fmt_dt(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else "—"


def print_students(students):
    print(f"\n{'='*50}")
    print(f"  STUDENTS  ({len(students)})")
    print(f"{'='*50}")
    if not students:
        print("  (none)")
        return
    for sid, s in students.items():
        print(f"\n  [{sid}]")
        print(f"    name         : {s.name}")
        print(f"    password     : {s.password}")
        print(f"    created_at   : {fmt_dt(s.created_at)}")
        print(f"    updated_at   : {fmt_dt(s.updated_at)}")
        rec = list(s.academic_record) if s.academic_record else []
        print(f"    academic_rec : {rec if rec else '(empty)'}")
        print(f"    settings     :")
        print(f"      theme        = {s.settings.theme}")
        print(f"      auto_save    = {s.settings.auto_save}")
        print(f"      email_alerts = {s.settings.email_alerts}")
        print(f"      email        = {s.settings.email or '—'}")
        print(f"      display_name = {s.settings.display_name or '—'}")


def print_teachers(teachers):
    print(f"\n{'='*50}")
    print(f"  TEACHERS  ({len(teachers)})")
    print(f"{'='*50}")
    if not teachers:
        print("  (none)")
        return
    for tid, t in teachers.items():
        print(f"\n  [{tid}]")
        print(f"    name           : {t.name}")
        print(f"    password       : {t.password}")
        print(f"    created_at     : {fmt_dt(t.created_at)}")
        print(f"    courses_teach  : {list(t.courses_teach) if t.courses_teach else '(none)'}")
        print(f"    settings       :")
        print(f"      theme        = {t.settings.theme}")
        print(f"      email        = {t.settings.email or '—'}")
        print(f"      display_name = {t.settings.display_name or '—'}")


def print_classrooms(classrooms):
    print(f"\n{'='*50}")
    print(f"  CLASSROOMS  ({len(classrooms)})")
    print(f"{'='*50}")
    if not classrooms:
        print("  (none)")
        return
    for cid, c in classrooms.items():
        print(f"\n  [{cid}]")
        print(f"    class_name    : {c.class_name}")
        print(f"    class_size    : {c.class_size}")
        print(f"    prerequisites : {c.prerequisites or '—'}")
        print(f"    teacher_id    : {c.teacher_id}")
        print(f"    student_ids   : {list(c.student_ids) if c.student_ids else '(none)'}")
        print(f"    lab_ids       : {list(c.lab_ids) if c.lab_ids else '(none)'}")
        print(f"    created_at    : {fmt_dt(c.created_at)}")


def print_labs(labs):
    print(f"\n{'='*50}")
    print(f"  LABS  ({len(labs)})")
    print(f"{'='*50}")
    if not labs:
        print("  (none)")
        return
    for lid, lab in labs.items():
        print(f"\n  [{lid}]  {lab.title}")
        print(f"    classroom_id  : {lab.classroom_id}")
        if hasattr(lab, 'get_current_status'):
            print(f"    status        : {lab.get_current_status()}")
            active_time   = getattr(lab, 'active_time',   None)
            complete_time = getattr(lab, 'complete_time', None)
            print(f"    active_time   : {fmt_dt(active_time)   if active_time   else '—'}")
            print(f"    complete_time : {fmt_dt(complete_time) if complete_time else '—'}")
        else:
            print(f"    is_active     : {getattr(lab, 'is_active', '—')}")
        print(f"    questions     : {len(lab.lab_question)}")
        print(f"    created_at    : {fmt_dt(lab.created_at)}")
        for qi, q in enumerate(lab.lab_question, 1):
            print(f"\n    Question {qi} [{q.question_id}]")
            preview = q.problem[:80].replace('\n', ' ')
            print(f"      problem  : {preview}{'…' if len(q.problem) > 80 else ''}")
            print(f"      testcases: {len(q.test_case)}")
            for tc in q.test_case:
                print(f"        tc[{tc.testcase_id}]  in={tc.input!r}  expected={tc.expected_output!r}")


def print_results(results):
    print(f"\n{'='*50}")
    print(f"  RESULTS  ({len(results)})")
    print(f"{'='*50}")
    if not results:
        print("  (none)")
        return
    for rid, r in results.items():
        print(f"\n  [{rid}]")
        print(f"    student_id      : {r.student_id}")
        print(f"    question_id     : {r.question_id}")
        print(f"    score           : {r.score}")
        print(f"    status          : {r.status}")
        print(f"    submission_time : {fmt_dt(r.submission_time)}")
        if r.code_file:
            preview = str(r.code_file)[:60].replace('\n', ' ')
            print(f"    code_file       : {preview}{'…' if len(str(r.code_file)) > 60 else ''}")


def main():
    parser = argparse.ArgumentParser(description="Inspect ProgCheck ZODB database")
    parser.add_argument("--path", default="data/progcheck.fs", help="Path to .fs file")
    parser.add_argument(
        "--section",
        default="all",
        choices=["all", "students", "teachers", "classrooms", "labs", "results"],
        help="Which section to display"
    )
    args = parser.parse_args()

    db_path = ROOT / args.path
    if not db_path.exists():
        print(f"[ERROR] Database file not found: {db_path}")
        print("       Start the server at least once to create it.")
        sys.exit(1)

    print(f"Opening database: {db_path}")

    storage = FileStorage.FileStorage(str(db_path), read_only=True)
    db = DB(storage)
    conn = db.open()
    root = conn.root()

    if 'database' not in root:
        print("[ERROR] 'database' key not found in ZODB root. DB may be empty or corrupted.")
        conn.close()
        db.close()
        sys.exit(1)

    data = root['database']
    s = args.section

    if s in ("all", "students"):
        print_students(data.students)
    if s in ("all", "teachers"):
        print_teachers(data.teachers)
    if s in ("all", "classrooms"):
        print_classrooms(data.classrooms)
    if s in ("all", "labs"):
        print_labs(data.labs)
    if s in ("all", "results"):
        print_results(data.results)

    print(f"\n{'='*50}")
    print(f"  DB created_at: {fmt_dt(data.created_at)}")
    print(f"{'='*50}\n")

    conn.close()
    db.close()
    storage.close()


if __name__ == "__main__":
    main()
