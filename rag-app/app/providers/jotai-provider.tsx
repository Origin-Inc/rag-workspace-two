import { Provider as JotaiProvider } from 'jotai';
import { DevTools } from 'jotai-devtools';
import 'jotai-devtools/styles.css';
import { ReactNode, Suspense } from 'react';

interface JotaiProviderWrapperProps {
  children: ReactNode;
}

export function JotaiProviderWrapper({ children }: JotaiProviderWrapperProps) {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return (
    <JotaiProvider>
      <Suspense fallback={null}>
        {children}
        {isDevelopment && <DevTools />}
      </Suspense>
    </JotaiProvider>
  );
}