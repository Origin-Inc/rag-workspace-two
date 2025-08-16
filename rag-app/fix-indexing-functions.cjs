const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

async function fixIndexingFunctions() {
  console.log('Creating/updating indexing queue functions...');

  // Create process_indexing_queue function
  const { error: processError } = await supabase.rpc('query', {
    query: `
      CREATE OR REPLACE FUNCTION process_indexing_queue(
        p_batch_size INTEGER DEFAULT 10
      )
      RETURNS TABLE (
        id UUID,
        resource_type TEXT,
        resource_id UUID,
        workspace_id UUID,
        action TEXT
      )
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RETURN QUERY
        UPDATE indexing_queue
        SET status = 'processing',
            processed_at = NOW()
        WHERE indexing_queue.id IN (
          SELECT iq.id
          FROM indexing_queue iq
          WHERE iq.status = 'pending'
            AND iq.retry_count < 3
          ORDER BY iq.priority DESC, iq.created_at
          LIMIT p_batch_size
          FOR UPDATE SKIP LOCKED
        )
        RETURNING 
          indexing_queue.id, 
          indexing_queue.resource_type, 
          indexing_queue.resource_id, 
          indexing_queue.workspace_id, 
          indexing_queue.action;
      END;
      $$;
    `
  });

  if (processError) {
    console.error('Error creating process_indexing_queue:', processError);
  } else {
    console.log('✓ Created process_indexing_queue function');
  }

  // Create complete_indexing_task function
  const { error: completeError } = await supabase.rpc('query', {
    query: `
      CREATE OR REPLACE FUNCTION complete_indexing_task(
        p_task_id UUID,
        p_success BOOLEAN,
        p_error_message TEXT DEFAULT NULL
      )
      RETURNS VOID
      LANGUAGE plpgsql
      AS $$
      BEGIN
        IF p_success THEN
          UPDATE indexing_queue
          SET status = 'completed',
              processed_at = NOW()
          WHERE id = p_task_id;
        ELSE
          UPDATE indexing_queue
          SET status = 'failed',
              processed_at = NOW(),
              error_message = p_error_message,
              retry_count = retry_count + 1
          WHERE id = p_task_id;
        END IF;
      END;
      $$;
    `
  });

  if (completeError) {
    console.error('Error creating complete_indexing_task:', completeError);
  } else {
    console.log('✓ Created complete_indexing_task function');
  }

  // Create cleanup_indexing_queue function
  const { error: cleanupError } = await supabase.rpc('query', {
    query: `
      CREATE OR REPLACE FUNCTION cleanup_indexing_queue()
      RETURNS VOID
      LANGUAGE plpgsql
      AS $$
      BEGIN
        -- Delete completed tasks older than 7 days
        DELETE FROM indexing_queue
        WHERE status = 'completed'
          AND processed_at < NOW() - INTERVAL '7 days';
        
        -- Reset stuck processing tasks
        UPDATE indexing_queue
        SET status = 'pending',
            retry_count = retry_count + 1
        WHERE status = 'processing'
          AND processed_at < NOW() - INTERVAL '1 hour';
      END;
      $$;
    `
  });

  if (cleanupError) {
    console.error('Error creating cleanup_indexing_queue:', cleanupError);
  } else {
    console.log('✓ Created cleanup_indexing_queue function');
  }

  console.log('\nAll indexing queue functions have been created/updated!');
}

fixIndexingFunctions().catch(console.error);