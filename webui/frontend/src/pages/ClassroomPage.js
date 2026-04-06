import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon.js';
import Card from '../components/Card.js';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const STATUS_CFG = {
  active: { bg: '#D1FAE5', color: '#065F46', label: 'Active' },
  inactive: { bg: 'var(--surface)', color: 'var(--muted)', label: 'Inactive' },
  completed: { bg: '#FEF3C7', color: '#92400E', label: 'Completed' },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CFG[status] || STATUS_CFG.inactive;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600,
      background: cfg.bg, color: cfg.color,
      padding: '3px 10px', borderRadius: 99,
    }}>
      {cfg.label}
    </span>
  );
}

function TestCaseRow({ tc, index, canEdit, onDelete }) {
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '8px 12px',
      background: 'var(--surface)', borderRadius: 6, fontSize: 12,
      fontFamily: 'monospace', alignItems: 'center',
    }}>
      <span style={{ color: 'var(--muted)', minWidth: 20 }}>#{index + 1}</span>
      <span style={{ flex: 1, color: 'var(--ink)' }}><strong>Input:</strong> {tc.input}</span>
      <span style={{ color: '#065F46' }}><strong>Expected:</strong> {tc.expected_output}</span>
      {canEdit && (
        <button
          onClick={() => onDelete(tc.testcase_id)}
          title="Delete test case"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 14, lineHeight: 1, padding: '0 4px' }}
        >×</button>
      )}
    </div>
  );
}

// ── Avatar initials bubble ────────────────────────────────────
function InitialAvatar({ name, size = 32 }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const colors = ['#5BA3F5', '#4ECBA0', '#F59E0B', '#A78BFA', '#F472B6', '#34D399'];
  const color = colors[(name || '').charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: color + '22', border: `1.5px solid ${color}44`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

const ClassroomPage = ({ role, user, onOpenAssignment }) => {
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';
  const accentHex = role === 'teacher' ? '#5BA3F5' : '#4ECBA0';

  // ── navigation state ────────────────────────────────────────
  const [classrooms, setClassrooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [labs, setLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [questions, setQuestions] = useState([]);

  // ── loading / error ─────────────────────────────────────────
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [error, setError] = useState(null);

  // ── Create Classroom form ────────────────────────────────────
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomPrereqs, setNewRoomPrereqs] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // ── Student management ───────────────────────────────────────
  const [showStudents, setShowStudents] = useState(false);       // panel open
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [addStudentId, setAddStudentId] = useState('');
  const [addingStudent, setAddingStudent] = useState(false);
  const [studentError, setStudentError] = useState('');
  const [kickingId, setKickingId] = useState(null);

  // ── Add Lab form ─────────────────────────────────────────────
  const [showAddLab, setShowAddLab] = useState(false);
  const [newLabTitle, setNewLabTitle] = useState('');
  const [newLabActiveTime, setNewLabActiveTime] = useState('');
  const [newLabCompleteTime, setNewLabCompleteTime] = useState('');
  const [addingLab, setAddingLab] = useState(false);

  // ── Add Question form ────────────────────────────────────────
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [newQTitle, setNewQTitle] = useState('');
  const [newQProblem, setNewQProblem] = useState('');
  const [addingQuestion, setAddingQuestion] = useState(false);

  // ── Add Test Case form ───────────────────────────────────────
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [newTcInput, setNewTcInput] = useState('');
  const [newTcExpected, setNewTcExpected] = useState('true');
  const [addingTc, setAddingTc] = useState(false);

  // ── fetch classrooms ─────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    setLoadingRooms(true);
    setError(null);
    const endpoint = role === 'teacher'
      ? `/api/classrooms/teacher/${user.id}`
      : `/api/classrooms/student/${user.id}`;

    fetch(API_BASE + endpoint)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setClassrooms(d.classrooms || []); setLoadingRooms(false); })
      .catch(e => { setError(e.message); setLoadingRooms(false); });
  }, [user, role]);

  // ── load students when panel opens ───────────────────────────
  useEffect(() => {
    if (!showStudents || !selectedRoom) return;
    setLoadingStudents(true);
    setStudentError('');
    fetch(API_BASE + `/api/classrooms/${selectedRoom.class_id}/students`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setStudents(d.students || []); setLoadingStudents(false); })
      .catch(e => { setStudentError(e.message); setLoadingStudents(false); });
  }, [showStudents, selectedRoom]);

  // ── Create Classroom ──────────────────────────────────────────
  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    setCreatingRoom(true);
    setError(null);
    try {
      const res = await fetch(API_BASE + `/api/classrooms/create?teacher_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_name: newRoomName.trim(),
          prerequisites: newRoomPrereqs.trim() || 'None',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setClassrooms(prev => [data, ...prev]);
      setNewRoomName(''); setNewRoomPrereqs('');
      setShowCreateRoom(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  // ── Add Student ───────────────────────────────────────────────
  const handleAddStudent = async () => {
    if (!addStudentId.trim()) return;
    setAddingStudent(true);
    setStudentError('');
    try {
      const res = await fetch(
        API_BASE + `/api/classrooms/${selectedRoom.class_id}/enroll-student/${addStudentId}`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // data may be the updated student list or a single student — handle both
      if (Array.isArray(data.students)) {
        setStudents(data.students);
      } else if (data.student_id) {
        setStudents(prev => [...prev, data]);
      }
      // update class_size on the card
      setClassrooms(prev => prev.map(r =>
        r.class_id === selectedRoom.class_id
          ? { ...r, class_size: (r.class_size || 0) + 1 }
          : r
      ));
      setSelectedRoom(prev => prev ? { ...prev, class_size: (prev.class_size || 0) + 1 } : prev);
      setAddStudentId('');
    } catch (e) {
      setStudentError(e.message);
    } finally {
      setAddingStudent(false);
    }
  };

  // ── Kick Student ──────────────────────────────────────────────
  const handleKickStudent = async (studentId) => {
    setKickingId(studentId);
    setStudentError('');

    try {
      const res = await fetch(
        `${API_BASE}/api/classrooms/${selectedRoom.class_id}/remove-student/${studentId}`,
        {
          method: 'POST', // ✅ FIXED
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }

      // Remove student from UI
      setStudents(prev =>
        prev.filter(s => String(s.student_id) !== String(studentId))
      );

      // Update class size
      setClassrooms(prev =>
        prev.map(r =>
          r.class_id === selectedRoom.class_id
            ? { ...r, class_size: Math.max(0, (r.class_size || 1) - 1) }
            : r
        )
      );

      setSelectedRoom(prev =>
        prev
          ? { ...prev, class_size: Math.max(0, (prev.class_size || 1) - 1) }
          : prev
      );

    } catch (e) {
      setStudentError(e.message);
    } finally {
      setKickingId(null);
    }
  };

  // ── Room click ────────────────────────────────────────────────
  const handleRoomClick = (room) => {
    if (selectedRoom?.class_id === room.class_id) {
      setSelectedRoom(null); setLabs([]); setSelectedLab(null); setQuestions([]);
      setShowStudents(false); setStudents([]);
      return;
    }
    setSelectedRoom(room);
    setSelectedLab(null); setQuestions([]);
    setShowAddQuestion(false); setExpandedQuestion(null);
    setShowStudents(false); setStudents([]); setStudentError('');
    setLoadingLabs(true); setLabs([]);

    fetch(API_BASE + `/api/labs/classroom/${room.class_id}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setLabs(d.labs || []); setLoadingLabs(false); })
      .catch(e => { setError(e.message); setLoadingLabs(false); });
  };

  const handleLabClick = (lab) => {
    if (role === 'student' && lab.status !== 'active') return;
    if (selectedLab?.lab_id === lab.lab_id) {
      setSelectedLab(null); setQuestions([]);
      return;
    }
    setSelectedLab(lab);
    setLoadingQuestions(true); setQuestions([]);
    setShowAddQuestion(false); setExpandedQuestion(null);

    fetch(API_BASE + `/api/labs/${lab.lab_id}/questions`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setQuestions(d || []); setLoadingQuestions(false); })
      .catch(e => { setError(e.message); setLoadingQuestions(false); });
  };

  const handleStartCoding = (question) => {
    if (onOpenAssignment) onOpenAssignment({ question, lab: selectedLab, classroom: selectedRoom });
  };

  // ── Add Lab ───────────────────────────────────────────────────
  const handleAddLab = async () => {
    if (!newLabTitle.trim() || !selectedRoom) return;
    if (!newLabActiveTime || !newLabCompleteTime) { setError('Please set both Active Time and Complete Time.'); return; }
    if (new Date(newLabCompleteTime) <= new Date(newLabActiveTime)) { setError('Complete time must be after active time.'); return; }
    setAddingLab(true);
    try {
      const res = await fetch(API_BASE + `/api/labs/create?teacher_id=${user.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newLabTitle.trim(),
          classroom_id: selectedRoom.class_id,
          active_time: newLabActiveTime,
          complete_time: newLabCompleteTime,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
      const data = await res.json();
      setLabs(prev => [...prev, data]);
      setNewLabTitle(''); setNewLabActiveTime(''); setNewLabCompleteTime('');
      setShowAddLab(false);
    } catch (e) { setError(e.message); }
    finally { setAddingLab(false); }
  };

  // ── Add Question ──────────────────────────────────────────────
  const handleAddQuestion = async () => {
    if (!newQTitle.trim() || !newQProblem.trim()) return;
    setAddingQuestion(true);
    try {
      const res = await fetch(
        API_BASE + `/api/labs/${selectedLab.lab_id}/questions?teacher_id=${user.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newQTitle.trim(), problem: newQProblem.trim() }) }
      );
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
      const data = await res.json();
      setQuestions(prev => [...prev, { ...data, test_cases: data.test_cases || [] }]);
      setNewQTitle(''); setNewQProblem(''); setShowAddQuestion(false);
    } catch (e) { setError(e.message); }
    finally { setAddingQuestion(false); }
  };

  // ── Add Test Case ─────────────────────────────────────────────
  const handleAddTestCase = async (question) => {
    if (!newTcInput.trim()) return;
    setAddingTc(true);
    const tcInput = newTcInput.trim().replace(/\.$/, '');
    try {
      const res = await fetch(
        API_BASE + `/api/labs/${selectedLab.lab_id}/questions/${question.question_id}/testcases?teacher_id=${user.id}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input: tcInput, expected_output: newTcExpected }) }
      );
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || `HTTP ${res.status}`); }
      const tc = await res.json();
      setQuestions(prev => prev.map(q =>
        q.question_id === question.question_id ? { ...q, test_cases: [...(q.test_cases || []), tc] } : q
      ));
      setNewTcInput(''); setNewTcExpected('true');
    } catch (e) { setError(e.message); }
    finally { setAddingTc(false); }
  };

  const handleDeleteTestCase = (questionId, testcaseId) => {
    setQuestions(prev => prev.map(q =>
      q.question_id === questionId
        ? { ...q, test_cases: q.test_cases.filter(tc => tc.testcase_id !== testcaseId) }
        : q
    ));
  };

  // ── breadcrumb ────────────────────────────────────────────────
  const breadcrumb = () => {
    const parts = ['Classroom'];
    if (selectedRoom) parts.push(selectedRoom.class_name);
    if (selectedLab) parts.push(selectedLab.title);
    return parts;
  };

  const thStyle = {
    padding: '10px 24px', fontSize: 11, fontWeight: 700,
    color: 'var(--muted)', textAlign: 'left',
    textTransform: 'uppercase', letterSpacing: '.05em',
  };

  const fmtTime = iso => iso ? new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

  const canEditLab = role === 'teacher' && selectedLab?.status === 'inactive';

  // ── shared input style ────────────────────────────────────────
  const inputStyle = {
    padding: '8px 12px', borderRadius: 6,
    border: '1px solid var(--border)', fontSize: 13, outline: 'none',
    fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  };

  return (
    <div className="fade-in" style={{ padding: '32px 24px', fontFamily: "'Google Sans', sans-serif", overflowY: 'auto', height: '100%' }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {breadcrumb().map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: 'var(--muted)', fontSize: 13 }}>/</span>}
              <span
                style={{
                  fontSize: 13,
                  color: i === breadcrumb().length - 1 ? '#111827' : 'var(--muted)',
                  fontWeight: i === breadcrumb().length - 1 ? 600 : 400,
                  cursor: i < breadcrumb().length - 1 ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (i === 0) { setSelectedRoom(null); setLabs([]); setSelectedLab(null); setQuestions([]); setShowStudents(false); setStudents([]); }
                  else if (i === 1) { setSelectedLab(null); setQuestions([]); }
                }}
              >{b}</span>
            </React.Fragment>
          ))}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--ink)' }}>
          {selectedLab ? selectedLab.title : selectedRoom ? selectedRoom.class_name : 'Classroom'}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          {selectedLab
            ? `${questions.length} question${questions.length !== 1 ? 's' : ''} in this lab`
            : selectedRoom
              ? `${labs.length} lab${labs.length !== 1 ? 's' : ''} · ${selectedRoom.class_size ?? 0} student${selectedRoom.class_size !== 1 ? 's' : ''}`
              : role === 'teacher'
                ? 'Manage your classrooms and track student progress'
                : 'View your enrolled classrooms and labs'}
        </p>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', marginBottom: 20, color: '#991B1B', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════
          VIEW: Questions for selected lab
      ════════════════════════════════════════════════════════ */}
      {selectedLab && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <button
              onClick={() => { setSelectedLab(null); setQuestions([]); setShowAddQuestion(false); setExpandedQuestion(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 13, fontWeight: 600, padding: 0 }}
            >
              <Icon name="arrow_left" size={14} color={accentHex} /> Back to labs
            </button>

            {role === 'teacher' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {selectedLab.status !== 'inactive' && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Questions can only be added while inactive
                  </span>
                )}
                <button
                  onClick={() => setShowAddQuestion(v => !v)}
                  disabled={selectedLab.status !== 'inactive'}
                  style={{
                    padding: '7px 16px', borderRadius: 8,
                    border: `1px solid ${selectedLab.status === 'inactive' ? accentHex : 'var(--border)'}`,
                    background: showAddQuestion ? accentHex : 'transparent',
                    color: showAddQuestion ? '#fff' : (selectedLab.status === 'inactive' ? accentHex : 'var(--muted)'),
                    fontSize: 13, fontWeight: 600,
                    cursor: selectedLab.status === 'inactive' ? 'pointer' : 'not-allowed',
                    opacity: selectedLab.status === 'inactive' ? 1 : 0.5,
                  }}
                >
                  + Add Question
                </button>
              </div>
            )}
          </div>

          {/* Add Question form */}
          {role === 'teacher' && showAddQuestion && canEditLab && (
            <div style={{ padding: '18px 20px', marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>New Question</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input autoFocus value={newQTitle} onChange={e => setNewQTitle(e.target.value)} placeholder="Question title…" style={inputStyle} />
                <textarea value={newQProblem} onChange={e => setNewQProblem(e.target.value)} placeholder="Problem description…" rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleAddQuestion} disabled={addingQuestion || !newQTitle.trim() || !newQProblem.trim()}
                    style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: accentHex, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (addingQuestion || !newQTitle.trim() || !newQProblem.trim()) ? 0.5 : 1 }}>
                    {addingQuestion ? 'Adding…' : 'Add Question'}
                  </button>
                  <button onClick={() => { setShowAddQuestion(false); setNewQTitle(''); setNewQProblem(''); }}
                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingQuestions ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading questions…</div>
          ) : questions.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>
              {role === 'teacher' && canEditLab ? 'No questions yet — add one above.' : 'No questions in this lab yet.'}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {questions.map((q, i) => (
                <Card key={q.question_id} style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, background: accentHex + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: accentHex }}>
                        {i + 1}
                      </div>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 15 }}>Question {i + 1}</span>
                        {q.title && <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{q.title}</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {canEditLab && (
                        <button
                          onClick={() => setExpandedQuestion(expandedQuestion === q.question_id ? null : q.question_id)}
                          style={{
                            padding: '6px 14px', borderRadius: 8, border: `1px solid ${accentHex}`,
                            background: expandedQuestion === q.question_id ? accentHex + '15' : 'transparent',
                            color: accentHex, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          }}
                        >
                          + Test Cases
                        </button>
                      )}
                      <button
                        onClick={() => handleStartCoding(q)}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: accentHex, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                      >
                        {role === 'teacher'
                          ? <><Icon name="chart" size={14} color="#fff" /> See Results</>
                          : <><Icon name="code" size={14} color="#fff" /> Start Coding</>}
                      </button>
                    </div>
                  </div>

                  <div style={{ padding: '18px 24px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Problem</div>
                    <pre style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink)', whiteSpace: 'pre-wrap', margin: 0, fontFamily: "'Google Sans', sans-serif", background: 'transparent' }}>
                      {q.problem}
                    </pre>
                  </div>

                  {q.test_cases && q.test_cases.length > 0 && (
                    <div style={{ padding: '0 24px 18px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Test Cases ({q.test_cases.length})</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {q.test_cases.map((tc, ti) => (
                          <TestCaseRow key={tc.testcase_id} tc={tc} index={ti} canEdit={canEditLab}
                            onDelete={(id) => handleDeleteTestCase(q.question_id, id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Inline add-test-case */}
                  {canEditLab && expandedQuestion === q.question_id && (
                    <div style={{ margin: '0 24px 18px', padding: '14px 16px', background: '#F0FDF4', border: '1px solid #6EE7B7', borderRadius: 8 }}>
                      <div style={{ fontWeight: 600, fontSize: 12, color: '#065F46', marginBottom: 10 }}>Add Test Case</div>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input value={newTcInput} onChange={e => setNewTcInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && !addingTc && handleAddTestCase(q)}
                          placeholder="e.g. max(3,5,X)"
                          style={{ flex: '1 1 180px', padding: '7px 10px', borderRadius: 6, border: '1px solid #6EE7B7', fontSize: 12, fontFamily: 'monospace', outline: 'none' }} />
                        <select value={newTcExpected} onChange={e => setNewTcExpected(e.target.value)}
                          style={{ padding: '7px 8px', borderRadius: 6, border: '1px solid #6EE7B7', fontSize: 12, background: 'var(--white)' }}>
                          <option value="true">expected: true</option>
                          <option value="false">expected: false</option>
                        </select>
                        <button onClick={() => handleAddTestCase(q)} disabled={addingTc || !newTcInput.trim()}
                          style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: '#10B981', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: (addingTc || !newTcInput.trim()) ? 0.4 : 1 }}>
                          {addingTc ? 'Adding…' : 'Add'}
                        </button>
                        <button onClick={() => { setExpandedQuestion(null); setNewTcInput(''); setNewTcExpected('true'); }}
                          style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #6EE7B7', background: 'var(--white)', fontSize: 12, cursor: 'pointer', color: '#065F46' }}>
                          Done
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: '#065F46', marginTop: 6 }}>Press Enter or click Add. Trailing dots are stripped automatically.</div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          VIEW: Labs table for selected classroom
      ════════════════════════════════════════════════════════ */}
      {selectedRoom && !selectedLab && (
        <>
          {/* Top bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
            <button
              onClick={() => { setSelectedRoom(null); setLabs([]); setShowStudents(false); setStudents([]); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 13, fontWeight: 600, padding: 0 }}
            >
              <Icon name="arrow_left" size={14} color={accentHex} /> Back to classrooms
            </button>

            {role === 'teacher' && (
              <div style={{ display: 'flex', gap: 8 }}>
                {/* Manage Students toggle */}
                <button
                  onClick={() => setShowStudents(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 16px', borderRadius: 8,
                    border: `1px solid ${showStudents ? accentHex : 'var(--border)'}`,
                    background: showStudents ? accentHex + '15' : 'transparent',
                    color: showStudents ? accentHex : 'var(--muted)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                    <circle cx="6" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M1 13c0-2.5 2-4 5-4s5 1.5 5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M11 7l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Students
                </button>

                {/* Add Lab */}
                <button
                  onClick={() => setShowAddLab(v => !v)}
                  style={{
                    padding: '7px 16px', borderRadius: 8,
                    border: `1px solid ${accentHex}`,
                    background: showAddLab ? accentHex : 'transparent',
                    color: showAddLab ? '#fff' : accentHex,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  + Add Lab
                </button>
              </div>
            )}
          </div>

          {/* ── Student management panel ─────────────────────── */}
          {role === 'teacher' && showStudents && (
            <div style={{
              marginBottom: 20, borderRadius: 12,
              border: '1px solid var(--border)', background: '#FAFAFA', overflow: 'hidden',
            }}>
              {/* Panel header */}
              <div style={{
                padding: '14px 20px', borderBottom: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--white)',
              }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Student Roster</span>
                  <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--muted)' }}>
                    {students.length} enrolled
                  </span>
                </div>

                {/* Add student inline form */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={addStudentId}
                    onChange={e => setAddStudentId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !addingStudent && handleAddStudent()}
                    placeholder="Student ID…"
                    style={{
                      padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)',
                      fontSize: 12, outline: 'none', width: 160,
                    }}
                  />
                  <button
                    onClick={handleAddStudent}
                    disabled={addingStudent || !addStudentId.trim()}
                    style={{
                      padding: '6px 14px', borderRadius: 6, border: 'none',
                      background: accentHex, color: '#fff', fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', opacity: (addingStudent || !addStudentId.trim()) ? 0.5 : 1,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {addingStudent ? 'Adding…' : '+ Add'}
                  </button>
                </div>
              </div>

              {studentError && (
                <div style={{ padding: '8px 20px', background: '#FEF2F2', color: '#991B1B', fontSize: 12, borderBottom: '1px solid #FECACA' }}>
                  {studentError}
                  <button onClick={() => setStudentError('')} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontWeight: 700 }}>×</button>
                </div>
              )}

              {/* Student list */}
              {loadingStudents ? (
                <div style={{ padding: '20px', color: 'var(--muted)', fontSize: 13 }}>Loading students…</div>
              ) : students.length === 0 ? (
                <div style={{ padding: '20px', color: 'var(--muted)', fontSize: 13 }}>
                  No students enrolled yet. Add a student by ID above.
                </div>
              ) : (
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {students.map((s, i) => {
                    const displayName = s.username || s.display_name || s.name || s.student_id;
                    const subLine = s.email || `ID: ${s.student_id}`;
                    const isKicking = String(kickingId) === String(s.student_id);
                    return (
                      <div
                        key={s.student_id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 12,
                          padding: '10px 20px',
                          borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                          background: isKicking ? '#FEF2F2' : 'var(--white)',
                          transition: 'background .15s',
                        }}
                      >
                        <InitialAvatar name={displayName} size={34} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {displayName}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{subLine}</div>
                        </div>
                        <button
                          onClick={() => handleKickStudent(s.student_id)}
                          disabled={isKicking}
                          title="Remove from classroom"
                          style={{
                            padding: '5px 12px', borderRadius: 6, border: '1px solid #FECACA',
                            background: isKicking ? '#FEE2E2' : 'var(--white)',
                            color: '#EF4444', fontSize: 12, fontWeight: 600,
                            cursor: isKicking ? 'not-allowed' : 'pointer',
                            opacity: isKicking ? 0.6 : 1, flexShrink: 0,
                          }}
                        >
                          {isKicking ? 'Removing…' : 'Kick'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Add Lab form */}
          {role === 'teacher' && showAddLab && (
            <div style={{ padding: '18px 20px', marginBottom: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input autoFocus value={newLabTitle} onChange={e => setNewLabTitle(e.target.value)}
                  placeholder="Lab title…" style={inputStyle} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Active from (students can start)
                    <input type="datetime-local" value={newLabActiveTime} onChange={e => setNewLabActiveTime(e.target.value)}
                      style={{ display: 'block', marginTop: 4, ...inputStyle }} />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Complete at (lab closes)
                    <input type="datetime-local" value={newLabCompleteTime} onChange={e => setNewLabCompleteTime(e.target.value)}
                      style={{ display: 'block', marginTop: 4, ...inputStyle }} />
                  </label>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Questions and test cases can be added while the lab is <strong>inactive</strong>.
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={handleAddLab} disabled={addingLab || !newLabTitle.trim() || !newLabActiveTime || !newLabCompleteTime}
                    style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: accentHex, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: (addingLab || !newLabTitle.trim() || !newLabActiveTime || !newLabCompleteTime) ? 0.5 : 1 }}>
                    {addingLab ? 'Creating…' : 'Create Lab'}
                  </button>
                  <button onClick={() => { setShowAddLab(false); setNewLabTitle(''); setNewLabActiveTime(''); setNewLabCompleteTime(''); }}
                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--white)', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingLabs ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading labs…</div>
          ) : labs.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>No labs in this classroom yet.</div>
          ) : (
            <Card style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface)' }}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Title</th>
                    <th style={thStyle}>Questions</th>
                    <th style={thStyle}>Active From</th>
                    <th style={thStyle}>Closes At</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map((lab, i) => {
                    const canEnter = role === 'teacher' || lab.status === 'active';
                    return (
                      <tr key={lab.lab_id} onClick={() => handleLabClick(lab)}
                        style={{ borderTop: '1px solid var(--surface)', cursor: canEnter ? 'pointer' : 'default', opacity: canEnter ? 1 : 0.6, transition: 'background .15s' }}
                        onMouseEnter={e => { if (canEnter) e.currentTarget.style.background = 'var(--surface)'; }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                        <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ padding: '14px 24px', fontWeight: 600, fontSize: 14 }}>
                          {lab.title}
                          {role === 'teacher' && lab.status === 'inactive' && (
                            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 600, background: '#E0E7FF', color: '#3730A3', padding: '2px 7px', borderRadius: 99 }}>editable</span>
                          )}
                        </td>
                        <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--muted)' }}>{lab.question_count}</td>
                        <td style={{ padding: '14px 24px', fontSize: 12, color: 'var(--muted)' }}>{fmtTime(lab.active_time)}</td>
                        <td style={{ padding: '14px 24px', fontSize: 12, color: 'var(--muted)' }}>{fmtTime(lab.complete_time)}</td>
                        <td style={{ padding: '14px 24px' }}><StatusBadge status={lab.status} /></td>
                        <td style={{ padding: '14px 24px', textAlign: 'right' }}>
                          {canEnter && <Icon name="arrow_left" size={14} color="var(--muted)" style={{ transform: 'rotate(180deg)' }} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {/* ════════════════════════════════════════════════════════
          VIEW: Classroom cards
      ════════════════════════════════════════════════════════ */}
      {!selectedRoom && (
        <>
          {/* Header row with Create Classroom button for teachers */}
          {role === 'teacher' && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
              <button
                onClick={() => setShowCreateRoom(v => !v)}
                style={{
                  padding: '8px 18px', borderRadius: 8,
                  border: `1px solid ${accentHex}`,
                  background: showCreateRoom ? accentHex : 'transparent',
                  color: showCreateRoom ? '#fff' : accentHex,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                + Create Classroom
              </button>
            </div>
          )}

          {/* Create Classroom form */}
          {role === 'teacher' && showCreateRoom && (
            <div style={{ padding: '20px', marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>New Classroom</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Classroom Name *</div>
                  <input
                    autoFocus
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !creatingRoom && handleCreateRoom()}
                    placeholder="e.g. Introduction to Prolog"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Prerequisites <span style={{ fontWeight: 400, color: 'var(--muted)' }}>(optional)</span></div>
                  <input
                    value={newRoomPrereqs}
                    onChange={e => setNewRoomPrereqs(e.target.value)}
                    placeholder="e.g. Discrete Mathematics"
                    style={inputStyle}
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <button
                    onClick={handleCreateRoom}
                    disabled={creatingRoom || !newRoomName.trim()}
                    style={{
                      padding: '8px 20px', borderRadius: 7, border: 'none',
                      background: accentHex, color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: (creatingRoom || !newRoomName.trim()) ? 'not-allowed' : 'pointer',
                      opacity: (creatingRoom || !newRoomName.trim()) ? 0.5 : 1,
                    }}
                  >
                    {creatingRoom ? 'Creating…' : 'Create Classroom'}
                  </button>
                  <button
                    onClick={() => { setShowCreateRoom(false); setNewRoomName(''); setNewRoomPrereqs(''); }}
                    style={{ padding: '8px 14px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--white)', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingRooms ? (
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>Loading classrooms…</div>
          ) : classrooms.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
              {role === 'teacher' ? 'No classrooms yet — create one above.' : 'You are not enrolled in any classrooms.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16, marginBottom: 32 }}>
              {classrooms.map(room => (
                <div
                  key={room.class_id}
                  onClick={() => handleRoomClick(room)}
                  style={{
                    background: 'var(--white)', borderRadius: 16,
                    border: '1px solid var(--border)', padding: 22,
                    cursor: 'pointer', transition: 'all .2s',
                    borderTop: `4px solid ${room.lab_ids?.length > 0 ? accentHex : 'var(--border)'}`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: accentHex + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="book" size={20} color={accentHex} />
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{room.class_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>ID: {room.class_id}</div>
                  {room.prerequisites && room.prerequisites !== 'None' && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>Prerequisites: {room.prerequisites}</div>
                  )}
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{room.class_size}</span>
                      <span style={{ color: 'var(--muted)' }}> students</span>
                    </div>
                    <div style={{ fontSize: 13 }}>
                      <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{room.lab_ids?.length ?? 0}</span>
                      <span style={{ color: 'var(--muted)' }}> labs</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ClassroomPage;