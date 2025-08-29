import { useState, useCallback, useRef } from 'react';
import { useFetcher } from '@remix-run/react';

export interface OptimisticState<T> {
  data: T;
  isPending: boolean;
  error: string | null;
  rollbackData: T | null;
}

export interface UseOptimisticUpdateOptions<T> {
  onSuccess?: (data: T) => void;
  onError?: (error: string, rollbackData: T) => void;
  updateDelay?: number; // Artificial delay for testing
}

/**
 * Hook for optimistic updates with instant UI feedback and rollback on failure
 * Target: <50ms UI response time
 */
export function useOptimisticUpdate<T>(
  initialData: T,
  options: UseOptimisticUpdateOptions<T> = {}
) {
  const [state, setState] = useState<OptimisticState<T>>({
    data: initialData,
    isPending: false,
    error: null,
    rollbackData: null,
  });
  
  const fetcher = useFetcher();
  const rollbackDataRef = useRef<T | null>(null);
  const updateStartTimeRef = useRef<number>(0);
  
  /**
   * Perform optimistic update
   */
  const optimisticUpdate = useCallback(async (
    updateFn: (current: T) => T,
    serverAction: () => Promise<T>
  ) => {
    updateStartTimeRef.current = performance.now();
    
    // Store current data for rollback
    rollbackDataRef.current = state.data;
    
    // Apply optimistic update immediately (<50ms)
    setState(prev => ({
      ...prev,
      data: updateFn(prev.data),
      isPending: true,
      error: null,
      rollbackData: rollbackDataRef.current,
    }));
    
    // Log UI update time
    const uiUpdateTime = performance.now() - updateStartTimeRef.current;
    if (uiUpdateTime > 50) {
      console.warn(`[OptimisticUpdate] UI update took ${uiUpdateTime.toFixed(2)}ms (target: <50ms)`);
    }
    
    try {
      // Add artificial delay if specified (for testing)
      if (options.updateDelay) {
        await new Promise(resolve => setTimeout(resolve, options.updateDelay));
      }
      
      // Perform server action
      const serverData = await serverAction();
      
      // Update with server response
      setState(prev => ({
        ...prev,
        data: serverData,
        isPending: false,
        error: null,
        rollbackData: null,
      }));
      
      options.onSuccess?.(serverData);
      
      // Log total operation time
      const totalTime = performance.now() - updateStartTimeRef.current;
      console.log(`[OptimisticUpdate] Total operation: ${totalTime.toFixed(2)}ms`);
      
      return serverData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Update failed';
      
      // Rollback to previous state
      setState(prev => ({
        ...prev,
        data: rollbackDataRef.current!,
        isPending: false,
        error: errorMessage,
        rollbackData: null,
      }));
      
      options.onError?.(errorMessage, rollbackDataRef.current!);
      
      throw error;
    }
  }, [state.data, options]);
  
  /**
   * Batch multiple optimistic updates
   */
  const batchOptimisticUpdate = useCallback(async (
    updates: Array<{
      updateFn: (current: T) => T;
      serverAction: () => Promise<T>;
    }>
  ) => {
    updateStartTimeRef.current = performance.now();
    rollbackDataRef.current = state.data;
    
    // Apply all optimistic updates at once
    let optimisticData = state.data;
    for (const update of updates) {
      optimisticData = update.updateFn(optimisticData);
    }
    
    setState(prev => ({
      ...prev,
      data: optimisticData,
      isPending: true,
      error: null,
      rollbackData: rollbackDataRef.current,
    }));
    
    try {
      // Execute all server actions in parallel
      const results = await Promise.all(
        updates.map(update => update.serverAction())
      );
      
      // Use the last result as the final state
      const finalData = results[results.length - 1];
      
      setState(prev => ({
        ...prev,
        data: finalData,
        isPending: false,
        error: null,
        rollbackData: null,
      }));
      
      options.onSuccess?.(finalData);
      
      return finalData;
    } catch (error) {
      // Rollback all changes
      setState(prev => ({
        ...prev,
        data: rollbackDataRef.current!,
        isPending: false,
        error: error instanceof Error ? error.message : 'Batch update failed',
        rollbackData: null,
      }));
      
      throw error;
    }
  }, [state.data, options]);
  
  /**
   * Reset error state
   */
  const resetError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);
  
  return {
    ...state,
    optimisticUpdate,
    batchOptimisticUpdate,
    resetError,
  };
}

/**
 * Hook for optimistic list operations (add, remove, update)
 */
export function useOptimisticList<T extends { id: string | number }>(
  initialItems: T[],
  options: UseOptimisticUpdateOptions<T[]> = {}
) {
  const optimistic = useOptimisticUpdate(initialItems, options);
  
  const addItem = useCallback(async (
    item: T,
    serverAction: () => Promise<T[]>
  ) => {
    return optimistic.optimisticUpdate(
      items => [...items, item],
      serverAction
    );
  }, [optimistic]);
  
  const removeItem = useCallback(async (
    itemId: string | number,
    serverAction: () => Promise<T[]>
  ) => {
    return optimistic.optimisticUpdate(
      items => items.filter(item => item.id !== itemId),
      serverAction
    );
  }, [optimistic]);
  
  const updateItem = useCallback(async (
    itemId: string | number,
    updates: Partial<T>,
    serverAction: () => Promise<T[]>
  ) => {
    return optimistic.optimisticUpdate(
      items => items.map(item => 
        item.id === itemId ? { ...item, ...updates } : item
      ),
      serverAction
    );
  }, [optimistic]);
  
  const reorderItems = useCallback(async (
    fromIndex: number,
    toIndex: number,
    serverAction: () => Promise<T[]>
  ) => {
    return optimistic.optimisticUpdate(
      items => {
        const newItems = [...items];
        const [removed] = newItems.splice(fromIndex, 1);
        newItems.splice(toIndex, 0, removed);
        return newItems;
      },
      serverAction
    );
  }, [optimistic]);
  
  return {
    ...optimistic,
    items: optimistic.data,
    addItem,
    removeItem,
    updateItem,
    reorderItems,
  };
}

/**
 * Hook for optimistic form submission
 */
export function useOptimisticForm<T>(
  initialData: T,
  action: string,
  options: UseOptimisticUpdateOptions<T> = {}
) {
  const fetcher = useFetcher();
  const [optimisticData, setOptimisticData] = useState(initialData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const submit = useCallback(async (formData: FormData) => {
    const startTime = performance.now();
    
    // Apply optimistic update
    const optimisticValues = Object.fromEntries(formData.entries());
    setOptimisticData(prev => ({ ...prev, ...optimisticValues } as T));
    setIsSubmitting(true);
    
    // Log UI update time
    const uiTime = performance.now() - startTime;
    console.log(`[OptimisticForm] UI updated in ${uiTime.toFixed(2)}ms`);
    
    // Submit to server
    fetcher.submit(formData, { method: 'post', action });
  }, [fetcher, action]);
  
  // Handle server response
  useCallback(() => {
    if (fetcher.state === 'idle' && fetcher.data) {
      setIsSubmitting(false);
      
      if (fetcher.data.error) {
        // Rollback on error
        setOptimisticData(initialData);
        options.onError?.(fetcher.data.error, initialData);
      } else {
        // Update with server data
        setOptimisticData(fetcher.data);
        options.onSuccess?.(fetcher.data);
      }
    }
  }, [fetcher.state, fetcher.data, initialData, options]);
  
  return {
    data: optimisticData,
    isSubmitting,
    submit,
    fetcher,
  };
}