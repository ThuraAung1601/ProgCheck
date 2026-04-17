/**
 * AndOrTree — static And-Or tree visualization of Prolog source code.
 *
 * OR  node  (blue rect)  : one per predicate functor/arity
 * Goal nodes (dim rects) : all body goals / fact heads, laid out flat
 * AND bow   (green arc)  : drawn between goals that belong to the same
 *                          multi-goal rule body, connecting their tops
 *
 * Matches the classical And-Or tree notation:
 *   – every child has its own connector line from the OR node
 *   – an arc "bows" over the AND-connected group
 *
 * Click any goal node to highlight the corresponding source line.
 * Pan with drag, zoom with scroll wheel.
 */
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';

// ── Layout constants ──────────────────────────────────────────────────────────
const OR_W    = 132, OR_H    = 38;   // OR-node (predicate)
const G_W     = 110, G_H     = 34;   // goal / fact node
const LEVEL_H = 90;                  // vertical distance: OR bottom → goal top
const G_GAP   = 14;                  // horizontal gap between consecutive goals
const C_GAP   = 28;                  // extra gap between goals from different clauses
const P_PAD   = 60;                  // horizontal padding between predicates
const PAD_T   = 28, PAD_L = 28;

// ── Helpers ───────────────────────────────────────────────────────────────────
function splitGoals(str) {
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

function trunc(s, n = 14) {
  return s && s.length > n ? s.slice(0, n - 1) + '…' : (s || '');
}

// ── Layout builder ────────────────────────────────────────────────────────────
/**
 * Flatten ALL goals from ALL clauses of each predicate into one row.
 * Track which goals belong to the same multi-goal clause so AND bows can
 * be drawn between them.
 */
function buildLayout(sourceClauses) {
  const preds = [];
  let cx = PAD_L;

  for (const [key, clauses] of sourceClauses) {
    const slash   = key.indexOf('/');
    const functor = key.slice(0, slash);
    const arity   = key.slice(slash + 1);

    // ── Flatten goals from all clauses ────────────────────────────────────
    const allGoals  = [];   // { label, isCut, isFact, hascut, lineStart, lineEnd, clauseIdx }
    const andGroups = [];   // [{ firstIdx, lastIdx }] — indices into allGoals

    clauses.forEach((clause, clauseIdx) => {
      const goals   = clause.body ? splitGoals(clause.body) : [clause.head];
      const isMulti = goals.length > 1;
      const start   = allGoals.length;

      goals.forEach(g => {
        allGoals.push({
          label:      g,
          isCut:      g.trim() === '!',
          isFact:     !clause.body,
          hascut:     clause.hascut,
          lineStart:  clause.lineStart,
          lineEnd:    clause.lineEnd,
          clauseIdx,
        });
      });

      if (isMulti) andGroups.push({ firstIdx: start, lastIdx: allGoals.length - 1 });
    });

    // ── Compute widths ────────────────────────────────────────────────────
    // Extra gap between goals from *different* clauses for visual separation
    let totalW = 0;
    allGoals.forEach((goal, i) => {
      totalW += G_W;
      if (i < allGoals.length - 1) {
        const nextClause = allGoals[i + 1].clauseIdx;
        totalW += nextClause !== goal.clauseIdx ? C_GAP : G_GAP;
      }
    });

    const predW = Math.max(OR_W, totalW);
    const orX   = cx + predW / 2 - OR_W / 2;

    // ── Position goals ────────────────────────────────────────────────────
    let gx = cx + (predW - totalW) / 2;
    const goalY = PAD_T + OR_H + LEVEL_H;
    allGoals.forEach((goal, i) => {
      goal.x = gx;
      goal.y = goalY;
      gx += G_W;
      if (i < allGoals.length - 1) {
        const nextClause = allGoals[i + 1].clauseIdx;
        gx += nextClause !== goal.clauseIdx ? C_GAP : G_GAP;
      }
    });

    preds.push({ key, functor, arity, orX, orY: PAD_T, allGoals, andGroups, predW, x: cx });
    cx += predW + P_PAD;
  }

  return { preds, totalW: cx, totalH: PAD_T + OR_H + LEVEL_H + G_H + 48 };
}

// ── Root component ────────────────────────────────────────────────────────────
export default function AndOrTree({ sourceClauses, onHighlightLine }) {
  const [pan,  setPan]  = useState({ x: 20, y: 28 });
  const [zoom, setZoom] = useState(1.0);

  const svgRef       = useRef(null);
  const containerRef = useRef(null);
  const panStart     = useRef(null);

  const layout = useMemo(() => {
    if (!sourceClauses?.size) return null;
    return buildLayout(sourceClauses);
  }, [sourceClauses]);

  // Re-center whenever the layout changes
  useEffect(() => {
    if (!layout || !containerRef.current) return;
    const { width } = containerRef.current.getBoundingClientRect();
    const initZoom = 0.95;
    setPan({ x: Math.max(20, width / 2 - (layout.totalW * initZoom) / 2), y: 28 });
    setZoom(initZoom);
  }, [layout]);

  const onWheel = useCallback(e => {
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

  const onDown = useCallback(e => {
    const el = e.target;
    if (el !== svgRef.current && !el.classList?.contains?.('ao-bg')) return;
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMove = useCallback(e => {
    if (!panStart.current) return;
    setPan({
      x: panStart.current.px + e.clientX - panStart.current.mx,
      y: panStart.current.py + e.clientY - panStart.current.my,
    });
  }, []);

  const onUp = useCallback(() => { panStart.current = null; }, []);

  if (!sourceClauses?.size) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-txt-tertiary gap-2">
        <span className="text-4xl opacity-20 font-mono">∧∨</span>
        <p className="text-xs text-center leading-relaxed">
          Load a file or type Prolog code<br />to see the And-Or tree
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full w-full overflow-hidden relative cursor-grab"
      onWheel={onWheel}
    >
      <svg
        ref={svgRef}
        width="100%" height="100%"
        onMouseDown={onDown} onMouseMove={onMove}
        onMouseUp={onUp}   onMouseLeave={onUp}
        style={{ display: 'block' }}
      >
        <defs>
          <pattern id="ao-bg-pat" width={20} height={20} patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth={0.5} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ao-bg-pat)" className="ao-bg" />

        <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
          {layout.preds.map(pred => (
            <PredTree key={pred.key} pred={pred} onHL={onHighlightLine} />
          ))}
        </g>
      </svg>
    </div>
  );
}

// ── PredTree — one predicate's subtree ────────────────────────────────────────
function PredTree({ pred, onHL }) {
  const { functor, arity, orX, orY, allGoals, andGroups } = pred;
  const orCx  = orX + OR_W / 2;
  const orBot = orY + OR_H;

  return (
    <g>
      {/* ── 1. Connector lines (bottom layer) ── */}
      {allGoals.map((goal, i) => (
        <line key={`conn-${i}`}
          x1={orCx}              y1={orBot}
          x2={goal.x + G_W / 2} y2={goal.y}
          stroke="rgba(133,183,235,0.28)" strokeWidth={1.2}
        />
      ))}

      {/* ── 2. AND arcs — angle-mark style ──────────────────────────────────
              Placed at t ≈ 30 % down each connector line from the OR node,
              like a geometry angle-arc that marks the angle between two rays.
              The arc bows AWAY from the OR node (toward the goals), drawn on
              top of the connector lines so it's clearly visible.            */}
      {andGroups.map(({ firstIdx, lastIdx }, i) => {
        const g1  = allGoals[firstIdx];
        const g2  = allGoals[lastIdx];
        const x1  = g1.x + G_W / 2;   // connector-line endpoint (goal center)
        const x2  = g2.x + G_W / 2;
        // all goals share the same Y
        const gy  = g1.y;

        // Points at fraction t along each connector line from the OR node
        const t   = 0.30;
        const p1x = orCx + t * (x1 - orCx);
        const p1y = orBot + t * (gy  - orBot);
        const p2x = orCx + t * (x2 - orCx);
        // p2y === p1y because all goals sit at the same Y level

        // Control point: midpoint shifted toward goals (outward from OR node)
        // — creates the outward-bowing arc that looks like an angle marker
        const ctrlX = (p1x + p2x) / 2;
        const ctrlY = p1y + 22;

        return (
          <path key={i}
            d={`M ${p1x} ${p1y} Q ${ctrlX} ${ctrlY} ${p2x} ${p1y}`}
            fill="none"
            stroke="rgba(151,196,89,0.90)"
            strokeWidth={1.8}
          />
        );
      })}

      {/* ── OR node ── */}
      <rect x={orX + 2} y={orY + 3} width={OR_W} height={OR_H} rx={9}
        fill="#000" opacity={0.25} />
      <rect x={orX} y={orY} width={OR_W} height={OR_H} rx={9}
        fill="#111827" stroke="#4a90d9" strokeWidth={2} />
      <text x={orX + OR_W / 2} y={orY + OR_H / 2}
        textAnchor="middle" dominantBaseline="central"
        fontFamily="'JetBrains Mono',monospace" fontSize={11} fontWeight={700} fill="#85B7EB">
        {trunc(`${functor}/${arity}`, 16)}
      </text>

      {/* ── Goal / fact nodes ── */}
      {allGoals.map((goal, i) => (
        <GoalNode key={`goal-${i}`} goal={goal} onHL={onHL} />
      ))}
    </g>
  );
}

// ── GoalNode ──────────────────────────────────────────────────────────────────
function GoalNode({ goal, onHL }) {
  const { x, y, label, isCut, isFact, hascut, lineStart, lineEnd } = goal;
  const clickable = lineStart >= 0;

  const fill   = isFact ? '#0c2117' : isCut ? '#1f1500' : '#111827';
  const stroke = isFact ? '#22c55e'
               : isCut  ? '#f59e0b'
               : hascut ? 'rgba(245,158,11,0.40)'
               :          '#2d5a8a';
  const textC  = isFact ? '#86efac'
               : isCut  ? '#fcd34d'
               : hascut ? '#fcd34daa'
               :          '#7aa8cc';

  return (
    <g
      onClick={() => clickable && onHL?.(lineStart, lineEnd ?? lineStart)}
      style={{ cursor: clickable ? 'pointer' : 'default' }}
    >
      {/* drop shadow */}
      <rect x={x + 2} y={y + 3} width={G_W} height={G_H} rx={6}
        fill="#000" opacity={0.22} />
      {/* node body */}
      <rect x={x} y={y} width={G_W} height={G_H} rx={6}
        fill={fill} stroke={stroke} strokeWidth={1.5} />
      {/* fact: double underline (traditional notation) */}
      {isFact && (
        <>
          <line x1={x + 7} y1={y + G_H - 6} x2={x + G_W - 7} y2={y + G_H - 6}
            stroke={stroke} strokeWidth={1} opacity={0.55} />
          <line x1={x + 7} y1={y + G_H - 2} x2={x + G_W - 7} y2={y + G_H - 2}
            stroke={stroke} strokeWidth={1} opacity={0.55} />
        </>
      )}
      {/* label */}
      <text x={x + G_W / 2} y={y + G_H / 2}
        textAnchor="middle" dominantBaseline="central"
        fontFamily="'JetBrains Mono',monospace" fontSize={9.5} fill={textC}>
        {trunc(label, 15)}
      </text>
    </g>
  );
}
