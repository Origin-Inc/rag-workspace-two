import type { MetaFunction } from "@remix-run/node";
import { Link } from "@remix-run/react";
import { MagnifyingGlassIcon, DocumentTextIcon, FolderOpenIcon } from "@heroicons/react/24/outline";

export const meta: MetaFunction = () => {
  return [
    { title: "Multi-Project RAG System" },
    { name: "description", content: "Intelligent document search and retrieval across multiple projects" },
  ];
};

export default function Index() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            Multi-Project RAG System
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            Intelligent document search and retrieval across multiple projects
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
              Task 11 Features
            </h2>
            
            <div className="grid md:grid-cols-3 gap-6 mb-8">
              <div className="text-center">
                <div className="bg-blue-100 dark:bg-blue-900 rounded-full p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  <FolderOpenIcon className="h-8 w-8 text-blue-600 dark:text-blue-300" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Multi-Project Support</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Organize documents across multiple workspaces and projects
                </p>
              </div>
              
              <div className="text-center">
                <div className="bg-green-100 dark:bg-green-900 rounded-full p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  <MagnifyingGlassIcon className="h-8 w-8 text-green-600 dark:text-green-300" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Semantic Search</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  AI-powered search using vector embeddings
                </p>
              </div>
              
              <div className="text-center">
                <div className="bg-purple-100 dark:bg-purple-900 rounded-full p-4 w-16 h-16 mx-auto mb-3 flex items-center justify-center">
                  <DocumentTextIcon className="h-8 w-8 text-purple-600 dark:text-purple-300" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">Auto-Indexing</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Automatic document processing and indexing
                </p>
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-6 mb-6">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Demo Access</h3>
              <div className="space-y-2 text-sm">
                <p className="text-gray-600 dark:text-gray-300">
                  Click the button below to access the app directly without authentication (development mode).
                </p>
              </div>
            </div>

            <div className="flex gap-4 justify-center">
              <Link
                to="/auth/dev-login?redirectTo=/app"
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Access Real RAG System
              </Link>
              <Link
                to="/app"
                className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                View Demo UI
              </Link>
            </div>
          </div>

          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Built with Remix, Prisma, Supabase, and OpenAI</p>
          </div>
        </div>
      </div>
    </div>
  );
}