// FCWEED Contract Addresses - Updated for BattlesV4
// Last updated: Dec 30, 2024

// ==================== NETWORK CONFIG ====================
export const CHAIN_ID = 8453; // Base Mainnet
export const TOKEN_SYMBOL = "FCWEED";
export const PUBLIC_BASE_RPC = "https://mainnet.base.org";

// ==================== TOKEN CONTRACTS ====================
export const FCWEED_ADDRESS = "0x42ef01219BDb2190F275Cda7956D08822549d224";
export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
export const USDC_DECIMALS = 6;

// ==================== NFT CONTRACTS ====================
export const PLANT_ADDRESS = "0xD84890240C2CBB66a825915cD20aEe89C6b66dD5";
export const LAND_ADDRESS = "0x798A8F4b4799CfaBe859C85889c78e42a57d71c1";
export const SUPER_LAND_ADDRESS = "0xAcd70377fF1aaF4E1aE76398C678CBE6ECc35e7d";

// ==================== V5 CONTRACTS (Current Production) ====================
export const V5_STAKING_ADDRESS = "0xAF335bd7c4DaA6DC137815bA0d6141534CEB75D4";
export const V5_ITEMSHOP_ADDRESS = "0x67108C31fe6D347aF385d95Cf9C1A13d5bdCd95A";
export const V5_BATTLES_ADDRESS = "0xb17A9451c424c3ae55660cF86795eE3f52877C75"; // BattlesV4 - cooldown only on WIN

// ==================== V4 LEGACY CONTRACTS ====================
export const V4_STAKING_ADDRESS = "0x0A79278b0017Aa90DF59696F0aA4e0648c45bb92"; // Replace with actual V4 staking if needed
export const V4_ITEMSHOP_ADDRESS = "0xDbb40894ddd940486DfdB49c9b36498a84a8E14d"; // Replace with actual V4 itemshop if needed

// ==================== LEGACY ADDRESSES ====================
export const PURGE_ADDRESS = "0xb17A9451c424c3ae55660cF86795eE3f52877C75"; // Same as BattlesV4
export const DEA_RAIDS_ADDRESS = "0xb17A9451c424c3ae55660cF86795eE3f52877C75"; // Same as BattlesV4

// ==================== INFRASTRUCTURE ====================
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";
export const TREASURY_ADDRESS = "0x5A567898881cef8DF767D192B74d99513cAa6e46";
export const CRATE_VAULT_ADDRESS = "0x63e0F8Bf2670f54b7DB51254cED9B65b2B748B0C";

// ==================== BACKEND ====================
export const WARS_BACKEND_URL = process.env.NEXT_PUBLIC_WARS_BACKEND_URL || "https://wars.x420ponzi.com";

// ==================== PRICING ====================
export const PLANT_PRICE_USDC = 10; // 10 USDC per Plant
export const LAND_PRICE_USDC = 25; // 25 USDC per Land
export const SUPER_LAND_FCWEED_COST = 1000000n * 10n ** 18n; // 1M FCWEED for Super Land
export const CRATE_COST = 100000n * 10n ** 18n; // 100k FCWEED per crate

// ==================== NFT METADATA ====================
export const METADATA_MODE = "ipfs"; // "ipfs" | "api" | "static"

export const PLANT_FALLBACK_IMG = "https://fcweed.com/images/plant-placeholder.png";
export const LAND_FALLBACK_IMG = "https://fcweed.com/images/land-placeholder.png";
export const SUPER_LAND_FALLBACK_IMG = "https://fcweed.com/images/superland-placeholder.png";

// Special NFT IDs
export const SUPER_PLANT_IDS: number[] = [1, 2, 3, 4, 5]; // Update with actual super plant token IDs
export const SUPER_LAND_IDS: number[] = [1, 2, 3, 4, 5]; // Update with actual super land token IDs

// ==================== ERC721 EVENT SIGNATURE ====================
export const ERC721_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// ==================== MEDIA ASSETS ====================
export const GIFS: string[] = [
  "https://fcweed.com/gifs/growing.gif",
  "https://fcweed.com/gifs/harvest.gif",
  "https://fcweed.com/gifs/battle.gif",
];

export const PLAYLIST: string[] = [
  "https://fcweed.com/audio/track1.mp3",
  "https://fcweed.com/audio/track2.mp3",
  "https://fcweed.com/audio/track3.mp3",
];

// ==================== CRATE REWARDS SYSTEM ====================
export enum RewardCategory {
  COMMON = "COMMON",
  UNCOMMON = "UNCOMMON",
  RARE = "RARE",
  EPIC = "EPIC",
  LEGENDARY = "LEGENDARY",
}

export interface CrateReward {
  category: RewardCategory;
  name: string;
  amount: bigint;
  description: string;
}

export const CRATE_REWARDS: CrateReward[] = [
  { category: RewardCategory.COMMON, name: "Small FCWEED Bag", amount: 10000n * 10n ** 18n, description: "10,000 FCWEED" },
  { category: RewardCategory.COMMON, name: "Medium FCWEED Bag", amount: 25000n * 10n ** 18n, description: "25,000 FCWEED" },
  { category: RewardCategory.UNCOMMON, name: "Large FCWEED Bag", amount: 50000n * 10n ** 18n, description: "50,000 FCWEED" },
  { category: RewardCategory.UNCOMMON, name: "Water Bucket", amount: 1n, description: "+1 Water Item" },
  { category: RewardCategory.RARE, name: "Fertilizer Pack", amount: 1n, description: "+1 Fertilizer Item" },
  { category: RewardCategory.RARE, name: "XL FCWEED Bag", amount: 100000n * 10n ** 18n, description: "100,000 FCWEED" },
  { category: RewardCategory.EPIC, name: "Protection Shield", amount: 1n, description: "+1 Shield Item" },
  { category: RewardCategory.EPIC, name: "Jackpot Bag", amount: 250000n * 10n ** 18n, description: "250,000 FCWEED" },
  { category: RewardCategory.LEGENDARY, name: "Super Jackpot", amount: 500000n * 10n ** 18n, description: "500,000 FCWEED" },
  { category: RewardCategory.LEGENDARY, name: "Mega Jackpot", amount: 1000000n * 10n ** 18n, description: "1,000,000 FCWEED" },
];

// Probability distribution (must sum to 100)
export const CRATE_PROBS: number[] = [
  30, // Common: Small FCWEED Bag
  20, // Common: Medium FCWEED Bag
  15, // Uncommon: Large FCWEED Bag
  10, // Uncommon: Water Bucket
  8,  // Rare: Fertilizer Pack
  7,  // Rare: XL FCWEED Bag
  5,  // Epic: Protection Shield
  3,  // Epic: Jackpot Bag
  1.5, // Legendary: Super Jackpot
  0.5, // Legendary: Mega Jackpot
];
