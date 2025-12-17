"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";
import styles from "./page.module.css";
import { useLeaderboard } from "./lib/leaderboard";
import { CrimeLadder } from "./components/CrimeLadder";
import { loadOwnedTokens } from "./lib/tokens";
import { MultiResult, multicallTry, decode1} from "./lib/multicall";
import {
    CHAIN_ID,
    TOKEN_SYMBOL,
    PLANT_ADDRESS,
    LAND_ADDRESS,
    FCWEED_ADDRESS,
    SUPER_LAND_ADDRESS,
    OLD_STAKING_ADDRESS,
    NEW_STAKING_ADDRESS,
    PUBLIC_BASE_RPC,
    PLANT_FALLBACK_IMG,
    LAND_FALLBACK_IMG,
    SUPER_LAND_FALLBACK_IMG,
    USDC_ADDRESS,
    USDC_DECIMALS,
    PLANT_PRICE_USDC,
    LAND_PRICE_USDC,
    SUPER_LAND_FCWEED_COST,
    ERC721_TRANSFER_TOPIC,
    GIFS,
    PLAYLIST,
    SUPER_PLANT_IDS,
    SUPER_LAND_IDS,
    MULTICALL3_ADDRESS,
} from "./lib/constants";

import {
    USDC_ABI,
    LAND_ABI,
    PLANT_ABI,
    ERC721_VIEW_ABI,
    ERC20_ABI,
    MULTICALL3_ABI,
    STAKING_ABI,
    usdcInterface,
    landInterface,
    plantInterface,
    superLandInterface,
    stakingInterface,
    erc20Interface,
    erc721Interface,
} from "./lib/abis";


const METADATA_MODE: "local-only" | "hybrid" | "remote-all" = "hybrid";

const CRATE_VAULT_ADDRESS = "0x63e0F8Bf2670f54b7DB51254cED9B65b2B748B0C";
const CRATE_COST = ethers.utils.parseUnits("200000", 18);

const V3_STAKING_ADDRESS = "0xEF1b0837D353E709fB9b2d5807b4B16C416e11E8";
const V3_BATTLES_ADDRESS = "0xB06909631196b04cdBAc05b775Bc3B0CE7E2A4a4";
const V3_ITEMSHOP_ADDRESS = "0x2aBa0B4F7DCe039c170ec9347DDC634d95E79ee8";

const V3_STAKING_ABI = [
    "function stakePlants(uint256[] calldata ids) external",
    "function unstakePlants(uint256[] calldata ids) external",
    "function stakeLands(uint256[] calldata ids) external",
    "function unstakeLands(uint256[] calldata ids) external",
    "function stakeSuperLands(uint256[] calldata ids) external",
    "function unstakeSuperLands(uint256[] calldata ids) external",
    "function claim() external",
    "function pending(address account) external view returns (uint256)",
    "function capacityOf(address account) external view returns (uint256)",
    "function plantsOf(address account) external view returns (uint256[])",
    "function landsOf(address account) external view returns (uint256[])",
    "function superLandStakerOf(uint256 tokenId) external view returns (address)",
    "function users(address) external view returns (uint64 last, uint32 plants, uint32 lands, uint32 superLands, uint256 accrued, uint256 bonusBoostBps, uint256 lastClaimTime, uint256 waterBalance, uint256 waterPurchasedToday, uint256 lastWaterPurchaseDay, uint256 stakedTokens, uint256 tokenStakeTime, address referrer, uint256 referralEarnings, uint32 referralCount, uint256 guildId, uint256 earningBoostBps, uint256 earningBoostExpiry, uint256 capacityBoost, uint256 capacityBoostExpiry, uint256 raidShieldExpiry, uint256 raidAttackBoostBps, uint256 raidAttackBoostExpiry, uint256 seasonPoints, uint256 lastSeasonUpdated)",
    "function getPlantHealth(uint256 tokenId) external view returns (uint256)",
    "function getAverageHealth(address user) external view returns (uint256)",
    "function getWaterNeeded(uint256 tokenId) external view returns (uint256)",
    "function buyWater(uint256 liters) external",
    "function waterPlant(uint256 tokenId) external",
    "function waterPlants(uint256[] calldata tokenIds) external",
    "function isShopOpen() external view returns (bool)",
    "function getShopTimeInfo() external view returns (bool isOpen, uint256 opensAt, uint256 closesAt)",
    "function getDailyWaterSupply() external view returns (uint256)",
    "function getDailyWaterRemaining() external view returns (uint256)",
    "function getWalletWaterLimit(address wallet) external view returns (uint256)",
    "function getWalletWaterRemaining(address wallet) external view returns (uint256)",
    "function waterPricePerLiter() external view returns (uint256)",
    "function tokensPerPlantPerDay() external view returns (uint256)",
    "function claimEnabled() external view returns (bool)",
    "function waterShopEnabled() external view returns (bool)",
    "function plantStakingEnabled() external view returns (bool)",
    "function landStakingEnabled() external view returns (bool)",
    "function superLandStakingEnabled() external view returns (bool)",
    "function totalPlantsStaked() external view returns (uint256)",
    "function getUserBattleStats(address account) external view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)",
    "function hasRaidShield(address user) external view returns (bool)",
    "function calculateBattlePower(address account) external view returns (uint256)",
    "function getTotalStakers() external view returns (uint256)",
    "function getStakerAtIndex(uint256 index) external view returns (address)",
    "event Claimed(address indexed user, uint256 amount)",
    "event WaterPurchased(address indexed user, uint256 liters, uint256 cost)",
    "event PlantWatered(address indexed user, uint256 tokenId, uint256 litersUsed)",
    "event PlantsWatered(address indexed user, uint256[] tokenIds, uint256 totalLitersUsed)",
    "event StakedPlants(address indexed user, uint256[] tokenIds)",
    "event UnstakedPlants(address indexed user, uint256[] tokenIds)",
];

const V3_BATTLES_ABI = [
    "function searchForTarget(address target, uint256 nonce, bytes calldata signature) external",
    "function attack() external",
    "function cancelSearch() external",
    "function getTargetStats(address target) external view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards, uint256 battlePower, bool hasShield)",
    "function getActiveSearch(address attacker) external view returns (address target, uint256 expiry, bool isValid)",
    "function canAttack(address attacker) external view returns (bool)",
    "function canBeAttacked(address defender) external view returns (bool)",
    "function getAttackCooldownRemaining(address attacker) external view returns (uint256)",
    "function getDefenseImmunityRemaining(address defender) external view returns (uint256)",
    "function getPlayerStats(address player) external view returns (uint256 wins, uint256 losses, uint256 defWins, uint256 defLosses, uint256 rewardsStolen, uint256 rewardsLost, uint256 winStreak, uint256 bestStreak)",
    "function estimateBattleOdds(address attacker, address defender) external view returns (uint256 attackerPower, uint256 defenderPower, uint256 estimatedWinChance)",
    "function getSearchNonce(address attacker) external view returns (uint256)",
    "function searchFee() external view returns (uint256)",
    "function raidsEnabled() external view returns (bool)",
    "event SearchInitiated(address indexed attacker, address indexed target, uint256 fee)",
    "event BattleResult(address indexed attacker, address indexed defender, bool attackerWon, uint256 damageDealt, uint256 rewardsTransferred)",
];

const v3StakingInterface = new ethers.utils.Interface(V3_STAKING_ABI);
const v3BattlesInterface = new ethers.utils.Interface(V3_BATTLES_ABI);

const CRATE_VAULT_ABI = [
    "function openCrate() external",
    "function getUserStats(address user) external view returns (uint256 dustBalance, uint256 cratesOpened, uint256 fcweedWon, uint256 usdcWon, uint256 nftsWon, uint256 totalSpent, uint256 lastOpenedAt)",
    "function getUserDustBalance(address user) external view returns (uint256)",
    "function getUserCratesOpened(address user) external view returns (uint256)",
    "function getGlobalStats() external view returns (uint256 totalCratesOpened, uint256 totalFcweedBurned, uint256 totalFcweedRewarded, uint256 totalUsdcRewarded, uint256 totalDustRewarded, uint256 totalNftsRewarded, uint256 uniqueUsers)",
    "function getVaultInventory() external view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 shopItems)",
    "function getAllRewards() external view returns (tuple(string name, uint8 category, uint256 amount, uint16 probability, bool enabled)[])",
    "function crateCost() external view returns (uint256)",
    "function dustConversionEnabled() external view returns (bool)",
    "function dustToFcweedRate() external view returns (uint256)",
    "function dustToFcweedAmount() external view returns (uint256)",
    "function convertDustToFcweed(uint256 dustAmount) external",
    "event CrateOpened(address indexed player, uint256 indexed rewardIndex, string rewardName, uint8 category, uint256 amount, uint256 nftTokenId, uint256 timestamp)",
];

const RewardCategory = {
    FCWEED: 0,
    USDC: 1,
    DUST: 2,
    NFT_PLANT: 3,
    NFT_LAND: 4,
    NFT_SUPER_LAND: 5,
    SHOP_ITEM: 6,
};

const CRATE_REWARDS = [
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
const CRATE_PROBS = [2800, 1800, 1200, 600, 1400, 900, 400, 180, 50, 10, 300, 150, 50, 20, 5, 80, 40, 15];

type CrateReward = typeof CRATE_REWARDS[number];

type StakingStats = {
    plantsStaked: number;
    landsStaked: number;
    totalSlots: number;
    capacityUsed: number;
    landBoostPct: number;
    pendingFormatted: string;
    pendingRaw: ethers.BigNumber;
    claimEnabled: boolean;
    tokensPerSecond: ethers.BigNumber;
};

type NewStakingStats = {
    plantsStaked: number;
    landsStaked: number;
    superLandsStaked: number;
    totalSlots: number;
    capacityUsed: number;
    totalBoostPct: number;
    pendingFormatted: string;
    pendingRaw: ethers.BigNumber;
    dailyRewards: string;
    claimEnabled: boolean;
    tokensPerSecond: ethers.BigNumber;
};

type FarmerRow = {
    addr: string;
    plants: number;
    lands: number;
    superLands: number;
    boostPct: number;
    capacity: string;
    daily: string;
    dailyRaw: number;
};

type OwnedState = {
    wallet: string;
    plants: { tokenId: string; staked: boolean; boost: number }[];
    lands: { tokenId: string; staked: boolean; boost: number }[];
    superLands: { tokenId: string; staked: boolean; boost: number }[];
    totals: {
        plants: number;
        lands: number;
        superLands: number;
    };
};

function isSuper(nftAddress: string, id: number): boolean
{
    const a = nftAddress.toLowerCase();
    if (a === PLANT_ADDRESS.toLowerCase()) return SUPER_PLANT_IDS.has(id);
    if (a === LAND_ADDRESS.toLowerCase()) return SUPER_LAND_IDS.has(id);
    return false;
}

function detectMiniAppEnvironment(): { isMiniApp: boolean; isMobile: boolean } {
    if (typeof window === "undefined") return { isMiniApp: false, isMobile: false };

    const userAgent = navigator.userAgent || "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);


    const inIframe = window.parent !== window;
    const hasFarcasterContext = !!(window as any).farcaster || !!(window as any).__FARCASTER__;
    const hasWarpcastUA = userAgent.toLowerCase().includes("warpcast");
    const urlHasFrame = window.location.href.includes("fc-frame") ||
                        window.location.href.includes("farcaster") ||
                        document.referrer.includes("warpcast") ||
                        document.referrer.includes("farcaster");


    let sdkAvailable = false;
    try {
        sdkAvailable = !!(sdk && sdk.wallet);
    } catch {
        sdkAvailable = false;
    }

    const isMiniApp = inIframe || hasFarcasterContext || hasWarpcastUA || urlHasFrame || (isMobile && sdkAvailable);

    console.log("[Detect] Environment check:", {
        isMobile,
        inIframe,
        hasFarcasterContext,
        hasWarpcastUA,
        urlHasFrame,
        sdkAvailable,
        isMiniApp
    });

    return { isMiniApp, isMobile };
}

async function waitForTx(
    tx: ethers.providers.TransactionResponse | undefined | null,
    readProvider?: ethers.providers.Provider,
    maxWaitMs = 60000
)
{
    if (!tx) return;



    if (readProvider && tx.hash) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            try {
                const receipt = await readProvider.getTransactionReceipt(tx.hash);
                if (receipt && receipt.confirmations > 0) {
                    return receipt;
                }
            } catch {

            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.warn("Transaction wait timeout, proceeding anyway:", tx.hash);
        return;
    }


    try {
        await tx.wait();
    } catch (e: any) {
        const msg =
            e?.reason ||
            e?.error?.message ||
            e?.data?.message ||
            e?.message ||
            "";
        if (
            msg.includes("does not support the requested method") ||
            msg.includes("unsupported method") ||
            msg.includes("wait is not a function")
        ) {
            console.warn("Ignoring provider wait() error:", e);
        } else {
            throw e;
        }
    }
}

export default function Home()
{
    const { setMiniAppReady, isMiniAppReady } = useMiniKit();

    const [provider, setProvider] =
        useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [userAddress, setUserAddress] = useState<string | null>(null);
    const [usingMiniApp, setUsingMiniApp] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [miniAppEthProvider, setMiniAppEthProvider] = useState<any | null>(
        null
    );

    const [readProvider] = useState(
        () => new ethers.providers.JsonRpcProvider(PUBLIC_BASE_RPC)
    );

    const [activeTab, setActiveTab] = useState<"info" | "mint" | "stake" | "wars" | "crates" | "referrals" | "shop">("info");
    const [mintModalOpen, setMintModalOpen] = useState(false);
    const [stakeModalOpen, setStakeModalOpen] = useState(false);
    const [oldStakingOpen, setOldStakingOpen] = useState(false);
    const [newStakingOpen, setNewStakingOpen] = useState(false);
    const [v3StakingOpen, setV3StakingOpen] = useState(false);
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

    const [oldStakingStats, setOldStakingStats] = useState<StakingStats | null>(null);
    const [newStakingStats, setNewStakingStats] = useState<NewStakingStats | null>(null);

    const [v3StakingStats, setV3StakingStats] = useState<any>(null);
    const [v3StakedPlants, setV3StakedPlants] = useState<number[]>([]);
    const [v3StakedLands, setV3StakedLands] = useState<number[]>([]);
    const [v3StakedSuperLands, setV3StakedSuperLands] = useState<number[]>([]);
    const [v3AvailablePlants, setV3AvailablePlants] = useState<number[]>([]);
    const [v3AvailableLands, setV3AvailableLands] = useState<number[]>([]);
    const [v3AvailableSuperLands, setV3AvailableSuperLands] = useState<number[]>([]);
    const [selectedV3AvailPlants, setSelectedV3AvailPlants] = useState<number[]>([]);
    const [selectedV3AvailLands, setSelectedV3AvailLands] = useState<number[]>([]);
    const [selectedV3AvailSuperLands, setSelectedV3AvailSuperLands] = useState<number[]>([]);
    const [selectedV3StakedPlants, setSelectedV3StakedPlants] = useState<number[]>([]);
    const [selectedV3StakedLands, setSelectedV3StakedLands] = useState<number[]>([]);
    const [selectedV3StakedSuperLands, setSelectedV3StakedSuperLands] = useState<number[]>([]);
    const [loadingV3Staking, setLoadingV3Staking] = useState(false);
    const [v3RealTimePending, setV3RealTimePending] = useState<string>("0.00");
    const [v3PlantHealths, setV3PlantHealths] = useState<Record<number, number>>({});
    const [v3WaterNeeded, setV3WaterNeeded] = useState<Record<number, number>>({});
    const [selectedPlantsToWater, setSelectedPlantsToWater] = useState<number[]>([]);

    const [waterShopInfo, setWaterShopInfo] = useState<any>(null);
    const [waterBuyAmount, setWaterBuyAmount] = useState(1);
    const [waterLoading, setWaterLoading] = useState(false);
    const [waterStatus, setWaterStatus] = useState("");

    const [warsPlayerStats, setWarsPlayerStats] = useState<any>(null);
    const [warsTarget, setWarsTarget] = useState<any>(null);
    const [warsTargetStats, setWarsTargetStats] = useState<any>(null);
    const [warsSearching, setWarsSearching] = useState(false);
    const [warsAttacking, setWarsAttacking] = useState(false);
    const [warsStatus, setWarsStatus] = useState("");
    const [warsResult, setWarsResult] = useState<any>(null);
    const [warsOdds, setWarsOdds] = useState<any>(null);
    const [warsCooldown, setWarsCooldown] = useState(0);
    const [warsSearchFee, setWarsSearchFee] = useState("50,000");
    const warsTransactionInProgress = useRef(false);

    const [availablePlants, setAvailablePlants] = useState<number[]>([]);
    const [availableLands, setAvailableLands] = useState<number[]>([]);
    const [availableSuperLands, setAvailableSuperLands] = useState<number[]>([]);
    const [oldStakedPlants, setOldStakedPlants] = useState<number[]>([]);
    const [oldStakedLands, setOldStakedLands] = useState<number[]>([]);
    const [newStakedPlants, setNewStakedPlants] = useState<number[]>([]);
    const [newStakedLands, setNewStakedLands] = useState<number[]>([]);
    const [newStakedSuperLands, setNewStakedSuperLands] = useState<number[]>([]);

    const [loadingOldStaking, setLoadingOldStaking] = useState(false);
    const [loadingNewStaking, setLoadingNewStaking] = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [oldLandStakingEnabled, setOldLandStakingEnabled] = useState(false);
    const [newLandStakingEnabled, setNewLandStakingEnabled] = useState(false);
    const [newSuperLandStakingEnabled, setNewSuperLandStakingEnabled] = useState(false);

    const [oldAvailablePlants, setOldAvailablePlants] = useState<number[]>([]);
    const [oldAvailableLands, setOldAvailableLands] = useState<number[]>([]);

    const [newAvailablePlants, setNewAvailablePlants] = useState<number[]>([]);
    const [newAvailableLands, setNewAvailableLands] = useState<number[]>([]);
    const [newAvailableSuperLands, setNewAvailableSuperLands] = useState<number[]>([]);


    const [selectedOldAvailPlants, setSelectedOldAvailPlants] = useState<number[]>([]);
    const [selectedOldAvailLands, setSelectedOldAvailLands] = useState<number[]>([]);
    const [selectedOldStakedPlants, setSelectedOldStakedPlants] = useState<number[]>([]);
    const [selectedOldStakedLands, setSelectedOldStakedLands] = useState<number[]>([]);
    const [selectedNewAvailPlants, setSelectedNewAvailPlants] = useState<number[]>([]);
    const [selectedNewAvailLands, setSelectedNewAvailLands] = useState<number[]>([]);
    const [selectedNewAvailSuperLands, setSelectedNewAvailSuperLands] = useState<number[]>([]);
    const [selectedNewStakedPlants, setSelectedNewStakedPlants] = useState<number[]>([]);
    const [selectedNewStakedLands, setSelectedNewStakedLands] = useState<number[]>([]);
    const [selectedNewStakedSuperLands, setSelectedNewStakedSuperLands] = useState<number[]>([]);
    const [selectedLandForUpgrade, setSelectedLandForUpgrade] = useState<number | null>(null);
    const [upgradeLands, setUpgradeLands] = useState<number[]>([]);
    const [loadingUpgrade, setLoadingUpgrade] = useState(false);

    const [plantImages] = useState<Record<number, string>>({});
    const [landImages] = useState<Record<number, string>>({});
    const [superLandImages] = useState<Record<number, string>>({});
    const [mintStatus, setMintStatus] = useState<string>("");

    const [currentTrack, setCurrentTrack] = useState(0);
    const [isPlaying, setIsPlaying] = useState(true);
    const [manualPause, setManualPause] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [gifIndex, setGifIndex] = useState(0);

    const [ladderRows, setLadderRows] = useState<FarmerRow[]>([]);
    const [ladderLoading, setLadderLoading] = useState(false);
    const [walletRank, setWalletRank] = useState<number | null>(null);
    const [walletRow, setWalletRow] = useState<FarmerRow | null>(null);
    const [farmerCount, setFarmerCount] = useState<number>(0);
    const [realTimePending, setRealTimePending] = useState<string>("0.00");
    const [oldRealTimePending, setOldRealTimePending] = useState<string>("0.00");


    const [crateSpinning, setCrateSpinning] = useState(false);
    const [crateResultIdx, setCrateResultIdx] = useState<number | null>(null);
    const [crateResultData, setCrateResultData] = useState<{ rewardIndex: number; rewardName: string; amount: ethers.BigNumber; nftTokenId: number } | null>(null);
    const [crateShowWin, setCrateShowWin] = useState(false);
    const [crateConfirmOpen, setCrateConfirmOpen] = useState(false);
    const [crateReelOpen, setCrateReelOpen] = useState(false);
    const [crateUserStats, setCrateUserStats] = useState({ opened: 0, dust: 0, fcweed: 0, usdc: 0, nfts: 0, totalSpent: 0 });
    const [crateGlobalStats, setCrateGlobalStats] = useState({ totalOpened: 0, totalBurned: "0", uniqueUsers: 0 });
    const [fcweedBalance, setFcweedBalance] = useState("0");
    const [fcweedBalanceRaw, setFcweedBalanceRaw] = useState(ethers.BigNumber.from(0));
    const [vaultNfts, setVaultNfts] = useState({ plants: 0, lands: 0, superLands: 0 });
    const [loadingVault, setLoadingVault] = useState(false);
    const [crateLoading, setCrateLoading] = useState(false);
    const [crateError, setCrateError] = useState("");
    const [crateStatus, setCrateStatus] = useState("");
    const [dustConversionEnabled, setDustConversionEnabled] = useState(false);
    const crateReelRef = useRef<HTMLDivElement>(null);
    const [crateReelItems, setCrateReelItems] = useState<CrateReward[]>([]);
    const [crateWinItem, setCrateWinItem] = useState<CrateReward | null>(null);
    const [crateReelPhase, setCrateReelPhase] = useState<'idle' | 'spinning' | 'landing'>('idle');
    const crateTransactionInProgress = useRef(false);
    const lastCrateOpenBlock = useRef(0);
    const processedCrateTxHashes = useRef<Set<string>>(new Set());
    const crateSpinInterval = useRef<NodeJS.Timeout | null>(null);



    const currentTrackMeta = PLAYLIST[currentTrack];

    useEffect(() => {
        if (!audioRef.current) return;

        if (isPlaying) {
            audioRef.current
                    .play()
                    .catch((err) => {
                        console.warn("Autoplay blocked by browser", err);
                        setIsPlaying(false);
                    });
        } else if (!audioRef.current.paused) {
            audioRef.current.pause();
        }
    }, [isPlaying, currentTrack]);

    useEffect(() => {
        const id = setInterval(() => {
            setGifIndex((prev) => (prev + 1) % GIFS.length);
        }, 5000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        setSelectedOldAvailPlants([]);
        setSelectedOldAvailLands([]);
        setSelectedOldStakedPlants([]);
        setSelectedOldStakedLands([]);
        setSelectedNewAvailPlants([]);
        setSelectedNewAvailLands([]);
        setSelectedNewAvailSuperLands([]);
        setSelectedNewStakedPlants([]);
        setSelectedNewStakedLands([]);
        setSelectedNewStakedSuperLands([]); },
              [userAddress]);

    const handlePlayPause = () => {
        setIsPlaying((prev) => {
            if (prev) {

                setManualPause(true);
            } else {

                setManualPause(false);
            }
            return !prev;
        });
    };
    const handleNextTrack = () =>
        setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
    const handlePrevTrack = () =>
        setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);

    useEffect(() => {
        if (!isMiniAppReady) {
            setMiniAppReady();
        }


        (async () => {
            try {
                console.log("[Init] Initializing Farcaster SDK...");
                await sdk.actions.ready();
                console.log("[Init] SDK ready");


                const { isMiniApp } = detectMiniAppEnvironment();
                if (isMiniApp && !userAddress) {
                    console.log("[Init] Auto-connecting wallet in mini app...");

                    setTimeout(() => {
                        ensureWallet().catch(err => {
                            console.warn("[Init] Auto-connect failed:", err);
                        });
                    }, 500);
                }
            } catch (err) {
                console.warn("[Init] SDK initialization failed:", err);
            }
        })();
    }, [isMiniAppReady, setMiniAppReady]);

    const shortAddr = (addr?: string | null) =>
        addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

    async function ensureWallet() {
        if (signer && provider && userAddress) {
            return { signer, provider, userAddress, isMini: usingMiniApp };
        }

        try {
            setConnecting(true);
            setMintStatus("");

            let p: ethers.providers.Web3Provider;
            let s: ethers.Signer;
            let addr: string;
            let isMini = false;
            let ethProv: any | null = null;

            const { isMiniApp: detectedMiniApp, isMobile } = detectMiniAppEnvironment();

            console.log("[Wallet] Environment:", { detectedMiniApp, isMobile, userAgent: navigator.userAgent });


            if (detectedMiniApp || isMobile) {
                try {
                    console.log("[Wallet] Attempting Farcaster SDK wallet connection...");


                    try {
                        await sdk.actions.ready();
                        console.log("[Wallet] SDK ready confirmed");
                    } catch (readyErr) {
                        console.warn("[Wallet] SDK ready call failed (may already be ready):", readyErr);
                    }


                    try {

                        ethProv = await sdk.wallet.getEthereumProvider();
                        console.log("[Wallet] Got provider via getEthereumProvider()");
                    } catch (err1) {
                        console.warn("[Wallet] getEthereumProvider failed:", err1);


                        if ((sdk.wallet as any).ethProvider) {
                            ethProv = (sdk.wallet as any).ethProvider;
                            console.log("[Wallet] Got provider via ethProvider property");
                        }
                    }

                    if (ethProv) {
                        console.log("[Wallet] Got Farcaster ethereum provider:", typeof ethProv);
                        isMini = true;
                    }
                } catch (err) {
                    console.warn("[Wallet] Farcaster SDK wallet failed:", err);
                    ethProv = null;
                }
            }


            if (ethProv) {
                setUsingMiniApp(true);
                setMiniAppEthProvider(ethProv);


                try {
                    console.log("[Wallet] Requesting accounts from Farcaster provider...");
                    const accounts = await ethProv.request({ method: "eth_requestAccounts" });
                    console.log("[Wallet] Got accounts:", accounts);
                } catch (err: any) {
                    console.warn("[Wallet] eth_requestAccounts failed:", err);

                    if (err?.code === 4001) {
                        throw new Error("Wallet connection rejected. Please approve the connection request.");
                    }

                }

                p = new ethers.providers.Web3Provider(ethProv as any, "any");
                s = p.getSigner();

                try {
                    addr = await s.getAddress();
                    console.log("[Wallet] Got address:", addr);
                } catch (err) {
                    console.error("[Wallet] Failed to get address from Farcaster provider:", err);


                    try {
                        const accounts = await ethProv.request({ method: "eth_accounts" });
                        if (accounts && accounts.length > 0) {
                            addr = accounts[0];
                            console.log("[Wallet] Got address from eth_accounts:", addr);
                        } else {
                            throw new Error("No accounts available");
                        }
                    } catch (accErr) {
                        throw new Error("Could not get wallet address. Please make sure you have a wallet connected in Farcaster.");
                    }
                }

                console.log("[Wallet] Connected via Farcaster:", addr);
            } else {

                setUsingMiniApp(false);
                const anyWindow = window as any;


                const browserProvider = anyWindow.ethereum || anyWindow.web3?.currentProvider;

                if (!browserProvider) {
                    const errorMsg = isMobile
                        ? "No wallet found. Please open this app inside the Farcaster app to connect your wallet."
                        : "No wallet found. Please install MetaMask or another Web3 wallet.";
                    setMintStatus(errorMsg);
                    setConnecting(false);
                    return null;
                }

                console.log("[Wallet] Using browser ethereum provider");

                try {
                    await browserProvider.request({ method: "eth_requestAccounts" });
                } catch (err: any) {
                    if (err.code === 4001) {
                        setMintStatus("Wallet connection rejected. Please approve the connection request.");
                    } else {
                        setMintStatus("Failed to connect wallet. Please try again.");
                    }
                    setConnecting(false);
                    return null;
                }

                p = new ethers.providers.Web3Provider(browserProvider, "any");
                s = p.getSigner();
                addr = await s.getAddress();

                console.log("[Wallet] Connected via browser wallet:", addr);
            }


            let currentChainId: number;
            try {
                const net = await p.getNetwork();
                currentChainId = net.chainId;
            } catch {
                currentChainId = 0;
            }

            if (currentChainId !== CHAIN_ID) {
                console.log("[Wallet] Wrong chain, attempting to switch to Base...");

                const switchProvider = isMini ? ethProv : (window as any).ethereum;

                if (switchProvider?.request) {
                    try {
                        await switchProvider.request({
                            method: "wallet_switchEthereumChain",
                            params: [{ chainId: "0x2105" }],
                        });

                        p = new ethers.providers.Web3Provider(switchProvider as any, "any");
                        s = p.getSigner();
                        console.log("[Wallet] Switched to Base");
                    } catch (switchErr: any) {
                        console.warn("[Wallet] Chain switch failed:", switchErr);


                        if (switchErr.code === 4902 && !isMini) {
                            try {
                                await switchProvider.request({
                                    method: "wallet_addEthereumChain",
                                    params: [{
                                        chainId: "0x2105",
                                        chainName: "Base",
                                        nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
                                        rpcUrls: ["https://mainnet.base.org"],
                                        blockExplorerUrls: ["https://basescan.org"],
                                    }],
                                });
                                p = new ethers.providers.Web3Provider(switchProvider, "any");
                                s = p.getSigner();
                            } catch {
                                console.warn("[Wallet] Failed to add Base chain");
                            }
                        }
                    }
                }
            }

            setProvider(p);
            setSigner(s);
            setUserAddress(addr);
            setConnecting(false);

            return { signer: s, provider: p, userAddress: addr, isMini };
        } catch (err: any) {
            console.error("[Wallet] Connection failed:", err);
            const errorMessage = err?.message || "Wallet connection failed";
            setMintStatus(
                errorMessage.length > 100 ? errorMessage.substring(0, 100) + "..." : errorMessage
            );
            setConnecting(false);
            return null;
        }
    }

    async function sendWalletCalls(
        from: string,
        to: string,
        data: string,
        gasLimit: string = "0x1E8480"
    ): Promise<ethers.providers.TransactionResponse> {
        if (!miniAppEthProvider) {
            throw new Error("Mini app provider not available");
        }

        const req =
            miniAppEthProvider.request?.bind(miniAppEthProvider) ??
            miniAppEthProvider.send?.bind(miniAppEthProvider);

        if (!req) {
            throw new Error("Mini app provider missing request/send method");
        }

        const chainIdHex = ethers.utils.hexValue(CHAIN_ID);

        console.log("[TX] Sending wallet_sendCalls:", { from, to, chainIdHex, gasLimit });

        let result: any;
        let txHash: string | null = null;

        try {
            result = await req({
                method: "eth_sendTransaction",
                params: [{
                    from,
                    to,
                    data,
                    value: "0x0",
                    gas: gasLimit,
                    gasLimit: gasLimit,
                }],
            });

            console.log("[TX] eth_sendTransaction result:", result);

            if (typeof result === "string" && result.startsWith("0x")) {
                txHash = result;
            } else {
                txHash = result?.hash || result?.txHash || null;
            }

        } catch (sendTxError: any) {
            console.warn("[TX] eth_sendTransaction failed, trying wallet_sendCalls:", sendTxError);

            try {
                result = await req({
                    method: "wallet_sendCalls",
                    params: [
                        {
                            from,
                            chainId: chainIdHex,
                            atomicRequired: false,
                            capabilities: {
                                paymasterService: {},
                            },
                            calls: [
                                {
                                    to,
                                    data,
                                    value: "0x0",
                                    gas: gasLimit,
                                    gasLimit: gasLimit,
                                },
                            ],
                        },
                    ],
                });

                console.log("[TX] wallet_sendCalls result:", result);

                txHash =
                    result?.txHashes?.[0] ||
                    result?.txHash ||
                    result?.hash ||
                    result?.id ||
                    (typeof result === "string" && result.startsWith("0x") ? result : null);

            } catch (sendCallsError) {
                console.error("[TX] wallet_sendCalls also failed:", sendCallsError);
                throw sendCallsError;
            }
        }

        console.log("[TX] Extracted txHash:", txHash);



        if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x") || txHash.length < 66) {
            console.warn("[TX] No valid tx hash, will search by events. Result was:", result);
            return {
                hash: "0x" + "0".repeat(64),
                wait: async () => null,
            } as any;
        }

        console.log("[TX] Transaction hash:", txHash);


        const fakeTx: any = {
            hash: txHash,
            wait: async () => {

                for (let i = 0; i < 45; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    try {
                        const receipt = await readProvider.getTransactionReceipt(txHash!);
                        if (receipt && receipt.confirmations > 0) {
                            console.log("[TX] Confirmed:", txHash);
                            return receipt;
                        }
                    } catch {

                    }
                }
                console.warn("[TX] Wait timeout, proceeding:", txHash);
                return null;
            },
        };

        return fakeTx as ethers.providers.TransactionResponse;
    }

    async function sendContractTx(
        to: string,
        data: string
    ): Promise<ethers.providers.TransactionResponse | null> {
        const ctx = await ensureWallet();
        if (!ctx) return null;

        console.log("[TX] sendContractTx:", { to, isMini: ctx.isMini, usingMiniApp });

        try {
            if (ctx.isMini && miniAppEthProvider) {
                return await sendWalletCalls(ctx.userAddress, to, data);
            } else {
                const tx = await ctx.signer.sendTransaction({
                    to,
                    data,
                    value: 0,
                });
                return tx;
            }
        } catch (err: any) {
            console.error("[TX] sendContractTx failed:", err);


            const errMsg = err?.message || err?.reason || String(err);
            if (errMsg.includes("rejected") || errMsg.includes("denied") || err?.code === 4001) {
                setMintStatus("Transaction rejected. Please approve in your wallet.");
            } else if (errMsg.includes("insufficient")) {
                setMintStatus("Insufficient funds for transaction.");
            } else {
                setMintStatus("Transaction failed: " + errMsg.slice(0, 100));
            }

            throw err;
        }
    }

    async function ensureUsdcAllowance(
        spender: string,
        required: ethers.BigNumber
    ): Promise<boolean> {
        const ctx = await ensureWallet();
        if (!ctx) return false;

        const { signer: s, userAddress: addr, isMini } = ctx;

        setMintStatus("Checking USDC contract on Base…");
        const code = await readProvider.getCode(USDC_ADDRESS);
        if (code === "0x") {
            setMintStatus(
                "USDC token not found on this network. Please make sure you are on Base mainnet."
            );
            return false;
        }

        const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, readProvider);
        const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);

        try {
            const bal = await usdcRead.balanceOf(addr);
            if (bal.lt(required)) {
                setMintStatus(
                    `You need at least ${ethers.utils.formatUnits(
            required,
            USDC_DECIMALS
          )} USDC on Base to mint.`
                );
                return false;
            }
        } catch (e) {
            console.warn("USDC balanceOf failed (continuing):", e);
        }

        let current = ethers.constants.Zero;
        try {
            current = await usdcRead.allowance(addr, spender);
        } catch (e: any) {
            console.warn("USDC allowance() read failed, treating as 0:", e);
            current = ethers.constants.Zero;
        }

        if (current.gte(required)) {
            return true;
        }

        setMintStatus("Requesting USDC approve transaction in your wallet…");

        try {
            if (isMini && miniAppEthProvider) {
                const data = usdcInterface.encodeFunctionData("approve", [
                    spender,
                    required,
                ]);
                await sendWalletCalls(addr, USDC_ADDRESS, data);

                setMintStatus("Waiting for USDC approve confirmation…");

                for (let i = 0; i < 20; i++) {
                    await new Promise((res) => setTimeout(res, 1500));
                    try {
                        const updated = await usdcRead.allowance(addr, spender);
                        if (updated.gte(required)) {
                            break;
                        }

                        if (i === 19) {
                            setMintStatus("Approve transaction may not have confirmed yet. Please check your wallet/explorer.");
                            return false;
                        }
                    } catch {

                        if (i === 19) {
                            setMintStatus("Could not confirm USDC approval, please try again.");
                            return false;
                        }
                    }
                }

                setMintStatus("USDC approve confirmed. Sending mint transaction…");
            } else {
                const tx = await usdcWrite.approve(spender, required);
                await waitForTx(tx);
                setMintStatus("USDC approve confirmed. Sending mint transaction…");
            }

            return true;
        } catch (err) {
            console.error("USDC approve failed:", err);
            const msg =
                (err as any)?.reason ||
                (err as any)?.error?.message ||
                (err as any)?.data?.message ||
                (err as any)?.message ||
                "USDC approve failed";
            setMintStatus(msg);
            return false;
        }
    }

    async function handleMintLand() {
        try {
            setMintStatus("Preparing to mint 1 Land (199.99 USDC + gas)…");
            const okAllowance = await ensureUsdcAllowance(
                LAND_ADDRESS,
                LAND_PRICE_USDC
            );
            if (!okAllowance) return;

            const data = landInterface.encodeFunctionData("mint", []);
            const tx = await sendContractTx(LAND_ADDRESS, data);
            if (!tx) return;
            setMintStatus("Land mint transaction sent. Waiting for confirmation…");
            await waitForTx(tx);
            setMintStatus(
                "Land mint submitted ✅ Check your wallet / explorer for confirmation."
            );
        } catch (err: any) {
            console.error("Mint Land error:", err);
            const msg =
                err?.reason ||
                err?.error?.message ||
                err?.data?.message ||
                err?.message ||
                "Mint Land failed";
            setMintStatus(`Land mint failed: ${msg}`);
        }
    }

    async function handleMintPlant() {
        try {
            setMintStatus("Preparing to mint 1 Plant (49.99 USDC + gas)…");
            const okAllowance = await ensureUsdcAllowance(
                PLANT_ADDRESS,
                PLANT_PRICE_USDC
            );
            if (!okAllowance) return;

            const data = plantInterface.encodeFunctionData("mint", []);
            const tx = await sendContractTx(PLANT_ADDRESS, data);
            if (!tx) return;
            setMintStatus("Plant mint transaction sent. Waiting for confirmation…");
            await waitForTx(tx);
            setMintStatus(
                "Plant mint submitted ✅ Check your wallet / explorer for confirmation."
            );
        } catch (err: any) {
            console.error("Mint Plant error:", err);
            const msg =
                err?.reason ||
                err?.error?.message ||
                err?.data?.message ||
                err?.message ||
                "Mint Plant failed";
            setMintStatus(`Mint Plant failed: ${msg}`);
        }
    }

    async function handleUpgradeLand() {
        if (selectedLandForUpgrade == null) { setMintStatus("Select a Land NFT."); return; }
        const ctx = await ensureWallet(); if (!ctx) return;
        try {
            setActionLoading(true); setMintStatus("Preparing upgrade…");
            const fcweedRead = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            const landRead = new ethers.Contract(LAND_ADDRESS, ERC721_VIEW_ABI, readProvider);
            const fcweedBal = await fcweedRead.balanceOf(ctx.userAddress);
            if (fcweedBal.lt(SUPER_LAND_FCWEED_COST)) { setMintStatus("Need 2M FCWEED."); setActionLoading(false); return; }
            setMintStatus("Approving Land…");
            const landApproved = await landRead.isApprovedForAll(ctx.userAddress, SUPER_LAND_ADDRESS);
            if (!landApproved) await waitForTx(await sendContractTx(LAND_ADDRESS, erc721Interface.encodeFunctionData("setApprovalForAll", [SUPER_LAND_ADDRESS, true])));
            setMintStatus("Approving FCWEED…");
            const fcweedAllowance = await fcweedRead.allowance(ctx.userAddress, SUPER_LAND_ADDRESS);
            if (fcweedAllowance.lt(SUPER_LAND_FCWEED_COST)) await waitForTx(await sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [SUPER_LAND_ADDRESS, ethers.constants.MaxUint256])));
            setMintStatus("Upgrading…");
            await waitForTx(await sendContractTx(SUPER_LAND_ADDRESS, superLandInterface.encodeFunctionData("upgrade", [selectedLandForUpgrade])));
            setMintStatus("Super Land minted ✅");
            setUpgradeModalOpen(false); setSelectedLandForUpgrade(null);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err: any) { setMintStatus("Upgrade failed: " + (err?.message || err)); }
        finally { setActionLoading(false); }
    }

    function toHttpFromMaybeIpfs(uri: string): string {
        if (!uri) return "";
        if (uri.startsWith("ipfs://")) {
            const path = uri.slice("ipfs://".length);
            return `https://ipfs.io/ipfs/${path}`;
        }
        return uri;
    }

    async function fetchNftImages(
        nftAddress: string,
        ids: number[],
        prov: ethers.providers.Provider,
        existing: Record<number, string>
    ): Promise<Record<number, string>> {
        const out: Record<number, string> = { ...existing };
        if (ids.length === 0) return out;

        const isLand = nftAddress.toLowerCase() === LAND_ADDRESS.toLowerCase();
        const isPlant = nftAddress.toLowerCase() === PLANT_ADDRESS.toLowerCase();

        const missing = ids.filter((id) => {
            if (out[id] !== undefined) return false;
            if (METADATA_MODE === "local-only") return false;
            if (METADATA_MODE === "remote-all") return true;
            return isSuper(nftAddress, id);
        });

        if (missing.length === 0) return out;

        try {
            const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, prov);

            const tasks = missing.map(async (id) => {
                try {
                    let img: string | undefined;

                    try {
                        const uri: string = await nft.tokenURI(id);
                        const url = toHttpFromMaybeIpfs(uri);
                        const res = await fetch(url);
                        if (res.ok) {
                            const meta = await res.json();
                            img = meta.image ? toHttpFromMaybeIpfs(meta.image) : undefined;
                        }
                    } catch {

                    }

                    if (!img) {
                        if (isLand) img = LAND_FALLBACK_IMG;
                        else if (isPlant) img = PLANT_FALLBACK_IMG;
                    }

                    if (img) {
                        out[id] = img;
                    }
                } catch (e) {
                    console.error("Failed to fetch metadata", nftAddress, id, e);
                }
            });

            await Promise.all(tasks);
        } catch (e) {
            console.error("fetchNftImages top-level error", nftAddress, e);
        }

        return out;
    }

    const ownedCacheRef = useRef<{
        addr: string | null;
        state: any | null;
    }>({ addr: null, state: null });

    async function getOwnedState(addr: string) {
        console.log("[NFT] getOwnedState called for:", addr);

        if (ownedCacheRef.current.addr?.toLowerCase() === addr.toLowerCase() && ownedCacheRef.current.state)
        {
            console.log("[NFT] Returning cached state");
            return ownedCacheRef.current.state;
        }

        try {
            console.log("[NFT] Fetching owned tokens from API...");
            const state = await loadOwnedTokens(addr);
            console.log("[NFT] Got owned state:", {
                plants: state.plants?.length || 0,
                lands: state.lands?.length || 0,
                superLands: state.superLands?.length || 0,
                totals: state.totals
            });
            ownedCacheRef.current = { addr, state };
            return state;
        } catch (err) {
            console.error("[NFT] Failed to load owned tokens:", err);

            return {
                wallet: addr,
                plants: [],
                lands: [],
                superLands: [],
                totals: { plants: 0, lands: 0, superLands: 0 }
            };
        }
    }


    const refreshOldStakingRef = useRef(false);

    async function refreshOldStaking()
    {
        if (!oldStakingOpen || refreshOldStakingRef.current) return;
        refreshOldStakingRef.current = true;

        setLoadingOldStaking(true);
        console.log("[OldStaking] Starting refresh...");

        try
        {
            let addr = userAddress;
            if (!addr)
            {
                console.log("[OldStaking] No userAddress, calling ensureWallet...");
                const ctx = await ensureWallet();
                if (!ctx) {
                    console.log("[OldStaking] ensureWallet returned null");
                    return;
                }
                addr = ctx.userAddress;
            }

            console.log("[OldStaking] Loading data for address:", addr);


            const oldStakingContract = new ethers.Contract(OLD_STAKING_ADDRESS, STAKING_ABI, readProvider);

            let stakedPlantNums: number[] = [];
            let stakedLandNums: number[] = [];

            try {
                const [stakedPlantsBN, stakedLandsBN] = await Promise.all([
                    oldStakingContract.plantsOf(addr),
                    oldStakingContract.landsOf(addr),
                ]);
                stakedPlantNums = stakedPlantsBN.map((bn: ethers.BigNumber) => bn.toNumber());
                stakedLandNums = stakedLandsBN.map((bn: ethers.BigNumber) => bn.toNumber());
                console.log("[OldStaking] Staked from contract:", { plants: stakedPlantNums, lands: stakedLandNums });
            } catch (err) {
                console.error("[OldStaking] Failed to query staked NFTs from contract:", err);
            }


            let availPlants: number[] = [];
            let availLands: number[] = [];
            let availSuperLands: number[] = [];

            try {
                const ownedState = await getOwnedState(addr);
                const plants = ownedState?.plants || [];
                const lands = ownedState?.lands || [];
                const superLands = ownedState?.superLands || [];


                availPlants = plants.map((t: any) => Number(t.tokenId));
                availLands = lands.map((t: any) => Number(t.tokenId));
                availSuperLands = superLands.map((t: any) => Number(t.tokenId));

                console.log("[OldStaking] Available from API:", { plants: availPlants.length, lands: availLands.length, superLands: availSuperLands.length });
            } catch (err) {
                console.error("[OldStaking] Failed to load owned tokens from API:", err);
            }


            if (availPlants.length === 0 && availLands.length === 0 && availSuperLands.length === 0) {
                console.log("[OldStaking] API returned empty, trying blockchain query...");
                const chainNFTs = await queryAvailableNFTsFromChain(addr);
                availPlants = chainNFTs.plants;
                availLands = chainNFTs.lands;
                availSuperLands = chainNFTs.superLands;
            }

            console.log("[OldStaking] NFT counts:", {
                stakedPlants: stakedPlantNums.length,
                stakedLands: stakedLandNums.length,
                availPlants: availPlants.length,
                availLands: availLands.length,
                availSuperLands: availSuperLands.length
            });


            const iface = new ethers.utils.Interface(STAKING_ABI);

            const calls =
                [
                    { target: OLD_STAKING_ADDRESS, callData: iface.encodeFunctionData("pending", [addr]) },

                    { target: OLD_STAKING_ADDRESS, callData: iface.encodeFunctionData("landBoostBps", []) },
                    { target: OLD_STAKING_ADDRESS, callData: iface.encodeFunctionData("claimEnabled", []) },
                    { target: OLD_STAKING_ADDRESS, callData: iface.encodeFunctionData("landStakingEnabled", []) },
                    { target: OLD_STAKING_ADDRESS, callData: iface.encodeFunctionData("tokensPerPlantPerDay", []) },
                ];

            const res = await multicallTry(readProvider, calls);
            console.log("[OldStaking] Multicall results:", res.map(r => r.success));

            const pendingRaw = decode1(iface, "pending", res[0]) ?? ethers.BigNumber.from(0);

            const landBps = decode1(iface, "landBoostBps", res[1]) ?? ethers.BigNumber.from(0);
            const claimEnabled = decode1(iface, "claimEnabled", res[2]) ?? false;
            const landEnabled = decode1(iface, "landStakingEnabled", res[3]) ?? false;
            const tokensPerDay = decode1(iface, "tokensPerPlantPerDay", res[4]) ?? ethers.BigNumber.from(0);

            const plantsStaked = stakedPlantNums.length;
            const landsStaked  = stakedLandNums.length;

            const tokensPerSecond = tokensPerDay.div(86400);

            setOldStakedPlants(stakedPlantNums);
            setOldStakedLands(stakedLandNums);


            setOldAvailablePlants(availPlants);
            setOldAvailableLands(availLands);


            setAvailablePlants(availPlants);
            setAvailableLands(availLands);
            setAvailableSuperLands(availSuperLands);

            setOldLandStakingEnabled(landEnabled);

            setOldStakingStats(
                {
                    plantsStaked,
                    landsStaked,
                    totalSlots: 1 + landsStaked * 3,
                    capacityUsed: plantsStaked,
                    landBoostPct: (landsStaked * Number(landBps)) / 100,
                    pendingFormatted: ethers.utils.formatUnits(pendingRaw, 18),
                    pendingRaw,
                    claimEnabled,
                    tokensPerSecond,
            });

            console.log("[OldStaking] Stats set:", {
                plantsStaked,
                landsStaked,
                totalSlots: 1 + landsStaked * 3,
                landBoostPct: (landsStaked * Number(landBps)) / 100,
                claimEnabled
            });
        }
        catch (err)
        {
            console.error("[OldStaking] Refresh failed:", err);
        }
        finally
        {
            refreshOldStakingRef.current = false;
            setLoadingOldStaking(false);
        }
    }


    const refreshNewStakingRef = useRef(false);


    async function queryAvailableNFTsFromChain(addr: string): Promise<{
        plants: number[];
        lands: number[];
        superLands: number[];
    }> {
        console.log("[NFT] Querying available NFTs directly from chain for:", addr);

        const plantContract = new ethers.Contract(PLANT_ADDRESS, ERC721_VIEW_ABI, readProvider);
        const landContract = new ethers.Contract(LAND_ADDRESS, ERC721_VIEW_ABI, readProvider);
        const superLandContract = new ethers.Contract(SUPER_LAND_ADDRESS, ERC721_VIEW_ABI, readProvider);

        const plants: number[] = [];
        const lands: number[] = [];
        const superLands: number[] = [];

        try {

            const [plantBal, landBal, superLandBal] = await Promise.all([
                plantContract.balanceOf(addr).catch(() => ethers.BigNumber.from(0)),
                landContract.balanceOf(addr).catch(() => ethers.BigNumber.from(0)),
                superLandContract.balanceOf(addr).catch(() => ethers.BigNumber.from(0)),
            ]);

            console.log("[NFT] Balances:", {
                plants: plantBal.toNumber(),
                lands: landBal.toNumber(),
                superLands: superLandBal.toNumber()
            });





            const erc721EnumAbi = [
                "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
            ];

            const plantEnum = new ethers.Contract(PLANT_ADDRESS, erc721EnumAbi, readProvider);
            const landEnum = new ethers.Contract(LAND_ADDRESS, erc721EnumAbi, readProvider);
            const superLandEnum = new ethers.Contract(SUPER_LAND_ADDRESS, erc721EnumAbi, readProvider);


            const plantPromises = [];
            for (let i = 0; i < Math.min(plantBal.toNumber(), 100); i++) {
                plantPromises.push(
                    plantEnum.tokenOfOwnerByIndex(addr, i)
                        .then((id: ethers.BigNumber) => id.toNumber())
                        .catch(() => null)
                );
            }
            const plantResults = await Promise.all(plantPromises);
            plants.push(...plantResults.filter((id): id is number => id !== null));


            const landPromises = [];
            for (let i = 0; i < Math.min(landBal.toNumber(), 100); i++) {
                landPromises.push(
                    landEnum.tokenOfOwnerByIndex(addr, i)
                        .then((id: ethers.BigNumber) => id.toNumber())
                        .catch(() => null)
                );
            }
            const landResults = await Promise.all(landPromises);
            lands.push(...landResults.filter((id): id is number => id !== null));


            const superLandPromises = [];
            for (let i = 0; i < Math.min(superLandBal.toNumber(), 100); i++) {
                superLandPromises.push(
                    superLandEnum.tokenOfOwnerByIndex(addr, i)
                        .then((id: ethers.BigNumber) => id.toNumber())
                        .catch(() => null)
                );
            }
            const superLandResults = await Promise.all(superLandPromises);
            superLands.push(...superLandResults.filter((id): id is number => id !== null));

            console.log("[NFT] Found from chain:", { plants, lands, superLands });

        } catch (err) {
            console.error("[NFT] Failed to query NFTs from chain:", err);
        }

        return { plants, lands, superLands };
    }

    async function refreshNewStaking() {
        if (!newStakingOpen || refreshNewStakingRef.current) return;
        refreshNewStakingRef.current = true;

        setLoadingNewStaking(true);
        console.log("[NewStaking] Starting refresh...");

        try
        {
            let addr = userAddress;
            if (!addr)
            {
                console.log("[NewStaking] No userAddress, calling ensureWallet...");
                const ctx = await ensureWallet();
                if (!ctx) {
                    console.log("[NewStaking] ensureWallet returned null");
                    return;
                }
                addr = ctx.userAddress;
            }

            console.log("[NewStaking] Loading data for address:", addr);


            const newStakingContract = new ethers.Contract(NEW_STAKING_ADDRESS, STAKING_ABI, readProvider);

            let stakedPlantNums: number[] = [];
            let stakedLandNums: number[] = [];
            let stakedSuperLandNums: number[] = [];

            try {
                const [stakedPlantsBN, stakedLandsBN, stakedSuperLandsBN] = await Promise.all([
                    newStakingContract.plantsOf(addr),
                    newStakingContract.landsOf(addr),
                    newStakingContract.superLandsOf(addr),
                ]);
                stakedPlantNums = stakedPlantsBN.map((bn: ethers.BigNumber) => bn.toNumber());
                stakedLandNums = stakedLandsBN.map((bn: ethers.BigNumber) => bn.toNumber());
                stakedSuperLandNums = stakedSuperLandsBN.map((bn: ethers.BigNumber) => bn.toNumber());
                console.log("[NewStaking] Staked from contract:", {
                    plants: stakedPlantNums,
                    lands: stakedLandNums,
                    superLands: stakedSuperLandNums
                });
            } catch (err) {
                console.error("[NewStaking] Failed to query staked NFTs from contract:", err);
            }


            let availPlants: number[] = [];
            let availLands: number[] = [];
            let availSuperLands: number[] = [];

            try {
                const ownedState = await getOwnedState(addr);
                const plants = ownedState?.plants || [];
                const lands = ownedState?.lands || [];
                const superLands = ownedState?.superLands || [];


                availPlants = plants.map((t: any) => Number(t.tokenId));
                availLands = lands.map((t: any) => Number(t.tokenId));
                availSuperLands = superLands.map((t: any) => Number(t.tokenId));

                console.log("[NewStaking] Available from API:", {
                    plants: availPlants.length,
                    lands: availLands.length,
                    superLands: availSuperLands.length
                });
            } catch (err) {
                console.error("[NewStaking] Failed to load owned tokens from API:", err);
            }


            if (availPlants.length === 0 && availLands.length === 0 && availSuperLands.length === 0) {
                console.log("[NewStaking] API returned empty, trying blockchain query...");
                const chainNFTs = await queryAvailableNFTsFromChain(addr);
                availPlants = chainNFTs.plants;
                availLands = chainNFTs.lands;
                availSuperLands = chainNFTs.superLands;
            }

            console.log("[NewStaking] NFT counts:", {
                stakedPlants: stakedPlantNums.length,
                stakedLands: stakedLandNums.length,
                stakedSuperLands: stakedSuperLandNums.length,
                availPlants: availPlants.length,
                availLands: availLands.length,
                availSuperLands: availSuperLands.length
            });


            const iface = new ethers.utils.Interface(STAKING_ABI);

            const calls =
                [
                    { target: NEW_STAKING_ADDRESS, callData: iface.encodeFunctionData("pending", [addr]) },

                    { target: NEW_STAKING_ADDRESS, callData: iface.encodeFunctionData("tokensPerPlantPerDay", []) },
                    { target: NEW_STAKING_ADDRESS, callData: iface.encodeFunctionData("getBoostBps", [addr]) },
                    { target: NEW_STAKING_ADDRESS, callData: iface.encodeFunctionData("capacityOf", [addr]) },

                    { target: NEW_STAKING_ADDRESS, callData: iface.encodeFunctionData("claimEnabled", []) },
                    { target: NEW_STAKING_ADDRESS, callData: iface.encodeFunctionData("landStakingEnabled", []) },
                    { target: NEW_STAKING_ADDRESS, callData: iface.encodeFunctionData("superLandStakingEnabled", []) },
                ];

            const res = await multicallTry(readProvider, calls);
            console.log("[NewStaking] Multicall results:", res.map(r => r.success));

            const pendingRaw = decode1(iface, "pending", res[0]) ?? ethers.BigNumber.from(0);

            const tokensPerDay = decode1(iface, "tokensPerPlantPerDay", res[1]) ?? ethers.BigNumber.from(0);
            const totalBoostBps = decode1(iface, "getBoostBps", res[2]) ?? ethers.BigNumber.from(10_000);
            const capacity = decode1(iface, "capacityOf", res[3]) ?? ethers.BigNumber.from(1);

            const claimEnabled = decode1(iface, "claimEnabled", res[4]) ?? false;
            const landEnabled = decode1(iface, "landStakingEnabled", res[5]) ?? false;
            const superLandEnabled = decode1(iface, "superLandStakingEnabled", res[6]) ?? false;

            const plantsStaked = stakedPlantNums.length;
            const landsStaked  = stakedLandNums.length;

            const superLandsStaked = stakedSuperLandNums.length;

            const totalSlots = Number(capacity);
            const boostPct = Number(totalBoostBps) / 100;

            const tokensPerSecond = tokensPerDay.div(86400);

            const dailyBase = tokensPerDay.mul(plantsStaked);
            const dailyWithBoost = dailyBase.mul(totalBoostBps).div(10000);
            const dailyFormatted = parseFloat(ethers.utils.formatUnits(dailyWithBoost, 18));

            const dailyRewards =
                dailyFormatted >= 1_000_000 ? (dailyFormatted / 1_000_000).toFixed(2) + "M" :
                dailyFormatted >= 1000 ? (dailyFormatted / 1000).toFixed(1) + "K" :
                dailyFormatted.toFixed(0);

            setNewStakedPlants(stakedPlantNums);
            setNewStakedLands(stakedLandNums);
            setNewStakedSuperLands(stakedSuperLandNums);

            setNewAvailablePlants(availPlants);
            setNewAvailableLands(availLands);
            setNewAvailableSuperLands(availSuperLands);

            setNewLandStakingEnabled(landEnabled);
            setNewSuperLandStakingEnabled(superLandEnabled);

            setNewStakingStats(
                {
                    plantsStaked,
                    landsStaked,
                    superLandsStaked,
                    totalSlots,
                    capacityUsed: plantsStaked,
                    totalBoostPct: boostPct,
                    pendingFormatted: ethers.utils.formatUnits(pendingRaw, 18),
                    pendingRaw,
                    dailyRewards,
                    claimEnabled,
                    tokensPerSecond,
            });

            console.log("[NewStaking] Stats set:", {
                plantsStaked,
                landsStaked,
                superLandsStaked,
                totalSlots,
                totalBoostPct: boostPct,
                dailyRewards,
                claimEnabled
            });
        }
        catch (err)
        {
            console.error("[NewStaking] Refresh failed:", err);
        }
        finally
        {
            refreshNewStakingRef.current = false;
            setLoadingNewStaking(false);
        }
    }

    useEffect(() => {
        if (oldStakingOpen) {

            ownedCacheRef.current = { addr: null, state: null };
            refreshOldStakingRef.current = false;
            refreshOldStaking();
        }
    }, [oldStakingOpen, userAddress]);

    useEffect(() => {
        if (newStakingOpen) {

            ownedCacheRef.current = { addr: null, state: null };
            refreshNewStakingRef.current = false;
            refreshNewStaking();
        }
    }, [newStakingOpen, userAddress]);


    useEffect(() => {
        if (!newStakingOpen || !newStakingStats) return;

        const { pendingRaw, tokensPerSecond, plantsStaked, totalBoostPct } = newStakingStats;
        if (!pendingRaw || !tokensPerSecond || plantsStaked === 0) return;

        console.log("[Pending] Starting real-time update, tokensPerSecond:", tokensPerSecond.toString());

        let currentPending = pendingRaw;
        const boostMultiplier = totalBoostPct / 100;


        const effectiveTokensPerSecond = tokensPerSecond.mul(plantsStaked).mul(Math.floor(boostMultiplier * 100)).div(100);

        const interval = setInterval(() => {
            currentPending = currentPending.add(effectiveTokensPerSecond);
            const formatted = parseFloat(ethers.utils.formatUnits(currentPending, 18));

            let display: string;
            if (formatted >= 1_000_000) {
                display = (formatted / 1_000_000).toFixed(4) + "M";
            } else if (formatted >= 1000) {
                display = (formatted / 1000).toFixed(2) + "K";
            } else {
                display = formatted.toFixed(2);
            }

            setRealTimePending(display);
        }, 1000);


        const initialFormatted = parseFloat(ethers.utils.formatUnits(pendingRaw, 18));
        let initialDisplay: string;
        if (initialFormatted >= 1_000_000) {
            initialDisplay = (initialFormatted / 1_000_000).toFixed(4) + "M";
        } else if (initialFormatted >= 1000) {
            initialDisplay = (initialFormatted / 1000).toFixed(2) + "K";
        } else {
            initialDisplay = initialFormatted.toFixed(2);
        }
        setRealTimePending(initialDisplay);

        return () => clearInterval(interval);
    }, [newStakingOpen, newStakingStats]);


    useEffect(() => {
        if (!oldStakingOpen || !oldStakingStats) return;

        const { pendingRaw, tokensPerSecond, plantsStaked, landBoostPct } = oldStakingStats;
        if (!pendingRaw || !tokensPerSecond || plantsStaked === 0) return;

        console.log("[OldPending] Starting real-time update");

        let currentPending = pendingRaw;
        const boostMultiplier = 1 + (landBoostPct / 100);


        const effectiveTokensPerSecond = tokensPerSecond.mul(plantsStaked).mul(Math.floor(boostMultiplier * 100)).div(100);

        const interval = setInterval(() => {
            currentPending = currentPending.add(effectiveTokensPerSecond);
            const formatted = parseFloat(ethers.utils.formatUnits(currentPending, 18));

            let display: string;
            if (formatted >= 1_000_000) {
                display = (formatted / 1_000_000).toFixed(4) + "M";
            } else if (formatted >= 1000) {
                display = (formatted / 1000).toFixed(2) + "K";
            } else {
                display = formatted.toFixed(2);
            }

            setOldRealTimePending(display);
        }, 1000);


        const initialFormatted = parseFloat(ethers.utils.formatUnits(pendingRaw, 18));
        let initialDisplay: string;
        if (initialFormatted >= 1_000_000) {
            initialDisplay = (initialFormatted / 1_000_000).toFixed(4) + "M";
        } else if (initialFormatted >= 1000) {
            initialDisplay = (initialFormatted / 1000).toFixed(2) + "K";
        } else {
            initialDisplay = initialFormatted.toFixed(2);
        }
        setOldRealTimePending(initialDisplay);

        return () => clearInterval(interval);
    }, [oldStakingOpen, oldStakingStats]);


    async function ensureCollectionApproval(collectionAddress: string, stakingAddress: string, ctx: { signer: ethers.Signer; userAddress: string }) {
        const nftRead = new ethers.Contract(collectionAddress, ERC721_VIEW_ABI, readProvider);
        if (!(await nftRead.isApprovedForAll(ctx.userAddress, stakingAddress))) {
            const tx = await sendContractTx(collectionAddress, erc721Interface.encodeFunctionData("setApprovalForAll", [stakingAddress, true]));
            if (!tx) throw new Error("Approval rejected");
            await waitForTx(tx);
        }
    }


    useEffect(() => {
        if (!upgradeModalOpen) return;

        (async () => {
            const ctx = await ensureWallet();
            if (!ctx) return;

            setLoadingUpgrade(true);

            try {

                const owned = await getOwnedState(ctx.userAddress);


                const lands = owned.lands
                                   .filter((t: any) => !t.staked)
                                   .map((t: any) => Number(t.tokenId));

                setUpgradeLands(lands);
            }
            catch (e) {

                console.error("Failed to load lands for upgrade:", e);
                setUpgradeLands([]);
            }
            finally {

                setLoadingUpgrade(false);
            }
        })();
    }, [upgradeModalOpen]);




    async function handleOldStakeSelected() {
        const ctx = await ensureWallet(); if (!ctx) return;
        if (selectedOldAvailPlants.length === 0 && selectedOldAvailLands.length === 0) { setMintStatus("Select NFTs."); return; }
        try {
            setActionLoading(true);
            const stakingPlants = [...selectedOldAvailPlants];
            const stakingLands = [...selectedOldAvailLands];
            if (stakingPlants.length > 0) { await ensureCollectionApproval(PLANT_ADDRESS, OLD_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, stakingInterface.encodeFunctionData("stakePlants", [stakingPlants.map((id) => ethers.BigNumber.from(id))]))); }
            if (stakingLands.length > 0 && oldLandStakingEnabled) { await ensureCollectionApproval(LAND_ADDRESS, OLD_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, stakingInterface.encodeFunctionData("stakeLands", [stakingLands.map((id) => ethers.BigNumber.from(id))]))); }

            setOldAvailablePlants(prev => prev.filter(id => !stakingPlants.includes(id)));
            setOldAvailableLands(prev => prev.filter(id => !stakingLands.includes(id)));
            setOldStakedPlants(prev => [...prev, ...stakingPlants]);
            setOldStakedLands(prev => [...prev, ...stakingLands]);
            setSelectedOldAvailPlants([]); setSelectedOldAvailLands([]);

            setTimeout(() => { refreshOldStakingRef.current = false; refreshOldStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); refreshOldStakingRef.current = false; refreshOldStaking(); } finally { setActionLoading(false); }
    }

    async function handleOldUnstakeSelected() {
        const ctx = await ensureWallet(); if (!ctx) return;
        if (selectedOldStakedPlants.length === 0 && selectedOldStakedLands.length === 0) { setMintStatus("Select NFTs."); return; }
        try {
            setActionLoading(true);
            const unstakingPlants = [...selectedOldStakedPlants];
            const unstakingLands = [...selectedOldStakedLands];
            if (unstakingPlants.length > 0) await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, stakingInterface.encodeFunctionData("unstakePlants", [unstakingPlants.map((id) => ethers.BigNumber.from(id))])));
            if (unstakingLands.length > 0) await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, stakingInterface.encodeFunctionData("unstakeLands", [unstakingLands.map((id) => ethers.BigNumber.from(id))])));

            setOldStakedPlants(prev => prev.filter(id => !unstakingPlants.includes(id)));
            setOldStakedLands(prev => prev.filter(id => !unstakingLands.includes(id)));
            setOldAvailablePlants(prev => [...prev, ...unstakingPlants]);
            setOldAvailableLands(prev => [...prev, ...unstakingLands]);
            setSelectedOldStakedPlants([]); setSelectedOldStakedLands([]);

            setTimeout(() => { refreshOldStakingRef.current = false; refreshOldStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); refreshOldStakingRef.current = false; refreshOldStaking(); } finally { setActionLoading(false); }
    }

    async function handleOldClaim() {
        if (!oldStakingStats || parseFloat(oldStakingStats.pendingFormatted) <= 0) { setMintStatus("No rewards."); return; }
        try {
            setActionLoading(true);
            await waitForTx(await sendContractTx(
                OLD_STAKING_ADDRESS,
                stakingInterface.encodeFunctionData("claim", [])
            ));

            setOldRealTimePending("0.00");
            setOldStakingStats(prev => prev ? { ...prev, pendingRaw: ethers.BigNumber.from(0), pendingFormatted: "0" } : null);

            setTimeout(() => { refreshOldStakingRef.current = false; refreshOldStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); } finally { setActionLoading(false); }
    }

    async function handleNewStakeSelected() {
        const ctx = await ensureWallet(); if (!ctx) return;
        if (selectedNewAvailPlants.length === 0 && selectedNewAvailLands.length === 0 && selectedNewAvailSuperLands.length === 0) { setMintStatus("Select NFTs."); return; }
        try {
            setActionLoading(true);
            const stakingPlants = [...selectedNewAvailPlants];
            const stakingLands = [...selectedNewAvailLands];
            const stakingSuperLands = [...selectedNewAvailSuperLands];
            if (stakingPlants.length > 0) { await ensureCollectionApproval(PLANT_ADDRESS, NEW_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("stakePlants", [stakingPlants.map((id) => ethers.BigNumber.from(id))]))); }
            if (stakingLands.length > 0 && newLandStakingEnabled) { await ensureCollectionApproval(LAND_ADDRESS, NEW_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("stakeLands", [stakingLands.map((id) => ethers.BigNumber.from(id))]))); }
            if (stakingSuperLands.length > 0 && newSuperLandStakingEnabled) { await ensureCollectionApproval(SUPER_LAND_ADDRESS, NEW_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("stakeSuperLands", [stakingSuperLands.map((id) => ethers.BigNumber.from(id))]))); }

            setNewAvailablePlants(prev => prev.filter(id => !stakingPlants.includes(id)));
            setNewAvailableLands(prev => prev.filter(id => !stakingLands.includes(id)));
            setNewAvailableSuperLands(prev => prev.filter(id => !stakingSuperLands.includes(id)));
            setNewStakedPlants(prev => [...prev, ...stakingPlants]);
            setNewStakedLands(prev => [...prev, ...stakingLands]);
            setNewStakedSuperLands(prev => [...prev, ...stakingSuperLands]);
            setSelectedNewAvailPlants([]); setSelectedNewAvailLands([]); setSelectedNewAvailSuperLands([]);

            setTimeout(() => { refreshNewStakingRef.current = false; refreshNewStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); refreshNewStakingRef.current = false; refreshNewStaking(); } finally { setActionLoading(false); }
    }

    async function handleNewUnstakeSelected() {
        const ctx = await ensureWallet(); if (!ctx) return;
        if (selectedNewStakedPlants.length === 0 && selectedNewStakedLands.length === 0 && selectedNewStakedSuperLands.length === 0) { setMintStatus("Select NFTs."); return; }
        try {
            setActionLoading(true);
            const unstakingPlants = [...selectedNewStakedPlants];
            const unstakingLands = [...selectedNewStakedLands];
            const unstakingSuperLands = [...selectedNewStakedSuperLands];
            if (unstakingPlants.length > 0) await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("unstakePlants", [unstakingPlants.map((id) => ethers.BigNumber.from(id))])));
            if (unstakingLands.length > 0) await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("unstakeLands", [unstakingLands.map((id) => ethers.BigNumber.from(id))])));
            if (unstakingSuperLands.length > 0) await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("unstakeSuperLands", [unstakingSuperLands.map((id) => ethers.BigNumber.from(id))])));

            setNewStakedPlants(prev => prev.filter(id => !unstakingPlants.includes(id)));
            setNewStakedLands(prev => prev.filter(id => !unstakingLands.includes(id)));
            setNewStakedSuperLands(prev => prev.filter(id => !unstakingSuperLands.includes(id)));
            setNewAvailablePlants(prev => [...prev, ...unstakingPlants]);
            setNewAvailableLands(prev => [...prev, ...unstakingLands]);
            setNewAvailableSuperLands(prev => [...prev, ...unstakingSuperLands]);
            setSelectedNewStakedPlants([]); setSelectedNewStakedLands([]); setSelectedNewStakedSuperLands([]);

            setTimeout(() => { refreshNewStakingRef.current = false; refreshNewStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); refreshNewStakingRef.current = false; refreshNewStaking(); } finally { setActionLoading(false); }
    }

    async function handleNewClaim() {
        if (!newStakingStats || parseFloat(newStakingStats.pendingFormatted) <= 0) { setMintStatus("No rewards."); return; }
        try {
            setActionLoading(true);
            await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("claim", [])));

            setRealTimePending("0.00");
            setNewStakingStats(prev => prev ? { ...prev, pendingRaw: ethers.BigNumber.from(0), pendingFormatted: "0" } : null);

            setTimeout(() => { refreshNewStakingRef.current = false; refreshNewStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); } finally { setActionLoading(false); }
    }

    const refreshV3StakingRef = useRef(false);
    const [v3ActionStatus, setV3ActionStatus] = useState("");

    async function refreshV3Staking() {
        if (refreshV3StakingRef.current || !userAddress) return;
        refreshV3StakingRef.current = true;
        setLoadingV3Staking(true);
        console.log("[V3Staking] Starting refresh for:", userAddress);
        try {
            const v3Contract = new ethers.Contract(V3_STAKING_ADDRESS, V3_STAKING_ABI, readProvider);

            // Fetch user data and staked token IDs
            const [userData, pendingRaw, capacity, stakedPlantIds, stakedLandIds, avgHealth] = await Promise.all([
                v3Contract.users(userAddress),
                v3Contract.pending(userAddress),
                v3Contract.capacityOf(userAddress),
                v3Contract.plantsOf(userAddress),
                v3Contract.landsOf(userAddress),
                v3Contract.getAverageHealth(userAddress),
            ]);

            const plantsCount = Number(userData.plants);
            const landsCount = Number(userData.lands);
            const superLandsCount = Number(userData.superLands);
            const water = userData.waterBalance;

            // Convert staked IDs to numbers
            const stakedPlantNums = stakedPlantIds.map((id: any) => Number(id));
            const stakedLandNums = stakedLandIds.map((id: any) => Number(id));

            console.log("[V3Staking] Staked plants from contract:", stakedPlantNums);
            console.log("[V3Staking] Staked lands from contract:", stakedLandNums);
            console.log("[V3Staking] User data - plants:", plantsCount, "lands:", landsCount, "superLands:", superLandsCount);

            // Get plant health and water needed for staked plants
            const healthMap: Record<number, number> = {};
            const waterNeededMap: Record<number, number> = {};

            if (stakedPlantNums.length > 0) {
                try {
                    const healthCalls = stakedPlantNums.map((id: number) => ({
                        target: V3_STAKING_ADDRESS,
                        callData: v3StakingInterface.encodeFunctionData("getPlantHealth", [id])
                    }));
                    const waterCalls = stakedPlantNums.map((id: number) => ({
                        target: V3_STAKING_ADDRESS,
                        callData: v3StakingInterface.encodeFunctionData("getWaterNeeded", [id])
                    }));
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const [, healthResults] = await mc.callStatic.aggregate(healthCalls);
                    const [, waterResults] = await mc.callStatic.aggregate(waterCalls);
                    stakedPlantNums.forEach((id: number, i: number) => {
                        healthMap[id] = ethers.BigNumber.from(healthResults[i]).toNumber();
                        const waterWei = ethers.BigNumber.from(waterResults[i]);
                        waterNeededMap[id] = parseFloat(ethers.utils.formatUnits(waterWei, 18));
                    });
                    console.log("[V3Staking] Plant healths:", healthMap);
                } catch (err) {
                    console.error("[V3Staking] Failed to get plant health:", err);
                    // Default to 100% health if query fails
                    stakedPlantNums.forEach((id: number) => {
                        healthMap[id] = 100;
                        waterNeededMap[id] = 0;
                    });
                }
            }

            setV3PlantHealths(healthMap);
            setV3WaterNeeded(waterNeededMap);
            setV3StakedPlants(stakedPlantNums);
            setV3StakedLands(stakedLandNums);

            // Get owned NFTs (not staked)
            const owned = await getOwnedState(userAddress);
            console.log("[V3Staking] Owned state:", owned);

            // Filter out already staked NFTs from available
            const availPlants = owned.plants
                .filter((t: any) => !stakedPlantNums.includes(Number(t.tokenId)))
                .map((t: any) => Number(t.tokenId));
            const availLands = owned.lands
                .filter((t: any) => !stakedLandNums.includes(Number(t.tokenId)))
                .map((t: any) => Number(t.tokenId));

            // Handle super lands - check staker mapping
            const allOwnedSuperLandIds = owned.superLands.map((t: any) => Number(t.tokenId));
            const stakedSuperLandNums: number[] = [];
            const availSuperLandNums: number[] = [];

            if (allOwnedSuperLandIds.length > 0 || superLandsCount > 0) {
                try {
                    // If user has staked super lands but we don't know which ones,
                    // we need to check all super lands they might own
                    const superLandIdsToCheck = [...allOwnedSuperLandIds];

                    // Also try to find staked super lands by checking a range
                    // This is a fallback if the owned state doesn't include staked ones
                    if (superLandsCount > 0 && superLandIdsToCheck.length < superLandsCount) {
                        // Try checking IDs 1-100 for this user's staked super lands
                        for (let i = 1; i <= 100; i++) {
                            if (!superLandIdsToCheck.includes(i)) {
                                superLandIdsToCheck.push(i);
                            }
                        }
                    }

                    if (superLandIdsToCheck.length > 0) {
                        const stakerCalls = superLandIdsToCheck.map((id: number) => ({
                            target: V3_STAKING_ADDRESS,
                            callData: v3StakingInterface.encodeFunctionData("superLandStakerOf", [id])
                        }));
                        const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                        const [, stakerResults] = await mc.callStatic.aggregate(stakerCalls);

                        superLandIdsToCheck.forEach((id: number, i: number) => {
                            try {
                                const staker = ethers.utils.defaultAbiCoder.decode(["address"], stakerResults[i])[0];
                                if (staker.toLowerCase() === userAddress.toLowerCase()) {
                                    stakedSuperLandNums.push(id);
                                } else if (staker === ethers.constants.AddressZero && allOwnedSuperLandIds.includes(id)) {
                                    availSuperLandNums.push(id);
                                }
                            } catch {}
                        });
                    }
                    console.log("[V3Staking] Staked super lands:", stakedSuperLandNums);
                    console.log("[V3Staking] Available super lands:", availSuperLandNums);
                } catch (err) {
                    console.error("[V3Staking] Failed to check super land stakers:", err);
                    // If multicall fails, assume owned super lands are available
                    availSuperLandNums.push(...allOwnedSuperLandIds);
                }
            }

            setV3StakedSuperLands(stakedSuperLandNums);
            setV3AvailablePlants(availPlants);
            setV3AvailableLands(availLands);
            setV3AvailableSuperLands(availSuperLandNums);

            const pendingFormatted = parseFloat(ethers.utils.formatUnits(pendingRaw, 18));
            const capacityNum = capacity.toNumber();
            const avgHealthNum = avgHealth.toNumber();

            setV3StakingStats({
                plants: plantsCount,
                lands: landsCount,
                superLands: superLandsCount,
                capacity: capacityNum,
                avgHealth: avgHealthNum,
                water,
                pendingRaw,
                pendingFormatted
            });

            const display = pendingFormatted >= 1e6 ? (pendingFormatted / 1e6).toFixed(4) + "M" :
                           pendingFormatted >= 1e3 ? (pendingFormatted / 1e3).toFixed(2) + "K" :
                           pendingFormatted.toFixed(2);
            setV3RealTimePending(display);

            console.log("[V3Staking] Refresh complete:", {
                stakedPlants: stakedPlantNums.length,
                stakedLands: stakedLandNums.length,
                stakedSuperLands: stakedSuperLandNums.length,
                availPlants: availPlants.length,
                availLands: availLands.length,
                availSuperLands: availSuperLandNums.length,
                pending: display
            });

        } catch (err) {
            console.error("[V3Staking] Error:", err);
        }
        finally {
            refreshV3StakingRef.current = false;
            setLoadingV3Staking(false);
        }
    }

    useEffect(() => {
        if (v3StakingOpen && userAddress) { refreshV3StakingRef.current = false; refreshV3Staking(); }
    }, [v3StakingOpen, userAddress]);

    useEffect(() => {
        if (!v3StakingOpen || !v3StakingStats) return;
        const { pendingRaw, plants } = v3StakingStats;
        if (!pendingRaw || plants === 0) return;
        let currentPending = pendingRaw;
        const tokensPerSecond = ethers.utils.parseUnits("300000", 18).div(86400);
        const effectivePerSecond = tokensPerSecond.mul(plants);
        const interval = setInterval(() => {
            currentPending = currentPending.add(effectivePerSecond.mul(v3StakingStats.avgHealth || 100).div(100));
            const formatted = parseFloat(ethers.utils.formatUnits(currentPending, 18));
            setV3RealTimePending(formatted >= 1e6 ? (formatted / 1e6).toFixed(4) + "M" : formatted >= 1e3 ? (formatted / 1e3).toFixed(2) + "K" : formatted.toFixed(2));
        }, 1000);
        return () => clearInterval(interval);
    }, [v3StakingOpen, v3StakingStats]);

    async function handleV3StakePlants() {
        if (selectedV3AvailPlants.length === 0) return;
        try {
            setActionLoading(true); setV3ActionStatus("Approving...");
            const ctx = await ensureWallet(); if (!ctx) return;
            await ensureCollectionApproval(PLANT_ADDRESS, V3_STAKING_ADDRESS, ctx);
            setV3ActionStatus("Staking plants...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("stakePlants", [selectedV3AvailPlants]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Staked!");
            setSelectedV3AvailPlants([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV3StakeLands() {
        if (selectedV3AvailLands.length === 0) return;
        try {
            setActionLoading(true); setV3ActionStatus("Approving...");
            const ctx = await ensureWallet(); if (!ctx) return;
            await ensureCollectionApproval(LAND_ADDRESS, V3_STAKING_ADDRESS, ctx);
            setV3ActionStatus("Staking lands...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("stakeLands", [selectedV3AvailLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Staked!");
            setSelectedV3AvailLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV3StakeSuperLands() {
        if (selectedV3AvailSuperLands.length === 0) return;
        try {
            setActionLoading(true); setV3ActionStatus("Approving...");
            const ctx = await ensureWallet(); if (!ctx) return;
            await ensureCollectionApproval(SUPER_LAND_ADDRESS, V3_STAKING_ADDRESS, ctx);
            setV3ActionStatus("Staking super lands...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("stakeSuperLands", [selectedV3AvailSuperLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Staked!");
            setSelectedV3AvailSuperLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV3UnstakePlants() {
        if (selectedV3StakedPlants.length === 0) return;
        const unhealthy = selectedV3StakedPlants.filter(id => v3PlantHealths[id] !== 100);
        if (unhealthy.length > 0) { setV3ActionStatus("Plants must have 100% health to unstake!"); return; }
        try {
            setActionLoading(true); setV3ActionStatus("Unstaking plants...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("unstakePlants", [selectedV3StakedPlants]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Unstaked!");
            setSelectedV3StakedPlants([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV3UnstakeLands() {
        if (selectedV3StakedLands.length === 0) return;
        try {
            setActionLoading(true); setV3ActionStatus("Unstaking lands...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("unstakeLands", [selectedV3StakedLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Unstaked!");
            setSelectedV3StakedLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV3UnstakeSuperLands() {
        if (selectedV3StakedSuperLands.length === 0) return;
        try {
            setActionLoading(true); setV3ActionStatus("Unstaking super lands...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("unstakeSuperLands", [selectedV3StakedSuperLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Unstaked!");
            setSelectedV3StakedSuperLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV3Claim() {
        if (!v3StakingStats || v3StakingStats.pendingFormatted <= 0) { setV3ActionStatus("No rewards."); return; }
        try {
            setActionLoading(true); setV3ActionStatus("Claiming...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("claim", []));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Claimed!");
            setV3RealTimePending("0.00");
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleWaterPlants() {
        if (selectedPlantsToWater.length === 0) return;
        try {
            setActionLoading(true); setV3ActionStatus("Watering plants...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("waterPlants", [selectedPlantsToWater]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV3ActionStatus("Plants watered!");
            setSelectedPlantsToWater([]);
            setTimeout(() => { refreshV3StakingRef.current = false; refreshV3Staking(); setV3ActionStatus(""); }, 2000);
        } catch (err: any) { setV3ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function loadWaterShopInfo() {
        try {
            const v3Contract = new ethers.Contract(V3_STAKING_ADDRESS, V3_STAKING_ABI, readProvider);
            const [isOpen, shopTimeInfo, dailyRemaining, walletRemaining, pricePerLiter, shopEnabled, walletLimit] = await Promise.all([
                v3Contract.isShopOpen(),
                v3Contract.getShopTimeInfo(),
                v3Contract.getDailyWaterRemaining(),
                userAddress ? v3Contract.getWalletWaterRemaining(userAddress) : ethers.BigNumber.from(0),
                v3Contract.waterPricePerLiter(),
                v3Contract.waterShopEnabled(),
                userAddress ? v3Contract.getWalletWaterLimit(userAddress) : ethers.BigNumber.from(0),
            ]);

            // Also get user's staked plants count for display
            let stakedPlantsCount = 0;
            if (userAddress) {
                try {
                    const userData = await v3Contract.users(userAddress);
                    stakedPlantsCount = Number(userData.plants);
                } catch {}
            }

            setWaterShopInfo({
                isOpen: isOpen && shopEnabled,
                opensAt: shopTimeInfo.opensAt.toNumber(),
                closesAt: shopTimeInfo.closesAt.toNumber(),
                dailyRemaining: parseFloat(ethers.utils.formatUnits(dailyRemaining, 18)),
                walletRemaining: parseFloat(ethers.utils.formatUnits(walletRemaining, 18)),
                walletLimit: parseFloat(ethers.utils.formatUnits(walletLimit, 18)),
                pricePerLiter: parseFloat(ethers.utils.formatUnits(pricePerLiter, 18)),
                stakedPlants: stakedPlantsCount,
            });
        } catch (err) { console.error("[WaterShop] Error:", err); }
    }

    useEffect(() => {
        if (activeTab === "shop") { loadWaterShopInfo(); }
    }, [activeTab, userAddress]);

    async function handleBuyWater() {
        if (waterBuyAmount <= 0) return;
        try {
            setWaterLoading(true); setWaterStatus("Approving FCWEED...");
            const ctx = await ensureWallet(); if (!ctx) return;
            const cost = ethers.utils.parseUnits((waterBuyAmount * (waterShopInfo?.pricePerLiter || 75000)).toString(), 18);
            const tokenContract = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            const allowance = await tokenContract.allowance(userAddress, V3_STAKING_ADDRESS);
            if (allowance.lt(cost)) {
                const approveTx = await sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [V3_STAKING_ADDRESS, ethers.constants.MaxUint256]));
                if (!approveTx) throw new Error("Approval rejected");
                await waitForTx(approveTx);
            }
            setWaterStatus("Buying water...");
            const tx = await sendContractTx(V3_STAKING_ADDRESS, v3StakingInterface.encodeFunctionData("buyWater", [waterBuyAmount]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setWaterStatus("Water purchased!");
            setTimeout(() => { loadWaterShopInfo(); refreshV3StakingRef.current = false; refreshV3Staking(); setWaterStatus(""); }, 2000);
        } catch (err: any) { setWaterStatus("Error: " + (err.message || err)); }
        finally { setWaterLoading(false); }
    }

    const plantsNeedingWater = useMemo(() => v3StakedPlants.filter(id => v3PlantHealths[id] !== undefined && v3PlantHealths[id] < 100), [v3StakedPlants, v3PlantHealths]);
    const totalWaterNeededForSelected = useMemo(() => selectedPlantsToWater.reduce((sum, id) => sum + (v3WaterNeeded[id] || 0), 0), [selectedPlantsToWater, v3WaterNeeded]);

    // Wars functions
    async function loadWarsPlayerStats() {
        if (!userAddress) return;
        try {
            const battlesContract = new ethers.Contract(V3_BATTLES_ADDRESS, V3_BATTLES_ABI, readProvider);
            const stats = await battlesContract.getPlayerStats(userAddress);
            setWarsPlayerStats({
                wins: stats.wins.toNumber(),
                losses: stats.losses.toNumber(),
                defWins: stats.defWins.toNumber(),
                defLosses: stats.defLosses.toNumber(),
                rewardsStolen: stats.rewardsStolen,
                rewardsLost: stats.rewardsLost,
                winStreak: stats.winStreak.toNumber(),
                bestStreak: stats.bestStreak.toNumber(),
            });

            // Check cooldown
            const cooldown = await battlesContract.getAttackCooldownRemaining(userAddress);
            setWarsCooldown(cooldown.toNumber());

            // Get search fee
            const fee = await battlesContract.searchFee();
            const feeFormatted = parseFloat(ethers.utils.formatUnits(fee, 18));
            setWarsSearchFee(feeFormatted >= 1000 ? (feeFormatted / 1000).toFixed(0) + "K" : feeFormatted.toFixed(0));

            // Check for active search
            const activeSearch = await battlesContract.getActiveSearch(userAddress);
            if (activeSearch.isValid && activeSearch.target !== ethers.constants.AddressZero) {
                setWarsTarget(activeSearch.target);
                // Load target stats
                const targetStats = await battlesContract.getTargetStats(activeSearch.target);
                setWarsTargetStats({
                    plants: targetStats.plants.toNumber(),
                    lands: targetStats.lands.toNumber(),
                    superLands: targetStats.superLands.toNumber(),
                    avgHealth: targetStats.avgHealth.toNumber(),
                    pendingRewards: targetStats.pendingRewards,
                    battlePower: targetStats.battlePower.toNumber(),
                    hasShield: targetStats.hasShield,
                });
                // Get battle odds
                const odds = await battlesContract.estimateBattleOdds(userAddress, activeSearch.target);
                setWarsOdds({
                    attackerPower: odds.attackerPower.toNumber(),
                    defenderPower: odds.defenderPower.toNumber(),
                    estimatedWinChance: odds.estimatedWinChance.toNumber(),
                });
            }
        } catch (err) {
            console.error("[Wars] Failed to load player stats:", err);
        }
    }

    async function handleWarsSearch() {
        if (warsTransactionInProgress.current) return;
        warsTransactionInProgress.current = true;
        setWarsSearching(true);
        setWarsStatus("Searching for target...");

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            const battlesContract = new ethers.Contract(V3_BATTLES_ADDRESS, V3_BATTLES_ABI, readProvider);

            // Check if raids are enabled
            const raidsEnabled = await battlesContract.raidsEnabled();
            if (!raidsEnabled) {
                setWarsStatus("Raids are not enabled yet!");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            // Get total stakers to find a target
            const v3Contract = new ethers.Contract(V3_STAKING_ADDRESS, V3_STAKING_ABI, readProvider);
            const totalStakers = await v3Contract.getTotalStakers();

            if (totalStakers.toNumber() < 2) {
                setWarsStatus("Not enough players staking yet. Be the first!");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            // Find a valid target (not self, has pending rewards, can be attacked)
            let targetAddress: string | null = null;
            let attempts = 0;
            const maxAttempts = Math.min(totalStakers.toNumber(), 20);
            const currentUserAddress = userAddress!; // Already checked ctx exists above

            while (!targetAddress && attempts < maxAttempts) {
                const randomIndex = Math.floor(Math.random() * totalStakers.toNumber());
                try {
                    const potentialTarget = await v3Contract.getStakerAtIndex(randomIndex);

                    if (potentialTarget.toLowerCase() === currentUserAddress.toLowerCase()) {
                        attempts++;
                        continue;
                    }

                    // Check if target can be attacked
                    const canBeAttacked = await battlesContract.canBeAttacked(potentialTarget);
                    if (!canBeAttacked) {
                        attempts++;
                        continue;
                    }

                    // Check if target has pending rewards
                    const targetPending = await v3Contract.pending(potentialTarget);
                    if (targetPending.gt(0)) {
                        targetAddress = potentialTarget;
                    }
                } catch {
                    attempts++;
                }
                attempts++;
            }

            if (!targetAddress) {
                setWarsStatus("No valid targets found. Try again later!");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsStatus("Target found! Requesting signature...");

            // Get nonce for signature
            const nonce = await battlesContract.getSearchNonce(userAddress);

            // For now, we'll call the backend to get a signature
            // In production, this would call your backend API
            // For testing without backend, we'll show the target directly

            setWarsTarget(targetAddress);

            // Load target stats
            const targetStats = await battlesContract.getTargetStats(targetAddress);
            setWarsTargetStats({
                plants: targetStats.plants.toNumber(),
                lands: targetStats.lands.toNumber(),
                superLands: targetStats.superLands.toNumber(),
                avgHealth: targetStats.avgHealth.toNumber(),
                pendingRewards: targetStats.pendingRewards,
                battlePower: targetStats.battlePower.toNumber(),
                hasShield: targetStats.hasShield,
            });

            // Get battle odds
            const odds = await battlesContract.estimateBattleOdds(userAddress, targetAddress);
            setWarsOdds({
                attackerPower: odds.attackerPower.toNumber(),
                defenderPower: odds.defenderPower.toNumber(),
                estimatedWinChance: odds.estimatedWinChance.toNumber(),
            });

            setWarsStatus("");

        } catch (err: any) {
            console.error("[Wars] Search failed:", err);
            setWarsStatus("Search failed: " + (err.message || err).slice(0, 50));
        } finally {
            setWarsSearching(false);
            warsTransactionInProgress.current = false;
        }
    }

    async function handleWarsAttack() {
        if (warsTransactionInProgress.current || !warsTarget) return;
        warsTransactionInProgress.current = true;
        setWarsAttacking(true);
        setWarsStatus("Attacking...");

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                setWarsAttacking(false);
                warsTransactionInProgress.current = false;
                return;
            }

            // Call attack function
            const tx = await sendContractTx(V3_BATTLES_ADDRESS, v3BattlesInterface.encodeFunctionData("attack", []));
            if (!tx) {
                setWarsStatus("Transaction rejected");
                setWarsAttacking(false);
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsStatus("Waiting for battle result...");

            // Wait for transaction and parse events
            const receipt = await waitForTx(tx, readProvider);

            // Parse BattleResult event
            const battleResultTopic = v3BattlesInterface.getEventTopic("BattleResult");
            let battleResult = null;

            if (receipt && receipt.logs) {
                for (const log of receipt.logs) {
                    if (log.topics[0] === battleResultTopic) {
                        try {
                            const parsed = v3BattlesInterface.parseLog(log);
                            battleResult = {
                                attacker: parsed.args.attacker,
                                defender: parsed.args.defender,
                                won: parsed.args.attackerWon,
                                damageDealt: parsed.args.damageDealt,
                                rewardsTransferred: parsed.args.rewardsTransferred,
                            };
                        } catch {}
                    }
                }
            }

            if (battleResult) {
                setWarsResult(battleResult);
            } else {
                // If we couldn't parse the event, just show success
                setWarsResult({ won: true, rewardsTransferred: ethers.BigNumber.from(0) });
            }

            // Clear target
            setWarsTarget(null);
            setWarsTargetStats(null);
            setWarsOdds(null);
            setWarsStatus("");

            // Reload player stats
            setTimeout(() => loadWarsPlayerStats(), 2000);

        } catch (err: any) {
            console.error("[Wars] Attack failed:", err);
            setWarsStatus("Attack failed: " + (err.message || err).slice(0, 50));
        } finally {
            setWarsAttacking(false);
            warsTransactionInProgress.current = false;
        }
    }

    // Load wars stats when tab is active
    useEffect(() => {
        if (activeTab === "wars" && userAddress) {
            loadWarsPlayerStats();
        }
    }, [activeTab, userAddress]);

    const connected = !!userAddress;


    const handleConnectWallet = async (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (connecting) return;

        console.log("[UI] Connect wallet button pressed");

        try {
            await ensureWallet();
        } catch (err) {
            console.error("[UI] Wallet connection error:", err);
        }
    };

    const toggleId = (id: number, list: number[], setter: (v: number[]) => void) => list.includes(id) ? setter(list.filter((x) => x !== id)) : setter([...list, id]);
    const oldTotalAvailable = oldAvailablePlants.length + oldAvailableLands.length;
    const oldTotalStaked = oldStakedPlants.length + oldStakedLands.length;
    const newTotalAvailable = newAvailablePlants.length + newAvailableLands.length + newAvailableSuperLands.length;
    const newTotalStaked = newStakedPlants.length + newStakedLands.length + newStakedSuperLands.length;




    useEffect(() => {
        if (!connected || !userAddress) return;
        (async () => {
            try {
                const c = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
                const b = await c.balanceOf(userAddress);
                setFcweedBalanceRaw(b);
                const f = parseFloat(ethers.utils.formatUnits(b, 18));
                setFcweedBalance(f >= 1e6 ? (f / 1e6).toFixed(2) + "M" : f >= 1e3 ? (f / 1e3).toFixed(0) + "K" : f.toFixed(0));
            } catch {}
        })();
    }, [connected, userAddress, readProvider]);


    useEffect(() => {
        if (activeTab !== "crates") return;
        setLoadingVault(true);
        (async () => {
            try {
                const vaultContract = new ethers.Contract(CRATE_VAULT_ADDRESS, CRATE_VAULT_ABI, readProvider);


                const [plants, lands, superLands] = await vaultContract.getVaultInventory();
                setVaultNfts({
                    plants: plants.toNumber(),
                    lands: lands.toNumber(),
                    superLands: superLands.toNumber(),
                });


                const [totalOpened, totalBurned, , , , , uniqueUsers] = await vaultContract.getGlobalStats();
                const burnedFormatted = parseFloat(ethers.utils.formatUnits(totalBurned, 18));
                setCrateGlobalStats({
                    totalOpened: totalOpened.toNumber(),
                    totalBurned: burnedFormatted >= 1e6 ? (burnedFormatted / 1e6).toFixed(1) + "M" : burnedFormatted >= 1e3 ? (burnedFormatted / 1e3).toFixed(0) + "K" : burnedFormatted.toFixed(0),
                    uniqueUsers: uniqueUsers.toNumber(),
                });


                const dustEnabled = await vaultContract.dustConversionEnabled();
                setDustConversionEnabled(dustEnabled);


                if (userAddress) {
                    const [dustBalance, cratesOpened, fcweedWon, usdcWon, nftsWon, totalSpent] = await vaultContract.getUserStats(userAddress);
                    setCrateUserStats({
                        opened: cratesOpened.toNumber(),
                        dust: dustBalance.toNumber(),
                        fcweed: parseFloat(ethers.utils.formatUnits(fcweedWon, 18)),
                        usdc: parseFloat(ethers.utils.formatUnits(usdcWon, 6)),
                        nfts: nftsWon.toNumber(),
                        totalSpent: parseFloat(ethers.utils.formatUnits(totalSpent, 18)),
                    });
                }
            } catch (err) {
                console.error("Failed to load crate data:", err);
            } finally {
                setLoadingVault(false);
            }
        })();
    }, [activeTab, readProvider, userAddress]);

    const crateIcon = (t: string) => t === 'DUST' ? '💨' : t === 'FCWEED' ? '🌿' : t === 'USDC' ? '💵' : '🏆';

    const onCrateOpen = async () => {
        if (!connected) {
            await ensureWallet();
            return;
        }
        setCrateError("");


        if (fcweedBalanceRaw.lt(CRATE_COST)) {
            setCrateError("Insufficient FCWEED balance");
            return;
        }

        setCrateConfirmOpen(true);
    };

    const onCrateConfirm = async () => {

        if (crateTransactionInProgress.current) {
            console.log("[Crate] Transaction already in progress, ignoring");
            return;
        }
        crateTransactionInProgress.current = true;

        setCrateConfirmOpen(false);
        setCrateLoading(true);
        setCrateError("");
        setCrateStatus("");
        setCrateResultIdx(null);
        setCrateResultData(null);
        setCrateReelOpen(false);
        setCrateShowWin(false);
        setCrateSpinning(false);


        const timeoutId = setTimeout(() => {
            console.error("[Crate] Operation timed out after 120 seconds");
            setCrateLoading(false);
            setCrateError("Transaction timed out. Please refresh and try again.");
            setCrateStatus("");
            crateTransactionInProgress.current = false;
        }, 120000);

        try {
            setCrateStatus("Connecting wallet...");
            const ctx = await ensureWallet();
            if (!ctx) {
                clearTimeout(timeoutId);
                crateTransactionInProgress.current = false;
                setCrateLoading(false);
                setCrateError("Wallet connection failed");
                setCrateStatus("");
                return;
            }

            const vaultInterface = new ethers.utils.Interface(CRATE_VAULT_ABI);


            const isFarcasterWallet = ctx.isMini || usingMiniApp;
            const farcasterProvider = miniAppEthProvider;

            console.log("[Crate] Wallet context:", {
                isMini: ctx.isMini,
                usingMiniApp,
                hasFarcasterProvider: !!farcasterProvider,
                userAddress: ctx.userAddress
            });


            setCrateStatus("Checking ETH for gas...");


            const currentBalance = await readProvider.getBalance(ctx.userAddress);
            console.log("[Crate] ETH balance:", ethers.utils.formatEther(currentBalance));

            if (currentBalance.lt(ethers.utils.parseEther("0.0001"))) {
                clearTimeout(timeoutId);
                crateTransactionInProgress.current = false;
                setCrateError("Need ETH for gas fees");
                setCrateLoading(false);
                setCrateStatus("");
                return;
            }


            setCrateStatus("Checking FCWEED balance...");
            const fcweedContract = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            const tokenBalance = await fcweedContract.balanceOf(ctx.userAddress);
            console.log("[Crate] FCWEED balance:", ethers.utils.formatUnits(tokenBalance, 18));

            if (tokenBalance.lt(CRATE_COST)) {
                clearTimeout(timeoutId);
                crateTransactionInProgress.current = false;
                setCrateError("Insufficient FCWEED balance");
                setCrateLoading(false);
                setCrateStatus("");
                return;
            }


            setCrateStatus("Checking approval...");
            const allowance = await fcweedContract.allowance(ctx.userAddress, CRATE_VAULT_ADDRESS);
            console.log("[Crate] Current allowance:", ethers.utils.formatUnits(allowance, 18));

            if (allowance.lt(CRATE_COST)) {
                setCrateStatus("Approving FCWEED...");

                let approveTx: ethers.providers.TransactionResponse | null = null;

                if (isFarcasterWallet && farcasterProvider) {

                    console.log("[Crate] Using Farcaster wallet for approval");
                    approveTx = await sendWalletCalls(
                        ctx.userAddress,
                        FCWEED_ADDRESS,
                        erc20Interface.encodeFunctionData("approve", [CRATE_VAULT_ADDRESS, ethers.constants.MaxUint256])
                    );
                } else {

                    console.log("[Crate] Using external wallet for approval");
                    try {
                        const fcweedWrite = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, ctx.signer);
                        approveTx = await fcweedWrite.approve(CRATE_VAULT_ADDRESS, ethers.constants.MaxUint256);
                    } catch (approveErr: any) {
                        clearTimeout(timeoutId);
                        crateTransactionInProgress.current = false;
                        console.error("[Crate] Approval error:", approveErr);
                        if (approveErr?.code === 4001 || approveErr?.code === "ACTION_REJECTED") {
                            setCrateError("Approval rejected");
                        } else {
                            setCrateError("Approval failed: " + (approveErr?.reason || approveErr?.message || "Unknown error").slice(0, 50));
                        }
                        setCrateLoading(false);
                        setCrateStatus("");
                        return;
                    }
                }

                if (!approveTx) {
                    clearTimeout(timeoutId);
                    crateTransactionInProgress.current = false;
                    setCrateError("Approval rejected");
                    setCrateLoading(false);
                    setCrateStatus("");
                    return;
                }


                setCrateStatus("Confirming approval...");
                console.log("[Crate] Waiting for approval tx:", approveTx.hash);


                if (approveTx.hash) {
                    for (let i = 0; i < 30; i++) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        try {
                            const approvalReceipt = await readProvider.getTransactionReceipt(approveTx.hash);
                            if (approvalReceipt && approvalReceipt.confirmations > 0) {
                                console.log("[Crate] Approval confirmed:", approvalReceipt.transactionHash);
                                break;
                            }
                        } catch {
                            console.log("[Crate] Polling for approval receipt...", i);
                        }
                    }
                }


                await new Promise(resolve => setTimeout(resolve, 1000));
            }


            setMintStatus("Opening crate...");

            let tx: ethers.providers.TransactionResponse | null = null;



            let blockBeforeTx = 0;
            try {
                blockBeforeTx = await readProvider.getBlockNumber();
                console.log("[Crate] Block before tx:", blockBeforeTx);
            } catch {}


            const openCrateAbi = ["function openCrate() external"];
            const openCrateInterface = new ethers.utils.Interface(openCrateAbi);
            const openCrateData = openCrateInterface.encodeFunctionData("openCrate", []);

            console.log("[Crate] openCrate encoded data:", openCrateData);
            console.log("[Crate] Target contract:", CRATE_VAULT_ADDRESS);

            setCrateStatus("Confirm in wallet...");

            if (isFarcasterWallet && farcasterProvider) {

                console.log("[Crate] Using Farcaster wallet for openCrate");
                tx = await sendWalletCalls(
                    ctx.userAddress,
                    CRATE_VAULT_ADDRESS,
                    openCrateData,
                    "0x1E8480"
                );
            } else {

                console.log("[Crate] Using external wallet for openCrate");
                try {

                    tx = await ctx.signer.sendTransaction({
                        to: CRATE_VAULT_ADDRESS,
                        data: openCrateData,
                        value: 0,
                        gasLimit: 2000000,
                    });
                } catch (openErr: any) {
                    clearTimeout(timeoutId);
                    crateTransactionInProgress.current = false;
                    console.error("[Crate] OpenCrate error:", openErr);
                    if (openErr?.code === 4001 || openErr?.code === "ACTION_REJECTED") {
                        setCrateError("Transaction rejected");
                    } else if (openErr?.reason?.includes("Insufficient") || openErr?.message?.includes("Insufficient")) {
                        setCrateError("Insufficient FCWEED balance");
                    } else {
                        setCrateError("Transaction failed: " + (openErr?.reason || openErr?.message || "Unknown error").slice(0, 50));
                    }
                    setCrateLoading(false);
                    setCrateStatus("");
                    return;
                }
            }

            if (!tx) {
                clearTimeout(timeoutId);
                crateTransactionInProgress.current = false;
                setCrateError("Transaction rejected");
                setCrateLoading(false);
                setCrateStatus("");
                return;
            }

            setCrateStatus("Rolling...");

            const s = [...CRATE_REWARDS].sort(() => Math.random() - 0.5);
            const spinItems: CrateReward[] = [];
            for (let i = 0; i < 20; i++) spinItems.push(...s);
            setCrateReelItems(spinItems);
            setCrateWinItem(null);
            setCrateReelOpen(true);
            setCrateLoading(false);
            setCrateReelPhase('spinning');
            setTimeout(() => setCrateSpinning(true), 100);



            let receipt: ethers.providers.TransactionReceipt | null = null;

            const txHash = tx?.hash;
            const isValidHash = txHash && txHash !== "0x" + "0".repeat(64) && txHash.startsWith("0x");

            console.log("[Crate] Transaction hash:", txHash, "isValid:", isValidHash);


            const eventInterface = new ethers.utils.Interface([
                "event CrateOpened(address indexed player, uint256 indexed rewardIndex, string rewardName, uint8 category, uint256 amount, uint256 nftTokenId, uint256 timestamp)"
            ]);
            const crateOpenedTopic = eventInterface.getEventTopic("CrateOpened");
            const userTopic = ethers.utils.hexZeroPad(ctx.userAddress.toLowerCase(), 32);

            if (isValidHash) {
                console.log("[Crate] Waiting for tx:", txHash);


                let found = false;
                for (let i = 0; i < 5; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    try {
                        receipt = await readProvider.getTransactionReceipt(txHash);
                        if (receipt) {
                            console.log("[Crate] Got receipt with", receipt.logs?.length, "logs, status:", receipt.status);
                            processedCrateTxHashes.current.add(txHash);
                            found = true;
                            break;
                        }
                    } catch (err) {
                        console.log("[Crate] Polling for receipt...", i);
                    }
                }


                if (!found) {
                    console.log("[Crate] Transaction not found after 10s, checking if it was submitted...");
                    setCrateStatus("Checking transaction...");


                    for (let i = 0; i < 10; i++) {
                        await new Promise(resolve => setTimeout(resolve, 2000));


                        try {
                            receipt = await readProvider.getTransactionReceipt(txHash);
                            if (receipt) {
                                console.log("[Crate] Found receipt on extended search");
                                processedCrateTxHashes.current.add(txHash);
                                found = true;
                                break;
                            }
                        } catch {}


                        try {
                            const currentBlock = await readProvider.getBlockNumber();
                            const logs = await readProvider.getLogs({
                                address: CRATE_VAULT_ADDRESS,
                                topics: [crateOpenedTopic, userTopic],
                                fromBlock: blockBeforeTx > 0 ? blockBeforeTx : currentBlock - 15,
                                toBlock: currentBlock,
                            });

                            if (logs.length > 0) {

                                for (let j = logs.length - 1; j >= 0; j--) {
                                    const log = logs[j];
                                    if (!processedCrateTxHashes.current.has(log.transactionHash)) {
                                        console.log("[Crate] Found new event via fallback search:", log.transactionHash);
                                        processedCrateTxHashes.current.add(log.transactionHash);
                                        receipt = { logs: [log], confirmations: 1, transactionHash: log.transactionHash } as any;
                                        found = true;
                                        break;
                                    }
                                }
                                if (found) break;
                            }
                        } catch {}
                    }

                    if (!found) {
                        clearTimeout(timeoutId);
                        crateTransactionInProgress.current = false;
                        setCrateError("Transaction failed or not submitted. Please try again.");
                        setCrateLoading(false);
                        setCrateStatus("");
                        return;
                    }
                }
            } else {


                console.log("[Crate] No valid tx hash, searching for recent CrateOpened events...");
                setCrateStatus("Rolling Prizes...");


                const searchFromBlock = blockBeforeTx > 0 ? blockBeforeTx : 0;


                let found = false;
                for (let i = 0; i < 5; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    try {
                        const currentBlock = await readProvider.getBlockNumber();
                        const fromBlock = searchFromBlock > 0 ? searchFromBlock : currentBlock - 15;

                        console.log("[Crate] Searching blocks", fromBlock, "to", currentBlock);

                        const logs = await readProvider.getLogs({
                            address: CRATE_VAULT_ADDRESS,
                            topics: [crateOpenedTopic, userTopic],
                            fromBlock: fromBlock,
                            toBlock: currentBlock,
                        });

                        if (logs.length > 0) {

                            for (let j = logs.length - 1; j >= 0; j--) {
                                const log = logs[j];
                                if (!processedCrateTxHashes.current.has(log.transactionHash)) {
                                    console.log("[Crate] Found new CrateOpened event:", log.transactionHash);
                                    processedCrateTxHashes.current.add(log.transactionHash);
                                    receipt = { logs: [log], confirmations: 1, transactionHash: log.transactionHash } as any;
                                    found = true;
                                    break;
                                } else {
                                    console.log("[Crate] Skipping already processed tx:", log.transactionHash);
                                }
                            }
                            if (found) break;
                        }
                        console.log("[Crate] Searching for event...", i);
                    } catch (err) {
                        console.log("[Crate] Event search error:", err);
                    }
                }


                if (!found) {
                    setCrateStatus("Checking transaction...");


                    for (let i = 0; i < 10; i++) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                        try {
                            const currentBlock = await readProvider.getBlockNumber();
                            const fromBlock = searchFromBlock > 0 ? searchFromBlock : currentBlock - 20;

                            const logs = await readProvider.getLogs({
                                address: CRATE_VAULT_ADDRESS,
                                topics: [crateOpenedTopic, userTopic],
                                fromBlock: fromBlock,
                                toBlock: currentBlock,
                            });

                            if (logs.length > 0) {

                                for (let j = logs.length - 1; j >= 0; j--) {
                                    const log = logs[j];
                                    if (!processedCrateTxHashes.current.has(log.transactionHash)) {
                                        console.log("[Crate] Found new CrateOpened event on extended search:", log.transactionHash);
                                        processedCrateTxHashes.current.add(log.transactionHash);
                                        receipt = { logs: [log], confirmations: 1, transactionHash: log.transactionHash } as any;
                                        found = true;
                                        break;
                                    }
                                }
                                if (found) break;
                            }
                        } catch {}
                    }

                    if (!found) {
                        clearTimeout(timeoutId);
                        crateTransactionInProgress.current = false;
                        setCrateError("Transaction failed or not confirmed. Please try again.");
                        setCrateLoading(false);
                        setCrateStatus("");
                        return;
                    }
                }
            }


            let rewardIndex = 0;
            let rewardName = "Dust";
            let amount = ethers.BigNumber.from(100);
            let nftTokenId = 0;
            let category = 2;
            let eventFound = false;

            console.log("[Crate] Receipt:", receipt);
            console.log("[Crate] Logs count:", receipt?.logs?.length);

            if (receipt && receipt.logs && receipt.logs.length > 0) {
                for (const log of receipt.logs) {
                    console.log("[Crate] Processing log:", log.address, log.topics?.[0]);
                    try {

                        if (log.address.toLowerCase() === CRATE_VAULT_ADDRESS.toLowerCase()) {
                            const parsed = eventInterface.parseLog(log);
                            console.log("[Crate] Parsed event:", parsed);
                            if (parsed.name === "CrateOpened") {
                                rewardIndex = parsed.args.rewardIndex.toNumber();
                                rewardName = parsed.args.rewardName;
                                amount = parsed.args.amount;
                                nftTokenId = parsed.args.nftTokenId.toNumber();
                                category = parsed.args.category;
                                eventFound = true;
                                console.log("[Crate] Found CrateOpened event:", { rewardIndex, rewardName, amount: amount.toString(), nftTokenId, category });
                                break;
                            }
                        }
                    } catch (parseErr) {

                        console.log("[Crate] Could not parse log:", parseErr);
                    }
                }
            }


            if (!eventFound) {
                console.error("[Crate] Could not find CrateOpened event in receipt!");

                if (tx.hash) {
                    await new Promise(resolve => setTimeout(resolve, 3000));
                    try {
                        const retryReceipt = await readProvider.getTransactionReceipt(tx.hash);
                        if (retryReceipt && retryReceipt.logs) {
                            for (const log of retryReceipt.logs) {
                                try {
                                    if (log.address.toLowerCase() === CRATE_VAULT_ADDRESS.toLowerCase()) {
                                        const parsed = eventInterface.parseLog(log);
                                        if (parsed.name === "CrateOpened") {
                                            rewardIndex = parsed.args.rewardIndex.toNumber();
                                            rewardName = parsed.args.rewardName;
                                            amount = parsed.args.amount;
                                            nftTokenId = parsed.args.nftTokenId.toNumber();
                                            category = parsed.args.category;
                                            eventFound = true;
                                            console.log("[Crate] Found CrateOpened event on retry:", { rewardIndex, rewardName, amount: amount.toString(), nftTokenId, category });
                                            break;
                                        }
                                    }
                                } catch {}
                            }
                        }
                    } catch {}
                }
            }

            if (!eventFound) {
                clearTimeout(timeoutId);
                crateTransactionInProgress.current = false;
                setCrateError("Could not determine reward. Check your wallet for the transaction.");
                setCrateLoading(false);
                setCrateStatus("");
                return;
            }

            console.log("[Crate] Final reward:", { rewardIndex, rewardName, amount: amount.toString() });

            clearTimeout(timeoutId);
            setCrateResultIdx(rewardIndex);
            setCrateResultData({ rewardIndex, rewardName, amount, nftTokenId });

            let winToken = 'DUST';
            let winColor = '#6B7280';
            let winAmount = '100';
            let winIsNFT = false;
            let winIsJackpot = false;

            if (category === 0) {
                winToken = 'FCWEED';
                const fcweedVal = parseFloat(ethers.utils.formatUnits(amount, 18));
                if (fcweedVal >= 5000000) { winIsJackpot = true; winColor = '#FFD700'; winAmount = '5M'; }
                else if (fcweedVal >= 1000000) { winColor = '#F59E0B'; winAmount = '1M'; }
                else if (fcweedVal >= 500000) { winColor = '#A855F7'; winAmount = '500K'; }
                else if (fcweedVal >= 300000) { winColor = '#3B82F6'; winAmount = '300K'; }
                else if (fcweedVal >= 150000) { winColor = '#4A9B7F'; winAmount = '150K'; }
                else { winColor = '#8B9A6B'; winAmount = '50K'; }
            } else if (category === 1) {
                winToken = 'USDC';
                const usdcVal = parseFloat(ethers.utils.formatUnits(amount, 6));
                if (usdcVal >= 250) { winIsJackpot = true; winColor = '#00D4FF'; winAmount = '$250'; }
                else if (usdcVal >= 100) { winColor = '#2775CA'; winAmount = '$100'; }
                else if (usdcVal >= 50) { winColor = '#2775CA'; winAmount = '$50'; }
                else if (usdcVal >= 15) { winColor = '#2775CA'; winAmount = '$15'; }
                else { winColor = '#2775CA'; winAmount = '$5'; }
            } else if (category === 2) {
                winToken = 'DUST';
                const dustVal = amount.toNumber();
                if (dustVal >= 1000) { winColor = '#E5E7EB'; winAmount = '1,000'; }
                else if (dustVal >= 500) { winColor = '#D1D5DB'; winAmount = '500'; }
                else if (dustVal >= 250) { winColor = '#9CA3AF'; winAmount = '250'; }
                else { winColor = '#6B7280'; winAmount = '100'; }
            } else if (category === 3) {
                winToken = 'NFT'; winIsNFT = true; winColor = '#228B22'; winAmount = '1x';
            } else if (category === 4) {
                winToken = 'NFT'; winIsNFT = true; winColor = '#8B4513'; winAmount = '1x';
            } else if (category === 5) {
                winToken = 'NFT'; winIsNFT = true; winIsJackpot = true; winColor = '#FF6B35'; winAmount = '1x';
            }

            const winningItem: CrateReward = { id: 999, name: rewardName, amount: winAmount, token: winToken, color: winColor, isNFT: winIsNFT, isJackpot: winIsJackpot };
            setCrateWinItem(winningItem);
            setCrateReelPhase('landing');
            setCrateStatus("");
            crateTransactionInProgress.current = false;



        } catch (err: any) {
            clearTimeout(timeoutId);
            crateTransactionInProgress.current = false;
            console.error("Crate open failed:", err);
            const errMsg = err?.message || err?.reason || String(err);
            if (errMsg.includes("rejected") || errMsg.includes("denied") || err?.code === 4001) {
                setCrateError("Transaction rejected");
            } else if (errMsg.includes("insufficient") || errMsg.includes("Insufficient")) {
                setCrateError("Insufficient FCWEED balance");
            } else {
                setCrateError(errMsg.slice(0, 60));
            }
            setCrateLoading(false);
            setCrateStatus("");
        }
    };

    const onCrateSpinDone = async () => {
        if (crateWinItem && crateResultData) {
            setCrateUserStats(p => {
                const u = { ...p, opened: p.opened + 1 };
                if (crateWinItem.token === 'DUST') u.dust += crateResultData.amount.toNumber();
                else if (crateWinItem.token === 'FCWEED') u.fcweed += parseFloat(ethers.utils.formatUnits(crateResultData.amount, 18));
                else if (crateWinItem.token === 'USDC') u.usdc += parseFloat(ethers.utils.formatUnits(crateResultData.amount, 6));
                else if (crateWinItem.isNFT) u.nfts += 1;
                return u;
            });
        }

        if (userAddress) {
            try {
                const c = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
                const b = await c.balanceOf(userAddress);
                setFcweedBalanceRaw(b);
                const f = parseFloat(ethers.utils.formatUnits(b, 18));
                setFcweedBalance(f >= 1e6 ? (f / 1e6).toFixed(2) + "M" : f >= 1e3 ? (f / 1e3).toFixed(0) + "K" : f.toFixed(0));
            } catch (err) {
                console.error("[Crate] Failed to refresh balance:", err);
            }
        }
    };

    const onCrateClose = () => {
        setCrateShowWin(false);
        setCrateReelOpen(false);
        setCrateResultIdx(null);
        setCrateResultData(null);
        setCrateWinItem(null);
        setCrateReelPhase('idle');
    };

    useEffect(() => {
        if (!crateReelRef.current) return;

        if (crateReelPhase === 'spinning' && crateSpinning) {
            const itemWidth = 130;
            const totalWidth = crateReelItems.length * itemWidth;
            let pos = 0;

            crateReelRef.current.style.transition = 'none';
            crateReelRef.current.style.transform = 'translateX(0)';

            if (crateSpinInterval.current) clearInterval(crateSpinInterval.current);

            crateSpinInterval.current = setInterval(() => {
                if (!crateReelRef.current) return;
                pos += 15;
                if (pos >= totalWidth / 2) pos = 0;
                crateReelRef.current.style.transform = `translateX(-${pos}px)`;
            }, 16);
        }

        if (crateReelPhase === 'landing' && crateWinItem) {
            if (crateSpinInterval.current) {
                clearInterval(crateSpinInterval.current);
                crateSpinInterval.current = null;
            }

            const newItems = [...CRATE_REWARDS].sort(() => Math.random() - 0.5);
            const landingItems: CrateReward[] = [];
            for (let i = 0; i < 4; i++) landingItems.push(...newItems);
            landingItems.push(crateWinItem);
            setCrateReelItems(landingItems);

            setTimeout(() => {
                if (!crateReelRef.current) return;
                const container = crateReelRef.current.parentElement;
                if (!container) return;
                const containerWidth = container.offsetWidth;
                const itemWidth = 130;
                const lastItemIndex = landingItems.length - 1;
                const lastItemCenter = lastItemIndex * itemWidth + (itemWidth / 2);
                const containerCenter = containerWidth / 2;
                const final = lastItemCenter - containerCenter;

                crateReelRef.current.style.transition = 'none';
                crateReelRef.current.style.transform = 'translateX(0)';

                setTimeout(() => {
                    if (crateReelRef.current) {
                        crateReelRef.current.style.transition = 'transform 3s cubic-bezier(0.15, 0.85, 0.25, 1)';
                        crateReelRef.current.style.transform = `translateX(-${final}px)`;
                    }
                }, 50);

                setTimeout(() => {
                    setCrateSpinning(false);
                    setCrateReelPhase('idle');
                    setTimeout(() => setCrateShowWin(true), 300);
                }, 3100);
            }, 50);
        }

        return () => {
            if (crateSpinInterval.current) {
                clearInterval(crateSpinInterval.current);
                crateSpinInterval.current = null;
            }
        };
    }, [crateReelPhase, crateSpinning, crateWinItem]);

    const crateWon = crateWinItem;
    const dustRewards = CRATE_REWARDS.filter(r => r.token === 'DUST');
    const fcweedRewards = CRATE_REWARDS.filter(r => r.token === 'FCWEED');
    const usdcRewards = CRATE_REWARDS.filter(r => r.token === 'USDC');
    const nftRewards = CRATE_REWARDS.filter(r => r.isNFT);

    useEffect(() => {
        if (crateShowWin && crateWinItem) {
            onCrateSpinDone();
        }
    }, [crateShowWin]);



    const NftCard = ({ id, img, name, checked, onChange, health }: { id: number; img: string; name: string; checked: boolean; onChange: () => void; health?: number }) => (
        <label style={{ minWidth: 80, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", position: "relative" }}>
            <input type="checkbox" checked={checked} onChange={onChange} style={{ marginBottom: 3 }} />
            <div style={{ padding: 2, borderRadius: 8, border: checked ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.18)", background: "#050814", position: "relative" }}>
                <img src={img} alt={name + " #" + id} style={{ width: 55, height: 55, borderRadius: 6, objectFit: "contain" }} loading="lazy" />
                {health !== undefined && (
                    <div style={{ position: "absolute", bottom: 2, left: 2, right: 2, height: 4, background: "rgba(0,0,0,0.6)", borderRadius: 2 }}>
                        <div style={{ height: "100%", width: `${health}%`, background: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444", borderRadius: 2, transition: "width 0.3s" }} />
                    </div>
                )}
            </div>
            <div style={{ marginTop: 2, fontSize: 9, fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: 8, opacity: 0.7 }}>#{id}</div>
            {health !== undefined && <div style={{ fontSize: 7, color: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444" }}>{health}%</div>}
        </label>
    );


    const ConnectWalletButton = () => (
        <button
            type="button"
            disabled={connecting}
            onClick={handleConnectWallet}
            onTouchEnd={handleConnectWallet}
            style={{
                padding: "8px 16px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.25)",
                background: connected ? "rgba(0,200,130,0.18)" : "rgba(39,95,255,0.55)",
                fontSize: 11,
                fontWeight: 500,
                color: "#fff",
                cursor: connecting ? "wait" : "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                userSelect: "none",
                minHeight: 36,
                opacity: connecting ? 0.7 : 1,
            }}
        >
            {connecting ? "Connecting..." : shortAddr(userAddress)}
        </button>
    );

    return (
        <div className={styles.page} style={{ paddingBottom: 70 }} onPointerDown={() => { if (!isPlaying && !manualPause && audioRef.current) audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {}); }}>
            <header className={styles.headerWrapper}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
                    <div className={styles.brand}><span className={styles.liveDot} /><span className={styles.brandText}>FCWEED</span></div>
                    <ConnectWalletButton />
                </div>
                <div className={styles.headerRight}>
                    <div className={styles.radioPill}>
                        <span className={styles.radioLabel}>Farcaster Radio</span>
                        <div className={styles.radioTitleWrap}><span className={styles.radioTitleInner}>{currentTrackMeta.title}</span></div>
                        <button type="button" className={styles.iconButtonSmall} onClick={handlePrevTrack}>‹</button>
                        <button type="button" className={styles.iconButtonSmall} onClick={handlePlayPause}>{isPlaying ? "❚❚" : "▶"}</button>
                        <button type="button" className={styles.iconButtonSmall} onClick={handleNextTrack}>›</button>
                    </div>
                    <audio ref={audioRef} src={currentTrackMeta.src} onEnded={handleNextTrack} autoPlay style={{ display: "none" }} />
                </div>
            </header>

            <main className={styles.main}>
                {activeTab === "info" && (
                    <>
                        <section style={{ textAlign: "center", padding: "10px 0", display: "flex", justifyContent: "center" }}>
                            <Image src={GIFS[gifIndex]} alt="FCWEED" width={280} height={100} style={{ borderRadius: 14, objectFit: "cover" }} />
                        </section>
                        <section className={styles.infoCard}>
                            <h1 style={{ fontSize: 20, margin: "0 0 6px", color: "#7cb3ff" }}>FCWEED Farming on Base</h1>
                            <p style={{ fontSize: 12, color: "#b5c3f2", margin: 0, lineHeight: 1.5 }}>
                                Stake-to-earn Farming — Powered by FCWEED on Base<br />
                                Collect <b>Land</b> &amp; <b>Plant NFTs</b>, stake them to grow yields, and boost rewards with expansion.<br />
                    Every Land NFT unlocks more Plant slots and increases your <span style={{ color: "#38e0a3" }}>Land Boost</span> for higher payouts.
                            </p>
                        </section>
                        <section className={styles.infoCard}>
                            <h2 className={styles.heading}>Crime Ladder — Top 10 Farmers</h2>
                    {/* <CrimeLadder
                     * connected={!!userAddress}
                     * loading={ladder.loading}
                     * rows={ladder.rows.slice(0, 10)}
                     * farmerCount={ladder.farmerCount}
                     * walletRank={ladder.walletRank}
                     * walletRow={ladder.walletRow}
                     * tokenSymbol={TOKEN_SYMBOL}
                     * onRefresh={ladder.refresh}
                     * />
                     *  */}
                            {!connected && (
                                <div style={{ fontSize: 11, margin: "4px 0 8px", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(5,8,20,0.8)" }}>
                                    Connect wallet to see your rank
                                </div>
                            )}
                        </section>
                        <section className={styles.infoCard}>
                            <h2 className={styles.heading}>How it Works</h2>
                            <ul className={styles.bulletList}>
                                <li>Connect your wallet on Base to begin.</li>
                                <li>Mint <b>Plant Bud NFTs</b> and stake them for yield.</li>
                                <li>Mint <b>Land NFTs</b> (all Lands are equal rarity).</li>
                                <li>Each Land allows you to stake <b style={{ color: "#38e0a3" }}>+3 extra Plant Buds</b>.</li>
                                <li>Each Land grants a <b style={{ color: "#38e0a3" }}>+2.5% token boost</b> to all yield earned.</li>
                                <li>The more Land you stack — the stronger your multiplier will be.</li>
                                <li style={{ color: "#fbbf24" }}><b>NEW: Super Land</b> — Burn 1 Land + 2M FCWEED to upgrade!</li>
                                <li>Each Super Land grants <b style={{ color: "#fbbf24" }}>+12% token boost</b>.</li>
                                <li style={{ color: "#fbbf24" }}><b>NEW: Open Crates</b> for Prizes by spending <b>200,000 $FCWEED</b>!</li>
                                <li style={{ color: "#ef4444", marginTop: 8 }}><b>NEW: Cartel Wars</b> — Battle other farmers!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Plants have <b>Health</b> that decays 10% daily</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Low health = lower earnings. 0% health = no earnings!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Attack other farmers to steal 10-20% of pending rewards</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Losing battles damages your plants 10-15%</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Must have 100% health to unstake plants</li>
                                <li style={{ color: "#10b981", marginTop: 8 }}><b>NEW: Item Shop</b> — Buy Water!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Water</b> restores plant health to 100%</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Water Shop open <b>12PM-6PM EST</b> daily with limited supply</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• More decay = more water needed (neglect is expensive!)</li>
                            </ul>
                            <h2 className={styles.heading}>Use of Funds</h2>
                            <ul className={styles.bulletList}>
                                <li><b>50% of all mint funds</b> are routed to periodic <b>buyback and burns</b> of $FCWEED.</li>
                                <li>$FCWEED has a <b>3% buy &amp; sell tax</b>:
                    <ul style={{ marginTop: 4, marginLeft: 16 }}>
                        <li><b>2%</b> goes directly into automated <b>buyback &amp; burn</b>.</li>
                        <li><b>1%</b> is set aside for <b>top farmer rewards</b> in USDC, paid out based on the Crime Ladder leaderboard.</li>
                    </ul>
                                </li>
                                <li>The more you farm and climb the ladder, the larger your share of <b>USDC rewards</b> from the tax pool.</li>
                            </ul>
                        </section>
                        <section className={styles.infoCard}>
                            <h2 className={styles.heading}>Coming Soon</h2>
                            <ul className={styles.bulletList}>
                                <li style={{ color: "#fbbf24" }}>🎁 Referrals — Earn rewards for inviting friends</li>
                                <li style={{ color: "#fbbf24" }}>🛒 More Shop Items — Boosts, shields, and more</li>
                            </ul>
                        </section>
                    </>
                )}

        {activeTab === "mint" && (
            <section className={styles.infoCard} style={{ textAlign: "center", padding: 20 }}>
                <h2 style={{ fontSize: 18, margin: "0 0 12px", color: "#7cb3ff" }}>Mint NFTs</h2>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                    <Image src={GIFS[gifIndex]} alt="FCWEED" width={260} height={95} style={{ borderRadius: 12, objectFit: "cover" }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <button type="button" className={styles.btnPrimary} onClick={handleMintPlant} disabled={connecting || actionLoading} style={{ width: "100%", padding: 14 }}>🌱 Mint Plant (49.99 USDC)</button>
                    <button type="button" className={styles.btnPrimary} onClick={handleMintLand} disabled={connecting || actionLoading} style={{ width: "100%", padding: 14 }}>🏠 Mint Land (199.99 USDC)</button>
                    <button type="button" className={styles.btnPrimary} onClick={() => setUpgradeModalOpen(true)} disabled={connecting || actionLoading} style={{ width: "100%", padding: 14, background: "linear-gradient(to right, #f59e0b, #fbbf24)", color: "#000" }}>🔥 Upgrade to Super Land</button>
                </div>
                {mintStatus && <p style={{ marginTop: 12, fontSize: 11, opacity: 0.9 }}>{mintStatus}</p>}
                <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
                    <button type="button" className={styles.btnSecondary} onClick={() => window.open("https://opensea.io/collection/x420-plants", "_blank")} style={{ fontSize: 11, padding: "8px 12px" }}>Trade Plant</button>
                    <button type="button" className={styles.btnSecondary} onClick={() => window.open("https://opensea.io/collection/x420-land-763750895", "_blank")} style={{ fontSize: 11, padding: "8px 12px" }}>Trade Land</button>
                    <button type="button" className={styles.btnSecondary} onClick={() => window.open("https://dexscreener.com/base/0xa1a1b6b489ceb413999ccce73415d4fa92e826a1", "_blank")} style={{ fontSize: 11, padding: "8px 12px" }}>Trade $FCWEED</button>
                </div>
            </section>
        )}

                {activeTab === "stake" && (
                    <section className={styles.infoCard} style={{ textAlign: "center", padding: 20 }}>
                        <h2 style={{ fontSize: 18, margin: "0 0 12px", color: "#7cb3ff" }}>Staking</h2>
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                            <Image src={GIFS[gifIndex]} alt="FCWEED" width={260} height={95} style={{ borderRadius: 12, objectFit: "cover" }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <button type="button" className={styles.btnPrimary} onClick={() => setV3StakingOpen(true)} style={{ width: "100%", padding: 14, background: "linear-gradient(to right, #059669, #10b981)" }}>🌿 Staking V3 (STAKE)</button>
                            <button type="button" className={styles.btnPrimary} onClick={() => setNewStakingOpen(true)} style={{ width: "100%", padding: 14, background: "linear-gradient(to right, #6b7280, #9ca3af)" }}>📦 Staking V2 (Unstake)</button>
                            <button type="button" className={styles.btnPrimary} onClick={() => setOldStakingOpen(true)} style={{ width: "100%", padding: 14, background: "linear-gradient(to right, #4b5563, #6b7280)" }}>📦 Staking V1 (Unstake)</button>
                        </div>
                        <div style={{ marginTop: 12, padding: 10, background: "rgba(16,185,129,0.1)", borderRadius: 10, border: "1px solid rgba(16,185,129,0.3)" }}>
                            <p style={{ fontSize: 11, color: "#10b981", margin: 0, fontWeight: 600 }}>🌿 Staking V3 is LIVE with Plant Health & Water!</p>
                            <p style={{ fontSize: 10, color: "#fbbf24", margin: "6px 0 0", fontWeight: 500 }}>⚠️ Unstake & Claim from V1/V2, then stake on V3</p>
                            <p style={{ fontSize: 10, color: "#9ca3af", margin: "6px 0 0" }}>V3 features: Plant Health, Water Shop, Cartel Wars, Item Shop boosts and more!</p>
                        </div>
                    </section>
                )}

                {activeTab === "crates" && (
                    <>
                        <style>{`
                            @keyframes crateFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
                            @keyframes glowPulse{0%,100%{box-shadow:0 0 20px rgba(16,185,129,0.3)}50%{box-shadow:0 0 40px rgba(16,185,129,0.6)}}
                            @keyframes popIn{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}
                            @keyframes jackpot{0%,100%{box-shadow:0 0 30px rgba(255,215,0,0.5)}50%{box-shadow:0 0 60px rgba(255,215,0,0.9)}}
                            .c-float{animation:crateFloat 3s ease-in-out infinite}
                            .c-glow{animation:glowPulse 2s ease-in-out infinite}
                            .c-pop{animation:popIn 0.3s ease-out}
                            .c-jack{animation:jackpot 1s ease-in-out infinite}
                        `}</style>

                        <section className={styles.infoCard} style={{ padding: '14px 10px' }}>
                            <h2 style={{ fontSize: 15, margin: '0 0 10px', color: '#7cb3ff', textAlign: 'center' }}>Open Crates for Prizes</h2>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 10 }}>
                                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 9, textAlign: 'center' }}>
                                    <div style={{ color: '#f87171', fontWeight: 700 }}>{crateGlobalStats.totalBurned}</div>
                                    <div style={{ color: '#6b7280', fontSize: 7 }}>Global $FCWEED Spent</div>
                                </div>
                            </div>

                            {connected && (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                                    <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 10 }}>
                                        <span style={{ color: '#9ca3af' }}>Bal: </span><span style={{ color: '#34d399', fontWeight: 600 }}>{fcweedBalance}</span>
                                    </div>
                                    <div style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 10 }}>
                                        <span style={{ color: '#9ca3af' }}>Dust: </span><span style={{ color: '#d1d5db', fontWeight: 600 }}>{crateUserStats.dust.toLocaleString()}</span>
                                    </div>
                                    <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '4px 10px', fontSize: 10 }}>
                                        <span style={{ color: '#9ca3af' }}>Opened: </span><span style={{ color: '#fbbf24', fontWeight: 600 }}>{crateUserStats.opened}</span>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4, marginBottom: 12, fontSize: 9 }}>
                                <div>
                                    <div style={{ color: '#6b7280', marginBottom: 2, fontWeight: 700, fontSize: 8, textTransform: 'uppercase' }}>Dust</div>
                                    {dustRewards.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', background: 'rgba(107,114,128,0.1)', borderRadius: 4, marginBottom: 2 }}><span>{crateIcon(r.token)}</span><span style={{ color: '#fff', flex: 1 }}>{r.name}</span><span style={{ color: r.color }}>{r.amount}</span></div>)}
                                </div>
                                <div>
                                    <div style={{ color: '#4ade80', marginBottom: 2, fontWeight: 700, fontSize: 8, textTransform: 'uppercase' }}>$FCWEED</div>
                                    {fcweedRewards.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', background: r.isJackpot ? 'rgba(255,215,0,0.15)' : 'rgba(74,222,128,0.1)', borderRadius: 4, marginBottom: 2, border: r.isJackpot ? '1px solid rgba(255,215,0,0.3)' : 'none' }}><span>{r.isJackpot ? '🎰' : crateIcon(r.token)}</span><span style={{ color: '#fff', flex: 1 }}>{r.name}</span><span style={{ color: r.color, fontWeight: r.isJackpot ? 700 : 400 }}>{r.amount}</span></div>)}
                                </div>
                                <div>
                                    <div style={{ color: '#2775CA', marginBottom: 2, fontWeight: 700, fontSize: 8, textTransform: 'uppercase' }}>USDC</div>
                                    {usdcRewards.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', background: r.isJackpot ? 'rgba(0,212,255,0.15)' : 'rgba(39,117,202,0.1)', borderRadius: 4, marginBottom: 2, border: r.isJackpot ? '1px solid rgba(0,212,255,0.3)' : 'none' }}><span>{crateIcon(r.token)}</span><span style={{ color: '#fff', flex: 1 }}>{r.name}</span><span style={{ color: r.color }}>{r.amount}</span></div>)}
                                </div>
                                <div>
                                    <div style={{ color: '#f59e0b', marginBottom: 2, fontWeight: 700, fontSize: 8, textTransform: 'uppercase' }}>NFTs</div>
                                    {nftRewards.map(r => <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 5px', background: r.isJackpot ? 'rgba(255,107,53,0.15)' : 'rgba(245,158,11,0.1)', borderRadius: 4, marginBottom: 2, border: r.isJackpot ? '1px solid rgba(255,107,53,0.3)' : 'none' }}><span>{crateIcon(r.token)}</span><span style={{ color: '#fff', flex: 1 }}>{r.name}</span><span style={{ color: r.color }}>{r.amount}</span></div>)}
                                </div>
                            </div>

                            <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: 8, marginBottom: 12 }}>
                                <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 600, marginBottom: 4 }}>🏦 Vault NFTs</div>
                                <div style={{ display: 'flex', justifyContent: 'space-around' }}>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 800, color: '#ff6b35' }}>{loadingVault ? '...' : vaultNfts.superLands}</div><div style={{ color: '#9ca3af', fontSize: 8 }}>Super</div></div>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 800, color: '#8b4513' }}>{loadingVault ? '...' : vaultNfts.lands}</div><div style={{ color: '#9ca3af', fontSize: 8 }}>Land</div></div>
                                    <div style={{ textAlign: 'center' }}><div style={{ fontSize: 16, fontWeight: 800, color: '#228b22' }}>{loadingVault ? '...' : vaultNfts.plants}</div><div style={{ color: '#9ca3af', fontSize: 8 }}>Plant</div></div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div className="c-float" style={{ width: 100, height: 100, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 56 }}>📦</div>
                                <button
                                    type="button"
                                    onClick={onCrateOpen}
                                    disabled={crateLoading}
                                    className={`${styles.btnPrimary} c-glow`}
                                    style={{
                                        width: '100%',
                                        maxWidth: 260,
                                        padding: '12px 20px',
                                        fontSize: 13,
                                        fontWeight: 700,
                                        background: crateLoading ? '#374151' : 'linear-gradient(135deg, #059669, #10b981)',
                                        borderRadius: 10,
                                        opacity: crateLoading ? 0.7 : 1,
                                    }}
                                >
                                    {crateLoading ? '⏳ Processing...' : '🎰 OPEN CRATE'}
                                </button>
                                <div style={{ marginTop: 6, fontSize: 10, color: '#9ca3af' }}>Cost: <span style={{ color: '#fbbf24', fontWeight: 600 }}>200,000 $FCWEED</span></div>
                                {crateStatus && <div style={{ marginTop: 4, fontSize: 9, color: '#60a5fa', fontStyle: 'italic' }}>{crateStatus}</div>}
                                {crateError && <div style={{ marginTop: 6, fontSize: 10, color: '#f87171' }}>{crateError}</div>}
                            </div>

                            {crateUserStats.dust >= 1000 && dustConversionEnabled && (
                                <div style={{ marginTop: 10, padding: 8, background: 'rgba(16,185,129,0.1)', borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center', fontSize: 9 }}>
                                    <span style={{ color: '#34d399' }}>💨 {crateUserStats.dust.toLocaleString()} Dust = <b>{(Math.floor(crateUserStats.dust / 1000) * 60000).toLocaleString()}</b> $FCWEED</span>
                                </div>
                            )}
                        </section>
                    </>
                )}

                {/* Crate Confirm Modal */}
                {crateConfirmOpen && (
                    <div className={styles.modalBackdrop}>
                        <div className={`${styles.modal} c-pop`} style={{ maxWidth: 300, padding: 16 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>📦</div>
                                <h2 style={{ fontSize: 16, color: '#fff', margin: '0 0 6px' }}>Open Crate</h2>
                                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 12px' }}>Pay <span style={{ color: '#fbbf24', fontWeight: 600 }}>200,000 $FCWEED</span> to open?</p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={() => setCrateConfirmOpen(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #374151', background: 'transparent', color: '#9ca3af', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                                    <button type="button" onClick={onCrateConfirm} className={styles.btnPrimary} style={{ flex: 1, padding: 10, fontSize: 12, background: 'linear-gradient(135deg, #f59e0b, #fbbf24)', color: '#000' }}>🎰 Open</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Crate Reel Modal */}
                {crateReelOpen && (
                    <div className={styles.modalBackdrop} style={{ background: 'rgba(0,0,0,0.95)' }}>
                        <div style={{ width: '100%', maxWidth: 440, padding: 16 }}>
                            <div style={{ textAlign: 'center', marginBottom: 12, color: '#fbbf24', fontSize: 13, fontWeight: 600 }}>{crateSpinning ? '🎰 SPINNING...' : '🎉 RESULT!'}</div>
                            <div style={{ position: 'relative', height: 100, overflow: 'hidden', borderRadius: 10, background: '#111', border: '3px solid #333' }}>
                                <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 3, background: '#fbbf24', transform: 'translateX(-50%)', zIndex: 20, boxShadow: '0 0 15px #fbbf24' }} />
                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, #111 0%, transparent 12%, transparent 88%, #111 100%)', zIndex: 10, pointerEvents: 'none' }} />
                                <div ref={crateReelRef} style={{ display: 'flex', height: '100%', alignItems: 'center' }}>
                                    {crateReelItems.map((item, idx) => (
                                        <div key={idx} style={{ flexShrink: 0, width: 130, height: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: 6 }}>
                                            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, border: `2px solid ${item.color}` }}>{crateIcon(item.token)}</div>
                                            <div style={{ fontSize: 10, fontWeight: 600, color: '#fff' }}>{item.name}</div>
                                            <div style={{ fontSize: 9, color: item.color }}>{item.amount}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Crate Win Modal */}
                {crateShowWin && crateWon && (
                    <div className={styles.modalBackdrop} onClick={onCrateClose}>
                        <div className={`${styles.modal} c-pop ${crateWon.isJackpot ? 'c-jack' : ''}`} onClick={e => e.stopPropagation()} style={{ maxWidth: 300, padding: 20, background: crateWon.isJackpot ? 'linear-gradient(135deg, #1a1a2e, #16213e)' : '#0f172a', border: crateWon.isJackpot ? '2px solid #ffd700' : '1px solid #334155' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 6 }}>{crateIcon(crateWon.token)}</div>
                                <h2 style={{ fontSize: 18, color: crateWon.color, margin: '0 0 2px', fontWeight: 800 }}>{crateWon.name}</h2>
                                <div style={{ fontSize: 28, fontWeight: 900, color: crateWon.color, marginBottom: 6 }}>{crateWon.amount} <span style={{ fontSize: 12, opacity: 0.8 }}>{crateWon.token}</span></div>
                                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 12px' }}>{crateWon.isJackpot ? '🎉 JACKPOT! 🎉' : crateWon.token === 'DUST' ? 'For use in Item Shop later!' : crateWon.isNFT ? 'NFT sent!' : 'Sent!'}</p>
                                <button type="button" onClick={onCrateClose} className={styles.btnPrimary} style={{ width: '100%', padding: 12, fontSize: 12, background: crateWon.token === 'DUST' ? 'linear-gradient(135deg, #4b5563, #6b7280)' : 'linear-gradient(135deg, #059669, #10b981)' }}>{crateWon.token === 'DUST' ? 'Collect' : 'Awesome!'}</button>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "wars" && (
                    <section className={styles.infoCard} style={{ textAlign: "center", padding: 16 }}>
                        <h2 style={{ fontSize: 18, margin: "0 0 12px", color: "#ef4444" }}>⚔️ Cartel Wars</h2>

                        {connected && warsPlayerStats && (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4, marginBottom: 12 }}>
                                <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                    <div style={{ fontSize: 8, color: "#9ca3af" }}>WINS</div>
                                    <div style={{ fontSize: 14, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.wins || 0}</div>
                                </div>
                                <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                    <div style={{ fontSize: 8, color: "#9ca3af" }}>LOSSES</div>
                                    <div style={{ fontSize: 14, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.losses || 0}</div>
                                </div>
                                <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                    <div style={{ fontSize: 8, color: "#9ca3af" }}>STREAK</div>
                                    <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>{warsPlayerStats.winStreak || 0}🔥</div>
                                </div>
                                <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                    <div style={{ fontSize: 8, color: "#9ca3af" }}>STOLEN</div>
                                    <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>{warsPlayerStats.rewardsStolen ? (parseFloat(ethers.utils.formatUnits(warsPlayerStats.rewardsStolen, 18)) / 1000).toFixed(0) + "K" : "0"}</div>
                                </div>
                            </div>
                        )}

                        {warsCooldown > 0 && (
                            <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 12 }}>
                                <div style={{ fontSize: 10, color: "#fbbf24" }}>⏳ Attack Cooldown: {Math.floor(warsCooldown / 3600)}h {Math.floor((warsCooldown % 3600) / 60)}m</div>
                            </div>
                        )}

                        {!warsTarget ? (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                                    <p style={{ fontSize: 11, color: "#c0c9f4", margin: "0 0 12px" }}>Pay {warsSearchFee} FCWEED to search for a target</p>
                                    <button
                                        type="button"
                                        onClick={handleWarsSearch}
                                        disabled={warsSearching || !connected || warsCooldown > 0}
                                        className={styles.btnPrimary}
                                        style={{ padding: "10px 24px", fontSize: 12, background: warsSearching ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)" }}
                                    >
                                        {warsSearching ? "🔍 Searching..." : "🔍 Search for Opponent"}
                                    </button>
                                    {warsStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 8 }}>{warsStatus}</p>}
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                                    <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 8, padding: 10 }}>
                                        <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>IF YOU WIN</div>
                                        <ul style={{ fontSize: 10, color: "#10b981", textAlign: "left", margin: 0, paddingLeft: 16 }}>
                                            <li>Steal 10-20% of their pending</li>
                                            <li>Search fee refunded</li>
                                            <li>Their plants take 10-15% damage</li>
                                        </ul>
                                    </div>
                                    <div style={{ background: "rgba(5,8,20,0.6)", borderRadius: 8, padding: 10 }}>
                                        <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>IF YOU LOSE</div>
                                        <ul style={{ fontSize: 10, color: "#ef4444", textAlign: "left", margin: 0, paddingLeft: 16 }}>
                                            <li>Lose 10-20% of your pending</li>
                                            <li>Search fee goes to treasury</li>
                                            <li>Your plants take 10-15% damage</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: 16, marginBottom: 12 }}>
                                    <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 8 }}>🎯 TARGET FOUND</div>
                                    <div style={{ fontSize: 12, color: "#fff", marginBottom: 12, wordBreak: "break-all" }}>{warsTarget.slice(0, 8)}...{warsTarget.slice(-6)}</div>

                                    {warsTargetStats && (
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
                                            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: 6 }}>
                                                <div style={{ fontSize: 8, color: "#9ca3af" }}>PLANTS</div>
                                                <div style={{ fontSize: 14, color: "#10b981" }}>{warsTargetStats.plants}</div>
                                            </div>
                                            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: 6 }}>
                                                <div style={{ fontSize: 8, color: "#9ca3af" }}>HEALTH</div>
                                                <div style={{ fontSize: 14, color: warsTargetStats.avgHealth >= 80 ? "#10b981" : warsTargetStats.avgHealth >= 50 ? "#fbbf24" : "#ef4444" }}>{warsTargetStats.avgHealth}%</div>
                                            </div>
                                            <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: 6 }}>
                                                <div style={{ fontSize: 8, color: "#9ca3af" }}>PENDING</div>
                                                <div style={{ fontSize: 12, color: "#fbbf24" }}>{warsTargetStats.pendingRewards ? (parseFloat(ethers.utils.formatUnits(warsTargetStats.pendingRewards, 18)) / 1000).toFixed(0) + "K" : "0"}</div>
                                            </div>
                                        </div>
                                    )}

                                    {warsOdds && (
                                        <div style={{ background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: 8, marginBottom: 12 }}>
                                            <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 4 }}>BATTLE ODDS</div>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 8, color: "#9ca3af" }}>YOU</div>
                                                    <div style={{ fontSize: 12, color: "#10b981" }}>{warsOdds.attackerPower}</div>
                                                </div>
                                                <div style={{ fontSize: 18, color: "#fbbf24", fontWeight: 700 }}>{warsOdds.estimatedWinChance}%</div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 8, color: "#9ca3af" }}>THEM</div>
                                                    <div style={{ fontSize: 12, color: "#ef4444" }}>{warsOdds.defenderPower}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div style={{ display: "flex", gap: 8 }}>
                                        <button
                                            type="button"
                                            onClick={() => { setWarsTarget(null); setWarsTargetStats(null); setWarsOdds(null); }}
                                            style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer", fontSize: 11 }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleWarsAttack}
                                            disabled={warsAttacking}
                                            className={styles.btnPrimary}
                                            style={{ flex: 2, padding: 10, fontSize: 12, background: warsAttacking ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)" }}
                                        >
                                            {warsAttacking ? "⚔️ Attacking..." : "⚔️ ATTACK!"}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {warsResult && (
                            <div style={{ background: warsResult.won ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", border: `1px solid ${warsResult.won ? "rgba(16,185,129,0.4)" : "rgba(239,68,68,0.4)"}`, borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                <div style={{ fontSize: 24, marginBottom: 4 }}>{warsResult.won ? "🎉" : "💀"}</div>
                                <div style={{ fontSize: 14, color: warsResult.won ? "#10b981" : "#ef4444", fontWeight: 700 }}>{warsResult.won ? "VICTORY!" : "DEFEAT!"}</div>
                                <div style={{ fontSize: 11, color: "#c0c9f4", marginTop: 4 }}>
                                    {warsResult.won ? `Stole ${(parseFloat(ethers.utils.formatUnits(warsResult.rewardsTransferred, 18)) / 1000).toFixed(0)}K FCWEED!` : `Lost ${(parseFloat(ethers.utils.formatUnits(warsResult.rewardsTransferred, 18)) / 1000).toFixed(0)}K FCWEED`}
                                </div>
                                <button type="button" onClick={() => setWarsResult(null)} style={{ marginTop: 8, padding: "6px 16px", borderRadius: 6, border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", cursor: "pointer", fontSize: 10 }}>Dismiss</button>
                            </div>
                        )}

                        <div style={{ background: "rgba(107,114,128,0.1)", border: "1px solid rgba(107,114,128,0.2)", borderRadius: 8, padding: 10 }}>
                            <div style={{ fontSize: 9, color: "#9ca3af" }}>💡 TIP: Higher plant health = more battle power. Buy a Raid Shield from the Item Shop to protect your farm!</div>
                        </div>
                    </section>
                )}

                {activeTab === "referrals" && (
                    <section className={styles.infoCard} style={{ position: "relative", textAlign: "center", padding: 40, minHeight: 300 }}>
                        <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,18,0.85)", backdropFilter: "blur(8px)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                            <div>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>🎁</div>
                                <h2 style={{ fontSize: 20, color: "#fbbf24" }}>Coming Soon</h2>
                                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>Earn rewards for inviting friends</p>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === "shop" && (
                    <section className={styles.infoCard} style={{ textAlign: "center", padding: 16 }}>
                        <h2 style={{ fontSize: 18, margin: "0 0 12px", color: "#10b981" }}>🛒 Item Shop</h2>

                        <div style={{ background: "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(59,130,246,0.1))", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>💧</div>
                            <h3 style={{ fontSize: 14, color: "#60a5fa", margin: "0 0 8px" }}>Water Shop</h3>
                            <p style={{ fontSize: 10, color: "#9ca3af", margin: "0 0 12px" }}>Water restores plant health to 100%. Neglected plants cost more water!</p>

                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
                                <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 8 }}>
                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>SHOP STATUS</div>
                                    <div style={{ fontSize: 14, color: waterShopInfo?.isOpen ? "#10b981" : "#ef4444", fontWeight: 700 }}>{waterShopInfo?.isOpen ? "🟢 OPEN" : "🔴 CLOSED"}</div>
                                </div>
                                <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 8 }}>
                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>HOURS (EST)</div>
                                    <div style={{ fontSize: 12, color: "#c0c9f4", fontWeight: 600 }}>12PM - 6PM</div>
                                </div>
                                <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 8 }}>
                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>PRICE / LITER</div>
                                    <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>{waterShopInfo?.pricePerLiter ? waterShopInfo.pricePerLiter.toLocaleString() : "75,000"} FCWEED</div>
                                </div>
                                <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: 8 }}>
                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>YOUR LIMIT</div>
                                    <div style={{ fontSize: 12, color: "#c0c9f4", fontWeight: 600 }}>{waterShopInfo?.walletLimit ? waterShopInfo.walletLimit.toFixed(0) : "0"}L ({waterShopInfo?.stakedPlants || 0} plants)</div>
                                </div>
                            </div>

                            {waterShopInfo?.isOpen && (
                                <div style={{ marginBottom: 12 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 8 }}>
                                        <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 8, padding: 8 }}>
                                            <div style={{ fontSize: 9, color: "#9ca3af" }}>DAILY SUPPLY LEFT</div>
                                            <div style={{ fontSize: 14, color: "#10b981", fontWeight: 700 }}>{waterShopInfo?.dailyRemaining || "0"}L</div>
                                        </div>
                                        <div style={{ background: "rgba(96,165,250,0.1)", borderRadius: 8, padding: 8 }}>
                                            <div style={{ fontSize: 9, color: "#9ca3af" }}>YOUR REMAINING</div>
                                            <div style={{ fontSize: 14, color: "#60a5fa", fontWeight: 700 }}>{waterShopInfo?.walletRemaining || "0"}L</div>
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                        <button type="button" onClick={() => setWaterBuyAmount(Math.max(1, waterBuyAmount - 1))} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 16 }}>-</button>
                                        <div style={{ flex: 1, background: "rgba(5,8,20,0.5)", borderRadius: 8, padding: "8px 16px", textAlign: "center" }}>
                                            <div style={{ fontSize: 18, color: "#60a5fa", fontWeight: 700 }}>{waterBuyAmount}L</div>
                                            <div style={{ fontSize: 10, color: "#9ca3af" }}>{(waterBuyAmount * 75000).toLocaleString()} FCWEED</div>
                                        </div>
                                        <button type="button" onClick={() => setWaterBuyAmount(waterBuyAmount + 1)} style={{ width: 36, height: 36, borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 16 }}>+</button>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={handleBuyWater}
                                        disabled={waterLoading || !connected || waterBuyAmount > (waterShopInfo?.walletRemaining || 0)}
                                        className={styles.btnPrimary}
                                        style={{ width: "100%", padding: 12, fontSize: 12, background: waterLoading ? "#374151" : "linear-gradient(135deg, #3b82f6, #60a5fa)" }}
                                    >
                                        {waterLoading ? "💧 Buying..." : `💧 Buy ${waterBuyAmount}L Water`}
                                    </button>
                                    {waterStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 6 }}>{waterStatus}</p>}
                                </div>
                            )}

                            {!waterShopInfo?.isOpen && (
                                <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: 10 }}>
                                    <div style={{ fontSize: 10, color: "#fbbf24" }}>⏰ Shop opens at 12PM EST daily</div>
                                </div>
                            )}
                        </div>

                        <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: 10, marginBottom: 12 }}>
                            <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 600, marginBottom: 4 }}>⚠️ Water Costs Scale With Decay!</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 4, fontSize: 9, color: "#9ca3af" }}>
                                <div>99% → 1.0L</div>
                                <div>90% → 1.2L</div>
                                <div>70% → 2.8L</div>
                                <div>50% → 6.0L</div>
                            </div>
                            <p style={{ fontSize: 9, color: "#ef4444", margin: "6px 0 0" }}>Regular watering saves your Plants!</p>
                        </div>

                        <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, padding: 10 }}>
                            <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600, marginBottom: 4 }}>🎁 More Items Coming Soon!</div>
                            <p style={{ fontSize: 9, color: "#9ca3af", margin: 0 }}>Growth Serums, Fertilizers, Raid Shields, Attack Boosts...</p>
                        </div>
                    </section>
                )}
            </main>

            <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, #050812, #0a1128)", borderTop: "1px solid #1b2340", display: "flex", justifyContent: "space-around", padding: "8px 4px", zIndex: 50 }}>
                {[
                    { key: "info", icon: "ℹ️", label: "INFO" },
                    { key: "mint", icon: "🌱", label: "MINT" },
                    { key: "stake", icon: "⚡", label: "STAKE" },
                    { key: "wars", icon: "⚔️", label: "WARS" },
                    { key: "crates", icon: "📦", label: "CRATES" },
                    { key: "shop", icon: "🛒", label: "SHOP" },
                    { key: "referrals", icon: "🎁", label: "REFER" },
                ].map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as any)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "6px 2px", border: "none", background: activeTab === tab.key ? "rgba(59,130,246,0.2)" : "transparent", borderRadius: 8, cursor: "pointer" }}>
                        <span style={{ fontSize: 18 }}>{tab.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: activeTab === tab.key ? "#3b82f6" : "#9ca3af" }}>{tab.label}</span>
                    </button>
                ))}
            </nav>

            {oldStakingOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 500, width: "95%", maxHeight: "85vh", overflowY: "auto" }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Staking V1 (Unstake Only)</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setOldStakingOpen(false)}>✕</button>
                        </header>
                        <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", marginBottom: 10 }}>
                            <p style={{ fontSize: 10, color: "#ef4444", margin: 0, fontWeight: 600 }}>⚠️ V1 is deprecated. Please unstake, claim, and move to Staking V3!</p>
                        </div>
                        <p style={{ fontSize: 10, color: "#fbbf24", marginBottom: 8, textAlign: "center" }}>⏳ Please keep this tab open for 20-30 seconds to ensure NFTs load properly</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                            <div className={styles.statCard}><span className={styles.statLabel}>Plants</span><span className={styles.statValue}>{oldStakingStats?.plantsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Lands</span><span className={styles.statValue}>{oldStakingStats?.landsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Capacity</span><span className={styles.statValue}>{oldStakingStats ? oldStakingStats.capacityUsed + "/" + oldStakingStats.totalSlots : "0/1"}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Boost</span><span className={styles.statValue}>+{oldStakingStats?.landBoostPct.toFixed(1) || 0}%</span></div>
                            <div className={styles.statCard} style={{ gridColumn: "span 2", background: "linear-gradient(135deg, #064e3b, #047857)" }}><span className={styles.statLabel}>Pending (Live)</span><span className={styles.statValue} style={{ color: "#34d399" }}>{oldRealTimePending}</span></div>
                        </div>
                        {loadingOldStaking ? <p style={{ textAlign: "center", padding: 16, fontSize: 12 }}>Loading NFTs…</p> : (
                            <>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>Available ({oldTotalAvailable})</span>
                                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={oldTotalAvailable > 0 && selectedOldAvailPlants.length + selectedOldAvailLands.length === oldTotalAvailable} onChange={() => { if (selectedOldAvailPlants.length + selectedOldAvailLands.length === oldTotalAvailable) { setSelectedOldAvailPlants([]); setSelectedOldAvailLands([]); } else { setSelectedOldAvailPlants(oldAvailablePlants); setSelectedOldAvailLands(oldAvailableLands); } }} />All</label>
                                    </div>
                                    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                        {oldTotalAvailable === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No NFTs</span> : (
                                            <>{oldAvailableLands.map((id) => <NftCard key={"oal-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedOldAvailLands.includes(id)} onChange={() => toggleId(id, selectedOldAvailLands, setSelectedOldAvailLands)} />)}{oldAvailablePlants.map((id) => <NftCard key={"oap-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedOldAvailPlants.includes(id)} onChange={() => toggleId(id, selectedOldAvailPlants, setSelectedOldAvailPlants)} />)}</>
                                        )}
                                    </div>
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>Staked ({oldTotalStaked})</span>
                                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={oldTotalStaked > 0 && selectedOldStakedPlants.length + selectedOldStakedLands.length === oldTotalStaked} onChange={() => { if (selectedOldStakedPlants.length + selectedOldStakedLands.length === oldTotalStaked) { setSelectedOldStakedPlants([]); setSelectedOldStakedLands([]); } else { setSelectedOldStakedPlants(oldStakedPlants); setSelectedOldStakedLands(oldStakedLands); } }} />All</label>
                                    </div>
                                    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                        {oldTotalStaked === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No staked NFTs</span> : (
                                            <>{oldStakedLands.map((id) => <NftCard key={"osl-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedOldStakedLands.includes(id)} onChange={() => toggleId(id, selectedOldStakedLands, setSelectedOldStakedLands)} />)}{oldStakedPlants.map((id) => <NftCard key={"osp-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedOldStakedPlants.includes(id)} onChange={() => toggleId(id, selectedOldStakedPlants, setSelectedOldStakedPlants)} />)}</>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleOldStakeSelected} style={{ flex: 1, padding: 10, fontSize: 12 }}>Stake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleOldUnstakeSelected} style={{ flex: 1, padding: 10, fontSize: 12 }}>Unstake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !oldStakingStats?.claimEnabled} onClick={handleOldClaim} style={{ flex: 1, padding: 10, fontSize: 12 }}>Claim</button>
                        </div>
                    </div>
                </div>
            )}

            {newStakingOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 500, width: "95%", maxHeight: "85vh", overflowY: "auto" }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Staking V2 (Unstake Only)</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setNewStakingOpen(false)}>✕</button>
                        </header>
                        <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.3)", marginBottom: 10 }}>
                            <p style={{ fontSize: 10, color: "#ef4444", margin: 0, fontWeight: 600 }}>⚠️ V2 is deprecated. Please unstake, claim, and move to Staking V3!</p>
                        </div>
                        <p style={{ fontSize: 10, color: "#fbbf24", marginBottom: 8, textAlign: "center" }}>⏳ Please keep this tab open for 20-30 seconds to ensure NFTs load properly</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                            <div className={styles.statCard}><span className={styles.statLabel}>Plants</span><span className={styles.statValue}>{newStakingStats?.plantsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Lands</span><span className={styles.statValue}>{newStakingStats?.landsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Super Lands</span><span className={styles.statValue}>{newStakingStats?.superLandsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Capacity</span><span className={styles.statValue}>{newStakingStats ? newStakingStats.capacityUsed + "/" + newStakingStats.totalSlots : "0/1"}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Boost</span><span className={styles.statValue}>+{newStakingStats ? (newStakingStats.totalBoostPct - 100).toFixed(1) : 0}%</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Daily</span><span className={styles.statValue}>{newStakingStats?.dailyRewards || "0"}</span></div>
                            <div className={styles.statCard} style={{ gridColumn: "span 3", background: "linear-gradient(135deg, #064e3b, #047857)" }}><span className={styles.statLabel}>Pending (Live)</span><span className={styles.statValue} style={{ color: "#34d399", fontSize: 16 }}>{realTimePending}</span></div>
                        </div>
                        {loadingNewStaking ? <p style={{ textAlign: "center", padding: 16, fontSize: 12 }}>Loading NFTs…</p> : (
                            <>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>Available ({newTotalAvailable})</span>
                                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={newTotalAvailable > 0 && selectedNewAvailPlants.length + selectedNewAvailLands.length + selectedNewAvailSuperLands.length === newTotalAvailable} onChange={() => { if (selectedNewAvailPlants.length + selectedNewAvailLands.length + selectedNewAvailSuperLands.length === newTotalAvailable) { setSelectedNewAvailPlants([]); setSelectedNewAvailLands([]); setSelectedNewAvailSuperLands([]); } else { setSelectedNewAvailPlants(newAvailablePlants); setSelectedNewAvailLands(newAvailableLands); setSelectedNewAvailSuperLands(newAvailableSuperLands); } }} />All</label>
                                    </div>
                                    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                        {newTotalAvailable === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No NFTs</span> : (
                                            <>{newAvailableSuperLands.map((id) => <NftCard key={"nasl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedNewAvailSuperLands.includes(id)} onChange={() => toggleId(id, selectedNewAvailSuperLands, setSelectedNewAvailSuperLands)} />)}{newAvailableLands.map((id) => <NftCard key={"nal-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedNewAvailLands.includes(id)} onChange={() => toggleId(id, selectedNewAvailLands, setSelectedNewAvailLands)} />)}{newAvailablePlants.map((id) => <NftCard key={"nap-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedNewAvailPlants.includes(id)} onChange={() => toggleId(id, selectedNewAvailPlants, setSelectedNewAvailPlants)} />)}</>
                                        )}
                                    </div>
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>Staked ({newTotalStaked})</span>
                                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={newTotalStaked > 0 && selectedNewStakedPlants.length + selectedNewStakedLands.length + selectedNewStakedSuperLands.length === newTotalStaked} onChange={() => { if (selectedNewStakedPlants.length + selectedNewStakedLands.length + selectedNewStakedSuperLands.length === newTotalStaked) { setSelectedNewStakedPlants([]); setSelectedNewStakedLands([]); setSelectedNewStakedSuperLands([]); } else { setSelectedNewStakedPlants(newStakedPlants); setSelectedNewStakedLands(newStakedLands); setSelectedNewStakedSuperLands(newStakedSuperLands); } }} />All</label>
                                    </div>
                                    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                        {newTotalStaked === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No staked NFTs</span> : (
                                            <>{newStakedSuperLands.map((id) => <NftCard key={"nssl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedNewStakedSuperLands.includes(id)} onChange={() => toggleId(id, selectedNewStakedSuperLands, setSelectedNewStakedSuperLands)} />)}{newStakedLands.map((id) => <NftCard key={"nsl-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedNewStakedLands.includes(id)} onChange={() => toggleId(id, selectedNewStakedLands, setSelectedNewStakedLands)} />)}{newStakedPlants.map((id) => <NftCard key={"nsp-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedNewStakedPlants.includes(id)} onChange={() => toggleId(id, selectedNewStakedPlants, setSelectedNewStakedPlants)} />)}</>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleNewStakeSelected} style={{ flex: 1, padding: 10, fontSize: 12 }}>Stake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleNewUnstakeSelected} style={{ flex: 1, padding: 10, fontSize: 12 }}>Unstake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !newStakingStats?.claimEnabled} onClick={handleNewClaim} style={{ flex: 1, padding: 10, fontSize: 12 }}>Claim</button>
                        </div>
                    </div>
                </div>
            )}

            {v3StakingOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 520, width: "95%", maxHeight: "90vh", overflowY: "auto" }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>🌿 Staking V3</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setV3StakingOpen(false)}>✕</button>
                        </header>

                        <div style={{ padding: "8px 12px", background: "rgba(16,185,129,0.1)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.3)", marginBottom: 10 }}>
                            <p style={{ fontSize: 10, color: "#10b981", margin: 0, fontWeight: 600 }}>✨ Plant Health, Water Shop, Cartel Wars & more!</p>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                            <div className={styles.statCard}><span className={styles.statLabel}>Plants</span><span className={styles.statValue}>{v3StakingStats?.plants || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Lands</span><span className={styles.statValue}>{v3StakingStats?.lands || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Super Lands</span><span className={styles.statValue}>{v3StakingStats?.superLands || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Capacity</span><span className={styles.statValue}>{v3StakingStats ? `${v3StakingStats.plants}/${v3StakingStats.capacity}` : "0/1"}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Avg Health</span><span className={styles.statValue} style={{ color: (v3StakingStats?.avgHealth || 100) >= 80 ? "#10b981" : (v3StakingStats?.avgHealth || 100) >= 50 ? "#fbbf24" : "#ef4444" }}>{v3StakingStats?.avgHealth || 100}%</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Water</span><span className={styles.statValue} style={{ color: "#60a5fa" }}>{v3StakingStats?.water ? (parseFloat(ethers.utils.formatUnits(v3StakingStats.water, 18))).toFixed(1) : "0"}L</span></div>
                            <div className={styles.statCard} style={{ gridColumn: "span 3", background: "linear-gradient(135deg, #064e3b, #047857)" }}><span className={styles.statLabel}>Pending (Live)</span><span className={styles.statValue} style={{ color: "#34d399", fontSize: 16 }}>{v3RealTimePending}</span></div>
                        </div>

                        {v3StakedPlants.length > 0 && (
                            <div style={{ background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 8, padding: 10, marginBottom: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                    <span style={{ fontSize: 10, color: "#60a5fa", fontWeight: 600 }}>💧 Water Plants</span>
                                    <label style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                                        <input type="checkbox" checked={selectedPlantsToWater.length === v3StakedPlants.filter(id => (v3PlantHealths[id] || 100) < 100).length && selectedPlantsToWater.length > 0} onChange={() => { const needWater = v3StakedPlants.filter(id => (v3PlantHealths[id] || 100) < 100); if (selectedPlantsToWater.length === needWater.length) { setSelectedPlantsToWater([]); } else { setSelectedPlantsToWater(needWater); } }} />All needing water
                                    </label>
                                </div>
                                <div style={{ display: "flex", overflowX: "auto", gap: 4, padding: "4px 0", minHeight: 60 }}>
                                    {v3StakedPlants.filter(id => (v3PlantHealths[id] || 100) < 100).length === 0 ? (
                                        <span style={{ fontSize: 10, color: "#10b981", margin: "auto" }}>✓ All plants at 100% health!</span>
                                    ) : (
                                        v3StakedPlants.filter(id => (v3PlantHealths[id] || 100) < 100).map(id => (
                                            <label key={"water-" + id} style={{ minWidth: 60, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                                                <input type="checkbox" checked={selectedPlantsToWater.includes(id)} onChange={() => { if (selectedPlantsToWater.includes(id)) { setSelectedPlantsToWater(selectedPlantsToWater.filter(x => x !== id)); } else { setSelectedPlantsToWater([...selectedPlantsToWater, id]); } }} style={{ marginBottom: 2 }} />
                                                <div style={{ fontSize: 8 }}>#{id}</div>
                                                <div style={{ fontSize: 10, color: (v3PlantHealths[id] || 100) >= 80 ? "#10b981" : (v3PlantHealths[id] || 100) >= 50 ? "#fbbf24" : "#ef4444" }}>{v3PlantHealths[id] || 100}%</div>
                                                <div style={{ fontSize: 8, color: "#60a5fa" }}>{((v3WaterNeeded[id] || 0) / 1e18).toFixed(1)}L</div>
                                            </label>
                                        ))
                                    )}
                                </div>
                                {selectedPlantsToWater.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleWaterPlants}
                                        disabled={actionLoading || !connected}
                                        className={styles.btnPrimary}
                                        style={{ width: "100%", marginTop: 8, padding: 8, fontSize: 11, background: actionLoading ? "#374151" : "linear-gradient(135deg, #3b82f6, #60a5fa)" }}
                                    >
                                        {actionLoading ? "💧 Watering..." : `💧 Water ${selectedPlantsToWater.length} Plant${selectedPlantsToWater.length > 1 ? "s" : ""} (${totalWaterNeededForSelected.toFixed(1)}L)`}
                                    </button>
                                )}
                                {v3ActionStatus && <p style={{ fontSize: 9, color: "#fbbf24", marginTop: 4, textAlign: "center" }}>{v3ActionStatus}</p>}
                            </div>
                        )}

                        <p style={{ fontSize: 10, color: "#fbbf24", marginBottom: 8, textAlign: "center" }}>⏳ Please keep this tab open for 20-30 seconds to ensure NFTs load properly</p>

                        {loadingV3Staking ? <p style={{ textAlign: "center", padding: 16, fontSize: 12 }}>Loading NFTs…</p> : (
                            <>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>Available ({v3AvailablePlants.length + v3AvailableLands.length + v3AvailableSuperLands.length})</span>
                                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={(v3AvailablePlants.length + v3AvailableLands.length + v3AvailableSuperLands.length) > 0 && selectedV3AvailPlants.length + selectedV3AvailLands.length + selectedV3AvailSuperLands.length === (v3AvailablePlants.length + v3AvailableLands.length + v3AvailableSuperLands.length)} onChange={() => { if (selectedV3AvailPlants.length + selectedV3AvailLands.length + selectedV3AvailSuperLands.length === (v3AvailablePlants.length + v3AvailableLands.length + v3AvailableSuperLands.length)) { setSelectedV3AvailPlants([]); setSelectedV3AvailLands([]); setSelectedV3AvailSuperLands([]); } else { setSelectedV3AvailPlants(v3AvailablePlants); setSelectedV3AvailLands(v3AvailableLands); setSelectedV3AvailSuperLands(v3AvailableSuperLands); } }} />All</label>
                                    </div>
                                    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                        {(v3AvailablePlants.length + v3AvailableLands.length + v3AvailableSuperLands.length) === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No NFTs available to stake</span> : (
                                            <>{v3AvailableSuperLands.map((id) => <NftCard key={"v3asl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedV3AvailSuperLands.includes(id)} onChange={() => toggleId(id, selectedV3AvailSuperLands, setSelectedV3AvailSuperLands)} />)}{v3AvailableLands.map((id) => <NftCard key={"v3al-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedV3AvailLands.includes(id)} onChange={() => toggleId(id, selectedV3AvailLands, setSelectedV3AvailLands)} />)}{v3AvailablePlants.map((id) => <NftCard key={"v3ap-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedV3AvailPlants.includes(id)} onChange={() => toggleId(id, selectedV3AvailPlants, setSelectedV3AvailPlants)} />)}</>
                                        )}
                                    </div>
                                </div>
                                <div style={{ marginBottom: 10 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                        <span style={{ fontSize: 11, fontWeight: 600 }}>Staked ({v3StakedPlants.length + v3StakedLands.length + v3StakedSuperLands.length})</span>
                                        <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={(v3StakedPlants.length + v3StakedLands.length + v3StakedSuperLands.length) > 0 && selectedV3StakedPlants.length + selectedV3StakedLands.length + selectedV3StakedSuperLands.length === (v3StakedPlants.length + v3StakedLands.length + v3StakedSuperLands.length)} onChange={() => { if (selectedV3StakedPlants.length + selectedV3StakedLands.length + selectedV3StakedSuperLands.length === (v3StakedPlants.length + v3StakedLands.length + v3StakedSuperLands.length)) { setSelectedV3StakedPlants([]); setSelectedV3StakedLands([]); setSelectedV3StakedSuperLands([]); } else { setSelectedV3StakedPlants(v3StakedPlants); setSelectedV3StakedLands(v3StakedLands); setSelectedV3StakedSuperLands(v3StakedSuperLands); } }} />All</label>
                                    </div>
                                    <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                        {(v3StakedPlants.length + v3StakedLands.length + v3StakedSuperLands.length) === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No staked NFTs</span> : (
                                            <>{v3StakedSuperLands.map((id) => <NftCard key={"v3ssl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedV3StakedSuperLands.includes(id)} onChange={() => toggleId(id, selectedV3StakedSuperLands, setSelectedV3StakedSuperLands)} />)}{v3StakedLands.map((id) => <NftCard key={"v3sl-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedV3StakedLands.includes(id)} onChange={() => toggleId(id, selectedV3StakedLands, setSelectedV3StakedLands)} />)}{v3StakedPlants.map((id) => <NftCard key={"v3sp-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedV3StakedPlants.includes(id)} onChange={() => toggleId(id, selectedV3StakedPlants, setSelectedV3StakedPlants)} health={v3PlantHealths[id]} />)}</>
                                        )}
                                    </div>
                                </div>
                            </>
                        )}
                        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || (selectedV3AvailPlants.length + selectedV3AvailLands.length + selectedV3AvailSuperLands.length === 0)} onClick={async () => { if (selectedV3AvailPlants.length > 0) await handleV3StakePlants(); if (selectedV3AvailLands.length > 0) await handleV3StakeLands(); if (selectedV3AvailSuperLands.length > 0) await handleV3StakeSuperLands(); }} style={{ flex: 1, padding: 10, fontSize: 12, background: "linear-gradient(to right, #059669, #10b981)" }}>{actionLoading ? "Staking..." : "Stake"}</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || (selectedV3StakedPlants.length + selectedV3StakedLands.length + selectedV3StakedSuperLands.length === 0)} onClick={async () => { if (selectedV3StakedPlants.length > 0) await handleV3UnstakePlants(); if (selectedV3StakedLands.length > 0) await handleV3UnstakeLands(); if (selectedV3StakedSuperLands.length > 0) await handleV3UnstakeSuperLands(); }} style={{ flex: 1, padding: 10, fontSize: 12 }}>{actionLoading ? "Unstaking..." : "Unstake"}</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !v3StakingStats || v3StakingStats.pendingFormatted <= 0} onClick={handleV3Claim} style={{ flex: 1, padding: 10, fontSize: 12 }}>{actionLoading ? "Claiming..." : "Claim"}</button>
                        </div>
                        <p style={{ fontSize: 9, color: "#9ca3af", marginTop: 6, textAlign: "center" }}>⚠️ Plants must have 100% health to unstake. Water them first!</p>
                        {v3ActionStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 4, textAlign: "center" }}>{v3ActionStatus}</p>}
                    </div>
                </div>
            )}

            {upgradeModalOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 380, width: "90%", padding: 16 }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>🔥 Upgrade to Super Land</h2>
                            <button type="button" className={styles.modalClose} onClick={() => { setUpgradeModalOpen(false); setSelectedLandForUpgrade(null); setMintStatus(""); }}>✕</button>
                        </header>
                        <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5, color: "#c0c9f4" }}>
                            <p style={{ marginBottom: 10 }}>To mint a <b style={{ color: "#fbbf24" }}>Super Land NFT</b> and reap its benefits:</p>
                            <ul style={{ marginLeft: 16, marginBottom: 10 }}>
                                <li>Burn <b>1 × Land NFT</b></li>
                                <li>Burn <b>2,000,000 $FCWEED</b></li>
                            </ul>
                            <p style={{ fontSize: 10, opacity: 0.8 }}>Super Land gives +12% boost!</p>
                        </div>
                        {loadingUpgrade ? (
                            <p style={{ marginTop: 12, fontSize: 11, color: "#9ca3af", textAlign: "center" }}>Loading your Land NFTs...</p>
                        ) : upgradeLands.length > 0 ? (
                            <div style={{ marginTop: 12 }}>
                                <label style={{ fontSize: 11, marginBottom: 6, display: "block" }}>Select Land to burn:</label>
                                <select value={selectedLandForUpgrade || ""} onChange={(e) => setSelectedLandForUpgrade(e.target.value ? Number(e.target.value) : null)} style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0a1128", border: "1px solid #1f2a4a", color: "#fff", fontSize: 12 }}>
                                    <option value="">-- Select Land NFT --</option>
                                    {upgradeLands.map((id) => <option key={id} value={id}>Land #{id}</option>)}
                                </select>
                            </div>
                        ) : (
                            <p style={{ marginTop: 12, fontSize: 11, color: "#f87171" }}>You don&apos;t own any Land NFTs to upgrade.</p>
                        )}
                        {mintStatus && <p style={{ marginTop: 8, fontSize: 10, color: mintStatus.includes("✅") ? "#34d399" : "#fbbf24" }}>{mintStatus}</p>}
                        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                            <button type="button" className={styles.btnPrimary} disabled={!selectedLandForUpgrade || actionLoading || loadingUpgrade} onClick={handleUpgradeLand} style={{ flex: 1, padding: 12, background: selectedLandForUpgrade ? "linear-gradient(to right, #f59e0b, #fbbf24)" : "#374151", color: selectedLandForUpgrade ? "#000" : "#9ca3af", cursor: selectedLandForUpgrade ? "pointer" : "not-allowed" }}>{actionLoading ? "Processing…" : "Continue"}</button>
                            <button type="button" onClick={() => { setUpgradeModalOpen(false); setSelectedLandForUpgrade(null); setMintStatus(""); }} style={{ flex: 1, padding: 12, borderRadius: 999, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
