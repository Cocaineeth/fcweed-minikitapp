// components/WagmiProvider.tsx
"use client";

import { WagmiProvider as WagmiProviderBase } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MiniKitProvider } from '@coinbase/onchainkit/minikit';
import { wagmiConfig } from '../lib/wagmiConfig';
import { ReactNode, useState } from 'react';

export function WagmiProvider({ children }: { children: ReactNode }) {
  // Create a stable QueryClient instance
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  }));

  return (
    <WagmiProviderBase config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider>
          {children}
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProviderBase>
  );
}
