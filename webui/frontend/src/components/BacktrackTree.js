import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { layoutTree } from '../utils/treeLayout';
import { extractNodeBindings, getNextChoiceClause } from '../utils/engineOutputParser';

const COLORS = {
  success: { bg: '#0f2a1a', border: '#22c55e', text: '#86efac', badge: '#15803d' },
  fail:    { bg: '#2a0f0f', border: '#ef4444', text: '#fca5a5', badge: '#b91c1c' },
  cut:     { bg: '#2a1f00', border: '#f59e0b', text: '#fcd34d', badge: '#b45309' },
  pending: { bg: '#1a1f2e', border: '#4a5568', text: '#94a3b8', badge: '#334155' },
  ghost:   { bg: '#1a1a2a', border: '#6366f1', text: '#818cf8', badge: '#312e81' },
};
const RESULT_LABEL = { success:'✓', fail:'✗', cut:'!', pending:'…' };
const NODE_W = 160, NODE_H = 64;

function TreeNode({ node, pos, isSelected, isStepActive, onClick, scopeDepth=0, hasChildren=false, isCollapsed=false, onToggleCollapse }) {
  const isQ = node.isQueryRoot;
  const c   = isQ ? { bg:'#1a1f2e', border:'#4a90d9', text:'#85B7EB', badge:'#1d4e89' }
              : node.cutPrevented ? COLORS.ghost : (COLORS[node.result] || COLORS.pending);
  const isG = node.cutPrevented;
  const goal   = (node.goal   || '').length > 20 ? (node.goal   || '').slice(0,19) + '…' : (node.goal   || '');
  const clause = isQ ? '' : (node.clause || '').length > 22 ? (node.clause || '').slice(0,21) + '…' : (node.clause || '');
  const bindingEntries = Object.entries(node.bindings || {});
  const badgeText = isQ ? '? query'
    : isG ? '✂ prevented'
    : node.result === 'success' && bindingEntries.length > 0
      ? (() => { const s = `${bindingEntries[0][0]}=${bindingEntries[0][1]}`; return s.length > 10 ? s.slice(0,9)+'…' : s; })()
      : (RESULT_LABEL[node.result] || node.result);

  return (
    <g transform={`translate(${pos.x},${pos.y})`} onClick={() => onClick(node)} style={{ cursor:'pointer' }}>
      {isStepActive && (
        <rect x={-3} y={-3} width={NODE_W+6} height={NODE_H+6} rx={11}
          fill="none" stroke="#fff" strokeWidth={1.5} opacity={0.5}
          style={{ animation:'pulse 1s ease-in-out infinite' }} />
      )}
      <rect x={2} y={3} width={NODE_W} height={NODE_H} rx={8} fill="#000" opacity={0.3} />
      <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={8}
        fill={c.bg} stroke={isSelected ? '#fff' : c.border}
        strokeWidth={isSelected ? 2 : isG ? 1 : 1.5}
        strokeDasharray={isG ? '5 3' : undefined}
        opacity={isG ? 0.7 : 1} />
      {/* Scope depth badge — top-right corner */}
      {scopeDepth > 0 && (
        <>
          <rect x={NODE_W-22} y={2} width={20} height={12} rx={3} fill="rgba(245,158,11,0.2)" />
          <text x={NODE_W-12} y={8} textAnchor="middle" dominantBaseline="central"
            fontSize={7} fontWeight={700} fontFamily="'DM Sans',sans-serif" fill="#f59e0b">
            ×{scopeDepth+1}
          </text>
        </>
      )}
      <text x={NODE_W/2} y={20} textAnchor="middle" dominantBaseline="central"
        fontSize={10} fontWeight={600} fontFamily="'JetBrains Mono',monospace" fill={c.text}>
        {goal}
      </text>
      <text x={NODE_W/2} y={36} textAnchor="middle" dominantBaseline="central"
        fontSize={8.5} fontFamily="'JetBrains Mono',monospace" fill={c.text} opacity={0.6}>
        {clause}
      </text>
      <rect x={NODE_W/2-28} y={47} width={56} height={12} rx={4} fill={c.badge} opacity={isG?0.5:0.8} />
      <text x={NODE_W/2} y={53.5} textAnchor="middle" dominantBaseline="central"
        fontSize={7.5} fontWeight={600} fontFamily="'DM Sans',sans-serif" fill={c.text} opacity={isG?0.7:1}>
        {badgeText}
      </text>
      {/* Collapse / expand toggle below node */}
      {hasChildren && onToggleCollapse && (
        <g transform={`translate(${NODE_W/2},${NODE_H+8})`}
          onClick={e => { e.stopPropagation(); onToggleCollapse(node.id); }}
          style={{ cursor:'pointer' }}>
          <circle r={7} fill={c.bg} stroke={c.border} strokeWidth={1} opacity={0.9} />
          <text textAnchor="middle" dominantBaseline="central"
            fontSize={10} fontWeight={700} fontFamily="monospace" fill={c.text} opacity={0.9}>
            {isCollapsed ? '+' : '−'}
          </text>
        </g>
      )}
    </g>
  );
}

function Connector({ fromPos, toPos, node }) {
  const fx = fromPos.x + NODE_W/2, fy = fromPos.y + NODE_H;
  const tx = toPos.x  + NODE_W/2, ty = toPos.y;
  const my = (fy + ty) / 2;
  const isG   = node.cutPrevented;
  const color = isG ? '#6366f1' : node.result==='fail' ? '#ef4444' : node.result==='cut' ? '#f59e0b' : node.result==='success' ? '#22c55e' : '#4a5568';
  return (
    <path d={`M ${fx} ${fy} C ${fx} ${my}, ${tx} ${my}, ${tx} ${ty}`}
      fill="none" stroke={color}
      strokeWidth={isG ? 1 : 1.5}
      strokeDasharray={isG ? '5 4' : node.result==='fail' ? '3 3' : undefined}
      opacity={isG ? 0.4 : node.result==='fail' ? 0.5 : 0.7} />
  );
}

function GhostConnector({ cutPos, ghostPos }) {
  const fx = cutPos.x  + NODE_W/2, fy = cutPos.y  + NODE_H;
  const tx = ghostPos.x + NODE_W/2, ty = ghostPos.y;
  const my = fy + (ty - fy) * 0.5;
  return (
    <g>
      <path d={`M ${fx} ${fy} C ${fx} ${my}, ${tx} ${my}, ${tx} ${ty}`}
        fill="none" stroke="#6366f1" strokeWidth={3} opacity={0.06} />
      <path d={`M ${fx} ${fy} C ${fx} ${my}, ${tx} ${my}, ${tx} ${ty}`}
        fill="none" stroke="#6366f1" strokeWidth={1.5}
        strokeDasharray="6 4" opacity={0.5} markerEnd="url(#ghost-arrow)" />
      <text x={(fx+tx)/2+4} y={my} fontSize={7} fontFamily="'DM Sans',sans-serif"
        fill="#818cf8" opacity={0.65}>without !</text>
    </g>
  );
}

function BindingsPanel({ node, extractedBindings, onClose }) {
  if (!node) return null;
  const c = node.cutPrevented ? COLORS.ghost : (COLORS[node.result] || COLORS.pending);
  // Merge node.bindings (from backend) with freshly extracted ones
  const merged = { ...(node.bindings || {}), ...(extractedBindings || {}) };
  const entries = Object.entries(merged);
  return (
    <div className="absolute bottom-2 right-2 w-52 bg-bg-secondary border rounded-lg p-2.5 z-30 shadow-xl text-[11px]"
      style={{ borderColor: c.border }}>
      <button onClick={onClose} className="absolute top-1.5 right-1.5 bg-transparent border-none text-txt-tertiary text-[10px] cursor-pointer">✕</button>
      <div className="font-bold tracking-widest uppercase mb-1" style={{ color: c.border, fontSize: 8 }}>
        {node.cutPrevented ? 'CUT PREVENTED' : (node.result||'?').toUpperCase()}
      </div>
      <div className="font-mono font-semibold mb-1 leading-tight" style={{ color: c.text, fontSize: 10 }}>{node.goal}</div>
      {node.clause && node.clause !== node.goal && (
        <div className="font-mono mb-1 leading-tight opacity-50" style={{ color: c.text, fontSize: 8 }}>
          {node.clause.length > 40 ? node.clause.slice(0,39)+'…' : node.clause}
        </div>
      )}
      {entries.length > 0 ? (
        <div className="mt-1 space-y-0.5 border-t border-white/10 pt-1">
          <div className="text-[8px] uppercase tracking-widest text-txt-tertiary mb-0.5">Substitutions</div>
          {entries.map(([k,v]) => (
            <div key={k} className="flex gap-1.5 items-center">
              <span className="font-mono text-[#ED93B1]">{k}</span>
              <span className="text-txt-tertiary text-[9px]">=</span>
              <span className="font-mono text-[#EF9F27]">{v}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-txt-tertiary text-[10px] border-t border-white/10 pt-1">No substitutions</div>
      )}
    </div>
  );
}

export default function BacktrackTree({
  trace,
  sourceClauses   = null,  // Map from extractSourceClauses — for bindings + choice points
  onHighlightLine,         // (start, end) — kept for backward compat
  onHighlightDetails,      // ({ primary, secondary, choice, gutter }) — richer highlight
  compact = false,
}) {
  const [stepIdx, setStepIdx]         = useState(-1);
  const [selectedNode, setSelectedNode] = useState(null);
  const [showGhosts, setShowGhosts]   = useState(true);
  const [showBlocks, setShowBlocks]   = useState(true);
  const [isPlaying, setIsPlaying]     = useState(false);
  const [pan, setPan]                 = useState({ x: 10, y: 10 });
  const [zoom, setZoom]               = useState(0.85);
  const [collapsedIds, setCollapsedIds] = useState(new Set());
  const svgRef    = useRef(null);
  const canvasRef = useRef(null);
  const playTimer = useRef(null);
  const panStart  = useRef(null);

  const { positions, totalW, totalH } = useMemo(() => {
    if (!trace?.length) return { positions:{}, totalW:0, totalH:0 };
    return layoutTree(trace);
  }, [trace]);

  useEffect(() => {
    setStepIdx(-1); setSelectedNode(null);
    setShowGhosts(true); setShowBlocks(true); setIsPlaying(false);
    const initZoom = compact ? 0.75 : 0.9;
    // Center the root node horizontally; put it near the top
    const rootNode = trace?.find(n => !n.parentId);
    const rootPos = rootNode ? positions[rootNode.id] : null;
    const cvs = canvasRef.current;
    if (rootPos && cvs) {
      const { width } = cvs.getBoundingClientRect();
      const rootCx = (rootPos.cx ?? rootPos.x + NODE_W / 2) * initZoom;
      setPan({ x: Math.max(10, width / 2 - rootCx), y: 20 });
    } else {
      setPan({ x: 10, y: 20 });
    }
    setZoom(initZoom);
  }, [trace, compact, positions]);

  // Build execution order: DFS traversal where fail-unification ghosts are
  // inserted immediately BEFORE the real node they preceded (so stepping through
  // shows "tried X and failed, then tried Y and succeeded" in the correct order).
  const executionOrder = useMemo(() => {
    if (!trace?.length) return [];

    // Local maps (self-contained — does not depend on outer childOf/nodeById memos)
    const _nb = {};
    trace.forEach(n => { _nb[n.id] = n; });
    const _ch = {};
    trace.forEach(n => { _ch[n.id] = []; });
    trace.forEach(n => { if (n.parentId && _ch[n.parentId]) _ch[n.parentId].push(n.id); });

    // Group fail-unification ghosts (result='fail', !cutPrevented) by (parentId|goal)
    const failByKey = {};
    trace.forEach(n => {
      if (n.result === 'fail' && !n.cutPrevented && !n.isQueryRoot) {
        const k = `${n.parentId || ''}|||${n.goal || ''}`;
        (failByKey[k] = failByKey[k] || []).push(n);
      }
    });

    const emitted = new Set();
    const order = [];

    function visit(nodeId) {
      const node = _nb[nodeId];
      if (!node || node.cutPrevented || node.isQueryRoot || emitted.has(nodeId)) return;
      // Stand-alone fail ghosts are emitted when we visit their real sibling
      if (node.result === 'fail' && !node.cutPrevented) return;

      // Emit fail ghosts for this real node (same parent + same goal)
      const k = `${node.parentId || ''}|||${node.goal || ''}`;
      (failByKey[k] || []).forEach(g => {
        if (!emitted.has(g.id)) { emitted.add(g.id); order.push(g); }
      });

      emitted.add(nodeId);
      order.push(node);

      // Recurse into real children (skip cut-prevented and fail-ghosts)
      (_ch[nodeId] || []).forEach(cid => {
        const c = _nb[cid];
        if (c && !c.cutPrevented && !c.isQueryRoot && !(c.result === 'fail' && !c.cutPrevented))
          visit(cid);
      });
    }

    const root = trace.find(n => !n.parentId);
    if (root) {
      if (root.isQueryRoot) {
        (_ch[root.id] || []).forEach(cid => {
          const c = _nb[cid];
          if (c && !c.cutPrevented && !(c.result === 'fail' && !c.cutPrevented)) visit(cid);
        });
      } else {
        visit(root.id);
      }
    }

    return order;
  }, [trace]);
  const activeNode = stepIdx >= 0 && stepIdx < executionOrder.length ? executionOrder[stepIdx] : null;

  // ── nodeById map ─────────────────────────────────────────────────────────
  const nodeById = useMemo(() =>
    Object.fromEntries((trace||[]).map(n => [n.id, n])),
  [trace]);

  // ── childOf map (all nodes, not just visible) ────────────────────────────
  const childOf = useMemo(() => {
    const map = {};
    trace?.forEach(n => { map[n.id] = []; });
    trace?.forEach(n => { if (n.parentId && map[n.parentId]) map[n.parentId].push(n.id); });
    return map;
  }, [trace]);

  // ── Scope depth: count same-functor ancestors (recursion indicator) ───────
  const scopeDepths = useMemo(() => {
    if (!trace?.length) return {};
    const depths = {};
    trace.forEach(node => {
      const f = node.goal?.match(/^([a-z_][a-zA-Z0-9_]*)/)?.[1];
      if (!f) { depths[node.id] = 0; return; }
      let count = 0, cur = nodeById[node.parentId];
      while (cur) {
        if (cur.goal?.match(/^([a-z_][a-zA-Z0-9_]*)/)?.[1] === f) count++;
        cur = nodeById[cur.parentId];
      }
      depths[node.id] = count;
    });
    return depths;
  }, [trace, nodeById]);

  // ── Collapse: nodes hidden under collapsed ancestors ─────────────────────
  const hiddenByCollapse = useMemo(() => {
    if (collapsedIds.size === 0) return new Set();
    const hidden = new Set();
    function hideAll(id) {
      for (const cid of (childOf[id] || [])) {
        if (!hidden.has(cid)) { hidden.add(cid); hideAll(cid); }
      }
    }
    collapsedIds.forEach(id => hideAll(id));
    return hidden;
  }, [collapsedIds, childOf]);

  const toggleCollapse = useCallback((nodeId) => {
    setCollapsedIds(prev => {
      const next = new Set(prev);
      next.has(nodeId) ? next.delete(nodeId) : next.add(nodeId);
      return next;
    });
  }, []);

  // Auto-expand if the active step falls inside a collapsed subtree
  useEffect(() => {
    if (!activeNode || collapsedIds.size === 0) return;
    if (!hiddenByCollapse.has(activeNode.id)) return;
    let cur = nodeById[activeNode.parentId];
    while (cur) {
      if (collapsedIds.has(cur.id)) {
        setCollapsedIds(prev => { const n = new Set(prev); n.delete(cur.id); return n; });
        break;
      }
      cur = nodeById[cur.parentId];
    }
  }, [activeNode, hiddenByCollapse, collapsedIds, nodeById]);

  // ── Bindings extraction for active / selected node ────────────────────────
  const focusNode = selectedNode || activeNode;
  const extractedBindings = useMemo(() =>
    sourceClauses ? extractNodeBindings(focusNode, sourceClauses) : {},
  [focusNode, sourceClauses]);

  // ── Rich highlight: primary + secondary + choice + gutter ────────────────
  useEffect(() => {
    const ref = selectedNode || activeNode;
    if (!ref) {
      onHighlightLine?.(-1, -1);
      onHighlightDetails?.({ primary: [], secondary: [], choice: [], gutter: {} });
      return;
    }

    const mkRange = (n) => n && n.lineStart >= 0
      ? Array.from({ length: (n.lineEnd ?? n.lineStart) - n.lineStart + 1 }, (_, i) => n.lineStart + i)
      : [];

    // Primary: current node's head line
    const primary = mkRange(ref);

    // Secondary:
    //   1. Parent node's line (the rule that called this goal)
    //   2. If ref is a rule node: facts used in the body goal chain
    const secondary = [];
    const parentNode = nodeById[ref.parentId];
    if (parentNode && !parentNode.isQueryRoot) secondary.push(...mkRange(parentNode));

    if (ref.clause?.includes(':-')) {
      // Body goals are chained: rule → G1 → G2 → ! → G3 (each is parent of next)
      // Walk the entire chain collecting fact nodes; stop when entering a nested rule call
      const visited = new Set();
      const collectChainFacts = (nodeId) => {
        if (visited.has(nodeId)) return;
        visited.add(nodeId);
        for (const cid of (childOf[nodeId] || [])) {
          const child = nodeById[cid];
          if (!child || child.cutPrevented) continue;
          if (child.isFact && child.lineStart >= 0) {
            mkRange(child).forEach(l => { if (!secondary.includes(l)) secondary.push(l); });
          }
          // Continue through builtins/facts in the chain; stop at nested rule calls
          if (!child.clause?.includes(':-')) collectChainFacts(cid);
        }
      };
      collectChainFacts(ref.id);
    }

    // Choice: next alternative clause in source
    const nextChoice = sourceClauses ? getNextChoiceClause(ref, sourceClauses) : null;
    const choice = nextChoice
      ? Array.from({ length: nextChoice.lineEnd - nextChoice.lineStart + 1 }, (_, i) => nextChoice.lineStart + i)
      : [];

    // Gutter: scope counts — ONLY for recursive predicates (count > 1 in the active path)
    const gutter = {};
    if (sourceClauses) {
      const pathCounts = {};
      let cur = ref;
      while (cur) {
        const f = cur.goal?.match(/^([a-z_][a-zA-Z0-9_]*)/)?.[1];
        if (f) pathCounts[f] = (pathCounts[f] || 0) + 1;
        cur = nodeById[cur.parentId];
      }
      for (const [key, clauses] of sourceClauses) {
        const f = key.split('/')[0];
        // Only annotate predicates that appear MORE THAN ONCE = recursion
        if ((pathCounts[f] || 0) > 1) {
          clauses.forEach(cl => {
            for (let l = cl.lineStart; l <= (cl.lineEnd ?? cl.lineStart); l++)
              gutter[l] = `×${pathCounts[f]}`;
          });
        }
      }
    }

    // Binding colors: each variable → a color, same color for its bound value
    const currentBindings = sourceClauses ? extractNodeBindings(ref, sourceClauses) : {};
    const allBindings = { ...(ref.bindings || {}), ...currentBindings };
    const palette = ['#86efac', '#7dd3fc', '#c4b5fd', '#fde68a', '#fca5a5'];
    const bindingColors = {};
    Object.entries(allBindings).forEach(([varName, value], idx) => {
      const color = palette[idx % palette.length];
      bindingColors[varName] = color;
      // Only color simple atom values (skip numbers, complex terms, single chars)
      if (value && /^[a-z][a-zA-Z0-9_]{1,}$/.test(value)) bindingColors[value] = color;
    });

    if (primary.length > 0) onHighlightLine?.(primary[0], primary[primary.length - 1]);
    onHighlightDetails?.({ primary, secondary, choice, gutter, bindingColors });
  }, [activeNode, selectedNode, nodeById, childOf, sourceClauses, onHighlightLine, onHighlightDetails]);

  useEffect(() => {
    if (isPlaying) {
      playTimer.current = setInterval(() => {
        setStepIdx(prev => { if (prev >= executionOrder.length-1) { setIsPlaying(false); return prev; } return prev+1; });
      }, 800);
    }
    return () => clearInterval(playTimer.current);
  }, [isPlaying, executionOrder.length]);

  // Auto-pan to keep active node centered while stepping/playing
  useEffect(() => {
    if (!activeNode || stepIdx === -1) return;
    if (panStart.current) return; // user is manually dragging
    const pos = positions[activeNode.id];
    if (!pos || !canvasRef.current) return;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    setPan({
      x: width  / 2 - (pos.x + NODE_W / 2) * zoom,
      y: height / 2 - (pos.y + NODE_H / 2) * zoom,
    });
  }, [activeNode, positions, zoom]);

  const handleNodeClick = useCallback((node) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node);
    if (node.lineStart >= 0) onHighlightLine?.(node.lineStart, node.lineEnd);
  }, [onHighlightLine]);

  const visibleIds = useMemo(() => {
    let shown;
    if (stepIdx === -1) {
      shown = new Set(trace?.map(n => n.id) || []);
    } else {
      shown = new Set();
      trace?.filter(n => n.isQueryRoot).forEach(n => shown.add(n.id));
      executionOrder.slice(0, stepIdx+1).forEach(n => shown.add(n.id));
      if (showGhosts) trace?.filter(n => n.cutPrevented).forEach(n => shown.add(n.id));
    }
    // Remove nodes hidden under collapsed ancestors
    hiddenByCollapse.forEach(id => shown.delete(id));
    return shown;
  }, [stepIdx, trace, executionOrder, showGhosts, hiddenByCollapse]);

  const ghostCutMap = useMemo(() => {
    const map = {};
    trace?.forEach(n => { if (n.cutPrevented && n.cutBy) map[n.id] = n.cutBy; });
    return map;
  }, [trace]);

  // ── Block (bounding box) computation ────────────────────────────────────
  // A block is drawn only for nodes that matched a RULE (clause contains ':-').
  // The box covers that node + all its direct children (body goals) + their
  // full subtrees — i.e. the entire scope of that one rule invocation.
  const blocks = useMemo(() => {
    if (!showBlocks || !trace?.length) return [];
    const PAD = 22;

    // Build children map over visible, non-cut nodes
    const childrenOf = {};
    trace.forEach(n => { childrenOf[n.id] = []; });
    trace.forEach(n => {
      if (n.parentId && !n.cutPrevented && visibleIds.has(n.id))
        childrenOf[n.parentId]?.push(n.id);
    });

    // Collect all descendant ids (inclusive) — visited set is per-call to guard against cycles
    function allDesc(id, visited = new Set()) {
      if (visited.has(id)) return [];
      visited.add(id);
      const out = [id];
      for (const c of (childrenOf[id] || [])) out.push(...allDesc(c, visited));
      return out;
    }

    const result = [];
    trace.forEach(n => {
      if (n.cutPrevented || !visibleIds.has(n.id)) return;

      // Only draw a block when this node matched a RULE (has :- in clause)
      const isRule = typeof n.clause === 'string' && n.clause.includes(':-');
      if (!isRule) return;

      // Scope = this node + all descendants
      const ids = allDesc(n.id);
      const pts = ids.map(id => positions[id]).filter(Boolean);
      if (pts.length < 2) return; // no children yet visible — skip

      const minX = Math.min(...pts.map(p => p.x)) - PAD;
      const minY = Math.min(...pts.map(p => p.y)) - PAD;
      const maxX = Math.max(...pts.map(p => p.x + NODE_W)) + PAD;
      const maxY = Math.max(...pts.map(p => p.y + NODE_H)) + PAD;

      result.push({
        id: n.id,
        label: n.goal.length > 28 ? n.goal.slice(0, 27) + '…' : n.goal,
        clause: n.clause,
        depth: n.depth || 0,
        scopeDepth: scopeDepths[n.id] || 0,
        x: minX, y: minY, w: maxX - minX, h: maxY - minY,
        result: n.result,
      });
    });

    // Sort deepest first → inner boxes render on top of outer boxes
    result.sort((a, b) => b.depth - a.depth);
    return result;
  }, [showBlocks, trace, positions, visibleIds, scopeDepths]);

  // Colour palette for block frames — cycling by depth
  const BLOCK_COLORS = [
    { stroke: 'rgba(133,183,235,0.35)', fill: 'rgba(133,183,235,0.04)', label: 'rgba(133,183,235,0.6)' },
    { stroke: 'rgba(151,196,89,0.35)',  fill: 'rgba(151,196,89,0.04)',  label: 'rgba(151,196,89,0.6)' },
    { stroke: 'rgba(239,159,39,0.35)',  fill: 'rgba(239,159,39,0.04)',  label: 'rgba(239,159,39,0.6)' },
    { stroke: 'rgba(237,147,177,0.35)', fill: 'rgba(237,147,177,0.04)', label: 'rgba(237,147,177,0.6)' },
    { stroke: 'rgba(99,102,241,0.35)',  fill: 'rgba(99,102,241,0.04)',  label: 'rgba(99,102,241,0.6)' },
  ];

  const onWheel = useCallback(e => {
    e.preventDefault();
    setZoom(z => Math.max(0.2, Math.min(3, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);
  const onSvgDown = useCallback(e => {
    if (e.target !== svgRef.current && !e.target.classList?.contains?.('pan-bg')) return;
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);
  const onSvgMove = useCallback(e => {
    if (!panStart.current) return;
    setPan({ x: panStart.current.px + e.clientX - panStart.current.mx, y: panStart.current.py + e.clientY - panStart.current.my });
  }, []);
  const onSvgUp = useCallback(() => { panStart.current = null; }, []);

  const hasGhosts = trace?.some(n => n.cutPrevented);

  if (!trace?.length) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-txt-tertiary gap-2">
        <div className="text-3xl opacity-20">↯</div>
        <div className="text-[11px]">Run a query then click Visualize</div>
      </div>
    );
  }

  const btnCls = (active) => `font-sans text-[10px] px-2 py-0.5 rounded border border-white/10 cursor-pointer transition-colors text-[#c9d1d9] ${active ? 'bg-green-900/40 border-green-600/30' : 'bg-bg-elevated hover:bg-bg-surface'}`;

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <style>{`@keyframes pulse{0%,100%{opacity:.5}50%{opacity:1}}`}</style>

      {/* Compact toolbar */}
      <div className="flex items-center gap-1.5 px-2 py-1 border-b border-white/[0.07] bg-bg-secondary flex-shrink-0 flex-wrap">
        <button onClick={() => { setStepIdx(-1); setIsPlaying(false); }} className={btnCls(false)}>All</button>
        <button onClick={() => setStepIdx(0)} className={btnCls(false)}>⏮</button>
        <button onClick={() => setStepIdx(i => Math.max(0, i===-1 ? executionOrder.length-1 : i-1))} className={btnCls(false)}>◀</button>
        <button onClick={() => setIsPlaying(p => !p)} className={btnCls(isPlaying)}>{isPlaying?'⏸':'▶'}</button>
        <button onClick={() => setStepIdx(i => Math.min(executionOrder.length-1, i===-1?0:i+1))} className={btnCls(false)}>▶</button>
        <button onClick={() => { setStepIdx(executionOrder.length-1); setIsPlaying(false); }} className={btnCls(false)}>⏭</button>

        <span className="font-mono text-[10px] text-[#6b7a99]">
          {stepIdx===-1 ? `${executionOrder.length}` : `${stepIdx+1}/${executionOrder.length}`}
        </span>

        <input type="range" min={-1} max={executionOrder.length-1} value={stepIdx}
          onChange={e => { setStepIdx(Number(e.target.value)); setIsPlaying(false); }}
          className="flex-1 min-w-[40px] accent-accent-blue" style={{ height: 3 }} />

        {hasGhosts && (
          <label className="flex items-center gap-1 cursor-pointer text-[10px] font-sans select-none"
            style={{ color: showGhosts ? '#818cf8' : '#4a5568' }}>
            <input type="checkbox" checked={showGhosts} onChange={e => setShowGhosts(e.target.checked)}
              className="accent-indigo-500 w-2.5 h-2.5" />
            ✂
          </label>
        )}
        <label className="flex items-center gap-1 cursor-pointer text-[10px] font-sans select-none"
          style={{ color: showBlocks ? '#85B7EB' : '#4a5568' }}>
          <input type="checkbox" checked={showBlocks} onChange={e => setShowBlocks(e.target.checked)}
            className="accent-blue-500 w-2.5 h-2.5" />
          ⬡
        </label>
      </div>

      {/* Active step info */}
      {activeNode && (
        <div className="flex gap-2 items-center px-2 py-1 bg-[#0f2030] border-b border-accent-blue/20 flex-shrink-0 flex-wrap font-mono text-[10px]">
          <span className="font-bold" style={{ color: COLORS[activeNode.result]?.border || '#fff' }}>
            {RESULT_LABEL[activeNode.result] || activeNode.result}
          </span>
          <span className="text-txt-primary">{activeNode.goal}</span>
          {/* Scope badge in step bar */}
          {(scopeDepths[activeNode.id] || 0) > 0 && (
            <span className="px-1.5 rounded text-[9px] leading-5"
              style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
              scope ×{(scopeDepths[activeNode.id] || 0) + 1}
            </span>
          )}
          {/* Variable substitutions */}
          {Object.entries({ ...(activeNode.bindings || {}), ...extractedBindings }).map(([k, v]) => (
            <span key={k} className="px-1.5 rounded text-[9px] leading-5"
              style={{ background: '#0f2a1a', color: '#86efac', border: '1px solid #22c55e50' }}>
              {k} = {v}
            </span>
          ))}
        </div>
      )}

      {/* Canvas */}
      <div ref={canvasRef} className="flex-1 overflow-hidden relative cursor-grab" onWheel={onWheel}>
        <svg ref={svgRef} width="100%" height="100%"
          onMouseDown={onSvgDown} onMouseMove={onSvgMove}
          onMouseUp={onSvgUp} onMouseLeave={onSvgUp} style={{ display:'block' }}>
          <defs>
            <pattern id="bt-grid2" width={20} height={20} patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.02)" strokeWidth={0.5} />
            </pattern>
            <marker id="ghost-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={5} markerHeight={5} orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="#6366f1" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#bt-grid2)" className="pan-bg" />
          <g style={{ transition: 'transform 0.35s ease' }} transform={`translate(${pan.x},${pan.y})`}>
          <g transform={`scale(${zoom})`}>
            {/* ── Block frames (bounding boxes, drawn behind everything) ── */}
            {blocks.map((b) => {
              const c = BLOCK_COLORS[b.depth % BLOCK_COLORS.length];
              return (
                <g key={`blk-${b.id}`}>
                  <rect
                    x={b.x} y={b.y} width={b.w} height={b.h} rx={12}
                    fill={c.fill}
                    stroke={c.stroke}
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                  />
                  {/* Goal label in top-left corner */}
                  <text
                    x={b.x + 10} y={b.y + 13}
                    fontSize={8.5} fontFamily="'JetBrains Mono',monospace"
                    fill={c.label} opacity={0.85}
                  >
                    {b.label}
                  </text>
                  {/* Recursion depth badge — top-right corner, only for recursive predicates */}
                  {b.scopeDepth > 0 && (
                    <>
                      <rect
                        x={b.x + b.w - 28} y={b.y + 4}
                        width={24} height={13} rx={4}
                        fill="rgba(245,158,11,0.18)" stroke="rgba(245,158,11,0.5)" strokeWidth={1}
                      />
                      <text
                        x={b.x + b.w - 16} y={b.y + 10.5}
                        textAnchor="middle" dominantBaseline="central"
                        fontSize={8} fontWeight={700} fontFamily="'DM Sans',sans-serif"
                        fill="#f59e0b"
                      >
                        ×{b.scopeDepth + 1}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
            {/* Regular connectors */}
            {trace.map(node => {
              if (!node.parentId || !visibleIds.has(node.id) || node.cutPrevented) return null;
              const fp = positions[node.parentId], tp = positions[node.id];
              if (!fp || !tp) return null;
              return <Connector key={`e-${node.id}`} fromPos={fp} toPos={tp} node={node} />;
            })}
            {/* Ghost connectors: from cut node → ghost */}
            {showGhosts && trace.map(node => {
              if (!node.cutPrevented || !visibleIds.has(node.id)) return null;
              const cutId = ghostCutMap[node.id];
              const cutPos   = cutId ? positions[cutId] : null;
              const ghostPos = positions[node.id];
              if (!ghostPos) return null;
              if (cutPos) return <GhostConnector key={`ge-${node.id}`} cutPos={cutPos} ghostPos={ghostPos} />;
              if (node.parentId) {
                const fp = positions[node.parentId];
                if (fp) return <Connector key={`ge-${node.id}`} fromPos={fp} toPos={ghostPos} node={node} />;
              }
              return null;
            })}
            {/* Nodes */}
            {trace.map(node => {
              if (!visibleIds.has(node.id) || (!showGhosts && node.cutPrevented)) return null;
              const pos = positions[node.id];
              if (!pos) return null;
              const visibleChildren = (childOf[node.id] || []).filter(cid => visibleIds.has(cid));
              return (
                <TreeNode key={node.id} node={node} pos={pos}
                  isSelected={selectedNode?.id === node.id}
                  isStepActive={activeNode?.id === node.id}
                  scopeDepth={scopeDepths[node.id] || 0}
                  hasChildren={visibleChildren.length > 0 || collapsedIds.has(node.id)}
                  isCollapsed={collapsedIds.has(node.id)}
                  onToggleCollapse={toggleCollapse}
                  onClick={handleNodeClick} />
              );
            })}
          </g>
          </g>
        </svg>
        {(selectedNode || activeNode) && (
          <BindingsPanel
            node={selectedNode || activeNode}
            extractedBindings={extractedBindings}
            onClose={() => setSelectedNode(null)} />
        )}
      </div>
    </div>
  );
}