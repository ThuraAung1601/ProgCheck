/**
 * Force-directed layout for the knowledge graph
 */

export function applyForceLayout(nodes, edges, width, height, iterations = 120) {
  if (nodes.length === 0) return nodes;

  const cx = width / 2;
  const cy = height / 2;

  // Initialize positions for nodes that don't have one
  nodes.forEach((node, i) => {
    if (node.x === null || node.y === null) {
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
      const r = Math.min(width, height) * 0.3;
      node.x = cx + r * Math.cos(angle) + (Math.random() - 0.5) * 40;
      node.y = cy + r * Math.sin(angle) + (Math.random() - 0.5) * 40;
    }
  });

  const k = Math.sqrt((width * height) / (nodes.length || 1)) * 0.9;
  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;
    const temp = 60 * cooling;

    // Repulsion
    const forces = Object.fromEntries(nodes.map(n => [n.id, { x: 0, y: 0 }]));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const rep = (k * k) / dist;
        const fx = (dx / dist) * rep;
        const fy = (dy / dist) * rep;
        forces[a.id].x += fx;
        forces[a.id].y += fy;
        forces[b.id].x -= fx;
        forces[b.id].y -= fy;
      }
    }

    // Attraction along edges
    edges.forEach(edge => {
      const a = nodeById[edge.from];
      const b = nodeById[edge.to];
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const idealDist = edge.style === 'dashed' ? k * 2.2 : k * 1.4;
      const att = (dist - idealDist) / dist * 0.3;
      const fx = dx * att;
      const fy = dy * att;
      forces[a.id].x += fx;
      forces[a.id].y += fy;
      forces[b.id].x -= fx;
      forces[b.id].y -= fy;
    });

    // Center gravity
    nodes.forEach(n => {
      forces[n.id].x += (cx - n.x) * 0.04;
      forces[n.id].y += (cy - n.y) * 0.04;
    });

    // Apply forces
    nodes.forEach(n => {
      if (n.pinned) return;
      const f = forces[n.id];
      const mag = Math.sqrt(f.x * f.x + f.y * f.y) || 1;
      const capped = Math.min(mag, temp);
      n.x += (f.x / mag) * capped;
      n.y += (f.y / mag) * capped;
      // Clamp to bounds
      n.x = Math.max(60, Math.min(width - 60, n.x));
      n.y = Math.max(60, Math.min(height - 60, n.y));
    });
  }

  return nodes;
}
