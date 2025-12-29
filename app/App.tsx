"use client";

import { ReactNode } from "react";
import { base } from "wagmi/chains";
import { MiniKitProvider } from "@coinbase/onchainkit/minikit";
import "@coinbase/onchainkit/styles.css";
import FCWeedApp from "./FCWeedApp";

function Providers({ children }: { children: ReactNode }) {
  return (
    <MiniKitProvider
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
    </MiniKitProvider>
  );
}

export default function App() {
  return (
    <Providers>
      <FCWeedApp />
    </Providers>
  );
}
