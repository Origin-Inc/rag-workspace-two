import { useEffect, useRef } from 'react';
import { ChatSidebar } from './chat/ChatSidebar';

interface ChatSidebarWrapperProps {
  pageId: string;
  onSendMessage?: (message: string) => Promise<void>;
  onFileUpload?: (file: File) => Promise<void>;
  className?: string;
}

// Wrapper to isolate and debug the ChatSidebar component
export function ChatSidebarWrapper(props: ChatSidebarWrapperProps) {
  const renderCount = useRef(0);
  const previousProps = useRef(props);
  
  renderCount.current++;
  
  console.log('[ChatSidebarWrapper] RENDER #', renderCount.current, {
    pageId: props.pageId,
    propsChanged: previousProps.current !== props,
    timestamp: Date.now(),
  });
  
  // Track prop changes
  useEffect(() => {
    if (previousProps.current.pageId !== props.pageId) {
      console.log('[ChatSidebarWrapper] pageId changed:', {
        from: previousProps.current.pageId,
        to: props.pageId,
      });
    }
    previousProps.current = props;
  });
  
  // Monitor for rapid re-renders
  useEffect(() => {
    const startRenders = renderCount.current;
    const timer = setTimeout(() => {
      const endRenders = renderCount.current;
      const renderDiff = endRenders - startRenders;
      
      if (renderDiff > 10) {
        console.error('[ChatSidebarWrapper] CRITICAL: Rapid re-renders detected!', {
          rendersIn100ms: renderDiff,
          totalRenders: endRenders,
        });
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, []);
  
  // Emergency circuit breaker
  if (renderCount.current > 100) {
    console.error('[ChatSidebarWrapper] EMERGENCY: Too many renders, returning null to prevent crash');
    return (
      <div className="fixed right-4 top-4 bg-red-500 text-white p-4 rounded-lg">
        Chat sidebar disabled due to rendering loop. Please refresh the page.
      </div>
    );
  }
  
  try {
    console.log('[ChatSidebarWrapper] Attempting to render ChatSidebar');
    return <ChatSidebar {...props} />;
  } catch (error) {
    console.error('[ChatSidebarWrapper] Error rendering ChatSidebar:', error);
    return (
      <div className="fixed right-4 top-4 bg-red-500 text-white p-4 rounded-lg">
        Error loading chat sidebar: {error instanceof Error ? error.message : 'Unknown error'}
      </div>
    );
  }
}