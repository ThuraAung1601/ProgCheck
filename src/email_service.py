"""Email notification service for ProgCheck — configure via environment variables:
    SMTP_HOST  (default: smtp.gmail.com)
    SMTP_PORT  (default: 587)
    SMTP_USER  — sender address / login
    SMTP_PASS  — sender password / app-password
    FROM_EMAIL — override the From: address (defaults to SMTP_USER)
"""
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

SMTP_HOST  = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT  = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER  = os.getenv("SMTP_USER", "")
SMTP_PASS  = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER)


def send_email(to_email: str, subject: str, body_html: str) -> bool:
    """Send an HTML email. Returns True on success, False on failure."""
    if not SMTP_USER or not SMTP_PASS:
        print(f"[EMAIL] SMTP not configured (set SMTP_USER/SMTP_PASS), skipping → {to_email}")
        return False
    if not to_email:
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = FROM_EMAIL
        msg["To"]      = to_email
        msg.attach(MIMEText(body_html, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.ehlo()
            server.starttls()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to_email, msg.as_string())

        print(f"[EMAIL] Sent '{subject}' → {to_email}")
        return True
    except Exception as exc:
        print(f"[EMAIL] Failed to send to {to_email}: {exc}")
        return False
