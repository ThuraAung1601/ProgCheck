import React, { useState } from 'react';
import Icon from '../components/Icon.js';
import Card from '../components/Card.js';
import CodeEditor from '../components/CodeEditor.js';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const AssignmentPage = ({ assignmentData, role, user, onBack }) => {
  const { question, lab, classroom } = assignmentData;
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';

  const [code, setCode] = useState('% Write your Prolog solution here\n');
  const [output, setOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('problem'); // problem | results

  const apiFetch = async (path, body) => {
    const res = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
    return res.json();
  };

  const handleSyntaxCheck = async () => {
    setLoading(true);
    setOutput(null);
    try {
      const r = await apiFetch('/api/syntax-check', {
        problem_file: '',
        student_file: '',
        student_code: code,
      });
      setOutput({
        type: 'syntax',
        ok: r.ok,
        feedback: r.feedback || (r.ok ? 'Syntax OK' : 'Syntax error'),
      });
      setActiveTab('results');
    } catch (e) {
      setOutput({ type: 'error', feedback: e.message });
      setActiveTab('results');
    } finally {
      setLoading(false);
    }
  };

  const handleRunTests = async () => {
    if (!question.test_cases || question.test_cases.length === 0) return;
    setLoading(true);
    setOutput(null);

    const results = [];
    for (const tc of question.test_cases) {
      try {
        const query = tc.input.replace(/\.$/, '');
        const r = await apiFetch('/api/query-run', {
          problem_file: '',
          student_file: '',
          student_code: code,
          query,
        });
        results.push({
          input: tc.input,
          expected: tc.expected_output,
          passed: r.ok && !r.has_logic_error,
          actual: r.ok ? (r.has_logic_error ? r.shapiro_mode : 'true') : 'failed',
          trace: r.trace || '',
        });
      } catch (e) {
        results.push({
          input: tc.input,
          expected: tc.expected_output,
          passed: false,
          actual: 'error: ' + e.message,
          trace: '',
        });
      }
    }

    const passedCount = results.filter(r => r.passed).length;
    setOutput({
      type: 'tests',
      results,
      passedCount,
      totalCount: results.length,
      allPassed: passedCount === results.length,
    });
    setActiveTab('results');
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const r = await apiFetch('/api/labs/submit', {
        student_id: user.id,
        question_id: question.question_id,
        code_file: code,
      });
      setOutput({
        type: 'submitted',
        message: `Submitted! Result ID: ${r.result_id}`,
        result: r,
      });
      setActiveTab('results');
    } catch (e) {
      setOutput({ type: 'error', feedback: 'Submit failed: ' + e.message });
      setActiveTab('results');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: "'Google Sans', sans-serif" }}>
      {/* ── Header ── */}
      <div style={{
        padding: '12px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 13, fontWeight: 600, padding: 0 }}
          >
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

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleSyntaxCheck}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--border)',
              background: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: '#374151', opacity: loading ? 0.5 : 1,
            }}
          >
            Check Syntax
          </button>
          <button
            onClick={handleRunTests}
            disabled={loading || !question.test_cases?.length}
            style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid ' + accent,
              background: accent + '15', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: accent, opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? 'Running...' : 'Run Tests'}
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              padding: '6px 14px', borderRadius: 6, border: 'none',
              background: accent, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              color: '#fff', opacity: loading ? 0.5 : 1,
            }}
          >
            Submit
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Left: Problem + Test Cases / Results tabs */}
        <div style={{ width: 380, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {[['problem', 'Problem'], ['results', 'Results']].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, transition: 'all .15s',
                  background: activeTab === id ? '#fff' : 'var(--surface)',
                  color: activeTab === id ? '#111827' : 'var(--muted)',
                  borderBottom: activeTab === id ? `2px solid ${accent}` : '2px solid transparent',
                }}
              >{label}</button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {activeTab === 'problem' && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Problem Description</div>
                  <pre style={{ fontSize: 13, lineHeight: 1.7, color: '#111827', whiteSpace: 'pre-wrap', margin: 0, fontFamily: "'Google Sans', sans-serif" }}>
                    {question.problem}
                  </pre>
                </div>

                {question.test_cases && question.test_cases.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                      Test Cases ({question.test_cases.length})
                    </div>
                    {question.test_cases.map((tc, i) => (
                      <div key={tc.testcase_id} style={{
                        padding: '10px 12px', marginBottom: 6,
                        background: '#F9FAFB', borderRadius: 6, fontSize: 12,
                      }}>
                        <div style={{ fontFamily: 'monospace', color: '#111827', marginBottom: 4 }}>
                          <strong style={{ color: 'var(--muted)' }}>#{i + 1} Input:</strong> {tc.input}
                        </div>
                        <div style={{ fontFamily: 'monospace', color: '#065F46' }}>
                          <strong style={{ color: 'var(--muted)' }}>Expected:</strong> {tc.expected_output}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {activeTab === 'results' && (
              <>
                {!output && (
                  <div style={{ color: 'var(--muted)', fontSize: 13, textAlign: 'center', padding: '40px 0' }}>
                    Run tests or check syntax to see results here.
                  </div>
                )}

                {output?.type === 'syntax' && (
                  <Card style={{ padding: 16, background: output.ok ? '#F0FDF4' : '#FEF2F2', border: `1px solid ${output.ok ? '#BBF7D0' : '#FECACA'}` }}>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, color: output.ok ? '#065F46' : '#991B1B' }}>
                      {output.ok ? 'Syntax OK' : 'Syntax Error'}
                    </div>
                    <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, color: '#374151', fontFamily: 'monospace' }}>
                      {output.feedback}
                    </pre>
                  </Card>
                )}

                {output?.type === 'tests' && (
                  <div>
                    <div style={{
                      padding: '12px 16px', borderRadius: 8, marginBottom: 16,
                      background: output.allPassed ? '#F0FDF4' : '#FEF2F2',
                      border: `1px solid ${output.allPassed ? '#BBF7D0' : '#FECACA'}`,
                    }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: output.allPassed ? '#065F46' : '#991B1B' }}>
                        {output.allPassed ? 'All Tests Passed!' : `${output.passedCount} / ${output.totalCount} Passed`}
                      </span>
                    </div>

                    {output.results.map((r, i) => (
                      <div key={i} style={{
                        padding: '10px 12px', marginBottom: 8,
                        background: r.passed ? '#F0FDF4' : '#FEF2F2',
                        borderRadius: 6, border: `1px solid ${r.passed ? '#BBF7D0' : '#FECACA'}`,
                        fontSize: 12,
                      }}>
                        <div style={{ fontWeight: 600, marginBottom: 4, color: r.passed ? '#065F46' : '#991B1B' }}>
                          {r.passed ? 'PASS' : 'FAIL'} - Test #{i + 1}
                        </div>
                        <div style={{ fontFamily: 'monospace', color: '#374151' }}>
                          Query: {r.input}
                        </div>
                        <div style={{ fontFamily: 'monospace', color: '#374151' }}>
                          Expected: {r.expected} | Got: {r.actual}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {output?.type === 'submitted' && (
                  <Card style={{ padding: 16, background: '#F0FDF4', border: '1px solid #BBF7D0' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#065F46', marginBottom: 4 }}>
                      Submitted Successfully
                    </div>
                    <div style={{ fontSize: 12, color: '#374151' }}>{output.message}</div>
                  </Card>
                )}

                {output?.type === 'error' && (
                  <Card style={{ padding: 16, background: '#FEF2F2', border: '1px solid #FECACA' }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#991B1B', marginBottom: 4 }}>Error</div>
                    <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', margin: 0, color: '#374151', fontFamily: 'monospace' }}>
                      {output.feedback}
                    </pre>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>

        {/* Right: Code Editor */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{
            padding: '8px 16px', background: '#0d0f14',
            borderBottom: '1px solid #1e2030',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
          }}>
            <span style={{ fontSize: 11, color: '#666', fontFamily: 'monospace' }}>solution.pl</span>
            <span style={{ fontSize: 10, color: '#444' }}>Prolog</span>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <CodeEditor value={code} onChange={setCode} highlightLines={[]} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssignmentPage;
