import { getSupabaseClient } from '~/utils/supabase.client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import type { DatabaseRow } from '~/types/database-block';

/**
 * Supabase Realtime integration for database blocks
 * Implements real-time collaboration features as specified in task 4
 */
export class DatabaseRealtimeService {
  private supabase = getSupabaseClient();
  private channels: Map<string, RealtimeChannel> = new Map();

  /**
   * Subscribe to database changes using Supabase Realtime
   * Uses supabase.channel() for live updates as specified in tasks.json
   */
  subscribeToDatabaseChanges(
    dbBlockId: string,
    callbacks: {
      onInsert?: (row: DatabaseRow) => void;
      onUpdate?: (row: DatabaseRow) => void;
      onDelete?: (row: DatabaseRow) => void;
    }
  ): () => void {
    const channelName = `db-changes-${dbBlockId}`;
    
    // Clean up existing channel if it exists
    this.unsubscribe(channelName);

    // Create new channel for database changes
    const channel = this.supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'db_block_rows',
          filter: `db_block_id=eq.${dbBlockId}`
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (callbacks.onInsert && payload.new) {
            callbacks.onInsert(this.mapRow(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'db_block_rows',
          filter: `db_block_id=eq.${dbBlockId}`
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (callbacks.onUpdate && payload.new) {
            callbacks.onUpdate(this.mapRow(payload.new));
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'db_block_rows',
          filter: `db_block_id=eq.${dbBlockId}`
        },
        (payload: RealtimePostgresChangesPayload<any>) => {
          if (callbacks.onDelete && payload.old) {
            callbacks.onDelete(this.mapRow(payload.old));
          }
        }
      );

    // Subscribe to the channel
    channel.subscribe((status, error) => {
      if (error) {
        console.warn(`Realtime subscription error for ${channelName}:`, error);
      } else if (status === 'SUBSCRIBED') {
        console.log(`Successfully subscribed to ${channelName}`);
      }
    });

    // Store channel reference
    this.channels.set(channelName, channel);

    // Return cleanup function
    return () => this.unsubscribe(channelName);
  }

  /**
   * Subscribe to presence for collaborative editing
   */
  subscribeToPresence(
    dbBlockId: string,
    userId: string,
    userData: { name: string; email: string },
    callbacks: {
      onSync?: (users: any[]) => void;
      onJoin?: (user: any) => void;
      onLeave?: (user: any) => void;
    }
  ): () => void {
    const channelName = `presence-${dbBlockId}`;
    
    // Clean up existing channel if it exists
    this.unsubscribe(channelName);

    const channel = this.supabase.channel(channelName);

    // Set up presence
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        if (callbacks.onSync) {
          const users = Object.values(state).flat();
          callbacks.onSync(users);
        }
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (callbacks.onJoin && newPresences.length > 0) {
          callbacks.onJoin(newPresences[0]);
        }
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (callbacks.onLeave && leftPresences.length > 0) {
          callbacks.onLeave(leftPresences[0]);
        }
      });

    // Subscribe and track presence
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          userId,
          ...userData,
          online_at: new Date().toISOString()
        });
      }
    });

    // Store channel reference
    this.channels.set(channelName, channel);

    // Return cleanup function
    return () => this.unsubscribe(channelName);
  }

  /**
   * Broadcast cell editing status for real-time collaboration
   */
  async broadcastCellEdit(
    dbBlockId: string,
    cellId: string,
    action: 'start' | 'end',
    userId: string
  ): Promise<void> {
    const channelName = `presence-${dbBlockId}`;
    const channel = this.channels.get(channelName);
    
    if (!channel) {
      console.warn(`Channel ${channelName} not found`);
      return;
    }

    await channel.send({
      type: 'broadcast',
      event: 'cell-edit',
      payload: {
        cellId,
        action,
        userId,
        timestamp: new Date().toISOString()
      }
    });
  }

  /**
   * Listen for cell edit broadcasts
   */
  onCellEdit(
    dbBlockId: string,
    callback: (payload: any) => void
  ): () => void {
    const channelName = `presence-${dbBlockId}`;
    const channel = this.channels.get(channelName);
    
    if (!channel) {
      console.warn(`Channel ${channelName} not found`);
      return () => {};
    }

    channel.on('broadcast', { event: 'cell-edit' }, callback);

    return () => {
      // Note: Supabase doesn't have a direct way to remove specific listeners
      // You would need to resubscribe without this listener
    };
  }

  /**
   * Unsubscribe from a channel
   */
  private unsubscribe(channelName: string): void {
    const channel = this.channels.get(channelName);
    if (channel) {
      channel.unsubscribe();
      this.supabase.removeChannel(channel);
      this.channels.delete(channelName);
    }
  }

  /**
   * Unsubscribe from all channels
   */
  unsubscribeAll(): void {
    for (const [name, channel] of this.channels) {
      channel.unsubscribe();
      this.supabase.removeChannel(channel);
    }
    this.channels.clear();
  }

  /**
   * Map database row from Supabase format
   */
  private mapRow(data: any): DatabaseRow {
    return {
      id: data.id,
      databaseBlockId: data.db_block_id,
      rowNumber: data.position,
      data: data.data,
      metadata: {},
      version: data.version,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    };
  }
}

// Export singleton instance
export const databaseRealtimeService = new DatabaseRealtimeService();