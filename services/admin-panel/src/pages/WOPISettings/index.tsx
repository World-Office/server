import { useState, useEffect } from 'react';
import { useApi, putApi } from '../../hooks/useApi';

interface WopiSettings {
  wopiDiscoveryUrl: string;
  jwtSecret: string;
  tokenExpiryMinutes: number;
  proofKeyRotationIntervalHours: number;
}

export function WOPISettings() {
  const { data, loading, error } = useApi<WopiSettings>('/wopi/settings');
  const [form, setForm] = useState<WopiSettings>({
    wopiDiscoveryUrl: '',
    jwtSecret: '',
    tokenExpiryMinutes: 60,
    proofKeyRotationIntervalHours: 24,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const handleChange = (field: keyof WopiSettings, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg(null);
      await putApi('/wopi/settings', form);
      setSaveMsg('Settings saved successfully.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'var(--wo-red-500)' }}>{error}</p>;

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>WOPI Settings</h2>

      <div style={{ border: '1px solid var(--wo-gray-200)', borderRadius: 8, padding: '1.5rem', backgroundColor: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              WOPI Discovery URL
            </label>
            <input
              type="text"
              value={form.wopiDiscoveryUrl}
              onChange={(e) => handleChange('wopiDiscoveryUrl', e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--wo-gray-300)',
                borderRadius: 6,
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              JWT Secret
            </label>
            <input
              type="password"
              value={form.jwtSecret}
              onChange={(e) => handleChange('jwtSecret', e.target.value)}
              placeholder="Leave empty to keep current"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--wo-gray-300)',
                borderRadius: 6,
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              Token Expiry (minutes)
            </label>
            <input
              type="number"
              value={form.tokenExpiryMinutes}
              onChange={(e) => handleChange('tokenExpiryMinutes', Number(e.target.value))}
              min={1}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--wo-gray-300)',
                borderRadius: 6,
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.375rem' }}>
              Proof Key Rotation Interval (hours)
            </label>
            <input
              type="number"
              value={form.proofKeyRotationIntervalHours}
              onChange={(e) => handleChange('proofKeyRotationIntervalHours', Number(e.target.value))}
              min={1}
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid var(--wo-gray-300)',
                borderRadius: 6,
                fontSize: '0.875rem',
              }}
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
