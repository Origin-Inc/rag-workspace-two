import { useState, useEffect, useRef } from "react";
import type { Block } from "~/types/blocks";
import { cn } from "~/utils/cn";
import Prism from 'prismjs';
import 'prismjs/themes/prism-tomorrow.css';

// Import language support
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';

interface CodeBlockProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  isSelected: boolean;
  isEditing: boolean;
}

export const CodeBlock = ({ block, onChange, isSelected, isEditing }: CodeBlockProps) => {
  const [language, setLanguage] = useState(block.content.language || "javascript");
  const [highlightedCode, setHighlightedCode] = useState('');
  const [showHighlight, setShowHighlight] = useState(!isEditing);
  const codeRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const code = block.content.code || '';

  // Apply syntax highlighting
  useEffect(() => {
    if (language && Prism.languages[language]) {
      const highlighted = Prism.highlight(code, Prism.languages[language], language);
      setHighlightedCode(highlighted);
    } else {
      setHighlightedCode(code);
    }
  }, [code, language]);

  // Toggle between edit and view mode
  useEffect(() => {
    setShowHighlight(!isEditing);
  }, [isEditing]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      
      // Insert 2 spaces for tab
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      onChange({ content: { ...block.content, code: newValue } });
      
      // Restore cursor position
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const lineCount = code.split('\n').length;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <div className={cn(
      "w-full h-full bg-gray-900 rounded-lg overflow-hidden",
      isSelected && "ring-2 ring-blue-500"
    )}>
      <div className="flex items-center justify-between p-2 border-b border-gray-800">
        <select
          value={language}
          onChange={(e) => {
            setLanguage(e.target.value);
            onChange({ content: { ...block.content, language: e.target.value } });
          }}
          className="bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded"
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="jsx">JSX</option>
          <option value="tsx">TSX</option>
          <option value="python">Python</option>
          <option value="css">CSS</option>
          <option value="json">JSON</option>
          <option value="bash">Bash</option>
          <option value="sql">SQL</option>
          <option value="yaml">YAML</option>
          <option value="markdown">Markdown</option>
        </select>
        
        <button
          onClick={() => navigator.clipboard.writeText(code)}
          className="px-2 py-1 text-xs bg-gray-800 text-gray-400 rounded hover:bg-gray-700 hover:text-gray-200"
          title="Copy code"
        >
          Copy
        </button>
      </div>
      
      <div className="relative h-[calc(100%-3rem)]">
        {/* Line numbers */}
        <div className="absolute left-0 top-0 p-2 pr-0 text-gray-500 text-xs font-mono select-none"
             style={{ width: '2.5rem' }}>
          {lineNumbers.map((num) => (
            <div key={num} className="leading-5 text-right pr-2">
              {num}
            </div>
          ))}
        </div>
        
        {/* Code content */}
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={code}
            onChange={(e) => onChange({ content: { ...block.content, code: e.target.value } })}
            onKeyDown={handleKeyDown}
            className="absolute inset-0 w-full h-full bg-transparent text-gray-200 font-mono text-sm resize-none focus:outline-none p-2"
            style={{ paddingLeft: '3rem', lineHeight: '1.25rem' }}
            placeholder="// Enter code here..."
            spellCheck={false}
          />
        ) : (
          <pre
            ref={codeRef}
            className="absolute inset-0 w-full h-full overflow-auto p-2 text-gray-200 font-mono text-sm"
            style={{ paddingLeft: '3rem', lineHeight: '1.25rem' }}
          >
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedCode || code }}
            />
          </pre>
        )}
      </div>
    </div>
  );
};