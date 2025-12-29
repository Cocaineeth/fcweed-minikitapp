// app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import { WagmiProvider } from "./components/WagmiProvider";

export const metadata: Metadata = {
  title: "FCWeed - Stake to Earn",
  description: "Stake Land & Plant NFTs on Base to earn FCWEED tokens",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <WagmiProvider>
          {children}
        </WagmiProvider>
      </body>
    </html>
  );
}
