/**
 * Tests for CodeEditorPage.js
 *
 * Requirements traced:
 *   UFR-5   students can submit Prolog code
 *   UFR-9   syntax check gives meaningful feedback
 */
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import CodeEditorPage from '../../pages/CodeEditorPage';

afterEach(() => jest.resetAllMocks());

// Universal fetch mock that responds differently by URL
function setupFetch({ syntaxResult = null, diagResult = null } = {}) {
  global.fetch = jest.fn().mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/api/options')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ problem_files: ['append.pl'], student_code_files: ['test.pl'] }),
      });
    }
    if (u.includes('/api/load')) {
      return Promise.resolve({ ok: true, json: async () => ({}) });
    }
    if (u.includes('/api/syntax-check')) {
      return Promise.resolve({
        ok: true,
        json: async () => syntaxResult || {},
      });
    }
    if (u.includes('/api/full-diagnosis')) {
      return Promise.resolve({
        ok: true,
        json: async () => diagResult || { diagnosis: { status: 'correct' }, feedback: 'OK' },
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe('CodeEditorPage — rendering', () => {
  test('renders without crashing', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    expect(() => render(<CodeEditorPage role="student" />)).not.toThrow();
  });

  test('shows Prolog Code Checker heading', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<CodeEditorPage role="student" />);
    expect(screen.getByText(/prolog code checker/i)).toBeInTheDocument();
  });

  test('shows Check Syntax button', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<CodeEditorPage role="student" />);
    expect(screen.getByRole('button', { name: /check syntax/i })).toBeInTheDocument();
  });

  test('shows Run & Diagnose button', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<CodeEditorPage role="student" />);
    expect(
      screen.getByRole('button', { name: /run.*diagnose|diagnose/i })
    ).toBeInTheDocument();
  });

  test('renders textarea for code input', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<CodeEditorPage role="student" />);
    expect(document.querySelector('textarea')).toBeTruthy();
  });

  test('shows Results panel', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<CodeEditorPage role="student" />);
    expect(screen.getByText('Results')).toBeInTheDocument();
  });
});

describe('CodeEditorPage — syntax check', () => {
  test('calls syntax-check API and shows errors', async () => {
    setupFetch({ syntaxResult: { errors: ['Unexpected token at line 1'] } });
    const user = userEvent.setup();
    render(<CodeEditorPage role="student" />);

    // Wait for options to load
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalled()
    );

    await user.click(screen.getByRole('button', { name: /check syntax/i }));

    await waitFor(() => {
      const putCalls = global.fetch.mock.calls.filter(([u]) => String(u).includes('syntax-check'));
      expect(putCalls.length).toBeGreaterThan(0);
    });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/unexpected token/i)
    );
  });

  test('shows ok message when syntax passes', async () => {
    setupFetch({ syntaxResult: {} });
    const user = userEvent.setup();
    render(<CodeEditorPage role="student" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /check syntax/i }));

    await waitFor(() => {
      const calls = global.fetch.mock.calls.filter(([u]) => String(u).includes('syntax-check'));
      expect(calls.length).toBeGreaterThan(0);
    });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/syntax check passed|ok/i)
    );
  });
});

describe('CodeEditorPage — full diagnosis', () => {
  test('calls full-diagnosis API when Run & Diagnose clicked', async () => {
    setupFetch({
      diagResult: { diagnosis: { status: 'correct' }, feedback: 'Good job!' },
    });
    const user = userEvent.setup();
    render(<CodeEditorPage role="student" />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    await user.click(screen.getByRole('button', { name: /run.*diagnose|diagnose/i }));

    await waitFor(() => {
      const calls = global.fetch.mock.calls.filter(([u]) => String(u).includes('full-diagnosis'));
      expect(calls.length).toBeGreaterThan(0);
    });
  });
});

describe('CodeEditorPage — code input', () => {
  test('typing in textarea does not crash', () => {
    global.fetch = jest.fn().mockReturnValue(new Promise(() => {}));
    render(<CodeEditorPage role="student" />);
    const textarea = document.querySelector('textarea');
    fireEvent.change(textarea, { target: { value: 'fact(a).' } });
    expect(textarea.value).toContain('fact(a).');
  });
});
