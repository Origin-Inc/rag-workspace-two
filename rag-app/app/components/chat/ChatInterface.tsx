import { useState, useRef, useEffect } from 'react';
import { Form, useFetcher } from '@remix-run/react';
import { Send, Loader2, AlertCircle, FileText, Bot, User } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isError?: boolean;
  citations?: Array<{
    passage_id: string;
    source_block_id?: string;
    excerpt: string;
  }>;
}

interface ChatInterfaceProps {
  workspaceId: string;
  initialMessages?: Message[];
}

export function ChatInterface({ workspaceId, initialMessages = [] }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fetcher = useFetcher();

  const isLoading = fetcher.state !== 'idle';

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle fetcher response
  useEffect(() => {
    if (fetcher.data && !fetcher.data.error) {
      const newMessage: Message = {
        id: Date.now().toString(),
        content: fetcher.data.answer || fetcher.data.preview?.[0]?.description || 'Action completed',
        role: 'assistant',
        timestamp: new Date(),
        citations: fetcher.data.citations
      };
      setMessages(prev => [...prev, newMessage]);
    } else if (fetcher.data?.error) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: `Error: ${fetcher.data.error}`,
        role: 'assistant',
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  }, [fetcher.data]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: 'user',
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);

    // Submit to AI controller
    const formData = new FormData();
    formData.append('action', 'parse');
    formData.append('command', input);
    formData.append('workspaceId', workspaceId);

    fetcher.submit(formData, { 
      method: 'post',
      action: '/api/ai-controller'
    });

    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full bg-theme-bg-primary rounded-lg shadow-sm">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-theme-text-primary mb-2">
              Start a conversation
            </h3>
            <p className="text-theme-text-primary max-w-md mx-auto">
              Ask questions about your documents, request summaries, or perform actions on your workspace.
            </p>
            <div className="mt-6 space-y-2">
              <p className="text-sm text-theme-text-primary">Try asking:</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "Summarize my workspace",
                  "What are the main topics in my documents?",
                  "Find information about...",
                  "List all my recent pages"
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setInput(suggestion)}
                    className="px-3 py-1 text-xs bg-theme-text-highlight text-theme-text-primary rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.role === 'assistant' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                  </div>
                )}
                
                <div
                  className={`max-w-[70%] ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-l-lg rounded-br-lg'
                      : message.isError
                      ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-r-lg rounded-bl-lg'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-r-lg rounded-bl-lg'
                  } px-4 py-2`}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  
                  {/* Citations */}
                  {message.citations && message.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
                      <p className="text-xs font-medium mb-2 opacity-70">Sources:</p>
                      <div className="space-y-1">
                        {message.citations.map((citation, idx) => (
                          <div key={idx} className="flex items-start gap-1 text-xs opacity-80">
                            <FileText className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-2">{citation.excerpt}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <p className="text-xs opacity-70 mt-2">
                    {new Date(message.timestamp).toLocaleTimeString()}
                  </p>
                </div>
                
                {message.role === 'user' && (
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                      <User className="w-5 h-5 text-white" />
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                </div>
                <div className="bg-gray-100 dark:bg-gray-700 rounded-r-lg rounded-bl-lg px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">Thinking...</span>
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div id="home-chat-input" className="m-8">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question or type a command..."
            className="flex-1 min-h-[44px] max-h-32 px-4 py-2 rounded-lg bg-theme-text-highlight text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 resize-none"
            disabled={isLoading}
            rows={1}
          />
          <button
            type="submit"
            disabled={!input.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
            <span className="sr-only">Send message</span>
          </button>
        </form>
      </div>
    </div>
  );
}