// app/rootProvider.tsx
"use client";

import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { base } from "wagmi/chains";
import { http, createConfig, WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector';
import { ReactNode, useState, useEffect } from 'react';

// Wagmi config with Farcaster MINIAPP connector (not frame connector)
const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http(),
  },
  connectors: [
    farcasterMiniApp(),
  ],
});

export function RootProvider({ children }: { children: ReactNode }) {
  // Track if we're on client side
  const [mounted, setMounted] = useState(false);
  
  // Create QueryClient inside component to avoid SSR issues
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
      },
    },
  }));

  useEffect(() => {
    setMounted(true);
  }, []);

  // During SSR/build, render children without providers that require browser
  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <MiniKitProvider>
          <SafeArea>{children}</SafeArea>
        </MiniKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
