import { json, type ActionFunctionArgs } from '@remix-run/node';
import { databaseBlockSupabaseService } from '~/services/database-block-supabase.server';
import { requireUser } from '~/services/auth/auth.server';

export async function action({ request }: ActionFunctionArgs) {
  const user = await requireUser(request);
  const formData = await request.formData();
  const action = formData.get('action') as string;

  try {
    switch (action) {
      case 'getDatabaseBlock': {
        const databaseBlockId = formData.get('databaseBlockId') as string;
        console.log('[API] getDatabaseBlock - databaseBlockId:', databaseBlockId);
        
        const block = await databaseBlockSupabaseService.getDatabaseBlock(databaseBlockId);
        
        if (!block) {
          console.log('[API] getDatabaseBlock - block not found');
          return json({ error: 'Database block not found' }, { status: 404 });
        }
        
        console.log('[API] getDatabaseBlock - block found:', block.id);
        console.log('[API] getDatabaseBlock - schema length:', block.schema?.length);
        console.log('[API] getDatabaseBlock - returning columns:', block.schema?.map((c: any) => c.name));
        
        const response = {
          success: true,
          databaseBlock: block,
          columns: block.schema
        };
        
        return json(response);
      }
      
      case 'getDatabaseRows': {
        const databaseBlockId = formData.get('databaseBlockId') as string;
        const limit = parseInt(formData.get('limit') as string || '50');
        const offset = parseInt(formData.get('offset') as string || '0');
        const filters = JSON.parse(formData.get('filters') as string || '[]');
        const sorts = JSON.parse(formData.get('sorts') as string || '[]');
        const viewId = formData.get('viewId') as string | undefined;

        const result = await databaseBlockSupabaseService.getDatabaseRows({
          databaseBlockId,
          limit,
          offset,
          filters,
          sorts,
          viewId
        });

        return json(result);
      }

      case 'addRow': {
        const databaseBlockId = formData.get('databaseBlockId') as string;
        const data = JSON.parse(formData.get('data') as string || '{}');

        const row = await databaseBlockSupabaseService.createRow(
          databaseBlockId,
          data,
          user.id
        );

        return json({ success: true, row });
      }

      case 'updateCell': {
        const rowId = formData.get('rowId') as string;
        const columnId = formData.get('columnId') as string;
        const valueStr = formData.get('value') as string;
        
        // Handle undefined or null values properly
        let value;
        if (valueStr === 'undefined' || valueStr === 'null' || !valueStr) {
          value = null;
        } else {
          try {
            value = JSON.parse(valueStr);
          } catch (e) {
            // If JSON parse fails, treat as string value
            value = valueStr;
          }
        }

        // Get current row directly from database to get version
        const { data: currentRow } = await databaseBlockSupabaseService.supabase
          .from('db_block_rows')
          .select('*')
          .eq('id', rowId)
          .single();

        if (!currentRow) {
          throw new Error('Row not found');
        }

        const updatedData = { ...currentRow.data, [columnId]: value };

        const row = await databaseBlockSupabaseService.updateRow(
          rowId,
          updatedData,
          currentRow.version,
          user.id
        );

        return json({ success: true, row });
      }

      case 'deleteRow': {
        const rowId = formData.get('rowId') as string;
        await databaseBlockSupabaseService.deleteRow(rowId);
        return json({ success: true });
      }

      case 'duplicateRow': {
        const rowId = formData.get('rowId') as string;
        const newRowId = await databaseBlockSupabaseService.duplicateRow(rowId, user.id);
        return json({ success: true, rowId: newRowId });
      }

      case 'addColumn': {
        const databaseBlockId = formData.get('databaseBlockId') as string;
        const column = JSON.parse(formData.get('column') as string);

        console.log('[API] addColumn - databaseBlockId:', databaseBlockId);
        console.log('[API] addColumn - column:', column);

        const newColumn = await databaseBlockSupabaseService.createColumn(
          databaseBlockId,
          column
        );

        console.log('[API] addColumn - newColumn created:', newColumn);
        const response = { success: true, column: newColumn };
        console.log('[API] addColumn - sending response:', response);
        
        return json(response);
      }

      case 'updateColumn': {
        const databaseBlockId = formData.get('databaseBlockId') as string;
        const columnId = formData.get('columnId') as string;
        const updates = JSON.parse(formData.get('updates') as string);

        const column = await databaseBlockSupabaseService.updateColumn(
          databaseBlockId,
          columnId,
          updates
        );

        return json({ success: true, column });
      }

      case 'deleteColumn': {
        const columnId = formData.get('columnId') as string;
        const databaseBlockId = formData.get('databaseBlockId') as string;
        await databaseBlockSupabaseService.deleteColumn(databaseBlockId, columnId);
        return json({ success: true });
      }

      case 'reorderColumns': {
        const databaseBlockId = formData.get('databaseBlockId') as string;
        const columnOrder = JSON.parse(formData.get('columnOrder') as string);

        await databaseBlockSupabaseService.reorderColumns(
          databaseBlockId,
          columnOrder
        );

        return json({ success: true });
      }

      case 'saveView': {
        const databaseBlockId = formData.get('databaseBlockId') as string;
        const view = JSON.parse(formData.get('view') as string);

        const newView = await databaseBlockSupabaseService.createView(
          databaseBlockId,
          view,
          user.id
        );

        return json({ success: true, view: newView });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Database block API error:', error);
    return json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}