import React, { useState, useMemo } from 'react';
import Icon from './Icon.js';

const InputField = ({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text', 
  readOnly = false,
  badge,
  hint,
  icon 
}) => {
  const [isFocused, setIsFocused] = useState(false);
  
  // Generate a unique ID from the label
  const fieldId = useMemo(() => {
    return `field-${label.toLowerCase().replace(/\s+/g, '-')}`;
  }, [label]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label htmlFor={fieldId} style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-2)' }}>
          {label}
        </label>
        {badge && (
          <span style={{ 
            fontSize: 11, 
            fontWeight: 600, 
            color: 'var(--muted)', 
            letterSpacing: '.04em', 
            background: 'var(--border)', 
            padding: '2px 8px', 
            borderRadius: 99 
          }}>
            {badge}
          </span>
        )}
      </div>
      
      <div style={{ position: 'relative' }}>
        <input 
          id={fieldId}
          name={fieldId}
          value={value} 
          onChange={e => onChange && onChange(e.target.value)}
          placeholder={placeholder} 
          type={type} 
          readOnly={readOnly}
          onFocus={() => !readOnly && setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          style={{
            width: '100%', 
            padding: icon ? '10px 14px 10px 40px' : '10px 14px',
            borderRadius: 8, 
            border: `1.5px solid ${isFocused && !readOnly ? 'var(--mint)' : 'var(--border)'}`,
            background: readOnly ? 'var(--surface)' : 'var(--white)',
            color: readOnly ? 'var(--muted)' : 'var(--ink)',
            fontSize: 14, 
            transition: 'border-color .15s'
          }}
        />
        
        {icon && (
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <Icon name={icon} size={16} color="var(--muted)" />
          </div>
        )}
        
        {readOnly && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
            <Icon name="lock" size={14} color="var(--muted)" />
          </div>
        )}
      </div>
      
      {hint && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: -2 }}>{hint}</p>}
    </div>
  );
};

export default InputField;
