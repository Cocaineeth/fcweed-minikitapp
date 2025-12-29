// lib/wagmiConfig.ts
import { http, createConfig } from 'wagmi'
import { base } from 'wagmi/chains'
import { farcasterMiniApp } from '@farcaster/miniapp-wagmi-connector'

// Check if we're in a browser environment
const isBrowser = typeof window !== 'undefined';

// Create wagmi config with Farcaster miniapp connector
export const wagmiConfig = createConfig({
  chains: [base],
  transports: {
    [base.id]: http('https://mainnet.base.org'),
  },
  connectors: [
    farcasterMiniApp(),
  ],
  // Disable SSR since this is a client-only app
  ssr: false,
});

export { base };
