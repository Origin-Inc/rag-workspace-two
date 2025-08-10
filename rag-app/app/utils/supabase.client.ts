import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/types/supabase';

let supabaseClient: ReturnType<typeof createClient<Database>> | null = null;

// Client-side Supabase client (browser)
export function getSupabaseClient() {
  if (supabaseClient) return supabaseClient;

  // These will be passed from the server via loader data
  const supabaseUrl = window.ENV?.SUPABASE_URL;
  const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables not available');
  }

  supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false, // We handle auth ourselves
      autoRefreshToken: false,
    },
  });

  return supabaseClient;
}

// Subscribe to realtime changes
export function subscribeToPage(
  pageId: string,
  callbacks: {
    onBlockInsert?: (payload: any) => void;
    onBlockUpdate?: (payload: any) => void;
    onBlockDelete?: (payload: any) => void;
  }
) {
  const client = getSupabaseClient();
  
  const channel = client
    .channel(`page-${pageId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'blocks',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => callbacks.onBlockInsert?.(payload)
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'blocks',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => callbacks.onBlockUpdate?.(payload)
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'blocks',
        filter: `page_id=eq.${pageId}`,
      },
      (payload) => callbacks.onBlockDelete?.(payload)
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// Subscribe to workspace changes
export function subscribeToWorkspace(
  workspaceId: string,
  callbacks: {
    onPageChange?: (payload: any) => void;
    onMemberChange?: (payload: any) => void;
  }
) {
  const client = getSupabaseClient();
  
  const channel = client
    .channel(`workspace-${workspaceId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pages',
        filter: `workspace_id=eq.${workspaceId}`,
      },
      (payload) => callbacks.onPageChange?.(payload)
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

// Presence for collaborative features
export function setupPresence(pageId: string, userId: string, userInfo: any) {
  const client = getSupabaseClient();
  
  const channel = client.channel(`presence-${pageId}`);
  
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      console.log('Presence state:', state);
    })
    .on('presence', { event: 'join' }, ({ key, newPresences }) => {
      console.log('User joined:', key, newPresences);
    })
    .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
      console.log('User left:', key, leftPresences);
    })
    .subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          online_at: new Date().toISOString(),
          ...userInfo,
        });
      }
    });

  return () => {
    channel.untrack();
    client.removeChannel(channel);
  };
}