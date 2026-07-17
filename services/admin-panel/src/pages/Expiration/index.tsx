import { useState, useEffect } from 'react';
import { useApi, putApi } from '../../hooks/useApi';

interface ExpirationSettings {
  sessionTimeoutMinutes: number;
  jwtTokenExpirationHours: number;
  refreshTokenExpirationDays: number;
  rememberMeDurationDays: number;
}

export function Expiration() {
  const { data, loading, error } = useApi<ExpirationSettings>('/auth/expiration');
  const [form, setForm] = useState<ExpirationSettings>({
    sessionTimeoutMinutes: 30,
    jwtTokenExpirationHours: 1,
    refreshTokenExpirationDays: 7,
    rememberMeDurationDays: 30,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const handleChange = (field: keyof ExpirationSettings, value: number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg(null);
      await putApi('/auth/expiration', form);
      setSaveMsg('Expiration settings saved successfully.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'var(--wo-red-500)' }}>{error}</p>;

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
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Expiration Settings</h2>

      <div style={{ border: '1px solid var(--wo-gray-200)', borderRadius: 8, padding: '1.5rem', backgroundColor: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Session Timeout (minutes)</label>
            <input
              type="number"
              value={form.sessionTimeoutMinutes}
              onChange={(e) => handleChange('sessionTimeoutMinutes', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--wo-gray-500)', marginTop: '0.25rem' }}>
              Inactive session duration before automatic logout.
            </p>
          </div>

          <div>
            <label style={labelStyle}>JWT Token Expiration (hours)</label>
            <input
              type="number"
              value={form.jwtTokenExpirationHours}
              onChange={(e) => handleChange('jwtTokenExpirationHours', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Refresh Token Expiration (days)</label>
            <input
              type="number"
              value={form.refreshTokenExpirationDays}
              onChange={(e) => handleChange('refreshTokenExpirationDays', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>"Remember Me" Duration (days)</label>
            <input
              type="number"
              value={form.rememberMeDurationDays}
              onChange={(e) => handleChange('rememberMeDurationDays', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
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
            {saving ? 'Saving...' : 'Save'}
          </button>
          {saveMsg && (
            <span style={{ fontSize: '0.875rem', color: saveMsg.includes('success') ? 'var(--wo-green-500)' : 'var(--wo-red-500)' }}>
              {saveMsg}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
