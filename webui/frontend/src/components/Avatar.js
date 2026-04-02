import React from 'react';

const Avatar = ({ name = '', size = 36, role = 'student', onClick, img }) => {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
  const bg = role === 'teacher' ? 'var(--sky)' : 'var(--mint)';

  return (
    <div 
      onClick={onClick} 
      style={{
        width: size, 
        height: size, 
        borderRadius: '50%', 
        background: img ? 'transparent' : bg,
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        fontSize: size * 0.38, 
        fontWeight: 600, 
        color: '#fff',
        cursor: onClick ? 'pointer' : 'default', 
        overflow: 'hidden', 
        flexShrink: 0,
        border: '2px solid var(--border)'
      }}
    >
      {img ? (
        <img src={img} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={name} />
      ) : (
        initials
      )}
    </div>
  );
};

export default Avatar;
