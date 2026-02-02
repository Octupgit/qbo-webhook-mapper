import { BrowserRouter, Routes, Route } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import Dashboard from './pages/Dashboard';
import SourcesPage from './pages/SourcesPage';
import MappingsPage from './pages/MappingsPage';
import LogsPage from './pages/LogsPage';
import SettingsPage from './pages/SettingsPage';

// Auth Components
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

// Admin Pages
import OrganizationsPage from './pages/admin/OrganizationsPage';
import OrgDetailPage from './pages/admin/OrgDetailPage';
import SystemDashboard from './pages/admin/SystemDashboard';
import LoginPage from './pages/admin/LoginPage';
import ChangePasswordPage from './pages/admin/ChangePasswordPage';

// Developer Hub
import DeveloperHub from './pages/DeveloperHub';

// Client Pages
import ClientOnboarding from './pages/ClientOnboarding';
import PublicConnectPage from './pages/PublicConnectPage';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Auth routes (no layout, no protection) */}
          <Route path="/login" element={<LoginPage />} />

          {/* Change password (protected but allows password change state) */}
          <Route
            path="/admin/change-password"
            element={
              <ProtectedRoute allowPasswordChange>
                <ChangePasswordPage />
              </ProtectedRoute>
            }
          />

          {/* Client-facing routes (no layout, no protection) */}
          <Route path="/org/:clientSlug" element={<ClientOnboarding />} />
          <Route path="/org/:clientSlug/settings" element={<ClientOnboarding />} />
          <Route path="/connect/:slug" element={<PublicConnectPage />} />

          {/* Protected admin routes with layout */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
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
                    <Route path="/admin/system" element={<SystemDashboard />} />

                    {/* Developer Hub */}
                    <Route path="/developer" element={<DeveloperHub />} />
                  </Routes>
                </MainLayout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
