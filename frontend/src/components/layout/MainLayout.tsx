import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  HomeIcon,
  ServerStackIcon,
  ArrowsRightLeftIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  BuildingOffice2Icon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: 'main' | 'admin';
}

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: HomeIcon, section: 'main' },
  { name: 'Sources', href: '/sources', icon: ServerStackIcon, section: 'main' },
  { name: 'Mappings', href: '/mappings', icon: ArrowsRightLeftIcon, section: 'main' },
  { name: 'Sync Logs', href: '/logs', icon: DocumentTextIcon, section: 'main' },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon, section: 'main' },
];

const adminNavigation: NavItem[] = [
  { name: 'Organizations', href: '/admin', icon: BuildingOffice2Icon, section: 'admin' },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Logo */}
        <div className="flex items-center h-16 px-6 border-b border-gray-200">
          <span className="text-xl font-bold text-blue-600">QBO</span>
          <span className="ml-1 text-xl font-semibold text-gray-800">Webhook Mapper</span>
        </div>

        {/* Navigation */}
        <nav className="mt-6 px-3">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));

            return (
              <Link
                key={item.name}
                to={item.href}
                className={`
                  flex items-center px-3 py-2 mt-1 text-sm font-medium rounded-lg transition-colors
                  ${isActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                  }
                `}
              >
                <item.icon
                  className={`w-5 h-5 mr-3 ${isActive ? 'text-blue-700' : 'text-gray-400'}`}
                />
                {item.name}
              </Link>
            );
          })}

          {/* Admin Section */}
          <div className="mt-8 pt-4 border-t border-gray-200">
            <p className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Admin
            </p>
            {adminNavigation.map((item) => {
              const isActive = location.pathname === item.href ||
                location.pathname.startsWith(item.href);

              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`
                    flex items-center px-3 py-2 mt-1 text-sm font-medium rounded-lg transition-colors
                    ${isActive
                      ? 'bg-purple-50 text-purple-700'
                      : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }
                  `}
                >
                  <item.icon
                    className={`w-5 h-5 mr-3 ${isActive ? 'text-purple-700' : 'text-gray-400'}`}
                  />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </nav>

        {/* User info & Logout */}
        <div className="mt-auto border-t border-gray-200 p-4 bg-white">
          {user && (
            <div className="mb-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user.name || user.email}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user.email}
              </p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-50 hover:text-gray-900 hover:shadow transition-all"
          >
            <ArrowRightOnRectangleIcon className="w-5 h-5 mr-3 text-gray-400" />
            Sign out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="pl-64">
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
