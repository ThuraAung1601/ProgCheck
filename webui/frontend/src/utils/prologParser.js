/**
 * Prolog parser — parses facts and rules into structured clauses
 */

export function parseProlog(code) {
  const lines = code.split('\n');
  const joined = [];
  let buffer = '';
  let bufferStart = 0;

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('%') || trimmed === '') {
      if (buffer) {
        joined.push({ text: buffer, lineStart: bufferStart, lineEnd: i - 1 });
        buffer = '';
      }
      joined.push({ text: trimmed, lineStart: i, lineEnd: i, isComment: true });
      return;
    }
    if (!buffer) bufferStart = i;
    buffer += (buffer ? ' ' : '') + trimmed;
    if (trimmed.endsWith('.')) {
      joined.push({ text: buffer, lineStart: bufferStart, lineEnd: i });
      buffer = '';
    }
  });

  if (buffer) joined.push({ text: buffer, lineStart: bufferStart, lineEnd: lines.length - 1 });

  return joined
    .filter(item => !item.isComment && item.text)
    .map(item => parseClause(item.text, item.lineStart, item.lineEnd))
    .filter(Boolean);
}

function parseClause(text, lineStart, lineEnd) {
  const raw = text.trim().replace(/\.\s*$/, '').trim();
  const ruleMatch = raw.match(/^(.+?)\s*:-\s*(.+)$/s);
  if (ruleMatch) {
    const head = parseTerm(ruleMatch[1].trim());
    if (!head) return null;
    const body = splitArgs(ruleMatch[2].trim()).map(g => parseTerm(g.trim())).filter(Boolean);
    return { type: 'rule', head, body, lineStart, lineEnd, raw: text };
  }
  const head = parseTerm(raw);
  if (!head) return null;
  return { type: 'fact', head, body: [], lineStart, lineEnd, raw: text };
}

function parseTerm(text) {
  text = text.trim();
  const compound = text.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.+)\)$/s);
  if (compound) {
    const args = splitArgs(compound[2]);
    return { functor: compound[1], args: args.map(a => parseTerm(a.trim())), arity: args.length };
  }
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text)) {
    return { functor: text, args: [], arity: 0, isVar: /^[A-Z_]/.test(text) };
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return { functor: text, args: [], arity: 0, isAtom: true };
  if (/^'[^']*'$/.test(text)) return { functor: text.slice(1, -1), args: [], arity: 0, isAtom: true };
  if (text.startsWith('[')) return { functor: 'list', args: [], arity: 0, isAtom: true, display: text };
  return { functor: text, args: [], arity: 0, isAtom: true };
}

function splitArgs(text) {
  const args = [];
  let depth = 0, current = '';
  for (const ch of text) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) { args.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

export function clausesToGraph(clauses, existingPositions = {}) {
  const nodeMap = new Map();
  const edges = [];
  const edgeSet = new Set();

  function ensureNode(id, label, type, meta = {}) {
    if (!nodeMap.has(id)) {
      const pos = existingPositions[id];
      nodeMap.set(id, { id, label, type, x: pos?.x ?? null, y: pos?.y ?? null, ...meta });
    }
    return nodeMap.get(id);
  }

  function addEdge(from, to, label, style = 'solid') {
    const key = `${from}=>${to}=>${label}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push({ id: key, from, to, label, style });
    }
  }

  function termNodeId(term) {
    if (term.args.length === 0) return `atom:${term.functor}`;
    return `pred:${term.functor}/${term.arity}`;
  }

  function processTerm(term, parentId, argLabel) {
    if (!term) return;
    const id = termNodeId(term);
    const type = term.args.length === 0 ? (term.isVar ? 'var' : 'atom') : 'fact';
    ensureNode(id, term.display || term.functor, type, { arity: term.arity });
    if (parentId) addEdge(parentId, id, argLabel);
    term.args.forEach((arg, i) => processTerm(arg, id, `arg${i + 1}`));
  }

  clauses.forEach(clause => {
    const headId = `pred:${clause.head.functor}/${clause.head.arity}`;
    ensureNode(headId, clause.head.functor, clause.type === 'rule' ? 'rule' : 'fact', {
      arity: clause.head.arity, lineStart: clause.lineStart
    });
    clause.head.args.forEach((arg, i) => processTerm(arg, headId, `arg${i + 1}`));

    if (clause.type === 'rule') {
      clause.body.forEach(goal => {
        if (!goal) return;
        const gId = termNodeId(goal);
        ensureNode(gId, goal.functor, 'fact', { arity: goal.arity });
        addEdge(headId, gId, 'calls', 'dashed');
        goal.args.forEach((arg, i) => processTerm(arg, gId, `arg${i + 1}`));
      });
    }
  });

  return { nodes: Array.from(nodeMap.values()), edges };
}

export function reorderClausesByY(code, nodes) {
  const clauses = parseProlog(code);
  if (!clauses.length) return code;
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const withY = clauses.map(c => ({
    clause: c,
    y: nodeById[`pred:${c.head.functor}/${c.head.arity}`]?.y ?? 9999
  })).sort((a, b) => a.y - b.y);

  const lines = code.split('\n');
  const clauseLineSet = new Set(clauses.flatMap(c => {
    const arr = [];
    for (let i = c.lineStart; i <= c.lineEnd; i++) arr.push(i);
    return arr;
  }));

  const firstClauseLine = clauses[0]?.lineStart ?? lines.length;
  const headerLines = lines.slice(0, firstClauseLine);
  return [...headerLines, ...withY.map(({ clause }) => clause.raw)].join('\n');
}

export const EXAMPLES = {
  family: `% Family relationships
parent(tom, bob).
parent(tom, liz).
parent(bob, ann).
parent(bob, pat).

grandparent(X, Z) :-
    parent(X, Y),
    parent(Y, Z).

ancestor(X, Y) :-
    parent(X, Y).
ancestor(X, Y) :-
    parent(X, Z),
    ancestor(Z, Y).`,

  animals: `% Animal classification
animal(dog).
animal(cat).
animal(eagle).
animal(salmon).
mammal(dog).
mammal(cat).
bird(eagle).
fish(salmon).
has_legs(dog).
has_legs(cat).
has_legs(eagle).
can_fly(eagle).
can_swim(salmon).
can_swim(dog).

pet(X) :-
    mammal(X),
    has_legs(X).`,

  graph: `% Graph reachability
edge(a, b).
edge(b, c).
edge(c, d).
edge(a, d).
edge(b, d).

path(X, Y) :-
    edge(X, Y).
path(X, Y) :-
    edge(X, Z),
    path(Z, Y).

connected(X, Y) :-
    path(X, Y).
connected(X, Y) :-
    path(Y, X).`,

  lists: `% List operations
member(X, [X|_]).
member(X, [_|T]) :-
    member(X, T).

append([], L, L).
append([H|T], L, [H|R]) :-
    append(T, L, R).

length([], 0).
length([_|T], N) :-
    length(T, N1),
    N is N1 + 1.`,
};
