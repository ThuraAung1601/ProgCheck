import React, { useState, useCallback, useEffect, useRef } from 'react';
import GlobalStyle from './styles/GlobalStyle';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import CodeEditor from './components/CodeEditor';
import GraphCanvas from './components/GraphCanvas';
import NodeInfo from './components/NodeInfo';
import BacktrackTree from './components/BacktrackTree';
import Modal from './components/Modal';
import DiffViewer from './components/DiffViewer';
import { parseProlog, clausesToGraph } from './utils/prologParser';
import { rewireEdge } from './utils/rewire';
import { simulateProlog } from './utils/prologEngineSimulator';
import { extractSourceClauses } from './utils/engineOutputParser';

// ── API ───────────────────────────────────────────────────────────────────
// const API_BASE = process.env.REACT_APP_API_BASE || '';
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

async function apiFetch(path, body) {
  const res = await fetch(API_BASE + path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
  return res.json();
}

const normalizeQuery = q => (q || '').trim().replace(/\.$/, '');

// ── Reusable UI atoms ─────────────────────────────────────────────────────
function Btn({ onClick, children, disabled, variant = 'default', title }) {
  const base = 'font-sans text-[11px] px-3 py-1 rounded border cursor-pointer transition-all whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed';
  const styles = {
    default: 'bg-bg-elevated border-border-accent text-txt-secondary hover:text-txt-primary hover:border-white/20',
    primary: 'bg-accent-blue/15 border-accent-blue/50 text-[#85B7EB] hover:bg-accent-blue/25',
    success: 'bg-green-900/20 border-green-700/40 text-green-300 hover:bg-green-900/30',
    warning: 'bg-amber-900/20 border-amber-700/40 text-amber-300 hover:bg-amber-900/30',
    danger: 'bg-red-900/20  border-red-700/40  text-red-300  hover:bg-red-900/30',
  };
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={`${base} ${styles[variant] || styles.default}`}>
      {children}
    </button>
  );
}

function FileSelect({ value, onChange, options, placeholder, id, name }) {
  return (
    <select id={id} name={name} value={value} onChange={e => onChange(e.target.value)}
      className="bg-bg-elevated border border-border-accent text-txt-secondary text-[11px] rounded px-2 py-1 font-mono focus:outline-none focus:border-accent-blue max-w-[160px]">
      <option value="">{placeholder}</option>
      {options.map(o => <option key={o} value={o}>{o.split('/').pop()}</option>)}
    </select>
  );
}

function SaveInput({ value, onChange, onSubmit }) {
  return (
    <input
      id="save-filename"
      name="save-filename"
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="factorial.pl"
      className="w-full bg-bg-elevated border border-border-accent text-txt-primary text-xs px-2 py-1 rounded focus:outline-none focus:border-accent-blue"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          onSubmit();
        }
      }}
    />
  );
}

// ── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  // Authentication & screen routing
  const [screen, setScreen] = useState('landing');
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);

  // Render state
  const [modal, setModal] = useState(null);

  // ProgCheck state
  const [problems, setProblems] = useState([]);
  const [students, setStudents] = useState([]);
  const [tests, setTests] = useState([]);
  const [selProblem, setSelProblem] = useState('');
  const [selStudent, setSelStudent] = useState('');
  const [selTest, setSelTest] = useState('');
  const [problemText, setProblemText] = useState('');
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState({ msg: 'Ready', kind: 'idle' });
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [canVisualize, setCanVisualize] = useState(false);
  const [isNewFile, setIsNewFile] = useState(false);
  const [saveFilename, setSaveFilename] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Editor / graph state
  const [code, setCode] = useState('');
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selNode, setSelNode] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });
  const [hlLines, setHlLines] = useState([]);
  const posRef = useRef({});
  const parseTimer = useRef(null);
  // Use a callback ref so the ResizeObserver reattaches whenever
  // the graph tab mounts (the div only exists when rightTab === 'graph')
  // Use a ref to track the ResizeObserver instance so we can clean it up properly
  const obsRef = useRef(null);
  const resizeTimerRef = useRef(null);

  const canvasRef = useCallback((el) => {
    // Clean up old observer
    if (obsRef.current) {
      obsRef.current.disconnect();
      obsRef.current = null;
    }
    if (resizeTimerRef.current) {
      clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = null;
    }

    // Set up new observer if element exists
    if (!el) return;
    
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      // Debounce resize updates to avoid excessive state changes
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        if (width > 10 && height > 10) setCanvasSize({ width, height });
      }, 50);
    });
    obs.observe(el);
    obsRef.current = obs;
  }, []);

  // Clean up ResizeObserver on unmount
  useEffect(() => {
    return () => {
      if (obsRef.current) {
        obsRef.current.disconnect();
      }
      if (resizeTimerRef.current) {
        clearTimeout(resizeTimerRef.current);
      }
    };
  }, []);

  // Right panel tab: 'problem' | 'feedback' | 'graph' | 'trace'
  // 'trace' is only selectable after visualize has been run
  const [rightTab, setRightTab] = useState('problem');
  const [traceData, setTraceData] = useState(null);   // null = trace not yet generated

  const setMsg = useCallback((msg, kind = 'idle') => setStatus({ msg, kind }), []);

  const handleUserUpdate = useCallback((updatedUser) => {
    setUser(updatedUser);
  }, []);

  const fetchOptions = useCallback(async () => {
    try {
      const d = await apiFetch('/api/options');
      setProblems(d.problems || []);
      setStudents(d.students || []);
      setTests(d.tests || []);
    } catch (e) {
      setMsg(`Options load failed: ${e.message}`, 'error');
    }
  }, [setMsg]);

  // Load options on mount
  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  // Parse code → graph (debounced)
  useEffect(() => {
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => {
      try {
        const clauses = parseProlog(code);
        const newGraph = clausesToGraph(clauses, posRef.current);
        setGraph(newGraph);
        // Clear selected node if it no longer exists in the new graph
        setSelNode(prev => {
          if (!prev) return null;
          const nodeExists = newGraph.nodes.some(n => n.id === prev.id);
          return nodeExists ? prev : null;
        });
      } catch { /* ignore while typing */ }
    }, 350);
    return () => clearTimeout(parseTimer.current);
  }, [code]);

  // ── Graph interaction ─────────────────────────────────────────────────
  const onNodeDragEnd = useCallback((positions) => {
    const posMap = Object.fromEntries(positions.map(p => [p.id, { x: p.x, y: p.y }]));
    posRef.current = { ...posRef.current, ...posMap };
    
    // Update graph positions only (don't reorder code here - avoid circular updates)
    setGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => posMap[n.id] ? { ...n, ...posMap[n.id] } : n)
    }));
  }, []);

  const onNodeClick = useCallback((node) => setSelNode(prev => prev?.id === node.id ? null : node), []);

  const onEdgeRewire = useCallback(({ edge, newNodeId, newNodeLabel }) => {
    try {
      const updated = rewireEdge(code, edge, newNodeId, newNodeLabel);
      if (updated !== code) { setCode(updated); setMsg(`Rewired: ${edge.label} → ${newNodeLabel}`, 'ok'); }
    } catch (e) { setMsg(`Rewire error: ${e.message}`, 'error'); }
  }, [code, setMsg]);

  const onHighlightLine = useCallback((lineStart, lineEnd) => {
    setHlLines(lineStart >= 0
      ? Array.from({ length: (lineEnd ?? lineStart) - lineStart + 1 }, (_, i) => lineStart + i)
      : []);
  }, []);

  // ── ProgCheck actions ─────────────────────────────────────────────────
  const withLoading = useCallback(async (fn) => {
    setLoading(true);
    try { await fn(); }
    catch (e) { setFeedback(`Error: ${e.message}`); setMsg(e.message, 'error'); }
    finally { setLoading(false); }
  }, [setMsg]);

  const buildPayload = useCallback(() => ({
    problem_file: selProblem,
    student_file: selStudent,
    student_code: code,
  }), [selProblem, selStudent, code]);

  const loadFiles = () => withLoading(async () => {
    if (!selProblem || !selStudent) { setMsg('Select a problem and student file first', 'error'); return; }
    const d = await apiFetch('/api/load', { problem_file: selProblem, student_file: selStudent, student_code: '' });
    setProblemText(d.problem_text || '');
    setCode(d.student_code || '');
    posRef.current = {};
    setTraceData(null);
    setRightTab('problem');
    setFeedback('');
    setLastResult(null);
    setSelNode(null);
    setHlLines([]);
    setMsg('Loaded', 'ok');
  });

  const saveCode = useCallback(() => withLoading(async () => {
    let filename = selStudent;

    const doSave = async (filename) => {
      await apiFetch('/api/apply-fix', {
        student_file: filename,
        corrected_code: code,
        accept: true,
      });

      await fetchOptions();

      setSelStudent(filename);
      setIsNewFile(false);

      setMsg('Saved', 'ok');
    };

    if (isNewFile || !filename) {
      setModal({
        type: 'save',
        resolve: (name) => {
          if (!name) {
            setMsg('Save cancelled', 'error');
            return;
          }

          if (!name.endsWith('.pl')) name += '.pl';

          doSave(name);
        }
      });
      return;
    }

    await apiFetch('/api/apply-fix', {
      student_file: filename,
      corrected_code: code,
      accept: true,
    });

    setSelStudent(filename);
    setIsNewFile(false);

    setMsg('Saved', 'ok');
  }), [selStudent, code, isNewFile, withLoading, fetchOptions, setMsg]);

  const createNewFile = useCallback(() => {
    setSelProblem('');
    setSelStudent('');
    setSelTest('');

    setCode('% New Prolog File');
    setProblemText('');
    setQuery('');
    setFeedback('');
    setLastResult(null);

    setGraph({ nodes: [], edges: [] });
    setTraceData(null);

    posRef.current = {};

    setRightTab('graph');

    setIsNewFile(true);

    setMsg('New file created', 'ok');
  }, [setMsg]);

  const checkSyntax = () => withLoading(async () => {
    const r = await apiFetch('/api/syntax-check', buildPayload());
    setFeedback(r.feedback || 'Syntax OK.');
    setRightTab('feedback');
    setMsg(r.ok ? 'Syntax OK' : 'Syntax error found', r.ok ? 'ok' : 'error');
  });

  const runQuery = () => withLoading(async () => {
    const q = normalizeQuery(query);
    if (!q) { setMsg('Enter a query first', 'error'); return; }
    const r = await apiFetch('/api/query-run', { ...buildPayload(), query: q });
    setLastResult(r);
    setCanVisualize(!!r.ok && !r.has_logic_error);
    if (!r.ok) { setFeedback(r.feedback || 'Query failed.'); setRightTab('feedback'); return; }
    const verdict = r.has_logic_error ? (r.shapiro_mode || 'unknown') : 'correct';
    setFeedback([
      `Query: ${r.query}`,
      `Status: ${verdict}`,
      '',
      'Execution Trace:', r.trace || '',
      '',
      'Proof Tree:', r.proof_tree || '',
      '',
      'Debug Summary:', r.debug_summary || '',
    ].join('\n'));
    setRightTab('feedback');
    setMsg(`Query done — ${verdict}`, r.has_logic_error ? 'error' : 'ok');
  });

  const runLlm = () => withLoading(async () => {
    const q = normalizeQuery(query);
    if (!q) { setMsg('Enter a query first', 'error'); return; }
    const r = await apiFetch('/api/llm-feedback', { ...buildPayload(), query: q });
    setLastResult(r);
    setFeedback([
      'LLM Feedback:', r.feedback || '',
      '',
      'Execution Trace:', r.trace || '',
      '',
      'Proof Tree:', r.proof_tree || '',
      '',
      'Debug Summary:', r.debug_summary || '',
    ].join('\n'));
    setRightTab('feedback');
    setMsg('LLM feedback ready', 'ok');
  });

  const runDiagnosis = () => withLoading(async () => {
    const r = await apiFetch('/api/full-diagnosis', { ...buildPayload(), test_cases_file: selTest || null });
    setFeedback(r.log || 'Diagnosis complete.');
    setRightTab('feedback');
    if (r.changed && r.corrected_code) {
      setModal({
        type: 'confirm',
        diff: r.diff || '',
        onConfirm: () => {
          setCode(r.corrected_code);
          posRef.current = {};
          setMsg('Fix applied', 'ok');
        }
      });
    }
    setMsg('Diagnosis complete', 'ok');
  });

  const visualize = useCallback(() => {
    if (!code.trim()) { setMsg('Load or write some code first', 'error'); return; }
    const q = normalizeQuery(query);
    if (!q) { setMsg('Enter a query to visualize', 'error'); return; }
    try {
      const sourceClauses = extractSourceClauses(code);
      const trace = simulateProlog(q, sourceClauses);
      setTraceData(trace);
      setRightTab('trace');
      setMsg(`Visualizing ${trace.length} nodes`, 'ok');
    } catch (e) {
      setMsg(`Visualize error: ${e.message}`, 'error');
    }
  }, [code, query, setMsg]);

  // ── Render ────────────────────────────────────────────────────────────
  const statusColor = status.kind === 'error' ? 'text-red-400'
    : status.kind === 'ok' ? 'text-green-400'
      : 'text-txt-tertiary';

  // Tab definitions for right panel
  // Each tab: [id, label, disabled]
  const rightTabs = [
    ['problem', '📋 Problem', false],
    ['feedback', '💬 Feedback', false],
    ['graph', '⬡ Graph', false],
    ['trace', '↯ Trace', !traceData],   // disabled until Visualize runs
  ];

  // Legend items for the graph tab
  const graphLegend = [
    ['F', '#85B7EB', 'fact'], ['R', '#97C459', 'rule'],
    ['A', '#EF9F27', 'atom'], ['V', '#ED93B1', 'var'],
  ];
  const traceLegend = [
    ['✓', '#22c55e', 'success'], ['✗', '#ef4444', 'fail'],
    ['!', '#f59e0b', 'cut'], ['✂', '#6366f1', 'cut-prevented'],
  ];

  // Prolog Checker UI Component
  const PrologCheckerUI = () => (
    <div className="flex flex-col h-full w-full overflow-hidden bg-bg-primary text-txt-primary font-sans">

      {/* ── Top bar ── */}
      <header className="flex items-center gap-2 px-3 h-[46px] bg-bg-secondary border-b border-border-subtle flex-shrink-0 z-10 overflow-hidden">

        {/* Brand */}
        <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
          <span className="text-xl font-bold text-accent-blue leading-none">⊢</span>
          <span className="font-mono text-[14px] font-semibold tracking-tight">
            Prog<span className="text-accent-blue">Check</span>
          </span>
        </div>

        {/* File selectors */}
        <FileSelect value={selProblem} onChange={setSelProblem} options={problems} placeholder="Problem…" id="problem-select" name="problem-select" />
        <FileSelect value={selStudent} onChange={setSelStudent} options={students} placeholder="Student code…" id="student-select" name="student-select" />
        <FileSelect value={selTest} onChange={setSelTest} options={tests} placeholder="Test file…" id="test-select" name="test-select" />
        <Btn onClick={loadFiles} variant="primary" disabled={loading}>Load</Btn>
        <Btn onClick={saveCode} disabled={loading || !selProblem || !code}>Save</Btn>
        <Btn onClick={createNewFile} variant="success">New</Btn>

        <div className="w-px h-5 bg-border-accent mx-0.5 flex-shrink-0" />

        {/* Query + actions */}
        <input
          id="query-input"
          name="query-input"
          value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runQuery()}
          placeholder="e.g. max(3,5,X)"
          className="bg-bg-elevated border border-border-accent text-txt-primary text-[11px] font-mono rounded px-2 py-1 w-40 focus:outline-none focus:border-accent-blue flex-shrink-0"
        />
        <Btn onClick={checkSyntax} disabled={loading} title="Grammar-based syntax check">Syntax</Btn>
        <Btn onClick={runQuery} disabled={loading} variant="primary" title="Run query, get proof tree">{loading ? '…' : 'Run'}</Btn>
        <Btn onClick={visualize} disabled={!canVisualize} variant="success" title={!canVisualize ? `Cannot visualize: run a successful query first` : "Parse proof tree into backtracking visualizer"}>Visualize</Btn>
        <Btn onClick={runLlm} disabled={loading} variant="warning" title="LLM natural-language feedback">LLM</Btn>
        <Btn onClick={runDiagnosis} disabled={loading} variant="danger" title="Full diagnosis with optional auto-fix">Diagnose</Btn>

        {/* Shapiro mode badge — hidden when sidebar is expanded to prevent header overflow */}
        {lastResult && sidebarCollapsed && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded border flex-shrink-0
            ${lastResult.has_logic_error
              ? 'text-red-300 border-red-700/40 bg-red-900/15'
              : 'text-green-300 border-green-700/40 bg-green-900/15'}`}>
            {lastResult.has_logic_error ? (lastResult.shapiro_mode || 'unknown') : 'correct'}
          </span>
        )}
      </header>

      {/* ── Main layout: left = editor, right = tabs ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">

        {/* ── LEFT: full-height code editor ── */}
        <div className="flex flex-col border-r border-border-subtle flex-shrink-0" style={{ width: 420 }}>
          <div className="flex items-center justify-between px-3 h-7 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-txt-tertiary">Prolog Source</span>
            <span className="text-[10px] text-txt-tertiary italic">
              {rightTab === 'trace'
                ? 'active clause highlighted'
                : 'drag nodes · drag edge ● to rewire'}
            </span>
          </div>
          {/* CodeEditor fills all remaining height */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <CodeEditor
              value={code}
              onChange={setCode}
              highlightLines={
                rightTab === 'trace'
                  ? hlLines
                  : selNode?.lineStart != null ? [selNode.lineStart] : []
              }
            />
          </div>
        </div>

        {/* ── RIGHT: tabbed panel ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Tab bar */}
          <div className="flex items-center h-8 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
            {rightTabs.map(([id, label, disabled]) => (
              <button
                key={id}
                onClick={() => !disabled && setRightTab(id)}
                disabled={disabled}
                title={disabled ? 'Run a query then click Visualize to enable' : undefined}
                className={`h-full px-4 text-[11px] border-none border-r border-border-subtle transition-all whitespace-nowrap
                  ${disabled
                    ? 'text-txt-tertiary opacity-35 cursor-not-allowed'
                    : rightTab === id
                      ? 'bg-bg-primary text-txt-primary font-medium cursor-pointer'
                      : 'bg-transparent text-txt-tertiary hover:bg-bg-elevated hover:text-txt-secondary cursor-pointer'
                  }`}>
                {label}
                {id === 'trace' && traceData && (
                  <span className="ml-1 text-[9px] text-indigo-400">●</span>
                )}
              </button>
            ))}

            {/* Legend — only shown for graph / trace tabs */}
            {(rightTab === 'graph' || rightTab === 'trace') && (
              <div className="flex gap-2 ml-auto px-3">
                {(rightTab === 'graph' ? graphLegend : traceLegend).map(([sym, color, tip]) => (
                  <span key={sym} style={{ color }} className="text-[10px] font-mono cursor-default" title={tip}>{sym}</span>
                ))}
              </div>
            )}
          </div>

          {/* ── Tab content ── */}

          {/* Problem */}
          {rightTab === 'problem' && (
            <div className="flex-1 overflow-auto min-h-0 p-4">
              <pre className="font-mono text-[12px] leading-relaxed text-txt-secondary whitespace-pre-wrap">
                {problemText || 'Load a problem file to see the question here.'}
              </pre>
            </div>
          )}

          {/* Feedback */}
          {rightTab === 'feedback' && (
            <div className="flex-1 overflow-auto min-h-0 p-4">
              <pre className="font-mono text-[12px] leading-relaxed text-txt-secondary whitespace-pre-wrap">
                {feedback || 'Run a query or check syntax to see output here.'}
              </pre>
            </div>
          )}

          {/* Knowledge Graph */}
          {rightTab === 'graph' && (
            <div className="flex-1 relative overflow-hidden bg-bg-primary" ref={canvasRef}>
              {graph.nodes.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-txt-tertiary">
                  <span className="text-4xl opacity-20">⊢</span>
                  <p className="text-xs text-center leading-relaxed">
                    Load a file or type Prolog code<br />to see the knowledge graph
                  </p>
                </div>
              ) : (
                <GraphCanvas
                  nodes={graph.nodes} edges={graph.edges}
                  width={canvasSize.width} height={canvasSize.height}
                  selectedNodeId={selNode?.id}
                  onNodeClick={onNodeClick}
                  onNodeDragEnd={onNodeDragEnd}
                  onEdgeRewire={onEdgeRewire}
                />
              )}
              {selNode && (
                <NodeInfo node={selNode} edges={graph.edges} onClose={() => setSelNode(null)} />
              )}
            </div>
          )}

          {/* Backtracking Trace */}
          {rightTab === 'trace' && traceData && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <BacktrackTree trace={traceData} onHighlightLine={onHighlightLine} />
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className={`font-mono text-[11px] px-4 py-1 bg-bg-secondary border-t border-border-subtle flex-shrink-0 truncate ${statusColor}`}>
        {status.msg}
      </div>

      {/* ── Popup modal ── */}
      <Modal
        open={!!modal}
        wide={modal?.type === 'confirm' && !!modal?.diff}
        title={
          modal?.type === 'save' ? 'Save File' :
            modal?.type === 'confirm' ? 'Auto-correction available — apply fix?' : ''
        }
        onClose={() => setModal(null)}
        actions={
          modal?.type === 'save' ? (
            <>
              <button
                onClick={() => setModal(null)}
                className="text-xs px-3 py-1 border border-border-accent rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  modal.resolve(saveFilename);
                  setModal(null);
                  setSaveFilename('');
                }}
                className="text-xs px-3 py-1 bg-accent-blue/20 border border-accent-blue rounded text-[#85B7EB]"
              >
                Save
              </button>
            </>
          ) : modal?.type === 'confirm' ? (
            <>
              <button
                onClick={() => setModal(null)}
                className="text-xs px-3 py-1 border border-border-accent rounded"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  modal.onConfirm();
                  setModal(null);
                }}
                className="text-xs px-3 py-1 bg-green-900/20 border border-green-700 text-green-300 rounded"
              >
                Confirm
              </button>
            </>
          ) : null
        }
      >
        {modal?.type === 'save' ? (
          <SaveInput
            value={saveFilename}
            onChange={setSaveFilename}
            onSubmit={() => {
              modal.resolve(saveFilename);
              setModal(null);
              setSaveFilename('');
            }}
          />
        ) : modal?.type === 'confirm' ? (
          <DiffViewer diff={modal.diff} />
        ) : (
          <p>{modal?.message}</p>
        )}
      </Modal>
    </div>
  );

  // Main render with screen-based routing
  return (
    <>
      <GlobalStyle />
      {screen === 'landing' && (
        <LandingPage
          onStudentLogin={() => { setUserRole('student'); setScreen('login'); }}
          onTeacherLogin={() => { setUserRole('teacher'); setScreen('login'); }}
        />
      )}
      {screen === 'login' && (
        <LoginPage
          defaultRole={userRole}
          onLogin={(userData, role) => {
            setUser({ ...userData, role });
            setScreen('dashboard');
          }}
          onBack={() => setScreen('landing')}
        />
      )}
      {screen === 'dashboard' && user && (
        <Dashboard
          user={user}
          role={user.role}
          onLogout={() => {
            setUser(null);
            setUserRole(null);
            setScreen('landing');
          }}
          onUserUpdate={handleUserUpdate}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarChange={setSidebarCollapsed}
          mainContent={PrologCheckerUI()}
        />
      )}
    </>
  );
}
