"use client";

import { ReactNode, useEffect, useState } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";
import { sdk } from "@farcaster/miniapp-sdk";
import FCWeedApp from "./FCWeedApp";
import { autoRefreshManager } from "./lib/autoRefresh";

// Configure WalletConnect for additional wallet support
// This extends OnchainKit's built-in wallet support
const WALLETCONNECT_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "";

function Providers({ children }: { children: ReactNode }) {
  return (
    <OnchainKitProvider
      apiKey={process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY}
      chain={base}
      config={{
        appearance: {
          mode: "auto",
        },
        wallet: {
          display: "modal",
          // Enable all wallet types including external wallets
          preference: "all",
        },
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}

export default function App() {
  const [mounted, setMounted] = useState(false);

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
    <Providers>
      <FCWeedApp />
    </Providers>
  );
}
