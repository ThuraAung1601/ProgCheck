import React, { useState, useCallback } from 'react';
import { parseEngineOutput, mergeTraces, annotateWithSourceLines, extractSourceClauses } from '../utils/engineOutputParser';

const PLACEHOLDER = `Paste your PROLOG CODE CHECKER output here.

Example:
Query: max(7, 2, 7)
Execution Trace:
Depth 1: max(7,2,7)
Proof Tree:
Goal: max(7,2,7) :- 7>=2,!
    Builtin: 7>=2
    Builtin: !
---

Query: max(3, 5, 5)
Execution Trace:
Depth 1: max(3,5,5)
Proof Tree:
Goal: max(3,5,5) (fact)
---`;

export default function TraceImporter({ code, onTraceLoaded, onCancel }) {
  const [text, setText]           = useState('');
  const [parsed, setParsed]       = useState(null);
  const [error, setError]         = useState('');
  const [selIdx, setSelIdx]       = useState('all');

  const handleParse = useCallback(() => {
    setError('');
    try {
      const result = parseEngineOutput(text, code);
      if (!result.queries.length) { setError('No queries found in the pasted text.'); return; }
      const sourceClauses = extractSourceClauses(code);
      const annotated = {
        ...result,
        queries: result.queries.map(q => ({
          ...q,
          trace: annotateWithSourceLines(q.trace, code, sourceClauses),
        })),
      };
      setParsed(annotated);
    } catch (e) { setError(`Parse error: ${e.message}`); }
  }, [text, code]);

  const handleLoad = useCallback(() => {
    if (!parsed) return;
    const trace = selIdx === 'all'
      ? mergeTraces(parsed.queries)
      : parsed.queries[Number(selIdx)]?.trace || [];
    onTraceLoaded(trace);
  }, [parsed, selIdx, onTraceLoaded]);

  const currentTrace = !parsed ? [] : selIdx === 'all'
    ? mergeTraces(parsed.queries)
    : parsed.queries[Number(selIdx)]?.trace || [];

  return (
    <div className="fixed inset-0 z-[1000] bg-black/75 flex items-center justify-center backdrop-blur-sm">
      <div className="bg-bg-secondary border border-white/10 rounded-xl w-[680px] max-h-[88vh] flex flex-col shadow-[0_24px_60px_rgba(0,0,0,0.7)] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.07] flex-shrink-0">
          <span className="font-sans text-[15px] font-semibold text-txt-primary tracking-tight">↯ Import Execution Trace</span>
          <button onClick={onCancel} className="bg-transparent border-none text-txt-tertiary text-sm cursor-pointer px-1.5 py-0.5 rounded hover:text-txt-primary">✕</button>
        </div>

        {/* Instruction */}
        <div className="px-5 py-2.5 text-xs text-txt-tertiary border-b border-white/[0.05] flex-shrink-0 leading-relaxed">
          Paste the full output from your <span className="font-mono text-[11px] text-[#85B7EB]">PROLOG CODE CHECKER</span> below.
          Cut-prevented clauses are <span className="text-indigo-400 font-medium">automatically inferred</span> from
          the Prolog source in the editor — make sure your code is loaded on the left first.
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col [scrollbar-width:thin]">

          {/* Textarea */}
          <textarea
            className="mx-5 mt-3 p-3 bg-bg-primary border border-white/10 rounded-lg text-[#c9d1d9] font-mono text-[11.5px] leading-relaxed resize-y outline-none flex-shrink-0"
            style={{ minHeight: 120, maxHeight: 340 }}
            value={text}
            onChange={e => { setText(e.target.value); setParsed(null); setError(''); }}
            placeholder={PLACEHOLDER} spellCheck={false} />

          {/* Error */}
          {error && (
            <div className="mx-5 mt-2 px-3 py-1.5 bg-red-950/40 border border-red-700/30 rounded-md text-[11px] text-red-300 font-sans">
              {error}
            </div>
          )}

          {/* Parse button */}
          <div className="flex items-center gap-2.5 px-5 pt-2.5 flex-shrink-0">
            <button onClick={handleParse} disabled={!text.trim()}
              className="font-sans text-xs font-medium px-4 py-1.5 bg-accent-blue/15 border border-accent-blue/40 rounded-md text-[#85B7EB] cursor-pointer disabled:opacity-40 hover:bg-accent-blue/20 transition-colors">
              Parse output
            </button>
            {parsed && (
              <span className="text-[11px] text-green-400 font-sans">
                ✓ Found {parsed.queries.length} quer{parsed.queries.length !== 1 ? 'ies' : 'y'}
              </span>
            )}
          </div>

          {/* Query selector */}
          {parsed?.queries.length > 0 && (
            <div className="mx-5 mt-2.5 border border-white/[0.07] rounded-lg overflow-hidden flex-shrink-0">
              <div className="px-3 py-1.5 bg-white/[0.03] border-b border-white/[0.05] text-[10px] uppercase tracking-[0.06em] text-txt-tertiary font-sans">
                Choose which query to visualize
              </div>
              <div className="py-1">
                {/* All merged */}
                <label className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs font-sans transition-colors
                  ${selIdx==='all' ? 'bg-accent-blue/08 text-[#85B7EB]' : 'text-txt-secondary hover:bg-white/[0.03]'}`}>
                  <input type="radio" name="q" value="all" checked={selIdx==='all'} onChange={() => setSelIdx('all')} className="accent-accent-blue" />
                  All queries merged ({mergeTraces(parsed.queries).length} nodes)
                </label>
                {parsed.queries.map((q, i) => (
                  <label key={i} className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs font-sans transition-colors
                    ${selIdx===i ? 'bg-accent-blue/08 text-[#85B7EB]' : 'text-txt-secondary hover:bg-white/[0.03]'}`}>
                    <input type="radio" name="q" value={i} checked={selIdx===i} onChange={() => setSelIdx(i)} className="accent-accent-blue" />
                    <span className="font-mono text-[11px]">{q.query}</span>
                    <span className="ml-auto text-[10px] text-txt-tertiary">{q.trace.length} nodes</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          {parsed && currentTrace.length > 0 && <TracePreview trace={currentTrace} />}

          <div className="h-3 flex-shrink-0" />
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-white/[0.07] flex-shrink-0">
          <button onClick={onCancel}
            className="font-sans text-xs px-4 py-1.5 bg-transparent border border-white/10 rounded-md text-txt-tertiary cursor-pointer hover:text-txt-primary transition-colors">
            Cancel
          </button>
          <button onClick={handleLoad} disabled={!parsed}
            className="font-sans text-xs font-semibold px-5 py-1.5 bg-green-900/20 border border-green-700/40 rounded-md text-green-300 cursor-pointer disabled:opacity-40 hover:bg-green-900/30 transition-colors">
            ↯ Visualize
          </button>
        </div>
      </div>
    </div>
  );
}

function TracePreview({ trace }) {
  const counts = {
    success: trace.filter(n => n.result==='success' && !n.cutPrevented).length,
    fail:    trace.filter(n => n.result==='fail' && !n.cutPrevented).length,
    cut:     trace.filter(n => n.result==='cut').length,
    ghost:   trace.filter(n => n.cutPrevented).length,
  };
  return (
    <div className="mx-5 mt-2 border border-white/[0.07] rounded-lg overflow-hidden flex-shrink-0">
      <div className="px-2.5 py-1 bg-white/[0.03] border-b border-white/[0.05] text-[10px] uppercase tracking-[0.06em] text-txt-tertiary font-sans">
        Preview
      </div>
      <div className="flex gap-3.5 px-2.5 py-1.5 border-b border-white/[0.04]">
        {[['success','#22c55e'],['fail','#ef4444'],['cut','#f59e0b'],['cut-prevented','#6366f1']]
          .map(([label,color]) => counts[label.replace('-prevented','ghost')] > 0 && (
            <span key={label} style={{ color }} className="text-[11px] font-sans">
              {counts[label.replace('-prevented','ghost')]} {label}
            </span>
          ))}
      </div>
      <div className="py-1">
        {trace.slice(0,14).map(n => {
          const color = n.cutPrevented ? '#6366f1' : n.result==='success' ? '#22c55e' : n.result==='fail' ? '#ef4444' : n.result==='cut' ? '#f59e0b' : '#4a5568';
          return (
            <div key={n.id} className="flex items-baseline gap-1.5 py-0.5"
              style={{ paddingLeft: 10 + n.depth*12, borderLeft:`2px solid ${color}`, opacity: n.cutPrevented?0.55:1 }}>
              <span style={{ color }} className="font-mono text-[10px]">
                {n.cutPrevented?'✂':n.result==='cut'?'!':n.result==='success'?'✓':'✗'}
              </span>
              <span className="font-mono text-[10px] text-[#94a3b8]">
                {n.goal.length > 42 ? n.goal.slice(0,41)+'…' : n.goal}
              </span>
            </div>
          );
        })}
        {trace.length > 14 && (
          <div className="text-[10px] text-txt-tertiary px-2.5 py-1 font-sans">… and {trace.length-14} more nodes</div>
        )}
      </div>
    </div>
  );
}
