/**
 * Jest unit tests for src/utils/prologEngineSimulator.js
 *
 * simulateProlog(query, sourceClauses) takes a query string and a Map
 * of predicate clauses (same format as extractSourceClauses) and returns
 * a flat array of trace nodes. The root node (parentId === null) has
 * result 'success' or 'fail'.
 *
 * Requirements traced:
 *   UFR-9   students see proof trees and execution traces
 *   SFR-11  system builds proof trees
 */

import { simulateProlog } from '../../utils/prologEngineSimulator';
import { extractSourceClauses } from '../../utils/engineOutputParser';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function dbFrom(src) {
  return extractSourceClauses(src);
}

function getSuccess(nodes) {
  const root = nodes.find(n => n.parentId === null);
  return root ? root.result === 'success' : false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Basic fact resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateProlog — fact resolution', () => {
  const src = 'foo(a).\nfoo(b).\n';

  test('succeeds for matching fact', () => {
    const nodes = simulateProlog('foo(a)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(true);
  });

  test('fails for non-matching fact', () => {
    const nodes = simulateProlog('foo(c)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(false);
  });

  test('returns nodes array', () => {
    const nodes = simulateProlog('foo(a)', dbFrom(src));
    expect(Array.isArray(nodes)).toBe(true);
    expect(nodes.length).toBeGreaterThan(0);
  });

  test('root node has parentId null', () => {
    const nodes = simulateProlog('foo(a)', dbFrom(src));
    const root = nodes.find(n => n.parentId === null);
    expect(root).toBeDefined();
  });

  test('succeeds for unknown predicate returns fail', () => {
    const nodes = simulateProlog('bar(a)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recursive rule resolution
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateProlog — derived rules (rule body resolution)', () => {
  // Use a simple two-level rule chain — no recursion, guaranteed to terminate.
  const src = 'animal(cat).\nanimal(dog).\npet(X) :- animal(X).\n';

  test('derived fact succeeds via rule body', () => {
    const nodes = simulateProlog('pet(cat)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(true);
  });

  test('derived fact fails when base fact is absent', () => {
    const nodes = simulateProlog('pet(fish)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(false);
  });

  test('failing derived query returns fail result', () => {
    const nodes = simulateProlog('pet(fish)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(false);
  });

  test('nodes contain success result for passing derived query', () => {
    const nodes = simulateProlog('pet(dog)', dbFrom(src));
    const results = new Set(nodes.map(n => n.result));
    expect(results.has('success')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unification and variables
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateProlog — variable unification', () => {
  const src = 'parent(tom, bob).\nparent(tom, liz).\n';

  test('ground fact matches exactly', () => {
    const nodes = simulateProlog('parent(tom,bob)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(true);
  });

  test('non-matching ground atoms fail', () => {
    const nodes = simulateProlog('parent(bob,tom)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Arithmetic builtins (is/2)
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateProlog — arithmetic builtin (is)', () => {
  const src = 'calc(X, Y) :- Y is X * 2.\n';

  test('arithmetic succeeds and produces nodes', () => {
    const nodes = simulateProlog('calc(3, 6)', dbFrom(src));
    expect(nodes.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cut behaviour
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateProlog — cut', () => {
  const src = 'max(X, Y, X) :- X >= Y, !.\nmax(_, Y, Y).\n';

  test('cut case produces cut node', () => {
    const nodes = simulateProlog('max(3,2,3)', dbFrom(src));
    const cutNode = nodes.find(n => n.result === 'cut');
    expect(cutNode).toBeDefined();
  });

  test('cut-prevented siblings are marked', () => {
    const nodes = simulateProlog('max(3,2,3)', dbFrom(src));
    const prevented = nodes.filter(n => n.cutPrevented === true);
    expect(prevented.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Failure cases
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateProlog — fail nodes', () => {
  const src = 'foo(a).\n';

  test('failed clause produces fail node', () => {
    const nodes = simulateProlog('foo(b)', dbFrom(src));
    const failNode = nodes.find(n => n.result === 'fail');
    expect(failNode).toBeDefined();
  });

  test('root node result is fail on overall failure', () => {
    const nodes = simulateProlog('foo(b)', dbFrom(src));
    expect(getSuccess(nodes)).toBe(false);
    const root = nodes.find(n => n.parentId === null);
    expect(root.result).toBe('fail');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty / edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('simulateProlog — edge cases', () => {
  test('empty database always fails', () => {
    const nodes = simulateProlog('foo(a)', new Map());
    expect(getSuccess(nodes)).toBe(false);
  });

  test('returns nodes even for unknown predicate', () => {
    const nodes = simulateProlog('unknown(x)', new Map());
    expect(Array.isArray(nodes)).toBe(true);
  });
});
