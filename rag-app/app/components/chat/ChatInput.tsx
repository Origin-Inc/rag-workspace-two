import { useState, useRef, KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { cn } from '~/utils/cn';
import { FileReferenceSuggestions } from './FileReferenceSuggestions';
import { useChatDataFiles } from '~/stores/chat-store-ultimate-fix';

interface ChatInputProps {
  pageId: string;
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function ChatInput({ 
  pageId,
  onSendMessage, 
  disabled = false, 
  placeholder = "Ask a question...",
  className 
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
      "border-t border-gray-200 dark:border-gray-700 p-4 bg-white relative dark:bg-dark-secondary",
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
      
      <div className="flex items-end gap-2">
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
            "flex-1 resize-none rounded-lg px-3 py-2 dark:bg-dark-secondary",
            "bg-white dark:bg-dark-secondary",
            "text-gray-900 dark:text-gray-100",
            "border border-gray-200 dark:border-gray-700",
            "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
            "disabled:bg-gray-100 disabled:text-gray-500 dark:disabled:bg-gray-800",
            "min-h-[40px] max-h-[120px]"
          )}
          style={{ height: '40px' }}
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !input.trim()}
          className={cn(
            "p-2 rounded-lg transition-colors",
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
      <p className="text-xs text-gray-500 mt-2">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}