import React, { useState, useEffect } from 'react';
import Icon from '../components/Icon.js';
import InputField from '../components/InputField.js';
import Button from '../components/Button.js';

const SettingsPage = ({ role, user, onUserUpdate }) => {
  const [settings, setSettings] = useState({
    display_name: user?.display_name || '',
    theme: 'light',
    auto_save: true,
    email_alerts: true,
    email: '',
    phone: '',
  });
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [err, setErr] = useState('');
  const [success, setSuccess] = useState('');
  const [passwordErr, setPasswordErr] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');

  // Fetch settings on mount
  useEffect(() => {
    if (user?.id) {
      fetchSettings();
    }
  }, [user]);

  const accent = role === 'teacher' ? '#5BA3F5' : '#4ECBA0';

  const fetchSettings = async () => {
    if (!user?.id) return;
    try {
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/settings/profile/${user.id}?role=${role}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (e) {
      console.error('Failed to fetch settings:', e);
    }
  };

  const handleSaveSettings = async () => {
    if (!user?.id) return;
    try {
      setSaveLoading(true);
      setErr('');
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/settings/profile/${user.id}?role=${role}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify(settings),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to save settings');
      }
      
      setSuccess('Settings saved successfully');
      if (settings.display_name !== user.display_name) {
        onUserUpdate({ ...user, display_name: settings.display_name });
      }
      setTimeout(() => setSuccess(''), 3000);
    } catch (e) {
      setErr(e.message || 'Failed to save settings');
    } finally {
      setSaveLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordErr('');
    setPasswordSuccess('');

    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordErr('Please fill all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErr('New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setPasswordErr('New password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:8000';
      const res = await fetch(`${apiUrl}/api/settings/password-change/${user.id}?role=${role}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to change password');
      }

      setPasswordSuccess('Password changed successfully');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(''), 3000);
    } catch (e) {
      setPasswordErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: '#F5F7FA',
      padding: '40px 20px',
      fontFamily: "'Google Sans', sans-serif"
    }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
            Settings
          </h1>
          <p style={{ color: '#6B7280', fontSize: 14 }}>
            Manage your account preferences and security
          </p>
        </div>

        {/* Messages */}
        {err && (
          <div style={{ 
            padding: '12px 16px', 
            borderRadius: 8, 
            background: '#FEF2F2', 
            color: '#EF4444',
            marginBottom: 20,
            fontSize: 13
          }}>
            {err}
          </div>
        )}
        {success && (
          <div style={{ 
            padding: '12px 16px', 
            borderRadius: 8, 
            background: '#E6F9F2', 
            color: '#047857',
            marginBottom: 20,
            fontSize: 13
          }}>
            {success}
          </div>
        )}

        {/* Settings Section */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: 32,
          marginBottom: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: '#111827' }}>
            Profile
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
            <InputField
              label="Display Name"
              value={settings.display_name}
              onChange={(val) => setSettings({ ...settings, display_name: val })}
              placeholder="Your display name"
              icon="user"
            />
            <InputField
              label="Email"
              value={settings.email}
              onChange={(val) => setSettings({ ...settings, email: val })}
              placeholder="your@email.com"
              type="email"
              icon="mail"
            />
            <InputField
              label="Phone"
              value={settings.phone}
              onChange={(val) => setSettings({ ...settings, phone: val })}
              placeholder="+1 (555) 000-0000"
              icon="phone"
            />
          </div>

          <button
            onClick={handleSaveSettings}
            disabled={saveLoading}
            style={{
              padding: '11px 20px',
              borderRadius: 8,
              border: 'none',
              background: accent,
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: saveLoading ? 'not-allowed' : 'pointer',
              opacity: saveLoading ? 0.7 : 1,
              transition: 'all 0.15s'
            }}
          >
            {saveLoading ? 'Saving...' : 'Save Settings'}
          </button>
        </div>

        {/* Preferences Section */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: 32,
          marginBottom: 24,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: '#111827' }}>
            Preferences
          </h2>

          {/* Theme */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: '#111827', display: 'block', marginBottom: 8 }}>
              Theme
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              {['light', 'dark'].map(t => (
                <button
                  key={t}
                  onClick={() => setSettings({ ...settings, theme: t })}
                  style={{
                    padding: '10px 16px',
                    borderRadius: 8,
                    border: settings.theme === t ? `2px solid ${accent}` : '1px solid #D1D5DB',
                    background: settings.theme === t ? (accent === '#4ECBA0' ? '#E6F9F2' : '#EAF2FF') : '#fff',
                    color: settings.theme === t ? (accent === '#4ECBA0' ? '#047857' : '#1e40af') : '#6B7280',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)} Mode
                </button>
              ))}
            </div>
          </div>

          {/* Auto-save */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.auto_save}
                onChange={(e) => setSettings({ ...settings, auto_save: e.target.checked })}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                Auto-save changes
              </span>
            </label>
            <p style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
              Automatically save your work as you make changes
            </p>
          </div>

          {/* Email Alerts */}
          <div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.email_alerts}
                onChange={(e) => setSettings({ ...settings, email_alerts: e.target.checked })}
                style={{ width: 18, height: 18, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>
                Email alerts
              </span>
            </label>
            <p style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
              Receive email notifications for important events
            </p>
          </div>
        </div>

        {/* Security Section */}
        <div style={{
          background: '#fff',
          borderRadius: 12,
          padding: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, color: '#111827' }}>
            Security
          </h2>

          {passwordErr && (
            <div style={{ 
              padding: '12px 16px', 
              borderRadius: 8, 
              background: '#FEF2F2', 
              color: '#EF4444',
              marginBottom: 20,
              fontSize: 13
            }}>
              {passwordErr}
            </div>
          )}
          {passwordSuccess && (
            <div style={{ 
              padding: '12px 16px', 
              borderRadius: 8, 
              background: '#E6F9F2', 
              color: '#047857',
              marginBottom: 20,
              fontSize: 13
            }}>
              {passwordSuccess}
            </div>
          )}

          <form onSubmit={handlePasswordChange} style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, marginBottom: 24 }}>
              <InputField
                label="Current Password"
                value={oldPassword}
                onChange={setOldPassword}
                placeholder="Enter your current password"
                type="password"
                icon="lock"
              />
              <InputField
                label="New Password"
                value={newPassword}
                onChange={setNewPassword}
                placeholder="Enter new password"
                type="password"
                icon="lock"
              />
              <InputField
                label="Confirm New Password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                placeholder="Confirm new password"
                type="password"
                icon="lock"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                padding: '11px 20px',
                borderRadius: 8,
                border: 'none',
                background: '#EF4444',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'all 0.15s'
              }}
            >
              {loading ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
//           justifyContent: 'center',
//           zIndex: 1000,
//           fontFamily: "'Google Sans', sans-serif"
//         }}>
//           <div style={{
//             background: '#fff',
//             borderRadius: 16,
//             padding: 32,
//             maxWidth: 500,
//             width: '90%',
//             boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
//           }}>
//             <div style={{ marginBottom: 24 }}>
//               <h2 style={{ fontSize: 24, fontWeight: 800, color: '#111827', marginBottom: 8 }}>
//                 Edit Profile
//               </h2>
//               <p style={{ fontSize: 14, color: '#6B7280' }}>
//                 Update your display name and profile information
//               </p>
//             </div>

//             <div style={{ marginBottom: 24 }}>
//               <InputField
//                 label="Display Name"
//                 value={name}
//                 onChange={setName}
//                 placeholder="Enter your name"
//               />
//             </div>

//             <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
//               <button
//                 onClick={() => setShowModal(false)}
//                 style={{
//                   padding: '8px 16px',
//                   borderRadius: 8,
//                   border: '1px solid #E5E7EB',
//                   background: '#fff',
//                   fontSize: 14,
//                   fontWeight: 600,
//                   cursor: 'pointer',
//                   transition: 'all 0.2s'
//                 }}
//               >
//                 Cancel
//               </button>
//               <button
//                 onClick={handleSave}
//                 style={{
//                   padding: '8px 16px',
//                   borderRadius: 8,
//                   border: 'none',
//                   background: accent,
//                   color: '#fff',
//                   fontSize: 14,
//                   fontWeight: 600,
//                   cursor: 'pointer',
//                   transition: 'all 0.2s'
//                 }}
//               >
//                 Save Changes
//               </button>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default SettingsPage;
//           <Button style={{ background: accent, color: '#fff' }}>Save Changes</Button>
//           <Button variant="secondary">Cancel</Button>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default SettingsPage;
