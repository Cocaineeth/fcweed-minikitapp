const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

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
      subtitle: "Stake Land & Plant NFTs",
      description: "Stake Land & Plant NFTs on Base to earn FCWEED.",
      screenshotUrls: [`${ROOT_URL}/hero.png`],
      iconUrl: `${ROOT_URL}/logo.png`,
      splashImageUrl: `${ROOT_URL}/hero.png`,
      splashBackgroundColor: "#050812",
      homeUrl: ROOT_URL,
      webhookUrl: `${ROOT_URL}/api/webhook`,
      primaryCategory: "games",
      tags: ["staking", "base", "nfts", "fcweed", "game", "gaming"],
      heroImageUrl: `${ROOT_URL}/hero.png`,
      tagline: "Farming FCWEED on Base",
      ogTitle: "FCWEED Mini App",
      ogDescription: "Stake Land & Plant NFTs to earn FCWEED on Base.",
      ogImageUrl: `${ROOT_URL}/hero.png`,
    },
} as const;
