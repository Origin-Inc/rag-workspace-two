/**
 * Client-side Supabase upload service
 * Handles direct browser-to-Supabase uploads to bypass Vercel limitations
 */

import { createClient } from '@supabase/supabase-js';

// Initialize client-side Supabase client
const supabaseUrl = typeof window !== 'undefined' 
  ? window.ENV?.SUPABASE_URL || ''
  : '';
const supabaseAnonKey = typeof window !== 'undefined'
  ? window.ENV?.SUPABASE_ANON_KEY || ''
  : '';

// Debug logging helper
const log = {
  info: (msg: string, data?: any) => {
    console.log(`[SupabaseUpload] ℹ️ ${msg}`, data || '');
  },
  error: (msg: string, error?: any) => {
    console.error(`[SupabaseUpload] ❌ ${msg}`, error || '');
  },
  success: (msg: string, data?: any) => {
    console.log(`[SupabaseUpload] ✅ ${msg}`, data || '');
  },
  debug: (msg: string, data?: any) => {
    console.log(`[SupabaseUpload] 🔍 ${msg}`, data || '');
  }
};

export class SupabaseUploadClient {
  private static instance: SupabaseUploadClient;
  private supabase: any;
  private initialized = false;

  private constructor() {}

  static getInstance(): SupabaseUploadClient {
    if (!SupabaseUploadClient.instance) {
      SupabaseUploadClient.instance = new SupabaseUploadClient();
    }
    return SupabaseUploadClient.instance;
  }

  /**
   * Initialize the Supabase client
   */
  async initialize(url?: string, anonKey?: string): Promise<boolean> {
    try {
      const finalUrl = url || supabaseUrl;
      const finalKey = anonKey || supabaseAnonKey;

      log.info('Initializing Supabase client', {
        url: finalUrl,
        hasKey: !!finalKey
      });

      if (!finalUrl || !finalKey) {
        throw new Error('Supabase URL and anon key are required');
      }

      this.supabase = createClient(finalUrl, finalKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      });

      this.initialized = true;
      log.success('Supabase client initialized');
      return true;
    } catch (error) {
      log.error('Failed to initialize Supabase client', error);
      return false;
    }
  }

  /**
   * Upload file directly to Supabase Storage
   */
  async uploadFile(
    file: File,
    path: string,
    options: {
      bucket?: string;
      onProgress?: (progress: number) => void;
      upsert?: boolean;
    } = {}
  ): Promise<{ url: string; path: string; error?: string }> {
    const { bucket = 'user-uploads', onProgress, upsert = true } = options;

    log.info('Starting direct upload', {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      path,
      bucket
    });

    if (!this.initialized) {
      const error = 'Supabase client not initialized';
      log.error(error);
      throw new Error(error);
    }

    try {
      // Step 1: Check if file already exists
      log.debug('Checking if file exists', { path });
      const { data: existingFile } = await this.supabase.storage
        .from(bucket)
        .list(path.split('/').slice(0, -1).join('/'), {
          search: path.split('/').pop()
        });

      if (existingFile && existingFile.length > 0 && !upsert) {
        const error = 'File already exists and upsert is disabled';
        log.error(error, { existingFile });
        return { url: '', path, error };
      }

      // Step 2: Upload the file
      log.info('Uploading file to Supabase Storage', {
        bucket,
        path,
        upsert
      });

      // For progress tracking, we'll use XMLHttpRequest
      const uploadUrl = `${this.supabase.storageUrl}/object/${bucket}/${path}`;
      
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 100);
            log.debug(`Upload progress: ${percentComplete}%`);
            onProgress?.(percentComplete);
          }
        });

        xhr.addEventListener('load', async () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            log.success('File uploaded successfully', {
              status: xhr.status,
              response: xhr.responseText
            });

            // Get the public URL
            const { data: urlData } = this.supabase.storage
              .from(bucket)
              .getPublicUrl(path);

            log.success('Upload complete', {
              publicUrl: urlData?.publicUrl,
              path
            });

            resolve({
              url: urlData?.publicUrl || '',
              path
            });
          } else {
            const error = `Upload failed with status ${xhr.status}: ${xhr.responseText}`;
            log.error(error);
            resolve({ url: '', path, error });
          }
        });

        xhr.addEventListener('error', () => {
          const error = 'Network error during upload';
          log.error(error);
          reject(new Error(error));
        });

        // Use the standard Supabase upload method as fallback
        this.uploadWithSDK(file, path, bucket, upsert)
          .then(resolve)
          .catch(reject);
      });
    } catch (error) {
      log.error('Upload failed', error);
      return {
        url: '',
        path,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Upload using Supabase SDK (fallback method)
   */
  private async uploadWithSDK(
    file: File,
    path: string,
    bucket: string,
    upsert: boolean
  ): Promise<{ url: string; path: string; error?: string }> {
    log.info('Using SDK upload method');

    const { data, error } = await this.supabase.storage
      .from(bucket)
      .upload(path, file, {
        contentType: file.type || 'application/octet-stream',
        upsert,
        cacheControl: '3600'
      });

    if (error) {
      log.error('SDK upload failed', {
        error: error.message,
        details: error
      });
      return { url: '', path, error: error.message };
    }

    log.success('SDK upload succeeded', data);

    // Get public URL
    const { data: urlData } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);

    return {
      url: urlData?.publicUrl || '',
      path: data.path
    };
  }

  /**
   * Create a signed URL for an existing file
   */
  async createSignedUrl(
    path: string,
    expiresIn: number = 3600,
    bucket: string = 'user-uploads'
  ): Promise<{ url: string; error?: string }> {
    log.info('Creating signed URL', {
      path,
      expiresIn,
      bucket
    });

    if (!this.initialized) {
      const error = 'Supabase client not initialized';
      log.error(error);
      return { url: '', error };
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(path, expiresIn);

      if (error) {
        log.error('Failed to create signed URL', error);
        return { url: '', error: error.message };
      }

      log.success('Signed URL created', {
        url: data.signedUrl,
        expiresIn
      });

      return { url: data.signedUrl };
    } catch (error) {
      log.error('Error creating signed URL', error);
      return {
        url: '',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(
    path: string,
    bucket: string = 'user-uploads'
  ): Promise<{ success: boolean; error?: string }> {
    log.info('Deleting file', { path, bucket });

    if (!this.initialized) {
      const error = 'Supabase client not initialized';
      log.error(error);
      return { success: false, error };
    }

    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) {
        log.error('Failed to delete file', error);
        return { success: false, error: error.message };
      }

      log.success('File deleted', { path });
      return { success: true };
    } catch (error) {
      log.error('Error deleting file', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}

// Export singleton instance
export const supabaseUpload = SupabaseUploadClient.getInstance();