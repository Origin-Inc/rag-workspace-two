import { getSupabaseClient } from '~/utils/supabase.client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { Block, Page } from '~/types/supabase';

export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

export interface RealtimeCallbacks<T> {
  onInsert?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onUpdate?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onDelete?: (payload: RealtimePostgresChangesPayload<T>) => void;
  onAny?: (payload: RealtimePostgresChangesPayload<T>) => void;
}

export interface PresenceState {
  userId: string;
  userName?: string;
  userAvatar?: string;
  cursor?: { x: number; y: number };
  selection?: { blockId: string; start?: number; end?: number };
  color?: string;
  lastSeen: string;
}

class RealtimeService {
  private channels: Map<string, RealtimeChannel> = new Map();
  private client = getSupabaseClient();

  // Subscribe to page changes
  subscribeToPage(
    pageId: string,
    callbacks: {
      blocks?: RealtimeCallbacks<Block>;
      page?: RealtimeCallbacks<Page>;
      presence?: {
        onSync?: (state: Record<string, PresenceState[]>) => void;
        onJoin?: (key: string, presence: PresenceState) => void;
        onLeave?: (key: string, presence: PresenceState) => void;
      };
    }
  ): () => void {
    const channelName = `page:${pageId}`;
    
    // Clean up existing channel if it exists
    this.unsubscribe(channelName);

    const channel = this.client.channel(channelName);

    // Subscribe to block changes
    if (callbacks.blocks) {
      if (callbacks.blocks.onInsert || callbacks.blocks.onAny) {
        channel.on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'blocks',
            filter: `page_id=eq.${pageId}`,
          },
          (payload) => {
            callbacks.blocks?.onInsert?.(payload as RealtimePostgresChangesPayload<Block>);
            callbacks.blocks?.onAny?.(payload as RealtimePostgresChangesPayload<Block>);
          }
        );
      }

      if (callbacks.blocks.onUpdate || callbacks.blocks.onAny) {
        channel.on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'blocks',
            filter: `page_id=eq.${pageId}`,
          },
          (payload) => {
            callbacks.blocks?.onUpdate?.(payload as RealtimePostgresChangesPayload<Block>);
            callbacks.blocks?.onAny?.(payload as RealtimePostgresChangesPayload<Block>);
          }
        );
      }

      if (callbacks.blocks.onDelete || callbacks.blocks.onAny) {
        channel.on(
          'postgres_changes',
          {
            event: 'DELETE',
            schema: 'public',
            table: 'blocks',
            filter: `page_id=eq.${pageId}`,
          },
          (payload) => {
            callbacks.blocks?.onDelete?.(payload as RealtimePostgresChangesPayload<Block>);
            callbacks.blocks?.onAny?.(payload as RealtimePostgresChangesPayload<Block>);
          }
        );
      }
    }

    // Subscribe to page changes
    if (callbacks.page) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pages',
          filter: `id=eq.${pageId}`,
        },
        (payload) => {
          const event = payload.eventType as RealtimeEvent;
          const typedPayload = payload as RealtimePostgresChangesPayload<Page>;
          
          switch (event) {
            case 'INSERT':
              callbacks.page?.onInsert?.(typedPayload);
              break;
            case 'UPDATE':
              callbacks.page?.onUpdate?.(typedPayload);
              break;
            case 'DELETE':
              callbacks.page?.onDelete?.(typedPayload);
              break;
          }
          callbacks.page?.onAny?.(typedPayload);
        }
      );
    }

    // Set up presence
    if (callbacks.presence) {
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          callbacks.presence?.onSync?.(state as Record<string, PresenceState[]>);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          if (newPresences && newPresences.length > 0) {
            callbacks.presence?.onJoin?.(key, newPresences[0] as PresenceState);
          }
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          if (leftPresences && leftPresences.length > 0) {
            callbacks.presence?.onLeave?.(key, leftPresences[0] as PresenceState);
          }
        });
    }

    // Subscribe to the channel
    channel.subscribe();

    // Store channel reference
    this.channels.set(channelName, channel);

    // Return cleanup function
    return () => this.unsubscribe(channelName);
  }

  // Subscribe to workspace changes
  subscribeToWorkspace(
    workspaceId: string,
    callbacks: {
      pages?: RealtimeCallbacks<Page>;
      onlineUsers?: {
        onSync?: (users: Record<string, PresenceState[]>) => void;
        onJoin?: (key: string, user: PresenceState) => void;
        onLeave?: (key: string, user: PresenceState) => void;
      };
    }
  ): () => void {
    const channelName = `workspace:${workspaceId}`;
    
    // Clean up existing channel
    this.unsubscribe(channelName);

    const channel = this.client.channel(channelName);

    // Subscribe to page changes in workspace
    if (callbacks.pages) {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pages',
          filter: `workspace_id=eq.${workspaceId}`,
        },
        (payload) => {
          const event = payload.eventType as RealtimeEvent;
          const typedPayload = payload as RealtimePostgresChangesPayload<Page>;
          
          switch (event) {
            case 'INSERT':
              callbacks.pages?.onInsert?.(typedPayload);
              break;
            case 'UPDATE':
              callbacks.pages?.onUpdate?.(typedPayload);
              break;
            case 'DELETE':
              callbacks.pages?.onDelete?.(typedPayload);
              break;
          }
          callbacks.pages?.onAny?.(typedPayload);
        }
      );
    }

    // Set up workspace presence for online users
    if (callbacks.onlineUsers) {
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          callbacks.onlineUsers?.onSync?.(state as Record<string, PresenceState[]>);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          if (newPresences && newPresences.length > 0) {
            callbacks.onlineUsers?.onJoin?.(key, newPresences[0] as PresenceState);
          }
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          if (leftPresences && leftPresences.length > 0) {
            callbacks.onlineUsers?.onLeave?.(key, leftPresences[0] as PresenceState);
          }
        });
    }

    // Subscribe to the channel
    channel.subscribe();

    // Store channel reference
    this.channels.set(channelName, channel);

    // Return cleanup function
    return () => this.unsubscribe(channelName);
  }

  // Track user presence on a page
  async trackPresence(
    channelName: string,
    presence: PresenceState
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`Channel ${channelName} not found`);
      return;
    }

    await channel.track(presence);
  }

  // Update presence state
  async updatePresence(
    channelName: string,
    updates: Partial<PresenceState>
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`Channel ${channelName} not found`);
      return;
    }

    const currentPresence = channel.presenceState();
    const myPresence = Object.values(currentPresence).flat().find(
      (p: any) => p.userId === updates.userId
    );

    if (myPresence) {
      await channel.track({
        ...myPresence,
        ...updates,
        lastSeen: new Date().toISOString(),
      });
    }
  }

  // Send cursor position
  async updateCursor(
    pageId: string,
    userId: string,
    cursor: { x: number; y: number }
  ): Promise<void> {
    const channelName = `page:${pageId}`;
    await this.updatePresence(channelName, { userId, cursor });
  }

  // Send selection state
  async updateSelection(
    pageId: string,
    userId: string,
    selection: { blockId: string; start?: number; end?: number } | null
  ): Promise<void> {
    const channelName = `page:${pageId}`;
    await this.updatePresence(channelName, { 
      userId, 
      selection: selection || undefined 
    });
  }

  // Broadcast custom event
  async broadcast(
    channelName: string,
    event: string,
    payload: any
  ): Promise<void> {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`Channel ${channelName} not found`);
      return;
    }

    await channel.send({
      type: 'broadcast',
      event,
      payload,
    });
  }

  // Listen for custom events
  onBroadcast(
    channelName: string,
    event: string,
    callback: (payload: any) => void
  ): () => void {
    const channel = this.channels.get(channelName);
    if (!channel) {
      console.warn(`Channel ${channelName} not found`);
      return () => {};
    }

    channel.on('broadcast', { event }, callback);

    return () => {
      // Remove this specific listener
      channel.unsubscribe();
    };
  }

  // Unsubscribe from a channel
  unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.unsubscribe();
      this.client.removeChannel(channel);
      this.channels.delete(channelName);
    }
  }

  // Unsubscribe from all channels
  unsubscribeAll(): void {
    for (const [name, channel] of this.channels) {
      channel.unsubscribe();
      this.client.removeChannel(channel);
    }
    this.channels.clear();
  }

  // Get connection status
  getStatus(): 'connecting' | 'open' | 'closing' | 'closed' {
    // Get status from any active channel
    const channel = this.channels.values().next().value;
    if (!channel) return 'closed';
    
    return channel.state === 'joined' ? 'open' : 
           channel.state === 'joining' ? 'connecting' :
           channel.state === 'leaving' ? 'closing' : 'closed';
  }
}

// Export singleton instance
export const realtimeService = new RealtimeService();

// Export convenience functions
export const subscribeToPage = realtimeService.subscribeToPage.bind(realtimeService);
export const subscribeToWorkspace = realtimeService.subscribeToWorkspace.bind(realtimeService);
export const trackPresence = realtimeService.trackPresence.bind(realtimeService);
export const updateCursor = realtimeService.updateCursor.bind(realtimeService);
export const updateSelection = realtimeService.updateSelection.bind(realtimeService);
export const broadcast = realtimeService.broadcast.bind(realtimeService);
export const onBroadcast = realtimeService.onBroadcast.bind(realtimeService);
export const unsubscribe = realtimeService.unsubscribe.bind(realtimeService);
export const unsubscribeAll = realtimeService.unsubscribeAll.bind(realtimeService);