import { createClient } from '@supabase/supabase-js';
import { prisma } from '~/utils/db.server';
import crypto from 'crypto';
import type { User, Workspace } from '@prisma/client';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export interface FileUploadOptions {
  user: User;
  workspace: Workspace;
  pageId?: string;
  file: File | Buffer;
  filename: string;
  mimeType: string;
  isShared?: boolean;
}

export interface FileUploadResult {
  fileId: string;
  storagePath: string;
  publicUrl?: string;
  signedUrl?: string;
  checksum: string;
}

export class FileUploadService {
  static readonly BUCKET_NAME = 'user-uploads';
  static readonly MAX_FILE_SIZE = 5 * 1024 * 1024 * 1024; // 5GB
  static readonly ALLOWED_MIME_TYPES = [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
    'text/plain',
    'application/json'
  ];

  /**
   * Upload file to Supabase Storage and create database record
   */
  static async uploadFile(options: FileUploadOptions): Promise<FileUploadResult> {
    const { user, workspace, pageId, file, filename, mimeType, isShared } = options;

    // Validate file type
    if (!this.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`File type ${mimeType} not allowed`);
    }

    // Calculate file size and checksum
    let fileBuffer: Buffer;
    let fileSize: number;

    if (file instanceof File) {
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);
      fileSize = file.size;
    } else {
      fileBuffer = file;
      fileSize = fileBuffer.length;
    }

    // Validate file size
    if (fileSize > this.MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum of 5GB`);
    }

    // Calculate SHA-256 checksum
    const checksum = crypto
      .createHash('sha256')
      .update(fileBuffer)
      .digest('hex');

    // Generate storage path
    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = isShared
      ? `workspace/${workspace.id}/${timestamp}_${safeFilename}`
      : `${user.id}/${timestamp}_${safeFilename}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from(this.BUCKET_NAME)
      .upload(storagePath, fileBuffer, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    // Get public URL (if bucket is public) or signed URL
    let publicUrl: string | undefined;
    let signedUrl: string | undefined;

    if (isShared) {
      // Generate a signed URL for shared files (valid for 7 days)
      const { data: signedData, error: signedError } = await supabase.storage
        .from(this.BUCKET_NAME)
        .createSignedUrl(storagePath, 7 * 24 * 60 * 60); // 7 days

      if (signedError) {
        console.error('Failed to create signed URL:', signedError);
      } else {
        signedUrl = signedData.signedUrl;
      }
    }

    // Create database record
    const userFile = await prisma.userFile.create({
      data: {
        userId: user.id,
        workspaceId: workspace.id,
        pageId,
        filename: safeFilename,
        originalName: filename,
        mimeType,
        sizeBytes: BigInt(fileSize),
        storagePath,
        storageUrl: signedUrl,
        checksum,
        isShared: isShared || false,
        shareScope: isShared ? 'workspace' : null,
        processingStatus: 'pending',
        metadata: {}
      }
    });

    return {
      fileId: userFile.id,
      storagePath,
      publicUrl,
      signedUrl,
      checksum
    };
  }

  /**
   * Generate a signed URL for direct browser uploads (for large files)
   */
  static async generateUploadUrl(
    user: User,
    workspace: Workspace,
    filename: string,
    isShared?: boolean
  ): Promise<{ uploadUrl: string; storagePath: string; token?: string }> {
    const timestamp = Date.now();
    const safeFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = isShared
      ? `workspace/${workspace.id}/${timestamp}_${safeFilename}`
      : `${user.id}/${timestamp}_${safeFilename}`;

    try {
      // Use the createSignedUploadUrl method for direct browser uploads
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .createSignedUploadUrl(storagePath);

      if (error || !data) {
        throw error || new Error('No data returned from createSignedUploadUrl');
      }

      // The data contains both the signedUrl and a token
      // For browser uploads, we need to construct the full upload URL
      const baseUrl = process.env.SUPABASE_URL || supabaseUrl;
      const uploadUrl = `${baseUrl}/storage/v1/upload/signed?token=${data.token}`;

      return {
        uploadUrl,
        storagePath,
        token: data.token
      };
    } catch (error) {
      console.error('Failed to create signed upload URL:', error);
      
      // Fallback: Create a regular signed URL for PUT requests
      try {
        const { data: signedData, error: signedError } = await supabase.storage
          .from(this.BUCKET_NAME)
          .createSignedUrl(storagePath, 300);

        if (signedError || !signedData) {
          throw signedError || new Error('Failed to create signed URL');
        }

        return {
          uploadUrl: signedData.signedUrl,
          storagePath
        };
      } catch (fallbackError) {
        throw new Error(`Failed to generate upload URL: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
      }
    }
  }

  /**
   * Download file from Supabase Storage
   */
  static async downloadFile(fileId: string, userId: string): Promise<Buffer> {
    // Get file record
    const file = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        OR: [
          { userId },
          {
            workspace: {
              userWorkspaces: {
                some: {
                  userId
                }
              }
            }
          }
        ]
      }
    });

    if (!file) {
      throw new Error('File not found or access denied');
    }

    // Download from Supabase Storage
    const { data, error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .download(file.storagePath);

    if (error) {
      throw new Error(`Failed to download file: ${error.message}`);
    }

    // Convert blob to buffer
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Delete file from Supabase Storage and database
   */
  static async deleteFile(fileId: string, userId: string): Promise<void> {
    // Get file record
    const file = await prisma.userFile.findFirst({
      where: {
        id: fileId,
        userId
      },
      include: {
        processingJobs: true
      }
    });

    if (!file) {
      throw new Error('File not found or access denied');
    }

    // Cancel any pending processing jobs
    if (file.processingJobs.length > 0) {
      await prisma.fileProcessingJob.updateMany({
        where: {
          fileId,
          status: { in: ['pending', 'running'] }
        },
        data: {
          status: 'cancelled'
        }
      });
    }

    // Delete from Supabase Storage
    const { error } = await supabase.storage
      .from(this.BUCKET_NAME)
      .remove([file.storagePath]);

    if (error) {
      console.error('Failed to delete file from storage:', error);
    }

    // Delete database record (cascade will handle related records)
    await prisma.userFile.delete({
      where: { id: fileId }
    });

    // Delete associated data table if exists
    if (file.dataTableId) {
      await prisma.userDataTable.delete({
        where: { id: file.dataTableId }
      }).catch(console.error);
    }
  }

  /**
   * List user files with pagination
   */
  static async listFiles(
    userId: string,
    workspaceId: string,
    options: {
      pageId?: string;
      limit?: number;
      offset?: number;
      includeShared?: boolean;
    } = {}
  ) {
    const { pageId, limit = 20, offset = 0, includeShared = true } = options;

    const where: any = {
      workspaceId,
      ...(pageId && { pageId })
    };

    if (includeShared) {
      where.OR = [
        { userId },
        { isShared: true }
      ];
    } else {
      where.userId = userId;
    }

    const [files, total] = await Promise.all([
      prisma.userFile.findMany({
        where,
        include: {
          dataTable: {
            select: {
              id: true,
              tableName: true,
              rowCount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset
      }),
      prisma.userFile.count({ where })
    ]);

    return {
      files,
      total,
      hasMore: offset + limit < total
    };
  }

  /**
   * Update file processing status
   */
  static async updateProcessingStatus(
    fileId: string,
    status: 'processing' | 'completed' | 'failed',
    error?: string
  ) {
    await prisma.userFile.update({
      where: { id: fileId },
      data: {
        processingStatus: status,
        processingError: error,
        processedAt: status === 'completed' ? new Date() : undefined
      }
    });
  }

  /**
   * Verify if a file exists in storage
   */
  static async verifyFileExists(storagePath: string): Promise<boolean> {
    try {
      const { data, error } = await supabase.storage
        .from(this.BUCKET_NAME)
        .list(storagePath.split('/').slice(0, -1).join('/'), {
          search: storagePath.split('/').pop()
        });

      if (error) {
        console.error('Error checking file existence:', error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('Error verifying file:', error);
      return false;
    }
  }
}