import { useRef, useCallback, useState, memo, forwardRef, useImperativeHandle } from 'react';
import { cn } from '~/utils/cn';

export interface UncontrolledEditorProps {
  initialValue?: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  singleLine?: boolean;
  'data-testid'?: string;
}

/**
 * Completely uncontrolled editor that maintains its own state
 */
export const UncontrolledEditor = memo(forwardRef<HTMLDivElement, UncontrolledEditorProps>(({
  initialValue = '',
  onChange,
  onKeyDown,
  placeholder,
  className,
  readOnly = false,
  singleLine = false,
  'data-testid': testId,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!initialValue);

  // Combine refs
  useImperativeHandle(ref, () => editorRef.current!, []);

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
    handleInput();
  }, [handleInput]);

  return (
    <div className={cn("relative inline-block w-full", className)}>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        data-testid={testId}
        className={cn(
          "outline-none min-h-[1.5em]",
          singleLine && "whitespace-nowrap overflow-hidden text-ellipsis",
          readOnly && "cursor-default",
        )}
        role="textbox"
        aria-multiline={!singleLine}
        aria-readonly={readOnly}
        aria-placeholder={placeholder}
        aria-label={placeholder}
        dangerouslySetInnerHTML={{ __html: initialValue }}
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

UncontrolledEditor.displayName = 'UncontrolledEditor';