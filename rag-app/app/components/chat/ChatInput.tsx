import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Loader2, Plus } from 'lucide-react';
import { cn } from '~/utils/cn';
import { FileReferenceSuggestions } from './FileReferenceSuggestions';
import { useChatDataFiles } from '~/hooks/use-chat-atoms';

interface ChatInputProps {
  pageId: string;
  onSendMessage: (message: string) => void;
  onFileUpload?: (file: File) => Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({ 
  pageId,
  onSendMessage,
  onFileUpload,
  disabled = false, 
  placeholder = "Ask a question...",
  className 
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { dataFiles } = useChatDataFiles(pageId);
  
  const handleSubmit = () => {
    if (input.trim() && !disabled) {
      onSendMessage(input.trim());
      setInput('');
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };
  
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInput(newValue);
    // Show suggestions when user types and has files
    setShowSuggestions(newValue.length > 0 && dataFiles.length > 0);
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };
  
  const handleSelectSuggestion = (suggestion: string) => {
    setInput(suggestion);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  };
  
  return (
    <div className={cn(
      "border-t border-theme-border-primary p-4 relative bg-theme-bg-primary",
      className
    )}>
      {/* File reference suggestions */}
      {showSuggestions && (
        <FileReferenceSuggestions
          query={input}
          dataFiles={dataFiles}
          onSelectFile={(file) => {
            setInput(`Show data from ${file.filename}`);
            setShowSuggestions(false);
            textareaRef.current?.focus();
          }}
          onSelectSuggestion={handleSelectSuggestion}
        />
      )}
      
      <div className="flex items-end gap-2 w-full">
        {onFileUpload && (
          <button
            id="upload-file"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className={cn(
              "p-2 rounded-lg transition-colors flex-shrink-0",
              "text-gray-500 hover:text-gray-700 hover:bg-gray-100",
              "dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "flex items-center justify-center"
            )}
            aria-label="Upload file"
            title="Upload CSV or Excel file"
          >
            <Plus className="w-5 h-5" />
          </button>
        )}
        
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(input.length > 0 && dataFiles.length > 0)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-lg px-3 py-2 bg-theme-text-highlight",
            "bg-theme-text-highlight",
            "text-theme-text-primary",
            "disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800",
            "min-h-[40px] max-h-[120px]"
          )}
          style={{ height: '40px' }}
        />
        <button
          id="send-message"
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className={cn(
            "p-2 rounded-lg transition-colors flex-shrink-0",
            "bg-blue-500 text-white hover:bg-blue-600",
            "disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed",
            "flex items-center justify-center"
          )}
          aria-label="Send message"
        >
          {disabled ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
      
      {/* Hidden file input */}
      {onFileUpload && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (file) {
              await onFileUpload(file);
              // Reset the input so the same file can be selected again
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }
          }}
        />
      )}
    </div>
  );
}