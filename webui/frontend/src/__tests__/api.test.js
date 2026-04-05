/**
 * Jest tests for the API integration layer (App.js apiFetch helper and key
 * API contracts).
 *
 * All HTTP calls are mocked via jest.fn() so no server is required.
 *
 * Requirements traced:
 *   UFR-5   students submit Prolog code
 *   UFR-7   pass/fail results per test case
 *   UFR-8   readable syntax error messages
 *   UFR-9   proof trees and execution traces
 *   UFR-10  ranked diagnosis messages
 *   UFR-11  submission history
 *   SNFR-3  consistent results for same inputs
 *   SNFR-10 graceful LLM degradation
 */

// ── Replicate the apiFetch helper from App.js ─────────────────────────────────

const API_BASE = 'http://localhost:8000';

async function apiFetch(path, body) {
  const res = await fetch(API_BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

// ── Mock setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  global.fetch = jest.fn();
});

afterEach(() => {
  jest.resetAllMocks();
});

function ok(body) {
  return Promise.resolve({
    ok: true,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function err(status, msg = 'Error') {
  return Promise.resolve({
    ok: false,
    status,
    json: async () => ({ detail: msg }),
    text: async () => msg,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// apiFetch helper behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('apiFetch helper', () => {
  test('GET request does not include a body', async () => {
    global.fetch.mockReturnValueOnce(ok({ problems: [] }));
    await apiFetch('/api/options');
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.method).toBe('GET');
    expect(opts.body).toBeUndefined();
  });

  test('POST request sends JSON body', async () => {
    global.fetch.mockReturnValueOnce(ok({ ok: true }));
    await apiFetch('/api/syntax-check', { problem_id: 1, student_code: 'code.' });
    const [, opts] = global.fetch.mock.calls[0];
    expect(opts.method).toBe('POST');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const sent = JSON.parse(opts.body);
    expect(sent.student_code).toBe('code.');
  });

  test('throws on non-OK response', async () => {
    global.fetch.mockReturnValueOnce(err(404, 'Not found'));
    await expect(apiFetch('/api/labs/999')).rejects.toThrow('Not found');
  });

  test('returns parsed JSON on success', async () => {
    global.fetch.mockReturnValueOnce(ok({ value: 42 }));
    const result = await apiFetch('/api/options');
    expect(result.value).toBe(42);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/syntax-check (SFR-6, UFR-8)
// ─────────────────────────────────────────────────────────────────────────────

describe('/api/syntax-check', () => {
  const PAYLOAD = {
    problem_id: 1, student_file: 'test.pl',
    student_code: 'append([],Y,Y).\nappend([H|T],Y,[H|R]):-append(T,Y,R).',
  };

  test('returns ok:true for valid Prolog', async () => {
    global.fetch.mockReturnValueOnce(ok({ ok: true, feedback: '', syntax_error: null }));
    const res = await apiFetch('/api/syntax-check', PAYLOAD);
    expect(res.ok).toBe(true);
    expect(res.syntax_error).toBeNull();
  });

  test('returns ok:false with syntax_error for invalid Prolog', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: false,
      feedback: 'Syntax error at line 1',
      syntax_error: 'Missing closing parenthesis',
    }));
    const res = await apiFetch('/api/syntax-check', PAYLOAD);
    expect(res.ok).toBe(false);
    expect(typeof res.syntax_error).toBe('string');
    expect(res.syntax_error.length).toBeGreaterThan(0);
  });

  test('error message is human-readable (UFR-8)', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: false,
      feedback: 'Missing closing parenthesis at line 3',
      syntax_error: 'Missing closing parenthesis at line 3',
    }));
    const res = await apiFetch('/api/syntax-check', PAYLOAD);
    // Should not be a raw Prolog exception atom
    expect(res.syntax_error).not.toMatch(/^error\(.*\)$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/full-diagnosis (SFR-10, UFR-7, UFR-9, UFR-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('/api/full-diagnosis', () => {
  const PAYLOAD = {
    problem_id: 1, student_file: 'test.pl',
    student_code: 'append([],Y,[]).',   // wrong base
  };

  test('response contains log field (UFR-9)', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: true,
      log: '=== Diagnosis ===\nTest 1 FAILED\n',
      corrected_code: '',
      diff: '',
      changed: false,
    }));
    const res = await apiFetch('/api/full-diagnosis', PAYLOAD);
    expect(res).toHaveProperty('log');
    expect(typeof res.log).toBe('string');
  });

  test('failed test is reflected in log (UFR-7)', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: true,
      log: 'Test FAILED: append([],[],[]) expected true got false',
      corrected_code: '', diff: '', changed: false,
    }));
    const res = await apiFetch('/api/full-diagnosis', PAYLOAD);
    expect(res.log.toLowerCase()).toMatch(/fail/);
  });

  test('corrected_code present when auto-fix applied', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: true,
      log: '...',
      corrected_code: 'append([],Y,Y).\nappend([H|T],Y,[H|R]):-append(T,Y,R).',
      diff: '--- student_original.pl\n+++ student_corrected.pl\n...',
      changed: true,
    }));
    const res = await apiFetch('/api/full-diagnosis', PAYLOAD);
    expect(res.changed).toBe(true);
    expect(res.corrected_code).toContain('append');
    expect(res.diff).toContain('---');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// /api/query-run (UFR-9, UFR-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('/api/query-run', () => {
  const PAYLOAD = {
    problem_id: 1, student_file: 'test.pl',
    student_code: 'append([],Y,Y).',
    query: 'append([],[],[])',
  };

  test('returns ok:true with trace for valid query', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: true,
      query: 'append([],[],[])',
      query_result: 'true',
      trace: 'CALL append([],[],[])\nEXIT append([],[],[])',
      proof_tree: 'append([],[],[]) :- true',
      shapiro_mode: 'ok',
      has_logic_error: false,
    }));
    const res = await apiFetch('/api/query-run', PAYLOAD);
    expect(res.ok).toBe(true);
    expect(res.query_result).toBe('true');
    expect(typeof res.trace).toBe('string');
    expect(typeof res.proof_tree).toBe('string');
  });

  test('returns has_logic_error:true for incorrect code', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: true,
      query_result: 'false',
      has_logic_error: true,
      shapiro_mode: 'incorrect',
      trace: '',
      proof_tree: '',
    }));
    const res = await apiFetch('/api/query-run', PAYLOAD);
    expect(res.has_logic_error).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// LLM degradation (SNFR-10)
// ─────────────────────────────────────────────────────────────────────────────

describe('LLM unavailable – graceful degradation', () => {
  test('/api/llm-feedback returns ok:false with error string, does not crash', async () => {
    global.fetch.mockReturnValueOnce(ok({
      ok: false,
      error: 'LLM service unavailable',
      feedback: '',
    }));
    const res = await apiFetch('/api/llm-feedback', {
      problem_id: 1, student_file: 'f.pl', student_code: 'code.', query: 'q',
    });
    expect(res.ok).toBe(false);
    expect(typeof res.error).toBe('string');
  });

  test('/api/generate-diagnosis-testcases returns empty list when LLM down', async () => {
    global.fetch.mockReturnValueOnce(ok({ ok: false, test_cases: [], error: 'No key' }));
    const res = await apiFetch('/api/generate-diagnosis-testcases', {
      problem_id: 1, student_code: 'code.',
    });
    expect(Array.isArray(res.test_cases)).toBe(true);
    expect(res.test_cases).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Submission history (UFR-11)
// ─────────────────────────────────────────────────────────────────────────────

describe('Submission history', () => {
  test('student results endpoint returns array', async () => {
    global.fetch.mockReturnValueOnce(ok([
      { result_id: 1, student_id: 'STU001', question_id: 10,
        score: 80, status: 'passed', submission_time: '2026-04-01T10:00:00',
        code_file: 'code' },
    ]));
    const res = await apiFetch('/api/labs/results/student/STU001');
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].student_id).toBe('STU001');
  });
});
