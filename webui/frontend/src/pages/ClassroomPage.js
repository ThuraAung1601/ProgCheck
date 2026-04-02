import React from 'react';
import Icon from '../components/Icon.js';
import Card from '../components/Card.js';
import Button from '../components/Button.js';

const ClassroomPage = ({ role }) => {
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';
  
  const rooms = [
    { id: 'CS101', name: 'Introduction to Prolog', students: 24, labs: 8, active: true, code: 'INF-2026' },
    { id: 'CS202', name: 'Logic Programming', students: 18, labs: 5, active: true, code: 'LP-2026' },
    { id: 'CS303', name: 'AI Fundamentals', students: 31, labs: 12, active: false, code: 'AIF-2026' },
  ];
  
  const labs = [
    { id: 1, title: 'Basic Facts & Queries', due: 'Apr 5', status: 'submitted', score: 92 },
    { id: 2, title: 'List Operations', due: 'Apr 12', status: 'pending', score: null },
    { id: 3, title: 'Recursive Predicates', due: 'Apr 19', status: 'pending', score: null },
    { id: 4, title: 'Cut & Negation', due: 'Apr 26', status: 'late', score: 45 },
  ];

  return (
    <div className="fade-in" style={{ padding: '32px 24px', fontFamily: "'Google Sans', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em' , color: '#111827' }}>Classroom</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          {role === 'teacher' 
            ? 'Manage your classrooms and track student progress' 
            : 'View your enrolled classrooms and labs'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 16, marginBottom: 32 }}>
        {rooms.map(room => (
          <div 
            key={room.id}
            style={{
              background: '#fff', 
              borderRadius: 16, 
              border: '1px solid var(--border)',
              padding: 22, 
              cursor: 'pointer', 
              transition: 'all .2s',
              borderTop: `4px solid ${room.active ? accent : 'var(--border)'}`
            }}
            onMouseEnter={e => {
              e.currentTarget.style.boxShadow = 'var(--shadow)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.boxShadow = 'none';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
              <div style={{
                width: 42, 
                height: 42, 
                borderRadius: 10, 
                background: room.active ? accent + '20' : 'var(--surface)',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center'
              }}>
                <Icon name="book" size={20} color={room.active ? accent : 'var(--muted)'} />
              </div>
              {room.active && (
                <span style={{ fontSize: 11, fontWeight: 600, color: accent, background: accent + '15', padding: '3px 10px', borderRadius: 99 }}>
                  Active
                </span>
              )}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{room.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>{room.id}</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{room.students}</span> 
                <span style={{ color: 'var(--muted)' }}> students</span>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{room.labs}</span> 
                <span style={{ color: 'var(--muted)' }}> labs</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Card style={{ overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface)', fontWeight: 700, fontSize: 16 }}>Lab Assignments</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {labs.map((lab, i) => (
              <tr key={lab.id} style={{ borderBottom: i < labs.length - 1 ? '1px solid var(--surface)' : 'none' }}>
                <td style={{ padding: '12px 24px', fontSize: 14 }}>{lab.id}</td>
                <td style={{ padding: '12px 24px', fontWeight: 600 }}>{lab.title}</td>
                <td style={{ padding: '12px 24px', color: 'var(--muted)' }}>{lab.due}</td>
                <td style={{ padding: '12px 24px' }}>
                  <span style={{
                    fontSize: 11, 
                    fontWeight: 600,
                    background: lab.status === 'submitted' ? '#D1FAE5' : lab.status === 'late' ? '#FEF3C7' : 'var(--sky-light)',
                    color: lab.status === 'submitted' ? '#065F46' : lab.status === 'late' ? '#92400E' : 'var(--sky-dark)',
                    padding: '3px 10px', 
                    borderRadius: 99
                  }}>
                    {lab.status === 'submitted' ? 'Submitted' : lab.status === 'late' ? 'Late' : 'Pending'}
                  </span>
                </td>
                <td style={{ padding: '12px 24px', fontWeight: 700, textAlign: 'right', color: lab.score >= 70 ? 'var(--mint-dark)' : lab.score ? 'var(--danger)' : 'var(--muted)' }}>
                  {lab.score ? `${lab.score}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
};

export default ClassroomPage;
