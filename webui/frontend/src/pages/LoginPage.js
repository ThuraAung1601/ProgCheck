import React, { useState } from 'react';
import Icon from '../components/Icon.js';
import InputField from '../components/InputField.js';
import Button from '../components/Button.js';

const LoginPage = ({ defaultRole = 'student', onLogin, onBack }) => {
  const [role, setRole] = useState(defaultRole);
  const [id, setId] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const accent = role === 'teacher' ? '#5BA3F5' : '#4ECBA0';
  const accentDark = role === 'teacher' ? '#3681D6' : '#2FA57E';
  const accentLight = role === 'teacher' ? '#EAF2FF' : '#E6F9F2';

  const handleLogin = () => {
    if (!id || !pass) {
      setErr('Please enter both ID and password');
      return;
    }
    
    setErr('');
    setLoading(true);
    
    setTimeout(() => {
      setLoading(false);
      const userData = {
        id,
        name: id === '66011148' ? 'Alex Johnson' : 'Dr. Smith',
        email: `${id}@kmitl.ac.th`
      };
      onLogin(userData, role);
    }, 1200);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#F5F7FA', fontFamily: "'Google Sans', sans-serif" }}>
      <div style={{ 
        flex: 1, 
        display: 'flex', 
        flexDirection: 'column', 
        padding: '40px 56px', 
        justifyContent: 'center', 
        maxWidth: 520 
      }}>
        <button 
          onClick={onBack}
          style={{
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            fontSize: 13, 
            fontWeight: 600,
            color: '#6B7280', 
            background: 'none',
            cursor: 'pointer',
            marginBottom: 48, 
            alignSelf: 'flex-start',
            border: 'none'
          }}
        >
          <Icon name="arrow_left" size={15} /> Back to Home
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 40 }}>
          <div style={{
            width: 44, 
            height: 44, 
            borderRadius: 12,
            background: `linear-gradient(135deg, ${accent}, ${accentDark})`,
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center'
          }}>
            <Icon name="code" size={22} color="#fff" />
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.03em' }}>ProgCheck</span>
        </div>

        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-.04em', marginBottom: 8, color: '#111827' }}>
          {role === 'student' ? 'Student Log In' : 'Instructor Log In'}
        </h1>
        <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 32 }}>
          Welcome back! Enter your KMITL credentials to continue.
        </p>

        <div style={{ display: 'flex', background: '#E5E7EB', borderRadius: 10, padding: 4, marginBottom: 28 }}>
          {['student', 'teacher'].map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              style={{
                flex: 1, 
                padding: '9px 0', 
                borderRadius: 8, 
                fontSize: 13, 
                fontWeight: 600,
                background: role === r ? '#fff' : 'transparent',
                color: role === r ? '#111827' : '#6B7280',
                boxShadow: role === r ? '0 1px 4px rgba(0,0,0,.1)' : 'none',
                transition: 'all .15s', 
                textTransform: 'capitalize',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              {r === 'teacher' ? 'Instructor' : 'Student'}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
          <InputField 
            label="Student ID / Username" 
            value={id} 
            onChange={setId}
            placeholder={role === 'student' ? 'e.g. 66011148' : 'e.g. T-001'} 
            icon="user" 
          />
          <InputField 
            label="Password" 
            value={pass} 
            onChange={setPass}
            placeholder="Enter your password" 
            type="password" 
            icon="lock" 
          />
        </div>

        {err && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 9, background: '#FEF2F2', marginBottom: 16 }}>
            <Icon name="alert" size={15} color="#EF4444" />
            <span style={{ fontSize: 13, color: '#EF4444' }}>{err}</span>
          </div>
        )}

        <Button 
          onClick={handleLogin}
          size="lg"
          style={{
            width: '100%',
            background: `linear-gradient(135deg, ${accent}, ${accentDark})`,
            color: '#fff',
            boxShadow: `0 4px 20px ${role === 'teacher' ? 'rgba(91,163,245,.35)' : 'rgba(78,203,160,.35)'}`
          }}
          disabled={loading}
        >
          {loading ? 'Signing In...' : 'Sign In'}
        </Button>
      </div>

      <div style={{ flex: 1, background: `linear-gradient(135deg, ${accent}, ${accentDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Welcome to ProgCheck</h2>
          <p style={{ fontSize: 16, opacity: 0.9, maxWidth: 300 }}>
            Your intelligent Prolog code evaluation platform
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
