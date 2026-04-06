"""Background scheduler that sends email notifications for lab events.

Two notifications per lab (students must have email_alerts=True and a saved email):
  1. When a lab transitions to 'active'  → "Lab is now open" email
  2. When ≤ 60 minutes remain before the lab closes → "Lab ending soon" email

State is persisted on each Lab object (`email_active_sent`, `email_warning_sent`) so
notifications are not re-sent after a server restart.
"""
import threading
import time
from datetime import datetime, timedelta


def _check_and_notify():
    """Scan every lab and dispatch emails as needed."""
    from src.database import DatabaseContext
    from src.email_service import send_email

    now = datetime.now()

    try:
        with DatabaseContext() as db:
            for lab in list(db.labs.values()):
                # Skip labs without a scheduled window
                if lab.active_time is None or lab.complete_time is None:
                    continue

                lab_status = lab.get_current_status()

                classroom_id = getattr(lab, 'classroom_id', None)
                classroom = db.classrooms.get(classroom_id) if classroom_id else None
                if not classroom:
                    continue

                complete_str = lab.complete_time.strftime('%Y-%m-%d %H:%M')

                # ── Notification 1: lab just became active ──────────────────
                active_sent = getattr(lab, 'email_active_sent', False)
                if lab_status == 'active' and not active_sent:
                    for student_id in classroom.student_ids:
                        student = db.students.get(student_id)
                        if not student:
                            continue
                        if not getattr(student.settings, 'email_alerts', True):
                            continue
                        email = getattr(student.settings, 'email', '') or ''
                        if not email:
                            continue
                        send_email(
                            email,
                            f"[ProgCheck] Lab '{lab.title}' is now active",
                            f"""
                            <div style="font-family:sans-serif;max-width:520px;margin:auto">
                              <h2 style="color:#4ECBA0">Lab is now open!</h2>
                              <p>Lab <strong>{lab.title}</strong> is now open for submissions.</p>
                              <p>You have until <strong>{complete_str}</strong> to submit your work.</p>
                              <p>Log in to <em>ProgCheck</em> to begin.</p>
                            </div>
                            """,
                        )
                    lab.email_active_sent = True
                    lab._p_changed = True

                # ── Notification 2: ≤ 60 minutes before lab closes ──────────
                warning_sent = getattr(lab, 'email_warning_sent', False)
                if lab_status == 'active' and not warning_sent:
                    time_remaining = lab.complete_time - now
                    if timedelta(0) < time_remaining <= timedelta(hours=1):
                        minutes_left = max(1, int(time_remaining.total_seconds() / 60))
                        for student_id in classroom.student_ids:
                            student = db.students.get(student_id)
                            if not student:
                                continue
                            if not getattr(student.settings, 'email_alerts', True):
                                continue
                            email = getattr(student.settings, 'email', '') or ''
                            if not email:
                                continue
                            send_email(
                                email,
                                f"[ProgCheck] Lab '{lab.title}' ends in ~{minutes_left} min",
                                f"""
                                <div style="font-family:sans-serif;max-width:520px;margin:auto">
                                  <h2 style="color:#F59E0B">Lab ending soon!</h2>
                                  <p>Lab <strong>{lab.title}</strong> closes at
                                  <strong>{complete_str}</strong>
                                  (~{minutes_left} minute{'s' if minutes_left != 1 else ''} from now).</p>
                                  <p>Make sure to submit your work before it closes!</p>
                                </div>
                                """,
                            )
                        lab.email_warning_sent = True
                        lab._p_changed = True

    except Exception as exc:
        print(f"[SCHEDULER] Error during notification check: {exc}")


def _scheduler_loop():
    while True:
        _check_and_notify()
        time.sleep(60)  # poll every minute


def start_scheduler():
    """Start the background email notification scheduler (daemon thread)."""
    t = threading.Thread(target=_scheduler_loop, daemon=True, name="email-notifier")
    t.start()
    print("[OK] Email notification scheduler started (interval: 60 s)")
