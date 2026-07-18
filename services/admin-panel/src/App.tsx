import { Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Users } from './pages/Users';
import { Documents } from './pages/Documents';
import { Services } from './pages/Services';
import { Settings } from './pages/Settings';
import { WOPISettings } from './pages/WOPISettings';
import { SecuritySettings } from './pages/SecuritySettings';
import { AccessRules } from './pages/AccessRules';
import { FileLimits } from './pages/FileLimits';
import { LoggerConfig } from './pages/LoggerConfig';
import { Expiration } from './pages/Expiration';
import { HealthCheck } from './pages/HealthCheck';
import { RequestFiltering } from './pages/RequestFiltering';
import { NotificationConfig } from './pages/NotificationConfig';
import { AiChat } from './pages/AiChat';
import { AiProviders } from './pages/AiProviders';
import { AiSettings } from './pages/AiSettings';
import { SsoProviders } from './pages/SsoProviders';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/documents" element={<Documents />} />
        <Route path="/services" element={<Services />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/wopi-settings" element={<WOPISettings />} />
        <Route path="/security-settings" element={<SecuritySettings />} />
        <Route path="/access-rules" element={<AccessRules />} />
        <Route path="/file-limits" element={<FileLimits />} />
        <Route path="/logger-config" element={<LoggerConfig />} />
        <Route path="/expiration" element={<Expiration />} />
        <Route path="/health-check" element={<HealthCheck />} />
        <Route path="/request-filtering" element={<RequestFiltering />} />
        <Route path="/notification-config" element={<NotificationConfig />} />
        <Route path="/ai/chat" element={<AiChat />} />
        <Route path="/ai/providers" element={<AiProviders />} />
        <Route path="/ai/settings" element={<AiSettings />} />
        <Route path="/sso/providers" element={<SsoProviders />} />
      </Route>
    </Routes>
  );
}
