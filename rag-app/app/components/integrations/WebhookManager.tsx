import { useState } from 'react';
import {
  PlusIcon,
  TrashIcon,
  PencilIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClipboardDocumentIcon,
  ArrowPathIcon,
  BellIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { formatDistanceToNow } from '~/utils/date';
import { cn } from '~/utils/cn';
import type { IntegrationProvider } from './IntegrationsPanel';

export interface Webhook {
  id: string;
  url: string;
  secret?: string;
  events: string[];
  isActive: boolean;
  lastTriggered?: string | Date | null;
  failureCount: number;
  metadata?: Record<string, any>;
  createdAt: string | Date;
}

export interface WebhookManagerProps {
  integrationId: string;
  provider: IntegrationProvider;
  webhooks: Webhook[];
  onAdd?: (webhook: Partial<Webhook>) => Promise<void>;
  onUpdate?: (webhookId: string, updates: Partial<Webhook>) => Promise<void>;
  onDelete?: (webhookId: string) => Promise<void>;
  onTest?: (webhookId: string) => Promise<void>;
  className?: string;
}

const providerEvents: Record<IntegrationProvider, { value: string; label: string; description: string }[]> = {
  slack: [
    { value: 'message.channels', label: 'Channel Messages', description: 'New messages in channels' },
    { value: 'message.im', label: 'Direct Messages', description: 'New direct messages' },
    { value: 'file_shared', label: 'File Shared', description: 'Files shared in workspace' },
    { value: 'team_join', label: 'Team Join', description: 'New member joins team' },
  ],
  github: [
    { value: 'push', label: 'Push', description: 'Code pushed to repository' },
    { value: 'pull_request', label: 'Pull Request', description: 'PR opened, closed, or merged' },
    { value: 'issues', label: 'Issues', description: 'Issue created or updated' },
    { value: 'release', label: 'Release', description: 'New release published' },
    { value: 'workflow_run', label: 'Workflow Run', description: 'GitHub Action completed' },
  ],
  google_drive: [
    { value: 'file.create', label: 'File Created', description: 'New file created' },
    { value: 'file.update', label: 'File Updated', description: 'File content modified' },
    { value: 'file.delete', label: 'File Deleted', description: 'File removed' },
    { value: 'file.share', label: 'File Shared', description: 'File sharing changed' },
  ],
  figma: [
    { value: 'file_update', label: 'File Update', description: 'Design file modified' },
    { value: 'file_comment', label: 'File Comment', description: 'New comment on file' },
    { value: 'file_version', label: 'Version Created', description: 'New version saved' },
    { value: 'library_publish', label: 'Library Published', description: 'Component library updated' },
  ],
  notion: [
    { value: 'page.created', label: 'Page Created', description: 'New page created' },
    { value: 'page.updated', label: 'Page Updated', description: 'Page content changed' },
    { value: 'database.created', label: 'Database Created', description: 'New database created' },
    { value: 'database.updated', label: 'Database Updated', description: 'Database schema or content changed' },
  ],
  linear: [
    { value: 'Issue.create', label: 'Issue Created', description: 'New issue created' },
    { value: 'Issue.update', label: 'Issue Updated', description: 'Issue status or details changed' },
    { value: 'Project.create', label: 'Project Created', description: 'New project created' },
    { value: 'Comment.create', label: 'Comment Added', description: 'New comment on issue' },
  ],
};

export function WebhookManager({
  integrationId,
  provider,
  webhooks,
  onAdd,
  onUpdate,
  onDelete,
  onTest,
  className,
}: WebhookManagerProps) {
  const [isAddingWebhook, setIsAddingWebhook] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Webhook>>({
    url: '',
    events: [],
    isActive: true,
  });
  const [loadingStates, setLoadingStates] = useState<Record<string, boolean>>({});
  const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

  const availableEvents = providerEvents[provider] || [];

  const handleAddWebhook = async () => {
    if (!formData.url || formData.events?.length === 0) return;

    setLoadingStates(prev => ({ ...prev, add: true }));
    try {
      await onAdd?.(formData);
      setIsAddingWebhook(false);
      setFormData({ url: '', events: [], isActive: true });
    } finally {
      setLoadingStates(prev => ({ ...prev, add: false }));
    }
  };

  const handleUpdateWebhook = async (webhookId: string) => {
    setLoadingStates(prev => ({ ...prev, [webhookId]: true }));
    try {
      await onUpdate?.(webhookId, formData);
      setEditingWebhook(null);
      setFormData({ url: '', events: [], isActive: true });
    } finally {
      setLoadingStates(prev => ({ ...prev, [webhookId]: false }));
    }
  };

  const handleDeleteWebhook = async (webhookId: string) => {
    if (!confirm('Are you sure you want to delete this webhook?')) return;

    setLoadingStates(prev => ({ ...prev, [`delete-${webhookId}`]: true }));
    try {
      await onDelete?.(webhookId);
    } finally {
      setLoadingStates(prev => ({ ...prev, [`delete-${webhookId}`]: false }));
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    setLoadingStates(prev => ({ ...prev, [`test-${webhookId}`]: true }));
    try {
      await onTest?.(webhookId);
    } finally {
      setLoadingStates(prev => ({ ...prev, [`test-${webhookId}`]: false }));
    }
  };

  const toggleEvent = (event: string) => {
    setFormData(prev => ({
      ...prev,
      events: prev.events?.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...(prev.events || []), event],
    }));
  };

  const copySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedSecret(secret);
    setTimeout(() => setCopiedSecret(null), 2000);
  };

  const renderWebhookForm = (webhook?: Webhook) => {
    const isEditing = !!webhook;
    const currentData = isEditing ? { ...webhook, ...formData } : formData;

    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Webhook URL
          </label>
          <input
            type="url"
            value={currentData.url}
            onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
            placeholder="https://your-domain.com/webhooks/..."
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Events to Subscribe
          </label>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {availableEvents.map(event => (
              <label
                key={event.value}
                className="flex items-start p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={currentData.events?.includes(event.value) || false}
                  onChange={() => toggleEvent(event.value)}
                  className="mt-0.5 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {event.label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {event.description}
                  </p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={currentData.isActive}
              onChange={(e) => setFormData(prev => ({ ...prev, isActive: e.target.checked }))}
              className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">
              Active
            </span>
          </label>

          <div className="flex gap-2">
            <button
              onClick={() => {
                if (isEditing) {
                  setEditingWebhook(null);
                } else {
                  setIsAddingWebhook(false);
                }
                setFormData({ url: '', events: [], isActive: true });
              }}
              className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              onClick={() => isEditing ? handleUpdateWebhook(webhook.id) : handleAddWebhook()}
              disabled={!currentData.url || currentData.events?.length === 0 || loadingStates[isEditing ? webhook.id : 'add']}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loadingStates[isEditing ? webhook.id : 'add'] && (
                <ArrowPathIcon className="h-3 w-3 mr-1 animate-spin" />
              )}
              {isEditing ? 'Update' : 'Add'} Webhook
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                Webhooks
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Configure webhooks to receive real-time updates
              </p>
            </div>
            {!isAddingWebhook && (
              <button
                onClick={() => setIsAddingWebhook(true)}
                className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                <PlusIcon className="h-4 w-4 mr-1.5" />
                Add Webhook
              </button>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          {isAddingWebhook && renderWebhookForm()}

          {webhooks.length === 0 && !isAddingWebhook ? (
            <div className="text-center py-8">
              <BellIcon className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                No webhooks configured
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                Add a webhook to receive real-time updates
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {webhooks.map(webhook => (
                <div
                  key={webhook.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  {editingWebhook === webhook.id ? (
                    renderWebhookForm(webhook)
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center">
                            {webhook.isActive ? (
                              <CheckCircleIcon className="h-4 w-4 text-green-500 mr-2" />
                            ) : (
                              <XCircleIcon className="h-4 w-4 text-gray-400 mr-2" />
                            )}
                            <code className="text-sm text-gray-900 dark:text-white break-all">
                              {webhook.url}
                            </code>
                          </div>
                          {webhook.failureCount > 0 && (
                            <div className="flex items-center mt-1">
                              <ExclamationTriangleIcon className="h-3 w-3 text-yellow-500 mr-1" />
                              <span className="text-xs text-yellow-600 dark:text-yellow-400">
                                {webhook.failureCount} failed attempt{webhook.failureCount !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => handleTestWebhook(webhook.id)}
                            disabled={loadingStates[`test-${webhook.id}`]}
                            className="p-1.5 text-gray-500 hover:text-blue-600 dark:hover:text-blue-400"
                            title="Test webhook"
                          >
                            {loadingStates[`test-${webhook.id}`] ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <BellIcon className="h-4 w-4" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setEditingWebhook(webhook.id);
                              setFormData({
                                url: webhook.url,
                                events: webhook.events,
                                isActive: webhook.isActive,
                              });
                            }}
                            className="p-1.5 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            title="Edit webhook"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteWebhook(webhook.id)}
                            disabled={loadingStates[`delete-${webhook.id}`]}
                            className="p-1.5 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                            title="Delete webhook"
                          >
                            {loadingStates[`delete-${webhook.id}`] ? (
                              <ArrowPathIcon className="h-4 w-4 animate-spin" />
                            ) : (
                              <TrashIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {webhook.secret && (
                        <div className="mb-3">
                          <label className="text-xs text-gray-500 dark:text-gray-400">
                            Webhook Secret
                          </label>
                          <div className="flex items-center mt-1">
                            <code className="flex-1 text-xs text-gray-600 dark:text-gray-400 font-mono">
                              {webhook.secret.replace(/./g, '•')}
                            </code>
                            <button
                              onClick={() => copySecret(webhook.secret!)}
                              className="ml-2 p-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                            >
                              {copiedSecret === webhook.secret ? (
                                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                              ) : (
                                <ClipboardDocumentIcon className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 mb-3">
                        {webhook.events.map(event => {
                          const eventConfig = availableEvents.find(e => e.value === event);
                          return (
                            <span
                              key={event}
                              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded"
                            >
                              {eventConfig?.label || event}
                            </span>
                          );
                        })}
                      </div>

                      <div className="flex items-center text-xs text-gray-500 dark:text-gray-400">
                        <span>Created {formatDistanceToNow(webhook.createdAt)}</span>
                        {webhook.lastTriggered && (
                          <>
                            <span className="mx-2">•</span>
                            <span>Last triggered {formatDistanceToNow(webhook.lastTriggered)}</span>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Webhook Documentation */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
          Webhook Payload Format
        </h4>
        <pre className="text-xs text-blue-800 dark:text-blue-200 overflow-x-auto">
{`{
  "event": "event_type",
  "timestamp": "2024-01-01T12:00:00Z",
  "integration": "${provider}",
  "data": { ... }
}`}
        </pre>
      </div>
    </div>
  );
}