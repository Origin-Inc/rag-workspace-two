import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import type { ReactNode } from 'react';

interface DragAndDropProviderProps {
  children: ReactNode;
}

export function DragAndDropProvider({ children }: DragAndDropProviderProps) {
  return (
    <DndProvider backend={HTML5Backend}>
      {children}
    </DndProvider>
  );
}