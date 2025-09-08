import { json, type ActionFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { embeddingGenerationService } from '~/services/embedding-generation.server';
import { prisma } from '~/utils/db.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('API:IndexPage');

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  
  const formData = await request.formData();
  const pageId = formData.get('pageId') as string;
  
  if (!pageId) {
    return json({ error: 'Page ID required' }, { status: 400 });
  }
  
  logger.info('🚀 Starting page indexing', { pageId });
  
  try {
    // Get the page
    const page = await prisma.page.findUnique({
      where: { id: pageId }
    });
    
    if (!page) {
      return json({ error: 'Page not found' }, { status: 404 });
    }
    
    logger.info('📄 Found page', { 
      title: page.title, 
      workspaceId: page.workspaceId 
    });
    
    // Extract text from content
    const content = page.content as any;
    let textContent = '';
    
    // Handle different content formats
    if (typeof content === 'string') {
      textContent = content;
    } else if (content?.blocks && Array.isArray(content.blocks)) {
      for (const block of content.blocks) {
        if (block.type === 'paragraph' || block.type === 'text') {
          if (typeof block.content === 'string') {
            textContent += block.content + '\n';
          } else if (block.content?.text) {
            textContent += block.content.text + '\n';
          }
        }
      }
    }
    
    if (!textContent.trim()) {
      logger.warn('⚠️ No text content found');
      return json({ 
        success: true, 
        message: 'No text content to index' 
      });
    }
    
    logger.info('📊 Extracted text', { 
      length: textContent.length,
      preview: textContent.substring(0, 100)
    });
    
    // Delete existing embeddings for this page
    await prisma.$executeRaw`
      DELETE FROM page_embeddings 
      WHERE page_id = ${pageId}::uuid
    `;
    
    // Generate new embedding
    logger.info('🔄 Generating embedding...');
    const { embedding } = await embeddingGenerationService.generateEmbedding(textContent);
    
    // Store in page_embeddings
    await prisma.$executeRaw`
      INSERT INTO page_embeddings (
        page_id,
        workspace_id,
        chunk_text,
        chunk_index,
        embedding,
        metadata
      ) VALUES (
        ${page.id}::uuid,
        ${page.workspaceId}::uuid,
        ${textContent},
        0,
        ${`[${embedding.join(',')}]`}::extensions.vector,
        ${JSON.stringify({ 
          title: page.title,
          projectId: page.projectId,
          slug: page.slug,
          indexedAt: new Date().toISOString()
        })}::jsonb
      )
    `;
    
    logger.info('✅ Page indexed successfully');
    
    return json({
      success: true,
      message: 'Page indexed successfully',
      stats: {
        textLength: textContent.length,
        embeddingDimensions: embedding.length
      }
    });
    
  } catch (error) {
    logger.error('❌ Failed to index page', error);
    return json(
      { error: error instanceof Error ? error.message : 'Failed to index page' },
      { status: 500 }
    );
  }
}