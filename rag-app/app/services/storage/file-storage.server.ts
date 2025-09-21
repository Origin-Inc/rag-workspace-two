import { createServerClient } from '@supabase/auth-helpers-remix';
import type { SupabaseClient } from '@supabase/supabase-js';

export class FileStorageService {
  private supabase: SupabaseClient;
  
  constructor(request: Request, response: Response) {
    this.supabase = createServerClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { request, response }
    );
  }
  
  /**
   * Upload a file to Supabase Storage
   */
  async uploadFile(
    bucket: string,
    path: string,
    file: File | Buffer | Uint8Array,
    contentType?: string
  ) {
    try {
      const uploadData = file instanceof File 
        ? await file.arrayBuffer()
        : file;
        
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(path, uploadData, {
          contentType: contentType || 'application/octet-stream',
          upsert: true
        });
        
      if (error) {
        console.error('[FileStorageService] Upload error:', error);
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('[FileStorageService] Failed to upload file:', error);
      throw error;
    }
  }
  
  /**
   * Get a public URL for a file
   */
  getPublicUrl(bucket: string, path: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(path);
    
    return data.publicUrl;
  }
  
  /**
   * Get a signed URL for private file access
   */
  async getSignedUrl(bucket: string, path: string, expiresIn = 3600) {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .createSignedUrl(path, expiresIn);
      
    if (error) {
      console.error('[FileStorageService] Failed to create signed URL:', error);
      throw error;
    }
    
    return data.signedUrl;
  }
  
  /**
   * Download a file from Supabase Storage
   */
  async downloadFile(bucket: string, path: string) {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .download(path);
      
    if (error) {
      console.error('[FileStorageService] Download error:', error);
      throw error;
    }
    
    return data;
  }
  
  /**
   * Delete a file from Supabase Storage
   */
  async deleteFile(bucket: string, path: string) {
    const { error } = await this.supabase.storage
      .from(bucket)
      .remove([path]);
      
    if (error) {
      console.error('[FileStorageService] Delete error:', error);
      throw error;
    }
    
    return true;
  }
  
  /**
   * List files in a directory
   */
  async listFiles(bucket: string, path: string) {
    const { data, error } = await this.supabase.storage
      .from(bucket)
      .list(path);
      
    if (error) {
      console.error('[FileStorageService] List error:', error);
      throw error;
    }
    
    return data;
  }
}