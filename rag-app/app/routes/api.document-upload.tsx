import { json, unstable_parseMultipartFormData, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { embeddingGenerationService } from '~/services/embedding-generation.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('API:DocumentUpload');

// Custom upload handler for processing files
const uploadHandler = async ({ 
  name, 
  contentType, 
  data, 
  filename 
}: {
  name: string;
  contentType: string;
  data: AsyncIterable<Uint8Array>;
  filename?: string;
}): Promise<File | string | null | undefined> => {
  // Only process files named 'document'
  if (name !== 'document') {
    return undefined;
  }

  // Collect file data
  const chunks: Uint8Array[] = [];
  for await (const chunk of data) {
    chunks.push(chunk);
  }

  // Combine chunks into a single buffer
  const buffer = Buffer.concat(chunks);
  
  // Create a File object
  return new File([buffer], filename || 'document', { type: contentType });
};

export async function action({ request }: ActionFunctionArgs) {
  logger.info('Document upload request received');
  
  const user = await requireUser(request);
  const supabase = createSupabaseAdmin();

  try {
    // Parse multipart form data
    const formData = await unstable_parseMultipartFormData(request, uploadHandler);
    
    const workspaceId = formData.get('workspaceId') as string;
    const file = formData.get('document') as File;
    const metadata = formData.get('metadata') as string;

    if (!workspaceId || !file) {
      logger.warn('Missing required fields', { workspaceId: !!workspaceId, file: !!file });
      return json({ error: 'Missing required fields' }, { status: 400 });
    }

    logger.info('Processing document upload', {
      workspaceId,
      filename: file.name,
      size: file.size,
      type: file.type
    });

    // Validate file size (50MB limit)
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
      return json({ error: 'File size exceeds 50MB limit' }, { status: 400 });
    }

    // Parse metadata if provided
    let parsedMetadata = {};
    if (metadata) {
      try {
        parsedMetadata = JSON.parse(metadata);
      } catch (e) {
        logger.warn('Invalid metadata JSON', e);
      }
    }

    // Generate storage path
    const timestamp = Date.now();
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `workspace-${workspaceId}/${timestamp}-${sanitizedFilename}`;

    // Upload to Supabase Storage
    logger.info('Uploading to Supabase Storage', { storagePath });
    
    const arrayBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('documents')
      .upload(storagePath, arrayBuffer, {
        contentType: file.type,
        upsert: false
      });

    if (uploadError) {
      logger.error('Storage upload failed', uploadError);
      return json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    logger.info('File uploaded successfully', { path: uploadData.path });

    // Create document upload record
    const { data: uploadRecord, error: recordError } = await supabase
      .from('document_uploads')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        filename: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        status: 'uploaded',
        metadata: parsedMetadata
      })
      .select()
      .single();

    if (recordError) {
      logger.error('Failed to create upload record', recordError);
      // Try to clean up uploaded file
      await supabase.storage.from('documents').remove([storagePath]);
      return json({ error: `Failed to create upload record: ${recordError.message}` }, { status: 500 });
    }

    // Process document content based on file type
    let documentContent = '';
    
    if (file.type === 'text/plain' || file.type === 'text/markdown') {
      // Process text files directly
      documentContent = await file.text();
    } else if (file.type === 'application/json') {
      // Process JSON files
      const jsonContent = await file.text();
      try {
        const parsed = JSON.parse(jsonContent);
        documentContent = JSON.stringify(parsed, null, 2);
      } catch {
        documentContent = jsonContent;
      }
    } else if (file.type === 'application/pdf') {
      // PDF processing would require a library like pdf-parse
      // For now, we'll skip processing
      logger.info('PDF processing not yet implemented');
      return json({
        success: true,
        uploadId: uploadRecord.id,
        message: 'PDF uploaded but text extraction not yet implemented'
      });
    } else {
      // Unsupported file type for text extraction
      logger.info('File type not supported for text extraction', { type: file.type });
      return json({
        success: true,
        uploadId: uploadRecord.id,
        message: 'File uploaded but text extraction not supported for this file type'
      });
    }

    // Update status to processing
    await supabase
      .from('document_uploads')
      .update({ status: 'processing' })
      .eq('id', uploadRecord.id);

    // Process document and generate embeddings
    logger.info('Processing document content for embeddings');
    
    try {
      const passageIds = await embeddingGenerationService.processDocument(
        workspaceId,
        documentContent,
        {
          filename: file.name,
          storage_path: storagePath,
          page_name: file.name,
          ...parsedMetadata
        }
      );

      // Update status to processed
      await supabase
        .from('document_uploads')
        .update({ 
          status: 'processed',
          processed_at: new Date().toISOString()
        })
        .eq('id', uploadRecord.id);

      logger.info('Document processed successfully', {
        uploadId: uploadRecord.id,
        passageCount: passageIds.length
      });

      return json({
        success: true,
        uploadId: uploadRecord.id,
        filename: file.name,
        passageIds,
        message: `Document processed successfully. Created ${passageIds.length} searchable passages.`
      });
    } catch (processingError) {
      logger.error('Document processing failed', processingError);
      
      // Update status to failed
      await supabase
        .from('document_uploads')
        .update({ 
          status: 'failed',
          error_message: processingError instanceof Error ? processingError.message : 'Processing failed'
        })
        .eq('id', uploadRecord.id);

      return json({
        error: `Document processing failed: ${processingError instanceof Error ? processingError.message : 'Unknown error'}`
      }, { status: 500 });
    }
  } catch (error) {
    logger.error('Document upload error', error);
    return json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}

// GET endpoint to check upload status
export async function loader({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const supabase = createSupabaseAdmin();
  
  const url = new URL(request.url);
  const uploadId = url.searchParams.get('uploadId');
  const workspaceId = url.searchParams.get('workspaceId');

  if (uploadId) {
    // Get specific upload status
    const { data, error } = await supabase
      .from('document_uploads')
      .select('*')
      .eq('id', uploadId)
      .single();

    if (error) {
      return json({ error: 'Upload not found' }, { status: 404 });
    }

    return json({ upload: data });
  } else if (workspaceId) {
    // Get all uploads for workspace
    const { data, error } = await supabase
      .from('document_uploads')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return json({ error: error.message }, { status: 500 });
    }

    return json({ uploads: data });
  }

  return json({ error: 'Missing required parameters' }, { status: 400 });
}