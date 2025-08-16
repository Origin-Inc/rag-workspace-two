import { useState } from "react";
import { TiptapEditor } from "~/components/editor/TiptapEditor";
import { BlockEditor } from "~/components/editor/BlockEditor";
import { LexicalBlockEditor } from "~/components/editor/LexicalBlockEditor";
import { ClientOnly } from "~/components/ClientOnly";

export default function TestEditor() {
  const [activeEditor, setActiveEditor] = useState<'tiptap' | 'blocks'>('blocks');
  const [content, setContent] = useState<string>(`
    <h1>Welcome to the New Tiptap Editor!</h1>
    <p>This is a modern, Notion-style block editor built with Tiptap.</p>
    <h2>Features</h2>
    <ul>
      <li>Rich text formatting (bold, italic, strikethrough)</li>
      <li>Headings (H1, H2, H3)</li>
      <li>Lists (bullet and numbered)</li>
      <li>Code blocks and inline code</li>
      <li>Blockquotes</li>
      <li>Slash commands (press "/" to see options)</li>
      <li>Keyboard shortcuts (Cmd+B for bold, Cmd+I for italic, etc.)</li>
      <li>Auto-save functionality</li>
    </ul>
    <h2>Try it out!</h2>
    <p>Start typing below or press "/" to insert blocks:</p>
  `);
  
  const [blocks, setBlocks] = useState([
    { id: '1', type: 'heading1' as const, content: 'Welcome to Block Editor!', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '2', type: 'paragraph' as const, content: 'This is a virtual scrolling block editor with advanced features.', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '3', type: 'heading2' as const, content: 'Features', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '4', type: 'bulletList' as const, content: 'Virtual scrolling for performance', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '5', type: 'bulletList' as const, content: 'Block-based architecture', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '6', type: 'bulletList' as const, content: 'Drag and drop support', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '7', type: 'bulletList' as const, content: 'Keyboard navigation', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '8', type: 'quote' as const, content: 'This editor can handle thousands of blocks efficiently!', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
    { id: '9', type: 'code' as const, content: 'const editor = new BlockEditor();\neditor.render();', metadata: { createdAt: new Date(), updatedAt: new Date(), version: 1 } },
  ]);

  const handleSave = (newContent: string) => {
    console.log('Saving content:', newContent);
    // In production, this would save to the database
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto py-8">
        {/* Editor selector */}
        <div className="mb-6 flex gap-4 justify-center">
          <button
            onClick={() => setActiveEditor('blocks')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeEditor === 'blocks' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Block Editor (Virtual Scrolling)
          </button>
          <button
            onClick={() => setActiveEditor('tiptap')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeEditor === 'tiptap' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            Tiptap Editor (Rich Text)
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-lg">
          <div className="border-b border-gray-200 px-6 py-4">
            <h1 className="text-2xl font-bold text-gray-900">
              {activeEditor === 'tiptap' ? 'Tiptap Editor Demo' : 'Block Editor Demo'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {activeEditor === 'tiptap' 
                ? 'Rich text editor with slash commands' 
                : 'Virtual scrolling block editor for performance'}
            </p>
          </div>
          
          <ClientOnly fallback={<div className="h-[600px] bg-gray-50 animate-pulse rounded-lg" />}>
            {activeEditor === 'tiptap' ? (
              <TiptapEditor
                content={content}
                onChange={setContent}
                onSave={handleSave}
                editable={true}
                placeholder="Start typing or press '/' for commands..."
                className="min-h-[600px]"
                autoFocus
              />
            ) : (
              <div className="h-[600px]">
                <LexicalBlockEditor
                  initialBlocks={blocks}
                  onChange={setBlocks}
                  onSave={(blocks) => console.log('Saving blocks:', blocks)}
                  className="h-full"
                />
              </div>
            )}
          </ClientOnly>
        </div>
        
        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-lg font-semibold mb-4">
            {activeEditor === 'tiptap' ? 'Editor Output (HTML)' : 'Editor Output (Blocks)'}
          </h2>
          <pre className="bg-gray-100 p-4 rounded overflow-x-auto text-xs">
            <code>
              {activeEditor === 'tiptap' 
                ? content 
                : JSON.stringify(blocks, null, 2)}
            </code>
          </pre>
        </div>
      </div>
    </div>
  );
}