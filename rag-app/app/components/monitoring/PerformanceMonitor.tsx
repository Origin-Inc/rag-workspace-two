import { memo, useEffect, useState, useRef, useCallback } from 'react';
import { cn } from '~/utils/cn';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  trend?: 'up' | 'down' | 'stable';
  history: number[];
  timestamp: number;
}

interface PerformanceData {
  renderCount: number;
  renderTime: number;
  memoryUsage: number;
  fps: number;
  dataRows: number;
  visibleRows: number;
  cacheHitRate: number;
  workerUtilization: number;
  networkLatency: number;
  dbQueryTime: number;
}

interface PerformanceMonitorProps {
  enabled?: boolean;
  sampleRate?: number;
  maxHistory?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  onMetricsUpdate?: (metrics: PerformanceData) => void;
  className?: string;
}

export const PerformanceMonitor = memo(function PerformanceMonitor({
  enabled = true,
  sampleRate = 1000,
  maxHistory = 60,
  position = 'bottom-right',
  onMetricsUpdate,
  className
}: PerformanceMonitorProps) {
  const [metrics, setMetrics] = useState<Map<string, PerformanceMetric>>(new Map());
  const [isMinimized, setIsMinimized] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  
  const frameCount = useRef(0);
  const lastFrameTime = useRef(performance.now());
  const renderTimes = useRef<number[]>([]);
  const animationFrame = useRef<number>();
  
  // Calculate FPS
  const calculateFPS = useCallback(() => {
    const now = performance.now();
    const delta = now - lastFrameTime.current;
    
    if (delta >= 1000) {
      const fps = Math.round((frameCount.current * 1000) / delta);
      frameCount.current = 0;
      lastFrameTime.current = now;
      return fps;
    }
    
    frameCount.current++;
    return null;
  }, []);
  
  // Get memory usage
  const getMemoryUsage = useCallback(() => {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return Math.round(memory.usedJSHeapSize / 1048576); // MB
    }
    return 0;
  }, []);
  
  // Update metrics
  const updateMetrics = useCallback(() => {
    const now = Date.now();
    const newMetrics = new Map(metrics);
    
    // FPS
    const fps = calculateFPS();
    if (fps !== null) {
      const fpsMetric = newMetrics.get('fps') || {
        name: 'FPS',
        value: 0,
        unit: 'fps',
        history: [],
        timestamp: now
      };
      
      fpsMetric.value = fps;
      fpsMetric.history.push(fps);
      if (fpsMetric.history.length > maxHistory) {
        fpsMetric.history.shift();
      }
      
      // Determine trend
      if (fpsMetric.history.length > 1) {
        const recent = fpsMetric.history.slice(-5);
        const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
        fpsMetric.trend = fps > avg + 5 ? 'up' : fps < avg - 5 ? 'down' : 'stable';
      }
      
      fpsMetric.timestamp = now;
      newMetrics.set('fps', fpsMetric);
    }
    
    // Memory
    const memory = getMemoryUsage();
    const memMetric = newMetrics.get('memory') || {
      name: 'Memory',
      value: 0,
      unit: 'MB',
      history: [],
      timestamp: now
    };
    
    memMetric.value = memory;
    memMetric.history.push(memory);
    if (memMetric.history.length > maxHistory) {
      memMetric.history.shift();
    }
    
    memMetric.timestamp = now;
    newMetrics.set('memory', memMetric);
    
    // Render time
    if (renderTimes.current.length > 0) {
      const avgRenderTime = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;
      
      const renderMetric = newMetrics.get('renderTime') || {
        name: 'Render',
        value: 0,
        unit: 'ms',
        history: [],
        timestamp: now
      };
      
      renderMetric.value = Math.round(avgRenderTime * 100) / 100;
      renderMetric.history.push(renderMetric.value);
      if (renderMetric.history.length > maxHistory) {
        renderMetric.history.shift();
      }
      
      renderMetric.timestamp = now;
      newMetrics.set('renderTime', renderMetric);
      
      renderTimes.current = [];
    }
    
    setMetrics(newMetrics);
    
    // Notify parent
    if (onMetricsUpdate) {
      const data: PerformanceData = {
        renderCount: 0,
        renderTime: newMetrics.get('renderTime')?.value || 0,
        memoryUsage: memory,
        fps: newMetrics.get('fps')?.value || 0,
        dataRows: 0,
        visibleRows: 0,
        cacheHitRate: 0,
        workerUtilization: 0,
        networkLatency: 0,
        dbQueryTime: 0
      };
      
      onMetricsUpdate(data);
    }
  }, [metrics, calculateFPS, getMemoryUsage, maxHistory, onMetricsUpdate]);
  
  // Animation loop for FPS calculation
  useEffect(() => {
    if (!enabled) return;
    
    const animate = () => {
      updateMetrics();
      animationFrame.current = requestAnimationFrame(animate);
    };
    
    animationFrame.current = requestAnimationFrame(animate);
    
    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [enabled, updateMetrics]);
  
  // Sample metrics periodically
  useEffect(() => {
    if (!enabled) return;
    
    const interval = setInterval(updateMetrics, sampleRate);
    
    return () => clearInterval(interval);
  }, [enabled, sampleRate, updateMetrics]);
  
  // Track render time
  useEffect(() => {
    const start = performance.now();
    
    return () => {
      const end = performance.now();
      renderTimes.current.push(end - start);
      if (renderTimes.current.length > 10) {
        renderTimes.current.shift();
      }
    };
  });
  
  if (!enabled) return null;
  
  const positionClasses = {
    'top-left': 'top-4 left-4',
    'top-right': 'top-4 right-4',
    'bottom-left': 'bottom-4 left-4',
    'bottom-right': 'bottom-4 right-4'
  };
  
  const renderSparkline = (history: number[]) => {
    if (history.length < 2) return null;
    
    const max = Math.max(...history);
    const min = Math.min(...history);
    const range = max - min || 1;
    const width = 60;
    const height = 20;
    
    const points = history.map((value, index) => {
      const x = (index / (history.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    }).join(' ');
    
    return (
      <svg width={width} height={height} className="inline-block ml-2">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.5"
        />
      </svg>
    );
  };
  
  return (
    <div
      className={cn(
        'fixed z-50 bg-black/90 text-white rounded-lg shadow-lg font-mono text-xs transition-all',
        positionClasses[position],
        isMinimized ? 'w-auto' : 'w-64',
        className
      )}
    >
      {/* Header */}
      <div 
        className="flex items-center justify-between px-3 py-2 border-b border-white/20 cursor-pointer"
        onClick={() => setIsMinimized(!isMinimized)}
      >
        <span className="font-bold">Performance</span>
        <span className="text-gray-400">
          {isMinimized ? '▶' : '▼'}
        </span>
      </div>
      
      {/* Metrics */}
      {!isMinimized && (
        <div className="p-3 space-y-2">
          {Array.from(metrics.entries()).map(([key, metric]) => (
            <div
              key={key}
              className={cn(
                'flex items-center justify-between cursor-pointer hover:bg-white/10 px-2 py-1 rounded',
                selectedMetric === key && 'bg-white/10'
              )}
              onClick={() => setSelectedMetric(key === selectedMetric ? null : key)}
            >
              <div className="flex items-center gap-2">
                <span className="text-gray-400">{metric.name}:</span>
                <span className={cn(
                  'font-bold',
                  metric.trend === 'up' && 'text-green-400',
                  metric.trend === 'down' && 'text-red-400',
                  metric.trend === 'stable' && 'text-white'
                )}>
                  {metric.value}{metric.unit}
                </span>
                {metric.trend && (
                  <span className="text-xs">
                    {metric.trend === 'up' && '↑'}
                    {metric.trend === 'down' && '↓'}
                    {metric.trend === 'stable' && '→'}
                  </span>
                )}
              </div>
              {selectedMetric === key && renderSparkline(metric.history)}
            </div>
          ))}
          
          {/* Additional metrics */}
          <div className="mt-2 pt-2 border-t border-white/20 space-y-1">
            <div className="flex justify-between text-gray-400">
              <span>Samples:</span>
              <span>{metrics.get('fps')?.history.length || 0}/{maxHistory}</span>
            </div>
            <div className="flex justify-between text-gray-400">
              <span>Update rate:</span>
              <span>{sampleRate}ms</span>
            </div>
          </div>
          
          {/* Performance warnings */}
          {metrics.get('fps')?.value && metrics.get('fps')!.value < 30 && (
            <div className="mt-2 p-2 bg-red-500/20 rounded text-red-400 text-xs">
              ⚠️ Low FPS detected
            </div>
          )}
          
          {metrics.get('memory')?.value && metrics.get('memory')!.value > 500 && (
            <div className="mt-2 p-2 bg-yellow-500/20 rounded text-yellow-400 text-xs">
              ⚠️ High memory usage
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export default PerformanceMonitor;