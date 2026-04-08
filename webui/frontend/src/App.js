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
      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(); }}
    />
  );
}

// ── Session helpers ───────────────────────────────────────────────────────────
function loadSession() {
  try {
    const user = JSON.parse(sessionStorage.getItem('user')) || null;
    const userRole = sessionStorage.getItem('userRole') || null;
    return { user, userRole };
  } catch {
    return { user: null, userRole: null };
  }
}

function saveSession(user, role) {
  try {
    sessionStorage.setItem('user', JSON.stringify(user));
    sessionStorage.setItem('userRole', role);
  } catch { /* ignore */ }
}

function clearSession() {
  try {
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('userRole');
  } catch { /* ignore */ }
}

export default function App() {
  // ── Auth & routing ────────────────────────────────────────────────────────
  const [screen, setScreen] = useState(() => {
    const seg = window.location.pathname.split('/').filter(Boolean)[0] || '';
    return ['login', 'signup', 'dashboard'].includes(seg) ? seg : 'landing';
  });

  const [user, setUser] = useState(() => loadSession().user);
  const [userRole, setUserRole] = useState(() => loadSession().userRole);
  const screenRef = React.useRef(screen);
  const [authMode, setAuthMode] = useState('login');

  // Modal
  const [modal, setModal] = useState(null);

  // Playground state
  const [myFiles, setMyFiles] = useState([]);
  const [problems, setProblems] = useState([]);
  const [currentFilename, setCurrentFilename] = useState('');
  const [isNewFile, setIsNewFile] = useState(true);
  const [saveFilename, setSaveFilename] = useState('');
  const [problemDraft, setProblemDraft] = useState('');
  const [selProblemPreset, setSelProblemPreset] = useState('');
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState({ msg: 'Ready', kind: 'idle' });
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [canVisualize, setCanVisualize] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Editor / graph state
  const [code, setCode] = useState('');
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selNode, setSelNode] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });
  const [hlLines, setHlLines] = useState([]);
  const posRef = useRef({});
  const parseTimer = useRef(null);
  const obsRef = useRef(null);
  const resizeTimerRef = useRef(null);

  // ── Test-case review modal state ──────────────────────────────────────────
  const [reviewTcs, setReviewTcs] = useState([]);
  const [newTcInput, setNewTcInput] = useState('');
  const [newTcExpected, setNewTcExpected] = useState('true');

  useEffect(() => {
    if (modal?.type === 'testcase-review') {
      setReviewTcs(modal.testCases || []);
      setNewTcInput('');
      setNewTcExpected('true');
    }
  }, [modal?.type]);

  const addReviewTc = () => {
    const q = newTcInput.trim().replace(/\.$/, '');
    if (!q) return;
    setReviewTcs(prev => [...prev, {
      testcase_id: Date.now(),
      input: q,
      expected_output: newTcExpected,
      _source: 'manual',
    }]);
    setNewTcInput('');
    setNewTcExpected('true');
  };

  // ── Teacher: add new problem ──────────────────────────────────────────────
  const [showAddProblem, setShowAddProblem] = useState(false);
  const [newProbTitle, setNewProbTitle] = useState('');
  const [newProbText, setNewProbText] = useState('');
  const [newProbTcs, setNewProbTcs] = useState([]);
  const [newProbTcInput, setNewProbTcInput] = useState('');
  const [newProbTcExpected, setNewProbTcExpected] = useState('true');
  const [savingProblem, setSavingProblem] = useState(false);
  const [probError, setProbError] = useState('');

  const addNewProbTc = () => {
    const q = newProbTcInput.trim().replace(/\.$/, '');
    if (!q) return;
    setNewProbTcs(prev => [...prev, { id: Date.now(), input: q, expected_output: newProbTcExpected }]);
    setNewProbTcInput('');
    setNewProbTcExpected('true');
  };

  const handleSaveProblem = async () => {
    if (!newProbTitle.trim() || !newProbText.trim()) return;
    setSavingProblem(true);
    setProbError('');
    try {
      const q = await apiFetch('/api/labs/9999/questions', {
        title: newProbTitle.trim(),
        problem: newProbText.trim(),
      });
      for (const tc of newProbTcs) {
        await apiFetch(`/api/labs/9999/questions/${q.question_id}/testcases`, {
          input: tc.input,
          expected_output: tc.expected_output,
        });
      }
      const updated = await apiFetch('/api/labs/9999/questions');
      setProblems(Array.isArray(updated) ? updated : []);
      setSelProblemPreset(String(q.question_id));
      setProblemDraft(q.problem);
      setNewProbTitle(''); setNewProbText(''); setNewProbTcs([]);
      setNewProbTcInput(''); setNewProbTcExpected('true');
      setShowAddProblem(false);
      setMsg('Problem saved to playground editor', 'ok');
    } catch (e) {
      setProbError(e.message);
    } finally {
      setSavingProblem(false);
    }
  };

  const canvasRef = useCallback((el) => {
    if (obsRef.current) { obsRef.current.disconnect(); obsRef.current = null; }
    if (resizeTimerRef.current) { clearTimeout(resizeTimerRef.current); resizeTimerRef.current = null; }
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => {
        if (width > 10 && height > 10) setCanvasSize({ width, height });
      }, 50);
    });
    obs.observe(el);
    obsRef.current = obs;
  }, []);

  useEffect(() => {
    return () => {
      if (obsRef.current) obsRef.current.disconnect();
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, []);

  const [rightTab, setRightTab] = useState('problem');
  const [traceData, setTraceData] = useState(null);

  const setMsg = useCallback((msg, kind = 'idle') => setStatus({ msg, kind }), []);
  const handleUserUpdate = useCallback((updatedUser) => {
    setUser(updatedUser);
    // Keep session in sync if user profile changes
    if (updatedUser) saveSession(updatedUser, updatedUser.role);
  }, []);

  // ── Routing ───────────────────────────────────────────────────────────────
  useEffect(() => { screenRef.current = screen; }, [screen]);

  useEffect(() => {
    const currentSeg = window.location.pathname.split('/').filter(Boolean)[0] || '';
    if (currentSeg !== screen) {
      window.history.pushState({ screen }, '', `/${screen === 'landing' ? '' : screen}`);
    }
  }, [screen]);

  useEffect(() => {
    const handler = () => {
      const seg = window.location.pathname.split('/').filter(Boolean)[0] || '';
      const next = ['login', 'signup', 'dashboard'].includes(seg) ? seg : 'landing';
      if (next !== screenRef.current) setScreen(next);
    };
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  useEffect(() => {
    const seg = window.location.pathname.split('/').filter(Boolean)[0] || '';
    if (seg === 'dashboard' && !user) {
      setScreen('login');
    }
  }, []);

  const fetchOptions = useCallback(async (currentUser) => {
    const u = currentUser !== undefined ? currentUser : null;
    if (u) {
      try {
        const d = await apiFetch(`/api/user-files?user_id=${encodeURIComponent(u.id)}&role=${encodeURIComponent(u.role)}`);
        setMyFiles(d.files || []);
      } catch (e) {
        setMsg(`Files load failed: ${e.message}`, 'error');
      }
    } else {
      try {
        const d = await apiFetch('/api/options');
        setMyFiles(d.students || []);
      } catch (e) {
        setMsg(`Options load failed: ${e.message}`, 'error');
      }
    }
    try {
      const questions = await apiFetch('/api/labs/9999/questions');
      setProblems(Array.isArray(questions) ? questions : []);
    } catch {
      setProblems([]);
    }
  }, [setMsg]);

  useEffect(() => { fetchOptions(user); }, [fetchOptions, user]);

  useEffect(() => {
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => {
      try {
        const clauses = parseProlog(code);
        const newGraph = clausesToGraph(clauses, posRef.current);
        setGraph(newGraph);
        setSelNode(prev => {
          if (!prev) return null;
          return newGraph.nodes.some(n => n.id === prev.id) ? prev : null;
        });
      } catch { /* ignore while typing */ }
    }, 350);
    return () => clearTimeout(parseTimer.current);
  }, [code]);

  const RoleSelect = () => (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', gap: 20 }}>
      <button onClick={() => {
        setUserRole('student');
        setAuthMode('signup');
        setScreen('signup');
      }}>
        I'm a Student
      </button>

      <button onClick={() => {
        setUserRole('teacher');
        setAuthMode('signup');
        setScreen('signup');
      }}>
        I'm a Teacher
      </button>
    </div>
  );

  const onNodeDragEnd = useCallback((positions) => {
    const posMap = Object.fromEntries(positions.map(p => [p.id, { x: p.x, y: p.y }]));
    posRef.current = { ...posRef.current, ...posMap };
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

  const withLoading = useCallback(async (fn) => {
    setLoading(true);
    try { await fn(); }
    catch (e) { setFeedback(`Error: ${e.message}`); setMsg(e.message, 'error'); }
    finally { setLoading(false); }
  }, [setMsg]);

  const buildPayload = useCallback(() => ({
    problem_id: Number(selProblemPreset),
    student_file: currentFilename,
    student_code: code,
  }), [currentFilename, code, selProblemPreset]);

  const loadFile = useCallback((filename) => withLoading(async () => {
    if (!filename) return;
    let d;
    if (user) {
      d = await apiFetch('/api/user-file/load', { user_id: user.id, role: user.role, filename });
    } else {
      d = await apiFetch('/api/load', { problem_id: 0, student_file: filename, student_code: '' });
    }
    setCode(d.student_code || '');
    setCurrentFilename(filename);
    setIsNewFile(false);
    posRef.current = {};
    setTraceData(null);
    setFeedback('');
    setLastResult(null);
    setSelNode(null);
    setHlLines([]);
    setMsg(`Loaded ${filename.split('/').pop()}`, 'ok');
  }), [withLoading, setMsg, user]);

  const saveCode = useCallback(() => withLoading(async () => {
    const doSave = async (filename) => {
      if (user) {
        const saved = await apiFetch('/api/user-file/save', {
          user_id: user.id, role: user.role, filename, code
        });
        // Use the server-normalized filename (e.g. it appends .pl)
        filename = saved.filename;
      } else {
        await apiFetch('/api/apply-fix', {
          student_file: filename, corrected_code: code, accept: true
        });
      }

      // Update dropdown immediately with the confirmed filename
      setMyFiles(prev =>
        prev.includes(filename) ? prev : [...prev, filename]
      );
      setCurrentFilename(filename);
      setIsNewFile(false);
      setMsg('Saved', 'ok');

      // Then sync with server in background (no timeout race)
      fetchOptions(user);
    };
    if (isNewFile || !currentFilename) {
      setModal({
        type: 'save',
        resolve: (name) => {
          if (!name) { setMsg('Save cancelled', 'error'); return; }
          if (!name.endsWith('.pl')) name += '.pl';
          doSave(name);
        }
      });
      return;
    }
    await doSave(currentFilename);
  }), [currentFilename, code, isNewFile, withLoading, fetchOptions, setMsg, user]);

  // ── Auto-save when user preference is enabled ─────────────────────────────
  const autoSaveTimer = useRef(null);
  useEffect(() => {
    if (!user?.auto_save || !user?.id || isNewFile || !currentFilename) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      apiFetch('/api/user-file/save', {
        user_id: user.id, role: user.role, filename: currentFilename, code,
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(autoSaveTimer.current);
  }, [code, user?.auto_save, user?.id, user?.role, currentFilename, isNewFile]);

  const createNewFile = useCallback(() => {
    setCurrentFilename('');
    setCode('% New Prolog file\n');
    setProblemDraft('');
    setSelProblemPreset('');
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
    setCanVisualize(!!r.ok && !r.has_logic_error && r.query_result !== 'false');
    if (!r.ok) { setFeedback(r.feedback || 'Query failed.'); setRightTab('feedback'); return; }
    const verdict = r.query_result === 'false' ? 'false'
      : r.has_logic_error ? (r.shapiro_mode || 'unknown') : 'correct';
    setFeedback([
      `Query: ${r.query}`, `Status: ${verdict}`, '',
      'Execution Trace:', r.trace || '', '',
      'Proof Tree:', r.proof_tree || '', '',
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
      'LLM Feedback:', r.feedback || '', '',
      'Execution Trace:', r.trace || '', '',
      'Proof Tree:', r.proof_tree || '', '',
      'Debug Summary:', r.debug_summary || '',
    ].join('\n'));
    setRightTab('feedback');
    setMsg('LLM feedback ready', 'ok');
  });

  const runDiagnosis = () => withLoading(async () => {
    setMsg('Generating test cases…', 'idle');
    let llmTcs = [];
    try {
      const gen = await apiFetch('/api/generate-diagnosis-testcases', {
        problem_id: Number(selProblemPreset),
        student_code: code,
      });
      if (gen.ok) llmTcs = gen.test_cases || [];
    } catch { /* non-fatal */ }

    const selectedProblem = problems.find(p => String(p.question_id) === String(selProblemPreset));
    const givenTcs = (selectedProblem?.test_cases || []).map(tc => ({ ...tc, _source: 'given' }));
    const seenInputs = new Set(givenTcs.map(tc => tc.input));
    const merged = [
      ...givenTcs,
      ...llmTcs
        .filter(tc => !seenInputs.has(tc.input))
        .map(tc => ({ ...tc, _source: 'llm' })),
    ];

    setModal({
      type: 'testcase-review',
      testCases: merged,
      onConfirm: async (confirmedTcs) => {
        setLoading(true);
        setModal(null);
        try {
          const r = await apiFetch('/api/full-diagnosis', {
            ...buildPayload(),
            test_cases_file: confirmedTcs.length ? confirmedTcs : null,
          });
          setFeedback(r.log || 'Diagnosis complete.');
          setRightTab('feedback');
          if (r.corrected_code) {
            setModal({
              type: 'confirm',
              diff: r.diff || '',
              onConfirm: () => {
                setCode(r.corrected_code);
                posRef.current = {};
                setMsg('Fix applied', 'ok');
              },
            });
          }
          setMsg('Diagnosis complete', 'ok');
        } catch (e) {
          setFeedback(`Error: ${e.message}`);
          setMsg(e.message, 'error');
        } finally {
          setLoading(false);
        }
      },
    });
    setMsg('Review test cases', 'idle');
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

  // ── Shared login handler ──────────────────────────────────────────────────
  const handleLogin = useCallback((userData, role) => {
    const u = { ...userData, role };
    saveSession(u, role);
    setUser(u);
    setUserRole(role);
    fetchOptions(u);
    setScreen('dashboard');
  }, [fetchOptions]);

  // ── Logout handler ────────────────────────────────────────────────────────
  const handleLogout = useCallback(() => {
    clearSession();
    setUser(null);
    setUserRole(null);
    fetchOptions(null);
    setScreen('landing');
  }, [fetchOptions]);

  const statusColor = status.kind === 'error' ? 'text-red-400'
    : status.kind === 'ok' ? 'text-green-400'
      : 'text-txt-tertiary';

  const rightTabs = [
    ['problem', '📋 Problem', false],
    ['feedback', '💬 Feedback', false],
    ['graph', '⬡ Graph', false],
    ['trace', '↯ Trace', !traceData],
  ];

  const graphLegend = [
    ['F', '#85B7EB', 'fact'], ['R', '#97C459', 'rule'],
    ['A', '#EF9F27', 'atom'], ['V', '#ED93B1', 'var'],
  ];
  const traceLegend = [
    ['✓', '#22c55e', 'success'], ['✗', '#ef4444', 'fail'],
    ['!', '#f59e0b', 'cut'], ['✂', '#6366f1', 'cut-prevented'],
  ];

  const PrologCheckerUI = () => (
    <div className="flex flex-col h-full w-full overflow-hidden bg-bg-primary text-txt-primary font-sans">

      <header className="flex items-center gap-2 px-3 h-[46px] bg-bg-secondary border-b border-border-subtle flex-shrink-0 z-10 overflow-hidden">
        <div className="flex items-center gap-1.5 mr-1 flex-shrink-0">
          <span className="text-xl font-bold text-accent-blue leading-none">⊢</span>
          <span className="font-mono text-[14px] font-semibold tracking-tight">
            Prog<span className="text-accent-blue">Check</span>
          </span>
        </div>

        <select
          value={currentFilename}
          onChange={e => e.target.value && loadFile(e.target.value)}
          className="bg-bg-elevated border border-border-accent text-txt-secondary text-[11px] rounded px-2 py-1 font-mono focus:outline-none focus:border-accent-blue max-w-[160px] flex-shrink-0"
        >
          <option value="">{isNewFile ? '— new file —' : currentFilename.split('/').pop() || 'Load file…'}</option>
          {myFiles.map(f => <option key={f} value={f}>{f.split('/').pop()}</option>)}
        </select>
        <Btn onClick={saveCode} disabled={loading || !code} variant="primary">Save</Btn>
        <Btn onClick={createNewFile} variant="success">New</Btn>

        <div className="w-px h-5 bg-border-accent mx-0.5 flex-shrink-0" />

        <input
          id="query-input"
          name="query-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && runQuery()}
          placeholder="e.g. max(3,5,X)"
          className="bg-bg-elevated border border-border-accent text-txt-primary text-[11px] font-mono rounded px-2 py-1 w-40 focus:outline-none focus:border-accent-blue flex-shrink-0"
        />
        <Btn onClick={checkSyntax} disabled={loading} title="Grammar-based syntax check">Syntax</Btn>
        <Btn onClick={runQuery} disabled={loading} variant="primary" title="Run query, get proof tree">{loading ? '…' : 'Run'}</Btn>
        <Btn onClick={visualize} disabled={!canVisualize} variant="success" title={!canVisualize ? 'Run a successful query first' : 'Visualize backtracking trace'}>Visualize</Btn>
        <Btn onClick={runLlm} disabled={loading} variant="warning" title="LLM natural-language feedback">LLM</Btn>
        <Btn onClick={runDiagnosis} disabled={loading} variant="danger" title="Full diagnosis with optional auto-fix">Diagnose</Btn>

        {lastResult && sidebarCollapsed && (
          <span className={`ml-auto text-[10px] px-2 py-0.5 rounded border flex-shrink-0
            ${lastResult.has_logic_error
              ? 'text-red-300 border-red-700/40 bg-red-900/15'
              : 'text-green-300 border-green-700/40 bg-green-900/15'}`}>
            {lastResult.has_logic_error ? (lastResult.shapiro_mode || 'unknown') : 'correct'}
          </span>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex flex-col border-r border-border-subtle flex-shrink-0" style={{ width: 420 }}>
          <div className="flex items-center justify-between px-3 h-7 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
            <span className="text-[10px] font-semibold tracking-widest uppercase text-txt-tertiary font-mono">
              {currentFilename ? currentFilename.split('/').pop() : 'untitled.pl'}
            </span>
            <span className="text-[10px] text-txt-tertiary italic">
              {rightTab === 'trace' ? 'active clause highlighted' : 'drag nodes · drag edge ● to rewire'}
            </span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <CodeEditor
              value={code}
              onChange={setCode}
              tabSize={user?.tab_size ?? 2}
              highlightLines={
                rightTab === 'trace' ? hlLines
                  : selNode?.lineStart != null ? [selNode.lineStart] : []
              }
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          <div className="flex items-center h-8 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
            {rightTabs.map(([id, label, disabled]) => (
              <button key={id} onClick={() => !disabled && setRightTab(id)} disabled={disabled}
                title={disabled ? 'Run a query then click Visualize to enable' : undefined}
                className={`h-full px-4 text-[11px] border-none border-r border-border-subtle transition-all whitespace-nowrap
                  ${disabled ? 'text-txt-tertiary opacity-35 cursor-not-allowed'
                    : rightTab === id ? 'bg-bg-primary text-txt-primary font-medium cursor-pointer'
                      : 'bg-transparent text-txt-tertiary hover:bg-bg-elevated hover:text-txt-secondary cursor-pointer'}`}>
                {label}
                {id === 'trace' && traceData && <span className="ml-1 text-[9px] text-indigo-400">●</span>}
              </button>
            ))}
            {(rightTab === 'graph' || rightTab === 'trace') && (
              <div className="flex gap-2 ml-auto px-3">
                {(rightTab === 'graph' ? graphLegend : traceLegend).map(([sym, color, tip]) => (
                  <span key={sym} style={{ color }} className="text-[10px] font-mono cursor-default" title={tip}>{sym}</span>
                ))}
              </div>
            )}
          </div>

          {rightTab === 'problem' && (
            <div className="flex-1 overflow-auto min-h-0 flex flex-col">
              <div className="flex items-center gap-2 px-3 py-2 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-txt-tertiary flex-shrink-0">Problem</span>
                <select
                  value={selProblemPreset}
                  onChange={e => {
                    const qid = e.target.value;
                    setSelProblemPreset(qid);
                    if (qid) {
                      const q = problems.find(p => String(p.question_id) === qid);
                      if (q) setProblemDraft(q.problem || q.description || '');
                    } else {
                      setProblemDraft('');
                    }
                    setShowAddProblem(false);
                  }}
                  className="bg-bg-elevated border border-border-accent text-txt-secondary text-[11px] rounded px-2 py-1 font-mono focus:outline-none focus:border-accent-blue flex-1 min-w-0"
                >
                  <option value="">— choose a problem —</option>
                  {problems.map(p => (
                    <option key={p.question_id} value={String(p.question_id)}>
                      {p.title || `Question ${p.question_id}`}
                    </option>
                  ))}
                </select>
                {selProblemPreset && (
                  <button onClick={() => { setProblemDraft(''); setSelProblemPreset(''); setShowAddProblem(false); }}
                    className="text-[10px] text-txt-tertiary hover:text-txt-secondary flex-shrink-0" title="Clear">
                    ✕
                  </button>
                )}
                {userRole === 'teacher' && (
                  <button
                    onClick={() => { setShowAddProblem(v => !v); setSelProblemPreset(''); setProblemDraft(''); setProbError(''); }}
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded border flex-shrink-0 transition-all
                      ${showAddProblem
                        ? 'bg-accent-blue/20 border-accent-blue/50 text-[#85B7EB]'
                        : 'border-border-accent text-txt-tertiary hover:text-txt-secondary'}`}
                  >
                    + New
                  </button>
                )}
              </div>

              {userRole === 'teacher' && showAddProblem && (
                <div className="flex-shrink-0 border-b border-border-subtle bg-bg-secondary p-3 flex flex-col gap-2">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-txt-tertiary mb-1">
                    New Problem
                  </div>
                  <input
                    autoFocus
                    value={newProbTitle}
                    onChange={e => setNewProbTitle(e.target.value)}
                    placeholder="Title…"
                    className="bg-bg-elevated border border-border-accent text-txt-primary text-[11px] rounded px-2 py-1 focus:outline-none focus:border-accent-blue w-full"
                  />
                  <textarea
                    value={newProbText}
                    onChange={e => setNewProbText(e.target.value)}
                    placeholder="Problem description…"
                    rows={4}
                    className="bg-bg-elevated border border-border-accent text-txt-primary text-[11px] font-mono rounded px-2 py-1 focus:outline-none focus:border-accent-blue w-full resize-y"
                  />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-txt-tertiary font-semibold">Test Cases</span>
                    {newProbTcs.length > 0 && (
                      <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
                        {newProbTcs.map((tc, i) => (
                          <div key={tc.id} className="flex items-center gap-2 px-2 py-1 rounded border border-border-subtle bg-bg-elevated text-[11px]">
                            <span className="font-mono text-txt-secondary flex-1 truncate">{tc.input}</span>
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border flex-shrink-0
                              ${tc.expected_output === 'true'
                                ? 'bg-green-900/20 border-green-700/40 text-green-300'
                                : 'bg-red-900/20 border-red-700/40 text-red-300'}`}>
                              {tc.expected_output}
                            </span>
                            <button
                              onClick={() => setNewProbTcs(prev => prev.filter((_, j) => j !== i))}
                              className="text-txt-tertiary hover:text-red-400 text-[13px] leading-none px-0.5 flex-shrink-0"
                            >×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-1.5 items-center">
                      <input
                        value={newProbTcInput}
                        onChange={e => setNewProbTcInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addNewProbTc()}
                        placeholder="e.g. max(3,5,X)"
                        className="flex-1 min-w-0 bg-bg-elevated border border-border-accent text-txt-primary text-[11px] font-mono rounded px-2 py-1 focus:outline-none focus:border-accent-blue"
                      />
                      <select
                        value={newProbTcExpected}
                        onChange={e => setNewProbTcExpected(e.target.value)}
                        className="bg-bg-elevated border border-border-accent text-txt-secondary text-[11px] rounded px-1.5 py-1 focus:outline-none flex-shrink-0"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                      <button
                        onClick={addNewProbTc}
                        disabled={!newProbTcInput.trim()}
                        className="text-[10px] px-2 py-1 bg-accent-blue/20 border border-accent-blue/50 text-[#85B7EB] rounded disabled:opacity-40 flex-shrink-0"
                      >+ TC</button>
                    </div>
                  </div>
                  {probError && (
                    <div className="text-[11px] text-red-400 bg-red-900/15 border border-red-700/40 rounded px-2 py-1">{probError}</div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={handleSaveProblem}
                      disabled={savingProblem || !newProbTitle.trim() || !newProbText.trim()}
                      className="text-xs px-3 py-1 bg-accent-blue/20 border border-accent-blue/50 text-[#85B7EB] rounded disabled:opacity-40"
                    >
                      {savingProblem ? 'Saving…' : 'Save Problem'}
                    </button>
                    <button
                      onClick={() => { setShowAddProblem(false); setNewProbTitle(''); setNewProbText(''); setNewProbTcs([]); setProbError(''); }}
                      className="text-xs px-3 py-1 border border-border-accent text-txt-tertiary rounded"
                    >Cancel</button>
                  </div>
                </div>
              )}

              {!showAddProblem && (
                <div className="flex-1 min-h-0 overflow-auto bg-bg-primary p-4">
                  {selProblemPreset ? (() => {
                    const prob = problems.find(p => String(p.question_id) === selProblemPreset);
                    return (
                      <>
                        <div className="mb-5">
                          <div className="text-[11px] font-semibold tracking-widest uppercase text-txt-tertiary mb-3">
                            Problem Description
                          </div>
                          <pre className="font-sans text-[13px] leading-relaxed text-txt-secondary whitespace-pre-wrap">
                            {problemDraft}
                          </pre>
                        </div>
                        {prob?.test_cases && prob.test_cases.length > 0 && (
                          <div>
                            <div className="text-[11px] font-semibold tracking-widest uppercase text-txt-tertiary mb-3">
                              Test Cases ({prob.test_cases.length})
                            </div>
                            {prob.test_cases.map((tc, i) => (
                              <div key={tc.testcase_id} className="p-3 mb-2 rounded-md border border-border-subtle bg-bg-elevated text-[12px]">
                                <div className="font-mono text-txt-secondary mb-1">
                                  <span className="text-txt-tertiary font-semibold">#{i + 1} Input:</span> {tc.input}
                                </div>
                                <div className="font-mono text-green-400">
                                  <span className="text-txt-tertiary font-semibold">Expected:</span> {tc.expected_output}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })() : (
                    <p className="text-[12px] text-txt-tertiary">Select a problem above to view its description and test cases.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {rightTab === 'feedback' && (
            <div className="flex-1 overflow-auto min-h-0 p-4">
              <pre className="font-mono text-[12px] leading-relaxed text-txt-secondary whitespace-pre-wrap">
                {feedback || 'Run a query or check syntax to see output here.'}
              </pre>
            </div>
          )}

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
              {selNode && <NodeInfo node={selNode} edges={graph.edges} onClose={() => setSelNode(null)} />}
            </div>
          )}

          {rightTab === 'trace' && traceData && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <BacktrackTree trace={traceData} onHighlightLine={onHighlightLine} />
            </div>
          )}
        </div>
      </div>

      <div className={`font-mono text-[11px] px-4 py-1 bg-bg-secondary border-t border-border-subtle flex-shrink-0 truncate ${statusColor}`}>
        {status.msg}
      </div>

      {/* ── Save modal ── */}
      <Modal
        open={modal?.type === 'save'}
        title="Save File"
        onClose={() => setModal(null)}
        actions={
          <>
            <button onClick={() => setModal(null)} className="text-xs px-3 py-1 border border-border-accent rounded text-txt-secondary">Cancel</button>
            <button
              onClick={() => { modal.resolve(saveFilename); setModal(null); setSaveFilename(''); }}
              className="text-xs px-3 py-1 bg-accent-blue/20 border border-accent-blue rounded text-[#85B7EB]"
            >
              Save
            </button>
          </>
        }
      >
        <SaveInput value={saveFilename} onChange={setSaveFilename}
          onSubmit={() => { modal.resolve(saveFilename); setModal(null); setSaveFilename(''); }} />
      </Modal>

      {/* ── Auto-correction diff modal ── */}
      <Modal
        open={modal?.type === 'confirm'}
        wide={!!modal?.diff}
        title="Auto-correction available"
        onClose={() => setModal(null)}
        actions={
          <>
            <button onClick={() => setModal(null)} className="text-xs px-3 py-1 border border-border-accent rounded text-txt-secondary">Cancel</button>
            <button onClick={() => { modal.onConfirm(); setModal(null); }}
              className="text-xs px-3 py-1 bg-green-900/20 border border-green-700 text-green-300 rounded">
              Apply Fix
            </button>
          </>
        }
      >
        <DiffViewer diff={modal?.diff || ''} />
      </Modal>

      {/* ── Test-case review modal ── */}
      <Modal
        open={modal?.type === 'testcase-review'}
        wide
        title="Review test cases for diagnosis"
        onClose={() => setModal(null)}
        actions={
          <>
            <button onClick={() => setModal(null)} className="text-xs px-3 py-1 border border-border-accent rounded text-txt-secondary">Cancel</button>
            <button
              onClick={() => modal.onConfirm(reviewTcs)}
              className="text-xs px-3 py-1 bg-red-900/20 border border-red-700 text-red-300 rounded"
            >
              Run Diagnosis ({reviewTcs.length} case{reviewTcs.length !== 1 ? 's' : ''})
            </button>
          </>
        }
      >
        <TestCaseReviewBody
          reviewTcs={reviewTcs}
          setReviewTcs={setReviewTcs}
          newTcInput={newTcInput}
          setNewTcInput={setNewTcInput}
          newTcExpected={newTcExpected}
          setNewTcExpected={setNewTcExpected}
          addReviewTc={addReviewTc}
        />
      </Modal>
    </div>
  );

  const loginPageProps = {
    defaultRole: userRole || 'student',
    defaultIsRegistering: authMode === 'signup',
    onLogin: handleLogin,
    onBack: () => setScreen('landing'),
    onSwitchMode: (mode) => {
      setAuthMode(mode);
      setScreen(mode === 'signup' ? 'signup' : 'login');
    },
  };

  return (
    <>
      <GlobalStyle />
      {screen === 'landing' && (
        <LandingPage
          onStudentLogin={() => {
            setUserRole('student');
            setAuthMode('login');
            setScreen('login');
          }}
          onTeacherLogin={() => {
            setUserRole('teacher');
            setAuthMode('login');
            setScreen('login');
          }}
          onSignup={(role) => {
            setUserRole(role);
            setAuthMode('signup');
            setScreen('signup');
          }}
        />
      )}
      {(screen === 'login' || screen === 'signup') && (
        <LoginPage {...loginPageProps} />
      )}
      {screen === 'dashboard' && (
        user
          ? <Dashboard
            user={user}
            role={user.role}
            onLogout={handleLogout}
            onUserUpdate={handleUserUpdate}
            sidebarCollapsed={sidebarCollapsed}
            onSidebarChange={setSidebarCollapsed}
            mainContent={PrologCheckerUI()}
          />
          : <LoginPage {...loginPageProps} />
      )}
      {screen === 'role-select' && <RoleSelect />}
    </>
  );
}

// ── Shared test-case review body ──────────────────────────────────────────────
export function TestCaseReviewBody({
  reviewTcs, setReviewTcs,
  newTcInput, setNewTcInput,
  newTcExpected, setNewTcExpected,
  addReviewTc,
}) {
  const sourceBadge = {
    llm: { label: 'AI', cls: 'bg-accent-blue/10 border-accent-blue/30 text-[#85B7EB]' },
    manual: { label: 'Manual', cls: 'bg-green-900/20 border-green-700/40 text-green-300' },
    given: { label: 'Given', cls: 'bg-bg-elevated border-border-accent text-txt-tertiary' },
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] text-txt-tertiary">
        LLM will use these test cases. Remove any you don't want, or add your own.
      </p>
      <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto pr-1">
        {reviewTcs.length === 0 && (
          <p className="text-[11px] text-txt-tertiary py-2 text-center">No test cases — add some below.</p>
        )}
        {reviewTcs.map((tc, i) => {
          const badge = sourceBadge[tc._source] || sourceBadge.given;
          return (
            <div key={tc.testcase_id}
              className="flex items-center gap-2 px-3 py-2 rounded-md border border-border-subtle bg-bg-elevated text-[11px]">
              <span className="text-txt-tertiary w-5 flex-shrink-0">#{i + 1}</span>
              <span className="font-mono text-txt-secondary flex-1 min-w-0 truncate">{tc.input}</span>
              <span className={`flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded border ${tc.expected_output === 'true'
                ? 'bg-green-900/20 border-green-700/40 text-green-300'
                : 'bg-red-900/20 border-red-700/40 text-red-300'
                }`}>
                {tc.expected_output}
              </span>
              <span className={`flex-shrink-0 text-[10px] font-medium px-2 py-0.5 rounded border ${badge.cls}`}>
                {badge.label}
              </span>
              <button
                onClick={() => setReviewTcs(prev => prev.filter((_, j) => j !== i))}
                className="flex-shrink-0 text-txt-tertiary hover:text-red-400 transition-colors text-[13px] leading-none px-0.5"
                title="Remove"
              >×</button>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 items-center pt-2 border-t border-border-subtle">
        <input
          value={newTcInput}
          onChange={e => setNewTcInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addReviewTc()}
          placeholder="e.g. factorial(3,6)"
          className="flex-1 min-w-0 bg-bg-elevated border border-border-accent text-txt-primary text-[11px] font-mono rounded px-2 py-1 focus:outline-none focus:border-accent-blue"
        />
        <select
          value={newTcExpected}
          onChange={e => setNewTcExpected(e.target.value)}
          className="bg-bg-elevated border border-border-accent text-txt-secondary text-[11px] rounded px-2 py-1 focus:outline-none flex-shrink-0"
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
        <button
          onClick={addReviewTc}
          disabled={!newTcInput.trim()}
          className="text-xs px-3 py-1 bg-accent-blue/20 border border-accent-blue/50 text-[#85B7EB] rounded disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
        >
          Add
        </button>
      </div>
    </div>
  );
}