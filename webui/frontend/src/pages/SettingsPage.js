import React, { useState, useEffect, useCallback } from 'react';
import Icon from '../components/Icon.js';
import Avatar from '../components/Avatar.js';
import InputField from '../components/InputField.js';
import Toggle from '../components/Toggle.js';
import Card from '../components/Card.js';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

const SettingsPage = ({ role, user, onUserUpdate }) => {
  // ── local UI state ──────────────────────────────────────────
  const [theme, setThemeLocal] = useState('light');
  const [tabSize, setTabSize] = useState(2);
  const [autoSave, setAutoSaveLocal] = useState(true);
  const [emailAlerts, setEmailAlertsLocal] = useState(true);
  const [notifEmail, setNotifEmail] = useState(user?.email || '');
  const [notifEmailEditing, setNotifEmailEditing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState(user?.name || user?.display_name || '');

  // ── API state ───────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState('');

  // ── password change state ───────────────────────────────────
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const accent = role === 'teacher' ? '#5BA3F5' : '#4ECBA0';

  // ── apply theme to document root ────────────────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // ── load settings on mount ──────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    setLoading(true);
    fetch(`${API_BASE}/api/settings/profile/${user.id}?role=${role}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        setName(data.display_name || '');
        setThemeLocal(data.theme || 'light');
        setAutoSaveLocal(data.auto_save ?? true);
        setEmailAlertsLocal(data.email_alerts ?? true);
        setTabSize(data.tab_size ?? 2);
        setNotifEmail(data.email || user?.email || '');
        // Propagate loaded preferences to parent (used by CodeEditor / auto-save)
        if (onUserUpdate) {
          onUserUpdate({
            ...user,
            tab_size: data.tab_size ?? 2,
            auto_save: data.auto_save ?? true,
          });
        }
        setLoading(false);
      })
      .catch(e => {
        setError('Failed to load settings: ' + e.message);
        setLoading(false);
      });
  }, [user?.id, role]);

  // ── generic save helper ─────────────────────────────────────
  const saveSettings = useCallback(async (patch) => {
    if (!user?.id) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/settings/profile/${user.id}?role=${role}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Sync parent if display_name changed
      if (patch.display_name !== undefined && onUserUpdate) {
        onUserUpdate({ ...user, name: data.display_name, display_name: data.display_name });
      }
      setSuccessMsg('Saved');
      setTimeout(() => setSuccessMsg(''), 2000);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }, [user, role, onUserUpdate]);

  // ── toggle handlers that immediately persist ────────────────
  const handleThemeChange = (t) => {
    setThemeLocal(t);
    saveSettings({ theme: t });
  };

  const handleAutoSaveChange = (val) => {
    setAutoSaveLocal(val);
    saveSettings({ auto_save: val });
    if (onUserUpdate) onUserUpdate({ ...user, auto_save: val });
  };

  const handleTabSizeChange = (val) => {
    const size = Number(val);
    setTabSize(size);
    saveSettings({ tab_size: size });
    if (onUserUpdate) onUserUpdate({ ...user, tab_size: size });
  };

  const handleEmailAlertsChange = (val) => {
    setEmailAlertsLocal(val);
    saveSettings({ email_alerts: val });
  };

  const handleNotifEmailSave = async () => {
    await saveSettings({ email: notifEmail });
    setNotifEmailEditing(false);
  };

  // ── profile modal save ──────────────────────────────────────
  const handleSave = async () => {
    await saveSettings({ display_name: name });
    setShowModal(false);
  };

  // ── password change ─────────────────────────────────────────
  const handlePasswordChange = async () => {
    setPasswordError('');
    setPasswordSuccess('');
    if (!oldPassword || !newPassword || !confirmPassword) {
      setPasswordError('All fields are required.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }
    setPasswordLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/settings/password-change/${user.id}?role=${role}&old_password=${encodeURIComponent(oldPassword)}&new_password=${encodeURIComponent(newPassword)}`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${res.status}`);
      }
      setPasswordSuccess('Password changed successfully.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess('');
      }, 1500);
    } catch (e) {
      setPasswordError(e.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '32px 24px', height: '100%', overflowY: 'auto', fontFamily: "'Google Sans', sans-serif", color: 'var(--muted)' }}>
        Loading settings…
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ padding: '32px 24px', height: '100%', overflowY: 'auto', background: 'var(--surface)', fontFamily: "'Google Sans', sans-serif" }}>
      <div style={{ marginBottom: 28, textAlign: 'left' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.03em', color: 'var(--ink)' }}>Settings</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 4 }}>
          Manage your profile, preferences, and notifications.
        </p>
      </div>

      {/* Error / success banners */}
      {error && (
        <div style={{
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, color: '#991B1B', fontSize: 13,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#991B1B', fontWeight: 700 }}>×</button>
        </div>
      )}
      {successMsg && (
        <div style={{
          background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 8,
          padding: '10px 16px', marginBottom: 16, color: '#065F46', fontSize: 13,
        }}>
          ✓ {successMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>

        {/* ── Profile Details ── */}
        <Card style={{ padding: 24, background: 'var(--white)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Icon name="lock" size={18} color={accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Profile Details</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 1fr', gap: 24, alignItems: 'flex-start' }}>
            <div style={{ position: 'relative' }}>
              <Avatar name={name} size={72} role={role} />
              <button
                onClick={() => setShowModal(true)}
                style={{
                  position: 'absolute', bottom: 0, right: 0,
                  width: 26, height: 26, borderRadius: '50%', background: '#111827',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: 'none', cursor: 'pointer',
                }}
              >
                <Icon name="camera" size={12} color="#fff" />
              </button>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textAlign: 'left' }}>
                Display Name
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="text"
                  value={name}
                  readOnly
                  style={{
                    width: '100%', padding: '10px 12px', fontSize: 14,
                    color: 'var(--ink)', border: '1px solid var(--border)', borderRadius: 8,
                    background: 'var(--white)', fontFamily: 'inherit',
                  }}
                  placeholder="Your name"
                />
                <button
                  onClick={() => setShowModal(true)}
                  style={{
                    padding: '10px 14px', borderRadius: 8, border: `1px solid ${accent}`,
                    background: 'transparent', color: accent, fontSize: 12,
                    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Edit
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8, textAlign: 'left' }}>
                Email Address
              </div>
              <input
                type="email"
                value={user?.email || ''}
                readOnly
                style={{
                  width: '100%', padding: '10px 12px', fontSize: 14,
                  color: 'var(--ink-2)', border: '1px solid var(--border)', borderRadius: 8,
                  background: 'var(--surface)', fontFamily: 'inherit', cursor: 'not-allowed',
                }}
              />
            </div>
          </div>

          {/* Change password link */}
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => setShowPasswordModal(true)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: accent, fontSize: 13, fontWeight: 600, padding: 0,
              }}
            >
              Change Password…
            </button>
          </div>
        </Card>

        {/* ── User Preferences ── */}
        <Card style={{ padding: 24, background: 'var(--white)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Icon name="sliders" size={18} color={accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>User Preferences</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 24 }}>
            {/* Theme — persisted to backend */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                Color Theme
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['dark', 'light'].map(t => (
                  <button
                    key={t}
                    onClick={() => handleThemeChange(t)}
                    style={{
                      flex: 1, padding: '8px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                      background: theme === t ? accent : 'var(--border)',
                      color: theme === t ? '#fff' : 'var(--muted)',
                      border: 'none', cursor: 'pointer', transition: 'all 0.2s', textTransform: 'capitalize',
                    }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab size — local only (not in backend schema) */}
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                Tab Size
              </div>
              <select
                value={tabSize}
                onChange={(e) => handleTabSizeChange(e.target.value)}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid var(--border)', background: 'var(--white)', color: 'var(--ink)',
                  fontFamily: 'inherit', cursor: 'pointer',
                }}
              >
                <option value={2}>2 Spaces</option>
                <option value={4}>4 Spaces</option>
              </select>
            </div>
          </div>

          {/* Auto-save — persisted to backend */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, borderTop: '1px solid var(--border)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>Auto-Save</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Automatically save your changes after every modification</div>
            </div>
            <Toggle value={autoSave} onChange={handleAutoSaveChange} />
          </div>
        </Card>

        {/* ── Notifications ── */}
        <Card style={{ padding: 24, background: 'var(--white)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Icon name="bell" size={18} color={accent} />
            <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--ink)' }}>Notifications</span>
          </div>

          {/* Email Alerts toggle */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <Icon name="mail" size={16} color={accent} />
                <div style={{ fontWeight: 600, fontSize: 14 }}>Email Alerts</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                Get notified when a lab opens and when it's about to close
              </div>
            </div>
            <Toggle value={emailAlerts} onChange={handleEmailAlertsChange} />
          </div>

          {/* Notification email address */}
          {emailAlerts && (
            <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 8 }}>
                Notification Email
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="email"
                  value={notifEmail}
                  readOnly={!notifEmailEditing}
                  onChange={e => setNotifEmail(e.target.value)}
                  placeholder="Enter email for lab notifications"
                  style={{
                    flex: 1, padding: '10px 12px', fontSize: 14,
                    border: `1px solid ${notifEmailEditing ? accent : 'var(--border)'}`,
                    borderRadius: 8, fontFamily: 'inherit',
                    background: notifEmailEditing ? 'var(--white)' : 'var(--surface)',
                    color: 'var(--ink)', outline: 'none',
                  }}
                />
                {notifEmailEditing ? (
                  <>
                    <button
                      onClick={handleNotifEmailSave}
                      disabled={saving}
                      style={{
                        padding: '10px 14px', borderRadius: 8, border: 'none',
                        background: saving ? '#9CA3AF' : accent, color: '#fff',
                        fontSize: 12, fontWeight: 600,
                        cursor: saving ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setNotifEmailEditing(false)}
                      style={{
                        padding: '10px 14px', borderRadius: 8,
                        border: '1px solid var(--border)', background: 'var(--white)',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setNotifEmailEditing(true)}
                    style={{
                      padding: '10px 14px', borderRadius: 8,
                      border: `1px solid ${accent}`, background: 'transparent',
                      color: accent, fontSize: 12, fontWeight: 600,
                      cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                  >
                    Edit
                  </button>
                )}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                Emails are sent when a lab in your class becomes active, and again 1 hour before it closes.
              </div>
            </div>
          )}
        </Card>

      </div>

      {/* ── Edit Name Modal ── */}
      {showModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, fontFamily: "'Google Sans', sans-serif",
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 16, padding: 32,
            maxWidth: 500, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', marginBottom: 8 }}>Edit Profile</h2>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>Update your display name</p>
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
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--white)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: saving ? '#9CA3AF' : accent, color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Change Password Modal ── */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 1000, fontFamily: "'Google Sans', sans-serif",
        }}>
          <div style={{
            background: 'var(--white)', borderRadius: 16, padding: 32,
            maxWidth: 440, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
          }}>
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>Change Password</h2>
              <p style={{ fontSize: 14, color: 'var(--muted)' }}>Enter your current password, then choose a new one.</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              {[
                { label: 'Current Password', value: oldPassword, setter: setOldPassword },
                { label: 'New Password', value: newPassword, setter: setNewPassword },
                { label: 'Confirm New Password', value: confirmPassword, setter: setConfirmPassword },
              ].map(({ label, value, setter }) => (
                <div key={label}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>{label}</div>
                  <input
                    type="password"
                    value={value}
                    onChange={e => setter(e.target.value)}
                    style={{
                      width: '100%', padding: '10px 12px', fontSize: 14,
                      border: '1px solid var(--border)', borderRadius: 8,
                      fontFamily: 'inherit', outline: 'none',
                      boxSizing: 'border-box',
                      background: 'var(--white)', color: 'var(--ink)',
                    }}
                  />
                </div>
              ))}
            </div>

            {passwordError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 6, padding: '8px 12px', marginBottom: 14, color: '#991B1B', fontSize: 13 }}>
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div style={{ background: '#D1FAE5', border: '1px solid #6EE7B7', borderRadius: 6, padding: '8px 12px', marginBottom: 14, color: '#065F46', fontSize: 13 }}>
                ✓ {passwordSuccess}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowPasswordModal(false); setOldPassword(''); setNewPassword(''); setConfirmPassword(''); setPasswordError(''); setPasswordSuccess(''); }}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'var(--white)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordChange}
                disabled={passwordLoading}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: passwordLoading ? '#9CA3AF' : accent, color: '#fff',
                  fontSize: 14, fontWeight: 600, cursor: passwordLoading ? 'not-allowed' : 'pointer',
                }}
              >
                {passwordLoading ? 'Saving…' : 'Update Password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;