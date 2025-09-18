import { Link } from '@remix-run/react';
import { FileText, Clock, ExternalLink, ChevronRight } from 'lucide-react';

interface Page {
  id: string;
  title: string;
  lastVisited: Date;
  url?: string;
  type: 'document' | 'note' | 'link';
  preview?: string;
}

interface RecentPagesProps {
  pages?: Page[];
}

export function RecentPages({ pages = [] }: RecentPagesProps) {
  // Mock data for demonstration
  const mockPages: Page[] = pages.length > 0 ? pages : [
    {
      id: '1',
      title: 'Project Documentation',
      lastVisited: new Date(Date.now() - 1000 * 60 * 5), // 5 minutes ago
      type: 'document',
      preview: 'Overview of the RAG system architecture and implementation details...'
    },
    {
      id: '2',
      title: 'Meeting Notes - Q1 Planning',
      lastVisited: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      type: 'note',
      preview: 'Discussed roadmap priorities and resource allocation for Q1...'
    },
    {
      id: '3',
      title: 'API Reference Guide',
      lastVisited: new Date(Date.now() - 1000 * 60 * 60 * 2), // 2 hours ago
      type: 'document',
      preview: 'Complete API documentation for all endpoints and services...'
    },
    {
      id: '4',
      title: 'Research: Vector Databases',
      lastVisited: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
      type: 'link',
      url: 'https://example.com/vector-db-research',
      preview: 'Comparison of different vector database solutions for RAG...'
    },
    {
      id: '5',
      title: 'Task List - Sprint 3',
      lastVisited: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
      type: 'note',
      preview: 'Sprint 3 deliverables and task assignments...'
    }
  ];

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
  };

  const getPageIcon = (type: Page['type']) => {
    switch (type) {
      case 'document':
        return <FileText className="w-4 h-4" />;
      case 'note':
        return <FileText className="w-4 h-4" />;
      case 'link':
        return <ExternalLink className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  const displayPages = mockPages;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[rgba(33,33,33,1)] rounded-lg shadow-sm">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-3xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          Recent Pages
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Your recently accessed documents
        </p>
      </div>

      {/* Pages List */}
      <div className="flex-1 overflow-y-auto">
        {displayPages.length === 0 ? (
          <div className="p-6 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              No recent pages yet
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              Pages you visit will appear here
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {displayPages.map((page) => (
              <Link
                key={page.id}
                to={page.url || `/pages/${page.id}`}
                className="block px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 mt-1 text-gray-500 dark:text-gray-400">
                    {getPageIcon(page.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                        {page.title}
                      </h3>
                      <ChevronRight className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </div>
                    
                    {page.preview && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                        {page.preview}
                      </p>
                    )}
                    
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-xs text-gray-500 dark:text-gray-500">
                        {formatTimeAgo(page.lastVisited)}
                      </span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                        {page.type}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700">
        <Link
          to="/pages"
          className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-1"
        >
          View all pages
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}