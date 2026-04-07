/**
 * Jest unit tests for src/utils/layout.js (force-directed graph layout)
 *
 * Requirements traced:
 *   UFR-4   students read problem statement (knowledge graph visual)
 *   SNFR-6  system accessible via modern web browser
 */

import { applyForceLayout } from '../../utils/layout';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeNode(id, x = null, y = null, pinned = false) {
  return { id, x, y, pinned };
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge cases
// ─────────────────────────────────────────────────────────────────────────────

describe('applyForceLayout — edge cases', () => {
  test('returns empty array for empty nodes', () => {
    const result = applyForceLayout([], [], 800, 600);
    expect(result).toEqual([]);
  });

  test('returns same array reference', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const result = applyForceLayout(nodes, [], 800, 600);
    expect(result).toBe(nodes);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Position initialisation
// ─────────────────────────────────────────────────────────────────────────────

describe('applyForceLayout — position initialisation', () => {
  test('nodes with null x,y get assigned numeric positions', () => {
    const nodes = [makeNode('a'), makeNode('b'), makeNode('c')];
    applyForceLayout(nodes, [], 800, 600, 1);
    nodes.forEach(n => {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    });
  });

  test('nodes with pre-set x,y keep numeric x,y after layout', () => {
    const nodes = [makeNode('a', 400, 300), makeNode('b', 200, 150)];
    applyForceLayout(nodes, [], 800, 600, 5);
    nodes.forEach(n => {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bounds clamping
// ─────────────────────────────────────────────────────────────────────────────

describe('applyForceLayout — bounds clamping', () => {
  test('all nodes stay within canvas after many iterations', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => makeNode(`n${i}`));
    applyForceLayout(nodes, [], 800, 600, 120);
    nodes.forEach(n => {
      expect(n.x).toBeGreaterThanOrEqual(60);
      expect(n.x).toBeLessThanOrEqual(740);
      expect(n.y).toBeGreaterThanOrEqual(60);
      expect(n.y).toBeLessThanOrEqual(540);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pinned nodes
// ─────────────────────────────────────────────────────────────────────────────

describe('applyForceLayout — pinned nodes', () => {
  test('pinned node keeps its original position', () => {
    const pinnedX = 200;
    const pinnedY = 150;
    const nodes = [
      makeNode('pinned', pinnedX, pinnedY, true),
      makeNode('free'),
    ];
    applyForceLayout(nodes, [], 800, 600, 50);
    const pinned = nodes.find(n => n.id === 'pinned');
    expect(pinned.x).toBe(pinnedX);
    expect(pinned.y).toBe(pinnedY);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge attraction
// ─────────────────────────────────────────────────────────────────────────────

describe('applyForceLayout — edge styles', () => {
  test('dashed edge does not crash the layout', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [{ from: 'a', to: 'b', style: 'dashed' }];
    expect(() => applyForceLayout(nodes, edges, 800, 600, 10)).not.toThrow();
  });

  test('solid edge does not crash the layout', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    const edges = [{ from: 'a', to: 'b', style: 'solid' }];
    expect(() => applyForceLayout(nodes, edges, 800, 600, 10)).not.toThrow();
  });

  test('edge referencing unknown node is skipped gracefully', () => {
    const nodes = [makeNode('a')];
    const edges = [{ from: 'a', to: 'nonexistent' }];
    expect(() => applyForceLayout(nodes, edges, 800, 600, 10)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Single node
// ─────────────────────────────────────────────────────────────────────────────

describe('applyForceLayout — single node', () => {
  test('single node is positioned within bounds', () => {
    const nodes = [makeNode('only')];
    applyForceLayout(nodes, [], 800, 600, 20);
    expect(nodes[0].x).toBeGreaterThanOrEqual(60);
    expect(nodes[0].x).toBeLessThanOrEqual(740);
    expect(nodes[0].y).toBeGreaterThanOrEqual(60);
    expect(nodes[0].y).toBeLessThanOrEqual(540);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Custom iteration count
// ─────────────────────────────────────────────────────────────────────────────

describe('applyForceLayout — custom iterations', () => {
  test('zero iterations still initialises positions', () => {
    const nodes = [makeNode('a'), makeNode('b')];
    applyForceLayout(nodes, [], 800, 600, 0);
    nodes.forEach(n => {
      expect(typeof n.x).toBe('number');
      expect(typeof n.y).toBe('number');
    });
  });
});
