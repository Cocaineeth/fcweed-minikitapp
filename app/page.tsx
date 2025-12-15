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
    totalBoostPct: number; // NOTE: you store 100.0-based here (see below)
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

// Detect if running inside Farcaster mobile app
function detectMiniAppEnvironment(): { isMiniApp: boolean; isMobile: boolean } {
    if (typeof window === "undefined") return { isMiniApp: false, isMobile: false };

    const userAgent = navigator.userAgent || "";
    const isMobile = /iPhone|iPad|iPod|Android/i.test(userAgent);

    // Multiple detection methods for Farcaster mini app
    const inIframe = window.parent !== window;
    const hasFarcasterContext = !!(window as any).farcaster || !!(window as any).__FARCASTER__;
    const hasWarpcastUA = userAgent.toLowerCase().includes("warpcast");
    const urlHasFrame = window.location.href.includes("fc-frame") ||
                        window.location.href.includes("farcaster") ||
                        document.referrer.includes("warpcast") ||
                        document.referrer.includes("farcaster");

    // Check if SDK is available and has wallet
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

    // For mini app transactions, we may not be able to call wait()
    // Instead, poll the chain for confirmation
    if (readProvider && tx.hash) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            try {
                const receipt = await readProvider.getTransactionReceipt(tx.hash);
                if (receipt && receipt.confirmations > 0) {
                    return receipt;
                }
            } catch {
                // Ignore and retry
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        console.warn("Transaction wait timeout, proceeding anyway:", tx.hash);
        return;
    }

    // Fallback to standard wait
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

    const [activeTab, setActiveTab] = useState<"info" | "mint" | "stake" | "crates" | "referrals" | "shop">("info");
    const [mintModalOpen, setMintModalOpen] = useState(false);
    const [stakeModalOpen, setStakeModalOpen] = useState(false);
    const [oldStakingOpen, setOldStakingOpen] = useState(false);
    const [newStakingOpen, setNewStakingOpen] = useState(false);
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

    const [oldStakingStats, setOldStakingStats] = useState<StakingStats | null>(null);
    const [newStakingStats, setNewStakingStats] = useState<NewStakingStats | null>(null);

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
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [gifIndex, setGifIndex] = useState(0);

    const [ladderRows, setLadderRows] = useState<FarmerRow[]>([]);
    const [ladderLoading, setLadderLoading] = useState(false);
    const [walletRank, setWalletRank] = useState<number | null>(null);
    const [walletRow, setWalletRow] = useState<FarmerRow | null>(null);
    const [farmerCount, setFarmerCount] = useState<number>(0);
    const [realTimePending, setRealTimePending] = useState<string>("0.00");
    const [oldRealTimePending, setOldRealTimePending] = useState<string>("0.00");

    // const ladder = useLeaderboard({ readProvider, userAddress, usingMiniApp, topN: 10, });

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

    const handlePlayPause = () => setIsPlaying((prev) => !prev);
    const handleNextTrack = () =>
        setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
    const handlePrevTrack = () =>
        setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);

    useEffect(() => {
        if (!isMiniAppReady) {
            setMiniAppReady();
        }

        // Initialize Farcaster SDK and auto-connect if in mini app
        (async () => {
            try {
                console.log("[Init] Initializing Farcaster SDK...");
                await sdk.actions.ready();
                console.log("[Init] SDK ready");

                // Auto-connect wallet if in Farcaster mini app
                const { isMiniApp } = detectMiniAppEnvironment();
                if (isMiniApp && !userAddress) {
                    console.log("[Init] Auto-connecting wallet in mini app...");
                    // Small delay to ensure SDK is fully initialized
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

            // Try Farcaster MiniApp SDK first (works for both mobile and desktop frames)
            if (detectedMiniApp || isMobile) {
                try {
                    console.log("[Wallet] Attempting Farcaster SDK wallet connection...");

                    // Make sure SDK is ready
                    try {
                        await sdk.actions.ready();
                        console.log("[Wallet] SDK ready confirmed");
                    } catch (readyErr) {
                        console.warn("[Wallet] SDK ready call failed (may already be ready):", readyErr);
                    }

                    // Try multiple methods to get the ethereum provider
                    try {
                        // Method 1: Direct wallet.getEthereumProvider()
                        ethProv = await sdk.wallet.getEthereumProvider();
                        console.log("[Wallet] Got provider via getEthereumProvider()");
                    } catch (err1) {
                        console.warn("[Wallet] getEthereumProvider failed:", err1);

                        // Method 2: Check if ethProvider is directly available
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

            // If we got a Farcaster provider, use it
            if (ethProv) {
                setUsingMiniApp(true);
                setMiniAppEthProvider(ethProv);

                // Request accounts via the provider - this triggers the wallet connect prompt
                try {
                    console.log("[Wallet] Requesting accounts from Farcaster provider...");
                    const accounts = await ethProv.request({ method: "eth_requestAccounts" });
                    console.log("[Wallet] Got accounts:", accounts);
                } catch (err: any) {
                    console.warn("[Wallet] eth_requestAccounts failed:", err);
                    // If user rejected, throw to show error
                    if (err?.code === 4001) {
                        throw new Error("Wallet connection rejected. Please approve the connection request.");
                    }
                    // Otherwise continue - we might still be able to get the address
                }

                p = new ethers.providers.Web3Provider(ethProv as any, "any");
                s = p.getSigner();

                try {
                    addr = await s.getAddress();
                    console.log("[Wallet] Got address:", addr);
                } catch (err) {
                    console.error("[Wallet] Failed to get address from Farcaster provider:", err);

                    // Try getting accounts directly from provider
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
                // Fallback to browser wallet (MetaMask, etc.)
                setUsingMiniApp(false);
                const anyWindow = window as any;

                // Check for various wallet providers
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

            // Check and switch to Base chain
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
                        // Re-create provider after chain switch
                        p = new ethers.providers.Web3Provider(switchProvider as any, "any");
                        s = p.getSigner();
                        console.log("[Wallet] Switched to Base");
                    } catch (switchErr: any) {
                        console.warn("[Wallet] Chain switch failed:", switchErr);

                        // Try to add the chain if it doesn't exist (error 4902)
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
        data: string
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

        console.log("[TX] Sending wallet_sendCalls:", { from, to, chainIdHex });

        let result: any;

        try {
            // Try wallet_sendCalls first (EIP-5792)
            result = await req({
                method: "wallet_sendCalls",
                params: [
                    {
                        from,
                        chainId: chainIdHex,
                        atomicRequired: false,
                        calls: [
                            {
                                to,
                                data,
                                value: "0x0",
                            },
                        ],
                    },
                ],
            });
        } catch (sendCallsError: any) {
            console.warn("[TX] wallet_sendCalls failed, trying eth_sendTransaction:", sendCallsError);

            // Fallback to eth_sendTransaction
            try {
                result = await req({
                    method: "eth_sendTransaction",
                    params: [{
                        from,
                        to,
                        data,
                        value: "0x0",
                        chainId: chainIdHex,
                    }],
                });

                // eth_sendTransaction returns the hash directly
                if (typeof result === "string" && result.startsWith("0x")) {
                    return {
                        hash: result,
                        wait: async () => {
                            // Poll for receipt using readProvider
                            for (let i = 0; i < 30; i++) {
                                await new Promise(resolve => setTimeout(resolve, 2000));
                                try {
                                    const receipt = await readProvider.getTransactionReceipt(result);
                                    if (receipt) return receipt;
                                } catch {
                                    // Continue polling
                                }
                            }
                            return null;
                        },
                    } as any;
                }
            } catch (sendTxError) {
                console.error("[TX] eth_sendTransaction also failed:", sendTxError);
                throw sendTxError;
            }
        }

        console.log("[TX] Result:", result);

        // Extract transaction hash from various response formats
        const txHash =
            (result?.txHashes && result.txHashes[0]) ||
            result?.txHash ||
            result?.hash ||
            (typeof result === "string" ? result : null);

        if (!txHash || typeof txHash !== "string" || !txHash.startsWith("0x")) {
            console.error("[TX] Invalid tx hash response:", result);
            // Don't throw - the transaction might have succeeded
            // Return a fake tx that won't block on wait()
            return {
                hash: "0x" + "0".repeat(64),
                wait: async () => {},
            } as any;
        }

        console.log("[TX] Transaction hash:", txHash);

        // Return a transaction-like object that can be awaited
        const fakeTx: any = {
            hash: txHash,
            wait: async () => {
                // Poll for receipt using readProvider
                for (let i = 0; i < 30; i++) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    try {
                        const receipt = await readProvider.getTransactionReceipt(txHash);
                        if (receipt && receipt.confirmations > 0) {
                            console.log("[TX] Confirmed:", txHash);
                            return receipt;
                        }
                    } catch {
                        // Continue polling
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

            // Provide helpful error messages
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
                        //
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
                        //
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
            const state = await loadOwnedTokens(addr); // backend
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
            // Return empty state on error instead of throwing
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

            // Query staked NFTs directly from the OLD staking contract
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

            // Get available (unstaked) NFTs - try API first, then fallback to chain
            let availPlants: number[] = [];
            let availLands: number[] = [];
            let availSuperLands: number[] = [];

            try {
                const ownedState = await getOwnedState(addr);
                const plants = ownedState?.plants || [];
                const lands = ownedState?.lands || [];
                const superLands = ownedState?.superLands || [];

                // These are NFTs in the wallet (not staked)
                availPlants = plants.map((t: any) => Number(t.tokenId));
                availLands = lands.map((t: any) => Number(t.tokenId));
                availSuperLands = superLands.map((t: any) => Number(t.tokenId));

                console.log("[OldStaking] Available from API:", { plants: availPlants.length, lands: availLands.length, superLands: availSuperLands.length });
            } catch (err) {
                console.error("[OldStaking] Failed to load owned tokens from API:", err);
            }

            // If API returned empty, try querying blockchain directly
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

            // ---- multicall old staking
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

            // Set old available NFTs for old staking modal
            setOldAvailablePlants(availPlants);
            setOldAvailableLands(availLands);

            // Also set shared available state
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

    // Query NFTs directly from blockchain (fallback if API fails)
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
            // Get balances
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

            // For each NFT type, try to get token IDs using tokenOfOwnerByIndex if available
            // Otherwise we'll need to scan Transfer events or use a different method

            // Try ERC721Enumerable tokenOfOwnerByIndex
            const erc721EnumAbi = [
                "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)"
            ];

            const plantEnum = new ethers.Contract(PLANT_ADDRESS, erc721EnumAbi, readProvider);
            const landEnum = new ethers.Contract(LAND_ADDRESS, erc721EnumAbi, readProvider);
            const superLandEnum = new ethers.Contract(SUPER_LAND_ADDRESS, erc721EnumAbi, readProvider);

            // Query plant token IDs
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

            // Query land token IDs
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

            // Query super land token IDs
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

            // Query staked NFTs directly from the NEW staking contract
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

            // Get available (unstaked) NFTs - try API first, then fallback to chain
            let availPlants: number[] = [];
            let availLands: number[] = [];
            let availSuperLands: number[] = [];

            try {
                const ownedState = await getOwnedState(addr);
                const plants = ownedState?.plants || [];
                const lands = ownedState?.lands || [];
                const superLands = ownedState?.superLands || [];

                // These are NFTs in the wallet (not staked)
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

            // If API returned empty, try querying blockchain directly
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

            // ---- multicall new staking
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
            // Clear cache when address changes to force fresh data
            ownedCacheRef.current = { addr: null, state: null };
            refreshOldStakingRef.current = false;
            refreshOldStaking();
        }
    }, [oldStakingOpen, userAddress]);

    useEffect(() => {
        if (newStakingOpen) {
            // Clear cache when address changes to force fresh data
            ownedCacheRef.current = { addr: null, state: null };
            refreshNewStakingRef.current = false;
            refreshNewStaking();
        }
    }, [newStakingOpen, userAddress]);

    // Real-time pending rewards update for NEW staking
    useEffect(() => {
        if (!newStakingOpen || !newStakingStats) return;

        const { pendingRaw, tokensPerSecond, plantsStaked, totalBoostPct } = newStakingStats;
        if (!pendingRaw || !tokensPerSecond || plantsStaked === 0) return;

        console.log("[Pending] Starting real-time update, tokensPerSecond:", tokensPerSecond.toString());

        let currentPending = pendingRaw;
        const boostMultiplier = totalBoostPct / 100; // e.g., 112% -> 1.12

        // Calculate tokens per second with boost
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

        // Set initial value
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

    // Real-time pending rewards update for OLD staking
    useEffect(() => {
        if (!oldStakingOpen || !oldStakingStats) return;

        const { pendingRaw, tokensPerSecond, plantsStaked, landBoostPct } = oldStakingStats;
        if (!pendingRaw || !tokensPerSecond || plantsStaked === 0) return;

        console.log("[OldPending] Starting real-time update");

        let currentPending = pendingRaw;
        const boostMultiplier = 1 + (landBoostPct / 100); // e.g., 12% -> 1.12

        // Calculate tokens per second with boost
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

        // Set initial value
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
                // Reuse cached backend state
                const owned = await getOwnedState(ctx.userAddress);

                // Only UNSTAKED Land can be burned
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
            // Optimistic UI update
            setOldAvailablePlants(prev => prev.filter(id => !stakingPlants.includes(id)));
            setOldAvailableLands(prev => prev.filter(id => !stakingLands.includes(id)));
            setOldStakedPlants(prev => [...prev, ...stakingPlants]);
            setOldStakedLands(prev => [...prev, ...stakingLands]);
            setSelectedOldAvailPlants([]); setSelectedOldAvailLands([]);
            // Background refresh for accurate data
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
            // Optimistic UI update
            setOldStakedPlants(prev => prev.filter(id => !unstakingPlants.includes(id)));
            setOldStakedLands(prev => prev.filter(id => !unstakingLands.includes(id)));
            setOldAvailablePlants(prev => [...prev, ...unstakingPlants]);
            setOldAvailableLands(prev => [...prev, ...unstakingLands]);
            setSelectedOldStakedPlants([]); setSelectedOldStakedLands([]);
            // Background refresh for accurate data
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
            // Immediately reset pending to 0
            setOldRealTimePending("0.00");
            setOldStakingStats(prev => prev ? { ...prev, pendingRaw: ethers.BigNumber.from(0), pendingFormatted: "0" } : null);
            // Background refresh
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
            // Optimistic UI update
            setNewAvailablePlants(prev => prev.filter(id => !stakingPlants.includes(id)));
            setNewAvailableLands(prev => prev.filter(id => !stakingLands.includes(id)));
            setNewAvailableSuperLands(prev => prev.filter(id => !stakingSuperLands.includes(id)));
            setNewStakedPlants(prev => [...prev, ...stakingPlants]);
            setNewStakedLands(prev => [...prev, ...stakingLands]);
            setNewStakedSuperLands(prev => [...prev, ...stakingSuperLands]);
            setSelectedNewAvailPlants([]); setSelectedNewAvailLands([]); setSelectedNewAvailSuperLands([]);
            // Background refresh
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
            // Optimistic UI update
            setNewStakedPlants(prev => prev.filter(id => !unstakingPlants.includes(id)));
            setNewStakedLands(prev => prev.filter(id => !unstakingLands.includes(id)));
            setNewStakedSuperLands(prev => prev.filter(id => !unstakingSuperLands.includes(id)));
            setNewAvailablePlants(prev => [...prev, ...unstakingPlants]);
            setNewAvailableLands(prev => [...prev, ...unstakingLands]);
            setNewAvailableSuperLands(prev => [...prev, ...unstakingSuperLands]);
            setSelectedNewStakedPlants([]); setSelectedNewStakedLands([]); setSelectedNewStakedSuperLands([]);
            // Background refresh
            setTimeout(() => { refreshNewStakingRef.current = false; refreshNewStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); refreshNewStakingRef.current = false; refreshNewStaking(); } finally { setActionLoading(false); }
    }

    async function handleNewClaim() {
        if (!newStakingStats || parseFloat(newStakingStats.pendingFormatted) <= 0) { setMintStatus("No rewards."); return; }
        try {
            setActionLoading(true);
            await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, stakingInterface.encodeFunctionData("claim", [])));
            // Immediately reset pending to 0
            setRealTimePending("0.00");
            setNewStakingStats(prev => prev ? { ...prev, pendingRaw: ethers.BigNumber.from(0), pendingFormatted: "0" } : null);
            // Background refresh
            setTimeout(() => { refreshNewStakingRef.current = false; refreshNewStaking(); }, 2000);
            ownedCacheRef.current = { addr: null, state: null };
        } catch (err) { console.error(err); } finally { setActionLoading(false); }
    }

    const connected = !!userAddress;

    // Mobile-friendly wallet connection handler
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

    const NftCard = ({ id, img, name, checked, onChange }: { id: number; img: string; name: string; checked: boolean; onChange: () => void }) => (
        <label style={{ minWidth: 80, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
            <input type="checkbox" checked={checked} onChange={onChange} style={{ marginBottom: 3 }} />
            <div style={{ padding: 2, borderRadius: 8, border: checked ? "2px solid #3b82f6" : "1px solid rgba(255,255,255,0.18)", background: "#050814" }}>
                <img src={img} alt={name + " #" + id} style={{ width: 55, height: 55, borderRadius: 6, objectFit: "contain" }} loading="lazy" />
            </div>
            <div style={{ marginTop: 2, fontSize: 9, fontWeight: 600 }}>{name}</div>
            <div style={{ fontSize: 8, opacity: 0.7 }}>#{id}</div>
        </label>
    );

    // Connect wallet button component with proper mobile support
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
        <div className={styles.page} style={{ paddingBottom: 70 }} onPointerDown={() => { if (!isPlaying && audioRef.current) audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {}); }}>
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
                            </ul>
                            <h2 className={styles.heading}>Use of Funds</h2>
                            <ul className={styles.bulletList}>
                                <li><b>50% of all mint funds</b> are routed to periodic <b>buyback and burns</b> of $FCWEED.</li>
                                <li>$FCWEED has a <b>3% buy &amp; sell tax</b>:
                    <ul style={{ marginTop: 4, marginLeft: 16 }}>
                        <li><b>2%</b> goes directly into automated <b>buyback &amp; burn</b>.</li>
                        <li><b>1%</b> is set aside for <b>top farmer rewards</b> in ETH, paid out based on the Crime Ladder leaderboard.</li>
                    </ul>
                                </li>
                                <li>The more you farm and climb the ladder, the larger your share of <b>ETH rewards</b> from the tax pool.</li>
                            </ul>
                        </section>
                        <section className={styles.infoCard}>
                            <h2 className={styles.heading}>Coming Soon</h2>
                            <ul className={styles.bulletList}>
                                <li style={{ color: "#fbbf24" }}>🎁 Referrals — Earn rewards for inviting friends</li>
                                <li style={{ color: "#fbbf24" }}>📦 Crate Openings — Mystery rewards and rare drops</li>
                                <li style={{ color: "#fbbf24" }}>🛒 Item Shop — Buy boosts and exclusive items</li>
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
                            <button type="button" className={styles.btnPrimary} onClick={() => setOldStakingOpen(true)} style={{ width: "100%", padding: 14, background: "linear-gradient(to right, #6b7280, #9ca3af)" }}>📦 Old Staking</button>
                            <button type="button" className={styles.btnPrimary} onClick={() => setNewStakingOpen(true)} style={{ width: "100%", padding: 14 }}>⚡ New Staking</button>
                        </div>
                        <div style={{ marginTop: 12, padding: 10, background: "rgba(251,191,36,0.1)", borderRadius: 10, border: "1px solid rgba(251,191,36,0.3)" }}>
                            <p style={{ fontSize: 11, color: "#fbbf24", margin: 0, fontWeight: 600 }}>⚠️ Migrate to New Staking for Super Land Support</p>
                            <p style={{ fontSize: 10, color: "#38e0a3", margin: "6px 0 0", fontWeight: 500 }}>✓ No tokens will be lost and no NFTs will be lost</p>
                            <p style={{ fontSize: 10, color: "#9ca3af", margin: "6px 0 0" }}>Claiming FCWEED on New Staking will resume after everyone has claimed and unstaked from Old Staking, by <b>5 PM EST on 12/14/2025</b>.</p>
                        </div>
                    </section>
                )}

                {activeTab === "crates" && (
                    <section className={styles.infoCard} style={{ position: "relative", textAlign: "center", padding: 40, minHeight: 300 }}>
                        <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,18,0.85)", backdropFilter: "blur(8px)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                            <div>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
                                <h2 style={{ fontSize: 20, color: "#fbbf24" }}>Coming Soon</h2>
                                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>Crate openings with mystery rewards</p>
                            </div>
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
                    <section className={styles.infoCard} style={{ position: "relative", textAlign: "center", padding: 40, minHeight: 300 }}>
                        <div style={{ position: "absolute", inset: 0, background: "rgba(5,8,18,0.85)", backdropFilter: "blur(8px)", borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>
                            <div>
                                <div style={{ fontSize: 48, marginBottom: 12 }}>🛒</div>
                                <h2 style={{ fontSize: 20, color: "#fbbf24" }}>Coming Soon</h2>
                                <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 8 }}>Buy boosts and exclusive items</p>
                            </div>
                        </div>
                    </section>
                )}
            </main>

            <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, #050812, #0a1128)", borderTop: "1px solid #1b2340", display: "flex", justifyContent: "space-around", padding: "8px 4px", zIndex: 50 }}>
                {[
                    { key: "info", icon: "ℹ️", label: "INFO" },
                    { key: "mint", icon: "🌱", label: "MINT" },
                    { key: "stake", icon: "⚡", label: "STAKE" },
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
                            <h2 className={styles.modalTitle}>Old Staking</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setOldStakingOpen(false)}>✕</button>
                        </header>
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
                            <h2 className={styles.modalTitle}>New Staking</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setNewStakingOpen(false)}>✕</button>
                        </header>
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
