import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import SourcesPage from './pages/SourcesPage';
import MappingsPage from './pages/MappingsPage';
import LogsPage from './pages/LogsPage';
import SettingsPage from './pages/SettingsPage';

// Admin Pages
import OrganizationsPage from './pages/admin/OrganizationsPage';
import OrgDetailPage from './pages/admin/OrgDetailPage';

// Client Pages
import ClientOnboarding from './pages/ClientOnboarding';
import PublicConnectPage from './pages/PublicConnectPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Client-facing routes (no layout) */}
        <Route path="/org/:clientSlug" element={<ClientOnboarding />} />
        <Route path="/org/:clientSlug/settings" element={<ClientOnboarding />} />
        <Route path="/connect/:slug" element={<PublicConnectPage />} />

        {/* Admin routes with layout */}
        <Route
          path="/*"
          element={
            <MainLayout>
              <Routes>
                {/* Legacy Dashboard */}
                <Route path="/" element={<Dashboard />} />
                <Route path="/sources" element={<SourcesPage />} />
                <Route path="/mappings" element={<MappingsPage />} />
                <Route path="/logs" element={<LogsPage />} />
                <Route path="/settings" element={<SettingsPage />} />

                {/* Admin Dashboard */}
                <Route path="/admin" element={<OrganizationsPage />} />
                <Route path="/admin/organizations" element={<OrganizationsPage />} />
                <Route path="/admin/org/:slug" element={<OrgDetailPage />} />
                <Route path="/admin/organizations/:orgId/sources" element={<SourcesPage />} />
                <Route path="/admin/organizations/:orgId/logs" element={<LogsPage />} />
              </Routes>
            </MainLayout>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
