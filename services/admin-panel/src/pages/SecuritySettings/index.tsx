import { useState, useEffect } from 'react';
import { useApi, putApi } from '../../hooks/useApi';

interface PasswordPolicy {
  minLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireDigits: boolean;
  requireSpecialChars: boolean;
  expiryDays: number;
}

interface TlsSettings {
  certPath: string;
  keyPath: string;
  minVersion: string;
}

interface RateLimiting {
  maxRequests: number;
  windowSeconds: number;
}

interface BruteForceProtection {
  maxAttempts: number;
  lockoutDurationMinutes: number;
}

interface SecuritySettings {
  passwordPolicy: PasswordPolicy;
  tls: TlsSettings;
  rateLimiting: RateLimiting;
  bruteForceProtection: BruteForceProtection;
}

export function SecuritySettings() {
  const { data, loading, error } = useApi<SecuritySettings>('/security/settings');
  const [form, setForm] = useState<SecuritySettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const updateNested = <K extends keyof SecuritySettings>(section: K, field: string, value: unknown) => {
    if (!form) return;
    setForm({
      ...form,
      [section]: { ...form[section], [field]: value },
    });
  };

  const handleSave = async () => {
    if (!form) return;
    try {
      setSaving(true);
      setSaveMsg(null);
      await putApi('/security/settings', form);
      setSaveMsg('Settings saved successfully.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'var(--wo-red-500)' }}>{error}</p>;
  if (!form) return null;

  const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--wo-gray-200)',
    borderRadius: 8,
    padding: '1.25rem',
    backgroundColor: 'white',
    marginBottom: '1rem',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.875rem',
    fontWeight: 600,
    marginBottom: '0.375rem',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--wo-gray-300)',
    borderRadius: 6,
    fontSize: '0.875rem',
  };

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Security Settings</h2>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Password Policy</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Min Length</label>
            <input
              type="number"
              value={form.passwordPolicy.minLength}
              onChange={(e) => updateNested('passwordPolicy', 'minLength', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Expiry (days)</label>
            <input
              type="number"
              value={form.passwordPolicy.expiryDays}
              onChange={(e) => updateNested('passwordPolicy', 'expiryDays', Number(e.target.value))}
              min={0}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <input
              type="checkbox"
              checked={form.passwordPolicy.requireUppercase}
              onChange={(e) => updateNested('passwordPolicy', 'requireUppercase', e.target.checked)}
            />
            Uppercase
          </label>
          <label style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <input
              type="checkbox"
              checked={form.passwordPolicy.requireLowercase}
              onChange={(e) => updateNested('passwordPolicy', 'requireLowercase', e.target.checked)}
            />
            Lowercase
          </label>
          <label style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <input
              type="checkbox"
              checked={form.passwordPolicy.requireDigits}
              onChange={(e) => updateNested('passwordPolicy', 'requireDigits', e.target.checked)}
            />
            Digits
          </label>
          <label style={{ fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <input
              type="checkbox"
              checked={form.passwordPolicy.requireSpecialChars}
              onChange={(e) => updateNested('passwordPolicy', 'requireSpecialChars', e.target.checked)}
            />
            Special Characters
          </label>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>TLS Settings</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Certificate Path</label>
            <input
              type="text"
              value={form.tls.certPath}
              onChange={(e) => updateNested('tls', 'certPath', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Key Path</label>
            <input
              type="text"
              value={form.tls.keyPath}
              onChange={(e) => updateNested('tls', 'keyPath', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ marginTop: '0.75rem' }}>
          <label style={labelStyle}>Min TLS Version</label>
          <select
            value={form.tls.minVersion}
            onChange={(e) => updateNested('tls', 'minVersion', e.target.value)}
            style={inputStyle}
          >
            <option value="1.2">TLS 1.2</option>
            <option value="1.3">TLS 1.3</option>
          </select>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Rate Limiting</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Max Requests</label>
            <input
              type="number"
              value={form.rateLimiting.maxRequests}
              onChange={(e) => updateNested('rateLimiting', 'maxRequests', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Window (seconds)</label>
            <input
              type="number"
              value={form.rateLimiting.windowSeconds}
              onChange={(e) => updateNested('rateLimiting', 'windowSeconds', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Brute Force Protection</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={labelStyle}>Max Attempts</label>
            <input
              type="number"
              value={form.bruteForceProtection.maxAttempts}
              onChange={(e) => updateNested('bruteForceProtection', 'maxAttempts', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Lockout Duration (minutes)</label>
            <input
              type="number"
              value={form.bruteForceProtection.lockoutDurationMinutes}
              onChange={(e) => updateNested('bruteForceProtection', 'lockoutDurationMinutes', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: '0.5rem 1.5rem',
            backgroundColor: 'var(--wo-blue-600)',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Saving...' : 'Save All'}
        </button>
        {saveMsg && (
          <span style={{ fontSize: '0.875rem', color: saveMsg.includes('success') ? 'var(--wo-green-500)' : 'var(--wo-red-500)' }}>
            {saveMsg}
          </span>
        )}
      </div>
    </div>
  );
}
