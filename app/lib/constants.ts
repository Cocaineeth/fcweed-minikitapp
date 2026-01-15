import { ethers } from "ethers";

export const CHAIN_ID = 8453;
export const PUBLIC_BASE_RPC = "https://base.publicnode.com";

export const FCWEED_ADDRESS = "0x42ef01219BDb2190F275Cda7956D08822549d224";
export const PLANT_ADDRESS = "0xD84890240C2CBB66a825915cD20aEe89C6b66dD5";
export const LAND_ADDRESS  = "0x798A8F4b4799CfaBe859C85889c78e42a57d71c1";
export const SUPER_LAND_ADDRESS = "0xAcd70377fF1aaF4E1aE76398C678CBE6ECc35e7d";

export const METADATA_MODE: "local-only" | "hybrid" | "remote-all" = "hybrid";
export const TOKEN_SYMBOL = "FCWEED";

export const CRATE_VAULT_ADDRESS = "0xC46cEF723767AcCeb3C7ad2513B9c997eACEcff4";
export const CRATE_COST = ethers.utils.parseUnits("200000", 18);

// ===============================
// V5 CONTRACT ADDRESSES (CURRENT)
// ===============================
export const V5_STAKING_ADDRESS = "0xAF335bd7c4DaA6DC137815bA0d6141534CEB75D4";
export const V5_ITEMSHOP_ADDRESS = "0xAE7E20CD1f7736B29B756b36754C9f408faeF2cC";  // V14 ItemShop
export const V5_BATTLES_ADDRESS = "0x7001478C4D924bf2cB48E5F4e0d66BeC56098a00";   // Battles V4
export const ITEM_SHOP_ADDRESS = "0xAE7E20CD1f7736B29B756b36754C9f408faeF2cC";    // V14 ItemShop

export const BATTLE_SYSTEM_ADDRESS = "0x7001478C4D924bf2cB48E5F4e0d66BeC56098a00"; // NEW V3
export const DEA_RAIDS_ADDRESS = "0x7001478C4D924bf2cB48E5F4e0d66BeC56098a00";     // NEW V3
export const PURGE_ADDRESS = "0x7001478C4D924bf2cB48E5F4e0d66BeC56098a00";         // NEW V3

// ===============================
// USDC ITEM SHOP (NEW!)
// ===============================
export const USDC_ITEM_SHOP_ADDRESS = "0xA69646f43bD0a620A18F3c4c29cf3489b73ca7b3";

// OLD CONTRACTS (for reference/migration)
export const OLD_STAKING_ADDRESS = "0x9dA6B01BFcbf5ab256B7B1d46F316e946da85507";
export const NEW_STAKING_ADDRESS = "0xe876f175AcD484b0F502cEA38FC9215913FCDCdb";
export const V4_ITEMSHOP_ADDRESS = "0x2aBa0B4F7DCe039c170ec9347DDC634d95E79ee8";
export const V4_STAKING_ADDRESS = "0x0A79278b0017Aa90DF59696F0aA4e0648c45bb92";
export const V4_BATTLES_ADDRESS = "0xaea874795C4368B446c8da1A3EA90dB134349Ce3";
export const OLD_V5_BATTLES = "0xa944070DE111045B9e0F31266Fc39604cDe5FBD4";
export const OLD_V5_ITEMSHOP = "0x16e897f2dbB51b409b2Ae4aeAc782BD5178D0e05";  // Old V11

export const WARS_BACKEND_URL = process.env.NEXT_PUBLIC_WARS_BACKEND_URL || "https://wars.x420ponzi.com";

export const RewardCategory = {
    FCWEED: 0,
    USDC: 1,
    DUST: 2,
    NFT_PLANT: 3,
    NFT_LAND: 4,
    NFT_SUPER_LAND: 5,
    SHOP_ITEM: 6,
};

export const CRATE_REWARDS = [
    { id: 0, name: 'Dust', amount: '100', token: 'DUST', color: '#6B7280' },
    { id: 1, name: 'Dust Pile', amount: '250', token: 'DUST', color: '#9CA3AF' },
    { id: 2, name: 'Dust Cloud', amount: '500', token: 'DUST', color: '#D1D5DB' },
    { id: 3, name: 'Dust Storm', amount: '1,000', token: 'DUST', color: '#E5E7EB' },
    { id: 4, name: 'Common', amount: '50K', token: 'FCWEED', color: '#8B9A6B' },
    { id: 5, name: 'Uncommon', amount: '150K', token: 'FCWEED', color: '#4A9B7F' },
    { id: 6, name: 'Rare', amount: '300K', token: 'FCWEED', color: '#3B82F6' },
    { id: 7, name: 'Epic', amount: '500K', token: 'FCWEED', color: '#A855F7' },
    { id: 8, name: 'Legendary', amount: '1M', token: 'FCWEED', color: '#F59E0B' },
    { id: 9, name: 'JACKPOT', amount: '5M', token: 'FCWEED', color: '#FFD700', isJackpot: true },
    { id: 10, name: '$5', amount: '$5', token: 'USDC', color: '#2775CA' },
    { id: 11, name: '$15', amount: '$15', token: 'USDC', color: '#2775CA' },
    { id: 12, name: '$50', amount: '$50', token: 'USDC', color: '#2775CA' },
    { id: 13, name: '$100', amount: '$100', token: 'USDC', color: '#2775CA' },
    { id: 14, name: '$250', amount: '$250', token: 'USDC', color: '#00D4FF', isJackpot: true },
    { id: 15, name: 'Plant NFT', amount: '1x', token: 'NFT', color: '#228B22', isNFT: true },
    { id: 16, name: 'Land NFT', amount: '1x', token: 'NFT', color: '#8B4513', isNFT: true },
    { id: 17, name: 'Super Land', amount: '1x', token: 'NFT', color: '#FF6B35', isNFT: true, isJackpot: true },
];
export const CRATE_PROBS = [2800, 1800, 1200, 600, 1400, 900, 400, 180, 50, 10, 300, 150, 50, 20, 5, 80, 40, 15];


export const PLANT_FALLBACK_IMG = "/hero.png";
export const LAND_FALLBACK_IMG  = "/land.png";
export const SUPER_LAND_FALLBACK_IMG = "/superland.png";

export const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const USDC_DECIMALS = 6;

export const PLANT_PRICE_USDC = ethers.utils.parseUnits("49.99", USDC_DECIMALS);
export const LAND_PRICE_USDC  = ethers.utils.parseUnits("199.99", USDC_DECIMALS);
export const SUPER_LAND_FCWEED_COST = ethers.utils.parseUnits("2000000", 18);

export const ERC721_TRANSFER_TOPIC = ethers.utils.id(
  "Transfer(address,address,uint256)"
);

export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";


export const GIFS = [
  "/fcweed-radio.gif",
  "/fcweed-radio-2.gif",
  "/fcweed-radio-3.gif",
  "/fcweed-radio-4.gif",
];

export const PLAYLIST = [
  {
    title: "Grupo Soñador - El Gigante De Hierro",
    src: "/audio/track1.mp3",
  },
  { title: "Luniz - I got 5 on it", src: "/audio/track2.mp3" },
  { title: "WAR - Low Rider", src: "/audio/track3.mp3" },
];

export const SUPER_PLANT_IDS = new Set<number>([]);

export const SUPER_LAND_IDS = new Set<number>([]);
