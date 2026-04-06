import React from 'react';
import Icon from './Icon.js';
import Avatar from './Avatar.js';

const Sidebar = ({ role, activePage, onNavigate, user, onLogout, collapsed = false, onCollapseChange }) => {
  const accent = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';
  const accentLight = role === 'teacher' ? 'var(--sky-light)' : 'var(--mint-light)';

  const navItems = [
    { id: 'classroom', icon: 'classroom', label: 'Classroom' },
    // { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'code', icon: 'code', label: 'Code Editor' },
    { id: 'settings', icon: 'settings', label: 'Settings' },
  ];

  return (
    <aside style={{
      width: collapsed ? '80px' : 'var(--sidebar-w)', 
      height: '100vh',
      background: 'var(--white)',
      borderRight: '1px solid var(--border)',
      display: 'flex', 
      flexDirection: 'column',
      position: 'fixed', 
      top: 0, 
      left: 0, 
      zIndex: 100,
      transition: 'width 0.3s ease',
      overflow: 'hidden'
    }}>
      <div style={{
        padding: collapsed ? '20px 14px' : '20px 20px 16px',
        borderBottom: '1px solid var(--surface)',
        display: 'flex',
        flexDirection: collapsed ? 'column' : 'row', // <-- Retaining the previous fix
        gap: collapsed ? '16px' : '0',               // <-- Retaining the previous fix
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between'
      }}>
        {!collapsed && (
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
        )}
        {collapsed && (
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
        )}
        <button
          onClick={() => onCollapseChange && onCollapseChange(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          style={{
            background: accentLight,
            border: `1px solid ${accent}`,
            color: accent,
            cursor: 'pointer',
            padding: collapsed ? '8px' : '6px',
            borderRadius: collapsed ? '10px' : '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease',
            opacity: 1,
            boxShadow: '0 2px 5px rgba(0,0,0,0.05)',
            minWidth: '40px',
            minHeight: '40px',
            flexShrink: 0
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = accent;
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = accentLight;
            e.currentTarget.style.color = accent;
          }}
        >
          {collapsed ? <Icon name="menu" size={20} /> : <Icon name="arrow_left" size={18} />}
        </button>
      </div>

      <nav style={{ flex: 1, padding: collapsed ? '12px 6px' : '12px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {navItems.map(item => {
          const active = activePage === item.id;
          return (
            <button 
              key={item.id} 
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : ''}
              style={{
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: collapsed ? 'center' : 'flex-start',
                gap: 12,
                padding: collapsed ? '10px' : '10px 14px',
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
              {!collapsed && item.label}
            </button>
          );
        })}
      </nav>

      <div style={{
        padding: collapsed ? '12px 6px' : '12px 14px', 
        borderTop: '1px solid var(--border)',
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 10
      }}>
        <Avatar name={user.display_name} size={34} role={role} />
        {!collapsed && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user.display_name}
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
          </>
        )}
        {collapsed && (
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
        )}
      </div>
    </aside>
  );
};

export default Sidebar;