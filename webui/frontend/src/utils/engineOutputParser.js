/**
 * Parser for the PROLOG CODE CHECKER engine output format.
 *
 * Your engine outputs ONE proof tree per query showing only the SUCCESSFUL path.
 * We synthesise cut-prevented ghost nodes by reading the Prolog source.
 *
 * Key insight about your engine's format:
 *
 *   "Goal: max(7,2,7) :- 7>=2,!"    → the rule clause that SUCCEEDED (with cut)
 *       Builtin: 7>=2                → sub-goals of that rule
 *       Builtin: !                   → cut fired
 *
 *   "Goal: max(3,5,5) (fact)"        → matched a fact clause directly
 *
 * Ghost synthesis:
 *   For every Goal node whose matched clause contains "!":
 *     → Look up all clauses of that predicate in the source code
 *     → The matched clause is at some index K
 *     → Clauses K+1, K+2, … become ghost (cutPrevented) sibling nodes
 *       attached to the SAME parent as the Goal node that matched
 *
 *   For "(fact)" goals that are the FIRST clause of a predicate that also has
 *   other clauses WITHOUT cut — no ghosts needed (no cut was involved).
 *   But if ANY ancestor had a cut that would prevent re-trying THIS predicate,
 *   that is handled at the ancestor level.
 */

let nodeCounter = 0;
function nextId() { return `n${++nodeCounter}`; }

// ═══════════════════════════════════════════════════════════════
// 1. SOURCE CODE CLAUSE EXTRACTOR
// ═══════════════════════════════════════════════════════════════

export function extractSourceClauses(code) {
  if (!code || !code.trim()) return new Map();
  const lines = code.split('\n');
  const clauseMap = new Map();

  const joined = [];
  let buf = '', bufStart = 0;

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('%')) {
      if (buf) { joined.push({ text: buf, lineStart: bufStart, lineEnd: i - 1 }); buf = ''; }
      return;
    }
    if (!buf) bufStart = i;
    buf += (buf ? ' ' : '') + t;
    if (t.endsWith('.')) {
      joined.push({ text: buf, lineStart: bufStart, lineEnd: i });
      buf = '';
    }
  });
  if (buf) joined.push({ text: buf, lineStart: bufStart, lineEnd: lines.length - 1 });

  joined.forEach(({ text, lineStart, lineEnd }) => {
    const raw = text.trim().replace(/\.\s*$/, '').trim();

    // Rule: anything with :-
    const ruleMatch = raw.match(/^(.+?)\s*:-\s*(.+)$/);

    if (ruleMatch) {
      const headStr = ruleMatch[1].trim();
      const bodyStr = ruleMatch[2].trim();

      const { functor, arity } = parseFunctorArity(headStr);
      if (!functor) return;

      const key = `${functor}/${arity}`;
      const hascut = bodyStr.includes('!');

      if (!clauseMap.has(key)) clauseMap.set(key, []);

      clauseMap.get(key).push({
        head: headStr,
        body: bodyStr,
        hascut,
        lineStart,
        lineEnd,
        raw: text,
        isRule: true
      });

      return;
    }

    // Fact
    const { functor, arity } = parseFunctorArity(raw);
    if (!functor) return;
    const key = `${functor}/${arity}`;
    if (!clauseMap.has(key)) clauseMap.set(key, []);
    clauseMap.get(key).push({
      head: raw, body: null, hascut: false,
      lineStart, lineEnd, raw: text, isRule: false
    });
  });

  return clauseMap;
}

function parseFunctorArity(term) {
  term = term.trim();
  // functor(args...)
  const parenIdx = term.indexOf('(');
  if (parenIdx !== -1) {
    const functor = term.slice(0, parenIdx).trim();
    if (!/^[a-z_][a-zA-Z0-9_]*$/.test(functor)) return { functor: null, arity: 0 };
    const inner = term.slice(parenIdx + 1, term.lastIndexOf(')'));
    const arity = inner.trim() ? splitTopLevel(inner).length : 0;
    return { functor, arity };
  }
  // bare atom
  if (/^[a-z_][a-zA-Z0-9_]*$/.test(term)) return { functor: term, arity: 0 };
  return { functor: null, arity: 0 };
}

function splitTopLevel(str) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// ═══════════════════════════════════════════════════════════════
// 2. ENGINE OUTPUT PARSER
// ═══════════════════════════════════════════════════════════════

export function parseEngineOutput(text, sourceCode = '') {
  nodeCounter = 0;
  const sourceClauses = extractSourceClauses(sourceCode);
  const queryBlocks = splitOnQueries(text);
  const queries = queryBlocks.map(block => parseQueryBlock(block, sourceClauses));
  return { queries };
}

function splitOnQueries(text) {
  const lines = text.split('\n');
  const blocks = [];
  let current = [];
  for (const line of lines) {
    if (/^Query:\s+/.test(line.trim())) {
      if (current.length) blocks.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

function parseQueryBlock(lines, sourceClauses) {
  const queryLine = lines[0] || '';
  const queryMatch = queryLine.match(/^Query:\s+(.+)/);
  const query = queryMatch ? queryMatch[1].trim() : queryLine.trim();

  const executionGoals = [];

  lines.forEach(line => {
    // ONLY take top-level results (Depth 1)
    const m = line.match(/^Depth\s+1:\s+([a-zA-Z0-9_]+\(.+\))/);
    if (m) {
      executionGoals.push(m[1].trim());
    }
  });

  const uniqueGoals = [...new Set(executionGoals)];

  let proofStart = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^Proof Tree:/.test(lines[i].trim())) { proofStart = i + 1; break; }
  }

  if (proofStart === -1) {
    return {
      query,
      trace: [{
        id: nextId(), parentId: null, depth: 0,
        goal: query, clause: query,
        clauseIndex: 0, lineStart: -1, lineEnd: -1,
        result: 'success', cutPrevented: false, bindings: {}, children: [],
      }],
    };
  }

  const proofLines = [];
  for (let i = proofStart; i < lines.length; i++) {
    if (lines[i].trim() === '---') break;
    proofLines.push(lines[i]);
  }

  let trace;

  // If multiple solutions exist → build multiple root nodes
  if (uniqueGoals.length > 1) {
    trace = uniqueGoals.map(goal => ({
      id: nextId(),
      parentId: null,
      depth: 0,
      goal,
      clause: goal,
      clauseIndex: 0,
      lineStart: -1,
      lineEnd: -1,
      result: 'success',
      cutPrevented: false,
      bindings: {},
      children: [],
    }));
  } else {
    trace = parseProofTree(query, proofLines);
  }

  injectCutGhostsFromSource(trace, sourceClauses);
  return { query, trace };
}

// ═══════════════════════════════════════════════════════════════
// 3. PROOF TREE PARSER
// ═══════════════════════════════════════════════════════════════

function parseProofTree(query, lines) {
  const nonEmpty = lines.filter(l => l.trim() !== '');
  if (nonEmpty.length === 0) {
    return [{
      id: nextId(), parentId: null, depth: 0,
      goal: query, clause: query,
      clauseIndex: 0, lineStart: -1, lineEnd: -1,
      result: 'success', cutPrevented: false, bindings: {}, children: [],
    }];
  }

  const parsed = nonEmpty.map(line => ({
    indent: measureIndent(line),
    text: line.trim(),
  }));

  const trace = [];
  const stack = []; // { id, indent }

  parsed.forEach(({ text, indent }) => {
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parentId = stack.length ? stack[stack.length - 1].id : null;
    const depth = stack.length;
    const node = buildNode(text, query, parentId, depth);
    trace.push(node);
    stack.push({ id: node.id, indent });
  });

  return trace;
}

function measureIndent(line) {
  let i = 0;
  while (i < line.length && (line[i] === ' ' || line[i] === '\t')) i++;
  return line.slice(0, i).replace(/\t/g, '    ').length;
}

function buildNode(text, query, parentId, depth) {
  const id = nextId();
  const base = {
    id, parentId, depth,
    clauseIndex: 0, lineStart: -1, lineEnd: -1,
    cutPrevented: false, bindings: {}, children: [],
  };

  // "Goal: X (fact)"
  const factM = text.match(/^Goal:\s+(.+?)\s*\(fact\)\s*$/i);
  if (factM) {
    const goal = factM[1].trim();
    return { ...base, goal, clause: goal, result: 'success', isFact: true };
  }

  // "Goal: X :- body"
  const ruleM = text.match(/^Goal:\s+(.+?)\s*:-\s*(.+)$/);
  if (ruleM) {
    const goal = ruleM[1].trim();
    const body = ruleM[2].trim();
    const hasCut = body.includes('!');
    return {
      ...base, goal,
      clause: `${goal} :- ${body}`,
      clauseIndex: 1,
      result: 'success',
      hasCutInClause: hasCut,
    };
  }

  // "Goal: X"  (bare)
  const bareM = text.match(/^Goal:\s+(.+)$/);
  if (bareM) {
    const goal = bareM[1].trim();
    return { ...base, goal, clause: goal, result: 'success' };
  }

  // "Builtin: expr"
  const builtinM = text.match(/^Builtin:\s+(.+)$/i);
  if (builtinM) {
    const goal = builtinM[1].trim();
    const result = goal === '!' ? 'cut' : 'success';
    return { ...base, goal, clause: '(built-in)', clauseIndex: -1, result };
  }

  // "Failed:" / "Fail:"
  const failM = text.match(/^(?:Failed|Fail):\s+(.+)$/i);
  if (failM) return { ...base, goal: failM[1].trim(), clause: failM[1].trim(), result: 'fail' };

  // "Try:"
  const tryM = text.match(/^Try:\s+(.+)$/i);
  if (tryM) return { ...base, goal: tryM[1].trim(), clause: tryM[1].trim(), result: 'pending' };

  // "!" / "Cut: !"
  if (text === '!' || /^Cut:\s*!/.test(text)) {
    return { ...base, goal: '!', clause: '!', clauseIndex: -1, result: 'cut' };
  }

  return { ...base, goal: text, clause: text, result: 'success' };
}

// ═══════════════════════════════════════════════════════════════
// 4. GHOST INJECTION
//
// Two cases to handle:
//
// Case A — "Goal: X :- body,!,..."  (rule with cut in body, depth > 0)
//   The Goal node is a child of some parent node.
//   Ghost siblings = remaining clauses after this one, attached to same parent.
//
// Case B — "Goal: X :- body,!,..."  (rule with cut, depth = 0 / root)
//   The Goal node IS the root.  We add ghosts as additional root siblings.
//   (We create a synthetic wrapper root if needed.)
//
// In BOTH cases we also handle the simpler flat format:
//   Goal: max(7,2,7) :- 7>=2,!
//       Builtin: 7>=2
//       Builtin: !
// Here the Goal node has depth 0, parentId null.
// Ghosts should appear as additional depth-0 nodes (siblings in the tree).
// ═══════════════════════════════════════════════════════════════

export function injectCutGhostsFromSource(trace, sourceClauses) {
  if (!sourceClauses || sourceClauses.size === 0) return;

  // Sync nodeCounter past all existing backend-generated IDs to avoid collisions
  trace.forEach(n => {
    const m = n.id && String(n.id).match(/^n(\d+)$/);
    if (m) nodeCounter = Math.max(nodeCounter, parseInt(m[1], 10));
  });

  // In the chained structure, ! is a child of the body goal before it.
  // Only rule nodes (hasCutInClause=true) should be treated as cut-firing
  // for Section 1 (sibling clause prevention).
  const cutFiringNodes = trace.filter(n => n.hasCutInClause === true);

  const ghostsToAdd = [];

  // 1. Cut-prevented ghosts: clauses AFTER the cut-firing clause
  cutFiringNodes.forEach(cutNode => {
    const { functor, arity } = parseFunctorArityFromGoal(cutNode.goal);
    if (!functor) return;
    const key = `${functor}/${arity}`;
    const allClauses = sourceClauses.get(key);
    if (!allClauses || allClauses.length < 2) return;

    const matchedIdx = findMatchedClauseIndex(cutNode, allClauses);
    const preventedClauses = allClauses.slice(matchedIdx + 1);
    if (preventedClauses.length === 0) return;

    preventedClauses.forEach((srcClause, offset) => {
      const clauseDisplay = srcClause.isRule
        ? `${srcClause.head} :- ${srcClause.body}`
        : srcClause.head;
      ghostsToAdd.push({
        id: nextId(),
        parentId: cutNode.parentId,
        depth: cutNode.depth,
        goal: cutNode.goal,
        clause: clauseDisplay,
        clauseIndex: matchedIdx + 1 + offset,
        lineStart: srcClause.lineStart,
        lineEnd: srcClause.lineEnd,
        result: 'fail',
        cutPrevented: true,
        cutBy: cutNode.id,
        bindings: {},
        children: [],
      });
    });
  });

  // 2. Failed-unification ghosts: clauses whose HEAD did not unify, tried BEFORE
  //    the clause that was actually entered.
  //
  //    Rules:
  //    - Only add for SUCCESS nodes: the backend already records every body-entered
  //      clause as "Failed Goal:" nodes for failing queries. Adding ghosts on top
  //      of those would duplicate.
  //    - Skip when a sibling has the same functor at a lower clause index with
  //      result=success (backtracking alternatives, not failures).
  const siblingMatchedIndices = {};  // parentId+functor/arity → Set of {idx, result}
  trace.filter(n => !n.cutPrevented && !n.isQueryRoot && n.result === 'success').forEach(node => {
    const { functor, arity } = parseFunctorArityFromGoal(node.goal);
    if (!functor) return;
    const key = `${functor}/${arity}`;
    const allClauses = sourceClauses.get(key);
    if (!allClauses || allClauses.length < 2) return;
    const mapKey = `${node.parentId || ''}|||${key}`;
    if (!siblingMatchedIndices[mapKey]) siblingMatchedIndices[mapKey] = new Set();
    siblingMatchedIndices[mapKey].add(findMatchedClauseIndex(node, allClauses));
  });

  // Only process SUCCESS nodes — fail nodes from backend already capture body attempts
  trace.filter(n => !n.cutPrevented && !n.isQueryRoot && n.result === 'success').forEach(node => {
    const { functor, arity } = parseFunctorArityFromGoal(node.goal);
    if (!functor) return;
    const key = `${functor}/${arity}`;
    const allClauses = sourceClauses.get(key);
    if (!allClauses || allClauses.length < 2) return;

    const matchedIdx = findMatchedClauseIndex(node, allClauses);
    if (matchedIdx === 0) return; // first clause matched — nothing tried before

    // Skip if a sibling succeeded at a lower clause index (backtracking alternatives)
    const mapKey = `${node.parentId || ''}|||${key}`;
    const siblingsSet = siblingMatchedIndices[mapKey] || new Set();
    const hasSucceedingSiblingAtLowerIdx = [...siblingsSet].some(idx => idx < matchedIdx);
    if (hasSucceedingSiblingAtLowerIdx) return;

    allClauses.slice(0, matchedIdx).forEach((srcClause, offset) => {
      const clauseDisplay = srcClause.isRule
        ? `${srcClause.head} :- ${srcClause.body}`
        : srcClause.head;
      ghostsToAdd.push({
        id: nextId(),
        parentId: node.parentId,
        depth: node.depth,
        goal: node.goal,
        clause: clauseDisplay,
        clauseIndex: offset,
        lineStart: srcClause.lineStart,
        lineEnd: srcClause.lineEnd,
        result: 'fail',
        cutPrevented: false,
        bindings: {},
        children: [],
      });
    });
  });

  // 3. Body-goal cut-prevented (chained structure):
  //    In the chained output, body goals form a parent→child chain:
  //      rule → G1 → G2 → ! → G3
  //    When ! fires, it prevents backtracking to alternative clauses for G1 and G2.
  //    Walk UP from !'s parent to the rule node; for each body goal encountered,
  //    add its remaining clause alternatives as siblings of its direct child
  //    (i.e., children of that body goal node, at the same depth as the next link).
  const cutBuiltinNodes = trace.filter(n => n.result === 'cut' && n.goal === '!');
  const nodeById = Object.fromEntries(trace.map(n => [n.id, n]));
  cutBuiltinNodes.forEach(cutNode => {
    let childDepth = cutNode.depth;   // depth at which siblings of the next-in-chain appear
    let currentId  = cutNode.parentId;

    while (currentId) {
      const currentNode = nodeById[currentId];
      if (!currentNode || currentNode.isQueryRoot) break;

      // Stop when we reach the rule node (has :- in clause) — that's the clause boundary
      const isRuleNode = currentNode.clause && currentNode.clause.includes(':-');
      if (isRuleNode) break;

      // Skip builtin nodes (they have no clause alternatives)
      if (currentNode.result !== 'cut' && !currentNode.cutPrevented) {
        const { functor, arity } = parseFunctorArityFromGoal(currentNode.goal);
        if (functor) {
          const key = `${functor}/${arity}`;
          const allClauses = sourceClauses.get(key);
          if (allClauses && allClauses.length >= 2) {
            const matchedIdx = findMatchedClauseIndex(currentNode, allClauses);
            const preventedClauses = allClauses.slice(matchedIdx + 1);
            preventedClauses.forEach((srcClause, offset) => {
              const clauseDisplay = srcClause.isRule
                ? `${srcClause.head} :- ${srcClause.body}`
                : srcClause.head;
              ghostsToAdd.push({
                id: nextId(),
                parentId: currentId,   // child of the current body goal (sibling of next chain link)
                depth: childDepth,     // same depth as the next link in the chain
                goal: currentNode.goal,
                clause: clauseDisplay,
                clauseIndex: matchedIdx + 1 + offset,
                lineStart: srcClause.lineStart,
                lineEnd: srcClause.lineEnd,
                result: 'fail',
                cutPrevented: true,
                cutBy: cutNode.id,
                bindings: {},
                children: [],
              });
            });
          }
        }
      }

      // Move up one level in the chain
      childDepth  = currentNode.depth;
      currentId   = currentNode.parentId;
    }
  });

  ghostsToAdd.forEach(g => trace.push(g));
}

function parseFunctorArityFromGoal(goalStr) {
  if (!goalStr) return { functor: null, arity: 0 };
  return parseFunctorArity(goalStr);
}

function findMatchedClauseIndex(node, allClauses) {
  const clauseText = node.clause || '';
  const isRule = clauseText.includes(':-');
  const hasCut = clauseText.includes('!') || node.hasCutInClause;
  const isFact = node.isFact === true || (!isRule && !hasCut);

  const nodeHead = clauseText.split(':-')[0].trim().replace(/\s+/g, '');

  // 1. Exact head match — must be tried FIRST for all clauses before any fallback.
  //    This handles instantiated facts like ripe(orange) vs ripe(apple).
  for (let i = 0; i < allClauses.length; i++) {
    if (allClauses[i].head.replace(/\s+/g, '') === nodeHead) return i;
  }

  // 2. Structural fallback — used only when no exact match was found (e.g. variables in goal)
  for (let i = 0; i < allClauses.length; i++) {
    const src = allClauses[i];
    if (isFact && !src.isRule) return i;
    if (isRule && hasCut && src.isRule && src.hascut) return i;
    if (isRule && !hasCut && src.isRule && !src.hascut) return i;
  }

  // 3. Last resort
  if (isRule) {
    const ri = allClauses.findIndex(c => c.isRule);
    return ri >= 0 ? ri : 0;
  }
  return 0;
}

// ═══════════════════════════════════════════════════════════════
// 5. UTILITIES
// ═══════════════════════════════════════════════════════════════

export function mergeTraces(queries) {
  return queries.flatMap(q => q.trace);
}

// Annotate nodes with source line numbers.
// Rules highlight only their HEAD line; builtin body goals find their specific line.
export function annotateWithSourceLines(trace, code, sourceClauses) {
  const lines = code.split('\n');
  const nodeById = {};

  // ── Pass 1: assign clause-level lines (head line only for multi-line rules) ──
  const partial = trace.map(node => {
    if (node.lineStart >= 0) return node;   // already set (backend or ghost)
    if (node.clause === '(built-in)') return node;  // handled in pass 2

    const functor = node.goal?.match(/^([a-z_][a-zA-Z0-9_]*)/)?.[1];
    if (!functor) return node;

    if (sourceClauses) {
      const key = [...sourceClauses.keys()].find(k => k.startsWith(functor + '/'));
      if (key) {
        const clauses = sourceClauses.get(key);
        if (clauses?.length > 0) {
          const idx = findMatchedClauseIndex(node, clauses);
          const cl  = clauses[Math.min(idx, clauses.length - 1)];
          // Highlight only the head line; store full clause end for body-goal lookup
          return { ...node, lineStart: cl.lineStart, lineEnd: cl.lineStart, _clauseEnd: cl.lineEnd };
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith(functor)) {
        return { ...node, lineStart: i, lineEnd: i };
      }
    }
    return node;
  });

  partial.forEach(n => { nodeById[n.id] = n; });

  // ── Pass 2: find the specific source line for builtin body goals ──
  return partial.map(node => {
    if (node.lineStart >= 0) return node;
    if (node.clause !== '(built-in)') return node;

    // Walk up to the nearest RULE ancestor that has a multi-line clause range
    let cur = nodeById[node.parentId];
    while (cur) {
      if (cur.lineStart >= 0) {
        const clauseEnd = cur._clauseEnd ?? cur.lineEnd ?? cur.lineStart;
        if (clauseEnd > cur.lineStart) {
          const goalLine = _findGoalLineInRange(node.goal, cur.lineStart, clauseEnd, lines);
          if (goalLine >= 0) return { ...node, lineStart: goalLine, lineEnd: goalLine };
          break;  // found the rule ancestor but goal not located — stop
        }
      }
      cur = nodeById[cur.parentId];
    }
    return node;
  });
}

// Search for the source line of a body goal within a clause's line range.
// Starts AFTER the head line (headLine+1) to avoid matching the head itself.
function _findGoalLineInRange(goal, headLine, clauseEnd, lines) {
  const g = goal.trim();

  // Attempt 1: direct substring match — works when goal text matches source exactly
  // (abstract/uninstantiated goals like "N > 0" or "N1 is N - 1")
  const normalG = g.replace(/\s+/g, ' ');
  for (let i = headLine + 1; i <= clauseEnd; i++) {
    const line = lines[i] || '';
    if (line.trim().startsWith('%')) continue;
    if (line.replace(/\s+/g, ' ').includes(normalG)) return i;
  }

  // Attempt 2: token-based search (for instantiated goals like "2 is 1*2")
  const terms = [];
  let extraRequired = null;

  if (g === '!') {
    terms.push('!');
  } else {
    // Lowercase functor (e.g. "homemade", "factorial")
    const fMatch = g.match(/^([a-z_][a-zA-Z0-9_]*)/);
    if (fMatch) terms.push(fMatch[1]);

    // Keyword operators
    const kwMatch = g.match(/\b(is|not|true|fail|assert|retract|findall|bagof|setof)\b/);
    if (kwMatch && !terms.includes(kwMatch[1])) terms.push(kwMatch[1]);

    // For `is` expressions: require the RHS arithmetic operator to disambiguate between
    // multiple `is` goals in the same clause (e.g. "N1 is N-1" vs "F is F1*N").
    // Without this, "2 is 1*2" would match "N1 is N - 1" (first `is` in the clause).
    if (kwMatch?.[1] === 'is') {
      const isIdx = g.indexOf(' is ');
      if (isIdx >= 0) {
        const rhs = g.slice(isIdx + 4).trim();
        const rhsOp = rhs.match(/([+\-*\/])/);
        if (rhsOp) extraRequired = rhsOp[1];
      }
    }

    // Symbolic operators (>, <, >=, =<, =:=, \=, etc.) — only when no functor found
    if (terms.length === 0) {
      const opMatch = g.match(/([><=\\!+\-*\/]+)/);
      if (opMatch) terms.push(opMatch[1]);
    }
  }

  if (terms.length === 0) return -1;

  // First pass: match primary terms AND the extra disambiguator (if any)
  if (extraRequired) {
    for (let i = headLine + 1; i <= clauseEnd; i++) {
      const line = lines[i] || '';
      if (line.trim().startsWith('%')) continue;
      if (terms.some(t => line.includes(t)) && line.includes(extraRequired)) return i;
    }
  }

  // Fallback: match with primary terms only
  for (let i = headLine + 1; i <= clauseEnd; i++) {
    const line = lines[i] || '';
    if (line.trim().startsWith('%')) continue;
    if (terms.some(t => line.includes(t))) return i;
  }

  return -1;
}

// ═══════════════════════════════════════════════════════════════
// 6. BINDINGS EXTRACTION & CHOICE POINT
// ═══════════════════════════════════════════════════════════════

/**
 * Extract variable bindings for a node by matching its goal string to the
 * matched source clause head.
 * e.g. goal="meal(pizza,apple)", head="meal(Main,Fruit)" → {Main:"pizza",Fruit:"apple"}
 */
export function extractNodeBindings(node, sourceClauses) {
  if (!sourceClauses || !node?.goal) return {};
  const { functor, arity } = parseFunctorArityFromGoal(node.goal);
  if (!functor || arity === 0) return {};
  const key = `${functor}/${arity}`;
  const clauses = sourceClauses.get(key);
  if (!clauses?.length) return {};
  const matchedIdx = findMatchedClauseIndex(node, clauses);
  const head = clauses[Math.min(matchedIdx, clauses.length - 1)]?.head;
  if (!head) return {};
  return _matchGoalToHead(node.goal, head);
}

function _matchGoalToHead(goalStr, headStr) {
  const goalArgs = _termArgs(goalStr);
  const headArgs = _termArgs(headStr);
  if (!goalArgs || !headArgs || goalArgs.length !== headArgs.length) return {};
  const bindings = {};
  headArgs.forEach((hArg, i) => {
    const h = hArg.trim(), g = goalArgs[i].trim();
    // Variable in head: uppercase start, not anonymous _
    if (/^[A-Z][a-zA-Z0-9_]*$/.test(h) && h !== g) bindings[h] = g;
  });
  return bindings;
}

function _termArgs(termStr) {
  if (!termStr) return null;
  const p = termStr.indexOf('(');
  if (p === -1) return null;
  const close = termStr.lastIndexOf(')');
  if (close === -1) return null;
  return splitTopLevel(termStr.slice(p + 1, close));
}

/**
 * Return source lines for the NEXT clause alternative after node's matched clause.
 * Used for the look-ahead choice-point indicator in the code panel.
 * Returns { lineStart, lineEnd } or null.
 */
export function getNextChoiceClause(node, sourceClauses) {
  if (!sourceClauses || !node?.goal) return null;
  const { functor, arity } = parseFunctorArityFromGoal(node.goal);
  if (!functor) return null;
  const key = `${functor}/${arity}`;
  const clauses = sourceClauses.get(key);
  if (!clauses?.length) return null;
  const matchedIdx = findMatchedClauseIndex(node, clauses);
  const next = clauses[matchedIdx + 1];
  return next ? { lineStart: next.lineStart, lineEnd: next.lineEnd } : null;
}
