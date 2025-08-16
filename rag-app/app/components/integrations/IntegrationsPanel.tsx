import { useState, useEffect } from 'react';
import { Link } from '@remix-run/react';
import {
  PlusIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  CloudArrowUpIcon,
  LinkIcon,
  CogIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from '~/utils/date';
import { cn } from '~/utils/cn';

export type IntegrationProvider = 
  | 'slack' 
  | 'github' 
  | 'google_drive' 
  | 'figma' 
  | 'notion' 
  | 'linear';

export interface Integration {
  id: string;
  provider: IntegrationProvider;
  isActive: boolean;
  lastSyncedAt?: string | Date | null;
  metadata?: {
    teamName?: string;
    accountName?: string;
    workspaceName?: string;
    email?: string;
    scopes?: string[];
  };
  webhooks?: {
    id: string;
    url: string;
    events: string[];
    isActive: boolean;
    lastTriggered?: string | Date | null;
  }[];
}

export interface IntegrationsPanelProps {
  workspaceId: string;
  integrations?: Integration[];
  onConnect?: (provider: IntegrationProvider) => void;
  onDisconnect?: (integrationId: string) => void;
  onSync?: (integrationId: string) => void;
  onManageWebhooks?: (integrationId: string) => void;
  className?: string;
}

const providerConfig: Record<IntegrationProvider, {
  name: string;
  icon: string;
  color: string;
  bgColor: string;
  description: string;
  features: string[];
}> = {
  slack: {
    name: 'Slack',
    icon: '💬',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    description: 'Connect Slack to receive notifications and share content',
    features: ['Real-time notifications', 'Message sharing', 'Channel integration'],
  },
  github: {
    name: 'GitHub',
    icon: '🐙',
    color: 'text-gray-900 dark:text-white',
    bgColor: 'bg-gray-100 dark:bg-gray-800',
    description: 'Sync GitHub repositories and track issues',
    features: ['Code sync', 'Issue tracking', 'PR notifications'],
  },
  google_drive: {
    name: 'Google Drive',
    icon: '📁',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    description: 'Import and sync files from Google Drive',
    features: ['File sync', 'Document import', 'Automatic backup'],
  },
  figma: {
    name: 'Figma',
    icon: '🎨',
    color: 'text-purple-500',
    bgColor: 'bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20',
    description: 'Embed Figma designs and sync updates',
    features: ['Design embeds', 'Version tracking', 'Comments sync'],
  },
  notion: {
    name: 'Notion',
    icon: '📝',
    color: 'text-gray-800 dark:text-gray-200',
    bgColor: 'bg-gray-50 dark:bg-gray-900',
    description: 'Import pages and databases from Notion',
    features: ['Page import', 'Database sync', 'Two-way sync'],
  },
  linear: {
    name: 'Linear',
    icon: '📊',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    description: 'Track issues and sync project progress',
    features: ['Issue tracking', 'Project sync', 'Status updates'],
  },
};

export function IntegrationsPanel({
  workspaceId,
  integrations = [],
  onConnect,
  onDisconnect,
  onSync,
  onManageWebhooks,
  className,
}: IntegrationsPanelProps) {
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'connected' | 'available'>('all');

  const connectedIntegrations = integrations.filter(i => i.isActive);
  const availableProviders = Object.keys(providerConfig) as IntegrationProvider[];
  const unconnectedProviders = availableProviders.filter(
    provider => !integrations.some(i => i.provider === provider && i.isActive)
  );

  const handleConnect = async (provider: IntegrationProvider) => {
    setLoadingStates(prev => ({ ...prev, [provider]: true }));
    try {
      await onConnect?.(provider);
    } finally {
      setLoadingStates(prev => ({ ...prev, [provider]: false }));
    }
  };

  const handleDisconnect = async (integrationId: string) => {
    setLoadingStates(prev => ({ ...prev, [integrationId]: true }));
    try {
      await onDisconnect?.(integrationId);
    } finally {
      setLoadingStates(prev => ({ ...prev, [integrationId]: false }));
    }
  };

  const handleSync = async (integrationId: string) => {
    setLoadingStates(prev => ({ ...prev, [`sync-${integrationId}`]: true }));
    try {
      await onSync?.(integrationId);
    } finally {
      setLoadingStates(prev => ({ ...prev, [`sync-${integrationId}`]: false }));
    }
  };

  const renderIntegrationCard = (integration: Integration) => {
    const config = providerConfig[integration.provider];
    const isLoading = loadingStates[integration.id];
    const isSyncing = loadingStates[`sync-${integration.id}`];
    const activeWebhooks = integration.webhooks?.filter(w => w.isActive).length || 0;

    return (
      <div
        key={integration.id}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center text-2xl",
              config.bgColor
            )}>
              {config.icon}
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {config.name}
              </h3>
              <div className="flex items-center mt-1">
                {integration.isActive ? (
                  <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
                ) : (
                  <ExclamationCircleIcon className="h-4 w-4 text-yellow-500 mr-1" />
                )}
                <span className={cn(
                  "text-xs",
                  integration.isActive ? "text-green-600 dark:text-green-400" : "text-yellow-600 dark:text-yellow-400"
                )}>
                  {integration.isActive ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={() => handleDisconnect(integration.id)}
            disabled={isLoading}
            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>

        {integration.metadata && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
              {integration.metadata.teamName && (
                <div>Team: <span className="font-medium text-gray-900 dark:text-white">{integration.metadata.teamName}</span></div>
              )}
              {integration.metadata.accountName && (
                <div>Account: <span className="font-medium text-gray-900 dark:text-white">{integration.metadata.accountName}</span></div>
              )}
              {integration.metadata.email && (
                <div>Email: <span className="font-medium text-gray-900 dark:text-white">{integration.metadata.email}</span></div>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
          <div>
            {integration.lastSyncedAt ? (
              <>Last synced {formatDistanceToNow(integration.lastSyncedAt)}</>
            ) : (
              'Never synced'
            )}
          </div>
          {activeWebhooks > 0 && (
            <div className="flex items-center">
              <LinkIcon className="h-3 w-3 mr-1" />
              {activeWebhooks} webhook{activeWebhooks !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleSync(integration.id)}
            disabled={isSyncing || !integration.isActive}
            className={cn(
              "flex-1 flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              integration.isActive
                ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
                : "bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-800"
            )}
          >
            <ArrowPathIcon className={cn("h-4 w-4 mr-1", isSyncing && "animate-spin")} />
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={() => onManageWebhooks?.(integration.id)}
            className="flex items-center justify-center px-3 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            <CogIcon className="h-4 w-4 mr-1" />
            Settings
          </button>
        </div>
      </div>
    );
  };

  const renderAvailableCard = (provider: IntegrationProvider) => {
    const config = providerConfig[provider];
    const isLoading = loadingStates[provider];

    return (
      <div
        key={provider}
        className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 hover:shadow-lg transition-shadow"
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center">
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center text-2xl",
              config.bgColor
            )}>
              {config.icon}
            </div>
            <div className="ml-3">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                {config.name}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Not connected
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {config.description}
        </p>

        <div className="mb-4">
          <ul className="space-y-1">
            {config.features.map((feature, idx) => (
              <li key={idx} className="flex items-center text-xs text-gray-600 dark:text-gray-400">
                <CheckCircleIcon className="h-3 w-3 text-green-500 mr-1.5" />
                {feature}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => handleConnect(provider)}
          disabled={isLoading}
          className="w-full flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <>
              <ArrowPathIcon className="h-4 w-4 mr-1.5 animate-spin" />
              Connecting...
            </>
          ) : (
            <>
              <PlusIcon className="h-4 w-4 mr-1.5" />
              Connect
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Integrations
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Connect your favorite tools to enhance your workspace
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <CloudArrowUpIcon className="h-5 w-5 text-gray-400" />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {connectedIntegrations.length} of {availableProviders.length} connected
            </span>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex space-x-1 bg-gray-100 dark:bg-gray-900 rounded-lg p-1">
          <button
            onClick={() => setSelectedCategory('all')}
            className={cn(
              "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              selectedCategory === 'all'
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            All ({availableProviders.length})
          </button>
          <button
            onClick={() => setSelectedCategory('connected')}
            className={cn(
              "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              selectedCategory === 'connected'
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            Connected ({connectedIntegrations.length})
          </button>
          <button
            onClick={() => setSelectedCategory('available')}
            className={cn(
              "flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              selectedCategory === 'available'
                ? "bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            )}
          >
            Available ({unconnectedProviders.length})
          </button>
        </div>
      </div>

      {/* Integration Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {selectedCategory !== 'available' && connectedIntegrations.map(renderIntegrationCard)}
        {selectedCategory !== 'connected' && unconnectedProviders.map(renderAvailableCard)}
      </div>

      {/* Empty States */}
      {selectedCategory === 'connected' && connectedIntegrations.length === 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-12 text-center">
          <LinkIcon className="mx-auto h-12 w-12 text-gray-400" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            No integrations connected yet
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            Connect your first integration to get started
          </p>
          <button
            onClick={() => setSelectedCategory('available')}
            className="mt-4 inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="h-4 w-4 mr-1.5" />
            Browse Available
          </button>
        </div>
      )}

      {selectedCategory === 'available' && unconnectedProviders.length === 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-12 text-center">
          <CheckCircleIcon className="mx-auto h-12 w-12 text-green-500" />
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            All integrations connected!
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
            You've connected all available integrations
          </p>
        </div>
      )}
    </div>
  );
}