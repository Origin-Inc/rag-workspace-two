import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { parseEmailList } from '~/lib/invitation-utils';
import {
  EnvelopeIcon,
  UserPlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

export interface Role {
  id: string;
  name: string;
  displayName: string;
  description?: string;
}

export interface Invitation {
  id: string;
  email: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  roleId: string;
  role?: Role;
  expiresAt: string;
  createdAt: string;
  invitedBy?: {
    id: string;
    name?: string;
    email: string;
  };
}

export interface InviteMembersProps {
  workspaceId: string;
  workspaceName: string;
  availableRoles?: Role[];
  existingInvitations?: Invitation[];
  currentUserId: string;
  onInviteSent?: (invitations: Invitation[]) => void;
  onInviteCancel?: (invitationId: string) => void;
  onInviteResend?: (invitationId: string) => void;
  enableRealtime?: boolean;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  className?: string;
}

// Mock function to simulate sending invitations
async function mockSendInvitations(
  emails: string[],
  workspaceId: string,
  roleId: string,
  invitedById: string
): Promise<Invitation[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Create mock invitations
  return emails.map((email, index) => ({
    id: `invite-${Date.now()}-${index}`,
    email,
    status: 'pending' as const,
    roleId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    invitedBy: {
      id: invitedById,
      email: 'current@user.com',
    },
  }));
}

export function InviteMembers({
  workspaceId,
  workspaceName,
  availableRoles = [
    { id: 'member', name: 'member', displayName: 'Member', description: 'Can view and edit content' },
    { id: 'viewer', name: 'viewer', displayName: 'Viewer', description: 'Can only view content' },
    { id: 'admin', name: 'admin', displayName: 'Admin', description: 'Can manage workspace settings' },
  ],
  existingInvitations = [],
  currentUserId,
  onInviteSent,
  onInviteCancel,
  onInviteResend,
  enableRealtime = false,
  supabaseUrl,
  supabaseAnonKey,
  className = '',
}: InviteMembersProps) {
  const [emailInput, setEmailInput] = useState('');
  const [selectedRole, setSelectedRole] = useState(availableRoles[0]?.id || 'member');
  const [invitations, setInvitations] = useState<Invitation[]>(existingInvitations);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Set up real-time subscription
  useEffect(() => {
    if (!enableRealtime || !supabaseUrl || !supabaseAnonKey) return;

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    const channel = supabase
      .channel(`invitations:${workspaceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invitations',
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setInvitations(prev => [payload.new as Invitation, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setInvitations(prev => prev.map(inv => 
            inv.id === payload.new.id ? payload.new as Invitation : inv
          ));
        } else if (payload.eventType === 'DELETE') {
          setInvitations(prev => prev.filter(inv => inv.id !== payload.old.id));
        }
      })
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [enableRealtime, supabaseUrl, supabaseAnonKey, workspaceId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    try {
      const emails = parseEmailList(emailInput);
      
      if (emails.length === 0) {
        setError('Please enter at least one email address');
        return;
      }

      setIsLoading(true);
      
      // Mock sending invitations
      const newInvitations = await mockSendInvitations(
        emails,
        workspaceId,
        selectedRole,
        currentUserId
      );
      
      // Add role details
      const role = availableRoles.find(r => r.id === selectedRole);
      const invitationsWithRole = newInvitations.map(inv => ({
        ...inv,
        role,
      }));
      
      setInvitations(prev => [...invitationsWithRole, ...prev]);
      setSuccessMessage(`Successfully sent ${emails.length} invitation${emails.length > 1 ? 's' : ''}`);
      setEmailInput('');
      setShowInviteForm(false);
      
      if (onInviteSent) {
        onInviteSent(invitationsWithRole);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitations');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async (invitationId: string) => {
    if (!window.confirm('Are you sure you want to cancel this invitation?')) {
      return;
    }

    try {
      setInvitations(prev => prev.map(inv =>
        inv.id === invitationId ? { ...inv, status: 'cancelled' as const } : inv
      ));
      
      if (onInviteCancel) {
        onInviteCancel(invitationId);
      }
    } catch (err) {
      setError('Failed to cancel invitation');
    }
  };

  const handleResend = async (invitationId: string) => {
    try {
      const invitation = invitations.find(inv => inv.id === invitationId);
      if (invitation) {
        setSuccessMessage(`Invitation resent to ${invitation.email}`);
      }
      
      if (onInviteResend) {
        onInviteResend(invitationId);
      }
    } catch (err) {
      setError('Failed to resend invitation');
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <ClockIcon className="h-5 w-5 text-yellow-500" />;
      case 'accepted':
        return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
      case 'expired':
        return <XCircleIcon className="h-5 w-5 text-gray-400" />;
      case 'cancelled':
        return <XCircleIcon className="h-5 w-5 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'accepted':
        return 'Accepted';
      case 'expired':
        return 'Expired';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const pendingInvitations = invitations.filter(inv => inv.status === 'pending');
  const otherInvitations = invitations.filter(inv => inv.status !== 'pending');

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Team Members
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Invite people to join {workspaceName}
          </p>
        </div>
        {enableRealtime && (
          <div className="flex items-center space-x-2">
            <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {isConnected ? 'Live updates' : 'Offline'}
            </span>
          </div>
        )}
      </div>

      {/* Success/Error Messages */}
      {successMessage && (
        <div className="rounded-md bg-green-50 dark:bg-green-900/30 p-4">
          <div className="flex">
            <CheckCircleIcon className="h-5 w-5 text-green-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                {successMessage}
              </p>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="ml-auto"
            >
              <XMarkIcon className="h-5 w-5 text-green-500" />
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/30 p-4">
          <div className="flex">
            <XCircleIcon className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                {error}
              </p>
            </div>
            <button
              onClick={() => setError(null)}
              className="ml-auto"
            >
              <XMarkIcon className="h-5 w-5 text-red-500" />
            </button>
          </div>
        </div>
      )}

      {/* Invite Form */}
      {showInviteForm ? (
        <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div>
            <label htmlFor="emails" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email addresses
            </label>
            <textarea
              id="emails"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="Enter email addresses separated by commas, semicolons, or new lines"
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white sm:text-sm"
              rows={3}
              disabled={isLoading}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              You can invite multiple people at once
            </p>
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Role
            </label>
            <select
              id="role"
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 dark:text-white sm:text-sm"
              disabled={isLoading}
            >
              {availableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.displayName}
                  {role.description && ` - ${role.description}`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={() => {
                setShowInviteForm(false);
                setEmailInput('');
                setError(null);
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <ArrowPathIcon className="animate-spin -ml-1 mr-2 h-4 w-4" />
                  Sending...
                </>
              ) : (
                <>
                  <EnvelopeIcon className="-ml-1 mr-2 h-4 w-4" />
                  Send Invitations
                </>
              )}
            </button>
          </div>
        </form>
      ) : (
        <button
          onClick={() => setShowInviteForm(true)}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <UserPlusIcon className="-ml-1 mr-2 h-5 w-5" />
          Invite Members
        </button>
      )}

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Pending Invitations ({pendingInvitations.length})
          </h4>
          <div className="space-y-2">
            {pendingInvitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(invitation.status)}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {invitation.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {invitation.role?.displayName || 'Member'} • 
                      Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleResend(invitation.id)}
                    className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Resend
                  </button>
                  <button
                    onClick={() => handleCancel(invitation.id)}
                    className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other Invitations */}
      {otherInvitations.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
            Invitation History
          </h4>
          <div className="space-y-2">
            {otherInvitations.slice(0, 5).map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  {getStatusIcon(invitation.status)}
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {invitation.email}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {getStatusText(invitation.status)} • 
                      {new Date(invitation.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {invitations.length === 0 && !showInviteForm && (
        <div className="text-center py-8">
          <UserPlusIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
            No team members yet
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Get started by inviting people to your workspace
          </p>
          <div className="mt-6">
            <button
              onClick={() => setShowInviteForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <UserPlusIcon className="-ml-1 mr-2 h-5 w-5" />
              Invite your first member
            </button>
          </div>
        </div>
      )}
    </div>
  );
}