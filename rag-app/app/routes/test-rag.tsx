import { useState } from 'react';
import { useFetcher } from '@remix-run/react';
import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { requireUser } from '~/services/auth/auth.server';
import { createSupabaseAdmin } from '~/utils/supabase.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const supabase = createSupabaseAdmin();

  // Get user's workspace
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, name')
    .eq('created_by', user.id)
    .single();

  // Get sample pages and databases for testing
  const { data: pages } = await supabase
    .from('pages')
    .select('id, title')
    .eq('workspace_id', workspace?.id)
    .limit(5);

  const { data: databases } = await supabase
    .from('db_blocks')
    .select('id, name')
    .eq('workspace_id', workspace?.id)
    .limit(5);

  // Get indexing queue status
  const { data: queueStatus } = await supabase
    .from('indexing_queue')
    .select('status, count')
    .eq('workspace_id', workspace?.id);

  return json({
    workspace,
    pages: pages || [],
    databases: databases || [],
    queueStatus: queueStatus || []
  });
}

export default function TestRAG() {
  const fetcher = useFetcher();
  const [query, setQuery] = useState('');
  const [indexTarget, setIndexTarget] = useState('');
  const [indexType, setIndexType] = useState('page');

  const handleSearch = () => {
    if (!query) return;
    
    fetcher.submit(
      {
        action: 'searchAndAnswer',
        query,
        workspaceId: fetcher.data?.workspace?.id || ''
      },
      { method: 'post', action: '/api/rag-search' }
    );
  };

  const handleIndex = () => {
    if (!indexTarget) return;

    const action = indexType === 'page' ? 'indexPage' : 
                   indexType === 'database' ? 'indexDatabase' : 
                   'reindexWorkspace';
    
    const params: any = {
      action,
      workspaceId: fetcher.data?.workspace?.id || ''
    };

    if (indexType === 'page') {
      params.pageId = indexTarget;
    } else if (indexType === 'database') {
      params.databaseId = indexTarget;
    }

    fetcher.submit(params, { method: 'post', action: '/api/index-content' });
  };

  const processQueue = () => {
    fetcher.submit(
      { action: 'processQueue' },
      { method: 'post', action: '/api/index-content' }
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8">RAG System Test Interface</h1>
        
        {/* Workspace Info */}
        {fetcher.data?.workspace && (
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            <h2 className="font-semibold mb-2">Current Workspace</h2>
            <p>Name: {fetcher.data.workspace.name}</p>
            <p className="text-sm text-gray-600">ID: {fetcher.data.workspace.id}</p>
          </div>
        )}

        {/* Search Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Search & Ask Questions</h2>
          <div className="space-y-4">
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your workspace content..."
              className="w-full p-3 border rounded-lg resize-none h-24"
            />
            <button
              onClick={handleSearch}
              disabled={!query || fetcher.state !== 'idle'}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {fetcher.state !== 'idle' ? 'Searching...' : 'Search & Answer'}
            </button>
          </div>

          {/* Search Results */}
          {fetcher.data?.answer && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Answer:</h3>
              <div className="prose max-w-none">
                <p className="whitespace-pre-wrap">{fetcher.data.answer}</p>
              </div>
              
              {fetcher.data.citations && fetcher.data.citations.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold text-sm mb-2">Citations:</h4>
                  <ul className="space-y-2">
                    {fetcher.data.citations.map((citation: any, index: number) => (
                      <li key={index} className="text-sm text-gray-600">
                        <span className="font-mono bg-gray-200 px-1 rounded">
                          [{citation.passage_id}]
                        </span>
                        {citation.excerpt && (
                          <span className="ml-2">{citation.excerpt}...</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {fetcher.data.confidence && (
                <div className="mt-2">
                  <span className="text-sm text-gray-600">
                    Confidence: {(fetcher.data.confidence * 100).toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Indexing Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Content Indexing</h2>
          
          <div className="space-y-4">
            <div className="flex gap-4">
              <select
                value={indexType}
                onChange={(e) => setIndexType(e.target.value)}
                className="px-3 py-2 border rounded-lg"
              >
                <option value="page">Index Page</option>
                <option value="database">Index Database</option>
                <option value="workspace">Reindex Entire Workspace</option>
              </select>

              {indexType !== 'workspace' && (
                <select
                  value={indexTarget}
                  onChange={(e) => setIndexTarget(e.target.value)}
                  className="flex-1 px-3 py-2 border rounded-lg"
                >
                  <option value="">Select {indexType}...</option>
                  {indexType === 'page' && fetcher.data?.pages?.map((page: any) => (
                    <option key={page.id} value={page.id}>
                      {page.title || 'Untitled Page'}
                    </option>
                  ))}
                  {indexType === 'database' && fetcher.data?.databases?.map((db: any) => (
                    <option key={db.id} value={db.id}>
                      {db.name}
                    </option>
                  ))}
                </select>
              )}

              <button
                onClick={handleIndex}
                disabled={fetcher.state !== 'idle' || (indexType !== 'workspace' && !indexTarget)}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {fetcher.state !== 'idle' ? 'Indexing...' : 'Index'}
              </button>
            </div>

            <button
              onClick={processQueue}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Process Indexing Queue
            </button>
          </div>

          {/* Queue Status */}
          {fetcher.data?.queueStatus && fetcher.data.queueStatus.length > 0 && (
            <div className="mt-4 p-3 bg-gray-50 rounded">
              <h3 className="font-semibold text-sm mb-2">Queue Status:</h3>
              <div className="grid grid-cols-4 gap-2 text-sm">
                {fetcher.data.queueStatus.map((status: any) => (
                  <div key={status.status}>
                    <span className="font-medium">{status.status}:</span>
                    <span className="ml-1">{status.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Test Queries */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Sample Queries</h2>
          <div className="space-y-2">
            <button
              onClick={() => setQuery('What databases are in my workspace?')}
              className="block w-full text-left px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
            >
              What databases are in my workspace?
            </button>
            <button
              onClick={() => setQuery('Summarize the content in my pages')}
              className="block w-full text-left px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
            >
              Summarize the content in my pages
            </button>
            <button
              onClick={() => setQuery('What information do I have about tasks?')}
              className="block w-full text-left px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
            >
              What information do I have about tasks?
            </button>
            <button
              onClick={() => setQuery('List all the headings and important sections')}
              className="block w-full text-left px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
            >
              List all the headings and important sections
            </button>
            <button
              onClick={() => setQuery('Summarize this workspace')}
              className="block w-full text-left px-3 py-2 bg-gray-100 rounded hover:bg-gray-200"
            >
              Summarize this workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}