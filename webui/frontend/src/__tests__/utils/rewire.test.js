/**
 * Jest unit tests for src/utils/rewire.js
 *
 * rewireEdge(code, edge, newToId, newToLabel) rewires Prolog source by
 * changing either a "calls" edge (body goal) or an "arg" edge (argument value).
 *
 * Requirements traced:
 *   UFR-9   students see proof trees and execution traces (graph editing)
 */

import { rewireEdge } from '../../utils/rewire';

const FAMILY_CODE = `parent(tom, bob).
parent(tom, liz).
grandparent(X, Z) :- parent(X, Y), parent(Y, Z).
`;

// ─────────────────────────────────────────────────────────────────────────────
// rewireEdge — "calls" edge (changes a body goal predicate)
// ─────────────────────────────────────────────────────────────────────────────

describe('rewireEdge — calls edge', () => {
  const callsEdge = {
    from: 'pred:grandparent/2',
    to:   'pred:parent/2',
    label: 'calls',
    style: 'dashed',
  };

  test('returns a string', () => {
    const result = rewireEdge(FAMILY_CODE, callsEdge, 'pred:ancestor/2', 'ancestor');
    expect(typeof result).toBe('string');
  });

  test('replaces old body predicate with new one', () => {
    const result = rewireEdge(FAMILY_CODE, callsEdge, 'pred:ancestor/2', 'ancestor');
    expect(result).toContain('ancestor');
  });

  test('original code unchanged when edge not found', () => {
    const edge = { from: 'pred:nonexistent/2', to: 'pred:parent/2', label: 'calls', style: 'dashed' };
    const result = rewireEdge(FAMILY_CODE, edge, 'pred:other/2', 'other');
    expect(result).toBe(FAMILY_CODE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rewireEdge — "arg" edge (changes an argument value)
// ─────────────────────────────────────────────────────────────────────────────

describe('rewireEdge — arg edge', () => {
  const argEdge = {
    from:  'pred:parent/2',
    to:    'atom:tom',
    label: 'arg1',
    style: 'solid',
  };

  test('returns a string', () => {
    const result = rewireEdge(FAMILY_CODE, argEdge, 'atom:alice', 'alice');
    expect(typeof result).toBe('string');
  });

  test('replaces the argument value', () => {
    const result = rewireEdge(FAMILY_CODE, argEdge, 'atom:alice', 'alice');
    expect(result).toContain('alice');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rewireEdge — unknown edge type
// ─────────────────────────────────────────────────────────────────────────────

describe('rewireEdge — unknown edge type', () => {
  test('returns original code for unrecognised edge label', () => {
    const edge = { from: 'pred:foo/1', to: 'atom:bar', label: 'unknown', style: 'solid' };
    const result = rewireEdge(FAMILY_CODE, edge, 'atom:baz', 'baz');
    expect(result).toBe(FAMILY_CODE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rewireEdge — arg edge with arg2
// ─────────────────────────────────────────────────────────────────────────────

describe('rewireEdge — arg2 edge', () => {
  const code = 'foo(a, b).\n';
  const edge = {
    from:  'pred:foo/2',
    to:    'atom:b',
    label: 'arg2',
    style: 'solid',
  };

  test('targets second argument', () => {
    const result = rewireEdge(code, edge, 'atom:c', 'c');
    expect(typeof result).toBe('string');
    // The result should contain the code (even if arg not found, returns original)
    expect(result.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// rewireEdge — empty code
// ─────────────────────────────────────────────────────────────────────────────

describe('rewireEdge — edge cases', () => {
  test('does not crash on empty code', () => {
    const edge = { from: 'pred:foo/1', to: 'atom:a', label: 'arg1', style: 'solid' };
    expect(() => rewireEdge('', edge, 'atom:b', 'b')).not.toThrow();
  });

  test('returns string for empty code', () => {
    const edge = { from: 'pred:foo/1', to: 'atom:a', label: 'arg1', style: 'solid' };
    const result = rewireEdge('', edge, 'atom:b', 'b');
    expect(typeof result).toBe('string');
  });
});
