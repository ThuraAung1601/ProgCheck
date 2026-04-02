import React from 'react';

const Toggle = ({ value, onChange }) => (
  <div 
    onClick={() => onChange(!value)} 
    style={{
      width: 44, 
      height: 24, 
      borderRadius: 12,
      background: value ? 'var(--mint)' : 'var(--border)',
      position: 'relative', 
      cursor: 'pointer', 
      transition: 'background .2s',
      flexShrink: 0
    }}
  >
    <div 
      style={{
        width: 18, 
        height: 18, 
        borderRadius: '50%', 
        background: '#fff',
        position: 'absolute', 
        top: 3,
        left: value ? 23 : 3, 
        transition: 'left .2s',
        boxShadow: '0 1px 4px rgba(0,0,0,.15)'
      }} 
    />
  </div>
);

export default Toggle;
