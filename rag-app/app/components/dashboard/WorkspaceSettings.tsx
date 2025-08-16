import React, { useState, useEffect } from 'react';
import { 
  CogIcon,
  ShieldCheckIcon,
  PuzzlePieceIcon,
  CreditCardIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  BellIcon,
  DocumentDuplicateIcon,
  TrashIcon,
  CheckIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

export interface WorkspaceData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  timezone: string;
  dateFormat: string;
  language: string;
  isPublic: boolean;
  allowSignups: boolean;
  requireEmailVerification: boolean;
  defaultRole: string;
  storageLimit: number;
  aiCreditsLimit: number;
  maxMembers: number;
  billingEmail?: string;
  billingPlan: 'free' | 'pro' | 'enterprise';
  stripeCustomerId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  roles: string[];
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  icon: string;
  connected: boolean;
  config?: Record<string, any>;
  lastSync?: string;
}

export interface BillingInfo {
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'trial' | 'past_due' | 'cancelled';
  currentPeriodEnd?: string;
  usage: {
    storage: number;
    aiCredits: number;
    members: number;
  };
  limits: {
    storage: number;
    aiCredits: number;
    members: number;
  };
  paymentMethod?: {
    type: string;
    last4: string;
    expiryMonth: number;
    expiryYear: number;
  };
  invoices?: Array<{
    id: string;
    date: string;
    amount: number;
    status: string;
    downloadUrl?: string;
  }>;
}

export interface WorkspaceSettingsProps {
  workspace: WorkspaceData;
  permissions?: Permission[];
  integrations?: Integration[];
  billing?: BillingInfo;
  onSave?: (section: string, data: any) => Promise<void>;
  onDelete?: () => Promise<void>;
  onUpgrade?: () => void;
  className?: string;
}

type TabType = 'general' | 'permissions' | 'integrations' | 'billing';

const defaultPermissions: Permission[] = [
  {
    id: 'create-pages',
    name: 'Create Pages',
    description: 'Allow members to create new pages',
    enabled: true,
    roles: ['admin', 'member'],
  },
  {
    id: 'delete-pages',
    name: 'Delete Pages',
    description: 'Allow members to delete pages',
    enabled: false,
    roles: ['admin'],
  },
  {
    id: 'invite-members',
    name: 'Invite Members',
    description: 'Allow members to invite new team members',
    enabled: false,
    roles: ['admin', 'owner'],
  },
  {
    id: 'manage-projects',
    name: 'Manage Projects',
    description: 'Allow members to create and manage projects',
    enabled: true,
    roles: ['admin', 'member'],
  },
  {
    id: 'export-data',
    name: 'Export Data',
    description: 'Allow members to export workspace data',
    enabled: true,
    roles: ['admin', 'member', 'viewer'],
  },
];

const defaultIntegrations: Integration[] = [
  {
    id: 'slack',
    name: 'Slack',
    description: 'Get notifications and share updates in Slack',
    icon: '💬',
    connected: false,
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Sync issues and pull requests',
    icon: '🐙',
    connected: false,
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Import and sync documents from Google Drive',
    icon: '📁',
    connected: false,
  },
  {
    id: 'figma',
    name: 'Figma',
    description: 'Embed and sync Figma designs',
    icon: '🎨',
    connected: false,
  },
];

export function WorkspaceSettings({
  workspace,
  permissions = defaultPermissions,
  integrations = defaultIntegrations,
  billing = {
    plan: 'free',
    status: 'active',
    usage: { storage: 512, aiCredits: 2500, members: 3 },
    limits: { storage: 1024, aiCredits: 10000, members: 5 },
  },
  onSave,
  onDelete,
  onUpgrade,
  className = '',
}: WorkspaceSettingsProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // Form states
  const [generalSettings, setGeneralSettings] = useState({
    name: workspace.name,
    slug: workspace.slug,
    description: workspace.description || '',
    timezone: workspace.timezone,
    dateFormat: workspace.dateFormat,
    language: workspace.language,
    isPublic: workspace.isPublic,
    allowSignups: workspace.allowSignups,
    requireEmailVerification: workspace.requireEmailVerification,
  });
  
  const [permissionSettings, setPermissionSettings] = useState(permissions);
  const [integrationSettings, setIntegrationSettings] = useState(integrations);

  const tabs = [
    { id: 'general' as TabType, name: 'General', icon: CogIcon },
    { id: 'permissions' as TabType, name: 'Permissions', icon: ShieldCheckIcon },
    { id: 'integrations' as TabType, name: 'Integrations', icon: PuzzlePieceIcon },
    { id: 'billing' as TabType, name: 'Billing', icon: CreditCardIcon },
  ];

  const handleSaveGeneral = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    
    try {
      if (onSave) {
        await onSave('general', generalSettings);
      }
      setSuccessMessage('General settings saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage('Failed to save general settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSavePermissions = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    
    try {
      if (onSave) {
        await onSave('permissions', permissionSettings);
      }
      setSuccessMessage('Permissions saved successfully');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage('Failed to save permissions');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePermission = (permissionId: string) => {
    setPermissionSettings(prev =>
      prev.map(p =>
        p.id === permissionId ? { ...p, enabled: !p.enabled } : p
      )
    );
  };

  const handleConnectIntegration = async (integrationId: string) => {
    setIsLoading(true);
    try {
      // Mock connection logic
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setIntegrationSettings(prev =>
        prev.map(i =>
          i.id === integrationId
            ? { ...i, connected: true, lastSync: new Date().toISOString() }
            : i
        )
      );
      
      if (onSave) {
        await onSave('integrations', { id: integrationId, connected: true });
      }
      
      setSuccessMessage(`${integrationId} connected successfully`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(`Failed to connect ${integrationId}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectIntegration = async (integrationId: string) => {
    if (!window.confirm('Are you sure you want to disconnect this integration?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setIntegrationSettings(prev =>
        prev.map(i =>
          i.id === integrationId
            ? { ...i, connected: false, lastSync: undefined }
            : i
        )
      );
      
      if (onSave) {
        await onSave('integrations', { id: integrationId, connected: false });
      }
      
      setSuccessMessage(`${integrationId} disconnected`);
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (error) {
      setErrorMessage(`Failed to disconnect ${integrationId}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (onDelete) {
      setIsLoading(true);
      try {
        await onDelete();
      } catch (error) {
        setErrorMessage('Failed to delete workspace');
      } finally {
        setIsLoading(false);
        setShowDeleteConfirm(false);
      }
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 MB';
    const mb = bytes / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`;
  };

  const formatPercentage = (used: number, limit: number) => {
    return Math.round((used / limit) * 100);
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Workspace Settings
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your workspace configuration and preferences
          </p>
        </div>
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/30 p-4">
          <div className="flex">
            <CheckIcon className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {successMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
          <div className="flex">
            <XMarkIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {errorMessage}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center whitespace-nowrap border-b-2 py-2 px-1 text-sm font-medium
                  ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }
                `}
              >
                <Icon className="mr-2 h-5 w-5" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {/* General Settings */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="workspace-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Workspace Name
                </label>
                <input
                  type="text"
                  id="workspace-name"
                  value={generalSettings.name}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, name: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="workspace-slug" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  URL Slug
                </label>
                <div className="mt-1 flex rounded-md shadow-sm">
                  <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 px-3 text-gray-500 dark:text-gray-400 sm:text-sm">
                    workspace.app/
                  </span>
                  <input
                    type="text"
                    id="workspace-slug"
                    value={generalSettings.slug}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, slug: e.target.value }))}
                    className="block w-full flex-1 rounded-none rounded-r-md border-gray-300 dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="workspace-description" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Description
                </label>
                <textarea
                  id="workspace-description"
                  rows={3}
                  value={generalSettings.description}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, description: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                />
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Timezone
                </label>
                <select
                  id="timezone"
                  value={generalSettings.timezone}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, timezone: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                >
                  <option value="UTC">UTC</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Chicago">Central Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="Europe/London">London</option>
                  <option value="Europe/Paris">Paris</option>
                  <option value="Asia/Tokyo">Tokyo</option>
                </select>
              </div>

              <div>
                <label htmlFor="date-format" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Date Format
                </label>
                <select
                  id="date-format"
                  value={generalSettings.dateFormat}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, dateFormat: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                >
                  <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                </select>
              </div>

              <div>
                <label htmlFor="language" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Language
                </label>
                <select
                  id="language"
                  value={generalSettings.language}
                  onChange={(e) => setGeneralSettings(prev => ({ ...prev, language: e.target.value }))}
                  className="mt-1 block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
                >
                  <option value="en">English</option>
                  <option value="es">Spanish</option>
                  <option value="fr">French</option>
                  <option value="de">German</option>
                  <option value="ja">Japanese</option>
                  <option value="zh">Chinese</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Privacy & Security
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center">
                  <input
                    id="is-public"
                    type="checkbox"
                    checked={generalSettings.isPublic}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, isPublic: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="is-public" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Make workspace publicly visible
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    id="allow-signups"
                    type="checkbox"
                    checked={generalSettings.allowSignups}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, allowSignups: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="allow-signups" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Allow public sign-ups
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    id="require-verification"
                    type="checkbox"
                    checked={generalSettings.requireEmailVerification}
                    onChange={(e) => setGeneralSettings(prev => ({ ...prev, requireEmailVerification: e.target.checked }))}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="require-verification" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    Require email verification
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-6">
              <button
                onClick={handleSaveGeneral}
                disabled={isSaving}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}

        {/* Permissions */}
        {activeTab === 'permissions' && (
          <div className="space-y-6">
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Role Permissions
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Configure what different roles can do in your workspace
              </p>

              <div className="space-y-4">
                {permissionSettings.map((permission) => (
                  <div
                    key={permission.id}
                    className="flex items-center justify-between p-4 bg-white dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600"
                  >
                    <div className="flex-1">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id={permission.id}
                          checked={permission.enabled}
                          onChange={() => handleTogglePermission(permission.id)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <label
                          htmlFor={permission.id}
                          className="ml-3 text-sm font-medium text-gray-900 dark:text-white"
                        >
                          {permission.name}
                        </label>
                      </div>
                      <p className="ml-7 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        {permission.description}
                      </p>
                      <div className="ml-7 mt-2 flex flex-wrap gap-2">
                        {permission.roles.map((role) => (
                          <span
                            key={role}
                            className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                          >
                            {role}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleSavePermissions}
                  disabled={isSaving}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                >
                  {isSaving ? 'Saving...' : 'Save Permissions'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Integrations */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {integrationSettings.map((integration) => (
                <div
                  key={integration.id}
                  className="relative rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <span className="text-2xl">{integration.icon}</span>
                      <div>
                        <h4 className="text-lg font-medium text-gray-900 dark:text-white">
                          {integration.name}
                        </h4>
                        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                          {integration.description}
                        </p>
                        {integration.connected && integration.lastSync && (
                          <p className="mt-2 text-xs text-gray-400">
                            Last synced: {new Date(integration.lastSync).toLocaleDateString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4">
                    {integration.connected ? (
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center text-sm text-green-600 dark:text-green-400">
                          <CheckIcon className="mr-1 h-4 w-4" />
                          Connected
                        </span>
                        <button
                          onClick={() => handleDisconnectIntegration(integration.id)}
                          disabled={isLoading}
                          className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleConnectIntegration(integration.id)}
                        disabled={isLoading}
                        className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400"
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Billing */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            {/* Current Plan */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Current Plan
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    {billing.plan === 'free' ? 'Free Plan' : billing.plan === 'pro' ? 'Pro Plan' : 'Enterprise Plan'}
                  </p>
                </div>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                  billing.status === 'active' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  billing.status === 'trial' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                }`}>
                  {billing.status}
                </span>
              </div>

              {billing.currentPeriodEnd && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                  Current period ends: {new Date(billing.currentPeriodEnd).toLocaleDateString()}
                </p>
              )}

              {/* Usage Metrics */}
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-300">Storage</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {formatBytes(billing.usage.storage * 1024 * 1024)} / {formatBytes(billing.limits.storage * 1024 * 1024)}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${formatPercentage(billing.usage.storage, billing.limits.storage)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-300">AI Credits</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {billing.usage.aiCredits.toLocaleString()} / {billing.limits.aiCredits.toLocaleString()}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${formatPercentage(billing.usage.aiCredits, billing.limits.aiCredits)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-700 dark:text-gray-300">Team Members</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {billing.usage.members} / {billing.limits.members}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${formatPercentage(billing.usage.members, billing.limits.members)}%` }}
                    />
                  </div>
                </div>
              </div>

              {billing.plan === 'free' && onUpgrade && (
                <div className="mt-6">
                  <button
                    onClick={onUpgrade}
                    className="w-full inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    Upgrade to Pro
                  </button>
                </div>
              )}
            </div>

            {/* Payment Method */}
            {billing.paymentMethod && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Payment Method
                </h3>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <CreditCardIcon className="h-8 w-8 text-gray-400" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {billing.paymentMethod.type} ending in {billing.paymentMethod.last4}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Expires {billing.paymentMethod.expiryMonth}/{billing.paymentMethod.expiryYear}
                      </p>
                    </div>
                  </div>
                  <button className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                    Update
                  </button>
                </div>
              </div>
            )}

            {/* Recent Invoices */}
            {billing.invoices && billing.invoices.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  Recent Invoices
                </h3>
                <div className="space-y-3">
                  {billing.invoices.slice(0, 5).map((invoice) => (
                    <div key={invoice.id} className="flex items-center justify-between py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          ${(invoice.amount / 100).toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(invoice.date).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          invoice.status === 'paid' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                          'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                          {invoice.status}
                        </span>
                        {invoice.downloadUrl && (
                          <a
                            href={invoice.downloadUrl}
                            className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 p-6">
              <h3 className="text-lg font-medium text-red-900 dark:text-red-200 mb-2">
                Danger Zone
              </h3>
              <p className="text-sm text-red-700 dark:text-red-300 mb-4">
                Once you delete a workspace, there is no going back. Please be certain.
              </p>
              
              {showDeleteConfirm ? (
                <div className="space-y-3">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    Type <strong>{workspace.name}</strong> to confirm:
                  </p>
                  <input
                    type="text"
                    className="block w-full rounded-md border-red-300 dark:border-red-600 shadow-sm focus:border-red-500 focus:ring-red-500 dark:bg-gray-800 dark:text-white sm:text-sm"
                    placeholder="Enter workspace name"
                  />
                  <div className="flex space-x-3">
                    <button
                      onClick={handleDeleteWorkspace}
                      disabled={isLoading}
                      className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                    >
                      <TrashIcon className="mr-2 h-4 w-4" />
                      {isLoading ? 'Deleting...' : 'Delete Workspace'}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="inline-flex items-center px-4 py-2 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center px-4 py-2 border border-red-300 dark:border-red-600 text-sm font-medium rounded-md text-red-700 dark:text-red-300 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  <ExclamationTriangleIcon className="mr-2 h-4 w-4" />
                  Delete Workspace
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}