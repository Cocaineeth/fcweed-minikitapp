// app/rootProvider.tsx
"use client";

import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import { ReactNode } from 'react';

export function RootProvider({ children }: { children: ReactNode }) {
  return (
    <MiniKitProvider>{children}</MiniKitProvider>
  );
}
