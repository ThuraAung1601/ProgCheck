import React, { useState } from 'react';
import Icon from '../components/Icon.js';
import Avatar from '../components/Avatar.js';
import InputField from '../components/InputField.js';
import Toggle from '../components/Toggle.js';
import Card from '../components/Card.js';

const SettingsPage = ({ role, user, onUserUpdate }) => {
  const [theme, setTheme] = useState('dark');
  const [tabSize, setTabSize] = useState('2');
  const [autoSave, setAutoSave] = useState(true);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState(user.name);
  const accent = role === 'teacher' ? '#5BA3F5' : '#4ECBA0';
  const accentLight = role === 'teacher' ? '#EAF2FF' : '#E6F9F2';

  const handleSave = () => {
    onUserUpdate({ ...user, name });
    setShowModal(false);
  };

  return (
    <div className="fade-in" style={{ padding: '32px 24px', height: '100%', background: '#F5F7FA', fontFamily: "'Google Sans', sans-serif" }}>
      <div style={{ marginBottom: 28, textAlign: 'left' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', color: '#111827' }}>Settings</h1>
        <p style={{ color: '#6B7280', fontSize: 14, marginTop: 4 }}>
          Manage your profile, preferences, and notifications.
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
        <Card style={{ padding: 24, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Icon name="lock" size={18} color={accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Profile Details</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={user.name} size={72} role={role} />
              <button 
                onClick={() => setShowModal(true)}
                style={{
                  position: 'absolute', 
                  bottom: 0, 
                  right: 0,
                  width: 26, 
                  height: 26, 
                  borderRadius: '50%', 
                  background: '#111827',
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                <Icon name="camera" size={12} color="#fff" />
              </button>
            </div>
            
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textAlign: 'left' }}>
                Display Name
              </div>
              <input 
                type="text"
                value={name}
                readOnly
                onChange={(e) => setName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 14,
                  color: '#111827',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  background: '#fff',
                  fontFamily: 'inherit'
                }}
                placeholder="Your name"
              />
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8, textAlign: 'left' }}>
                Email Address
              </div>
              <input 
                type="email"
                value={user.email}
                readOnly
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 14,
                  color: '#374151',
                  border: '1px solid #E5E7EB',
                  borderRadius: 8,
                  background: '#F9FAFB',
                  fontFamily: 'inherit',
                  cursor: 'not-allowed'
                }}
              />
            </div>
          </div>
        </Card>

        <Card style={{ padding: 24, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Icon name="sliders" size={18} color={accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>User Preferences</span>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                Color Theme
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['dark', 'light'].map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      background: theme === t ? accent : '#E5E7EB',
                      color: theme === t ? '#fff' : '#6B7280',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      textTransform: 'capitalize'
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 8 }}>
                Tab Size
              </div>
              <select
                value={tabSize}
                onChange={(e) => setTabSize(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  fontSize: 13,
                  border: '1px solid #E5E7EB',
                  background: '#fff',
                  color: '#111827',
                  fontFamily: 'inherit',
                  cursor: 'pointer'
                }}
              >
                <option value="2">2 Spaces</option>
                <option value="4">4 Spaces</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, borderTop: '1px solid #E5E7EB' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Auto-Save</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Automatically save your changes after every modification</div>
            </div>
            <Toggle value={autoSave} onChange={setAutoSave} />
          </div>
        </Card>

        <Card style={{ padding: 24, background: '#F9FAFB', border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Icon name="bell" size={18} color={accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: '#111827' }}>Notifications</span>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon name="mail" size={16} color={accent} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>Email Alerts</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Receive notifications and security alerts via email</div>
            </div>
            <Toggle value={emailAlerts} onChange={setEmailAlerts} />
          </div>
        </Card>
      </div>

      {/* Edit Profile Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          fontFamily: "'Google Sans', sans-serif"
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 16,
            padding: 32,
            maxWidth: 500,
            width: '90%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
                Edit Profile
              </h2>
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                Update your display name and profile information
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <InputField
                label="Display Name"
                value={name}
                onChange={setName}
                placeholder="Enter your name"
              />
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: '1px solid #E5E7EB',
                  background: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                style={{
                  padding: '8px 16px',
                  borderRadius: 8,
                  border: 'none',
                  background: accent,
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;
//           <Button style={{ background: accent, color: '#fff' }}>Save Changes</Button>
//           <Button variant="secondary">Cancel</Button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default SettingsPage;
