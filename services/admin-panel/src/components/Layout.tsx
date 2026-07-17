import { NavLink, Outlet } from 'react-router-dom';

interface NavSection {
  heading?: string;
  items: { path: string; label: string }[];
}

const navSections: NavSection[] = [
  {
    items: [
      { path: '/', label: 'Dashboard' },
      { path: '/users', label: 'Users' },
      { path: '/documents', label: 'Documents' },
      { path: '/services', label: 'Services' },
    ],
  },
  {
    heading: 'WOPI',
    items: [{ path: '/wopi-settings', label: 'WOPI Settings' }],
  },
  {
    heading: 'Security',
    items: [
      { path: '/security-settings', label: 'Security Settings' },
      { path: '/access-rules', label: 'Access Rules' },
      { path: '/request-filtering', label: 'Request Filtering' },
    ],
  },
  {
    heading: 'Configuration',
    items: [
      { path: '/file-limits', label: 'File Limits' },
      { path: '/logger-config', label: 'Logger Config' },
      { path: '/expiration', label: 'Expiration' },
    ],
  },
  {
    heading: 'Monitoring',
    items: [{ path: '/health-check', label: 'Health Check' }],
  },
  {
    heading: 'Notifications',
    items: [{ path: '/notification-config', label: 'Notification Config' }],
  },
  {
    heading: 'AI',
    items: [
      { path: '/ai/chat', label: 'AI Chat' },
      { path: '/ai/providers', label: 'AI Providers' },
      { path: '/ai/settings', label: 'AI Settings' },
    ],
  },
];

export function Layout() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <nav
        style={{
          width: 240,
          backgroundColor: 'var(--wo-gray-900)',
          color: 'white',
          padding: '1.5rem 0',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: '0 1.5rem 1.5rem', borderBottom: '1px solid var(--wo-gray-700)' }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>World Office</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--wo-gray-300)' }}>Admin Panel</p>
        </div>
        <ul style={{ listStyle: 'none', padding: '1rem 0', flex: 1 }}>
          {navSections.map((section) => (
            <li key={section.heading ?? 'top'}>
              {section.heading && (
                <div
                  style={{
                    padding: '0.75rem 1.5rem 0.375rem',
                    fontSize: '0.625rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--wo-gray-500)',
                  }}
                >
                  {section.heading}
                </div>
              )}
              <ul style={{ listStyle: 'none' }}>
                {section.items.map((item) => (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      style={({ isActive }) => ({
                        display: 'block',
                        padding: '0.5rem 1.5rem',
                        color: isActive ? 'white' : 'var(--wo-gray-300)',
                        backgroundColor: isActive ? 'var(--wo-blue-700)' : 'transparent',
                        textDecoration: 'none',
                        fontSize: '0.875rem',
                        transition: 'background-color 0.15s',
                      })}
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: '2rem', overflow: 'auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
