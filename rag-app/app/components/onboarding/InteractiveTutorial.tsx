import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft, Sparkles, Zap, Database, BarChart3 } from 'lucide-react';
import { cn } from '~/utils/cn';

interface TutorialStep {
  id: string;
  title: string;
  content: string;
  target?: string; // CSS selector for element to highlight
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: () => void;
  showSkip?: boolean;
  showPrevious?: boolean;
}

const DEFAULT_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Your AI-Powered Workspace! 🎉',
    content: 'Experience the magic of AI + data in the next 30 seconds. Let me show you around!',
    position: 'center',
    showSkip: true,
    showPrevious: false
  },
  {
    id: 'ai-command',
    title: 'AI at Your Fingertips',
    content: 'Press Space anywhere to ask AI about your data. Try it now!',
    target: '[data-tutorial="ai-input"]',
    position: 'bottom',
    showSkip: true,
    showPrevious: true
  },
  {
    id: 'data-import',
    title: 'Instant Data Import',
    content: 'Drag & drop CSV files or paste from clipboard. We\'ll automatically detect and configure everything!',
    target: '[data-tutorial="import-button"]',
    position: 'left',
    showSkip: true,
    showPrevious: true
  },
  {
    id: 'smart-analytics',
    title: 'Smart Analytics',
    content: 'AI automatically generates insights and visualizations based on your data patterns.',
    target: '[data-tutorial="analytics-panel"]',
    position: 'right',
    showSkip: true,
    showPrevious: true
  },
  {
    id: 'database-views',
    title: 'Multiple Views',
    content: 'Switch between Table, Gallery, Board, and Calendar views with one click.',
    target: '[data-tutorial="view-switcher"]',
    position: 'bottom',
    showSkip: true,
    showPrevious: true
  },
  {
    id: 'share-insights',
    title: 'Share Your Insights',
    content: 'Generate shareable links and embed widgets to showcase your AI-powered analytics.',
    target: '[data-tutorial="share-button"]',
    position: 'top',
    showSkip: true,
    showPrevious: true
  },
  {
    id: 'complete',
    title: 'You\'re All Set! 🚀',
    content: 'Start building your AI-powered workspace. Press Space anytime to ask AI for help!',
    position: 'center',
    showSkip: false,
    showPrevious: true
  }
];

interface InteractiveTutorialProps {
  steps?: TutorialStep[];
  onComplete?: () => void;
  onSkip?: () => void;
  autoStart?: boolean;
}

export function InteractiveTutorial({
  steps = DEFAULT_STEPS,
  onComplete,
  onSkip,
  autoStart = false
}: InteractiveTutorialProps) {
  const [isActive, setIsActive] = useState(autoStart);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasInteracted, setHasInteracted] = useState<Set<string>>(new Set());
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Load progress from localStorage
  useEffect(() => {
    const savedProgress = localStorage.getItem('tutorial-progress');
    if (savedProgress) {
      const progress = JSON.parse(savedProgress);
      setCurrentStep(progress.currentStep || 0);
      setHasInteracted(new Set(progress.interactedSteps || []));
      setIsActive(progress.isActive ?? autoStart);
    } else if (autoStart) {
      // First time user
      setIsActive(true);
    }
  }, [autoStart]);
  
  // Save progress to localStorage
  useEffect(() => {
    if (isActive) {
      localStorage.setItem('tutorial-progress', JSON.stringify({
        currentStep,
        interactedSteps: Array.from(hasInteracted),
        isActive
      }));
    }
  }, [currentStep, hasInteracted, isActive]);
  
  const step = steps[currentStep];
  
  const handleNext = useCallback(() => {
    setHasInteracted(prev => new Set(prev).add(step.id));
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleComplete();
    }
  }, [currentStep, steps.length, step.id]);
  
  const handlePrevious = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);
  
  const handleSkip = useCallback(() => {
    setIsActive(false);
    localStorage.setItem('tutorial-completed', 'true');
    onSkip?.();
  }, [onSkip]);
  
  const handleComplete = useCallback(() => {
    setIsActive(false);
    localStorage.setItem('tutorial-completed', 'true');
    localStorage.removeItem('tutorial-progress');
    onComplete?.();
  }, [onComplete]);
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isActive) return;
      
      if (e.key === 'Escape' && step.showSkip) {
        handleSkip();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' && step.showPrevious) {
        handlePrevious();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, step, handleNext, handlePrevious, handleSkip]);
  
  if (!isActive || !step) return null;
  
  return createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        {/* Backdrop with spotlight effect */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 pointer-events-auto"
          onClick={step.showSkip ? handleSkip : undefined}
        />
        
        {/* Spotlight for target element */}
        {step.target && <Spotlight target={step.target} />}
        
        {/* Tutorial card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: 'spring', damping: 20 }}
          className={cn(
            "absolute pointer-events-auto",
            getPositionClasses(step.position, step.target)
          )}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 max-w-md">
            {/* Progress indicator */}
            <div className="flex gap-1 mb-4">
              {steps.map((_, index) => (
                <div
                  key={index}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    index <= currentStep
                      ? "bg-blue-600 dark:bg-blue-400"
                      : "bg-gray-200 dark:bg-gray-700"
                  )}
                />
              ))}
            </div>
            
            {/* Icon header */}
            <div className="flex items-start gap-3 mb-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                {getStepIcon(step.id)}
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {step.title}
                </h3>
              </div>
              {step.showSkip && (
                <button
                  onClick={handleSkip}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
            
            {/* Content */}
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {step.content}
            </p>
            
            {/* Interactive hint */}
            {step.target && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  💡 Try it now! Click on the highlighted area.
                </p>
              </div>
            )}
            
            {/* Navigation buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={handlePrevious}
                disabled={!step.showPrevious}
                className={cn(
                  "flex items-center gap-1 px-3 py-2 text-sm rounded-lg transition-colors",
                  step.showPrevious
                    ? "text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    : "invisible"
                )}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {currentStep + 1} of {steps.length}
              </span>
              
              <button
                onClick={handleNext}
                className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}

// Spotlight component for highlighting elements
function Spotlight({ target }: { target: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  
  useEffect(() => {
    const element = document.querySelector(target);
    if (element) {
      setRect(element.getBoundingClientRect());
      
      // Add pulse animation to highlighted element
      element.classList.add('tutorial-highlight');
      
      return () => {
        element.classList.remove('tutorial-highlight');
      };
    }
  }, [target]);
  
  if (!rect) return null;
  
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute pointer-events-none"
      style={{
        left: rect.left - 8,
        top: rect.top - 8,
        width: rect.width + 16,
        height: rect.height + 16,
      }}
    >
      <div className="absolute inset-0 bg-white/10 rounded-lg ring-4 ring-blue-500/50 animate-pulse" />
    </motion.div>
  );
}

// Helper functions
function getPositionClasses(position?: string, hasTarget?: string) {
  if (!hasTarget || position === 'center') {
    return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
  }
  
  switch (position) {
    case 'top':
      return 'top-20 left-1/2 -translate-x-1/2';
    case 'bottom':
      return 'bottom-20 left-1/2 -translate-x-1/2';
    case 'left':
      return 'left-20 top-1/2 -translate-y-1/2';
    case 'right':
      return 'right-20 top-1/2 -translate-y-1/2';
    default:
      return 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2';
  }
}

function getStepIcon(stepId: string) {
  switch (stepId) {
    case 'welcome':
      return <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    case 'ai-command':
      return <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    case 'data-import':
      return <Database className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    case 'smart-analytics':
      return <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    default:
      return <Sparkles className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
  }
}

// Export tutorial trigger button
export function TutorialTrigger() {
  const [showTutorial, setShowTutorial] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setShowTutorial(true)}
        className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        Start Tutorial
      </button>
      
      {showTutorial && (
        <InteractiveTutorial
          autoStart={true}
          onComplete={() => setShowTutorial(false)}
          onSkip={() => setShowTutorial(false)}
        />
      )}
    </>
  );
}