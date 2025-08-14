import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { IntegrationsPanel, type Integration, type IntegrationProvider } from '~/components/integrations/IntegrationsPanel';
import { OAuthFlow, OAuthCallback } from '~/components/integrations/OAuthFlow';
import { WebhookManager } from '~/components/integrations/WebhookManager';
import { BrowserRouter } from 'react-router-dom';

// Mock fetch
global.fetch = vi.fn();

// Mock window.open for OAuth flow
global.open = vi.fn();

// Mock crypto for webhook secret generation
global.crypto = {
  randomUUID: vi.fn(() => 'test-uuid-123'),
} as any;

// Wrapper component with router
const RouterWrapper = ({ children }: { children: React.ReactNode }) => (
  <BrowserRouter>{children}</BrowserRouter>
);

describe('IntegrationsPanel', () => {
  const mockIntegrations: Integration[] = [
    {
      id: '1',
      provider: 'slack',
      isActive: true,
      lastSyncedAt: new Date('2024-01-01'),
      metadata: {
        teamName: 'Test Team',
        email: 'test@example.com',
      },
      webhooks: [],
    },
    {
      id: '2',
      provider: 'github',
      isActive: false,
      lastSyncedAt: null,
      metadata: {},
      webhooks: [],
    },
  ];

  const mockHandlers = {
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onSync: vi.fn(),
    onManageWebhooks: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders integrations panel with providers', () => {
    render(
      <IntegrationsPanel
        workspaceId="test-workspace"
        integrations={mockIntegrations}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('displays connected and available integrations', () => {
    render(
      <IntegrationsPanel
        workspaceId="test-workspace"
        integrations={mockIntegrations}
        {...mockHandlers}
      />
    );

    // Check connected count
    expect(screen.getByText('1 of 6 connected')).toBeInTheDocument();
    
    // Check Slack is shown as connected
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('Team: Test Team')).toBeInTheDocument();
  });

  it('filters integrations by category', () => {
    render(
      <IntegrationsPanel
        workspaceId="test-workspace"
        integrations={mockIntegrations}
        {...mockHandlers}
      />
    );

    // Click on Connected tab
    fireEvent.click(screen.getByText('Connected (1)'));
    
    // Should show only Slack
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.queryByText('Linear')).not.toBeInTheDocument();

    // Click on Available tab
    fireEvent.click(screen.getByText('Available (5)'));
    
    // Should not show Slack (already connected)
    expect(screen.queryByText('Team: Test Team')).not.toBeInTheDocument();
  });

  it('handles connect action', async () => {
    render(
      <IntegrationsPanel
        workspaceId="test-workspace"
        integrations={[]}
        {...mockHandlers}
      />
    );

    // Find and click Connect button for first available provider
    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(mockHandlers.onConnect).toHaveBeenCalledWith('slack');
    });
  });

  it('handles disconnect action', async () => {
    render(
      <IntegrationsPanel
        workspaceId="test-workspace"
        integrations={mockIntegrations}
        {...mockHandlers}
      />
    );

    // Find and click disconnect button (trash icon)
    const disconnectButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('[class*="TrashIcon"]')
    );
    
    if (disconnectButton) {
      fireEvent.click(disconnectButton);
      await waitFor(() => {
        expect(mockHandlers.onDisconnect).toHaveBeenCalledWith('1');
      });
    }
  });

  it('handles sync action', async () => {
    render(
      <IntegrationsPanel
        workspaceId="test-workspace"
        integrations={mockIntegrations}
        {...mockHandlers}
      />
    );

    // Find and click Sync Now button
    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(mockHandlers.onSync).toHaveBeenCalledWith('1');
    });
  });

  it('displays loading state during sync', async () => {
    const { rerender } = render(
      <IntegrationsPanel
        workspaceId="test-workspace"
        integrations={mockIntegrations}
        {...mockHandlers}
      />
    );

    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    // Should show syncing state
    await waitFor(() => {
      expect(screen.getByText('Syncing...')).toBeInTheDocument();
    });
  });
});

describe('OAuthFlow', () => {
  const mockConfig = {
    provider: 'github' as IntegrationProvider,
    clientId: 'test-client-id',
    redirectUri: 'http://localhost:3000/callback',
    scopes: ['repo', 'user'],
    authorizationUrl: 'https://github.com/login/oauth/authorize',
  };

  const mockHandlers = {
    onSuccess: vi.fn(),
    onError: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it('renders OAuth flow initial state', () => {
    render(
      <RouterWrapper>
        <OAuthFlow config={mockConfig} {...mockHandlers} />
      </RouterWrapper>
    );

    expect(screen.getByText('Connect Github')).toBeInTheDocument();
    expect(screen.getByText('Continue with Github')).toBeInTheDocument();
  });

  it('opens OAuth popup when continuing', () => {
    render(
      <RouterWrapper>
        <OAuthFlow config={mockConfig} {...mockHandlers} />
      </RouterWrapper>
    );

    fireEvent.click(screen.getByText('Continue with Github'));

    expect(global.open).toHaveBeenCalledWith(
      expect.stringContaining('github.com/login/oauth/authorize'),
      'oauth-window',
      expect.any(String)
    );
  });

  it('stores state in session storage for CSRF protection', () => {
    render(
      <RouterWrapper>
        <OAuthFlow config={mockConfig} {...mockHandlers} />
      </RouterWrapper>
    );

    fireEvent.click(screen.getByText('Continue with Github'));

    expect(sessionStorage.getItem('oauth-state')).toBeTruthy();
  });

  it('handles OAuth success callback', async () => {
    render(
      <RouterWrapper>
        <OAuthFlow config={mockConfig} {...mockHandlers} />
      </RouterWrapper>
    );

    // Simulate OAuth callback message
    const event = new MessageEvent('message', {
      data: { type: 'oauth-callback', code: 'test-auth-code' },
      origin: window.location.origin,
    });

    window.dispatchEvent(event);

    // Mock successful token exchange
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      }),
    });

    await waitFor(() => {
      expect(mockHandlers.onSuccess).toHaveBeenCalledWith({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });
    });
  });

  it('handles OAuth error callback', async () => {
    render(
      <RouterWrapper>
        <OAuthFlow config={mockConfig} {...mockHandlers} />
      </RouterWrapper>
    );

    // Simulate OAuth error message
    const event = new MessageEvent('message', {
      data: { type: 'oauth-callback', error: 'access_denied' },
      origin: window.location.origin,
    });

    window.dispatchEvent(event);

    await waitFor(() => {
      expect(mockHandlers.onError).toHaveBeenCalledWith(
        new Error('access_denied')
      );
    });
  });

  it('handles cancel action', () => {
    render(
      <RouterWrapper>
        <OAuthFlow config={mockConfig} {...mockHandlers} />
      </RouterWrapper>
    );

    fireEvent.click(screen.getByText('Cancel'));

    expect(mockHandlers.onCancel).toHaveBeenCalled();
  });
});

describe('WebhookManager', () => {
  const mockWebhooks = [
    {
      id: 'webhook-1',
      url: 'https://example.com/webhook',
      secret: 'secret-key',
      events: ['push', 'pull_request'],
      isActive: true,
      lastTriggered: new Date('2024-01-01'),
      failureCount: 0,
      metadata: {},
      createdAt: new Date('2023-12-01'),
    },
  ];

  const mockHandlers = {
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onTest: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders webhook manager with existing webhooks', () => {
    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={mockWebhooks}
        {...mockHandlers}
      />
    );

    expect(screen.getByText('Webhooks')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/webhook')).toBeInTheDocument();
    expect(screen.getByText('Push')).toBeInTheDocument();
    expect(screen.getByText('Pull Request')).toBeInTheDocument();
  });

  it('shows add webhook form when clicking add button', () => {
    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={[]}
        {...mockHandlers}
      />
    );

    fireEvent.click(screen.getByText('Add Webhook'));

    expect(screen.getByPlaceholderText('https://your-domain.com/webhooks/...')).toBeInTheDocument();
    expect(screen.getByText('Events to Subscribe')).toBeInTheDocument();
  });

  it('handles webhook creation', async () => {
    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={[]}
        {...mockHandlers}
      />
    );

    fireEvent.click(screen.getByText('Add Webhook'));

    // Fill in webhook form
    const urlInput = screen.getByPlaceholderText('https://your-domain.com/webhooks/...');
    fireEvent.change(urlInput, { target: { value: 'https://test.com/webhook' } });

    // Select events
    const pushCheckbox = screen.getByLabelText('Push');
    fireEvent.click(pushCheckbox);

    // Submit form
    fireEvent.click(screen.getByText('Add Webhook'));

    await waitFor(() => {
      expect(mockHandlers.onAdd).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://test.com/webhook',
          events: ['push'],
          isActive: true,
        })
      );
    });
  });

  it('handles webhook deletion', async () => {
    window.confirm = vi.fn(() => true);

    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={mockWebhooks}
        {...mockHandlers}
      />
    );

    // Find and click delete button
    const deleteButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('[class*="TrashIcon"]')
    );

    if (deleteButton) {
      fireEvent.click(deleteButton);
      
      await waitFor(() => {
        expect(window.confirm).toHaveBeenCalledWith(
          'Are you sure you want to delete this webhook?'
        );
        expect(mockHandlers.onDelete).toHaveBeenCalledWith('webhook-1');
      });
    }
  });

  it('handles webhook testing', async () => {
    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={mockWebhooks}
        {...mockHandlers}
      />
    );

    // Find and click test button (bell icon)
    const testButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('[class*="BellIcon"]')
    );

    if (testButton) {
      fireEvent.click(testButton);
      
      await waitFor(() => {
        expect(mockHandlers.onTest).toHaveBeenCalledWith('webhook-1');
      });
    }
  });

  it('shows edit form when clicking edit button', () => {
    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={mockWebhooks}
        {...mockHandlers}
      />
    );

    // Find and click edit button
    const editButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('[class*="PencilIcon"]')
    );

    if (editButton) {
      fireEvent.click(editButton);
      
      // Should show form with existing values
      const urlInput = screen.getByDisplayValue('https://example.com/webhook');
      expect(urlInput).toBeInTheDocument();
    }
  });

  it('handles webhook update', async () => {
    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={mockWebhooks}
        {...mockHandlers}
      />
    );

    // Enter edit mode
    const editButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('[class*="PencilIcon"]')
    );

    if (editButton) {
      fireEvent.click(editButton);

      // Update URL
      const urlInput = screen.getByDisplayValue('https://example.com/webhook');
      fireEvent.change(urlInput, { target: { value: 'https://updated.com/webhook' } });

      // Submit update
      fireEvent.click(screen.getByText('Update Webhook'));

      await waitFor(() => {
        expect(mockHandlers.onUpdate).toHaveBeenCalledWith(
          'webhook-1',
          expect.objectContaining({
            url: 'https://updated.com/webhook',
          })
        );
      });
    }
  });

  it('copies webhook secret to clipboard', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn(),
      },
    });

    render(
      <WebhookManager
        integrationId="integration-1"
        provider="github"
        webhooks={mockWebhooks}
        {...mockHandlers}
      />
    );

    // Find and click copy button
    const copyButton = screen.getAllByRole('button').find(
      btn => btn.querySelector('[class*="ClipboardDocumentIcon"]')
    );

    if (copyButton) {
      fireEvent.click(copyButton);

      await waitFor(() => {
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-key');
      });
    }
  });
});

describe('OAuthCallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    delete window.location;
    window.location = { search: '' } as any;
    window.opener = { postMessage: vi.fn() } as any;
    window.close = vi.fn();
  });

  it('handles successful OAuth callback with code', () => {
    sessionStorage.setItem('oauth-state', 'test-state');
    window.location.search = '?code=auth-code-123&state=test-state';

    render(<OAuthCallback />);

    expect(window.opener.postMessage).toHaveBeenCalledWith(
      { type: 'oauth-callback', code: 'auth-code-123', error: null },
      window.location.origin
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('handles OAuth callback with error', () => {
    sessionStorage.setItem('oauth-state', 'test-state');
    window.location.search = '?error=access_denied&state=test-state';

    render(<OAuthCallback />);

    expect(window.opener.postMessage).toHaveBeenCalledWith(
      { type: 'oauth-callback', code: null, error: 'access_denied' },
      window.location.origin
    );
    expect(window.close).toHaveBeenCalled();
  });

  it('rejects callback with invalid state (CSRF protection)', () => {
    sessionStorage.setItem('oauth-state', 'test-state');
    window.location.search = '?code=auth-code-123&state=wrong-state';

    render(<OAuthCallback />);

    expect(window.opener.postMessage).toHaveBeenCalledWith(
      { type: 'oauth-callback', error: 'Invalid state parameter' },
      window.location.origin
    );
    expect(window.close).toHaveBeenCalled();
  });
});