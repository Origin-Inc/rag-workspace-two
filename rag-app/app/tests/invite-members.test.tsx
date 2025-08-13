import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InviteMembers } from '~/components/dashboard/InviteMembers';
import type { Role, Invitation } from '~/components/dashboard/InviteMembers';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn((callback) => {
        callback('SUBSCRIBED');
        return { unsubscribe: vi.fn() };
      }),
    })),
    removeChannel: vi.fn(),
  })),
}));

describe('InviteMembers', () => {
  const mockWorkspaceId = 'workspace-123';
  const mockWorkspaceName = 'Test Workspace';
  const mockUserId = 'user-123';
  
  const mockRoles: Role[] = [
    { id: 'member', name: 'member', displayName: 'Member', description: 'Can view and edit' },
    { id: 'viewer', name: 'viewer', displayName: 'Viewer', description: 'Can only view' },
    { id: 'admin', name: 'admin', displayName: 'Admin', description: 'Full admin access' },
  ];

  const mockInvitations: Invitation[] = [
    {
      id: 'inv-1',
      email: 'pending@example.com',
      status: 'pending',
      roleId: 'member',
      role: mockRoles[0],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      invitedBy: { id: 'user-123', email: 'inviter@example.com' },
    },
    {
      id: 'inv-2',
      email: 'accepted@example.com',
      status: 'accepted',
      roleId: 'viewer',
      role: mockRoles[1],
      expiresAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with initial state', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
      />
    );

    expect(screen.getByText('Team Members')).toBeInTheDocument();
    expect(screen.getByText(`Invite people to join ${mockWorkspaceName}`)).toBeInTheDocument();
    expect(screen.getByText('Invite Members')).toBeInTheDocument();
  });

  it('shows invite form when button is clicked', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
      />
    );

    const inviteButton = screen.getByRole('button', { name: /Invite Members/i });
    fireEvent.click(inviteButton);

    expect(screen.getByLabelText('Email addresses')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Invitations/i })).toBeInTheDocument();
  });

  it('hides invite form when cancel is clicked', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
      />
    );

    // Open form
    fireEvent.click(screen.getByRole('button', { name: /Invite Members/i }));
    
    // Cancel form
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));

    expect(screen.queryByLabelText('Email addresses')).not.toBeInTheDocument();
  });

  it('displays available roles in dropdown', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        availableRoles={mockRoles}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Invite Members/i }));

    const roleSelect = screen.getByLabelText('Role') as HTMLSelectElement;
    expect(roleSelect).toBeInTheDocument();
    
    const options = roleSelect.querySelectorAll('option');
    expect(options).toHaveLength(3);
    expect(options[0].textContent).toContain('Member');
    expect(options[1].textContent).toContain('Viewer');
    expect(options[2].textContent).toContain('Admin');
  });

  it('validates email input', async () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Invite Members/i }));

    const emailInput = screen.getByLabelText('Email addresses');
    const submitButton = screen.getByRole('button', { name: /Send Invitations/i });

    // Submit with empty email
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Please enter at least one email address/i)).toBeInTheDocument();
    });

    // Submit with invalid email
    fireEvent.change(emailInput, { target: { value: 'invalid-email' } });
    fireEvent.click(submitButton);
    
    await waitFor(() => {
      expect(screen.getByText(/Invalid email addresses/i)).toBeInTheDocument();
    });
  });

  it('sends invitations successfully', async () => {
    const onInviteSent = vi.fn();
    
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        onInviteSent={onInviteSent}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Invite Members/i }));

    const emailInput = screen.getByLabelText('Email addresses');
    fireEvent.change(emailInput, { target: { value: 'test@example.com, another@example.com' } });

    const submitButton = screen.getByRole('button', { name: /Send Invitations/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Successfully sent 2 invitations/i)).toBeInTheDocument();
      expect(onInviteSent).toHaveBeenCalled();
    });
  });

  it('displays existing invitations', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={mockInvitations}
      />
    );

    expect(screen.getByText('pending@example.com')).toBeInTheDocument();
    expect(screen.getByText('accepted@example.com')).toBeInTheDocument();
    expect(screen.getByText('Pending Invitations (1)')).toBeInTheDocument();
    expect(screen.getByText('Invitation History')).toBeInTheDocument();
  });

  it('shows resend and cancel buttons for pending invitations', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={[mockInvitations[0]]}
      />
    );

    expect(screen.getByRole('button', { name: /Resend/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('handles invitation cancellation', async () => {
    const onInviteCancel = vi.fn();
    window.confirm = vi.fn(() => true);
    
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={[mockInvitations[0]]}
        onInviteCancel={onInviteCancel}
      />
    );

    const cancelButton = screen.getByRole('button', { name: /Cancel/i });
    fireEvent.click(cancelButton);

    expect(window.confirm).toHaveBeenCalledWith('Are you sure you want to cancel this invitation?');
    expect(onInviteCancel).toHaveBeenCalledWith('inv-1');
  });

  it('handles invitation resend', async () => {
    const onInviteResend = vi.fn();
    
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={[mockInvitations[0]]}
        onInviteResend={onInviteResend}
      />
    );

    const resendButton = screen.getByRole('button', { name: /Resend/i });
    fireEvent.click(resendButton);

    await waitFor(() => {
      expect(screen.getByText(/Invitation resent to pending@example.com/i)).toBeInTheDocument();
      expect(onInviteResend).toHaveBeenCalledWith('inv-1');
    });
  });

  it('displays real-time connection status when enabled', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        enableRealtime={true}
        supabaseUrl="https://example.supabase.co"
        supabaseAnonKey="test-key"
      />
    );

    expect(screen.getByText('Live updates')).toBeInTheDocument();
  });

  it('shows empty state when no invitations', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={[]}
      />
    );

    expect(screen.getByText('No team members yet')).toBeInTheDocument();
    expect(screen.getByText('Get started by inviting people to your workspace')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Invite your first member/i })).toBeInTheDocument();
  });

  it('parses multiple email formats correctly', async () => {
    const onInviteSent = vi.fn();
    
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        onInviteSent={onInviteSent}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Invite Members/i }));

    const emailInput = screen.getByLabelText('Email addresses');
    // Test comma, semicolon, and newline separators
    fireEvent.change(emailInput, { 
      target: { 
        value: 'test1@example.com, test2@example.com; test3@example.com\ntest4@example.com' 
      } 
    });

    const submitButton = screen.getByRole('button', { name: /Send Invitations/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Successfully sent 4 invitations/i)).toBeInTheDocument();
    });
  });

  it('displays expiration date for pending invitations', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={[mockInvitations[0]]}
      />
    );

    const expiryDate = new Date(mockInvitations[0].expiresAt);
    expect(screen.getByText(new RegExp(`Expires ${expiryDate.toLocaleDateString()}`))).toBeInTheDocument();
  });

  it('shows role information in invitation list', () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={[mockInvitations[0]]}
      />
    );

    expect(screen.getByText(/Member/)).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        className="custom-invite-class"
      />
    );

    const wrapper = container.querySelector('.custom-invite-class');
    expect(wrapper).toBeInTheDocument();
  });

  it('shows loading state when sending invitations', async () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Invite Members/i }));

    const emailInput = screen.getByLabelText('Email addresses');
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });

    const submitButton = screen.getByRole('button', { name: /Send Invitations/i });
    fireEvent.click(submitButton);

    // Check for loading state
    expect(screen.getByText(/Sending.../i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Sending.../i)).not.toBeInTheDocument();
    });
  });

  it('clears error message when dismissed', async () => {
    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Invite Members/i }));

    // Trigger an error
    const submitButton = screen.getByRole('button', { name: /Send Invitations/i });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/Please enter at least one email address/i)).toBeInTheDocument();
    });

    // Dismiss error
    const dismissButton = screen.getByRole('button', { name: '' }); // X button
    fireEvent.click(dismissButton);

    expect(screen.queryByText(/Please enter at least one email address/i)).not.toBeInTheDocument();
  });

  it('groups invitations by status', () => {
    const mixedInvitations: Invitation[] = [
      { ...mockInvitations[0], status: 'pending' },
      { ...mockInvitations[1], status: 'accepted' },
      { 
        id: 'inv-3', 
        email: 'expired@example.com', 
        status: 'expired',
        roleId: 'member',
        expiresAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      },
    ];

    render(
      <InviteMembers
        workspaceId={mockWorkspaceId}
        workspaceName={mockWorkspaceName}
        currentUserId={mockUserId}
        existingInvitations={mixedInvitations}
      />
    );

    expect(screen.getByText('Pending Invitations (1)')).toBeInTheDocument();
    expect(screen.getByText('Invitation History')).toBeInTheDocument();
  });
});