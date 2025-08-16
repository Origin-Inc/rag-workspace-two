import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, useActionData, useFetcher } from '@remix-run/react';
import { useState } from 'react';
import { requireUser } from '~/services/auth/auth.server';
import { prisma } from '~/utils/db.server';
import { IntegrationsPanel, type Integration, type IntegrationProvider } from '~/components/integrations/IntegrationsPanel';
import { OAuthFlow, type OAuthConfig } from '~/components/integrations/OAuthFlow';
import { WebhookManager, type Webhook } from '~/components/integrations/WebhookManager';
import { encrypt, decrypt } from '~/utils/encryption.server';
import { XMarkIcon } from '@heroicons/react/24/outline';
import crypto from 'crypto';

// OAuth configurations will be passed from the server
function getOAuthConfigs(): Record<IntegrationProvider, Partial<OAuthConfig>> {
  return {
    slack: {
      scopes: ['channels:read', 'chat:write', 'files:read', 'users:read'],
      authorizationUrl: 'https://slack.com/oauth/v2/authorize',
      tokenUrl: 'https://slack.com/api/oauth.v2.access',
    },
    github: {
      scopes: ['repo', 'read:org', 'read:user'],
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
    },
    google_drive: {
      scopes: [
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/drive.file',
      ],
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
    },
    figma: {
      scopes: ['file_read'],
      authorizationUrl: 'https://www.figma.com/oauth',
      tokenUrl: 'https://www.figma.com/api/oauth/token',
    },
    notion: {
      scopes: [],
      authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
      tokenUrl: 'https://api.notion.com/v1/oauth/token',
    },
    linear: {
      scopes: ['read', 'write'],
      authorizationUrl: 'https://linear.app/oauth/authorize',
      tokenUrl: 'https://api.linear.app/oauth/token',
    },
  };
}

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);

  // For now, return mock data since the integrations tables don't exist yet
  // In production, you would run the migration first
  const mockWorkspace = {
    id: 'mock-workspace-id',
    name: 'Default Workspace',
    slug: 'default',
  };

  // Mock integrations data
  const integrations: Integration[] = [];

  // Get OAuth client IDs from environment variables (server-side only)
  const oauthClientIds = {
    slack: process.env.SLACK_CLIENT_ID || '',
    github: process.env.GITHUB_CLIENT_ID || '',
    google_drive: process.env.GOOGLE_CLIENT_ID || '',
    figma: process.env.FIGMA_CLIENT_ID || '',
    notion: process.env.NOTION_CLIENT_ID || '',
    linear: process.env.LINEAR_CLIENT_ID || '',
  };

  return json({
    workspace: mockWorkspace,
    integrations,
    oauthClientIds,
    oauthEnabled: Object.fromEntries(
      Object.entries(oauthClientIds).map(([provider, clientId]) => [
        provider,
        !!clientId,
      ])
    ),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const action = formData.get('action') as string;

  // For now, return mock responses since the tables don't exist yet
  // In production, you would run the migration first

  switch (action) {
    case 'connect': {
      const provider = formData.get('provider') as IntegrationProvider;
      console.log('Mock connecting to:', provider);
      // Return mock success
      return json({ 
        success: true, 
        integration: {
          id: crypto.randomUUID(),
          provider,
          isActive: true,
          lastSyncedAt: new Date(),
        }
      });
    }

    case 'disconnect': {
      const integrationId = formData.get('integrationId') as string;
      console.log('Mock disconnecting:', integrationId);
      return json({ success: true });
    }

    case 'sync': {
      const integrationId = formData.get('integrationId') as string;
      console.log('Mock syncing:', integrationId);
      return json({ success: true });
    }

    case 'add-webhook': {
      const url = formData.get('url') as string;
      const events = JSON.parse(formData.get('events') as string) as string[];
      console.log('Mock adding webhook:', url, events);
      return json({ 
        success: true, 
        webhook: {
          id: crypto.randomUUID(),
          url,
          events,
          isActive: true,
        },
        secret: 'mock-secret-key'
      });
    }

    case 'update-webhook': {
      const webhookId = formData.get('webhookId') as string;
      console.log('Mock updating webhook:', webhookId);
      return json({ success: true });
    }

    case 'delete-webhook': {
      const webhookId = formData.get('webhookId') as string;
      console.log('Mock deleting webhook:', webhookId);
      return json({ success: true });
    }

    case 'test-webhook': {
      const webhookId = formData.get('webhookId') as string;
      console.log('Mock testing webhook:', webhookId);
      return json({ success: true });
    }

    default:
      return json({ error: 'Invalid action' }, { status: 400 });
  }
}

export default function IntegrationsSettingsPage() {
  const { workspace, integrations, oauthEnabled, oauthClientIds } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher();
  const [selectedProvider, setSelectedProvider] = useState<IntegrationProvider | null>(null);
  const [managingWebhooks, setManagingWebhooks] = useState<string | null>(null);
  
  const oauthConfigs = getOAuthConfigs();

  const handleConnect = async (provider: IntegrationProvider) => {
    if (!oauthEnabled[provider]) {
      alert(`OAuth is not configured for ${provider}. Please set up OAuth credentials in your environment variables.`);
      return;
    }
    setSelectedProvider(provider);
  };

  const handleDisconnect = async (integrationId: string) => {
    fetcher.submit(
      { action: 'disconnect', integrationId },
      { method: 'post' }
    );
  };

  const handleSync = async (integrationId: string) => {
    fetcher.submit(
      { action: 'sync', integrationId },
      { method: 'post' }
    );
  };

  const handleOAuthSuccess = ({ accessToken, refreshToken }: { accessToken: string; refreshToken?: string }) => {
    if (!selectedProvider) return;

    fetcher.submit(
      {
        action: 'connect',
        provider: selectedProvider,
        accessToken,
        refreshToken: refreshToken || '',
      },
      { method: 'post' }
    );
    setSelectedProvider(null);
  };

  const selectedIntegration = managingWebhooks
    ? integrations.find(i => i.id === managingWebhooks)
    : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Integration Settings
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Connect third-party tools and services to enhance your workspace
        </p>
      </div>

      <IntegrationsPanel
        workspaceId={workspace.id}
        integrations={integrations}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onSync={handleSync}
        onManageWebhooks={setManagingWebhooks}
      />

      {/* OAuth Flow Modal */}
      {selectedProvider && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="relative max-w-md w-full">
            <button
              onClick={() => setSelectedProvider(null)}
              className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 z-10"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
            <OAuthFlow
              config={{
                provider: selectedProvider,
                clientId: oauthClientIds?.[selectedProvider] || '',
                redirectUri: `${window.location.origin}/api/oauth/callback`,
                scopes: oauthConfigs[selectedProvider].scopes || [],
                authorizationUrl: oauthConfigs[selectedProvider].authorizationUrl || '',
                tokenUrl: oauthConfigs[selectedProvider].tokenUrl,
              }}
              onSuccess={handleOAuthSuccess}
              onError={(error) => console.error('OAuth error:', error)}
              onCancel={() => setSelectedProvider(null)}
            />
          </div>
        </div>
      )}

      {/* Webhook Manager Modal */}
      {selectedIntegration && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="relative max-w-4xl w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-lg">
            <button
              onClick={() => setManagingWebhooks(null)}
              className="absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 z-10"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
            <div className="p-6">
              <WebhookManager
                integrationId={selectedIntegration.id}
                provider={selectedIntegration.provider}
                webhooks={selectedIntegration.webhooks as Webhook[] || []}
                onAdd={async (webhook) => {
                  fetcher.submit(
                    {
                      action: 'add-webhook',
                      integrationId: selectedIntegration.id,
                      url: webhook.url || '',
                      events: JSON.stringify(webhook.events || []),
                      isActive: String(webhook.isActive),
                    },
                    { method: 'post' }
                  );
                }}
                onUpdate={async (webhookId, updates) => {
                  fetcher.submit(
                    {
                      action: 'update-webhook',
                      webhookId,
                      url: updates.url || '',
                      events: JSON.stringify(updates.events || []),
                      isActive: String(updates.isActive),
                    },
                    { method: 'post' }
                  );
                }}
                onDelete={async (webhookId) => {
                  fetcher.submit(
                    { action: 'delete-webhook', webhookId },
                    { method: 'post' }
                  );
                }}
                onTest={async (webhookId) => {
                  fetcher.submit(
                    { action: 'test-webhook', webhookId },
                    { method: 'post' }
                  );
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}