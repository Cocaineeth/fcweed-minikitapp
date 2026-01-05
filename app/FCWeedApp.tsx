"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import { useAccount, useDisconnect, useWalletClient } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
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
import { clearAuthStorage } from "./lib/referralAuth";
import { ReferralsPanel } from "./components/ReferralsPanel";
import { ThePurge } from "./components/ThePurge";
import { DEARaidsLeaderboard } from "./components/DEARaidsLeaderboard";
import { BattleEventToast } from "./components/BattleEventToast";
import { NotificationSettings } from "./components/NotificationSettings";
import { PURGE_ADDRESS, DEA_RAIDS_ADDRESS } from "./lib/constants";
import IsometricFarm from "./components/GrowRoomV3";

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
    WARS_BACKEND_URL,
} from "./lib/constants";

import {
    V3_BATTLES_ABI,
    V11_ITEMSHOP_ABI,
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
    v3BattlesInterface,
    v5ItemShopInterface,
    v11ItemShopInterface,
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

export default function FCWeedApp({ onThemeChange }: { onThemeChange?: (theme: "dark" | "light") => void })
{
    const { address: wagmiAddress, isConnected: wagmiConnected } = useAccount();
    const { data: walletClient } = useWalletClient();
    const { openConnectModal } = useConnectModal();
    const { disconnect: wagmiDisconnect } = useDisconnect();

    const [theme, setTheme] = useState<"dark" | "light">("dark");
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [userAvatar, setUserAvatar] = useState<string | null>(null);
    const [showOnboarding, setShowOnboarding] = useState(false);
    const [hasSeenOnboarding, setHasSeenOnboarding] = useState(false);

    const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [userAddress, setUserAddress] = useState<string | null>(null);
    const connected = !!userAddress || wagmiConnected;
    const [usingMiniApp, setUsingMiniApp] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [miniAppEthProvider, setMiniAppEthProvider] = useState<any | null>(null);

    const [readProvider] = useState(() => new ethers.providers.JsonRpcProvider(PUBLIC_BASE_RPC));

    // Reset connecting state on mount (in case it got stuck)
    useEffect(() => {
        setConnecting(false);
    }, []);

    // Helper to find the correct ethereum provider for the connected wallet
    // Uses wagmi connector info when available to avoid window.ethereum conflicts
    const getConnectedProvider = useCallback(() => {
        const anyWindow = window as any;
        
        // First, try to get connector name from walletClient to know which wallet we're dealing with
        const connectorName = walletClient?.transport?.name?.toLowerCase() || '';
        const isPhantomConnector = connectorName.includes('phantom');
        const isRabbyConnector = connectorName.includes('rabby');
        const isMetaMaskConnector = connectorName.includes('metamask');
        const isCoinbaseConnector = connectorName.includes('coinbase');
        
        console.log("[Provider] Connector detected:", connectorName || 'unknown');
        
        // Priority 1: Use dedicated provider locations based on connector
        if (isPhantomConnector || anyWindow.phantom?.ethereum?.isPhantom) {
            if (anyWindow.phantom?.ethereum) {
                console.log("[Provider] Using window.phantom.ethereum (dedicated Phantom provider)");
                return anyWindow.phantom.ethereum;
            }
        }
        
        if (isRabbyConnector && anyWindow.rabby) {
            console.log("[Provider] Using window.rabby (dedicated Rabby provider)");
            return anyWindow.rabby;
        }
        
        // Priority 2: Check EIP-6963 multi-provider array
        if (anyWindow.ethereum?.providers?.length > 0) {
            const providers = anyWindow.ethereum.providers;
            console.log("[Provider] Found", providers.length, "providers in EIP-6963 array");
            
            // Match based on connector
            if (isPhantomConnector) {
                const p = providers.find((p: any) => p.isPhantom);
                if (p) { console.log("[Provider] Using Phantom from array"); return p; }
            }
            if (isRabbyConnector) {
                const p = providers.find((p: any) => p.isRabby);
                if (p) { console.log("[Provider] Using Rabby from array"); return p; }
            }
            if (isMetaMaskConnector) {
                const p = providers.find((p: any) => p.isMetaMask && !p.isRabby && !p.isPhantom);
                if (p) { console.log("[Provider] Using MetaMask from array"); return p; }
            }
            if (isCoinbaseConnector) {
                const p = providers.find((p: any) => p.isCoinbaseWallet);
                if (p) { console.log("[Provider] Using Coinbase from array"); return p; }
            }
            
            // If no connector match, try by detection
            const phantomProvider = providers.find((p: any) => p.isPhantom);
            if (phantomProvider && anyWindow.phantom?.ethereum) {
                console.log("[Provider] Phantom detected, using dedicated provider");
                return anyWindow.phantom.ethereum;
            }
        }
        
        // Priority 3: Dedicated provider locations (fallback)
        if (anyWindow.phantom?.ethereum) {
            console.log("[Provider] Fallback: Using window.phantom.ethereum");
            return anyWindow.phantom.ethereum;
        }
        
        if (anyWindow.rabby) {
            console.log("[Provider] Fallback: Using window.rabby");
            return anyWindow.rabby;
        }
        
        // Priority 4: Standard ethereum (may be conflicted)
        if (anyWindow.ethereum) {
            console.log("[Provider] Fallback: Using window.ethereum (isPhantom:", anyWindow.ethereum.isPhantom, 
                ", isRabby:", anyWindow.ethereum.isRabby, 
                ", isMetaMask:", anyWindow.ethereum.isMetaMask, ")");
            return anyWindow.ethereum;
        }
        
        console.warn("[Provider] No ethereum provider found!");
        return null;
    }, [walletClient]);

    // Sync wagmi state to local state
    useEffect(() => {
        // Keep local state in sync with wagmi. This needs to handle wallet *changes*,
        // not just first connection, otherwise switching accounts leaves stale state.
        if (wagmiConnected && wagmiAddress && !usingMiniApp)
        {
            const next = wagmiAddress;
            const prev = userAddress;

            const changed = !!prev && prev.toLowerCase() !== next.toLowerCase();

            if (!prev || changed)
            {
                console.log("[Wagmi] Syncing wagmi connection to local state:", next);

                // If wallet changed, clear any cached auth tied to the old address.
                if (changed)
                {
                    try { clearAuthStorage(); } catch {}
                }

                setUserAddress(next);
                setConnecting(false);

                const ethProvider = getConnectedProvider();
                if (ethProvider)
                {
                    const ethersProvider = new ethers.providers.Web3Provider(ethProvider, "any");
                    setProvider(ethersProvider);
                    setSigner(ethersProvider.getSigner(next));
                    setMiniAppEthProvider(ethProvider);
                    console.log("[Wagmi] Provider set up successfully for:", next);
                }
                else
                {
                    console.warn("[Wagmi] No ethereum provider found!");
                }
            }
        }
        else if (!wagmiConnected && userAddress && !usingMiniApp)
        {
            // RainbowKit disconnected - clear state
            try { clearAuthStorage(); } catch {}
            setUserAddress(null);
            setProvider(null);
            setSigner(null);
            setMiniAppEthProvider(null);
            setDisplayName(null);
            setUserAvatar(null);
            setConnecting(false);
        }
    }, [wagmiConnected, wagmiAddress, userAddress, usingMiniApp, getConnectedProvider]);

    useEffect(() => { onThemeChange?.(theme); }, [theme, onThemeChange]);

    const composeCast = useCallback(async (options: { text?: string }) => {
        try {
            const context = await sdk.context;
            if (context) {
                await sdk.actions.openUrl(`https://warpcast.com/~/compose?text=${encodeURIComponent(options.text || '')}`);
            } else {
                window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(options.text || '')}`, '_blank');
            }
        } catch {
            window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(options.text || '')}`, '_blank');
        }
    }, []);

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
    const [contractCombatPower, setContractCombatPower] = useState<number>(0); // Power from contract's getPower()
    const [contractDefensePower, setContractDefensePower] = useState<number>(0); // Defense power (base, no boosts)
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
    const [warsTargetRevealed, setWarsTargetRevealed] = useState(false); // NEW: whether stats are revealed
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

    // Auto-register for notifications when user connects in Farcaster
    const notificationRegistered = useRef(false);
    useEffect(() => {
        if (!userAddress || notificationRegistered.current) return;
        
        const autoRegisterNotifications = async () => {
            try {
                // Get Farcaster context
                const context = await sdk.context;
                const fid = context?.user?.fid;
                
                if (!fid) {
                    console.log("[Notifications] Not in Farcaster context, skipping auto-register");
                    return;
                }

                // Check if already registered
                try {
                    const statusRes = await fetch(`${WARS_BACKEND_URL}/api/notifications/status/${userAddress}`);
                    const status = await statusRes.json();
                    if (status.registered) {
                        console.log("[Notifications] Already registered");
                        notificationRegistered.current = true;
                        return;
                    }
                } catch (e) {
                    // Backend might not be available, continue anyway
                }

                // Auto-register with default preferences
                console.log(`[Notifications] Auto-registering ${userAddress.slice(0,10)}... with FID ${fid}`);
                
                const res = await fetch(`${WARS_BACKEND_URL}/api/notifications/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        address: userAddress,
                        fid: fid,
                        preferences: {
                            shopRestock: true,
                            purgeStarted: true,
                            attacked: true,
                            battleResult: true,
                            cartelCooldown: true,
                            purgeCooldown: true,
                            deaCooldown: true,
                            shieldExpiring: true,
                            nukeExpiring: true,
                            plantHealthCritical: true,
                            referralUsed: true,
                            deaListFlagged: true,
                            crateJackpot: true,
                        },
                    }),
                });

                if (res.ok) {
                    console.log("[Notifications] Auto-registered successfully!");
                    notificationRegistered.current = true;
                    localStorage.setItem("fcweed_notifications_enabled", "true");
                    localStorage.setItem("fcweed_fid", String(fid));
                }
            } catch (e) {
                console.error("[Notifications] Auto-register failed:", e);
            }
        };

        // Small delay to let app initialize
        const timer = setTimeout(autoRegisterNotifications, 3000);
        return () => clearTimeout(timer);
    }, [userAddress]);

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
    const [imagesLoaded, setImagesLoaded] = useState(false);
    
    // Video refs for persistent playback across tabs
    const infoVideoRef = useRef<HTMLVideoElement | null>(null);
    const mintVideoRef = useRef<HTMLVideoElement | null>(null);
    const stakeVideoRef = useRef<HTMLVideoElement | null>(null);

    // Preload all images on mount to prevent flickering
    useEffect(() => {
        const imagesToPreload = [
            '/images/items/ak47.gif',
            '/images/items/nuke.gif',
            '/images/items/rpg.gif',
            '/images/items/healthpack.gif',
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

    // Ensure all videos keep playing (some browsers pause hidden videos)
    useEffect(() => {
        const keepVideosPlaying = () => {
            [infoVideoRef, mintVideoRef, stakeVideoRef].forEach(ref => {
                if (ref.current && ref.current.paused) {
                    ref.current.play().catch(() => {});
                }
            });
        };
        
        const interval = setInterval(keepVideosPlaying, 1000);
        return () => clearInterval(interval);
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
            const tx = await sendContractTx(FCWEED_ADDRESS, approveData);
            if (!tx) return false;
            await waitForTx(tx, readProvider);
            return true;
        } catch (e) {
            console.error("Allowance check failed:", e);
            return false;
        }
    }

    async function ensureUsdcAllowanceDirect(spender: string, amount: ethers.BigNumber): Promise<boolean> {
        if (!userAddress || !readProvider) return false;
        try {
            const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, readProvider);
            const current = await usdc.allowance(userAddress, spender);
            if (current.gte(amount)) return true;
            setMintStatus("Approving USDC...");
            const approveData = erc20Interface.encodeFunctionData("approve", [spender, ethers.constants.MaxUint256]);
            const tx = await sendContractTx(USDC_ADDRESS, approveData);
            if (!tx) return false;
            await waitForTx(tx, readProvider);
            return true;
        } catch (e) {
            console.error("USDC Allowance check failed:", e);
            return false;
        }
    }

    async function sendContractTx(to: string, data: string, gasLimit?: string, fromAddress?: string): Promise<ethers.providers.TransactionResponse | null> {
        // Use explicit fromAddress if provided, otherwise use global state
        const effectiveUserAddress = fromAddress || userAddress;
        const effectiveWagmiAddress = fromAddress || wagmiAddress;
        
        // Helper to get the correct provider
        const getProvider = () => {
            const anyWindow = window as any;
            
            // Check for multi-provider scenario (EIP-6963)
            if (anyWindow.ethereum?.providers?.length > 0) {
                const providers = anyWindow.ethereum.providers;
                const phantomProvider = providers.find((p: any) => p.isPhantom);
                const rabbyProvider = providers.find((p: any) => p.isRabby);
                const mmProvider = providers.find((p: any) => p.isMetaMask && !p.isRabby && !p.isPhantom);
                
                // Return in priority order based on what's likely connected
                if (phantomProvider) return phantomProvider;
                if (rabbyProvider) return rabbyProvider;
                if (mmProvider) return mmProvider;
            }
            
            // Phantom's dedicated location
            if (anyWindow.phantom?.ethereum) return anyWindow.phantom.ethereum;
            
            // Rabby's dedicated location
            if (anyWindow.rabby) return anyWindow.rabby;
            
            // Standard ethereum
            return anyWindow.ethereum;
        };

        // Handle Farcaster MiniApp transactions FIRST
        if (usingMiniApp && miniAppEthProvider && effectiveUserAddress) {
            try {
                // DEBUG: Check what accounts the MiniApp provider actually has
                try {
                    const accounts = await miniAppEthProvider.request({ method: "eth_accounts" });
                    console.log("[TX] MiniApp eth_accounts:", accounts);
                    if (accounts && accounts[0] && accounts[0].toLowerCase() !== effectiveUserAddress.toLowerCase()) {
                        console.error("[TX] WARNING: MiniApp wallet address mismatch!");
                        console.error("[TX] Expected:", effectiveUserAddress);
                        console.error("[TX] MiniApp has:", accounts[0]);
                    }
                } catch (accErr) {
                    console.warn("[TX] Could not fetch MiniApp accounts:", accErr);
                }
                
                console.log("[TX] Using MiniApp eth_sendTransaction for:", effectiveUserAddress);
                
                const txParams: any = {
                    from: effectiveUserAddress,
                    to: to,
                    data: data,
                    value: "0x0",
                };
                
                if (gasLimit) {
                    // Ensure gas is in hex format
                    if (gasLimit.startsWith("0x")) {
                        txParams.gas = gasLimit;
                    } else {
                        txParams.gas = "0x" + parseInt(gasLimit, 10).toString(16);
                    }
                    console.log("[TX] MiniApp gas limit:", txParams.gas);
                }
                
                const txHash = await miniAppEthProvider.request({
                    method: "eth_sendTransaction",
                    params: [txParams],
                });
                
                console.log("[TX] MiniApp tx hash:", txHash);
                
                if (txHash && typeof txHash === "string" && txHash.startsWith("0x")) {
                    return { 
                        hash: txHash,
                        wait: async () => {
                            // Poll for receipt with longer timeout for mobile
                            for (let i = 0; i < 60; i++) {
                                await new Promise(r => setTimeout(r, 2000));
                                try {
                                    const receipt = await readProvider.getTransactionReceipt(txHash);
                                    if (receipt && receipt.confirmations > 0) return receipt;
                                } catch {}
                            }
                            return null;
                        }
                    } as any;
                }
            } catch (e: any) {
                console.error("[TX] MiniApp transaction failed:", e);
                console.error("[TX] MiniApp error details:", {
                    message: e?.message,
                    code: e?.code,
                    data: e?.data
                });
                
                const msg = e?.message || "Transaction failed";
                if (msg.includes("rejected") || msg.includes("denied") || msg.includes("canceled") || e?.code === 4001) {
                    setMintStatus("Transaction canceled");
                } else {
                    setMintStatus(msg.slice(0, 60));
                }
                return null;
            }
        }

        // NEW: Handle RainbowKit/desktop connections using walletClient
        if (wagmiConnected && effectiveWagmiAddress && !usingMiniApp && walletClient) {
            try {
                console.log("[TX] Attempting walletClient.sendTransaction for:", effectiveWagmiAddress);
                
                // Build transaction params
                const txParams: any = {
                    to: to as `0x${string}`,
                    data: data as `0x${string}`,
                    chain: walletClient.chain,
                    account: walletClient.account,
                };
                
                // Include gas limit if provided (critical for battles/crates)
                if (gasLimit) {
                    // Convert hex string to bigint for viem
                    if (gasLimit.startsWith("0x")) {
                        txParams.gas = BigInt(gasLimit);
                    } else {
                        txParams.gas = BigInt(parseInt(gasLimit, 10));
                    }
                    console.log("[TX] WalletClient gas limit:", txParams.gas.toString());
                }
                
                // Use walletClient from wagmi - this is the correct provider for ANY connected wallet
                const hash = await walletClient.sendTransaction(txParams);
                
                console.log("[TX] WalletClient tx hash:", hash);
                
                // Get a provider to fetch the transaction response
                const ethProvider = getProvider();
                if (ethProvider) {
                    const provider = new ethers.providers.Web3Provider(ethProvider, "any");
                    // Wait a moment for tx to propagate, then fetch
                    await new Promise(r => setTimeout(r, 500));
                    const txResponse = await provider.getTransaction(hash);
                    if (txResponse) return txResponse;
                }
                
                // Fallback: return a minimal response with the hash
                return { 
                    hash,
                    wait: async () => {
                        for (let i = 0; i < 30; i++) {
                            await new Promise(r => setTimeout(r, 2000));
                            try {
                                const receipt = await readProvider.getTransactionReceipt(hash);
                                if (receipt && receipt.confirmations > 0) return receipt;
                            } catch {}
                        }
                        return null;
                    }
                } as any;
            } catch (e: any) {
                console.error("[TX] WalletClient failed:", e);
                console.error("[TX] WalletClient error details:", {
                    message: e?.message,
                    shortMessage: e?.shortMessage,
                    code: e?.code,
                    cause: e?.cause?.message
                });
                const msg = e?.shortMessage || e?.message || "Transaction failed";
                if (msg.includes("rejected") || msg.includes("denied") || e?.code === 4001 || e?.code === "ACTION_REJECTED") {
                    setMintStatus("Transaction canceled");
                    return null;
                }
                // Don't return null yet - try the raw provider fallback
                console.log("[TX] WalletClient failed, trying raw provider fallback...");
            }
        }
        
        // Fallback to raw eth_sendTransaction for better Phantom/Base App compatibility
        if (wagmiConnected && effectiveWagmiAddress && !usingMiniApp) {
            const ethProvider = getProvider();
            if (ethProvider) {
                try {
                    console.log("[TX] Using raw eth_sendTransaction for:", effectiveWagmiAddress,
                        "Provider:", ethProvider.isPhantom ? "Phantom" : ethProvider.isRabby ? "Rabby" : ethProvider.isMetaMask ? "MetaMask" : "Unknown");
                    
                    const txParams: any = {
                        from: effectiveWagmiAddress,
                        to: to,
                        data: data,
                        value: "0x0",
                    };
                    if (gasLimit) {
                        // Ensure gas is in hex format for eth_sendTransaction
                        if (gasLimit.startsWith("0x")) {
                            txParams.gas = gasLimit;
                        } else {
                            // Convert decimal string to hex
                            txParams.gas = "0x" + parseInt(gasLimit, 10).toString(16);
                        }
                        console.log("[TX] Gas limit:", txParams.gas);
                    }
                    
                    // Use raw provider request - most compatible with all wallets
                    const txHash = await ethProvider.request({
                        method: "eth_sendTransaction",
                        params: [txParams],
                    });
                    
                    console.log("[TX] Raw tx hash:", txHash);
                    
                    if (txHash && typeof txHash === "string" && txHash.startsWith("0x")) {
                        // Return a minimal response object
                        return { 
                            hash: txHash,
                            wait: async () => {
                                // Poll for receipt
                                for (let i = 0; i < 30; i++) {
                                    await new Promise(r => setTimeout(r, 2000));
                                    try {
                                        const receipt = await readProvider.getTransactionReceipt(txHash);
                                        if (receipt && receipt.confirmations > 0) return receipt;
                                    } catch {}
                                }
                                return null;
                            }
                        } as any;
                    }
                } catch (e: any) {
                    console.error("[TX] Raw provider fallback failed:", e);
                    console.error("[TX] Error details:", {
                        message: e?.message,
                        code: e?.code,
                        reason: e?.reason,
                        data: e?.data,
                        shortMessage: e?.shortMessage,
                        cause: e?.cause,
                        stack: e?.stack?.slice(0, 200)
                    });
                    
                    const msg = e?.shortMessage || e?.reason || e?.message || "Transaction failed";
                    if (msg.includes("rejected") || msg.includes("denied") || msg.includes("canceled") || e?.code === 4001 || e?.code === "ACTION_REJECTED") {
                        setMintStatus("Transaction canceled");
                    } else if (msg.includes("insufficient") || msg.includes("gas")) {
                        setMintStatus("Insufficient balance or gas");
                    } else if (msg.includes("nonce")) {
                        setMintStatus("Nonce error - try refreshing page");
                    } else {
                        // For minified errors, show a more helpful message
                        setMintStatus(msg.length < 30 ? "Transaction failed - check console" : msg.slice(0, 60));
                    }
                    return null;
                }
            }
        }
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
            // V14 ItemShop ABI
            const itemShopAbi = [
                "function inventory(address user, uint256 itemId) view returns (uint256)",
                "function getUserFullInventory(address) view returns (uint256[])",
                "function getRemainingSupply(uint256 itemId) view returns (uint256)",
                "function itemConfigs(uint256) view returns (string name, uint256 fcweedPrice, uint256 dustPrice, uint256 boostBps, uint256 duration, uint256 dailySupply, bool isWeapon, bool isConsumable, bool active)",
                "function hasActiveShield(address) view returns (bool active, uint256 expiresAt)",
                "function getActiveBoosts(address) view returns (uint256 ak47Boost, uint256 ak47Expires, uint256 rpgBoost, uint256 rpgExpires, uint256 attackBoost, uint256 attackBoostExpires, bool nukeActive, uint256 nukeExpires, uint256 shieldExpires)",
            ];
            const itemShop = new ethers.Contract(V5_ITEMSHOP_ADDRESS, itemShopAbi, readProvider);
            
            // V14 uses getUserFullInventory which returns uint256[] array
            let inv = { ak47: 0, rpg: 0, nuke: 0, healthPack: 0, shield: 0, attackBoost: 0 };
            let boosts = { ak47Expires: 0, rpgExpires: 0, attackBoostExpires: 0, nukeExpires: 0, shieldExpires: 0 };
            
            try {
                const invResult = await itemShop.getUserFullInventory(userAddress);
                // V14 returns array: [ak47, rpg, nuke, healthPack, shield, attackBoost]
                inv = {
                    ak47: Number(invResult[0]),
                    rpg: Number(invResult[1]),
                    nuke: Number(invResult[2]),
                    healthPack: Number(invResult[3]),
                    shield: Number(invResult[4]),
                    attackBoost: Number(invResult[5]),
                };
                console.log("[Inventory] V14 fetched:", inv);
            } catch (e) {
                console.log("[Inventory] getUserFullInventory failed, trying individual calls:", e);
                // Fallback to individual inventory calls
                for (let i = 1; i <= 6; i++) {
                    try {
                        const count = await itemShop.inventory(userAddress, i);
                        const num = Number(count);
                        if (i === 1) inv.ak47 = num;
                        if (i === 2) inv.rpg = num;
                        if (i === 3) inv.nuke = num;
                        if (i === 4) inv.healthPack = num;
                        if (i === 5) inv.shield = num;
                        if (i === 6) inv.attackBoost = num;
                    } catch {}
                }
            }

            try {
                // V14 getActiveBoosts returns 9 values (not 11)
                const boostResult = await itemShop.getActiveBoosts(userAddress);
                boosts = {
                    ak47Expires: Number(boostResult[1]),      // ak47Expires
                    rpgExpires: Number(boostResult[3]),       // rpgExpires  
                    attackBoostExpires: Number(boostResult[5]), // attackBoostExpires
                    nukeExpires: Number(boostResult[7]),      // nukeExpires
                    shieldExpires: Number(boostResult[8]),    // shieldExpires
                };
            } catch (e) { console.log("[Inventory] getActiveBoosts failed:", e); }

            // V11 item IDs: 1=AK47, 2=RPG, 3=Nuke, 4=HealthPack, 5=Shield, 6=AttackBoost
            setInventoryAK47(inv.ak47);
            setInventoryRPG(inv.rpg);
            setInventoryNuke(inv.nuke);
            setInventoryHealthPacks(inv.healthPack);
            setInventoryShields(inv.shield);
            setInventoryBoosts(inv.attackBoost);
            setAk47Expiry(boosts.ak47Expires);
            setRpgExpiry(boosts.rpgExpires);
            setBoostExpiry(boosts.attackBoostExpires);
            setNukeExpiry(boosts.nukeExpires);
            setShieldExpiry(boosts.shieldExpires);

            // Get daily supply for each item - V14 uses getRemainingSupply + itemConfigs
            const supplyData: Record<number, {remaining: number, total: number}> = {};
            const itemIds = [1, 2, 3, 4, 5, 6];
            for (const id of itemIds) {
                try {
                    const remaining = await itemShop.getRemainingSupply(id);
                    const config = await itemShop.itemConfigs(id);
                    const remainingNum = Number(remaining) > 1000000 ? 999 : Number(remaining);
                    const totalNum = Number(config.dailySupply) > 1000000 ? 999 : Number(config.dailySupply);
                    supplyData[id] = { remaining: remainingNum, total: totalNum };
                } catch { supplyData[id] = { remaining: 999, total: 999 }; }
            }
            setShopSupply(supplyData);
        } catch (e) {
            console.error("Failed to fetch inventory:", e);
        }
    }

    async function refreshShopSupply() {
        if (!readProvider) return;
        try {
            // V14 ItemShop ABI
            const itemShopAbi = [
                "function getRemainingSupply(uint256 itemId) view returns (uint256)",
                "function itemConfigs(uint256) view returns (string name, uint256 fcweedPrice, uint256 dustPrice, uint256 boostBps, uint256 duration, uint256 dailySupply, bool isWeapon, bool isConsumable, bool active)",
                "function getCurrentDay() view returns (uint256)",
            ];
            const itemShop = new ethers.Contract(V5_ITEMSHOP_ADDRESS, itemShopAbi, readProvider);
            const supplyData: Record<number, {remaining: number, total: number}> = {};
            const itemIds = [1, 2, 3, 4, 5, 6];
            
            // V14 uses getCurrentDay instead of getTimeUntilReset
            try {
                const currentDay = await itemShop.getCurrentDay();
                console.log(`[Shop] Current day (UTC): ${currentDay.toString()}`);
            } catch (e) {
                console.log("[Shop] Could not get current day");
            }
            
            // Fetch all in parallel for speed
            const promises = itemIds.map(async (id) => {
                try {
                    const remaining = await itemShop.getRemainingSupply(id);
                    const config = await itemShop.itemConfigs(id);
                    const remainingNum = Number(remaining) > 1000000 ? 999 : Number(remaining);
                    const totalNum = Number(config.dailySupply);
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
            const iface = new ethers.utils.Interface(["function activateShield() external"]);
            const data = iface.encodeFunctionData("activateShield", []);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x7A120"); // 500k gas
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
            const iface = new ethers.utils.Interface(["function activateAttackBoost() external"]);
            const data = iface.encodeFunctionData("activateAttackBoost", []);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x7A120"); // 500k gas
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
            // V14 uses activateWeapon(itemId) instead of activateAK47()
            const iface = new ethers.utils.Interface(["function activateWeapon(uint256 itemId) external"]);
            const data = iface.encodeFunctionData("activateWeapon", [1]); // 1 = AK47_ID
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x7A120"); // 500k gas
            if (tx) {
                await tx.wait();
                setInventoryStatus("AK-47 activated! +100% combat power for 12h");
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
            // V14 uses activateWeapon(itemId) instead of activateRPG()
            const iface = new ethers.utils.Interface(["function activateWeapon(uint256 itemId) external"]);
            const data = iface.encodeFunctionData("activateWeapon", [2]); // 2 = RPG_ID
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x7A120"); // 500k gas
            if (tx) {
                await tx.wait();
                setInventoryStatus("RPG activated! +500% combat power for 6h");
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
            // V14 uses activateWeapon(itemId) instead of activateNuke()
            const iface = new ethers.utils.Interface(["function activateWeapon(uint256 itemId) external"]);
            const data = iface.encodeFunctionData("activateWeapon", [3]); // 3 = NUKE_ID
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x7A120"); // 500k gas
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
            // Gas scales with number of plants - 200k base + 100k per plant
            const gasLimit = 200000 + (selectedPlantsForHealthPack.length * 100000);
            const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x" + gasLimit.toString(16));
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
            // V14 ItemShop uses buyItem(itemId, payWithDust)
            const itemShopAbi = [
                "function buyItem(uint256 itemId, bool payWithDust) external",
                "function itemConfigs(uint256) view returns (string name, uint256 fcweedPrice, uint256 dustPrice, uint256 boostBps, uint256 duration, uint256 dailySupply, bool isWeapon, bool isConsumable, bool active)",
                "function shopEnabled() view returns (bool)",
            ];
            const itemShopInterface = new ethers.utils.Interface(itemShopAbi);
            const itemShop = new ethers.Contract(V5_ITEMSHOP_ADDRESS, itemShopAbi, readProvider);
            
            const item = await itemShop.itemConfigs(itemId);
            
            if (currency === "fcweed") {
                const fcweedPrice = item.fcweedPrice;
                if (fcweedPrice.eq(0)) {
                    setShopStatus("This item cannot be purchased with FCWEED");
                    setShopLoading(false);
                    return;
                }
                setShopStatus("Checking allowance...");
                const approved = await ensureFcweedAllowance(V5_ITEMSHOP_ADDRESS, fcweedPrice);
                if (!approved) {
                    setShopStatus("Approval canceled or failed");
                    setShopLoading(false);
                    return;
                }
                
                setShopStatus("Confirming purchase...");
                // V14: buyItem(itemId, false) for FCWEED payment
                const data = itemShopInterface.encodeFunctionData("buyItem", [itemId, false]);
                const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x1E8480"); // 2M gas
                if (!tx) {
                    setShopStatus("Transaction canceled");
                    setShopLoading(false);
                    return;
                }
                await tx.wait();
            } else {
                const dustPrice = item.dustPrice;
                if (dustPrice.eq(0)) {
                    setShopStatus("This item cannot be purchased with Dust");
                    setShopLoading(false);
                    return;
                }
                setShopStatus("Checking dust balance...");
                try {
                    const crateVaultAbi = [
                        "function getUserStats(address user) external view returns (uint256 dustBalance, uint256 cratesOpened, uint256 fcweedWon, uint256 usdcWon, uint256 nftsWon, uint256 totalSpent)"
                    ];
                    const crateVault = new ethers.Contract(CRATE_VAULT_ADDRESS, crateVaultAbi, readProvider);
                    const stats = await crateVault.getUserStats(userAddress);
                    const dustBalanceRaw = stats.dustBalance ?? stats[0];
                    
                    // CrateVault stores dust as raw integers (500 = 500 dust)
                    // ItemShop stores dustPrice in 18 decimals (200 dust = 200e18)
                    // Scale dustBalance to 18 decimals for comparison
                    const dustBalanceScaled = ethers.BigNumber.from(dustBalanceRaw).mul(ethers.BigNumber.from(10).pow(18));
                    
                    console.log("[Shop] Dust check - price:", dustPrice.toString(), "balance raw:", dustBalanceRaw.toString(), "balance scaled:", dustBalanceScaled.toString());
                    
                    if (dustBalanceScaled.lt(dustPrice)) {
                        const needed = parseFloat(ethers.utils.formatUnits(dustPrice, 18));
                        const have = typeof dustBalanceRaw === 'number' ? dustBalanceRaw : dustBalanceRaw.toNumber();
                        setShopStatus(`Insufficient Dust! Need ${needed.toLocaleString()}, have ${have.toLocaleString()}. Open crates to earn Dust.`);
                        setShopLoading(false);
                        return;
                    }
                } catch (e) {
                    console.error("[Shop] Dust balance check failed:", e);
                }
                
                setShopStatus("Confirming purchase...");
                // V14: buyItem(itemId, true) for Dust payment
                const data = itemShopInterface.encodeFunctionData("buyItem", [itemId, true]);
                const tx = await sendContractTx(V5_ITEMSHOP_ADDRESS, data, "0x1E8480"); // 2M gas
                if (!tx) {
                    setShopStatus("Transaction canceled");
                    setShopLoading(false);
                    return;
                }
                await tx.wait();
            }
            
            setShopStatus("✅ Purchase successful!");
            fetchInventory();
            refreshAllData();
            setTimeout(() => setShopStatus(""), 3000);
        } catch (e: any) {
            const reason = e?.reason || e?.shortMessage || e?.message || "Purchase failed";
            console.error("[Shop] Purchase error:", reason);
            if (reason.includes("!water") || reason.includes("Insufficient") || reason.includes("Transfer failed")) {
                setShopStatus("Insufficient balance!");
            } else if (reason.includes("exhausted") || reason.includes("Sold out")) {
                setShopStatus("Item sold out for today!");
            } else if (reason.includes("disabled") || reason.includes("closed") || reason.includes("Shop disabled")) {
                setShopStatus("Shop is currently disabled");
            } else if (reason.includes("not available") || reason.includes("Not available")) {
                setShopStatus("This payment method not available for this item");
            } else if (reason.includes("rejected") || reason.includes("denied") || reason.includes("canceled") || e?.code === 4001) {
                setShopStatus("Transaction canceled");
            } else {
                setShopStatus(reason.slice(0, 100));
            }
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
                        
                        // Check if we're actually in Farcaster context
                        let inFarcasterContext = false;
                        try {
                            const context = await sdk.context;
                            if (context) {
                                inFarcasterContext = true;
                            }
                        } catch {}
                        
                        // Auto-connect only in Farcaster context or on actual mobile apps
                        // Don't auto-connect on desktop web browsers
                        const shouldAutoConnect = inFarcasterContext || (isMiniApp && isMobile) || isBaseApp;
                        
                        console.log("[Init] Environment check:", { isMiniApp, isBaseApp, isMobile, inFarcasterContext, shouldAutoConnect });
                        
                        if (shouldAutoConnect && !userAddress)
                        {
                            console.log("[Init] Auto-connecting wallet...");
                            t = setTimeout(() =>
                                {
                                    void ensureWallet().catch((err) =>
                                        {
                                            console.warn("[Init] Auto-connect failed:", err);
                                            setConnecting(false); // Reset on failure
                                        }).finally(() => {
                                            // Safety: ensure connecting is reset after attempt
                                            setTimeout(() => setConnecting(false), 5000);
                                        });
                                }, 200); // Fast connect for mobile
                        }
                    }
                    catch (err)
                    {
                        console.warn("[Init] Initialization failed:", err);
                        setConnecting(false);
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

    // Disconnect modal state
    const [showDisconnectModal, setShowDisconnectModal] = useState(false);
    
    // Wallet state
    const userDisconnected = useRef(false); // Flag to prevent auto-reconnect after explicit disconnect

    // Resolve username and avatar from Basenames, ENS, or Farcaster
    async function resolveUserProfile(address: string): Promise<{ name: string | null; avatar: string | null }> {
        let name: string | null = null;
        let avatar: string | null = null;
        
        try {
            // Try Farcaster context FIRST if we're in Farcaster
            try {
                const context = await sdk.context;
                if (context?.user) {
                    console.log("[Profile] Got Farcaster context user:", context.user.username);
                    if (context.user.username) {
                        name = context.user.username;
                    }
                    if (context.user.pfpUrl) {
                        avatar = context.user.pfpUrl;
                    }
                    // If we got both from Farcaster context, return early
                    if (name && avatar) {
                        console.log("[Profile] Using Farcaster profile:", name, avatar);
                        return { name, avatar };
                    }
                }
            } catch {}

            // Try Basenames (Base's native naming service)
            if (!name) {
                const basenameResponse = await fetch(
                    `https://api.basename.app/v1/address/${address}/basename`
                ).catch(() => null);
                
                if (basenameResponse?.ok) {
                    const data = await basenameResponse.json();
                    if (data?.basename) {
                        name = data.basename;
                        if (data?.avatar) {
                            avatar = data.avatar;
                        }
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
        const address = userAddress || wagmiAddress;
        console.log("[Profile] Address changed, fetching profile for:", address, "usingMiniApp:", usingMiniApp);
        
        if (!address) {
            setDisplayName(null);
            setUserAvatar(null);
            return;
        }
        
        resolveUserProfile(address).then(({ name, avatar }) => {
            console.log("[Profile] Resolved:", { name, avatar });
            setDisplayName(name);
            setUserAvatar(avatar);
        });
    }, [userAddress, wagmiAddress, usingMiniApp]);
    
    // Disconnect wallet function
    const disconnectWallet = () => {
        userDisconnected.current = true;
        wagmiDisconnect();
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
        if (!connected && !userAddress && !wagmiConnected) return "Connect";
        if (displayName) return displayName;
        if (userAddress) return shortAddr(userAddress);
        if (wagmiAddress) return shortAddr(wagmiAddress);
        return "Connect";
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
        // Check if already connected via wagmi/RainbowKit
        if (wagmiConnected && wagmiAddress && !forceSelection) {
            const anyWindow = window as any;
            if (anyWindow.ethereum) {
                const ethersProvider = new ethers.providers.Web3Provider(anyWindow.ethereum, "any");
                // Pass address explicitly to getSigner() - fixes Phantom/Base App wallet compatibility
                return { signer: ethersProvider.getSigner(wagmiAddress), provider: ethersProvider, userAddress: wagmiAddress, isMini: false };
            }
        }

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

            // Check if we're in Farcaster context
            let inFarcasterContext = false;
            try {
                const context = await sdk.context;
                if (context) {
                    inFarcasterContext = true;
                    console.log("[Wallet] In Farcaster context, will use SDK wallet only");
                }
            } catch {}

            // Try Farcaster SDK first (for Warpcast users)
            if (inFarcasterContext || detectedMiniApp) {
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
                        if (ethProv) {
                            console.log("[Wallet] Got provider via Farcaster SDK");
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
                        if ((sdk.wallet as any).ethProvider) {
                            ethProv = (sdk.wallet as any).ethProvider;
                            console.log("[Wallet] Got provider via ethProvider property");
                            isMini = true;
                        }
                    }
                } catch (err) {
                    console.warn("[Wallet] Farcaster SDK wallet failed:", err);
                }
                
                // If in Farcaster context but SDK failed, don't fall back to window.ethereum
                if (!ethProv && inFarcasterContext) {
                    console.log("[Wallet] In Farcaster but SDK wallet failed, not falling back to extensions");
                    setMintStatus("Please enable wallet in Farcaster settings");
                    setConnecting(false);
                    return null;
                }
            }

            // Only check window.ethereum if NOT in Farcaster context
            if (!ethProv && !inFarcasterContext) {
                const anyWindow = window as any;
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
                    isMini = false;
                } else if (anyWindow.coinbaseWalletExtension) {
                    ethProv = anyWindow.coinbaseWalletExtension;
                    console.log("[Wallet] Got provider via coinbaseWalletExtension");
                    isMini = false;
                }
            }


            if (ethProv) {
                setUsingMiniApp(isMini);
                setMiniAppEthProvider(ethProv);

                try {
                    console.log("[Wallet] Requesting accounts...");
                    const accounts = await ethProv.request({ method: "eth_requestAccounts" });
                    console.log("[Wallet] Got accounts:", accounts);
                } catch (err: any) {
                    console.warn("[Wallet] eth_requestAccounts failed:", err);
                    if (err?.code === 4001) {
                        throw new Error("Wallet connection rejected. Please approve the connection request.");
                    }
                }

                p = new ethers.providers.Web3Provider(ethProv as any, "any");
                
                // Get address FIRST from provider - this works with all wallets
                try {
                    const accounts = await ethProv.request({ method: "eth_accounts" });
                    if (accounts && accounts.length > 0) {
                        addr = accounts[0];
                        console.log("[Wallet] Got address from eth_accounts:", addr);
                    } else {
                        throw new Error("No accounts available");
                    }
                } catch (accErr) {
                    console.warn("[Wallet] eth_accounts failed, trying getSigner fallback:", accErr);
                    // Fallback for legacy providers
                    try {
                        const tempSigner = p.getSigner();
                        addr = await tempSigner.getAddress();
                        console.log("[Wallet] Got address from getSigner fallback:", addr);
                    } catch (signerErr) {
                        throw new Error("Could not get wallet address. Please make sure you have a wallet connected.");
                    }
                }

                // Get signer with EXPLICIT address - this fixes Phantom/Base App/Rabby compatibility
                // The key fix: passing the address to getSigner() ensures it works with wallets
                // that don't support the default getSigner() behavior
                s = p.getSigner(addr);
                console.log("[Wallet] Created signer for address:", addr, "isMini:", isMini);
            } else {
                // No provider found - use RainbowKit modal as fallback for web users
                setUsingMiniApp(false);
                
                if (openConnectModal) {
                    console.log("[Wallet] No provider found, opening RainbowKit modal...");
                    setConnecting(false);
                    openConnectModal();
                    return null; // RainbowKit will handle connection, useEffect will sync state
                }

                const errorMsg = isMobile
                    ? "No wallet found. Please install Coinbase Wallet or MetaMask."
                    : "No wallet found. Please install MetaMask or another Web3 wallet.";
                setMintStatus(errorMsg);
                setConnecting(false);
                return null;
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
                        // Pass address explicitly after chain switch
                        s = p.getSigner(addr);
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
                                // Pass address explicitly after adding chain
                                s = p.getSigner(addr);
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
            // Use direct USDC allowance for MiniApp support
            const okAllowance = await ensureUsdcAllowanceDirect(LAND_ADDRESS, LAND_PRICE_USDC);
            if (!okAllowance) {
                setMintStatus("USDC approval failed or was rejected");
                return;
            }

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
            
            // Use local sendContractTx for MiniApp support
            const tx = await sendContractTx(LAND_ADDRESS, data, "0x7A120"); // 500k gas
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
            // Use direct USDC allowance for MiniApp support
            const okAllowance = await ensureUsdcAllowanceDirect(PLANT_ADDRESS, PLANT_PRICE_USDC);
            if (!okAllowance) {
                setMintStatus("USDC approval failed or was rejected");
                return;
            }

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
            
            // Use local sendContractTx for MiniApp support
            const tx = await sendContractTx(PLANT_ADDRESS, data, "0x7A120"); // 500k gas
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
            setActionLoading(true);
            setV4ActionStatus("Watering plants...");
            
            // Get user's water balance
            const userWaterBalance = v4StakingStats?.water 
                ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v4StakingStats.water.toString()), 18))
                : 0;
            
            // Calculate total water needed for selected plants
            const totalWaterNeeded = selectedV4PlantsToWater.reduce((sum, id) => {
                return sum + (v4WaterNeeded[id] || 0);
            }, 0);
            
            console.log("[V4 Water] Total needed:", totalWaterNeeded, "User balance:", userWaterBalance);
            
            // VALIDATION: User must have enough water
            if (userWaterBalance < totalWaterNeeded) {
                setV4ActionStatus(`Not enough water! Have ${userWaterBalance.toFixed(2)}L, need ${totalWaterNeeded.toFixed(2)}L`);
                setActionLoading(false);
                return;
            }
            
            // Create interface for water functions - V4 contract only has waterPlant and waterPlants
            const waterInterface = new ethers.utils.Interface([
                "function waterPlant(uint256 id)",
                "function waterPlants(uint256[] calldata ids)"
            ]);
            
            let tx;
            
            if (selectedV4PlantsToWater.length === 1) {
                // Single plant - use waterPlant
                const plantId = selectedV4PlantsToWater[0];
                tx = await txAction().sendContractTx(
                    V4_STAKING_ADDRESS, 
                    waterInterface.encodeFunctionData("waterPlant", [plantId])
                );
            } else {
                // Multiple plants - use waterPlants
                tx = await txAction().sendContractTx(
                    V4_STAKING_ADDRESS, 
                    waterInterface.encodeFunctionData("waterPlants", [selectedV4PlantsToWater])
                );
            }
            
            if (!tx) throw new Error("Transaction rejected");
            await waitForTx(tx);
            setV4ActionStatus("Plants watered!");
            setSelectedV4PlantsToWater([]);
            setV4CustomWaterAmounts({});
            setTimeout(() => { refreshV4StakingRef.current = false; refreshV4Staking(); setV4ActionStatus(""); }, 2000);
            
        } catch (err: any) {
            const msg = err.message || String(err);
            if (msg.includes("!water") || msg.includes("Not enough water")) {
                setV4ActionStatus("Error: Not enough water! Buy more from the shop.");
            } else if (msg.includes("rejected") || msg.includes("canceled")) {
                setV4ActionStatus("Transaction canceled");
            } else {
                setV4ActionStatus("Error: " + msg.slice(0, 60));
            }
        } finally {
            setActionLoading(false);
        }
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

            // Fetch combat power from Battles contract (includes ItemShop boosts)
            try {
                const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, [
                    "function getPower(address) view returns (uint256 base, uint256 atk, uint256 def)",
                    "function canCartel(address) view returns (bool)",
                    "function lastCartel(address) view returns (uint256)"
                ], readProvider);
                const itemShopContract = new ethers.Contract(V5_ITEMSHOP_ADDRESS, [
                    "function canBypassShield(address) view returns (bool)"
                ], readProvider);
                
                const [powerResult, hasNuke] = await Promise.all([
                    battlesContract.getPower(userAddress),
                    itemShopContract.canBypassShield(userAddress).catch(() => false)
                ]);
                
                let atkPower = powerResult[1].toNumber();
                const defPower = powerResult[2].toNumber();
                if (hasNuke) {
                    atkPower = Math.floor(atkPower * 101);
                }
                setContractCombatPower(atkPower);
                setContractDefensePower(defPower);
                console.log("[V5] Contract combat power:", atkPower, "defense:", defPower, "hasNuke:", hasNuke);

                // Fetch Cartel Wars cooldown on page load
                try {
                    const canAttack = await battlesContract.canCartel(userAddress);
                    if (!canAttack) {
                        const lastAttackTime = await battlesContract.lastCartel(userAddress);
                        const cooldownEnd = lastAttackTime.toNumber() + 21600;
                        const now = Math.floor(Date.now() / 1000);
                        const remaining = cooldownEnd > now ? cooldownEnd - now : 0;
                        setWarsCooldown(remaining);
                    } else {
                        setWarsCooldown(0);
                    }
                } catch (e) {
                    console.error("[V5] Failed to get wars cooldown:", e);
                }
            } catch (e) {
                console.error("[V5] Failed to get combat power:", e);
            }

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

    async function handleV5StakePlants(ids?: number[]) {
        const plantIds = ids ?? selectedV5AvailPlants;
        if (plantIds.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Approving...");
            const ctx = await ensureWallet();
            if (!ctx) { setV5ActionStatus("Wallet not connected"); setActionLoading(false); return; }
            await ensureCollectionApproval(PLANT_ADDRESS, V5_STAKING_ADDRESS, ctx);
            
            const data = v4StakingInterface.encodeFunctionData("stakePlants", [plantIds]);
            
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
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); setTimeout(() => setV5ActionStatus(""), 3000); }
        finally { setActionLoading(false); }
    }

    async function handleV5StakeLands(ids?: number[]) {
        const landIds = ids ?? selectedV5AvailLands;
        if (landIds.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Approving...");
            const ctx = await ensureWallet();
            if (!ctx) { setV5ActionStatus("Wallet not connected"); setActionLoading(false); return; }
            await ensureCollectionApproval(LAND_ADDRESS, V5_STAKING_ADDRESS, ctx);
            
            const data = v4StakingInterface.encodeFunctionData("stakeLands", [landIds]);
            
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
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); setTimeout(() => setV5ActionStatus(""), 3000); }
        finally { setActionLoading(false); }
    }

    async function handleV5StakeSuperLands(ids?: number[]) {
        const superLandIds = ids ?? selectedV5AvailSuperLands;
        if (superLandIds.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Approving...");
            const ctx = await ensureWallet();
            if (!ctx) { setV5ActionStatus("Wallet not connected"); setActionLoading(false); return; }
            await ensureCollectionApproval(SUPER_LAND_ADDRESS, V5_STAKING_ADDRESS, ctx);
            
            const data = v4StakingInterface.encodeFunctionData("stakeSuperLands", [superLandIds]);
            
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
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); setTimeout(() => setV5ActionStatus(""), 3000); }
        finally { setActionLoading(false); }
    }

    async function handleV5UnstakePlants(ids?: number[]) {
        const plantIds = ids ?? selectedV5StakedPlants;
        if (plantIds.length === 0) return;
        const unhealthy = plantIds.filter(id => (v5PlantHealths[id] ?? 0) < 100);
        if (unhealthy.length > 0) {
            setV5ActionStatus(`Water plants first! ${unhealthy.map(id => `#${id}: ${v5PlantHealths[id] ?? 0}%`).join(", ")}`);
            setTimeout(() => setV5ActionStatus(""), 3000);
            return;
        }
        try {
            setActionLoading(true); setV5ActionStatus("Unstaking plants...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakePlants", [plantIds]));
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
            setTimeout(() => setV5ActionStatus(""), 3000);
        }
        finally { setActionLoading(false); }
    }

    async function handleV5UnstakeLands(ids?: number[]) {
        const landIds = ids ?? selectedV5StakedLands;
        if (landIds.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Unstaking lands...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakeLands", [landIds]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Unstaked!");
            setSelectedV5StakedLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); setTimeout(() => setV5ActionStatus(""), 3000); }
        finally { setActionLoading(false); }
    }

    async function handleV5UnstakeSuperLands(ids?: number[]) {
        const superLandIds = ids ?? selectedV5StakedSuperLands;
        if (superLandIds.length === 0) return;
        try {
            setActionLoading(true); setV5ActionStatus("Unstaking super lands...");
            const tx = await txAction().sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("unstakeSuperLands", [superLandIds]));
            if (!tx) throw new Error("Tx rejected");
            await waitForTx(tx);
            setV5ActionStatus("Unstaked!");
            setSelectedV5StakedSuperLands([]);
            ownedCacheRef.current = { addr: null, state: null };
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
        } catch (err: any) { setV5ActionStatus("Error: " + (err.message || err)); setTimeout(() => setV5ActionStatus(""), 3000); }
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

    async function handleV5WaterPlants(plantIds?: number[], waterAmounts?: Record<number, number>) {
        // Use passed IDs/amounts OR fall back to state (for backward compatibility)
        const idsToWater = plantIds ?? selectedV5PlantsToWater;
        const amountsToUse = waterAmounts ?? v5CustomWaterAmounts;
        
        if (idsToWater.length === 0) return;
        
        try {
            setActionLoading(true);
            setV5ActionStatus("Checking plants...");
            
            // Get user's water balance
            const userWaterBalance = v5StakingStats?.water 
                ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v5StakingStats.water.toString()), 18))
                : 0;
            
            // Filter out plants that don't actually need water
            const plantsNeedingWater = idsToWater.filter(id => {
                const needed = v5WaterNeeded[id] ?? 0;
                const health = v5PlantHealths[id] ?? 100;
                return needed > 0 && health < 100;
            });
            
            if (plantsNeedingWater.length === 0) {
                setV5ActionStatus("All selected plants are already at 100% health!");
                setSelectedV5PlantsToWater([]);
                setV5CustomWaterAmounts({});
                setActionLoading(false);
                return;
            }
            
            // Log if some plants were skipped
            if (plantsNeedingWater.length < idsToWater.length) {
                const skipped = idsToWater.length - plantsNeedingWater.length;
                console.log(`[Water] Skipping ${skipped} plants that are already full`);
            }
            
            // Calculate total water to use from the passed amounts
            const totalWaterToUse = plantsNeedingWater.reduce((sum, id) => {
                return sum + (amountsToUse[id] || 0);
            }, 0);
            
            console.log("[Water] Plants needing water:", plantsNeedingWater);
            console.log("[Water] Amounts from UI:", amountsToUse);
            console.log("[Water] Total to use:", totalWaterToUse, "User balance:", userWaterBalance);
            
            // VALIDATION: User must have enough water
            if (userWaterBalance < totalWaterToUse - 0.001) {
                setV5ActionStatus(`Not enough water! Have ${userWaterBalance.toFixed(2)}L, need ${totalWaterToUse.toFixed(2)}L`);
                setActionLoading(false);
                return;
            }
            
            if (totalWaterToUse <= 0) {
                setV5ActionStatus("No water amount selected!");
                setActionLoading(false);
                return;
            }
            
            // Create interface for water functions
            const waterInterface = new ethers.utils.Interface([
                "function waterPlants(uint256[] calldata ids)",
                "function waterPlantWithAmount(uint256 id, uint256 amount)",
                "function waterPlantsWithBalance(uint256[] calldata ids)"
            ]);
            
            // Double-check water balance from contract RIGHT NOW (not cached stats)
            let actualOnChainBalance = userWaterBalance;
            try {
                const v5Contract = new ethers.Contract(V5_STAKING_ADDRESS, V4_STAKING_ABI, readProvider);
                const userData = await v5Contract.users(userAddress);
                actualOnChainBalance = parseFloat(ethers.utils.formatUnits(userData.waterBalance, 18));
                
                console.log("[Water] ========== BALANCE CHECK ==========");
                console.log("[Water] Cached balance (from stats):", userWaterBalance, "L");
                console.log("[Water] Fresh on-chain balance:", actualOnChainBalance, "L");
                console.log("[Water] Total water to use:", totalWaterToUse, "L");
                console.log("[Water] Raw on-chain wei:", userData.waterBalance.toString());
                console.log("[Water] =====================================");
                
                // CRITICAL: If on-chain balance is less than what user wants to use, STOP
                if (actualOnChainBalance < 0.01) {
                    setV5ActionStatus(`No water! Balance: ${actualOnChainBalance.toFixed(4)}L. Buy more water first.`);
                    setTimeout(() => setV5ActionStatus(""), 3000);
                    setActionLoading(false);
                    // Refresh stats to update UI with real value
                    refreshV5StakingRef.current = false;
                    refreshV5Staking();
                    return;
                }
                
                if (actualOnChainBalance < totalWaterToUse - 0.001) {
                    setV5ActionStatus(`Not enough water! Have ${actualOnChainBalance.toFixed(2)}L, need ${totalWaterToUse.toFixed(2)}L`);
                    setTimeout(() => setV5ActionStatus(""), 3000);
                    setActionLoading(false);
                    // Refresh stats to update UI
                    refreshV5StakingRef.current = false;
                    refreshV5Staking();
                    return;
                }
            } catch (e) {
                console.warn("[Water] Could not verify on-chain balance:", e);
                // If we can't check, be cautious
                setV5ActionStatus("Could not verify water balance. Please try again.");
                setTimeout(() => setV5ActionStatus(""), 3000);
                setActionLoading(false);
                return;
            }
            
            let tx;
            setV5ActionStatus("Watering plants...");
            
            // Check if ALL plants are being watered to full (100% health)
            // This is what "Select All Thirsty" does - we can use batch waterPlants() for this
            const allWateringToFull = plantsNeedingWater.every(pid => {
                const actualNeeded = v5WaterNeeded[pid] ?? 0;
                const amountFromUI = amountsToUse[pid] ?? 0;
                // Consider "full" if amount >= needed (with small epsilon for float comparison)
                return amountFromUI >= actualNeeded - 0.001;
            });
            
            console.log("[Water] All watering to full?", allWateringToFull, "Plants:", plantsNeedingWater.length);
            
            if (plantsNeedingWater.length === 1) {
                // Single plant - use waterPlantWithAmount for precise control
                const plantId = plantsNeedingWater[0];
                const actualNeeded = v5WaterNeeded[plantId] ?? 0;
                const amountFromUI = amountsToUse[plantId] ?? 0;
                
                // Cap to what's actually needed AND actual on-chain balance
                // Use 99.9% of balance as safety margin for any rounding
                const safeBalance = actualOnChainBalance * 0.999;
                const cappedAmount = Math.min(amountFromUI, actualNeeded, safeBalance);
                
                if (cappedAmount <= 0.001) {
                    setV5ActionStatus("Not enough water or plant is full!");
                    setTimeout(() => setV5ActionStatus(""), 2000);
                    setActionLoading(false);
                    return;
                }
                
                // Proper precision - round DOWN to 6 decimals to avoid exceeding balance
                const roundedAmount = Math.floor(cappedAmount * 1e6) / 1e6;
                const amountWei = ethers.utils.parseUnits(roundedAmount.toFixed(6), 18);
                
                // Detailed debug logging
                console.log("[Water Debug] =================================");
                console.log("[Water Debug] Plant ID:", plantId);
                console.log("[Water Debug] Amount from UI:", amountFromUI, "L");
                console.log("[Water Debug] Actual needed:", actualNeeded, "L");
                console.log("[Water Debug] On-chain balance:", actualOnChainBalance, "L");
                console.log("[Water Debug] Safe balance (99.9%):", safeBalance, "L");
                console.log("[Water Debug] Capped amount:", cappedAmount, "L");
                console.log("[Water Debug] Rounded amount (floor):", roundedAmount, "L");
                console.log("[Water Debug] Amount in wei:", amountWei.toString());
                console.log("[Water Debug] =================================");
                
                tx = await txAction().sendContractTx(
                    V5_STAKING_ADDRESS, 
                    waterInterface.encodeFunctionData("waterPlantWithAmount", [plantId, amountWei])
                );
            } else if (allWateringToFull) {
                // BATCH WATER: All plants being watered to 100% - use single waterPlants() call
                // This is the optimal path for "Select All Thirsty" button
                console.log("[Water] Using BATCH waterPlants() for", plantsNeedingWater.length, "plants");
                setV5ActionStatus(`Watering ${plantsNeedingWater.length} plants in one transaction...`);
                
                tx = await txAction().sendContractTx(
                    V5_STAKING_ADDRESS, 
                    waterInterface.encodeFunctionData("waterPlants", [plantsNeedingWater])
                );
            } else {
                // PARTIAL WATER: Multiple plants with custom amounts - must water individually
                // This happens when user manually adjusts water amounts below max
                setV5ActionStatus(`Watering ${plantsNeedingWater.length} plants...`);
                
                // Track remaining balance as we water each plant
                let remainingBalance = actualOnChainBalance;
                
                for (let i = 0; i < plantsNeedingWater.length; i++) {
                    const pid = plantsNeedingWater[i];
                    const actualNeeded = v5WaterNeeded[pid] ?? 0;
                    
                    if (actualNeeded <= 0) {
                        console.log(`[Water] Skipping plant ${pid} - already full`);
                        continue;
                    }
                    
                    const amountFromUI = amountsToUse[pid] ?? 0;
                    // Use 99.9% of remaining balance as safety
                    const safeRemaining = remainingBalance * 0.999;
                    const cappedAmount = Math.min(amountFromUI, actualNeeded, safeRemaining);
                    
                    if (cappedAmount <= 0.001) {
                        console.log(`[Water] Skipping plant ${pid} - no water amount or balance`);
                        continue;
                    }
                    
                    // Round DOWN to avoid exceeding balance
                    const roundedAmount = Math.floor(cappedAmount * 1e6) / 1e6;
                    const amountWei = ethers.utils.parseUnits(roundedAmount.toFixed(6), 18);
                    
                    console.log(`[Water] Plant ${i+1}/${plantsNeedingWater.length}:`, pid, "amount:", roundedAmount, "L, remaining:", remainingBalance, "L");
                    setV5ActionStatus(`Watering plant ${i+1}/${plantsNeedingWater.length}...`);
                    
                    tx = await txAction().sendContractTx(
                        V5_STAKING_ADDRESS, 
                        waterInterface.encodeFunctionData("waterPlantWithAmount", [pid, amountWei])
                    );
                    
                    if (!tx) throw new Error("Transaction rejected");
                    await waitForTx(tx);
                    
                    // Deduct from remaining balance
                    remainingBalance -= roundedAmount;
                }
                
                setV5ActionStatus("All plants watered!");
                setSelectedV5PlantsToWater([]);
                setV5CustomWaterAmounts({});
                setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
                setActionLoading(false);
                return;
            }
            
            if (!tx) throw new Error("Transaction rejected");
            await waitForTx(tx);
            setV5ActionStatus("Plants watered!");
            setSelectedV5PlantsToWater([]);
            setV5CustomWaterAmounts({});
            setTimeout(() => { refreshV5StakingRef.current = false; refreshV5Staking(); setV5ActionStatus(""); }, 2000);
            
        } catch (err: any) {
            const msg = err.message || String(err);
            console.error("[Water] Error:", msg);
            
            if (msg.includes("Already Full") || msg.includes("full")) {
                setV5ActionStatus("Error: Plant is already at 100% health!");
            } else if (msg.includes("!water") || msg.includes("Not enough water")) {
                setV5ActionStatus("Error: Not enough water! Buy more from the shop.");
            } else if (msg.includes("!yours")) {
                setV5ActionStatus("Error: You don't own this plant!");
            } else if (msg.includes("rejected") || msg.includes("canceled") || msg.includes("denied") || (err as any)?.code === 4001) {
                setV5ActionStatus("Transaction canceled");
            } else if (msg.includes("insufficient funds") || msg.includes("gas")) {
                setV5ActionStatus("Error: Insufficient ETH for gas");
            } else {
                setV5ActionStatus("Error: " + msg.slice(0, 60));
            }
            
            // Auto-clear error status after 2 seconds
            setTimeout(() => setV5ActionStatus(""), 2000);
        } finally {
            setActionLoading(false);
        }
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
                const approveTx = await sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [V5_STAKING_ADDRESS, ethers.constants.MaxUint256]));
                if (!approveTx) throw new Error("Approval rejected");
                await waitForTx(approveTx);
            }
            setWaterStatus("Buying water...");
            const tx = await sendContractTx(V5_STAKING_ADDRESS, v4StakingInterface.encodeFunctionData("buyWater", [waterBuyAmount]), "0x1E8480"); // 2M gas
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

    // HARDCODED to avoid constants.ts issues
    const BACKEND_API_URL = "https://wars.x420ponzi.com";
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
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, V3_BATTLES_ABI, readProvider);
            
            // V3 uses getAtkStats and getDefStats instead of getCartelPlayerStats
            // getAtkStats returns: (wins, losses, stolen, nukes)
            // getDefStats returns: (wins, losses, lost, hasShield)
            const atkStats = await battlesContract.getAtkStats(userAddress);
            const defStats = await battlesContract.getDefStats(userAddress);
            
            setWarsPlayerStats({
                wins: atkStats[0].toNumber(),
                losses: atkStats[1].toNumber(),
                defWins: defStats[0].toNumber(),
                defLosses: defStats[1].toNumber(),
                rewardsStolen: atkStats[2],
                rewardsLost: defStats[2],
                rewardsLostAttacking: ethers.BigNumber.from(0), // Not tracked in V3
                winStreak: 0, // Not tracked in V3
                bestStreak: 0, // Not tracked in V3
                nukesUsed: atkStats[3].toNumber(),
                hasShield: defStats[3],
                // DEA stats - same as attack stats in V3
                deaRaidsWon: 0,
                deaRaidsLost: 0,
                deaRewardsStolen: ethers.BigNumber.from(0),
            });

            const canAttack = await battlesContract.canCartel(userAddress);
            if (!canAttack) {
                try {
                    const lastAttackTime = await battlesContract.lastCartel(userAddress);
                    // V3 uses 6 hour cooldown (21600 seconds)
                    const cooldownEnd = lastAttackTime.toNumber() + 21600;
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

            const fee = await battlesContract.cartelFee();
            const feeFormatted = parseFloat(ethers.utils.formatUnits(fee, 18));
            setWarsSearchFee(feeFormatted >= 1000 ? (feeFormatted / 1000).toFixed(0) + "K" : feeFormatted.toFixed(0));

            // V3 doesn't track active search target on-chain - it's done via backend
            // Clear any stale target state
            setWarsTarget(null);
            setWarsSearchExpiry(0);

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

    async function handleWarsSearch(skip: string[] = []) {
        if (warsTransactionInProgress.current) return;
        await executeWarsSearch(skip);
    }
    
    async function executeWarsSearch(skip: string[] = []) {
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

            // V7 doesn't have on-chain target tracking - go straight to backend search

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
                    body: JSON.stringify({ attacker: ctx.userAddress, skip }),
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

                setWarsPreviewData({ target, nonce, deadline, signature, stats, attacker: ctx.userAddress });
                setWarsTarget(target);
                setWarsTargetRevealed(true);
                setWarsTargetLocked(false);
                
                let pendingBN = ethers.BigNumber.from(0);
                const rawPending = stats?.pendingRewards;
                if (rawPending !== null && rawPending !== undefined && rawPending !== "" && rawPending !== "0") {
                    try {
                        const pendingNum = parseFloat(rawPending.toString());
                        if (!isNaN(pendingNum) && pendingNum > 0) {
                            // Use parseUnits for proper BigNumber conversion
                            pendingBN = ethers.utils.parseUnits(pendingNum.toFixed(2), 18);
                        }
                    } catch (e) {
                        console.log("[Wars] Pending parse error:", e);
                    }
                }
                
                setWarsTargetStats({
                    plants: stats?.plants || 0,
                    avgHealth: stats?.avgHealth || 100,
                    battlePower: stats?.battlePower || 0,
                    pendingRewards: pendingBN,
                    pendingFormatted: stats?.pendingFormatted || "0",
                    hasShield: stats?.hasShield || false,
                });
                
                // Don't show odds before attack
                setWarsOdds(null);
                setWarsStatus("Target found! Attack or skip.");
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

    // Reveal stats - PAY 50K to see target stats (doesn't attack yet)
    async function handleRevealStats() {
        if (warsTransactionInProgress.current || !warsPreviewData) return;
        warsTransactionInProgress.current = true;
        setWarsSearching(true);
        setWarsStatus("Preparing to reveal...");

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            const { target, stats } = warsPreviewData;
            
            // Check and request approval for reveal fee (50K)
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, V3_BATTLES_ABI, readProvider);
            const revealFee = await battlesContract.cartelFee();
            const tokenContract = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            let allowance = await tokenContract.allowance(ctx.userAddress, V5_BATTLES_ADDRESS);

            if (allowance.lt(revealFee)) {
                setWarsStatus("Approving FCWEED (confirm in wallet)...");
                const approveTx = await sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [V5_BATTLES_ADDRESS, ethers.constants.MaxUint256]), "0x7A120", ctx.userAddress); // 500k gas
                if (!approveTx) {
                    setWarsStatus("Approval rejected");
                    setWarsSearching(false);
                    warsTransactionInProgress.current = false;
                    return;
                }
                setWarsStatus("Confirming approval...");
                await waitForTx(approveTx, readProvider);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            // Transfer 50K to treasury for reveal (doesn't attack yet)
            setWarsStatus("Paying reveal fee (50K - confirm in wallet)...");
            const treasuryAddress = "0x5a567898881CEf8DF767D192b74d99513CAa6e46";
            const transferTx = await sendContractTx(
                FCWEED_ADDRESS,
                erc20Interface.encodeFunctionData("transfer", [treasuryAddress, revealFee]),
                "0x30D40", // 200k gas
                ctx.userAddress
            );

            if (!transferTx) {
                setWarsStatus("Payment rejected");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsStatus("Confirming payment...");
            await waitForTx(transferTx, readProvider);

            // Now reveal stats
            setWarsTargetRevealed(true);
            
            // Set target stats from backend data
            let pendingBN = ethers.BigNumber.from(0);
            const rawPending = stats?.pendingRewards;
            if (rawPending !== null && rawPending !== undefined && rawPending !== "" && rawPending !== "0") {
                try {
                    const pendingNum = parseFloat(rawPending.toString());
                    if (!isNaN(pendingNum) && pendingNum > 0) {
                        const pendingWei = Math.floor(pendingNum * 1e18).toString();
                        pendingBN = ethers.BigNumber.from(pendingWei);
                    }
                } catch (e) {
                    console.log("[Wars] Pending parse error:", e);
                }
            }

            setWarsTargetStats({
                plants: stats?.plants || 0,
                avgHealth: stats?.avgHealth || 100,
                battlePower: stats?.battlePower || 0,
                pendingRewards: pendingBN,
                hasShield: stats?.hasShield || false,
            });

            // Calculate win odds
            const myPower = contractCombatPower || 100;
            const targetPower = stats?.battlePower || 100;
            const [defPower] = await Promise.all([
                battlesContract.getPower(target).then((p: any) => p[2].toNumber()).catch(() => targetPower)
            ]);
            const totalPower = myPower + defPower;
            const winChance = totalPower > 0 ? Math.round((myPower / totalPower) * 100) : 50;
            setWarsOdds({ attackerPower: myPower, defenderPower: defPower, estimatedWinChance: winChance });

            setWarsStatus("Stats revealed! Attack or Skip.");

        } catch (err: any) {
            console.error("[Wars] Reveal failed:", err);
            setWarsStatus("Reveal failed: " + (err.reason || err.message || err).toString().slice(0, 80));
        } finally {
            setWarsSearching(false);
            warsTransactionInProgress.current = false;
        }
    }

    // Attack target - Execute cartelAttack (50K fee) - WITH PRE-FLIGHT AUTHORIZATION CHECKS
    async function handleWarsAttack() {
        if (warsTransactionInProgress.current || !warsPreviewData) return;
        warsTransactionInProgress.current = true;
        setWarsSearching(true);
        setWarsStatus("Preparing attack...");

        try {
            const ctx = await ensureWallet();
            if (!ctx) {
                setWarsStatus("Wallet connection failed");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            const { target, nonce, deadline, signature, stats, attacker } = warsPreviewData;
            
            const effectiveAttacker = attacker || ctx.userAddress;
            if (attacker && ctx.userAddress.toLowerCase() !== attacker.toLowerCase()) {
                console.error("[Wars] Address mismatch! Signature for:", attacker, "Connected:", ctx.userAddress);
                setWarsStatus("Wallet changed since search. Please search again.");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }
            
            const battlesContract = new ethers.Contract(V5_BATTLES_ADDRESS, V3_BATTLES_ABI, readProvider);
            
            setWarsStatus("Checking authorization...");
            
            // Check 0: CRITICAL - Verify user has staked plants (prevents !p error)
            const stakingAbi = [
                "function getUserBattleStats(address) view returns (uint256 plants, uint256 lands, uint256 superLands, uint256 avgHealth, uint256 pendingRewards)"
            ];
            const stakingContract = new ethers.Contract(V5_STAKING_ADDRESS, stakingAbi, readProvider);
            try {
                const battleStats = await stakingContract.getUserBattleStats(effectiveAttacker);
                const plantCount = Number(battleStats[0]);
                console.log("[Wars] Pre-flight plant check:", plantCount, "plants for", effectiveAttacker);
                
                if (plantCount === 0) {
                    setWarsStatus("❌ You need staked plants to attack! Stake plants first.");
                    setWarsSearching(false);
                    warsTransactionInProgress.current = false;
                    return;
                }
            } catch (e) {
                console.error("[Wars] Plant check failed:", e);
                // Continue anyway - let contract handle it
            }
            
            const canAttack = await battlesContract.canCartel(effectiveAttacker);
            console.log("[Wars] Pre-flight canCartel:", canAttack, "for", effectiveAttacker);
            
            if (!canAttack) {
                const [lastAttack, userPower] = await Promise.all([
                    battlesContract.lastCartel(effectiveAttacker),
                    battlesContract.getPower(effectiveAttacker)
                ]);
                
                const cartelCD = 21600; // 6 hour cooldown
                const cooldownEnds = lastAttack.toNumber() + cartelCD;
                const nowTs = Math.floor(Date.now() / 1000);
                
                if (cooldownEnds > nowTs) {
                    const remaining = cooldownEnds - nowTs;
                    const hours = Math.floor(remaining / 3600);
                    const minutes = Math.floor((remaining % 3600) / 60);
                    const timeStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
                    setWarsStatus(`Cooldown active: ${timeStr} remaining`);
                } else if (userPower[1].toNumber() === 0) {
                    setWarsStatus("You need staked NFTs to attack! Stake plants/lands first.");
                } else {
                    setWarsStatus("Not authorized to attack. Check your staked NFTs.");
                }
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }
            
            // Check 2: Verify signature hasn't expired
            const nowTs = Math.floor(Date.now() / 1000);
            if (deadline < nowTs) {
                setWarsStatus("Attack signature expired. Please search for a new target.");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }
            
            // Check 3: Verify target still has plants
            try {
                const targetPower = await battlesContract.getPower(target);
                if (targetPower[2].toNumber() === 0) {
                    setWarsStatus("Target no longer has staked NFTs.");
                    setWarsSearching(false);
                    warsTransactionInProgress.current = false;
                    return;
                }
            } catch {}
            
            const attackFee = await battlesContract.cartelFee();
            const tokenContract = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            let allowance = await tokenContract.allowance(effectiveAttacker, V5_BATTLES_ADDRESS);

            if (allowance.lt(attackFee)) {
                setWarsStatus("Approving FCWEED (confirm in wallet)...");
                const approveTx = await sendContractTx(FCWEED_ADDRESS, erc20Interface.encodeFunctionData("approve", [V5_BATTLES_ADDRESS, ethers.constants.MaxUint256]), "0x7A120", effectiveAttacker);
                if (!approveTx) {
                    setWarsStatus("Approval rejected");
                    setWarsSearching(false);
                    warsTransactionInProgress.current = false;
                    return;
                }
                setWarsStatus("Confirming approval...");
                await waitForTx(approveTx, readProvider);
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            // V14: Check shield but don't manually remove - Battles V4 removes it automatically in cartelAttack()
            try {
                const itemShopAbiForShield = [
                    "function hasActiveShield(address) view returns (bool active, uint256 expiresAt)",
                ];
                const itemShopContract = new ethers.Contract(V5_ITEMSHOP_ADDRESS, itemShopAbiForShield, readProvider);
                const shieldInfo = await itemShopContract.hasActiveShield(effectiveAttacker);
                
                if (shieldInfo[0]) {
                    // Just warn - Battles V4 automatically removes attacker's shield via _rmShield(msg.sender)
                    setWarsStatus("⚠️ Your shield will be removed when you attack...");
                    await new Promise(resolve => setTimeout(resolve, 1500));
                }
            } catch (e) {
                console.log("[Wars] Shield check failed (non-critical):", e);
            }

            setWarsStatus("Attacking (50K fee - confirm in wallet)...");

            // DEBUG: Log exactly what address is attacking
            console.log("=".repeat(50));
            console.log("[Wars] ATTACK DEBUG INFO:");
            console.log("[Wars] effectiveAttacker:", effectiveAttacker);
            console.log("[Wars] ctx.userAddress:", ctx.userAddress);
            console.log("[Wars] attacker from signature:", attacker);
            console.log("[Wars] userAddress (state):", userAddress);
            console.log("[Wars] wagmiAddress:", wagmiAddress);
            console.log("[Wars] usingMiniApp:", usingMiniApp);
            console.log("=".repeat(50));

            const tx = await sendContractTx(
                V5_BATTLES_ADDRESS,
                v3BattlesInterface.encodeFunctionData("cartelAttack", [target, deadline, signature]),
                "0x1E8480",
                effectiveAttacker
            );

            if (!tx) {
                setWarsStatus("Transaction rejected");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            setWarsStatus("Battle in progress...");
            const receipt = await waitForTx(tx, readProvider);
            
            // Check if transaction failed
            if (receipt && receipt.status === 0) {
                setWarsStatus("Transaction failed - the attack was reverted");
                setWarsSearching(false);
                warsTransactionInProgress.current = false;
                return;
            }

            // Parse battle result from logs
            const battleResultTopic = v3BattlesInterface.getEventTopic("CartelResult");
            let battleResult: any = null;

            if (receipt && receipt.logs) {
                for (const log of receipt.logs) {
                    if (log.topics[0] === battleResultTopic) {
                        try {
                            const parsed = v3BattlesInterface.parseLog(log);
                            battleResult = {
                                attacker: parsed.args.a,
                                defender: parsed.args.d,
                                won: parsed.args.w,
                                damageDealt: parsed.args.dmg.toNumber(),
                                rewardsTransferred: parsed.args.s,
                            };
                            console.log("[Wars] Battle result:", battleResult);
                        } catch {}
                    }
                }
            }

            // Show target stats for display
            let pendingBN = ethers.BigNumber.from(0);
            const rawPending = stats?.pendingRewards;
            if (rawPending !== null && rawPending !== undefined && rawPending !== "" && rawPending !== "0") {
                try {
                    const pendingNum = parseFloat(rawPending.toString());
                    if (!isNaN(pendingNum) && pendingNum > 0) {
                        const pendingWei = Math.floor(pendingNum * 1e18).toString();
                        pendingBN = ethers.BigNumber.from(pendingWei);
                    }
                } catch (e) {
                    console.log("[Wars] Pending parse error:", e);
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

            // Get power for display
            let attackerPower = contractCombatPower;
            let defenderPower = 0;
            try {
                const battlesContractPower = new ethers.Contract(V5_BATTLES_ADDRESS, [
                    "function getPower(address) view returns (uint256 base, uint256 atk, uint256 def)"
                ], readProvider);
                const defPowerResult = await battlesContractPower.getPower(target);
                defenderPower = defPowerResult[2].toNumber();
            } catch {
                defenderPower = Math.round((stats.plants * 100 + stats.lands * 50 + stats.superLands * 150) * stats.avgHealth / 100);
            }

            const total = attackerPower + defenderPower;
            const estimatedWinChance = total > 0 ? Math.round((attackerPower * 100) / total) : 50;

            setWarsOdds({ attackerPower, defenderPower, estimatedWinChance });
            setWarsTargetLocked(true);
            setWarsPreviewData(null); // Clear preview data - battle is done

            // Show battle result
            if (battleResult) {
                setWarsResult(battleResult);
                const rewards = battleResult.rewardsTransferred || ethers.BigNumber.from(0);
                const rewardsAmount = ethers.BigNumber.isBigNumber(rewards) ? rewards : ethers.BigNumber.from(rewards || 0);
                
                if (battleResult.won) {
                    const stolenAmount = parseFloat(ethers.utils.formatUnits(rewardsAmount, 18));
                    const stolenFormatted = stolenAmount >= 1000 ? (stolenAmount / 1000).toFixed(1) + "K" : stolenAmount.toFixed(0);
                    setWarsStatus(`🎉 VICTORY! Stole ${stolenFormatted} FCWEED!`);
                } else {
                    const lostAmount = parseFloat(ethers.utils.formatUnits(rewardsAmount, 18));
                    const lostFormatted = lostAmount >= 1000 ? (lostAmount / 1000).toFixed(1) + "K" : lostAmount.toFixed(0);
                    setWarsStatus(`💀 DEFEAT! Lost ${lostFormatted} FCWEED.`);
                }
            } else {
                setWarsStatus("Battle complete! Check your rewards.");
                setWarsResult({ won: true, rewardsTransferred: ethers.BigNumber.from(0), damageDealt: 0 });
            }

            // V4: Set cooldown ONLY on WIN (6 hours = 21600 seconds)
            if (battleResult?.won) {
                setWarsCooldown(21600);
            } else {
                // On loss, no cooldown - can search again immediately
                setWarsCooldown(0);
            }

            // Refresh data
            setTimeout(() => {
                loadWarsPlayerStats();
                refreshV5StakingRef.current = false;
                refreshV5Staking();
            }, 2000);

        } catch (err: any) {
            console.error("[Wars] Attack failed:", err);
            const errMsg = (err.reason || err.message || err).toString().toLowerCase();
            if (errMsg.includes("cooldown") || errMsg.includes("!cd")) {
                setWarsStatus("❌ Attack on cooldown! Wait before attacking again.");
            } else if (errMsg.includes("!p")) {
                setWarsStatus("❌ You need staked NFTs to attack!");
            } else if (errMsg.includes("!tgt")) {
                setWarsStatus("❌ Invalid target - search for a new one.");
            } else if (errMsg.includes("!shld")) {
                setWarsStatus("❌ Target has a shield.");
            } else if (errMsg.includes("!exp") || errMsg.includes("!sig")) {
                setWarsStatus("❌ Signature expired - search for a new target.");
            } else if (errMsg.includes("user rejected") || errMsg.includes("rejected")) {
                setWarsStatus("Transaction cancelled.");
            } else {
                setWarsStatus("Attack failed: " + (err.reason || err.message || err).toString().slice(0, 60));
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
            console.log("[Wars] Search response:", {
                target: data.target,
                deadline: data.deadline,
                signatureLength: data.signature?.length,
                signaturePrefix: data.signature?.slice(0, 20)
            });
            setWarsStatus("Target found! Pay fee to lock.");
        } catch (err: any) {
            console.error("[Wars] Search error:", err);
            setWarsStatus(err.name === 'AbortError' ? "Search timed out" : "Search failed");
        } finally {
            setWarsSearching(false);
            warsTransactionInProgress.current = false;
        }
    }

    async function handleNextOpponent() {
        if (warsTransactionInProgress.current) return;

        const currentTarget = warsTarget;
        
        setWarsTarget(null);
        setWarsTargetStats(null);
        setWarsTargetRevealed(false);
        setWarsOdds(null);
        setWarsSearchExpiry(0);
        setWarsPreviewData(null);
        setWarsTargetLocked(false);
        setWarsResult(null);
        setWarsStatus("");

        handleWarsSearch(currentTarget ? [currentTarget] : []);
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

        console.log("[UI] Connect button clicked, connecting:", connecting, "openConnectModal available:", !!openConnectModal);

        if (connecting) {
            console.log("[UI] Already connecting, ignoring click");
            return;
        }

        // Quick check if we're in Farcaster context (with timeout to not hang on web)
        let inFarcaster = false;
        try {
            const contextPromise = sdk.context;
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error("timeout")), 500)
            );
            const context = await Promise.race([contextPromise, timeoutPromise]);
            if (context) {
                inFarcaster = true;
                console.log("[UI] In Farcaster context, using SDK wallet");
            }
        } catch (e) {
            console.log("[UI] Not in Farcaster context (timeout or error)");
        }

        // If in Farcaster, use ensureWallet for SDK connection
        if (inFarcaster) {
            try {
                await ensureWallet();
            } catch (err) {
                console.error("[UI] Wallet connection error:", err);
            }
            return;
        }

        // On web (not Farcaster), always use RainbowKit modal
        // This provides a consistent experience and handles all wallet types
        if (openConnectModal) {
            console.log("[UI] Opening RainbowKit modal for web connection");
            openConnectModal();
            return;
        } else {
            console.log("[UI] RainbowKit openConnectModal is not available!");
        }

        // Fallback: try ensureWallet if RainbowKit unavailable
        console.log("[UI] RainbowKit unavailable, trying direct connection");
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

    const crateIcon = (t: string) => t === 'DUST' ? <img src="/images/items/dust.gif" alt="Dust" style={{ width: 14, height: 14, verticalAlign: 'middle' }} /> : t === 'FCWEED' ? '🌿' : t === 'USDC' ? '💵' : '🏆';

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

                try {
                    if (isMiniAppWallet && miniAppProvider) {
                        console.log("[Crate] Using mini app wallet for approval");
                        approveTx = await txAction().sendWalletCalls(
                            ctx.userAddress,
                            FCWEED_ADDRESS,
                            erc20Interface.encodeFunctionData("approve", [CRATE_VAULT_ADDRESS, ethers.constants.MaxUint256])
                        );
                    } else {
                        console.log("[Crate] Using external wallet for approval via sendContractTx");
                        const approveData = erc20Interface.encodeFunctionData("approve", [CRATE_VAULT_ADDRESS, ethers.constants.MaxUint256]);
                        approveTx = await sendContractTx(FCWEED_ADDRESS, approveData);
                    }
                } catch (approveErr: any) {
                    clearTimeout(timeoutId);
                    crateTransactionInProgress.current = false;
                    console.error("[Crate] Approval error:", approveErr);
                    const errMsg = approveErr?.shortMessage || approveErr?.reason || approveErr?.message || "Unknown error";
                    if (approveErr?.code === 4001 || approveErr?.code === "ACTION_REJECTED" || errMsg.includes("rejected") || errMsg.includes("denied") || errMsg.includes("canceled")) {
                        setCrateError("Approval canceled by user");
                    } else {
                        setCrateError("Approval failed: " + errMsg.slice(0, 50));
                    }
                    setCrateLoading(false);
                    setCrateStatus("");
                    return;
                }

                if (!approveTx) {
                    clearTimeout(timeoutId);
                    crateTransactionInProgress.current = false;
                    setCrateError("Approval not completed. Please try again.");
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

                console.log("[Crate] Using external wallet for openCrate via sendContractTx");
                try {
                    // Use sendContractTx which properly handles wagmi walletClient for Phantom/Base App
                    tx = await sendContractTx(CRATE_VAULT_ADDRESS, openCrateData, "0x4C4B40");
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


    const ConnectWalletButton = () => {
        const isActuallyConnected = !!(userAddress || (wagmiConnected && wagmiAddress));
        
        const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
            if (isActuallyConnected) {
                setShowDisconnectModal(true);
            } else {
                handleConnectWallet(e);
            }
        };
        
        return (
        <button
            type="button"
            disabled={connecting}
            onClick={handleClick}
            style={{
                padding: userAvatar && isActuallyConnected ? "4px 8px 4px 4px" : "6px 10px",
                borderRadius: 10,
                border: `1px solid ${theme === "light" ? "#e2e8f0" : "rgba(255,255,255,0.2)"}`,
                background: theme === "light" 
                    ? "#ffffff"
                    : (isActuallyConnected ? "rgba(15,23,42,0.9)" : "rgba(39,95,255,0.55)"),
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
            {userAvatar && isActuallyConnected ? (
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
            ) : !isActuallyConnected && (
                <span style={{ fontSize: 12, flexShrink: 0 }}>🔗</span>
            )}
            <span style={{ 
                overflow: "hidden", 
                textOverflow: "ellipsis", 
                whiteSpace: "nowrap",
                maxWidth: isActuallyConnected && userAvatar ? 70 : 80
            }}>{connecting && !isActuallyConnected ? "..." : getDisplayName()}</span>
        </button>
    );
    };

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
            
            {/* Battle Event Toast - Shows live battle notifications across all tabs */}
            {/* Also triggers live data refresh for all players when battles occur */}
            <BattleEventToast 
                theme={theme}
                readProvider={readProvider}
                enabled={true}
                onBattleEvent={refreshAllData}
            />
            
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
                {/* Row 1: Brand + Notifications + Theme */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ color: theme === "light" ? "#1e293b" : "#fff", fontSize: 16, fontWeight: 700 }}>FCWEED</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        {/* Notification Bell */}
                        <NotificationSettings 
                            theme={theme} 
                            userAddress={userAddress} 
                            backendUrl={WARS_BACKEND_URL}
                        />
                        {/* Theme Toggle */}
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
                {/* Persistent video container - all videos play continuously, stacked with absolute positioning */}
                {(activeTab === "info" || activeTab === "mint" || activeTab === "stake") && (
                    <section style={{ 
                        position: "relative",
                        width: "100%",
                        height: 120,
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                        padding: "10px 0"
                    }}>
                        {/* Info page video */}
                        <video 
                            ref={infoVideoRef}
                            src="/videos/info-page.mp4"
                            autoPlay
                            loop
                            muted
                            playsInline
                            onError={(e) => console.log("Info video error:", e)}
                            style={{ 
                                position: "absolute",
                                width: 280,
                                height: 100,
                                borderRadius: 14, 
                                objectFit: "cover",
                                background: "linear-gradient(135deg, rgba(16,185,129,0.3), rgba(59,130,246,0.3))",
                                opacity: activeTab === "info" ? 1 : 0,
                                pointerEvents: activeTab === "info" ? "auto" : "none",
                                transition: "opacity 0.2s ease"
                            }} 
                        />
                        {/* Mint page video */}
                        <video 
                            ref={mintVideoRef}
                            src="/videos/mint-page.mp4"
                            autoPlay
                            loop
                            muted
                            playsInline
                            onError={(e) => console.log("Mint video error:", e)}
                            style={{ 
                                position: "absolute",
                                width: 260,
                                height: 95,
                                borderRadius: 12, 
                                objectFit: "cover",
                                background: "linear-gradient(135deg, rgba(16,185,129,0.3), rgba(59,130,246,0.3))",
                                opacity: activeTab === "mint" ? 1 : 0,
                                pointerEvents: activeTab === "mint" ? "auto" : "none",
                                transition: "opacity 0.2s ease"
                            }} 
                        />
                        {/* Stake page video */}
                        <video 
                            ref={stakeVideoRef}
                            src="/videos/staking-page.mp4"
                            autoPlay
                            loop
                            muted
                            playsInline
                            onError={(e) => console.log("Stake video error:", e)}
                            style={{ 
                                position: "absolute",
                                width: 260,
                                height: 95,
                                borderRadius: 12, 
                                objectFit: "cover",
                                background: "linear-gradient(135deg, rgba(16,185,129,0.3), rgba(59,130,246,0.3))",
                                opacity: activeTab === "stake" ? 1 : 0,
                                pointerEvents: activeTab === "stake" ? "auto" : "none",
                                transition: "opacity 0.2s ease"
                            }} 
                        />
                    </section>
                )}
                
                {activeTab === "info" && (
                    <>

                        
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
                                <li style={{ color: "#ef4444", marginTop: 8 }}><b>DEA RAIDS (Hunt Sellers)</b> — Target wallets that sold FCWEED!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Pay <b>100K FCWEED</b> raid fee to attack sellers</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b style={{ color: "#fbbf24" }}>6h cooldown</b> (Same Target) | <b style={{ color: "#fbbf24" }}>2h cooldown</b> (After Successful Raid)</li>
                                <li style={{ color: "#dc2626", marginTop: 8 }}><b>THE PURGE (Chaos Event) (LIVE)</b> — Weekly chaos mode!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Active <b>Saturday 11PM - Sunday 11PM EST</b></li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• Pay <b>250K FCWEED</b> to target ANY wallet directly</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b style={{ color: "#fbbf24" }}>20 min cooldown</b> | <b style={{ color: "#ef4444" }}>All shields BYPASSED</b></li>
                                <li style={{ color: "#10b981", marginTop: 8 }}><b>Item Shop</b> — Power-ups for your Farm!</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Water</b> — Restores Plant Health (Shop open 12PM-6PM EST)</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Health Pack</b> — Heals one Plant Max to 80%, Usage: 1 Per Plant</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Raid Shield</b> — 24h Protection, Purge Bypasses Shields</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>Attack Boost</b> — +20% Power for 6h</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>AK-47</b> — +100% Power for 12h</li>
                                <li style={{ paddingLeft: 16, fontSize: 11 }}>• <b>RPG</b> — +500% Power for 3h</li>
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
                                <div className="c-float" style={{ width: 100, height: 100, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <img src="/images/items/crate.gif" alt="Crate" style={{ width: 80, height: 80, objectFit: 'contain' }} />
                                </div>
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
                                <div style={{ marginTop: 10, padding: 8, background: 'rgba(16,185,129,0.1)', borderRadius: 6, border: '1px solid rgba(16,185,129,0.2)', textAlign: 'center', fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                    <img src="/images/items/dust.gif" alt="Dust" style={{ width: 14, height: 14 }} />
                                    <span style={{ color: '#34d399' }}>{crateUserStats.dust.toLocaleString()} Dust = <b>{(Math.floor(crateUserStats.dust / 1000) * 60000).toLocaleString()}</b> $FCWEED</span>
                                </div>
                            )}
                        </section>
                    </>
                )}

                
                {crateConfirmOpen && (
                    <div className={styles.modalBackdrop}>
                        <div className={`${styles.modal} c-pop`} style={{ maxWidth: 300, padding: 16 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
                                    <img src="/images/items/crate.gif" alt="Crate" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                                </div>
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
                                    <div style={{ fontSize: 10, fontWeight: 600, color: "#ef4444", marginBottom: 4 }}>🚔 DEA RAIDS (Hunt Sellers)</div>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#475569" : "#c0c9f4", lineHeight: 1.5, paddingLeft: 8 }}>
                                        • Target wallets that sold FCWEED (under investigation)<br/>
                                        • Pay <span style={{ color: "#fbbf24" }}>100K FCWEED</span> raid fee<br/>
                                        • <span style={{ color: "#fbbf24" }}>6h cooldown</span> (Same Target) | <span style={{ color: "#fbbf24" }}>2h cooldown</span> (After Successful Raid)
                                    </div>
                                </div>
                                <div style={{ borderTop: "1px solid rgba(139,92,246,0.2)", paddingTop: 10 }}>
                                    <div style={{ fontSize: 10, fontWeight: 600, color: "#dc2626", marginBottom: 4 }}>🔪 THE PURGE (Chaos Event) (LIVE)</div>
                                    <div style={{ fontSize: 9, color: theme === "light" ? "#475569" : "#c0c9f4", lineHeight: 1.5, paddingLeft: 8 }}>
                                        • Scheduled chaos events - target ANY wallet directly for <span style={{ color: "#fbbf24" }}>250K FCWEED</span>!<br/>
                                        • <span style={{ color: "#fbbf24" }}>20 min cooldown</span> | <span style={{ color: "#ef4444" }}>All shields BYPASSED</span>. No mercy.
                                    </div>
                                </div>
                            </div>
                        </div>


                        
                        {connected && (
                            <div style={{ background: theme === "light" ? "rgba(99,102,241,0.05)" : "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: 10, padding: 10, marginBottom: 10, maxWidth: "100%", overflow: "hidden" }}>
                                <div style={{ fontSize: 10, color: "#a78bfa", fontWeight: 700, marginBottom: 8, textAlign: "center" }}>🎒 INVENTORY</div>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
                                    {/* AK-47 */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 8, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 95 }}>
                                        <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                            <img src="/images/items/ak47.gif" alt="AK-47" style={{ maxWidth: 36, maxHeight: 36, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 7, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>AK-47</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>{inventoryAK47}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {ak47Expiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((ak47Expiry - Math.floor(Date.now() / 1000)) / 3600)}h {Math.floor(((ak47Expiry - Math.floor(Date.now() / 1000)) % 3600) / 60)}m</div>
                                            ) : (
                                                <button onClick={handleActivateAK47} disabled={inventoryAK47 === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryAK47 > 0 ? "linear-gradient(135deg, #ef4444, #dc2626)" : "#374151", color: "#fff", cursor: inventoryAK47 > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Tactical Nuke */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(239,68,68,0.1)", borderRadius: 8, padding: 8, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", border: "1px solid rgba(239,68,68,0.3)", minHeight: 95 }}>
                                        <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                            <img src="/images/items/nuke.gif" alt="Nuke" style={{ maxWidth: 36, maxHeight: 36, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 6, color: "#ef4444", fontWeight: 600, marginBottom: 2 }}>NUKE</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#ef4444", marginBottom: 4 }}>{inventoryNuke}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {nukeExpiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((nukeExpiry - Math.floor(Date.now() / 1000)) / 60)}m {(nukeExpiry - Math.floor(Date.now() / 1000)) % 60}s</div>
                                            ) : (
                                                <button onClick={() => setNukeConfirmOpen(true)} disabled={inventoryNuke === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryNuke > 0 ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "#374151", color: "#fff", cursor: inventoryNuke > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* RPG */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 8, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 95 }}>
                                        <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                            <img src="/images/items/rpg.gif" alt="RPG" style={{ maxWidth: 36, maxHeight: 36, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 7, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>RPG</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#a855f7", marginBottom: 4 }}>{inventoryRPG}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {rpgExpiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((rpgExpiry - Math.floor(Date.now() / 1000)) / 60)}m {(rpgExpiry - Math.floor(Date.now() / 1000)) % 60}s</div>
                                            ) : (
                                                <button onClick={handleActivateRPG} disabled={inventoryRPG === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryRPG > 0 ? "linear-gradient(135deg, #a855f7, #8b5cf6)" : "#374151", color: "#fff", cursor: inventoryRPG > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Health Packs */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 8, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 95 }}>
                                        <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                            <img src="/images/items/healthpack.gif" alt="Health Pack" style={{ maxWidth: 36, maxHeight: 36, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 6, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>HEALTH</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#10b981", marginBottom: 4 }}>{inventoryHealthPacks}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            <button onClick={() => setHealthPackModalOpen(true)} disabled={inventoryHealthPacks === 0 || v5StakedPlants.length === 0} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryHealthPacks > 0 && v5StakedPlants.length > 0 ? "linear-gradient(135deg, #10b981, #34d399)" : "#374151", color: "#fff", cursor: inventoryHealthPacks > 0 && v5StakedPlants.length > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Use</button>
                                        </div>
                                    </div>
                                    {/* Shields */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 8, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 95 }}>
                                        <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                            <img src="/images/items/shield.gif" alt="Shield" style={{ maxWidth: 36, maxHeight: 36, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 7, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>SHIELDS</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#3b82f6", marginBottom: 4 }}>{inventoryShields}</div>
                                        <div style={{ marginTop: "auto", width: "100%" }}>
                                            {shieldExpiry > Math.floor(Date.now() / 1000) ? (
                                                <div style={{ padding: "3px 4px", fontSize: 7, borderRadius: 4, background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff", fontWeight: 700, textAlign: "center" }}>{Math.floor((shieldExpiry - Math.floor(Date.now() / 1000)) / 3600)}h {Math.floor(((shieldExpiry - Math.floor(Date.now() / 1000)) % 3600) / 60)}m</div>
                                            ) : (
                                                <button onClick={handleActivateShield} disabled={inventoryShields === 0 || inventoryLoading} style={{ width: "100%", padding: "3px 4px", fontSize: 7, borderRadius: 4, border: "none", background: inventoryShields > 0 ? "linear-gradient(135deg, #3b82f6, #60a5fa)" : "#374151", color: "#fff", cursor: inventoryShields > 0 ? "pointer" : "not-allowed", fontWeight: 600 }}>Activate</button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Attack Boost */}
                                    <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 8, padding: 8, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", minHeight: 95 }}>
                                        <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                            <img src="/images/items/attackboost.gif" alt="Attack Boost" style={{ maxWidth: 36, maxHeight: 36, objectFit: "contain" }} />
                                        </div>
                                        <div style={{ fontSize: 6, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2 }}>BOOST</div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#f59e0b", marginBottom: 4 }}>{inventoryBoosts}</div>
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
                                    <div style={{ background: theme === "light" ? "rgba(59,130,246,0.08)" : "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 10, padding: 10 }}>
                                        <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>🛡️ Defense</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>WINS</div>
                                                <div style={{ fontSize: 16, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.defWins || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>LOSSES</div>
                                                <div style={{ fontSize: 16, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.defLosses || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>LOST</div>
                                                <div style={{ fontSize: 16, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.rewardsLost ? formatLargeNumber(warsPlayerStats.rewardsLost) : "0"}</div>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Attack Box */}
                                    <div style={{ background: theme === "light" ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: 10 }}>
                                        <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 700, textAlign: "center", marginBottom: 8 }}>⚔️ Attack</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>WINS</div>
                                                <div style={{ fontSize: 16, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.wins || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>LOSSES</div>
                                                <div style={{ fontSize: 16, color: "#ef4444", fontWeight: 700 }}>{warsPlayerStats.losses || 0}</div>
                                            </div>
                                            <div style={{ background: theme === "light" ? "#f1f5f9" : "rgba(5,8,20,0.6)", borderRadius: 6, padding: "6px 4px", textAlign: "center" }}>
                                                <div style={{ fontSize: 8, color: theme === "light" ? "#64748b" : "#9ca3af", fontWeight: 600, marginBottom: 2, textTransform: "uppercase" }}>STOLEN</div>
                                                <div style={{ fontSize: 16, color: "#10b981", fontWeight: 700 }}>{warsPlayerStats.rewardsStolen ? formatLargeNumber(warsPlayerStats.rewardsStolen) : "0"}</div>
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
                                <div style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.2), rgba(168,85,247,0.15))", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 8, padding: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                    <div style={{ textAlign: "center" }}>
                                        <div style={{ fontSize: 9, color: "#a78bfa", marginBottom: 2 }}>ATTACK POWER</div>
                                        <div style={{ fontSize: 22, color: "#a78bfa", fontWeight: 800 }}>
                                            {contractCombatPower >= 1000 ? (contractCombatPower / 1000).toFixed(1) + "K" : contractCombatPower || 0}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "center", borderLeft: "1px solid rgba(139,92,246,0.3)", paddingLeft: 8 }}>
                                        <div style={{ fontSize: 9, color: "#60a5fa", marginBottom: 2 }}>DEFENSE POWER</div>
                                        <div style={{ fontSize: 22, color: "#60a5fa", fontWeight: 800 }}>
                                            {contractDefensePower >= 1000 ? (contractDefensePower / 1000).toFixed(1) + "K" : contractDefensePower || 0}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        
                        <div style={{ background: theme === "light" ? "rgba(239,68,68,0.05)" : "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                            <div style={{ fontSize: 14, color: "#ef4444", fontWeight: 700, marginBottom: 12, textAlign: "center" }}>⚔️ CARTEL WARS</div>
                            
                            {/* V4: Only show cooldown banner when NOT showing result modal */}
                            {warsCooldown > 0 && !warsResult && (
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
                                        onClick={() => handleWarsSearch()}
                                        disabled={warsSearching || !connected || warsCooldown > 0}
                                        className={styles.btnPrimary}
                                        style={{ padding: "10px 24px", fontSize: 12, background: warsSearching ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)" }}
                                    >
                                        {warsSearching ? "🔍 Searching..." : "🔍 Search for Opponent"}
                                    </button>
                                    {warsStatus && <p style={{ fontSize: 10, color: theme === "light" ? "#d97706" : "#fbbf24", marginTop: 8 }}>{warsStatus}</p>}
                                </div>
                            ) : (
                                <div>
                                    <div style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.1))", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: 16 }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                            <div style={{ fontSize: 10, color: "#9ca3af" }}>🎯 {warsTargetRevealed ? "STATS REVEALED" : "OPPONENT FOUND"}</div>
                                            {warsSearchExpiry > 0 && warsTargetRevealed && (
                                                <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 600 }}>
                                                    ⏱️ {Math.max(0, Math.floor((warsSearchExpiry - Math.floor(Date.now() / 1000)) / 60))}:{String(Math.max(0, (warsSearchExpiry - Math.floor(Date.now() / 1000)) % 60)).padStart(2, '0')}
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 12, color: "#fff", marginBottom: 12, wordBreak: "break-all" }}>{warsTarget.slice(0, 8)}...{warsTarget.slice(-6)}</div>

                                        {/* V4 SIMPLIFIED: Pre-attack shows only plants + pending */}
                                        {warsTargetRevealed && warsTargetStats && !warsResult && (
                                            <div style={{ marginBottom: 12 }}>
                                                {/* Simple 2-column display: Plants + Pending */}
                                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                                                    <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                                        <div style={{ fontSize: 10, color: "#22c55e", marginBottom: 4 }}>🌿 THEIR PLANTS</div>
                                                        <div style={{ fontSize: 28, fontWeight: 700, color: "#22c55e" }}>{warsTargetStats.plants}</div>
                                                    </div>
                                                    <div style={{ background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: 10, padding: 12, textAlign: "center" }}>
                                                        <div style={{ fontSize: 10, color: "#fbbf24", marginBottom: 4 }}>💰 PENDING LOOT</div>
                                                        <div style={{ fontSize: 22, fontWeight: 700, color: "#fbbf24" }}>
                                                            {warsTargetStats.pendingFormatted || "0"}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                {/* Shield warning if target has shield */}
                                                {warsTargetStats.hasShield && (
                                                    <div style={{ background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: 8, padding: 8, marginBottom: 12, textAlign: "center" }}>
                                                        <span style={{ fontSize: 10, color: "#3b82f6" }}>🛡️ Target has a shield - cannot attack</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* V4 SIMPLIFIED: Attack/Skip buttons - no Reveal step */}
                                        {!warsResult && (
                                            <div style={{ display: "flex", gap: 8 }}>
                                                {!warsTargetLocked && warsTargetStats && !warsTargetStats.hasShield ? (
                                                    /* Show Attack button */
                                                    <button type="button" onClick={handleWarsAttack} disabled={warsSearching} className={styles.btnPrimary} style={{ flex: 1, padding: "10px 16px", fontSize: 12, background: warsSearching ? "#374151" : "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                                                        {warsSearching ? "⚔️ Attacking..." : `⚔️ Attack (${warsSearchFee})`}
                                                    </button>
                                                ) : null}
                                                {!warsTargetLocked && (
                                                    <button type="button" onClick={handleNextOpponent} disabled={warsSearching} style={{ padding: "10px 14px", fontSize: 12, borderRadius: 8, border: "1px solid rgba(239,68,68,0.5)", background: "transparent", color: "#ef4444", cursor: warsSearching ? "not-allowed" : "pointer" }}>
                                                        Skip
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                        {warsStatus && !warsResult && <p style={{ fontSize: 10, color: theme === "light" ? "#d97706" : "#fbbf24", marginTop: 8 }}>{warsStatus}</p>}
                                    </div>
                                </div>
                            )}

                            {/* V4: Enhanced Battle Result Modal */}
                            {warsResult && (
                                <div style={{ marginTop: 12, background: warsResult.won ? "linear-gradient(135deg, rgba(16,185,129,0.2), rgba(34,197,94,0.1))" : "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))", border: `2px solid ${warsResult.won ? "rgba(16,185,129,0.5)" : "rgba(239,68,68,0.5)"}`, borderRadius: 12, padding: 20 }}>
                                    {/* Victory/Defeat Header */}
                                    <div style={{ textAlign: "center", marginBottom: 16 }}>
                                        <div style={{ fontSize: 48, marginBottom: 8 }}>{warsResult.won ? "🎉" : "💀"}</div>
                                        <div style={{ fontSize: 22, fontWeight: 700, color: warsResult.won ? "#10b981" : "#ef4444" }}>{warsResult.won ? "VICTORY!" : "DEFEAT!"}</div>
                                    </div>
                                    
                                    {/* Battle Stats Comparison - shown AFTER battle */}
                                    {warsOdds && warsTargetStats && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, marginBottom: 16 }}>
                                            {/* Your Stats */}
                                            <div style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", borderRadius: 8, padding: 10 }}>
                                                <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600, textAlign: "center", marginBottom: 8 }}>⚔️ YOU</div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>PLANTS</div>
                                                    <div style={{ fontSize: 16, fontWeight: 700, color: "#22c55e" }}>{v5StakedPlants?.length || 0}</div>
                                                </div>
                                                <div style={{ textAlign: "center", marginTop: 6 }}>
                                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>POWER</div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: "#22c55e" }}>{warsOdds.attackerPower}</div>
                                                </div>
                                            </div>
                                            
                                            {/* VS */}
                                            <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: "#9ca3af" }}>VS</div>
                                            </div>
                                            
                                            {/* Their Stats */}
                                            <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8, padding: 10 }}>
                                                <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, textAlign: "center", marginBottom: 8 }}>🛡️ TARGET</div>
                                                <div style={{ textAlign: "center" }}>
                                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>PLANTS</div>
                                                    <div style={{ fontSize: 16, fontWeight: 700, color: "#ef4444" }}>{warsTargetStats.plants}</div>
                                                </div>
                                                <div style={{ textAlign: "center", marginTop: 6 }}>
                                                    <div style={{ fontSize: 9, color: "#9ca3af" }}>POWER</div>
                                                    <div style={{ fontSize: 18, fontWeight: 700, color: "#ef4444" }}>{warsOdds.defenderPower}</div>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* Rewards/Loss Amount */}
                                    <div style={{ background: warsResult.won ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)", borderRadius: 8, padding: 12, marginBottom: 16, textAlign: "center" }}>
                                        <div style={{ fontSize: 11, color: warsResult.won ? "#10b981" : "#ef4444", marginBottom: 4 }}>
                                            {warsResult.won ? "💰 REWARDS STOLEN" : "💸 TOKENS LOST"}
                                        </div>
                                        <div style={{ fontSize: 24, fontWeight: 700, color: warsResult.won ? "#10b981" : "#ef4444" }}>
                                            {(() => {
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
                                                } catch (e) {}
                                                return amount >= 1000 ? (amount / 1000).toFixed(1) + "K" : amount.toFixed(0);
                                            })()} FCWEED
                                        </div>
                                        {warsResult.damageDealt > 0 && (
                                            <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
                                                Damage dealt: {warsResult.damageDealt}%
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* WIN: Show Cooldown Timer */}
                                    {warsResult.won && warsCooldown > 0 && (
                                        <div style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.4)", borderRadius: 8, padding: 12, marginBottom: 12, textAlign: "center" }}>
                                            <div style={{ fontSize: 10, color: "#fbbf24", marginBottom: 4 }}>⏳ ATTACK COOLDOWN</div>
                                            <div style={{ fontSize: 20, fontWeight: 700, color: "#fbbf24" }}>
                                                {Math.floor(warsCooldown / 3600)}h {Math.floor((warsCooldown % 3600) / 60)}m {warsCooldown % 60}s
                                            </div>
                                        </div>
                                    )}
                                    
                                    {/* WIN + Cooldown Done: Search New Target */}
                                    {warsResult.won && warsCooldown <= 0 && (
                                        <button type="button" onClick={() => { setWarsResult(null); setWarsTarget(null); setWarsTargetStats(null); setWarsTargetLocked(false); handleWarsSearch(); }} className={styles.btnPrimary} style={{ width: "100%", padding: "12px 20px", fontSize: 13, background: "linear-gradient(135deg, #22c55e, #10b981)" }}>
                                            🔍 Search New Target
                                        </button>
                                    )}
                                    
                                    {/* LOSS: Search Again Button - Immediate (no cooldown) */}
                                    {!warsResult.won && (
                                        <button type="button" onClick={() => { setWarsResult(null); setWarsTarget(null); setWarsTargetStats(null); setWarsTargetLocked(false); handleWarsSearch(); }} className={styles.btnPrimary} style={{ width: "100%", padding: "12px 20px", fontSize: 13, background: "linear-gradient(135deg, #dc2626, #ef4444)" }}>
                                            🔍 Search Again
                                        </button>
                                    )}
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
                    <ReferralsPanel
                        connected={connected}
                        userAddress={userAddress}
                        signer={signer}
                        chainId={CHAIN_ID}
                        backendBaseUrl={"https://api.fcweed.xyz"}
                    />
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
                            <div style={{ display: "flex", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
                                <div style={{ textAlign: "center", background: "rgba(96,165,250,0.15)", borderRadius: 8, padding: "6px 10px", minWidth: 50, border: "1px solid rgba(96,165,250,0.4)" }}>
                                    <img src="/images/items/water.gif" alt="Water" style={{ width: 32, height: 32, objectFit: "contain" }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>{v5StakingStats?.water ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v5StakingStats.water.toString()), 18)).toFixed(1) : "0"}L</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 10px", minWidth: 50 }}>
                                    <img src="/images/items/ak47.gif" alt="AK-47" style={{ width: 32, height: 32, objectFit: "contain" }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{inventoryAK47}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(239,68,68,0.15)", borderRadius: 8, padding: "6px 10px", minWidth: 50, border: "1px solid rgba(239,68,68,0.4)" }}>
                                    <img src="/images/items/nuke.gif" alt="Nuke" style={{ width: 32, height: 32, objectFit: "contain" }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444" }}>{inventoryNuke}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 10px", minWidth: 50 }}>
                                    <img src="/images/items/rpg.gif" alt="RPG" style={{ width: 32, height: 32, objectFit: "contain" }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#a855f7" }}>{inventoryRPG}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 10px", minWidth: 50 }}>
                                    <img src="/images/items/healthpack.gif" alt="Health Pack" style={{ width: 32, height: 32, objectFit: "contain" }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>{inventoryHealthPacks}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 10px", minWidth: 50 }}>
                                    <img src="/images/items/shield.gif" alt="Shield" style={{ width: 32, height: 32, objectFit: "contain" }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6" }}>{inventoryShields}</div>
                                </div>
                                <div style={{ textAlign: "center", background: "rgba(5,8,20,0.4)", borderRadius: 8, padding: "6px 10px", minWidth: 50 }}>
                                    <img src="/images/items/attackboost.gif" alt="Attack Boost" style={{ width: 32, height: 32, objectFit: "contain" }} />
                                    <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>{inventoryBoosts}</div>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                            <button onClick={() => setWaterModalOpen(true)} style={{ flex: 1, padding: "16px 12px", borderRadius: 12, border: "1px solid rgba(96,165,250,0.4)", background: "linear-gradient(135deg, rgba(96,165,250,0.15), rgba(59,130,246,0.1))", color: "#60a5fa", cursor: "pointer", fontSize: 14, fontWeight: 700, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <img src="/images/items/water.gif" alt="Water" style={{ width: 32, height: 32, objectFit: "contain" }} />
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

            {/* V5 Isometric Farm View */}
            <IsometricFarm
                isOpen={v5StakingOpen}
                onClose={() => setV5StakingOpen(false)}
                stats={v5StakingStats}
                stakedPlants={v5StakedPlants}
                stakedLands={v5StakedLands}
                stakedSuperLands={v5StakedSuperLands}
                availablePlants={v5AvailablePlants}
                availableLands={v5AvailableLands}
                availableSuperLands={v5AvailableSuperLands}
                plantHealths={v5PlantHealths}
                waterNeeded={v5WaterNeeded}
                realTimePending={v5RealTimePending}
                claimCooldown={v5ClaimCooldown}
                actionStatus={v5ActionStatus}
                loading={loadingV5Staking}
                actionLoading={actionLoading}
                onStakePlants={async (ids) => { await handleV5StakePlants(ids); }}
                onUnstakePlants={async (ids) => { await handleV5UnstakePlants(ids); }}
                onStakeLands={async (ids) => { await handleV5StakeLands(ids); }}
                onUnstakeLands={async (ids) => { await handleV5UnstakeLands(ids); }}
                onStakeSuperLands={async (ids) => { await handleV5StakeSuperLands(ids); }}
                onUnstakeSuperLands={async (ids) => { await handleV5UnstakeSuperLands(ids); }}
                onClaim={handleV5Claim}
                onWaterPlants={async (ids, amounts) => { 
                    // Pass IDs and amounts directly from UI to handler
                    console.log("[GrowRoom] Water request:", { ids, amounts });
                    await handleV5WaterPlants(ids, amounts);
                }}
                onShare={() => {
                    const plants = v5StakingStats?.plants || 0;
                    const lands = v5StakingStats?.lands || 0;
                    const superLands = v5StakingStats?.superLands || 0;
                    const boost = v5StakingStats?.boostPct?.toFixed(1) || 0;
                    const daily = v5StakingStats?.dailyRewards || "0";
                    const text = `🌿 My FCWEED Farm on @base:\n\n🌱 ${plants} Plants\n🏠 ${lands} Lands\n🔥 ${superLands} Super Lands\n📈 +${boost}% Boost\n💰 ${daily} Daily Rewards\n\nStart farming: https://x420ponzi.com`;
                    captureAndShare('v5-stats-card', text, composeCast);
                }}
                theme={theme}
            />

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
                                                        <input type="checkbox" checked={selectedV4PlantsToWater.length === v4StakedPlants.filter(id => (v4PlantHealths[id] ?? 100) < 100).length && selectedV4PlantsToWater.length > 0} onChange={() => { const needsWater = v4StakedPlants.filter(id => (v4PlantHealths[id] ?? 100) < 100); if (selectedV4PlantsToWater.length === needsWater.length) { setSelectedV4PlantsToWater([]); setV4CustomWaterAmounts({}); } else { setSelectedV4PlantsToWater(needsWater); const newAmounts: Record<number, number> = {}; needsWater.forEach(id => { newAmounts[id] = Math.max(0.1, Math.ceil((v4WaterNeeded[id] || 0.1) * 10) / 10); }); setV4CustomWaterAmounts(newAmounts); } }} />All needing water
                                                    </label>
                                                </div>
                                                <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 70 }}>
                                                    {v4StakedPlants.map((id) => {
                                                        const health = v4PlantHealths[id] ?? 100;
                                                        const waterNeeded = v4WaterNeeded[id] ?? 0;
                                                        const isSelected = selectedV4PlantsToWater.includes(id);
                                                        const defaultWater = Math.max(0.1, Math.ceil((waterNeeded || 0.1) * 10) / 10);
                                                        const customAmount = v4CustomWaterAmounts[id] ?? defaultWater;
                                                        return (
                                                            <div key={"v4water-" + id} style={{ minWidth: 70, padding: 6, borderRadius: 8, background: isSelected ? "rgba(59,130,246,0.3)" : "rgba(0,0,0,0.2)", border: isSelected ? "2px solid #60a5fa" : "1px solid #374151", opacity: health >= 100 ? 0.5 : 1, textAlign: "center" }}>
                                                                <div onClick={() => { if (health < 100) { toggleId(id, selectedV4PlantsToWater, setSelectedV4PlantsToWater); if (!isSelected) { setV4CustomWaterAmounts(prev => ({ ...prev, [id]: defaultWater })); } } }} style={{ cursor: health < 100 ? "pointer" : "default" }}>
                                                                    <div style={{ fontSize: 10, fontWeight: 600 }}>#{id}</div>
                                                                    <div style={{ width: "100%", height: 4, background: "#1f2937", borderRadius: 2, margin: "3px 0", overflow: "hidden" }}>
                                                                        <div style={{ height: "100%", width: `${health}%`, background: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444", transition: "width 0.3s" }} />
                                                                    </div>
                                                                    <div style={{ fontSize: 9, color: health >= 80 ? "#10b981" : health >= 50 ? "#fbbf24" : "#ef4444", fontWeight: 600 }}>{health}%</div>
                                                                    {health < 100 && <div style={{ fontSize: 8, color: "#60a5fa" }}>Need: {waterNeeded.toFixed(1)}L</div>}
                                                                </div>
                                                                {isSelected && health < 100 && (
                                                                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", justifyContent: "center", gap: 2 }}>
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setV4CustomWaterAmounts(prev => ({ ...prev, [id]: Math.max(0.1, Math.round(((prev[id] ?? defaultWater) - 0.5) * 10) / 10) })); }} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #374151", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                                                                        <input type="number" value={customAmount} onChange={(e) => { const val = Math.max(0.1, parseFloat(e.target.value) || 0.1); setV4CustomWaterAmounts(prev => ({ ...prev, [id]: Math.round(val * 10) / 10 })); }} onClick={(e) => e.stopPropagation()} style={{ width: 32, height: 18, textAlign: "center", fontSize: 9, background: "#1f2937", border: "1px solid #374151", borderRadius: 4, color: "#fff" }} min="0.1" step="0.1" />
                                                                        <button type="button" onClick={(e) => { e.stopPropagation(); setV4CustomWaterAmounts(prev => ({ ...prev, [id]: Math.round(((prev[id] ?? defaultWater) + 0.5) * 10) / 10 })); }} style={{ width: 18, height: 18, borderRadius: 4, border: "1px solid #374151", background: "#1f2937", color: "#fff", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 9, color: "#9ca3af", marginTop: 6 }}>
                                                    <span>Your Water: {v4StakingStats?.water ? parseFloat(ethers.utils.formatUnits(ethers.BigNumber.from(v4StakingStats.water.toString()), 18)).toFixed(2) : "0"}L</span>
                                                    {selectedV4PlantsToWater.length > 0 && <span style={{ color: "#60a5fa" }}>Using: {selectedV4PlantsToWater.reduce((sum, id) => sum + (v4CustomWaterAmounts[id] ?? Math.max(0.1, Math.ceil((v4WaterNeeded[id] || 0.1) * 10) / 10)), 0).toFixed(1)}L</span>}
                                                </div>
                                                {selectedV4PlantsToWater.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={handleV4WaterPlants}
                                                        disabled={actionLoading || !connected}
                                                        className={styles.btnPrimary}
                                                        style={{ width: "100%", marginTop: 8, padding: 8, fontSize: 11, background: actionLoading ? "#374151" : "linear-gradient(135deg, #3b82f6, #60a5fa)" }}
                                                    >
                                                        {actionLoading ? "💧 Watering..." : `💧 Water ${selectedV4PlantsToWater.length} Plant${selectedV4PlantsToWater.length > 1 ? "s" : ""} (${selectedV4PlantsToWater.reduce((sum, id) => sum + (v4CustomWaterAmounts[id] ?? Math.max(0.1, Math.ceil((v4WaterNeeded[id] || 0.1) * 10) / 10)), 0).toFixed(1)}L)`}
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
                            <div style={{ marginBottom: 12, display: "flex", justifyContent: "center", alignItems: "center" }}>
                                <img src="/images/items/nuke.gif" alt="Nuke" style={{ width: 64, height: 64, objectFit: "contain" }} />
                            </div>
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
                                <img src="/images/items/healthpack.gif" alt="Health Pack" style={{ width: 28, height: 28, objectFit: "contain" }} />
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
                                <img src="/images/items/healthpack.gif" alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />
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
                            <h3 style={{ margin: 0, fontSize: 18, color: "#60a5fa", display: "flex", alignItems: "center", gap: 8 }}><img src="/images/items/water.gif" alt="Water" style={{ width: 24, height: 24 }} /> Water Shop</h3>
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
                                <img src="/images/items/dust.gif" alt="Dust" style={{ width: 18, height: 18, objectFit: "contain" }} />
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
                                    <img src="/images/items/ak47.gif" alt="AK-47" style={{ width: 40, height: 40, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#ef4444", marginBottom: 2 }}>AK-47</div>
                                <div style={{ fontSize: 8, color: "#fca5a5", marginBottom: 2 }}>+100% Combat</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", marginBottom: 3 }}>Lasts 12 hours</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[1]?.remaining ?? 15) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#ef4444", fontWeight: 600 }}>{shopSupply[1]?.remaining ?? 15}/{shopSupply[1]?.total ?? 15}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(1, "dust")} disabled={shopLoading || crateUserStats.dust < 1000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 1000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 1000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 1000 ? "pointer" : "not-allowed", fontSize: 8 }}><img src="/images/items/dust.gif" alt="Dust" style={{ width: 12, height: 12, marginRight: 2, verticalAlign: 'middle' }} />1K DUST</button>
                                            <button onClick={() => handleBuyItem(1, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.ak47)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.ak47) ? "linear-gradient(135deg, #ef4444, #dc2626)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.ak47) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.ak47) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 1M FCWEED</button>
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
                                    <img src="/images/items/nuke.gif" alt="Nuke" style={{ width: 40, height: 40, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#ef4444", marginBottom: 2 }}>TACTICAL NUKE</div>
                                <div style={{ fontSize: 8, color: "#fca5a5", marginBottom: 2 }}>+10,000% Combat</div>
                                <div style={{ fontSize: 7, color: "#fca5a5", marginBottom: 3 }}>10 min (1 attack)</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[3]?.remaining ?? 1) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#ef4444", fontWeight: 600 }}>{shopSupply[3]?.remaining ?? 1}/{shopSupply[3]?.total ?? 1}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(3, "dust")} disabled={shopLoading || crateUserStats.dust < 10000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 10000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 10000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 10000 ? "pointer" : "not-allowed", fontSize: 8 }}><img src="/images/items/dust.gif" alt="Dust" style={{ width: 12, height: 12, marginRight: 2, verticalAlign: 'middle' }} />10K DUST</button>
                                            <button onClick={() => handleBuyItem(3, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.nuke)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.nuke) ? "linear-gradient(135deg, #dc2626, #b91c1c)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.nuke) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.nuke) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 10M FCWEED</button>
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
                                    <img src="/images/items/rpg.gif" alt="RPG" style={{ width: 40, height: 40, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#a855f7", marginBottom: 2 }}>RPG</div>
                                <div style={{ fontSize: 8, color: "#c4b5fd", marginBottom: 2 }}>+500% Combat</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", marginBottom: 3 }}>Lasts 3 hours</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[2]?.remaining ?? 3) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#a855f7", fontWeight: 600 }}>{shopSupply[2]?.remaining ?? 3}/{shopSupply[2]?.total ?? 3}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(2, "dust")} disabled={shopLoading || crateUserStats.dust < 4000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 4000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 4000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 4000 ? "pointer" : "not-allowed", fontSize: 8 }}><img src="/images/items/dust.gif" alt="Dust" style={{ width: 12, height: 12, marginRight: 2, verticalAlign: 'middle' }} />4K DUST</button>
                                            <button onClick={() => handleBuyItem(2, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.rpg)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.rpg) ? "linear-gradient(135deg, #a855f7, #8b5cf6)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.rpg) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.rpg) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 4M FCWEED</button>
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
                                    <img src="/images/items/healthpack.gif" alt="Health Pack" style={{ width: 36, height: 36, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#10b981", marginBottom: 2 }}>HEALTH PACK</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", lineHeight: 1.2, marginBottom: 4 }}>Heals one Plant Max to 80%<br/>Usage: 1 Per Plant</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[4]?.remaining ?? 20) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#10b981", fontWeight: 600 }}>{shopSupply[4]?.remaining ?? 20}/{shopSupply[4]?.total ?? 20}</span></div>
                                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                            <button onClick={() => handleBuyItem(4, "dust")} disabled={shopLoading || crateUserStats.dust < 2000} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 2000 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 2000 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 2000 ? "pointer" : "not-allowed", fontSize: 8 }}><img src="/images/items/dust.gif" alt="Dust" style={{ width: 12, height: 12, marginRight: 2, verticalAlign: 'middle' }} />2K DUST</button>
                                            <button onClick={() => handleBuyItem(4, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.healthPack)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.healthPack) ? "linear-gradient(135deg, #10b981, #34d399)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.healthPack) ? "#fff" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.healthPack) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 2M FCWEED</button>
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
                                    <img src="/images/items/shield.gif" alt="Shield" style={{ width: 36, height: 36, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#3b82f6", marginBottom: 2 }}>RAID SHIELD</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", lineHeight: 1.2, marginBottom: 4 }}>24h Protection<br/>Purge Bypasses Shields</div>
                                <div style={{ marginTop: "auto" }}>
                                {(shopSupply[5]?.remaining ?? 25) > 0 ? (
                                    <>
                                        <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#3b82f6", fontWeight: 600 }}>{shopSupply[5]?.remaining ?? 25}/{shopSupply[5]?.total ?? 25}</span></div>
                                        <button onClick={() => handleBuyItem(5, "dust")} disabled={shopLoading || crateUserStats.dust < 2500} style={{ width: "100%", padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 2500 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 2500 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 2500 ? "pointer" : "not-allowed", fontSize: 8 }}><img src="/images/items/dust.gif" alt="Dust" style={{ width: 12, height: 12, marginRight: 2, verticalAlign: 'middle' }} />2.5K DUST</button>
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
                                    <img src="/images/items/attackboost.gif" alt="Attack Boost" style={{ width: 36, height: 36, objectFit: "contain" }} />
                                </div>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", marginBottom: 2 }}>ATTACK BOOST</div>
                                <div style={{ fontSize: 7, color: "#9ca3af", lineHeight: 1.2, marginBottom: 4 }}>+20% Combat<br/>Lasts 6 hours</div>
                                <div style={{ marginTop: "auto" }}>
                                <div style={{ fontSize: 7, color: "#6b7280", marginBottom: 4 }}>STOCK: <span style={{ color: "#f59e0b", fontWeight: 600 }}>∞</span></div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                    <button onClick={() => handleBuyItem(6, "dust")} disabled={shopLoading || crateUserStats.dust < 200} style={{ padding: "6px", borderRadius: 5, border: "none", background: crateUserStats.dust >= 200 ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "#374151", color: crateUserStats.dust >= 200 ? "#000" : "#9ca3af", fontWeight: 600, cursor: crateUserStats.dust >= 200 ? "pointer" : "not-allowed", fontSize: 8 }}><img src="/images/items/dust.gif" alt="Dust" style={{ width: 12, height: 12, marginRight: 2, verticalAlign: 'middle' }} />200 DUST</button>
                                    <button onClick={() => handleBuyItem(6, "fcweed")} disabled={shopLoading || fcweedBalanceRaw.lt(SHOP_FCWEED_PRICES.attackBoost)} style={{ padding: "6px", borderRadius: 5, border: "none", background: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.attackBoost) ? "linear-gradient(135deg, #f59e0b, #fbbf24)" : "#374151", color: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.attackBoost) ? "#000" : "#9ca3af", fontWeight: 600, cursor: fcweedBalanceRaw.gte(SHOP_FCWEED_PRICES.attackBoost) ? "pointer" : "not-allowed", fontSize: 8 }}>🌿 200K FCWEED</button>
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
