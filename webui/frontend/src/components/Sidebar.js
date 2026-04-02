import React from 'react';
import Icon from './Icon.js';
import Avatar from './Avatar.js';

const Sidebar = ({ role, activePage, onNavigate, user, onLogout }) => {
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';
  const accentLight = role === 'teacher' ? 'var(--sky-light)' : 'var(--mint-light)';

  const navItems = [
    { id: 'classroom', icon: 'classroom', label: 'Classroom' },
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'code', icon: 'code', label: 'Code Editor' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <aside style={{
      width: 'var(--sidebar-w)', 
      height: '100vh',
      background: '#fff', 
      borderRight: '1px solid var(--border)',
      display: 'flex', 
      flexDirection: 'column',
      position: 'fixed', 
      top: 0, 
      left: 0, 
      zIndex: 100
    }}>
      <div style={{
        padding: '20px 20px 16px', 
        borderBottom: '1px solid var(--surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, 
            height: 36, 
            borderRadius: 10,
            background: `linear-gradient(135deg, ${accent}, ${role === 'teacher' ? 'var(--sky-dark)' : 'var(--mint-dark)'})`,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center'
          }}>
            <Icon name="code" size={18} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>ProgCheck</div>
            <div style={{ fontSize: 10, fontWeight: 500, color: accent, textTransform: 'uppercase', letterSpacing: '.08em' }}>
              {role === 'teacher' ? 'Instructor' : 'Student'} Portal
            </div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {navItems.map(item => {
          const active = activePage === item.id;
          return (
            <button 
              key={item.id} 
              onClick={() => onNavigate(item.id)} 
              style={{
                display: 'flex', 
                alignItems: 'center', 
                gap: 12,
                padding: '10px 14px', 
                borderRadius: 10,
                background: active ? accentLight : 'transparent',
                color: active ? accent : 'var(--muted)',
                fontWeight: active ? 600 : 500, 
                fontSize: 14,
                transition: 'all .15s', 
                textAlign: 'left', 
                width: '100%',
                borderTop: 'none',
                borderRight: 'none',
                borderBottom: 'none',
                borderLeft: `3px solid ${active ? accent : 'transparent'}`,
                cursor: 'pointer'
              }}
            >
              <Icon name={item.icon} size={17} color={active ? accent : 'var(--muted)'} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div style={{
        padding: '12px 14px', 
        borderTop: '1px solid var(--border)',
        display: 'flex', 
        alignItems: 'center', 
        gap: 10
      }}>
        <Avatar name={user.name} size={34} role={role} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{user.id}</div>
        </div>
        <button 
          onClick={onLogout} 
          title="Log out"
          style={{
            background: 'none', 
            padding: 6, 
            borderRadius: 8, 
            color: 'var(--muted)',
            transition: 'color .15s',
            border: 'none',
            cursor: 'pointer'
          }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}
        >
          <Icon name="logout" size={16} />
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
