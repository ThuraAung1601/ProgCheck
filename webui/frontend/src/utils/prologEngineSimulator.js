let _id = 0;
let _varSuffix = 0;

const nextId = () => `n${++_id}`;

// ─────────────────────────────────────────
// TERM PARSER
// ─────────────────────────────────────────

function parseTerm(str) {
  str = (str || '').trim();
  if (!str) return null;

  if (/^[A-Z_][a-zA-Z0-9_]*$/.test(str))
    return { type: 'var', name: str };

  // List: [...] — handles [], [a,b,c], [H|T], [a,b|T]
  if (str.startsWith('[') && str.endsWith(']')) {
    const inner = str.slice(1, -1).trim();
    if (!inner) return { type: 'atom', name: '[]' };
    const pipeIdx = findTopLevelPipe(inner);
    if (pipeIdx >= 0) {
      // [Head|Tail] — split head elements and tail
      const headPart = inner.slice(0, pipeIdx).trim();
      const tailPart = inner.slice(pipeIdx + 1).trim();
      const headElems = splitTop(headPart).map(parseTerm);
      const tail = parseTerm(tailPart);
      let result = tail;
      for (let i = headElems.length - 1; i >= 0; i--)
        result = { type: 'compound', functor: '.', args: [headElems[i], result] };
      return result;
    }
    // [a,b,c] — regular list
    const elements = splitTop(inner).map(parseTerm);
    let result = { type: 'atom', name: '[]' };
    for (let i = elements.length - 1; i >= 0; i--)
      result = { type: 'compound', functor: '.', args: [elements[i], result] };
    return result;
  }

  const p = str.indexOf('(');
  if (p !== -1 && str.endsWith(')')) {
    const functor = str.slice(0, p).trim();
    const inner = str.slice(p + 1, -1);
    const args = inner ? splitTop(inner).map(parseTerm) : [];
    return { type: 'compound', functor, args };
  }

  return { type: 'atom', name: str };
}

// Find index of | at top-level depth (not inside parens/brackets)
function findTopLevelPipe(str) {
  let depth = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === '|' && depth === 0) return i;
  }
  return -1;
}

function splitTop(str) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of str) {
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// ─────────────────────────────────────────
// UNIFICATION
// ─────────────────────────────────────────

function walk(term, bindings) {
  while (term?.type === 'var' && bindings[term.name]) {
    term = bindings[term.name];
  }
  return term;
}

function unify(t1, t2, bindings) {
  t1 = walk(t1, bindings);
  t2 = walk(t2, bindings);

  // Same variable — nothing to do (avoids circular self-bindings)
  if (t1.type === 'var' && t2.type === 'var' && t1.name === t2.name) return bindings;
  if (t1.type === 'var') return { ...bindings, [t1.name]: t2 };
  if (t2.type === 'var') return { ...bindings, [t2.name]: t1 };

  if (t1.type === 'atom' && t2.type === 'atom')
    return t1.name === t2.name ? bindings : null;

  if (t1.type === 'compound' && t2.type === 'compound') {
    if (t1.functor !== t2.functor || t1.args.length !== t2.args.length)
      return null;

    let b = bindings;
    for (let i = 0; i < t1.args.length; i++) {
      b = unify(t1.args[i], t2.args[i], b);
      if (!b) return null;
    }
    return b;
  }

  return null;
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

function applyBindings(term, bindings) {
  term = walk(term, bindings);

  if (term.type === 'compound') {
    return {
      ...term,
      args: term.args.map(a => applyBindings(a, bindings))
    };
  }

  return term;
}

function termToString(term, bindings) {
  term = applyBindings(term, bindings);

  if (term.type === 'var') return term.name;
  if (term.type === 'atom') return term.name;

  // Render '.'(H,T) as list notation [H|T] / [a,b,c]
  if (term.functor === '.' && term.args.length === 2)
    return listToString(term, bindings);

  return `${term.functor}(${term.args.map(a => termToString(a, bindings)).join(',')})`;
}

function listToString(term, bindings) {
  const elements = [];
  let current = applyBindings(term, bindings);
  while (current.type === 'compound' && current.functor === '.' && current.args.length === 2) {
    elements.push(termToString(current.args[0], bindings));
    current = applyBindings(current.args[1], bindings);
  }
  if (current.type === 'atom' && current.name === '[]')
    return `[${elements.join(',')}]`;
  return `[${elements.join(',')}|${termToString(current, bindings)}]`;
}

function goalKey(term) {
  if (term.type === 'atom') return `${term.name}/0`;
  if (term.type === 'compound') return `${term.functor}/${term.args.length}`;
  return null;
}

function freshen(clause) {
  const suffix = `_${++_varSuffix}`;

  function rename(t) {
    if (!t) return t;
    if (t.type === 'var') return { ...t, name: t.name + suffix };
    if (t.type === 'compound') return { ...t, args: t.args.map(rename) };
    return t;
  }

  function renameRaw(raw) {
    return raw.replace(/[A-Z_][a-zA-Z0-9_]*/g, v => v + suffix);
  }

  return {
    ...clause,
    headTerm: rename(clause.headTerm),
    bodyTerms: clause.bodyTerms.map(t => ({ raw: renameRaw(t.raw), term: rename(t.term) }))
  };
}

function prepareClause(c) {
  return {
    ...c,
    headTerm: parseTerm(c.head),
    bodyTerms: c.isRule
      ? splitTop(c.body).map(x => ({ raw: x, term: parseTerm(x) }))
      : []
  };
}

// ─────────────────────────────────────────
// NATIVE BUILTIN HANDLERS
// Returns array of {bindings} on success, empty array on failure
// ─────────────────────────────────────────

function* nativeBuiltin(term, bindings) {
  const f = term.functor || (term.type === 'atom' ? term.name : null);
  const args = term.args || [];

  // true/0
  if (f === 'true' && args.length === 0) {
    yield bindings; return;
  }

  // fail/0, false/0
  if ((f === 'fail' || f === 'false') && args.length === 0) {
    return;
  }

  // member(X, [H|T])
  if (f === 'member' && args.length === 2) {
    const list = walk(args[1], bindings);
    let cur = applyBindings(list, bindings);
    while (cur.type === 'compound' && cur.functor === '.' && cur.args.length === 2) {
      const head = cur.args[0];
      const b2 = unify(args[0], head, bindings);
      if (b2) yield b2;
      cur = applyBindings(cur.args[1], bindings);
    }
    return;
  }

  // append([], L, L)  /  append([H|T], L, [H|R]) :- append(T, L, R)
  if (f === 'append' && args.length === 3) {
    // Try all splits of args[2] as append(prefix, args[1], args[2])
    const nil = { type: 'atom', name: '[]' };
    function* appendGen(a1, a2, a3, b) {
      // case 1: a1 = []
      const b1 = unify(a1, nil, b);
      if (b1) {
        const b2 = unify(a2, a3, b1);
        if (b2) yield b2;
      }
      // case 2: a1 = [H|T1], a3 = [H|T3], append(T1, a2, T3)
      const freshH = { type: 'var', name: `_AH${++_varSuffix}` };
      const freshT1 = { type: 'var', name: `_AT1${_varSuffix}` };
      const freshT3 = { type: 'var', name: `_AT3${_varSuffix}` };
      const cons1 = { type: 'compound', functor: '.', args: [freshH, freshT1] };
      const cons3 = { type: 'compound', functor: '.', args: [freshH, freshT3] };
      const ba = unify(a1, cons1, b);
      if (!ba) return;
      const bb = unify(a3, cons3, ba);
      if (!bb) return;
      yield* appendGen(applyBindings(freshT1, bb), a2, applyBindings(freshT3, bb), bb);
    }
    yield* appendGen(
      applyBindings(args[0], bindings),
      applyBindings(args[1], bindings),
      applyBindings(args[2], bindings),
      bindings
    );
    return;
  }

  // reverse(List, Rev)
  if (f === 'reverse' && args.length === 2) {
    const list = applyBindings(args[0], bindings);
    function toArray(t) {
      const arr = [];
      let cur = t;
      while (cur.type === 'compound' && cur.functor === '.' && cur.args.length === 2) {
        arr.push(cur.args[0]);
        cur = cur.args[1];
      }
      if (cur.type !== 'atom' || cur.name !== '[]') return null; // partial list
      return arr;
    }
    const arr = toArray(list);
    if (arr === null) return; // can't reverse partial list
    let rev = { type: 'atom', name: '[]' };
    for (const el of arr)
      rev = { type: 'compound', functor: '.', args: [el, rev] };
    const b2 = unify(args[1], rev, bindings);
    if (b2) yield b2;
    return;
  }

  // length(List, N)
  if (f === 'length' && args.length === 2) {
    const list = applyBindings(args[0], bindings);
    let count = 0, cur = list;
    while (cur.type === 'compound' && cur.functor === '.' && cur.args.length === 2) {
      count++; cur = applyBindings(cur.args[1], bindings);
    }
    if (cur.type === 'atom' && cur.name === '[]') {
      const b2 = unify(args[1], { type: 'atom', name: String(count) }, bindings);
      if (b2) yield b2;
    }
    return;
  }

  // msort/sort — just yield null to indicate "not handled here"
  return null;
}

const NATIVE_BUILTINS = new Set(['true','fail','false','member','append','reverse','length']);

function isNativeBuiltin(term) {
  const f = term.functor || (term.type === 'atom' ? term.name : null);
  const arity = term.args ? term.args.length : 0;
  return NATIVE_BUILTINS.has(f) && !(f === 'true' && arity !== 0);
}

// ─────────────────────────────────────────
// 🔥 CORE SOLVER
// ─────────────────────────────────────────

function resolve(goals, parentId, depth, bindings, db, nodes) {
  if (goals.length === 0) return { success: true, cut: false };

  const [current, ...rest] = goals;

  const term = applyBindings(current.term, bindings);
  const label = termToString(term, bindings);

  // ───── CUT ─────
  if (current.raw === '!') {
    const id = nextId();

    nodes.push({
      id, parentId, depth,
      goal: '!',
      clause: '!',
      result: 'cut',
      cutPrevented: false
    });

    const r = resolve(rest, id, depth, bindings, db, nodes);
    return { success: r.success, cut: true };
  }

  // ───── BUILTIN: COMPARISON ─────
  if (/[<>]=?|=< /.test(current.raw)) {
    const id = nextId();

    const expr = current.raw.replace(/[A-Z_][a-zA-Z0-9_]*/g, v => {
      return bindings[v] ? termToString(bindings[v], bindings) : v;
    });

    let ok = false;
    try { ok = eval(expr); } catch {}

    nodes.push({
      id, parentId, depth,
      goal: expr,
      clause: '(builtin)',
      result: ok ? 'success' : 'fail',
      cutPrevented: false
    });

    if (!ok) return { success: false, cut: false };
    return resolve(rest, id, depth, bindings, db, nodes);
  }

  // ───── BUILTIN: IS ─────
  if (current.raw.includes(' is ')) {
    const id = nextId();

    const [left, right] = current.raw.split(' is ');

    const expr = right.replace(/[A-Z_][a-zA-Z0-9_]*/g, v => {
      return bindings[v] ? termToString(bindings[v], bindings) : v;
    });

    let value;
    try { value = eval(expr); } catch { value = null; }

    const displayVar = left.trim().replace(/_\d+$/, '');

    if (value === null) {
      nodes.push({ id, parentId, depth, goal: `${displayVar} is ${expr}`, result: 'fail' });
      return { success: false, cut: false };
    }

    const newBindings = {
      ...bindings,
      [left.trim()]: parseTerm(String(value))
    };

    nodes.push({
      id, parentId, depth,
      goal: `${displayVar} is ${expr}`,
      clause: '(builtin)',
      result: 'success',
      bindings: { [displayVar]: value }
    });

    return resolve(rest, id, depth, newBindings, db, nodes);
  }

  // ───── BUILTIN: NEGATION AS FAILURE (\+) ─────
  if (current.raw.trim().startsWith('\\+')) {
    const id = nextId();
    const innerRaw = current.raw.trim().slice(2).trim();
    const innerNodes = [];
    const innerResult = resolve(
      [{ raw: innerRaw, term: parseTerm(innerRaw) }],
      id, depth + 1, bindings, db, innerNodes
    );

    // Push a node for \+ itself
    nodes.push({
      id, parentId, depth,
      goal: `\\+ ${innerRaw}`,
      clause: '(builtin \\+)',
      result: innerResult.success ? 'fail' : 'success',
      cutPrevented: false
    });
    // Include inner nodes for visibility
    for (const n of innerNodes) nodes.push(n);

    if (innerResult.success) return { success: false, cut: false };
    return resolve(rest, id, depth, bindings, db, nodes);
  }

  // ───── NATIVE BUILTINS (member, append, reverse, length, true, fail) ─────
  if (isNativeBuiltin(term)) {
    const id = nextId();
    let success = false;
    let lastBindings = bindings;

    for (const b2 of nativeBuiltin(term, bindings)) {
      success = true;
      lastBindings = b2;
      nodes.push({
        id, parentId, depth,
        goal: label,
        clause: '(builtin)',
        result: 'success',
        cutPrevented: false
      });
      const r = resolve(rest, id, depth, b2, db, nodes);
      if (r.success) return { success: true, cut: false };
    }

    if (!success) {
      nodes.push({
        id, parentId, depth,
        goal: label,
        clause: '(builtin)',
        result: 'fail',
        cutPrevented: false
      });
      return { success: false, cut: false };
    }

    return { success: false, cut: false };
  }

  // ───── USER PREDICATE ─────
  const key = goalKey(term);
  const clauses = db.get(key) || [];

  if (!clauses.length) {
    nodes.push({
      id: nextId(),
      parentId,
      depth,
      goal: label,
      result: 'fail'
    });
    return { success: false, cut: false };
  }

  let success = false;
  let cut = false;

  for (let i = 0; i < clauses.length; i++) {
    if (cut) break;

    const clause = freshen(clauses[i]);
    const id = nextId();

    const uni = unify(term, clause.headTerm, bindings);

    if (!uni) {
      nodes.push({
        id,
        parentId,
        depth,
        goal: label,
        clause: clauses[i].head,
        result: 'fail'
      });
      continue;
    }

    nodes.push({
      id,
      parentId,
      depth,
      goal: label,
      clause: clauses[i].isRule
        ? `${clauses[i].head} :- ${clauses[i].body}`
        : clauses[i].head,
      result: 'pending'
    });

    const newGoals = [...clause.bodyTerms, ...rest];

    const r = resolve(newGoals, id, depth + 1, uni, db, nodes);

    const node = nodes.find(n => n.id === id);
    node.result = r.success ? 'success' : 'fail';

    if (r.success) success = true;

    if (r.cut) {
      cut = true;

      // prevent siblings
      for (let j = i + 1; j < clauses.length; j++) {
        nodes.push({
          id: nextId(),
          parentId,
          depth,
          goal: label,
          clause: clauses[j].head,
          result: 'fail',
          cutPrevented: true
        });
      }

      // Cut is absorbed here — only affects THIS predicate's choice points,
      // not the caller's. Do NOT propagate cut: true to the parent.
      return { success, cut: false };
    }
  }

  return { success, cut: false };
}

// ─────────────────────────────────────────
// 🚀 ENTRY
// ─────────────────────────────────────────

export function simulateProlog(query, sourceClauses) {
  _id = 0;
  _varSuffix = 0;

  const db = new Map();
  for (const [k, clauses] of sourceClauses) {
    db.set(k, clauses.map(prepareClause));
  }

  const nodes = [];

  const rootId = nextId();
  nodes.push({
    id: rootId,
    parentId: null,
    depth: 0,
    goal: query,
    clause: query,
    result: 'pending'
  });

  const result = resolve(
    [{ raw: query, term: parseTerm(query) }],
    rootId,
    1,
    {},
    db,
    nodes
  );

  nodes.find(n => n.id === rootId).result = result.success ? 'success' : 'fail';

  return nodes;
}