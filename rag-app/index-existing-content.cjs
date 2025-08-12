const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function indexExistingContent() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase environment variables');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  console.log('Indexing existing content...');

  try {
    // Get all workspaces
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select('id, name');

    if (wsError) {
      console.error('Failed to fetch workspaces:', wsError);
      return;
    }

    console.log(`Found ${workspaces?.length || 0} workspaces`);

    for (const workspace of (workspaces || [])) {
      console.log(`\nIndexing workspace: ${workspace.name} (${workspace.id})`);

      // Get all pages in workspace
      const { data: pages, error: pagesError } = await supabase
        .from('pages')
        .select('id, title')
        .eq('workspace_id', workspace.id);

      if (pagesError) {
        console.error('Failed to fetch pages:', pagesError);
        continue;
      }

      console.log(`  Found ${pages?.length || 0} pages`);

      for (const page of (pages || [])) {
        // Get all blocks on the page
        const { data: blocks, error: blocksError } = await supabase
          .from('blocks')
          .select('*')
          .eq('page_id', page.id);

        if (blocksError) {
          console.error('Failed to fetch blocks:', blocksError);
          continue;
        }

        console.log(`    Page "${page.title}": ${blocks?.length || 0} blocks`);

        // Index each block
        for (const block of (blocks || [])) {
          let content = '';

          // Extract content based on block type
          if (block.type === 'text' || block.type === 'paragraph') {
            content = block.content?.text || block.content || '';
          } else if (block.type === 'heading') {
            const level = block.content?.level || 1;
            content = `${'#'.repeat(level)} ${block.content?.text || block.content || ''}`;
          } else if (block.type === 'database') {
            // Get database details
            const { data: dbBlock } = await supabase
              .from('db_blocks')
              .select('*')
              .eq('block_id', block.id)
              .single();

            if (dbBlock) {
              content = `Database: ${dbBlock.name}\n`;
              if (dbBlock.description) {
                content += `Description: ${dbBlock.description}\n`;
              }

              // Get database rows
              const { data: rows } = await supabase
                .from('db_block_rows')
                .select('*')
                .eq('db_block_id', dbBlock.id);

              if (rows && rows.length > 0) {
                content += `\nData (${rows.length} rows):\n`;
                
                // Add first 10 rows as examples
                rows.slice(0, 10).forEach((row, index) => {
                  const rowData = Object.entries(row.data || {})
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(', ');
                  content += `Row ${index + 1}: ${rowData}\n`;
                });
              }
            }
          } else if (block.type === 'list') {
            const items = block.content?.items || [];
            content = items.map(item => `- ${item}`).join('\n');
          } else if (block.type === 'code') {
            content = `Code: ${block.content?.code || block.content || ''}`;
          }

          // Skip if no content
          if (!content || content.trim().length === 0) {
            continue;
          }

          // Check if already indexed
          const { data: existing } = await supabase
            .from('documents')
            .select('id')
            .eq('source_block_id', block.id)
            .single();

          if (existing) {
            console.log(`      Block ${block.id} already indexed, skipping`);
            continue;
          }

          // Index the content
          const { error: insertError } = await supabase
            .from('documents')
            .insert({
              workspace_id: workspace.id,
              content: content,
              passage_id: `block-${block.id}`,
              source_block_id: block.id,
              metadata: {
                page_id: page.id,
                page_title: page.title,
                block_type: block.type,
                indexed_at: new Date().toISOString()
              }
            });

          if (insertError) {
            console.error(`      Failed to index block ${block.id}:`, insertError.message);
          } else {
            console.log(`      ✓ Indexed block ${block.id} (${block.type})`);
          }
        }
      }
    }

    // Verify indexing
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    console.log(`\n✅ Indexing complete! Total documents: ${count || 0}`);

  } catch (error) {
    console.error('Indexing failed:', error);
  }
}

indexExistingContent().catch(console.error);