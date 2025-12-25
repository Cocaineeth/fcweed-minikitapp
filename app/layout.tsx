import type { Metadata } from "next";
import { Inter, Source_Code_Pro } from "next/font/google";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const baseUrl = "https://fcweed-minikitapp.vercel.app";

  return {
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    other: {
      "fc:miniapp": JSON.stringify({
        version: "1",
        imageUrl: `${baseUrl}/logo.png`,
        button: {
          title: "Start your Crime Empire",
          action: {
            type: "launch_miniapp",
            name: "FCWEED",
            url: `${baseUrl}/`,
            splashImageUrl: `${baseUrl}/splash.png`,
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
          {/* Base App verification - allows this app to work as a Base App */}
          <meta name="base:app_id" content="694d066ac63ad876c90812b8" />
        </head>
        <body className={`${inter.variable} ${sourceCodePro.variable}`}>
          <SafeArea>{children}</SafeArea>
        </body>
      </html>
    </RootProvider>
  );
}
