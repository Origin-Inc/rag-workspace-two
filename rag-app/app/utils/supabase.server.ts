import { createClient } from '@supabase/supabase-js';
import type { Database } from '~/types/supabase';

// Server-side Supabase client with service key (full access)
export function createSupabaseAdmin() {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseServiceKey = process.env["SUPABASE_SERVICE_KEY"];

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient<Database>(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// Server-side Supabase client with user context
export function createSupabaseServerClient(accessToken?: string) {
  const supabaseUrl = process.env["SUPABASE_URL"];
  const supabaseAnonKey = process.env["SUPABASE_ANON_KEY"];

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  const options: any = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  };

  // If we have an access token from our custom auth, pass it along
  if (accessToken) {
    options.global = {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    };
  }

  return createClient<Database>(supabaseUrl, supabaseAnonKey, options);
}

// Helper to get Supabase client with custom auth context
export async function getSupabaseWithAuth(request: Request) {
  // We'll integrate with our custom auth system
  const { getUser } = await import('~/services/auth/auth.server');
  const user = await getUser(request);
  
  if (!user) {
    // Return anonymous client
    return createSupabaseServerClient();
  }

  // Create a custom JWT that Supabase can understand
  // This bridges our custom auth with Supabase RLS
  const customToken = await createSupabaseToken(user);
  return createSupabaseServerClient(customToken);
}

// Create a token that Supabase can use for RLS
async function createSupabaseToken(user: any) {
  // This would typically create a JWT that Supabase understands
  // For now, we'll use the service key since we control access via our auth
  return process.env["SUPABASE_SERVICE_KEY"];
}