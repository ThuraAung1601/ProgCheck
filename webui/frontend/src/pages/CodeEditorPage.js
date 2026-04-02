import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon.js';
import Card from '../components/Card.js';
import Button from '../components/Button.js';

const CodeEditorPage = ({ role }) => {
  const [problems, setProblems] = useState([]);
  const [studentFiles, setStudentFiles] = useState([]);
  const [selectedProblem, setSelectedProblem] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [code, setCode] = useState('');
  const [output, setOutput] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syntaxErrors, setSyntaxErrors] = useState([]);

  const apiBase = process.env.REACT_APP_API_BASE || 'http://localhost:8000';
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';
  const accentLight = role === 'teacher' ? 'var(--sky-light)' : 'var(--mint-light)';

  // Load available files on mount
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const res = await fetch(`${apiBase}/api/options`);
        const data = await res.json();
        setProblems(data.problem_files || []);
        setStudentFiles(data.student_code_files || []);
        if (data.problem_files?.length > 0) setSelectedProblem(data.problem_files[0]);
        if (data.student_code_files?.length > 0) setSelectedStudent(data.student_code_files[0]);
      } catch (err) {
        console.error('Failed to fetch options:', err);
      }
    };
    fetchOptions();
  }, [apiBase]);

  // Load student file when selected
  useEffect(() => {
    if (selectedStudent && selectedProblem) {
      const fetchFile = async () => {
        try {
          const res = await fetch(`${apiBase}/api/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              problem_file: selectedProblem,
              student_file: selectedStudent,
              student_code: code
            })
          });
          const data = await res.json();
          if (data.code) setCode(data.code);
        } catch (err) {
          console.error('Failed to load file:', err);
        }
      };
      fetchFile();
    }
  }, [selectedStudent, selectedProblem, code, apiBase]);

  const handleSyntaxCheck = async () => {
    setLoading(true);
    setSyntaxErrors([]);
    try {
      const res = await fetch(`${apiBase}/api/syntax-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_file: selectedProblem,
          student_file: selectedStudent,
          student_code: code
        })
      });
      const data = await res.json();
      if (data.errors) {
        setSyntaxErrors(data.errors);
        setOutput({ status: 'error', message: 'Syntax errors found' });
      } else {
        setSyntaxErrors([]);
        setOutput({ status: 'ok', message: 'Syntax check passed' });
      }
    } catch (err) {
      setSyntaxErrors([err.message]);
    } finally {
      setLoading(false);
    }
  };

  const handleFullDiagnosis = async () => {
    setLoading(true);
    setOutput(null);
    setFeedback(null);
    try {
      const res = await fetch(`${apiBase}/api/full-diagnosis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          problem_file: selectedProblem,
          student_file: selectedStudent,
          student_code: code
        })
      });
      const data = await res.json();
      setOutput(data.diagnosis || { status: 'error' });
      setFeedback(data.feedback || '');
    } catch (err) {
      setOutput({ status: 'error', error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fade-in" style={{ padding: '24px', height: '100%', display: 'flex', flexDirection: 'column', gap: 16, fontFamily: "'Google Sans', sans-serif" }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em' }}>Prolog Code Checker</h1>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 2 }}>Submit and test your Prolog solutions</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 0, flex: 1 }}>
        {/* Left: Code Editor */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ padding: 14, flex: '0 0 auto' }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Problem</label>
                <select
                  value={selectedProblem}
                  onChange={e => setSelectedProblem(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    marginTop: 4
                  }}
                >
                  {problems.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Student File</label>
                <select
                  value={selectedStudent}
                  onChange={e => setSelectedStudent(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    marginTop: 4
                  }}
                >
                  {studentFiles.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          <Card style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '10px 14px', background: '#12122a', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF5F57' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#FFBD2E' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#28C840' }} />
              <span style={{ marginLeft: 8, fontSize: 11, color: '#888', fontFamily: 'var(--mono)' }}>solution.pl</span>
            </div>
            <textarea
              value={code}
              onChange={e => {
                setCode(e.target.value);
                setSyntaxErrors([]);
              }}
              style={{
                flex: 1,
                padding: '14px',
                background: '#1a1a2e',
                color: '#e0e0e0',
                fontFamily: 'var(--mono)',
                fontSize: 12,
                lineHeight: 1.6,
                resize: 'none',
                border: 'none',
                outline: 'none'
              }}
              placeholder="Enter your Prolog code here..."
            />
          </Card>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button onClick={handleSyntaxCheck} size="md" style={{ flex: 1, background: '#666' }}>
              {loading ? 'Checking...' : 'Check Syntax'}
            </Button>
            <Button onClick={handleFullDiagnosis} size="md" style={{ flex: 1, background: accent, color: '#fff' }}>
              {loading ? 'Running...' : '▶ Run & Diagnose'}
            </Button>
          </div>

          {syntaxErrors.length > 0 && (
            <Card style={{ padding: 12, background: '#FEF2F2', border: '1px solid #FCA5A5' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Icon name="alert" size={16} color="#EF4444" style={{ flexShrink: 0, marginTop: 2 }} />
                <div style={{ fontSize: 12, color: '#DC2626' }}>
                  {syntaxErrors.map((err, i) => (
                    <div key={i}>{err}</div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Right: Output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Card style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--surface)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Results</span>
              {output && (
                <span style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '3px 10px',
                  borderRadius: 99,
                  background: output.status === 'correct' ? 'var(--mint-light)' : output.status === 'ok' ? '#E0F2FE' : '#FEF2F2',
                  color: output.status === 'correct' ? 'var(--mint-dark)' : output.status === 'ok' ? '#0369A1' : '#DC2626'
                }}>
                  {output.status === 'correct' ? '✓ Correct' : output.status === 'ok' ? '✓ Syntax OK' : '✗ Error'}
                </span>
              )}
            </div>

            <div style={{ padding: 16, flex: 1, overflow: 'auto' }}>
              {!output && !loading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 0', color: 'var(--muted)' }}>
                  <Icon name="play" size={32} color="var(--border)" />
                  <span style={{ fontSize: 12 }}>Click "Run & Diagnose" to check your code</span>
                </div>
              )}

              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '40px 0' }}>
                  <div style={{
                    width: 32,
                    height: 32,
                    border: '3px solid rgba(74,145,255,.2)',
                    borderTopColor: 'var(--sky)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Analyzing your code...</span>
                </div>
              )}

              {output && (
                <div style={{ fontSize: 13, lineHeight: 1.6 }}>
                  {output.error && (
                    <div style={{ color: '#DC2626', marginBottom: 12 }}>
                      <strong>Error:</strong> {output.error}
                    </div>
                  )}
                  {output.message && (
                    <div style={{ color: 'var(--muted)', marginBottom: 12 }}>
                      {output.message}
                    </div>
                  )}
                  {output.shapiro_mode && (
                    <div style={{ marginBottom: 12 }}>
                      <strong style={{ color: accent }}>Mode:</strong> {output.shapiro_mode}
                    </div>
                  )}
                  {output.shapiro_nodes_text && (
                    <div style={{ background: '#F9FAFB', padding: 10, borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 11, color: '#666', overflow: 'auto', maxHeight: 200 }}>
                      <pre>{output.shapiro_nodes_text}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {feedback && (
            <Card style={{ padding: 14, background: accentLight, border: `1px solid ${accent}20` }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: accent, marginBottom: 8 }}>💡 AI Feedback</div>
              <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--ink)' }}>
                {feedback}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default CodeEditorPage;
