import { useState } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import { MagnifyingGlassIcon, DocumentTextIcon, FolderIcon, HomeIcon } from "@heroicons/react/24/outline";

export async function loader() {
  // Demo data - no authentication required
  return json({
    project: {
      id: "demo",
      name: "Demo RAG Project",
      description: "Multi-project RAG system with semantic search",
    },
    documents: [
      { id: "1", title: "Getting Started Guide", content: "This is a sample document for demonstration purposes. The RAG system can index and search through documents using vector embeddings.", createdAt: new Date().toISOString() },
      { id: "2", title: "API Documentation", content: "Sample API documentation content. The system supports automatic chunking and indexing of large documents.", createdAt: new Date().toISOString() },
      { id: "3", title: "User Manual", content: "Sample user manual content. Search queries are processed using OpenAI embeddings for semantic similarity.", createdAt: new Date().toISOString() },
      { id: "4", title: "Technical Specifications", content: "The RAG system uses Supabase for vector storage and PostgreSQL for metadata.", createdAt: new Date().toISOString() },
      { id: "5", title: "Best Practices", content: "Documents are automatically indexed and can be searched across multiple projects.", createdAt: new Date().toISOString() },
    ]
  });
}

export default function DemoProject() {
  const { project, documents } = useLoaderData<typeof loader>();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    
    // Simulate search with a delay
    setTimeout(() => {
      // Mock search results based on query
      const results = documents.filter(doc => 
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.content.toLowerCase().includes(searchQuery.toLowerCase())
      ).map(doc => ({
        ...doc,
        similarity: Math.random() * 0.5 + 0.5, // Mock similarity score between 0.5 and 1.0
        excerpt: doc.content.substring(0, 150) + "..."
      }));
      
      // Sort by similarity score
      results.sort((a, b) => b.similarity - a.similarity);
      
      setSearchResults(results);
      setIsSearching(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link to="/" className="mr-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <HomeIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
              </Link>
              <FolderIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 mr-3" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{project.name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">{project.description}</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {documents.length} documents indexed
              </span>
              <span className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-medium rounded-full">
                Demo Mode
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Search Section */}
          <div className="lg:col-span-2">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Semantic Search
              </h2>
              
              <form onSubmit={handleSearch} className="mb-6">
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search documents using natural language..."
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
                  />
                  <MagnifyingGlassIcon className="absolute left-3 top-3.5 h-5 w-5 text-gray-400" />
                </div>
                <button
                  type="submit"
                  disabled={isSearching || !searchQuery.trim()}
                  className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {isSearching ? "Searching..." : "Search"}
                </button>
              </form>

              {/* Demo Note */}
              <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Demo Mode:</strong> This is a demonstration of the RAG system UI. In production, searches would use OpenAI embeddings for true semantic similarity matching.
                </p>
              </div>

              {/* Search Results */}
              {searchResults.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    Search Results ({searchResults.length})
                  </h3>
                  {searchResults.map((result) => (
                    <div
                      key={result.id}
                      className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-medium text-gray-900 dark:text-white">
                          {result.title}
                        </h4>
                        <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                          {(result.similarity * 100).toFixed(1)}% match
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {result.excerpt}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {searchQuery && searchResults.length === 0 && !isSearching && (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  No results found for "{searchQuery}"
                </div>
              )}
            </div>
          </div>

          {/* Documents List */}
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Indexed Documents
              </h2>
              <div className="space-y-3">
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-start space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
                  >
                    <DocumentTextIcon className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {doc.title}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Added {new Date(doc.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* RAG System Info */}
            <div className="mt-6 bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-3">
                Task 11: RAG System Features
              </h3>
              <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-400">
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Vector embeddings for semantic search</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Automatic document chunking & indexing</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Context-aware AI responses</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Multi-project document organization</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Supabase vector storage</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">✓</span>
                  <span>Production-ready architecture</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}