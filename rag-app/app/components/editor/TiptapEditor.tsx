import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { useCallback, useEffect, useRef, useState, memo } from 'react';
import { cn } from '~/utils/cn';
import type { Editor } from '@tiptap/core';
import { SlashMenu } from './SlashMenu';
import {
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link2,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Heading3,
  Quote,
  CodeSquare,
  Undo,
  Redo,
  Plus,
} from 'lucide-react';

interface TiptapEditorProps {
  content?: string;
  onChange?: (content: string) => void;
  onSave?: (content: string) => void;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  autoFocus?: boolean;
}

const MenuButton = memo(({ 
  onClick, 
  isActive, 
  disabled, 
  children, 
  title 
}: { 
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  title?: string;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={title}
    className={cn(
      "p-1.5 rounded hover:bg-gray-100 transition-colors",
      isActive && "bg-gray-100 text-blue-600",
      disabled && "opacity-50 cursor-not-allowed"
    )}
  >
    {children}
  </button>
));

MenuButton.displayName = 'MenuButton';

export const TiptapEditor = memo(function TiptapEditor({
  content = '',
  onChange,
  onSave,
  placeholder = 'Start typing or press "/" for commands...',
  className,
  editable = true,
  autoFocus = false,
}: TiptapEditorProps) {
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ x: 0, y: 0 });
  const editorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        placeholder: {
          placeholder,
        },
      }),
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
        showOnlyCurrent: true,
      }),
      Typography,
    ],
    content,
    editable,
    autofocus: autoFocus,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onChange?.(html);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose lg:prose-lg xl:prose-xl focus:outline-none min-h-[500px] max-w-none',
      },
      handleKeyDown: (view, event) => {
        // Handle slash command
        if (event.key === '/' && !showSlashMenu) {
          const coords = view.coordsAtPos(view.state.selection.from);
          setSlashMenuPosition({
            x: coords.left,
            y: coords.bottom + 5,
          });
          setShowSlashMenu(true);
          return true;
        }

        // Close slash menu on Escape
        if (event.key === 'Escape' && showSlashMenu) {
          setShowSlashMenu(false);
          return true;
        }

        // Save on Cmd/Ctrl + S
        if ((event.metaKey || event.ctrlKey) && event.key === 's') {
          event.preventDefault();
          onSave?.(editor?.getHTML() || '');
          return true;
        }

        return false;
      },
    },
  });

  const handleSlashCommand = useCallback((command: any) => {
    if (!editor) return;

    // Remove the slash character
    editor.chain().focus().deleteRange({
      from: editor.state.selection.from - 1,
      to: editor.state.selection.from,
    }).run();

    // Execute the command
    switch (command.type) {
      case 'heading1':
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case 'heading2':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'heading3':
        editor.chain().focus().toggleHeading({ level: 3 }).run();
        break;
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run();
        break;
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run();
        break;
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      case 'codeBlock':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'horizontalRule':
        editor.chain().focus().setHorizontalRule().run();
        break;
      default:
        break;
    }

    setShowSlashMenu(false);
  }, [editor]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        editor.chain().focus().undo().run();
      }

      // Redo
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        editor.chain().focus().redo().run();
      }

      // Bold
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault();
        editor.chain().focus().toggleBold().run();
      }

      // Italic
      if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
        e.preventDefault();
        editor.chain().focus().toggleItalic().run();
      }

      // Underline
      if ((e.metaKey || e.ctrlKey) && e.key === 'u') {
        e.preventDefault();
        editor.chain().focus().toggleStrike().run();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("relative w-full", className)}>
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-2">
        <div className="flex items-center gap-1">
          {/* Text formatting */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
            <MenuButton
              onClick={() => editor.chain().focus().toggleBold().run()}
              isActive={editor.isActive('bold')}
              title="Bold (⌘B)"
            >
              <Bold className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleItalic().run()}
              isActive={editor.isActive('italic')}
              title="Italic (⌘I)"
            >
              <Italic className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleStrike().run()}
              isActive={editor.isActive('strike')}
              title="Strikethrough"
            >
              <Strikethrough className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleCode().run()}
              isActive={editor.isActive('code')}
              title="Inline code"
            >
              <Code className="w-4 h-4" />
            </MenuButton>
          </div>

          {/* Headings */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              isActive={editor.isActive('heading', { level: 1 })}
              title="Heading 1"
            >
              <Heading1 className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              isActive={editor.isActive('heading', { level: 2 })}
              title="Heading 2"
            >
              <Heading2 className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              isActive={editor.isActive('heading', { level: 3 })}
              title="Heading 3"
            >
              <Heading3 className="w-4 h-4" />
            </MenuButton>
          </div>

          {/* Lists */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
            <MenuButton
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              isActive={editor.isActive('bulletList')}
              title="Bullet list"
            >
              <List className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={editor.isActive('orderedList')}
              title="Ordered list"
            >
              <ListOrdered className="w-4 h-4" />
            </MenuButton>
          </div>

          {/* Blocks */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
            <MenuButton
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={editor.isActive('blockquote')}
              title="Quote"
            >
              <Quote className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              isActive={editor.isActive('codeBlock')}
              title="Code block"
            >
              <CodeSquare className="w-4 h-4" />
            </MenuButton>
          </div>

          {/* History */}
          <div className="flex items-center gap-1">
            <MenuButton
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
              title="Undo (⌘Z)"
            >
              <Undo className="w-4 h-4" />
            </MenuButton>
            <MenuButton
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
              title="Redo (⌘Y)"
            >
              <Redo className="w-4 h-4" />
            </MenuButton>
          </div>
        </div>
      </div>

      {/* Editor Content */}
      <div ref={editorRef} className="p-8">
        <EditorContent editor={editor} />
      </div>

      {/* Bubble Menu for selected text */}
      {editor && (
        <BubbleMenu 
          editor={editor} 
          tippyOptions={{ duration: 100 }}
          className="bg-white shadow-lg border border-gray-200 rounded-lg p-1 flex items-center gap-1"
        >
          <MenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
          >
            <Bold className="w-4 h-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
          >
            <Italic className="w-4 h-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
          >
            <Strikethrough className="w-4 h-4" />
          </MenuButton>
          <MenuButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
          >
            <Code className="w-4 h-4" />
          </MenuButton>
        </BubbleMenu>
      )}

      {/* Floating Menu for new blocks */}
      {editor && (
        <FloatingMenu 
          editor={editor} 
          tippyOptions={{ duration: 100 }}
          className="bg-white shadow-lg border border-gray-200 rounded-lg p-1"
        >
          <button
            onClick={() => setShowSlashMenu(true)}
            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="Add block"
          >
            <Plus className="w-4 h-4" />
          </button>
        </FloatingMenu>
      )}

      {/* Slash Command Menu */}
      {showSlashMenu && (
        <SlashMenu
          position={slashMenuPosition}
          onSelect={handleSlashCommand}
          onClose={() => setShowSlashMenu(false)}
        />
      )}
    </div>
  );
});