import { useChatStore, useChatMessages, useChatSidebar } from '~/stores/chat-store';

export function ChatStoreTest({ pageId }: { pageId: string }) {
  const { messages, addMessage, clearMessages } = useChatMessages(pageId);
  const { isSidebarOpen, toggleSidebar } = useChatSidebar();
  const activePageId = useChatStore((state) => state.activePageId);
  const setActivePageId = useChatStore((state) => state.setActivePageId);

  const handleAddMessage = () => {
    addMessage({
      role: 'user',
      content: `Test message at ${new Date().toLocaleTimeString()}`,
    });
  };

  const handleAddAssistantMessage = () => {
    addMessage({
      role: 'assistant',
      content: 'This is an AI response with some data analysis.',
      metadata: {
        sql: 'SELECT * FROM customers LIMIT 10',
        chartType: 'bar',
      },
    });
  };

  return (
    <div className="p-4 border rounded-lg bg-white shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Chat Store Test</h3>
      
      <div className="space-y-4">
        {/* Store Status */}
        <div className="p-3 bg-gray-50 rounded">
          <p className="text-sm font-medium mb-1">Store Status:</p>
          <p className="text-sm">Active Page ID: {activePageId || 'None'}</p>
          <p className="text-sm">Sidebar Open: {isSidebarOpen ? 'Yes' : 'No'}</p>
          <p className="text-sm">Messages Count: {messages.length}</p>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActivePageId(pageId)}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Set Active Page
          </button>
          
          <button
            onClick={toggleSidebar}
            className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
          >
            Toggle Sidebar
          </button>
          
          <button
            onClick={handleAddMessage}
            className="px-3 py-1 text-sm bg-green-500 text-white rounded hover:bg-green-600"
          >
            Add User Message
          </button>
          
          <button
            onClick={handleAddAssistantMessage}
            className="px-3 py-1 text-sm bg-purple-500 text-white rounded hover:bg-purple-600"
          >
            Add AI Message
          </button>
          
          <button
            onClick={clearMessages}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
          >
            Clear Messages
          </button>
        </div>

        {/* Messages Display */}
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Messages:</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500">No messages yet</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-2 rounded text-sm ${
                    msg.role === 'user' 
                      ? 'bg-blue-50 text-blue-900' 
                      : 'bg-gray-50 text-gray-900'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="font-medium capitalize">{msg.role}:</span>
                    <span className="text-xs text-gray-500">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p>{msg.content}</p>
                  {msg.metadata && (
                    <div className="mt-1 text-xs text-gray-600">
                      {msg.metadata.sql && (
                        <p>SQL: <code className="bg-gray-200 px-1">{msg.metadata.sql}</code></p>
                      )}
                      {msg.metadata.chartType && (
                        <p>Chart: {msg.metadata.chartType}</p>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}