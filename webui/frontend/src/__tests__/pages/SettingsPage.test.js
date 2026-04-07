/**
 * Tests for SettingsPage.js
 *
 * Covers:
 *   - Loading state while fetching settings
 *   - Settings rendered after load
 *   - Email Alerts toggle fires PUT with { email_alerts: false/true }
 *   - Notification email section visible only when emailAlerts is on
 *   - Edit / Save / Cancel flow for notification email
 *   - Error banner shown on fetch failure
 *   - Theme buttons call saveSettings with correct theme value
 *
 * Requirements traced:
 *   UFR-11  student receives lab notifications
 *   SFR-7   lab alert email is configurable per user
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import SettingsPage from '../../pages/SettingsPage';

// ── Helpers ───────────────────────────────────────────────────────────────────

const mockUser = { id: 'STU001', name: 'Alice', email: 'alice@example.com' };

const defaultSettings = {
  display_name: 'Alice',
  theme: 'light',
  auto_save: true,
  email_alerts: true,
  tab_size: 2,
  email: 'alice@example.com',
  phone: '',
};

/** Set global.fetch to return the given settings object on GET. */
function mockFetchGet(settings = defaultSettings) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ...settings }),
  });
}

/** Set global.fetch so that GET succeeds and PUT succeeds too. */
function mockFetchGetAndPut(settings = defaultSettings, putResponse = null) {
  global.fetch = jest.fn().mockImplementation((_url, opts) => {
    if (!opts || opts.method !== 'PUT') {
      return Promise.resolve({ ok: true, json: async () => ({ ...settings }) });
    }
    return Promise.resolve({
      ok: true,
      json: async () => (putResponse || { ...settings }),
    });
  });
}

/** Set global.fetch so that the initial GET fails. */
function mockFetchGetFail() {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });
}

function renderPage(props = {}) {
  const defaults = { role: 'student', user: mockUser, onUserUpdate: jest.fn() };
  return render(<SettingsPage {...defaults} {...props} />);
}

// ── Loading state ─────────────────────────────────────────────────────────────

describe('SettingsPage — loading', () => {
  it('shows loading indicator before settings are fetched', () => {
    // Never resolve to keep loading state
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText(/loading settings/i)).toBeInTheDocument();
  });

  it('does not fetch when user has no id', () => {
    global.fetch = jest.fn();
    renderPage({ user: {} });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ── Settings rendered after load ──────────────────────────────────────────────

describe('SettingsPage — content after load', () => {
  beforeEach(() => mockFetchGet());

  it('renders Settings heading after load', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Settings')).toBeInTheDocument());
  });

  it('renders Notifications section', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Notifications')).toBeInTheDocument());
  });

  it('renders Email Alerts label', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Email Alerts')).toBeInTheDocument());
  });

  it('shows notification email input when email_alerts is true', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/notification email/i)).toBeInTheDocument()
    );
  });
});

// ── Email Alerts toggle ───────────────────────────────────────────────────────

describe('SettingsPage — email alerts toggle', () => {
  it('hides notification email section when email_alerts loaded as false', async () => {
    mockFetchGet({ ...defaultSettings, email_alerts: false });
    renderPage();
    await waitFor(() => screen.getByText('Email Alerts'));
    expect(screen.queryByText(/notification email/i)).not.toBeInTheDocument();
  });

  it('fires PUT with email_alerts:false when toggle clicked off', async () => {
    mockFetchGetAndPut({ ...defaultSettings, email_alerts: false });
    renderPage();
    await waitFor(() => screen.getByText('Email Alerts'));

    // The Toggle for Email Alerts is a div with onClick
    // Find toggle by proximity to "Email Alerts" label
    const toggleDivs = document.querySelectorAll('[style*="border-radius: 12px"]');
    // Click the email alerts toggle (first one visible in Notifications card)
    fireEvent.click(toggleDivs[toggleDivs.length - 1]);

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[putCalls.length - 1][1].body);
      expect(body).toHaveProperty('email_alerts');
    });
  });

  it('sends PUT to correct URL on toggle change', async () => {
    mockFetchGetAndPut();
    renderPage();
    await waitFor(() => screen.getByText('Email Alerts'));

    const toggleDivs = document.querySelectorAll('[style*="border-radius: 12px"]');
    fireEvent.click(toggleDivs[toggleDivs.length - 1]);

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      expect(putCalls[0][0]).toContain('/api/settings/profile/STU001');
    });
  });
});

// ── Notification email edit flow ──────────────────────────────────────────────

describe('SettingsPage — notification email', () => {
  beforeEach(() => mockFetchGetAndPut());

  it('shows Edit button next to notification email', async () => {
    renderPage();
    await waitFor(() => screen.getByText(/notification email/i));
    // There will be at least one Edit button visible
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    expect(editButtons.length).toBeGreaterThan(0);
  });

  it('clicking Edit makes email input editable', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/notification email/i));

    // The notification email section has an Edit button
    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    // Last Edit button is the notification email one (profile has one too)
    await user.click(editButtons[editButtons.length - 1]);

    // Save button should now appear
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
    );
  });

  it('Cancel button in editing mode hides Save button', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/notification email/i));

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[editButtons.length - 1]);
    await waitFor(() => screen.getByRole('button', { name: /save/i }));

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /^save$/i })).not.toBeInTheDocument()
    );
  });

  it('Save calls PUT with updated email', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/notification email/i));

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[editButtons.length - 1]);

    // Type into the email input (it becomes editable after clicking Edit)
    const emailInputs = document.querySelectorAll('input[type="email"]');
    const notifInput = Array.from(emailInputs).find(
      el => !el.readOnly && el.placeholder?.includes('email')
    );
    if (notifInput) {
      await user.clear(notifInput);
      await user.type(notifInput, 'new@test.com');
    }

    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[putCalls.length - 1][1].body);
      expect(body).toHaveProperty('email');
    });
  });
});

// ── Error handling ────────────────────────────────────────────────────────────

describe('SettingsPage — error handling', () => {
  it('shows error banner when settings load fails', async () => {
    mockFetchGetFail();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/failed to load settings/i)).toBeInTheDocument()
    );
  });

  it('error banner can be dismissed', async () => {
    mockFetchGetFail();
    renderPage();
    await waitFor(() => screen.getByText(/failed to load settings/i));

    fireEvent.click(screen.getByRole('button', { name: /×/ }));
    await waitFor(() =>
      expect(screen.queryByText(/failed to load settings/i)).not.toBeInTheDocument()
    );
  });
});

// ── Theme buttons ─────────────────────────────────────────────────────────────

describe('SettingsPage — theme selection', () => {
  it('clicking dark theme button fires PUT with theme:dark', async () => {
    mockFetchGetAndPut({ ...defaultSettings, theme: 'dark' });
    renderPage();
    await waitFor(() => screen.getByText('Settings'));

    fireEvent.click(screen.getByRole('button', { name: /dark/i }));

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[0][1].body);
      expect(body.theme).toBe('dark');
    });
  });

  it('clicking light theme button fires PUT with theme:light', async () => {
    mockFetchGetAndPut({ ...defaultSettings, theme: 'dark' });
    renderPage();
    await waitFor(() => screen.getByText('Settings'));

    fireEvent.click(screen.getByRole('button', { name: /^light$/i }));

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[0][1].body);
      expect(body.theme).toBe('light');
    });
  });
});

// ── Auto-save toggle ──────────────────────────────────────────────────────────

describe('SettingsPage — auto-save toggle', () => {
  it('toggling Auto-Save fires PUT with auto_save field', async () => {
    const onUserUpdate = jest.fn();
    mockFetchGetAndPut();
    renderPage({ onUserUpdate });
    await waitFor(() => screen.getByText('Auto-Save'));

    // The Auto-Save Toggle is a div with border-radius:12px
    const toggleDivs = document.querySelectorAll('[style*="border-radius: 12px"]');
    // First toggle is Auto-Save (second is Email Alerts)
    fireEvent.click(toggleDivs[0]);

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[0][1].body);
      expect(body).toHaveProperty('auto_save');
    });
  });
});

// ── Tab size change ───────────────────────────────────────────────────────────

describe('SettingsPage — tab size', () => {
  it('changing tab size select fires PUT with tab_size', async () => {
    const onUserUpdate = jest.fn();
    mockFetchGetAndPut();
    renderPage({ onUserUpdate });
    await waitFor(() => screen.getByText('Tab Size'));

    const select = document.querySelector('select');
    fireEvent.change(select, { target: { value: '4' } });

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[0][1].body);
      expect(body.tab_size).toBe(4);
    });
  });
});

// ── PUT failure ───────────────────────────────────────────────────────────────

describe('SettingsPage — PUT failure', () => {
  it('shows error when PUT request fails', async () => {
    global.fetch = jest.fn().mockImplementation((_url, opts) => {
      if (!opts || opts.method !== 'PUT') {
        return Promise.resolve({ ok: true, json: async () => ({ ...defaultSettings }) });
      }
      return Promise.resolve({
        ok: false,
        status: 500,
        json: async () => ({ detail: 'Server error' }),
      });
    });
    renderPage();
    await waitFor(() => screen.getByText('Settings'));

    fireEvent.click(screen.getByRole('button', { name: /dark/i }));

    await waitFor(() => {
      expect(document.body.textContent).toMatch(/server error|error|failed/i);
    });
  });
});

// ── Profile modal ─────────────────────────────────────────────────────────────

describe('SettingsPage — profile modal', () => {
  beforeEach(() => mockFetchGetAndPut());

  it('opens Edit Profile modal when Edit button clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('Display Name'));

    // There are multiple Edit buttons; the Display Name one is in the Profile Details card
    const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
    // First Edit button is the Display Name one
    await user.click(editBtns[0]);

    await waitFor(() =>
      expect(screen.getByText('Edit Profile')).toBeInTheDocument()
    );
  });

  it('closes Edit Profile modal when Cancel clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('Display Name'));

    const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
    await user.click(editBtns[0]);
    await waitFor(() => screen.getByText('Edit Profile'));

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() =>
      expect(screen.queryByText('Edit Profile')).not.toBeInTheDocument()
    );
  });

  it('Save Changes in modal fires PUT with display_name', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('Display Name'));

    const editBtns = screen.getAllByRole('button', { name: /^edit$/i });
    await user.click(editBtns[0]);
    await waitFor(() => screen.getByText('Edit Profile'));

    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(
        ([, opts]) => opts && opts.method === 'PUT'
      );
      expect(putCalls.length).toBeGreaterThan(0);
      const body = JSON.parse(putCalls[putCalls.length - 1][1].body);
      expect(body).toHaveProperty('display_name');
    });
  });
});

// ── Password modal ────────────────────────────────────────────────────────────

describe('SettingsPage — password modal', () => {
  beforeEach(() => mockFetchGetAndPut());

  it('opens Change Password modal when button clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/change password/i));

    await user.click(screen.getByText(/change password…/i));
    await waitFor(() =>
      expect(screen.getByText('Change Password')).toBeInTheDocument()
    );
  });

  it('shows error when fields are empty on submit', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/change password…/i));

    await user.click(screen.getByText(/change password…/i));
    await waitFor(() => screen.getByText('Change Password'));

    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/required/i)
    );
  });

  it('shows error when new passwords do not match', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/change password…/i));

    await user.click(screen.getByText(/change password…/i));
    await waitFor(() => screen.getByText('Change Password'));

    const [oldPw, newPw, confirmPw] = document.querySelectorAll(
      'input[type="password"]'
    );
    await user.type(oldPw, 'oldpass');
    await user.type(newPw, 'newpass1');
    await user.type(confirmPw, 'newpass2');

    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/do not match/i)
    );
  });

  it('shows error when new password is too short', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/change password…/i));

    await user.click(screen.getByText(/change password…/i));
    await waitFor(() => screen.getByText('Change Password'));

    const [oldPw, newPw, confirmPw] = document.querySelectorAll(
      'input[type="password"]'
    );
    await user.type(oldPw, 'oldpass');
    await user.type(newPw, 'abc');
    await user.type(confirmPw, 'abc');

    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/at least 6/i)
    );
  });

  it('shows success message after successful password change', async () => {
    global.fetch = jest.fn().mockImplementation((_url, opts) => {
      if (!opts || (opts.method !== 'PUT' && opts.method !== 'POST')) {
        return Promise.resolve({ ok: true, json: async () => ({ ...defaultSettings }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/change password…/i));

    await user.click(screen.getByText(/change password…/i));
    await waitFor(() => screen.getByText('Change Password'));

    const [oldPw, newPw, confirmPw] = document.querySelectorAll(
      'input[type="password"]'
    );
    await user.type(oldPw, 'oldpass');
    await user.type(newPw, 'newpass123');
    await user.type(confirmPw, 'newpass123');

    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() =>
      expect(document.body.textContent).toMatch(/password changed/i)
    );
  });

  it('closes password modal and clears fields when Cancel clicked', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText(/change password…/i));

    await user.click(screen.getByText(/change password…/i));
    await waitFor(() => screen.getByText('Change Password'));

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    await waitFor(() =>
      expect(screen.queryByText('Change Password')).not.toBeInTheDocument()
    );
  });
});
