import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import "./globals.css";

const ICON_URL = "https://bafybeickwgk2dnzpg7mx3dgz43v2uotxaueu2b3giz57ppx4yoe6ypnbxq.ipfs.dweb.link?filename=icon-1024x1024.png";
const COVER_URL = "https://bafybeigr4qloueaaprjtuz4bayqc2rk6ghxfnk5s6l2uw7u42hcmynodeu.ipfs.dweb.link?filename=cover-1200x630.png";

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = "https://fcweed-minikitapp.vercel.app";

  return {
    title: "CARTEL - $20 Starter Pack",
    description: "The CARTEL season is here. Grab the $20 Starter Pack — water, an AK-47, El Doctor, Kevlar, and a mystery crate. Playable July 5.",
    keywords: ["CARTEL", "Base", "NFT", "staking", "farming", "game", "DeFi", "Web3"],
    authors: [{ name: "CARTEL Team" }],
    openGraph: {
      type: "website",
      locale: "en_US",
      url: baseUrl,
      siteName: "CARTEL",
      title: "CARTEL - $20 Starter Pack",
      description: "The CARTEL season is here. Grab the $20 Starter Pack. Playable July 5.",
      images: [
        {
          url: COVER_URL,
          width: 1200,
          height: 630,
          alt: "CARTEL - $20 Starter Pack",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "CARTEL - $20 Starter Pack",
      description: "The CARTEL season is here. Grab the $20 Starter Pack. Playable July 5.",
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
          title: "Get the Starter Pack",
          action: {
            type: "launch_miniapp",
            name: "CARTEL",
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
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body 
        className={`${inter.variable} ${sourceCodePro.variable}`}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          paddingLeft: 'env(safe-area-inset-left)',
          paddingRight: 'env(safe-area-inset-right)',
        }}
      >
        {children}
      </body>
    </html>
  );
}
