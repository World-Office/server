import { useState, useEffect } from 'react';
import { useApi, putApi } from '../../hooks/useApi';

interface LoggerConfig {
  logLevel: string;
  retentionDays: number;
  outputDestination: string;
  logFormat: string;
}

export function LoggerConfig() {
  const { data, loading, error } = useApi<LoggerConfig>('/config/logger');
  const [form, setForm] = useState<LoggerConfig>({
    logLevel: 'info',
    retentionDays: 30,
    outputDestination: 'file',
    logFormat: 'json',
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const handleChange = (field: keyof LoggerConfig, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg(null);
      await putApi('/config/logger', form);
      setSaveMsg('Logger configuration saved successfully.');
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
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Logger Configuration</h2>

      <div style={{ border: '1px solid var(--wo-gray-200)', borderRadius: 8, padding: '1.5rem', backgroundColor: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Log Level</label>
            <select
              value={form.logLevel}
              onChange={(e) => handleChange('logLevel', e.target.value)}
              style={inputStyle}
            >
              <option value="debug">Debug</option>
              <option value="info">Info</option>
              <option value="warn">Warn</option>
              <option value="error">Error</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Retention (days)</label>
            <input
              type="number"
              value={form.retentionDays}
              onChange={(e) => handleChange('retentionDays', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Output Destination</label>
            <select
              value={form.outputDestination}
              onChange={(e) => handleChange('outputDestination', e.target.value)}
              style={inputStyle}
            >
              <option value="file">File</option>
              <option value="stdout">Stdout</option>
              <option value="syslog">Syslog</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Log Format</label>
            <select
              value={form.logFormat}
              onChange={(e) => handleChange('logFormat', e.target.value)}
              style={inputStyle}
            >
              <option value="json">JSON</option>
              <option value="text">Text</option>
            </select>
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
