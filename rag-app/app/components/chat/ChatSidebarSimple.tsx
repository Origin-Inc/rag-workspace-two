import { useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';

interface ChatSidebarSimpleProps {
  pageId: string;
}

// Extremely simple version to test if the issue is in the component logic
export function ChatSidebarSimple({ pageId }: ChatSidebarSimpleProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  console.log('[ChatSidebarSimple] Render', { pageId, isOpen });
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 bg-white border-l border-gray-200 rounded-l-lg p-2 shadow-lg hover:bg-gray-50 z-40"
        aria-label="Open chat sidebar"
      >
        <ChevronLeft className="w-5 h-5" />
      </button>
    );
  }
  
  return (
    <div className="fixed right-0 top-0 h-full w-[30%] bg-white border-l border-gray-200 shadow-xl z-50 p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Chat</h2>
        <button onClick={() => setIsOpen(false)}>
          <X className="w-5 h-5" />
        </button>
      </div>
      <p className="text-gray-500">Simple chat sidebar for page: {pageId}</p>
    </div>
  );
}