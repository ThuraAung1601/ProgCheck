/**
 * Edge rewiring — modifies Prolog source when an edge endpoint is moved.
 *
 * Edge types we can rewire:
 *   "arg"  edge:  predHead → atom/var   (changes an argument value)
 *   "calls" edge: ruleHead → goalPred   (changes which predicate a rule calls in its body)
 */

import { parseProlog } from './prologParser';

/**
 * Rewire an edge endpoint and return updated code.
 *
 * @param {string} code       - Current Prolog source
 * @param {object} edge       - The edge being rewired { from, to, label, style }
 * @param {string} newToId    - The id of the new target node  (e.g. "atom:bob" or "pred:parent/2")
 * @param {string} newToLabel - The display label of the new target node
 * @returns {string}          - Updated code, or original code if rewire not possible
 */
export function rewireEdge(code, edge, newToId, newToLabel) {
  const clauses = parseProlog(code);
  const lines = code.split('\n');

  // ── Case 1: "calls" edge  (rule head → body goal predicate)
  // from = "pred:ruleName/arity", label = "calls", style = "dashed"
  // Rewiring changes which predicate is called in the body
  if (edge.label === 'calls' && edge.style === 'dashed') {
    return rewireCalls(code, lines, clauses, edge, newToId, newToLabel);
  }

  // ── Case 2: "arg" edge  (predicate → atom/var argument)
  // label = "arg1" | "arg2" | ...
  if (edge.label && edge.label.startsWith('arg')) {
    return rewireArg(code, lines, clauses, edge, newToId, newToLabel);
  }

  return code;
}

// ── Rewire a "calls" edge: change which predicate a rule body calls
function rewireCalls(code, lines, clauses, edge, newToId, newToLabel) {
  // edge.from = "pred:ruleName/arity", edge.to = "pred:oldGoal/arity"
  const [, fromPred] = edge.from.split(':');
  const [fromFunctor] = fromPred.split('/');
  const [, toPred] = edge.to.split(':');
  const [toFunctor, toArity] = toPred.split('/');

  // New goal functor (strip prefix)
  const newFunctor = newToLabel;

  let changed = false;
  const newLines = [...lines];

  clauses.forEach(clause => {
    if (clause.type !== 'rule') return;
    if (clause.head.functor !== fromFunctor) return;

    // Replace in the raw text of this clause
    const oldRaw = clause.raw;
    // Replace occurrences of the old goal functor (with same arity) in the body
    // We do a careful replacement: "oldFunctor(" → "newFunctor("  or bare "oldFunctor" if arity 0
    let newRaw;
    if (parseInt(toArity) === 0) {
      newRaw = replaceGoal(oldRaw, toFunctor, 0, newFunctor);
    } else {
      newRaw = replaceGoal(oldRaw, toFunctor, parseInt(toArity), newFunctor);
    }

    if (newRaw !== oldRaw) {
      changed = true;
      // Splice back into lines
      for (let i = clause.lineStart; i <= clause.lineEnd; i++) {
        newLines[i] = '';
      }
      newLines[clause.lineStart] = newRaw;
    }
  });

  if (!changed) return code;
  return newLines.filter((l, i) => {
    // remove blank lines we zeroed out (but keep intentional blanks)
    return l !== '' || !isZeroedLine(i, clauses, lines);
  }).join('\n');
}

// ── Rewire an "arg" edge: change an argument value inside a predicate
function rewireArg(code, lines, clauses, edge, newToId, newToLabel) {
  // edge.from = "pred:functor/arity", edge.label = "arg1"/"arg2"/...
  // edge.to   = "atom:oldVal" or "pred:..."
  const argIdx = parseInt(edge.label.replace('arg', '')) - 1; // 0-based
  const [, fromPred] = edge.from.split(':');
  const [fromFunctor, fromArity] = fromPred.split('/');

  // Old argument value
  const oldArgId = edge.to;
  const oldArgLabel = oldArgId.startsWith('atom:') ? oldArgId.slice(5)
    : oldArgId.startsWith('pred:') ? oldArgId.slice(5).split('/')[0]
    : oldArgId;

  const newArgLabel = newToLabel;
  let changed = false;
  const newLines = [...lines];

  clauses.forEach(clause => {
    // Check head predicate
    if (clause.head.functor !== fromFunctor) return;
    if (String(clause.head.arity) !== String(fromArity)) return;

    const oldRaw = clause.raw;

    // Replace the specific argument in the head
    let newRaw = replaceArgInTerm(oldRaw, fromFunctor, parseInt(fromArity), argIdx, oldArgLabel, newArgLabel);

    // Also replace in body goals with the same functor/arity
    clauses.forEach(c2 => {
      if (c2 !== clause) return;
    });

    if (newRaw !== oldRaw) {
      changed = true;
      for (let i = clause.lineStart; i <= clause.lineEnd; i++) newLines[i] = '';
      newLines[clause.lineStart] = newRaw;
    }
  });

  if (!changed) return code;
  return newLines.filter((l, i) => l !== '' || !isZeroedLine(i, clauses, lines)).join('\n');
}

// Replace a goal functor in a rule body string
function replaceGoal(raw, oldFunctor, arity, newFunctor) {
  if (arity > 0) {
    // Replace "oldFunctor(" with "newFunctor(" only after :- and commas
    return raw.replace(
      new RegExp(`\\b${escapeRegex(oldFunctor)}(?=\\()`, 'g'),
      newFunctor
    );
  } else {
    // Bare atom replacement in body
    return raw.replace(
      new RegExp(`(?<=:-\\s*)\\b${escapeRegex(oldFunctor)}\\b`),
      newFunctor
    );
  }
}

// Replace a specific positional argument inside a functor call
function replaceArgInTerm(raw, functor, arity, argIdx, oldVal, newVal) {
  // Find functor( ... ) occurrences and replace the argIdx-th argument
  const pattern = new RegExp(`\\b(${escapeRegex(functor)})\\(`, 'g');
  let result = raw;
  let match;
  let offset = 0;

  // We'll work on a copy
  const arr = Array.from(raw);
  const replaced = [];

  let searchStr = raw;
  let searchOffset = 0;

  while ((match = pattern.exec(raw)) !== null) {
    const openParen = match.index + match[0].length - 1; // index of '('
    // Extract args
    const argsExtract = extractArgsFrom(raw, openParen);
    if (!argsExtract) continue;

    const { args, start, end } = argsExtract;
    if (args.length !== arity) continue;
    if (argIdx >= args.length) continue;

    const arg = args[argIdx];
    if (arg.value.trim() !== oldVal) continue;

    // Replace this arg
    const newArg = args.map((a, i) => i === argIdx ? newVal : a.value).join(', ');
    const before = raw.slice(0, start + 1);
    const after = raw.slice(end);
    raw = before + newArg + after;
    // Reset regex since string changed
    pattern.lastIndex = 0;
    result = raw;
    break; // replace first occurrence only per clause
  }

  return result;
}

// Extract arguments from a functor call starting at openParen index
function extractArgsFrom(str, openParen) {
  let depth = 0;
  let argStart = openParen + 1;
  const args = [];
  let current = '';
  let currentStart = argStart;

  for (let i = openParen; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') {
      depth--;
      if (depth === 0) {
        args.push({ value: current, start: currentStart, end: i });
        return { args, start: openParen, end: i };
      }
    } else if (ch === ',' && depth === 1) {
      args.push({ value: current, start: currentStart, end: i });
      current = '';
      currentStart = i + 1;
      continue;
    }
    if (i > openParen) current += ch;
  }
  return null;
}

function isZeroedLine(i, clauses, lines) {
  return clauses.some(c => i > c.lineStart && i <= c.lineEnd);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
