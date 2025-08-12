const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testDirectSearch() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  
  console.log('Testing direct database queries...\n');

  // Test 1: Count documents
  const { count: docCount } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId);
  
  console.log(`Documents in workspace: ${docCount}`);

  // Test 2: Get all documents
  const { data: allDocs, error: allError } = await supabase
    .from('documents')
    .select('passage_id, content')
    .eq('workspace_id', workspaceId);

  if (allError) {
    console.error('Error getting all docs:', allError);
  } else {
    console.log(`\nAll documents (${allDocs.length}):`);
    allDocs.forEach(doc => {
      console.log(`- ${doc.passage_id}: ${doc.content.substring(0, 100)}...`);
    });
  }

  // Test 3: Simple text search
  const searchTerms = ['summarize', 'page', 'database', 'tasks', 'project'];
  
  for (const term of searchTerms) {
    const { data: results, error } = await supabase
      .from('documents')
      .select('passage_id')
      .eq('workspace_id', workspaceId)
      .ilike('content', `%${term}%`);
    
    if (error) {
      console.error(`Error searching for "${term}":`, error);
    } else {
      console.log(`\nSearch for "${term}": ${results.length} results`);
    }
  }

  // Test 4: Test the hybrid_search function with fixed types
  console.log('\nTesting hybrid_search function:');
  const { data: hybridData, error: hybridError } = await supabase
    .rpc('hybrid_search', {
      workspace_uuid: workspaceId,
      query_text: 'page',
      query_embedding: null,
      match_count: 5,
      similarity_threshold: 0.0
    });

  if (hybridError) {
    console.error('Hybrid search error:', hybridError);
  } else {
    console.log(`Hybrid search returned ${hybridData?.length || 0} results`);
    if (hybridData && hybridData.length > 0) {
      console.log('First result:', hybridData[0].passage_id);
    }
  }
}

testDirectSearch().catch(console.error);