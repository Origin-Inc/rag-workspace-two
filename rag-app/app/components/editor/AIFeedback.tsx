/**
 * AI Feedback Component
 * Provides visual feedback for AI operations with animations
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles,
  CheckCircle, 
  XCircle, 
  AlertCircle,
  RefreshCw,
  HelpCircle
} from 'lucide-react';
import { cn } from '~/utils/cn';

export type FeedbackType = 'success' | 'error' | 'warning' | 'info' | 'processing';

interface FeedbackMessage {
  id: string;
  type: FeedbackType;
  message: string;
  detail?: string;
  actions?: {
    label: string;
    onClick: () => void;
  }[];
  duration?: number;
}

interface AIFeedbackProps {
  message?: FeedbackMessage;
  position?: 'top' | 'bottom' | 'center';
  className?: string;
}

export function AIFeedback({ 
  message, 
  position = 'bottom',
  className 
}: AIFeedbackProps) {
  const [visible, setVisible] = useState(false);
  const [currentMessage, setCurrentMessage] = useState<FeedbackMessage | null>(null);

  useEffect(() => {
    if (message) {
      setCurrentMessage(message);
      setVisible(true);

      if (message.duration && message.type !== 'processing') {
        const timer = setTimeout(() => {
          setVisible(false);
        }, message.duration);
        return () => clearTimeout(timer);
      }
    } else {
      setVisible(false);
    }
  }, [message]);

  const getIcon = (type: FeedbackType) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5" />;
      case 'error':
        return <XCircle className="w-5 h-5" />;
      case 'warning':
        return <AlertCircle className="w-5 h-5" />;
      case 'info':
        return <HelpCircle className="w-5 h-5" />;
      case 'processing':
        return <RefreshCw className="w-5 h-5 animate-spin" />;
    }
  };

  const getStyles = (type: FeedbackType) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'info':
        return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'processing':
        return 'bg-purple-50 border-purple-200 text-purple-800';
    }
  };

  const getPosition = () => {
    switch (position) {
      case 'top':
        return 'top-4 left-1/2 -translate-x-1/2';
      case 'center':
        return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
      case 'bottom':
      default:
        return 'bottom-4 left-1/2 -translate-x-1/2';
    }
  };

  return (
    <AnimatePresence>
      {visible && currentMessage && (
        <motion.div
          initial={{ opacity: 0, y: position === 'top' ? -20 : 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: position === 'top' ? -20 : 20, scale: 0.95 }}
          transition={{ 
            type: "spring",
            stiffness: 500,
            damping: 30
          }}
          className={cn(
            "fixed z-50 max-w-md",
            getPosition(),
            className
          )}
        >
          <div className={cn(
            "flex items-start gap-3 p-4 rounded-lg border shadow-lg backdrop-blur-sm",
            getStyles(currentMessage.type)
          )}>
            <div className="flex-shrink-0 mt-0.5">
              {getIcon(currentMessage.type)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{currentMessage.message}</p>
              {currentMessage.detail && (
                <p className="text-sm mt-1 opacity-90">{currentMessage.detail}</p>
              )}
              {currentMessage.actions && currentMessage.actions.length > 0 && (
                <div className="flex gap-2 mt-3">
                  {currentMessage.actions.map((action, index) => (
                    <button
                      key={index}
                      onClick={action.onClick}
                      className="text-sm font-medium underline hover:no-underline"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Ghost Block Component for showing where new blocks will be added
export function GhostBlock({ 
  type,
  position,
  className 
}: { 
  type: string;
  position?: 'before' | 'after';
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 0.5, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "border-2 border-dashed border-blue-400 rounded-lg p-4 bg-blue-50/50",
        position === 'before' && "mb-2",
        position === 'after' && "mt-2",
        className
      )}
    >
      <div className="flex items-center gap-2 text-blue-600">
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-medium">
          New {type} block will appear here
        </span>
      </div>
    </motion.div>
  );
}

// Highlight Effect for blocks being modified
export function BlockHighlight({ 
  children,
  active,
  type = 'update'
}: { 
  children: React.ReactNode;
  active: boolean;
  type?: 'update' | 'delete' | 'transform';
}) {
  const getHighlightColor = () => {
    switch (type) {
      case 'update':
        return 'ring-blue-400 bg-blue-50/20';
      case 'delete':
        return 'ring-red-400 bg-red-50/20';
      case 'transform':
        return 'ring-purple-400 bg-purple-50/20';
    }
  };

  return (
    <motion.div
      animate={active ? {
        scale: [1, 1.02, 1],
      } : {}}
      transition={{ duration: 0.3 }}
      className={cn(
        "relative rounded-lg transition-all duration-300",
        active && `ring-2 ${getHighlightColor()}`
      )}
    >
      {children}
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute -top-2 -right-2 z-10"
        >
          <div className="bg-white rounded-full p-1 shadow-md">
            <Sparkles className="w-4 h-4 text-blue-600" />
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}