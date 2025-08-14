import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from '@remix-run/node';
import { useLoaderData, useActionData, useFetcher } from '@remix-run/react';
import { useState } from 'react';
import { requireAuth } from '~/utils/auth.server';
import { prisma } from '~/utils/prisma.server';
import { IntegrationsPanel, type Integration, type IntegrationProvider } from '~/components/integrations/IntegrationsPanel';
import { OAuthFlow, type OAuthConfig } from '~/components/integrations/OAuthFlow';
import { WebhookManager, type Webhook } from '~/components/integrations/WebhookManager';
import { encrypt, decrypt } from '~/utils/encryption.server';
import { XMarkIcon } from '@heroicons/react/24/outline';

// OAuth configurations (these should be in environment variables)
const oauthConfigs: Record<IntegrationProvider, Partial<OAuthConfig>> = {
  slack: {
    clientId: process.env.SLACK_CLIENT_ID || '',
    scopes: ['channels:read', 'chat:write', 'files:read', 'users:read'],
    authorizationUrl: 'https://slack.com/oauth/v2/authorize',
    tokenUrl: 'https://slack.com/api/oauth.v2.access',
  },
  github: {
    clientId: process.env.GITHUB_CLIENT_ID || '',
    scopes: ['repo', 'read:org', 'read:user'],
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
  },
  google_drive: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/drive.file',
    ],
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
  },
  figma: {
    clientId: process.env.FIGMA_CLIENT_ID || '',
    scopes: ['file_read'],
    authorizationUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
  },
  notion: {
    clientId: process.env.NOTION_CLIENT_ID || '',
    scopes: [],
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
  },
  linear: {
    clientId: process.env.LINEAR_CLIENT_ID || '',
    scopes: ['read', 'write'],
    authorizationUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
  },
};

export async function loader({ request }: LoaderFunctionArgs) {
  const { user } = await requireAuth(request);

  // Get user's workspace
  const userWorkspace = await prisma.userWorkspace.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });

  if (!userWorkspace) {
    throw new Response('No workspace found', { status: 404 });
  }

  // Get integrations for the workspace
  const integrationCredentials = await prisma.integrationCredential.findMany({
    where: { workspaceId: userWorkspace.workspaceId },
    include: {
      webhooks: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  // Transform to frontend format
  const integrations: Integration[] = integrationCredentials.map(cred => ({
    id: cred.id,
    provider: cred.provider as IntegrationProvider,
    isActive: cred.isActive,
    lastSyncedAt: cred.lastSyncedAt,
    metadata: cred.metadata as any,
    webhooks: cred.webhooks.map(webhook => ({
      id: webhook.id,
      url: webhook.url,
      events: webhook.events,
      isActive: webhook.isActive,
      lastTriggered: webhook.lastTriggered,
    })),
  }));

  return json({
    workspace: userWorkspace.workspace,
    integrations,
    oauthEnabled: Object.fromEntries(
      Object.entries(oauthConfigs).map(([provider, config]) => [
        provider,
        !!config.clientId,
      ])
    ),
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const { user } = await requireAuth(request);
  const formData = await request.formData();
  const action = formData.get('action') as string;

  // Get user's workspace
  const userWorkspace = await prisma.userWorkspace.findFirst({
    where: { userId: user.id },
  });

  if (!userWorkspace) {
    return json({ error: 'No workspace found' }, { status: 404 });
  }

  switch (action) {
    case 'connect': {
      const provider = formData.get('provider') as IntegrationProvider;
      const accessToken = formData.get('accessToken') as string;
      const refreshToken = formData.get('refreshToken') as string;
      const metadata = formData.get('metadata');

      try {
        // Encrypt tokens before storing
        const encryptedAccessToken = accessToken ? await encrypt(accessToken) : null;
        const encryptedRefreshToken = refreshToken ? await encrypt(refreshToken) : null;

        const integration = await prisma.integrationCredential.create({
          data: {
            workspaceId: userWorkspace.workspaceId,
            provider,
            accessToken: encryptedAccessToken,
            refreshToken: encryptedRefreshToken,
            metadata: metadata ? JSON.parse(metadata as string) : undefined,
            isActive: true,
          },
        });

        return json({ success: true, integration });
      } catch (error) {
        console.error('Failed to connect integration:', error);
        return json({ error: 'Failed to connect integration' }, { status: 500 });
      }
    }

    case 'disconnect': {
      const integrationId = formData.get('integrationId') as string;

      try {
        await prisma.integrationCredential.delete({
          where: {
            id: integrationId,
            workspaceId: userWorkspace.workspaceId,
          },
        });

        return json({ success: true });
      } catch (error) {
        console.error('Failed to disconnect integration:', error);
        return json({ error: 'Failed to disconnect integration' }, { status: 500 });
      }
    }

    case 'sync': {
      const integrationId = formData.get('integrationId') as string;

      try {
        // Update last synced timestamp
        const integration = await prisma.integrationCredential.update({
          where: {
            id: integrationId,
            workspaceId: userWorkspace.workspaceId,
          },
          data: {
            lastSyncedAt: new Date(),
          },
        });

        // TODO: Trigger actual sync job

        return json({ success: true, integration });
      } catch (error) {
        console.error('Failed to sync integration:', error);
        return json({ error: 'Failed to sync integration' }, { status: 500 });
      }
    }

    case 'add-webhook': {
      const integrationId = formData.get('integrationId') as string;
      const url = formData.get('url') as string;
      const events = JSON.parse(formData.get('events') as string) as string[];
      const isActive = formData.get('isActive') === 'true';

      try {
        // Generate webhook secret
        const secret = crypto.randomUUID();

        const webhook = await prisma.webhook.create({
          data: {
            integrationId,
            url,
            secret: await encrypt(secret),
            events,
            isActive,
          },
        });

        return json({ success: true, webhook, secret });
      } catch (error) {
        console.error('Failed to add webhook:', error);
        return json({ error: 'Failed to add webhook' }, { status: 500 });
      }
    }

    case 'update-webhook': {
      const webhookId = formData.get('webhookId') as string;
      const url = formData.get('url') as string;
      const events = JSON.parse(formData.get('events') as string) as string[];
      const isActive = formData.get('isActive') === 'true';

      try {
        const webhook = await prisma.webhook.update({
          where: { id: webhookId },
          data: { url, events, isActive },
        });

        return json({ success: true, webhook });
      } catch (error) {
        console.error('Failed to update webhook:', error);
        return json({ error: 'Failed to update webhook' }, { status: 500 });
      }
    }

    case 'delete-webhook': {
      const webhookId = formData.get('webhookId') as string;

      try {
        await prisma.webhook.delete({
          where: { id: webhookId },
        });

        return json({ success: true });
      } catch (error) {
        console.error('Failed to delete webhook:', error);
        return json({ error: 'Failed to delete webhook' }, { status: 500 });
      }
    }

    case 'test-webhook': {
      const webhookId = formData.get('webhookId') as string;

      try {
        const webhook = await prisma.webhook.findUnique({
          where: { id: webhookId },
          include: { integration: true },
        });

        if (!webhook) {
          return json({ error: 'Webhook not found' }, { status: 404 });
        }

        // Send test payload to webhook URL
        const testPayload = {
          event: 'test',
          timestamp: new Date().toISOString(),
          integration: webhook.integration.provider,
          data: {
            message: 'This is a test webhook from your RAG workspace',
          },
        };

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': webhook.secret ? await decrypt(webhook.secret) : '',
          },
          body: JSON.stringify(testPayload),
        });

        if (response.ok) {
          await prisma.webhook.update({
            where: { id: webhookId },
            data: { lastTriggered: new Date() },
          });
          return json({ success: true });
        } else {
          await prisma.webhook.update({
            where: { id: webhookId },
            data: { failureCount: { increment: 1 } },
          });
          return json({ error: `Webhook returned ${response.status}` }, { status: 400 });
        }
      } catch (error) {
        console.error('Failed to test webhook:', error);
        return json({ error: 'Failed to test webhook' }, { status: 500 });
      }
    }

    default:
      return json({ error: 'Invalid action' }, { status: 400 });
  }
}

export default function IntegrationsSettingsPage() {
  const { workspace, integrations, oauthEnabled } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const fetcher = useFetcher();
  const [selectedProvider, setSelectedProvider] = useState<IntegrationProvider | null>(null);
  const [managingWebhooks, setManagingWebhooks] = useState<string | null>(null);

  const handleConnect = async (provider: IntegrationProvider) => {
    if (!oauthEnabled[provider]) {
      alert(`OAuth is not configured for ${provider}. Please set up OAuth credentials.`);
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
                clientId: oauthConfigs[selectedProvider].clientId || '',
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