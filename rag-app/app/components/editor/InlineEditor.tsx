import { useRef, useEffect, useCallback, useState, memo, forwardRef, useImperativeHandle } from 'react';
import { cn } from '~/utils/cn';

export interface InlineEditorProps {
  value: string;
  onChange?: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLDivElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLDivElement>) => void;
  placeholder?: string;
  className?: string;
  readOnly?: boolean;
  autoFocus?: boolean;
  singleLine?: boolean;
  allowFormatting?: boolean;
  maxLength?: number;
  spellCheck?: boolean;
  'data-testid'?: string;
}

export interface InlineEditorRef {
  focus: () => void;
  blur: () => void;
  selectAll: () => void;
  getSelection: () => { start: number; end: number; text: string } | null;
  setSelection: (start: number, end: number) => void;
  insertText: (text: string, replaceSelection?: boolean) => void;
  format: (command: string, value?: string) => void;
}

/**
 * Production-ready inline editor with contentEditable
 * Supports rich text formatting, keyboard navigation, and proper event handling
 */
export const InlineEditor = memo(forwardRef<InlineEditorRef, InlineEditorProps>(({
  value,
  onChange,
  onKeyDown,
  onFocus,
  onBlur,
  onPaste,
  placeholder,
  className,
  readOnly = false,
  autoFocus = false,
  singleLine = false,
  allowFormatting = true,
  maxLength,
  spellCheck = true,
  'data-testid': testId,
}, ref) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [isEmpty, setIsEmpty] = useState(!value);
  const [isFocused, setIsFocused] = useState(false);
  const lastValueRef = useRef(value);
  const isComposing = useRef(false);
  const isInternalChange = useRef(false);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    focus: () => editorRef.current?.focus(),
    blur: () => editorRef.current?.blur(),
    selectAll: () => {
      if (!editorRef.current) return;
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    getSelection: () => {
      const selection = window.getSelection();
      if (!selection || !editorRef.current) return null;
      
      const range = selection.getRangeAt(0);
      const preSelectionRange = range.cloneRange();
      preSelectionRange.selectNodeContents(editorRef.current);
      preSelectionRange.setEnd(range.startContainer, range.startOffset);
      const start = preSelectionRange.toString().length;
      const end = start + range.toString().length;
      
      return {
        start,
        end,
        text: range.toString(),
      };
    },
    setSelection: (start: number, end: number) => {
      if (!editorRef.current) return;
      
      const textNode = editorRef.current.firstChild || editorRef.current;
      const range = document.createRange();
      const selection = window.getSelection();
      
      range.setStart(textNode, Math.min(start, textNode.textContent?.length || 0));
      range.setEnd(textNode, Math.min(end, textNode.textContent?.length || 0));
      
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    insertText: (text: string, replaceSelection = true) => {
      if (!editorRef.current) return;
      
      const selection = window.getSelection();
      if (!selection) return;
      
      if (replaceSelection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(text);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        document.execCommand('insertText', false, text);
      }
      
      handleInput();
    },
    format: (command: string, value?: string) => {
      if (!allowFormatting || readOnly) return;
      document.execCommand(command, false, value);
      handleInput();
    },
  }), [allowFormatting, readOnly]);

  // Initialize content on mount and when value prop changes externally
  useEffect(() => {
    if (!editorRef.current) return;
    
    // Skip if this is an internal change (from user typing)
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    
    // Don't update if user is actively editing
    if (isComposing.current || isFocused) return;
    
    const currentContent = allowFormatting 
      ? editorRef.current.innerHTML
      : editorRef.current.textContent || '';
    const newContent = value || '';
    
    // Only update DOM if content is actually different
    if (currentContent !== newContent) {
      if (allowFormatting) {
        editorRef.current.innerHTML = newContent;
      } else {
        editorRef.current.textContent = newContent;
      }
      lastValueRef.current = value;
      setIsEmpty(!value);
    }
  }, [value, allowFormatting]);

  // Auto focus
  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  const handleInput = useCallback((e?: Event) => {
    if (!editorRef.current || isComposing.current) return;
    
    let newValue = allowFormatting 
      ? editorRef.current.innerHTML 
      : editorRef.current.textContent || '';
    
    console.log('InlineEditor handleInput:', { newValue, allowFormatting, lastValue: lastValueRef.current });
    
    // Handle max length
    if (maxLength && newValue.length > maxLength) {
      newValue = newValue.slice(0, maxLength);
      if (allowFormatting) {
        editorRef.current.innerHTML = newValue;
      } else {
        editorRef.current.textContent = newValue;
      }
    }
    
    // Check for actual content (not just HTML tags)
    const hasContent = editorRef.current.textContent?.trim() || '';
    setIsEmpty(!hasContent);
    
    // Mark this as an internal change to prevent re-rendering from resetting content
    isInternalChange.current = true;
    lastValueRef.current = newValue;
    console.log('InlineEditor calling onChange with:', newValue);
    onChange?.(newValue);
  }, [onChange, allowFormatting, maxLength]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    // Prevent newlines in single line mode
    if (singleLine && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Handle formatting shortcuts
    if (allowFormatting && (e.metaKey || e.ctrlKey)) {
      switch (e.key) {
        case 'b':
          e.preventDefault();
          document.execCommand('bold', false);
          handleInput();
          break;
        case 'i':
          e.preventDefault();
          document.execCommand('italic', false);
          handleInput();
          break;
        case 'u':
          e.preventDefault();
          document.execCommand('underline', false);
          handleInput();
          break;
      }
    }
    
    onKeyDown?.(e);
  }, [singleLine, allowFormatting, onKeyDown, handleInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    if (!allowFormatting) {
      // Strip formatting on paste
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertText', false, text);
      handleInput();
    }
    
    onPaste?.(e);
  }, [allowFormatting, onPaste, handleInput]);

  const handleFocus = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    setIsFocused(true);
    onFocus?.(e);
  }, [onFocus]);

  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    setIsFocused(false);
    handleInput(); // Ensure final value is saved
    onBlur?.(e);
  }, [onBlur, handleInput]);

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposing.current = false;
    handleInput();
  }, [handleInput]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={editorRef}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        spellCheck={spellCheck}
        data-testid={testId}
        className={cn(
          "outline-none",
          singleLine && "whitespace-nowrap overflow-hidden text-ellipsis",
          readOnly && "cursor-default",
          isEmpty && !isFocused && "text-gray-400"
        )}
        style={{
          minHeight: singleLine ? 'auto' : '1.5em',
          wordBreak: 'break-word',
          overflowWrap: 'break-word',
        }}
        role="textbox"
        aria-multiline={!singleLine}
        aria-readonly={readOnly}
        aria-placeholder={placeholder}
        aria-label={placeholder}
      />
      
      {/* Placeholder */}
      {isEmpty && !isFocused && placeholder && (
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