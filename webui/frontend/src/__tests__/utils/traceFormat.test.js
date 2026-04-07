/**
 * Jest unit tests for src/utils/traceFormat.js
 *
 * Requirements traced:
 *   UFR-9   students see proof trees and execution traces
 *   SFR-11  system builds proof trees and execution traces
 */

import {
  buildExampleTrace,
  buildCutExampleTrace,
  buildNodeMap,
  getRoots,
  getChildren,
} from '../../utils/traceFormat';

// ─────────────────────────────────────────────────────────────────────────────
// buildExampleTrace
// ─────────────────────────────────────────────────────────────────────────────

describe('buildExampleTrace', () => {
  let trace;
  beforeEach(() => { trace = buildExampleTrace(); });

  test('returns a non-empty array', () => {
    expect(Array.isArray(trace)).toBe(true);
    expect(trace.length).toBeGreaterThan(0);
  });

  test('every node has required fields', () => {
    const required = ['id', 'parentId', 'goal', 'clause', 'clauseIndex',
                      'lineStart', 'lineEnd', 'result', 'cutPrevented',
                      'bindings', 'depth', 'children'];
    trace.forEach(node => {
      required.forEach(field => {
        expect(node).toHaveProperty(field);
      });
    });
  });

  test('exactly one root node (parentId === null)', () => {
    const roots = trace.filter(n => n.parentId === null);
    expect(roots).toHaveLength(1);
  });

  test('root node goal is factorial(3, _X)', () => {
    const root = trace.find(n => n.parentId === null);
    expect(root.goal).toBe('factorial(3, _X)');
  });

  test('result values are valid', () => {
    const valid = new Set(['success', 'fail', 'cut', 'pending']);
    trace.forEach(n => {
      expect(valid.has(n.result)).toBe(true);
    });
  });

  test('depth values are non-negative integers', () => {
    trace.forEach(n => {
      expect(typeof n.depth).toBe('number');
      expect(n.depth).toBeGreaterThanOrEqual(0);
    });
  });

  test('ids are unique strings', () => {
    const ids = trace.map(n => n.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
    ids.forEach(id => expect(typeof id).toBe('string'));
  });

  test('bindings is a plain object', () => {
    trace.forEach(n => {
      expect(typeof n.bindings).toBe('object');
      expect(n.bindings).not.toBeNull();
    });
  });

  test('children is an array', () => {
    trace.forEach(n => {
      expect(Array.isArray(n.children)).toBe(true);
    });
  });

  test('cutPrevented is boolean', () => {
    trace.forEach(n => {
      expect(typeof n.cutPrevented).toBe('boolean');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildCutExampleTrace
// ─────────────────────────────────────────────────────────────────────────────

describe('buildCutExampleTrace', () => {
  let trace;
  beforeEach(() => { trace = buildCutExampleTrace(); });

  test('returns a non-empty array', () => {
    expect(Array.isArray(trace)).toBe(true);
    expect(trace.length).toBeGreaterThan(0);
  });

  test('contains at least one cut node', () => {
    const cuts = trace.filter(n => n.result === 'cut');
    expect(cuts.length).toBeGreaterThan(0);
  });

  test('contains at least one cutPrevented node', () => {
    const prevented = trace.filter(n => n.cutPrevented === true);
    expect(prevented.length).toBeGreaterThan(0);
  });

  test('has exactly one root', () => {
    const roots = trace.filter(n => n.parentId === null);
    expect(roots).toHaveLength(1);
  });

  test('root goal is factorial(2, _X)', () => {
    const root = trace.find(n => n.parentId === null);
    expect(root.goal).toBe('factorial(2, _X)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildNodeMap
// ─────────────────────────────────────────────────────────────────────────────

describe('buildNodeMap', () => {
  test('returns object keyed by node id', () => {
    const trace = buildExampleTrace();
    const map = buildNodeMap(trace);
    expect(typeof map).toBe('object');
    trace.forEach(n => {
      expect(map[n.id]).toBe(n);
    });
  });

  test('empty trace yields empty map', () => {
    expect(buildNodeMap([])).toEqual({});
  });

  test('map size equals trace length', () => {
    const trace = buildExampleTrace();
    const map = buildNodeMap(trace);
    expect(Object.keys(map).length).toBe(trace.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getRoots
// ─────────────────────────────────────────────────────────────────────────────

describe('getRoots', () => {
  test('returns only nodes with parentId === null', () => {
    const trace = buildExampleTrace();
    const roots = getRoots(trace);
    roots.forEach(n => expect(n.parentId).toBeNull());
  });

  test('returns exactly one root for the example trace', () => {
    expect(getRoots(buildExampleTrace())).toHaveLength(1);
  });

  test('empty trace yields empty array', () => {
    expect(getRoots([])).toEqual([]);
  });

  test('all non-root nodes are excluded', () => {
    const trace = buildExampleTrace();
    const roots = getRoots(trace);
    const nonRoots = trace.filter(n => n.parentId !== null);
    nonRoots.forEach(n => expect(roots).not.toContain(n));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// getChildren
// ─────────────────────────────────────────────────────────────────────────────

describe('getChildren', () => {
  test('returns children of the root node', () => {
    const trace = buildExampleTrace();
    const root = getRoots(trace)[0];
    const children = getChildren(trace, root.id);
    expect(children.length).toBeGreaterThan(0);
    children.forEach(c => expect(c.parentId).toBe(root.id));
  });

  test('leaf nodes have no children', () => {
    const trace = buildExampleTrace();
    // Find a known leaf (e.g., n1 which has result=fail and no children)
    const leaf = trace.find(n => n.id === 'n1');
    expect(getChildren(trace, leaf.id)).toHaveLength(0);
  });

  test('unknown id returns empty array', () => {
    const trace = buildExampleTrace();
    expect(getChildren(trace, 'nonexistent-id')).toEqual([]);
  });

  test('empty trace returns empty array', () => {
    expect(getChildren([], 'n0')).toEqual([]);
  });
});
