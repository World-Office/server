import { useState, useEffect } from 'react';
import { useApi, putApi } from '../../hooks/useApi';

interface FileLimits {
  maxUploadSizeMb: number;
  allowedExtensions: string;
  maxPageCount: number;
  maxFileAgeDays: number;
}

export function FileLimits() {
  const { data, loading, error } = useApi<FileLimits>('/config/file-limits');
  const [form, setForm] = useState<FileLimits>({
    maxUploadSizeMb: 50,
    allowedExtensions: '',
    maxPageCount: 1000,
    maxFileAgeDays: 365,
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setForm(data);
    }
  }, [data]);

  const handleChange = (field: keyof FileLimits, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg(null);
      await putApi('/config/file-limits', form);
      setSaveMsg('File limits saved successfully.');
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
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>File Limits</h2>

      <div style={{ border: '1px solid var(--wo-gray-200)', borderRadius: 8, padding: '1.5rem', backgroundColor: 'white' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={labelStyle}>Max Upload Size (MB)</label>
            <input
              type="number"
              value={form.maxUploadSizeMb}
              onChange={(e) => handleChange('maxUploadSizeMb', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Allowed Extensions</label>
            <input
              type="text"
              value={form.allowedExtensions}
              onChange={(e) => handleChange('allowedExtensions', e.target.value)}
              placeholder="e.g. .docx,.pdf,.pptx"
              style={inputStyle}
            />
            <p style={{ fontSize: '0.75rem', color: 'var(--wo-gray-500)', marginTop: '0.25rem' }}>
              Comma-separated list of file extensions.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Max Page Count</label>
            <input
              type="number"
              value={form.maxPageCount}
              onChange={(e) => handleChange('maxPageCount', Number(e.target.value))}
              min={1}
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Max File Age (days)</label>
            <input
              type="number"
              value={form.maxFileAgeDays}
              onChange={(e) => handleChange('maxFileAgeDays', Number(e.target.value))}
              min={0}
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
