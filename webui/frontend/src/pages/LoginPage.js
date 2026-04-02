import React, { useState } from 'react';
import Icon from '../components/Icon.js';
import InputField from '../components/InputField.js';
import Button from '../components/Button.js';

const LoginPage = ({ defaultRole = 'student', onLogin, onBack }) => {
  const [role, setRole] = useState(defaultRole);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [studentId, setStudentId] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const accent = role === 'teacher' ? '#5BA3F5' : '#4ECBA0';
  const accentDark = role === 'teacher' ? '#3681D6' : '#2FA57E';
  const accentLight = role === 'teacher' ? '#EAF2FF' : '#E6F9F2';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setErr('Please enter both username and password');
      return;
    }
    
    setErr('');
    setLoading(true);
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const endpoint = role === 'student' ? `${apiUrl}/api/auth/login/student` : `${apiUrl}/api/auth/login/teacher`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
        }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Login failed');
      }
      
      const data = await res.json();
      // Store token in localStorage
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userId', data.user.id);
      localStorage.setItem('userRole', data.user.role);
      
      onLogin(data.user, data.user.role);
    } catch (e) {
      setErr(e.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!username || !password || (role === 'student' && !studentId)) {
      setErr('Please fill all required fields');
      return;
    }
    
    setErr('');
    setLoading(true);
    
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          role,
          student_id: role === 'student' ? studentId : undefined,
          teacher_id: role === 'teacher' ? studentId : undefined,
        }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Registration failed');
      }
      
      const data = await res.json();
      // Store token in localStorage
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('userId', data.user.id);
      localStorage.setItem('userRole', data.user.role);
      
      onLogin(data.user, data.user.role);
    } catch (e) {
      setErr(e.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = isRegistering ? handleRegister : handleLogin;

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
          {isRegistering 
            ? (role === 'student' ? 'Create Student Account' : 'Create Teacher Account')
            : (role === 'student' ? 'Student Log In' : 'Instructor Log In')
          }
        </h1>
        <p style={{ color: '#6B7280', fontSize: 14, marginBottom: 32 }}>
          {isRegistering ? 'Set up your account to get started' : 'Welcome back! Enter your credentials to continue.'}
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 24 }}>
            {isRegistering && (role === 'student' ? (
              <InputField 
                label="Student ID" 
                value={studentId} 
                onChange={setStudentId}
                placeholder="e.g. 66011148" 
                icon="id" 
              />
            ) : (
              <InputField 
                label="Teacher ID" 
                value={studentId} 
                onChange={setStudentId}
                placeholder="e.g. T-001" 
                icon="id" 
              />
            ))}
            <InputField 
              label="Username" 
              value={username} 
              onChange={setUsername}
              placeholder="Choose a username" 
              icon="user" 
            />
            <InputField 
              label="Password" 
              value={password} 
              onChange={setPassword}
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
            type="submit"
            size="lg"
            style={{
              width: '100%',
              background: `linear-gradient(135deg, ${accent}, ${accentDark})`,
              color: '#fff',
              boxShadow: `0 4px 20px ${role === 'teacher' ? 'rgba(91,163,245,.35)' : 'rgba(78,203,160,.35)'}`
            }}
            disabled={loading}
          >
            {loading ? (isRegistering ? 'Creating Account...' : 'Signing In...') : (isRegistering ? 'Create Account' : 'Sign In')}
          </Button>

          <button 
            type="button"
            onClick={() => { setIsRegistering(!isRegistering); setErr(''); }}
            style={{
              marginTop: 12,
              background: 'none',
              border: 'none',
              color: '#6B7280',
              fontSize: 13,
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0
            }}
          >
            {isRegistering ? 'Already have an account? Sign in' : "Don't have an account? Create one"}
          </button>
        </form>
      </div>

      {/* <div style={{ flex: 1, background: `linear-gradient(135deg, ${accent}, ${accentDark})`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16 }}>Welcome to ProgCheck</h2>
          <p style={{ fontSize: 16, opacity: 0.9, maxWidth: 300 }}>
            Your intelligent Prolog code evaluation platform
          </p>
        </div>
      </div> */}
      {/* --- RIGHT SIDE BANNER --- */}
      <div style={{ 
        flex: 1, 
        background: `linear-gradient(135deg, ${accent}, ${accentDark})`, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        padding: '60px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        {/* Main Content Wrapper */}
        <div style={{ 
          maxWidth: 440, 
          color: '#fff',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start' /* Left-aligns everything for a cleaner look */
        }}>
          
          {/* Frosted Glass Icon Box */}
          <div style={{
            width: 64, 
            height: 64, 
            borderRadius: 16,
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255,255,255,0.2)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            marginBottom: 32
          }}>
            <Icon name="code" size={32} color="#fff" />
          </div>

          <h2 style={{ 
            fontSize: 46, 
            fontWeight: 800, 
            lineHeight: 1.15, 
            letterSpacing: '-.03em',
            marginBottom: 60 
          }}>
            Welcome to<br/>ProgCheck
          </h2>
          
          <p style={{ 
            fontSize: 18, 
            lineHeight: 1.6, 
            opacity: 0.85, 
            fontWeight: 400 
          }}>
            Your intelligent Prolog code evaluation platform. Combine symbolic reasoning with LLMs for transparent, explainable feedback.
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
