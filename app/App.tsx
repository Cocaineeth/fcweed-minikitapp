"use client";

import { ReactNode, useEffect, useState } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
// Removed: import "@coinbase/onchainkit/styles.css"; - conflicts with Tailwind v3
import { sdk } from "@farcaster/miniapp-sdk";
import FCWeedApp from "./FCWeedApp";
import { autoRefreshManager } from "./lib/autoRefresh";

// RainbowKit imports
import "@rainbow-me/rainbowkit/styles.css";
import { 
  RainbowKitProvider, 
  darkTheme, 
  lightTheme,
  connectorsForWallets,
} from "@rainbow-me/rainbowkit";
import {
  metaMaskWallet,
  coinbaseWallet,
  rainbowWallet,
  walletConnectWallet,
  phantomWallet,
  rabbyWallet,
  trustWallet,
  injectedWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, http, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64";

// Custom wallet configuration with Phantom and Rabby
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        metaMaskWallet,
        coinbaseWallet,
        rabbyWallet,
        phantomWallet,
      ],
    },
    {
      groupName: "Other",
      wallets: [
        rainbowWallet,
        walletConnectWallet,
        trustWallet,
        injectedWallet,
      ],
    },
  ],
  {
    appName: "FCWEED",
    projectId,
  }
);

// Create wagmi config with custom connectors
const config = createConfig({
  connectors,
  chains: [base],
  transports: {
    [base.id]: http("https://base.publicnode.com"),
  },
  ssr: false,
});

const queryClient = new QueryClient();

function Providers({ children, theme }: { children: ReactNode; theme: "dark" | "light" }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider 
          theme={theme === "dark" ? darkTheme() : lightTheme()}
          modalSize="compact"
        >
          <OnchainKitProvider
            apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
            chain={base}
            config={{
              appearance: {
                mode: "auto",
              },
              wallet: {
                display: "modal",
                preference: "all",
              },
            }}
          >
            {children}
          </OnchainKitProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default function App() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    setMounted(true);
    
    // Initialize Farcaster SDK
    const init = async () => {
      try {
        await sdk.actions.ready();
        console.log("[FCWeed] Farcaster SDK ready");
      } catch (e) {
        console.log("[FCWeed] Not in frame context (normal for standalone)");
      }
    };
    init();

    // Initialize auto-refresh manager with backend URL
    const backendUrl = process.env.NEXT_PUBLIC_WARS_BACKEND_URL || "https://wars.x420ponzi.com";
    autoRefreshManager.setBackendUrl(backendUrl);

    // Cleanup on unmount
    return () => {
      autoRefreshManager.stopAll();
    };
  }, []);

  if (!mounted) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050812",
          color: "#c0c9f4",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🌿</div>
          <div>Loading FCWeed...</div>
        </div>
      </div>
    );
  }

  return (
    <Providers theme={theme}>
      <FCWeedApp onThemeChange={setTheme} />
    </Providers>
  );
}
