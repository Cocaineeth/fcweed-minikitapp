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
  injectedWallet,      // Auto-detects when INSIDE wallet app browser (Rabby, Phantom, etc)
  metaMaskWallet,
  coinbaseWallet,
  walletConnectWallet,
  rainbowWallet,
  phantomWallet,
  rabbyWallet,
  trustWallet,
  okxWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { WagmiProvider, http, createConfig } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "3a8170812b534d0ff9d794f19a901d64";

// =============================================================================
// WALLET CONFIGURATION
// =============================================================================
// Note: When multiple wallet extensions are installed, they can conflict over
// window.ethereum. RainbowKit handles this via EIP-6963, but some older extensions
// may still cause issues. Phantom uses window.phantom.ethereum as dedicated provider.
const connectors = connectorsForWallets(
  [
    {
      // Installed wallets - these show first when extension is detected
      // Phantom is prioritized as it has its own dedicated provider (window.phantom.ethereum)
      groupName: "Installed",
      wallets: [
        phantomWallet,    // Uses window.phantom.ethereum - avoids conflicts
        rabbyWallet,      // Uses window.rabby when available
        metaMaskWallet,
        coinbaseWallet,
      ],
    },
    {
      // injectedWallet catches any other wallet extensions
      groupName: "Detected",
      wallets: [
        injectedWallet,
      ],
    },
    {
      groupName: "More Wallets",
      wallets: [
        rainbowWallet,
        trustWallet,
        okxWallet,
        zerionWallet,
        walletConnectWallet,  // Generic WalletConnect fallback - keep last
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
          modalSize="wide"
          initialChain={base}
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
    
    // Log wallet extension detection for debugging multi-wallet conflicts
    const anyWindow = window as any;
    console.log("[FCWEED] Wallet extensions detected:", {
      "window.ethereum": !!anyWindow.ethereum,
      "window.ethereum.isMetaMask": anyWindow.ethereum?.isMetaMask,
      "window.ethereum.isPhantom": anyWindow.ethereum?.isPhantom,
      "window.ethereum.isRabby": anyWindow.ethereum?.isRabby,
      "window.phantom.ethereum": !!anyWindow.phantom?.ethereum,
      "window.rabby": !!anyWindow.rabby,
      "EIP-6963 providers": anyWindow.ethereum?.providers?.length || 0,
    });
    
    // If multiple wallets detected, log a helpful message
    const walletCount = [
      anyWindow.ethereum?.isMetaMask,
      anyWindow.phantom?.ethereum,
      anyWindow.rabby,
      anyWindow.ethereum?.isCoinbaseWallet,
    ].filter(Boolean).length;
    
    if (walletCount > 1) {
      console.warn("[FCWEED] ⚠️ Multiple wallet extensions detected. If connection fails, try disabling other wallet extensions temporarily.");
    }
    
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
