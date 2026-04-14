import React, { useState, useCallback, useEffect, useRef } from 'react';
import Icon from '../components/Icon.js';
import Card from '../components/Card.js';
import CodeEditor from '../components/CodeEditor.js';
import GraphCanvas from '../components/GraphCanvas.js';
import NodeInfo from '../components/NodeInfo.js';
import BacktrackTree from '../components/BacktrackTree.js';
import Modal from '../components/Modal.js';
import DiffViewer from '../components/DiffViewer.js';
import { TestCaseReviewBody } from '../App.js';
import { rewireEdge } from '../utils/rewire.js';
import { extractSourceClauses, injectCutGhostsFromSource } from '../utils/engineOutputParser.js';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

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

const AssignmentPage = ({ assignmentData, role, user, onBack }) => {
  const { question, lab, classroom } = assignmentData;
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';

  const [output, setOutput] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [code, setCode] = useState('% Write your Prolog solution here\n');
  const [loading, setLoading] = useState(false);

  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [selNode, setSelNode] = useState(null);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 500 });
  const [hlLines, setHlLines] = useState([]);
  const posRef = useRef({});
  const parseTimer = useRef(null);
  const obsRef = useRef(null);
  const resizeTimerRef = useRef(null);

  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState('');
  const [status, setStatus] = useState({ msg: 'Ready', kind: 'idle' });
  const [lastResult, setLastResult] = useState(null);
  const [canVisualize, setCanVisualize] = useState(false);
  const [rightTab, setRightTab] = useState('problem');
  const [traceData, setTraceData] = useState(null);
  const [modal, setModal] = useState(null);

  // Teacher state
  const [students, setStudents] = useState([]);
  const [selStudent, setSelStudent] = useState('');
  const [studentResults, setStudentResults] = useState([]);
  const [selResultId, setSelResultId] = useState('');
  const [testRunning, setTestRunning] = useState(false);

  const setMsg = useCallback((msg, kind = 'idle') => setStatus({ msg, kind }), []);

  // ── Test-case review modal state ──────────────────────────────────────
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

  // Canvas resize observer
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

  // Student: pre-fill code with last submission if one exists
  useEffect(() => {
    if (role !== 'student' || !user?.id) return;
    fetch(`${API_BASE}/api/labs/results/student/${encodeURIComponent(user.id)}`)
      .then(r => r.ok ? r.json() : [])
      .then(results => {
        if (!Array.isArray(results)) return;
        // Find the most recent submission for this question
        const mine = results
          .filter(r => String(r.question_id) === String(question.question_id) && r.code_file)
          .sort((a, b) => new Date(b.submission_time) - new Date(a.submission_time));
        if (mine.length > 0) {
          setCode(mine[0].code_file.replace(/\.\s+([a-z%A-Z])/g, '.\n$1').trim());
        }
      })
      .catch(() => { });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Teacher: fetch students + submissions
  useEffect(() => {
    if (role !== 'teacher') return;
    fetch(`${API_BASE}/api/classrooms/${classroom.class_id}/students`)
      .then(r => r.ok ? r.json() : { students: [] })
      .then(d => setStudents(d.students || []))
      .catch(() => { });
    fetch(`${API_BASE}/api/labs/results/question/${question.question_id}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setStudentResults(Array.isArray(d) ? d : []))
      .catch(() => { });
  }, [role, classroom.class_id, question.question_id]);

  // Teacher: load submission + auto-run tests when selected
  useEffect(() => {
    if (!selResultId) return;
    const result = studentResults.find(r => String(r.result_id) === selResultId);
    if (!result) return;
    const raw = result.code_file || '';
    const studentCode = raw?.replace(/\.\s+([a-z%A-Z])/g, '.\n$1').trim() || '% No code found';
    setCode(studentCode);
    setFeedback('');
    setLastResult(null);
    setTraceData(null);
    setOutput(null);
    posRef.current = {};
    if (!question.test_cases?.length) return;
    setTestRunning(true);
    setRightTab('results');
    (async () => {
      const results = [];
      for (const tc of question.test_cases) {
        try {
          const q = tc.input.replace(/\.$/, '');
          const res = await fetch(`${API_BASE}/api/query-run`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              problem_id: Number(question.question_id),
              student_file: 'assignment.pl',
              student_code: studentCode,
              query: q,
            }),
          });
          const r = res.ok ? await res.json() : { ok: false };
          const actual = r.ok
            ? (r.query_result || (r.has_logic_error ? 'error' : 'true'))
            : 'failed';
          results.push({
            input: tc.input,
            expected: tc.expected_output,
            passed: r.ok && actual === tc.expected_output,
            actual,
          });
        } catch {
          results.push({ input: tc.input, expected: tc.expected_output, passed: false, actual: 'error' });
        }
      }
      const passedCount = results.filter(r => r.passed).length;
      setOutput({ type: 'tests', results, passedCount, totalCount: results.length, allPassed: passedCount === results.length });
      setTestRunning(false);
    })();
  }, [selResultId]);

  // Parse code → graph via backend /api/graph-data (uses real SWI-Prolog clause/2)
  useEffect(() => {
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(async () => {
      if (!code.trim()) { setGraph({ nodes: [], edges: [] }); return; }
      try {
        const res = await fetch(API_BASE + '/api/graph-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_code: code }),
        });
        if (!res.ok) return;
        const data = await res.json();
        // Restore existing drag positions
        const newNodes = (data.nodes || []).map(n => {
          const pos = posRef.current[n.id];
          return pos ? { ...n, x: pos.x, y: pos.y } : n;
        });
        const newGraph = { nodes: newNodes, edges: data.edges || [] };
        setGraph(newGraph);
        setSelNode(prev => {
          if (!prev) return null;
          return newNodes.some(n => n.id === prev.id) ? prev : null;
        });
      } catch { /* ignore while typing */ }
    }, 500);
    return () => clearTimeout(parseTimer.current);
  }, [code]);

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
      if (updated !== code) { setCode(updated); setMsg(`Rewired: ${edge.label} -> ${newNodeLabel}`, 'ok'); }
    } catch (e) { setMsg(`Rewire error: ${e.message}`, 'error'); }
  }, [code, setMsg]);

  const onHighlightLine = useCallback((lineStart, lineEnd) => {
    setHlLines(lineStart >= 0
      ? Array.from({ length: (lineEnd ?? lineStart) - lineStart + 1 }, (_, i) => lineStart + i)
      : []);
  }, []);

  const apiFetch = async (path, body) => {
    const res = await fetch(API_BASE + path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json();
  };

  const withLoading = useCallback(async (fn) => {
    setLoading(true);
    try { await fn(); }
    catch (e) { setFeedback(`Error: ${e.message}`); setMsg(e.message, 'error'); }
    finally { setLoading(false); }
  }, [setMsg]);

  const buildPayload = useCallback(() => ({
    problem_id: Number(question.question_id),
    student_file: 'assignment.pl',
    student_code: code,
  }), [code, question.question_id]);

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
    setCanVisualize(!!r.ok && r.shapiro_mode !== 'nonterminate');
    if (!r.ok) { setFeedback(r.feedback || 'Query failed.'); setRightTab('feedback'); return; }
    const verdict = r.has_logic_error ? (r.shapiro_mode || 'unknown') : 'correct';
    setFeedback([
      `Query: ${r.query}`, `Status: ${verdict}`, '',
      'Execution Trace:', r.trace || '', '',
      'Proof Tree:', r.proof_tree || '', '',
      'Debug Summary:', r.debug_summary || '',
    ].join('\n'));
    setRightTab('feedback');
    setMsg(`Query done — ${verdict}`, r.has_logic_error ? 'error' : 'ok');
  });

  const visualize = useCallback(async () => {
    if (!code.trim()) { setMsg('Write some code first', 'error'); return; }
    const q = normalizeQuery(query);
    if (!q) { setMsg('Enter a query to visualize', 'error'); return; }
    setLoading(true);
    try {
      const r = await apiFetch('/api/query-run', { ...buildPayload(), query: q });
      if (!r.ok) { setMsg('Query failed — cannot visualize', 'error'); return; }
      const nodes = r.proof_nodes || [];

      // Prepend a query-root node so the tree starts from the user's query
      const queryRootId = 'query_root';
      nodes.forEach(n => { if (!n.parentId) n.parentId = queryRootId; });
      nodes.unshift({
        id: queryRootId, parentId: null, depth: 0,
        goal: q, clause: q, result: 'success',
        isQueryRoot: true, bindings: {}, children: [],
      });

      const sourceClauses = extractSourceClauses(code);
      injectCutGhostsFromSource(nodes, sourceClauses);
      setTraceData(nodes);
      setRightTab('trace');
      setMsg(`Visualizing ${nodes.length} nodes`, 'ok');
    } catch (e) {
      setMsg(`Visualize error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [code, query, buildPayload, setMsg]);

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
        problem_id: Number(question.question_id),
        student_code: code,
      });
      if (gen.ok) llmTcs = gen.test_cases || [];
    } catch { /* non-fatal */ }

    const givenTcs = (question.test_cases || []).map(tc => ({ ...tc, _source: 'given' }));
    const seenInputs = new Set(givenTcs.map(tc => tc.input));
    const merged = [
      ...givenTcs,
      ...llmTcs.filter(tc => !seenInputs.has(tc.input)).map(tc => ({ ...tc, _source: 'llm' })),
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

  const handleRunTests = async () => {
    if (!question.test_cases || question.test_cases.length === 0) return;
    setSubmitLoading(true);
    setOutput(null);
    const results = [];
    for (const tc of question.test_cases) {
      try {
        const q = tc.input.replace(/\.$/, '');
        const r = await apiFetch('/api/query-run', { ...buildPayload(), query: q });
        // query_result is 'true'/'false'; fall back to inferring from has_logic_error for old responses
        const actual = r.ok
          ? (r.query_result || (r.has_logic_error ? 'error' : 'true'))
          : 'failed';
        results.push({
          input: tc.input,
          expected: tc.expected_output,
          passed: r.ok && actual === tc.expected_output,
          actual,
        });
      } catch (e) {
        results.push({ input: tc.input, expected: tc.expected_output, passed: false, actual: 'error: ' + e.message });
      }
    }
    const passedCount = results.filter(r => r.passed).length;
    setOutput({ type: 'tests', results, passedCount, totalCount: results.length, allPassed: passedCount === results.length });
    setRightTab('results');
    setSubmitLoading(false);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setSubmitLoading(true);
    try {
      const r = await apiFetch('/api/labs/submit', {
        student_id: user.id,
        question_id: question.question_id,
        code_file: code,
      });
      setOutput({ type: 'submitted', message: `Submitted! Result ID: ${r.result_id}`, result: r });
      setRightTab('results');
    } catch (e) {
      setOutput({ type: 'error', feedback: 'Submit failed: ' + e.message });
      setRightTab('results');
    } finally {
      setSubmitLoading(false);
    }
  };

  const statusColor = status.kind === 'error' ? 'text-red-400'
    : status.kind === 'ok' ? 'text-green-400'
      : 'text-txt-tertiary';

  const rightTabs = [
    ['problem', '📋 Problem', false],
    ['results', '✅ Results', false],
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

  const filteredResults = studentResults.filter(r => String(r.student_id) === selStudent);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'Google Sans', sans-serif" }}>

      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 13, fontWeight: 600, padding: 0 }}>
            <Icon name="arrow_left" size={14} color={accent} /> Back
          </button>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{lab?.title}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              {classroom?.class_name} &middot; Question {question.question_number || ''}
            </div>
          </div>
        </div>

        {role === 'teacher' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={selStudent}
              onChange={e => { setSelStudent(e.target.value); setSelResultId(''); setCode('% Select a submission to view student code'); setOutput(null); }}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, minWidth: 150 }}>
              <option value="">— Select student —</option>
              {students.map(s => (
                <option key={s.student_id} value={String(s.student_id)}>
                  {s.username || s.student_id}
                </option>
              ))}
            </select>
            <select value={selResultId} onChange={e => setSelResultId(e.target.value)}
              disabled={!selStudent}
              style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, minWidth: 170, opacity: selStudent ? 1 : 0.5 }}>
              <option value="">— Select submission —</option>
              {filteredResults.map((r, i) => (
                <option key={r.result_id} value={String(r.result_id)}>
                  Submission #{i + 1} · {new Date(r.submission_time).toLocaleDateString()}
                </option>
              ))}
            </select>
            {testRunning && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Running tests…</span>}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleRunTests}
              disabled={submitLoading || !question.test_cases?.length}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid ' + accent, background: accent + '15', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: accent, opacity: submitLoading ? 0.5 : 1 }}>
              {submitLoading ? 'Running...' : 'Run Tests'}
            </button>
            <button onClick={handleSubmit} disabled={submitLoading}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: accent, fontSize: 12, fontWeight: 600, cursor: 'pointer', color: '#fff', opacity: submitLoading ? 0.5 : 1 }}>
              Submit
            </button>
          </div>
        )}
      </div>

      {/* Main layout */}
      <div className="flex flex-col flex-1 overflow-hidden min-h-0 bg-bg-primary text-txt-primary font-sans">

        {/* Toolbar */}
        <header className="flex items-center gap-2 px-3 h-[46px] bg-bg-secondary border-b border-border-subtle flex-shrink-0 z-10 overflow-hidden">
          <span className="font-mono text-[12px] font-semibold text-txt-tertiary flex-shrink-0">solution.pl</span>
          <div className="w-px h-5 bg-border-accent mx-1 flex-shrink-0" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && runQuery()}
            placeholder="e.g. max(3,5,X)"
            className="bg-bg-elevated border border-border-accent text-txt-primary text-[11px] font-mono rounded px-2 py-1 w-40 focus:outline-none focus:border-accent-blue flex-shrink-0" />
          {role !== 'teacher' && (
            <>
              <Btn onClick={checkSyntax} disabled={loading} title="Grammar-based syntax check">Syntax</Btn>
              <Btn onClick={runQuery} disabled={loading} variant="primary" title="Run query, get proof tree">{loading ? '...' : 'Run'}</Btn>
              <Btn onClick={visualize} disabled={!canVisualize} variant="success"
                title={!canVisualize ? 'Run a successful query first' : 'Visualize backtracking trace'}>Visualize</Btn>
              <Btn onClick={runLlm} disabled={loading} variant="warning" title="LLM natural-language feedback">LLM</Btn>
              <Btn onClick={runDiagnosis} disabled={loading} variant="danger" title="Full diagnosis with optional auto-fix">Diagnose</Btn>
            </>
          )}
          {lastResult && (
            <span className={`ml-auto text-[10px] px-2 py-0.5 rounded border flex-shrink-0
              ${lastResult.has_logic_error ? 'text-red-300 border-red-700/40 bg-red-900/15' : 'text-green-300 border-green-700/40 bg-green-900/15'}`}>
              {lastResult.has_logic_error ? (lastResult.shapiro_mode || 'unknown') : 'correct'}
            </span>
          )}
        </header>

        {/* Editor + tabs */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          <div className="flex flex-col border-r border-border-subtle flex-shrink-0" style={{ width: 420 }}>
            <div className="flex items-center justify-between px-3 h-7 bg-bg-secondary border-b border-border-subtle flex-shrink-0">
              <span className="text-[10px] font-semibold tracking-widest uppercase text-txt-tertiary">Prolog Source</span>
              <span className="text-[10px] text-txt-tertiary italic">
                {role === 'teacher' ? 'read-only' : rightTab === 'trace' ? 'active clause highlighted' : 'drag nodes · drag edge to rewire'}
              </span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              <CodeEditor
                value={code}
                onChange={role === 'teacher' ? () => { } : setCode}
                highlightLines={rightTab === 'trace' ? hlLines : selNode?.lineStart != null ? [selNode.lineStart] : []}
              />
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            <div className="flex items-center h-8 bg-bg-secondary border-b border-border-subtle flex-shrink-0 overflow-x-auto">
              {rightTabs.map(([id, label, disabled]) => (
                <button key={id} onClick={() => !disabled && setRightTab(id)} disabled={disabled}
                  title={disabled ? 'Run a query then click Visualize to enable' : undefined}
                  className={`h-full px-4 text-[11px] border-none border-r border-border-subtle transition-all whitespace-nowrap flex-shrink-0
                    ${disabled ? 'text-txt-tertiary opacity-35 cursor-not-allowed'
                      : rightTab === id ? 'bg-bg-primary text-txt-primary font-medium cursor-pointer'
                        : 'bg-transparent text-txt-tertiary hover:bg-bg-elevated hover:text-txt-secondary cursor-pointer'}`}>
                  {label}
                  {id === 'trace' && traceData && <span className="ml-1 text-[9px] text-indigo-400">●</span>}
                </button>
              ))}
              {(rightTab === 'graph' || rightTab === 'trace') && (
                <div className="flex gap-2 ml-auto px-3 flex-shrink-0">
                  {(rightTab === 'graph' ? graphLegend : traceLegend).map(([sym, color, tip]) => (
                    <span key={sym} style={{ color }} className="text-[10px] font-mono cursor-default" title={tip}>{sym}</span>
                  ))}
                </div>
              )}
            </div>

            {rightTab === 'problem' && (
              <div className="flex-1 overflow-auto min-h-0 p-5">
                <div className="mb-5">
                  <div className="text-[11px] font-semibold tracking-widest uppercase text-txt-tertiary mb-3">Problem Description</div>
                  <pre className="font-sans text-[13px] leading-relaxed text-txt-secondary whitespace-pre-wrap">{question.problem}</pre>
                </div>
                {question.test_cases && question.test_cases.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold tracking-widest uppercase text-txt-tertiary mb-3">
                      Test Cases ({question.test_cases.length})
                    </div>
                    {question.test_cases.map((tc, i) => (
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
              </div>
            )}

            {rightTab === 'results' && (
              <div className="flex-1 overflow-auto min-h-0 p-5">
                {testRunning && (
                  <div className="flex flex-col items-center gap-3 pt-16 text-txt-tertiary text-[13px]">
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    <div style={{ width: 28, height: 28, border: '3px solid rgba(133,183,235,.2)', borderTopColor: '#85B7EB', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                    Running tests against submission…
                  </div>
                )}
                {!output && !testRunning && (
                  <div className="text-txt-tertiary text-[13px] text-center pt-16">
                    {role === 'teacher' ? 'Select a student and submission to see results.' : 'Run tests or submit to see results here.'}
                  </div>
                )}
                {output?.type === 'tests' && (
                  <div>
                    <div className={`p-3 rounded-lg mb-4 border text-[13px] font-semibold
                      ${output.allPassed ? 'bg-green-900/20 border-green-700/40 text-green-300' : 'bg-red-900/20 border-red-700/40 text-red-300'}`}>
                      {output.allPassed ? '✓ All Tests Passed!' : `✗ ${output.passedCount} / ${output.totalCount} Passed`}
                    </div>
                    {output.results.map((r, i) => (
                      <div key={i} className={`p-3 mb-2 rounded-md border text-[12px]
                        ${r.passed ? 'bg-green-900/15 border-green-700/30' : 'bg-red-900/15 border-red-700/30'}`}>
                        <div className={`font-semibold mb-1 ${r.passed ? 'text-green-400' : 'text-red-400'}`}>
                          {r.passed ? 'PASS' : 'FAIL'} — Test #{i + 1}
                        </div>
                        <div className="font-mono text-txt-tertiary">Query: {r.input}</div>
                        <div className="font-mono text-txt-tertiary">Expected: {r.expected} | Got: {r.actual}</div>
                      </div>
                    ))}
                  </div>
                )}
                {output?.type === 'submitted' && (
                  <div className="p-4 rounded-lg bg-green-900/20 border border-green-700/40">
                    <div className="font-semibold text-[14px] text-green-300 mb-1">Submitted Successfully</div>
                    <div className="text-[12px] text-txt-secondary">{output.message}</div>
                  </div>
                )}
                {output?.type === 'error' && (
                  <div className="p-4 rounded-lg bg-red-900/20 border border-red-700/40">
                    <div className="font-semibold text-[14px] text-red-300 mb-1">Error</div>
                    <pre className="text-[12px] whitespace-pre-wrap text-txt-secondary font-mono">{output.feedback}</pre>
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
                    <span className="text-4xl opacity-20">&#8866;</span>
                    <p className="text-xs text-center leading-relaxed">Type Prolog code<br />to see the knowledge graph</p>
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
      </div>

      {/* Auto-correction diff modal */}
      <Modal
        open={modal?.type === 'confirm'}
        wide={!!modal?.diff}
        title="Auto-correction available"
        onClose={() => setModal(null)}
        actions={
          <>
            <button onClick={() => setModal(null)} className="text-xs px-3 py-1 border border-border-accent rounded text-txt-secondary">Cancel</button>
            <button onClick={() => { modal.onConfirm(); setModal(null); }}
              className="text-xs px-3 py-1 bg-green-900/20 border border-green-700 text-green-300 rounded">Apply Fix</button>
          </>
        }
      >
        <DiffViewer diff={modal?.diff || ''} />
      </Modal>

      {/* Test-case review modal */}
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
};

export default AssignmentPage;