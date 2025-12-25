const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

// IPFS Image URLs for Base App Featured submission
const ICON_URL = "https://bafybeickwgk2dnzpg7mx3dgz43v2uotxaueu2b3giz57ppx4yoe6ypnbxq.ipfs.dweb.link?filename=icon-1024x1024.png";
const COVER_URL = "https://bafybeigr4qloueaaprjtuz4bayqc2rk6ghxfnk5s6l2uw7u42hcmynodeu.ipfs.dweb.link?filename=cover-1200x630.png";
const SCREENSHOT_1 = "https://bafybeigro2m66af7ze7bpv7oiov2nwzpa36kadlrooso4ymxseuwjravde.ipfs.dweb.link?filename=screenshot1-1284x2778.png";
const SCREENSHOT_2 = "https://bafybeiemdsohwakk2egufszrp5lwxpyu2feqgtedwj6yrzexfpe7v5x7gu.ipfs.dweb.link?filename=screenshot2-1284x2778.png";
const SCREENSHOT_3 = "https://bafybeifhlfytkxxfsoexhenytlfe2bnnt6cdfzx6nrhusebwuuvjaa6yz4.ipfs.dweb.link?filename=screenshot3-1284x2778.png";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "",
    payload: "",
    signature: "",
  },
  baseBuilder: {
    ownerAddress: "",
  },
  miniapp: {
    version: "1",
    name: "FCWEED",
    subtitle: "Stake to earn farming game on Base",
    description: "Stake Land & Plant NFTs on Base to earn FCWEED tokens. Battle in Cartel Wars, open mystery crates, and climb the Crime Ladder!",
    screenshotUrls: [SCREENSHOT_1, SCREENSHOT_2, SCREENSHOT_3],
    iconUrl: ICON_URL,
    splashImageUrl: COVER_URL,
    splashBackgroundColor: "#050812",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["staking", "base", "nfts", "fcweed", "game", "gaming", "defi", "farming"],
    heroImageUrl: COVER_URL,
    tagline: "Build your farming empire on Base",
    ogTitle: "FCWEED - Stake to Earn Farming Game",
    ogDescription: "Stake Land & Plant NFTs on Base to earn FCWEED tokens. Battle in Cartel Wars and climb the Crime Ladder!",
    ogImageUrl: COVER_URL,
  },
} as const;
