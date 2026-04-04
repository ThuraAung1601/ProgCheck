import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon.js';
import Card from '../components/Card.js';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

// Status badge config
const STATUS_CFG = {
  active:    { bg: '#D1FAE5', color: '#065F46', label: 'Active' },
  inactive:  { bg: 'var(--surface)', color: 'var(--muted)', label: 'Inactive' },
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

const ClassroomPage = ({ role, user, onOpenAssignment }) => {
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';

  // ── state ──────────────────────────────────────────────────
  const [classrooms, setClassrooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [labs, setLabs] = useState([]);
  const [selectedLab, setSelectedLab] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingLabs, setLoadingLabs] = useState(false);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [error, setError] = useState(null);
  const [showAddLab, setShowAddLab] = useState(false);
  const [newLabTitle, setNewLabTitle] = useState('');
  const [newLabActiveTime, setNewLabActiveTime] = useState('');
  const [newLabCompleteTime, setNewLabCompleteTime] = useState('');
  const [addingLab, setAddingLab] = useState(false);

  // ── fetch classrooms ───────────────────────────────────────
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

  // ── handlers ───────────────────────────────────────────────
  const handleRoomClick = (room) => {
    if (selectedRoom?.class_id === room.class_id) {
      setSelectedRoom(null); setLabs([]); setSelectedLab(null); setQuestions([]);
      return;
    }
    setSelectedRoom(room);
    setSelectedLab(null); setQuestions([]);
    setLoadingLabs(true); setLabs([]);

    fetch(API_BASE + `/api/labs/classroom/${room.class_id}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setLabs(d.labs || []); setLoadingLabs(false); })
      .catch(e => { setError(e.message); setLoadingLabs(false); });
  };

  const handleLabClick = (lab) => {
    // Students can only enter active labs
    if (role === 'student' && lab.status !== 'active') return;

    if (selectedLab?.lab_id === lab.lab_id) {
      setSelectedLab(null); setQuestions([]);
      return;
    }
    setSelectedLab(lab);
    setLoadingQuestions(true); setQuestions([]);

    fetch(API_BASE + `/api/labs/${lab.lab_id}/questions`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setQuestions(d || []); setLoadingQuestions(false); })
      .catch(e => { setError(e.message); setLoadingQuestions(false); });
  };

  const handleStartCoding = (question) => {
    if (onOpenAssignment) {
      onOpenAssignment({ question, lab: selectedLab, classroom: selectedRoom });
    }
  };

  const handleAddLab = async () => {
    if (!newLabTitle.trim() || !selectedRoom) return;
    if (!newLabActiveTime || !newLabCompleteTime) {
      setError('Please set both Active Time and Complete Time for the lab.');
      return;
    }
    if (new Date(newLabCompleteTime) <= new Date(newLabActiveTime)) {
      setError('Complete time must be after active time.');
      return;
    }
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setLabs(prev => [...prev, data]);
      setNewLabTitle('');
      setNewLabActiveTime('');
      setNewLabCompleteTime('');
      setShowAddLab(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setAddingLab(false);
    }
  };

  // ── breadcrumb ─────────────────────────────────────────────
  const breadcrumb = () => {
    const parts = ['Classroom'];
    if (selectedRoom) parts.push(selectedRoom.class_name);
    if (selectedLab) parts.push(selectedLab.title);
    return parts;
  };

  // ── styles ─────────────────────────────────────────────────
  const thStyle = {
    padding: '10px 24px', fontSize: 11, fontWeight: 700,
    color: 'var(--muted)', textAlign: 'left',
    textTransform: 'uppercase', letterSpacing: '.05em',
  };

  const fmtTime = iso => iso ? new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }) : '—';

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
                  fontSize: 13, color: i === breadcrumb().length - 1 ? '#111827' : 'var(--muted)',
                  fontWeight: i === breadcrumb().length - 1 ? 600 : 400,
                  cursor: i < breadcrumb().length - 1 ? 'pointer' : 'default',
                }}
                onClick={() => {
                  if (i === 0) { setSelectedRoom(null); setLabs([]); setSelectedLab(null); setQuestions([]); }
                  else if (i === 1) { setSelectedLab(null); setQuestions([]); }
                }}
              >{b}</span>
            </React.Fragment>
          ))}
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', color: '#111827' }}>
          {selectedLab ? selectedLab.title : selectedRoom ? selectedRoom.class_name : 'Classroom'}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          {selectedLab
            ? `${questions.length} question${questions.length !== 1 ? 's' : ''} in this lab`
            : selectedRoom
              ? `${labs.length} lab${labs.length !== 1 ? 's' : ''} in this classroom`
              : role === 'teacher'
                ? 'Manage your classrooms and track student progress'
                : 'View your enrolled classrooms and labs'}
        </p>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 16px', marginBottom: 20, color: '#991B1B', fontSize: 13 }}>
          {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontWeight: 700 }}>×</button>
        </div>
      )}

      {/* ── VIEW: Questions for selected lab ─────────────────── */}
      {selectedLab && (
        <>
          <button
            onClick={() => { setSelectedLab(null); setQuestions([]); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 13, fontWeight: 600, marginBottom: 20, padding: 0 }}
          >
            <Icon name="arrow_left" size={14} color={accent} /> Back to labs
          </button>

          {loadingQuestions ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading questions...</div>
          ) : questions.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>No questions in this lab yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {questions.map((q, i) => (
                <Card key={q.question_id} style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 13, fontWeight: 700, color: accent,
                      }}>
                        {i + 1}
                      </div>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>Question {i + 1}</span>
                    </div>
                    <button
                      onClick={() => handleStartCoding(q)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '8px 18px', borderRadius: 8, border: 'none',
                        background: accent, color: '#fff', fontSize: 13, fontWeight: 600,
                        cursor: 'pointer', transition: 'opacity .2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                    >
                      {role === 'teacher'
                        ? <><Icon name="chart" size={14} color="#fff" /> See Results</>
                        : <><Icon name="code" size={14} color="#fff" /> Start Coding</>
                      }
                    </button>
                  </div>
                  <div style={{ padding: '18px 24px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>Problem</div>
                    <pre style={{ fontSize: 13, lineHeight: 1.6, color: '#111827', whiteSpace: 'pre-wrap', margin: 0, fontFamily: "'Google Sans', sans-serif" }}>
                      {q.problem}
                    </pre>
                  </div>
                  {q.test_cases && q.test_cases.length > 0 && (
                    <div style={{ padding: '0 24px 18px' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                        Test Cases ({q.test_cases.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {q.test_cases.map((tc, ti) => (
                          <div key={tc.testcase_id} style={{
                            display: 'flex', gap: 16, padding: '8px 12px',
                            background: '#F9FAFB', borderRadius: 6, fontSize: 12, fontFamily: 'monospace',
                          }}>
                            <span style={{ color: 'var(--muted)', minWidth: 20 }}>#{ti + 1}</span>
                            <span style={{ color: '#111827' }}><strong>Input:</strong> {tc.input}</span>
                            <span style={{ color: '#065F46' }}><strong>Expected:</strong> {tc.expected_output}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── VIEW: Labs table for selected classroom ──────────── */}
      {selectedRoom && !selectedLab && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <button
              onClick={() => { setSelectedRoom(null); setLabs([]); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: accent, fontSize: 13, fontWeight: 600, padding: 0 }}
            >
              <Icon name="arrow_left" size={14} color={accent} /> Back to classrooms
            </button>
            {role === 'teacher' && (
              <button
                onClick={() => setShowAddLab(v => !v)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 8, border: `1px solid ${accent}`,
                  background: showAddLab ? accent : 'transparent',
                  color: showAddLab ? '#fff' : accent,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                + Add Lab
              </button>
            )}
          </div>

          {/* Add Lab form */}
          {role === 'teacher' && showAddLab && (
            <div style={{
              padding: '18px 20px', marginBottom: 16,
              background: '#F9FAFB', border: '1px solid var(--border)', borderRadius: 10,
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input
                  autoFocus
                  value={newLabTitle}
                  onChange={e => setNewLabTitle(e.target.value)}
                  placeholder="Lab title…"
                  style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Active from (students can start)
                    <input
                      type="datetime-local"
                      value={newLabActiveTime}
                      onChange={e => setNewLabActiveTime(e.target.value)}
                      style={{ display: 'block', marginTop: 4, width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                    Complete at (lab closes)
                    <input
                      type="datetime-local"
                      value={newLabCompleteTime}
                      onChange={e => setNewLabCompleteTime(e.target.value)}
                      style={{ display: 'block', marginTop: 4, width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}
                    />
                  </label>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  Questions and test cases can be added while the lab is <strong>inactive</strong> (before active time).
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={handleAddLab}
                    disabled={addingLab || !newLabTitle.trim() || !newLabActiveTime || !newLabCompleteTime}
                    style={{
                      padding: '8px 18px', borderRadius: 6, border: 'none',
                      background: accent, color: '#fff', fontSize: 13, fontWeight: 600,
                      cursor: 'pointer', opacity: (addingLab || !newLabTitle.trim() || !newLabActiveTime || !newLabCompleteTime) ? 0.5 : 1,
                    }}
                  >
                    {addingLab ? 'Creating…' : 'Create Lab'}
                  </button>
                  <button
                    onClick={() => { setShowAddLab(false); setNewLabTitle(''); setNewLabActiveTime(''); setNewLabCompleteTime(''); }}
                    style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)', background: '#fff', fontSize: 13, cursor: 'pointer', color: 'var(--muted)' }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadingLabs ? (
            <div style={{ color: 'var(--muted)', fontSize: 14 }}>Loading labs...</div>
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
                      <tr
                        key={lab.lab_id}
                        onClick={() => handleLabClick(lab)}
                        style={{
                          borderTop: '1px solid var(--surface)',
                          cursor: canEnter ? 'pointer' : 'default',
                          opacity: canEnter ? 1 : 0.6,
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => { if (canEnter) e.currentTarget.style.background = '#F9FAFB'; }}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--muted)' }}>{i + 1}</td>
                        <td style={{ padding: '14px 24px', fontWeight: 600, fontSize: 14 }}>{lab.title}</td>
                        <td style={{ padding: '14px 24px', fontSize: 14, color: 'var(--muted)' }}>{lab.question_count}</td>
                        <td style={{ padding: '14px 24px', fontSize: 12, color: 'var(--muted)' }}>{fmtTime(lab.active_time)}</td>
                        <td style={{ padding: '14px 24px', fontSize: 12, color: 'var(--muted)' }}>{fmtTime(lab.complete_time)}</td>
                        <td style={{ padding: '14px 24px' }}>
                          <StatusBadge status={lab.status} />
                        </td>
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

      {/* ── VIEW: Classroom cards ────────────────────────────── */}
      {!selectedRoom && (
        <>
          {loadingRooms ? (
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>Loading classrooms...</div>
          ) : classrooms.length === 0 ? (
            <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 32 }}>
              {role === 'teacher' ? 'No classrooms yet. Create one to get started.' : 'You are not enrolled in any classrooms.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16, marginBottom: 32 }}>
              {classrooms.map(room => (
                <div
                  key={room.class_id}
                  onClick={() => handleRoomClick(room)}
                  style={{
                    background: '#fff', borderRadius: 16,
                    border: '1px solid var(--border)', padding: 22,
                    cursor: 'pointer', transition: 'all .2s',
                    borderTop: `4px solid ${room.lab_ids?.length > 0 ? accent : 'var(--border)'}`,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: accent + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="book" size={20} color={accent} />
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
