"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";
import styles from "./page.module.css";

const CHAIN_ID = 8453;
const PUBLIC_BASE_RPC = "https://mainnet.base.org";

const PLANT_ADDRESS = "0xD84890240C2CBB66a825915cD20aEe89C6b66dD5";
const LAND_ADDRESS = "0x798A8F4b4799CfaBe859C85889c78e42a57d71c1";
const SUPER_LAND_ADDRESS = "0xAcd70377fF1aaF4E1aE76398C678CBE6ECc35e7d";
const OLD_STAKING_ADDRESS = "0x9dA6B01BFcbf5ab256B7B1d46F316e946da85507";
const NEW_STAKING_ADDRESS = "0xe876f175AcD484b0F502cEA38FC9215913FCDCdb";
const FCWEED_ADDRESS = "0x42ef01219BDb2190F275Cda7956D08822549d224";
const TOKEN_SYMBOL = "FCWEED";

const PLANT_FALLBACK_IMG = "/hero.png";
const LAND_FALLBACK_IMG = "/land.png";
const SUPER_LAND_FALLBACK_IMG = "/superland.png";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const PLANT_PRICE_USDC = ethers.utils.parseUnits("49.99", USDC_DECIMALS);
const LAND_PRICE_USDC = ethers.utils.parseUnits("199.99", USDC_DECIMALS);
const SUPER_LAND_FCWEED_COST = ethers.utils.parseUnits("2000000", 18);

const USDC_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
];

const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address owner) view returns (uint256)",
];

const LAND_ABI = ["function mint()"];
const PLANT_ABI = ["function mint()"];

const ERC721_VIEW_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function ownerOf(uint256 tokenId) view returns (address)",
    "function totalSupply() view returns (uint256)",
    "function tokenURI(uint256 tokenId) view returns (string)",
    "function isApprovedForAll(address owner, address operator) view returns (bool)",
    "function setApprovalForAll(address operator, bool approved)",
];

const OLD_STAKING_ABI = [
    "function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint256 accrued)",
    "function pending(address) view returns (uint256)",
    "function plantsOf(address) view returns (uint256[] memory)",
    "function landsOf(address) view returns (uint256[] memory)",
    "function stakePlants(uint256[] calldata ids)",
    "function unstakePlants(uint256[] calldata ids)",
    "function stakeLands(uint256[] calldata ids)",
    "function unstakeLands(uint256[] calldata ids)",
    "function claim()",
    "function landBoostBps() view returns (uint256)",
    "function tokensPerPlantPerDay() view returns (uint256)",
    "function landStakingEnabled() view returns (bool)",
    "function claimEnabled() view returns (bool)",
];

const NEW_STAKING_ABI = [
    "function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint32 superLands,uint256 accrued,uint256 bonusBoostBps)",
    "function pending(address) view returns (uint256)",
    "function plantsOf(address) view returns (uint256[] memory)",
    "function landsOf(address) view returns (uint256[] memory)",
    "function superLandsOf(address) view returns (uint256[] memory)",
    "function stakePlants(uint256[] calldata ids)",
    "function unstakePlants(uint256[] calldata ids)",
    "function stakeLands(uint256[] calldata ids)",
    "function unstakeLands(uint256[] calldata ids)",
    "function stakeSuperLands(uint256[] calldata ids)",
    "function unstakeSuperLands(uint256[] calldata ids)",
    "function claim()",
    "function landBoostBps() view returns (uint256)",
    "function superLandBoostBps() view returns (uint256)",
    "function tokensPerPlantPerDay() view returns (uint256)",
    "function landStakingEnabled() view returns (bool)",
    "function superLandStakingEnabled() view returns (bool)",
    "function claimEnabled() view returns (bool)",
    "function capacityOf(address) view returns (uint256)",
    "function getBoostBps(address) view returns (uint256)",
];

const SUPER_LAND_ABI = [
    "function upgrade(uint256 landTokenId)",
    "function upgradeEnabled() view returns (bool)",
    "function remainingPublicSupply() view returns (uint256)",
    "function totalMinted() view returns (uint256)",
];

const usdcInterface = new ethers.utils.Interface(USDC_ABI);
const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
const landInterface = new ethers.utils.Interface(LAND_ABI);
const plantInterface = new ethers.utils.Interface(PLANT_ABI);
const oldStakingInterface = new ethers.utils.Interface(OLD_STAKING_ABI);
const newStakingInterface = new ethers.utils.Interface(NEW_STAKING_ABI);
const superLandInterface = new ethers.utils.Interface(SUPER_LAND_ABI);
const erc721Interface = new ethers.utils.Interface(ERC721_VIEW_ABI);

type OldStakingStats = {
    plantsStaked: number;
    landsStaked: number;
    totalSlots: number;
    capacityUsed: number;
    landBoostPct: number;
    pendingFormatted: string;
    pendingRaw: ethers.BigNumber;
    claimEnabled: boolean;
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

const PLAYLIST = [
    { title: "Kendrick Lamar - Untitled 05 (LoVibe Remix)", src: "/audio/track1.mp3" },
    { title: "Travis Scott - SDP Interlude", src: "/audio/track2.mp3" },
    { title: "Yeat - if we being real", src: "/audio/track3.mp3" },
];

const GIFS = [
    "/fcweed-radio.gif",
    "/fcweed-radio-2.gif",
    "/fcweed-radio-3.gif",
    "/fcweed-radio-4.gif",
];

const ERC721_TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");

async function waitForTx(tx: ethers.providers.TransactionResponse | undefined | null) {
    if (!tx) return;
    try {
        await tx.wait();
    } catch (e: any) {
        const msg = e?.reason || e?.error?.message || e?.data?.message || e?.message || "";
        if (msg.includes("does not support the requested method") || msg.includes("unsupported method")) {
            console.warn("Ignoring provider wait() error:", e);
        } else {
            throw e;
        }
    }
}

export default function Home() {
    const { setMiniAppReady, isMiniAppReady } = useMiniKit();

    const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);
    const [signer, setSigner] = useState<ethers.Signer | null>(null);
    const [userAddress, setUserAddress] = useState<string | null>(null);
    const [usingMiniApp, setUsingMiniApp] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [miniAppEthProvider, setMiniAppEthProvider] = useState<any | null>(null);

    const [readProvider] = useState(() => new ethers.providers.JsonRpcProvider(PUBLIC_BASE_RPC));

    const [oldStakingOpen, setOldStakingOpen] = useState(false);
    const [newStakingOpen, setNewStakingOpen] = useState(false);
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);

    const [oldStakingStats, setOldStakingStats] = useState<OldStakingStats | null>(null);
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

    const [selectedAvailPlants, setSelectedAvailPlants] = useState<number[]>([]);
    const [selectedAvailLands, setSelectedAvailLands] = useState<number[]>([]);
    const [selectedAvailSuperLands, setSelectedAvailSuperLands] = useState<number[]>([]);
    const [selectedOldStakedPlants, setSelectedOldStakedPlants] = useState<number[]>([]);
    const [selectedOldStakedLands, setSelectedOldStakedLands] = useState<number[]>([]);
    const [selectedNewStakedPlants, setSelectedNewStakedPlants] = useState<number[]>([]);
    const [selectedNewStakedLands, setSelectedNewStakedLands] = useState<number[]>([]);
    const [selectedNewStakedSuperLands, setSelectedNewStakedSuperLands] = useState<number[]>([]);
    const [selectedLandForUpgrade, setSelectedLandForUpgrade] = useState<number | null>(null);

    const [plantImages, setPlantImages] = useState<Record<number, string>>({});
    const [landImages, setLandImages] = useState<Record<number, string>>({});
    const [superLandImages, setSuperLandImages] = useState<Record<number, string>>({});

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

    const ownedCacheRef = useRef<{
        addr: string | null;
        plants: number[];
        lands: number[];
        superLands: number[];
    }>({ addr: null, plants: [], lands: [], superLands: [] });

    const currentTrackMeta = PLAYLIST[currentTrack];

    useEffect(() => {
        if (!audioRef.current) return;
        if (isPlaying) {
            audioRef.current.play().catch(() => setIsPlaying(false));
        } else if (!audioRef.current.paused) {
            audioRef.current.pause();
        }
    }, [isPlaying, currentTrack]);

    useEffect(() => {
        const id = setInterval(() => setGifIndex((prev) => (prev + 1) % GIFS.length), 5000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        setSelectedAvailPlants([]);
        setSelectedAvailLands([]);
        setSelectedAvailSuperLands([]);
        setSelectedOldStakedPlants([]);
        setSelectedOldStakedLands([]);
        setSelectedNewStakedPlants([]);
        setSelectedNewStakedLands([]);
        setSelectedNewStakedSuperLands([]);
    }, [userAddress]);

    useEffect(() => {
        if (!newStakingStats || !newStakingOpen) return;
        
        const { pendingRaw, tokensPerSecond, plantsStaked } = newStakingStats;
        if (plantsStaked === 0) {
            setRealTimePending("0.00");
            return;
        }

        let currentPending = pendingRaw;
        const startTime = Date.now();

        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const additional = tokensPerSecond.mul(elapsed).mul(plantsStaked);
            const total = currentPending.add(additional);
            const formatted = parseFloat(ethers.utils.formatUnits(total, 18));
            
            if (formatted >= 1_000_000) {
                setRealTimePending(`${(formatted / 1_000_000).toFixed(4)}M`);
            } else if (formatted >= 1_000) {
                setRealTimePending(`${(formatted / 1_000).toFixed(2)}K`);
            } else {
                setRealTimePending(formatted.toFixed(4));
            }
        }, 100);

        return () => clearInterval(interval);
    }, [newStakingStats, newStakingOpen]);

    const handlePlayPause = () => setIsPlaying((prev) => !prev);
    const handleNextTrack = () => setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
    const handlePrevTrack = () => setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);

    useEffect(() => {
        if (!isMiniAppReady) setMiniAppReady();
        (async () => {
            try { await sdk.actions.ready(); } catch {}
        })();
    }, [isMiniAppReady, setMiniAppReady]);

    const shortAddr = (addr?: string | null) => addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

    async function ensureWallet() {
        if (signer && provider && userAddress) {
            return { signer, provider, userAddress, isMini: usingMiniApp };
        }

        try {
            setConnecting(true);
            let p: ethers.providers.Web3Provider;
            let s: ethers.Signer;
            let addr: string;
            let isMini = false;
            let ethProv: any | null = null;

            try { ethProv = await sdk.wallet.getEthereumProvider(); } catch { ethProv = null; }

            if (ethProv) {
                isMini = true;
                setUsingMiniApp(true);
                setMiniAppEthProvider(ethProv);
                p = new ethers.providers.Web3Provider(ethProv as any, "any");
                s = p.getSigner();
                addr = await s.getAddress();
            } else {
                setUsingMiniApp(false);
                const anyWindow = window as any;
                if (!anyWindow.ethereum) {
                    setMintStatus("No wallet found. Open this in the Farcaster app or install a browser wallet.");
                    setConnecting(false);
                    return null;
                }
                await anyWindow.ethereum.request({ method: "eth_requestAccounts" });
                p = new ethers.providers.Web3Provider(anyWindow.ethereum, "any");
                s = p.getSigner();
                addr = await s.getAddress();
            }

            const net = await p.getNetwork();
            if (net.chainId !== CHAIN_ID) {
                if (isMini) {
                    setMintStatus("Please switch your Farcaster wallet to Base.");
                } else {
                    const anyWindow = window as any;
                    if (anyWindow.ethereum?.request) {
                        try {
                            await anyWindow.ethereum.request({
                                method: "wallet_switchEthereumChain",
                                params: [{ chainId: "0x2105" }],
                            });
                        } catch {}
                    }
                }
            }

            setProvider(p);
            setSigner(s);
            setUserAddress(addr);
            setConnecting(false);
            return { signer: s, provider: p, userAddress: addr, isMini };
        } catch (err) {
            console.error("Wallet connect failed:", err);
            setMintStatus(usingMiniApp 
                ? "Could not connect Farcaster wallet. Make sure the mini app has wallet permissions."
                : "Wallet connect failed. Check your wallet and try again."
            );
            setConnecting(false);
            return null;
        }
    }

    async function sendWalletCalls(from: string, to: string, data: string): Promise<ethers.providers.TransactionResponse> {
        if (!usingMiniApp || !miniAppEthProvider) throw new Error("wallet_sendCalls not available");
        const req = miniAppEthProvider.request?.bind(miniAppEthProvider) ?? miniAppEthProvider.send?.bind(miniAppEthProvider);
        if (!req) throw new Error("Mini app provider missing request/send");

        const chainIdHex = ethers.utils.hexValue(CHAIN_ID);
        const result = await req({
            method: "wallet_sendCalls",
            params: [{ from, chainId: chainIdHex, atomicRequired: false, calls: [{ to, data, value: "0x0" }] }],
        });

        const txHash = (result?.txHashes && result.txHashes[0]) || result?.txHash || result?.hash || "0x";
        if (!txHash || typeof txHash !== "string" || txHash.length !== 66) {
            throw new Error("wallet_sendCalls did not return a valid tx hash");
        }
        return { hash: txHash, wait: async () => {} } as any;
    }

    async function sendMultipleWalletCalls(from: string, calls: Array<{to: string, data: string}>): Promise<ethers.providers.TransactionResponse> {
        if (!usingMiniApp || !miniAppEthProvider) throw new Error("wallet_sendCalls not available");
        const req = miniAppEthProvider.request?.bind(miniAppEthProvider) ?? miniAppEthProvider.send?.bind(miniAppEthProvider);
        if (!req) throw new Error("Mini app provider missing request/send");

        const chainIdHex = ethers.utils.hexValue(CHAIN_ID);
        const result = await req({
            method: "wallet_sendCalls",
            params: [{ 
                from, 
                chainId: chainIdHex, 
                atomicRequired: false, 
                calls: calls.map(c => ({ to: c.to, data: c.data, value: "0x0" }))
            }],
        });

        const txHash = (result?.txHashes && result.txHashes[0]) || result?.txHash || result?.hash || "0x";
        if (!txHash || typeof txHash !== "string" || txHash.length !== 66) {
            throw new Error("wallet_sendCalls did not return a valid tx hash");
        }
        return { hash: txHash, wait: async () => {} } as any;
    }

    async function sendContractTx(to: string, data: string): Promise<ethers.providers.TransactionResponse | null> {
        const ctx = await ensureWallet();
        if (!ctx) return null;
        if (ctx.isMini && miniAppEthProvider) {
            return await sendWalletCalls(ctx.userAddress, to, data);
        } else {
            return await ctx.signer.sendTransaction({ to, data, value: 0 });
        }
    }

    async function ensureUsdcAllowance(spender: string, required: ethers.BigNumber): Promise<boolean> {
        const ctx = await ensureWallet();
        if (!ctx) return false;
        const { signer: s, userAddress: addr, isMini } = ctx;

        setMintStatus("Checking USDC…");
        const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, readProvider);
        const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);

        try {
            const bal = await usdcRead.balanceOf(addr);
            if (bal.lt(required)) {
                setMintStatus(`You need at least ${ethers.utils.formatUnits(required, USDC_DECIMALS)} USDC on Base.`);
                return false;
            }
        } catch {}

        let current = ethers.constants.Zero;
        try { current = await usdcRead.allowance(addr, spender); } catch {}
        if (current.gte(required)) return true;

        setMintStatus("Requesting USDC approval…");
        try {
            if (isMini && miniAppEthProvider) {
                const data = usdcInterface.encodeFunctionData("approve", [spender, required]);
                await sendWalletCalls(addr, USDC_ADDRESS, data);
                setMintStatus("Waiting for approval…");
                for (let i = 0; i < 20; i++) {
                    await new Promise((res) => setTimeout(res, 1500));
                    try {
                        const updated = await usdcRead.allowance(addr, spender);
                        if (updated.gte(required)) break;
                        if (i === 19) { setMintStatus("Approval not confirmed."); return false; }
                    } catch { if (i === 19) { setMintStatus("Approval failed."); return false; } }
                }
            } else {
                const tx = await usdcWrite.approve(spender, required);
                await waitForTx(tx);
            }
            return true;
        } catch (err) {
            setMintStatus("USDC approval failed");
            return false;
        }
    }

    async function handleMintLand() {
        try {
            setMintStatus("Minting Land (199.99 USDC)…");
            if (!(await ensureUsdcAllowance(LAND_ADDRESS, LAND_PRICE_USDC))) return;
            const tx = await sendContractTx(LAND_ADDRESS, landInterface.encodeFunctionData("mint", []));
            if (!tx) return;
            setMintStatus("Land mint sent…");
            await waitForTx(tx);
            setMintStatus("Land minted ✅");
        } catch (err: any) {
            setMintStatus(`Land mint failed: ${err?.message || err}`);
        }
    }

    async function handleMintPlant() {
        try {
            setMintStatus("Minting Plant (49.99 USDC)…");
            if (!(await ensureUsdcAllowance(PLANT_ADDRESS, PLANT_PRICE_USDC))) return;
            const tx = await sendContractTx(PLANT_ADDRESS, plantInterface.encodeFunctionData("mint", []));
            if (!tx) return;
            setMintStatus("Plant mint sent…");
            await waitForTx(tx);
            setMintStatus("Plant minted ✅");
        } catch (err: any) {
            setMintStatus(`Plant mint failed: ${err?.message || err}`);
        }
    }

    async function handleUpgradeLand() {
        if (!selectedLandForUpgrade) {
            setMintStatus("Select a Land NFT to upgrade.");
            return;
        }

        const ctx = await ensureWallet();
        if (!ctx) return;

        try {
            setActionLoading(true);
            setMintStatus("Preparing Super Land upgrade…");

            const fcweedRead = new ethers.Contract(FCWEED_ADDRESS, ERC20_ABI, readProvider);
            const landRead = new ethers.Contract(LAND_ADDRESS, ERC721_VIEW_ABI, readProvider);

            const fcweedBal = await fcweedRead.balanceOf(ctx.userAddress);
            if (fcweedBal.lt(SUPER_LAND_FCWEED_COST)) {
                setMintStatus("You need 2,000,000 FCWEED to upgrade.");
                setActionLoading(false);
                return;
            }

            const landOwner = await landRead.ownerOf(selectedLandForUpgrade);
            if (landOwner.toLowerCase() !== ctx.userAddress.toLowerCase()) {
                setMintStatus("You don't own this Land NFT.");
                setActionLoading(false);
                return;
            }

            setMintStatus("Approving Land NFT…");
            const landApproved = await landRead.isApprovedForAll(ctx.userAddress, SUPER_LAND_ADDRESS);
            if (!landApproved) {
                const approveData = erc721Interface.encodeFunctionData("setApprovalForAll", [SUPER_LAND_ADDRESS, true]);
                const tx1 = await sendContractTx(LAND_ADDRESS, approveData);
                await waitForTx(tx1);
            }

            setMintStatus("Approving FCWEED…");
            const fcweedAllowance = await fcweedRead.allowance(ctx.userAddress, SUPER_LAND_ADDRESS);
            if (fcweedAllowance.lt(SUPER_LAND_FCWEED_COST)) {
                const approveData = erc20Interface.encodeFunctionData("approve", [SUPER_LAND_ADDRESS, ethers.constants.MaxUint256]);
                const tx2 = await sendContractTx(FCWEED_ADDRESS, approveData);
                await waitForTx(tx2);
            }

            setMintStatus("Upgrading to Super Land…");
            const upgradeData = superLandInterface.encodeFunctionData("upgrade", [selectedLandForUpgrade]);
            const tx3 = await sendContractTx(SUPER_LAND_ADDRESS, upgradeData);
            await waitForTx(tx3);

            setMintStatus("Super Land minted ✅");
            setUpgradeModalOpen(false);
            setSelectedLandForUpgrade(null);
            ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
        } catch (err: any) {
            setMintStatus(`Upgrade failed: ${err?.message || err}`);
        } finally {
            setActionLoading(false);
        }
    }

    function toHttpFromMaybeIpfs(uri: string): string {
        if (!uri) return "";
        if (uri.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${uri.slice(7)}`;
        return uri;
    }

    async function loadOwnedTokens(nftAddress: string, owner: string, maxSupply: number = 1111): Promise<number[]> {
        try {
            const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, readProvider);
            const balBn: ethers.BigNumber = await nft.balanceOf(owner);
            const bal = balBn.toNumber();
            if (bal === 0) return [];

            let total = maxSupply;
            try {
                const totalBn: ethers.BigNumber = await nft.totalSupply();
                total = Math.min(totalBn.toNumber(), maxSupply);
            } catch {}

            const ids: number[] = [];
            const ownerLower = owner.toLowerCase();
            for (let tokenId = 1; tokenId <= total && ids.length < bal; tokenId++) {
                try {
                    const who: string = await nft.ownerOf(tokenId);
                    if (who.toLowerCase() === ownerLower) ids.push(tokenId);
                } catch {}
            }
            return ids;
        } catch {
            return [];
        }
    }

    async function fetchNftImages(nftAddress: string, ids: number[], fallback: string, existing: Record<number, string>): Promise<Record<number, string>> {
        const out: Record<number, string> = { ...existing };
        const missing = ids.filter((id) => !out[id]);
        if (missing.length === 0) return out;

        const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, readProvider);
        await Promise.all(missing.map(async (id) => {
            try {
                const uri: string = await nft.tokenURI(id);
                const res = await fetch(toHttpFromMaybeIpfs(uri));
                if (res.ok) {
                    const meta = await res.json();
                    out[id] = meta.image ? toHttpFromMaybeIpfs(meta.image) : fallback;
                } else {
                    out[id] = fallback;
                }
            } catch {
                out[id] = fallback;
            }
        }));
        return out;
    }

    const refreshOldStakingRef = useRef(false);

    async function refreshOldStaking() {
        if (!oldStakingOpen || refreshOldStakingRef.current) return;
        refreshOldStakingRef.current = true;

        let addr = userAddress;
        if (!addr) {
            const ctx = await ensureWallet();
            if (!ctx) { refreshOldStakingRef.current = false; return; }
            addr = ctx.userAddress;
        }

        setLoadingOldStaking(true);
        try {
            const staking = new ethers.Contract(OLD_STAKING_ADDRESS, OLD_STAKING_ABI, readProvider);
            const [user, pendingRaw, stakedPlantIds, stakedLandIds, landBps, claimEnabled, landEnabled] = await Promise.all([
                staking.users(addr),
                staking.pending(addr),
                staking.plantsOf(addr),
                staking.landsOf(addr),
                staking.landBoostBps(),
                staking.claimEnabled(),
                staking.landStakingEnabled(),
            ]);

            const plantsStaked = Number(user.plants);
            const landsStaked = Number(user.lands);
            const totalSlots = 1 + landsStaked * 3;
            const landBoostPct = (landsStaked * Number(landBps)) / 100;

            setOldStakedPlants(stakedPlantIds.map((x: any) => Number(x)));
            setOldStakedLands(stakedLandIds.map((x: any) => Number(x)));
            setOldLandStakingEnabled(landEnabled);

            setOldStakingStats({
                plantsStaked,
                landsStaked,
                totalSlots,
                capacityUsed: plantsStaked,
                landBoostPct,
                pendingFormatted: ethers.utils.formatUnits(pendingRaw, 18),
                pendingRaw,
                claimEnabled,
            });

            if (ownedCacheRef.current.addr !== addr) {
                const [pOwned, lOwned, slOwned] = await Promise.all([
                    loadOwnedTokens(PLANT_ADDRESS, addr, 1111),
                    loadOwnedTokens(LAND_ADDRESS, addr, 420),
                    loadOwnedTokens(SUPER_LAND_ADDRESS, addr, 99),
                ]);
                ownedCacheRef.current = { addr, plants: pOwned, lands: lOwned, superLands: slOwned };
            }

            const stakedPlantSet = new Set(stakedPlantIds.map((x: any) => Number(x)));
            const stakedLandSet = new Set(stakedLandIds.map((x: any) => Number(x)));
            setAvailablePlants(ownedCacheRef.current.plants.filter((id) => !stakedPlantSet.has(id)));
            setAvailableLands(ownedCacheRef.current.lands.filter((id) => !stakedLandSet.has(id)));
            setAvailableSuperLands(ownedCacheRef.current.superLands);

        } catch (err) {
            console.error("Old staking refresh failed:", err);
        } finally {
            refreshOldStakingRef.current = false;
            setLoadingOldStaking(false);
        }
    }

    const refreshNewStakingRef = useRef(false);

    async function refreshNewStaking() {
        if (!newStakingOpen || refreshNewStakingRef.current) return;
        refreshNewStakingRef.current = true;

        let addr = userAddress;
        if (!addr) {
            const ctx = await ensureWallet();
            if (!ctx) { refreshNewStakingRef.current = false; return; }
            addr = ctx.userAddress;
        }

        setLoadingNewStaking(true);
        try {
            const staking = new ethers.Contract(NEW_STAKING_ADDRESS, NEW_STAKING_ABI, readProvider);
            const [user, pendingRaw, stakedPlantIds, stakedLandIds, stakedSuperLandIds, tokensPerDay, totalBoostBps, capacity, claimEnabled, landEnabled, superLandEnabled] = await Promise.all([
                staking.users(addr),
                staking.pending(addr),
                staking.plantsOf(addr),
                staking.landsOf(addr),
                staking.superLandsOf(addr),
                staking.tokensPerPlantPerDay(),
                staking.getBoostBps(addr),
                staking.capacityOf(addr),
                staking.claimEnabled(),
                staking.landStakingEnabled(),
                staking.superLandStakingEnabled(),
            ]);

            const plantsStaked = Number(user.plants);
            const landsStaked = Number(user.lands);
            const superLandsStaked = Number(user.superLands);
            const totalSlots = Number(capacity);
            const totalBoostPct = Number(totalBoostBps) / 100;
            const tokensPerSecond = tokensPerDay.div(86400);

            const dailyBase = tokensPerDay.mul(plantsStaked);
            const dailyWithBoost = dailyBase.mul(totalBoostBps).div(10000);
            const dailyFormatted = parseFloat(ethers.utils.formatUnits(dailyWithBoost, 18));

            setNewStakedPlants(stakedPlantIds.map((x: any) => Number(x)));
            setNewStakedLands(stakedLandIds.map((x: any) => Number(x)));
            setNewStakedSuperLands(stakedSuperLandIds.map((x: any) => Number(x)));
            setNewLandStakingEnabled(landEnabled);
            setNewSuperLandStakingEnabled(superLandEnabled);

            setNewStakingStats({
                plantsStaked,
                landsStaked,
                superLandsStaked,
                totalSlots,
                capacityUsed: plantsStaked,
                totalBoostPct,
                pendingFormatted: ethers.utils.formatUnits(pendingRaw, 18),
                pendingRaw,
                dailyRewards: dailyFormatted >= 1_000_000 ? `${(dailyFormatted / 1_000_000).toFixed(2)}M` : dailyFormatted >= 1000 ? `${(dailyFormatted / 1000).toFixed(1)}K` : dailyFormatted.toFixed(0),
                claimEnabled,
                tokensPerSecond,
            });

            if (ownedCacheRef.current.addr !== addr) {
                const [pOwned, lOwned, slOwned] = await Promise.all([
                    loadOwnedTokens(PLANT_ADDRESS, addr, 1111),
                    loadOwnedTokens(LAND_ADDRESS, addr, 420),
                    loadOwnedTokens(SUPER_LAND_ADDRESS, addr, 99),
                ]);
                ownedCacheRef.current = { addr, plants: pOwned, lands: lOwned, superLands: slOwned };
            }

            const stakedPlantSet = new Set(stakedPlantIds.map((x: any) => Number(x)));
            const stakedLandSet = new Set(stakedLandIds.map((x: any) => Number(x)));
            const stakedSuperLandSet = new Set(stakedSuperLandIds.map((x: any) => Number(x)));
            setAvailablePlants(ownedCacheRef.current.plants.filter((id) => !stakedPlantSet.has(id)));
            setAvailableLands(ownedCacheRef.current.lands.filter((id) => !stakedLandSet.has(id)));
            setAvailableSuperLands(ownedCacheRef.current.superLands.filter((id) => !stakedSuperLandSet.has(id)));

        } catch (err) {
            console.error("New staking refresh failed:", err);
        } finally {
            refreshNewStakingRef.current = false;
            setLoadingNewStaking(false);
        }
    }

    useEffect(() => {
        if (oldStakingOpen) {
            refreshOldStaking();
            const interval = setInterval(refreshOldStaking, 30000);
            return () => clearInterval(interval);
        }
    }, [oldStakingOpen]);

    useEffect(() => {
        if (newStakingOpen) {
            refreshNewStaking();
            const interval = setInterval(refreshNewStaking, 30000);
            return () => clearInterval(interval);
        }
    }, [newStakingOpen]);

    async function refreshCrimeLadder() {
        setLadderLoading(true);
        try {
            const staking = new ethers.Contract(NEW_STAKING_ADDRESS, NEW_STAKING_ABI, readProvider);
            const [tokensPerPlantPerDayBn, latestBlock] = await Promise.all([
                staking.tokensPerPlantPerDay(),
                readProvider.getBlockNumber(),
            ]);

            if (usingMiniApp && !userAddress) {
                setFarmerCount(0);
                setWalletRank(null);
                setWalletRow(null);
                setLadderRows([]);
                return;
            }

            const SAFE_WINDOW = usingMiniApp ? 120000 : 500000;
            const fromBlock = Math.max(latestBlock - SAFE_WINDOW, 0);

            let plantLogs: any[] = [];
            let landLogs: any[] = [];

            try {
                plantLogs = await readProvider.getLogs({ address: PLANT_ADDRESS, fromBlock, toBlock: latestBlock, topics: [ERC721_TRANSFER_TOPIC] });
            } catch {}
            try {
                landLogs = await readProvider.getLogs({ address: LAND_ADDRESS, fromBlock, toBlock: latestBlock, topics: [ERC721_TRANSFER_TOPIC] });
            } catch {}

            const addrSet = new Set<string>();
            if (userAddress) addrSet.add(userAddress.toLowerCase());

            for (const log of [...plantLogs, ...landLogs]) {
                if (log.topics.length >= 3) {
                    const fromTopic = log.topics[1];
                    const toTopic = log.topics[2];
                    if (fromTopic?.length === 66) addrSet.add(("0x" + fromTopic.slice(26)).toLowerCase());
                    if (toTopic?.length === 66) addrSet.add(("0x" + toTopic.slice(26)).toLowerCase());
                }
            }

            const rows: FarmerRow[] = [];
            await Promise.all(Array.from(addrSet).map(async (addr) => {
                try {
                    const u = await staking.users(addr);
                    const plants = Number(u.plants);
                    const lands = Number(u.lands);
                    const superLands = Number(u.superLands);
                    if (plants === 0 && lands === 0 && superLands === 0) return;

                    const totalBoostBps = await staking.getBoostBps(addr);
                    const capacity = await staking.capacityOf(addr);
                    
                    const dailyBase = tokensPerPlantPerDayBn.mul(plants);
                    const dailyWithBoost = dailyBase.mul(totalBoostBps).div(10000);
                    const dailyFloat = parseFloat(ethers.utils.formatUnits(dailyWithBoost, 18));
                    const boostPct = Number(totalBoostBps) / 100;

                    rows.push({
                        addr,
                        plants,
                        lands,
                        superLands,
                        boostPct,
                        capacity: `${plants}/${Number(capacity)}`,
                        daily: dailyFloat >= 1_000_000 ? `${(dailyFloat / 1_000_000).toFixed(2)}M` : dailyFloat.toLocaleString(undefined, { maximumFractionDigits: 0 }),
                        dailyRaw: dailyFloat,
                    });
                } catch {}
            }));

            rows.sort((a, b) => b.dailyRaw - a.dailyRaw);
            setFarmerCount(rows.length);

            if (userAddress) {
                const idx = rows.findIndex((r) => r.addr.toLowerCase() === userAddress.toLowerCase());
                setWalletRank(idx !== -1 ? idx + 1 : null);
                setWalletRow(idx !== -1 ? rows[idx] : null);
            }

            setLadderRows(rows.slice(0, 10));
        } catch {
            setLadderRows([]);
            setWalletRank(null);
            setWalletRow(null);
            setFarmerCount(0);
        } finally {
            setLadderLoading(false);
        }
    }

    useEffect(() => { refreshCrimeLadder(); }, []);
    useEffect(() => { if (userAddress) refreshCrimeLadder(); }, [userAddress]);

    async function ensureCollectionApproval(collectionAddress: string, stakingAddress: string, ctx: { signer: ethers.Signer; userAddress: string }) {
        const nftRead = new ethers.Contract(collectionAddress, ERC721_VIEW_ABI, readProvider);
        const approved: boolean = await nftRead.isApprovedForAll(ctx.userAddress, stakingAddress);
        if (!approved) {
            const data = erc721Interface.encodeFunctionData("setApprovalForAll", [stakingAddress, true]);
            const tx = await sendContractTx(collectionAddress, data);
            if (!tx) throw new Error("Approval rejected");
            await waitForTx(tx);
        }
    }

    async function handleOldStakeSelected() {
        const ctx = await ensureWallet();
        if (!ctx) return;

        const toStakePlants = selectedAvailPlants;
        const toStakeLands = selectedAvailLands;

        if (toStakePlants.length === 0 && toStakeLands.length === 0) {
            setMintStatus("No NFTs selected.");
            return;
        }

        try {
            setActionLoading(true);
            if (toStakePlants.length > 0) {
                await ensureCollectionApproval(PLANT_ADDRESS, OLD_STAKING_ADDRESS, ctx);
                const data = oldStakingInterface.encodeFunctionData("stakePlants", [toStakePlants.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, data));
            }
            if (toStakeLands.length > 0 && oldLandStakingEnabled) {
                await ensureCollectionApproval(LAND_ADDRESS, OLD_STAKING_ADDRESS, ctx);
                const data = oldStakingInterface.encodeFunctionData("stakeLands", [toStakeLands.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, data));
            }
            setSelectedAvailPlants([]);
            setSelectedAvailLands([]);
            ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
            await refreshOldStaking();
            await refreshCrimeLadder();
        } catch (err) {
            console.error("Stake error:", err);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleOldUnstakeSelected() {
        const ctx = await ensureWallet();
        if (!ctx) return;

        const toUnstakePlants = selectedOldStakedPlants;
        const toUnstakeLands = selectedOldStakedLands;

        if (toUnstakePlants.length === 0 && toUnstakeLands.length === 0) {
            setMintStatus("No NFTs selected.");
            return;
        }

        try {
            setActionLoading(true);
            if (toUnstakePlants.length > 0) {
                const data = oldStakingInterface.encodeFunctionData("unstakePlants", [toUnstakePlants.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, data));
            }
            if (toUnstakeLands.length > 0) {
                const data = oldStakingInterface.encodeFunctionData("unstakeLands", [toUnstakeLands.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, data));
            }
            setSelectedOldStakedPlants([]);
            setSelectedOldStakedLands([]);
            ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
            await refreshOldStaking();
            await refreshCrimeLadder();
        } catch (err) {
            console.error("Unstake error:", err);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleOldClaim() {
        const ctx = await ensureWallet();
        if (!ctx) return;
        if (!oldStakingStats || parseFloat(oldStakingStats.pendingFormatted) <= 0) {
            setMintStatus("No pending rewards.");
            return;
        }
        try {
            setActionLoading(true);
            const data = oldStakingInterface.encodeFunctionData("claim", []);
            await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, data));
            await refreshOldStaking();
        } catch (err) {
            console.error("Claim error:", err);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleNewStakeSelected() {
        const ctx = await ensureWallet();
        if (!ctx) return;

        const toStakePlants = selectedAvailPlants;
        const toStakeLands = selectedAvailLands;
        const toStakeSuperLands = selectedAvailSuperLands;

        if (toStakePlants.length === 0 && toStakeLands.length === 0 && toStakeSuperLands.length === 0) {
            setMintStatus("No NFTs selected.");
            return;
        }

        try {
            setActionLoading(true);
            if (toStakePlants.length > 0) {
                await ensureCollectionApproval(PLANT_ADDRESS, NEW_STAKING_ADDRESS, ctx);
                const data = newStakingInterface.encodeFunctionData("stakePlants", [toStakePlants.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, data));
            }
            if (toStakeLands.length > 0 && newLandStakingEnabled) {
                await ensureCollectionApproval(LAND_ADDRESS, NEW_STAKING_ADDRESS, ctx);
                const data = newStakingInterface.encodeFunctionData("stakeLands", [toStakeLands.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, data));
            }
            if (toStakeSuperLands.length > 0 && newSuperLandStakingEnabled) {
                await ensureCollectionApproval(SUPER_LAND_ADDRESS, NEW_STAKING_ADDRESS, ctx);
                const data = newStakingInterface.encodeFunctionData("stakeSuperLands", [toStakeSuperLands.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, data));
            }
            setSelectedAvailPlants([]);
            setSelectedAvailLands([]);
            setSelectedAvailSuperLands([]);
            ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
            await refreshNewStaking();
            await refreshCrimeLadder();
        } catch (err) {
            console.error("Stake error:", err);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleNewUnstakeSelected() {
        const ctx = await ensureWallet();
        if (!ctx) return;

        const toUnstakePlants = selectedNewStakedPlants;
        const toUnstakeLands = selectedNewStakedLands;
        const toUnstakeSuperLands = selectedNewStakedSuperLands;

        if (toUnstakePlants.length === 0 && toUnstakeLands.length === 0 && toUnstakeSuperLands.length === 0) {
            setMintStatus("No NFTs selected.");
            return;
        }

        try {
            setActionLoading(true);
            if (toUnstakePlants.length > 0) {
                const data = newStakingInterface.encodeFunctionData("unstakePlants", [toUnstakePlants.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, data));
            }
            if (toUnstakeLands.length > 0) {
                const data = newStakingInterface.encodeFunctionData("unstakeLands", [toUnstakeLands.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, data));
            }
            if (toUnstakeSuperLands.length > 0) {
                const data = newStakingInterface.encodeFunctionData("unstakeSuperLands", [toUnstakeSuperLands.map((id) => ethers.BigNumber.from(id))]);
                await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, data));
            }
            setSelectedNewStakedPlants([]);
            setSelectedNewStakedLands([]);
            setSelectedNewStakedSuperLands([]);
            ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
            await refreshNewStaking();
            await refreshCrimeLadder();
        } catch (err) {
            console.error("Unstake error:", err);
        } finally {
            setActionLoading(false);
        }
    }

    async function handleNewClaim() {
        const ctx = await ensureWallet();
        if (!ctx) return;
        if (!newStakingStats || parseFloat(newStakingStats.pendingFormatted) <= 0) {
            setMintStatus("No pending rewards.");
            return;
        }
        try {
            setActionLoading(true);
            const data = newStakingInterface.encodeFunctionData("claim", []);
            await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, data));
            await refreshNewStaking();
        } catch (err) {
            console.error("Claim error:", err);
        } finally {
            setActionLoading(false);
        }
    }

    const connected = !!userAddress;

    const toggleId = (id: number, list: number[], setter: (v: number[]) => void) => {
        if (list.includes(id)) setter(list.filter((x) => x !== id));
        else setter([...list, id]);
    };

    const oldPendingDisplay = useMemo(() => {
        if (!oldStakingStats) return "0.00";
        const v = parseFloat(oldStakingStats.pendingFormatted);
        if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
        return v.toFixed(2);
    }, [oldStakingStats]);

    return (
        <div className={styles.page} onPointerDown={() => { if (!isPlaying && audioRef.current) audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {}); }}>
            <header className={styles.headerWrapper}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, flexShrink: 0 }}>
                    <div className={styles.brand}>
                        <span className={styles.liveDot} />
                        <span className={styles.brandText}>FCWEED</span>
                    </div>
                    <button type="button" disabled={connecting} onClick={() => void ensureWallet()} style={{ padding: "4px 12px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)", background: connected ? "rgba(0, 200, 130, 0.18)" : "rgba(39, 95, 255, 0.55)", fontSize: 12, fontWeight: 500, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>
                        {shortAddr(userAddress)}
                    </button>
                </div>

                <div className={styles.headerRight}>
                    <button className={styles.iconButton} type="button" onClick={() => window.open("https://x.com/x420Ponzi", "_blank")}>𝕏</button>
                    <div className={styles.radioPill}>
                        <span className={styles.radioLabel}>Radio</span>
                        <div className={styles.radioTitleWrap}><span className={styles.radioTitleInner}>{currentTrackMeta.title}</span></div>
                        <button type="button" className={styles.iconButtonSmall} onClick={handlePrevTrack}>‹</button>
                        <button type="button" className={styles.iconButtonSmall} onClick={handlePlayPause}>{isPlaying ? "❚❚" : "▶"}</button>
                        <button type="button" className={styles.iconButtonSmall} onClick={handleNextTrack}>›</button>
                    </div>
                    <audio ref={audioRef} src={currentTrackMeta.src} onEnded={handleNextTrack} autoPlay style={{ display: "none" }} />
                </div>
            </header>

            <main className={styles.main}>
                <section className={styles.heroCard}>
                    <div className={styles.heroMedia}>
                        <Image priority src="/hero.png" alt="x420 Ponzi Plants" width={320} height={320} className={styles.heroImage} />
                    </div>
                    <div className={styles.heroMain}>
                        <h1 className={styles.title}>FCWEED Farming on Base</h1>
                        <p className={styles.subtitle}>
                            Stake-to-earn Farming — Powered by FCWEED on Base<br />
                            Collect Land &amp; Plant NFTs, stake them to grow yields.<br />
                            Upgrade to <span className={styles.highlight}>Super Land</span> for 12% boost!
                        </p>
                        <p style={{ marginTop: 8, fontSize: 13, fontWeight: 600, opacity: 0.95 }}>
                            Mint 1 Plant to begin your Crime Empire
                        </p>

                        <div className={styles.ctaRow}>
                            <button type="button" className={styles.btnPrimary} onClick={handleMintLand} disabled={connecting}>Mint Land</button>
                            <button type="button" className={styles.btnPrimary} onClick={handleMintPlant} disabled={connecting}>Mint Plant</button>
                        </div>
                        <div className={styles.ctaRow} style={{ marginTop: 8 }}>
                            <button type="button" className={styles.btnPrimary} onClick={() => setOldStakingOpen(true)} style={{ background: "linear-gradient(to right, #6b7280, #9ca3af)" }}>Old Staking</button>
                            <button type="button" className={styles.btnPrimary} onClick={() => setNewStakingOpen(true)}>New Staking</button>
                        </div>

                        {mintStatus && <p style={{ marginTop: 8, fontSize: 12, opacity: 0.9, maxWidth: 420 }}>{mintStatus}</p>}

                        <div className={styles.ctaRowSecondary}>
                            <button type="button" className={styles.btnSecondary} onClick={() => window.open("https://opensea.io/collection/x420-land-763750895", "_blank")}>Trade Land</button>
                            <button type="button" className={styles.btnSecondary} onClick={() => window.open("https://opensea.io/collection/x420-plants", "_blank")}>Trade Plant</button>
                            <button type="button" className={styles.btnSecondary} onClick={() => window.open("https://dexscreener.com/base/0xa1a1b6b489ceb413999ccce73415d4fa92e826a1", "_blank")}>Trade ${TOKEN_SYMBOL}</button>
                        </div>
                    </div>
                </section>

                <section style={{ margin: "18px 0", display: "flex", justifyContent: "center" }}>
                    <Image src={GIFS[gifIndex]} alt="FCWEED Radio" width={320} height={120} style={{ borderRadius: 16, objectFit: "cover" }} />
                </section>

                <section className={styles.infoCard}>
                    <h2 className={styles.heading}>How it Works</h2>
                    <ul className={styles.bulletList}>
                        <li>Connect your wallet on Base to begin.</li>
                        <li>Mint Plant NFTs and stake them for yield.</li>
                        <li>Mint Land NFTs — each gives <b>+3 plant slots</b> and <b>+2.5% boost</b>.</li>
                        <li>Upgrade Land to <b>Super Land</b> — burn 1 Land + 2M FCWEED for <b>+12% boost</b>!</li>
                        <li>Use <b>New Staking</b> for Super Land support.</li>
                    </ul>
                </section>

                <section className={styles.infoCard}>
                    <h2 className={styles.heading}>Crime Ladder — Top Farmers</h2>
                    {connected && farmerCount > 0 && (
                        <div style={{ fontSize: 12, margin: "4px 0 10px", padding: "6px 8px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(5,8,20,0.8)" }}>
                            {walletRow && walletRank ? (
                                <>
                                    <div style={{ marginBottom: 4 }}>Your rank: <b>#{walletRank}</b> / {farmerCount}</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, opacity: 0.9 }}>
                                        <span>Plants: <b>{walletRow.plants}</b></span>
                                        <span>Land: <b>{walletRow.lands}</b></span>
                                        <span>Super: <b>{walletRow.superLands}</b></span>
                                        <span>Boost: <b>+{(walletRow.boostPct - 100).toFixed(1)}%</b></span>
                                        <span>Daily: <b>{walletRow.daily}</b></span>
                                    </div>
                                </>
                            ) : <span>Stake to appear on the ladder.</span>}
                        </div>
                    )}
                    {ladderLoading ? <p style={{ fontSize: 13, opacity: 0.8 }}>Loading…</p> : ladderRows.length === 0 ? <p style={{ fontSize: 13, opacity: 0.8 }}>Stake to appear.</p> : (
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: "left", padding: "4px" }}>#</th>
                                        <th style={{ textAlign: "left", padding: "4px" }}>Farmer</th>
                                        <th style={{ textAlign: "right", padding: "4px" }}>Plants</th>
                                        <th style={{ textAlign: "right", padding: "4px" }}>Land</th>
                                        <th style={{ textAlign: "right", padding: "4px" }}>Super</th>
                                        <th style={{ textAlign: "right", padding: "4px" }}>Boost</th>
                                        <th style={{ textAlign: "right", padding: "4px" }}>Daily</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ladderRows.map((row, idx) => (
                                        <tr key={row.addr}>
                                            <td style={{ padding: "4px" }}>{idx + 1}</td>
                                            <td style={{ padding: "4px" }}>{row.addr.slice(0, 6)}…{row.addr.slice(-4)}</td>
                                            <td style={{ padding: "4px", textAlign: "right" }}>{row.plants}</td>
                                            <td style={{ padding: "4px", textAlign: "right" }}>{row.lands}</td>
                                            <td style={{ padding: "4px", textAlign: "right" }}>{row.superLands}</td>
                                            <td style={{ padding: "4px", textAlign: "right" }}>+{(row.boostPct - 100).toFixed(1)}%</td>
                                            <td style={{ padding: "4px", textAlign: "right" }}>{row.daily}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>

            <footer className={styles.footer}><span>© 2025 FCWEED</span></footer>

            {oldStakingOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 900, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflowY: "auto" }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>Old Staking (Legacy)</h2>
                            <button type="button" className={styles.modalClose} onClick={() => setOldStakingOpen(false)}>✕</button>
                        </header>
                        <p style={{ fontSize: 11, color: "#f87171", marginBottom: 8 }}>⚠️ Please migrate to New Staking for Super Land support.</p>
                        <div className={styles.modalStatsGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))" }}>
                            <div className={styles.statCard}><span className={styles.statLabel}>Plants</span><span className={styles.statValue}>{oldStakingStats?.plantsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Lands</span><span className={styles.statValue}>{oldStakingStats?.landsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Capacity</span><span className={styles.statValue}>{oldStakingStats ? `${oldStakingStats.capacityUsed}/${oldStakingStats.totalSlots}` : "0/1"}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Boost</span><span className={styles.statValue}>+{oldStakingStats?.landBoostPct.toFixed(1) || 0}%</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Pending</span><span className={styles.statValue}>{oldPendingDisplay}</span></div>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 12 }}>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleOldStakeSelected} style={{ flex: 1 }}>Stake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleOldUnstakeSelected} style={{ flex: 1 }}>Unstake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !oldStakingStats?.claimEnabled} onClick={handleOldClaim} style={{ flex: 1 }}>Claim</button>
                        </div>
                    </div>
                </div>
            )}

            {newStakingOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 900, width: "95%", maxHeight: "90vh", display: "flex", flexDirection: "column", overflowY: "auto" }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>New Staking</h2>
                            <div style={{ display: "flex", gap: 8 }}>
                                <button type="button" className={styles.btnPrimary} onClick={() => setUpgradeModalOpen(true)} style={{ padding: "6px 14px", fontSize: 12, background: "linear-gradient(to right, #f59e0b, #fbbf24)" }}>🔥 Upgrade Land</button>
                                <button type="button" className={styles.modalClose} onClick={() => setNewStakingOpen(false)}>✕</button>
                            </div>
                        </header>
                        <div className={styles.modalStatsGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))" }}>
                            <div className={styles.statCard}><span className={styles.statLabel}>Plants</span><span className={styles.statValue}>{newStakingStats?.plantsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Lands</span><span className={styles.statValue}>{newStakingStats?.landsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Super Lands</span><span className={styles.statValue}>{newStakingStats?.superLandsStaked || 0}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Capacity</span><span className={styles.statValue}>{newStakingStats ? `${newStakingStats.capacityUsed}/${newStakingStats.totalSlots}` : "0/1"}</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Total Boost</span><span className={styles.statValue}>+{newStakingStats ? (newStakingStats.totalBoostPct - 100).toFixed(1) : 0}%</span></div>
                            <div className={styles.statCard}><span className={styles.statLabel}>Daily Rewards</span><span className={styles.statValue}>{newStakingStats?.dailyRewards || "0"}</span></div>
                            <div className={styles.statCard} style={{ background: "linear-gradient(135deg, #064e3b, #047857)" }}><span className={styles.statLabel}>Pending (Live)</span><span className={styles.statValue} style={{ color: "#34d399" }}>{realTimePending}</span></div>
                        </div>
                        <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 12 }}>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleNewStakeSelected} style={{ flex: 1 }}>Stake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading} onClick={handleNewUnstakeSelected} style={{ flex: 1 }}>Unstake</button>
                            <button type="button" className={styles.btnPrimary} disabled={!connected || actionLoading || !newStakingStats?.claimEnabled} onClick={handleNewClaim} style={{ flex: 1 }}>Claim</button>
                        </div>
                    </div>
                </div>
            )}

            {upgradeModalOpen && (
                <div className={styles.modalBackdrop}>
                    <div className={styles.modal} style={{ maxWidth: 500, width: "90%", padding: 24 }}>
                        <header className={styles.modalHeader}>
                            <h2 className={styles.modalTitle}>🔥 Upgrade to Super Land</h2>
                            <button type="button" className={styles.modalClose} onClick={() => { setUpgradeModalOpen(false); setSelectedLandForUpgrade(null); }}>✕</button>
                        </header>
                        <div style={{ marginTop: 16, fontSize: 14, lineHeight: 1.6, color: "#c0c9f4" }}>
                            <p style={{ marginBottom: 16 }}>To mint a <b style={{ color: "#fbbf24" }}>Super Land NFT</b> and reap its benefits:</p>
                            <ul style={{ marginLeft: 20, marginBottom: 16 }}>
                                <li>Burn <b>1 × Land NFT</b></li>
                                <li>Burn <b>2,000,000 $FCWEED</b></li>
                            </ul>
                            <p style={{ fontSize: 12, opacity: 0.8 }}>Super Land gives +12% boost and +3 plant capacity!</p>
                        </div>
                        {availableLands.length > 0 ? (
                            <div style={{ marginTop: 16 }}>
                                <label style={{ fontSize: 12, marginBottom: 8, display: "block" }}>Select Land to upgrade:</label>
                                <select value={selectedLandForUpgrade || ""} onChange={(e) => setSelectedLandForUpgrade(e.target.value ? Number(e.target.value) : null)} style={{ width: "100%", padding: "10px", borderRadius: 8, background: "#0a1128", border: "1px solid #1f2a4a", color: "#fff", fontSize: 14 }}>
                                    <option value="">-- Select Land --</option>
                                    {availableLands.map((id) => <option key={id} value={id}>Land #{id}</option>)}
                                </select>
                            </div>
                        ) : (
                            <p style={{ marginTop: 16, fontSize: 13, color: "#f87171" }}>You don't own any Land NFTs to upgrade.</p>
                        )}
                        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
                            <button type="button" className={styles.btnPrimary} disabled={!selectedLandForUpgrade || actionLoading} onClick={handleUpgradeLand} style={{ flex: 1, background: "linear-gradient(to right, #f59e0b, #fbbf24)", color: "#000" }}>
                                {actionLoading ? "Processing…" : "Continue"}
                            </button>
                            <button type="button" onClick={() => { setUpgradeModalOpen(false); setSelectedLandForUpgrade(null); }} style={{ flex: 1, padding: "10px", borderRadius: 999, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" }}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
