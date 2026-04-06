"""
Unit tests for email service (src/email_service.py).

All tests use unittest.mock to replace smtplib.SMTP so no real network
connections are made.

Requirements traced:
  SFR-7   lab alert emails delivered to enrolled students
  SNFR-8  no credentials or API keys leaked in email content
  SNFR-10 graceful degradation when SMTP is not configured
"""
import sys
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock

ROOT = Path(__file__).resolve().parents[2]
SRC  = ROOT / "src"
for p in (str(ROOT), str(SRC)):
    if p not in sys.path:
        sys.path.insert(0, p)

import src.email_service as email_module
from src.email_service import send_email


# ── Guard: no SMTP credentials ────────────────────────────────────────────────

class TestNoCredentials:

    def test_returns_false_when_smtp_user_not_set(self):
        with patch.object(email_module, "SMTP_USER", ""), \
             patch.object(email_module, "SMTP_PASS", "somepass"):
            result = send_email("dest@example.com", "Hello", "<p>Hi</p>")
        assert result is False

    def test_returns_false_when_smtp_pass_not_set(self):
        with patch.object(email_module, "SMTP_USER", "sender@example.com"), \
             patch.object(email_module, "SMTP_PASS", ""):
            result = send_email("dest@example.com", "Hello", "<p>Hi</p>")
        assert result is False

    def test_returns_false_when_both_not_set(self):
        with patch.object(email_module, "SMTP_USER", ""), \
             patch.object(email_module, "SMTP_PASS", ""):
            result = send_email("dest@example.com", "Hello", "<p>Hi</p>")
        assert result is False


# ── Guard: empty recipient ────────────────────────────────────────────────────

class TestEmptyRecipient:

    def test_returns_false_for_empty_to_email(self):
        with patch.object(email_module, "SMTP_USER", "sender@x.com"), \
             patch.object(email_module, "SMTP_PASS", "pass"):
            result = send_email("", "Subject", "<p>body</p>")
        assert result is False

    def test_returns_false_for_none_to_email(self):
        with patch.object(email_module, "SMTP_USER", "sender@x.com"), \
             patch.object(email_module, "SMTP_PASS", "pass"):
            result = send_email(None, "Subject", "<p>body</p>")
        assert result is False


# ── Successful send ───────────────────────────────────────────────────────────

class TestSuccessfulSend:

    def _run_send(self, to="rcpt@example.com", subject="Test", body="<p>Hi</p>"):
        """Helper: patch credentials + smtplib then call send_email."""
        mock_smtp_instance = MagicMock()
        mock_smtp_class    = MagicMock(return_value=mock_smtp_instance)
        # Make 'with smtplib.SMTP(...) as server' work via __enter__/__exit__
        mock_smtp_instance.__enter__ = MagicMock(return_value=mock_smtp_instance)
        mock_smtp_instance.__exit__  = MagicMock(return_value=False)

        with patch.object(email_module, "SMTP_USER", "sender@x.com"), \
             patch.object(email_module, "SMTP_PASS", "secret"), \
             patch.object(email_module, "FROM_EMAIL", "sender@x.com"), \
             patch("smtplib.SMTP", mock_smtp_class):
            result = send_email(to, subject, body)

        return result, mock_smtp_class, mock_smtp_instance

    def test_returns_true_on_success(self):
        result, _, _ = self._run_send()
        assert result is True

    def test_smtp_is_called_with_configured_host_and_port(self):
        with patch.object(email_module, "SMTP_HOST", "smtp.custom.com"), \
             patch.object(email_module, "SMTP_PORT", 587):
            result, smtp_cls, _ = self._run_send()
        smtp_cls.assert_called_once_with("smtp.custom.com", 587)

    def test_starttls_is_called(self):
        _, _, server = self._run_send()
        server.starttls.assert_called_once()

    def test_login_called_with_credentials(self):
        _, _, server = self._run_send()
        server.login.assert_called_once_with("sender@x.com", "secret")

    def test_sendmail_called_with_correct_addresses(self):
        _, _, server = self._run_send(to="dest@test.com")
        args = server.sendmail.call_args[0]
        assert args[0] == "sender@x.com"   # from
        assert args[1] == "dest@test.com"  # to


# ── SMTP failure ──────────────────────────────────────────────────────────────

class TestSmtpFailure:

    def test_returns_false_when_smtp_raises(self):
        mock_smtp_instance = MagicMock()
        mock_smtp_instance.__enter__ = MagicMock(side_effect=Exception("Connection refused"))
        mock_smtp_instance.__exit__  = MagicMock(return_value=False)

        with patch.object(email_module, "SMTP_USER", "s@x.com"), \
             patch.object(email_module, "SMTP_PASS", "p"), \
             patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_instance)):
            result = send_email("dest@x.com", "Subject", "<p>body</p>")
        assert result is False

    def test_returns_false_when_login_raises(self):
        mock_smtp_instance = MagicMock()
        mock_smtp_instance.__enter__ = MagicMock(return_value=mock_smtp_instance)
        mock_smtp_instance.__exit__  = MagicMock(return_value=False)
        mock_smtp_instance.login.side_effect = Exception("Auth failed")

        with patch.object(email_module, "SMTP_USER", "s@x.com"), \
             patch.object(email_module, "SMTP_PASS", "p"), \
             patch("smtplib.SMTP", MagicMock(return_value=mock_smtp_instance)):
            result = send_email("dest@x.com", "Subject", "<p>body</p>")
        assert result is False
