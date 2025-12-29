"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
// import { useMiniKit, useComposeCast } from "@coinbase/onchainkit/minikit";
// Using a safe wrapper since hooks can fail outside MiniKitProvider context

// Safe hook that returns defaults if MiniKit is not available
function useSafeMiniKit() {
    const [state, setState] = useState({ 
        setMiniAppReady: () => {}, 
        isMiniAppReady: false,
        context: null as any
    });
    
    useEffect(() => {
        // Try to dynamically check if we're in MiniKit context
        const tryInit = async () => {
            try {
                // Signal frame ready via SDK directly
                await sdk.actions.ready();
                setState(prev => ({ ...prev, isMiniAppReady: true }));
            } catch (e) {
                // Not in frame context, that's OK
                setState(prev => ({ ...prev, isMiniAppReady: true }));
            }
        };
        tryInit();
    }, []);
    
    return state;
}

function useSafeComposeCast() {
    const composeCast = useCallback(async (options: { text?: string; embeds?: string[] }) => {
        try {
            // Try using Farcaster SDK directly
            const context = await sdk.context;
            if (context) {
                await sdk.actions.openUrl(
                    `https://warpcast.com/~/compose?text=${encodeURIComponent(options.text || '')}`
                );
            }
        } catch (e) {
            console.log("[FCWeed] composeCast not available");
        }
    }, []);
    
    return { composeCast };
}
import { ethers } from "ethers";
import { sdk } from "@farcaster/miniapp-sdk";
import styles from "./page.module.css";
import { CrimeLadder } from "./components/CrimeLadder";
import { loadOwnedTokens } from "./lib/tokens";
import { MultiResult, multicallTry, decode1} from "./lib/multicall";
import { makeTxActions } from "./lib/tx";
import { loadLeaderboard, LeaderboardItem } from "./lib/leaderboard";
import { CrateReward, StakingStats, NewStakingStats, FarmerRow, OwnedState} from "./lib/types";
import { detectMiniAppEnvironment, waitForTx } from "./lib/auxilary";
import { ThePurge } from "./components/ThePurge";
import { DEARaidsLeaderboard } from "./components/DEARaidsLeaderboard";
import { PURGE_ADDRESS, DEA_RAIDS_ADDRESS, WARS_BACKEND_URL } from "./lib/constants";

import {
    CHAIN_ID,
    TOKEN_SYMBOL,
    PLANT_ADDRESS,
    LAND_ADDRESS,
    FCWEED_ADDRESS,
    SUPER_LAND_ADDRESS,
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
    METADATA_MODE,
    CRATE_VAULT_ADDRESS,
    CRATE_COST,
    V4_ITEMSHOP_ADDRESS,
    V4_STAKING_ADDRESS,     
    V5_BATTLES_ADDRESS,
    V5_STAKING_ADDRESS,
    V5_ITEMSHOP_ADDRESS,
    CRATE_REWARDS,
    CRATE_PROBS,
    RewardCategory,
} from "./lib/constants";

import {
    USDC_ABI,
    LAND_ABI,
    PLANT_ABI,
    ERC721_VIEW_ABI,
    ERC20_ABI,
    MULTICALL3_ABI,
    STAKING_ABI,
    V4_STAKING_ABI,
    V4_BATTLES_ABI,
    V5_ITEMSHOP_ABI,
    CRATE_VAULT_ABI,
    usdcInterface,
    landInterface,
    plantInterface,
    superLandInterface,
    stakingInterface,
    erc20Interface,
    erc721Interface,
    v4StakingInterface, 
    v4BattlesInterface,
    v5ItemShopInterface,
} from "./lib/abis";

// Screenshot and share to Twitter/Farcaster/Base
async function captureAndShare(
    elementId: string, 
    fallbackText: string,
    composeCastFn?: (options: { text: string; embeds?: string[] }) => void
) {
    try {
        const element = document.getElementById(elementId);
        let imageDataUrl: string | null = null;
        
        // Try to capture screenshot
        if (element) {
            try {
                const html2canvas = (await import('html2canvas')).default;
                const canvas = await html2canvas(element, {
                    backgroundColor: '#0f172a',
                    scale: 2,
                    logging: false,
                    useCORS: true,
                });
                imageDataUrl = canvas.toDataURL('image/png');
            } catch (e) {
                console.error('Screenshot capture failed:', e);
            }
        }

        // Detect environment
        let isFarcaster = false;
        let isBaseApp = false;
        try {
            const context = await sdk.context;
            // Check for Farcaster-specific fields
            if (context?.client?.clientFid || context?.user?.fid) {
                isFarcaster = true;
            }
            // Base App detection - has context but no Farcaster-specific fields
            if (context && !isFarcaster) {
                isBaseApp = true;
            }
        } catch (e) {
            console.log('Could not detect context:', e);
        }

        // For Base App: Skip composeCast since pasting isn't supported yet
        // Go straight to clipboard copy
        if (isBaseApp) {
            try {
                await navigator.clipboard.writeText(fallbackText);
                alert('✅ Copied!\n\nBase App doesn\'t support pasting yet.\nGo to your feed, tap "+", and type your post manually.\n\nYour stats: check the text you copied!');
                return;
            } catch (e) {
                prompt('Copy this to share on Base:', fallbackText);
                return;
            }
        }

        // For Farcaster: Use composeCast with image embed
        if (isFarcaster && composeCastFn) {
            try {
                const castOptions: { text: string; embeds?: string[] } = { text: fallbackText };
                if (imageDataUrl) {
                    castOptions.embeds = [imageDataUrl];
                }
                composeCastFn(castOptions);
                console.log('Farcaster composeCast called');
                return;
            } catch (e) {
                console.log('Farcaster composeCast failed:', e);
            }
        }

        // Try Farcaster SDK composeCast (fallback)
        try {
            if (sdk && sdk.actions && typeof sdk.actions.composeCast === 'function') {
                const castOptions: any = { text: fallbackText };
                if (imageDataUrl) {
                    castOptions.embeds = [imageDataUrl];
                }
                await sdk.actions.composeCast(castOptions);
                console.log('SDK composeCast succeeded');
                return;
            }
        } catch (e) {
            console.log('SDK composeCast failed or not available:', e);
        }

        // Try SDK openUrl to open Twitter
        try {
            if (sdk && sdk.actions && typeof sdk.actions.openUrl === 'function') {
                const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fallbackText)}`;
                await sdk.actions.openUrl({ url: twitterUrl });
                console.log('openUrl succeeded');
                return;
            }
        } catch (e) {
            console.log('openUrl failed or not available:', e);
        }

        // Try native Web Share API with image
        if (imageDataUrl && navigator.share) {
            try {
                const response = await fetch(imageDataUrl);
                const blob = await response.blob();
                const file = new File([blob], 'fcweed-share.png', { type: 'image/png' });
                
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        text: fallbackText,
                        files: [file],
                    });
                    return;
                }
            } catch (e) {
                console.log('Native share with file failed:', e);
            }
        }

        // Try native Web Share API text only
        if (navigator.share) {
            try {
                await navigator.share({ text: fallbackText });
                return;
            } catch (e) {
                console.log('Native share failed:', e);
            }
        }

        // Fallback: Copy to clipboard
        try {
            await navigator.clipboard.writeText(fallbackText);
            alert('✅ Copied to clipboard!\n\nPaste on X/Twitter or type manually on Base App.');
            return;
        } catch (e) {
            console.log('Clipboard failed:', e);
        }
        
        prompt('Copy this to share:', fallbackText);
    } catch (e) {
        console.error('Share failed:', e);
        try {
            await navigator.clipboard.writeText(fallbackText);
            alert('✅ Copied to clipboard!');
        } catch {
            prompt('Copy this to share:', fallbackText);
        }
    }
}

export default function FCWeedApp()
{
    // Use safe versions of MiniKit hooks
    const { setMiniAppReady, isMiniAppReady } = useSafeMiniKit();
    const { composeCast } = useSafeComposeCast();

    // Theme state (light/dark)
    const [theme, setTheme] = useState<"dark" | "light">("dark");
    
    // Username display state
    const [displayName, setDisplayName] = useState<string | null>(null);
    
    // Onboarding state
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

    const [provider, setProvider] =
        useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [userAddress, setUserAddress] = useState<string | null>(null);
    const connected = !!userAddress; // Derived state - defined early for use throughout component
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
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
    const [showShieldWarning, setShowShieldWarning] = useState(false);

    // Close all modals/popups when switching tabs
    useEffect(() => {
        setV5StakingOpen(false);
        setV4StakingOpen(false);
        setItemsModalOpen(false);
        setWaterModalOpen(false);
        setHealthPackModalOpen(false);
        setNukeConfirmOpen(false);
        setCrateConfirmOpen(false);
    }, [activeTab]);

    const [selectedPlantsToWater, setSelectedPlantsToWater] = useState<number[]>([]);

    const [v4StakingOpen, setV4StakingOpen] = useState(false);
    const [v4StakingStats, setV4StakingStats] = useState<any>(null);
    const [v4StakedPlants, setV4StakedPlants] = useState<number[]>([]);
    const [v4StakedLands, setV4StakedLands] = useState<number[]>([]);
    const [v4StakedSuperLands, setV4StakedSuperLands] = useState<number[]>([]);
    const [v4AvailablePlants, setV4AvailablePlants] = useState<number[]>([]);
    const [v4AvailableLands, setV4AvailableLands] = useState<number[]>([]);
    const [v4AvailableSuperLands, setV4AvailableSuperLands] = useState<number[]>([]);
    const [selectedV4AvailPlants, setSelectedV4AvailPlants] = useState<number[]>([]);
    const [selectedV4AvailLands, setSelectedV4AvailLands] = useState<number[]>([]);
    const [selectedV4AvailSuperLands, setSelectedV4AvailSuperLands] = useState<number[]>([]);
    const [selectedV4StakedPlants, setSelectedV4StakedPlants] = useState<number[]>([]);
    const [selectedV4StakedLands, setSelectedV4StakedLands] = useState<number[]>([]);
    const [selectedV4StakedSuperLands, setSelectedV4StakedSuperLands] = useState<number[]>([]);
    const [loadingV4Staking, setLoadingV4Staking] = useState(false);
    const [v4RealTimePending, setV4RealTimePending] = useState<string>("0.00");
    const [v4PlantHealths, setV4PlantHealths] = useState<Record<number, number>>({});
    const [v4WaterNeeded, setV4WaterNeeded] = useState<Record<number, number>>({});
    const [selectedV4PlantsToWater, setSelectedV4PlantsToWater] = useState<number[]>([]);
    const [v4ActionStatus, setV4ActionStatus] = useState("");

    // V5 Staking State
    const [v5StakingOpen, setV5StakingOpen] = useState(false);
    const [v5StakingStats, setV5StakingStats] = useState<any>(null);
    const [v5StakedPlants, setV5StakedPlants] = useState<number[]>([]);
    const [v5StakedLands, setV5StakedLands] = useState<number[]>([]);
    const [v5StakedSuperLands, setV5StakedSuperLands] = useState<number[]>([]);
    const [v5AvailablePlants, setV5AvailablePlants] = useState<number[]>([]);
    const [v5AvailableLands, setV5AvailableLands] = useState<number[]>([]);
    const [v5AvailableSuperLands, setV5AvailableSuperLands] = useState<number[]>([]);
    const [selectedV5AvailPlants, setSelectedV5AvailPlants] = useState<number[]>([]);
    const [selectedV5AvailLands, setSelectedV5AvailLands] = useState<number[]>([]);
    const [selectedV5AvailSuperLands, setSelectedV5AvailSuperLands] = useState<number[]>([]);
    const [selectedV5StakedPlants, setSelectedV5StakedPlants] = useState<number[]>([]);
    const [selectedV5StakedLands, setSelectedV5StakedLands] = useState<number[]>([]);
    const [selectedV5StakedSuperLands, setSelectedV5StakedSuperLands] = useState<number[]>([]);
    const [loadingV5Staking, setLoadingV5Staking] = useState(false);
    const [v5RealTimePending, setV5RealTimePending] = useState<string>("0.00");
    const [v5ClaimCooldown, setV5ClaimCooldown] = useState<number>(0);
    const [v5PlantHealths, setV5PlantHealths] = useState<Record<number, number>>({});
    const [v5WaterNeeded, setV5WaterNeeded] = useState<Record<number, number>>({});
    const [selectedV5PlantsToWater, setSelectedV5PlantsToWater] = useState<number[]>([]);
    const [v5CustomWaterAmounts, setV5CustomWaterAmounts] = useState<Record<number, number>>({});
    const [v4CustomWaterAmounts, setV4CustomWaterAmounts] = useState<Record<number, number>>({});
    const [v5ActionStatus, setV5ActionStatus] = useState("");
    const [v5AverageHealth, setV5AverageHealth] = useState<number>(100);

    const [waterShopInfo, setWaterShopInfo] = useState<any>(null);
    const [waterBuyAmount, setWaterBuyAmount] = useState(1);
    const [waterLoading, setWaterLoading] = useState(false);
    const [waterStatus, setWaterStatus] = useState("");
    const [shopLoading, setShopLoading] = useState(false);
    const [shopStatus, setShopStatus] = useState("");

    const [warsPlayerStats, setWarsPlayerStats] = useState<any>(null);
    const [warsTarget, setWarsTarget] = useState<any>(null);
    const [warsTargetStats, setWarsTargetStats] = useState<any>(null);
    const [warsSearching, setWarsSearching] = useState(false);
    const [warsAttacking, setWarsAttacking] = useState(false);
    const [warsStatus, setWarsStatus] = useState("");
    const [warsResult, setWarsResult] = useState<any>(null);
    const [inventoryHealthPacks, setInventoryHealthPacks] = useState<number>(0);
    const [inventoryShields, setInventoryShields] = useState<number>(0);
    const [inventoryBoosts, setInventoryBoosts] = useState<number>(0);
    const [inventoryAK47, setInventoryAK47] = useState<number>(0);
    const [inventoryRPG, setInventoryRPG] = useState<number>(0);
    const [inventoryNuke, setInventoryNuke] = useState<number>(0);
    const [shieldExpiry, setShieldExpiry] = useState<number>(0);
    const [boostExpiry, setBoostExpiry] = useState<number>(0);
    const [ak47Expiry, setAk47Expiry] = useState<number>(0);
    const [rpgExpiry, setRpgExpiry] = useState<number>(0);
    const [nukeExpiry, setNukeExpiry] = useState<number>(0);
    const [nukeConfirmOpen, setNukeConfirmOpen] = useState<boolean>(false);
    const [healthPackModalOpen, setHealthPackModalOpen] = useState<boolean>(false);
    const [selectedPlantsForHealthPack, setSelectedPlantsForHealthPack] = useState<number[]>([]);
    const [inventoryLoading, setInventoryLoading] = useState<boolean>(false);
    const [inventoryStatus, setInventoryStatus] = useState<string>("");
    const [waterModalOpen, setWaterModalOpen] = useState<boolean>(false);
    const [itemsModalOpen, setItemsModalOpen] = useState<boolean>(false);
    const [shopItems, setShopItems] = useState<any[]>([]);
    const [shopTimeUntilReset, setShopTimeUntilReset] = useState<number>(0);
    
    // Calculate time until midnight EST for shop reset
    const getTimeUntilShopReset = useCallback(() => {
        const now = new Date();
        
        // Get current time in EST using Intl API for accuracy
        const estFormatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
        
        const estParts = estFormatter.formatToParts(now);
        const estHour = parseInt(estParts.find(p => p.type === 'hour')?.value || '0');
        const estMinute = parseInt(estParts.find(p => p.type === 'minute')?.value || '0');
        const estSecond = parseInt(estParts.find(p => p.type === 'second')?.value || '0');
        
        // Calculate seconds until 7:00 PM EST (19:00) which is UTC midnight
        const targetHour = 19; // 7:00 PM EST
        const currentSecondsInEST = estHour * 3600 + estMinute * 60 + estSecond;
        const targetSecondsInEST = targetHour * 3600;
        
        let secondsUntilReset;
        if (currentSecondsInEST < targetSecondsInEST) {
            // Before 7 PM today - count down to 7 PM today
            secondsUntilReset = targetSecondsInEST - currentSecondsInEST;
        } else {
            // After 7 PM today - count down to 7 PM tomorrow
            const secondsInDay = 24 * 60 * 60;
            secondsUntilReset = (secondsInDay - currentSecondsInEST) + targetSecondsInEST;
        }
        
        return secondsUntilReset;
    }, []);
    
    // Update shop reset timer every minute
    useEffect(() => {
        const updateTimer = () => setShopTimeUntilReset(getTimeUntilShopReset());
        updateTimer();
        const interval = setInterval(updateTimer, 60000);
        return () => clearInterval(interval);
    }, [getTimeUntilShopReset]);
    const [shopSupply, setShopSupply] = useState<Record<number, {remaining: number, total: number}>>({
        1: { remaining: 20, total: 20 },
        2: { remaining: 25, total: 25 },
        3: { remaining: 999, total: 999 },
        4: { remaining: 15, total: 15 },
        5: { remaining: 3, total: 3 },
        6: { remaining: 1, total: 1 }
    });

    const [warsOdds, setWarsOdds] = useState<any>(null);
    const [warsCooldown, setWarsCooldown] = useState(0);
    const [warsSearchFee, setWarsSearchFee] = useState("50K");
    const [warsSearchExpiry, setWarsSearchExpiry] = useState(0);
    const [warsPreviewData, setWarsPreviewData] = useState<any>(null);
    const [warsTargetLocked, setWarsTargetLocked] = useState(false);
    const warsTransactionInProgress = useRef(false);

    useEffect(() => {
        if (warsCooldown <= 0) return;
        const interval = setInterval(() => {
            setWarsCooldown(prev => prev > 0 ? prev - 1 : 0);
        }, 1000);
        return () => clearInterval(interval);
    }, [warsCooldown]);

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
    const [imagesLoaded, setImagesLoaded] = useState(false);

    // Preload all images on mount to prevent flickering
    useEffect(() => {
        const imagesToPreload = [
            ...GIFS,
            '/images/items/ak47.png',
            '/images/items/nuke.png',
            '/images/items/rpg.png',
            '/images/items/healthpack.png',
        ];
        
        let loadedCount = 0;
        const totalImages = imagesToPreload.length;
        
        imagesToPreload.forEach((src) => {
            const img = new window.Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount >= totalImages) {
                    setImagesLoaded(true);
                }
            };
            img.onerror = () => {
                loadedCount++;
                if (loadedCount >= totalImages) {
                    setImagesLoaded(true);
                }
            };
            img.src = src;
        });
        
        // Fallback - mark as loaded after 2 seconds regardless
        const timeout = setTimeout(() => setImagesLoaded(true), 2000);
        return () => clearTimeout(timeout);
    }, []);

    const [ladderRows, setLadderRows] = useState<FarmerRow[]>([]);
    const [ladderLoading, setLadderLoading] = useState(false);
    const [walletRank, setWalletRank] = useState<number | null>(null);
    const [walletRow, setWalletRow] = useState<FarmerRow | null>(null);
    const [farmerCount, setFarmerCount] = useState<number>(0);
    const [leaderboardItems, setLeaderboardItems] = useState<LeaderboardItem[]>([]);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [userLeaderboardRow, setUserLeaderboardRow] = useState<LeaderboardItem | null>(null);
    const [userLeaderboardRank, setUserLeaderboardRank] = useState<number | null>(null);
    const [realTimePending, setRealTimePending] = useState<string>("0.00");
    const [oldRealTimePending, setOldRealTimePending] = useState<string>("0.00");

    // Helper to format large numbers (K for thousands, M for millions)
    const formatLargeNumber = useCallback((value: ethers.BigNumber | number | string, decimals: number = 18): string => {
        let num: number;
        if (typeof value === 'number') {
            num = value;
        } else if (typeof value === 'string') {
            num = parseFloat(value);
        } else {
            num = parseFloat(ethers.utils.formatUnits(value, decimals));
        }
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1).replace(/\.0$/, '') + "M";
        } else if (num >= 1000) {
            return (num / 1000).toFixed(0) + "K";
        }
        return num.toFixed(0);
    }, []);

    // Token supply stats
    const [tokenStats, setTokenStats] = useState<{ burned: string; treasury: string; controlledPct: string; circulatingPct: string; loading: boolean }>({ burned: "0", treasury: "0", controlledPct: "0", circulatingPct: "0", loading: true });


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
    
    // Item Shop FCWEED prices for balance checks
    const SHOP_FCWEED_PRICES = {
        healthPack: ethers.utils.parseUnits("2000000", 18),    // 2M
        attackBoost: ethers.utils.parseUnits("200000", 18),    // 200K
        ak47: ethers.utils.parseUnits("1000000", 18),          // 1M
        rpg: ethers.utils.parseUnits("4000000", 18),           // 4M
        nuke: ethers.utils.parseUnits("10000000", 18),         // 10M
    };
    
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
    const txRef = useRef<ReturnType<typeof makeTxActions> | null>(null);

    function txAction()
    {
        if (!txRef.current) throw new Error("tx actions not ready yet");
        return txRef.current;
    }

    async function ensureFcweedAllowance(spender: string, amount: ethers.BigNumber): Promise<boolean> {
        if (!userAddress || !readProvider) return false;
        try {
            const fcweed = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            const current = await fcweed.allowance(userAddress, spender);
            if (current.gte(amount)) return true;
            setMintStatus("Approving FCWEED...");
            const approveData = erc20Interface.encodeFunctionData("approve", [spender, ethers.constants.MaxUint256]);
            const tx = await txAction().sendContractTx(FCWEED_ADDRESS, approveData);
            if (!tx) return false;
            await waitForTx(tx, readProvider);
            return true;
        } catch (e) {
            console.error("Allowance check failed:", e);
            return false;
        }
    }

    async function sendContractTx(to: string, data: string, gasLimit?: string): Promise<ethers.providers.TransactionResponse | null> {
        return txAction().sendContractTx(to, data, gasLimit);
    }

    // Refresh trigger state - defined early so inventory handlers can use refreshAllData
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const refreshAllData = useCallback(() => {
        setRefreshTrigger(prev => prev + 1);
    }, []);

    // Inventory functions
    async function fetchInventory() {
        if (!userAddress || !readProvider) return;
        try {
            const itemShopAbi = [
                "function inventory(address user, uint256 itemId) view returns (uint256)",
                "function getActiveItems() view returns (tuple(uint256 id, string name, uint256 fcweedPrice, uint256 dustPrice, uint256 itemType, uint256 effectValue, uint256 duration, uint256 maxPerWallet, uint256 dailySupply, uint256 soldToday, uint256 lastResetDay, bool active, bool burnFcweed, uint256 startTime, uint256 endTime, bool requiresTarget)[])",
                "function getRemainingDailySupply(uint256 itemId) view returns (uint256)",
                "function getItem(uint256 itemId) view returns (tuple(uint256 id, string name, uint256 fcweedPrice, uint256 dustPrice, uint256 itemType, uint256 effectValue, uint256 duration, uint256 maxPerWallet, uint256 dailySupply, uint256 soldToday, uint256 lastResetDay, bool active, bool burnFcweed, uint256 startTime, uint256 endTime, bool requiresTarget))",
                "function userPurchases(address user, uint256 itemId) view returns (uint256)",
                "function userActiveEffects(address user, uint256 itemId) view returns (uint256)",
            ];
            const itemShop = new ethers.Contract(V5_ITEMSHOP_ADDRESS, itemShopAbi, readProvider);
            const [healthPacks, shields, boosts, ak47s, rpgs, nukes, activeItems, shieldExp, boostExp, ak47Exp, rpgExp, nukeExp] = await Promise.all([
                itemShop.userPurchases(userAddress, 1).catch(() => ethers.BigNumber.from(0)),
                itemShop.userPurchases(userAddress, 2).catch(() => ethers.BigNumber.from(0)),
                itemShop.userPurchases(userAddress, 3).catch(() => ethers.BigNumber.from(0)),
                itemShop.userPurchases(userAddress, 4).catch(() => ethers.BigNumber.from(0)),
                itemShop.userPurchases(userAddress, 5).catch(() => ethers.BigNumber.from(0)),
                itemShop.userPurchases(userAddress, 6).catch(() => ethers.BigNumber.from(0)),
                itemShop.getActiveItems().catch(() => []),
                itemShop.userActiveEffects(userAddress, 2).catch(() => ethers.BigNumber.from(0)),
                itemShop.userActiveEffects(userAddress, 3).catch(() => ethers.BigNumber.from(0)),
                itemShop.userActiveEffects(userAddress, 4).catch(() => ethers.BigNumber.from(0)),
                itemShop.userActiveEffects(userAddress, 5).catch(() => ethers.BigNumber.from(0)),
                itemShop.userActiveEffects(userAddress, 6).catch(() => ethers.BigNumber.from(0)),
            ]);
            setInventoryHealthPacks(healthPacks.toNumber());
            setInventoryShields(shields.toNumber());
            setInventoryBoosts(boosts.toNumber());
            setInventoryAK47(ak47s.toNumber());
            setInventoryRPG(rpgs.toNumber());
            setInventoryNuke(nukes.toNumber());
            setShopItems(activeItems);
            setShieldExpiry(shieldExp.toNumber());
            setBoostExpiry(boostExp.toNumber());
            setAk47Expiry(ak47Exp.toNumber());
            setRpgExpiry(rpgExp.toNumber());
            setNukeExpiry(nukeExp.toNumber());
            const supplyData: Record<number, {remaining: number, total: number}> = {};
            const itemIds = [1, 2, 3, 4, 5, 6];
            for (const id of itemIds) {
                try {
                    const item = await itemShop.getItem(id);
                    const dailySupply = item.dailySupply.toNumber();
                    const soldToday = item.soldToday.toNumber();
                    supplyData[id] = { remaining: dailySupply > 0 ? dailySupply - soldToday : 999, total: dailySupply > 0 ? dailySupply : 999 };
                } catch { supplyData[id] = { remaining: 0, total: 0 }; }
            }
            setShopSupply(supplyData);
        } catch (e) {
            console.error("Failed to fetch inventory:", e);
        }
    }

    async function refreshShopSupply() {
        if (!readProvider) return;
        try {
            const itemShopAbi = [
                "function getDailyStock(uint256 itemId) view returns (uint256 remaining, uint256 total)",
                "function getTimeUntilReset() view returns (uint256)",
            ];
            const itemShop = new ethers.Contract(V5_ITEMSHOP_ADDRESS, itemShopAbi, readProvider);
            const supplyData: Record<number, {remaining: number, total: number}> = {};
            const itemIds = [1, 2, 3, 4, 5, 6];
            
            // Debug: Get time until reset from contract
            try {
                const timeUntilReset = await itemShop.getTimeUntilReset();
                const hours = Math.floor(timeUntilReset.toNumber() / 3600);
                const minutes = Math.floor((timeUntilReset.toNumber() % 3600) / 60);
                console.log(`[Shop] Contract says time until UTC reset: ${hours}h ${minutes}m`);
            } catch (e) {
                console.log("[Shop] Could not get time until reset from contract");
            }
            
            // Fetch all in parallel for speed
            const promises = itemIds.map(async (id) => {
                try {
                    const [remaining, total] = await itemShop.getDailyStock(id);
                    // getDailyStock returns max uint256 for remaining if dailySupply is 0 (unlimited)
                    const remainingNum = remaining.gt(ethers.BigNumber.from(1000000)) ? 999 : remaining.toNumber();
                    const totalNum = total.toNumber();
                    console.log(`[Shop] Item ${id}: remaining=${remainingNum}, total=${totalNum}`);
                    return { id, remaining: totalNum > 0 ? remainingNum : 999, total: totalNum > 0 ? totalNum : 999 };
                } catch (err) {
                    console.log(`[Shop] Item ${id} fetch error:`, err);
                    return { id, remaining: 0, total: 0 };
                }
            });
            
            const results = await Promise.all(promises);
            results.forEach(r => {
                supplyData[r.id] = { remaining: r.remaining, total: r.total };
            });
            
            console.log("[Shop] Final supplyData:", supplyData);
            setShopSupply(supplyData);
        } catch (e) {
            console.error("Failed to refresh shop supply:", e);
        }
    }

    // Refresh shop supply when modal is open (faster refresh)
    useEffect(() => {
        if (itemsModalOpen || waterModalOpen) {
            refreshShopSupply();
            const interval = setInterval(refreshShopSupply, 5000); // 5 seconds when modal open
            return () => clearInterval(interval);
        }
    }, [itemsModalOpen, waterModalOpen, readProvider]);
    
    // Global shop supply refresh for live updates across all users
    useEffect(() => {
        if (!readProvider) return;
        
        // Initial load
        refreshShopSupply();
        
        // Refresh every 30 seconds for all users (even when modal closed)
        const globalInterval = setInterval(refreshShopSupply, 30000);
        
        return () => clearInterval(globalInterval);
    }, [readProvider]);

    async function handleActivateShield() {
        if (!userAddress || inventoryShields === 0) return;
        setInventoryLoading(true);
        setInventoryStatus("Activating shield...");
        try {
            const iface = new ethers.utils.Interface(["function useItem(uint256 itemId, address target)"]);
            const data = iface.encodeFunctionData("useItem", [2, ethers.constants.AddressZero]);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data);
            if (tx) {
                await tx.wait();
                setInventoryStatus("Shield activated! 24h protection.");
                fetchInventory();
                refreshAllData();
            } else {
                setInventoryStatus("Transaction rejected");
            }
        } catch (e: any) {
            setInventoryStatus(e?.reason || e?.message || "Failed to activate shield");
        } finally {
            setInventoryLoading(false);
        }
    }

    async function handleActivateBoost() {
        if (!userAddress || inventoryBoosts === 0) return;
        setInventoryLoading(true);
        setInventoryStatus("Activating boost...");
        try {
            const iface = new ethers.utils.Interface(["function useItem(uint256 itemId, address target)"]);
            const data = iface.encodeFunctionData("useItem", [3, ethers.constants.AddressZero]);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data);
            if (tx) {
                await tx.wait();
                setInventoryStatus("Attack boost activated!");
                fetchInventory();
                refreshAllData();
            } else {
                setInventoryStatus("Transaction rejected");
            }
        } catch (e: any) {
            setInventoryStatus(e?.reason || e?.message || "Failed to activate boost");
        } finally {
            setInventoryLoading(false);
        }
    }

    async function handleActivateAK47() {
        if (!userAddress || inventoryAK47 === 0) return;
        setInventoryLoading(true);
        setInventoryStatus("Activating AK-47...");
        try {
            const iface = new ethers.utils.Interface(["function useItem(uint256 itemId, address target)"]);
            const data = iface.encodeFunctionData("useItem", [4, ethers.constants.AddressZero]);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data);
            if (tx) {
                await tx.wait();
                setInventoryStatus("AK-47 activated! +100% combat power for 6h");
                fetchInventory();
                refreshAllData();
            } else {
                setInventoryStatus("Transaction rejected");
            }
        } catch (e: any) {
            setInventoryStatus(e?.reason || e?.message || "Failed to activate AK-47");
        } finally {
            setInventoryLoading(false);
        }
    }

    async function handleActivateRPG() {
        if (!userAddress || inventoryRPG === 0) return;
        setInventoryLoading(true);
        setInventoryStatus("Activating RPG...");
        try {
            const iface = new ethers.utils.Interface(["function useItem(uint256 itemId, address target)"]);
            const data = iface.encodeFunctionData("useItem", [5, ethers.constants.AddressZero]);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data);
            if (tx) {
                await tx.wait();
                setInventoryStatus("RPG activated! +500% combat power for 1h");
                fetchInventory();
                refreshAllData();
            } else {
                setInventoryStatus("Transaction rejected");
            }
        } catch (e: any) {
            setInventoryStatus(e?.reason || e?.message || "Failed to activate RPG");
        } finally {
            setInventoryLoading(false);
        }
    }

    async function handleActivateNuke() {
        if (!userAddress || inventoryNuke === 0) return;
        setNukeConfirmOpen(false);
        setInventoryLoading(true);
        setInventoryStatus("Launching Tactical Nuke...");
        try {
            const iface = new ethers.utils.Interface(["function useItem(uint256 itemId, address target)"]);
            const data = iface.encodeFunctionData("useItem", [6, ethers.constants.AddressZero]);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data);
            if (tx) {
                await tx.wait();
                setInventoryStatus("☢️ TACTICAL NUKE ACTIVATED! +10000% combat power for 10min");
                setNukeExpiry(Math.floor(Date.now() / 1000) + 600);
                fetchInventory();
                refreshAllData();
            } else {
                setInventoryStatus("Transaction rejected");
            }
        } catch (e: any) {
            setInventoryStatus(e?.reason || e?.message || "Failed to activate Nuke");
        } finally {
            setInventoryLoading(false);
        }
    }

    async function handleUseHealthPack() {
        if (!userAddress || selectedPlantsForHealthPack.length === 0) return;
        setInventoryLoading(true);
        setInventoryStatus("Using health pack...");
        try {
            const iface = new ethers.utils.Interface(["function useHealthPackBatch(uint256[] plantIds)"]);
            const data = iface.encodeFunctionData("useHealthPackBatch", [selectedPlantsForHealthPack]);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data);
            if (tx) {
                await tx.wait();
                setInventoryStatus("Health pack used! Plants healed to 80%");
                setHealthPackModalOpen(false);
                setSelectedPlantsForHealthPack([]);
                fetchInventory();
                refreshAllData();
            } else {
                setInventoryStatus("Transaction rejected");
            }
        } catch (e: any) {
            setInventoryStatus(e?.reason || e?.message || "Failed to use health pack");
        } finally {
            setInventoryLoading(false);
        }
    }

    async function handleBuyItem(itemId: number, currency: "dust" | "fcweed") {
        if (!userAddress) return;
        setShopLoading(true);
        setShopStatus(`Buying item...`);
        try {
            const itemShopAbi = [
                "function purchaseWithFcweed(uint256 itemId)",
                "function purchaseWithDust(uint256 itemId)",
                "function getItem(uint256 itemId) view returns (tuple(uint256 id, string name, uint256 fcweedPrice, uint256 dustPrice, uint256 itemType, uint256 effectValue, uint256 duration, uint256 maxPerWallet, uint256 dailySupply, uint256 soldToday, uint256 lastResetDay, bool active, bool burnFcweed, uint256 startTime, uint256 endTime, bool requiresTarget))",
            ];
            const itemShopInterface = new ethers.utils.Interface(itemShopAbi);
            const itemShop = new ethers.Contract(V5_ITEMSHOP_ADDRESS, itemShopAbi, readProvider);
            const item = await itemShop.getItem(itemId);
            if (!item || !item.active) {
                setShopStatus("Item not available");
                setShopLoading(false);
                return;
            }
            let data: string;
            if (currency === "fcweed") {
                const fcweedPrice = item.fcweedPrice;
                if (fcweedPrice.gt(0)) {
                    setShopStatus("Checking allowance...");
                    const approved = await ensureFcweedAllowance(V5_ITEMSHOP_ADDRESS, fcweedPrice);
                    if (!approved) {
                        setShopStatus("Approval failed");
                        setShopLoading(false);
                        return;
                    }
                }
                data = itemShopInterface.encodeFunctionData("purchaseWithFcweed", [itemId]);
            } else {
                data = itemShopInterface.encodeFunctionData("purchaseWithDust", [itemId]);
            }
            setShopStatus("Confirming purchase...");
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data);
            if (!tx) {
                setShopStatus("Transaction rejected");
                setShopLoading(false);
                return;
            }
            await tx.wait();
            setShopStatus("✅ Purchase successful!");
            // Refresh all balances and inventory after purchase
            fetchInventory();
            refreshAllData();
            setTimeout(() => setShopStatus(""), 3000);
        } catch (e: any) {
            setShopStatus(e?.reason || e?.message || "Purchase failed");
        } finally {
            setShopLoading(false);
        }
    }

    useEffect(() =>
        {
            txRef.current = makeTxActions({
                ensureWallet,
                readProvider,
                miniAppEthProvider,
                usingMiniApp,
                CHAIN_ID,
                USDC_ADDRESS,
                USDC_DECIMALS,
                USDC_ABI,
                usdcInterface,
                waitForTx,
                setMintStatus,
            });
        }, [readProvider, miniAppEthProvider, usingMiniApp]);

    const currentTrackMeta = useMemo(() => PLAYLIST[currentTrack], [currentTrack]);
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

    const resetSelections = useCallback(() =>
        {
            setSelectedOldAvailPlants([]);
            setSelectedOldAvailLands([]);
            setSelectedOldStakedPlants([]);
            setSelectedOldStakedLands([]);
            setSelectedNewAvailPlants([]);
            setSelectedNewAvailLands([]);
            setSelectedNewAvailSuperLands([]);
            setSelectedNewStakedPlants([]);
            setSelectedNewStakedLands([]);
            setSelectedNewStakedSuperLands([]);
        }, []);

    useEffect(() =>
        {
            resetSelections();
        }, [userAddress, resetSelections]);

    const handlePlayPause = useCallback(() =>
        {
            setIsPlaying((prev) =>
                {
                    setManualPause(prev);
                    return !prev;
                });
        }, []);

    const handleNextTrack = useCallback(() =>
        {
            setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
        }, []);

    const handlePrevTrack = useCallback(() =>
        {
            setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);
        }, []);

    useEffect(() =>
        {
            // Skip frame ready call - handled by useSafeMiniKit hook
            
            let cancelled = false;
            let t: ReturnType<typeof setTimeout> | null = null;

            (async () =>
                {
                    try
                    {
                        console.log("[Init] Initializing...");
                        // SDK ready is called in useSafeMiniKit hook
                        if (cancelled) return;
                        
                        // Don't auto-connect if user explicitly disconnected
                        if (userDisconnected.current) {
                            console.log("[Init] Skipping auto-connect - user disconnected");
                            return;
                        }

                        const { isMiniApp, isBaseApp, isMobile } = detectMiniAppEnvironment();
                        
                        // Auto-connect on mobile, mini apps, or Base App (this is a mobile-only app)
                        const shouldAutoConnect = isMobile || isMiniApp || isBaseApp;
                        
                        if (shouldAutoConnect && !userAddress)
                        {
                            console.log("[Init] Auto-connecting wallet...", { isMiniApp, isBaseApp, isMobile });
                            t = setTimeout(() =>
                                {
                                    void ensureWallet().catch((err) =>
                                        {
                                            console.warn("[Init] Auto-connect failed:", err);
                                        });
                                }, 200); // Fast connect for mobile
                        }
                    }
                    catch (err)
                    {
                        console.warn("[Init] Initialization failed:", err);
                    }
                })();

            return () =>
                {
                    cancelled = true;
                    if (t) clearTimeout(t);
                };
        }, []);

    // Paymaster URL for sponsored transactions (Coinbase Developer Platform)
    const PAYMASTER_URL = "https://api.developer.coinbase.com/rpc/v1/base/LBqFJaxfsfmt8cL44zkpJ3BHgill7Sw4";
    
    // Check if wallet supports sponsored transactions (Smart Wallet)
    const [supportsSponsorship, setSupportsSponsorship] = useState(false);
    
    // Check wallet capabilities when connected
    useEffect(() => {
        if (!provider || !userAddress) {
            setSupportsSponsorship(false);
            return;
        }
        
        // Check if the wallet supports wallet_getCapabilities (Smart Wallet indicator)
        const checkCapabilities = async () => {
            try {
                const anyProvider = (window as any).ethereum;
                if (anyProvider?.request) {
                    const capabilities = await anyProvider.request({
                        method: 'wallet_getCapabilities',
                        params: [userAddress]
                    }).catch(() => null);
                    
                    // Check if paymasterService is supported on Base (chainId 8453)
                    if (capabilities?.['0x2105']?.paymasterService?.supported || 
                        capabilities?.['8453']?.paymasterService?.supported) {
                        console.log("[Paymaster] Smart Wallet detected, sponsorship available");
                        setSupportsSponsorship(true);
                    } else {
                        console.log("[Paymaster] Standard wallet, no sponsorship");
                        setSupportsSponsorship(false);
                    }
                }
            } catch (err) {
                console.log("[Paymaster] Capability check failed:", err);
                setSupportsSponsorship(false);
            }
        };
        
        checkCapabilities();
    }, [provider, userAddress]);
    
    // Send sponsored transaction using wallet_sendCalls (EIP-5792)
    async function sendSponsoredTransaction(
        to: string, 
        data: string, 
        value: string = "0x0"
    ): Promise<string | null> {
        try {
            const anyProvider = (window as any).ethereum;
            if (!anyProvider?.request || !userAddress) {
                console.log("[Paymaster] No provider for sponsored tx");
                return null;
            }
            
            console.log("[Paymaster] Sending sponsored transaction to:", to);
            
            const calls = [{
                to,
                data,
                value
            }];
            
            const result = await anyProvider.request({
                method: 'wallet_sendCalls',
                params: [{
                    version: '1.0',
                    chainId: '0x2105', // Base mainnet
                    from: userAddress,
                    calls,
                    capabilities: {
                        paymasterService: {
                            url: PAYMASTER_URL
                        }
                    }
                }]
            });
            
            console.log("[Paymaster] Sponsored tx result:", result);
            return result;
        } catch (err: any) {
            console.error("[Paymaster] Sponsored tx failed:", err);
            // Return null to fall back to regular transaction
            return null;
        }
    }

    const shortAddr = (addr?: string | null) =>
        addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

    // Avatar state
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    
    // Disconnect modal state
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    
    // Wallet state
    const userDisconnected = useRef(false); // Flag to prevent auto-reconnect after explicit disconnect

    // Resolve username and avatar from Basenames, ENS, or Farcaster
    async function resolveUserProfile(address: string): Promise<{ name: string | null; avatar: string | null }> {
        let name: string | null = null;
        let avatar: string | null = null;
        
        try {
            // Try Basenames first (Base's native naming service)
            const basenameResponse = await fetch(
                `https://api.basename.app/v1/address/${address}/basename`
            ).catch(() => null);
            
            if (basenameResponse?.ok) {
                const data = await basenameResponse.json();
                if (data?.basename) {
                    name = data.basename;
                    // Try to get avatar from basename
                    if (data?.avatar) {
                        avatar = data.avatar;
                    }
                }
            }
            
            // Try ENS via public resolver
            if (!name) {
                const ensResponse = await fetch(
                    `https://api.ensideas.com/ens/resolve/${address}`
                ).catch(() => null);
                
                if (ensResponse?.ok) {
                    const data = await ensResponse.json();
                    if (data?.name) {
                        name = data.name;
                    }
                    if (data?.avatar) {
                        avatar = data.avatar;
                    }
                }
            }
            
            // Try Farcaster profile
            if (usingMiniApp) {
                try {
                    const context = await sdk.context;
                    if (context?.user) {
                        if (!name && context.user.username) {
                            name = context.user.username;
                        }
                        if (!avatar && context.user.pfpUrl) {
                            avatar = context.user.pfpUrl;
                        }
                    }
                } catch {}
            }
            
            // Try Farcaster API for avatar if still no avatar
            if (!avatar) {
                try {
                    const fcResponse = await fetch(
                        `https://searchcaster.xyz/api/profiles?connected_address=${address}`
                    ).catch(() => null);
                    
                    if (fcResponse?.ok) {
                        const data = await fcResponse.json();
                        if (data?.[0]?.body?.avatarUrl) {
                            avatar = data[0].body.avatarUrl;
                            if (!name && data[0].body?.username) {
                                name = data[0].body.username;
                            }
                        }
                    }
                } catch {}
            }
            
            return { name, avatar };
        } catch (err) {
            console.error("[Profile] Resolution failed:", err);
            return { name: null, avatar: null };
        }
    }
    
    // Fetch profile when address changes
    useEffect(() => {
        if (!userAddress) {
            setDisplayName(null);
            setUserAvatar(null);
            return;
        }
        
        resolveUserProfile(userAddress).then(({ name, avatar }) => {
            setDisplayName(name);
            setUserAvatar(avatar);
        });
    }, [userAddress, usingMiniApp]);
    
    // Disconnect wallet function
    const disconnectWallet = () => {
        userDisconnected.current = true; // Prevent auto-reconnect
        setProvider(null);
        setSigner(null);
        setUserAddress(null);
        setDisplayName(null);
        setUserAvatar(null);
        setUsingMiniApp(false);
        setMiniAppEthProvider(null);
        setShowDisconnectModal(false);
    };
    
    // Get display name or shortened address
    const getDisplayName = () => {
        if (displayName) return displayName;
        return shortAddr(userAddress);
    };
    
    // Helper function for card/box styling based on theme
    const getCardStyle = (additionalStyles: React.CSSProperties = {}): React.CSSProperties => ({
        background: theme === "light" ? "#ffffff" : "rgba(5, 8, 20, 0.9)",
        border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255, 255, 255, 0.08)"}`,
        boxShadow: theme === "light" ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
        color: theme === "light" ? "#1e293b" : "#ffffff",
        ...additionalStyles
    });
    
    // Helper for text colors in light mode
    const getTextColor = (type: "primary" | "secondary" | "muted" = "primary") => {
        if (theme === "light") {
            switch (type) {
                case "primary": return "#1e293b";
                case "secondary": return "#475569";
                case "muted": return "#64748b";
            }
        } else {
            switch (type) {
                case "primary": return "#ffffff";
                case "secondary": return "#94a3b8";
                case "muted": return "#64748b";
            }
        }
    };
    
    // Check for first-time user and show onboarding
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const seen = localStorage.getItem('fcweed_onboarding_seen');
            if (!seen) {
                setShowOnboarding(true);
            } else {
                setHasSeenOnboarding(true);
            }
        }
    }, []);
    
    const dismissOnboarding = () => {
        setShowOnboarding(false);
        setHasSeenOnboarding(true);
        if (typeof window !== 'undefined') {
            localStorage.setItem('fcweed_onboarding_seen', 'true');
        }
    };
    
    // Theme toggle
    const toggleTheme = () => {
        setTheme(prev => prev === "dark" ? "light" : "dark");
    };
    
    // Apply theme to document
    useEffect(() => {
        if (typeof document !== 'undefined') {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }, [theme]);
    
    // Detect system preference on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedTheme = localStorage.getItem('fcweed_theme') as "dark" | "light" | null;
            if (savedTheme) {
                setTheme(savedTheme);
            } else if (window.matchMedia?.('(prefers-color-scheme: light)').matches) {
                setTheme('light');
            }
        }
    }, []);
    
    // Save theme preference
    useEffect(() => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('fcweed_theme', theme);
        }
    }, [theme]);

    async function ensureWallet(forceSelection: boolean = false) {
        if (signer && provider && userAddress && !forceSelection) {
            return { signer, provider, userAddress, isMini: usingMiniApp };
        }
        
        // Clear the disconnect flag when user explicitly connects
        userDisconnected.current = false;

        try {
            setConnecting(true);
            setMintStatus("");

            let p: ethers.providers.Web3Provider;
            let s: ethers.Signer;
            let addr: string;
            let isMini = false;
            let ethProv: any | null = null;

            const { isMiniApp: detectedMiniApp, isMobile, isBaseApp } = detectMiniAppEnvironment();

            console.log("[Wallet] Environment:", { detectedMiniApp, isMobile, isBaseApp, userAgent: navigator.userAgent });

            // Mobile-only app - use Farcaster SDK which respects user's wallet preference
            try {
                console.log("[Wallet] Attempting SDK wallet connection...");

                // Try SDK ready first
                try {
                    await sdk.actions.ready();
                    console.log("[Wallet] SDK ready confirmed");
                } catch (readyErr) {
                    console.warn("[Wallet] SDK ready call failed (may already be ready):", readyErr);
                }

                // Farcaster SDK getEthereumProvider() returns the user's preferred wallet
                // (Farcaster Wallet, Rabby, or External based on their settings)
                try {
                    ethProv = await sdk.wallet.getEthereumProvider();
                    if (ethProv) {
                        console.log("[Wallet] Got provider via Farcaster SDK");
                        
                        // Log provider details to debug which wallet is being used
                        const providerInfo = {
                            isRabby: !!(ethProv as any).isRabby,
                            isMetaMask: !!(ethProv as any).isMetaMask,
                            isCoinbaseWallet: !!(ethProv as any).isCoinbaseWallet,
                            isFarcaster: !!(ethProv as any).isFarcaster,
                        };
                        console.log("[Wallet] Provider info:", providerInfo);
                        
                        isMini = true;
                    }
                } catch (err1) {
                    console.warn("[Wallet] Farcaster SDK getEthereumProvider failed:", err1);
                    
                    // Try ethProvider property as fallback
                    if ((sdk.wallet as any).ethProvider) {
                        ethProv = (sdk.wallet as any).ethProvider;
                        console.log("[Wallet] Got provider via ethProvider property");
                        isMini = true;
                    }
                }

                // If SDK didn't return a provider, check window.ethereum
                // Farcaster may inject the selected wallet there
                if (!ethProv) {
                    const anyWindow = window as any;
                    
                    // Check what's available in window.ethereum
                    if (anyWindow.ethereum) {
                        const windowProviderInfo = {
                            isRabby: !!anyWindow.ethereum.isRabby,
                            isMetaMask: !!anyWindow.ethereum.isMetaMask,
                            isCoinbaseWallet: !!anyWindow.ethereum.isCoinbaseWallet,
                            isBase: !!anyWindow.ethereum.isBase,
                        };
                        console.log("[Wallet] window.ethereum info:", windowProviderInfo);
                        
                        ethProv = anyWindow.ethereum;
                        console.log("[Wallet] Using window.ethereum as provider");
                        isMini = true;
                    } else if (anyWindow.coinbaseWalletExtension) {
                        ethProv = anyWindow.coinbaseWalletExtension;
                        console.log("[Wallet] Got provider via coinbaseWalletExtension");
                        isMini = true;
                    }
                }

                if (ethProv) {
                    console.log("[Wallet] Got ethereum provider:", typeof ethProv);
                }
            } catch (err) {
                console.warn("[Wallet] SDK wallet failed:", err);
                ethProv = null;
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
                        throw new Error("Could not get wallet address. Please make sure you have a wallet connected.");
                    }
                }

                console.log("[Wallet] Connected via Farcaster:", addr);
            } else {

                setUsingMiniApp(false);
                const anyWindow = window as any;


                const browserProvider = anyWindow.ethereum || anyWindow.web3?.currentProvider;

                if (!browserProvider) {
                    const errorMsg = isMobile
                        ? "No wallet found. Please install Coinbase Wallet or MetaMask."
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

    async function handleMintLand() {
        try {
            setMintStatus("Preparing to mint 1 Land (199.99 USDC)…");
            const okAllowance = await txAction().ensureUsdcAllowance(
                LAND_ADDRESS,
                LAND_PRICE_USDC
            );
            if (!okAllowance) return;

            const data = landInterface.encodeFunctionData("mint", []);
            
            // Try sponsored transaction first if wallet supports it
            if (supportsSponsorship) {
                setMintStatus("Minting Land (gas sponsored)…");
                const sponsoredResult = await sendSponsoredTransaction(LAND_ADDRESS, data);
                if (sponsoredResult) {
                    setMintStatus("Land mint submitted ✅ Gas was sponsored!");
                    return;
                }
                // Fall back to regular tx if sponsored fails
                setMintStatus("Sponsorship unavailable, using regular transaction…");
            }
            
            const tx = await txAction().sendContractTx(LAND_ADDRESS, data);
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
            setMintStatus("Preparing to mint 1 Plant (49.99 USDC)…");
            const okAllowance = await txAction().ensureUsdcAllowance(
                PLANT_ADDRESS,
                PLANT_PRICE_USDC
            );
            if (!okAllowance) return;

            const data = plantInterface.encodeFunctionData("mint", []);
            
            // Try sponsored transaction first if wallet supports it
            if (supportsSponsorship) {
                setMintStatus("Minting Plant (gas sponsored)…");
                const sponsoredResult = await sendSponsoredTransaction(PLANT_ADDRESS, data);
                if (sponsoredResult) {
                    setMintStatus("Plant mint submitted ✅ Gas was sponsored!");
                    return;
                }
                // Fall back to regular tx if sponsored fails
                setMintStatus("Sponsorship unavailable, using regular transaction…");
            }
            
            const tx = await txAction().sendContractTx(PLANT_ADDRESS, data);
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

    // Cache for owned NFTs - defined before functions that use it
    const ownedCacheRef = useRef<{
        addr: string | null;
        state: any | null;
    }>({ addr: null, state: null });

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
            if (!landApproved) await waitForTx(await txAction().sendContractTx(LAND_ADDRESS, erc721Interface.encodeFunctionData("setApprovalForAll", [SUPER_LAND_ADDRESS, true])));
            setMintStatus("Approving FCWEED…");
            const fcweedAllowance = await fcweedRead.allowance(ctx.userAddress, SUPER_LAND_ADDRESS);
            if (fcweedAllowance.lt(SUPER_LAND_FCWEED_COST)) await waitForTx(await txAction().sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [SUPER_LAND_ADDRESS, ethers.constants.MaxUint256])));
            setMintStatus("Upgrading…");
            await waitForTx(await txAction().sendContractTx(SUPER_LAND_ADDRESS, superLandInterface.encodeFunctionData("upgrade", [selectedLandForUpgrade])));
            setMintStatus("Super Land minted ✅");
            setUpgradeModalOpen(false); setSelectedLandForUpgrade(null);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err: any) { setMintStatus("Upgrade failed: " + (err?.message || err)); }
        finally { setActionLoading(false); }
    }

    // Helper function to fetch SuperLands on-chain when API doesn't return them
    async function fetchSuperLandsOnChain(addr: string): Promise<{tokenId: string, staked: boolean, boost: number}[]> {
        console.log("[NFT] Fetching SuperLands on-chain for:", addr);
        const ownedSuperLands: {tokenId: string, staked: boolean, boost: number}[] = [];
        
        try {
            // SuperLands have limited supply, check IDs 1-100
            const ids = Array.from({ length: 100 }, (_, i) => i + 1);
            const ownerCalls = ids.map(id => ({
                target: SUPER_LAND_ADDRESS,
                callData: erc721Interface.encodeFunctionData("ownerOf", [id])
            }));
            
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            const results = await mc.callStatic.tryAggregate(false, ownerCalls);
            
            results.forEach((result: any, i: number) => {
                if (result.success) {
                    try {
                        const owner = ethers.utils.defaultAbiCoder.decode(["address"], result.returnData)[0];
                        if (owner && owner.toLowerCase() === addr.toLowerCase()) {
                            ownedSuperLands.push({ tokenId: String(ids[i]), staked: false, boost: 0 });
                        }
                    } catch {}
                }
            });
            
            console.log("[NFT] Found SuperLands on-chain:", ownedSuperLands.map(s => s.tokenId));
        } catch (err) {
            console.error("[NFT] Failed to fetch SuperLands on-chain:", err);
        }
        
        return ownedSuperLands;
    }

    async function getOwnedState(addr: string, forceRefresh: boolean = false) {
        console.log("[NFT] getOwnedState called for:", addr, "forceRefresh:", forceRefresh);

        if (!forceRefresh && ownedCacheRef.current.addr?.toLowerCase() === addr.toLowerCase() && ownedCacheRef.current.state)
        {
            console.log("[NFT] Returning cached state");
            return ownedCacheRef.current.state;
        }

        try {
            console.log("[NFT] Fetching owned tokens from API...");
            const state = await loadOwnedTokens(addr);
            
            // If API didn't return NFTs properly, fetch on-chain
            let plantsToUse = state.plants || [];
            let landsToUse = state.lands || [];
            let superLandsToUse = state.superLands || [];
            
            // Fetch on-chain to verify/supplement API data
            try {
                console.log("[NFT] Verifying with on-chain data...");
                const plantContract = new ethers.Contract(PLANT_ADDRESS, ERC721_VIEW_ABI, readProvider);
                const landContract = new ethers.Contract(LAND_ADDRESS, ERC721_VIEW_ABI, readProvider);
                
                const [plantBal, landBal] = await Promise.all([
                    plantContract.balanceOf(addr),
                    landContract.balanceOf(addr),
                ]);
                
                const plantCount = plantBal.toNumber();
                const landCount = landBal.toNumber();
                
                console.log("[NFT] On-chain balances - Plants:", plantCount, "Lands:", landCount);
                
                // If on-chain shows more than API returned, fetch all on-chain
                if (plantCount > 0 && plantsToUse.length < plantCount) {
                    console.log("[NFT] Fetching plants on-chain...");
                    const plantIds: any[] = [];
                    // Check first 1200 token IDs (total supply is 1111)
                    const plantCheckCalls = Array.from({ length: 1200 }, (_, i) => ({
                        target: PLANT_ADDRESS,
                        callData: erc721Interface.encodeFunctionData("ownerOf", [i + 1])
                    }));
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const plantResults = await mc.callStatic.tryAggregate(false, plantCheckCalls);
                    plantResults.forEach((result: any, i: number) => {
                        if (result.success) {
                            try {
                                const owner = ethers.utils.defaultAbiCoder.decode(["address"], result.returnData)[0];
                                if (owner && owner.toLowerCase() === addr.toLowerCase()) {
                                    plantIds.push({ tokenId: String(i + 1), staked: false, boost: 0 });
                                }
                            } catch {}
                        }
                    });
                    if (plantIds.length > 0) {
                        plantsToUse = plantIds;
                        console.log("[NFT] Found plants on-chain:", plantIds.length);
                    }
                }
                
                if (landCount > 0 && landsToUse.length < landCount) {
                    console.log("[NFT] Fetching lands on-chain...");
                    const landIds: any[] = [];
                    // Check first 500 token IDs (total supply is 420)
                    const landCheckCalls = Array.from({ length: 500 }, (_, i) => ({
                        target: LAND_ADDRESS,
                        callData: erc721Interface.encodeFunctionData("ownerOf", [i + 1])
                    }));
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const landResults = await mc.callStatic.tryAggregate(false, landCheckCalls);
                    landResults.forEach((result: any, i: number) => {
                        if (result.success) {
                            try {
                                const owner = ethers.utils.defaultAbiCoder.decode(["address"], result.returnData)[0];
                                if (owner && owner.toLowerCase() === addr.toLowerCase()) {
                                    landIds.push({ tokenId: String(i + 1), staked: false, boost: 0 });
                                }
                            } catch {}
                        }
                    });
                    if (landIds.length > 0) {
                        landsToUse = landIds;
                        console.log("[NFT] Found lands on-chain:", landIds.length);
                    }
                }
            } catch (onChainErr) {
                console.error("[NFT] On-chain verification failed:", onChainErr);
            }
            
            // Always fetch SuperLands on-chain since API often misses them
            if (superLandsToUse.length === 0) {
                console.log("[NFT] No SuperLands from API, fetching on-chain...");
                superLandsToUse = await fetchSuperLandsOnChain(addr);
            }
            
            const finalState = {
                ...state,
                plants: plantsToUse,
                lands: landsToUse,
                superLands: superLandsToUse,
                totals: {
                    plants: plantsToUse.length,
                    lands: landsToUse.length,
                    superLands: superLandsToUse.length
                }
            };
            
            console.log("[NFT] Final owned state:", {
                plants: finalState.plants?.length || 0,
                lands: finalState.lands?.length || 0,
                superLands: finalState.superLands?.length || 0,
                totals: finalState.totals
            });
            ownedCacheRef.current = { addr, state: finalState };
            return finalState;
        } catch (err) {
            console.error("[NFT] Failed to load owned tokens:", err);
            
            // On error, fetch everything on-chain
            console.log("[NFT] Falling back to full on-chain fetch...");
            const plantIds: any[] = [];
            const landIds: any[] = [];
            
            try {
                const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                
                // Fetch plants on-chain
                const plantCheckCalls = Array.from({ length: 1200 }, (_, i) => ({
                    target: PLANT_ADDRESS,
                    callData: erc721Interface.encodeFunctionData("ownerOf", [i + 1])
                }));
                const plantResults = await mc.callStatic.tryAggregate(false, plantCheckCalls);
                plantResults.forEach((result: any, i: number) => {
                    if (result.success) {
                        try {
                            const owner = ethers.utils.defaultAbiCoder.decode(["address"], result.returnData)[0];
                            if (owner && owner.toLowerCase() === addr.toLowerCase()) {
                                plantIds.push({ tokenId: String(i + 1), staked: false, boost: 0 });
                            }
                        } catch {}
                    }
                });
                
                // Fetch lands on-chain
                const landCheckCalls = Array.from({ length: 500 }, (_, i) => ({
                    target: LAND_ADDRESS,
                    callData: erc721Interface.encodeFunctionData("ownerOf", [i + 1])
                }));
                const landResults = await mc.callStatic.tryAggregate(false, landCheckCalls);
                landResults.forEach((result: any, i: number) => {
                    if (result.success) {
                        try {
                            const owner = ethers.utils.defaultAbiCoder.decode(["address"], result.returnData)[0];
                            if (owner && owner.toLowerCase() === addr.toLowerCase()) {
                                landIds.push({ tokenId: String(i + 1), staked: false, boost: 0 });
                            }
                        } catch {}
                    }
                });
            } catch (mcErr) {
                console.error("[NFT] Multicall on-chain fetch failed:", mcErr);
            }
            
            const onChainSuperLands = await fetchSuperLandsOnChain(addr);

            return {
                wallet: addr,
                plants: plantIds,
                lands: landIds,
                superLands: onChainSuperLands,
                totals: { plants: plantIds.length, lands: landIds.length, superLands: onChainSuperLands.length }
            };
        }
    }

    async function ensureCollectionApproval(collectionAddress: string, stakingAddress: string, ctx: { signer: ethers.Signer; userAddress: string }) {
        const nftRead = new ethers.Contract(collectionAddress, ERC721_VIEW_ABI, readProvider);
        if (!(await nftRead.isApprovedForAll(ctx.userAddress, stakingAddress))) {
            const tx = await txAction().sendContractTx(collectionAddress, erc721Interface.encodeFunctionData("setApprovalForAll", [stakingAddress, true]));
            if (!tx) throw new Error("Approval rejected");
            await waitForTx(tx);
        }
    }

    // Leaderboard refresh function - Uses API for fast loading
    async function refreshLeaderboard() {
        setLeaderboardLoading(true);
        try {
            const data = await loadLeaderboard({ limit: 50 });
            setLeaderboardItems(data.items);
            setFarmerCount(data.items.length);
            
            // Find user's rank if connected
            if (userAddress) {
                const userIdx = data.items.findIndex(
                    (item) => item.staker.toLowerCase() === userAddress.toLowerCase()
                );
                if (userIdx !== -1) {
                    setUserLeaderboardRank(userIdx + 1);
                    setUserLeaderboardRow(data.items[userIdx]);
                } else {
                    setUserLeaderboardRank(null);
                    setUserLeaderboardRow(null);
                }
            }
        } catch (err) {
            console.error("[Leaderboard] Failed to load:", err);
        } finally {
            setLeaderboardLoading(false);
        }
    }

    // Load leaderboard on mount and when user connects
    useEffect(() => {
        refreshLeaderboard();
    }, [userAddress]);

    // Token supply stats
    const FCWEED_TOKEN = "0x42ef01219BDb2190F275Cda7956D08822549d224";
    const DEAD_ADDRESS = "0x000000000000000000000000000000000000dEaD";
    const TREASURY_ADDRESS = "0x5A567898881cef8DF767D192B74d99513cAa6e46";
    const LP_POOL_ADDRESS = "0xA1A1B6b489Ceb413999ccCe73415D4fA92e826A1";

    // NFT Supply tracking
    const [nftSupply, setNftSupply] = useState<{ plants: number; lands: number; superLands: number; loading: boolean }>({ plants: 0, lands: 0, superLands: 0, loading: true });

    async function loadTokenStats() {
        try {
            console.log("[TokenStats] Loading token stats...");
            // Use full ERC20 ABI for totalSupply
            const fullErc20Abi = [
                "function totalSupply() view returns (uint256)",
                "function balanceOf(address) view returns (uint256)",
            ];
            const tokenContract = new ethers.Contract(FCWEED_TOKEN, fullErc20Abi, readProvider);
            
            const [totalSupply, burnedRaw, treasuryRaw, lpPoolRaw] = await Promise.all([
                tokenContract.totalSupply(),
                tokenContract.balanceOf(DEAD_ADDRESS),
                tokenContract.balanceOf(TREASURY_ADDRESS),
                tokenContract.balanceOf(LP_POOL_ADDRESS),
            ]);

            console.log("[TokenStats] Raw values:", { 
                totalSupply: totalSupply.toString(), 
                burned: burnedRaw.toString(), 
                treasury: treasuryRaw.toString(),
                lpPool: lpPoolRaw.toString()
            });

            const burned = parseFloat(ethers.utils.formatUnits(burnedRaw, 18));
            const treasury = parseFloat(ethers.utils.formatUnits(treasuryRaw, 18));
            const lpPool = parseFloat(ethers.utils.formatUnits(lpPoolRaw, 18));
            const total = parseFloat(ethers.utils.formatUnits(totalSupply, 18));
            const controlled = burned + treasury;

            const controlledPct = total > 0 ? ((controlled / total) * 100).toFixed(2) : "0";
            const lpPoolPct = total > 0 ? ((lpPool / total) * 100).toFixed(2) : "0";

            const formatNum = (n: number) => {
                if (n >= 1e12) return (n / 1e12).toFixed(2) + "T";
                if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
                if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
                if (n >= 1e3) return (n / 1e3).toFixed(2) + "K";
                return n.toFixed(0);
            };

            console.log("[TokenStats] Formatted:", { burned: formatNum(burned), treasury: formatNum(treasury), controlledPct, lpPoolPct });

            setTokenStats({
                burned: formatNum(burned),
                treasury: formatNum(treasury),
                controlledPct,
                circulatingPct: lpPoolPct, // This is now the LP pool percentage
                loading: false
            });
        } catch (err) {
            console.error("[TokenStats] Failed to load:", err);
            setTokenStats(prev => ({ ...prev, loading: false }));
        }
    }

    async function loadNftSupply() {
        try {
            console.log("[NFTSupply] Loading NFT supply...");
            const nftAbi = [
                "function totalMinted() view returns (uint256)",
                "function maxSupply() view returns (uint256)"
            ];
            const nftInterface = new ethers.utils.Interface(nftAbi);
            
            // Use multicall for better reliability
            const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
            const totalMintedCallData = nftInterface.encodeFunctionData("totalMinted");
            
            const calls = [
                { target: PLANT_ADDRESS, callData: totalMintedCallData },
                { target: LAND_ADDRESS, callData: totalMintedCallData },
                { target: SUPER_LAND_ADDRESS, callData: totalMintedCallData },
            ];

            console.log("[NFTSupply] Making multicall to:", { PLANT_ADDRESS, LAND_ADDRESS, SUPER_LAND_ADDRESS });
            const results = await mc.callStatic.tryAggregate(false, calls);
            console.log("[NFTSupply] Raw results:", results);
            
            let plants = 0, lands = 0, superLands = 0;
            
            if (results[0].success && results[0].returnData !== "0x") {
                try {
                    const decoded = nftInterface.decodeFunctionResult("totalMinted", results[0].returnData);
                    plants = decoded[0].toNumber();
                    console.log("[NFTSupply] Plants minted:", plants);
                } catch (e) {
                    console.error("[NFTSupply] Failed to decode plants:", e);
                }
            } else {
                console.log("[NFTSupply] Plants call failed or empty");
            }
            
            if (results[1].success && results[1].returnData !== "0x") {
                try {
                    const decoded = nftInterface.decodeFunctionResult("totalMinted", results[1].returnData);
                    lands = decoded[0].toNumber();
                    console.log("[NFTSupply] Lands minted:", lands);
                } catch (e) {
                    console.error("[NFTSupply] Failed to decode lands:", e);
                }
            } else {
                console.log("[NFTSupply] Lands call failed or empty");
            }
            
            if (results[2].success && results[2].returnData !== "0x") {
                try {
                    const decoded = nftInterface.decodeFunctionResult("totalMinted", results[2].returnData);
                    superLands = decoded[0].toNumber();
                    console.log("[NFTSupply] SuperLands minted:", superLands);
                } catch (e) {
                    console.error("[NFTSupply] Failed to decode superLands:", e);
                }
            } else {
                console.log("[NFTSupply] SuperLands call failed or empty");
            }

            console.log("[NFTSupply] Final results:", { plants, lands, superLands });

            setNftSupply({
                plants,
                lands,
                superLands,
                loading: false
            });
        } catch (err) {
            console.error("[NFTSupply] Failed to load:", err);
            setNftSupply(prev => ({ ...prev, loading: false }));
        }
    }

    // Load token stats and NFT supply on mount with small delay for provider readiness
    useEffect(() => {
        const timer = setTimeout(() => {
            loadTokenStats();
            loadNftSupply();
        }, 1000); // Small delay to ensure provider is ready
        
        // Refresh every 60 seconds
        const interval = setInterval(() => {
            loadTokenStats();
            loadNftSupply();
        }, 60000);
        
        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        };
    }, []);

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

    const refreshV4StakingRef = useRef(false);
    async function refreshV4Staking() {
        if (refreshV4StakingRef.current || !userAddress || !V4_STAKING_ADDRESS) return;
        refreshV4StakingRef.current = true;
        setLoadingV4Staking(true);
        try {
            const v4Contract = new ethers.Contract(V4_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
            const [userData, pendingRaw, capacity, stakedPlantIds, stakedLandIds, avgHealth, tokensPerDayRaw, landBoostBpsRaw, superLandBoostBpsRaw] = await Promise.all([
                v4Contract.users(userAddress), v4Contract.pending(userAddress), v4Contract.capacityOf(userAddress),
                v4Contract.plantsOf(userAddress), v4Contract.landsOf(userAddress), v4Contract.getAverageHealth(userAddress).catch(() => ethers.BigNumber.from(100)),
                v4Contract.tokensPerPlantPerDay(), v4Contract.landBoostBps(), v4Contract.superLandBoostBps()
            ]);
            const plantsCount = Number(userData.plants);
            const landsCount = Number(userData.lands);
            const superLandsCount = Number(userData.superLands);
            const water = userData.waterBalance;

            // Calculate boost and daily immediately
            const tokensPerDay = parseFloat(ethers.utils.formatUnits(tokensPerDayRaw, 18));
            const landBoostBps = landBoostBpsRaw.toNumber();
            const superLandBoostBps = superLandBoostBpsRaw.toNumber();
            const landBoostPct = (landsCount * landBoostBps) / 100;
            const superLandBoostPct = (superLandsCount * superLandBoostBps) / 100;
            const totalBoostPct = 100 + landBoostPct + superLandBoostPct;
            const dailyBase = plantsCount * tokensPerDay;
            const dailyWithBoost = dailyBase * totalBoostPct / 100;
            const dailyDisplay = dailyWithBoost >= 1e6 ? (dailyWithBoost / 1e6).toFixed(2) + "M" : dailyWithBoost >= 1e3 ? (dailyWithBoost / 1e3).toFixed(1) + "K" : dailyWithBoost.toFixed(0);
            const pendingFormatted = parseFloat(ethers.utils.formatUnits(pendingRaw, 18));

            // Set stats immediately so UI updates right away
            setV4StakingStats({
                plants: plantsCount,
                lands: landsCount,
                superLands: superLandsCount,
                capacity: capacity.toNumber(),
                avgHealth: avgHealth.toNumber(),
                water,
                pendingRaw,
                pendingFormatted,
                boostPct: totalBoostPct - 100,
                dailyRewards: dailyDisplay
            });
            const display = pendingFormatted >= 1e6 ? (pendingFormatted / 1e6).toFixed(4) + "M" : pendingFormatted >= 1e3 ? (pendingFormatted / 1e3).toFixed(2) + "K" : pendingFormatted.toFixed(2);
            setV4RealTimePending(display);

            const stakedPlantNums = stakedPlantIds.map((id: any) => Number(id));
            const stakedLandNums = stakedLandIds.map((id: any) => Number(id));
            console.log("[V4Staking] stakedPlantNums:", stakedPlantNums);
            console.log("[V4Staking] plantsCount from userData:", plantsCount);
            console.log("[V4Staking] avgHealth from contract:", avgHealth.toNumber());
            
            const healthMap: Record<number, number> = {};
            const waterNeededMap: Record<number, number> = {};
            if (stakedPlantNums.length > 0) {
                try {
                    const healthCalls = stakedPlantNums.map((id: number) => ({ target: V4_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getPlantHealth", [id]) }));
                    const waterCalls = stakedPlantNums.map((id: number) => ({ target: V4_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getWaterNeeded", [id]) }));
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    
                    // Use tryAggregate for better error handling
                    const healthResults = await mc.callStatic.tryAggregate(false, healthCalls);
                    const waterResults = await mc.callStatic.tryAggregate(false, waterCalls);
                    
                    stakedPlantNums.forEach((id: number, i: number) => {
                        if (healthResults[i].success) {
                            const health = ethers.BigNumber.from(healthResults[i].returnData).toNumber();
                            healthMap[id] = health;
                            console.log(`[V4Staking] Plant #${id} health: ${health}%`);
                        } else {
                            // If call failed, assume needs water (health 0)
                            healthMap[id] = 0;
                            console.log(`[V4Staking] Plant #${id} health call failed, assuming 0%`);
                        }
                        
                        if (waterResults[i].success) {
                            waterNeededMap[id] = parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(waterResults[i].returnData), 18));
                        } else {
                            waterNeededMap[id] = 1; // Assume needs at least 1L if call failed
                        }
                    });
                    
                    // Update avg health with actual calculated value
                    if (stakedPlantNums.length > 0) {
                        const totalHealth = Object.values(healthMap).reduce((a, b) => a + b, 0);
                        const calculatedAvgHealth = Math.round(totalHealth / stakedPlantNums.length);
                        setV4StakingStats((prev: any) => prev ? { ...prev, avgHealth: calculatedAvgHealth } : prev);
                    }
                } catch (err) { 
                    console.error("[V4Staking] Health fetch error:", err);
                    // On error, don't assume 100% - leave health unknown so user sees issue
                    stakedPlantNums.forEach((id: number) => { 
                        healthMap[id] = 0; // Show as needing water
                        waterNeededMap[id] = 1; 
                    }); 
                }
            }
            setV4PlantHealths(healthMap);
            setV4WaterNeeded(waterNeededMap);
            setV4StakedPlants(stakedPlantNums);
            setV4StakedLands(stakedLandNums);
            const owned = await getOwnedState(userAddress);
            const availPlants = owned.plants.filter((t: any) => !stakedPlantNums.includes(Number(t.tokenId))).map((t: any) => Number(t.tokenId));
            const availLands = owned.lands.filter((t: any) => !stakedLandNums.includes(Number(t.tokenId))).map((t: any) => Number(t.tokenId));
            const allOwnedSuperLandIds = owned.superLands.map((t: any) => Number(t.tokenId));
            const stakedSuperLandNums: number[] = [];
            const availSuperLandNums: number[] = [];

            console.log("[V4Staking] superLandsCount from contract:", superLandsCount);

            if (superLandsCount > 0) {
                const ids = Array.from({ length: 100 }, (_, i) => i + 1);
                let foundStaked = false;

                try {
                    const stakerCalls = ids.map(id => ({ target: V4_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("superLandStakerOf", [id]) }));
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const [, stakerResults] = await mc.callStatic.aggregate(stakerCalls);

                    ids.forEach((id, i) => {
                        try {
                            const staker = ethers.utils.defaultAbiCoder.decode(["address"], stakerResults[i])[0];
                            if (staker && staker !== ethers.constants.AddressZero && staker.toLowerCase() === userAddress.toLowerCase()) {
                                stakedSuperLandNums.push(id);
                                foundStaked = true;
                            }
                        } catch {}
                    });
                } catch (err) {
                    console.log("[V4Staking] Multicall failed, using individual calls");
                }

                if (!foundStaked && superLandsCount > 0) {
                    const v4Contract = new ethers.Contract(V4_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
                    for (let id = 1; id <= 100; id++) {
                        try {
                            const staker = await v4Contract.superLandStakerOf(id);
                            if (staker && staker !== ethers.constants.AddressZero && staker.toLowerCase() === userAddress.toLowerCase()) {
                                if (!stakedSuperLandNums.includes(id)) stakedSuperLandNums.push(id);
                            }
                        } catch {}
                    }
                }

                console.log("[V4Staking] Found staked super lands:", stakedSuperLandNums);

                allOwnedSuperLandIds.forEach((id: number) => {
                    if (!stakedSuperLandNums.includes(id)) {
                        availSuperLandNums.push(id);
                    }
                });
            } else if (allOwnedSuperLandIds.length > 0) {
                availSuperLandNums.push(...allOwnedSuperLandIds);
            }

            setV4StakedSuperLands(stakedSuperLandNums);
            setV4AvailablePlants(availPlants);
            setV4AvailableLands(availLands);
            setV4AvailableSuperLands(availSuperLandNums);

        } catch (err) { console.error("[V4Staking] Error:", err); }
        finally { refreshV4StakingRef.current = false; setLoadingV4Staking(false); }
    }

    useEffect(() => {
        if (v4StakingOpen && userAddress && V4_STAKING_ADDRESS) { refreshV4StakingRef.current = false; refreshV4Staking(); }
    }, [v4StakingOpen, userAddress]);

    useEffect(() => {
        if (!v4StakingOpen || !v4StakingStats) return;
        const { pendingRaw, plants } = v4StakingStats;
        if (!pendingRaw || plants === 0) return;
        let currentPending = pendingRaw;
        const tokensPerSecond = ethers.utils.parseUnits("300000", 18).div(86400);
        const effectivePerSecond = tokensPerSecond.mul(plants);
        const interval = setInterval(() => {
            currentPending = currentPending.add(effectivePerSecond.mul(v4StakingStats.avgHealth || 100).div(100));
            const formatted = parseFloat(ethers.utils.formatUnits(currentPending, 18));
            setV4RealTimePending(formatted >= 1e6 ? (formatted / 1e6).toFixed(4) + "M" : formatted >= 1e3 ? (formatted / 1e3).toFixed(2) + "K" : formatted.toFixed(2));
        }, 1000);
        return () => clearInterval(interval);
    }, [v4StakingOpen, v4StakingStats]);

    useEffect(() => {
        if (!v4StakingOpen || v4StakedPlants.length === 0 || !V4_STAKING_ADDRESS) return;
        const healthInterval = setInterval(async () => {
            try {
                const healthCalls = v4StakedPlants.map((id: number) => ({ target: V4_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getPlantHealth", [id]) }));
                const waterCalls = v4StakedPlants.map((id: number) => ({ target: V4_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getWaterNeeded", [id]) }));
                const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                
                // Use tryAggregate for better error handling
                const healthResults = await mc.callStatic.tryAggregate(false, healthCalls);
                const waterResults = await mc.callStatic.tryAggregate(false, waterCalls);
                
                const newHealthMap: Record<number, number> = {};
                const newWaterMap: Record<number, number> = {};
                v4StakedPlants.forEach((id: number, i: number) => {
                    if (healthResults[i].success) {
                        newHealthMap[id] = ethers.BigNumber.from(healthResults[i].returnData).toNumber();
                    } else {
                        newHealthMap[id] = 0; // Assume needs water if call failed
                    }
                    if (waterResults[i].success) {
                        newWaterMap[id] = parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(waterResults[i].returnData), 18));
                    } else {
                        newWaterMap[id] = 1;
                    }
                });
                setV4PlantHealths(newHealthMap);
                setV4WaterNeeded(newWaterMap);
                if (v4StakedPlants.length > 0) {
                    const avgHealth = Math.round(Object.values(newHealthMap).reduce((a, b) => a + b, 0) / v4StakedPlants.length);
                    setV4StakingStats((prev: any) => {
                        if (!prev) return prev;
                        // Update daily rewards based on new health
                        const tokensPerDay = 300000;
                        const boostMultiplier = (100 + (prev.boostPct || 0)) / 100;
                        const healthMultiplier = avgHealth / 100;
                        const dailyWithHealth = prev.plants * tokensPerDay * boostMultiplier * healthMultiplier;
                        const dailyDisplay = dailyWithHealth >= 1e6 ? (dailyWithHealth / 1e6).toFixed(2) + "M" : dailyWithHealth >= 1e3 ? (dailyWithHealth / 1e3).toFixed(1) + "K" : dailyWithHealth.toFixed(0);
                        return { ...prev, avgHealth, dailyRewards: dailyDisplay };
                    });
                }
            } catch (err) { console.error("[V4] Health update failed:", err); }
        }, 5000);
        return () => clearInterval(healthInterval);
    }, [v4StakingOpen, v4StakedPlants]);
    
    async function handleV4StakePlants() {
        if (selectedV4AvailPlants.length === 0) return;
        try {
            setActionLoading(true); setV4ActionStatus("Approving...");
            const ctx = await ensureWallet(); if (!ctx) return;
            await ensureCollectionApproval(PLANT_ADDRESS, V4_STAKING_ADDRESS, ctx);
            setV4ActionStatus("Staking plants...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("stakePlants", [selectedV4AvailPlants]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Staked!");
            setSelectedV4AvailPlants([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) { setV4ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV4StakeLands() {
        if (selectedV4AvailLands.length === 0) return;
        try {
            setActionLoading(true); setV4ActionStatus("Approving...");
            const ctx = await ensureWallet(); if (!ctx) return;
            await ensureCollectionApproval(LAND_ADDRESS, V4_STAKING_ADDRESS, ctx);
            setV4ActionStatus("Staking lands...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("stakeLands", [selectedV4AvailLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Staked!");
            setSelectedV4AvailLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) { setV4ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV4StakeSuperLands() {
        if (selectedV4AvailSuperLands.length === 0) return;
        try {
            setActionLoading(true); setV4ActionStatus("Approving...");
            const ctx = await ensureWallet(); if (!ctx) return;
            await ensureCollectionApproval(SUPER_LAND_ADDRESS, V4_STAKING_ADDRESS, ctx);
            setV4ActionStatus("Staking super lands...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("stakeSuperLands", [selectedV4AvailSuperLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Staked!");
            setSelectedV4AvailSuperLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) { setV4ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV4UnstakePlants() {
        if (selectedV4StakedPlants.length === 0) return;
        const unhealthy = selectedV4StakedPlants.filter(id => (v4PlantHealths[id] ?? 0) < 100);
        if (unhealthy.length > 0) {
            const healthList = unhealthy.map(id => `#${id}: ${v4PlantHealths[id] ?? 0}%`).join(", ");
            setV4ActionStatus(`Water plants first! ${healthList}`);
            return;
        }
        try {
            setActionLoading(true); setV4ActionStatus("Unstaking plants...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakePlants", [selectedV4StakedPlants]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Unstaked!");
            setSelectedV4StakedPlants([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) {
            if (err.message?.includes("!healthy") || err.reason?.includes("!healthy")) {
                setV4ActionStatus("Plants need 100% health! Water them first.");
            } else {
                setV4ActionStatus("Error: " + (err.reason || err.message || err));
            }
        }
        finally { setActionLoading(false); }
    }

    async function handleV4UnstakeLands() {
        if (selectedV4StakedLands.length === 0) return;
        try {
            setActionLoading(true); setV4ActionStatus("Unstaking lands...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakeLands", [selectedV4StakedLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Unstaked!");
            setSelectedV4StakedLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) { setV4ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV4UnstakeSuperLands() {
        if (selectedV4StakedSuperLands.length === 0) return;
        try {
            setActionLoading(true); setV4ActionStatus("Unstaking super lands...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakeSuperLands", [selectedV4StakedSuperLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Unstaked!");
            setSelectedV4StakedSuperLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) { setV4ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV4Claim() {
        if (!v4StakingStats || v4StakingStats.pendingFormatted <= 0) { setV4ActionStatus("No rewards."); return; }
        try {
            setActionLoading(true); setV4ActionStatus("Claiming...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("claim", []));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Claimed!");
            setV4RealTimePending("0.00");
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) { setV4ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV4WaterPlants() {
        if (selectedV4PlantsToWater.length === 0) return;
        try {
            setActionLoading(true); setV4ActionStatus("Watering plants...");
            const tx = await txAction().sendContractTx(V4_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("waterPlants", [selectedV4PlantsToWater]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV4ActionStatus("Plants watered!");
            setSelectedV4PlantsToWater([]);
            setV4CustomWaterAmounts({});
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
        } catch (err: any) { setV4ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    // ==================== V5 STAKING ====================
    const refreshV5StakingRef = useRef(false);

    async function refreshV5Staking() {
        if (refreshV5StakingRef.current || !userAddress || !V5_STAKING_ADDRESS) return;
        refreshV5StakingRef.current = true;
        setLoadingV5Staking(true);
        
        try {
            const v5Contract = new ethers.Contract(V5_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
            const [userData, pendingRaw, capacity, stakedPlantIds, stakedLandIds, stakedSuperLandIds, avgHealth, tokensPerDayRaw, landBoostBpsRaw, superLandBoostBpsRaw] = await Promise.all([
                v5Contract.users(userAddress), v5Contract.pending(userAddress), v5Contract.capacityOf(userAddress),
                v5Contract.plantsOf(userAddress), v5Contract.landsOf(userAddress), v5Contract.superLandsOf(userAddress).catch(() => []),
                v5Contract.getAverageHealth(userAddress).catch(() => ethers.BigNumber.from(100)),
                v5Contract.tokensPerPlantPerDay(), v5Contract.landBoostBps(), v5Contract.superLandBoostBps()
            ]);
            const plantsCount = Number(userData.plants);
            const landsCount = Number(userData.lands);
            const superLandsCount = Number(userData.superLands);
            const water = userData.waterBalance;

            const tokensPerDay = parseFloat(ethers.utils.formatUnits(tokensPerDayRaw, 18));
            const landBoostBps = landBoostBpsRaw.toNumber();
            const superLandBoostBps = superLandBoostBpsRaw.toNumber();
            const landBoostPct = (landsCount * landBoostBps) / 100;
            const superLandBoostPct = (superLandsCount * superLandBoostBps) / 100;
            const totalBoostPct = 100 + landBoostPct + superLandBoostPct;
            const dailyBase = plantsCount * tokensPerDay;
            const dailyWithBoost = dailyBase * totalBoostPct / 100;
            const dailyDisplay = dailyWithBoost >= 1e6 ? (dailyWithBoost / 1e6).toFixed(2) + "M" : dailyWithBoost >= 1e3 ? (dailyWithBoost / 1e3).toFixed(1) + "K" : dailyWithBoost.toFixed(0);
            const pendingFormatted = parseFloat(ethers.utils.formatUnits(pendingRaw, 18));

            setV5StakingStats({
                plants: plantsCount, lands: landsCount, superLands: superLandsCount,
                capacity: capacity.toNumber(), avgHealth: avgHealth.toNumber(), water, pendingRaw, pendingFormatted,
                boostPct: totalBoostPct - 100, dailyRewards: dailyDisplay
            });
            const display = pendingFormatted >= 1e6 ? (pendingFormatted / 1e6).toFixed(4) + "M" : pendingFormatted >= 1e3 ? (pendingFormatted / 1e3).toFixed(2) + "K" : pendingFormatted.toFixed(2);
            setV5RealTimePending(display);

            try {
                const cooldownAbi = ["function getNextClaimTime(address) view returns (uint256)"];
                const v5CooldownContract = new ethers.Contract(V5_STAKING_ADDRESS, cooldownAbi, readProvider);
                const nextClaimTime = await v5CooldownContract.getNextClaimTime(userAddress);
                const nextClaimTs = nextClaimTime.toNumber();
                const now = Math.floor(Date.now() / 1000);
                const remaining = nextClaimTs > now ? nextClaimTs - now : 0;
                setV5ClaimCooldown(remaining);
            } catch (e) {
                console.error("[V5] Failed to get claim cooldown:", e);
                setV5ClaimCooldown(0);
            }

            const stakedPlantNums = stakedPlantIds.map((id: any) => Number(id));
            const stakedLandNums = stakedLandIds.map((id: any) => Number(id));
            const stakedSuperLandNums = stakedSuperLandIds.map((id: any) => Number(id));
            console.log("[V5] Staked Super Lands from contract:", stakedSuperLandNums);

            const healthMap: Record<number, number> = {};
            const waterNeededMap: Record<number, number> = {};
            if (stakedPlantNums.length > 0) {
                try {
                    const healthCalls = stakedPlantNums.map((id: number) => ({ target: V5_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getPlantHealth", [id]) }));
                    const waterCalls = stakedPlantNums.map((id: number) => ({ target: V5_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getWaterNeeded", [id]) }));
                    const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                    const healthResults = await mc.tryAggregate(false, healthCalls);
                    const waterResults = await mc.tryAggregate(false, waterCalls);
                    console.log("[V5] Health results:", healthResults);
                    stakedPlantNums.forEach((id: number, i: number) => {
                        try {
                            if (healthResults[i].success) {
                                // Decode the ABI-encoded return data
                                const decoded = v4StakingInterface.decodeFunctionResult("getPlantHealth", healthResults[i].returnData);
                                healthMap[id] = decoded[0].toNumber();
                                console.log(`[V5] Plant #${id} health: ${healthMap[id]}%`);
                            } else {
                                healthMap[id] = 0; // Show as needing water if call failed
                                console.log(`[V5] Plant #${id} health call failed`);
                            }
                            if (waterResults[i].success) {
                                const decoded = v4StakingInterface.decodeFunctionResult("getWaterNeeded", waterResults[i].returnData);
                                waterNeededMap[id] = parseFloat(ethers.utils.formatUnits(decoded[0], 18));
                            } else {
                                waterNeededMap[id] = 1; // Assume needs water if call failed
                            }
                        } catch (decodeErr) {
                            console.error(`[V5] Decode error for plant #${id}:`, decodeErr);
                            healthMap[id] = 0;
                            waterNeededMap[id] = 1;
                        }
                    });
                    if (stakedPlantNums.length > 0) {
                        const totalHealth = Object.values(healthMap).reduce((a, b) => a + b, 0);
                        const calculatedAvgHealth = Math.round(totalHealth / stakedPlantNums.length);
                        console.log(`[V5] Calculated avg health: ${calculatedAvgHealth}%`);
                        // Also update daily rewards based on health
                        const healthMultiplier = calculatedAvgHealth / 100;
                        const adjustedDaily = dailyWithBoost * healthMultiplier;
                        const adjustedDailyDisplay = adjustedDaily >= 1e6 ? (adjustedDaily / 1e6).toFixed(2) + "M" : adjustedDaily >= 1e3 ? (adjustedDaily / 1e3).toFixed(1) + "K" : adjustedDaily.toFixed(0);
                        setV5StakingStats((prev: any) => prev ? { ...prev, avgHealth: calculatedAvgHealth, dailyRewards: adjustedDailyDisplay } : prev);
                    }
                } catch (err) {
                    console.error("[V5] Health multicall error:", err);
                    stakedPlantNums.forEach((id: number) => { healthMap[id] = 0; waterNeededMap[id] = 1; });
                }
            }
            setV5PlantHealths(healthMap);
            setV5WaterNeeded(waterNeededMap);
            setV5StakedPlants(stakedPlantNums);
            setV5StakedLands(stakedLandNums);

            // Force refresh owned state to get latest NFT data
            ownedCacheRef.current = { addr: "", state: null };
            const owned = await getOwnedState(userAddress, true);

            // Exclude NFTs staked in V4 from available
            let v4StakedPlantIds: number[] = [];
            let v4StakedLandIds: number[] = [];
            try {
                const v4Contract = new ethers.Contract(V4_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
                const [v4Plants, v4Lands] = await Promise.all([
                    v4Contract.plantsOf(userAddress).catch(() => []),
                    v4Contract.landsOf(userAddress).catch(() => []),
                ]);
                v4StakedPlantIds = v4Plants.map((id: any) => Number(id));
                v4StakedLandIds = v4Lands.map((id: any) => Number(id));
            } catch (err) { console.log("[V5] Failed to get V4 staked NFTs"); }

            const allStakedPlants = [...stakedPlantNums, ...v4StakedPlantIds];
            const allStakedLands = [...stakedLandNums, ...v4StakedLandIds];

            const availPlants = owned.plants.filter((t: any) => !allStakedPlants.includes(Number(t.tokenId))).map((t: any) => Number(t.tokenId));
            const availLands = owned.lands.filter((t: any) => !allStakedLands.includes(Number(t.tokenId))).map((t: any) => Number(t.tokenId));
            const allOwnedSuperLandIds = owned.superLands.map((t: any) => Number(t.tokenId));

            // Check V4 super lands too
            let v4StakedSuperLandIds: number[] = [];
            try {
                const v4Contract = new ethers.Contract(V4_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
                const v4SuperLands = await v4Contract.superLandsOf(userAddress).catch(() => []);
                v4StakedSuperLandIds = v4SuperLands.map((id: any) => Number(id));
            } catch {}

            // Available super lands = owned but not staked in V5 or V4
            const availSuperLandNums = allOwnedSuperLandIds.filter((id: number) =>
                !stakedSuperLandNums.includes(id) && !v4StakedSuperLandIds.includes(id)
            );

            setV5StakedSuperLands(stakedSuperLandNums);
            setV5AvailablePlants(availPlants);
            setV5AvailableLands(availLands);
            setV5AvailableSuperLands(availSuperLandNums);

        } catch (err) { console.error("[V5Staking] Error:", err); }
        finally { refreshV5StakingRef.current = false; setLoadingV5Staking(false); }
    }

    useEffect(() => {
        if (userAddress && V5_STAKING_ADDRESS) { refreshV5StakingRef.current = false; refreshV5Staking(); }
    }, [v5StakingOpen, userAddress]);

    useEffect(() => {
        if (!v5StakingOpen || !v5StakingStats) return;
        const { pendingRaw, plants } = v5StakingStats;
        if (!pendingRaw || plants === 0) return;
        let currentPending = pendingRaw;
        const tokensPerSecond = ethers.utils.parseUnits("300000", 18).div(86400);
        const effectivePerSecond = tokensPerSecond.mul(plants);
        const interval = setInterval(() => {
            currentPending = currentPending.add(effectivePerSecond.mul(v5StakingStats.avgHealth || 100).div(100));
            const formatted = parseFloat(ethers.utils.formatUnits(currentPending, 18));
            setV5RealTimePending(formatted >= 1e6 ? (formatted / 1e6).toFixed(4) + "M" : formatted >= 1e3 ? (formatted / 1e3).toFixed(2) + "K" : formatted.toFixed(2));
        }, 1000);
        return () => clearInterval(interval);
    }, [v5StakingOpen, v5StakingStats]);

    useEffect(() => {
        if (!v5StakingOpen || v5ClaimCooldown <= 0) return;
        const interval = setInterval(() => {
            setV5ClaimCooldown((prev) => (prev > 0 ? prev - 1 : 0));
        }, 1000);
        return () => clearInterval(interval);
    }, [v5StakingOpen, v5ClaimCooldown > 0]);

    useEffect(() => {
        if (!v5StakingOpen || v5StakedPlants.length === 0 || !V5_STAKING_ADDRESS) return;
        const healthInterval = setInterval(async () => {
            try {
                const healthCalls = v5StakedPlants.map((id: number) => ({ target: V5_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getPlantHealth", [id]) }));
                const waterCalls = v5StakedPlants.map((id: number) => ({ target: V5_STAKING_ADDRESS, callData: v4StakingInterface.encodeFunctionData("getWaterNeeded", [id]) }));
                const mc = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, readProvider);
                const healthResults = await mc.tryAggregate(false, healthCalls);
                const waterResults = await mc.tryAggregate(false, waterCalls);
                const newHealthMap: Record<number, number> = {};
                const newWaterMap: Record<number, number> = {};
                v5StakedPlants.forEach((id: number, i: number) => {
                    try {
                        if (healthResults[i].success) {
                            const decoded = v4StakingInterface.decodeFunctionResult("getPlantHealth", healthResults[i].returnData);
                            newHealthMap[id] = decoded[0].toNumber();
                        } else {
                            newHealthMap[id] = v5PlantHealths[id] ?? 0;
                        }
                        if (waterResults[i].success) {
                            const decoded = v4StakingInterface.decodeFunctionResult("getWaterNeeded", waterResults[i].returnData);
                            newWaterMap[id] = parseFloat(ethers.utils.formatUnits(decoded[0], 18));
                        } else {
                            newWaterMap[id] = v5WaterNeeded[id] ?? 1;
                        }
                    } catch {
                        newHealthMap[id] = v5PlantHealths[id] ?? 0;
                        newWaterMap[id] = v5WaterNeeded[id] ?? 1;
                    }
                });
                setV5PlantHealths(newHealthMap);
                setV5WaterNeeded(newWaterMap);
                if (v5StakedPlants.length > 0) {
                    const avgHealth = Math.round(Object.values(newHealthMap).reduce((a, b) => a + b, 0) / v5StakedPlants.length);
                    setV5StakingStats((prev: any) => {
                        if (!prev) return prev;
                        // Update daily rewards based on new health
                        const tokensPerDay = 300000;
                        const boostMultiplier = (100 + (prev.boostPct || 0)) / 100;
                        const healthMultiplier = avgHealth / 100;
                        const dailyWithHealth = prev.plants * tokensPerDay * boostMultiplier * healthMultiplier;
                        const dailyDisplay = dailyWithHealth >= 1e6 ? (dailyWithHealth / 1e6).toFixed(2) + "M" : dailyWithHealth >= 1e3 ? (dailyWithHealth / 1e3).toFixed(1) + "K" : dailyWithHealth.toFixed(0);
                        return { ...prev, avgHealth, dailyRewards: dailyDisplay };
                    });
                }
            } catch (err) { console.error("[V5] Health update failed:", err); }
        }, 5000);
        return () => clearInterval(healthInterval);
    }, [v5StakingOpen, v5StakedPlants]);

    async function handleV5StakePlants() {
        if (selectedV5AvailPlants.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Approving...");
            const ctx = await ensureWallet();
            if (!ctx) { setV5ActionStatus("Wallet not connected"); setActionLoading(false); return; }
            await ensureCollectionApproval(PLANT_ADDRESS, V5_STAKING_ADDRESS, ctx);
            
            const data = v4StakingInterface.encodeFunctionData("stakePlants", [selectedV5AvailPlants]);
            
            // Try sponsored transaction first
            if (supportsSponsorship) {
                setV5ActionStatus("Staking plants (gas sponsored)...");
                const sponsoredResult = await sendSponsoredTransaction(V5_STAKING_ADDRESS, data);
                if (sponsoredResult) {
                    setV5ActionStatus("Staked! Gas was sponsored ✅");
                    setSelectedV5AvailPlants([]);
                    ownedCacheRef.current = { addr: null, state: null };
                    setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
                    setActionLoading(false);
                    return;
                }
            }
            
            setV5ActionStatus("Staking plants...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, data);
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Staked!");
            setSelectedV5AvailPlants([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV5StakeLands() {
        if (selectedV5AvailLands.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Approving...");
            const ctx = await ensureWallet();
            if (!ctx) { setV5ActionStatus("Wallet not connected"); setActionLoading(false); return; }
            await ensureCollectionApproval(LAND_ADDRESS, V5_STAKING_ADDRESS, ctx);
            
            const data = v4StakingInterface.encodeFunctionData("stakeLands", [selectedV5AvailLands]);
            
            // Try sponsored transaction first
            if (supportsSponsorship) {
                setV5ActionStatus("Staking lands (gas sponsored)...");
                const sponsoredResult = await sendSponsoredTransaction(V5_STAKING_ADDRESS, data);
                if (sponsoredResult) {
                    setV5ActionStatus("Staked! Gas was sponsored ✅");
                    setSelectedV5AvailLands([]);
                    ownedCacheRef.current = { addr: null, state: null };
                    setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
                    setActionLoading(false);
                    return;
                }
            }
            
            setV5ActionStatus("Staking lands...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, data);
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Staked!");
            setSelectedV5AvailLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV5StakeSuperLands() {
        if (selectedV5AvailSuperLands.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Approving...");
            const ctx = await ensureWallet();
            if (!ctx) { setV5ActionStatus("Wallet not connected"); setActionLoading(false); return; }
            await ensureCollectionApproval(SUPER_LAND_ADDRESS, V5_STAKING_ADDRESS, ctx);
            
            const data = v4StakingInterface.encodeFunctionData("stakeSuperLands", [selectedV5AvailSuperLands]);
            
            // Try sponsored transaction first
            if (supportsSponsorship) {
                setV5ActionStatus("Staking super lands (gas sponsored)...");
                const sponsoredResult = await sendSponsoredTransaction(V5_STAKING_ADDRESS, data);
                if (sponsoredResult) {
                    setV5ActionStatus("Staked! Gas was sponsored ✅");
                    setSelectedV5AvailSuperLands([]);
                    ownedCacheRef.current = { addr: null, state: null };
                    setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
                    setActionLoading(false);
                    return;
                }
            }
            
            setV5ActionStatus("Staking super lands...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, data);
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Staked!");
            setSelectedV5AvailSuperLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV5UnstakePlants() {
        if (selectedV5StakedPlants.length === 0) return;
        const unhealthy = selectedV5StakedPlants.filter(id => (v5PlantHealths[id] ?? 0) < 100);
        if (unhealthy.length > 0) {
            setV5ActionStatus(`Water plants first! ${unhealthy.map(id => `#${id}: ${v5PlantHealths[id] ?? 0}%`).join(", ")}`);
            return;
        }
        try {
            setActionLoading(true); setV5ActionStatus("Unstaking plants...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakePlants", [selectedV5StakedPlants]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Unstaked!");
            setSelectedV5StakedPlants([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) {
            if (err.message?.includes("!healthy") || err.reason?.includes("!healthy")) {
                setV5ActionStatus("Plants need 100% health! Water them first.");
            } else { setV5ActionStatus("Error: " + (err.reason || err.message || err)); }
        }
        finally { setActionLoading(false); }
    }

    async function handleV5UnstakeLands() {
        if (selectedV5StakedLands.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Unstaking lands...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakeLands", [selectedV5StakedLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Unstaked!");
            setSelectedV5StakedLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV5UnstakeSuperLands() {
        if (selectedV5StakedSuperLands.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Unstaking super lands...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakeSuperLands", [selectedV5StakedSuperLands]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Unstaked!");
            setSelectedV5StakedSuperLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV5Claim() {
        if (!v5StakingStats || v5StakingStats.pendingFormatted <= 0) { setV5ActionStatus("No rewards."); return; }
        try {
            setActionLoading(true); setV5ActionStatus("Claiming...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("claim", []));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Claimed!");
            setV5RealTimePending("0.00");
            // Refresh all balances after claim
            refreshAllData();
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }

    async function handleV5WaterPlants() {
        if (selectedV5PlantsToWater.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Watering plants...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("waterPlants", [selectedV5PlantsToWater]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Plants watered!");
            setSelectedV5PlantsToWater([]);
            setV5CustomWaterAmounts({});
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); }
        finally { setActionLoading(false); }
    }
    // ==================== END V5 STAKING ====================

    async function loadWaterShopInfo() {
        try {
            // Use V5 staking for water shop
            const v5Contract = new ethers.Contract(V5_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
            const [isOpen, shopTimeInfo, dailyRemaining, walletRemaining, pricePerLiter, shopEnabled, walletLimit] = await Promise.all([
                v5Contract.isShopOpen(),
                v5Contract.getShopTimeInfo(),
                v5Contract.getDailyWaterRemaining(),
                userAddress ? v5Contract.getWalletWaterRemaining(userAddress) : ethers.BigNumber.from(0),
                v5Contract.waterPricePerLiter(),
                v5Contract.waterShopEnabled(),
                userAddress ? v5Contract.getWalletWaterLimit(userAddress) : ethers.BigNumber.from(0),
            ]);

            let stakedPlantsCount = 0;
            if (userAddress) {
                try {
                    const userData = await v5Contract.users(userAddress);
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
            const ctx = await ensureWallet(); if (!ctx) { setWaterLoading(false); return; }
            const cost = ethers.utils.parseUnits((waterBuyAmount * (waterShopInfo?.pricePerLiter || 75000)).toString(), 18);
            const tokenContract = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            const allowance = await tokenContract.allowance(userAddress, V5_STAKING_ADDRESS);
            if (allowance.lt(cost)) {
                const approveTx = await txAction().sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [V5_STAKING_ADDRESS, ethers.constants.MaxUint256]));
                if (!approveTx) throw new Error("Approval rejected");
                await waitForTx(approveTx);
            }
            setWaterStatus("Buying water...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("buyWater", [waterBuyAmount]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setWaterStatus("Water purchased!");
            // Refresh all balances after purchase
            refreshAllData();
            setTimeout(() => { loadWaterShopInfo(); refreshV5StakingRef.current = false; refreshV5Staking(); setWaterStatus(""); }, 2000);
        } catch (err: any) { setWaterStatus("Error: " + (err.message || err)); }
        finally { setWaterLoading(false); }
    }

    const v4PlantsNeedingWater = useMemo(() => v4StakedPlants.filter(id => (v4WaterNeeded[id] || 0) > 0 || (v4PlantHealths[id] !== undefined && v4PlantHealths[id] < 100)), [v4StakedPlants, v4PlantHealths, v4WaterNeeded]);
    const v4TotalWaterNeededForSelected = useMemo(() => selectedV4PlantsToWater.reduce((sum, id) => sum + Math.max(1, v4WaterNeeded[id] || 0), 0), [selectedV4PlantsToWater, v4WaterNeeded]);

    // Use environment variable or default to production URL
    const BACKEND_API_URL = WARS_BACKEND_URL || process.env.NEXT_PUBLIC_WARS_API_URL || "https://fcweed-wars-backend.onrender.com";
    const [warsBackendStatus, setWarsBackendStatus] = useState<"unknown" | "online" | "offline">("unknown");

    // Check backend health when wars tab opens
    async function checkWarsBackend() {
        try {
            const response = await fetch(`${BACKEND_API_URL}/api/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) {
                setWarsBackendStatus("online");
                console.log("[Wars] Backend is online at", BACKEND_API_URL);
                return true;
            }
        } catch (err) {
            console.error("[Wars] Backend health check failed:", err);
        }
        setWarsBackendStatus("offline");
        return false;
    }

    useEffect(() => {
        if (activeTab === "wars") {
            checkWarsBackend();
        }
    }, [activeTab]);

    useEffect(() => {
        if (connected && userAddress && activeTab === "wars") {
            fetchInventory();
        }
    }, [connected, userAddress, activeTab]);



    async function loadWarsPlayerStats() {
        if (!userAddress) return;
        try {
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, V4_BATTLES_ABI, readProvider);
            
            // Get Cartel Wars stats
            const stats = await battlesContract.getCartelPlayerStats(userAddress);
            
            // Get DEA stats
            let deaStats = [0, 0, ethers.BigNumber.from(0), ethers.BigNumber.from(0), 0, false];
            try {
                deaStats = await battlesContract.getDeaAttackerStats(userAddress);
            } catch {}
            
            setWarsPlayerStats({
                wins: stats[0].toNumber(),
                losses: stats[1].toNumber(),
                defWins: stats[2].toNumber(),
                defLosses: stats[3].toNumber(),
                rewardsStolen: stats[4],
                rewardsLost: stats[5],
                rewardsLostAttacking: stats[6],
                winStreak: stats[7].toNumber(),
                bestStreak: stats[8].toNumber(),
                nukesUsed: stats[9].toNumber(),
                hasShield: stats[10],
                // DEA stats
                deaRaidsWon: deaStats[0].toNumber ? deaStats[0].toNumber() : 0,
                deaRaidsLost: deaStats[1].toNumber ? deaStats[1].toNumber() : 0,
                deaRewardsStolen: deaStats[2],
            });


            const canAttack = await battlesContract.canCartelAttack(userAddress);
            if (!canAttack) {
                try {
                    const lastAttackTime = await battlesContract.lastCartelAttackTime(userAddress);
                    const cooldownDuration = await battlesContract.cartelCooldown();
                    const cooldownEnd = lastAttackTime.toNumber() + cooldownDuration.toNumber();
                    const now = Math.floor(Date.now() / 1000);
                    const remaining = cooldownEnd > now ? cooldownEnd - now : 0;
                    setWarsCooldown(remaining);
                } catch (e) {
                    console.error("Cooldown fetch error:", e);
                    setWarsCooldown(21600);
                }
            } else {
                setWarsCooldown(0);
            }


            const fee = await battlesContract.cartelSearchFee();
            const feeFormatted = parseFloat(ethers.utils.formatUnits(fee, 18));
            setWarsSearchFee(feeFormatted >= 1000 ? (feeFormatted / 1000).toFixed(0) + "K" : feeFormatted.toFixed(0));


            const searchTarget = await battlesContract.activeSearchTarget(userAddress);
            const searchExpiry = await battlesContract.activeSearchExpiry(userAddress);
            const now = Math.floor(Date.now() / 1000);
            if (searchTarget !== ethers.constants.AddressZero && searchExpiry.toNumber() > now) {
                setWarsTarget(searchTarget);
                setWarsSearchExpiry(searchExpiry.toNumber());

                const v5Contract = new ethers.Contract(V5_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
                const targetStats = await v5Contract.getUserBattleStats(searchTarget);
                const targetPower = await v5Contract.calculateBattlePower(searchTarget);
                const hasShield = await v5Contract.hasRaidShield(searchTarget).catch(() => false);
                
                setWarsTargetStats({
                    plants: targetStats[0].toNumber(),
                    lands: targetStats[1].toNumber(),
                    superLands: targetStats[2].toNumber(),
                    avgHealth: targetStats[3].toNumber(),
                    pendingRewards: targetStats[4],
                    battlePower: targetPower.toNumber(),
                    hasShield: hasShield,
                });

                const attackerPower = await v5Contract.calculateBattlePower(userAddress);
                const defPower = targetPower.toNumber();
                const atkPower = attackerPower.toNumber();
                const total = atkPower + defPower;
                const winChance = total > 0 ? Math.round((atkPower / total) * 100) : 50;
                setWarsOdds({
                    attackerPower: atkPower,
                    defenderPower: defPower,
                    estimatedWinChance: winChance,
                });
            }

        } catch (err) {
            console.error("[Wars] Failed to load player stats:", err);
        }
    }

    // Effect to refresh data when refreshTrigger changes
    useEffect(() => {
        if (refreshTrigger > 0 && userAddress) {
            loadWarsPlayerStats();
            refreshV5StakingRef.current = false;
            refreshV5Staking();
        }
    }, [refreshTrigger, userAddress]);

    async function handleWarsSearch() {
        if (warsTransactionInProgress.current) return;
        await executeWarsSearch();
    }
    
    async function executeWarsSearch() {
        if (warsTransactionInProgress.current) return;
        warsTransactionInProgress.current = true;
        setWarsSearching(true);
        setWarsStatus("Searching for target...");
        setWarsResult(null);
        setWarsPreviewData(null);
        setWarsTargetLocked(false);

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, V4_BATTLES_ABI, readProvider);

            // Check if already have a LOCKED target on-chain
            const searchTarget = await battlesContract.activeSearchTarget(ctx.userAddress);
            const searchExpiry = await battlesContract.activeSearchExpiry(ctx.userAddress);
            const now = Math.floor(Date.now() / 1000);
            if (searchTarget !== ethers.constants.AddressZero && searchExpiry.toNumber() > now) {
                setWarsTarget(searchTarget);
                setWarsTargetLocked(true); // Already paid
                setWarsSearchExpiry(searchExpiry.toNumber());

                // Fetch target stats directly from V5 staking (more reliable)
                const v5Contract = new ethers.Contract(V5_STAKING_ADDRESS, [
                    "function getUserBattleStats(address) external view returns (uint256, uint256, uint256, uint256, uint256)",
                    "function hasRaidShield(address) external view returns (bool)",
                    "function calculateBattlePower(address) external view returns (uint256)"
                ], readProvider);

                let tPlants = 0, tLands = 0, tSuperLands = 0, tAvgHealth = 100, tPending = ethers.BigNumber.from(0);
                try {
                    const targetStats = await v5Contract.getUserBattleStats(searchTarget);
                    tPlants = targetStats[0].toNumber();
                    tLands = targetStats[1].toNumber();
                    tSuperLands = targetStats[2].toNumber();
                    tAvgHealth = targetStats[3].toNumber();
                    tPending = targetStats[4];
                    console.log("[Wars] Target stats from V5 - Plants:", tPlants, "Lands:", tLands, "SuperLands:", tSuperLands, "AvgHealth:", tAvgHealth);
                } catch (e) {
                    console.error("[Wars] Failed to get target stats:", e);
                }

                let hasShield = false;
                try {
                    hasShield = await v5Contract.hasRaidShield(searchTarget);
                } catch (e) {}

                const defenderPower = await v5Contract.calculateBattlePower(searchTarget).then((p: any) => p.toNumber()).catch(() => Math.round((tPlants * 100 + tLands * 50 + tSuperLands * 150) * tAvgHealth / 100));

                setWarsTargetStats({
                    plants: tPlants,
                    lands: tLands,
                    superLands: tSuperLands,
                    avgHealth: tAvgHealth,
                    pendingRewards: tPending,
                    battlePower: defenderPower,
                    hasShield: hasShield,
                });

                // Get attacker power from V4 staking contract
                let attackerPower = 0;
                const attackerAddress = ctx.userAddress;
                console.log("[Wars] Calculating attacker power for:", attackerAddress);
                console.log("[Wars] Target address was:", warsTarget);
                console.log("[Wars] V5_STAKING_ADDRESS:", V5_STAKING_ADDRESS);

                // Method 1: Try V5 contract call
                try {
                    console.log("[Wars] Calling getUserBattleStats for attacker...");
                    const userStats = await v5Contract.getUserBattleStats(attackerAddress);
                    console.log("[Wars] Raw userStats response:", userStats);
                    const aPlants = userStats[0].toNumber();
                    const aLands = userStats[1].toNumber();
                    const aSuperLands = userStats[2].toNumber();
                    const aAvgHealth = userStats[3].toNumber();

                    console.log("[Wars] Attacker stats from V5 - Plants:", aPlants, "Lands:", aLands, "SuperLands:", aSuperLands, "AvgHealth:", aAvgHealth);

                    if (aPlants > 0 || aLands > 0 || aSuperLands > 0) {
                        attackerPower = Math.round((aPlants * 100 + aLands * 50 + aSuperLands * 150) * aAvgHealth / 100);
                        
                        // Apply item boost multipliers (same as contract)
                        const now = Math.floor(Date.now() / 1000);
                        if (nukeExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 1000000) / 10000);
                        else if (rpgExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 50000) / 10000);
                        else if (ak47Expiry > now) attackerPower = Math.floor(attackerPower * (10000 + 10000) / 10000);
                        else if (boostExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 2000) / 10000);
                        
                        console.log("[Wars] Calculated attacker power from V5:", attackerPower);
                    }

                } catch (e: any) {
                    console.error("[Wars] Failed to get attacker power:", e.message || e);
                }

                // Method 2: If V5 returned 0, try using v5StakingStats from React state
                if (attackerPower === 0 && v5StakingStats && v5StakingStats.plants > 0) {
                    console.log("[Wars] Using cached v5StakingStats as fallback");
                    const aPlants = v5StakingStats.plants || 0;
                    const aLands = v5StakingStats.lands || 0;
                    const aSuperLands = v5StakingStats.superLands || 0;
                    const aAvgHealth = v5StakingStats.avgHealth || 100;
                    attackerPower = Math.round((aPlants * 100 + aLands * 50 + aSuperLands * 150) * aAvgHealth / 100);
                    
                    // Apply item boost multipliers (same as contract)
                    const now = Math.floor(Date.now() / 1000);
                    if (nukeExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 1000000) / 10000);
                    else if (rpgExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 50000) / 10000);
                    else if (ak47Expiry > now) attackerPower = Math.floor(attackerPower * (10000 + 10000) / 10000);
                    else if (boostExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 2000) / 10000);
                    
                    console.log("[Wars] Calculated attacker power from cache:", attackerPower);
                }

                console.log("[Wars] Final - Attacker:", attackerPower, "Defender:", defenderPower);

                const total = attackerPower + defenderPower;
                const estimatedWinChance = total > 0 ? Math.round((attackerPower * 100) / total) : 50;

                setWarsOdds({
                    attackerPower,
                    defenderPower,
                    estimatedWinChance,
                });
                setWarsStatus("");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            const v5Contract = new ethers.Contract(V5_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
            const hasShield = await v5Contract.hasRaidShield(ctx.userAddress).catch(() => false);
            if (hasShield) {
                // Show in-app modal instead of browser confirm
                setShowShieldWarning(true);
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsStatus("Finding target...");

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

            try {
                const response = await fetch(`${BACKEND_API_URL}/api/search`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ attacker: ctx.userAddress }),
                    signal: controller.signal,
                });
                clearTimeout(timeoutId);

                const data = await response.json();

                if (!response.ok || !data.success) {
                    setWarsStatus(data.error || "Failed to find target");
                    setWarsSearching(false);
                    warsTransactionInProgress.current = false;
                    return;
                }

                const { target, nonce, deadline, signature, stats } = data;

                // Store preview data - DON'T PAY YET
                setWarsPreviewData({ target, nonce, deadline, signature, stats });
                setWarsTarget(target);
                setWarsTargetLocked(false); // Not locked yet - just preview
                setWarsTargetStats(null); // Don't show stats until they pay
                setWarsOdds(null);
                setWarsStatus("Opponent found! Pay 50K FCWEED to reveal stats and fight.");
            } catch (fetchErr: any) {
                clearTimeout(timeoutId);
                console.error("[Wars] Fetch error:", fetchErr);
                if (fetchErr.name === "AbortError") {
                    setWarsStatus("Search timed out. Please try again.");
                } else {
                    setWarsStatus("Backend API unavailable. Check if wars.x420ponzi.com is running.");
                }
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

        } catch (err: any) {
            console.error("[Wars] Search failed:", err);
            setWarsStatus("Search failed: " + (err.reason || err.message || err).toString().slice(0, 80));
        } finally {
            setWarsSearching(false);
            warsTransactionInProgress.current = false;
        }
    }

    // NEW: Pay 50K to lock target and reveal stats
    async function handleLockAndFight() {
        if (warsTransactionInProgress.current || !warsPreviewData) return;
        warsTransactionInProgress.current = true;
        setWarsStatus("Locking target...");

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                warsTransactionInProgress.current = false;
                return;
            }

            const { target, nonce, deadline, signature, stats } = warsPreviewData;
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, V4_BATTLES_ABI, readProvider);

            setWarsStatus("Checking approval...");
            const searchFee = await battlesContract.cartelSearchFee();
            const tokenContract = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            let allowance = await tokenContract.allowance(ctx.userAddress, V5_BATTLES_ADDRESS);

            if (allowance.lt(searchFee)) {
                setWarsStatus("Approving FCWEED (confirm in wallet)...");
                const approveTx = await txAction().sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [V5_BATTLES_ADDRESS, ethers.constants.MaxUint256]));
                if (!approveTx) throw new Error("Approval rejected");
                setWarsStatus("Confirming approval...");
                await waitForTx(approveTx, readProvider);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            setWarsStatus("Paying 50K FCWEED (confirm in wallet)...");

            const searchTx = await txAction().sendContractTx(
                V5_BATTLES_ADDRESS,
                v4BattlesInterface.encodeFunctionData("searchForTarget", [target, deadline, signature]),
                "0x4C4B40"
            );

            if (!searchTx) {
                setWarsStatus("Transaction rejected");
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsStatus("Confirming transaction...");
            await waitForTx(searchTx, readProvider);
            await new Promise(resolve => setTimeout(resolve, 1500));

            // NOW show stats - they paid!
            setWarsTargetLocked(true);
            setWarsPreviewData(null);
            
            // Backend returns pendingRewards as formatted string (e.g. "3434000.123")
            // Convert back to BigNumber for display - with robust null/empty handling
            let pendingBN = ethers.BigNumber.from(0);
            const rawPending = stats?.pendingRewards;
            if (rawPending !== null && rawPending !== undefined && rawPending !== "" && rawPending !== "0") {
                try {
                    // Try parsing as decimal string first
                    const pendingStr = rawPending.toString().trim();
                    if (pendingStr && !isNaN(parseFloat(pendingStr))) {
                        pendingBN = ethers.utils.parseUnits(pendingStr, 18);
                    }
                } catch {
                    // If parseUnits fails, try BigNumber.from for raw wei values
                    try {
                        pendingBN = ethers.BigNumber.from(rawPending);
                    } catch {
                        console.warn("[Wars] Could not parse pendingRewards:", rawPending);
                        pendingBN = ethers.BigNumber.from(0);
                    }
                }
            }
            
            setWarsTargetStats({
                plants: stats?.plants || 0,
                lands: stats?.lands || 0,
                superLands: stats?.superLands || 0,
                avgHealth: stats?.avgHealth || 100,
                pendingRewards: pendingBN,
                hasShield: stats.hasShield,
            });
            setWarsSearchExpiry(Math.floor(Date.now() / 1000) + 600);

            // Calculate defender power from backend stats
            const defenderPower = Math.round((stats.plants * 100 + stats.lands * 50 + stats.superLands * 150) * stats.avgHealth / 100);
            console.log("[Wars] Lock - Defender power:", defenderPower, "from stats:", stats);

            // Get attacker power - try multiple methods
            let attackerPower = 0;
            const attackerAddr = ctx.userAddress;
            console.log("[Wars] Lock - Getting attacker power for:", attackerAddr);

            // Method 1: Try V5 contract call
            try {
                const v5Contract = new ethers.Contract(V5_STAKING_ADDRESS, [
                    "function getUserBattleStats(address) external view returns (uint256, uint256, uint256, uint256, uint256)"
                ], readProvider);

                console.log("[Wars] Lock - Calling V5 getUserBattleStats...");
                const userStats = await v5Contract.getUserBattleStats(attackerAddr);
                console.log("[Wars] Lock - Raw V5 response:", userStats);

                const aPlants = userStats[0].toNumber();
                const aLands = userStats[1].toNumber();
                const aSuperLands = userStats[2].toNumber();
                const aAvgHealth = userStats[3].toNumber();

                console.log("[Wars] Lock - Parsed V5 stats - Plants:", aPlants, "Lands:", aLands, "SuperLands:", aSuperLands, "AvgHealth:", aAvgHealth);

                if (aPlants > 0 || aLands > 0 || aSuperLands > 0) {
                    attackerPower = Math.round((aPlants * 100 + aLands * 50 + aSuperLands * 150) * aAvgHealth / 100);
                    
                    // Apply item boost multipliers (same as contract)
                    const now = Math.floor(Date.now() / 1000);
                    if (nukeExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 1000000) / 10000);
                    else if (rpgExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 50000) / 10000);
                    else if (ak47Expiry > now) attackerPower = Math.floor(attackerPower * (10000 + 10000) / 10000);
                    else if (boostExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 2000) / 10000);
                    
                    console.log("[Wars] Lock - Calculated attacker power from V5:", attackerPower);
                }
            } catch (e: any) {
                console.error("[Wars] Lock - V5 contract call failed:", e.message || e);
            }

            // Method 2: If V5 returned 0, try using v5StakingStats from React state
            if (attackerPower === 0 && v5StakingStats && v5StakingStats.plants > 0) {
                console.log("[Wars] Lock - Using cached v5StakingStats as fallback");
                const aPlants = v5StakingStats.plants || 0;
                const aLands = v5StakingStats.lands || 0;
                const aSuperLands = v5StakingStats.superLands || 0;
                const aAvgHealth = v5StakingStats.avgHealth || 100;
                attackerPower = Math.round((aPlants * 100 + aLands * 50 + aSuperLands * 150) * aAvgHealth / 100);
                
                // Apply item boost multipliers (same as contract)
                const now = Math.floor(Date.now() / 1000);
                if (nukeExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 1000000) / 10000);
                else if (rpgExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 50000) / 10000);
                else if (ak47Expiry > now) attackerPower = Math.floor(attackerPower * (10000 + 10000) / 10000);
                else if (boostExpiry > now) attackerPower = Math.floor(attackerPower * (10000 + 2000) / 10000);
                
                console.log("[Wars] Lock - Calculated attacker power from cache:", attackerPower);
            }

            console.log("[Wars] Lock - Final attacker power:", attackerPower, "defender power:", defenderPower);

            // Calculate win chance
            const total = attackerPower + defenderPower;
            const estimatedWinChance = total > 0 ? Math.round((attackerPower * 100) / total) : 50;
            console.log("[Wars] Lock - Win chance:", estimatedWinChance);

            setWarsOdds({
                attackerPower,
                defenderPower,
                estimatedWinChance,
            });

            setWarsStatus("Target locked! Ready to attack.");

        } catch (err: any) {
            console.error("[Wars] Lock failed:", err);
            if (err.message?.includes("insufficient allowance")) {
                setWarsStatus("Approval failed. Please try again.");
            } else if (err.message?.includes("user rejected") || err.message?.includes("rejected")) {
                setWarsStatus("Transaction cancelled.");
            } else {
                setWarsStatus("Lock failed: " + (err.reason || err.message || err).toString().slice(0, 60));
            }
        } finally {
            setWarsSearching(false);
            warsTransactionInProgress.current = false;
        }
    }

    // Continue search after user confirms they want to proceed despite having shield
    async function continueSearchWithShield() {
        setShowShieldWarning(false);
        if (warsTransactionInProgress.current) return;
        warsTransactionInProgress.current = true;
        setWarsSearching(true);
        setWarsStatus("Finding target...");

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);

            const response = await fetch(`${BACKEND_API_URL}/api/search`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attacker: ctx.userAddress }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await response.json();

            if (!response.ok || !data.success) {
                setWarsStatus(data.error || "Failed to find target");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            if (!data.target) {
                setWarsStatus("No valid targets found");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsTarget(data.target);
            setWarsTargetLocked(false);
            setWarsPreviewData(data);
            setWarsStatus("Target found! Pay fee to lock.");
        } catch (err: any) {
            console.error("[Wars] Search error:", err);
            setWarsStatus(err.name === 'AbortError' ? "Search timed out" : "Search failed");
        } finally {
            setWarsSearching(false);
            warsTransactionInProgress.current = false;
        }
    }

    async function handleWarsAttack() {
        if (warsTransactionInProgress.current || !warsTarget) return;
        await executeWarsAttack();
    }
    
    async function executeWarsAttack() {
        if (warsTransactionInProgress.current || !warsTarget) return;
        warsTransactionInProgress.current = true;
        setWarsAttacking(true);
        setWarsStatus("Preparing attack...");

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                setWarsAttacking(false);
                warsTransactionInProgress.current = false;
                return;
            }

            // Check if we have an active shield - if so, remove it first
            const itemShopContract = new ethers.Contract(V5_ITEMSHOP_ADDRESS, V5_ITEMSHOP_ABI, readProvider);
            const shieldInfo = await itemShopContract.hasActiveShield(ctx.userAddress);
            
            if (shieldInfo[0]) {
                setWarsStatus("Removing your shield...");
                const removeShieldTx = await txAction().sendContractTx(
                    V5_ITEMSHOP_ADDRESS, 
                    v5ItemShopInterface.encodeFunctionData("removeShieldSelf", []), 
                    "0x4C4B40"
                );
                if (!removeShieldTx) {
                    setWarsStatus("Shield removal rejected");
                    setWarsAttacking(false);
                    warsTransactionInProgress.current = false;
                    return;
                }
                await waitForTx(removeShieldTx, readProvider);
                setWarsStatus("Shield removed! Attacking...");
            } else {
                setWarsStatus("Attacking...");
            }

            const tx = await txAction().sendContractTx(V5_BATTLES_ADDRESS, v4BattlesInterface.encodeFunctionData("cartelAttack", []), "0x4C4B40");
            if (!tx) {
                setWarsStatus("Transaction rejected");
                setWarsAttacking(false);
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsStatus("Battle in progress...");


            const receipt = await waitForTx(tx, readProvider);


            const battleResultTopic = v4BattlesInterface.getEventTopic("CartelBattleResult");
            let battleResult: any = null;

            if (receipt && receipt.logs) {
                for (const log of receipt.logs) {
                    if (log.topics[0] === battleResultTopic) {
                        try {
                            const parsed = v4BattlesInterface.parseLog(log);
                            battleResult = {
                                attacker: parsed.args.attacker,
                                defender: parsed.args.defender,
                                won: parsed.args.attackerWon,
                                damageDealt: parsed.args.damageDealt.toNumber(),
                                rewardsTransferred: parsed.args.rewardsTransferred,
                            };
                            console.log("[Wars] Battle result:", battleResult);
                        } catch {}
                    }
                }
            }


            if (!battleResult && tx.hash) {
                try {
                    const fullReceipt = await readProvider.getTransactionReceipt(tx.hash);
                    if (fullReceipt && fullReceipt.logs) {
                        for (const log of fullReceipt.logs) {
                            if (log.address.toLowerCase() === V5_BATTLES_ADDRESS.toLowerCase() && log.topics[0] === battleResultTopic) {
                                const parsed = v4BattlesInterface.parseLog(log);
                                battleResult = {
                                    attacker: parsed.args.attacker,
                                    defender: parsed.args.defender,
                                    won: parsed.args.attackerWon,
                                    damageDealt: parsed.args.damageDealt.toNumber(),
                                    rewardsTransferred: parsed.args.rewardsTransferred,
                                };
                            }
                        }
                    }
                } catch {}
            }

            if (battleResult) {
                setWarsResult(battleResult);
                // Safely handle rewardsTransferred - it might be undefined or a BigNumber
                const rewards = battleResult.rewardsTransferred || ethers.BigNumber.from(0);
                const rewardsAmount = ethers.BigNumber.isBigNumber(rewards) ? rewards : ethers.BigNumber.from(rewards || 0);
                
                if (battleResult.won) {
                    const stolenAmount = parseFloat(ethers.utils.formatUnits(rewardsAmount, 18));
                    const stolenFormatted = stolenAmount >= 1000 ? (stolenAmount / 1000).toFixed(1) + "K" : stolenAmount.toFixed(0);
                    setWarsStatus(`🎉 VICTORY! Stole ${stolenFormatted} FCWEED! Their plants took ${battleResult.damageDealt}% damage.`);
                } else {
                    const lostAmount = parseFloat(ethers.utils.formatUnits(rewardsAmount, 18));
                    const lostFormatted = lostAmount >= 1000 ? (lostAmount / 1000).toFixed(1) + "K" : lostAmount.toFixed(0);
                    setWarsStatus(`💀 DEFEAT! Lost ${lostFormatted} FCWEED. Your plants took ${battleResult.damageDealt}% damage.`);
                }
            } else {
                setWarsStatus("Battle complete! Check your rewards.");
                setWarsResult({ won: true, rewardsTransferred: ethers.BigNumber.from(0), damageDealt: 0 });
            }

            setWarsTarget(null);
            setWarsTargetStats(null);
            setWarsOdds(null);
            setWarsSearchExpiry(0);
            setWarsTargetLocked(false);
            setWarsPreviewData(null);

            // Refresh V5 staking data to show updated health and pending rewards
            setTimeout(() => {
                loadWarsPlayerStats();
                refreshV5StakingRef.current = false;
                refreshV5Staking();
            }, 2000);

            // Refresh again after a bit more time for blockchain to settle
            setTimeout(() => {
                refreshV5StakingRef.current = false;
                refreshV5Staking();
            }, 5000);

        } catch (err: any) {
            console.error("[Wars] Attack failed:", err);
            const errMsg = (err.reason || err.message || err).toString().toLowerCase();
            if (errMsg.includes("no attack power")) {
                setWarsStatus("❌ No attack power! Your plants may be at 0% health. Water them first!");
            } else if (errMsg.includes("no defense power")) {
                setWarsStatus("❌ Target has no defense power. Try a different opponent.");
            } else if (errMsg.includes("search expired")) {
                setWarsStatus("❌ Search expired! Please search for a new target.");
                setWarsTarget(null);
                setWarsTargetStats(null);
                setWarsTargetLocked(false);
            } else if (errMsg.includes("no active search")) {
                setWarsStatus("❌ No active search. Please search for a target first.");
                setWarsTarget(null);
                setWarsTargetStats(null);
                setWarsTargetLocked(false);
            } else if (errMsg.includes("target has immunity")) {
                setWarsStatus("❌ Target has immunity! They were recently attacked.");
            } else if (errMsg.includes("target has shield")) {
                setWarsStatus("❌ Target has a raid shield active!");
            } else {
                setWarsStatus("Attack failed: " + (err.reason || err.message || err).toString().slice(0, 60));
            }
        } finally {
            setWarsAttacking(false);
            warsTransactionInProgress.current = false;
        }
    }

    async function handleNextOpponent() {
        if (warsTransactionInProgress.current) return;

        // Only need to cancel on-chain if target is LOCKED (already paid)
        if (warsTargetLocked) {
            const ctx = await ensureWallet();
            if (!ctx) return;

            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, V4_BATTLES_ABI, readProvider);
            const searchTarget = await battlesContract.activeSearchTarget(ctx.userAddress);
            const searchExpiry = await battlesContract.activeSearchExpiry(ctx.userAddress);
            const now = Math.floor(Date.now() / 1000);
            if (searchTarget !== ethers.constants.AddressZero && searchExpiry.toNumber() > now) {
                setWarsStatus("Cancelling locked target...");
                const cancelTx = await txAction().sendContractTx(V5_BATTLES_ADDRESS, v4BattlesInterface.encodeFunctionData("cancelSearch", []), "0x4C4B40");
                if (cancelTx) await waitForTx(cancelTx, readProvider);
            }
        }

        // Clear and search again (FREE!)
        setWarsTarget(null);
        setWarsTargetStats(null);
        setWarsOdds(null);
        setWarsSearchExpiry(0);
        setWarsPreviewData(null);
        setWarsTargetLocked(false);
        setWarsStatus("");

        handleWarsSearch();
    }

    useEffect(() => {
        if (activeTab === "wars" && userAddress) {
            loadWarsPlayerStats();
        }
    }, [activeTab, userAddress]);

    useEffect(() => {
        if (!warsSearchExpiry || warsSearchExpiry <= 0) return;
        const interval = setInterval(() => {
            const now = Math.floor(Date.now() / 1000);
            if (warsSearchExpiry <= now) {
                setWarsTarget(null);
                setWarsTargetStats(null);
                setWarsOdds(null);
                setWarsSearchExpiry(0);
                setWarsResult(null);
                setWarsStatus("");
                loadWarsPlayerStats();
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [warsSearchExpiry]);

    const [, forceUpdate] = useState(0);
    useEffect(() => {
        if (!warsSearchExpiry) return;
        const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
        return () => clearInterval(interval);
    }, [warsSearchExpiry]);

    const [timerTick, setTimerTick] = useState(0);
    useEffect(() => {
        const hasActiveTimer = boostExpiry > Math.floor(Date.now() / 1000) || 
                               shieldExpiry > Math.floor(Date.now() / 1000) || 
                               ak47Expiry > Math.floor(Date.now() / 1000) || 
                               rpgExpiry > Math.floor(Date.now() / 1000) || 
                               nukeExpiry > Math.floor(Date.now() / 1000);
        if (!hasActiveTimer) return;
        const interval = setInterval(() => setTimerTick(n => n + 1), 1000);
        return () => clearInterval(interval);
    }, [boostExpiry, shieldExpiry, ak47Expiry, rpgExpiry, nukeExpiry]);


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
                console.log("[Balance] FCWEED refreshed:", f);
            } catch {}
        })();
    }, [connected, userAddress, readProvider, refreshTrigger]);

    // Auto-load user data on wallet connect (crate stats, inventory, V5 staking)
    useEffect(() => {
        if (!connected || !userAddress || !readProvider) return;
        
        // Load crate/dust stats
        (async () => {
            try {
                const vaultAbi = [
                    "function getUserStats(address user) external view returns (uint256 dustBalance, uint256 cratesOpened, uint256 fcweedWon, uint256 usdcWon, uint256 nftsWon, uint256 totalSpent)"
                ];
                const vaultContract = new ethers.Contract(CRATE_VAULT_ADDRESS, vaultAbi, readProvider);
                const stats = await vaultContract.getUserStats(userAddress);
                console.log("[CrateStats] Raw stats:", stats);
                console.log("[CrateStats] dustBalance:", stats.dustBalance?.toString(), "cratesOpened:", stats.cratesOpened?.toString());
                
                // Try named properties first, fall back to indices
                const dustBalance = stats.dustBalance ?? stats[0];
                const cratesOpened = stats.cratesOpened ?? stats[1];
                const fcweedWon = stats.fcweedWon ?? stats[2];
                const usdcWon = stats.usdcWon ?? stats[3];
                const nftsWon = stats.nftsWon ?? stats[4];
                const totalSpent = stats.totalSpent ?? stats[5];
                
                setCrateUserStats({
                    opened: typeof cratesOpened === 'number' ? cratesOpened : cratesOpened.toNumber(),
                    dust: typeof dustBalance === 'number' ? dustBalance : dustBalance.toNumber(),
                    fcweed: parseFloat(ethers.utils.formatUnits(fcweedWon, 18)),
                    usdc: parseFloat(ethers.utils.formatUnits(usdcWon, 6)),
                    nfts: typeof nftsWon === 'number' ? nftsWon : nftsWon.toNumber(),
                    totalSpent: parseFloat(ethers.utils.formatUnits(totalSpent, 18)),
                });
                console.log("[CrateStats] Loaded successfully");
            } catch (e) {
                console.error("[CrateStats] Failed to load:", e);
            }
        })();
        
        // Load inventory
        fetchInventory();
        
        // Load V5 staking data in background WITHOUT opening modal
        refreshV5StakingRef.current = false;
        refreshV5Staking();
    }, [connected, userAddress, readProvider, refreshTrigger]);


    useEffect(() => {
        if (activeTab !== "crates") return;
        setLoadingVault(true);
        (async () => {
            try {
                const vaultContract = new ethers.Contract(CRATE_VAULT_ADDRESS, CRATE_VAULT_ABI, readProvider);
                
                // Try to get from contract first, but fallback to checking treasury wallet directly
                const TREASURY_WALLET = "0x5A567898881cef8DF767D192B74d99513cAa6e46";
                
                try {
                    // Check NFT balances of treasury wallet directly
                    const plantContract = new ethers.Contract(PLANT_ADDRESS, ERC721_VIEW_ABI, readProvider);
                    const landContract = new ethers.Contract(LAND_ADDRESS, ERC721_VIEW_ABI, readProvider);
                    const superLandContract = new ethers.Contract(SUPER_LAND_ADDRESS, ERC721_VIEW_ABI, readProvider);
                    
                    const [plantBal, landBal, superLandBal] = await Promise.all([
                        plantContract.balanceOf(TREASURY_WALLET),
                        landContract.balanceOf(TREASURY_WALLET),
                        superLandContract.balanceOf(TREASURY_WALLET),
                    ]);
                    
                    setVaultNfts({
                        plants: plantBal.toNumber(),
                        lands: landBal.toNumber(),
                        superLands: superLandBal.toNumber(),
                    });
                } catch (e) {
                    console.log("Fallback to getVaultInventory:", e);
                    const [plants, lands, superLands] = await vaultContract.getVaultInventory();
                    setVaultNfts({
                        plants: plants.toNumber(),
                        lands: lands.toNumber(),
                        superLands: superLands.toNumber(),
                    });
                }


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
                    const stats = await vaultContract.getUserStats(userAddress);
                    console.log("[CratesTab] User stats:", stats);
                    const dustBalance = stats.dustBalance ?? stats[0];
                    const cratesOpened = stats.cratesOpened ?? stats[1];
                    const fcweedWon = stats.fcweedWon ?? stats[2];
                    const usdcWon = stats.usdcWon ?? stats[3];
                    const nftsWon = stats.nftsWon ?? stats[4];
                    const totalSpent = stats.totalSpent ?? stats[5];
                    
                    setCrateUserStats({
                        opened: typeof cratesOpened === 'number' ? cratesOpened : cratesOpened.toNumber(),
                        dust: typeof dustBalance === 'number' ? dustBalance : dustBalance.toNumber(),
                        fcweed: parseFloat(ethers.utils.formatUnits(fcweedWon, 18)),
                        usdc: parseFloat(ethers.utils.formatUnits(usdcWon, 6)),
                        nfts: typeof nftsWon === 'number' ? nftsWon : nftsWon.toNumber(),
                        totalSpent: parseFloat(ethers.utils.formatUnits(totalSpent, 18)),
                    });
                }
            } catch (err) {
                console.error("Failed to load crate data:", err);
            } finally {
                setLoadingVault(false);
            }
        })();
        
        // Refresh global stats every 15 seconds for live updates
        const refreshGlobalStats = async () => {
            try {
                const vaultContract = new ethers.Contract(CRATE_VAULT_ADDRESS, CRATE_VAULT_ABI, readProvider);
                const [totalOpened, totalBurned, , , , , uniqueUsers] = await vaultContract.getGlobalStats();
                const burnedFormatted = parseFloat(ethers.utils.formatUnits(totalBurned, 18));
                setCrateGlobalStats({
                    totalOpened: totalOpened.toNumber(),
                    totalBurned: burnedFormatted >= 1e6 ? (burnedFormatted / 1e6).toFixed(1) + "M" : burnedFormatted >= 1e3 ? (burnedFormatted / 1e3).toFixed(0) + "K" : burnedFormatted.toFixed(0),
                    uniqueUsers: uniqueUsers.toNumber(),
                });
            } catch {}
        };
        
        const globalStatsInterval = setInterval(refreshGlobalStats, 15000);
        return () => clearInterval(globalStatsInterval);
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


            // Use mini app wallet for both Farcaster and Base App
            const isMiniAppWallet = ctx.isMini || usingMiniApp;
            const miniAppProvider = miniAppEthProvider;

            console.log("[Crate] Wallet context:", {
                isMini: ctx.isMini,
                usingMiniApp,
                hasMiniAppProvider: !!miniAppProvider,
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

                if (isMiniAppWallet && miniAppProvider) {

                    console.log("[Crate] Using mini app wallet for approval");
                    approveTx = await txAction().sendWalletCalls(
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


            setCrateStatus("Opening crate...");

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

            if (isMiniAppWallet && miniAppProvider) {

                console.log("[Crate] Using mini app wallet for openCrate");
                tx = await txAction().sendWalletCalls(
                    ctx.userAddress,
                    CRATE_VAULT_ADDRESS,
                    openCrateData,
                    "0x4C4B40" // 5,000,000 gas for crate opening
                );
            } else {

                console.log("[Crate] Using external wallet for openCrate");
                try {

                    tx = await ctx.signer.sendTransaction({
                        to: CRATE_VAULT_ADDRESS,
                        data: openCrateData,
                        value: 0,
                        gasLimit: 5000000, // 5M gas for crate opening
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

        // Refresh all balances after crate open
        refreshAllData();
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
            <div style={{ padding: 2, borderRadius: 8, border: checked ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.18)", background: "#050814", position: "relative", width: 59, height: 59 }}>
                <img 
                    src={img} 
                    alt={name + " #" + id} 
                    style={{ 
                        width: 55, 
                        height: 55, 
                        borderRadius: 6, 
                        objectFit: "contain",
                        backfaceVisibility: "hidden",
                        transform: "translateZ(0)",
                        WebkitBackfaceVisibility: "hidden"
                    }} 
                    loading="eager"
                    decoding="async"
                />
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
            onClick={connected ? () => setShowDisconnectModal(true) : handleConnectWallet}
            onTouchEnd={connected ? () => setShowDisconnectModal(true) : handleConnectWallet}
            style={{
                padding: userAvatar && connected ? "4px 8px 4px 4px" : "6px 10px",
                borderRadius: 10,
                border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.2)"}`,
                background: theme === "light" 
                    ? "#ffffff"
                    : (connected ? "rgba(15,23,42,0.9)" : "rgba(39,95,255,0.55)"),
                boxShadow: theme === "light" ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                fontSize: 11,
                fontWeight: 600,
                color: theme === "light" ? "#1e293b" : "#fff",
                cursor: connecting ? "wait" : "pointer",
                touchAction: "manipulation",
                WebkitTapHighlightColor: "transparent",
                userSelect: "none",
                height: 32,
                maxWidth: 120,
                opacity: connecting ? 0.7 : 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
                transition: "all 0.2s ease",
            }}
        >
            {userAvatar && connected ? (
                <img 
                    src={userAvatar} 
                    alt="avatar" 
                    style={{ 
                        width: 22, 
                        height: 22, 
                        borderRadius: 6,
                        objectFit: "cover",
                        flexShrink: 0,
                        border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.2)"}`
                    }} 
                />
            ) : !connected && (
                <span style={{ fontSize: 12, flexShrink: 0 }}>🔗</span>
            )}
            <span style={{ 
                overflow: "hidden", 
                textOverflow: "ellipsis", 
                whiteSpace: "nowrap",
                maxWidth: connected && userAvatar ? 70 : 80
            }}>{connecting ? "..." : getDisplayName()}</span>
        </button>
    );

    return (
        <div 
            className={styles.page} 
            style={{ 
                paddingBottom: 80,
                background: theme === "light" 
                    ? "linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%)" 
                    : undefined,
                color: theme === "light" ? "#1e293b" : undefined,
                maxWidth: "100vw",
                width: "100%",
                minHeight: "100vh",
                overflowX: "hidden",
                boxSizing: "border-box",
                position: "relative"
            }} 
            data-theme={theme}
            onPointerDown={() => { if (!isPlaying && !manualPause && audioRef.current) audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {}); }}
        >
            
            <style>{`
                @keyframes scrollText {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-100%); }
                }
                * { box-sizing: border-box; }
                html, body { 
                    margin: 0; 
                    padding: 0; 
                    width: 100%; 
                    max-width: 100vw;
                    overflow-x: hidden;
                    -webkit-text-size-adjust: 100%;
                    -webkit-overflow-scrolling: touch;
                }
                body {
                    min-height: 100vh;
                    min-height: 100dvh;
                }
                /* Anti-flicker for images */
                img {
                    image-rendering: -webkit-optimize-contrast;
                    backface-visibility: hidden;
                    transform: translateZ(0);
                }
            `}</style>
            
            {showOnboarding && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.85)",
                    backdropFilter: "blur(10px)",
                    zIndex: 1000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 12
                }}>
                    <div style={{
                        background: theme === "light" ? "#ffffff" : "#0f172a",
                        borderRadius: 16,
                        border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.1)"}`,
                        maxWidth: 340,
                        width: "100%",
                        padding: 18,
                        textAlign: "center",
                        maxHeight: "90vh",
                        overflowY: "auto"
                    }}>
                        <div style={{ fontSize: 36, marginBottom: 10 }}>🌿</div>
                        <h2 style={{ 
                            fontSize: 20, 
                            fontWeight: 700, 
                            marginBottom: 8,
                            color: theme === "light" ? "#1e293b" : "#fff"
                        }}>
                            Welcome to FCWEED
                        </h2>
                        <p style={{ 
                            fontSize: 12, 
                            color: theme === "light" ? "#64748b" : "#94a3b8", 
                            marginBottom: 14,
                            lineHeight: 1.5
                        }}>
                            The ultimate stake-to-earn farming game on Base. Grow your empire by collecting NFTs and earning rewards!
                        </p>
                        
                        <div style={{ 
                            display: "flex", 
                            flexDirection: "column", 
                            gap: 8, 
                            textAlign: "left",
                            background: theme === "light" ? "#f8fafc" : "rgba(255,255,255,0.05)",
                            borderRadius: 10,
                            padding: 12,
                            marginBottom: 14
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 20 }}>🌱</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: theme === "light" ? "#1e293b" : "#fff" }}>Mint Plant NFTs</div>
                                    <div style={{ fontSize: 10, color: theme === "light" ? "#64748b" : "#94a3b8" }}>Each plant earns FCWEED tokens daily</div>
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 20 }}>🏠</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: theme === "light" ? "#1e293b" : "#fff" }}>Collect Land NFTs</div>
                                    <div style={{ fontSize: 10, color: theme === "light" ? "#64748b" : "#94a3b8" }}>Unlock more plant slots & boost rewards</div>
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 20 }}>⚔️</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: theme === "light" ? "#1e293b" : "#fff" }}>Battle in Cartel Wars</div>
                                    <div style={{ fontSize: 10, color: theme === "light" ? "#64748b" : "#94a3b8" }}>Raid other farmers and steal rewards</div>
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 20 }}>🎰</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: theme === "light" ? "#1e293b" : "#fff" }}>Open Mystery Crates</div>
                                    <div style={{ fontSize: 10, color: theme === "light" ? "#64748b" : "#94a3b8" }}>Win NFTs, tokens, and rare items</div>
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 20 }}>💧</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: theme === "light" ? "#1e293b" : "#fff" }}>Water Shop</div>
                                    <div style={{ fontSize: 10, color: theme === "light" ? "#64748b" : "#94a3b8" }}>Water your plants daily to earn! Open 12-6pm EST</div>
                                </div>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 20 }}>🛒</span>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 11, color: theme === "light" ? "#1e293b" : "#fff" }}>Item Shop</div>
                                    <div style={{ fontSize: 10, color: theme === "light" ? "#64748b" : "#94a3b8" }}>Health Packs, AK-47s, RPGs, Nukes & more!</div>
                                </div>
                            </div>
                        </div>
                        
                        <button
                            onClick={dismissOnboarding}
                            style={{
                                width: "100%",
                                padding: "12px 20px",
                                borderRadius: 10,
                                border: "none",
                                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                                color: "#fff",
                                fontWeight: 600,
                                fontSize: 14,
                                cursor: "pointer",
                                marginBottom: 8
                            }}
                        >
                            Start Farming 🚀
                        </button>
                        
                        <button
                            onClick={async () => {
                                // Trigger add to home screen / mini apps
                                try {
                                    const anyWindow = window as any;
                                    
                                    // Try Base App add to favorites/miniapps
                                    if (anyWindow.ethereum?.isCoinbaseWallet || anyWindow.ethereum?.isBase) {
                                        try {
                                            await anyWindow.ethereum.request({
                                                method: 'wallet_addToMiniApps',
                                                params: [{
                                                    url: window.location.origin,
                                                    name: 'FCWEED',
                                                    iconUrl: 'https://bafybeickwgk2dnzpg7mx3dgz43v2uotxaueu2b3giz57ppx4yoe6ypnbxq.ipfs.dweb.link'
                                                }]
                                            });
                                        } catch (baseErr) {
                                            console.log('[Add to Apps] Base wallet method failed:', baseErr);
                                        }
                                    }
                                    
                                    // Try generic ethereum provider method
                                    if (anyWindow.ethereum?.request) {
                                        anyWindow.ethereum.request({
                                            method: 'wallet_addToMiniApps',
                                            params: [{
                                                url: window.location.origin,
                                                name: 'FCWEED',
                                                iconUrl: 'https://bafybeickwgk2dnzpg7mx3dgz43v2uotxaueu2b3giz57ppx4yoe6ypnbxq.ipfs.dweb.link'
                                            }]
                                        }).catch(() => {});
                                    }
                                    
                                    // For Farcaster
                                    if (sdk.actions?.addFrame) {
                                        await sdk.actions.addFrame().catch(() => {});
                                    }
                                } catch (err) {
                                    console.log('[Add to Apps] Error:', err);
                                }
                                dismissOnboarding();
                            }}
                            style={{
                                width: "100%",
                                padding: "10px 20px",
                                borderRadius: 10,
                                border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.2)"}`,
                                background: "transparent",
                                color: theme === "light" ? "#1e293b" : "#fff",
                                fontWeight: 500,
                                fontSize: 12,
                                cursor: "pointer"
                            }}
                        >
                            ➕ Add to My Apps
                        </button>
                    </div>
                </div>
            )}
            
            
            {showDisconnectModal && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.85)",
                    backdropFilter: "blur(10px)",
                    zIndex: 1000,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16
                }} onClick={() => setShowDisconnectModal(false)}>
                    <div 
                        style={{
                            background: theme === "light" ? "#ffffff" : "#0f172a",
                            borderRadius: 20,
                            border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.1)"}`,
                            maxWidth: 320,
                            width: "100%",
                            padding: 24,
                            textAlign: "center"
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {userAvatar && (
                            <img 
                                src={userAvatar} 
                                alt="avatar" 
                                style={{ 
                                    width: 64, 
                                    height: 64, 
                                    borderRadius: "50%",
                                    objectFit: "cover",
                                    marginBottom: 12,
                                    border: `3px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.2)"}`
                                }} 
                            />
                        )}
                        <h3 style={{ 
                            fontSize: 18, 
                            fontWeight: 600, 
                            marginBottom: 4,
                            color: theme === "light" ? "#1e293b" : "#fff"
                        }}>
                            {displayName || shortAddr(userAddress)}
                        </h3>
                        <p style={{ 
                            fontSize: 11, 
                            color: theme === "light" ? "#64748b" : "#94a3b8",
                            marginBottom: 20,
                            wordBreak: "break-all"
                        }}>
                            {userAddress}
                        </p>
                        
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            <button
                                onClick={() => {
                                    navigator.clipboard.writeText(userAddress || "");
                                    setShowDisconnectModal(false);
                                }}
                                style={{
                                    width: "100%",
                                    padding: "12px 20px",
                                    borderRadius: 12,
                                    border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.2)"}`,
                                    background: "transparent",
                                    color: theme === "light" ? "#1e293b" : "#fff",
                                    fontWeight: 500,
                                    fontSize: 13,
                                    cursor: "pointer"
                                }}
                            >
                                📋 Copy Address
                            </button>
                            <button
                                onClick={disconnectWallet}
                                style={{
                                    width: "100%",
                                    padding: "12px 20px",
                                    borderRadius: 12,
                                    border: "none",
                                    background: "linear-gradient(135deg, #ef4444, #dc2626)",
                                    color: "#fff",
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: "pointer"
                                }}
                            >
                                🔌 Disconnect
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Shield Warning Modal for Cartel Wars */}
            {showShieldWarning && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.9)",
                    backdropFilter: "blur(10px)",
                    zIndex: 1001,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 16
                }} onClick={() => setShowShieldWarning(false)}>
                    <div 
                        style={{
                            background: theme === "light" ? "#ffffff" : "linear-gradient(135deg, #1e1e2f, #0f172a)",
                            borderRadius: 20,
                            border: "2px solid rgba(239,68,68,0.5)",
                            maxWidth: 340,
                            width: "100%",
                            padding: 24,
                            textAlign: "center"
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️⚠️</div>
                        <h3 style={{ 
                            fontSize: 20, 
                            fontWeight: 700, 
                            marginBottom: 8,
                            color: "#ef4444"
                        }}>
                            Shield Active!
                        </h3>
                        <p style={{ 
                            fontSize: 13, 
                            color: theme === "light" ? "#64748b" : "#94a3b8",
                            marginBottom: 8,
                            lineHeight: 1.5
                        }}>
                            You have an active <strong style={{ color: "#3b82f6" }}>Raid Shield</strong> protecting your farm.
                        </p>
                        <p style={{ 
                            fontSize: 13, 
                            color: "#ef4444",
                            marginBottom: 20,
                            fontWeight: 600
                        }}>
                            Attacking will REMOVE your shield protection!
                        </p>
                        
                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                onClick={() => {
                                    setShowShieldWarning(false);
                                    setWarsStatus("");
                                }}
                                style={{
                                    flex: 1,
                                    padding: "14px 16px",
                                    borderRadius: 12,
                                    border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.2)"}`,
                                    background: "transparent",
                                    color: theme === "light" ? "#1e293b" : "#fff",
                                    fontWeight: 600,
                                    fontSize: 14,
                                    cursor: "pointer"
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={continueSearchWithShield}
                                style={{
                                    flex: 1,
                                    padding: "14px 16px",
                                    borderRadius: 12,
                                    border: "none",
                                    background: "linear-gradient(135deg, #dc2626, #ef4444)",
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: 14,
                                    cursor: "pointer"
                                }}
                            >
                                ⚔️ Attack Anyway
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            
            <header className={styles.headerWrapper} style={{
                background: theme === "light" ? "rgba(255,255,255,0.95)" : "rgba(5, 8, 20, 0.95)",
                borderBottom: theme === "light" ? "1px solid #e2e8f0" : "1px solid rgba(255,255,255,0.1)",
                padding: "8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: 6
            }}>
                {/* Row 1: Brand + Theme */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ color: theme === "light" ? "#1e293b" : "#fff", fontSize: 16, fontWeight: 700 }}>FCWEED</span>
                    <button 
                        type="button" 
                        onClick={toggleTheme}
                        style={{ 
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            border: `1px solid ${theme === "light" ? "#cbd5e1" : "rgba(255,255,255,0.2)"}`,
                            background: theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.1)",
                            color: theme === "light" ? "#1e293b" : "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            fontSize: 14
                        }}
                        title={theme === "dark" ? "Light Mode" : "Dark Mode"}
                    >
                        {theme === "dark" ? "☀️" : "🌙"}
                    </button>
                </div>
                
                {/* Row 2: Wallet + Radio */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                    <ConnectWalletButton />
                    
                    {/* Radio Pill */}
                    <div style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        background: theme === "light" ? "#f1f5f9" : "rgba(255,255,255,0.1)",
                        border: `1px solid ${theme === "light" ? "#cbd5e1" : "rgba(255,255,255,0.2)"}`,
                        borderRadius: 8,
                        padding: "4px 10px",
                        height: 32
                    }}>
                        <span style={{ fontSize: 12 }}>📻</span>
                        <div style={{ 
                            overflow: "hidden", 
                            width: 80, 
                            height: 16,
                            position: "relative"
                        }}>
                            <span style={{ 
                                color: theme === "light" ? "#1e293b" : "#fff",
                                position: "absolute",
                                whiteSpace: "nowrap",
                                fontSize: 11,
                                fontWeight: 500,
                                animation: "scrollText 10s linear infinite"
                            }}>
                                {currentTrackMeta.title}
                            </span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                            <button type="button" onClick={handlePrevTrack} style={{ width: 22, height: 22, border: "none", background: "transparent", color: theme === "light" ? "#64748b" : "#9ca3af", cursor: "pointer", fontSize: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>‹</button>
                            <button type="button" onClick={handlePlayPause} style={{ width: 22, height: 22, border: "none", background: "transparent", color: theme === "light" ? "#1e293b" : "#fff", cursor: "pointer", fontSize: 12, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{isPlaying ? "❚❚" : "▶"}</button>
                            <button type="button" onClick={handleNextTrack} style={{ width: 22, height: 22, border: "none", background: "transparent", color: theme === "light" ? "#64748b" : "#9ca3af", cursor: "pointer", fontSize: 14, padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>›</button>
                        </div>
                    </div>
                    <audio ref={audioRef} src={currentTrackMeta.src} onEnded={handleNextTrack} autoPlay style={{ display: "none" }} />
                </div>
            </header>

            <main className={styles.main}>
                {activeTab === "info" && (
                    <>
                        <section style={{ textAlign: "center", padding: "10px 0", display: "flex", justifyContent: "center", minHeight: 100 }}>
                            <Image 
                                src={GIFS[gifIndex]} 
                                alt="FCWEED" 
                                width={280} 
                                height={100} 
                                style={{ 
                                    borderRadius: 14, 
                                    objectFit: "cover",
                                    opacity: imagesLoaded ? 1 : 0,
                                    transition: "opacity 0.3s ease"
                                }} 
                                priority
                            />
                        </section>

                        
                        <section style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                            <div style={{
                                background: theme === "light" 
                                    ? "linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(59, 130, 246, 0.1))"
                                    : "linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(59, 130, 246, 0.15))",
                                border: `1px solid ${theme === "light" ? "rgba(16, 185, 129, 0.2)" : "rgba(16, 185, 129, 0.3)"}`,
                                borderRadius: 12,
                                padding: "12px 20px",
                                display: "flex",
                                flexWrap: "wrap",
                                justifyContent: "center",
                                gap: 16,
                                maxWidth: 420
                            }}>
                                <div style={{ textAlign: "center", minWidth: 80 }}>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af", marginBottom: 2 }}>🔥 Burned</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{tokenStats.loading ? "..." : tokenStats.burned}</div>
                                </div>
                                <div style={{ textAlign: "center", minWidth: 80 }}>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af", marginBottom: 2 }}>🏦 Treasury</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: theme === "light" ? "#d97706" : "#fbbf24" }}>{tokenStats.loading ? "..." : tokenStats.treasury}</div>
                                </div>
                                <div style={{ textAlign: "center", minWidth: 80 }}>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af", marginBottom: 2 }}>🔒 Controlled</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#a855f7" }}>{tokenStats.loading ? "..." : tokenStats.controlledPct + "%"}</div>
                                </div>
                                <div style={{ textAlign: "center", minWidth: 80 }}>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af", marginBottom: 2 }}>💰 Circulating</div>
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>{tokenStats.loading ? "..." : tokenStats.circulatingPct + "%"}</div>
                                </div>
                            </div>
                        </section>

                        <section className={styles.infoCard} style={getCardStyle()}>
                            <CrimeLadder
                                connected={!!userAddress}
                                loading={leaderboardLoading}
                                rows={leaderboardItems.slice(0, 10)}
                                farmerCount={farmerCount}
                                walletRank={userLeaderboardRank}
                                walletRow={userLeaderboardRow}
                                onRefresh={refreshLeaderboard}
                                theme={theme}
                            />
                        </section>
                        <section className={styles.infoCard} style={getCardStyle()}>
                            <h2 className={styles.heading} style={{ color: getTextColor("primary") }}>How it Works</h2>
                            <ul className={styles.bulletList} style={{ color: getTextColor("secondary") }}>
                                <li>Connect your wallet on Base to begin.</li>
                                <li>Mint <b>Plant Bud NFTs</b> and stake them for yield.</li>
                                <li>Mint <b>Land NFTs</b> (all Lands are equal rarity).</li>
                                <li>Each Land allows you to stake <b style={{ color: "#16a34a" }}>+3 extra Plant Buds</b>.</li>
                                <li>Each Land grants a <b style={{ color: "#16a34a" }}>+2.5% token boost</b> to all yield earned.</li>
                                <li>The more Land you stack — the stronger your multiplier will be.</li>
                                <li style={{ color: theme === "light" ? "#d97706" : "#fbbf24" }}><b>Super Land</b> — Burn 1 Land + 2M FCWEED to upgrade!</li>
                                <li>Each Super Land grants <b style={{ color: theme === "light" ? "#d97706" : "#fbbf24" }}>+12% token boost</b>.</li>
                                <li style={{ color: theme === "light" ? "#d97706" : "#fbbf24" }}><b>Open Crates</b> for Prizes by spending <b>200,000 $FCWEED</b>!</li>
                                <li style={{ color: "#ef4444", marginTop: 8 }}><b>Cartel Wars (PvP)</b> — Battle other farmers!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Pay <b>50K FCWEED</b> to search for opponents with 200K+ pending</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Combat Power = Plants × Health × Boosts</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Win: steal up to 50% | Lose: lose up to 50%</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b style={{ color: "#fbbf24" }}>6h cooldown</b> between attacks</li>
                                <li style={{ color: "#ef4444", marginTop: 8 }}><b>DEA RAIDS (Hunt Sellers) (Testing - Not Activated)</b> — Target wallets that sold FCWEED!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Pay <b>100K FCWEED</b> raid fee to attack sellers</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b style={{ color: "#fbbf24" }}>6h cooldown</b> (Same Target) | <b style={{ color: "#fbbf24" }}>2h cooldown</b> (After Successful Raid)</li>
                                <li style={{ color: "#dc2626", marginTop: 8 }}><b>THE PURGE (Chaos Event) (Testing - Not Activated)</b> — Weekly chaos mode!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Active <b>Saturday 11PM - Sunday 11PM EST</b></li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Pay <b>250K FCWEED</b> to target ANY wallet directly</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b style={{ color: "#fbbf24" }}>20 min cooldown</b> | <b style={{ color: "#ef4444" }}>All shields BYPASSED</b></li>
                                <li style={{ color: "#10b981", marginTop: 8 }}><b>Item Shop</b> — Power-ups for your Farm!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Water</b> — Restores Plant Health (Shop open 12PM-6PM EST)</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Health Pack</b> — Heals one Plant Max to 80%, Usage: 1 Per Plant</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Raid Shield</b> — 24h Protection, Purge Bypasses Shields</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Attack Boost</b> — +20% Power for 6h</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>AK-47</b> — +100% Power for 6h</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>RPG</b> — +500% Power for 1h</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Tactical Nuke</b> — +10,000% Power for 10min, just enough time to destroy your worst enemy. <b style={{ color: "#ef4444" }}>DAMAGE: 50% | STEAL: 50%</b></li>
                            </ul>
                            <h2 className={styles.heading} style={{ color: getTextColor("primary") }}>Use of Funds</h2>
                            <ul className={styles.bulletList} style={{ color: getTextColor("secondary") }}>
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
                        <section className={styles.infoCard} style={getCardStyle()}>
                            <h2 className={styles.heading} style={{ color: getTextColor("primary") }}>Coming Soon</h2>
                            <ul className={styles.bulletList} style={{ color: getTextColor("secondary") }}>
                                <li style={{ color: theme === "light" ? "#d97706" : "#fbbf24" }}>🎁 <b>Referrals + Quests</b> — Earn rewards for inviting friends and completing Quests</li>
                                <li style={{ color: theme === "light" ? "#d97706" : "#fbbf24" }}>🛒 <b>More Shop Items</b> — Fertilizers, Growth Serums, Weapons, Explosives...</li>
                            </ul>
                        </section>
                    </>
                )}

        {activeTab === "mint" && (
            <section className={styles.infoCard} style={getCardStyle({ textAlign: "center", padding: 20 })}>
                <h2 style={{ fontSize: 18, margin: "0 0 12px", color: theme === "light" ? "#2563eb" : "#7cb3ff" }}>Mint NFTs</h2>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, minHeight: 95 }}>
                    <Image 
                        src={GIFS[gifIndex]} 
                        alt="FCWEED" 
                        width={260} 
                        height={95} 
                        style={{ 
                            borderRadius: 12, 
                            objectFit: "cover",
                            opacity: imagesLoaded ? 1 : 0,
                            transition: "opacity 0.3s ease"
                        }} 
                    />
                </div>

                
                <div style={{
                    display: "flex",
                    justifyContent: "center",
                    gap: 12,
                    marginBottom: 16,
                    flexWrap: "wrap"
                }}>
                    <div style={{
                        background: "rgba(34, 197, 94, 0.15)",
                        border: "1px solid rgba(34, 197, 94, 0.4)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        minWidth: 90
                    }}>
                        <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>🌱 Plants</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>
                            {nftSupply.loading ? "..." : `${nftSupply.plants}/1111`}
                        </div>
                    </div>
                    <div style={{
                        background: "rgba(139, 92, 246, 0.15)",
                        border: "1px solid rgba(139, 92, 246, 0.4)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        minWidth: 90
                    }}>
                        <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>🏠 Land</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#8b5cf6" }}>
                            {nftSupply.loading ? "..." : `${nftSupply.lands}/420`}
                        </div>
                    </div>
                    <div style={{
                        background: "rgba(251, 191, 36, 0.15)",
                        border: "1px solid rgba(251, 191, 36, 0.4)",
                        borderRadius: 8,
                        padding: "8px 14px",
                        minWidth: 90
                    }}>
                        <div style={{ fontSize: 9, color: "#9ca3af", marginBottom: 2 }}>⭐ Super Land</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>
                            {nftSupply.loading ? "..." : `${nftSupply.superLands}/99`}
                        </div>
                    </div>
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
                    <section className={styles.infoCard} style={getCardStyle({ textAlign: "center", padding: 20 })}>
                        <h2 style={{ fontSize: 18, margin: "0 0 12px", color: "#7cb3ff" }}>Staking</h2>
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, minHeight: 95 }}>
                            <Image 
                                src={GIFS[gifIndex]} 
                                alt="FCWEED" 
                                width={260} 
                                height={95} 
                                style={{ 
                                    borderRadius: 12, 
                                    objectFit: "cover",
                                    opacity: imagesLoaded ? 1 : 0,
                                    transition: "opacity 0.3s ease"
                                }} 
                            />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                            <button type="button" className={styles.btnPrimary} onClick={() => setV5StakingOpen(true)} style={{ width: "100%", padding: 14, background: "linear-gradient(to right, #10b981, #34d399)" }}>🚀 Staking V5</button>
                            <button type="button" className={styles.btnPrimary} onClick={() => setV4StakingOpen(true)} style={{ width: "100%", padding: 14, background: "linear-gradient(to right, #6b7280, #9ca3af)" }}>⬅️ Staking V4 (UNSTAKE ONLY)</button>
                        </div>
                        <div style={{ marginTop: 12, padding: 10, background: "rgba(16,185,129,0.1)", borderRadius: 10, border: "1px solid rgba(16,185,129,0.3)" }}>
                            <p style={{ fontSize: 11, color: "#10b981", margin: 0, fontWeight: 600 }}>🚀 V5 is LIVE! Claim enabled 12/25 @ Midnight EST. Migrate from V4 now!</p>
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

                        <section className={styles.infoCard} style={getCardStyle({ padding: '14px 10px' })}>
                            <h2 style={{ fontSize: 15, margin: '0 0 10px', color: '#7cb3ff', textAlign: 'center' }}>Open Crates for Prizes</h2>

                            {connected && (
                                <>
                                    
                                    <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 12px', marginBottom: 10, textAlign: 'center' }}>
                                        <div style={{ color: '#f87171', fontSize: 9, fontWeight: 600, marginBottom: 2 }}>🔥 GLOBAL FCWEED SPENT</div>
                                        <div style={{ color: '#f87171', fontWeight: 800, fontSize: 16 }}>{crateGlobalStats.totalBurned}</div>
                                    </div>
                                    
                                    
                                    <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 12, padding: 12, marginBottom: 12 }}>
                                        <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600, marginBottom: 8, textAlign: "center" }}>📊 YOUR STATS</div>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 6 }}>
                                            <div style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                                <div style={{ color: '#6b7280', fontSize: 7, marginBottom: 2 }}>FCWEED</div>
                                                <div style={{ color: '#34d399', fontWeight: 700, fontSize: 11 }}>{fcweedBalance}</div>
                                            </div>
                                            <div style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                                <div style={{ color: '#6b7280', fontSize: 7, marginBottom: 2 }}>DUST</div>
                                                <div style={{ color: '#d1d5db', fontWeight: 700, fontSize: 11 }}>{crateUserStats.dust.toLocaleString()}</div>
                                            </div>
                                            <div style={{ background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                                <div style={{ color: '#6b7280', fontSize: 7, marginBottom: 2 }}>OPENED</div>
                                                <div style={{ color: '#fbbf24', fontWeight: 700, fontSize: 11 }}>{crateUserStats.opened}</div>
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                                            <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                                <div style={{ color: '#6b7280', fontSize: 7, marginBottom: 2 }}>FCWEED WON</div>
                                                <div style={{ color: '#4ade80', fontWeight: 700, fontSize: 11 }}>{crateUserStats.fcweed >= 1e6 ? (crateUserStats.fcweed / 1e6).toFixed(1) + "M" : crateUserStats.fcweed >= 1e3 ? (crateUserStats.fcweed / 1e3).toFixed(0) + "K" : crateUserStats.fcweed.toFixed(0)}</div>
                                            </div>
                                            <div style={{ background: 'rgba(39,117,202,0.1)', border: '1px solid rgba(39,117,202,0.3)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                                <div style={{ color: '#6b7280', fontSize: 7, marginBottom: 2 }}>USDC WON</div>
                                                <div style={{ color: '#2775CA', fontWeight: 700, fontSize: 11 }}>${crateUserStats.usdc.toFixed(2)}</div>
                                            </div>
                                            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '6px 8px', textAlign: 'center' }}>
                                                <div style={{ color: '#6b7280', fontSize: 7, marginBottom: 2 }}>FCWEED SPENT</div>
                                                <div style={{ color: '#f87171', fontWeight: 700, fontSize: 11 }}>{crateUserStats.totalSpent >= 1e6 ? (crateUserStats.totalSpent / 1e6).toFixed(1) + "M" : crateUserStats.totalSpent >= 1e3 ? (crateUserStats.totalSpent / 1e3).toFixed(0) + "K" : crateUserStats.totalSpent.toFixed(0)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </>
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

                
                {crateShowWin && crateWon && (
                    <div className={styles.modalBackdrop} onClick={onCrateClose}>
                        <div id="crate-win-card" className={`${styles.modal} c-pop ${crateWon.isJackpot ? 'c-jack' : ''}`} onClick={e => e.stopPropagation()} style={{ maxWidth: 300, padding: 20, background: crateWon.isJackpot ? 'linear-gradient(135deg, #1a1a2e, #16213e)' : '#0f172a', border: crateWon.isJackpot ? '2px solid #ffd700' : '1px solid #334155' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 48, marginBottom: 6 }}>{crateIcon(crateWon.token)}</div>
                                <h2 style={{ fontSize: 18, color: crateWon.color, margin: '0 0 2px', fontWeight: 800 }}>{crateWon.name}</h2>
                                <div style={{ fontSize: 28, fontWeight: 900, color: crateWon.color, marginBottom: 6 }}>{crateWon.amount} <span style={{ fontSize: 12, opacity: 0.8 }}>{crateWon.token}</span></div>
                                <p style={{ fontSize: 11, color: '#9ca3af', margin: '0 0 12px' }}>{crateWon.isJackpot ? '🎉 JACKPOT! 🎉' : crateWon.token === 'DUST' ? 'For use in Item Shop later!' : crateWon.isNFT ? 'NFT sent!' : 'Sent!'}</p>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button type="button" onClick={onCrateClose} className={styles.btnPrimary} style={{ flex: 1, padding: 12, fontSize: 12, background: crateWon.token === 'DUST' ? 'linear-gradient(135deg, #4b5563, #6b7280)' : 'linear-gradient(135deg, #059669, #10b981)' }}>{crateWon.token === 'DUST' ? 'Collect' : 'Awesome!'}</button>
                                    <button 
                                        type="button" 
                                        onClick={() => {
                                            const text = crateWon.isJackpot 
                                                ? `🎰 JACKPOT on FCWEED Crates! 🎉\n\nWon ${crateWon.amount} ${crateWon.token}! 💰\n\nTry your luck on @base 🌿\n\nhttps://x420ponzi.com`
                                                : `🎰 Opened a FCWEED Mystery Crate!\n\nWon ${crateWon.amount} ${crateWon.token}! ${crateWon.isNFT ? '🖼️' : '💰'}\n\nTry your luck on @base 🌿\n\nhttps://x420ponzi.com`;
                                            captureAndShare('crate-win-card', text, composeCast);
                                        }}
                                        style={{ padding: 12, fontSize: 12, borderRadius: 8, border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(29,161,242,0.2)', color: '#1da1f2', cursor: 'pointer' }}
                                    >
                                        📸
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === "wars" && (
                    <section className={styles.infoCard} style={getCardStyle({ textAlign: "center", padding: 16 })}>
                        <h2 style={{ fontSize: 18, margin: "0 0 8px", color: "#ef4444" }}>⚔️ Cartel Wars</h2>

                        
                        <div style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: 12,
                            fontSize: 10,
                            color: warsBackendStatus === "online" ? "#10b981" : warsBackendStatus === "offline" ? "#ef4444" : theme === "light" ? "#64748b" : "#9ca3af"
                        }}>
                            <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                background: warsBackendStatus === "online" ? "#10b981" : warsBackendStatus === "offline" ? "#ef4444" : "#6b7280"
                            }} />
                            Backend: {warsBackendStatus === "online" ? "Online" : warsBackendStatus === "offline" ? "Offline" : "Checking..."}
                        </div>

                        
                        <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.08))", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 12, padding: 14, marginBottom: 16, textAlign: "left" }}>
                            <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700, marginBottom: 12, textAlign: "center" }}>📖 HOW IT ALL WORKS</div>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
                                <div>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: "#60a5fa", marginBottom: 4 }}>⚔️ CARTEL WARS (PvP)</div>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#475569" : "#c0c9f4", lineHeight: 1.5, paddingLeft: 8 }}>
                                        • Pay <span style={{ color: "#fbbf24" }}>50K FCWEED</span> to search for opponents with 200K+ pending<br/>
                                        • Combat Power = Plants × Health × Boosts | Win: steal up to 50% | Lose: lose up to 50%<br/>
                                        • <span style={{ color: "#fbbf24" }}>6h cooldown between attacks</span>
                                    </div>
                                </div>
                                <div style={{ borderTop: "1px solid rgba(139,92,246,0.2)", paddingTop: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>🚔 DEA RAIDS (Hunt Sellers) (Testing - Not Activated)</div>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#475569" : "#c0c9f4", lineHeight: 1.5, paddingLeft: 8 }}>
                                        • Target wallets that sold FCWEED (under investigation)<br/>
                                        • Pay <span style={{ color: "#fbbf24" }}>100K FCWEED</span> raid fee<br/>
                                        • <span style={{ color: "#fbbf24" }}>6h cooldown</span> (Same Target) | <span style={{ color: "#fbbf24" }}>2h cooldown</span> (After Successful Raid)
                                    </div>
                                </div>
                                <div style={{ borderTop: "1px solid rgba(139,92,246,0.2)", paddingTop: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>🔪 THE PURGE (Chaos Event) (Testing - Not Activated)</div>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#475569" : "#c0c9f4", lineHeight: 1.5, paddingLeft: 8 }}>
                                        • Scheduled chaos events - target ANY wallet directly for <span style={{ color: "#fbbf24" }}>250K FCWEED</span>!<br/>
                                        • <span style={{ color: "#fbbf24" }}>20 min cooldown</span> | <span style={{ color: "#ef4444" }}>All shields BYPASSED</span>. No mercy.
                                    </div>
                                </div>
                            </div>
                        </div>


                        
                        {connected && (
                            <div style={{ background: theme === "light" ? "rgba(99,102,241,0.05)" : "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                                <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, marginBottom: 8, textAlign: "center" }}>🎒 INVENTORY</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
                                    {/* AK-47 */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 6, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 85 }}>
                                        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                                            <img src="/images/items/ak47.png" alt="AK-47" style={{ maxWidth: 24, maxHeight: 24, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 7, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>AK-47</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>{inventoryAK47}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {ak47Expiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((ak47Expiry - Math.floor(Date.now() / 1000)) / 3600)}h {Math.floor(((ak47Expiry - Math.floor(Date.now() / 1000)) % 3600) / 60)}m</div>
                                            ) : (
                                                <button onClick={handleActivateAK47} disabled={inventoryAK47 === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryAK47 > 0 ? "linear-gradient(135deg, #ef4444, #dc2626)" : "#374151", color: "#fff", cursor: inventoryAK47 > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Tactical Nuke */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(239,68,68,0.1)", borderRadius: 8, padding: 6, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", border: "1px solid rgba(239,68,68,0.3)", minHeight: 85 }}>
                                        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                                            <img src="/images/items/nuke.png" alt="Nuke" style={{ maxWidth: 24, maxHeight: 24, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 6, color: "#ef4444", fontWeight: 600, marginBottom: 2 }}>NUKE</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>{inventoryNuke}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {nukeExpiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((nukeExpiry - Math.floor(Date.now() / 1000)) / 60)}m {(nukeExpiry - Math.floor(Date.now() / 1000)) % 60}s</div>
                                            ) : (
                                                <button onClick={() => setNukeConfirmOpen(true)} disabled={inventoryNuke === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryNuke > 0 ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "#374151", color: "#fff", cursor: inventoryNuke > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* RPG */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 6, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 85 }}>
                                        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                                            <img src="/images/items/rpg.png" alt="RPG" style={{ maxWidth: 24, maxHeight: 24, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 7, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>RPG</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#a855f7", marginBottom: 4 }}>{inventoryRPG}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {rpgExpiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((rpgExpiry - Math.floor(Date.now() / 1000)) / 60)}m {(rpgExpiry - Math.floor(Date.now() / 1000)) % 60}s</div>
                                            ) : (
                                                <button onClick={handleActivateRPG} disabled={inventoryRPG === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryRPG > 0 ? "linear-gradient(135deg, #a855f7, #8b5cf6)" : "#374151", color: "#fff", cursor: inventoryRPG > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Health Packs */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 6, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 85 }}>
                                        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                                            <img src="/images/items/healthpack.png" alt="Health Pack" style={{ maxWidth: 24, maxHeight: 24, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 6, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>HEALTH</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981", marginBottom: 4 }}>{inventoryHealthPacks}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            <button onClick={() => setHealthPackModalOpen(true)} disabled={inventoryHealthPacks === 0 || v5StakedPlants.length === 0} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryHealthPacks > 0 && v5StakedPlants.length > 0 ? "linear-gradient(135deg, #10b981, #34d399)" : "#374151", color: "#fff", cursor: inventoryHealthPacks > 0 && v5StakedPlants.length > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Use</button>
                                        </div>
                                    </div>
                                    {/* Shields */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 6, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 85 }}>
                                        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                                            <span style={{ fontSize: 20 }}>🛡️</span>
                                        </div>
                                        <div style={{ fontSize: 7, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>SHIELDS</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#3b82f6", marginBottom: 4 }}>{inventoryShields}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {shieldExpiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((shieldExpiry - Math.floor(Date.now() / 1000)) / 3600)}h {Math.floor(((shieldExpiry - Math.floor(Date.now() / 1000)) % 3600) / 60)}m</div>
                                            ) : (
                                                <button onClick={handleActivateShield} disabled={inventoryShields === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryShields > 0 ? "linear-gradient(135deg, #3b82f6, #60a5fa)" : "#374151", color: "#fff", cursor: inventoryShields > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Attack Boost */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 6, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 85 }}>
                                        <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 2 }}>
                                            <span style={{ fontSize: 20 }}>⚡</span>
                                        </div>
                                        <div style={{ fontSize: 6, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>BOOST</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>{inventoryBoosts}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {boostExpiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((boostExpiry - Math.floor(Date.now() / 1000)) / 3600)}h {Math.floor(((boostExpiry - Math.floor(Date.now() / 1000)) % 3600) / 60)}m</div>
                                            ) : (
                                                <button onClick={handleActivateBoost} disabled={inventoryBoosts === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryBoosts > 0 ? "linear-gradient(135deg, #f59e0b, #fbbf24)" : "#374151", color: inventoryBoosts > 0 ? "#000" : "#fff", cursor: inventoryBoosts > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {inventoryStatus && <div style={{ fontSize: 9, color: "#fbbf24", marginTop: 6, textAlign: "center" }}>{inventoryStatus}</div>}
                            </div>
                        )}


                        
                        {connected && warsPlayerStats && (
                            <>
                                {warsPlayerStats.hasShield && (
                                    <div style={{ background: theme === "light" ? "rgba(59,130,246,0.1)" : "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 8, padding: 8, marginBottom: 12 }}>
                                        <div style={{ fontSize: 11, color: "#3b82f6", fontWeight: 600 }}>🛡️ Raid Shield ACTIVE</div>
                                        <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af" }}>Protected from attacks. Attacking others will remove your shield!</div>
                                    </div>
                                )}
                                
                                
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                    {/* Defense Box */}
                                    <div style={{ background: theme === "light" ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 10, padding: 10, overflow: "hidden" }}>
                                        <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>🛡️ Defense</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>WINS</div>
                                                <div style={{ fontSize: 18, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.defWins || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>LOSSES</div>
                                                <div style={{ fontSize: 18, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.defLosses || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>LOST</div>
                                                <div style={{ fontSize: 14, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.rewardsLost ? formatLargeNumber(warsPlayerStats.rewardsLost) : "0"}</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Attack Box */}
                                    <div style={{ background: theme === "light" ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 10, overflow: "hidden" }}>
                                        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>⚔️ Attack</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>WINS</div>
                                                <div style={{ fontSize: 18, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.wins || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>LOSSES</div>
                                                <div style={{ fontSize: 18, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.losses || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>STOLEN</div>
                                                <div style={{ fontSize: 14, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.rewardsStolen ? formatLargeNumber(warsPlayerStats.rewardsStolen) : "0"}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}

                        
                        {connected && v5StakingStats && (
                            <div style={{ background: theme === "light" ? "rgba(139,92,246,0.08)" : "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                <div style={{ fontSize: 12, color: "#a78bfa", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>🌿 FCWEED FARM COMBAT POWER</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 8 }}>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af" }}>PLANTS</div>
                                        <div style={{ fontSize: 16, color: "#22c55e", fontWeight: 700 }}>{v5StakedPlants.length}</div>
                                    </div>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af" }}>LANDS</div>
                                        <div style={{ fontSize: 16, color: "#8b4513", fontWeight: 700 }}>{v5StakedLands.length}</div>
                                    </div>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af" }}>SUPER LANDS</div>
                                        <div style={{ fontSize: 16, color: "#ff6b35", fontWeight: 700 }}>{v5StakedSuperLands.length}</div>
                                    </div>
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af" }}>AVG HEALTH</div>
                                        <div style={{ fontSize: 14, color: v5StakingStats.avgHealth >= 70 ? "#22c55e" : v5StakingStats.avgHealth >= 40 ? "#fbbf24" : "#ef4444", fontWeight: 700 }}>{v5StakingStats.avgHealth || 0}%</div>
                                    </div>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af" }}>LAND BOOST</div>
                                        <div style={{ fontSize: 14, color: "#fbbf24", fontWeight: 700 }}>+{v5StakingStats.boostPct || 0}%</div>
                                    </div>
                                </div>
                                {(boostExpiry > Math.floor(Date.now() / 1000) || ak47Expiry > Math.floor(Date.now() / 1000) || rpgExpiry > Math.floor(Date.now() / 1000) || nukeExpiry > Math.floor(Date.now() / 1000)) ? (
                                    <div style={{ background: theme === "light" ? "rgba(245,158,11,0.1)" : "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 6, padding: 6, marginBottom: 8 }}>
                                        <div style={{ fontSize: 8, color: "#fbbf24", fontWeight: 600, marginBottom: 4, textAlign: "center" }}>⚡ ACTIVE MODIFIERS</div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
                                            {boostExpiry > Math.floor(Date.now() / 1000) && (
                                                <span style={{ background: "rgba(245,158,11,0.2)", padding: "2px 6px", borderRadius: 4, fontSize: 8, color: "#fbbf24", fontWeight: 600 }}>⚡ +20% ({Math.floor((boostExpiry - Math.floor(Date.now() / 1000)) / 3600)}h {Math.floor(((boostExpiry - Math.floor(Date.now() / 1000)) % 3600) / 60)}m)</span>
                                            )}
                                            {ak47Expiry > Math.floor(Date.now() / 1000) && (
                                                <span style={{ background: "rgba(239,68,68,0.2)", padding: "2px 6px", borderRadius: 4, fontSize: 8, color: "#ef4444", fontWeight: 600 }}>🔫 AK-47 +100% ({Math.floor((ak47Expiry - Math.floor(Date.now() / 1000)) / 3600)}h {Math.floor(((ak47Expiry - Math.floor(Date.now() / 1000)) % 3600) / 60)}m)</span>
                                            )}
                                            {rpgExpiry > Math.floor(Date.now() / 1000) && (
                                                <span style={{ background: "rgba(168,85,247,0.2)", padding: "2px 6px", borderRadius: 4, fontSize: 8, color: "#a855f7", fontWeight: 600 }}>🚀 RPG +500% ({Math.floor((rpgExpiry - Math.floor(Date.now() / 1000)) / 60)}m {(rpgExpiry - Math.floor(Date.now() / 1000)) % 60}s)</span>
                                            )}
                                            {nukeExpiry > Math.floor(Date.now() / 1000) && (
                                                <span style={{ background: "rgba(239,68,68,0.3)", padding: "2px 6px", borderRadius: 4, fontSize: 8, color: "#ef4444", fontWeight: 700 }}>☢️ NUKE +10000% ({Math.floor((nukeExpiry - Math.floor(Date.now() / 1000)) / 60)}m {(nukeExpiry - Math.floor(Date.now() / 1000)) % 60}s)</span>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: theme === "light" ? "rgba(107,114,128,0.1)" : "rgba(107,114,128,0.15)", border: "1px solid rgba(107,114,128,0.3)", borderRadius: 6, padding: 6, marginBottom: 8, textAlign: "center" }}>
                                        <div style={{ fontSize: 8, color: "#6b7280", fontWeight: 600 }}>No Active Modifiers</div>
                                    </div>
                                )}
                                <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.15))", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 8, padding: 8, textAlign: "center" }}>
                                    <div style={{ fontSize: 9, color: "#a78bfa", marginBottom: 2 }}>TOTAL COMBAT POWER</div>
                                    <div style={{ fontSize: 22, color: "#a78bfa", fontWeight: 800 }}>
                                        {(() => {
                                            // Contract formula: (plants * 100 + lands * 50 + superLands * 150) * avgHealth / 100
                                            const plants = v5StakedPlants?.length || 0;
                                            const lands = v5StakedLands?.length || 0;
                                            const superLands = v5StakedSuperLands?.length || 0;
                                            const avgHealth = v5StakingStats?.avgHealth || 100;
                                            
                                            let basePower = Math.round((plants * 100 + lands * 50 + superLands * 150) * avgHealth / 100);
                                            
                                            // Apply item boost multipliers (same as contract: power * (BPS + boostBps) / BPS)
                                            // BPS = 10000, so +100% boost = boostBps of 10000
                                            const now = Math.floor(Date.now() / 1000);
                                            if (nukeExpiry > now) basePower = Math.floor(basePower * (10000 + 1000000) / 10000); // +10000% = 101x
                                            else if (rpgExpiry > now) basePower = Math.floor(basePower * (10000 + 50000) / 10000); // +500% = 6x
                                            else if (ak47Expiry > now) basePower = Math.floor(basePower * (10000 + 10000) / 10000); // +100% = 2x
                                            else if (boostExpiry > now) basePower = Math.floor(basePower * (10000 + 2000) / 10000); // +20% = 1.2x
                                            
                                            return basePower >= 1000 ? (basePower / 1000).toFixed(1) + "K" : basePower;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        )}

                        
                        <div style={{ background: theme === "light" ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                            <div style={{ fontSize: 14, color: "#ef4444", fontWeight: 700, marginBottom: 12, textAlign: "center" }}>⚔️ CARTEL WARS</div>
                            
                            {warsCooldown > 0 && (
                                <div style={{ background: theme === "light" ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 12 }}>
                                    <div style={{ fontSize: 10, color: theme === "light" ? "#d97706" : "#fbbf24" }}>⏳ Attack Cooldown: {Math.floor(warsCooldown / 3600)}h {Math.floor((warsCooldown % 3600) / 60)}m</div>
                                </div>
                            )}

                            {!warsTarget ? (
                                <div style={{ textAlign: "center" }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
                                    <p style={{ fontSize: 11, color: theme === "light" ? "#475569" : "#c0c9f4", margin: "0 0 12px" }}>Search for an opponent to raid their pending rewards!</p>
                                    <button
                                        type="button"
                                        onClick={handleWarsSearch}
                                        disabled={warsSearching || !connected || warsCooldown > 0}
                                        className={styles.btnPrimary}
                                        style={{ padding: "10px 24px", fontSize: 12, background: warsSearching ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)" }}
                                    >
                                        {warsSearching ? "🔍 Searching..." : `🔍 Search for Opponent (${warsSearchFee})`}
                                    </button>
                                    {warsStatus && <p style={{ fontSize: 10, color: theme === "light" ? "#d97706" : "#fbbf24", marginTop: 8 }}>{warsStatus}</p>}
                                </div>
                            ) : (
                                <div>
                                    <div style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: 16 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                            <div style={{ fontSize: 10, color: "#9ca3af" }}>🎯 {warsTargetLocked ? "TARGET LOCKED" : "OPPONENT FOUND"}</div>
                                            {warsSearchExpiry > 0 && warsTargetLocked && (
                                                <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
                                                    ⏱️ {Math.max(0, Math.floor((warsSearchExpiry - Math.floor(Date.now() / 1000)) / 60))}:{String(Math.max(0, (warsSearchExpiry - Math.floor(Date.now() / 1000)) % 60)).padStart(2, '0')}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#fff", marginBottom: 12, wordBreak: "break-all" }}>{warsTarget.slice(0, 8)}...{warsTarget.slice(-6)}</div>

                                        {!warsTargetLocked && (
                                            <div style={{ background: "rgba(251,191,36,0.1)", border: "1px dashed rgba(251,191,36,0.5)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
                                                <div style={{ fontSize: 24, marginBottom: 8 }}>❓</div>
                                                <p style={{ fontSize: 11, color: "#fbbf24", margin: 0 }}>Pay {warsSearchFee} FCWEED to reveal stats and fight!</p>
                                            </div>
                                        )}

                                        {warsTargetLocked && warsTargetStats && (
                                            <div style={{ marginBottom: 12 }}>
                                                
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginBottom: 12 }}>
                                                    
                                                    <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 8, padding: 8 }}>
                                                        <div style={{ fontSize: 9, color: "#22c55e", fontWeight: 600, textAlign: "center", marginBottom: 6 }}>⚔️ YOU</div>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                                                            <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 4, padding: 4, textAlign: "center" }}>
                                                                <div style={{ fontSize: 7, color: "#9ca3af" }}>PLANTS</div>
                                                                <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{v5StakedPlants?.length || 0}</div>
                                                            </div>
                                                            <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 4, padding: 4, textAlign: "center" }}>
                                                                <div style={{ fontSize: 7, color: "#9ca3af" }}>HEALTH</div>
                                                                <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{v5AverageHealth || 100}%</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 4, padding: 4, textAlign: "center", marginTop: 4 }}>
                                                            <div style={{ fontSize: 7, color: "#9ca3af" }}>COMBAT POWER</div>
                                                            <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e" }}>{warsOdds?.attackerPower || "..."}</div>
                                                        </div>
                                                        
                                                        <div style={{ marginTop: 6 }}>
                                                            <div style={{ fontSize: 7, color: "#9ca3af", textAlign: "center", marginBottom: 2 }}>MODIFIERS</div>
                                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                                                                {ak47Expiry > Math.floor(Date.now() / 1000) && (
                                                                    <span style={{ fontSize: 7, padding: "2px 4px", borderRadius: 3, background: "rgba(239,68,68,0.3)", color: "#ef4444" }}>🔫 AK +100%</span>
                                                                )}
                                                                {rpgExpiry > Math.floor(Date.now() / 1000) && (
                                                                    <span style={{ fontSize: 7, padding: "2px 4px", borderRadius: 3, background: "rgba(249,115,22,0.3)", color: "#f97316" }}>🚀 RPG +500%</span>
                                                                )}
                                                                {boostExpiry > Math.floor(Date.now() / 1000) && (
                                                                    <span style={{ fontSize: 7, padding: "2px 4px", borderRadius: 3, background: "rgba(251,191,36,0.3)", color: "#fbbf24" }}>⚡ +20%</span>
                                                                )}
                                                                {nukeExpiry > Math.floor(Date.now() / 1000) && (
                                                                    <span style={{ fontSize: 7, padding: "2px 4px", borderRadius: 3, background: "rgba(220,38,38,0.3)", color: "#dc2626" }}>☢️ NUKE</span>
                                                                )}
                                                                {ak47Expiry <= Math.floor(Date.now() / 1000) && rpgExpiry <= Math.floor(Date.now() / 1000) && boostExpiry <= Math.floor(Date.now() / 1000) && nukeExpiry <= Math.floor(Date.now() / 1000) && (
                                                                    <span style={{ fontSize: 7, color: "#6b7280" }}>None</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    
                                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                        <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>VS</div>
                                                    </div>
                                                    
                                                    
                                                    <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 8, padding: 8 }}>
                                                        <div style={{ fontSize: 9, color: "#ef4444", fontWeight: 600, textAlign: "center", marginBottom: 6 }}>🛡️ TARGET</div>
                                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                                                            <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 4, padding: 4, textAlign: "center" }}>
                                                                <div style={{ fontSize: 7, color: "#9ca3af" }}>PLANTS</div>
                                                                <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>{warsTargetStats.plants}</div>
                                                            </div>
                                                            <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 4, padding: 4, textAlign: "center" }}>
                                                                <div style={{ fontSize: 7, color: "#9ca3af" }}>HEALTH</div>
                                                                <div style={{ fontSize: 12, fontWeight: 700, color: warsTargetStats.avgHealth > 50 ? "#fbbf24" : "#ef4444" }}>{warsTargetStats.avgHealth}%</div>
                                                            </div>
                                                        </div>
                                                        <div style={{ background: "rgba(5,8,20,0.5)", borderRadius: 4, padding: 4, textAlign: "center", marginTop: 4 }}>
                                                            <div style={{ fontSize: 7, color: "#9ca3af" }}>COMBAT POWER</div>
                                                            <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444" }}>{warsOdds?.defenderPower || warsTargetStats.battlePower || "..."}</div>
                                                        </div>
                                                        
                                                        <div style={{ marginTop: 6 }}>
                                                            <div style={{ fontSize: 7, color: "#9ca3af", textAlign: "center", marginBottom: 2 }}>MODIFIERS</div>
                                                            <div style={{ display: "flex", flexWrap: "wrap", gap: 2, justifyContent: "center" }}>
                                                                {warsTargetStats.hasShield ? (
                                                                    <span style={{ fontSize: 7, padding: "2px 4px", borderRadius: 3, background: "rgba(59,130,246,0.3)", color: "#3b82f6" }}>🛡️ Shield</span>
                                                                ) : (
                                                                    <span style={{ fontSize: 7, color: "#6b7280" }}>None</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                
                                                <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 8, padding: 8, marginBottom: 8, textAlign: "center" }}>
                                                    <div style={{ fontSize: 9, color: "#fbbf24", marginBottom: 4 }}>💰 TARGET'S PENDING REWARDS</div>
                                                    <div style={{ fontSize: 20, fontWeight: 700, color: "#fbbf24" }}>
                                                        {warsTargetStats.pendingRewards ? (parseFloat(ethers.utils.formatUnits(warsTargetStats.pendingRewards, 18)) / 1000).toFixed(0) + "K" : "0"} FCWEED
                                                    </div>
                                                </div>

                                                
                                                {warsOdds && (
                                                    <div style={{ background: warsOdds.estimatedWinChance > 50 ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${warsOdds.estimatedWinChance > 50 ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`, borderRadius: 8, padding: 10, textAlign: "center" }}>
                                                        <div style={{ fontSize: 10, color: warsOdds.estimatedWinChance > 50 ? "#22c55e" : "#ef4444", marginBottom: 4 }}>🎲 ESTIMATED WIN CHANCE</div>
                                                        <div style={{ fontSize: 28, fontWeight: 700, color: warsOdds.estimatedWinChance > 50 ? "#22c55e" : "#ef4444" }}>{warsOdds.estimatedWinChance}%</div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        <div style={{ display: "flex", gap: 8 }}>
                                            {!warsTargetLocked ? (
                                                <button type="button" onClick={handleLockAndFight} disabled={warsSearching} className={styles.btnPrimary} style={{ flex: 1, padding: "10px 16px", fontSize: 12, background: warsSearching ? "#374151" : "linear-gradient(135deg, #f59e0b, #fbbf24)" }}>
                                                    {warsSearching ? "Processing..." : `🔓 Lock & Reveal (${warsSearchFee})`}
                                                </button>
                                            ) : (
                                                <button type="button" onClick={handleWarsAttack} disabled={warsSearching} className={styles.btnPrimary} style={{ flex: 1, padding: "10px 16px", fontSize: 12, background: warsSearching ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                                                    {warsSearching ? "Attacking..." : "⚔️ ATTACK"}
                                                </button>
                                            )}
                                            <button type="button" onClick={handleNextOpponent} disabled={warsSearching} style={{ padding: "10px 14px", fontSize: 12, borderRadius: 8, border: "1px solid rgba(239,68,68,0.5)", background: "transparent", color: "#ef4444", cursor: warsSearching ? "not-allowed" : "pointer" }}>
                                                Skip
                                            </button>
                                        </div>
                                        {warsStatus && <p style={{ fontSize: 10, color: theme === "light" ? "#d97706" : "#fbbf24", marginTop: 8 }}>{warsStatus}</p>}
                                    </div>
                                </div>
                            )}

                            {warsResult && (
                                <div style={{ marginTop: 12, background: warsResult.won ? "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,197,94,0.1))" : "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))", border: `2px solid ${warsResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, borderRadius: 12, padding: 20, textAlign: "center" }}>
                                    <div style={{ fontSize: 48, marginBottom: 12 }}>{warsResult.won ? "🎉" : "💀"}</div>
                                    <div style={{ fontSize: 18, fontWeight: 700, color: warsResult.won ? "#10b981" : "#ef4444", marginBottom: 8 }}>{warsResult.won ? "VICTORY!" : "DEFEAT!"}</div>
                                    <div style={{ fontSize: 12, color: theme === "light" ? "#475569" : "#c0c9f4" }}>
                                        {(() => {
                                            // Safely convert rewardsTransferred to a displayable value
                                            const rewards = warsResult.rewardsTransferred;
                                            let amount = 0;
                                            try {
                                                if (rewards) {
                                                    if (ethers.BigNumber.isBigNumber(rewards)) {
                                                        amount = parseFloat(ethers.utils.formatUnits(rewards, 18));
                                                    } else if (typeof rewards === 'string' || typeof rewards === 'number') {
                                                        amount = parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(rewards), 18));
                                                    } else if (rewards._hex) {
                                                        amount = parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(rewards._hex), 18));
                                                    }
                                                }
                                            } catch (e) {
                                                console.error("[Wars] Failed to parse rewardsTransferred:", e, rewards);
                                            }
                                            const formatted = amount >= 1000 ? (amount / 1000).toFixed(1) + "K" : amount.toFixed(0);
                                            return warsResult.won 
                                                ? `You raided ${formatted} FCWEED!`
                                                : `You lost ${formatted} FCWEED!`;
                                        })()}
                                    </div>
                                    <button type="button" onClick={() => setWarsResult(null)} className={styles.btnPrimary} style={{ marginTop: 16, padding: "10px 24px", fontSize: 12, background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                                        Continue
                                    </button>
                                </div>
                            )}
                        </div>

                        
                        <ThePurge
                            connected={connected}
                            userAddress={userAddress}
                            theme={theme}
                            readProvider={readProvider}
                            sendContractTx={sendContractTx}
                            ensureAllowance={ensureFcweedAllowance}
                            refreshData={refreshAllData}
                        />

                        
                        {connected && warsPlayerStats && (warsPlayerStats.deaRaidsWon > 0 || warsPlayerStats.deaRaidsLost > 0) && (
                            <div style={{ background: theme === "light" ? "rgba(220,38,38,0.08)" : "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                                <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>🚔 Your DEA Raids Stats</div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af" }}>WINS</div>
                                        <div style={{ fontSize: 18, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.deaRaidsWon || 0}</div>
                                    </div>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af" }}>LOSSES</div>
                                        <div style={{ fontSize: 18, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.deaRaidsLost || 0}</div>
                                    </div>
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: 6, textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: theme === "light" ? "#64748b" : "#9ca3af" }}>STOLEN</div>
                                        <div style={{ fontSize: 14, color: "#10b981", fontWeight: 600 }}>{warsPlayerStats.deaRewardsStolen ? (parseFloat(ethers.utils.formatUnits(warsPlayerStats.deaRewardsStolen, 18)) / 1000).toFixed(0) + "K" : "0"}</div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <DEARaidsLeaderboard
                            connected={connected}
                            userAddress={userAddress}
                            theme={theme}
                            readProvider={readProvider}
                            sendContractTx={sendContractTx}
                            ensureAllowance={ensureFcweedAllowance}
                            refreshData={refreshAllData}
                        />
                    </section>
                )}



                                {activeTab === "referrals" && (
                    <section className={styles.infoCard} style={getCardStyle({ position: "relative", textAlign: "center", padding: 40, minHeight: 300 })}>
                        <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,18,0.85)", backdropFilter: "blur(8px)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                            <div>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>📜</div>
                                <h2 style={{ fontSize: 20, color: "#fbbf24" }}>Coming Soon</h2>
                                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8, maxWidth: 280, lineHeight: 1.5 }}>Earn Dust by completing Quests and Referring Friends</p>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === "shop" && (
                    <section className={styles.infoCard} style={getCardStyle({ textAlign: "center", padding: 16 })}>
                        <h2 style={{ fontSize: 18, margin: "0 0 12px", color: "#10b981" }}>🛒 Shop</h2>
                        <div style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 12, padding: 12, marginBottom: 16 }}>
                            <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600, marginBottom: 8, textAlign: "center" }}>🎒 YOUR INVENTORY</div>
                            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 12px" }}>
                                    <div style={{ fontSize: 7, color: "#9ca3af" }}>FCWEED</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#10b981" }}>{fcweedBalance}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 12px" }}>
                                    <div style={{ fontSize: 7, color: "#9ca3af" }}>DUST</div>
                                    <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24" }}>{crateUserStats.dust.toLocaleString()}</div>
                                </div>
                            </div>
                            <div style={{ display: "flex", justifyContent: "center", gap: 6, flexWrap: "wrap" }}>
                                <div style={{ textAlign: "center", background: "rgba(96,165,250,0.15)", borderRadius: 6, padding: "4px 8px", minWidth: 42, border: "1px solid rgba(96,165,250,0.4)" }}>
                                    <div style={{ fontSize: 16, lineHeight: "22px" }}>💧</div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#60a5fa" }}>{v5StakingStats?.water ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v5StakingStats.water.toString()), 18)).toFixed(1) : "0"}L</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 6, padding: "4px 8px", minWidth: 42 }}>
                                    <img src="/images/items/ak47.png" alt="AK-47" style={{ width: 22, height: 22, objectFit: "contain" }} />
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>{inventoryAK47}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(239,68,68,0.15)", borderRadius: 6, padding: "4px 8px", minWidth: 42, border: "1px solid rgba(239,68,68,0.4)" }}>
                                    <img src="/images/items/nuke.png" alt="Nuke" style={{ width: 22, height: 22, objectFit: "contain" }} />
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444" }}>{inventoryNuke}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 6, padding: "4px 8px", minWidth: 42 }}>
                                    <img src="/images/items/rpg.png" alt="RPG" style={{ width: 22, height: 22, objectFit: "contain" }} />
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#a855f7" }}>{inventoryRPG}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 6, padding: "4px 8px", minWidth: 42 }}>
                                    <img src="/images/items/healthpack.png" alt="Health Pack" style={{ width: 22, height: 22, objectFit: "contain" }} />
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981" }}>{inventoryHealthPacks}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 6, padding: "4px 8px", minWidth: 42 }}>
                                    <div style={{ fontSize: 16, lineHeight: "22px" }}>🛡️</div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6" }}>{inventoryShields}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 6, padding: "4px 8px", minWidth: 42 }}>
                                    <div style={{ fontSize: 16, lineHeight: "22px" }}>⚡</div>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>{inventoryBoosts}</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                            <button onClick={() => setWaterModalOpen(true)} style={{ flex: 1, padding: "16px 12px", borderRadius: 12, border: "1px solid rgba(96,165,250,0.4)", background: "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(59,130,246,0.1))", color: "#60a5fa", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 28 }}>💧</span>
                                <span>WATER</span>
                            </button>
                            <button onClick={() => setItemsModalOpen(true)} style={{ flex: 1, padding: "16px 12px", borderRadius: 12, border: "1px solid rgba(245,158,11,0.4)", background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.1))", color: "#f59e0b", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 28 }}>🏪</span>
                                <span>ITEMS</span>
                            </button>
                        </div>
                        {shopStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 8, textAlign: "center" }}>{shopStatus}</p>}
                    </section>
                )}
            </main>

            <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, #050812, #0a1128)", borderTop: "1px solid #1b2340", display: "flex", justifyContent: "space-around", padding: "10px 4px 14px 4px", zIndex: 50, maxWidth: "100vw", boxSizing: "border-box", paddingBottom: "max(14px, env(safe-area-inset-bottom))" }}>
                {[
                    { key: "info", icon: "ℹ️", label: "INFO" },
                    { key: "mint", icon: "🌱", label: "MINT" },
                    { key: "stake", icon: "⚡", label: "STAKE" },
                    { key: "wars", icon: "⚔️", label: "WARS" },
                    { key: "crates", icon: "📦", label: "CRATES" },
                    { key: "shop", icon: "🛒", label: "SHOP" },
                    { key: "referrals", icon: "📜", label: "QUESTS" },
                ].map((tab) => (
                    <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key as any)} style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 2px", border: "none", background: activeTab === tab.key ? "rgba(59,130,246,0.2)" : "transparent", borderRadius: 10, cursor: "pointer", minHeight: 44 }}>
                        <span style={{ fontSize: 18 }}>{tab.icon}</span>
                        <span style={{ fontSize: 9, fontWeight: 600, color: activeTab === tab.key ? "#3b82f6" : "#9ca3af" }}>{tab.label}</span>
                    </button>
                ))}
            </nav>

            
            {v5StakingOpen && (
                <div className={styles.modalBackdrop} style={{ background: theme === "light" ? "rgba(0,0,0,0.4)" : undefined }}>
                    <div className={styles.modal} style={{ maxWidth: 520, width: "95%", maxHeight: "90vh", overflowY: "auto", background: theme === "light" ? "#ffffff" : undefined, color: theme === "light" ? "#1e293b" : undefined }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle} style={{ color: theme === "light" ? "#1e293b" : undefined }}>🚀 Staking V5</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setV5StakingOpen(false)} style={{ background: theme === "light" ? "#f1f5f9" : undefined, color: theme === "light" ? "#64748b" : undefined }}>✕</button>
                        </header>

                        {v5ClaimCooldown > 0 && (
                            <div style={{ padding: "8px 12px", background: theme === "light" ? "rgba(251,191,36,0.08)" : "rgba(251,191,36,0.1)", borderRadius: 8, border: `1px solid ${theme === "light" ? "rgba(217,119,6,0.3)" : "rgba(251,191,36,0.3)"}`, marginBottom: 10, textAlign: "center" }}>
                                <span style={{ fontSize: 12, color: theme === "light" ? "#d97706" : "#fbbf24", fontWeight: 600 }}>
                                    ⏳ Claim Cooldown: {Math.floor(v5ClaimCooldown / 3600)}h {Math.floor((v5ClaimCooldown % 3600) / 60)}m {v5ClaimCooldown % 60}s
                                </span>
                            </div>
                        )}

                        <div style={{ padding: "8px 12px", background: theme === "light" ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.1)", borderRadius: 8, border: "1px solid rgba(16,185,129,0.3)", marginBottom: 10 }}>
                            <p style={{ fontSize: 10, color: "#10b981", margin: 0, fontWeight: 600 }}>🚀 V5 is LIVE! Stake your NFTs and claim your $FCWEED rewards!</p>
                        </div>

                        {!V5_STAKING_ADDRESS ? (
                            <div style={{ padding: 20, textAlign: "center" }}>
                                <p style={{ fontSize: 14, color: theme === "light" ? "#d97706" : "#fbbf24" }}>⏳ V5 Contract Not Yet Deployed</p>
                            </div>
                        ) : (
                            <>
                                <div id="v5-stats-card" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                                    <div className={styles.statCard} style={{ background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Plants</span><span className={styles.statValue} style={{ color: theme === "light" ? "#1e293b" : undefined }}>{v5StakingStats?.plants || 0}</span></div>
                                    <div className={styles.statCard} style={{ background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Lands</span><span className={styles.statValue} style={{ color: theme === "light" ? "#1e293b" : undefined }}>{v5StakingStats?.lands || 0}</span></div>
                                    <div className={styles.statCard} style={{ background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Super Lands</span><span className={styles.statValue} style={{ color: theme === "light" ? "#1e293b" : undefined }}>{v5StakingStats?.superLands || 0}</span></div>
                                    <div className={styles.statCard} style={{ background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Capacity</span><span className={styles.statValue} style={{ color: theme === "light" ? "#1e293b" : undefined }}>{v5StakingStats ? `${v5StakingStats.plants}/${v5StakingStats.capacity}` : "0/1"}</span></div>
                                    <div className={styles.statCard} style={{ background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Boost</span><span className={styles.statValue} style={{ color: "#10b981" }}>+{v5StakingStats?.boostPct?.toFixed(1) || 0}%</span></div>
                                    <div className={styles.statCard} style={{ background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Daily (Live)</span><span className={styles.statValue} style={{ color: (v5StakingStats?.avgHealth || 100) < 100 ? (theme === "light" ? "#d97706" : "#fbbf24") : "#10b981" }}>{v5StakingStats?.dailyRewards || "0"}</span></div>
                                    <div className={styles.statCard} style={{ background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Avg Health</span><span className={styles.statValue} style={{ color: (v5StakingStats?.avgHealth || 100) >= 80 ? "#10b981" : (v5StakingStats?.avgHealth || 100) >= 50 ? (theme === "light" ? "#d97706" : "#fbbf24") : "#ef4444" }}>{v5StakingStats?.avgHealth || 100}%</span></div>
                                    <div className={styles.statCard} style={{ gridColumn: "span 2", background: theme === "light" ? "#f8fafc" : undefined, border: theme === "light" ? "1px solid #e2e8f0" : undefined }}><span className={styles.statLabel} style={{ color: theme === "light" ? "#64748b" : undefined }}>Water</span><span className={styles.statValue} style={{ color: "#3b82f6" }}>{v5StakingStats?.water ? (parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v5StakingStats.water.toString()), 18))).toFixed(1) : "0"}L</span></div>
                                    <div className={styles.statCard} style={{ gridColumn: "span 2", background: "linear-gradient(135deg, #065f46, #10b981)" }}><span className={styles.statLabel}>Pending (Live)</span><span className={styles.statValue} style={{ color: "#a7f3d0", fontSize: 16 }}>{v5RealTimePending}</span></div>
                                    <button 
                                        type="button"
                                        onClick={() => {
                                            const plants = v5StakingStats?.plants || 0;
                                            const lands = v5StakingStats?.lands || 0;
                                            const superLands = v5StakingStats?.superLands || 0;
                                            const boost = v5StakingStats?.boostPct?.toFixed(1) || 0;
                                            const daily = v5StakingStats?.dailyRewards || "0";
                                            const text = `🌿 My FCWEED Farm on @base:\n\n🌱 ${plants} Plants\n🏠 ${lands} Lands\n🔥 ${superLands} Super Lands\n📈 +${boost}% Boost\n💰 ${daily} Daily Rewards\n\nStart farming: https://x420ponzi.com`;
                                            captureAndShare('v5-stats-card', text, composeCast);
                                        }}
                                        style={{ gridColumn: "span 1", padding: 8, borderRadius: 8, border: "1px solid rgba(29,161,242,0.4)", background: "rgba(29,161,242,0.15)", color: "#1da1f2", cursor: "pointer", fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}
                                    >
                                        📸 Share
                                    </button>
                                </div>

                                <p style={{ fontSize: 10, color: theme === "light" ? "#d97706" : "#fbbf24", marginBottom: 8, textAlign: "center" }}>⏳ Please keep this tab open for 5-10 seconds to ensure NFTs load properly</p>

                                {loadingV5Staking ? <p style={{ textAlign: "center", padding: 16, fontSize: 12, color: theme === "light" ? "#475569" : undefined }}>Loading NFTs…</p> : (
                                    <>
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: theme === "light" ? "#1e293b" : undefined }}>Available ({v5AvailablePlants.length + v5AvailableLands.length + v5AvailableSuperLands.length})</span>
                                                <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={(v5AvailablePlants.length + v5AvailableLands.length + v5AvailableSuperLands.length) > 0 && selectedV5AvailPlants.length + selectedV5AvailLands.length + selectedV5AvailSuperLands.length === (v5AvailablePlants.length + v5AvailableLands.length + v5AvailableSuperLands.length)} onChange={() => { if (selectedV5AvailPlants.length + selectedV5AvailLands.length + selectedV5AvailSuperLands.length === (v5AvailablePlants.length + v5AvailableLands.length + v5AvailableSuperLands.length)) { setSelectedV5AvailPlants([]); setSelectedV5AvailLands([]); setSelectedV5AvailSuperLands([]); } else { setSelectedV5AvailPlants(v5AvailablePlants); setSelectedV5AvailLands(v5AvailableLands); setSelectedV5AvailSuperLands(v5AvailableSuperLands); } }} />All</label>
                                            </div>
                                            <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                                {(v5AvailablePlants.length + v5AvailableLands.length + v5AvailableSuperLands.length) === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No NFTs available to stake</span> : (
                                                    <>{v5AvailableSuperLands.map((id) => <NftCard key={"v5asl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedV5AvailSuperLands.includes(id)} onChange={() => toggleId(id, selectedV5AvailSuperLands, setSelectedV5AvailSuperLands)} />)}{v5AvailableLands.map((id) => <NftCard key={"v5al-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedV5AvailLands.includes(id)} onChange={() => toggleId(id, selectedV5AvailLands, setSelectedV5AvailLands)} />)}{v5AvailablePlants.map((id) => <NftCard key={"v5ap-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedV5AvailPlants.includes(id)} onChange={() => toggleId(id, selectedV5AvailPlants, setSelectedV5AvailPlants)} />)}</>
                                                )}
                                            </div>
                                        </div>
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600 }}>Staked ({v5StakedPlants.length + v5StakedLands.length + v5StakedSuperLands.length})</span>
                                                <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={(v5StakedPlants.length + v5StakedLands.length + v5StakedSuperLands.length) > 0 && selectedV5StakedPlants.length + selectedV5StakedLands.length + selectedV5StakedSuperLands.length === (v5StakedPlants.length + v5StakedLands.length + v5StakedSuperLands.length)} onChange={() => { if (selectedV5StakedPlants.length + selectedV5StakedLands.length + selectedV5StakedSuperLands.length === (v5StakedPlants.length + v5StakedLands.length + v5StakedSuperLands.length)) { setSelectedV5StakedPlants([]); setSelectedV5StakedLands([]); setSelectedV5StakedSuperLands([]); } else { setSelectedV5StakedPlants(v5StakedPlants); setSelectedV5StakedLands(v5StakedLands); setSelectedV5StakedSuperLands(v5StakedSuperLands); } }} />All</label>
                                            </div>
                                            <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                                {(v5StakedPlants.length + v5StakedLands.length + v5StakedSuperLands.length) === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No staked NFTs</span> : (
                                                    <>{v5StakedSuperLands.map((id) => <NftCard key={"v5ssl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedV5StakedSuperLands.includes(id)} onChange={() => toggleId(id, selectedV5StakedSuperLands, setSelectedV5StakedSuperLands)} />)}{v5StakedLands.map((id) => <NftCard key={"v5sl-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedV5StakedLands.includes(id)} onChange={() => toggleId(id, selectedV5StakedLands, setSelectedV5StakedLands)} />)}{v5StakedPlants.map((id) => <NftCard key={"v5sp-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedV5StakedPlants.includes(id)} onChange={() => toggleId(id, selectedV5StakedPlants, setSelectedV5StakedPlants)} health={v5PlantHealths[id]} />)}</>
                                                )}
                                            </div>
                                        </div>

                                        {v5StakedPlants.length > 0 && (
                                            <div style={{ marginBottom: 10, padding: 8, background: "rgba(16,185,129,0.1)", borderRadius: 8 }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#10b981" }}>💧 Water Plants</span>
                                                    <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}>
                                                        <input type="checkbox" checked={selectedV5PlantsToWater.length === v5StakedPlants.filter(id => (v5PlantHealths[id] ?? 100) < 100).length && selectedV5PlantsToWater.length > 0} onChange={() => { const needsWater = v5StakedPlants.filter(id => (v5PlantHealths[id] ?? 100) < 100); if (selectedV5PlantsToWater.length === needsWater.length) { setSelectedV5PlantsToWater([]); setV5CustomWaterAmounts({}); } else { setSelectedV5PlantsToWater(needsWater); const newAmounts: Record<number, number> = {}; needsWater.forEach(id => { newAmounts[id] = Math.ceil(v5WaterNeeded[id] || 1); }); setV5CustomWaterAmounts(newAmounts); } }} />All needing water
                                                    </label>
                                                </div>
                                                <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0" }}>
                                                    {v5StakedPlants.map((id) => {
                                                        const health = v5PlantHealths[id] ?? 100;
                                                        const waterNeeded = v5WaterNeeded[id] ?? 0;
                                                        const isSelected = selectedV5PlantsToWater.includes(id);
                                                        const customAmount = v5CustomWaterAmounts[id] ?? Math.ceil(waterNeeded || 1);
                                                        return (
                                                            <div key={"v5w-" + id} style={{ minWidth: 70, padding: 6, borderRadius: 8, background: isSelected ? "rgba(16,185,129,0.3)" : "rgba(0,0,0,0.2)", border: isSelected ? "2px solid #10b981" : "1px solid #374151", opacity: health >= 100 ? 0.5 : 1, textAlign: "center" }}>
                                                                <div onClick={() => { if (health < 100) { toggleId(id, selectedV5PlantsToWater, setSelectedV5PlantsToWater); if (!isSelected) { setV5CustomWaterAmounts(prev => ({ ...prev, [id]: Math.ceil(waterNeeded || 1) })); } } }} style={{ cursor: health < 100 ? "pointer" : "default" }}>
                                                                    <div style={{ fontSize: 10, fontWeight: 600 }}>#{id}</div>
                                                                    <div style={{ width: "100%", height: 4, background: "#1f2937", borderRadius: 2, margin: "3px 0", overflow: "hidden" }}>
                                                                        <div style={{ height: "100%", width: `${health}%`, background: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444", transition: "width 0.3s" }} />
                                                                    </div>
                                                                    <div style={{ fontSize: 9, color: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444", fontWeight: 600 }}>{health}%</div>
                                                                    {health < 100 && <div style={{ fontSize: 8, color: "#60a5fa" }}>Need: {waterNeeded.toFixed(1)}L</div>}
                                                                </div>
                                                                {isSelected && health < 100 && (
                                                                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setV5CustomWaterAmounts(prev => ({ ...prev, [id]: Math.max(1, (prev[id] ?? Math.ceil(waterNeeded)) - 1) })); }} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #374151", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                                                                        <input type="number" value={customAmount} onChange={(e) => { const val = Math.max(1, parseInt(e.target.value) || 1); setV5CustomWaterAmounts(prev => ({ ...prev, [id]: val })); }} onClick={(e) => e.stopPropagation()} style={{ width: 32, height: 18, textAlign: "center", fontSize: 9, background: "#1f2937", border: "1px solid #374151", borderRadius: 4, color: "#fff" }} min="1" />
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setV5CustomWaterAmounts(prev => ({ ...prev, [id]: (prev[id] ?? Math.ceil(waterNeeded)) + 1 })); }} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #374151", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "#9ca3af", marginTop: 6 }}>
                                                    <span>Your Water: {v5StakingStats?.water ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v5StakingStats.water.toString()), 18)).toFixed(2) : "0"}L</span>
                                                    {selectedV5PlantsToWater.length > 0 && <span style={{ color: "#60a5fa" }}>Using: {selectedV5PlantsToWater.reduce((sum, id) => sum + (v5CustomWaterAmounts[id] ?? Math.ceil(v5WaterNeeded[id] || 1)), 0).toFixed(1)}L</span>}
                                                </div>
                                                {selectedV5PlantsToWater.length > 0 && (
                                                    <button type="button" className={styles.btnPrimary} disabled={actionLoading} onClick={handleV5WaterPlants} style={{ width: "100%", marginTop: 6, padding: 8, fontSize: 11, background: "linear-gradient(to right, #0ea5e9, #38bdf8)" }}>
                                                        {actionLoading ? "Watering..." : `💧 Water ${selectedV5PlantsToWater.length} Plant${selectedV5PlantsToWater.length > 1 ? "s" : ""} (${selectedV5PlantsToWater.reduce((sum, id) => sum + (v5CustomWaterAmounts[id] ?? Math.ceil(v5WaterNeeded[id] || 1)), 0).toFixed(1)}L)`}
                                                    </button>
                                                )}
                                                {v5ActionStatus && <p style={{ fontSize: 9, color: "#fbbf24", marginTop: 4, textAlign: "center" }}>{v5ActionStatus}</p>}
                                            </div>
                                        )}
                                    </>
                                )}
                                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                    <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !V5_STAKING_ADDRESS || (selectedV5AvailPlants.length + selectedV5AvailLands.length + selectedV5AvailSuperLands.length === 0)} onClick={async () => { if (selectedV5AvailPlants.length > 0) await handleV5StakePlants(); if (selectedV5AvailLands.length > 0) await handleV5StakeLands(); if (selectedV5AvailSuperLands.length > 0) await handleV5StakeSuperLands(); }} style={{ flex: 1, padding: 10, fontSize: 12, background: "linear-gradient(to right, #10b981, #34d399)" }}>{actionLoading ? "Staking..." : "Stake"}</button>
                                    <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !V5_STAKING_ADDRESS || (selectedV5StakedPlants.length + selectedV5StakedLands.length + selectedV5StakedSuperLands.length === 0)} onClick={async () => { if (selectedV5StakedPlants.length > 0) await handleV5UnstakePlants(); if (selectedV5StakedLands.length > 0) await handleV5UnstakeLands(); if (selectedV5StakedSuperLands.length > 0) await handleV5UnstakeSuperLands(); }} style={{ flex: 1, padding: 10, fontSize: 12 }}>{actionLoading ? "Unstaking..." : "Unstake"}</button>
                                    <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !V5_STAKING_ADDRESS || !v5StakingStats || v5StakingStats.pendingFormatted <= 0} onClick={handleV5Claim} style={{ flex: 1, padding: 10, fontSize: 12 }}>{actionLoading ? "Claiming..." : "Claim"}</button>
                                </div>
                                <p style={{ fontSize: 9, color: "#9ca3af", marginTop: 6, textAlign: "center" }}>⚠️ Plants must have 100% health to unstake. Water them first!</p>
                                {v5ActionStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 4, textAlign: "center" }}>{v5ActionStatus}</p>}
                            </>
                        )}
                    </div>
                </div>
            )}

            {v4StakingOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 520, width: "95%", maxHeight: "90vh", overflowY: "auto" }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>⬅️ Staking V4 (MIGRATION MODE)</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setV4StakingOpen(false)}>✕</button>
                        </header>

                        <div style={{ padding: "8px 12px", background: "rgba(239,68,68,0.15)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.4)", marginBottom: 10 }}>
                            <p style={{ fontSize: 10, color: "#f87171", margin: 0, fontWeight: 600 }}>🚨 V4 is DEPRECATED - Staking &amp; Claiming DISABLED</p>
                            <p style={{ fontSize: 9, color: "#fca5a5", margin: "4px 0 0 0" }}>Water your plants → Unstake everything → Move to V5 to continue earning!</p>
                        </div>

                        {!V4_STAKING_ADDRESS ? (
                            <div style={{ padding: 20, textAlign: "center" }}>
                                <p style={{ fontSize: 14, color: "#fbbf24" }}>⏳ V4 Contract Not Yet Deployed</p>
                                <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>The V4 staking contract is being prepared. Check back soon!</p>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                                    <div className={styles.statCard}><span className={styles.statLabel}>Plants</span><span className={styles.statValue}>{v4StakingStats?.plants || 0}</span></div>
                                    <div className={styles.statCard}><span className={styles.statLabel}>Lands</span><span className={styles.statValue}>{v4StakingStats?.lands || 0}</span></div>
                                    <div className={styles.statCard}><span className={styles.statLabel}>Super Lands</span><span className={styles.statValue}>{v4StakingStats?.superLands || 0}</span></div>
                                    <div className={styles.statCard}><span className={styles.statLabel}>Capacity</span><span className={styles.statValue}>{v4StakingStats ? `${v4StakingStats.plants}/${v4StakingStats.capacity}` : "0/1"}</span></div>
                                    <div className={styles.statCard}><span className={styles.statLabel}>Boost</span><span className={styles.statValue} style={{ color: "#a855f7" }}>+{v4StakingStats?.boostPct?.toFixed(1) || 0}%</span></div>
                                    <div className={styles.statCard}><span className={styles.statLabel}>Daily (Live)</span><span className={styles.statValue} style={{ color: (v4StakingStats?.avgHealth || 100) < 100 ? "#fbbf24" : "#a855f7" }}>{v4StakingStats?.dailyRewards || "0"}</span></div>
                                    <div className={styles.statCard}><span className={styles.statLabel}>Avg Health</span><span className={styles.statValue} style={{ color: (v4StakingStats?.avgHealth || 100) >= 80 ? "#10b981" : (v4StakingStats?.avgHealth || 100) >= 50 ? "#fbbf24" : "#ef4444" }}>{v4StakingStats?.avgHealth || 100}%</span></div>
                                    <div className={styles.statCard} style={{ gridColumn: "span 2" }}><span className={styles.statLabel}>Water</span><span className={styles.statValue} style={{ color: "#60a5fa" }}>{v4StakingStats?.water ? (parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v4StakingStats.water.toString()), 18))).toFixed(1) : "0"}L</span></div>
                                    <div className={styles.statCard} style={{ gridColumn: "span 3", background: "linear-gradient(135deg, #581c87, #7c3aed)" }}><span className={styles.statLabel}>Pending (Live)</span><span className={styles.statValue} style={{ color: "#c4b5fd", fontSize: 16 }}>{v4RealTimePending}</span></div>
                                </div>

                                <p style={{ fontSize: 10, color: "#fbbf24", marginBottom: 8, textAlign: "center" }}>⏳ Please keep this tab open for 5-10 seconds to ensure NFTs load properly</p>

                                {loadingV4Staking ? <p style={{ textAlign: "center", padding: 16, fontSize: 12 }}>Loading NFTs…</p> : (
                                    <>
                                        
                                        <div style={{ marginBottom: 10 }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600 }}>Staked ({v4StakedPlants.length + v4StakedLands.length + v4StakedSuperLands.length})</span>
                                                <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={(v4StakedPlants.length + v4StakedLands.length + v4StakedSuperLands.length) > 0 && selectedV4StakedPlants.length + selectedV4StakedLands.length + selectedV4StakedSuperLands.length === (v4StakedPlants.length + v4StakedLands.length + v4StakedSuperLands.length)} onChange={() => { if (selectedV4StakedPlants.length + selectedV4StakedLands.length + selectedV4StakedSuperLands.length === (v4StakedPlants.length + v4StakedLands.length + v4StakedSuperLands.length)) { setSelectedV4StakedPlants([]); setSelectedV4StakedLands([]); setSelectedV4StakedSuperLands([]); } else { setSelectedV4StakedPlants(v4StakedPlants); setSelectedV4StakedLands(v4StakedLands); setSelectedV4StakedSuperLands(v4StakedSuperLands); } }} />All</label>
                                            </div>
                                            <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                                                {(v4StakedPlants.length + v4StakedLands.length + v4StakedSuperLands.length) === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No staked NFTs</span> : (
                                                    <>{v4StakedSuperLands.map((id) => <NftCard key={"v4ssl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedV4StakedSuperLands.includes(id)} onChange={() => toggleId(id, selectedV4StakedSuperLands, setSelectedV4StakedSuperLands)} />)}{v4StakedLands.map((id) => <NftCard key={"v4sl-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedV4StakedLands.includes(id)} onChange={() => toggleId(id, selectedV4StakedLands, setSelectedV4StakedLands)} />)}{v4StakedPlants.map((id) => <NftCard key={"v4sp-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedV4StakedPlants.includes(id)} onChange={() => toggleId(id, selectedV4StakedPlants, setSelectedV4StakedPlants)} health={v4PlantHealths[id]} />)}</>
                                                )}
                                            </div>
                                        </div>

                                        {v4StakedPlants.length > 0 && (
                                            <div style={{ marginBottom: 10, padding: 10, background: "rgba(59,130,246,0.1)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.3)" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                                    <span style={{ fontSize: 11, fontWeight: 600, color: "#60a5fa" }}>💧 Water Plants ({v4StakedPlants.filter(id => (v4PlantHealths[id] ?? 100) < 100).length} need water)</span>
                                                    <label style={{ fontSize: 9, display: "flex", alignItems: "center", gap: 3 }}>
                                                        <input type="checkbox" checked={selectedV4PlantsToWater.length === v4StakedPlants.filter(id => (v4PlantHealths[id] ?? 100) < 100).length && selectedV4PlantsToWater.length > 0} onChange={() => { const needsWater = v4StakedPlants.filter(id => (v4PlantHealths[id] ?? 100) < 100); if (selectedV4PlantsToWater.length === needsWater.length) { setSelectedV4PlantsToWater([]); setV4CustomWaterAmounts({}); } else { setSelectedV4PlantsToWater(needsWater); const newAmounts: Record<number, number> = {}; needsWater.forEach(id => { newAmounts[id] = Math.ceil(v4WaterNeeded[id] || 1); }); setV4CustomWaterAmounts(newAmounts); } }} />All needing water
                                                    </label>
                                                </div>
                                                <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 70 }}>
                                                    {v4StakedPlants.map((id) => {
                                                        const health = v4PlantHealths[id] ?? 100;
                                                        const waterNeeded = v4WaterNeeded[id] ?? 0;
                                                        const isSelected = selectedV4PlantsToWater.includes(id);
                                                        const customAmount = v4CustomWaterAmounts[id] ?? Math.ceil(waterNeeded || 1);
                                                        return (
                                                            <div key={"v4water-" + id} style={{ minWidth: 70, padding: 6, borderRadius: 8, background: isSelected ? "rgba(59,130,246,0.3)" : "rgba(0,0,0,0.2)", border: isSelected ? "2px solid #60a5fa" : "1px solid #374151", opacity: health >= 100 ? 0.5 : 1, textAlign: "center" }}>
                                                                <div onClick={() => { if (health < 100) { toggleId(id, selectedV4PlantsToWater, setSelectedV4PlantsToWater); if (!isSelected) { setV4CustomWaterAmounts(prev => ({ ...prev, [id]: Math.ceil(waterNeeded || 1) })); } } }} style={{ cursor: health < 100 ? "pointer" : "default" }}>
                                                                    <div style={{ fontSize: 10, fontWeight: 600 }}>#{id}</div>
                                                                    <div style={{ width: "100%", height: 4, background: "#1f2937", borderRadius: 2, margin: "3px 0", overflow: "hidden" }}>
                                                                        <div style={{ height: "100%", width: `${health}%`, background: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444", transition: "width 0.3s" }} />
                                                                    </div>
                                                                    <div style={{ fontSize: 9, color: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444", fontWeight: 600 }}>{health}%</div>
                                                                    {health < 100 && <div style={{ fontSize: 8, color: "#60a5fa" }}>Need: {waterNeeded.toFixed(1)}L</div>}
                                                                </div>
                                                                {isSelected && health < 100 && (
                                                                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setV4CustomWaterAmounts(prev => ({ ...prev, [id]: Math.max(1, (prev[id] ?? Math.ceil(waterNeeded)) - 1) })); }} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #374151", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                                                                        <input type="number" value={customAmount} onChange={(e) => { const val = Math.max(1, parseInt(e.target.value) || 1); setV4CustomWaterAmounts(prev => ({ ...prev, [id]: val })); }} onClick={(e) => e.stopPropagation()} style={{ width: 32, height: 18, textAlign: "center", fontSize: 9, background: "#1f2937", border: "1px solid #374151", borderRadius: 4, color: "#fff" }} min="1" />
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setV4CustomWaterAmounts(prev => ({ ...prev, [id]: (prev[id] ?? Math.ceil(waterNeeded)) + 1 })); }} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #374151", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "#9ca3af", marginTop: 6 }}>
                                                    <span>Your Water: {v4StakingStats?.water ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v4StakingStats.water.toString()), 18)).toFixed(2) : "0"}L</span>
                                                    {selectedV4PlantsToWater.length > 0 && <span style={{ color: "#60a5fa" }}>Using: {selectedV4PlantsToWater.reduce((sum, id) => sum + (v4CustomWaterAmounts[id] ?? Math.ceil(v4WaterNeeded[id] || 1)), 0).toFixed(1)}L</span>}
                                                </div>
                                                {selectedV4PlantsToWater.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={handleV4WaterPlants}
                                                        disabled={actionLoading || !connected}
                                                        className={styles.btnPrimary}
                                                        style={{ width: "100%", marginTop: 8, padding: 8, fontSize: 11, background: actionLoading ? "#374151" : "linear-gradient(135deg, #3b82f6, #60a5fa)" }}
                                                    >
                                                        {actionLoading ? "💧 Watering..." : `💧 Water ${selectedV4PlantsToWater.length} Plant${selectedV4PlantsToWater.length > 1 ? "s" : ""} (${selectedV4PlantsToWater.reduce((sum, id) => sum + (v4CustomWaterAmounts[id] ?? Math.ceil(v4WaterNeeded[id] || 1)), 0).toFixed(1)}L)`}
                                                    </button>
                                                )}
                                                {v4ActionStatus && <p style={{ fontSize: 9, color: "#fbbf24", marginTop: 4, textAlign: "center" }}>{v4ActionStatus}</p>}
                                            </div>
                                        )}
                                    </>
                                )}
                                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                                    <button type="button" className={styles.btnPrimary} disabled={true} style={{ flex: 1, padding: 10, fontSize: 12, background: "#374151", color: "#6b7280", cursor: "not-allowed" }}>Stake (Disabled)</button>
                                    <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !V4_STAKING_ADDRESS || (selectedV4StakedPlants.length + selectedV4StakedLands.length + selectedV4StakedSuperLands.length === 0)} onClick={async () => { if (selectedV4StakedPlants.length > 0) await handleV4UnstakePlants(); if (selectedV4StakedLands.length > 0) await handleV4UnstakeLands(); if (selectedV4StakedSuperLands.length > 0) await handleV4UnstakeSuperLands(); }} style={{ flex: 1, padding: 10, fontSize: 12, background: "linear-gradient(to right, #dc2626, #ef4444)" }}>{actionLoading ? "Unstaking..." : "Unstake"}</button>
                                    <button type="button" className={styles.btnPrimary} disabled={true} style={{ flex: 1, padding: 10, fontSize: 12, background: "#374151", color: "#6b7280", cursor: "not-allowed" }}>Claim (Disabled)</button>
                                </div>
                                <p style={{ fontSize: 9, color: "#fbbf24", marginTop: 6, textAlign: "center" }}>⚠️ V4 is deprecated! Water plants to 100% health, unstake, then move to V5.</p>
                                {v4ActionStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 4, textAlign: "center" }}>{v4ActionStatus}</p>}
                            </>
                        )}
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

            
            {nukeConfirmOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 72, background: "rgba(0,0,0,0.9)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 95, padding: 16 }}>
                    <div style={{ background: "linear-gradient(135deg, #1a0000, #2d0a0a)", borderRadius: 16, padding: 24, maxWidth: 380, width: "100%", border: "2px solid #ef4444", boxShadow: "0 0 40px rgba(239,68,68,0.3)" }}>
                        <div style={{ textAlign: "center", marginBottom: 20 }}>
                            <div style={{ fontSize: 48, marginBottom: 12 }}>☢️</div>
                            <h3 style={{ margin: 0, fontSize: 22, color: "#ef4444", fontWeight: 700 }}>TACTICAL NUKE</h3>
                            <p style={{ fontSize: 12, color: "#fca5a5", margin: "8px 0 0" }}>+10,000% Combat Power</p>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                            <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#22c55e", marginBottom: 4 }}>WIN CHANCE</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>100%</div>
                            </div>
                            <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#fbbf24", marginBottom: 4 }}>STEAL</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "#fbbf24" }}>50%</div>
                            </div>
                            <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, padding: 10, textAlign: "center" }}>
                                <div style={{ fontSize: 9, color: "#ef4444", marginBottom: 4 }}>DAMAGE</div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>50%</div>
                            </div>
                        </div>
                        <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 14, marginBottom: 20 }}>
                            <div style={{ fontSize: 11, color: "#fca5a5", textAlign: "center", lineHeight: 1.6 }}>
                                <strong style={{ color: "#ef4444" }}>⚠️ WARNING</strong><br/><br/>
                                Activating the Tactical Nuke lasts <strong>10 minutes</strong> - just enough time to <strong>destroy your worst enemy</strong>.<br/><br/>
                                Make sure you have a target ready before confirming!
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                onClick={() => setNukeConfirmOpen(false)}
                                style={{
                                    flex: 1,
                                    padding: 14,
                                    borderRadius: 10,
                                    border: "1px solid #374151",
                                    background: "transparent",
                                    color: "#9ca3af",
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: "pointer"
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleActivateNuke}
                                disabled={inventoryLoading}
                                style={{
                                    flex: 1,
                                    padding: 14,
                                    borderRadius: 10,
                                    border: "none",
                                    background: "linear-gradient(135deg, #dc2626, #b91c1c)",
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: "pointer",
                                    boxShadow: "0 0 20px rgba(220,38,38,0.4)"
                                }}
                            >
                                {inventoryLoading ? "Launching..." : "☢️ LAUNCH NUKE"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            
            {healthPackModalOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 72, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
                    <div style={{ background: theme === "light" ? "#fff" : "#0f172a", borderRadius: 16, padding: 20, maxWidth: 520, width: "100%", maxHeight: "calc(100vh - 100px)", overflow: "auto", border: "1px solid rgba(16,185,129,0.3)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 18, color: "#10b981", display: "flex", alignItems: "center", gap: 8 }}>
                                <img src="/images/items/healthpack.png" alt="Health Pack" style={{ width: 28, height: 28, objectFit: "contain" }} />
                                Health Packs
                            </h3>
                            <button onClick={() => { setHealthPackModalOpen(false); setSelectedPlantsForHealthPack([]); setInventoryStatus(""); }} style={{ background: "transparent", border: "none", color: theme === "light" ? "#64748b" : "#9ca3af", fontSize: 24, cursor: "pointer" }}>✕</button>
                        </div>
                        
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16, background: "rgba(16,185,129,0.08)", borderRadius: 12, padding: 12 }}>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>Health Packs</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#10b981" }}>{inventoryHealthPacks}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>Staked Plants</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: "#a78bfa" }}>{v5StakedPlants.length}</div>
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ fontSize: 10, color: "#9ca3af", marginBottom: 2 }}>Avg Health</div>
                                <div style={{ fontSize: 20, fontWeight: 700, color: v5StakedPlants.length > 0 ? (v5StakedPlants.reduce((acc, id) => acc + (v5PlantHealths[id] ?? 100), 0) / v5StakedPlants.length >= 70 ? "#10b981" : v5StakedPlants.reduce((acc, id) => acc + (v5PlantHealths[id] ?? 100), 0) / v5StakedPlants.length >= 40 ? "#fbbf24" : "#ef4444") : "#10b981" }}>
                                    {v5StakedPlants.length > 0 ? Math.round(v5StakedPlants.reduce((acc, id) => acc + (v5PlantHealths[id] ?? 100), 0) / v5StakedPlants.length) : 100}%
                                </div>
                            </div>
                        </div>

                        <p style={{ fontSize: 11, color: theme === "light" ? "#64748b" : "#9ca3af", marginBottom: 12, textAlign: "center" }}>Select plants to heal to 80% health. Each plant uses 1 health pack.</p>
                        
                        <div style={{ marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6, color: "#10b981", cursor: "pointer" }}>
                                <input 
                                    type="checkbox" 
                                    checked={selectedPlantsForHealthPack.length === v5StakedPlants.filter(id => (v5PlantHealths[id] ?? 100) < 80).length && selectedPlantsForHealthPack.length > 0}
                                    onChange={() => {
                                        const needsHealing = v5StakedPlants.filter(id => (v5PlantHealths[id] ?? 100) < 80).slice(0, inventoryHealthPacks);
                                        if (selectedPlantsForHealthPack.length === needsHealing.length && needsHealing.length > 0) {
                                            setSelectedPlantsForHealthPack([]);
                                        } else {
                                            setSelectedPlantsForHealthPack(needsHealing);
                                        }
                                    }}
                                    style={{ accentColor: "#10b981" }}
                                />
                                Select all below 80%
                            </label>
                            <div style={{ fontSize: 10, color: selectedPlantsForHealthPack.length > inventoryHealthPacks ? "#ef4444" : "#9ca3af" }}>
                                Selected: {selectedPlantsForHealthPack.length} / {inventoryHealthPacks} packs
                            </div>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16, maxHeight: 350, overflow: "auto", padding: 4 }}>
                            {v5StakedPlants.map((id) => {
                                const health = v5PlantHealths[id] ?? 100;
                                const isSelected = selectedPlantsForHealthPack.includes(id);
                                const needsHeal = health < 80;
                                return (
                                    <div 
                                        key={id}
                                        onClick={() => {
                                            if (isSelected) {
                                                setSelectedPlantsForHealthPack(prev => prev.filter(p => p !== id));
                                            } else if (selectedPlantsForHealthPack.length < inventoryHealthPacks) {
                                                setSelectedPlantsForHealthPack(prev => [...prev, id]);
                                            }
                                        }}
                                        style={{
                                            background: isSelected ? "rgba(16,185,129,0.15)" : theme === "light" ? "#f8fafc" : "rgba(15,23,42,0.8)",
                                            border: isSelected ? "2px solid #10b981" : "1px solid rgba(100,116,139,0.2)",
                                            borderRadius: 10,
                                            padding: 10,
                                            textAlign: "center",
                                            cursor: needsHeal || isSelected ? "pointer" : "default",
                                            opacity: !needsHeal && !isSelected ? 0.6 : 1,
                                            transition: "all 0.15s ease"
                                        }}
                                    >
                                        <div style={{ fontSize: 11, color: theme === "light" ? "#475569" : "#94a3b8", marginBottom: 4, fontWeight: 600 }}>Plant #{id}</div>
                                        <div style={{ 
                                            width: 56, 
                                            height: 56, 
                                            borderRadius: 8, 
                                            margin: "0 auto 8px",
                                            overflow: "hidden",
                                            border: health >= 80 ? "2px solid #22c55e" : health >= 50 ? "2px solid #eab308" : "2px solid #ef4444"
                                        }}>
                                            <img 
                                                src={plantImages[id] || PLANT_FALLBACK_IMG} 
                                                alt={`Plant #${id}`}
                                                style={{ width: "100%", height: "100%", objectFit: "cover" }}
                                            />
                                        </div>
                                        <div style={{ marginBottom: 6 }}>
                                            <div style={{ 
                                                height: 8, 
                                                background: "rgba(0,0,0,0.3)", 
                                                borderRadius: 4, 
                                                overflow: "hidden",
                                                border: "1px solid rgba(255,255,255,0.1)"
                                            }}>
                                                <div style={{ 
                                                    height: "100%", 
                                                    width: `${health}%`, 
                                                    background: health >= 80 ? "linear-gradient(90deg, #22c55e, #4ade80)" : health >= 50 ? "linear-gradient(90deg, #eab308, #facc15)" : "linear-gradient(90deg, #dc2626, #ef4444)",
                                                    borderRadius: 4,
                                                    transition: "width 0.3s ease"
                                                }} />
                                            </div>
                                        </div>
                                        <div style={{ 
                                            fontSize: 12, 
                                            fontWeight: 700, 
                                            color: health >= 80 ? "#22c55e" : health >= 50 ? "#eab308" : "#ef4444" 
                                        }}>
                                            {health}% HP
                                        </div>
                                        {health >= 80 && (
                                            <div style={{ fontSize: 8, color: "#22c55e", marginTop: 2 }}>✓ Healthy</div>
                                        )}
                                        {isSelected && (
                                            <div style={{ fontSize: 8, color: "#10b981", marginTop: 2, fontWeight: 600 }}>✓ Selected</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {v5StakedPlants.length === 0 && (
                            <div style={{ textAlign: "center", padding: 20 }}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>🌱</div>
                                <p style={{ fontSize: 12, color: theme === "light" ? "#64748b" : "#9ca3af" }}>No staked plants found</p>
                            </div>
                        )}

                        {inventoryStatus && <p style={{ fontSize: 11, color: "#fbbf24", marginBottom: 12, textAlign: "center" }}>{inventoryStatus}</p>}

                        <div style={{ display: "flex", gap: 10 }}>
                            <button
                                onClick={handleUseHealthPack}
                                disabled={selectedPlantsForHealthPack.length === 0 || selectedPlantsForHealthPack.length > inventoryHealthPacks || inventoryLoading}
                                style={{
                                    flex: 1,
                                    padding: 14,
                                    borderRadius: 10,
                                    border: "none",
                                    background: selectedPlantsForHealthPack.length > 0 && selectedPlantsForHealthPack.length <= inventoryHealthPacks ? "linear-gradient(135deg, #10b981, #34d399)" : "#374151",
                                    color: "#fff",
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: selectedPlantsForHealthPack.length > 0 && selectedPlantsForHealthPack.length <= inventoryHealthPacks ? "pointer" : "not-allowed",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    gap: 8
                                }}
                            >
                                <img src="/images/items/healthpack.png" alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
                                {inventoryLoading ? "Healing..." : `Heal ${selectedPlantsForHealthPack.length} Plant${selectedPlantsForHealthPack.length !== 1 ? "s" : ""}`}
                            </button>
                            <button
                                onClick={() => { setHealthPackModalOpen(false); setSelectedPlantsForHealthPack([]); setInventoryStatus(""); }}
                                style={{
                                    padding: "14px 20px",
                                    borderRadius: 10,
                                    border: "1px solid #374151",
                                    background: "transparent",
                                    color: theme === "light" ? "#1e293b" : "#fff",
                                    cursor: "pointer",
                                    fontWeight: 600
                                }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {waterModalOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 72, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
                    <div style={{ background: theme === "light" ? "#fff" : "#0f172a", borderRadius: 16, padding: 20, maxWidth: 420, width: "100%", maxHeight: "calc(100vh - 100px)", overflow: "auto", border: "1px solid rgba(96,165,250,0.3)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 18, color: "#60a5fa" }}>💧 Water Shop</h3>
                            <button onClick={() => setWaterModalOpen(false)} style={{ background: "transparent", border: "none", color: theme === "light" ? "#64748b" : "#9ca3af", fontSize: 24, cursor: "pointer" }}>✕</button>
                        </div>
                        {/* FCWEED Balance Display */}
                        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12, padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 14 }}>🌿</span>
                                <span style={{ fontSize: 12, color: "#10b981", fontWeight: 700 }}>{fcweedBalance} FCWEED</span>
                            </div>
                        </div>
                        <p style={{ fontSize: 11, color: theme === "light" ? "#64748b" : "#9ca3af", marginBottom: 16 }}>Water restores plant health. Neglected plants cost more water!</p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 16 }}>
                            <div style={{ background: theme === "light" ? "#f8fafc" : "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10 }}>
                                <div style={{ fontSize: 9, color: "#9ca3af" }}>SHOP STATUS</div>
                                <div style={{ fontSize: 14, color: waterShopInfo?.isOpen ? "#10b981" : "#ef4444", fontWeight: 700 }}>{waterShopInfo?.isOpen ? "🟢 OPEN" : "🔴 CLOSED"}</div>
                            </div>
                            <div style={{ background: theme === "light" ? "#f8fafc" : "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10 }}>
                                <div style={{ fontSize: 9, color: "#9ca3af" }}>HOURS (EST)</div>
                                <div style={{ fontSize: 13, color: "#c0c9f4", fontWeight: 600 }}>12PM - 6PM</div>
                            </div>
                            <div style={{ background: theme === "light" ? "#f8fafc" : "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10 }}>
                                <div style={{ fontSize: 9, color: "#9ca3af" }}>PRICE / LITER</div>
                                <div style={{ fontSize: 12, color: "#10b981", fontWeight: 600 }}>{waterShopInfo?.pricePerLiter ? waterShopInfo.pricePerLiter.toLocaleString() : "75,000"} FCWEED</div>
                            </div>
                            <div style={{ background: theme === "light" ? "#f8fafc" : "rgba(5,8,20,0.5)", borderRadius: 8, padding: 10 }}>
                                <div style={{ fontSize: 9, color: "#9ca3af" }}>YOUR LIMIT</div>
                                <div style={{ fontSize: 12, color: "#c0c9f4", fontWeight: 600 }}>{waterShopInfo?.walletLimit ? waterShopInfo.walletLimit.toFixed(0) : "0"}L</div>
                            </div>
                        </div>
                        {waterShopInfo?.isOpen && (
                            <div style={{ marginBottom: 16 }}>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 12 }}>
                                    <div style={{ background: "rgba(16,185,129,0.1)", borderRadius: 8, padding: 10 }}>
                                        <div style={{ fontSize: 9, color: "#9ca3af" }}>DAILY SUPPLY LEFT</div>
                                        <div style={{ fontSize: 14, color: "#10b981", fontWeight: 700 }}>{waterShopInfo?.dailyRemaining || "0"}L</div>
                                    </div>
                                    <div style={{ background: "rgba(96,165,250,0.1)", borderRadius: 8, padding: 10 }}>
                                        <div style={{ fontSize: 9, color: "#9ca3af" }}>YOUR REMAINING</div>
                                        <div style={{ fontSize: 14, color: "#60a5fa", fontWeight: 700 }}>{waterShopInfo?.walletRemaining || "0"}L</div>
                                    </div>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                                    <button type="button" onClick={() => setWaterBuyAmount(Math.max(1, waterBuyAmount - 1))} style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid #374151", background: "transparent", color: "#fff", cursor: "pointer", fontSize: 18, fontWeight: 700 }}>-</button>
                                    <div style={{ flex: 1, background: theme === "light" ? "#f8fafc" : "rgba(5,8,20,0.5)", borderRadius: 8, padding: "10px 16px", textAlign: "center" }}>
                                        <div style={{ fontSize: 20, color: "#60a5fa", fontWeight: 700 }}>{waterBuyAmount}L</div>
                                        <div style={{ fontSize: 11, color: "#9ca3af" }}>{(waterBuyAmount * (waterShopInfo?.pricePerLiter || 75000)).toLocaleString()} FCWEED</div>
                                    </div>
                                    <button type="button" onClick={() => setWaterBuyAmount(Math.min(waterShopInfo?.walletRemaining || 0, waterBuyAmount + 1))} disabled={waterBuyAmount >= (waterShopInfo?.walletRemaining || 0)} style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid #374151", background: waterBuyAmount >= (waterShopInfo?.walletRemaining || 0) ? "#1f2937" : "transparent", color: waterBuyAmount >= (waterShopInfo?.walletRemaining || 0) ? "#6b7280" : "#fff", cursor: waterBuyAmount >= (waterShopInfo?.walletRemaining || 0) ? "not-allowed" : "pointer", fontSize: 18, fontWeight: 700 }}>+</button>
                                </div>
                                <button type="button" onClick={handleBuyWater} disabled={waterLoading || !connected || waterBuyAmount > (waterShopInfo?.walletRemaining || 0)} style={{ width: "100%", padding: 14, fontSize: 13, fontWeight: 700, borderRadius: 10, border: "none", background: waterLoading ? "#374151" : "linear-gradient(135deg, #3b82f6, #60a5fa)", color: "#fff", cursor: waterLoading || waterBuyAmount > (waterShopInfo?.walletRemaining || 0) ? "not-allowed" : "pointer" }}>
                                    {waterLoading ? "💧 Buying..." : `💧 Buy ${waterBuyAmount}L Water`}
                                </button>
                                {waterStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 8, textAlign: "center" }}>{waterStatus}</p>}
                            </div>
                        )}
                        {!waterShopInfo?.isOpen && (
                            <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: 12, marginBottom: 16 }}>
                                <div style={{ fontSize: 11, color: "#fbbf24", textAlign: "center" }}>⏰ Shop opens at 12PM EST daily</div>
                            </div>
                        )}
                        <div style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 10, padding: 12 }}>
                            <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600, marginBottom: 8 }}>⚠️ Water Costs Scale With Decay!</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, fontSize: 10, color: "#9ca3af" }}>
                                <div>90% health → 0.2L</div>
                                <div>70% health → 1.8L</div>
                                <div>50% health → 5.0L</div>
                                <div>30% health → 9.8L</div>
                                <div>10% health → 16.2L</div>
                                <div>0% health → 20.0L</div>
                            </div>
                            <p style={{ fontSize: 10, color: "#ef4444", margin: "8px 0 0", textAlign: "center" }}>💡 Water early! Costs increase exponentially as health drops.</p>
                        </div>
                    </div>
                </div>
            )}

            {itemsModalOpen && (
                <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 72, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 16 }}>
                    <div style={{ background: theme === "light" ? "#fff" : "#0f172a", borderRadius: 16, padding: 20, maxWidth: 480, width: "100%", maxHeight: "calc(100vh - 100px)", overflow: "auto", border: "1px solid rgba(245,158,11,0.3)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                            <h3 style={{ margin: 0, fontSize: 18, color: "#f59e0b" }}>🏪 Item Shop</h3>
                            <button onClick={() => setItemsModalOpen(false)} style={{ background: "transparent", border: "none", color: theme === "light" ? "#64748b" : "#9ca3af", fontSize: 24, cursor: "pointer" }}>✕</button>
                        </div>
                        {/* Balance Display */}
                        <div style={{ display: "flex", justifyContent: "center", gap: 16, marginBottom: 12, padding: "8px 12px", background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 14 }}>🌿</span>
                                <span style={{ fontSize: 12, color: "#10b981", fontWeight: 700 }}>{fcweedBalance} FCWEED</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 14 }}>💨</span>
                                <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>{crateUserStats.dust.toLocaleString()} DUST</span>
                            </div>
                        </div>
                        <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", marginBottom: 12 }}>
                            ⏰ Daily supply resets at 7:00 PM EST
                        </div>
                        <div style={{ fontSize: 12, color: "#ef4444", fontWeight: 700, textAlign: "center", marginBottom: 12 }}>🔫 WEAPONS</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                            <div style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: 10, textAlign: "center", display: "flex", flexDirection: "column", minHeight: 180 }}>
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                                    <img src="/images/items/ak47.png" alt="AK-47" style={{ width: 40, height: 40, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 2 }}>AK-47</div>
                                <div style={{ fontSize: 8, color: "#fca5a5", marginBottom: 2 }}>+100% Combat</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", marginBottom: 3 }}>Lasts 6 hours</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[4]?.remaining ?? 15) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#ef4444", fontWeight: 600 }}>{shopSupply[4]?.remaining ?? 15}/{shopSupply[4]?.total ?? 15}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(4, "dust")} disabled={shopLoading || crateUserStats.dust < 1000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 1000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 1000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 1000 ? "pointer" : "not-allowed", fontSize: 8 }}>💨 1K DUST</button>
                                            <button onClick={() => handleBuyItem(4, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.ak47)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.ak47) ? "linear-gradient(135deg, #ef4444, #dc2626)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.ak47) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.ak47) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 1M FCWEED</button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: "8px 0" }}>
                                        <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 4 }}>SOLD OUT</div>
                                        <div style={{ fontSize: 8, color: "#9ca3af" }}>Restock in {Math.floor(shopTimeUntilReset / 3600)}h {Math.floor((shopTimeUntilReset % 3600) / 60)}m</div>
                                    </div>
                                )}
                                </div>
                            </div>
                            <div style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.25), rgba(185,28,28,0.2))", border: "2px solid rgba(239,68,68,0.6)", borderRadius: 12, padding: 10, textAlign: "center", boxShadow: "0 0 20px rgba(239,68,68,0.25)", display: "flex", flexDirection: "column", minHeight: 180 }}>
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                                    <img src="/images/items/nuke.png" alt="Nuke" style={{ width: 40, height: 40, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", marginBottom: 2 }}>TACTICAL NUKE</div>
                                <div style={{ fontSize: 8, color: "#fca5a5", marginBottom: 2 }}>+10,000% Combat</div>
                                <div style={{ fontSize: 7, color: "#fca5a5", marginBottom: 3 }}>10 min (1 attack)</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[6]?.remaining ?? 1) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#ef4444", fontWeight: 600 }}>{shopSupply[6]?.remaining ?? 1}/{shopSupply[6]?.total ?? 1}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(6, "dust")} disabled={shopLoading || crateUserStats.dust < 10000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 10000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 10000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 10000 ? "pointer" : "not-allowed", fontSize: 8 }}>💨 10K DUST</button>
                                            <button onClick={() => handleBuyItem(6, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.nuke)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.nuke) ? "linear-gradient(135deg, #dc2626, #b91c1c)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.nuke) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.nuke) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 10M FCWEED</button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: "8px 0" }}>
                                        <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 700, marginBottom: 4 }}>SOLD OUT</div>
                                        <div style={{ fontSize: 8, color: "#9ca3af" }}>Restock in {Math.floor(shopTimeUntilReset / 3600)}h {Math.floor((shopTimeUntilReset % 3600) / 60)}m</div>
                                    </div>
                                )}
                                </div>
                            </div>
                            <div style={{ background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(139,92,246,0.1))", border: "1px solid rgba(168,85,247,0.4)", borderRadius: 12, padding: 10, textAlign: "center", display: "flex", flexDirection: "column", minHeight: 180 }}>
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                                    <img src="/images/items/rpg.png" alt="RPG" style={{ width: 40, height: 40, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#a855f7", marginBottom: 2 }}>RPG</div>
                                <div style={{ fontSize: 8, color: "#c4b5fd", marginBottom: 2 }}>+500% Combat</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", marginBottom: 3 }}>Lasts 1 hour</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[5]?.remaining ?? 3) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#a855f7", fontWeight: 600 }}>{shopSupply[5]?.remaining ?? 3}/{shopSupply[5]?.total ?? 3}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(5, "dust")} disabled={shopLoading || crateUserStats.dust < 4000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 4000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 4000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 4000 ? "pointer" : "not-allowed", fontSize: 8 }}>💨 4K DUST</button>
                                            <button onClick={() => handleBuyItem(5, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.rpg)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.rpg) ? "linear-gradient(135deg, #a855f7, #8b5cf6)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.rpg) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.rpg) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 4M FCWEED</button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: "8px 0" }}>
                                        <div style={{ fontSize: 10, color: "#a855f7", fontWeight: 700, marginBottom: 4 }}>SOLD OUT</div>
                                        <div style={{ fontSize: 8, color: "#9ca3af" }}>Restock in {Math.floor(shopTimeUntilReset / 3600)}h {Math.floor((shopTimeUntilReset % 3600) / 60)}m</div>
                                    </div>
                                )}
                                </div>
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: "#10b981", fontWeight: 700, textAlign: "center", marginBottom: 12 }}>🛡️ CONSUMABLES</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                            <div style={{ background: "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(34,197,94,0.1))", border: "1px solid rgba(16,185,129,0.4)", borderRadius: 12, padding: 10, textAlign: "center", display: "flex", flexDirection: "column", minHeight: 170 }}>
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: 2 }}>
                                    <img src="/images/items/healthpack.png" alt="Health Pack" style={{ width: 36, height: 36, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981", marginBottom: 2 }}>HEALTH PACK</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", lineHeight: 1.2, marginBottom: 4 }}>Heals one Plant Max to 80%<br/>Usage: 1 Per Plant</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[1]?.remaining ?? 20) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#10b981", fontWeight: 600 }}>{shopSupply[1]?.remaining ?? 20}/{shopSupply[1]?.total ?? 20}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(1, "dust")} disabled={shopLoading || crateUserStats.dust < 2000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 2000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 2000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 2000 ? "pointer" : "not-allowed", fontSize: 8 }}>💨 2K DUST</button>
                                            <button onClick={() => handleBuyItem(1, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.healthPack)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.healthPack) ? "linear-gradient(135deg, #10b981, #34d399)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.healthPack) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.healthPack) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 2M FCWEED</button>
                                        </div>
                                    </>
                                ) : (
                                    <div style={{ padding: "8px 0" }}>
                                        <div style={{ fontSize: 10, color: "#10b981", fontWeight: 700, marginBottom: 4 }}>SOLD OUT</div>
                                        <div style={{ fontSize: 8, color: "#9ca3af" }}>Restock in {Math.floor(shopTimeUntilReset / 3600)}h {Math.floor((shopTimeUntilReset % 3600) / 60)}m</div>
                                    </div>
                                )}
                                </div>
                            </div>
                            <div style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(96,165,250,0.1))", border: "1px solid rgba(59,130,246,0.4)", borderRadius: 12, padding: 10, textAlign: "center", display: "flex", flexDirection: "column", minHeight: 170 }}>
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: 2 }}>
                                    <span style={{ fontSize: 28 }}>🛡️</span>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", marginBottom: 2 }}>RAID SHIELD</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", lineHeight: 1.2, marginBottom: 4 }}>24h Protection<br/>Purge Bypasses Shields</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[2]?.remaining ?? 25) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#3b82f6", fontWeight: 600 }}>{shopSupply[2]?.remaining ?? 25}/{shopSupply[2]?.total ?? 25}</span></div>
                                        <button onClick={() => handleBuyItem(2, "dust")} disabled={shopLoading || crateUserStats.dust < 2500} style={{ width: "100%", padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 2500 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 2500 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 2500 ? "pointer" : "not-allowed", fontSize: 8 }}>💨 2.5K DUST</button>
                                    </>
                                ) : (
                                    <div style={{ padding: "8px 0" }}>
                                        <div style={{ fontSize: 10, color: "#3b82f6", fontWeight: 700, marginBottom: 4 }}>SOLD OUT</div>
                                        <div style={{ fontSize: 8, color: "#9ca3af" }}>Restock in {Math.floor(shopTimeUntilReset / 3600)}h {Math.floor((shopTimeUntilReset % 3600) / 60)}m</div>
                                    </div>
                                )}
                                </div>
                            </div>
                            <div style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15), rgba(251,191,36,0.1))", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 12, padding: 10, textAlign: "center", display: "flex", flexDirection: "column", minHeight: 170 }}>
                                <div style={{ display: "flex", justifyContent: "center", marginBottom: 2 }}>
                                    <span style={{ fontSize: 28 }}>⚡</span>
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", marginBottom: 2 }}>ATTACK BOOST</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", lineHeight: 1.2, marginBottom: 4 }}>+20% Combat<br/>Lasts 6 hours</div>
                                <div style={{ marginTop: "auto" }}>
                                <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#f59e0b", fontWeight: 600 }}>∞</span></div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                    <button onClick={() => handleBuyItem(3, "dust")} disabled={shopLoading || crateUserStats.dust < 200} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 200 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 200 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 200 ? "pointer" : "not-allowed", fontSize: 8 }}>💨 200 DUST</button>
                                    <button onClick={() => handleBuyItem(3, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.attackBoost)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.attackBoost) ? "linear-gradient(135deg, #f59e0b, #fbbf24)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.attackBoost) ? "#000" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.attackBoost) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 200K FCWEED</button>
                                </div>
                                </div>
                            </div>
                        </div>
                        {shopStatus && <p style={{ fontSize: 10, color: "#fbbf24", marginTop: 8, textAlign: "center" }}>{shopStatus}</p>}
                        <div style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", borderRadius: 8, padding: 10, marginTop: 12 }}>
                            <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 600, marginBottom: 4 }}>🎁 More Items Coming Soon!</div>
                            <p style={{ fontSize: 9, color: "#9ca3af", margin: 0 }}>Fertilizers, Growth Serums, and more...</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
