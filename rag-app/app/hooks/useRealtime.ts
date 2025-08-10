import { useEffect, useState, useCallback, useRef } from 'react';
import {
  subscribeToPage,
  subscribeToWorkspace,
  trackPresence,
  updateCursor,
  updateSelection,
  broadcast,
  onBroadcast,
  unsubscribe,
  type PresenceState,
} from '~/services/realtime.client';
import type { Block, Page } from '~/types/supabase';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// Hook for subscribing to page changes and presence
export function usePageRealtime(
  pageId: string | null,
  options?: {
    userId?: string;
    userName?: string;
    userAvatar?: string;
    userColor?: string;
    onBlockInsert?: (block: Block) => void;
    onBlockUpdate?: (block: Block) => void;
    onBlockDelete?: (oldBlock: Block) => void;
    onPageUpdate?: (page: Page) => void;
  }
) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!pageId) return;

    // Clean up previous subscription
    if (cleanupRef.current) {
      cleanupRef.current();
    }

    const cleanup = subscribeToPage(pageId, {
      blocks: {
        onInsert: (payload) => {
          if (payload.new) {
            options?.onBlockInsert?.(payload.new as Block);
          }
        },
        onUpdate: (payload) => {
          if (payload.new) {
            options?.onBlockUpdate?.(payload.new as Block);
          }
        },
        onDelete: (payload) => {
          if (payload.old) {
            options?.onBlockDelete?.(payload.old as Block);
          }
        },
      },
      page: {
        onUpdate: (payload) => {
          if (payload.new) {
            options?.onPageUpdate?.(payload.new as Page);
          }
        },
      },
      presence: {
        onSync: (state) => {
          const users = Object.values(state).flat() as PresenceState[];
          setOnlineUsers(users);
          setIsConnected(true);
        },
        onJoin: (key, presence) => {
          setOnlineUsers((prev) => [...prev, presence]);
        },
        onLeave: (key, presence) => {
          setOnlineUsers((prev) => 
            prev.filter((u) => u.userId !== presence.userId)
          );
        },
      },
    });

    // Track our own presence if user info provided
    if (options?.userId) {
      const channelName = `page:${pageId}`;
      trackPresence(channelName, {
        userId: options.userId,
        userName: options.userName,
        userAvatar: options.userAvatar,
        color: options.userColor,
        lastSeen: new Date().toISOString(),
      });
    }

    cleanupRef.current = cleanup;

    return () => {
      cleanup();
      setIsConnected(false);
    };
  }, [pageId, options?.userId]);

  // Update cursor position
  const sendCursor = useCallback(
    (x: number, y: number) => {
      if (!pageId || !options?.userId) return;
      updateCursor(pageId, options.userId, { x, y });
    },
    [pageId, options?.userId]
  );

  // Update selection
  const sendSelection = useCallback(
    (blockId: string | null, start?: number, end?: number) => {
      if (!pageId || !options?.userId) return;
      
      if (blockId) {
        updateSelection(pageId, options.userId, { blockId, start, end });
      } else {
        updateSelection(pageId, options.userId, null);
      }
    },
    [pageId, options?.userId]
  );

  return {
    onlineUsers,
    isConnected,
    sendCursor,
    sendSelection,
  };
}

// Hook for subscribing to workspace changes
export function useWorkspaceRealtime(
  workspaceId: string | null,
  options?: {
    userId?: string;
    userName?: string;
    userAvatar?: string;
    onPageInsert?: (page: Page) => void;
    onPageUpdate?: (page: Page) => void;
    onPageDelete?: (oldPage: Page) => void;
  }
) {
  const [onlineUsers, setOnlineUsers] = useState<PresenceState[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!workspaceId) return;

    const cleanup = subscribeToWorkspace(workspaceId, {
      pages: {
        onInsert: (payload) => {
          if (payload.new) {
            options?.onPageInsert?.(payload.new as Page);
          }
        },
        onUpdate: (payload) => {
          if (payload.new) {
            options?.onPageUpdate?.(payload.new as Page);
          }
        },
        onDelete: (payload) => {
          if (payload.old) {
            options?.onPageDelete?.(payload.old as Page);
          }
        },
      },
      onlineUsers: {
        onSync: (state) => {
          const users = Object.values(state).flat() as PresenceState[];
          setOnlineUsers(users);
          setIsConnected(true);
        },
        onJoin: (key, user) => {
          setOnlineUsers((prev) => [...prev, user]);
        },
        onLeave: (key, user) => {
          setOnlineUsers((prev) => 
            prev.filter((u) => u.userId !== user.userId)
          );
        },
      },
    });

    // Track our own presence if user info provided
    if (options?.userId) {
      const channelName = `workspace:${workspaceId}`;
      trackPresence(channelName, {
        userId: options.userId,
        userName: options.userName,
        userAvatar: options.userAvatar,
        lastSeen: new Date().toISOString(),
      });
    }

    return () => {
      cleanup();
      setIsConnected(false);
    };
  }, [workspaceId, options?.userId]);

  return {
    onlineUsers,
    isConnected,
  };
}

// Hook for custom broadcast events
export function useBroadcast(
  channelName: string,
  event: string,
  onReceive?: (payload: any) => void
) {
  const send = useCallback(
    (payload: any) => {
      broadcast(channelName, event, payload);
    },
    [channelName, event]
  );

  useEffect(() => {
    if (!onReceive) return;

    const cleanup = onBroadcast(channelName, event, onReceive);
    return cleanup;
  }, [channelName, event, onReceive]);

  return { send };
}

// Hook for optimistic updates with realtime sync
export function useOptimisticBlocks(
  initialBlocks: Block[],
  pageId: string
) {
  const [blocks, setBlocks] = useState(initialBlocks);
  const [optimisticUpdates, setOptimisticUpdates] = useState<Map<string, Block>>(
    new Map()
  );

  // Apply optimistic update
  const optimisticUpdate = useCallback((blockId: string, updates: Partial<Block>) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.id === blockId ? { ...block, ...updates } : block
      )
    );
    
    setOptimisticUpdates((prev) => {
      const next = new Map(prev);
      const block = blocks.find((b) => b.id === blockId);
      if (block) {
        next.set(blockId, { ...block, ...updates });
      }
      return next;
    });
  }, [blocks]);

  // Handle realtime updates
  usePageRealtime(pageId, {
    onBlockInsert: (block) => {
      setBlocks((prev) => [...prev, block]);
    },
    onBlockUpdate: (block) => {
      // Check if this confirms an optimistic update
      const optimistic = optimisticUpdates.get(block.id);
      if (optimistic && optimistic.updated_at === block.updated_at) {
        // Confirmed - remove from optimistic updates
        setOptimisticUpdates((prev) => {
          const next = new Map(prev);
          next.delete(block.id);
          return next;
        });
      }
      
      // Apply the real update
      setBlocks((prev) =>
        prev.map((b) => (b.id === block.id ? block : b))
      );
    },
    onBlockDelete: (oldBlock) => {
      setBlocks((prev) => prev.filter((b) => b.id !== oldBlock.id));
      setOptimisticUpdates((prev) => {
        const next = new Map(prev);
        next.delete(oldBlock.id);
        return next;
      });
    },
  });

  return {
    blocks,
    optimisticUpdate,
    hasPendingUpdates: optimisticUpdates.size > 0,
  };
}

// Hook for collaborative cursors
export function useCollaborativeCursors(
  pageId: string,
  userId: string,
  userName?: string,
  userColor?: string
) {
  const [cursors, setCursors] = useState<Map<string, { x: number; y: number; color?: string; name?: string }>>(
    new Map()
  );

  const { onlineUsers, sendCursor } = usePageRealtime(pageId, {
    userId,
    userName,
    userColor,
  });

  useEffect(() => {
    const newCursors = new Map();
    
    onlineUsers.forEach((user) => {
      if (user.userId !== userId && user.cursor) {
        newCursors.set(user.userId, {
          x: user.cursor.x,
          y: user.cursor.y,
          color: user.color,
          name: user.userName,
        });
      }
    });

    setCursors(newCursors);
  }, [onlineUsers, userId]);

  const updateMyCursor = useCallback(
    (x: number, y: number) => {
      sendCursor(x, y);
    },
    [sendCursor]
  );

  return {
    cursors,
    updateMyCursor,
    onlineCount: onlineUsers.length,
  };
}