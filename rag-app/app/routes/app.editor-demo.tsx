import { useState } from "react";
import { EnhancedBlockEditor } from "~/components/editor/EnhancedBlockEditor";
import { ClientOnly } from "~/components/ClientOnly";

export default function TestEditor() {
  
  const [blocks, setBlocks] = useState([
    { id: '1', type: 'heading1' as const, content: 'Welcome to Enhanced Block Editor!', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '2', type: 'paragraph' as const, content: 'Try typing "/" for slash commands or use markdown shortcuts like # for headings, * for lists!', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '3', type: 'heading2' as const, content: 'Core Block Types', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '4', type: 'bulletList' as const, content: '✨ Rich text support with formatting', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '5', type: 'bulletList' as const, content: '🚀 Virtual scrolling for performance', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '6', type: 'bulletList' as const, content: '🎨 Syntax highlighting for code blocks', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '7', type: 'bulletList' as const, content: '⚡ Block transformations with markdown shortcuts', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '8', type: 'heading3' as const, content: 'Code Block with Syntax Highlighting', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '9', type: 'code' as const, content: { code: `// Example React component with syntax highlighting
import React, { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0);
  
  return (
    <div className="counter">
      <h2>Count: {count}</h2>
      <button onClick={() => setCount(count + 1)}>
        Increment
      </button>
    </div>
  );
}

export default Counter;`, language: 'typescript' }, metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1, language: 'typescript' } },
    { id: '10', type: 'quote' as const, content: 'This editor now supports Prism.js syntax highlighting for 20+ programming languages!', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '11', type: 'heading3' as const, content: 'Try These Markdown Shortcuts', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '12', type: 'paragraph' as const, content: '# → Heading 1 | ## → Heading 2 | * → Bullet list | > → Quote | ``` → Code block', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
  ]);

  const handleSave = (newContent: string) => {
    console.log('Saving content:', newContent);
    // In production, this would save to the database
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto py-8">
        <div className="bg-white rounded-lg shadow-lg">
          <div className="border-b border-gray-200 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              Notion-Style Block Editor
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Virtual scrolling block editor with syntax highlighting and transformations
            </p>
          </div>
          
          <ClientOnly fallback={<div className="h-[600px] bg-gray-50 animate-pulse rounded-lg" />}>
            <div className="h-[600px]">
              <EnhancedBlockEditor
                initialBlocks={blocks}
                onChange={setBlocks}
                onSave={(blocks) => console.log('Saving blocks:', blocks)}
                className="h-full"
              />
            </div>
          </ClientOnly>
        </div>
        
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-4">
            Block Data Structure (JSON)
          </h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-xs">
            <code>
              {JSON.stringify(blocks, null, 2)}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}