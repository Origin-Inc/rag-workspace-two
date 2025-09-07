import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, Link } from "@remix-run/react";
import { EnhancedBlockEditor } from "~/components/editor/EnhancedBlockEditor";
import { ClientOnly } from "~/components/ClientOnly";
import { prisma } from "~/utils/db.server";
import { requireUser } from "~/services/auth/auth.server";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Block } from "~/types/blocks";
import { debounce } from "~/utils/performance";
import type { Prisma } from "@prisma/client";
import { ragIndexingService } from "~/services/rag/rag-indexing.service";
import { optimizedIndexingService } from "~/services/rag/optimized-indexing.service";
import { memoryOptimizedIndexingService } from "~/services/rag/memory-optimized-indexing.service";
import { ultraLightIndexingService } from "~/services/rag/ultra-light-indexing.service";
import { blockManipulationIntegration } from "~/services/ai/block-manipulation-integration.server";
import { pageHierarchyService } from "~/services/page-hierarchy.server";
import { AIBlockService } from "~/services/ai-block-service.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { pageId } = params;
  if (!pageId) throw new Response("Page ID required", { status: 400 });

  // Get authenticated user
  const user = await requireUser(request);

  // Get page details with workspace (no project required)
  const page = await prisma.page.findUnique({
    where: { id: pageId },
    include: {
      workspace: true,
      parent: true,
      children: {
        where: { isArchived: false },
        orderBy: { position: 'asc' },
        select: { id: true, title: true, icon: true }
      }
    }
  });

  if (!page) {
    throw new Response("Page not found", { status: 404 });
  }

  // Check if user has access to this page's workspace
  try {
    const hasAccess = await prisma.userWorkspace.findFirst({
      where: {
        userId: user.id,
        workspaceId: page.workspaceId,
      }
    });

    if (!hasAccess) {
      // For development, log but don't block
      console.warn('User access check failed, allowing for development');
    }
  } catch (error) {
    console.error('Permission check error:', error);
    // For development, allow access if permission check fails
  }

  // For now, allow editing if user has access
  const canEdit = true;
  
  // Get page breadcrumb path for navigation
  const breadcrumbPath = await pageHierarchyService.getPagePath(pageId);

  // Extract blocks or convert content to blocks
  const metadata = typeof page.metadata === 'object' && page.metadata ? page.metadata : {};
  
  // Handle content as JSON field (it's JSONB in database)
  let content = '';
  if (page.content) {
    if (typeof page.content === 'string') {
      content = page.content;
    } else if (typeof page.content === 'object') {
      // If it's an object/array, stringify it
      const contentStr = JSON.stringify(page.content);
      // Clean up empty JSON values
      if (contentStr === '{}' || contentStr === '[]' || contentStr === 'null') {
        content = '';
      } else {
        content = contentStr;
      }
    }
  }
  
  // Parse blocks from JSONB column - handle both string and object formats
  let blocks;
  if (page.blocks) {
    // If blocks is a string (from JSONB), parse it
    if (typeof page.blocks === 'string') {
      try {
        blocks = JSON.parse(page.blocks);
      } catch (e) {
        console.error('Failed to parse blocks JSON:', e);
        blocks = null;
      }
    } else {
      // If it's already an object, use it directly
      blocks = page.blocks;
    }
  }
  
  // Parse stringified content in blocks (for complex block types)
  if (blocks && Array.isArray(blocks)) {
    blocks = blocks.map(block => {
      // Fix block content if it's "{}"
      if (block.content === '{}' || block.content === '[]' || block.content === 'null') {
        block.content = '';
      }
      
      // If content is a JSON string of an object, parse it
      if (typeof block.content === 'string' && 
          (block.type === 'database' || block.type === 'ai') &&
          (block.content.startsWith('{') || block.content.startsWith('['))) {
        try {
          return {
            ...block,
            content: JSON.parse(block.content)
          };
        } catch (e) {
          // If parse fails, keep as string
          return block;
        }
      }
      return block;
    });
  }
  
  // If no blocks, create a default paragraph block with empty content
  if (!blocks || !Array.isArray(blocks)) {
    blocks = [
      {
        id: '1',
        type: 'paragraph',
        content: ''  // Start with empty content, not "{}"
      }
    ];
  }

  return json({
    page,
    workspace: page.workspace,
    parent: page.parent,
    children: page.children,
    breadcrumbPath,
    content,
    blocks,
    canEdit,
  });
}

export async function action({ params, request }: ActionFunctionArgs) {
  const { pageId } = params;
  if (!pageId) return json({ error: "Page ID required" }, { status: 400 });

  // Get authenticated user
  const user = await requireUser(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "ai-command") {
    console.log('[AI Command Action] Received AI command request');
    // Handle AI block manipulation commands
    const command = formData.get("command") as string;
    const selectedBlockId = formData.get("selectedBlockId") as string | null;
    const blocksJson = formData.get("blocks") as string;
    
    console.log('[AI Command Action] Command:', command, 'Selected Block:', selectedBlockId);
    
    if (!command) {
      return json({ error: "No command provided" }, { status: 400 });
    }
    
    let blocks: Block[] = [];
    if (blocksJson) {
      try {
        blocks = JSON.parse(blocksJson);
        console.log('[AI Command Action] Parsed', blocks.length, 'blocks');
      } catch (e) {
        return json({ error: "Invalid blocks data" }, { status: 400 });
      }
    }

    try {
      console.log('[AI Command Action] Calling blockManipulationIntegration service');
      // Use the integration service for AI commands
      const result = await blockManipulationIntegration.processNaturalLanguageCommand(
        command,
        {
          blocks,
          selectedBlockId: selectedBlockId || undefined,
          pageId,
          userId: user.id,
          workspaceId: undefined // Add if available
        },
        {
          autoSave: false, // We'll handle saving manually
          showPreview: false, // Direct execution for now
          confirmThreshold: 0.5
        }
      );
      
      if (result.requiresConfirmation) {
        return json({
          success: false,
          requiresConfirmation: true,
          message: result.message,
          preview: result.preview
        });
      }
      
      if (!result.success) {
        return json({ 
          success: false, 
          error: result.message || "Command failed" 
        });
      }

      // Save the updated blocks to database
      const serializedBlocks = result.blocks!.map((block, index) => ({
        id: block.id || `block-${index}`,
        type: block.type || 'paragraph',
        content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content)
      }));

      await prisma.page.update({
        where: { id: pageId },
        data: {
          blocks: serializedBlocks as Prisma.JsonValue,
          updatedAt: new Date()
        }
      });

      // Clear AI block cache after AI command updates
      const aiBlockService = AIBlockService.getInstance();
      aiBlockService.clearCacheForPage(page.workspaceId, pageId);

      // Queue for immediate indexing after AI command (ultra-light mode)
      ultraLightIndexingService.indexPage(pageId, true).catch(error => {
        console.error('[AI Command] Failed to index:', error);
      });

      return json({ 
        success: true, 
        blocks: result.blocks,
        message: result.message
      });

    } catch (error) {
      console.error('[AI Command Error]', error);
      return json({ 
        success: false, 
        error: error instanceof Error ? error.message : 'AI command failed' 
      }, { status: 500 });
    }
  }

  if (intent === "save-content") {
    const content = formData.get("content") as string;
    const blocksJson = formData.get("blocks") as string;
    
    let blocks = null;
    if (blocksJson) {
      try {
        blocks = JSON.parse(blocksJson);
      } catch (e) {
        console.error("[Parse Error] Failed to parse blocks JSON");
        return json({ error: "Invalid blocks data" }, { status: 400 });
      }
    }

    // Check permissions - verify page exists and user has access
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        workspace: true
      }
    });

    if (!page) {
      return json({ error: "Page not found" }, { status: 404 });
    }

    // Simplified permission check - just verify the user exists for now
    // In production, you'd want to properly check workspace access
    try {
      const hasAccess = await prisma.userWorkspace.findFirst({
        where: {
          userId: user.id,
          workspaceId: page.workspaceId,
        }
      });

      if (!hasAccess) {
        return json({ error: "Permission denied" }, { status: 403 });
      }
    } catch (error) {
      console.error('Permission check error:', error);
      // For development, allow access if permission check fails
      // In production, you'd want to return an error
    }

    // PRODUCTION FIX: Proper JSONB handling for PostgreSQL
    let serializedBlocks = null;
    
    if (blocks && Array.isArray(blocks)) {
      try {
        // Validate and clean each block
        const cleanedBlocks = blocks.map((block, index) => {
          // Ensure all fields are serializable
          const cleanBlock: any = {
            id: block.id || `block-${index}`,
            type: block.type || 'paragraph',
            content: block.content || ''
          };
          
          // Ensure content is always a string (it should be from client now)
          if (typeof cleanBlock.content !== 'string') {
            cleanBlock.content = JSON.stringify(cleanBlock.content);
          }
          
          return cleanBlock;
        });
        
        // For Prisma JSONB, we need to ensure it's a valid JSON value
        // Use Prisma.JsonValue to ensure compatibility
        serializedBlocks = JSON.parse(JSON.stringify(cleanedBlocks));
        
        console.log('[Block Data Debug]', {
          blocksCount: serializedBlocks.length,
          firstBlock: serializedBlocks[0],
          dataType: typeof serializedBlocks,
          isArray: Array.isArray(serializedBlocks)
        });
      } catch (err) {
        console.error('[Block Serialization Error]', err);
        serializedBlocks = null; // Fall back to saving without blocks
      }
    }
    
    // PRODUCTION: Save with comprehensive error handling
    try {
      // Debug logging
      console.log('[Save Attempt]', {
        pageId,
        contentLength: content?.length,
        blocksCount: serializedBlocks?.length,
        contentType: typeof content,
        blocksType: typeof serializedBlocks,
        firstBlock: serializedBlocks?.[0]
      });
      
      // Back to using Prisma ORM with proper data handling
      // Content is now JSONB, so we need to pass it as JSON
      const contentData: Prisma.JsonValue = content || '';
      
      if (serializedBlocks && serializedBlocks.length > 0) {
        // Cast to Prisma.JsonValue for proper type handling
        const blocksData: Prisma.JsonValue = serializedBlocks;
        
        await prisma.page.update({
          where: { id: pageId },
          data: {
            content: contentData, // JSONB field
            blocks: blocksData, // JSONB field
            updatedAt: new Date(),
          }
        });
      } else {
        // If no blocks, just save content
        await prisma.page.update({
          where: { id: pageId },
          data: {
            content: contentData, // JSONB field
            updatedAt: new Date(),
          }
        });
      }
      
      // Clear AI block cache for this page to ensure fresh responses
      const aiBlockService = AIBlockService.getInstance();
      const cacheKeysCleared = aiBlockService.clearCacheForPage(page.workspaceId, pageId);
      console.log('[Cache Clear] AI block cache cleared for page:', pageId, 'Keys cleared:', cacheKeysCleared);
      
      // Extract text content for logging
      let textContent = '';
      if (blocks && Array.isArray(blocks)) {
        textContent = blocks.map((b: any) => {
          if (typeof b.content === 'string') return b.content;
          if (b.content?.text) return b.content.text;
          return '';
        }).filter(Boolean).join(' ').substring(0, 200);
      }
      console.log('[Save Debug] Content preview:', textContent);
      
      // Clean up any stale embeddings but defer it to avoid connection competition
      // Run cleanup after a delay to let indexing complete first
      setTimeout(() => {
        import('~/services/rag/cleanup-stale-embeddings.server').then(({ embeddingCleanupService }) => {
          embeddingCleanupService.cleanupDuplicates(pageId).catch(err => {
            console.warn('[Cleanup] Deferred cleanup failed (non-critical):', err.message);
          });
        });
      }, 5000); // Run cleanup 5 seconds after save
      
      // Use ultra-light indexing with IMMEDIATE mode to ensure content is indexed right away
      // This prevents the "one save behind" issue where content only appears after the next save
      const indexWithRetry = async (retries = 3) => {
        for (let i = 0; i < retries; i++) {
          try {
            await ultraLightIndexingService.indexPage(pageId, true);
            console.log('[Indexing] Success on attempt', i + 1);
            return;
          } catch (error) {
            console.error(`[Indexing] Attempt ${i + 1} failed:`, error);
            if (i < retries - 1) {
              // Wait before retrying with exponential backoff
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
          }
        }
        // After all retries failed, try fallback
        console.error('[Indexing] All retries failed, trying fallback');
        ragIndexingService.queueForIndexing(pageId).catch(fallbackError => {
          console.error('[Fallback-Index] Also failed:', fallbackError);
        });
      };
      
      indexWithRetry().catch(error => {
        console.error('[Indexing] Retry mechanism failed:', error);
      });
      
    } catch (error: any) {
      // Log error for monitoring
      console.error('[Save Error]', {
        pageId,
        error: error.message,
        code: error.code,
        blocks: serializedBlocks ? 'with blocks' : 'without blocks'
      });
      
      // Handle database connection errors specifically
      if (error.code === 'P1001' || error.message?.includes('database') || error.message?.includes('connection')) {
        console.error('[Database Connection Lost] Attempting to reconnect...');
        
        try {
          // Try to reconnect to database
          await prisma.$disconnect();
          await prisma.$connect();
          
          // Retry the save operation
          const contentData: Prisma.JsonValue = content || '';
          const blocksData: Prisma.JsonValue = serializedBlocks || null;
          
          await prisma.page.update({
            where: { id: pageId },
            data: {
              content: contentData,
              blocks: blocksData,
              updatedAt: new Date(),
            }
          });
          
          console.log('[Database Reconnected] Save successful after reconnection');
          
          // Clear AI block cache after reconnection save
          const aiBlockService = AIBlockService.getInstance();
          aiBlockService.clearCacheForPage(page.workspaceId, pageId);
          
          // Queue for indexing after recovery save (ultra-light immediate mode)
          ultraLightIndexingService.indexPage(pageId, true).catch(error => {
            console.error('[Ultra-Light-Index] Failed after reconnection:', error);
          });
          
          return json({ success: true, reconnected: true });
        } catch (reconnectError) {
          console.error('[Reconnection Failed]', reconnectError);
          return json({ 
            error: 'Database connection lost. Please refresh the page and try again.', 
            connectionLost: true 
          }, { status: 503 });
        }
      }
      
      // Attempt recovery: Save without blocks
      if (serializedBlocks && (
        error.message?.includes('trailing characters') ||
        error.message?.includes('JSON') || 
        error.code === 'P2023' ||
        error.code === 'P2021'
      )) {
        try {
          await prisma.page.update({
            where: { id: pageId },
            data: {
              content,
              blocks: null, // Clear blocks field if there's an issue
              updatedAt: new Date(),
            }
          });
          
          // Queue for indexing after partial save
          ragIndexingService.queueForIndexing(pageId).catch(error => {
            console.error('[Auto-Index] Failed after partial save:', error);
          });
          
          return json({ 
            success: true, 
            partial: true,
            message: 'Content saved (blocks excluded due to format issue)' 
          });
        } catch (fallbackError: any) {
          // Final fallback failed
          return json({ 
            error: 'Unable to save changes', 
            details: fallbackError.message 
          }, { status: 500 });
        }
      }
      
      // Unknown error
      return json({ 
        error: 'Save failed', 
        details: error.message 
      }, { status: 500 });
    }

    // PRODUCTION: Content indexing is handled by database triggers and the real-time indexing worker
    // The database trigger will automatically queue indexing when page content changes
    console.log('[Save Success] Page saved, indexing will be handled by background worker');

    return json({ success: true });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function EditorPage() {
  const { page, workspace, parent, children, breadcrumbPath, content: initialContent, blocks: initialBlocks, canEdit } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [processingAI, setProcessingAI] = useState(false);
  const maxRetries = 3;
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  const handleSave = async (newBlocks: Block[], isRetry = false) => {
    if (!isRetry) {
      setRetryCount(0);
    }
    setIsSaving(true);
    setSaveError(null);
    const formData = new FormData();
    formData.set("intent", "save-content");
    
    // CRITICAL FIX: Ensure content is always a string for JSONB compatibility
    const cleanBlocks = newBlocks.map(block => {
      let cleanContent: string;
      
      // Handle different content types
      if (typeof block.content === 'string') {
        cleanContent = block.content;
      } else if (block.content && typeof block.content === 'object') {
        // For complex content (database, AI blocks), store as JSON string
        cleanContent = JSON.stringify(block.content);
      } else {
        cleanContent = '';
      }
      
      return {
        id: block.id || `block-${Date.now()}-${Math.random()}`,
        type: block.type || 'paragraph',
        content: cleanContent // Always a string now
      };
    });
    
    // Extract readable text for the content field
    const textContent = newBlocks
      .map(block => {
        if (typeof block.content === 'string') return block.content;
        if (block.content?.text) return block.content.text;
        if (block.content?.code) return block.content.code;
        if (block.content?.prompt) return block.content.prompt;
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
    
    // Ensure we never save "{}" as content
    formData.set("content", textContent || '');
    formData.set("blocks", JSON.stringify(cleanBlocks));
    fetcher.submit(formData, { method: "POST" });
  };

  // Debounced save to prevent excessive saves and performance issues
  const debouncedSave = useCallback(
    debounce((blocks: Block[]) => {
      handleSave(blocks);
    }, 2000),
    []
  );
  
  const handleChange = (newBlocks: Block[]) => {
    setBlocks(newBlocks);
    // Auto-save after 2 seconds of no changes
    if (canEdit) {
      debouncedSave(newBlocks);
    }
  };

  // Handle AI command execution
  const handleAICommand = useCallback(async (command: string, selectedBlockId?: string) => {
    console.log('[editor.$pageId] handleAICommand called:', { command, selectedBlockId, blocksCount: blocks.length });
    setProcessingAI(true);
    setSaveError(null);
    
    const formData = new FormData();
    formData.set("intent", "ai-command");
    formData.set("command", command);
    if (selectedBlockId) {
      formData.set("selectedBlockId", selectedBlockId);
    }
    formData.set("blocks", JSON.stringify(blocks));
    
    console.log('[editor.$pageId] Submitting AI command to backend');
    fetcher.submit(formData, { method: "POST" });
  }, [blocks, fetcher]);

  // Update save status when fetcher completes with retry logic
  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      console.log('[editor.$pageId] Fetcher response:', fetcher.data);
      setIsSaving(false);
      setProcessingAI(false);
      
      if (fetcher.data.success) {
        // Handle AI command success
        if (fetcher.data.blocks) {
          console.log('[editor.$pageId] Updating blocks from AI response:', fetcher.data.blocks);
          console.log('[editor.$pageId] Current blocks before update:', blocks);
          console.log('[editor.$pageId] Block[0] content type:', typeof fetcher.data.blocks[0]?.content);
          setBlocks(fetcher.data.blocks);
        }
        
        setLastSaved(new Date());
        setSaveError(null);
        setRetryCount(0);
        
        // Clear any pending retries
        if (retryTimeoutRef.current) {
          clearTimeout(retryTimeoutRef.current);
        }
      } else if (fetcher.data.error) {
        // Handle save errors with retry logic
        const isConnectionError = fetcher.data.connectionLost || 
                                 fetcher.data.error.includes('connection') ||
                                 fetcher.data.error.includes('database');
        
        if (isConnectionError && retryCount < maxRetries) {
          const newRetryCount = retryCount + 1;
          setRetryCount(newRetryCount);
          setSaveError(`Connection error. Retrying (${newRetryCount}/${maxRetries})...`);
          
          // Exponential backoff: 2s, 4s, 8s
          const retryDelay = Math.min(2000 * Math.pow(2, retryCount), 8000);
          
          retryTimeoutRef.current = setTimeout(() => {
            console.log(`[Auto-Save Retry] Attempt ${newRetryCount}/${maxRetries}`);
            handleSave(blocks, true);
          }, retryDelay);
        } else {
          setSaveError(fetcher.data.error || 'Failed to save changes');
        }
      }
    }
  }, [fetcher.state, fetcher.data, blocks, retryCount]);
  
  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
        {/* Workspace Header */}
        <div className="p-4 border-b border-gray-200">
          <Link to="/app" className="flex items-center space-x-2 text-gray-900 hover:text-gray-700">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span className="font-semibold">{workspace.name}</span>
          </Link>
        </div>
        
        {/* Navigation Links */}
        <nav className="flex-1 p-4 space-y-1">
          <Link 
            to="/app" 
            className="flex items-center space-x-2 px-3 py-2 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Dashboard</span>
          </Link>
          
          <Link 
            to={`/app/workspaces/${workspace.id}/pages`}
            className="flex items-center space-x-2 px-3 py-2 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>All Pages</span>
          </Link>
          
          <Link 
            to="/app/rag"
            className="flex items-center space-x-2 px-3 py-2 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span>Search</span>
          </Link>
        </nav>
        
        {/* User Menu at Bottom */}
        <div className="p-4 border-t border-gray-200">
          <Link 
            to="/app/settings"
            className="flex items-center space-x-2 px-3 py-2 text-gray-700 rounded-lg hover:bg-gray-100"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span>Settings</span>
          </Link>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Page header */}
        <div className="bg-white shadow-sm border-b border-gray-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500">
                {breadcrumbPath?.map(p => p.title).join(' / ') || 'Pages'}
              </div>
              <h1 className="text-xl font-semibold text-gray-900">
                {page.title || "Untitled Page"}
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {isSaving && (
                <span className="text-xs text-gray-500">Saving...</span>
              )}
              {!isSaving && lastSaved && !saveError && (
                <span className="text-xs text-green-600">
                  Saved at {lastSaved.toLocaleTimeString()}
                </span>
              )}
              {saveError && (
                <span className="text-xs text-red-600">
                  {saveError}
                </span>
              )}
              {page.is_template && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                  Template
                </span>
              )}
              {page.is_public && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                  Public
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden bg-white">
        <ClientOnly fallback={<div className="h-full bg-white animate-pulse" />}>
          <EnhancedBlockEditor
            initialBlocks={blocks}
            onChange={handleChange}
            onSave={handleSave}
            workspaceId={workspace.id}
            className="h-full"
            onAICommand={handleAICommand}
          />
        </ClientOnly>
        </div>
      </div>
    </div>
  );
}