import React from 'react';

const Card = ({ children, style = {}, className = '' }) => (
  <div
    className={className}
    style={{
      background: 'var(--white)',
      borderRadius: 16,
      border: '1px solid var(--border)',
      ...style
    }}
  >
    {children}
  </div>
);

export default Card;
