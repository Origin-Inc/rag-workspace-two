import { json, type ActionFunctionArgs } from '@remix-run/node';
import { aiControllerService } from '~/services/ai-controller.server';
import { requireUser } from '~/services/auth/auth.server';
import { DebugLogger } from '~/utils/debug-logger';

const logger = new DebugLogger('API:AIController');

export async function action({ request }: ActionFunctionArgs) {
  logger.trace('action', [request.method, request.url]);
  
  const user = await requireUser(request);
  logger.debug('User authenticated', { userId: user.id });
  
  const formData = await request.formData();
  const action = formData.get('action') as string;
  logger.info(`Handling action: ${action}`);

  try {
    switch (action) {
      case 'parse': {
        const command = formData.get('command') as string;
        const workspaceId = formData.get('workspaceId') as string;
        
        logger.debug('Parse action parameters', { 
          command, 
          workspaceId,
          userId: user.id 
        });

        if (!command || !workspaceId) {
          logger.warn('Missing required fields', { command: !!command, workspaceId: !!workspaceId });
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Parse the command
        logger.info('Parsing command');
        const parseResult = await logger.timeOperation(
          'parseCommand',
          () => aiControllerService.parseCommand(
            command,
            workspaceId,
            user.id
          )
        );
        logger.debug('Parse result', parseResult);

        // Generate preview
        logger.info('Generating preview');
        const preview = await logger.timeOperation(
          'generatePreview',
          () => aiControllerService.generatePreview(
            parseResult.actions,
            workspaceId
          )
        );
        logger.debug('Preview generated', { previewCount: preview.length });

        // Store action log
        logger.info('Storing action log');
        const actionLogId = await logger.timeOperation(
          'storeActionLog',
          () => aiControllerService.storeActionLog(
            command,
            parseResult,
            preview,
            workspaceId,
            user.id
          )
        );
        logger.info('Action log stored', { actionLogId });

        const response = {
          success: true,
          parseResult,
          preview,
          actionLogId
        };
        
        logger.info('Parse action completed successfully');
        return json(response);
      }

      case 'execute': {
        const actionLogId = formData.get('actionLogId') as string;
        const workspaceId = formData.get('workspaceId') as string;

        if (!actionLogId || !workspaceId) {
          return json({ error: 'Missing required fields' }, { status: 400 });
        }

        // First confirm the action
        await aiControllerService.confirmAction(actionLogId);

        // Get the action log to retrieve the parsed actions
        const { data: actionLog } = await aiControllerService
          .supabase
          .from('action_logs')
          .select('*')
          .eq('id', actionLogId)
          .single();

        if (!actionLog) {
          return json({ error: 'Action log not found' }, { status: 404 });
        }

        // Execute the actions
        const result = await aiControllerService.executeActions(
          actionLogId,
          actionLog.parsed_action.actions,
          workspaceId,
          user.id
        );

        return json({
          success: true,
          executed: true,
          command: actionLog.command,
          result
        });
      }

      case 'cancel': {
        const actionLogId = formData.get('actionLogId') as string;

        if (!actionLogId) {
          return json({ error: 'Missing action log ID' }, { status: 400 });
        }

        // Update status to cancelled
        await aiControllerService.supabase
          .from('action_logs')
          .update({ status: 'cancelled' })
          .eq('id', actionLogId);

        return json({ success: true, cancelled: true });
      }

      case 'history': {
        const workspaceId = formData.get('workspaceId') as string;

        if (!workspaceId) {
          return json({ error: 'Missing workspace ID' }, { status: 400 });
        }

        // Get recent command history
        const { data: history } = await aiControllerService.supabase
          .from('action_logs')
          .select('id, command, status, created_at')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(10);

        return json({ success: true, history });
      }

      default:
        return json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    logger.error('AI Controller API error', error);
    return json(
      { error: error instanceof Error ? error.message : 'An error occurred' },
      { status: 500 }
    );
  }
}