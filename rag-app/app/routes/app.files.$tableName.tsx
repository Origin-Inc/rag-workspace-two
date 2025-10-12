/**
 * File Viewer Route
 * Task #81: Virtual Scrolling for Data Tables
 *
 * Displays uploaded data files using VirtualTable with DuckDB pagination.
 * Accessed via: /app/files/[tableName]
 *
 * Example: /app/files/data_1234567890
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import { useLoaderData, Link } from '@remix-run/react';
import { requireUser } from '~/services/auth/auth.server';
import { ClientOnly } from '~/components/ClientOnly';
import { ChevronLeftIcon } from '@heroicons/react/24/outline';
import { cn } from '~/utils/cn';

// Dynamic imports for client-side only
const FileViewerComponent = () => {
  const data = useLoaderData<typeof loader>();

  // Import FileViewer dynamically on client side (uses DuckDB which is client-only)
  const FileViewer = require('~/components/data-files/FileViewer').FileViewerWithErrorBoundary;

  return (
    <FileViewer
      file={data.file}
      height="calc(100vh - 140px)"
      showRowNumbers={true}
      className="w-full"
    />
  );
};

export async function loader({ params, request }: LoaderFunctionArgs) {
  const user = await requireUser(request);
  const { tableName } = params;

  if (!tableName) {
    throw new Response('Table name required', { status: 400 });
  }

  // Get URL parameters for context
  const url = new URL(request.url);
  const pageId = url.searchParams.get('pageId');
  const filename = url.searchParams.get('filename');

  // Create a minimal DataFile structure for the viewer
  // The actual data will be loaded client-side from DuckDB
  const file = {
    id: tableName,
    pageId: pageId || 'unknown',
    filename: filename || tableName.replace(/_/g, ' '),
    tableName,
    schema: [], // Will be populated client-side by querying DuckDB
    rowCount: 0, // Will be populated client-side
    sizeBytes: 0,
    uploadedAt: new Date(),
  };

  return json({
    user,
    file,
    tableName,
  });
}

export default function FileViewerRoute() {
  const { file, tableName } = useLoaderData<typeof loader>();

  return (
    <div className="h-screen flex flex-col bg-theme-bg-primary">
      {/* Header */}
      <header className="flex-shrink-0 bg-theme-bg-secondary border-b border-theme-border">
        <div className="flex items-center justify-between h-14 px-6">
          <div className="flex items-center gap-4">
            <Link
              to="/app"
              className="flex items-center gap-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
            >
              <ChevronLeftIcon className="w-4 h-4" />
              Back to Dashboard
            </Link>
            <div className="h-6 w-px bg-theme-border" />
            <h1 className="text-lg font-semibold text-theme-text-primary">
              File Viewer
            </h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-6">
        <div className="h-full max-w-7xl mx-auto">
          <ClientOnly
            fallback={
              <div className="h-full flex items-center justify-center border border-theme-border rounded-lg bg-theme-bg-primary">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-theme-text-secondary">Loading file viewer...</span>
                </div>
              </div>
            }
          >
            <FileViewerComponent />
          </ClientOnly>
        </div>
      </main>
    </div>
  );
}
