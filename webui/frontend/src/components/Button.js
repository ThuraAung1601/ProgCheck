import React from 'react';

const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md',
  onClick,
  disabled = false,
  style = {},
  ...props 
}) => {
  const getVariantStyle = () => {
    const variants = {
      primary: {
        background: 'var(--mint)',
        color: '#fff',
      },
      secondary: {
        background: '#fff',
        border: '1.5px solid var(--border)',
        color: 'var(--ink-2)',
      },
      danger: {
        background: 'var(--danger)',
        color: '#fff',
      },
    };
    return variants[variant] || variants.primary;
  };

  const getSizeStyle = () => {
    const sizes = {
      sm: { padding: '7px 14px', fontSize: '12px' },
      md: { padding: '11px 20px', fontSize: '14px' },
      lg: { padding: '13px 28px', fontSize: '15px' },
    };
    return sizes[size] || sizes.md;
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        borderRadius: '9px',
        fontWeight: 600,
        border: 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all .15s',
        ...getVariantStyle(),
        ...getSizeStyle(),
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;
