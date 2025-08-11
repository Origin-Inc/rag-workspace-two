import { json, type ActionFunctionArgs } from '@remix-run/node';
import { databaseDebugService } from '~/services/database-debug.server';

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const action = formData.get('action') as string;

  console.log('[API-DEBUG] Received action:', action);

  try {
    switch (action) {
      case 'testConnection': {
        console.log('[API-DEBUG] Running connection test...');
        const result = await databaseDebugService.testConnection();
        return json(result);
      }

      case 'testDirect': {
        console.log('[API-DEBUG] Running direct connection test...');
        const result = await databaseDebugService.testDirectPostgresConnection();
        return json(result);
      }

      case 'diagnose': {
        console.log('[API-DEBUG] Running diagnostics...');
        const result = await databaseDebugService.diagnoseIssues();
        return json(result);
      }

      case 'fullDebug': {
        console.log('[API-DEBUG] Running full debug suite...');
        const [connection, direct, diagnosis] = await Promise.all([
          databaseDebugService.testConnection(),
          databaseDebugService.testDirectPostgresConnection(),
          databaseDebugService.diagnoseIssues()
        ]);

        return json({
          connection,
          direct,
          diagnosis,
          timestamp: new Date().toISOString()
        });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('[API-DEBUG] Error:', error);
    return json(
      { 
        error: error instanceof Error ? error.message : 'An error occurred',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}