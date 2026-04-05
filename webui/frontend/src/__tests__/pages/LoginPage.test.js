/**
 * Jest / React Testing Library tests for the Login page.
 *
 * Uses @testing-library/user-event (v14) for input interactions so that
 * React's synthetic event system and state updates are properly flushed
 * before assertions — fireEvent.change alone does not guarantee this.
 *
 * Requirements traced:
 *   UFR-1  register and log in
 *   UFR-2  log out securely
 *   SNFR-1 easy to use for Prolog beginners
 *   SNFR-8 password not exposed in logs / DOM
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// ── Constants ─────────────────────────────────────────────────────────────────

const FAKE_AUTH_RESPONSE = {
  user: { id: 'STU001', username: 'alice', role: 'student', display_name: 'Alice' },
  token: 'fake-token-abc',
};

// ── Selectors — use stable IDs from InputField component ──────────────────────
// InputField generates id="field-<label-lowercase>" so username → "field-username"
const getUsernameInput = () => document.getElementById('field-username');
const getPasswordInput = () => document.getElementById('field-password');
const getSubmitButton  = () =>
  screen.queryByRole('button', { name: /sign in|log in|submit/i }) ||
  document.querySelector('button[type="submit"]');

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – rendering', () => {
  test('renders without crashing', () => {
    expect(() => render(<LoginPage onLogin={jest.fn()} />)).not.toThrow();
  });

  test('renders username input', () => {
    render(<LoginPage onLogin={jest.fn()} />);
    expect(getUsernameInput()).toBeTruthy();
  });

  test('renders password input with type=password', () => {
    render(<LoginPage onLogin={jest.fn()} />);
    const pw = getPasswordInput();
    expect(pw).toBeTruthy();
    expect(pw.type).toBe('password');
  });

  test('renders a submit button', () => {
    render(<LoginPage onLogin={jest.fn()} />);
    expect(getSubmitButton()).toBeTruthy();
  });

  test('password field is masked (type=password)', () => {
    render(<LoginPage onLogin={jest.fn()} />);
    expect(getPasswordInput().type).toBe('password');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Successful login — userEvent ensures React state is flushed before submit
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – successful login', () => {
  test('calls fetch with correct endpoint on submit', async () => {
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    const user = userEvent.setup();
    render(<LoginPage onLogin={jest.fn()} />);

    await user.type(getUsernameInput(), 'alice');
    await user.type(getPasswordInput(), 'pass123');
    await user.click(getSubmitButton());

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url] = global.fetch.mock.calls[0];
    expect(url).toMatch(/login/);
  });

  test('calls onLogin after successful API response', async () => {
    const onLogin = jest.fn();
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(getUsernameInput(), 'alice');
    await user.type(getPasswordInput(), 'pass123');
    await user.click(getSubmitButton());

    await waitFor(() => expect(onLogin).toHaveBeenCalledTimes(1));
  });

  test('does not expose token in the DOM after login', async () => {
    mockFetchSuccess(FAKE_AUTH_RESPONSE);
    const user = userEvent.setup();
    render(<LoginPage onLogin={jest.fn()} />);

    await user.type(getUsernameInput(), 'alice');
    await user.type(getPasswordInput(), 'pass123');
    await user.click(getSubmitButton());

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    // Token must never appear as visible text content
    expect(document.body.textContent).not.toContain('fake-token-abc');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failed login
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – failed login', () => {
  test('does not call onLogin when credentials are wrong', async () => {
    const onLogin = jest.fn();
    mockFetchError(401, 'Invalid username or password');
    const user = userEvent.setup();
    render(<LoginPage onLogin={onLogin} />);

    await user.type(getUsernameInput(), 'alice');
    await user.type(getPasswordInput(), 'wrongpass');
    await user.click(getSubmitButton());

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(onLogin).not.toHaveBeenCalled();
  });

  test('shows an error message on 401', async () => {
    mockFetchError(401, 'Invalid username or password');
    const user = userEvent.setup();
    render(<LoginPage onLogin={jest.fn()} />);

    await user.type(getUsernameInput(), 'alice');
    await user.type(getPasswordInput(), 'wrongpass');
    await user.click(getSubmitButton());

    await waitFor(() => {
      const text = document.body.textContent;
      expect(
        /invalid|error|incorrect|failed|unauthorized/i.test(text)
      ).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client-side validation (form blocks empty submission)
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – client-side validation', () => {
  test('does not call fetch when username is empty', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={jest.fn()} />);

    // Only fill password — leave username empty
    await user.type(getPasswordInput(), 'pass123');
    await user.click(getSubmitButton());

    // wait one tick to ensure any async handlers run
    await new Promise(r => setTimeout(r, 100));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('does not call fetch when password is empty', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={jest.fn()} />);

    await user.type(getUsernameInput(), 'alice');
    await user.click(getSubmitButton());

    await new Promise(r => setTimeout(r, 100));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Security — password masking (SNFR-8)
// ─────────────────────────────────────────────────────────────────────────────

describe('LoginPage – password masking', () => {
  test('typed password never appears as visible text in the DOM', async () => {
    const user = userEvent.setup();
    render(<LoginPage onLogin={jest.fn()} />);

    await user.type(getPasswordInput(), 'ultrasecret');

    // textContent is the visible text — the password should not be readable
    expect(document.body.textContent).not.toContain('ultrasecret');
  });
});
