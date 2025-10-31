import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LayoutState {
  // Chat sidebar
  chatSidebarWidth: number;
  isChatSidebarOpen: boolean;
  
  // Left menu sidebar
  menuSidebarWidth: number;
  isMenuCollapsed: boolean;
  isMenuOpen: boolean; // For mobile
  
  // Actions
  setChatSidebarWidth: (width: number) => void;
  toggleChatSidebar: () => void;
  setChatSidebarOpen: (open: boolean) => void;
  
  setMenuSidebarWidth: (width: number) => void;
  toggleMenuCollapse: () => void;
  setMenuCollapsed: (collapsed: boolean) => void;
  toggleMenu: () => void;
  setMenuOpen: (open: boolean) => void;
  
  // Reset to defaults
  resetLayout: () => void;
}

// Default values
const DEFAULT_CHAT_WIDTH = 400;
const DEFAULT_MENU_WIDTH = 256;
const MIN_CHAT_WIDTH = 320;
const MAX_CHAT_WIDTH = 800; // Increased from 600 to better accommodate charts
const MIN_MENU_WIDTH = 200;
const MAX_MENU_WIDTH = 400;
const COLLAPSED_MENU_WIDTH = 64;

// Export constants for use in other components
export { DEFAULT_CHAT_WIDTH, MIN_CHAT_WIDTH, MAX_CHAT_WIDTH };

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      // Initial state
      chatSidebarWidth: DEFAULT_CHAT_WIDTH,
      isChatSidebarOpen: false,
      menuSidebarWidth: DEFAULT_MENU_WIDTH,
      isMenuCollapsed: false,
      isMenuOpen: false,
      
      // Chat sidebar actions
      setChatSidebarWidth: (width) => set((state) => ({
        chatSidebarWidth: Math.min(MAX_CHAT_WIDTH, Math.max(MIN_CHAT_WIDTH, width))
      })),
      
      toggleChatSidebar: () => set((state) => ({
        isChatSidebarOpen: !state.isChatSidebarOpen
      })),
      
      setChatSidebarOpen: (open) => set({ isChatSidebarOpen: open }),
      
      // Menu sidebar actions
      setMenuSidebarWidth: (width) => set((state) => ({
        menuSidebarWidth: Math.min(MAX_MENU_WIDTH, Math.max(MIN_MENU_WIDTH, width))
      })),
      
      toggleMenuCollapse: () => set((state) => ({
        isMenuCollapsed: !state.isMenuCollapsed
      })),
      
      setMenuCollapsed: (collapsed) => set({ isMenuCollapsed: collapsed }),
      
      toggleMenu: () => set((state) => ({
        isMenuOpen: !state.isMenuOpen
      })),
      
      setMenuOpen: (open) => set({ isMenuOpen: open }),
      
      // Reset
      resetLayout: () => set({
        chatSidebarWidth: DEFAULT_CHAT_WIDTH,
        isChatSidebarOpen: false,
        menuSidebarWidth: DEFAULT_MENU_WIDTH,
        isMenuCollapsed: false,
        isMenuOpen: false,
      }),
    }),
    {
      name: 'layout-preferences',
      partialize: (state) => ({
        chatSidebarWidth: state.chatSidebarWidth,
        menuSidebarWidth: state.menuSidebarWidth,
        isMenuCollapsed: state.isMenuCollapsed,
        // Don't persist open/closed states
      }),
    }
  )
);

// Export constants for use in components
export const LAYOUT_CONSTANTS = {
  DEFAULT_CHAT_WIDTH,
  DEFAULT_MENU_WIDTH,
  MIN_CHAT_WIDTH,
  MAX_CHAT_WIDTH,
  MIN_MENU_WIDTH,
  MAX_MENU_WIDTH,
  COLLAPSED_MENU_WIDTH,
};