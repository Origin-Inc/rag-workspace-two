import React, { useRef, ReactNode } from 'react';
import { useSpring, animated, useTransition, useChain, config } from '@react-spring/web';
import { cn } from '~/utils/cn';

interface AnimatedProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fade in animation with 60fps performance
 */
export const FadeIn: React.FC<AnimatedProps & {
  delay?: number;
  duration?: number;
}> = ({ children, className = '', delay = 0, duration = 200 }) => {
  const styles = useSpring({
    from: { opacity: 0 },
    to: { opacity: 1 },
    delay,
    config: { duration },
  });
  
  return (
    <animated.div style={styles} className={className}>
      {children}
    </animated.div>
  );
};

/**
 * Slide in animation optimized for 60fps
 */
export const SlideIn: React.FC<AnimatedProps & {
  direction?: 'left' | 'right' | 'up' | 'down';
  delay?: number;
}> = ({ children, className = '', direction = 'up', delay = 0 }) => {
  const transforms = {
    left: 'translateX(-100%)',
    right: 'translateX(100%)',
    up: 'translateY(100%)',
    down: 'translateY(-100%)',
  };
  
  const styles = useSpring({
    from: { 
      opacity: 0,
      transform: transforms[direction],
    },
    to: { 
      opacity: 1,
      transform: 'translate(0%, 0%)',
    },
    delay,
    config: config.smooth,
  });
  
  return (
    <animated.div style={styles} className={className}>
      {children}
    </animated.div>
  );
};

/**
 * Scale animation for emphasis
 */
export const ScaleIn: React.FC<AnimatedProps & {
  delay?: number;
  initialScale?: number;
}> = ({ children, className = '', delay = 0, initialScale = 0.8 }) => {
  const styles = useSpring({
    from: { 
      opacity: 0,
      transform: `scale(${initialScale})`,
    },
    to: { 
      opacity: 1,
      transform: 'scale(1)',
    },
    delay,
    config: config.gentle,
  });
  
  return (
    <animated.div style={styles} className={className}>
      {children}
    </animated.div>
  );
};

/**
 * Stagger animation for lists
 */
export const StaggeredList: React.FC<{
  items: any[];
  renderItem: (item: any, index: number) => ReactNode;
  className?: string;
  staggerDelay?: number;
}> = ({ items, renderItem, className = '', staggerDelay = 50 }) => {
  const transitions = useTransition(items, {
    from: { opacity: 0, transform: 'translateY(20px)' },
    enter: { opacity: 1, transform: 'translateY(0px)' },
    leave: { opacity: 0, transform: 'translateY(-20px)' },
    trail: staggerDelay,
    config: config.smooth,
  });
  
  return (
    <div className={className}>
      {transitions((style, item, _, index) => (
        <animated.div style={style}>
          {renderItem(item, index)}
        </animated.div>
      ))}
    </div>
  );
};

/**
 * Smooth height animation for collapsible content
 */
export const AnimatedCollapse: React.FC<{
  isOpen: boolean;
  children: ReactNode;
  className?: string;
}> = ({ isOpen, children, className = '' }) => {
  const styles = useSpring({
    height: isOpen ? 'auto' : '0px',
    opacity: isOpen ? 1 : 0,
    overflow: 'hidden',
    config: config.smooth,
  });
  
  return (
    <animated.div style={styles} className={className}>
      {children}
    </animated.div>
  );
};

/**
 * Smooth number counter animation
 */
export const AnimatedCounter: React.FC<{
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}> = ({ value, duration = 1000, format = n => n.toString(), className = '' }) => {
  const { number } = useSpring({
    from: { number: 0 },
    to: { number: value },
    config: { duration },
  });
  
  return (
    <animated.span className={className}>
      {number.to(n => format(Math.floor(n)))}
    </animated.span>
  );
};

/**
 * Page transition wrapper
 */
export const PageTransition: React.FC<AnimatedProps> = ({ children, className = '' }) => {
  const styles = useSpring({
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0px)' },
    config: config.smooth,
  });
  
  return (
    <animated.div style={styles} className={className}>
      {children}
    </animated.div>
  );
};

/**
 * Smooth drag animation for draggable elements
 */
export const DraggableItem: React.FC<{
  isDragging: boolean;
  children: ReactNode;
  className?: string;
}> = ({ isDragging, children, className = '' }) => {
  const styles = useSpring({
    transform: isDragging ? 'scale(1.05)' : 'scale(1)',
    boxShadow: isDragging 
      ? '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
      : '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
    config: config.smooth,
  });
  
  return (
    <animated.div style={styles} className={className}>
      {children}
    </animated.div>
  );
};

/**
 * Smooth modal animation
 */
export const AnimatedModal: React.FC<{
  isOpen: boolean;
  children: ReactNode;
  onClose?: () => void;
  className?: string;
}> = ({ isOpen, children, onClose, className = '' }) => {
  const backdropRef = useRef(null);
  const contentRef = useRef(null);
  
  const backdropAnimation = useSpring({
    ref: backdropRef,
    opacity: isOpen ? 1 : 0,
    config: config.smooth,
  });
  
  const contentAnimation = useSpring({
    ref: contentRef,
    transform: isOpen ? 'scale(1)' : 'scale(0.95)',
    opacity: isOpen ? 1 : 0,
    config: config.smooth,
  });
  
  useChain(isOpen ? [backdropRef, contentRef] : [contentRef, backdropRef], [0, 0.1]);
  
  if (!isOpen) return null;
  
  return (
    <>
      <animated.div 
        style={backdropAnimation}
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      <animated.div 
        style={contentAnimation}
        className={cn('fixed inset-0 z-50 flex items-center justify-center p-4', className)}
      >
        {children}
      </animated.div>
    </>
  );
};

/**
 * Floating action button with spring animation
 */
export const FloatingButton: React.FC<{
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}> = ({ onClick, children, className = '' }) => {
  const [isHovered, setIsHovered] = React.useState(false);
  
  const styles = useSpring({
    transform: isHovered ? 'scale(1.1)' : 'scale(1)',
    config: config.wobbly,
  });
  
  return (
    <animated.button
      style={styles}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
      className={cn(
        'fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center',
        className
      )}
    >
      {children}
    </animated.button>
  );
};

/**
 * Smooth progress bar
 */
export const AnimatedProgress: React.FC<{
  progress: number;
  className?: string;
}> = ({ progress, className = '' }) => {
  const styles = useSpring({
    width: `${progress}%`,
    config: config.smooth,
  });
  
  return (
    <div className={cn('w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden', className)}>
      <animated.div 
        style={styles}
        className="h-full bg-blue-600 dark:bg-blue-400"
      />
    </div>
  );
};