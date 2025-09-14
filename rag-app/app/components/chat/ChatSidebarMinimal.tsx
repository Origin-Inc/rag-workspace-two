import { ChevronLeft, X } from 'lucide-react';
import { useMinimalChatStore } from '~/stores/chat-store-minimal';

interface ChatSidebarMinimalProps {
  pageId: string;
}

// Test with minimal Zustand store
export function ChatSidebarMinimal({ pageId }: ChatSidebarMinimalProps) {
  const { isOpen, messages, setOpen, addMessage } = useMinimalChatStore();
  
  console.log('[ChatSidebarMinimal] Render', { pageId, isOpen, messageCount: messages.length });
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border-l border-gray-200 rounded-l-lg p-2 shadow-lg hover:bg-gray-50 z-40"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    );
  }
  
  return (
    <div className="fixed right-0 top-0 h-full w-[30%] bg-white border-l border-gray-200 shadow-xl z-50 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Minimal Chat</h2>
        <button onClick={() => setOpen(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>
      
      <div className="mb-4">
        <button 
          onClick={() => addMessage(`Test message ${messages.length + 1}`)}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Add Message
        </button>
      </div>
      
      <div className="space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className="p-2 bg-gray-100 rounded">
            {msg}
          </div>
        ))}
      </div>
      
      <p className="text-gray-500 mt-4">Page: {pageId}</p>
    </div>
  );
}