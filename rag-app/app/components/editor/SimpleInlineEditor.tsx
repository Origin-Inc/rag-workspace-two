import { useRef, useEffect, useCallback, useState, memo, forwardRef, useImperativeHandle } from 'react';
import { cn } from '~/utils/cn';

export interface SimpleInlineEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  singleLine?: boolean;
  'data-testid'?: string;
}

/**
 * Simplified inline editor that works properly with React re-renders
 */
export const SimpleInlineEditor = memo(forwardRef<HTMLDivElement, SimpleInlineEditorProps>(({
  value,
  onChange,
  onKeyDown,
  placeholder,
  className,
  readOnly = false,
  autoFocus = false,
  singleLine = false,
  'data-testid': testId,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);
  const [isFocused, setIsFocused] = useState(false);
  const hasInitialized = useRef(false);

  // Combine refs
  useImperativeHandle(ref, () => editorRef.current!, []);

  // Initialize content only on first mount
  useEffect(() => {
    if (!editorRef.current || hasInitialized.current) return;
    
    // Only set initial content if not focused
    if (!isFocused) {
      editorRef.current.textContent = value || '';
      setIsEmpty(!value);
      hasInitialized.current = true;
    }
  }, [value, isFocused]);

  // Handle input changes
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    
    const newValue = editorRef.current.textContent || '';
    setIsEmpty(!newValue);
    onChange?.(newValue);
  }, [onChange]);

  // Handle keyboard events
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Prevent newlines in single line mode
    if (singleLine && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
    }
    
    onKeyDown?.(e);
  }, [singleLine, onKeyDown]);

  // Handle paste to strip formatting
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  }, []);

  // Handle focus
  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  // Handle blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
  }, []);

  // Auto focus
  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  return (
    <div className={cn("relative inline-block w-full", className)}>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        data-testid={testId}
        className={cn(
          "outline-none",
          singleLine && "whitespace-nowrap overflow-hidden text-ellipsis",
          readOnly && "cursor-default",
        )}
        role="textbox"
        aria-multiline={!singleLine}
        aria-readonly={readOnly}
        aria-placeholder={placeholder}
        aria-label={placeholder}
      />
      
      {/* Placeholder */}
      {isEmpty && placeholder && (
        <div 
          className="absolute inset-0 pointer-events-none text-gray-400"
          aria-hidden="true"
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}));

SimpleInlineEditor.displayName = 'SimpleInlineEditor';