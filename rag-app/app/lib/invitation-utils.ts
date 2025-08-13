import { randomBytes } from 'crypto';
import { addDays } from 'date-fns';
import { prisma } from '~/utils/db.server';
import type { Role } from '@prisma/client';

/**
 * Generate a secure random token for invitations
 */
export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Create invitation expiry date (default 7 days from now)
 */
export function createExpiryDate(days: number = 7): Date {
  return addDays(new Date(), days);
}

/**
 * Validate an email address
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Parse multiple email addresses from input
 * Supports comma, semicolon, and newline separators
 */
export function parseEmailList(input: string): string[] {
  const emails = input
    .split(/[,;\n]+/)
    .map(email => email.trim())
    .filter(email => email.length > 0);
  
  const validEmails: string[] = [];
  const invalidEmails: string[] = [];
  
  emails.forEach(email => {
    if (validateEmail(email)) {
      validEmails.push(email.toLowerCase());
    } else {
      invalidEmails.push(email);
    }
  });
  
  if (invalidEmails.length > 0) {
    throw new Error(`Invalid email addresses: ${invalidEmails.join(', ')}`);
  }
  
  // Remove duplicates
  return [...new Set(validEmails)];
}

export interface InviteData {
  email: string;
  workspaceId: string;
  roleId: string;
  invitedById: string;
}

/**
 * Create multiple invitations in bulk
 */
export async function createBulkInvitations(invites: InviteData[]) {
  const invitationData = invites.map(invite => ({
    email: invite.email,
    workspaceId: invite.workspaceId,
    roleId: invite.roleId,
    invitedById: invite.invitedById,
    token: generateInviteToken(),
    expiresAt: createExpiryDate(),
    status: 'pending',
  }));
  
  // Check for existing pending invitations
  const existingInvites = await prisma.invitation.findMany({
    where: {
      email: { in: invites.map(i => i.email) },
      workspaceId: invites[0].workspaceId,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
  });
  
  if (existingInvites.length > 0) {
    const existingEmails = existingInvites.map(i => i.email);
    throw new Error(`Invitations already exist for: ${existingEmails.join(', ')}`);
  }
  
  // Create all invitations
  const createdInvitations = await prisma.invitation.createMany({
    data: invitationData,
  });
  
  // Fetch the created invitations with full data
  return await prisma.invitation.findMany({
    where: {
      email: { in: invites.map(i => i.email) },
      workspaceId: invites[0].workspaceId,
      status: 'pending',
    },
    include: {
      role: true,
      workspace: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Get invitation by token
 */
export async function getInvitationByToken(token: string) {
  return await prisma.invitation.findUnique({
    where: { token },
    include: {
      workspace: true,
      role: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

/**
 * Accept an invitation
 */
export async function acceptInvitation(token: string, userId: string) {
  const invitation = await getInvitationByToken(token);
  
  if (!invitation) {
    throw new Error('Invalid invitation token');
  }
  
  if (invitation.status !== 'pending') {
    throw new Error('Invitation has already been used');
  }
  
  if (new Date() > invitation.expiresAt) {
    // Mark as expired
    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: 'expired' },
    });
    throw new Error('Invitation has expired');
  }
  
  // Start a transaction to accept invitation and add user to workspace
  const result = await prisma.$transaction(async (tx) => {
    // Update invitation status
    const updatedInvitation = await tx.invitation.update({
      where: { id: invitation.id },
      data: {
        status: 'accepted',
        acceptedAt: new Date(),
      },
    });
    
    // Add user to workspace
    const userWorkspace = await tx.userWorkspace.create({
      data: {
        userId,
        workspaceId: invitation.workspaceId,
        roleId: invitation.roleId,
      },
    });
    
    return { invitation: updatedInvitation, userWorkspace };
  });
  
  return result;
}

/**
 * Cancel an invitation
 */
export async function cancelInvitation(invitationId: string, cancelledBy: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });
  
  if (!invitation) {
    throw new Error('Invitation not found');
  }
  
  if (invitation.status !== 'pending') {
    throw new Error('Can only cancel pending invitations');
  }
  
  // Check if user has permission to cancel (must be the inviter or workspace owner)
  const hasPermission = await checkCancelPermission(
    cancelledBy,
    invitation.workspaceId,
    invitation.invitedById
  );
  
  if (!hasPermission) {
    throw new Error('You do not have permission to cancel this invitation');
  }
  
  return await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: 'cancelled' },
  });
}

/**
 * Check if user can cancel an invitation
 */
async function checkCancelPermission(
  userId: string,
  workspaceId: string,
  invitedById: string
): Promise<boolean> {
  // Check if user is the inviter
  if (userId === invitedById) {
    return true;
  }
  
  // Check if user is workspace owner/admin
  const userWorkspace = await prisma.userWorkspace.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId,
      },
    },
    include: {
      role: true,
    },
  });
  
  return userWorkspace?.role.name === 'owner' || userWorkspace?.role.name === 'admin';
}

/**
 * Get pending invitations for a workspace
 */
export async function getWorkspaceInvitations(workspaceId: string) {
  return await prisma.invitation.findMany({
    where: {
      workspaceId,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
    include: {
      role: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Clean up expired invitations
 */
export async function cleanupExpiredInvitations() {
  return await prisma.invitation.updateMany({
    where: {
      status: 'pending',
      expiresAt: { lt: new Date() },
    },
    data: {
      status: 'expired',
    },
  });
}

/**
 * Resend an invitation (creates new token and expiry)
 */
export async function resendInvitation(invitationId: string, resendBy: string) {
  const invitation = await prisma.invitation.findUnique({
    where: { id: invitationId },
  });
  
  if (!invitation) {
    throw new Error('Invitation not found');
  }
  
  // Check permission
  const hasPermission = await checkCancelPermission(
    resendBy,
    invitation.workspaceId,
    invitation.invitedById
  );
  
  if (!hasPermission) {
    throw new Error('You do not have permission to resend this invitation');
  }
  
  // Cancel old invitation and create new one
  await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: 'cancelled' },
  });
  
  return await prisma.invitation.create({
    data: {
      email: invitation.email,
      workspaceId: invitation.workspaceId,
      roleId: invitation.roleId,
      invitedById: resendBy,
      token: generateInviteToken(),
      expiresAt: createExpiryDate(),
      status: 'pending',
    },
    include: {
      role: true,
      workspace: true,
      invitedBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}