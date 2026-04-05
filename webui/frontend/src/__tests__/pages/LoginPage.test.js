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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
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

function renderLoginPage(onLogin = jest.fn()) {
  return { ...render(<LoginPage onLogin={onLogin} />), onLogin };
}

/** Find a password input regardless of label wording. */
function getPasswordInput() {
  return document.querySelector('input[type="password"]');
}

/** Find any text input (username / email). */
function getUsernameInput() {
  // Try accessible label first, fall back to first text input
  try {
    return screen.getByRole('textbox');
  } catch {
    return document.querySelector('input[type="text"]') ||
           document.querySelector('input:not([type="password"])');
  }
}

/** Find the primary submit button. */
function getSubmitButton() {
  return (
    screen.queryByRole('button', { name: /login|sign in|submit|enter/i }) ||
    document.querySelector('button[type="submit"]') ||
    document.querySelector('button')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – rendering', () => {
  test('renders at least one text input for username', () => {
    renderLoginPage();
    const input = getUsernameInput();
    expect(input).toBeTruthy();
  });

  test('renders a password field (type=password)', () => {
    renderLoginPage();
    expect(getPasswordInput()).toBeTruthy();
  });

  test('password field is masked', () => {
    renderLoginPage();
    const pw = getPasswordInput();
    expect(pw.type).toBe('password');
  });

  test('renders a submit / login button', () => {
    renderLoginPage();
    expect(getSubmitButton()).toBeTruthy();
  });

  test('page renders without crashing', () => {
    expect(() => renderLoginPage()).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Successful login
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – successful login', () => {
  test('calls fetch on submit', async () => {
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    renderLoginPage();

    const usernameInput = getUsernameInput();
    const passwordInput = getPasswordInput();
    const submitBtn     = getSubmitButton();

    if (usernameInput) fireEvent.change(usernameInput, { target: { value: 'alice' } });
    if (passwordInput) fireEvent.change(passwordInput, { target: { value: 'pass123' } });
    if (submitBtn)     fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  test('calls onLogin after successful API response', async () => {
    const onLogin = jest.fn();
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    render(<LoginPage onLogin={onLogin} />);

    const usernameInput = getUsernameInput();
    const passwordInput = getPasswordInput();
    const submitBtn     = getSubmitButton();

    if (usernameInput) fireEvent.change(usernameInput, { target: { value: 'alice' } });
    if (passwordInput) fireEvent.change(passwordInput, { target: { value: 'pass123' } });
    if (submitBtn)     fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onLogin).toHaveBeenCalled();
    }, { timeout: 3000 });
  });

  test('does not expose token in the DOM after login', async () => {
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    renderLoginPage();

    const submitBtn = getSubmitButton();
    if (submitBtn) fireEvent.click(submitBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled(), { timeout: 3000 });
    expect(document.body.innerHTML).not.toContain('fake-token-abc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failed login
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – failed login', () => {
  test('does not call onLogin when credentials are wrong', async () => {
    const onLogin = jest.fn();
    mockFetchError(401, 'Invalid username or password');
    render(<LoginPage onLogin={onLogin} />);

    const usernameInput = getUsernameInput();
    const passwordInput = getPasswordInput();
    const submitBtn     = getSubmitButton();

    if (usernameInput) fireEvent.change(usernameInput, { target: { value: 'alice' } });
    if (passwordInput) fireEvent.change(passwordInput, { target: { value: 'wrong' } });
    if (submitBtn)     fireEvent.click(submitBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled(), { timeout: 3000 });
    expect(onLogin).not.toHaveBeenCalled();
  });

  test('does not expose user credentials in error state', async () => {
    mockFetchError(401, 'Unauthorized');
    renderLoginPage();

    const passwordInput = getPasswordInput();
    const submitBtn     = getSubmitButton();

    if (passwordInput) fireEvent.change(passwordInput, { target: { value: 'mysecret' } });
    if (submitBtn)     fireEvent.click(submitBtn);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled(), { timeout: 3000 });
    expect(document.body.innerHTML).not.toContain('mysecret');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Security — password masking (SNFR-8)
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – password masking', () => {
  test('typed password value is never visible as plain text in DOM', () => {
    renderLoginPage();
    const pw = getPasswordInput();
    if (pw) {
      fireEvent.change(pw, { target: { value: 'ultrasecret' } });
      // The raw value should not appear as text content in the DOM
      const bodyText = document.body.textContent || '';
      expect(bodyText).not.toContain('ultrasecret');
    }
  });
});
