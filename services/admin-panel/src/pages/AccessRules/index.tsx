import { useState, useEffect } from 'react';
import { useApi, putApi } from '../../hooks/useApi';

interface AccessRules {
  allowlist: string[];
  denylist: string[];
}

export function AccessRules() {
  const { data, loading, error } = useApi<AccessRules>('/security/access-rules');
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [denylist, setDenylist] = useState<string[]>([]);
  const [newAllow, setNewAllow] = useState('');
  const [newDeny, setNewDeny] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) {
      setAllowlist(data.allowlist ?? []);
      setDenylist(data.denylist ?? []);
    }
  }, [data]);

  const addToList = (list: 'allowlist' | 'denylist') => {
    const value = list === 'allowlist' ? newAllow.trim() : newDeny.trim();
    if (!value) return;
    if (list === 'allowlist') {
      if (!allowlist.includes(value)) {
        setAllowlist([...allowlist, value]);
      }
      setNewAllow('');
    } else {
      if (!denylist.includes(value)) {
        setDenylist([...denylist, value]);
      }
      setNewDeny('');
    }
  };

  const removeFromList = (list: 'allowlist' | 'denylist', item: string) => {
    if (list === 'allowlist') {
      setAllowlist(allowlist.filter((i) => i !== item));
    } else {
      setDenylist(denylist.filter((i) => i !== item));
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaveMsg(null);
      await putApi('/security/access-rules', { allowlist, denylist });
      setSaveMsg('Access rules saved successfully.');
    } catch (err) {
      setSaveMsg(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'var(--wo-red-500)' }}>{error}</p>;

  const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--wo-gray-200)',
    borderRadius: 8,
    padding: '1.25rem',
    backgroundColor: 'white',
    marginBottom: '1rem',
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    padding: '0.5rem 0.75rem',
    border: '1px solid var(--wo-gray-300)',
    borderRadius: 6,
    fontSize: '0.875rem',
  };

  const renderList = (items: string[], listType: 'allowlist' | 'denylist') => (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
      <thead>
        <tr style={{ borderBottom: '2px solid var(--wo-gray-200)', backgroundColor: 'var(--wo-gray-50)' }}>
          <th style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--wo-gray-500)' }}>
            IP / CIDR
          </th>
          <th style={{ width: 80, padding: '0.5rem 0.75rem', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--wo-gray-500)' }}>
            Action
          </th>
        </tr>
      </thead>
      <tbody>
        {items.length === 0 ? (
          <tr>
            <td colSpan={2} style={{ padding: '1rem', textAlign: 'center', fontSize: '0.875rem', color: 'var(--wo-gray-500)' }}>
              No entries.
            </td>
          </tr>
        ) : (
          items.map((item, index) => (
            <tr key={item} style={{ borderBottom: index < items.length - 1 ? '1px solid var(--wo-gray-100)' : 'none' }}>
              <td style={{ padding: '0.5rem 0.75rem', fontFamily: 'monospace', fontSize: '0.875rem' }}>{item}</td>
              <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>
                <button
                  onClick={() => removeFromList(listType, item)}
                  style={{
                    padding: '0.25rem 0.5rem',
                    fontSize: '0.75rem',
                    color: 'var(--wo-red-500)',
                    background: 'none',
                    border: '1px solid var(--wo-red-500)',
                    borderRadius: 4,
                    cursor: 'pointer',
                  }}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '1.5rem' }}>Access Rules</h2>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>IP Allowlist</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newAllow}
            onChange={(e) => setNewAllow(e.target.value)}
            placeholder="e.g. 192.168.1.0/24"
            style={inputStyle}
            onKeyDown={(e) => e.key === 'Enter' && addToList('allowlist')}
          />
          <button
            onClick={() => addToList('allowlist')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--wo-blue-600)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Add
          </button>
        </div>
        {renderList(allowlist, 'allowlist')}
      </div>

      <div style={sectionStyle}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>IP Denylist</h3>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={newDeny}
            onChange={(e) => setNewDeny(e.target.value)}
            placeholder="e.g. 10.0.0.0/8"
            style={inputStyle}
            onKeyDown={(e) => e.key === 'Enter' && addToList('denylist')}
          />
          <button
            onClick={() => addToList('denylist')}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--wo-blue-600)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              fontSize: '0.875rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Add
          </button>
        </div>
        {renderList(denylist, 'denylist')}
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
          {saving ? 'Saving...' : 'Save'}
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
