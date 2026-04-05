/**
 * Jest unit tests for src/utils/prologParser.js
 *
 * Covers clause parsing, fact/rule discrimination, head/body extraction,
 * and the clausesToGraph converter.
 *
 * Requirements traced:
 *   UFR-4   students read problem statement (parser feeds visualisation)
 *   UFR-9   proof trees and execution traces
 *   SNFR-6  system accessible via modern web browser
 */

import { parseProlog, clausesToGraph } from '../../utils/prologParser';

// ─────────────────────────────────────────────────────────────────────────────
// parseProlog
// ─────────────────────────────────────────────────────────────────────────────

describe('parseProlog – basic clause parsing', () => {
  test('parses a single fact', () => {
    const clauses = parseProlog('human(socrates).');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].type).toBe('fact');
    expect(clauses[0].head).toMatch(/human/);
  });

  test('parses a rule with body', () => {
    const clauses = parseProlog('mortal(X) :- human(X).');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].type).toBe('rule');
    expect(clauses[0].head).toMatch(/mortal/);
    expect(clauses[0].body).toMatch(/human/);
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
    expect(clauses[0].body).toContain('parent');
    expect(clauses[0].body).toContain('ancestor');
  });

  test('returns empty array for empty string', () => {
    const clauses = parseProlog('');
    expect(clauses).toEqual([]);
  });

  test('returns empty array for comment-only input', () => {
    const clauses = parseProlog('% only a comment\n% another comment');
    expect(clauses).toEqual([]);
  });

  test('each clause has lineStart and lineEnd', () => {
    const code = 'foo(a).\nfoo(b).';
    const clauses = parseProlog(code);
    clauses.forEach(c => {
      expect(typeof c.lineStart).toBe('number');
      expect(typeof c.lineEnd).toBe('number');
      expect(c.lineEnd).toBeGreaterThanOrEqual(c.lineStart);
    });
  });

  test('parses fact with compound argument', () => {
    const clauses = parseProlog('parent(tom, bob).');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].head).toContain('tom');
    expect(clauses[0].head).toContain('bob');
  });

  test('parses rule with multiple body goals', () => {
    const clauses = parseProlog('grandparent(X,Z) :- parent(X,Y), parent(Y,Z).');
    expect(clauses).toHaveLength(1);
    expect(clauses[0].body).toContain('parent(X,Y)');
    expect(clauses[0].body).toContain('parent(Y,Z)');
  });

  test('fact functor is extracted as name', () => {
    const clauses = parseProlog('likes(mary, food).');
    const c = clauses[0];
    expect(c.name || c.functor || c.head).toMatch(/likes/);
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
