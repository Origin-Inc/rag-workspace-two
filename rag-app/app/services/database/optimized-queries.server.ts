import { db } from '~/utils/db.server';
import type { Prisma } from '@prisma/client';

/**
 * Optimized query service for high-performance database operations
 */

// Cache for frequently accessed data
const queryCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 60000; // 1 minute

/**
 * Get pages with optimized loading strategy
 */
export async function getOptimizedPages(
  projectId: string,
  options: {
    includeArchived?: boolean;
    includeContent?: boolean;
    limit?: number;
    offset?: number;
    parentId?: string | null;
  } = {}
) {
  const {
    includeArchived = false,
    includeContent = false,
    limit = 50,
    offset = 0,
    parentId = null
  } = options;

  const cacheKey = `pages:${projectId}:${JSON.stringify(options)}`;
  
  // Check cache
  const cached = queryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Build optimized query
  const where: Prisma.PageWhereInput = {
    projectId,
    ...(includeArchived ? {} : { isArchived: false }),
    ...(parentId !== undefined ? { parentId } : {})
  };

  const select: Prisma.PageSelect = {
    id: true,
    title: true,
    slug: true,
    icon: true,
    position: true,
    parentId: true,
    isPublic: true,
    isArchived: true,
    createdAt: true,
    updatedAt: true,
    metadata: true,
    ...(includeContent ? { content: true } : {})
  };

  const pages = await db.page.findMany({
    where,
    select,
    orderBy: [
      { position: 'asc' },
      { createdAt: 'desc' }
    ],
    take: limit,
    skip: offset
  });

  // Cache result
  queryCache.set(cacheKey, { data: pages, timestamp: Date.now() });

  return pages;
}

/**
 * Get page hierarchy with optimized recursive loading
 */
export async function getPageHierarchy(projectId: string) {
  // Use raw SQL for efficient recursive query
  const hierarchy = await db.$queryRaw`
    WITH RECURSIVE page_tree AS (
      -- Base case: root pages
      SELECT 
        id, title, slug, icon, position, parent_id, 
        is_public, is_archived, metadata,
        0 as depth,
        ARRAY[position] as path
      FROM pages
      WHERE project_id = ${projectId}::uuid
        AND parent_id IS NULL
        AND is_archived = false
      
      UNION ALL
      
      -- Recursive case: child pages
      SELECT 
        p.id, p.title, p.slug, p.icon, p.position, p.parent_id,
        p.is_public, p.is_archived, p.metadata,
        pt.depth + 1,
        pt.path || p.position
      FROM pages p
      INNER JOIN page_tree pt ON p.parent_id = pt.id
      WHERE p.is_archived = false
    )
    SELECT * FROM page_tree
    ORDER BY path;
  `;

  return hierarchy;
}

/**
 * Bulk update pages with optimized transaction
 */
export async function bulkUpdatePages(
  updates: Array<{
    id: string;
    data: Partial<{
      title: string;
      content: string;
      metadata: any;
      position: number;
    }>;
  }>
) {
  // Use transaction for consistency
  return await db.$transaction(async (tx) => {
    const promises = updates.map(({ id, data }) =>
      tx.page.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date()
        }
      })
    );

    return await Promise.all(promises);
  });
}

/**
 * Search pages with full-text search
 */
export async function searchPages(
  query: string,
  workspaceId: string,
  limit = 20
) {
  // Use PostgreSQL full-text search with GIN index
  const results = await db.$queryRaw`
    SELECT 
      p.id, p.title, p.slug, p.icon,
      pr.name as project_name,
      ts_rank(to_tsvector('english', p.title), plainto_tsquery('english', ${query})) as rank
    FROM pages p
    INNER JOIN projects pr ON p.project_id = pr.id
    WHERE pr.workspace_id = ${workspaceId}::uuid
      AND p.is_archived = false
      AND (
        to_tsvector('english', p.title) @@ plainto_tsquery('english', ${query})
        OR p.title ILIKE ${'%' + query + '%'}
      )
    ORDER BY rank DESC, p.updated_at DESC
    LIMIT ${limit};
  `;

  return results;
}

/**
 * Get page with blocks (for block editor)
 */
export async function getPageWithBlocks(pageId: string) {
  const page = await db.page.findUnique({
    where: { id: pageId },
    select: {
      id: true,
      title: true,
      slug: true,
      content: true,
      metadata: true,
      icon: true,
      coverImage: true,
      isPublic: true,
      project: {
        select: {
          id: true,
          name: true,
          workspace: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });

  if (!page) return null;

  // Parse blocks from metadata if stored there
  const blocks = page.metadata && typeof page.metadata === 'object' 
    ? (page.metadata as any).blocks || []
    : [];

  return {
    ...page,
    blocks
  };
}

/**
 * Save page blocks efficiently
 */
export async function savePageBlocks(
  pageId: string,
  blocks: any[],
  content?: string
) {
  // Update page with blocks in metadata
  return await db.page.update({
    where: { id: pageId },
    data: {
      content,
      metadata: {
        blocks,
        blockCount: blocks.length,
        lastBlockUpdate: new Date().toISOString()
      },
      updatedAt: new Date()
    }
  });
}

/**
 * Get workspace statistics with optimized aggregation
 */
export async function getWorkspaceStats(workspaceId: string) {
  const [
    pageCount,
    projectCount,
    userCount,
    recentActivity
  ] = await Promise.all([
    // Page count
    db.page.count({
      where: {
        project: {
          workspaceId
        },
        isArchived: false
      }
    }),
    
    // Project count
    db.project.count({
      where: {
        workspaceId,
        isArchived: false
      }
    }),
    
    // User count
    db.userWorkspace.count({
      where: { workspaceId }
    }),
    
    // Recent activity (last 7 days)
    db.page.findMany({
      where: {
        project: {
          workspaceId
        },
        updatedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      },
      select: {
        id: true,
        title: true,
        updatedAt: true
      },
      orderBy: {
        updatedAt: 'desc'
      },
      take: 10
    })
  ]);

  return {
    pageCount,
    projectCount,
    userCount,
    recentActivity
  };
}

/**
 * Clear query cache
 */
export function clearQueryCache(pattern?: string) {
  if (pattern) {
    for (const key of queryCache.keys()) {
      if (key.includes(pattern)) {
        queryCache.delete(key);
      }
    }
  } else {
    queryCache.clear();
  }
}

/**
 * Monitor query performance
 */
export async function monitorQueryPerformance<T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const startTime = performance.now();
  
  try {
    const result = await queryFn();
    const duration = performance.now() - startTime;
    
    // Log slow queries
    if (duration > 100) {
      console.warn(`Slow query detected: ${queryName} took ${duration.toFixed(2)}ms`);
    }
    
    // Track metrics (could send to monitoring service)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Send to monitoring service
      console.log(`Query metric: ${queryName} - ${duration.toFixed(2)}ms`);
    }
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`Query error: ${queryName} failed after ${duration.toFixed(2)}ms`, error);
    throw error;
  }
}