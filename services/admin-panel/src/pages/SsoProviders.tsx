import { useApi } from '../hooks/useApi';

interface SsoProviderDetails {
  entity_id?: string;
  acs_url?: string;
  idp_metadata_url?: string;
  has_cert?: boolean;
  name?: string;
  issuer_url?: string;
  client_id?: string;
  redirect_url?: string;
  scopes?: string[];
  url?: string;
  base_dn?: string;
  user_filter?: string;
}

interface SsoProvider {
  provider: string;
  configured: boolean;
  enabled: boolean;
  details: SsoProviderDetails | null;
}

function ProviderCard({ provider }: { provider: SsoProvider }) {
  const getProviderIcon = (name: string) => {
    if (name === 'saml') return '🔐';
    if (name === 'ldap') return '📋';
    if (name.startsWith('oidc')) return '🔑';
    return '🔌';
  };

  const getProviderLabel = (name: string) => {
    if (name === 'saml') return 'SAML 2.0';
    if (name === 'ldap') return 'LDAP';
    if (name.startsWith('oidc:')) return `OIDC: ${provider.details?.name ?? name.slice(5)}`;
    return name;
  };

  return (
    <div
      style={{
        border: '1px solid var(--wo-gray-200)',
        borderRadius: 8,
        padding: '1.25rem',
        backgroundColor: 'white',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>{getProviderIcon(provider.provider)}</span>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{getProviderLabel(provider.provider)}</h3>
        </div>
        <span
          style={{
            display: 'inline-block',
            padding: '0.125rem 0.5rem',
            borderRadius: 4,
            fontSize: '0.75rem',
            fontWeight: 600,
            backgroundColor: provider.enabled ? 'var(--wo-green-500)' : 'var(--wo-gray-200)',
            color: provider.enabled ? 'white' : 'var(--wo-gray-500)',
          }}
        >
          {provider.enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--wo-gray-500)', marginBottom: '0.5rem' }}>
        {provider.configured ? 'Configured' : 'Not configured'}
      </div>

      {provider.details && (
        <div style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>
          {provider.details.name && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>Name: </span>
              {provider.details.name}
            </div>
          )}
          {provider.details.entity_id && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>Entity ID: </span>
              <code style={{ fontSize: '0.75rem' }}>{provider.details.entity_id}</code>
            </div>
          )}
          {provider.details.issuer_url && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>Issuer: </span>
              <code style={{ fontSize: '0.75rem' }}>{provider.details.issuer_url}</code>
            </div>
          )}
          {provider.details.url && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>URL: </span>
              <code style={{ fontSize: '0.75rem' }}>{provider.details.url}</code>
            </div>
          )}
          {provider.details.acs_url && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>ACS URL: </span>
              <code style={{ fontSize: '0.75rem' }}>{provider.details.acs_url}</code>
            </div>
          )}
          {provider.details.base_dn && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>Base DN: </span>
              <code style={{ fontSize: '0.75rem' }}>{provider.details.base_dn}</code>
            </div>
          )}
          {provider.details.client_id && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>Client ID: </span>
              <code style={{ fontSize: '0.75rem' }}>{provider.details.client_id}</code>
            </div>
          )}
          {provider.details.scopes && provider.details.scopes.length > 0 && (
            <div style={{ marginBottom: '0.25rem' }}>
              <span style={{ color: 'var(--wo-gray-500)', fontWeight: 600 }}>Scopes: </span>
              <code style={{ fontSize: '0.75rem' }}>{provider.details.scopes.join(', ')}</code>
            </div>
          )}
        </div>
      )}

      {!provider.configured && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.8125rem', color: 'var(--wo-gray-500)' }}>
          Configure via SSO config file or environment variables.
        </div>
      )}
    </div>
  );
}

export function SsoProviders() {
  const { data: providers, loading, error } = useApi<SsoProvider[]>('/sso/providers');

  const samlProviders = providers?.filter((p) => p.provider === 'saml') ?? [];
  const oidcProviders = providers?.filter((p) => p.provider.startsWith('oidc')) ?? [];
  const ldapProviders = providers?.filter((p) => p.provider === 'ldap') ?? [];

  return (
    <div>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>SSO Providers</h2>
        <p style={{ fontSize: '0.875rem', color: 'var(--wo-gray-500)' }}>
          Single sign-on provider configuration for SAML 2.0, OpenID Connect, and LDAP authentication.
        </p>
      </div>

      {loading && <p>Loading...</p>}

      {error && (
        <div
          style={{
            border: '1px solid var(--wo-red-500)',
            borderRadius: 8,
            padding: '1rem',
            backgroundColor: '#fef2f2',
            color: 'var(--wo-red-500)',
            marginBottom: '1rem',
          }}
        >
          {error}
        </div>
      )}

      {!loading && (
        <>
          {samlProviders.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>SAML 2.0</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                {samlProviders.map((p) => (
                  <ProviderCard key={p.provider} provider={p} />
                ))}
              </div>
            </div>
          )}

          {oidcProviders.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>OpenID Connect</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                {oidcProviders.map((p) => (
                  <ProviderCard key={p.provider} provider={p} />
                ))}
              </div>
            </div>
          )}

          {ldapProviders.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem' }}>LDAP</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1rem' }}>
                {ldapProviders.map((p) => (
                  <ProviderCard key={p.provider} provider={p} />
                ))}
              </div>
            </div>
          )}

          {providers && providers.length === 0 && (
            <div
              style={{
                border: '1px solid var(--wo-gray-200)',
                borderRadius: 8,
                padding: '2rem',
                textAlign: 'center',
                backgroundColor: 'white',
                color: 'var(--wo-gray-500)',
              }}
            >
              <p>No SSO providers configured.</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Configure providers via the SSO config file or environment variables.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
