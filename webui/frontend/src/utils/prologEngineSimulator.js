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

      return { success, cut: true };
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