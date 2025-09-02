/**
 * Block Preview Component
 * Shows animated preview of block changes before committing
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from '~/utils/cn';
import type { Block } from './EnhancedBlockEditor';

interface BlockChange {
  type: 'add' | 'update' | 'delete' | 'move' | 'transform';
  blockId?: string;
  from?: Block;
  to?: Block;
  position?: 'before' | 'after';
  targetId?: string;
}

interface BlockPreviewProps {
  show: boolean;
  changes: BlockChange[];
  onConfirm: () => void;
  onCancel: () => void;
  confidence?: number;
  isProcessing?: boolean;
}

export function BlockPreview({
  show,
  changes,
  onConfirm,
  onCancel,
  confidence = 1,
  isProcessing = false
}: BlockPreviewProps) {
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (show) {
      setAnimateIn(true);
    } else {
      setAnimateIn(false);
    }
  }, [show]);

  const getChangeDescription = (change: BlockChange): string => {
    switch (change.type) {
      case 'add':
        return `Add ${change.to?.type || 'block'}`;
      case 'update':
        return `Update ${change.from?.type || 'block'}`;
      case 'delete':
        return `Delete ${change.from?.type || 'block'}`;
      case 'move':
        return `Move ${change.from?.type || 'block'}`;
      case 'transform':
        return `Transform ${change.from?.type} to ${change.to?.type}`;
      default:
        return 'Change block';
    }
  };

  const getChangeIcon = (change: BlockChange) => {
    switch (change.type) {
      case 'add':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'delete':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'update':
      case 'transform':
        return <AlertCircle className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-gray-500" />;
    }
  };

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getConfidenceText = (confidence: number): string => {
    if (confidence >= 0.8) return 'High confidence';
    if (confidence >= 0.6) return 'Medium confidence';
    return 'Low confidence';
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={onCancel}
        >
          <motion.div
            initial={{ y: 20 }}
            animate={{ y: 0 }}
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold mb-4">Preview Changes</h3>

            {/* Confidence Indicator */}
            {confidence < 1 && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">
                    {getConfidenceText(confidence)}
                  </span>
                  <span className="text-sm text-gray-600">
                    {Math.round(confidence * 100)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={cn(
                      "h-2 rounded-full transition-all duration-500",
                      getConfidenceColor(confidence)
                    )}
                    style={{ width: `${confidence * 100}%` }}
                  />
                </div>
              </div>
            )}

            {/* Changes List */}
            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
              {changes.map((change, index) => (
                <motion.div
                  key={index}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                >
                  {getChangeIcon(change)}
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {getChangeDescription(change)}
                    </p>
                    {change.to?.content && (
                      <p className="text-xs text-gray-600 mt-1 truncate">
                        {typeof change.to.content === 'string' 
                          ? change.to.content 
                          : 'Complex content'}
                      </p>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                disabled={isProcessing}
                className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={isProcessing}
                className={cn(
                  "flex-1 px-4 py-2 text-white rounded-lg transition-colors flex items-center justify-center gap-2",
                  confidence >= 0.6 
                    ? "bg-blue-600 hover:bg-blue-700" 
                    : "bg-orange-600 hover:bg-orange-700",
                  "disabled:opacity-50"
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Applying...
                  </>
                ) : (
                  'Apply Changes'
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}