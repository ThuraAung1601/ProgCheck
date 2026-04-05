/**
 * Jest unit tests for src/utils/prologParser.js
 *
 * parseProlog returns clauses where:
 *   clause.type  — 'fact' | 'rule'
 *   clause.head  — term object { functor, args, arity, isVar? }
 *   clause.body  — array of term objects (empty for facts)
 *   clause.lineStart / clause.lineEnd — numbers
 *
 * clausesToGraph returns { nodes: [...], edges: [...] }
 *
 * Requirements traced:
 *   UFR-4   students read problem statement (parser feeds visualisation)
 *   UFR-9   proof trees and execution traces
 *   SNFR-6  system accessible via modern web browser
 */

import { parseProlog, clausesToGraph } from '../../utils/prologParser';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True if any goal in a body array has the given functor. */
function bodyContains(body, functor) {
  return Array.isArray(body) && body.some(g => g && g.functor === functor);
}

// ─────────────────────────────────────────────────────────────────────────────
// parseProlog
// ─────────────────────────────────────────────────────────────────────────────

describe('parseProlog – basic clause parsing', () => {
  test('parses a single fact', () => {
    const clauses = parseProlog('human(socrates).');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].type).toBe('fact');
    // head is a term object — check functor string
    expect(clauses[0].head.functor).toBe('human');
  });

  test('parses a rule with body', () => {
    const clauses = parseProlog('mortal(X) :- human(X).');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].type).toBe('rule');
    expect(clauses[0].head.functor).toBe('mortal');
    // body is an array of term objects
    expect(bodyContains(clauses[0].body, 'human')).toBe(true);
  });

  test('parses multiple clauses', () => {
    const code = [
      'append([], Y, Y).',
      'append([H|T], Y, [H|R]) :- append(T, Y, R).',
    ].join('\n');
    const clauses = parseProlog(code);
    expect(clauses).toHaveLength(2);
    expect(clauses[0].type).toBe('fact');
    expect(clauses[1].type).toBe('rule');
  });

  test('ignores comment-only lines', () => {
    const code = '% This is a comment\nhuman(socrates).';
    const clauses = parseProlog(code);
    expect(clauses).toHaveLength(1);
  });

  test('ignores blank lines', () => {
    const code = '\n\nhuman(socrates).\n\n';
    const clauses = parseProlog(code);
    expect(clauses).toHaveLength(1);
  });

  test('handles multi-line rule', () => {
    const code = 'ancestor(X, Z) :-\n  parent(X, Y),\n  ancestor(Y, Z).';
    const clauses = parseProlog(code);
    expect(clauses).toHaveLength(1);
    expect(clauses[0].type).toBe('rule');
    expect(bodyContains(clauses[0].body, 'parent')).toBe(true);
    expect(bodyContains(clauses[0].body, 'ancestor')).toBe(true);
  });

  test('returns empty array for empty string', () => {
    const clauses = parseProlog('');
    expect(clauses).toEqual([]);
  });

  test('returns empty array for comment-only input', () => {
    const clauses = parseProlog('% only a comment\n% another comment');
    expect(clauses).toEqual([]);
  });

  test('each clause has numeric lineStart and lineEnd', () => {
    const code = 'foo(a).\nfoo(b).';
    const clauses = parseProlog(code);
    clauses.forEach(c => {
      expect(typeof c.lineStart).toBe('number');
      expect(typeof c.lineEnd).toBe('number');
      expect(c.lineEnd).toBeGreaterThanOrEqual(c.lineStart);
    });
  });

  test('parses fact with compound argument — functor accessible', () => {
    const clauses = parseProlog('parent(tom, bob).');
    expect(clauses).toHaveLength(1);
    // head is { functor: 'parent', args: [...], arity: 2 }
    expect(clauses[0].head.functor).toBe('parent');
    expect(clauses[0].head.arity).toBe(2);
    // args are term objects with functor 'tom' and 'bob'
    const argFunctors = clauses[0].head.args.map(a => a.functor);
    expect(argFunctors).toContain('tom');
    expect(argFunctors).toContain('bob');
  });

  test('parses rule with multiple body goals', () => {
    const clauses = parseProlog('grandparent(X,Z) :- parent(X,Y), parent(Y,Z).');
    expect(clauses).toHaveLength(1);
    // body is an array of term objects
    const bodyFunctors = clauses[0].body.map(g => g.functor);
    expect(bodyFunctors.filter(f => f === 'parent')).toHaveLength(2);
  });

  test('fact functor is extracted correctly', () => {
    const clauses = parseProlog('likes(mary, food).');
    const c = clauses[0];
    // head.functor is the predicate name
    expect(c.head.functor).toBe('likes');
  });

  test('head is a term object with functor property', () => {
    const clauses = parseProlog('foo(a).');
    expect(clauses[0].head).toHaveProperty('functor');
    expect(clauses[0].head).toHaveProperty('args');
    expect(clauses[0].head).toHaveProperty('arity');
  });

  test('rule body is an array of term objects', () => {
    const clauses = parseProlog('mortal(X) :- human(X).');
    expect(Array.isArray(clauses[0].body)).toBe(true);
    expect(clauses[0].body[0]).toHaveProperty('functor');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// clausesToGraph
// ─────────────────────────────────────────────────────────────────────────────

describe('clausesToGraph', () => {
  test('returns nodes and edges arrays', () => {
    const clauses = parseProlog('human(socrates).\nmortal(X) :- human(X).');
    const graph = clausesToGraph(clauses);
    expect(graph).toHaveProperty('nodes');
    expect(graph).toHaveProperty('edges');
    expect(Array.isArray(graph.nodes)).toBe(true);
    expect(Array.isArray(graph.edges)).toBe(true);
  });

  test('each clause produces at least one node', () => {
    const clauses = parseProlog('a(x).\nb(y).');
    const graph = clausesToGraph(clauses);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  });

  test('rule with body creates an edge toward body predicate', () => {
    const clauses = parseProlog('mortal(X) :- human(X).');
    const graph = clausesToGraph(clauses);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  test('handles empty clause list without throwing', () => {
    expect(() => clausesToGraph([])).not.toThrow();
  });
});
