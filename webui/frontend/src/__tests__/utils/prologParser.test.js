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

import { parseProlog, clausesToGraph, reorderClausesByY, EXAMPLES } from '../../utils/prologParser';

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

  test('uses existingPositions when provided', () => {
    const clauses = parseProlog('foo(a).');
    const headId = 'pred:foo/1';
    const existingPositions = { [headId]: { x: 100, y: 200 } };
    const graph = clausesToGraph(clauses, existingPositions);
    const node = graph.nodes.find(n => n.id === headId);
    expect(node).toBeDefined();
    expect(node.x).toBe(100);
    expect(node.y).toBe(200);
  });

  test('list term in argument produces a node', () => {
    const clauses = parseProlog('foo([a,b]).');
    expect(() => clausesToGraph(clauses)).not.toThrow();
    const graph = clausesToGraph(clauses);
    expect(graph.nodes.length).toBeGreaterThan(0);
  });

  test('single-quoted atom in argument is handled', () => {
    const clauses = parseProlog("foo('hello').");
    expect(() => clausesToGraph(clauses)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseProlog — additional term parsing paths
// ─────────────────────────────────────────────────────────────────────────────

describe('parseProlog — term edge cases', () => {
  test('buffer flushed when comment follows code clause', () => {
    // Line 15-16: buffer has content when comment/blank is hit
    const code = 'foo(a).\n% comment after code\nbar(b).';
    const clauses = parseProlog(code);
    expect(clauses).toHaveLength(2);
    expect(clauses[0].head.functor).toBe('foo');
    expect(clauses[1].head.functor).toBe('bar');
  });

  test('numeric literal argument produces isAtom=true term', () => {
    const clauses = parseProlog('count(42).');
    expect(clauses[0].head.args[0].isAtom).toBe(true);
    expect(clauses[0].head.args[0].functor).toBe('42');
  });

  test('single-quoted atom argument is parsed', () => {
    const clauses = parseProlog("label('hello world').");
    expect(clauses[0].head.args[0].isAtom).toBe(true);
    expect(clauses[0].head.args[0].functor).toBe('hello world');
  });

  test('list argument starts with [ and has isAtom=true', () => {
    const clauses = parseProlog('foo([1,2,3]).');
    const arg = clauses[0].head.args[0];
    expect(arg.isAtom).toBe(true);
    expect(arg.functor).toBe('list');
  });

  test('uppercase variable in argument has isVar=true', () => {
    const clauses = parseProlog('foo(X).');
    expect(clauses[0].head.args[0].isVar).toBe(true);
  });

  test('operator expression in body is parsed as fallback atom', () => {
    // Covers the final fallback return in parseTerm (line 64)
    const clauses = parseProlog('foo(X) :- X > 0.');
    expect(clauses[0].type).toBe('rule');
    expect(clauses[0].body.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// reorderClausesByY
// ─────────────────────────────────────────────────────────────────────────────

describe('reorderClausesByY', () => {
  const code = 'foo(a).\nbar(b).\nbaz(c).';

  test('returns a string', () => {
    const nodes = [
      { id: 'pred:foo/1', x: 0, y: 100 },
      { id: 'pred:bar/1', x: 0, y: 50 },
      { id: 'pred:baz/1', x: 0, y: 200 },
    ];
    const result = reorderClausesByY(code, nodes);
    expect(typeof result).toBe('string');
  });

  test('reorders clauses by ascending y coordinate', () => {
    const nodes = [
      { id: 'pred:foo/1', x: 0, y: 300 },
      { id: 'pred:bar/1', x: 0, y: 10 },
      { id: 'pred:baz/1', x: 0, y: 200 },
    ];
    const result = reorderClausesByY(code, nodes);
    const lines = result.split('\n').filter(l => l.trim());
    // bar has lowest y, should come first
    expect(lines[0]).toContain('bar');
  });

  test('returns original code when no clauses parsed', () => {
    const result = reorderClausesByY('% only comments', []);
    expect(result).toBe('% only comments');
  });

  test('does not crash when node has no matching id', () => {
    const nodes = [{ id: 'pred:unknown/0', x: 0, y: 0 }];
    expect(() => reorderClausesByY(code, nodes)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// EXAMPLES constant
// ─────────────────────────────────────────────────────────────────────────────

describe('EXAMPLES', () => {
  test('family example is a non-empty string', () => {
    expect(typeof EXAMPLES.family).toBe('string');
    expect(EXAMPLES.family.length).toBeGreaterThan(0);
  });

  test('family example parses without errors', () => {
    const clauses = parseProlog(EXAMPLES.family);
    expect(clauses.length).toBeGreaterThan(0);
  });

  test('animals example is a non-empty string', () => {
    expect(typeof EXAMPLES.animals).toBe('string');
    expect(EXAMPLES.animals.length).toBeGreaterThan(0);
  });
});
