import { Link, Outlet, useLocation } from '@remix-run/react';
import { 
  UserCircleIcon, 
  KeyIcon, 
  BellIcon, 
  LinkIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  Cog6ToothIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { cn } from '~/utils/cn';

const settingsNavigation = [
  { name: 'Profile', href: '/app/settings/profile', icon: UserCircleIcon },
  { name: 'Account', href: '/app/settings/account', icon: Cog6ToothIcon },
  { name: 'Team', href: '/app/settings/team', icon: UsersIcon },
  { name: 'Integrations', href: '/app/settings/integrations', icon: LinkIcon },
  { name: 'Security', href: '/app/settings/security', icon: ShieldCheckIcon },
  { name: 'Notifications', href: '/app/settings/notifications', icon: BellIcon },
  { name: 'API Keys', href: '/app/settings/api-keys', icon: KeyIcon },
  { name: 'Billing', href: '/app/settings/billing', icon: CreditCardIcon },
];

export default function SettingsLayout() {
  const location = useLocation();
  const isMainSettingsPage = location.pathname === '/app/settings';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Settings</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Manage your account settings and preferences
          </p>
        </div>

        <div className="flex gap-8">
          {/* Settings Navigation Sidebar */}
          <nav className="w-64 space-y-1">
            {settingsNavigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  )}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Settings Content Area */}
          <div className="flex-1">
            {isMainSettingsPage ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Quick Settings
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {settingsNavigation.map((item) => (
                    <Link
                      key={item.name}
                      to={item.href}
                      className="flex items-center p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className={cn(
                        "p-2 rounded-lg mr-4",
                        item.name === 'Integrations' 
                          ? 'bg-purple-100 dark:bg-purple-900/30'
                          : 'bg-gray-100 dark:bg-gray-700'
                      )}>
                        <item.icon className={cn(
                          "h-6 w-6",
                          item.name === 'Integrations'
                            ? 'text-purple-600 dark:text-purple-400'
                            : 'text-gray-600 dark:text-gray-400'
                        )} />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {item.name === 'Integrations' && 'Connect third-party tools'}
                          {item.name === 'Profile' && 'Update your profile information'}
                          {item.name === 'Account' && 'Manage account preferences'}
                          {item.name === 'Team' && 'Manage team members'}
                          {item.name === 'Security' && 'Security and privacy settings'}
                          {item.name === 'Notifications' && 'Email and push notifications'}
                          {item.name === 'API Keys' && 'Manage API access'}
                          {item.name === 'Billing' && 'Subscription and payments'}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>

                {/* Featured Section for Integrations */}
                <div className="mt-8 p-6 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        🚀 New: Third-Party Integrations
                      </h3>
                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                        Connect Slack, GitHub, Google Drive, Figma, Notion, and Linear to supercharge your workspace
                      </p>
                    </div>
                    <Link
                      to="/app/settings/integrations"
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                    >
                      Connect Tools
                    </Link>
                  </div>
                </div>
              </div>
            ) : (
              <Outlet />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}