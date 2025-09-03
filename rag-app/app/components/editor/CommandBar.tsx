/**
 * AI Command Bar Component
 * Floating command interface for natural language block manipulation
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Sparkles, 
  Mic, 
  MicOff, 
  X, 
  Loader2,
  AlertCircle,
  CheckCircle,
  ArrowRight
} from 'lucide-react';
import { cn } from '~/utils/cn';
import type { Block } from './EnhancedBlockEditor';

interface CommandBarProps {
  show: boolean;
  onClose: () => void;
  onCommand: (command: string) => Promise<void>;
  blocks: Block[];
  selectedBlockId?: string;
  className?: string;
}

interface CommandSuggestion {
  text: string;
  description: string;
  confidence?: number;
}

const EXAMPLE_COMMANDS: CommandSuggestion[] = [
  { text: "Add a table after this paragraph", description: "Create new table block" },
  { text: "Convert this list to a table", description: "Transform list → table" },
  { text: "Move this block above the heading", description: "Reorder blocks" },
  { text: "Delete the second paragraph", description: "Remove specific block" },
  { text: "Make this text bold and larger", description: "Style modification" },
  { text: "Duplicate this section 3 times", description: "Copy blocks" },
  { text: "Merge these two paragraphs", description: "Combine blocks" },
  { text: "Add a chart showing the data", description: "Create visualization" },
  { text: "Transform this table into bullet points", description: "Convert format" },
  { text: "Split this paragraph at each sentence", description: "Break apart content" }
];

export function CommandBar({
  show,
  onClose,
  onCommand,
  blocks,
  selectedBlockId,
  className
}: CommandBarProps) {
  const [command, setCommand] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CommandSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [showExamples, setShowExamples] = useState(true);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when shown
  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
      setCommand('');
      setError(null);
      setSuccess(null);
      setShowExamples(true);
    }
  }, [show]);

  // Setup speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join('');
        
        setCommand(transcript);
        
        if (event.results[0].isFinal) {
          setIsListening(false);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
        setError('Voice input failed. Please try typing instead.');
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Handle voice input
  const toggleVoiceInput = useCallback(() => {
    if (!recognitionRef.current) {
      setError('Voice input is not supported in your browser');
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
      setError(null);
    }
  }, [isListening]);

  // Update suggestions based on input
  useEffect(() => {
    if (command.length > 2) {
      const filtered = EXAMPLE_COMMANDS.filter(cmd =>
        cmd.text.toLowerCase().includes(command.toLowerCase()) ||
        cmd.description.toLowerCase().includes(command.toLowerCase())
      );
      setSuggestions(filtered);
      setShowExamples(false);
    } else {
      setSuggestions([]);
      setShowExamples(true);
    }
    setSelectedSuggestion(0);
  }, [command]);

  // Handle command submission
  const handleSubmit = async (cmdText?: string) => {
    const finalCommand = cmdText || command;
    if (!finalCommand.trim()) return;

    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      await onCommand(finalCommand);
      setSuccess('Command executed successfully!');
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Command failed');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (suggestions.length > 0 && selectedSuggestion >= 0) {
        handleSubmit(suggestions[selectedSuggestion].text);
      } else {
        handleSubmit();
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestion(prev => 
        Math.min(prev + 1, suggestions.length - 1)
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestion(prev => Math.max(prev - 1, 0));
    }
  };

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [show, onClose]);

  if (!show) return null;

  // Build context hint
  const contextHint = selectedBlockId
    ? `Acting on selected ${blocks.find(b => b.id === selectedBlockId)?.type || 'block'}`
    : `${blocks.length} blocks in document`;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/20 backdrop-blur-sm">
      <div
        ref={containerRef}
        className={cn(
          "w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden",
          "transform transition-all duration-200 ease-out",
          show ? "scale-100 opacity-100" : "scale-95 opacity-0",
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-gray-900">AI Command</span>
            <span className="text-xs text-gray-500 ml-2">{contextHint}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Input area */}
        <div className="p-4">
          <div className="relative">
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to do..."
              className={cn(
                "w-full px-4 py-3 pr-24 text-base",
                "border rounded-lg outline-none transition-all",
                "placeholder:text-gray-400",
                isProcessing && "bg-gray-50",
                error ? "border-red-300 focus:ring-red-500" : "border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              )}
              disabled={isProcessing}
            />
            
            {/* Action buttons */}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {/* Voice input button */}
              <button
                onClick={toggleVoiceInput}
                disabled={isProcessing}
                className={cn(
                  "p-2 rounded-lg transition-all",
                  isListening 
                    ? "bg-red-100 text-red-600 hover:bg-red-200" 
                    : "hover:bg-gray-100 text-gray-500 hover:text-gray-700"
                )}
                aria-label={isListening ? "Stop recording" : "Start voice input"}
              >
                {isListening ? (
                  <MicOff className="w-4 h-4" />
                ) : (
                  <Mic className="w-4 h-4" />
                )}
              </button>

              {/* Submit button */}
              {command.trim() && !isProcessing && (
                <button
                  onClick={() => handleSubmit()}
                  className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  aria-label="Execute command"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}

              {/* Loading indicator */}
              {isProcessing && (
                <div className="p-2">
                  <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                </div>
              )}
            </div>
          </div>

          {/* Status messages */}
          {error && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}
          
          {success && (
            <div className="mt-2 flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="w-4 h-4" />
              {success}
            </div>
          )}

          {isListening && (
            <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
              <div className="flex gap-1">
                <span className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1 h-1 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              Listening...
            </div>
          )}
        </div>

        {/* Suggestions or examples */}
        {(suggestions.length > 0 || showExamples) && (
          <div className="border-t border-gray-100 max-h-64 overflow-y-auto">
            <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase">
              {showExamples ? 'Example Commands' : 'Suggestions'}
            </div>
            <div className="pb-2">
              {(showExamples ? EXAMPLE_COMMANDS.slice(0, 5) : suggestions).map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setCommand(suggestion.text);
                    handleSubmit(suggestion.text);
                  }}
                  onMouseEnter={() => setSelectedSuggestion(index)}
                  className={cn(
                    "w-full px-4 py-2 text-left hover:bg-gray-50 transition-colors",
                    "flex items-start gap-3 group",
                    selectedSuggestion === index && "bg-gray-50"
                  )}
                >
                  <Sparkles className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0 group-hover:text-blue-600" />
                  <div className="flex-1">
                    <div className="text-sm text-gray-900">{suggestion.text}</div>
                    <div className="text-xs text-gray-500">{suggestion.description}</div>
                  </div>
                  {suggestion.confidence && (
                    <div className="text-xs text-gray-400">
                      {Math.round(suggestion.confidence * 100)}%
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Help text */}
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          <span className="font-medium">Enter</span> to execute • 
          <span className="font-medium ml-2">↑↓</span> to navigate • 
          <span className="font-medium ml-2">Esc</span> to cancel
        </div>
      </div>
    </div>
  );
}