import type { LoaderFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { prisma } from '~/utils/db.server';
import { databaseBlockCache } from '~/services/database-block-cache.server';
import { databasePerformanceService } from '~/services/database-performance.server';
import type { DatabaseRow } from '~/types/database-block';

export const loader: LoaderFunction = async ({ params, request }) => {
  const startTime = Date.now();
  const { blockId } = params;
  
  if (!blockId) {
    return json({ error: 'Block ID is required' }, { status: 400 });
  }

  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(url.searchParams.get('pageSize') || '100', 10), 1000);
  const filters = url.searchParams.get('filters') ? JSON.parse(url.searchParams.get('filters')!) : undefined;
  const sorts = url.searchParams.get('sorts') ? JSON.parse(url.searchParams.get('sorts')!) : undefined;
  const searchQuery = url.searchParams.get('searchQuery') || undefined;

  try {
    // Try to get from cache first
    const cached = await databaseBlockCache.getRows(
      blockId,
      page,
      pageSize,
      filters,
      sorts,
      searchQuery
    );

    if (cached) {
      // Track cache hit performance
      await databasePerformanceService.trackQuery(
        blockId,
        `GET_ROWS_CACHED`,
        Date.now() - startTime,
        cached.rows.length,
        true
      );

      return json({
        data: cached.rows,
        total: cached.total,
        page,
        pageSize,
        hasMore: page * pageSize < cached.total,
        cached: true,
        responseTime: Date.now() - startTime
      });
    }

    // Cache miss - fetch from database with optimized query
    const offset = (page - 1) * pageSize;

    // Build where clause
    const where: any = {
      blockId,
      deletedAt: null
    };

    // Apply search if provided
    if (searchQuery) {
      where.OR = [
        { cells: { path: '$', string_contains: searchQuery } }
      ];
    }

    // Execute optimized queries in parallel
    const [rows, total] = await Promise.all([
      prisma.databaseRow.findMany({
        where,
        skip: offset,
        take: pageSize,
        orderBy: sorts?.length ? 
          sorts.map((sort: any) => ({ [sort.columnId]: sort.direction })) : 
          { position: 'asc' },
        select: {
          id: true,
          blockId: true,
          cells: true,
          position: true,
          createdAt: true,
          updatedAt: true
        }
      }),
      prisma.databaseRow.count({ where })
    ]);

    // Transform to match type
    const transformedRows: DatabaseRow[] = rows.map(row => ({
      id: row.id,
      blockId: row.blockId,
      cells: row.cells as Record<string, any>,
      position: row.position,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    }));

    // Cache the results
    await databaseBlockCache.setRows(
      blockId,
      page,
      pageSize,
      transformedRows,
      total,
      filters,
      sorts,
      searchQuery
    );

    // Prefetch next page in background
    if (page * pageSize < total) {
      databaseBlockCache.prefetchBatch(
        blockId,
        page * pageSize,
        (page + 1) * pageSize,
        pageSize
      ).catch(console.error);
    }

    // Track performance
    await databasePerformanceService.trackQuery(
      blockId,
      `GET_ROWS_DB`,
      Date.now() - startTime,
      transformedRows.length,
      false
    );

    return json({
      data: transformedRows,
      total,
      page,
      pageSize,
      hasMore: page * pageSize < total,
      cached: false,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    console.error('Error fetching database rows:', error);
    
    // Track error
    await databasePerformanceService.trackQuery(
      blockId,
      `GET_ROWS_ERROR`,
      Date.now() - startTime,
      0,
      false
    );

    return json(
      { error: 'Failed to fetch database rows' },
      { status: 500 }
    );
  }
};