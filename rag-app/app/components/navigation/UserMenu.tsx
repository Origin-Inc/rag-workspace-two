import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, Form } from '@remix-run/react';
import {
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  UserIcon,
  BuildingOfficeIcon,
  QuestionMarkCircleIcon,
} from '@heroicons/react/24/outline';

interface UserMenuProps {
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  currentWorkspace?: {
    id: string;
    name: string;
  };
}

export function UserMenu({ user, currentWorkspace }: UserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const menuItems = [
    {
      label: 'Profile',
      icon: UserIcon,
      href: '/app/profile',
    },
    {
      label: 'Settings',
      icon: Cog6ToothIcon,
      href: '/app/settings',
    },
    {
      label: 'Workspace Settings',
      icon: BuildingOfficeIcon,
      href: '/app/workspace/settings',
    },
    {
      label: 'Help & Support',
      icon: QuestionMarkCircleIcon,
      href: '/app/help',
    },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 rounded-lg hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {user.name ? (
          <div className="flex items-center">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold mr-3">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="text-left">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
          </div>
        ) : (
          <>
            <UserCircleIcon className="mr-3 h-8 w-8 text-gray-400" />
            <div className="text-left">
              <div className="font-medium">User</div>
              <div className="text-xs text-gray-500">{user.email}</div>
            </div>
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* User Info Section */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center">
              {user.name ? (
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold mr-3">
                  {user.name.charAt(0).toUpperCase()}
                </div>
              ) : (
                <UserCircleIcon className="w-10 h-10 text-gray-400 mr-3" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-900 truncate">
                  {user.name || 'User'}
                </div>
                <div className="text-sm text-gray-500 truncate">
                  {user.email}
                </div>
                {currentWorkspace && (
                  <div className="text-xs text-gray-400 truncate">
                    {currentWorkspace.name}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  className="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="h-4 w-4 mr-3 text-gray-400" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* Logout */}
          <div className="border-t border-gray-200 py-1">
            <Form method="post" action="/auth/logout">
              <button
                type="submit"
                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <ArrowRightOnRectangleIcon className="h-4 w-4 mr-3 text-gray-400" />
                Sign out
              </button>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}