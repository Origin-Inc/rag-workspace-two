import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InlineEditor } from './InlineEditor';
import { createRef } from 'react';

describe('InlineEditor', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
  });

  describe('Basic functionality', () => {
    it('should render with initial value', () => {
      render(<InlineEditor value="Hello World" data-testid="editor" />);
      const editor = screen.getByTestId('editor');
      expect(editor.textContent).toBe('Hello World');
    });

    it('should show placeholder when empty', () => {
      render(<InlineEditor value="" placeholder="Enter text..." />);
      expect(screen.getByText('Enter text...')).toBeInTheDocument();
    });

    it('should hide placeholder when focused', async () => {
      render(<InlineEditor value="" placeholder="Enter text..." data-testid="editor" />);
      const editor = screen.getByTestId('editor');
      
      await user.click(editor);
      expect(screen.queryByText('Enter text...')).not.toBeInTheDocument();
    });

    it('should call onChange when content changes', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onChange={onChange} 
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      await user.type(editor, 'Test');
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('Test'));
      });
    });

    it('should be read-only when readOnly prop is true', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="Initial" 
          onChange={onChange}
          readOnly={true}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      expect(editor).toHaveAttribute('contentEditable', 'false');
      
      await user.click(editor);
      await user.type(editor, 'Test');
      
      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('Formatting', () => {
    it('should allow formatting when allowFormatting is true', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="Test" 
          onChange={onChange}
          allowFormatting={true}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      // Select all text
      await user.keyboard('{Control>}a{/Control}');
      
      // Apply bold
      await user.keyboard('{Control>}b{/Control}');
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('should strip formatting on paste when allowFormatting is false', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onChange={onChange}
          allowFormatting={false}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      // Create paste event with formatted HTML
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      pasteEvent.clipboardData?.setData('text/html', '<b>Bold Text</b>');
      pasteEvent.clipboardData?.setData('text/plain', 'Bold Text');
      
      fireEvent.paste(editor, pasteEvent);
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith('Bold Text');
      });
    });
  });

  describe('Single line mode', () => {
    it('should prevent Enter key in single line mode', async () => {
      const onKeyDown = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onKeyDown={onKeyDown}
          singleLine={true}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      fireEvent.keyDown(editor, event);
      
      expect(onKeyDown).toHaveBeenCalled();
      const call = onKeyDown.mock.calls[0][0];
      expect(call.defaultPrevented).toBe(true);
    });

    it('should apply text-ellipsis in single line mode', () => {
      render(
        <InlineEditor 
          value="Very long text that should be truncated" 
          singleLine={true}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      expect(editor.className).toContain('whitespace-nowrap');
      expect(editor.className).toContain('overflow-hidden');
      expect(editor.className).toContain('text-ellipsis');
    });
  });

  describe('Max length', () => {
    it('should enforce max length', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onChange={onChange}
          maxLength={5}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      await user.type(editor, 'Hello World');
      
      await waitFor(() => {
        const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
        expect(lastCall[0].length).toBeLessThanOrEqual(5);
      });
    });
  });

  describe('Ref methods', () => {
    it('should expose focus method', async () => {
      const ref = createRef<any>();
      render(
        <InlineEditor 
          ref={ref}
          value="" 
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      expect(document.activeElement).not.toBe(editor);
      
      ref.current?.focus();
      await waitFor(() => {
        expect(document.activeElement).toBe(editor);
      });
    });

    it('should expose blur method', async () => {
      const ref = createRef<any>();
      render(
        <InlineEditor 
          ref={ref}
          value="" 
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      expect(document.activeElement).toBe(editor);
      
      ref.current?.blur();
      await waitFor(() => {
        expect(document.activeElement).not.toBe(editor);
      });
    });

    it('should expose selectAll method', async () => {
      const ref = createRef<any>();
      render(
        <InlineEditor 
          ref={ref}
          value="Select this text" 
          data-testid="editor"
        />
      );
      
      ref.current?.selectAll();
      
      await waitFor(() => {
        const selection = window.getSelection();
        expect(selection?.toString()).toBe('Select this text');
      });
    });

    it('should expose insertText method', async () => {
      const ref = createRef<any>();
      const onChange = vi.fn();
      render(
        <InlineEditor 
          ref={ref}
          value="Hello" 
          onChange={onChange}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      ref.current?.insertText(' World');
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalledWith(expect.stringContaining('World'));
      });
    });

    it('should expose format method', async () => {
      const ref = createRef<any>();
      const onChange = vi.fn();
      render(
        <InlineEditor 
          ref={ref}
          value="Format me" 
          onChange={onChange}
          allowFormatting={true}
          data-testid="editor"
        />
      );
      
      ref.current?.selectAll();
      ref.current?.format('bold');
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });
  });

  describe('Keyboard shortcuts', () => {
    it('should handle Cmd+B for bold', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="Bold text" 
          onChange={onChange}
          allowFormatting={true}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      // Select all and bold
      await user.keyboard('{Meta>}a{/Meta}');
      await user.keyboard('{Meta>}b{/Meta}');
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('should handle Cmd+I for italic', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="Italic text" 
          onChange={onChange}
          allowFormatting={true}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      // Select all and italicize
      await user.keyboard('{Meta>}a{/Meta}');
      await user.keyboard('{Meta>}i{/Meta}');
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });

    it('should handle Cmd+U for underline', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="Underline text" 
          onChange={onChange}
          allowFormatting={true}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      // Select all and underline
      await user.keyboard('{Meta>}a{/Meta}');
      await user.keyboard('{Meta>}u{/Meta}');
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });
  });

  describe('Events', () => {
    it('should call onFocus when focused', async () => {
      const onFocus = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onFocus={onFocus}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      expect(onFocus).toHaveBeenCalled();
    });

    it('should call onBlur when blurred', async () => {
      const onBlur = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onBlur={onBlur}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      await user.tab();
      
      expect(onBlur).toHaveBeenCalled();
    });

    it('should call onPaste when content is pasted', async () => {
      const onPaste = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onPaste={onPaste}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      await user.click(editor);
      
      const pasteEvent = new ClipboardEvent('paste', {
        clipboardData: new DataTransfer(),
      });
      pasteEvent.clipboardData?.setData('text/plain', 'Pasted text');
      
      fireEvent.paste(editor, pasteEvent);
      
      expect(onPaste).toHaveBeenCalled();
    });
  });

  describe('Composition events', () => {
    it('should handle composition events for IME input', async () => {
      const onChange = vi.fn();
      render(
        <InlineEditor 
          value="" 
          onChange={onChange}
          data-testid="editor"
        />
      );
      
      const editor = screen.getByTestId('editor');
      
      // Start composition
      fireEvent.compositionStart(editor);
      
      // During composition, onChange shouldn't be called
      editor.textContent = '你好';
      fireEvent.input(editor);
      expect(onChange).not.toHaveBeenCalled();
      
      // End composition
      fireEvent.compositionEnd(editor);
      
      await waitFor(() => {
        expect(onChange).toHaveBeenCalled();
      });
    });
  });
});