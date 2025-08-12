const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

async function testSearch() {
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

  const workspaceId = '550e8400-e29b-41d4-a716-446655440000';
  const queryText = 'summarize this page';

  console.log('Testing search functionality...\n');
  console.log('Workspace ID:', workspaceId);
  console.log('Query:', queryText);
  console.log('---\n');

  // Test 1: Direct documents table query
  console.log('Test 1: Direct documents query');
  const { data: docs, error: docsError } = await supabase
    .from('documents')
    .select('id, passage_id, content')
    .eq('workspace_id', workspaceId)
    .limit(3);

  if (docsError) {
    console.error('Error querying documents:', docsError);
  } else {
    console.log(`Found ${docs?.length || 0} documents`);
    docs?.forEach(doc => {
      console.log(`- ${doc.passage_id}: ${doc.content.substring(0, 50)}...`);
    });
  }

  console.log('\n---\n');

  // Test 2: Text search using ilike
  console.log('Test 2: Text search with ilike');
  const { data: searchDocs, error: searchError } = await supabase
    .from('documents')
    .select('id, passage_id, content')
    .eq('workspace_id', workspaceId)
    .ilike('content', '%database%')
    .limit(3);

  if (searchError) {
    console.error('Error in text search:', searchError);
  } else {
    console.log(`Found ${searchDocs?.length || 0} matching documents`);
    searchDocs?.forEach(doc => {
      console.log(`- ${doc.passage_id}: ${doc.content.substring(0, 50)}...`);
    });
  }

  console.log('\n---\n');

  // Test 3: Call hybrid_search function
  console.log('Test 3: Hybrid search function');
  const { data: hybridResults, error: hybridError } = await supabase
    .rpc('hybrid_search', {
      workspace_uuid: workspaceId,
      query_text: queryText,
      query_embedding: null, // No embedding for text-only search
      match_count: 5,
      similarity_threshold: 0.3
    });

  if (hybridError) {
    console.error('Error in hybrid search:', hybridError);
    console.error('Details:', hybridError.message, hybridError.code, hybridError.details);
  } else {
    console.log(`Found ${hybridResults?.length || 0} results from hybrid search`);
    hybridResults?.forEach(result => {
      console.log(`- ${result.passage_id}: ${result.content?.substring(0, 50)}...`);
    });
  }

  console.log('\n---\n');

  // Test 4: Check current user context
  console.log('Test 4: Check auth context');
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError) {
    console.error('Auth error:', authError);
  } else if (user) {
    console.log('Current user:', user.id);
    console.log('User role:', user.role);
  } else {
    console.log('No user authenticated (using service role)');
  }
}

testSearch().catch(console.error);