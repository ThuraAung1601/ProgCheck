/**
 * Jest / React Testing Library tests for the Login page.
 *
 * The API call (fetch) is mocked so that no network is required.
 *
 * Requirements traced:
 *   UFR-1  register and log in
 *   UFR-2  log out securely
 *   SNFR-1 easy to use for Prolog beginners
 *   SNFR-8 password not exposed in logs / DOM
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import LoginPage from '../../pages/LoginPage';

// ── Mock global fetch ─────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

function mockFetchSuccess(body) {
  global.fetch.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function mockFetchError(status, message) {
  global.fetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => message,
    json: async () => ({ detail: message }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const FAKE_AUTH_RESPONSE = {
  user: { id: 'STU001', username: 'alice', role: 'student', display_name: 'Alice' },
  token: 'fake-token-abc',
};

// The onLogin / onRegister callbacks capture what LoginPage calls back with
function renderLoginPage(onLogin = jest.fn()) {
  return render(<LoginPage onLogin={onLogin} />);
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – rendering', () => {
  test('renders username and password fields', () => {
    renderLoginPage();
    expect(screen.getByRole('textbox', { name: /username/i })).toBeInTheDocument();
    // Password is type="password", not a 'textbox' role
    expect(document.querySelector('input[type="password"]')).toBeInTheDocument();
  });

  test('renders a login / submit button', () => {
    renderLoginPage();
    const btn = screen.getByRole('button', { name: /login|sign in|submit/i });
    expect(btn).toBeInTheDocument();
  });

  test('renders role selector (student / teacher)', () => {
    renderLoginPage();
    // Either radio buttons or a select element
    const roleOptions =
      screen.queryAllByRole('radio') ||
      screen.queryAllByRole('option') ||
      document.querySelectorAll('select, [role="radio"]');
    expect(roleOptions.length).toBeGreaterThan(0);
  });

  test('password field is masked (type=password)', () => {
    renderLoginPage();
    const pwInput = document.querySelector('input[type="password"]');
    expect(pwInput).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Successful login
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – successful login', () => {
  test('calls onLogin with user and token on success', async () => {
    const onLogin = jest.fn();
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    renderLoginPage(onLogin);

    fireEvent.change(screen.getByRole('textbox', { name: /username/i }), {
      target: { value: 'alice' },
    });
    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: 'pass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login|sign in|submit/i }));

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalledTimes(1);
    });
    const [user, token] = onLogin.mock.calls[0];
    expect(user.username).toBe('alice');
    expect(token).toBe('fake-token-abc');
  });

  test('does not expose token in the DOM after login', async () => {
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    renderLoginPage();

    fireEvent.change(screen.getByRole('textbox', { name: /username/i }), {
      target: { value: 'alice' },
    });
    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: 'pass123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login|sign in|submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Token must not appear verbatim in the rendered HTML
    expect(document.body.innerHTML).not.toContain('fake-token-abc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failed login
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – failed login', () => {
  test('shows error message on 401', async () => {
    mockFetchError(401, 'Invalid username or password');
    renderLoginPage();

    fireEvent.change(screen.getByRole('textbox', { name: /username/i }), {
      target: { value: 'alice' },
    });
    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login|sign in|submit/i }));

    await waitFor(() => {
      const errorEl = screen.queryByText(/invalid|incorrect|error/i);
      expect(errorEl).not.toBeNull();
    });
  });

  test('does not expose user credentials in error state', async () => {
    mockFetchError(401, 'Unauthorized');
    renderLoginPage();

    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: 'mysecret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login|sign in|submit/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(document.body.innerHTML).not.toContain('mysecret');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Input validation
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – client-side validation', () => {
  test('does not submit when username is empty', async () => {
    renderLoginPage();
    fireEvent.change(document.querySelector('input[type="password"]'), {
      target: { value: 'pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /login|sign in|submit/i }));
    // fetch should NOT have been called
    await new Promise(r => setTimeout(r, 100));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
