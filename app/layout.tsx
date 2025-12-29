import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import "./globals.css";

// IPFS Image URLs
const ICON_URL = "https://bafybeickwgk2dnzpg7mx3dgz43v2uotxaueu2b3giz57ppx4yoe6ypnbxq.ipfs.dweb.link?filename=icon-1024x1024.png";
const COVER_URL = "https://bafybeigr4qloueaaprjtuz4bayqc2rk6ghxfnk5s6l2uw7u42hcmynodeu.ipfs.dweb.link?filename=cover-1200x630.png";

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
    <html lang="en">
      <head>
        <meta name="base:app_id" content="694d066ac63ad876c90812b8" />
      </head>
      <body className={`${inter.variable} ${sourceCodePro.variable}`}>
        {children}
      </body>
    </html>
  );
}
