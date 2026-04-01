import React, { useRef, useEffect, useCallback, useState } from 'react';
import { applyForceLayout } from '../utils/layout';

const NODE_RADIUS = { fact: 32, rule: 36, atom: 22, var: 22 };
const NODE_COLORS = {
  fact: { bg: '#1a2b42', border: '#3B8BD4', text: '#85B7EB', label: 'FACT' },
  rule: { bg: '#1a2b1a', border: '#639922', text: '#97C459', label: 'RULE' },
  atom: { bg: '#2b2010', border: '#BA7517', text: '#EF9F27', label: 'ATOM' },
  var:  { bg: '#221228', border: '#993556', text: '#ED93B1', label: 'VAR'  },
};
// How close to an edge endpoint to start an edge-drag (px)
const EDGE_HANDLE_RADIUS = 10;

export default function GraphCanvas({
  nodes: rawNodes, edges,
  onNodeDragEnd, onEdgeRewire,
  selectedNodeId, onNodeClick,
  width, height,
}) {
  const svgRef = useRef(null);
  const nodesRef = useRef([]);
  const [renderTick, setRenderTick] = useState(0);

  // drag state: { kind:'node'|'edge-end', node?, edge?, endpointType:'from'|'to', x, y, moved, ghostX, ghostY, hoverNodeId }
  const dragState = useRef(null);
  const animFrameRef = useRef(null);

  // ── Sync rawNodes into nodesRef, preserving positions ──
  useEffect(() => {
    const existingById = Object.fromEntries(nodesRef.current.map(n => [n.id, n]));
    const nextNodes = rawNodes.map(n => {
      const existing = existingById[n.id];
      if (existing && existing.x !== null) return { ...n, x: existing.x, y: existing.y };
      return { ...n };
    });
    if (nextNodes.some(n => n.x === null)) {
      applyForceLayout(nextNodes, edges, width || 800, height || 580);
    }
    nodesRef.current = nextNodes;
    setRenderTick(t => t + 1);
  }, [rawNodes, edges, width, height]);

  // ── Helpers ──
  const svgCoords = useCallback((clientX, clientY) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const nodeAt = useCallback((x, y, excludeId = null) => {
    return nodesRef.current.slice().reverse().find(n => {
      if (n.id === excludeId) return false;
      const r = NODE_RADIUS[n.type] || 26;
      const dx = n.x - x, dy = n.y - y;
      return Math.sqrt(dx * dx + dy * dy) <= r + 6;
    });
  }, []);

  // Compute edge endpoint positions (where line starts/ends on circle circumference)
  const edgeEndpoints = useCallback((edge) => {
    const nodeById = Object.fromEntries(nodesRef.current.map(n => [n.id, n]));
    const from = nodeById[edge.from];
    const to = nodeById[edge.to];
    if (!from || !to || from.x === null || to.x === null) return null;
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const rFrom = NODE_RADIUS[from.type] || 26;
    const rTo = (NODE_RADIUS[to.type] || 26) + 6;
    return {
      sx: from.x + (dx / dist) * rFrom,
      sy: from.y + (dy / dist) * rFrom,
      ex: to.x - (dx / dist) * rTo,
      ey: to.y - (dy / dist) * rTo,
      from, to,
    };
  }, []);

  // Find if (x,y) is near any edge endpoint — returns { edge, endpointType:'to'|'from' } or null
  const edgeEndpointAt = useCallback((x, y) => {
    for (const edge of edges) {
      const ep = edgeEndpoints(edge);
      if (!ep) continue;
      // Prefer the "to" endpoint (arrowhead) — that's what users want to rewire
      const dex = ep.ex - x, dey = ep.ey - y;
      if (Math.sqrt(dex * dex + dey * dey) <= EDGE_HANDLE_RADIUS) {
        return { edge, endpointType: 'to' };
      }
      // Also allow dragging the "from" end
      const dsx = ep.sx - x, dsy = ep.sy - y;
      if (Math.sqrt(dsx * dsx + dsy * dsy) <= EDGE_HANDLE_RADIUS) {
        return { edge, endpointType: 'from' };
      }
    }
    return null;
  }, [edges, edgeEndpoints]);

  // ── Pointer down ──
  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pt = svgCoords(clientX, clientY);

    // 1. Hit-test node first
    const hitNode = nodeAt(pt.x, pt.y);
    if (hitNode) {
      e.preventDefault();
      dragState.current = { kind: 'node', node: hitNode, moved: false };
      return;
    }

    // 2. Hit-test edge endpoints
    const hitEdgeEnd = edgeEndpointAt(pt.x, pt.y);
    if (hitEdgeEnd) {
      e.preventDefault();
      dragState.current = {
        kind: 'edge-end',
        edge: hitEdgeEnd.edge,
        endpointType: hitEdgeEnd.endpointType,
        ghostX: pt.x,
        ghostY: pt.y,
        hoverNodeId: null,
        moved: false,
      };
      return;
    }
  }, [svgCoords, nodeAt, edgeEndpointAt]);

  // ── Pointer move ──
  const onPointerMove = useCallback((e) => {
    if (!dragState.current) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const pt = svgCoords(clientX, clientY);

    if (dragState.current.kind === 'node') {
      dragState.current.node.x = Math.max(50, Math.min((width || 800) - 50, pt.x));
      dragState.current.node.y = Math.max(50, Math.min((height || 580) - 50, pt.y));
      dragState.current.moved = true;
    } else if (dragState.current.kind === 'edge-end') {
      dragState.current.ghostX = pt.x;
      dragState.current.ghostY = pt.y;
      dragState.current.moved = true;
      // Find hover target node (exclude the node the edge is currently attached to)
      const excludeId = dragState.current.endpointType === 'to'
        ? dragState.current.edge.to
        : dragState.current.edge.from;
      const hover = nodeAt(pt.x, pt.y, excludeId);
      dragState.current.hoverNodeId = hover?.id ?? null;
    }

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(() => setRenderTick(t => t + 1));
    e.preventDefault();
  }, [svgCoords, width, height, nodeAt]);

  // ── Pointer up ──
  const onPointerUp = useCallback((e) => {
    if (!dragState.current) return;
    const ds = dragState.current;
    dragState.current = null;

    if (ds.kind === 'node') {
      if (!ds.moved) {
        onNodeClick?.(ds.node);
      } else {
        onNodeDragEnd?.(nodesRef.current.map(n => ({ id: n.id, x: n.x, y: n.y })));
      }
    } else if (ds.kind === 'edge-end') {
      if (ds.moved && ds.hoverNodeId) {
        // Find the target node
        const targetNode = nodesRef.current.find(n => n.id === ds.hoverNodeId);
        if (targetNode) {
          onEdgeRewire?.({
            edge: ds.edge,
            endpointType: ds.endpointType,
            newNodeId: targetNode.id,
            newNodeLabel: targetNode.label,
          });
        }
      }
    }

    setRenderTick(t => t + 1);
  }, [onNodeClick, onNodeDragEnd, onEdgeRewire]);

  // ── Render ──
  const nodeById = Object.fromEntries(nodesRef.current.map(n => [n.id, n]));

  const renderEdge = (edge) => {
    const ep = edgeEndpoints(edge);
    if (!ep) return null;
    const { sx, sy, ex, ey } = ep;
    const mx = (sx + ex) / 2, my = (sy + ey) / 2;
    const isDashed = edge.style === 'dashed';
    const color = isDashed ? '#639922' : '#4a5568';
    const markerId = isDashed ? 'arrow-rule' : 'arrow-fact';

    // Is this edge being rewired right now?
    const isRewiring = dragState.current?.kind === 'edge-end' && dragState.current.edge.id === edge.id;
    const isHovered = false; // We'll show handles on all edges

    return (
      <g key={edge.id}>
        {/* Wider invisible hit area for easier edge endpoint detection */}
        <line x1={sx} y1={sy} x2={ex} y2={ey} stroke="transparent" strokeWidth={12} />

        {/* Actual edge line */}
        <line
          x1={sx} y1={sy} x2={isRewiring ? sx : ex} y2={isRewiring ? sy : ey}
          stroke={isRewiring ? '#ff6b6b' : color}
          strokeWidth={isDashed ? 1.5 : 1}
          strokeDasharray={isDashed ? '6 3' : undefined}
          markerEnd={isRewiring ? undefined : `url(#${markerId})`}
          opacity={isRewiring ? 0.4 : isDashed ? 0.85 : 0.55}
        />

        {/* Edge label */}
        {edge.label && !isRewiring && (
          <text
            x={mx} y={my - 5}
            textAnchor="middle" fontSize={9}
            fill={color} opacity={0.65}
            fontFamily="'JetBrains Mono', monospace"
          >
            {edge.label}
          </text>
        )}

        {/* Endpoint handle — "to" side (arrowhead end) — always visible, grows on approach */}
        {!isRewiring && (
          <circle
            cx={ex} cy={ey} r={5}
            fill={color} opacity={0.35}
            stroke={color} strokeWidth={1}
            style={{ cursor: 'crosshair' }}
          />
        )}
      </g>
    );
  };

  const renderGhostEdge = () => {
    const ds = dragState.current;
    if (!ds || ds.kind !== 'edge-end' || !ds.moved) return null;
    const ep = edgeEndpoints(ds.edge);
    if (!ep) return null;

    // Ghost line from source to cursor
    const anchorX = ds.endpointType === 'to' ? ep.sx : ep.ex;
    const anchorY = ds.endpointType === 'to' ? ep.sy : ep.ey;
    const ghostColor = ds.hoverNodeId ? '#4ade80' : '#ff6b6b';

    return (
      <g>
        <line
          x1={anchorX} y1={anchorY}
          x2={ds.ghostX} y2={ds.ghostY}
          stroke={ghostColor} strokeWidth={2}
          strokeDasharray="6 4"
          markerEnd={`url(#arrow-ghost)`}
          opacity={0.85}
        />
        {/* Ghost cursor dot */}
        <circle cx={ds.ghostX} cy={ds.ghostY} r={5}
          fill={ghostColor} opacity={0.8}
        />
        {/* Snap ring on hover target */}
        {ds.hoverNodeId && (() => {
          const hn = nodeById[ds.hoverNodeId];
          if (!hn) return null;
          const r = (NODE_RADIUS[hn.type] || 26) + 10;
          return (
            <circle cx={hn.x} cy={hn.y} r={r}
              fill="none" stroke="#4ade80"
              strokeWidth={2} strokeDasharray="5 3"
              opacity={0.7}
            />
          );
        })()}
      </g>
    );
  };

  const renderNode = (node) => {
    if (node.x === null) return null;
    const r = NODE_RADIUS[node.type] || 26;
    const colors = NODE_COLORS[node.type] || NODE_COLORS.fact;
    const isSelected = node.id === selectedNodeId;
    const isDragging = dragState.current?.kind === 'node' && dragState.current.node?.id === node.id;
    const isEdgeHover = dragState.current?.kind === 'edge-end' && dragState.current.hoverNodeId === node.id;
    const label = node.label.length > 11 ? node.label.slice(0, 10) + '…' : node.label;

    return (
      <g key={node.id} style={{ cursor: 'grab' }}>
        {/* Selection / drag / edge-hover ring */}
        {(isSelected || isDragging || isEdgeHover) && (
          <circle cx={node.x} cy={node.y} r={r + 8}
            fill={isEdgeHover ? 'rgba(74,222,128,0.1)' : 'none'}
            stroke={isEdgeHover ? '#4ade80' : colors.border}
            strokeWidth={isEdgeHover ? 2 : 1.5}
            opacity={isEdgeHover ? 0.9 : 0.4}
            strokeDasharray={isEdgeHover ? undefined : '4 3'}
          />
        )}
        {/* Shadow */}
        <circle cx={node.x + 2} cy={node.y + 3} r={r} fill="#000" opacity={0.25} />
        {/* Body */}
        <circle cx={node.x} cy={node.y} r={r}
          fill={colors.bg}
          stroke={isEdgeHover ? '#4ade80' : colors.border}
          strokeWidth={isSelected || isEdgeHover ? 2 : 1.5}
          opacity={isDragging ? 0.9 : 1}
        />
        {/* Inner ring */}
        <circle cx={node.x} cy={node.y} r={r - 5}
          fill="none" stroke={colors.border} strokeWidth={0.5} opacity={0.3}
        />
        {/* Label */}
        <text
          x={node.x} y={node.y + (node.type === 'fact' || node.type === 'rule' ? -4 : 0)}
          textAnchor="middle" dominantBaseline="central"
          fontSize={node.type === 'atom' || node.type === 'var' ? 11 : 12}
          fontWeight={node.type === 'rule' || node.type === 'fact' ? 600 : 400}
          fontFamily="'JetBrains Mono', monospace"
          fill={isEdgeHover ? '#4ade80' : colors.text}
        >
          {label}
        </text>
        {/* Arity */}
        {(node.type === 'fact' || node.type === 'rule') && (
          <text x={node.x} y={node.y + 9}
            textAnchor="middle" dominantBaseline="central"
            fontSize={9} fontFamily="'DM Sans', sans-serif"
            fill={colors.border} opacity={0.8}
          >
            /{node.arity ?? 0}
          </text>
        )}
        {/* Type badge */}
        <text x={node.x} y={node.y + r + 13}
          textAnchor="middle" fontSize={8} letterSpacing={1}
          fontFamily="'DM Sans', sans-serif"
          fill={isEdgeHover ? '#4ade80' : colors.border} opacity={0.7}
        >
          {colors.label}
        </text>
      </g>
    );
  };

  return (
    <svg
      ref={svgRef}
      width={width} height={height}
      onMouseDown={onPointerDown}
      onMouseMove={onPointerMove}
      onMouseUp={onPointerUp}
      onMouseLeave={onPointerUp}
      onTouchStart={onPointerDown}
      onTouchMove={onPointerMove}
      onTouchEnd={onPointerUp}
      style={{ userSelect: 'none', touchAction: 'none', display: 'block' }}
    >
      <defs>
        <marker id="arrow-fact" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#4a5568" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <marker id="arrow-rule" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="#639922" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
        <marker id="arrow-ghost" viewBox="0 0 10 10" refX="8" refY="5" markerWidth={6} markerHeight={6} orient="auto-start-reverse">
          <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </marker>
      </defs>

      {/* Grid */}
      <pattern id="grid" width={30} height={30} patternUnits="userSpaceOnUse">
        <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={0.5} />
      </pattern>
      <rect width={width} height={height} fill="url(#grid)" />

      {/* Edges */}
      <g>{edges.map(renderEdge)}</g>

      {/* Ghost edge while rewiring */}
      {renderGhostEdge()}

      {/* Nodes */}
      <g>{nodesRef.current.map(renderNode)}</g>

      {/* Rewiring hint */}
      {dragState.current?.kind === 'edge-end' && dragState.current.moved && (
        <text
          x={width / 2} y={height - 12}
          textAnchor="middle" fontSize={11}
          fontFamily="'DM Sans', sans-serif"
          fill={dragState.current.hoverNodeId ? '#4ade80' : '#ff6b6b'}
          opacity={0.8}
        >
          {dragState.current.hoverNodeId ? 'Release to rewire →' : 'Drag to a node to rewire'}
        </text>
      )}
    </svg>
  );
}
