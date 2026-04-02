import React from 'react';
import Icon from '../components/Icon.js';
import Card from '../components/Card.js';

const DashboardPageContent = ({ role, user }) => {
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';
  
  const stats = role === 'student'
    ? [
        { label: 'Labs Completed', value: '6/10', icon: 'check', color: 'var(--mint)' },
        { label: 'Average Score', value: '78%', icon: 'star', color: 'var(--warn)' },
        { label: 'Submissions', value: '14', icon: 'upload', color: 'var(--sky)' },
        { label: 'Pending Labs', value: '4', icon: 'alert', color: 'var(--danger)' },
      ]
    : [
        { label: 'Total Students', value: '73', icon: 'user', color: 'var(--sky)' },
        { label: 'Active Labs', value: '3', icon: 'book', color: 'var(--mint)' },
        { label: 'Submissions Today', value: '21', icon: 'upload', color: 'var(--warn)' },
        { label: 'Avg. Class Score', value: '74%', icon: 'star', color: 'var(--danger)' },
      ];

  const recent = [
    { name: 'Basic Facts & Queries', time: '2h ago', status: 'pass', score: 92 },
    { name: 'List Operations', time: '1d ago', status: 'fail', score: 35 },
    { name: 'Recursive Predicates', time: '3d ago', status: 'pass', score: 88 },
  ];

  return (
    <div className="fade-in" style={{ padding: '32px 24px', fontFamily: "'Google Sans', sans-serif" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', color: '#111827' }}>
          Welcome back, {user.name.split(' ')[0]}
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          Here's what's happening with your {role === 'teacher' ? 'classes' : 'studies'} today.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 28 }}>
        {stats.map(s => (
          <Card key={s.label} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              width: 38, 
              height: 38, 
              borderRadius: 10, 
              background: s.color + '18',
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center'
            }}>
              <Icon name={s.icon} size={18} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--ink)' }}>
                {s.value}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, fontWeight: 500 }}>
                {s.label}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--surface)', fontWeight: 700, fontSize: 15 }}>
            Recent Submissions
          </div>
          {recent.map((r, i) => (
            <div 
              key={i}
              style={{
                padding: '14px 24px', 
                borderBottom: i < recent.length - 1 ? '1px solid var(--surface)' : 'none',
                display: 'flex', 
                alignItems: 'center', 
                gap: 14, 
                transition: 'background .1s',
                cursor: 'pointer'
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--surface)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              <div style={{
                width: 34, 
                height: 34, 
                borderRadius: 9,
                background: r.status === 'pass' ? 'var(--mint-light)' : '#FEF2F2',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                flexShrink: 0
              }}>
                <Icon 
                  name={r.status === 'pass' ? 'check' : 'x'} 
                  size={16} 
                  color={r.status === 'pass' ? 'var(--mint-dark)' : 'var(--danger)'} 
                />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.time}</div>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: r.score >= 70 ? 'var(--mint-dark)' : 'var(--danger)' }}>
                {r.score}%
              </div>
            </div>
          ))}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card style={{
            background: `linear-gradient(135deg, ${accent}, ${role === 'teacher' ? 'var(--sky-dark)' : 'var(--mint-dark)'})`,
            color: '#fff',
            padding: 24
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
              {role === 'teacher' ? 'New Lab Assignment' : 'Submit Prolog Code'}
            </div>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 18, lineHeight: 1.5 }}>
              {role === 'teacher' 
                ? 'Create a new lab for your students with test cases' 
                : 'Head to the code editor to submit your solution'}
            </div>
            <button style={{
              background: 'rgba(255,255,255,.2)', 
              color: '#fff', 
              padding: '9px 18px',
              borderRadius: 8, 
              fontSize: 13, 
              fontWeight: 600, 
              backdropFilter: 'blur(4px)',
              border: 'none',
              cursor: 'pointer'
            }}>
              {role === 'teacher' ? 'Create Lab →' : 'Open Editor →'}
            </button>
          </Card>

          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>Progress</div>
            {[
              { label: 'Lab Completion', pct: 60, color: accent },
              { label: 'Avg Score', pct: 78, color: 'var(--warn)' },
            ].map(p => (
              <div key={p.label} style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
                  <span>{p.label}</span>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{p.pct}%</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 99 }}>
                  <div style={{ height: '100%', width: `${p.pct}%`, background: p.color, borderRadius: 99, transition: 'width .6s' }} />
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};

export default DashboardPageContent;
