import { ChatSidebarSimple } from '~/components/chat/ChatSidebarSimple';
import { ChatSidebarMinimal } from '~/components/chat/ChatSidebarMinimal';
import { ChatSidebar } from '~/components/chat/ChatSidebar';
import { ClientOnly } from '~/components/ClientOnly';
import { useState, useEffect } from 'react';

export default function TestSidebar() {
  const [testType, setTestType] = useState<'simple' | 'minimal' | 'full' | 'wrapped'>('simple');
  
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Chat Sidebar Test Page</h1>
        
        <div className="bg-white rounded-lg p-6 mb-4">
          <h2 className="text-lg font-semibold mb-4">Test Controls</h2>
          <div className="space-x-4">
            <button
              onClick={() => setTestType('simple')}
              className={`px-4 py-2 rounded ${testType === 'simple' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Simple (No Store)
            </button>
            <button
              onClick={() => setTestType('minimal')}
              className={`px-4 py-2 rounded ${testType === 'minimal' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Minimal Store
            </button>
            <button
              onClick={() => setTestType('full')}
              className={`px-4 py-2 rounded ${testType === 'full' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Full Store
            </button>
            <button
              onClick={() => setTestType('wrapped')}
              className={`px-4 py-2 rounded ${testType === 'wrapped' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
              Wrapped in ClientOnly
            </button>
          </div>
        </div>
        
        <div className="bg-white rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4">Console Output</h2>
          <p className="text-sm text-gray-600">
            Open browser console to see detailed logging
          </p>
        </div>
      </div>
      
      {/* Render selected sidebar type */}
      {testType === 'simple' && (
        <ChatSidebarSimple pageId="test-page-123" />
      )}
      
      {testType === 'minimal' && (
        <ChatSidebarMinimal pageId="test-page-123" />
      )}
      
      {testType === 'full' && (
        <ChatSidebar 
          pageId="test-page-123"
          onSendMessage={async (msg) => console.log('Message:', msg)}
          onFileUpload={async (file) => console.log('File:', file)}
        />
      )}
      
      {testType === 'wrapped' && (
        <ClientOnly fallback={<div>Loading...</div>}>
          <ChatSidebar 
            pageId="test-page-123"
            onSendMessage={async (msg) => console.log('Message:', msg)}
            onFileUpload={async (file) => console.log('File:', file)}
          />
        </ClientOnly>
      )}
    </div>
  );
}