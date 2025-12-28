import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

// IPFS Image URLs
const ICON_URL = "https://bafybeickwgk2dnzpg7mx3dgz43v2uotxaueu2b3giz57ppx4yoe6ypnbxq.ipfs.dweb.link?filename=icon-1024x1024.png";
const COVER_URL = "https://bafybeigr4qloueaaprjtuz4bayqc2rk6ghxfnk5s6l2uw7u42hcmynodeu.ipfs.dweb.link?filename=cover-1200x630.png";
const SCREENSHOT_1 = "https://bafybeigro2m66af7ze7bpv7oiov2nwzpa36kadlrooso4ymxseuwjravde.ipfs.dweb.link?filename=screenshot1-1284x2778.png";
const SCREENSHOT_2 = "https://bafybeiemdsohwakk2egufszrp5lwxpyu2feqgtedwj6yrzexfpe7v5x7gu.ipfs.dweb.link?filename=screenshot2-1284x2778.png";
const SCREENSHOT_3 = "https://bafybeifhlfytkxxfsoexhenytlfe2bnnt6cdfzx6nrhusebwuuvjaa6yz4.ipfs.dweb.link?filename=screenshot3-1284x2778.png";

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = "https://fcweed-minikitapp.vercel.app";

  return {
    title: "FCWEED - Stake to Earn Farming Game",
    description: "Stake Land & Plant NFTs on Base to earn FCWEED tokens. Battle in Cartel Wars, open mystery crates, and climb the Crime Ladder!",
    keywords: ["FCWEED", "Base", "NFT", "staking", "farming", "game", "DeFi", "Web3"],
    authors: [{ name: "FCWEED Team" }],
    openGraph: {
      type: "website",
      locale: "en_US",
      url: baseUrl,
      siteName: "FCWEED",
      title: "FCWEED - Stake to Earn Farming Game",
      description: "Stake Land & Plant NFTs on Base to earn FCWEED tokens",
      images: [
        {
          url: COVER_URL,
          width: 1200,
          height: 630,
          alt: "FCWEED - Stake to Earn Farming Game",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "FCWEED - Stake to Earn Farming Game",
      description: "Stake Land & Plant NFTs on Base to earn FCWEED tokens",
      images: [COVER_URL],
    },
    icons: {
      icon: ICON_URL,
      apple: ICON_URL,
    },
    other: {
      "fc:miniapp": JSON.stringify({
        version: "1",
        imageUrl: ICON_URL,
        button: {
          title: "Start your Crime Empire",
          action: {
            type: "launch_miniapp",
            name: "FCWEED",
            url: `${baseUrl}/`,
            splashImageUrl: COVER_URL,
            splashBackgroundColor: "#050812",
          },
        },
      }),
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-source-code-pro",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <RootProvider>
      <html lang="en">
        <head>
          {/* Base App verification */}
          <meta name="base:app_id" content="694d066ac63ad876c90812b8" />
        </head>
        <body className={`${inter.variable} ${sourceCodePro.variable}`}>
          <SafeArea>{children}</SafeArea>
        </body>
      </html>
    </RootProvider>
  );
}
