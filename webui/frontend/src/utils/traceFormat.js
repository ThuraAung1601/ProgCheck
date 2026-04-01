/**
 * Trace format documentation + helpers for the backtracking visualizer.
 *
 * YOUR ENGINE should produce an array of TraceNode objects.
 * Feed it to <BacktrackTree trace={traceData} code={code} />
 *
 * ─── TraceNode shape ────────────────────────────────────────────────────────
 *
 * {
 *   id:          string,          // unique id, e.g. "node-1"
 *   parentId:    string | null,   // null = root
 *   goal:        string,          // e.g. "factorial(3, X)"
 *   clause:      string,          // the clause head tried, e.g. "factorial(0, 1)"
 *   clauseIndex: number,          // 0-based index of clause tried (for code highlight)
 *   lineStart:   number,          // source line (0-based) of the clause tried
 *   lineEnd:     number,
 *
 *   result: 'success' | 'fail' | 'cut' | 'pending',
 *   //   success  = this branch unified and all sub-goals succeeded
 *   //   fail     = unification failed or sub-goal failed → backtrack
 *   //   cut      = ! was encountered; prunes siblings
 *   //   pending  = not yet evaluated (for step-by-step mode)
 *
 *   cutPrevented: boolean,
 *   // true  = this node WOULD have been tried but a cut on a sibling stopped it.
 *   //         Shown as a ghost/phantom node in the "what if no cut" overlay.
 *
 *   bindings:    object,          // variable bindings at this node, e.g. { X: "6", N: "3" }
 *   depth:       number,          // tree depth (0 = root)
 *   children:    string[],        // ids of child TraceNodes (in order tried)
 * }
 *
 * ─── Minimal example for  factorial(2, X) ──────────────────────────────────
 *
 * const EXAMPLE_TRACE = buildExampleTrace();
 *
 * ─── Integration ────────────────────────────────────────────────────────────
 *
 * // In your engine, when a goal is tried:
 * emit({ id, parentId, goal, clause, clauseIndex, lineStart, lineEnd,
 *         result: 'pending', cutPrevented: false, bindings: {}, depth, children: [] });
 *
 * // When it resolves:
 * update(id, { result: 'success'|'fail'|'cut', bindings });
 *
 * // When cut fires, mark siblings that won't be tried:
 * siblings.forEach(s => update(s.id, { cutPrevented: true }));
 */

export function buildExampleTrace() {
  // Demonstrates: factorial(3, X)
  // factorial(0, 1).
  // factorial(N, F) :- N > 0, N1 is N - 1, factorial(N1, F1), F is N * F1.
  return [
    {
      id: 'n0', parentId: null, depth: 0,
      goal: 'factorial(3, _X)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 3, lineEnd: 4,
      result: 'success', cutPrevented: false,
      bindings: { X: '6' }, children: ['n1', 'n2'],
    },
    // First clause tried for factorial(3,_): factorial(0,1) — FAILS unification
    {
      id: 'n1', parentId: 'n0', depth: 1,
      goal: 'factorial(3, _X)',
      clause: 'factorial(0, 1).', clauseIndex: 0, lineStart: 2, lineEnd: 2,
      result: 'fail', cutPrevented: false,
      bindings: {}, children: [],
    },
    // Second clause: factorial(N,F) :- ... — succeeds, spawns sub-goals
    {
      id: 'n2', parentId: 'n0', depth: 1,
      goal: 'factorial(3, _X)',
      clause: 'factorial(N, F) :- N>0, N1 is N-1, factorial(N1,F1), F is N*F1.', clauseIndex: 1, lineStart: 3, lineEnd: 4,
      result: 'success', cutPrevented: false,
      bindings: { N: '3', F: '6' }, children: ['n3', 'n4'],
    },
    {
      id: 'n3', parentId: 'n2', depth: 2,
      goal: '3 > 0',
      clause: '(built-in)', clauseIndex: -1, lineStart: -1, lineEnd: -1,
      result: 'success', cutPrevented: false,
      bindings: {}, children: [],
    },
    {
      id: 'n4', parentId: 'n2', depth: 2,
      goal: 'factorial(2, _F1)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 3, lineEnd: 4,
      result: 'success', cutPrevented: false,
      bindings: { F1: '2' }, children: ['n5', 'n6'],
    },
    {
      id: 'n5', parentId: 'n4', depth: 3,
      goal: 'factorial(2, _F1)',
      clause: 'factorial(0, 1).', clauseIndex: 0, lineStart: 2, lineEnd: 2,
      result: 'fail', cutPrevented: false,
      bindings: {}, children: [],
    },
    {
      id: 'n6', parentId: 'n4', depth: 3,
      goal: 'factorial(2, _F1)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 3, lineEnd: 4,
      result: 'success', cutPrevented: false,
      bindings: { N: '2', F: '2' }, children: ['n7', 'n8'],
    },
    {
      id: 'n7', parentId: 'n6', depth: 4,
      goal: '2 > 0',
      clause: '(built-in)', clauseIndex: -1, lineStart: -1, lineEnd: -1,
      result: 'success', cutPrevented: false,
      bindings: {}, children: [],
    },
    {
      id: 'n8', parentId: 'n6', depth: 4,
      goal: 'factorial(1, _F1)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 3, lineEnd: 4,
      result: 'success', cutPrevented: false,
      bindings: { F1: '1' }, children: ['n9', 'n10'],
    },
    {
      id: 'n9', parentId: 'n8', depth: 5,
      goal: 'factorial(1, _F1)',
      clause: 'factorial(0, 1).', clauseIndex: 0, lineStart: 2, lineEnd: 2,
      result: 'fail', cutPrevented: false,
      bindings: {}, children: [],
    },
    {
      id: 'n10', parentId: 'n8', depth: 5,
      goal: 'factorial(1, _F1)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 3, lineEnd: 4,
      result: 'success', cutPrevented: false,
      bindings: { N: '1', F: '1' }, children: ['n11', 'n12'],
    },
    {
      id: 'n11', parentId: 'n10', depth: 6,
      goal: '1 > 0',
      clause: '(built-in)', clauseIndex: -1, lineStart: -1, lineEnd: -1,
      result: 'success', cutPrevented: false,
      bindings: {}, children: [],
    },
    {
      id: 'n12', parentId: 'n10', depth: 6,
      goal: 'factorial(0, _F1)',
      clause: 'factorial(0, 1).', clauseIndex: 0, lineStart: 2, lineEnd: 2,
      result: 'success', cutPrevented: false,
      bindings: { F1: '1' }, children: [],
    },
  ];
}

export function buildCutExampleTrace() {
  // factorial with cut on base case:
  // factorial(0, 1) :- !.
  // factorial(N, F) :- N > 0, N1 is N-1, factorial(N1,F1), F is N*F1.
  // When factorial(0,_) matches, cut fires and second clause is PREVENTED for that call.
  return [
    {
      id: 'n0', parentId: null, depth: 0,
      goal: 'factorial(2, _X)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 4, lineEnd: 5,
      result: 'success', cutPrevented: false,
      bindings: { X: '2' }, children: ['n1', 'n1b'],
    },
    {
      id: 'n1', parentId: 'n0', depth: 1,
      goal: 'factorial(2, _X)',
      clause: 'factorial(0, 1) :- !.', clauseIndex: 0, lineStart: 2, lineEnd: 2,
      result: 'fail', cutPrevented: false,
      bindings: {}, children: [],
    },
    // This sibling was tried next (cut only fires when the 0 clause actually unifies)
    {
      id: 'n1b', parentId: 'n0', depth: 1,
      goal: 'factorial(2, _X)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 4, lineEnd: 5,
      result: 'success', cutPrevented: false,
      bindings: { N: '2', F: '2' }, children: ['n2', 'n3'],
    },
    {
      id: 'n2', parentId: 'n1b', depth: 2,
      goal: '2 > 0', clause: '(built-in)', clauseIndex: -1, lineStart: -1, lineEnd: -1,
      result: 'success', cutPrevented: false, bindings: {}, children: [],
    },
    {
      id: 'n3', parentId: 'n1b', depth: 2,
      goal: 'factorial(1, _F1)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 4, lineEnd: 5,
      result: 'success', cutPrevented: false,
      bindings: { F1: '1' }, children: ['n4', 'n4b'],
    },
    {
      id: 'n4', parentId: 'n3', depth: 3,
      goal: 'factorial(1, _F1)',
      clause: 'factorial(0, 1) :- !.', clauseIndex: 0, lineStart: 2, lineEnd: 2,
      result: 'fail', cutPrevented: false, bindings: {}, children: [],
    },
    {
      id: 'n4b', parentId: 'n3', depth: 3,
      goal: 'factorial(1, _F1)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 4, lineEnd: 5,
      result: 'success', cutPrevented: false,
      bindings: { N: '1', F: '1' }, children: ['n5', 'n6'],
    },
    {
      id: 'n5', parentId: 'n4b', depth: 4,
      goal: '1 > 0', clause: '(built-in)', clauseIndex: -1, lineStart: -1, lineEnd: -1,
      result: 'success', cutPrevented: false, bindings: {}, children: [],
    },
    {
      id: 'n6', parentId: 'n4b', depth: 4,
      goal: 'factorial(0, _F1)',
      clause: 'factorial(0, 1) :- !.', clauseIndex: 0, lineStart: 2, lineEnd: 2,
      result: 'cut', cutPrevented: false,
      bindings: { F1: '1' }, children: ['n6cut'],
    },
    // Cut node itself
    {
      id: 'n6cut', parentId: 'n6', depth: 5,
      goal: '!', clause: '!', clauseIndex: -1, lineStart: 2, lineEnd: 2,
      result: 'cut', cutPrevented: false, bindings: {}, children: [],
    },
    // The second clause for factorial(0,_) is prevented by cut — ghost node
    {
      id: 'n6ghost', parentId: 'n6', depth: 5,
      goal: 'factorial(0, _F1)',
      clause: 'factorial(N, F) :- ...', clauseIndex: 1, lineStart: 4, lineEnd: 5,
      result: 'fail', cutPrevented: true,
      bindings: {}, children: [],
    },
  ];
}

/**
 * Build a lookup map from trace array
 */
export function buildNodeMap(trace) {
  return Object.fromEntries(trace.map(n => [n.id, n]));
}

/**
 * Get root nodes (no parent)
 */
export function getRoots(trace) {
  return trace.filter(n => n.parentId === null);
}

/**
 * Get children of a node from the trace array (by parentId)
 */
export function getChildren(trace, nodeId) {
  return trace.filter(n => n.parentId === nodeId);
}
