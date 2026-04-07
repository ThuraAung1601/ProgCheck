/**
 * Jest unit tests for src/utils/treeLayout.js
 *
 * Requirements traced:
 *   UFR-9   students see proof trees and execution traces (tree layout)
 *   SFR-11  system builds proof trees
 */

import { layoutTree } from '../../utils/treeLayout';
import { buildExampleTrace, buildCutExampleTrace } from '../../utils/traceFormat';

// ─────────────────────────────────────────────────────────────────────────────
// layoutTree — edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutTree — empty / null input', () => {
  test('returns empty object for null', () => {
    expect(layoutTree(null)).toEqual({});
  });

  test('returns empty object for empty array', () => {
    expect(layoutTree([])).toEqual({});
  });

  test('returns empty object for undefined', () => {
    expect(layoutTree(undefined)).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// layoutTree — single node
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutTree — single node', () => {
  const singleNode = [{ id: 'root', parentId: null, depth: 0, children: [] }];

  test('returns positions, totalW, totalH', () => {
    const result = layoutTree(singleNode);
    expect(result).toHaveProperty('positions');
    expect(result).toHaveProperty('totalW');
    expect(result).toHaveProperty('totalH');
  });

  test('positions contains entry for the root node', () => {
    const { positions } = layoutTree(singleNode);
    expect(positions).toHaveProperty('root');
  });

  test('root position has x, y, cx, cy, w, h', () => {
    const { positions } = layoutTree(singleNode);
    const pos = positions['root'];
    ['x', 'y', 'cx', 'cy', 'w', 'h'].forEach(field => {
      expect(pos).toHaveProperty(field);
      expect(typeof pos[field]).toBe('number');
    });
  });

  test('totalW and totalH are positive numbers', () => {
    const { totalW, totalH } = layoutTree(singleNode);
    expect(totalW).toBeGreaterThan(0);
    expect(totalH).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// layoutTree — example trace (multi-level tree)
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutTree — example trace', () => {
  let result;
  beforeEach(() => {
    result = layoutTree(buildExampleTrace());
  });

  test('returns positions for every node', () => {
    const trace = buildExampleTrace();
    expect(Object.keys(result.positions).length).toBe(trace.length);
  });

  test('all y values are non-negative', () => {
    Object.values(result.positions).forEach(p => {
      expect(p.y).toBeGreaterThanOrEqual(0);
    });
  });

  test('deeper nodes have greater y than shallower nodes', () => {
    const trace = buildExampleTrace();
    const { positions } = result;
    const root = trace.find(n => n.parentId === null);
    const children = trace.filter(n => n.parentId === root.id);
    children.forEach(c => {
      expect(positions[c.id].y).toBeGreaterThan(positions[root.id].y);
    });
  });

  test('all x values are non-negative', () => {
    Object.values(result.positions).forEach(p => {
      expect(p.x).toBeGreaterThanOrEqual(0);
    });
  });

  test('totalW is at least as wide as any single node x+w', () => {
    Object.values(result.positions).forEach(p => {
      expect(result.totalW).toBeGreaterThanOrEqual(p.x + p.w);
    });
  });

  test('totalH is at least as tall as any single node y+h', () => {
    Object.values(result.positions).forEach(p => {
      expect(result.totalH).toBeGreaterThanOrEqual(p.y + p.h);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// layoutTree — cut example trace
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutTree — cut example trace', () => {
  test('positions every node in the cut trace', () => {
    const trace = buildCutExampleTrace();
    const { positions } = layoutTree(trace);
    expect(Object.keys(positions).length).toBe(trace.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// layoutTree — linear chain (no branching)
// ─────────────────────────────────────────────────────────────────────────────

describe('layoutTree — linear chain', () => {
  const chain = [
    { id: 'a', parentId: null },
    { id: 'b', parentId: 'a' },
    { id: 'c', parentId: 'b' },
  ];

  test('all three nodes are positioned', () => {
    const { positions } = layoutTree(chain);
    expect(Object.keys(positions).length).toBe(3);
  });

  test('y increases with depth in chain', () => {
    const { positions } = layoutTree(chain);
    expect(positions['b'].y).toBeGreaterThan(positions['a'].y);
    expect(positions['c'].y).toBeGreaterThan(positions['b'].y);
  });
});
