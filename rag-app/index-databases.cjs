const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function indexDatabases() {
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

  console.log('Indexing database content...');
  
  // Use the known workspace ID
  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';

  try {
    // Get all database blocks (limit to first 10 for testing)
    const { data: dbBlocks, error: dbError } = await supabase
      .from('db_blocks')
      .select('*')
      .limit(10);

    if (dbError) {
      console.error('Failed to fetch database blocks:', dbError);
      return;
    }

    console.log(`Found ${dbBlocks?.length || 0} database blocks to index`);

    for (const dbBlock of (dbBlocks || [])) {
      console.log(`\nIndexing database: ${dbBlock.name} (${dbBlock.id})`);

      // Build database description
      let content = `Database: ${dbBlock.name}\n`;
      
      if (dbBlock.description) {
        content += `Description: ${dbBlock.description}\n`;
      }

      // Add schema information
      if (dbBlock.schema && Array.isArray(dbBlock.schema)) {
        content += '\nColumns:\n';
        dbBlock.schema.forEach(col => {
          const colName = col.name || col.id || 'Unknown';
          const colType = col.type || 'text';
          content += `- ${colName} (${colType})\n`;
        });
      }

      // Get database rows (limit to first 50 for each database)
      const { data: rows, error: rowsError } = await supabase
        .from('db_block_rows')
        .select('*')
        .eq('db_block_id', dbBlock.id)
        .limit(50);

      if (rowsError) {
        console.error(`  Failed to fetch rows:`, rowsError.message);
      } else if (rows && rows.length > 0) {
        content += `\nData samples (${rows.length} of total rows):\n`;
        
        // Add first 10 rows as examples
        rows.slice(0, 10).forEach((row, index) => {
          const rowData = Object.entries(row.data || {})
            .map(([key, value]) => {
              // Truncate long values
              const val = String(value || '').substring(0, 100);
              return `${key}: ${val}`;
            })
            .join(', ');
          content += `Row ${index + 1}: ${rowData}\n`;
        });

        // If there are more rows, indicate that
        if (rows.length > 10) {
          content += `... and ${rows.length - 10} more rows\n`;
        }
      } else {
        content += '\nNo data rows found.\n';
      }

      // Check if already indexed
      const passageId = `database-${dbBlock.id}`;
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('passage_id', passageId)
        .single();

      if (existing) {
        console.log(`  Database already indexed, updating...`);
        // Update existing document
        const { error: updateError } = await supabase
          .from('documents')
          .update({
            content: content,
            metadata: {
              database_name: dbBlock.name,
              database_id: dbBlock.id,
              block_id: dbBlock.block_id,
              row_count: rows?.length || 0,
              indexed_at: new Date().toISOString()
            },
            updated_at: new Date().toISOString()
          })
          .eq('passage_id', passageId);

        if (updateError) {
          console.error(`  Failed to update:`, updateError.message);
        } else {
          console.log(`  ✓ Updated database index`);
        }
      } else {
        // Insert new document
        const { error: insertError } = await supabase
          .from('documents')
          .insert({
            workspace_id: workspaceId,
            content: content,
            passage_id: passageId,
            source_block_id: dbBlock.block_id,
            metadata: {
              database_name: dbBlock.name,
              database_id: dbBlock.id,
              block_id: dbBlock.block_id,
              row_count: rows?.length || 0,
              indexed_at: new Date().toISOString()
            }
          });

        if (insertError) {
          console.error(`  Failed to index:`, insertError.message);
        } else {
          console.log(`  ✓ Indexed database with ${rows?.length || 0} sample rows`);
        }
      }
    }

    // Verify indexing
    const { count } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    console.log(`\n✅ Indexing complete! Total documents in system: ${count || 0}`);

    // Show a sample of what was indexed
    const { data: sample } = await supabase
      .from('documents')
      .select('passage_id, content')
      .limit(3);

    if (sample && sample.length > 0) {
      console.log('\nSample of indexed content:');
      sample.forEach(doc => {
        console.log(`- ${doc.passage_id}: ${doc.content.substring(0, 100)}...`);
      });
    }

  } catch (error) {
    console.error('Indexing failed:', error);
  }
}

indexDatabases().catch(console.error);