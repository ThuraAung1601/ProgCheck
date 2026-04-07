/**
 * Tests for App.js
 *
 * Requirements traced:
 *   UFR-1   students and teachers can log in and register
 *   UFR-2   navigation between pages
 *   SNFR-6  accessible via modern web browser
 */
import React, { useState } from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Mock heavy visual components ──────────────────────────────────────────────
jest.mock('../components/GraphCanvas',    () => () => <div data-testid="graph-canvas" />);
jest.mock('../components/BacktrackTree', () => () => <div data-testid="backtrack-tree" />);
jest.mock('../components/CodeEditor',    () => (props) => (
  <textarea
    data-testid="code-editor"
    value={props.value || ''}
    onChange={e => props.onChange && props.onChange(e.target.value)}
    readOnly={!props.onChange}
  />
));
jest.mock('../components/NodeInfo',      () => () => null);
jest.mock('../components/TraceImporter', () => () => null);
jest.mock('../pages/Dashboard', () =>
  function MockDashboard({ onLogout }) {
    return (
      <div data-testid="dashboard">
        <button onClick={onLogout}>Logout</button>
      </div>
    );
  }
);

import App, { TestCaseReviewBody } from '../App';

// Universal fetch mock that returns empty/default responses
function setupFetchMock() {
  global.fetch = jest.fn().mockImplementation((url) => {
    const urlStr = String(url);
    if (urlStr.includes('/api/options') || urlStr.includes('/api/labs')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ problem_files: [], student_code_files: [], questions: [] }),
        text: async () => '[]',
      });
    }
    if (urlStr.includes('/api/user-files')) {
      return Promise.resolve({ ok: true, json: async () => ({ files: [] }), text: async () => '{}' });
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
      text: async () => '{}',
    });
  });
}

beforeEach(() => {
  sessionStorage.clear();
  setupFetchMock();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  jest.resetAllMocks();
  sessionStorage.clear();
});

// ── App rendering ─────────────────────────────────────────────────────────────

describe('App — initial rendering', () => {
  test('renders without crashing', () => {
    expect(() => render(<App />)).not.toThrow();
  });

  test('shows landing page by default', () => {
    render(<App />);
    expect(screen.getAllByText(/ProgCheck/i).length).toBeGreaterThan(0);
  });

  test('shows login page when navigating to /login', () => {
    window.history.pushState({}, '', '/login');
    render(<App />);
    // LoginPage has username/password inputs
    expect(
      document.getElementById('field-username') ||
      document.querySelector('input[type="password"]')
    ).toBeTruthy();
  });

  test('shows dashboard when session is stored', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 'S1', name: 'Alice', role: 'student' }));
    sessionStorage.setItem('userRole', 'student');
    window.history.pushState({}, '', '/dashboard');
    await act(async () => {
      render(<App />);
    });
    expect(screen.getByTestId('dashboard')).toBeInTheDocument();
  });
});

describe('App — logout', () => {
  test('logout from dashboard returns to landing', async () => {
    sessionStorage.setItem('user', JSON.stringify({ id: 'S1', name: 'Alice', role: 'student' }));
    sessionStorage.setItem('userRole', 'student');
    window.history.pushState({}, '', '/dashboard');
    await act(async () => {
      render(<App />);
    });

    fireEvent.click(screen.getByText('Logout'));

    await waitFor(() =>
      expect(screen.getAllByText(/ProgCheck/i).length).toBeGreaterThan(0)
    );
  });
});

// ── TestCaseReviewBody ────────────────────────────────────────────────────────

describe('TestCaseReviewBody', () => {
  function Wrapper() {
    const [tcs, setTcs] = useState([
      { testcase_id: 1, input: 'append([],Y,Y)', expected_output: 'true', _source: 'given' },
      { testcase_id: 2, input: 'bad_call', expected_output: 'false', _source: 'llm' },
    ]);
    const [newInput, setNewInput] = useState('');
    const [newExpected, setNewExpected] = useState('true');

    const addTc = () => {
      const q = newInput.trim().replace(/\.$/, '');
      if (!q) return;
      setTcs(prev => [...prev, { testcase_id: Date.now(), input: q, expected_output: newExpected, _source: 'manual' }]);
      setNewInput('');
    };

    return (
      <TestCaseReviewBody
        reviewTcs={tcs}
        setReviewTcs={setTcs}
        newTcInput={newInput}
        setNewTcInput={setNewInput}
        newTcExpected={newExpected}
        setNewTcExpected={setNewExpected}
        addReviewTc={addTc}
      />
    );
  }

  test('renders without crashing', () => {
    expect(() => render(<Wrapper />)).not.toThrow();
  });

  test('shows existing test cases', () => {
    render(<Wrapper />);
    expect(screen.getByText('append([],Y,Y)')).toBeInTheDocument();
    expect(screen.getByText('bad_call')).toBeInTheDocument();
  });

  test('shows empty state when no test cases', () => {
    render(
      <TestCaseReviewBody
        reviewTcs={[]}
        setReviewTcs={jest.fn()}
        newTcInput=""
        setNewTcInput={jest.fn()}
        newTcExpected="true"
        setNewTcExpected={jest.fn()}
        addReviewTc={jest.fn()}
      />
    );
    expect(screen.getByText(/no test cases/i)).toBeInTheDocument();
  });

  test('remove button deletes a test case', () => {
    render(<Wrapper />);
    const removeBtns = screen.getAllByTitle('Remove');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[0]);
    expect(screen.queryByText('append([],Y,Y)')).not.toBeInTheDocument();
  });

  test('Add button is disabled when input is empty', () => {
    render(<Wrapper />);
    const addBtn = screen.getByRole('button', { name: /^add$/i });
    expect(addBtn).toBeDisabled();
  });

  test('Add button enabled and works when input has text', () => {
    render(<Wrapper />);
    const input = screen.getByPlaceholderText(/factorial/i);
    fireEvent.change(input, { target: { value: 'member(a,[a,b])' } });
    const addBtn = screen.getByRole('button', { name: /^add$/i });
    expect(addBtn).not.toBeDisabled();
    fireEvent.click(addBtn);
    expect(screen.getByText('member(a,[a,b])')).toBeInTheDocument();
  });

  test('shows AI badge for llm source test cases', () => {
    render(<Wrapper />);
    expect(screen.getByText('AI')).toBeInTheDocument();
  });

  test('shows Given badge for given source test cases', () => {
    render(<Wrapper />);
    expect(screen.getByText('Given')).toBeInTheDocument();
  });
});
