// API Route for Core Database Block Operations
// Handles CRUD operations for database blocks and rows

import { json, type ActionFunctionArgs } from '@remix-run/node';
import { databaseBlockCoreService } from '~/services/database-block-core.server';
import { sessionStorage } from '~/services/auth/session.server';

export async function action({ request }: ActionFunctionArgs) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  
  const userId = session.get("userId");
  
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { intent, ...data } = await request.json();

  try {
    switch (intent) {
      // ============= Database Block Operations =============
      
      case 'create-database-block': {
        const result = await databaseBlockCoreService.createDatabaseBlock({
          ...data,
          userId
        });
        return json({ success: true, data: result });
      }

      case 'get-database-block': {
        const result = await databaseBlockCoreService.getDatabaseBlock(data.blockId);
        return json({ success: true, data: result });
      }

      case 'update-database-block': {
        const result = await databaseBlockCoreService.updateDatabaseBlock(
          data.blockId,
          data.updates
        );
        return json({ success: true, data: result });
      }

      case 'delete-database-block': {
        const result = await databaseBlockCoreService.deleteDatabaseBlock(data.blockId);
        return json({ success: true, data: result });
      }

      // ============= Column Operations =============
      
      case 'add-column': {
        const result = await databaseBlockCoreService.addColumn(
          data.blockId,
          data.column
        );
        return json({ success: true, data: result });
      }

      case 'update-column': {
        const result = await databaseBlockCoreService.updateColumn(
          data.blockId,
          data.columnId,
          data.updates
        );
        return json({ success: true, data: result });
      }

      case 'delete-column': {
        const result = await databaseBlockCoreService.deleteColumn(
          data.blockId,
          data.columnId
        );
        return json({ success: true, data: result });
      }

      // ============= Row Operations =============
      
      case 'get-rows': {
        const result = await databaseBlockCoreService.getRows(data.blockId, {
          offset: data.offset,
          limit: data.limit,
          filters: data.filters,
          sorts: data.sorts
        });
        return json({ success: true, data: result });
      }

      case 'create-row': {
        const result = await databaseBlockCoreService.createRow(data.blockId, {
          data: data.rowData,
          position: data.position,
          userId
        });
        return json({ success: true, data: result });
      }

      case 'update-row': {
        const result = await databaseBlockCoreService.updateRow(data.rowId, {
          data: data.rowData,
          version: data.version,
          userId
        });
        return json({ success: true, data: result });
      }

      case 'delete-rows': {
        const result = await databaseBlockCoreService.deleteRows(
          data.rowIds,
          userId
        );
        return json({ success: true, data: result });
      }

      // ============= Bulk Operations =============
      
      case 'bulk-create-rows': {
        const result = await databaseBlockCoreService.bulkCreateRows(
          data.blockId,
          data.count,
          userId
        );
        return json({ success: true, data: { created: result } });
      }

      default:
        return json(
          { error: `Unknown intent: ${intent}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error(`Database block operation failed:`, error);
    return json(
      { 
        error: error instanceof Error ? error.message : 'Operation failed',
        details: error
      },
      { status: 500 }
    );
  }
}