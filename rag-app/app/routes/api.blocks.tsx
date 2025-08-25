// Simple Blocks API for creating and managing blocks
import { json, type ActionFunctionArgs } from '@remix-run/node';
import { createSupabaseAdmin } from '~/utils/supabase.server';
import { sessionStorage } from '~/services/auth/session.server';

export async function action({ request }: ActionFunctionArgs) {
  const session = await sessionStorage.getSession(
    request.headers.get("Cookie")
  );
  
  const userId = session.get("userId");
  
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createSupabaseAdmin();
  const { intent, blockData } = await request.json();

  try {
    switch (intent) {
      case 'create': {
        // For demo purposes, first check if the page exists
        const { data: page } = await supabase
          .from('pages')
          .select('id')
          .eq('id', blockData.page_id)
          .single();

        let pageId = blockData.page_id;
        
        // If page doesn't exist, create a demo page
        if (!page) {
          const { data: workspace } = await supabase
            .from('workspaces')
            .select('id')
            .limit(1)
            .single();

          if (!workspace) {
            // Create a demo workspace first
            const { data: newWorkspace } = await supabase
              .from('workspaces')
              .insert({
                name: 'Demo Workspace',
                slug: 'demo-workspace'
              })
              .select()
              .single();

            if (newWorkspace) {
              const { data: newPage } = await supabase
                .from('pages')
                .insert({
                  id: 'demo-page-id',
                  title: 'Demo Page',
                  slug: 'demo-page',
                  workspace_id: newWorkspace.id,
                  created_by: userId
                })
                .select()
                .single();

              pageId = newPage?.id || pageId;
            }
          } else {
            const { data: newPage } = await supabase
              .from('pages')
              .insert({
                id: 'demo-page-id',
                title: 'Demo Page',
                slug: 'demo-page',
                workspace_id: workspace.id,
                created_by: userId
              })
              .select()
              .single();

            pageId = newPage?.id || pageId;
          }
        }

        // Now create the block
        const { data: block, error } = await supabase
          .from('blocks')
          .insert({
            id: blockData.id,
            type: blockData.type,
            content: blockData.content || {},
            page_id: pageId,
            position: blockData.position || 0,
            created_by: userId,
            updated_by: userId
          })
          .select()
          .single();

        if (error) {
          throw error;
        }

        return json({ success: true, data: block });
      }

      case 'get': {
        const { data: block, error } = await supabase
          .from('blocks')
          .select('*')
          .eq('id', blockData.id)
          .single();

        if (error) {
          throw error;
        }

        return json({ success: true, data: block });
      }

      case 'delete': {
        const { error } = await supabase
          .from('blocks')
          .delete()
          .eq('id', blockData.id);

        if (error) {
          throw error;
        }

        return json({ success: true });
      }

      default:
        return json({ error: `Unknown intent: ${intent}` }, { status: 400 });
    }
  } catch (error) {
    console.error('Block operation failed:', error);
    return json(
      { error: error instanceof Error ? error.message : 'Operation failed' },
      { status: 500 }
    );
  }
}