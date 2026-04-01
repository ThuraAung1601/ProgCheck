import React from 'react';

export default function NodeInfo({ node, edges, onClose }) {
  if (!node) return null;
  const incoming = edges.filter(e => e.to === node.id);
  const outgoing = edges.filter(e => e.from === node.id);
  const typeLabel = { fact:'Fact Predicate', rule:'Rule Predicate', atom:'Atom / Constant', var:'Variable' }[node.type] || 'Node';
  const typeDesc  = {
    fact: 'A ground fact asserting something is true in the knowledge base.',
    rule: `A derived rule — true when its body goals succeed. Arity: ${node.arity ?? 0}.`,
    atom: 'A constant atom or numeric value used as an argument.',
    var:  'A logic variable — can be unified with any value.',
  }[node.type] || '';

  return (
    <div className="absolute bottom-4 right-4 w-60 bg-bg-elevated border border-border-accent rounded-lg p-3.5 z-20 shadow-[0_8px_32px_rgba(0,0,0,0.5)] animate-slide-in">
      <button onClick={onClose} className="absolute top-2.5 right-2.5 bg-transparent border-none text-txt-tertiary text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-bg-surface hover:text-txt-primary">✕</button>
      <div className="text-[10px] font-semibold tracking-widest uppercase text-accent-blue mb-1">{typeLabel}</div>
      <div className="font-mono text-base font-semibold text-txt-primary mb-2">
        {node.label}{node.arity != null && node.type !== 'atom' && node.type !== 'var' ? `/${node.arity}` : ''}
      </div>
      <div className="text-xs text-txt-secondary leading-relaxed mb-2">{typeDesc}</div>
      {incoming.length > 0 && (
        <div className="border-t border-border-subtle pt-2 mt-2">
          <div className="text-[10px] uppercase tracking-[0.06em] text-txt-tertiary mb-1.5">Referenced by</div>
          {incoming.map(e => (
            <div key={e.id} className="flex items-center gap-1.5 mb-1">
              <span className="font-mono text-[10px] text-accent-amber bg-amber-900/10 border border-amber-700/25 px-1.5 py-px rounded flex-shrink-0">{e.label}</span>
              <span className="font-mono text-[11px] text-txt-secondary truncate">{e.from.replace(/^(pred:|atom:)/,'')}</span>
            </div>
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="border-t border-border-subtle pt-2 mt-2">
          <div className="text-[10px] uppercase tracking-[0.06em] text-txt-tertiary mb-1.5">{node.type==='rule'?'Calls / Args':'Arguments'}</div>
          {outgoing.map(e => (
            <div key={e.id} className="flex items-center gap-1.5 mb-1">
              <span className="font-mono text-[10px] text-accent-amber bg-amber-900/10 border border-amber-700/25 px-1.5 py-px rounded flex-shrink-0">{e.label}</span>
              <span className="font-mono text-[11px] text-txt-secondary truncate">{e.to.replace(/^(pred:|atom:)/,'')}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
