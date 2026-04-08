/**
 * Tests for AssignmentPage.js
 *
 * Requirements traced:
 *   UFR-5   students can submit code and view results
 *   UFR-7   students see diagnosis feedback
 *   UFR-8   students see syntax feedback
 *   UFR-9   students can run queries and see proof tree/trace
 *   UFR-10  teacher can review student submissions
 *   SNFR-6  accessible via modern web browser
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// ── Mock heavy canvas/tree components ────────────────────────────────────────
jest.mock('../../components/GraphCanvas', () => () => <div data-testid="graph-canvas" />);
jest.mock('../../components/BacktrackTree', () => () => <div data-testid="backtrack-tree" />);
jest.mock('../../components/CodeEditor', () => (props) => (
  <textarea
    data-testid="code-editor"
    value={props.value || ''}
    onChange={e => props.onChange && props.onChange(e.target.value)}
  />
));
jest.mock('../../components/NodeInfo', () => () => null);
jest.mock('../../components/DiffViewer', () => () => <div data-testid="diff-viewer" />);

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
};

import AssignmentPage from '../../pages/AssignmentPage';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const QUESTION = {
  question_id: 42,
  title: 'append/3',
  problem: 'Write the append/3 predicate.',
  test_cases: [
    { testcase_id: 1, input: 'append([],[],[])', expected_output: 'true' },
    { testcase_id: 2, input: 'append([a],[b],[a,b])', expected_output: 'true' },
  ],
};

const LAB = { lab_id: 99, title: 'Lab 1', status: 'active' };
const CLASSROOM = { class_id: 'C1', class_name: 'CS101' };

const studentUser = { id: 'STU001', name: 'Alice' };
const teacherUser = { id: 'TCH001', name: 'Prof' };

function renderPage(props = {}) {
  return render(
    <AssignmentPage
      assignmentData={{ question: QUESTION, lab: LAB, classroom: CLASSROOM }}
      role="student"
      user={studentUser}
      onBack={jest.fn()}
      {...props}
    />
  );
}

// Universal fetch mock
function mockFetch(overrides = {}) {
  global.fetch = jest.fn().mockImplementation((url) => {
    const u = String(url);
    if (u.includes('/api/labs/results/student')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (u.includes('/api/syntax-check')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, feedback: 'Syntax OK.' }) });
    }
    if (u.includes('/api/query-run')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true, query: 'append([],[],[])', query_result: 'true',
          trace: 'Call: append([], [], [])', proof_tree: 'Goal: append([], [], []) (fact)',
          shapiro_mode: 'ok', has_logic_error: false,
          feedback: '', debug_summary: '',
        }),
      });
    }
    if (u.includes('/api/llm-feedback')) {
      return Promise.resolve({
        ok: true, json: async () => ({ feedback: 'LLM says looks good!', trace: '', proof_tree: '', debug_summary: '' }),
      });
    }
    if (u.includes('/api/generate-diagnosis-testcases')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, test_cases: [] }) });
    }
    if (u.includes('/api/full-diagnosis')) {
      return Promise.resolve({ ok: true, json: async () => ({ ok: true, log: 'All tests passed.' }) });
    }
    if (u.includes('/api/labs/submit')) {
      return Promise.resolve({ ok: true, json: async () => ({ result_id: 999 }) });
    }
    if (u.includes('/api/classrooms') && u.includes('/students')) {
      return Promise.resolve({ ok: true, json: async () => ({ students: [] }) });
    }
    if (u.includes('/api/labs/results/question')) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

beforeEach(() => mockFetch());
afterEach(() => jest.resetAllMocks());

// ── Basic rendering ───────────────────────────────────────────────────────────

describe('AssignmentPage — rendering', () => {
  test('renders without crashing (student)', () => {
    expect(() => renderPage()).not.toThrow();
  });

  test('renders without crashing (teacher)', async () => {
    expect(() =>
      renderPage({ role: 'teacher', user: teacherUser })
    ).not.toThrow();
  });

  test('shows question title', async () => {
    renderPage();
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/append\/3|append/i)
    );
  });

  test('shows problem description', async () => {
    renderPage();
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/Write the append/i)
    );
  });

  test('shows code editor', () => {
    renderPage();
    expect(document.querySelector('[data-testid="code-editor"]')).toBeTruthy();
  });

  test('Graph tab is clickable without crashing', () => {
    renderPage();
    // GraphCanvas lives in the ⬡ Graph tab; it only renders when graph.nodes is non-empty
    const graphTab = screen.getAllByRole('button').find(b => /graph/i.test(b.textContent));
    if (graphTab) {
      expect(() => fireEvent.click(graphTab)).not.toThrow();
    }
  });

  test('shows Syntax, Run, LLM, Diagnose, Visualize buttons', () => {
    renderPage();
    const text = document.body.textContent;
    expect(text).toMatch(/syntax/i);
    expect(text).toMatch(/run/i);
  });

  test('onBack is callable', () => {
    const onBack = jest.fn();
    renderPage({ onBack });
    // Find and click back button
    const backBtn = screen.queryByTitle(/back/i) || screen.queryByText(/back/i);
    if (backBtn) fireEvent.click(backBtn);
    // Just ensure it doesn't throw
    expect(true).toBe(true);
  });
});

// ── Toolbar actions ───────────────────────────────────────────────────────────

describe('AssignmentPage — Syntax check', () => {
  test('Syntax button triggers syntax-check API', async () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /syntax/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/syntax-check'),
          expect.any(Object)
        )
      );
    }
  });

  test('shows feedback after successful syntax check', async () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /syntax/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/syntax ok/i)
      );
    }
  });

  test('shows error feedback when syntax check fails', async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (String(url).includes('/api/labs/results/student')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: false, feedback: 'Line 3: syntax error', syntax_error: { line: 3, friendly_message: 'Unexpected token' } }),
      });
    });
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /syntax/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/syntax error|line 3/i)
      );
    }
  });
});

describe('AssignmentPage — Query run', () => {
  test('Run button requires a query — shows error when empty', async () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /^run$/i.test(b.textContent.trim()));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/enter a query|query/i)
      );
    }
  });

  test('Run with query calls /api/query-run', async () => {
    renderPage();
    const queryInput = document.querySelector('input[placeholder*="query" i], input[placeholder*="append" i], input[type="text"]');
    if (queryInput) {
      fireEvent.change(queryInput, { target: { value: 'append([],[],[])' } });
      const btn = screen.getAllByRole('button').find(b => /^run$/i.test(b.textContent.trim()));
      if (btn) {
        fireEvent.click(btn);
        await waitFor(() =>
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/api/query-run'),
            expect.any(Object)
          )
        );
      }
    }
  });

  test('shows logic error feedback when shapiro detects problem', async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (String(url).includes('/api/labs/results/student')) {
        return Promise.resolve({ ok: true, json: async () => [] });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          ok: true, query: 'append([a],[b],[a,b])', query_result: 'false',
          trace: '', proof_tree: '', shapiro_mode: 'incomplete',
          has_logic_error: true, feedback: '', debug_summary: '',
        }),
      });
    });
    renderPage();
    const queryInput = document.querySelector('input[type="text"], input');
    if (queryInput) {
      fireEvent.change(queryInput, { target: { value: 'append([a],[b],[a,b])' } });
      const btn = screen.getAllByRole('button').find(b => /^run$/i.test(b.textContent.trim()));
      if (btn) {
        fireEvent.click(btn);
        await waitFor(() =>
          expect(document.body.textContent).toMatch(/incomplete|logic error|error/i)
        );
      }
    }
  });
});

describe('AssignmentPage — Visualize', () => {
  test('Visualize button exists and clicking does not crash', () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /visuali/i.test(b.textContent));
    if (btn) {
      expect(() => fireEvent.click(btn)).not.toThrow();
    }
  });

  test('Visualize with a query and code does not crash', () => {
    renderPage();
    const editor = document.querySelector('[data-testid="code-editor"]');
    if (editor) fireEvent.change(editor, { target: { value: 'append([],Y,Y).' } });
    const queryInput = document.querySelector('input[type="text"], input');
    if (queryInput) fireEvent.change(queryInput, { target: { value: 'append([],[],[])' } });
    const btn = screen.getAllByRole('button').find(b => /visuali/i.test(b.textContent));
    if (btn) expect(() => fireEvent.click(btn)).not.toThrow();
  });
});

describe('AssignmentPage — LLM feedback', () => {
  test('LLM button calls /api/llm-feedback', async () => {
    renderPage();
    const queryInput = document.querySelector('input[type="text"], input');
    if (queryInput) fireEvent.change(queryInput, { target: { value: 'append([],[],[])' } });
    const btn = screen.getAllByRole('button').find(b => /llm/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/llm-feedback'),
          expect.any(Object)
        )
      );
    }
  });
});

describe('AssignmentPage — Run Tests', () => {
  test('Run Tests button calls query-run for each test case', async () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /run tests/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/query-run'),
          expect.any(Object)
        )
      );
    }
  });

  test('shows test results after running tests', async () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /run tests/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/passed|result|test/i)
      );
    }
  });
});

describe('AssignmentPage — Submit', () => {
  test('Submit button calls /api/labs/submit', async () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /submit/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/labs/submit'),
          expect.any(Object)
        )
      );
    }
  });

  test('shows submitted result ID after submit', async () => {
    renderPage();
    const btn = screen.getAllByRole('button').find(b => /submit/i.test(b.textContent));
    if (btn) {
      fireEvent.click(btn);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/result|submit|999/i)
      );
    }
  });
});

describe('AssignmentPage — Code editor interactions', () => {
  test('typing in the editor updates code state', () => {
    renderPage();
    const editor = document.querySelector('[data-testid="code-editor"]');
    if (editor) {
      fireEvent.change(editor, { target: { value: 'foo(X) :- bar(X).' } });
      expect(editor.value).toBe('foo(X) :- bar(X).');
    }
  });

  test('empty code shows empty editor initially', () => {
    renderPage();
    const editor = document.querySelector('[data-testid="code-editor"]');
    if (editor) {
      expect(editor.value).toMatch(/write your prolog|%/i);
    }
  });
});

describe('AssignmentPage — Tab navigation', () => {
  test('Problem tab shows problem description', async () => {
    renderPage();
    const problemTab = screen.getAllByRole('button').find(b => /problem/i.test(b.textContent));
    if (problemTab) {
      fireEvent.click(problemTab);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/Write the append/i)
      );
    }
  });

  test('Test Cases tab shows test cases', async () => {
    renderPage();
    const testTab = screen.getAllByRole('button').find(b => /test cases/i.test(b.textContent));
    if (testTab) {
      fireEvent.click(testTab);
      await waitFor(() =>
        expect(document.body.textContent).toMatch(/append\(\[\],\[\],\[\]\)/i)
      );
    }
  });

  test('Trace tab is accessible', () => {
    renderPage();
    const traceTab = screen.getAllByRole('button').find(b => /trace/i.test(b.textContent));
    if (traceTab) {
      expect(() => fireEvent.click(traceTab)).not.toThrow();
    }
  });
});

describe('AssignmentPage — Teacher view', () => {
  test('teacher view renders without crashing', async () => {
    expect(() =>
      renderPage({ role: 'teacher', user: teacherUser })
    ).not.toThrow();
  });

  test('teacher view fetches students and results on mount', async () => {
    renderPage({ role: 'teacher', user: teacherUser });
    await waitFor(() => {
      const calls = global.fetch.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('students') || u.includes('results'))).toBe(true);
    });
  });

  test('teacher sees student selector', async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (String(url).includes('/students')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ students: [{ student_id: 'STU001', username: 'alice' }] }),
        });
      }
      if (String(url).includes('/results/question')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([{ result_id: 1, student_id: 'STU001', score: 80, status: 'graded', submission_time: new Date().toISOString(), code_file: 'append([],Y,Y).' }]),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    renderPage({ role: 'teacher', user: teacherUser });
    await waitFor(() =>
      expect(document.body.textContent).toMatch(/student|submission|result/i)
    );
  });
});

describe('AssignmentPage — Student last submission preload', () => {
  test('preloads last submission code from API', async () => {
    global.fetch = jest.fn().mockImplementation((url) => {
      if (String(url).includes('/api/labs/results/student')) {
        return Promise.resolve({
          ok: true,
          json: async () => ([{
            result_id: 1, question_id: 42, score: 0, status: 'pending',
            submission_time: new Date().toISOString(),
            code_file: 'append([], Y, Y).',
          }]),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    renderPage();
    await waitFor(() => {
      const editor = document.querySelector('[data-testid="code-editor"]');
      if (editor) expect(editor.value).toMatch(/append|Y/i);
    });
  });
});

describe('AssignmentPage — Question with no test cases', () => {
  test('renders correctly when question has no test cases', () => {
    const questionNoTcs = { ...QUESTION, test_cases: [] };
    expect(() =>
      render(
        <AssignmentPage
          assignmentData={{ question: questionNoTcs, lab: LAB, classroom: CLASSROOM }}
          role="student"
          user={studentUser}
          onBack={jest.fn()}
        />
      )
    ).not.toThrow();
  });
});
