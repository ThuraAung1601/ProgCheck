/**
 * Tests for engineOutputParser.js
 *
 * Covers:
 *   - extractSourceClauses: parses facts, rules, arity, comments, multiline
 *   - parseEngineOutput: query splitting, proof tree parsing, node structure
 *   - buildNode: Goal/Builtin/Failed/fact/rule node shapes
 *   - mergeTraces: flattens query trace arrays
 *   - Ghost injection: cut-prevented nodes created from source clauses
 *
 * Requirements traced:
 *   UFR-9   proof tree displayed per query
 *   SFR-11  execution trace shown per clause
 */
import {
  extractSourceClauses,
  parseEngineOutput,
  mergeTraces,
  annotateWithSourceLines,
} from '../../utils/engineOutputParser';

// ── extractSourceClauses ──────────────────────────────────────────────────────

describe('extractSourceClauses', () => {
  it('returns empty Map for empty source', () => {
    const map = extractSourceClauses('');
    expect(map.size).toBe(0);
  });

  it('returns empty Map for null/undefined source', () => {
    expect(extractSourceClauses(null).size).toBe(0);
    expect(extractSourceClauses(undefined).size).toBe(0);
  });

  it('extracts a single fact', () => {
    const map = extractSourceClauses('foo(a).\n');
    expect(map.has('foo/1')).toBe(true);
    expect(map.get('foo/1').length).toBe(1);
    expect(map.get('foo/1')[0].isRule).toBe(false);
  });

  it('extracts a single rule', () => {
    const map = extractSourceClauses('bar(X) :- foo(X).\n');
    expect(map.has('bar/1')).toBe(true);
    const clause = map.get('bar/1')[0];
    expect(clause.isRule).toBe(true);
    expect(clause.body).toContain('foo(X)');
  });

  it('extracts multiple clauses for same predicate', () => {
    const src = 'max(X, Y, X) :- X >= Y.\nmax(X, Y, Y) :- Y > X.\n';
    const map = extractSourceClauses(src);
    expect(map.get('max/3').length).toBe(2);
  });

  it('marks clause with cut correctly', () => {
    const src = 'max(X, Y, X) :- X >= Y, !.\n';
    const map = extractSourceClauses(src);
    expect(map.get('max/3')[0].hascut).toBe(true);
  });

  it('clause without cut has hascut=false', () => {
    const src = 'foo(X) :- bar(X).\n';
    const map = extractSourceClauses(src);
    expect(map.get('foo/1')[0].hascut).toBe(false);
  });

  it('skips pure comment lines', () => {
    const src = '% This is a comment\nfoo(a).\n';
    const map = extractSourceClauses(src);
    expect(map.has('foo/1')).toBe(true);
    expect(map.size).toBe(1);
  });

  it('handles ternary predicate arity', () => {
    const src = 'append([], Y, Y).\n';
    const map = extractSourceClauses(src);
    expect(map.has('append/3')).toBe(true);
  });

  it('records head string for rule', () => {
    const src = 'foo(X) :- bar(X).\n';
    const map = extractSourceClauses(src);
    expect(map.get('foo/1')[0].head).toBe('foo(X)');
  });

  it('records body string for rule', () => {
    const src = 'foo(X) :- bar(X), baz(X).\n';
    const map = extractSourceClauses(src);
    expect(map.get('foo/1')[0].body).toBe('bar(X), baz(X)');
  });
});

// ── parseEngineOutput ─────────────────────────────────────────────────────────

describe('parseEngineOutput', () => {
  const SIMPLE_OUTPUT = `Query: append([],[],[])
Proof Tree:
Goal: append([],[],[]) (fact)
---
`;

  it('returns object with queries array', () => {
    const result = parseEngineOutput(SIMPLE_OUTPUT);
    expect(result).toHaveProperty('queries');
    expect(Array.isArray(result.queries)).toBe(true);
  });

  it('parses single query block', () => {
    const result = parseEngineOutput(SIMPLE_OUTPUT);
    expect(result.queries.length).toBe(1);
    expect(result.queries[0].query).toBe('append([],[],[])');
  });

  it('trace is an array', () => {
    const result = parseEngineOutput(SIMPLE_OUTPUT);
    expect(Array.isArray(result.queries[0].trace)).toBe(true);
  });

  it('fact node has result=success', () => {
    const result = parseEngineOutput(SIMPLE_OUTPUT);
    const factNode = result.queries[0].trace.find(n => n.isFact === true);
    expect(factNode).toBeDefined();
    expect(factNode.result).toBe('success');
  });

  it('parses multiple query blocks', () => {
    const twoQueries = `Query: foo(a)
Proof Tree:
Goal: foo(a) (fact)
---
Query: bar(b)
Proof Tree:
Goal: bar(b) (fact)
---
`;
    const result = parseEngineOutput(twoQueries);
    expect(result.queries.length).toBe(2);
  });

  it('returns synthetic root node when no proof tree section', () => {
    const output = 'Query: foo(a)\nResult: true\n';
    const result = parseEngineOutput(output);
    expect(result.queries[0].trace.length).toBeGreaterThan(0);
  });

  it('handles empty string without crashing', () => {
    expect(() => parseEngineOutput('')).not.toThrow();
  });

  it('rule node has clause string containing :-', () => {
    const ruleOutput = `Query: mortal(socrates)
Proof Tree:
Goal: mortal(socrates) :- human(socrates)
  Goal: human(socrates) (fact)
---
`;
    const result = parseEngineOutput(ruleOutput);
    const ruleNode = result.queries[0].trace.find(n => n.clause && n.clause.includes(':-'));
    expect(ruleNode).toBeDefined();
  });

  it('builtin node has clauseIndex=-1', () => {
    const output = `Query: foo(a)
Proof Tree:
Goal: foo(a) :- X > 0, !
  Builtin: X > 0
---
`;
    const result = parseEngineOutput(output);
    const builtinNode = result.queries[0].trace.find(n => n.clauseIndex === -1 && n.result !== 'cut');
    expect(builtinNode).toBeDefined();
  });

  it('cut node has result=cut', () => {
    const output = `Query: foo(a)
Proof Tree:
Goal: foo(a) :- !
  Builtin: !
---
`;
    const result = parseEngineOutput(output);
    const cutNode = result.queries[0].trace.find(n => n.result === 'cut');
    expect(cutNode).toBeDefined();
  });
});

// ── mergeTraces ───────────────────────────────────────────────────────────────

describe('mergeTraces', () => {
  it('returns empty array for empty queries', () => {
    expect(mergeTraces([])).toEqual([]);
  });

  it('merges multiple query traces into flat array', () => {
    const queries = [
      { query: 'a', trace: [{ id: '1' }, { id: '2' }] },
      { query: 'b', trace: [{ id: '3' }] },
    ];
    const merged = mergeTraces(queries);
    expect(merged.length).toBe(3);
    expect(merged.map(n => n.id)).toEqual(['1', '2', '3']);
  });

  it('handles query with empty trace', () => {
    const queries = [{ query: 'a', trace: [] }, { query: 'b', trace: [{ id: '1' }] }];
    expect(mergeTraces(queries).length).toBe(1);
  });
});

// ── annotateWithSourceLines ───────────────────────────────────────────────────

describe('annotateWithSourceLines', () => {
  const code = 'foo(a).\nfoo(b).\n';
  const sourceClauses = extractSourceClauses(code);

  it('returns same length array', () => {
    const trace = [{ id: 'n1', goal: 'foo(a)', lineStart: -1, lineEnd: -1 }];
    const result = annotateWithSourceLines(trace, code, sourceClauses);
    expect(result.length).toBe(1);
  });

  it('annotates a node whose lineStart was -1', () => {
    const trace = [{ id: 'n1', goal: 'foo(a)', lineStart: -1, lineEnd: -1, cutPrevented: false }];
    const result = annotateWithSourceLines(trace, code, sourceClauses);
    expect(result[0].lineStart).toBeGreaterThanOrEqual(0);
  });

  it('does not overwrite a node that already has a valid lineStart', () => {
    const trace = [{ id: 'n1', goal: 'foo(a)', lineStart: 5, lineEnd: 5, cutPrevented: false }];
    const result = annotateWithSourceLines(trace, code, sourceClauses);
    expect(result[0].lineStart).toBe(5);
  });
});

// ── Ghost injection via cut ───────────────────────────────────────────────────

describe('ghost injection for cut', () => {
  it('creates cut-prevented ghost nodes when source has multiple clauses and cut fires', () => {
    // Source: two clauses of max/3, first has cut
    const src = 'max(X,Y,X) :- X>=Y, !.\nmax(_,Y,Y).\n';
    // Engine output: first clause matched (with cut)
    const output = `Query: max(3,2,3)
Proof Tree:
Goal: max(3,2,3) :- 3>=2,!
  Builtin: 3>=2
  Builtin: !
---
`;
    const result = parseEngineOutput(output, src);
    const trace = result.queries[0].trace;
    const ghostNodes = trace.filter(n => n.cutPrevented === true);
    expect(ghostNodes.length).toBeGreaterThan(0);
  });
});
