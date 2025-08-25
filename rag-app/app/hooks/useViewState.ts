import { useState, useCallback, useEffect } from 'react';
import type { ViewType } from '~/types/database-block';

interface ViewState {
  currentView: ViewType;
  viewSettings: Record<ViewType, ViewSettings>;
}

interface ViewSettings {
  // Common settings for all views
  rowHeight?: 'compact' | 'normal' | 'comfortable';
  showRowNumbers?: boolean;
  
  // Table-specific
  frozenColumns?: number;
  
  // Gallery-specific
  coverField?: string;
  cardSize?: 'small' | 'medium' | 'large';
  
  // Kanban-specific
  groupByField?: string;
  hideEmptyGroups?: boolean;
  cardPreviewFields?: string[];
  
  // Calendar-specific
  dateField?: string;
  calendarView?: 'month' | 'week' | 'day';
  startWeekOn?: 'sunday' | 'monday';
  
  // Timeline-specific
  startDateField?: string;
  endDateField?: string;
  timelineScale?: 'day' | 'week' | 'month' | 'quarter' | 'year';
}

const defaultViewSettings: Record<ViewType, ViewSettings> = {
  table: {
    rowHeight: 'normal',
    showRowNumbers: false,
    frozenColumns: 0
  },
  gallery: {
    cardSize: 'medium',
    coverField: undefined
  },
  kanban: {
    groupByField: undefined,
    hideEmptyGroups: false,
    cardPreviewFields: []
  },
  calendar: {
    dateField: undefined,
    calendarView: 'month',
    startWeekOn: 'sunday'
  },
  timeline: {
    startDateField: undefined,
    endDateField: undefined,
    timelineScale: 'month'
  }
};

export function useViewState(blockId: string, initialView: ViewType = 'table') {
  // Load saved view state from localStorage
  const loadSavedState = (): ViewState => {
    if (typeof window === 'undefined') {
      return {
        currentView: initialView,
        viewSettings: defaultViewSettings
      };
    }
    
    const savedState = localStorage.getItem(`db-view-state-${blockId}`);
    if (savedState) {
      try {
        return JSON.parse(savedState);
      } catch {
        // Invalid saved state, use defaults
      }
    }
    
    return {
      currentView: initialView,
      viewSettings: defaultViewSettings
    };
  };

  const [viewState, setViewState] = useState<ViewState>(loadSavedState);

  // Save view state to localStorage whenever it changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`db-view-state-${blockId}`, JSON.stringify(viewState));
    }
  }, [blockId, viewState]);

  const changeView = useCallback((newView: ViewType) => {
    setViewState(prev => ({
      ...prev,
      currentView: newView
    }));
  }, []);

  const updateViewSettings = useCallback((
    view: ViewType,
    settings: Partial<ViewSettings>
  ) => {
    setViewState(prev => ({
      ...prev,
      viewSettings: {
        ...prev.viewSettings,
        [view]: {
          ...prev.viewSettings[view],
          ...settings
        }
      }
    }));
  }, []);

  const getCurrentViewSettings = useCallback((): ViewSettings => {
    return viewState.viewSettings[viewState.currentView];
  }, [viewState]);

  const resetViewSettings = useCallback((view?: ViewType) => {
    if (view) {
      setViewState(prev => ({
        ...prev,
        viewSettings: {
          ...prev.viewSettings,
          [view]: defaultViewSettings[view]
        }
      }));
    } else {
      setViewState(prev => ({
        ...prev,
        viewSettings: defaultViewSettings
      }));
    }
  }, []);

  return {
    currentView: viewState.currentView,
    viewSettings: viewState.viewSettings,
    changeView,
    updateViewSettings,
    getCurrentViewSettings,
    resetViewSettings
  };
}