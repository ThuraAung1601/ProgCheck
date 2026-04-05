import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon.js';
import Button from '../components/Button.js';

const LandingPage = ({ onStudentLogin, onTeacherLogin, onSignup }) => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        minHeight: '100vh', 
        background: '#F5F7FA', 
        fontFamily: "'Google Sans', sans-serif" 
        }}>
      <nav style={{
        position: 'sticky', 
        top: 0, 
        zIndex: 200,
        padding: '0 56px', 
        height: 64, 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        background: scrolled ? 'rgba(255,255,255,.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid #E5E7EB' : '1px solid transparent',
        transition: 'all .3s'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, 
            height: 34, 
            borderRadius: 9,
            background: 'linear-gradient(135deg, #5BA3F5, #3681D6)',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center'
          }}>
            <Icon name="code" size={17} color="#fff" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-.02em' }}>ProgCheck</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <button style={{ fontSize: 14, fontWeight: 500, color: '#374151', background: 'none', cursor: 'pointer', border: 'none' }}>
            Read our Features
          </button>
          <Button onClick={onStudentLogin} size="md">Get Started</Button>
        </div>
      </nav>

      <section style={{
        flex: 1,                  
        justifyContent: 'center', 
        padding: '80px 56px',
        padding: '80px 56px 100px', 
        display: 'flex', 
        alignItems: 'center',
        gap: 100, 
        maxWidth: 1200, 
        margin: '0 auto',
        width: '100%'
      }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: 8,
            padding: '6px 14px', 
            borderRadius: 99, 
            background: '#EAF2FF',
            border: '1px solid #BFDBFE', 
            marginBottom: 28
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#5BA3F5' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#3681D6', letterSpacing: '.04em' }}>
              NEURO-SYMBOLIC AI FOR EDUCATION
            </span>
          </div>
          
          <h1 style={{
            fontSize: 58, 
            fontWeight: 800, 
            letterSpacing: '-.05em', 
            lineHeight: 1.1,
            marginBottom: 22, 
            color: '#111827'
          }}>
            ProgCheck
            <span style={{ display: 'block', color: '#5BA3F5' }}>for Prolog</span>
          </h1>
          
          <p style={{ 
            fontSize: 17, 
            color: '#6B7280', 
            lineHeight: 1.65, 
            marginBottom: 40, 
            maxWidth: 440 
          }}>
            An intelligent coding assistant that combines symbolic reasoning with LLMs — giving students transparent, explainable feedback on their Prolog submissions.
          </p>
          
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Button onClick={onStudentLogin} size="lg" style={{
              background: 'linear-gradient(135deg, #4ECBA0, #2FA57E)',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(78,203,160,.35)'
            }}>
              Student Login
            </Button>
            <Button onClick={onTeacherLogin} size="lg" style={{
              background: 'linear-gradient(135deg, #5BA3F5, #3681D6)',
              color: '#fff',
              boxShadow: '0 4px 20px rgba(91,163,245,.35)'
            }}>
              Teacher Login
            </Button>
            {onSignup && (
              <Button onClick={onSignup} size="lg" style={{
                background: '#fff',
                color: '#374151',
                border: '1.5px solid #D1D5DB',
                boxShadow: '0 2px 8px rgba(0,0,0,.08)'
              }}>
                Sign Up
              </Button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, position: 'relative', maxWidth: 480 }}>
          <div style={{
            background: '#1a1a2e', 
            borderRadius: 20, 
            overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(0,0,0,.2)', 
            border: '1px solid #333'
          }}>
            <div style={{ padding: '12px 16px', background: '#12122a', borderBottom: '1px solid #333', display: 'flex', gap: 7 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFBD2E' }} />
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
              <span style={{ marginLeft: 10, fontSize: 12, color: '#666', fontFamily: 'var(--mono)' }}>solution.pl</span>
            </div>
            
            <div style={{ padding: '20px', fontFamily: 'var(--mono)', fontSize: 13, lineHeight: 1.8, color: '#e0e0e0' }}>
              <div style={{ color: '#6A9955' }}>% Recursive predicate for list length</div>
              <div><span style={{ color: '#569CD6' }}>my_length</span>(<span style={{ color: '#CE9178' }}>[]</span>, <span style={{ color: '#B5CEA8' }}>0</span>).</div>
              <div><span style={{ color: '#569CD6' }}>my_length</span>([<span style={{ color: '#9CDCFE' }}>_</span>|<span style={{ color: '#9CDCFE' }}>T</span>], <span style={{ color: '#9CDCFE' }}>N</span>) :-</div>
              <div style={{ paddingLeft: 20 }}><span style={{ color: '#569CD6' }}>my_length</span>(<span style={{ color: '#9CDCFE' }}>T</span>, <span style={{ color: '#9CDCFE' }}>N1</span>),</div>
              <div style={{ paddingLeft: 20 }}><span style={{ color: '#9CDCFE' }}>N</span> <span style={{ color: '#D4D4D4' }}>is</span> <span style={{ color: '#9CDCFE' }}>N1</span> + <span style={{ color: '#B5CEA8' }}>1</span>.</div>
            </div>
            
            <div style={{
              margin: '0 16px 16px', 
              padding: '12px 16px', 
              borderRadius: 10,
              background: 'rgba(78,203,160,.15)', 
              border: '1px solid rgba(78,203,160,.3)'
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#2FA57E', marginBottom: 4 }}>
                ✓ All 4 test cases passed · Score: 100%
              </div>
              <div style={{ fontSize: 12, color: '#aaa' }}>Recursive implementation is correct. Proof tree verified.</div>
            </div>
          </div>
        </div>
      </section>

      <footer style={{ 
        marginTop: 'auto',
        padding: '24px 56px', 
        borderTop: '1px solid #E5E7EB', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: '#fff'
      }}>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          © 2026 ProgCheck — KMITL Software Engineering
        </div>
        <div style={{ fontSize: 13, color: '#6B7280' }}>
          Thura Aung · Phathompol Siripichaiprom · Natavee Pecharat
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
