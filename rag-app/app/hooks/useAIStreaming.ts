import { useState, useCallback, useRef, useEffect } from 'react';

export interface StreamingState {
  isStreaming: boolean;
  content: string;
  error: string | null;
  metrics: {
    firstTokenMs?: number;
    totalTimeMs?: number;
    tokensPerSecond?: number;
    tokenCount?: number;
  };
}

export interface UseAIStreamingOptions {
  onToken?: (token: string) => void;
  onComplete?: (content: string, metrics: any) => void;
  onError?: (error: string) => void;
  endpoint?: string;
  warmUp?: boolean;
}

/**
 * Hook for AI response streaming with <500ms first token target
 */
export function useAIStreaming(options: UseAIStreamingOptions = {}) {
  const [state, setState] = useState<StreamingState>({
    isStreaming: false,
    content: '',
    error: null,
    metrics: {},
  });
  
  const abortControllerRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);
  const firstTokenReceivedRef = useRef<boolean>(false);
  
  // Warm up connection on mount if requested
  useEffect(() => {
    if (options.warmUp) {
      fetch('/api/ai-streaming/warmup', { method: 'POST' }).catch(console.error);
    }
  }, [options.warmUp]);
  
  const streamResponse = useCallback(async (
    prompt: string,
    context?: string,
    streamOptions?: any
  ) => {
    // Reset state
    setState({
      isStreaming: true,
      content: '',
      error: null,
      metrics: {},
    });
    
    abortControllerRef.current = new AbortController();
    startTimeRef.current = Date.now();
    firstTokenReceivedRef.current = false;
    
    let fullContent = '';
    let metrics = {};
    
    try {
      const response = await fetch(options.endpoint || '/api/ai-streaming', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          context,
          options: streamOptions,
        }),
        signal: abortControllerRef.current.signal,
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      
      if (!reader) {
        throw new Error('No response body');
      }
      
      // Process stream
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('event:')) {
            const eventType = line.slice(6).trim();
            
            // Get data from next line
            const dataLine = lines[lines.indexOf(line) + 1];
            if (dataLine?.startsWith('data:')) {
              const data = JSON.parse(dataLine.slice(5));
              
              switch (eventType) {
                case 'token':
                  if (!firstTokenReceivedRef.current) {
                    firstTokenReceivedRef.current = true;
                    const firstTokenMs = Date.now() - startTimeRef.current;
                    console.log(`[useAIStreaming] First token: ${firstTokenMs}ms`);
                    
                    setState(prev => ({
                      ...prev,
                      metrics: { ...prev.metrics, firstTokenMs },
                    }));
                  }
                  
                  fullContent += data.content;
                  setState(prev => ({
                    ...prev,
                    content: fullContent,
                  }));
                  
                  options.onToken?.(data.content);
                  break;
                  
                case 'metadata':
                  metrics = data.metadata || {};
                  setState(prev => ({
                    ...prev,
                    metrics: { ...prev.metrics, ...metrics },
                  }));
                  break;
                  
                case 'error':
                  throw new Error(data.error);
                  
                case 'done':
                  const totalTimeMs = Date.now() - startTimeRef.current;
                  console.log(`[useAIStreaming] Total time: ${totalTimeMs}ms`);
                  
                  setState(prev => ({
                    ...prev,
                    isStreaming: false,
                    metrics: { ...prev.metrics, totalTimeMs },
                  }));
                  
                  options.onComplete?.(fullContent, { ...metrics, totalTimeMs });
                  break;
              }
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[useAIStreaming] Stream aborted');
      } else {
        const errorMessage = error instanceof Error ? error.message : 'Stream error';
        console.error('[useAIStreaming] Error:', errorMessage);
        
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: errorMessage,
        }));
        
        options.onError?.(errorMessage);
      }
    }
  }, [options]);
  
  const abortStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setState(prev => ({
        ...prev,
        isStreaming: false,
      }));
    }
  }, []);
  
  const reset = useCallback(() => {
    setState({
      isStreaming: false,
      content: '',
      error: null,
      metrics: {},
    });
  }, []);
  
  return {
    ...state,
    streamResponse,
    abortStream,
    reset,
  };
}

/**
 * Hook for typing animation effect
 */
export function useTypingEffect(text: string, speed: number = 30) {
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  useEffect(() => {
    if (!text) {
      setDisplayedText('');
      return;
    }
    
    setIsTyping(true);
    let currentIndex = 0;
    
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsTyping(false);
        clearInterval(interval);
      }
    }, speed);
    
    return () => clearInterval(interval);
  }, [text, speed]);
  
  return { displayedText, isTyping };
}