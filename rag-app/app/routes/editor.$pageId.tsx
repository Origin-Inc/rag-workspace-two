import { json, LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher, Link, NavLink, useLocation } from "@remix-run/react";
import { EnhancedBlockEditor } from "~/components/editor/EnhancedBlockEditor";
import { ClientOnly } from "~/components/ClientOnly";
// Fixed version with stable empty array references
import { ChatSidebar } from "~/components/chat/ChatSidebar";
import { useLayoutStore, LAYOUT_CONSTANTS } from "~/stores/layout-store";
import { ResizeHandle } from "~/components/ui/ResizeHandle";
import { cn } from "~/utils/cn";
import { prisma } from "~/utils/db.server";
import { requireUser, getUser } from "~/services/auth/auth.server";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Block } from "~/components/editor/EnhancedBlockEditor";
import { debounce } from "~/utils/performance";
import { Prisma } from "@prisma/client";
import { indexingCoordinator } from "~/services/rag/indexing-coordinator.service";
import { asyncEmbeddingService } from "~/services/rag/async-embedding.service";
import { ultraLightIndexingService } from "~/services/rag/ultra-light-indexing.service";
// Legacy AI services - disabled for data analytics pivot
// import { blockManipulationIntegration } from "~/services/ai/block-manipulation-integration.server";
import { pageHierarchyService } from "~/services/page-hierarchy.server";
// import { AIBlockService } from "~/services/ai-block-service.server";
import { PageTreeNavigation } from "~/components/navigation/PageTreeNavigation";
import type { PageTreeNode } from "~/components/navigation/PageTreeNavigation";
import { UserMenu } from "~/components/navigation/UserMenu";
import { ThemeToggle } from "~/components/theme/ThemeToggle";
import { CommandPalette } from "~/components/navigation/CommandPalette";
import { EmbeddingStatusIndicator } from "~/components/EmbeddingStatusIndicator";
import { 
  HomeIcon, 
  DocumentIcon, 
  Cog6ToothIcon,
  MagnifyingGlassIcon,
  BellIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@heroicons/react/24/outline";

export async function loader({ params, request }: LoaderFunctionArgs) {
  const { pageId } = params;
  if (!pageId) throw new Response("Page ID required", { status: 400 });

  // Get authenticated user
  const user = await getUser(request);
  
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

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

  // Get user's workspaces for workspace switcher
  let userWorkspaces: Array<{
    id: string;
    userId: string;
    workspaceId: string;
    roleId: string;
    workspace: {
      id: string;
      name: string;
      slug: string;
      description: string | null;
    };
    role: {
      id: string;
      name: string;
    };
  }> = [];
  
  try {
    userWorkspaces = await prisma.userWorkspace.findMany({
      where: { userId: user.id },
      include: {
        workspace: true,
        role: true,
      },
      orderBy: {
        workspace: {
          name: 'asc'
        }
      }
    });
  } catch (error) {
    console.error('Error fetching workspaces:', error);
  }

  // Get current workspace
  const currentWorkspaceId = page.workspaceId;
  const currentWorkspace = userWorkspaces.find(uw => uw?.workspace.id === currentWorkspaceId)?.workspace || page.workspace;

  // Get page tree for current workspace
  let pageTree: PageTreeNode[] = [];
  if (currentWorkspace) {
    try {
      pageTree = await pageHierarchyService.getPageTree(currentWorkspace.id, 5);
    } catch {
      console.error('Error fetching page tree');
    }
  }

  // Extract blocks or convert content to blocks
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
      } catch {
        console.error('Failed to parse blocks JSON');
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
        } catch {
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
    user,
    page,
    workspace: page.workspace,
    workspaces: userWorkspaces,
    currentWorkspace,
    pageTree,
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
      } catch {
        return json({ error: "Invalid blocks data" }, { status: 400 });
      }
    }

    // Fetch the page to get workspaceId
    const page = await prisma.page.findUnique({
      where: { id: pageId },
      include: {
        workspace: true
      }
    });

    if (!page) {
      return json({ error: "Page not found" }, { status: 404 });
    }

    try {
      // Legacy AI command processing - disabled for data analytics pivot
      console.log('[AI Command Action] Legacy AI commands disabled');
      return json({ 
        success: false, 
        message: 'AI commands temporarily disabled during data analytics migration' 
      });
      
      /* Disabled legacy code
      const result = await blockManipulationIntegration.processNaturalLanguageCommand(
        command,
        {
          blocks,
          selectedBlockId: selectedBlockId || undefined,
          pageId,
          userId: user.id,
          workspaceId: page.workspaceId
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
          blocks: serializedBlocks,
          updatedAt: new Date()
        }
      });

      // Clear AI block cache after AI command updates
      // const aiBlockService = AIBlockService.getInstance();
      // aiBlockService.clearCacheForPage(page.workspaceId, pageId);
      */

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
      } catch {
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
          const cleanBlock: Block = {
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
        // Use blocks directly
        const blocksData = serializedBlocks;
        
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
      
      // Legacy AI block cache clearing - disabled for data analytics pivot
      // const aiBlockService = AIBlockService.getInstance();
      // const cacheKeysCleared = aiBlockService.clearCacheForPage(page.workspaceId, pageId);
      // console.log('[Cache Clear] AI block cache cleared for page:', pageId, 'Keys cleared:', cacheKeysCleared);
      
      // Extract text content for logging
      let textContent = '';
      if (blocks && Array.isArray(blocks)) {
        textContent = blocks.map((b: Block) => {
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
            const result = await indexingCoordinator.indexPage(pageId, {
              immediate: true,
              source: 'user-save'
            });
            
            console.log('[Indexing]', result.success ? 'Success' : 'Failed', 'on attempt', i + 1, result.message);
            
            if (result.metrics) {
              console.log('[Indexing] Metrics:', result.metrics);
            }
            
            if (result.success) return;
            
            // If it was queued, that's also a success
            if (result.message.includes('queued') || result.message.includes('Queued')) {
              console.log('[Indexing] Successfully queued for async processing');
              return;
            }
            
          } catch (error) {
            console.error(`[Indexing] Attempt ${i + 1} failed:`, error);
            if (i < retries - 1) {
              // Wait before retrying with exponential backoff
              await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 1000));
            }
          }
        }
        // Coordinator already handles fallbacks internally
        console.error('[Indexing] All retries failed');
      };
      
      indexWithRetry().catch(error => {
        console.error('[Indexing] Retry mechanism failed:', error);
      });
      
    } catch (error) {
      // Log error for monitoring
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorCode = (error as { code?: string })?.code;
      
      console.error('[Save Error]', {
        pageId,
        error: errorMessage,
        code: errorCode,
        blocks: serializedBlocks ? 'with blocks' : 'without blocks'
      });
      
      // Handle database connection errors specifically
      if (errorCode === 'P1001' || errorMessage?.includes('database') || errorMessage?.includes('connection')) {
        console.error('[Database Connection Lost] Attempting to reconnect...');
        
        try {
          // Try to reconnect to database
          await prisma.$disconnect();
          await prisma.$connect();
          
          // Retry the save operation
          const contentData: Prisma.JsonValue = content || '';
          const blocksData = serializedBlocks || Prisma.JsonNull;
          
          await prisma.page.update({
            where: { id: pageId },
            data: {
              content: contentData,
              blocks: blocksData,
              updatedAt: new Date(),
            }
          });
          
          console.log('[Database Reconnected] Save successful after reconnection');
          
          // Legacy AI block cache clearing - disabled for data analytics pivot
          // const aiBlockService = AIBlockService.getInstance();
          // aiBlockService.clearCacheForPage(page.workspaceId, pageId);
          
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
        errorMessage?.includes('trailing characters') ||
        errorMessage?.includes('JSON') || 
        errorCode === 'P2023' ||
        errorCode === 'P2021'
      )) {
        try {
          await prisma.page.update({
            where: { id: pageId },
            data: {
              content,
              blocks: Prisma.JsonNull, // Clear blocks field if there's an issue
              updatedAt: new Date(),
            }
          });
          
          // Queue for indexing after partial save using async service
          // Get page workspace first
          const pageData = await prisma.page.findUnique({
            where: { id: pageId },
            select: { workspaceId: true }
          });
          if (pageData) {
            asyncEmbeddingService.queueEmbedding(pageId, pageData.workspaceId).catch(error => {
              console.error('[Auto-Index] Failed after partial save:', error);
            });
          }
          
          return json({ 
            success: true, 
            partial: true,
            message: 'Content saved (blocks excluded due to format issue)' 
          });
        } catch (fallbackError) {
          // Final fallback failed
          const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : 'Unknown error';
          return json({ 
            error: 'Unable to save changes', 
            details: fallbackErrorMessage 
          }, { status: 500 });
        }
      }
      
      // Unknown error
      return json({ 
        error: 'Save failed', 
        details: errorMessage 
      }, { status: 500 });
    }

    // PRODUCTION: Content indexing is handled by database triggers and the real-time indexing worker
    // The database trigger will automatically queue indexing when page content changes
    console.log('[Save Success] Page saved, indexing will be handled by background worker');

    return json({ success: true });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  current?: boolean;
}

// Type for fetcher responses
type FetcherData = {
  success?: boolean;
  blocks?: Block[];
  error?: string;
  connectionLost?: boolean;
  partial?: boolean;
  message?: string;
  reconnected?: boolean;
}

export default function EditorPage() {
  const { user, page, workspace, workspaces, currentWorkspace, pageTree, blocks: initialBlocks, canEdit } = useLoaderData<typeof loader>();
  const location = useLocation();
  const fetcher = useFetcher<FetcherData>();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const maxRetries = 3;
  const retryTimeoutRef = useRef<NodeJS.Timeout>();

  // Main navigation items
  const navigation: NavigationItem[] = [
    { name: 'Home', href: '/app', icon: HomeIcon },
    { name: 'Search', href: '/app/search', icon: MagnifyingGlassIcon },
    { name: 'Settings', href: '/app/settings', icon: Cog6ToothIcon },
  ];

  // Close mobile sidebar when route changes
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-dropdown="workspace"]')) {
        setWorkspaceDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = useCallback(async (newBlocks: Block[], isRetry = false) => {
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
  }, [fetcher]);

  // Debounced save to prevent excessive saves and performance issues
  const debouncedSaveRef = useRef(
    debounce((blocks: Block[]) => {
      handleSave(blocks);
    }, 2000)
  );
  
  const debouncedSave = useCallback((blocks: Block[]) => {
    debouncedSaveRef.current(blocks);
  }, []);
  
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
    // Processing AI command
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
      // Finished processing
      
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
  }, [fetcher.state, fetcher.data, blocks, retryCount, handleSave, maxRetries]);
  
  // Cleanup retry timeout on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Get layout state
  const { 
    isChatSidebarOpen, 
    chatSidebarWidth,
    isMenuCollapsed,
    setMenuCollapsed,
    menuSidebarWidth,
    setMenuSidebarWidth
  } = useLayoutStore();

  return (
    <div className="h-full flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar with resize and collapse */}
      <aside 
        className={cn(
          "relative bg-white dark:bg-[rgba(33,33,33,1)] border-r border-gray-200 dark:border-[rgba(33, 33, 33, 1)] transition-all duration-300 ease-in-out",
          "flex flex-col h-full",
          // Mobile behavior
          sidebarOpen ? "fixed inset-y-0 left-0 z-50 translate-x-0" : "fixed inset-y-0 left-0 z-50 -translate-x-full",
          // Desktop behavior
          "lg:relative lg:translate-x-0"
        )}
        style={{ 
          width: sidebarOpen && !isMenuCollapsed ? '256px' : // Mobile always full width
                 isMenuCollapsed ? `${LAYOUT_CONSTANTS.COLLAPSED_MENU_WIDTH}px` : 
                 `${menuSidebarWidth}px` 
        }}
        aria-label="Main navigation"
      >
        {/* Resize handle for desktop */}
        {!isMenuCollapsed && (
          <ResizeHandle
            orientation="vertical"
            onResize={(delta) => setMenuSidebarWidth(menuSidebarWidth + delta)}
            className="absolute right-0 top-0 h-full translate-x-1/2 z-10 hidden lg:block"
          />
        )}
        {/* Collapse/Expand Button for Desktop */}
        <button
          onClick={() => setMenuCollapsed(!isMenuCollapsed)}
          className="absolute -right-3 top-1/2 -translate-y-1/2 hidden lg:flex w-6 h-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-700 z-20 transition-colors"
          aria-label={isMenuCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isMenuCollapsed ? (
            <ChevronRightIcon className="w-3 h-3" />
          ) : (
            <ChevronLeftIcon className="w-3 h-3" />
          )}
        </button>

        {/* Workspace Icon - Always at top */}
        <div className={cn(
          "flex-shrink-0",
          isMenuCollapsed ? "p-2" : "p-2"
        )}>
          <div className="relative" data-dropdown="workspace">
            <button
              onClick={() => isMenuCollapsed ? null : setWorkspaceDropdownOpen(!workspaceDropdownOpen)}
              className={cn(
                "w-full flex items-center rounded-lg transition-colors",
                isMenuCollapsed 
                  ? "justify-center p-2 hover:bg-gray-100 dark:hover:bg-gray-800" 
                  : "justify-between px-3 py-0.7 text-sm font-medium text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              )}
              aria-label="Switch workspace"
              aria-expanded={workspaceDropdownOpen}
              aria-haspopup="true"
              title={isMenuCollapsed ? currentWorkspace?.name || 'Workspace' : undefined}
            >
              <div className={cn(
                "flex items-center",
                isMenuCollapsed && "justify-center"
              )}>
                <div className={cn(
                  "flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-semibold",
                  isMenuCollapsed ? "w-9 h-9" : "w-8 h-8"
                )}>
                  {currentWorkspace?.name.charAt(0).toUpperCase() || 'W'}
                </div>
                {!isMenuCollapsed && (
                  <span className="ml-3 truncate">{currentWorkspace?.name || 'Workspace'}</span>
                )}
              </div>
              {!isMenuCollapsed && (
                <ChevronDownIcon className="ml-2 h-4 w-4 text-gray-500 flex-shrink-0" />
              )}
            </button>

            {/* Workspace Dropdown */}
            {workspaceDropdownOpen && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 dark:bg-[rgba(33,33,33,1)]">
                <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Workspaces
                </div>
                {workspaces.map((uw) => uw && (
                  <Link
                    key={uw.workspace.id}
                    to={`/app/workspace/${uw.workspace.slug}`}
                    className={`
                      flex items-center px-3 py-2 text-sm dark:bg-[rgba(33,33,33,1)] dark:hover:bg-gray-50
                      ${uw.workspace.id === currentWorkspace?.id ? 'bg-blue-50 text-blue-700 dark:text-white' : 'text-gray-700'}
                    `}
                  >
                    <div className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-gray-400 to-gray-500 rounded flex items-center justify-center text-white text-xs font-semibold">
                      {uw.workspace.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="ml-3 truncate">{uw.workspace.name}</span>
                    <span className="ml-auto text-xs text-gray-500">{uw.role.name}</span>
                  </Link>
                ))}
                <div className="border-t border-gray-200 mt-1 pt-1">
                  <Link
                    to="/app/workspace/new"
                    className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <PlusIcon className="h-4 w-4 mr-3 text-gray-400" />
                    Create workspace
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Navigation - Icons only when collapsed */}
        <nav className={cn(
          "flex-1 overflow-y-auto space-y-1",
          isMenuCollapsed ? "px-2 py-2" : "p-4"
        )} aria-label="Primary navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            
            // Special handling for Search - opens command palette instead of navigating
            if (item.name === 'Search') {
              return (
                <button
                  key={item.name}
                  onClick={() => setCommandPaletteOpen(true)}
                  className={cn(
                    "w-full flex items-center text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700",
                    isMenuCollapsed ? "justify-center p-2" : "px-3 py-2"
                  )}
                  title={isMenuCollapsed ? item.name : undefined}
                >
                  <Icon className={cn(
                    "h-5 w-5 flex-shrink-0",
                    !isMenuCollapsed && "mr-3"
                  )} />
                  {!isMenuCollapsed && item.name}
                </button>
              );
            }
            
            return (
              <NavLink
                key={item.name}
                to={item.href}
                className={({ isActive }) => cn(
                  "flex items-center text-sm font-medium rounded-lg transition-colors",
                  isActive 
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700",
                  isMenuCollapsed ? "justify-center p-2" : "px-3 py-2"
                )}
                title={isMenuCollapsed ? item.name : undefined}
              >
                <Icon className={cn(
                  "h-5 w-5 flex-shrink-0",
                  !isMenuCollapsed && "mr-3"
                )} />
                {!isMenuCollapsed && item.name}
              </NavLink>
            );
          })}

          {/* Pages Section - ONLY show when expanded */}
          {!isMenuCollapsed && (
            <div className="pt-4">
              <div className="flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                <div className="flex items-center">
                  <DocumentIcon className="h-5 w-5 mr-3" />
                  <span>Pages</span>
                </div>
                <Link
                  to="/app/pages/new"
                  className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                  aria-label="Create new page"
                >
                  <PlusIcon className="h-4 w-4" />
                </Link>
              </div>
              
              {/* Page Tree Navigation */}
              <div className="mt-1">
                <PageTreeNavigation
                  workspaceSlug={currentWorkspace?.slug || ''}
                  pages={pageTree as PageTreeNode[]}
                  currentPageId={page.id}
                  onCreatePage={(parentId) => {
                    // Navigate to create page route
                    window.location.href = `/app/pages/new${parentId ? `?parentId=${parentId}` : ''}`;
                  }}
                  onMovePage={async (pageId, newParentId) => {
                    // Call API to move page
                    const formData = new FormData();
                    if (newParentId) formData.append('parentId', newParentId);
                    
                    const response = await fetch(`/api/pages/${pageId}`, {
                      method: 'PATCH',
                      body: formData
                    });
                    
                    if (response.ok) {
                      window.location.reload();
                    } else {
                      console.error('Failed to move page');
                    }
                  }}
                  onDeletePage={async (pageId) => {
                    // Call API to delete page
                    const response = await fetch(`/api/pages/${pageId}`, {
                      method: 'DELETE'
                    });
                    
                    if (response.ok) {
                      window.location.reload();
                    } else {
                      console.error('Failed to delete page');
                    }
                  }}
                />
              </div>
            </div>
          )}
        </nav>

        {/* User Profile at Bottom */}
        <div className={cn(
          "flex-shrink-0 border-t border-gray-200 dark:border-gray-700",
          isMenuCollapsed ? "p-2" : "p-4"
        )}>
          {isMenuCollapsed ? (
            // Collapsed: Just show user avatar centered
            <div className="flex justify-center">
              <button
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={user.name || user.email}
                onClick={() => setMenuCollapsed(false)}
              >
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                  {(user.name || user.email || '?').charAt(0).toUpperCase()}
                </div>
              </button>
            </div>
          ) : (
            // Expanded: Show full UserMenu
            <UserMenu user={user} currentWorkspace={currentWorkspace ? { id: currentWorkspace.id, name: currentWorkspace.name } : undefined} />
          )}
        </div>
      </aside>

      {/* Main Content Area - adjust width based on chat sidebar */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 transition-all duration-300"
      )}
      style={{
        marginRight: isChatSidebarOpen ? `${chatSidebarWidth}px` : '0'
      }}>
        {/* Top Header with mobile menu button */}
        <header className="flex-shrink-0 bg-white dark:bg-[rgba(33,33,33,1)] dark:border-[rgba(33, 33, 33, 1)]">
          <div className="flex items-center justify-between h-12 px-4 lg:px-6">
            {/* Mobile menu button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label={sidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={sidebarOpen}
            >
              {sidebarOpen ? (
                <XMarkIcon className="h-6 w-6" />
              ) : (
                <Bars3Icon className="h-6 w-6" />
              )}
            </button>

            {/* Spacer */}
            <div className="flex-1"></div>

            {/* Right side buttons */}
            <div className="flex items-center space-x-3">
              <ThemeToggle />
              <button className="p-2 text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg">
                <BellIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Page header */}
        <div className="bg-white dark:bg-[rgba(33,33,33,1)] shadow-sm border-b border-gray-200 dark:border-gray-700 px-6 py-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-gray-900">
                {page.title || "Untitled Page"}
              </h1>
              <EmbeddingStatusIndicator 
                pageId={page.id}
                showDetails={true}
                onRetry={() => {
                  const formData = new FormData();
                  formData.append('pageId', page.id);
                  formData.append('workspaceId', page.workspaceId);
                  fetch('/api/embeddings/reindex', {
                    method: 'POST',
                    body: formData
                  });
                }}
              />
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
              {page.isPublic && (
                <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                  Public
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden bg-white dark:bg-[rgba(33,33,33,1)]">
          <ClientOnly fallback={<div className="h-full bg-white dark:bg-[rgba(33,33,33,1)] animate-pulse" />}>
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
      
      {/* Chat Sidebar - Fixed with stable empty array references */}
      <ClientOnly fallback={null}>
        <ChatSidebar 
          pageId={page.id}
          workspaceId={page.workspaceId}
        />
      </ClientOnly>
      
      {/* Command Palette - rendered as modal */}
      <ClientOnly fallback={null}>
        <CommandPalette 
          open={commandPaletteOpen} 
          onClose={() => setCommandPaletteOpen(false)} 
        />
      </ClientOnly>
    </div>
  );
}