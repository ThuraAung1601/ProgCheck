/**
 * Compute x,y positions for a top-down backtracking tree.
 * Uses Reingold-Tilford style — siblings don't overlap, parents centered over children.
 */

const NODE_W = 180;  // node width
const NODE_H = 72;   // node height
const H_GAP  = 20;   // horizontal gap between siblings
const V_GAP  = 60;   // vertical gap between levels

export function layoutTree(trace) {
  if (!trace || trace.length === 0) return {};

  // Build parent→children map
  const childrenOf = {};
  trace.forEach(n => { childrenOf[n.id] = []; });
  trace.forEach(n => { if (n.parentId) childrenOf[n.parentId]?.push(n.id); });

  const roots = trace.filter(n => !n.parentId).map(n => n.id);

  // Compute subtree widths bottom-up
  const subtreeW = {};
  function calcWidth(id) {
    const children = childrenOf[id] || [];
    if (children.length === 0) { subtreeW[id] = NODE_W; return NODE_W; }
    let total = children.reduce((sum, cid) => sum + calcWidth(cid), 0);
    total += H_GAP * (children.length - 1);
    subtreeW[id] = Math.max(total, NODE_W);
    return subtreeW[id];
  }
  roots.forEach(calcWidth);

  // Assign x,y top-down
  const positions = {};
  function assign(id, leftX, depth) {
    const y = depth * (NODE_H + V_GAP);
    const children = childrenOf[id] || [];
    const sw = subtreeW[id];
    const cx = leftX + sw / 2;
    positions[id] = { x: cx - NODE_W / 2, y, cx, cy: y + NODE_H / 2, w: NODE_W, h: NODE_H };

    let childLeft = leftX;
    children.forEach(cid => {
      assign(cid, childLeft, depth + 1);
      childLeft += subtreeW[cid] + H_GAP;
    });
  }

  let leftX = 0;
  roots.forEach(rid => {
    assign(rid, leftX, 0);
    leftX += subtreeW[rid] + H_GAP * 2;
  });

  // Compute total canvas size needed
  const xs = Object.values(positions).map(p => p.x + p.w);
  const ys = Object.values(positions).map(p => p.y + p.h);
  const totalW = Math.max(...xs) + 40;
  const totalH = Math.max(...ys) + 40;

  return { positions, totalW, totalH };
}
