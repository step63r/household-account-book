import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';

import { queryClient } from '@/lib/query-client';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GlobalLoadingOverlay } from '@/components/layout/GlobalLoadingOverlay';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        <GlobalLoadingOverlay />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
