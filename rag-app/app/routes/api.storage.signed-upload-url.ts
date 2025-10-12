/**
 * Signed Upload URL API
 *
 * Creates signed URLs for direct client-to-Supabase uploads
 * This bypasses RLS by using service role on the server side
 *
 * The client can then use the signed URL to upload directly to Supabase Storage
 * without needing Supabase Auth authentication
 */

import { type LoaderFunctionArgs, json } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { createClient } from '@supabase/supabase-js';

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    // Verify user is authenticated
    const user = await requireUser(request);

    const url = new URL(request.url);
    const path = url.searchParams.get('path');
    const bucket = url.searchParams.get('bucket') || 'user-data-files';

    if (!path) {
      return json({ error: 'Missing path parameter' }, { status: 400 });
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[SignedUploadURL] Missing Supabase credentials');
      return json({ error: 'Server configuration error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    console.log('[SignedUploadURL] Creating signed URL:', { bucket, path, userId: user.id });

    // Create signed URL for upload (valid for 1 hour)
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(path);

    if (error) {
      console.error('[SignedUploadURL] Failed to create signed URL:', error);
      return json({ error: error.message }, { status: 500 });
    }

    // Get public URL for the file (used after upload)
    const { data: publicUrlData } = supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    console.log('[SignedUploadURL] Signed URL created successfully');

    return json({
      signedUrl: data.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      path: path,
      bucket: bucket,
      expiresIn: 3600 // 1 hour
    });

  } catch (error) {
    console.error('[SignedUploadURL] Error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Failed to create signed URL' },
      { status: 500 }
    );
  }
}
