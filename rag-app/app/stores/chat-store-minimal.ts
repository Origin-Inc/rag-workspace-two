import { create } from 'zustand';

// Absolute minimal store to test basic functionality
interface MinimalChatState {
  isOpen: boolean;
  messages: string[];
  setOpen: (open: boolean) => void;
  addMessage: (message: string) => void;
}

export const useMinimalChatStore = create<MinimalChatState>((set) => ({
  isOpen: false,
  messages: [],
  setOpen: (open) => set({ isOpen: open }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
}));