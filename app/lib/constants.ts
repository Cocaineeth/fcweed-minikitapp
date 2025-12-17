import { ethers } from "ethers";

export const CHAIN_ID = 8453;
// export const PUBLIC_BASE_RPC = "https://mainnet.base.org";
export const PUBLIC_BASE_RPC = "https://base-mainnet.g.alchemy.com/v2/N95I5LVTDkn8MaZule8Fh";

export const FCWEED_ADDRESS = "0x42ef01219BDb2190F275Cda7956D08822549d224";
export const PLANT_ADDRESS = "0xD84890240C2CBB66a825915cD20aEe89C6b66dD5";
export const LAND_ADDRESS  = "0x798A8F4b4799CfaBe859C85889c78e42a57d71c1";
export const SUPER_LAND_ADDRESS = "0xAcd70377fF1aaF4E1aE76398C678CBE6ECc35e7d";
export const OLD_STAKING_ADDRESS = "0x9dA6B01BFcbf5ab256B7B1d46F316e946da85507";
export const NEW_STAKING_ADDRESS = "0xe876f175AcD484b0F502cEA38FC9215913FCDCdb";


export const TOKEN_SYMBOL = "FCWEED";

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

// Base (and many chains) Multicall3 address
export const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";


export const GIFS = [
  "/fcweed-radio.gif",
  "/fcweed-radio-2.gif",
  "/fcweed-radio-3.gif",
  "/fcweed-radio-4.gif",
];

export const PLAYLIST = [
  {
    title: "Kendrick Lamar - Untitled 05 (LoVibe Remix)",
    src: "/audio/track1.mp3",
  },
  { title: "Travis Scott - SDP Interlude", src: "/audio/track2.mp3" },
  { title: "Yeat - if we being real", src: "/audio/track3.mp3" },
];

// Todo()
export const SUPER_PLANT_IDS = new Set<number>([
    // example: 777, 1337
]);

export const SUPER_LAND_IDS = new Set<number>([
    // example: 69
]);

