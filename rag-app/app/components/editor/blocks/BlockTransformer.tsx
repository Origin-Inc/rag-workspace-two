import { useEffect, useCallback } from 'react';
import { 
  BlockType, 
  Block, 
  BLOCK_TRANSFORMATIONS, 
  detectBlockTransformation, 
  removeTransformationPattern 
} from './BlockTypes';

interface BlockTransformerProps {
  blocks: Block[];
  currentBlockId: string | null;
  onTransformBlock: (blockId: string, newType: BlockType, newContent: string) => void;
  onAddBlock: (afterId: string, type: BlockType) => void;
}

/**
 * Hook for handling block transformations based on text patterns
 */
export function useBlockTransformer({
  blocks,
  currentBlockId,
  onTransformBlock,
  onAddBlock,
}: BlockTransformerProps) {
  
  const handleBlockTransformation = useCallback((blockId: string, content: string) => {
    const detectedType = detectBlockTransformation(content);
    
    if (!detectedType) return false;
    
    const block = blocks.find(b => b.id === blockId);
    if (!block) return false;
    
    // Don't transform if already the same type
    if (block.type === detectedType) return false;
    
    // Remove the pattern from content
    const cleanContent = removeTransformationPattern(content, detectedType);
    
    // Special handling for certain types
    if (detectedType === 'divider') {
      onTransformBlock(blockId, 'divider', '');
      // Add new paragraph block after divider
      setTimeout(() => onAddBlock(blockId, 'paragraph'), 0);
    } else {
      onTransformBlock(blockId, detectedType, cleanContent);
    }
    
    return true;
  }, [blocks, onTransformBlock, onAddBlock]);
  
  return { handleBlockTransformation };
}

/**
 * Component that renders slash command menu
 */
interface SlashCommandMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  searchQuery: string;
  onSelect: (type: BlockType) => void;
  onClose: () => void;
}

import { SLASH_COMMANDS } from './BlockTypes';
import { cn } from '~/utils/cn';
import { useState, useEffect as useEffectMenu } from 'react';

export function SlashCommandMenu({
  isOpen,
  position,
  searchQuery,
  onSelect,
  onClose,
}: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  // Filter commands based on search query
  const filteredCommands = SLASH_COMMANDS.filter(cmd => {
    const query = searchQuery.toLowerCase();
    return (
      cmd.title.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.keywords.some(k => k.toLowerCase().includes(query))
    );
  });
  
  // Reset selection when filtered commands change
  useEffectMenu(() => {
    setSelectedIndex(0);
  }, [searchQuery]);
  
  // Handle keyboard navigation
  useEffectMenu(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev < filteredCommands.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => 
            prev > 0 ? prev - 1 : filteredCommands.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) {
            onSelect(filteredCommands[selectedIndex].type);
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onSelect, onClose]);
  
  if (!isOpen || filteredCommands.length === 0) return null;
  
  return (
    <div 
      className="absolute z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-2 w-64"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        maxHeight: '300px',
        overflowY: 'auto'
      }}
    >
      {filteredCommands.map((cmd, index) => (
        <button
          key={cmd.type}
          onClick={() => onSelect(cmd.type)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={cn(
            "w-full px-3 py-2 text-left flex items-start gap-3 hover:bg-gray-100",
            selectedIndex === index && "bg-gray-100"
          )}
        >
          <div className="w-5 h-5 mt-0.5 text-gray-400">
            {/* Icon placeholder - you can add actual icons here */}
            <span className="text-xs">{cmd.icon[0]}</span>
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">{cmd.title}</div>
            <div className="text-xs text-gray-500">{cmd.description}</div>
          </div>
        </button>
      ))}
    </div>
  );
}

/**
 * Hook for managing slash command menu
 */
export function useSlashCommands() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [searchQuery, setSearchQuery] = useState('');
  
  const openMenu = useCallback((x: number, y: number) => {
    setMenuPosition({ x, y });
    setIsMenuOpen(true);
    setSearchQuery('');
  }, []);
  
  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
    setSearchQuery('');
  }, []);
  
  const handleSlashCommand = useCallback((text: string, cursorPosition: { x: number; y: number }) => {
    if (text === '/') {
      openMenu(cursorPosition.x, cursorPosition.y + 20);
      return true;
    }
    
    if (text.startsWith('/') && isMenuOpen) {
      setSearchQuery(text.slice(1));
      return true;
    }
    
    return false;
  }, [isMenuOpen, openMenu]);
  
  return {
    isMenuOpen,
    menuPosition,
    searchQuery,
    openMenu,
    closeMenu,
    handleSlashCommand,
  };
}