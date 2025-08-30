import React, { useState, useEffect } from 'react';
import { motion, useAnimation, AnimatePresence, Variants } from 'framer-motion';
import { Check, X, Loader2, Sparkles, Zap, TrendingUp } from 'lucide-react';
import { cn } from '~/utils/cn';

/**
 * Success animation for completed actions
 */
export function SuccessAnimation({ 
  show, 
  message = 'Success!',
  onComplete 
}: { 
  show: boolean; 
  message?: string;
  onComplete?: () => void;
}) {
  useEffect(() => {
    if (show && onComplete) {
      const timer = setTimeout(onComplete, 2000);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);
  
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 15 }}
          className="fixed top-20 right-4 z-50 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 flex items-center gap-3 shadow-lg"
        >
          <motion.div
            initial={{ rotate: -180 }}
            animate={{ rotate: 0 }}
            transition={{ type: 'spring', damping: 10 }}
          >
            <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
          </motion.div>
          <span className="text-green-800 dark:text-green-300">{message}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Error animation with shake effect
 */
export function ErrorAnimation({ 
  show, 
  message = 'Something went wrong',
  onClose 
}: { 
  show: boolean; 
  message?: string;
  onClose?: () => void;
}) {
  const shakeVariants: Variants = {
    shake: {
      x: [-10, 10, -10, 10, 0],
      transition: { duration: 0.5 }
    }
  };
  
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0, opacity: 0 }}
          variants={shakeVariants}
          whileHover="shake"
          className="fixed top-20 right-4 z-50 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3 shadow-lg"
        >
          <X className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="text-red-800 dark:text-red-300">{message}</span>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-2 text-red-600 hover:text-red-800"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Hover card with spring animation
 */
export function HoverCard({ 
  children, 
  className = '' 
}: { 
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-lg shadow-sm hover:shadow-md transition-shadow",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

/**
 * Loading spinner with pulse effect
 */
export function LoadingSpinner({ 
  size = 'md',
  message 
}: { 
  size?: 'sm' | 'md' | 'lg';
  message?: string;
}) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };
  
  return (
    <div className="flex flex-col items-center gap-3">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      >
        <Loader2 className={cn(sizeClasses[size], "text-blue-600 dark:text-blue-400")} />
      </motion.div>
      {message && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-sm text-gray-600 dark:text-gray-400"
        >
          {message}
        </motion.p>
      )}
    </div>
  );
}

/**
 * Confetti burst animation for celebrations
 */
export function ConfettiBurst({ trigger }: { trigger: boolean }) {
  const [particles, setParticles] = useState<Array<{ id: number; color: string }>>([]);
  
  useEffect(() => {
    if (trigger) {
      const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];
      const newParticles = Array.from({ length: 20 }, (_, i) => ({
        id: i,
        color: colors[Math.floor(Math.random() * colors.length)]
      }));
      setParticles(newParticles);
      
      const timer = setTimeout(() => setParticles([]), 2000);
      return () => clearTimeout(timer);
    }
  }, [trigger]);
  
  return (
    <AnimatePresence>
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          initial={{ 
            x: 0, 
            y: 0, 
            scale: 0,
            opacity: 1 
          }}
          animate={{ 
            x: (Math.random() - 0.5) * 200,
            y: (Math.random() - 0.5) * 200,
            scale: 1,
            opacity: 0,
            rotate: Math.random() * 360
          }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{
            position: 'absolute',
            width: 10,
            height: 10,
            backgroundColor: particle.color,
            borderRadius: '50%',
            pointerEvents: 'none'
          }}
        />
      ))}
    </AnimatePresence>
  );
}

/**
 * Shimmer effect for loading states
 */
export function ShimmerEffect({ 
  width = '100%', 
  height = 20,
  className = '' 
}: { 
  width?: string | number;
  height?: number;
  className?: string;
}) {
  return (
    <div 
      className={cn("relative overflow-hidden bg-gray-200 dark:bg-gray-700 rounded", className)}
      style={{ width, height }}
    >
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
        animate={{ x: ['0%', '100%'] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        style={{ width: '50%' }}
      />
    </div>
  );
}

/**
 * Floating action button with bounce
 */
export function FloatingActionButton({
  icon: Icon = Sparkles,
  onClick,
  className = ''
}: {
  icon?: React.ElementType;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.button
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center",
        className
      )}
    >
      <Icon className="w-6 h-6" />
    </motion.button>
  );
}

/**
 * Progress indicator with smooth animation
 */
export function AnimatedProgressBar({ 
  progress,
  showLabel = true,
  className = ''
}: { 
  progress: number;
  showLabel?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)}>
      {showLabel && (
        <div className="flex justify-between mb-1">
          <span className="text-sm text-gray-600 dark:text-gray-400">Progress</span>
          <span className="text-sm font-medium">{Math.round(progress)}%</span>
        </div>
      )}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 20 }}
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600"
        />
      </div>
    </div>
  );
}

/**
 * Stat card with animated number counter
 */
export function AnimatedStatCard({
  label,
  value,
  change,
  icon: Icon = TrendingUp,
  className = ''
}: {
  label: string;
  value: number;
  change?: number;
  icon?: React.ElementType;
  className?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  
  useEffect(() => {
    const duration = 1000;
    const steps = 60;
    const increment = value / steps;
    let current = 0;
    
    const timer = setInterval(() => {
      current += increment;
      if (current >= value) {
        setDisplayValue(value);
        clearInterval(timer);
      } else {
        setDisplayValue(Math.floor(current));
      }
    }, duration / steps);
    
    return () => clearInterval(timer);
  }, [value]);
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm",
        className
      )}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">{label}</p>
          <p className="text-2xl font-bold mt-1">{displayValue.toLocaleString()}</p>
          {change !== undefined && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={cn(
                "text-sm mt-2",
                change >= 0 ? "text-green-600" : "text-red-600"
              )}
            >
              {change >= 0 ? '+' : ''}{change}%
            </motion.p>
          )}
        </div>
        <motion.div
          whileHover={{ rotate: 15 }}
          className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"
        >
          <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </motion.div>
      </div>
    </motion.div>
  );
}

/**
 * Magic sparkle effect for AI actions
 */
export function MagicSparkle({ 
  active,
  children 
}: { 
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      <AnimatePresence>
        {active && (
          <>
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, opacity: 1 }}
                animate={{ 
                  scale: [0, 1, 0],
                  opacity: [1, 0.5, 0],
                  x: Math.random() * 40 - 20,
                  y: Math.random() * 40 - 20
                }}
                transition={{ 
                  duration: 1,
                  delay: i * 0.2,
                  repeat: Infinity,
                  repeatDelay: 1
                }}
                className="absolute top-1/2 left-1/2 pointer-events-none"
              >
                <Sparkles className="w-4 h-4 text-yellow-400" />
              </motion.div>
            ))}
          </>
        )}
      </AnimatePresence>
    </div>
  );
}