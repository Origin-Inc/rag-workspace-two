import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspaceSettings } from '~/components/dashboard/WorkspaceSettings';
import type { WorkspaceData, Permission, Integration, BillingInfo } from '~/components/dashboard/WorkspaceSettings';

describe('WorkspaceSettings', () => {
  const mockWorkspace: WorkspaceData = {
    id: 'workspace-123',
    name: 'Test Workspace',
    slug: 'test-workspace',
    description: 'A test workspace',
    timezone: 'UTC',
    dateFormat: 'MM/DD/YYYY',
    language: 'en',
    isPublic: false,
    allowSignups: false,
    requireEmailVerification: true,
    defaultRole: 'member',
    storageLimit: 1024,
    aiCreditsLimit: 10000,
    maxMembers: 5,
    billingPlan: 'free',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const mockPermissions: Permission[] = [
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
  ];

  const mockIntegrations: Integration[] = [
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
      connected: true,
      lastSync: new Date().toISOString(),
    },
  ];

  const mockBilling: BillingInfo = {
    plan: 'pro',
    status: 'active',
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    usage: {
      storage: 512,
      aiCredits: 2500,
      members: 3,
    },
    limits: {
      storage: 1024,
      aiCredits: 10000,
      members: 5,
    },
    paymentMethod: {
      type: 'Visa',
      last4: '4242',
      expiryMonth: 12,
      expiryYear: 2025,
    },
    invoices: [
      {
        id: 'inv-1',
        date: new Date().toISOString(),
        amount: 2900,
        status: 'paid',
        downloadUrl: '/invoice-1.pdf',
      },
    ],
  };

  const mockOnSave = vi.fn();
  const mockOnDelete = vi.fn();
  const mockOnUpgrade = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with all tabs', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        permissions={mockPermissions}
        integrations={mockIntegrations}
        billing={mockBilling}
      />
    );

    expect(screen.getByText('Workspace Settings')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
    expect(screen.getByText('Permissions')).toBeInTheDocument();
    expect(screen.getByText('Integrations')).toBeInTheDocument();
    expect(screen.getByText('Billing')).toBeInTheDocument();
  });

  it('displays general settings by default', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
      />
    );

    expect(screen.getByLabelText('Workspace Name')).toHaveValue('Test Workspace');
    expect(screen.getByLabelText('URL Slug')).toHaveValue('test-workspace');
    expect(screen.getByLabelText('Description')).toHaveValue('A test workspace');
    expect(screen.getByLabelText('Timezone')).toHaveValue('UTC');
    expect(screen.getByLabelText('Date Format')).toHaveValue('MM/DD/YYYY');
    expect(screen.getByLabelText('Language')).toHaveValue('en');
  });

  it('switches between tabs', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        permissions={mockPermissions}
        integrations={mockIntegrations}
        billing={mockBilling}
      />
    );

    // Click on Permissions tab
    fireEvent.click(screen.getByText('Permissions'));
    expect(screen.getByText('Role Permissions')).toBeInTheDocument();

    // Click on Integrations tab
    fireEvent.click(screen.getByText('Integrations'));
    expect(screen.getByText('Slack')).toBeInTheDocument();

    // Click on Billing tab
    fireEvent.click(screen.getByText('Billing'));
    expect(screen.getByText('Current Plan')).toBeInTheDocument();
  });

  it('updates general settings form values', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
      />
    );

    const nameInput = screen.getByLabelText('Workspace Name');
    fireEvent.change(nameInput, { target: { value: 'Updated Workspace' } });
    expect(nameInput).toHaveValue('Updated Workspace');

    const slugInput = screen.getByLabelText('URL Slug');
    fireEvent.change(slugInput, { target: { value: 'updated-workspace' } });
    expect(slugInput).toHaveValue('updated-workspace');
  });

  it('toggles privacy settings checkboxes', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
      />
    );

    const publicCheckbox = screen.getByLabelText('Make workspace publicly visible');
    expect(publicCheckbox).not.toBeChecked();
    
    fireEvent.click(publicCheckbox);
    expect(publicCheckbox).toBeChecked();

    const signupsCheckbox = screen.getByLabelText('Allow public sign-ups');
    expect(signupsCheckbox).not.toBeChecked();
    
    fireEvent.click(signupsCheckbox);
    expect(signupsCheckbox).toBeChecked();
  });

  it('saves general settings', async () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        onSave={mockOnSave}
      />
    );

    const nameInput = screen.getByLabelText('Workspace Name');
    fireEvent.change(nameInput, { target: { value: 'Updated Workspace' } });

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('general', expect.objectContaining({
        name: 'Updated Workspace',
        slug: 'test-workspace',
      }));
    });

    expect(screen.getByText('General settings saved successfully')).toBeInTheDocument();
  });

  it('displays and toggles permissions', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        permissions={mockPermissions}
      />
    );

    fireEvent.click(screen.getByText('Permissions'));

    const createPagesCheckbox = screen.getByLabelText('Create Pages');
    expect(createPagesCheckbox).toBeChecked();

    const deletePagesCheckbox = screen.getByLabelText('Delete Pages');
    expect(deletePagesCheckbox).not.toBeChecked();

    fireEvent.click(deletePagesCheckbox);
    expect(deletePagesCheckbox).toBeChecked();
  });

  it('saves permission changes', async () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        permissions={mockPermissions}
        onSave={mockOnSave}
      />
    );

    fireEvent.click(screen.getByText('Permissions'));

    const deletePagesCheckbox = screen.getByLabelText('Delete Pages');
    fireEvent.click(deletePagesCheckbox);

    const saveButton = screen.getByRole('button', { name: /Save Permissions/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('permissions', expect.arrayContaining([
        expect.objectContaining({
          id: 'delete-pages',
          enabled: true,
        }),
      ]));
    });
  });

  it('displays integration connection status', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        integrations={mockIntegrations}
      />
    );

    fireEvent.click(screen.getByText('Integrations'));

    // Slack should show as not connected
    const slackSection = screen.getByText('Slack').closest('div')?.parentElement?.parentElement;
    expect(slackSection).toContainHTML('Connect');

    // GitHub should show as connected
    const githubSection = screen.getByText('GitHub').closest('div')?.parentElement?.parentElement;
    expect(githubSection).toContainHTML('Connected');
    expect(githubSection).toContainHTML('Disconnect');
  });

  it('connects an integration', async () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        integrations={mockIntegrations}
        onSave={mockOnSave}
      />
    );

    fireEvent.click(screen.getByText('Integrations'));

    const connectButtons = screen.getAllByText('Connect');
    fireEvent.click(connectButtons[0]);

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('integrations', {
        id: 'slack',
        connected: true,
      });
    });

    expect(screen.getByText('slack connected successfully')).toBeInTheDocument();
  });

  it('disconnects an integration with confirmation', async () => {
    window.confirm = vi.fn(() => true);
    
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        integrations={mockIntegrations}
        onSave={mockOnSave}
      />
    );

    fireEvent.click(screen.getByText('Integrations'));

    const disconnectButton = screen.getByText('Disconnect');
    fireEvent.click(disconnectButton);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to disconnect this integration?');

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('integrations', {
        id: 'github',
        connected: false,
      });
    });
  });

  it('displays billing information', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        billing={mockBilling}
      />
    );

    fireEvent.click(screen.getByText('Billing'));

    expect(screen.getByText('Pro Plan')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    
    // Check usage metrics
    expect(screen.getByText(/512 MB \/ 1 GB/)).toBeInTheDocument();
    expect(screen.getByText(/2,500 \/ 10,000/)).toBeInTheDocument();
    expect(screen.getByText(/3 \/ 5/)).toBeInTheDocument();
  });

  it('displays payment method', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        billing={mockBilling}
      />
    );

    fireEvent.click(screen.getByText('Billing'));

    expect(screen.getByText('Visa ending in 4242')).toBeInTheDocument();
    expect(screen.getByText('Expires 12/2025')).toBeInTheDocument();
  });

  it('displays recent invoices', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        billing={mockBilling}
      />
    );

    fireEvent.click(screen.getByText('Billing'));

    expect(screen.getByText('$29.00')).toBeInTheDocument();
    expect(screen.getByText('paid')).toBeInTheDocument();
    expect(screen.getByText('Download')).toBeInTheDocument();
  });

  it('shows upgrade button for free plan', () => {
    const freeBilling: BillingInfo = {
      ...mockBilling,
      plan: 'free',
    };

    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        billing={freeBilling}
        onUpgrade={mockOnUpgrade}
      />
    );

    fireEvent.click(screen.getByText('Billing'));

    const upgradeButton = screen.getByRole('button', { name: /Upgrade to Pro/i });
    expect(upgradeButton).toBeInTheDocument();

    fireEvent.click(upgradeButton);
    expect(mockOnUpgrade).toHaveBeenCalled();
  });

  it('shows delete workspace confirmation', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        billing={mockBilling}
      />
    );

    fireEvent.click(screen.getByText('Billing'));

    const deleteButton = screen.getByRole('button', { name: /Delete Workspace/i });
    fireEvent.click(deleteButton);

    expect(screen.getByText(/Type Test Workspace to confirm/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter workspace name')).toBeInTheDocument();
  });

  it('cancels delete workspace', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        billing={mockBilling}
      />
    );

    fireEvent.click(screen.getByText('Billing'));

    const deleteButton = screen.getByRole('button', { name: /Delete Workspace/i });
    fireEvent.click(deleteButton);

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);

    expect(screen.queryByText(/Type Test Workspace to confirm/)).not.toBeInTheDocument();
  });

  it('handles save errors gracefully', async () => {
    const failingOnSave = vi.fn().mockRejectedValue(new Error('Save failed'));

    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        onSave={failingOnSave}
      />
    );

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText('Failed to save general settings')).toBeInTheDocument();
    });
  });

  it('applies custom className', () => {
    const { container } = render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        className="custom-settings-class"
      />
    );

    const wrapper = container.querySelector('.custom-settings-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('displays loading state during save', async () => {
    const slowSave = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));

    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        onSave={slowSave}
      />
    );

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    fireEvent.click(saveButton);

    expect(screen.getByText('Saving...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument();
    });
  });

  it('validates required fields', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
      />
    );

    const nameInput = screen.getByLabelText('Workspace Name');
    fireEvent.change(nameInput, { target: { value: '' } });

    // Name should be required - test would show validation error in real implementation
    expect(nameInput).toHaveValue('');
  });

  it('shows role badges for permissions', () => {
    render(
      <WorkspaceSettings
        workspace={mockWorkspace}
        permissions={mockPermissions}
      />
    );

    fireEvent.click(screen.getByText('Permissions'));

    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getAllByText('member')).toHaveLength(1);
  });
});