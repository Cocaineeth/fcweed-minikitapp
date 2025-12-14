"use client";
import { useEffect, useState, useRef, useMemo } from "react";
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

const USDC_ABI = ["function approve(address spender, uint256 amount) returns (bool)","function allowance(address owner, address spender) view returns (uint256)","function balanceOf(address owner) view returns (uint256)"];
const ERC20_ABI = ["function approve(address spender, uint256 amount) returns (bool)","function allowance(address owner, address spender) view returns (uint256)","function balanceOf(address owner) view returns (uint256)"];
const LAND_ABI = ["function mint()"];
const PLANT_ABI = ["function mint()"];
const ERC721_VIEW_ABI = ["function balanceOf(address owner) view returns (uint256)","function ownerOf(uint256 tokenId) view returns (address)","function totalSupply() view returns (uint256)","function tokenURI(uint256 tokenId) view returns (string)","function isApprovedForAll(address owner, address operator) view returns (bool)","function setApprovalForAll(address operator, bool approved)"];
const OLD_STAKING_ABI = ["function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint256 accrued)","function pending(address) view returns (uint256)","function plantsOf(address) view returns (uint256[] memory)","function landsOf(address) view returns (uint256[] memory)","function stakePlants(uint256[] calldata ids)","function unstakePlants(uint256[] calldata ids)","function stakeLands(uint256[] calldata ids)","function unstakeLands(uint256[] calldata ids)","function claim()","function landBoostBps() view returns (uint256)","function tokensPerPlantPerDay() view returns (uint256)","function landStakingEnabled() view returns (bool)","function claimEnabled() view returns (bool)"];
const NEW_STAKING_ABI = ["function users(address) view returns (uint64 last,uint32 plants,uint32 lands,uint32 superLands,uint256 accrued,uint256 bonusBoostBps)","function pending(address) view returns (uint256)","function plantsOf(address) view returns (uint256[] memory)","function landsOf(address) view returns (uint256[] memory)","function superLandsOf(address) view returns (uint256[] memory)","function stakePlants(uint256[] calldata ids)","function unstakePlants(uint256[] calldata ids)","function stakeLands(uint256[] calldata ids)","function unstakeLands(uint256[] calldata ids)","function stakeSuperLands(uint256[] calldata ids)","function unstakeSuperLands(uint256[] calldata ids)","function claim()","function landBoostBps() view returns (uint256)","function superLandBoostBps() view returns (uint256)","function tokensPerPlantPerDay() view returns (uint256)","function landStakingEnabled() view returns (bool)","function superLandStakingEnabled() view returns (bool)","function claimEnabled() view returns (bool)","function capacityOf(address) view returns (uint256)","function getBoostBps(address) view returns (uint256)"];
const SUPER_LAND_ABI = ["function upgrade(uint256 landTokenId)","function upgradeEnabled() view returns (bool)"];

const usdcInterface = new ethers.utils.Interface(USDC_ABI);
const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
const landInterface = new ethers.utils.Interface(LAND_ABI);
const plantInterface = new ethers.utils.Interface(PLANT_ABI);
const oldStakingInterface = new ethers.utils.Interface(OLD_STAKING_ABI);
const newStakingInterface = new ethers.utils.Interface(NEW_STAKING_ABI);
const superLandInterface = new ethers.utils.Interface(SUPER_LAND_ABI);
const erc721Interface = new ethers.utils.Interface(ERC721_VIEW_ABI);

type StakingStats = { plantsStaked: number; landsStaked: number; totalSlots: number; capacityUsed: number; landBoostPct: number; pendingFormatted: string; pendingRaw: ethers.BigNumber; claimEnabled: boolean; };
type NewStakingStats = { plantsStaked: number; landsStaked: number; superLandsStaked: number; totalSlots: number; capacityUsed: number; totalBoostPct: number; pendingFormatted: string; pendingRaw: ethers.BigNumber; dailyRewards: string; claimEnabled: boolean; tokensPerSecond: ethers.BigNumber; };
type FarmerRow = { addr: string; plants: number; lands: number; superLands: number; boostPct: number; capacity: string; daily: string; dailyRaw: number; };

const PLAYLIST = [{ title: "Kendrick Lamar - Untitled 05 (LoVibe Remix)", src: "/audio/track1.mp3" },{ title: "Travis Scott - SDP Interlude", src: "/audio/track2.mp3" },{ title: "Yeat - if we being real", src: "/audio/track3.mp3" }];
const GIFS = ["/fcweed-radio.gif", "/fcweed-radio-2.gif", "/fcweed-radio-3.gif", "/fcweed-radio-4.gif"];
const ERC721_TRANSFER_TOPIC = ethers.utils.id("Transfer(address,address,uint256)");

async function waitForTx(tx: ethers.providers.TransactionResponse | undefined | null) {
  if (!tx) return;
  try { await tx.wait(); } catch (e: any) {
    const msg = e?.reason || e?.error?.message || e?.data?.message || e?.message || "";
    if (msg.includes("does not support") || msg.includes("unsupported")) console.warn("Ignoring:", e);
    else throw e;
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

  const [activeTab, setActiveTab] = useState<"info" | "mint" | "stake" | "crates" | "referrals">("info");
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

  const ownedCacheRef = useRef<{ addr: string | null; plants: number[]; lands: number[]; superLands: number[] }>({ addr: null, plants: [], lands: [], superLands: [] });
  const currentTrackMeta = PLAYLIST[currentTrack];

  useEffect(() => { if (!audioRef.current) return; if (isPlaying) audioRef.current.play().catch(() => setIsPlaying(false)); else if (!audioRef.current.paused) audioRef.current.pause(); }, [isPlaying, currentTrack]);
  useEffect(() => { const id = setInterval(() => setGifIndex((prev) => (prev + 1) % GIFS.length), 5000); return () => clearInterval(id); }, []);
  useEffect(() => { setSelectedOldAvailPlants([]); setSelectedOldAvailLands([]); setSelectedOldStakedPlants([]); setSelectedOldStakedLands([]); setSelectedNewAvailPlants([]); setSelectedNewAvailLands([]); setSelectedNewAvailSuperLands([]); setSelectedNewStakedPlants([]); setSelectedNewStakedLands([]); setSelectedNewStakedSuperLands([]); }, [userAddress]);

  useEffect(() => {
    if (!newStakingStats || !newStakingOpen) return;
    const { pendingRaw, tokensPerSecond, plantsStaked, totalBoostPct } = newStakingStats;
    if (plantsStaked === 0) { setRealTimePending("0.00"); return; }
    const boostBps = Math.round(totalBoostPct * 100);
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const baseAdd = tokensPerSecond.mul(elapsed).mul(plantsStaked);
      const boostedAdd = baseAdd.mul(boostBps).div(10000);
      const total = pendingRaw.add(boostedAdd);
      const formatted = parseFloat(ethers.utils.formatUnits(total, 18));
      if (formatted >= 1_000_000) setRealTimePending((formatted / 1_000_000).toFixed(4) + "M");
      else if (formatted >= 1_000) setRealTimePending((formatted / 1_000).toFixed(2) + "K");
      else setRealTimePending(formatted.toFixed(4));
    }, 100);
    return () => clearInterval(interval);
  }, [newStakingStats, newStakingOpen]);

  useEffect(() => {
    if (!oldStakingStats || !oldStakingOpen) return;
    const { pendingRaw, plantsStaked, landBoostPct } = oldStakingStats;
    if (plantsStaked === 0) { setOldRealTimePending("0.00"); return; }
    const startTime = Date.now();
    const tokensPerDay = ethers.utils.parseUnits("420000", 18);
    const tokensPerSecond = tokensPerDay.div(86400);
    const boostBps = 10000 + Math.round(landBoostPct * 100);
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const baseAdd = tokensPerSecond.mul(elapsed).mul(plantsStaked);
      const boostedAdd = baseAdd.mul(boostBps).div(10000);
      const total = pendingRaw.add(boostedAdd);
      const formatted = parseFloat(ethers.utils.formatUnits(total, 18));
      if (formatted >= 1_000_000) setOldRealTimePending((formatted / 1_000_000).toFixed(4) + "M");
      else if (formatted >= 1_000) setOldRealTimePending((formatted / 1_000).toFixed(2) + "K");
      else setOldRealTimePending(formatted.toFixed(4));
    }, 100);
    return () => clearInterval(interval);
  }, [oldStakingStats, oldStakingOpen]);

  const handlePlayPause = () => setIsPlaying((prev) => !prev);
  const handleNextTrack = () => setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
  const handlePrevTrack = () => setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);

  useEffect(() => { if (!isMiniAppReady) setMiniAppReady(); (async () => { try { await sdk.actions.ready(); } catch {} })(); }, [isMiniAppReady, setMiniAppReady]);

  const shortAddr = (addr?: string | null) => addr ? addr.slice(0, 6) + "…" + addr.slice(-4) : "Connect";

  async function ensureWallet() {
    if (signer && provider && userAddress) return { signer, provider, userAddress, isMini: usingMiniApp };
    try {
      setConnecting(true);
      let p: ethers.providers.Web3Provider, s: ethers.Signer, addr: string, isMini = false, ethProv: any = null;
      try { ethProv = await sdk.wallet.getEthereumProvider(); } catch { ethProv = null; }
      if (ethProv) {
        isMini = true; setUsingMiniApp(true); setMiniAppEthProvider(ethProv);
        p = new ethers.providers.Web3Provider(ethProv as any, "any"); s = p.getSigner(); addr = await s.getAddress();
      } else {
        setUsingMiniApp(false);
        const anyWindow = window as any;
        if (!anyWindow.ethereum) { setMintStatus("No wallet found."); setConnecting(false); return null; }
        await anyWindow.ethereum.request({ method: "eth_requestAccounts" });
        p = new ethers.providers.Web3Provider(anyWindow.ethereum, "any"); s = p.getSigner(); addr = await s.getAddress();
      }
      const net = await p.getNetwork();
      if (net.chainId !== CHAIN_ID && !isMini) { try { await (window as any).ethereum?.request({ method: "wallet_switchEthereumChain", params: [{ chainId: "0x2105" }] }); } catch {} }
      setProvider(p); setSigner(s); setUserAddress(addr); setConnecting(false);
      return { signer: s, provider: p, userAddress: addr, isMini };
    } catch { setMintStatus("Wallet connect failed."); setConnecting(false); return null; }
  }

  async function sendWalletCalls(from: string, to: string, data: string): Promise<ethers.providers.TransactionResponse> {
    if (!usingMiniApp || !miniAppEthProvider) throw new Error("wallet_sendCalls not available");
    const req = miniAppEthProvider.request?.bind(miniAppEthProvider) ?? miniAppEthProvider.send?.bind(miniAppEthProvider);
    if (!req) throw new Error("Missing request/send");
    const result = await req({ method: "wallet_sendCalls", params: [{ from, chainId: ethers.utils.hexValue(CHAIN_ID), atomicRequired: false, calls: [{ to, data, value: "0x0" }] }] });
    const txHash = result?.txHashes?.[0] || result?.txHash || result?.hash || "0x";
    if (!txHash || txHash.length !== 66) throw new Error("Invalid tx hash");
    return { hash: txHash, wait: async () => {} } as any;
  }

  async function sendContractTx(to: string, data: string): Promise<ethers.providers.TransactionResponse | null> {
    const ctx = await ensureWallet(); if (!ctx) return null;
    if (ctx.isMini && miniAppEthProvider) return await sendWalletCalls(ctx.userAddress, to, data);
    return await ctx.signer.sendTransaction({ to, data, value: 0 });
  }

  async function ensureUsdcAllowance(spender: string, required: ethers.BigNumber): Promise<boolean> {
    const ctx = await ensureWallet(); if (!ctx) return false;
    const { signer: s, userAddress: addr, isMini } = ctx;
    setMintStatus("Checking USDC…");
    const usdcRead = new ethers.Contract(USDC_ADDRESS, USDC_ABI, readProvider);
    const usdcWrite = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);
    try { const bal = await usdcRead.balanceOf(addr); if (bal.lt(required)) { setMintStatus("Insufficient USDC."); return false; } } catch {}
    let current = ethers.constants.Zero;
    try { current = await usdcRead.allowance(addr, spender); } catch {}
    if (current.gte(required)) return true;
    setMintStatus("Approving USDC…");
    try {
      if (isMini && miniAppEthProvider) {
        const data = usdcInterface.encodeFunctionData("approve", [spender, required]);
        await sendWalletCalls(addr, USDC_ADDRESS, data);
        setMintStatus("Waiting for approval…");
        for (let i = 0; i < 20; i++) { await new Promise((res) => setTimeout(res, 1500)); try { const updated = await usdcRead.allowance(addr, spender); if (updated.gte(required)) break; } catch {} }
      } else { const tx = await usdcWrite.approve(spender, required); await waitForTx(tx); }
      return true;
    } catch { setMintStatus("USDC approval failed"); return false; }
  }

  async function handleMintLand() {
    setMintStatus("Minting Land (199.99 USDC)…");
    if (!(await ensureUsdcAllowance(LAND_ADDRESS, LAND_PRICE_USDC))) return;
    const tx = await sendContractTx(LAND_ADDRESS, landInterface.encodeFunctionData("mint", []));
    if (tx) { await waitForTx(tx); setMintStatus("Land minted ✅"); }
  }

  async function handleMintPlant() {
    setMintStatus("Minting Plant (49.99 USDC)…");
    if (!(await ensureUsdcAllowance(PLANT_ADDRESS, PLANT_PRICE_USDC))) return;
    const tx = await sendContractTx(PLANT_ADDRESS, plantInterface.encodeFunctionData("mint", []));
    if (tx) { await waitForTx(tx); setMintStatus("Plant minted ✅"); }
  }

  async function handleUpgradeLand() {
    if (!selectedLandForUpgrade) { setMintStatus("Select a Land NFT."); return; }
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
      ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
    } catch (err: any) { setMintStatus("Upgrade failed: " + (err?.message || err)); }
    finally { setActionLoading(false); }
  }

  async function loadOwnedTokens(nftAddress: string, owner: string, maxSupply: number = 500): Promise<number[]> {
    try {
      const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, readProvider);
      const bal = (await nft.balanceOf(owner)).toNumber(); if (bal === 0) return [];
      let total = maxSupply; try { total = Math.min((await nft.totalSupply()).toNumber(), maxSupply); } catch {}
      const ids: number[] = []; const ownerLower = owner.toLowerCase();
      for (let tokenId = 1; tokenId <= total && ids.length < bal; tokenId++) { try { if ((await nft.ownerOf(tokenId)).toLowerCase() === ownerLower) ids.push(tokenId); } catch {} }
      return ids;
    } catch { return []; }
  }

  const refreshOldStakingRef = useRef(false);
  const oldStakingLoadedRef = useRef(false);
  async function refreshOldStaking(forceRefresh = false) {
    if (!oldStakingOpen || refreshOldStakingRef.current) return;
    if (oldStakingLoadedRef.current && !forceRefresh) return;
    refreshOldStakingRef.current = true;
    let addr = userAddress;
    if (!addr) { const ctx = await ensureWallet(); if (!ctx) { refreshOldStakingRef.current = false; return; } addr = ctx.userAddress; }
    setLoadingOldStaking(true);
    try {
      const staking = new ethers.Contract(OLD_STAKING_ADDRESS, OLD_STAKING_ABI, readProvider);
      const [user, pendingRaw, stakedPlantIds, stakedLandIds, landBps, claimEnabled, landEnabled] = await Promise.all([
        staking.users(addr), staking.pending(addr), staking.plantsOf(addr), staking.landsOf(addr), staking.landBoostBps(), staking.claimEnabled(), staking.landStakingEnabled(),
      ]);
      const plantsStaked = Number(user.plants), landsStaked = Number(user.lands);
      if (ownedCacheRef.current.addr !== addr || forceRefresh) {
        const [pOwned, lOwned, slOwned] = await Promise.all([loadOwnedTokens(PLANT_ADDRESS, addr, 500), loadOwnedTokens(LAND_ADDRESS, addr, 200), loadOwnedTokens(SUPER_LAND_ADDRESS, addr, 99)]);
        ownedCacheRef.current = { addr, plants: pOwned, lands: lOwned, superLands: slOwned };
      }
      const stakedPlantNums = stakedPlantIds.map((x: any) => Number(x));
      const stakedLandNums = stakedLandIds.map((x: any) => Number(x));
      setOldStakedPlants(stakedPlantNums); setOldStakedLands(stakedLandNums);
      setAvailablePlants(ownedCacheRef.current.plants.filter((id) => !new Set(stakedPlantNums).has(id)));
      setAvailableLands(ownedCacheRef.current.lands.filter((id) => !new Set(stakedLandNums).has(id)));
      setAvailableSuperLands(ownedCacheRef.current.superLands);
      setOldLandStakingEnabled(landEnabled);
      setOldStakingStats({ plantsStaked, landsStaked, totalSlots: 1 + landsStaked * 3, capacityUsed: plantsStaked, landBoostPct: (landsStaked * Number(landBps)) / 100, pendingFormatted: ethers.utils.formatUnits(pendingRaw, 18), pendingRaw, claimEnabled });
      oldStakingLoadedRef.current = true;
    } catch (err) { console.error("Old staking refresh failed:", err); }
    finally { refreshOldStakingRef.current = false; setLoadingOldStaking(false); }
  }

  const refreshNewStakingRef = useRef(false);
  const newStakingLoadedRef = useRef(false);
  async function refreshNewStaking(forceRefresh = false) {
    if (!newStakingOpen || refreshNewStakingRef.current) return;
    if (newStakingLoadedRef.current && !forceRefresh) return;
    refreshNewStakingRef.current = true;
    let addr = userAddress;
    if (!addr) { const ctx = await ensureWallet(); if (!ctx) { refreshNewStakingRef.current = false; return; } addr = ctx.userAddress; }
    setLoadingNewStaking(true);
    try {
      const staking = new ethers.Contract(NEW_STAKING_ADDRESS, NEW_STAKING_ABI, readProvider);
      const [user, pendingRaw, stakedPlantIds, stakedLandIds, stakedSuperLandIds, tokensPerDay, totalBoostBps, capacity, claimEnabled, landEnabled, superLandEnabled] = await Promise.all([
        staking.users(addr), staking.pending(addr), staking.plantsOf(addr), staking.landsOf(addr), staking.superLandsOf(addr), staking.tokensPerPlantPerDay(), staking.getBoostBps(addr), staking.capacityOf(addr), staking.claimEnabled(), staking.landStakingEnabled(), staking.superLandStakingEnabled(),
      ]);
      const plantsStaked = Number(user.plants), landsStaked = Number(user.lands), superLandsStaked = Number(user.superLands);
      const totalSlots = Number(capacity), boostPct = Number(totalBoostBps) / 100;
      const tokensPerSecond = tokensPerDay.div(86400);
      const dailyBase = tokensPerDay.mul(plantsStaked);
      const dailyWithBoost = dailyBase.mul(totalBoostBps).div(10000);
      const dailyFormatted = parseFloat(ethers.utils.formatUnits(dailyWithBoost, 18));
      if (ownedCacheRef.current.addr !== addr || forceRefresh) {
        const [pOwned, lOwned, slOwned] = await Promise.all([loadOwnedTokens(PLANT_ADDRESS, addr, 500), loadOwnedTokens(LAND_ADDRESS, addr, 200), loadOwnedTokens(SUPER_LAND_ADDRESS, addr, 99)]);
        ownedCacheRef.current = { addr, plants: pOwned, lands: lOwned, superLands: slOwned };
      }
      const stakedPlantNums = stakedPlantIds.map((x: any) => Number(x));
      const stakedLandNums = stakedLandIds.map((x: any) => Number(x));
      const stakedSuperLandNums = stakedSuperLandIds.map((x: any) => Number(x));
      setNewStakedPlants(stakedPlantNums); setNewStakedLands(stakedLandNums); setNewStakedSuperLands(stakedSuperLandNums);
      setAvailablePlants(ownedCacheRef.current.plants.filter((id) => !new Set(stakedPlantNums).has(id)));
      setAvailableLands(ownedCacheRef.current.lands.filter((id) => !new Set(stakedLandNums).has(id)));
      setAvailableSuperLands(ownedCacheRef.current.superLands.filter((id) => !new Set(stakedSuperLandNums).has(id)));
      setNewLandStakingEnabled(landEnabled); setNewSuperLandStakingEnabled(superLandEnabled);
      setNewStakingStats({ plantsStaked, landsStaked, superLandsStaked, totalSlots, capacityUsed: plantsStaked, totalBoostPct: boostPct, pendingFormatted: ethers.utils.formatUnits(pendingRaw, 18), pendingRaw, dailyRewards: dailyFormatted >= 1_000_000 ? (dailyFormatted / 1_000_000).toFixed(2) + "M" : dailyFormatted >= 1000 ? (dailyFormatted / 1000).toFixed(1) + "K" : dailyFormatted.toFixed(0), claimEnabled, tokensPerSecond });
      newStakingLoadedRef.current = true;
    } catch (err) { console.error("New staking refresh failed:", err); }
    finally { refreshNewStakingRef.current = false; setLoadingNewStaking(false); }
  }

  useEffect(() => { if (oldStakingOpen) { refreshOldStaking(); const i = setInterval(() => refreshOldStaking(true), 60000); return () => { clearInterval(i); oldStakingLoadedRef.current = false; }; } }, [oldStakingOpen]);
  useEffect(() => { if (newStakingOpen) { refreshNewStaking(); const i = setInterval(() => refreshNewStaking(true), 60000); return () => { clearInterval(i); newStakingLoadedRef.current = false; }; } }, [newStakingOpen]);

  async function refreshCrimeLadder() {
    setLadderLoading(true);
    try {
      const staking = new ethers.Contract(NEW_STAKING_ADDRESS, NEW_STAKING_ABI, readProvider);
      const [tokensPerPlantPerDayBn, latestBlock] = await Promise.all([staking.tokensPerPlantPerDay(), readProvider.getBlockNumber()]);
      const SAFE_WINDOW = usingMiniApp ? 80000 : 300000;
      const fromBlock = Math.max(latestBlock - SAFE_WINDOW, 0);
      let plantLogs: any[] = [], landLogs: any[] = [];
      try { plantLogs = await readProvider.getLogs({ address: PLANT_ADDRESS, fromBlock, toBlock: latestBlock, topics: [ERC721_TRANSFER_TOPIC] }); } catch {}
      try { landLogs = await readProvider.getLogs({ address: LAND_ADDRESS, fromBlock, toBlock: latestBlock, topics: [ERC721_TRANSFER_TOPIC] }); } catch {}
      const addrSet = new Set<string>();
      if (userAddress) addrSet.add(userAddress.toLowerCase());
      for (const log of [...plantLogs, ...landLogs]) {
        if (log.topics.length >= 3) {
          if (log.topics[1]?.length === 66) addrSet.add(("0x" + log.topics[1].slice(26)).toLowerCase());
          if (log.topics[2]?.length === 66) addrSet.add(("0x" + log.topics[2].slice(26)).toLowerCase());
        }
      }
      const rows: FarmerRow[] = [];
      await Promise.all(Array.from(addrSet).map(async (addr) => {
        try {
          const u = await staking.users(addr);
          const plants = Number(u.plants), lands = Number(u.lands), superLands = Number(u.superLands);
          if (plants === 0 && lands === 0 && superLands === 0) return;
          const totalBoostBps = await staking.getBoostBps(addr);
          const capacityVal = await staking.capacityOf(addr);
          const dailyBase = tokensPerPlantPerDayBn.mul(plants);
          const dailyWithBoost = dailyBase.mul(totalBoostBps).div(10000);
          const dailyFloat = parseFloat(ethers.utils.formatUnits(dailyWithBoost, 18));
          rows.push({ addr, plants, lands, superLands, boostPct: Number(totalBoostBps) / 100, capacity: plants + "/" + Number(capacityVal), daily: dailyFloat >= 1_000_000 ? (dailyFloat / 1_000_000).toFixed(2) + "M" : dailyFloat.toLocaleString(undefined, { maximumFractionDigits: 0 }), dailyRaw: dailyFloat });
        } catch {}
      }));
      rows.sort((a, b) => b.dailyRaw - a.dailyRaw);
      setFarmerCount(rows.length);
      if (userAddress) { const idx = rows.findIndex((r) => r.addr.toLowerCase() === userAddress.toLowerCase()); setWalletRank(idx !== -1 ? idx + 1 : null); setWalletRow(idx !== -1 ? rows[idx] : null); }
      setLadderRows(rows.slice(0, 10));
    } catch { setLadderRows([]); setWalletRank(null); setWalletRow(null); setFarmerCount(0); }
    finally { setLadderLoading(false); }
  }

  useEffect(() => { refreshCrimeLadder(); }, []);
  useEffect(() => { if (userAddress) refreshCrimeLadder(); }, [userAddress]);

  async function ensureCollectionApproval(collectionAddress: string, stakingAddress: string, ctx: { signer: ethers.Signer; userAddress: string }) {
    const nftRead = new ethers.Contract(collectionAddress, ERC721_VIEW_ABI, readProvider);
    if (!(await nftRead.isApprovedForAll(ctx.userAddress, stakingAddress))) {
      const tx = await sendContractTx(collectionAddress, erc721Interface.encodeFunctionData("setApprovalForAll", [stakingAddress, true]));
      if (!tx) throw new Error("Approval rejected");
      await waitForTx(tx);
    }
  }

  async function handleOldStakeSelected() {
    const ctx = await ensureWallet(); if (!ctx) return;
    if (selectedOldAvailPlants.length === 0 && selectedOldAvailLands.length === 0) { setMintStatus("Select NFTs."); return; }
    try {
      setActionLoading(true);
      if (selectedOldAvailPlants.length > 0) { await ensureCollectionApproval(PLANT_ADDRESS, OLD_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, oldStakingInterface.encodeFunctionData("stakePlants", [selectedOldAvailPlants.map((id) => ethers.BigNumber.from(id))]))); }
      if (selectedOldAvailLands.length > 0 && oldLandStakingEnabled) { await ensureCollectionApproval(LAND_ADDRESS, OLD_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, oldStakingInterface.encodeFunctionData("stakeLands", [selectedOldAvailLands.map((id) => ethers.BigNumber.from(id))]))); }
      setSelectedOldAvailPlants([]); setSelectedOldAvailLands([]);
      ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
      oldStakingLoadedRef.current = false;
      await refreshOldStaking(true);
    } catch (err) { console.error(err); } finally { setActionLoading(false); }
  }

  async function handleOldUnstakeSelected() {
    const ctx = await ensureWallet(); if (!ctx) return;
    if (selectedOldStakedPlants.length === 0 && selectedOldStakedLands.length === 0) { setMintStatus("Select NFTs."); return; }
    try {
      setActionLoading(true);
      if (selectedOldStakedPlants.length > 0) await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, oldStakingInterface.encodeFunctionData("unstakePlants", [selectedOldStakedPlants.map((id) => ethers.BigNumber.from(id))])));
      if (selectedOldStakedLands.length > 0) await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, oldStakingInterface.encodeFunctionData("unstakeLands", [selectedOldStakedLands.map((id) => ethers.BigNumber.from(id))])));
      setSelectedOldStakedPlants([]); setSelectedOldStakedLands([]);
      ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
      oldStakingLoadedRef.current = false;
      await refreshOldStaking(true);
    } catch (err) { console.error(err); } finally { setActionLoading(false); }
  }

  async function handleOldClaim() {
    if (!oldStakingStats || parseFloat(oldStakingStats.pendingFormatted) <= 0) { setMintStatus("No rewards."); return; }
    try { setActionLoading(true); await waitForTx(await sendContractTx(OLD_STAKING_ADDRESS, oldStakingInterface.encodeFunctionData("claim", []))); oldStakingLoadedRef.current = false; await refreshOldStaking(true); }
    catch (err) { console.error(err); } finally { setActionLoading(false); }
  }

  async function handleNewStakeSelected() {
    const ctx = await ensureWallet(); if (!ctx) return;
    if (selectedNewAvailPlants.length === 0 && selectedNewAvailLands.length === 0 && selectedNewAvailSuperLands.length === 0) { setMintStatus("Select NFTs."); return; }
    try {
      setActionLoading(true);
      if (selectedNewAvailPlants.length > 0) { await ensureCollectionApproval(PLANT_ADDRESS, NEW_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, newStakingInterface.encodeFunctionData("stakePlants", [selectedNewAvailPlants.map((id) => ethers.BigNumber.from(id))]))); }
      if (selectedNewAvailLands.length > 0 && newLandStakingEnabled) { await ensureCollectionApproval(LAND_ADDRESS, NEW_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, newStakingInterface.encodeFunctionData("stakeLands", [selectedNewAvailLands.map((id) => ethers.BigNumber.from(id))]))); }
      if (selectedNewAvailSuperLands.length > 0 && newSuperLandStakingEnabled) { await ensureCollectionApproval(SUPER_LAND_ADDRESS, NEW_STAKING_ADDRESS, ctx); await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, newStakingInterface.encodeFunctionData("stakeSuperLands", [selectedNewAvailSuperLands.map((id) => ethers.BigNumber.from(id))]))); }
      setSelectedNewAvailPlants([]); setSelectedNewAvailLands([]); setSelectedNewAvailSuperLands([]);
      ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
      newStakingLoadedRef.current = false;
      await refreshNewStaking(true); await refreshCrimeLadder();
    } catch (err) { console.error(err); } finally { setActionLoading(false); }
  }

  async function handleNewUnstakeSelected() {
    const ctx = await ensureWallet(); if (!ctx) return;
    if (selectedNewStakedPlants.length === 0 && selectedNewStakedLands.length === 0 && selectedNewStakedSuperLands.length === 0) { setMintStatus("Select NFTs."); return; }
    try {
      setActionLoading(true);
      if (selectedNewStakedPlants.length > 0) await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, newStakingInterface.encodeFunctionData("unstakePlants", [selectedNewStakedPlants.map((id) => ethers.BigNumber.from(id))])));
      if (selectedNewStakedLands.length > 0) await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, newStakingInterface.encodeFunctionData("unstakeLands", [selectedNewStakedLands.map((id) => ethers.BigNumber.from(id))])));
      if (selectedNewStakedSuperLands.length > 0) await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, newStakingInterface.encodeFunctionData("unstakeSuperLands", [selectedNewStakedSuperLands.map((id) => ethers.BigNumber.from(id))])));
      setSelectedNewStakedPlants([]); setSelectedNewStakedLands([]); setSelectedNewStakedSuperLands([]);
      ownedCacheRef.current = { addr: null, plants: [], lands: [], superLands: [] };
      newStakingLoadedRef.current = false;
      await refreshNewStaking(true); await refreshCrimeLadder();
    } catch (err) { console.error(err); } finally { setActionLoading(false); }
  }

  async function handleNewClaim() {
    if (!newStakingStats || parseFloat(newStakingStats.pendingFormatted) <= 0) { setMintStatus("No rewards."); return; }
    try { setActionLoading(true); await waitForTx(await sendContractTx(NEW_STAKING_ADDRESS, newStakingInterface.encodeFunctionData("claim", []))); newStakingLoadedRef.current = false; await refreshNewStaking(true); }
    catch (err) { console.error(err); } finally { setActionLoading(false); }
  }

  const connected = !!userAddress;
  const toggleId = (id: number, list: number[], setter: (v: number[]) => void) => list.includes(id) ? setter(list.filter((x) => x !== id)) : setter([...list, id]);
  const oldTotalAvailable = availablePlants.length + availableLands.length;
  const oldTotalStaked = oldStakedPlants.length + oldStakedLands.length;
  const newTotalAvailable = availablePlants.length + availableLands.length + availableSuperLands.length;
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

  return (
    <div className={styles.page} style={{ paddingBottom: 70 }} onPointerDown={() => { if (!isPlaying && audioRef.current) audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {}); }}>
      <header className={styles.headerWrapper}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4 }}>
          <div className={styles.brand}><span className={styles.liveDot} /><span className={styles.brandText}>FCWEED</span></div>
          <button type="button" disabled={connecting} onClick={() => void ensureWallet()} style={{ padding: "4px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.25)", background: connected ? "rgba(0,200,130,0.18)" : "rgba(39,95,255,0.55)", fontSize: 10, fontWeight: 500, color: "#fff", cursor: "pointer" }}>{shortAddr(userAddress)}</button>
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
              <h2 className={styles.heading}>Crime Ladder — (Top Farmers)</h2>
              {connected && walletRow && walletRank && (
                <div style={{ fontSize: 11, margin: "4px 0 8px", padding: "6px 8px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(5,8,20,0.8)" }}>
                  <div style={{ marginBottom: 3 }}>Your rank: <b>#{walletRank}</b> / {farmerCount}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, opacity: 0.9 }}>
                    <span>Plants: <b>{walletRow.plants}</b></span>
                    <span>Land: <b>{walletRow.lands}</b></span>
                    <span>Super: <b>{walletRow.superLands}</b></span>
                    <span>Boost: <b>+{(walletRow.boostPct - 100).toFixed(1)}%</b></span>
                  </div>
                </div>
              )}
              {ladderLoading ? <p style={{ fontSize: 12, opacity: 0.7 }}>Loading…</p> : ladderRows.length === 0 ? <p style={{ fontSize: 12, opacity: 0.7 }}>No farmers yet. Stake Plants + Land to appear on the Crime Ladder.</p> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                    <thead><tr><th style={{ textAlign: "left", padding: 3 }}>Rank</th><th style={{ textAlign: "left", padding: 3 }}>Farmer</th><th style={{ textAlign: "right", padding: 3 }}>Plants</th><th style={{ textAlign: "right", padding: 3 }}>Land</th><th style={{ textAlign: "right", padding: 3 }}>Super</th><th style={{ textAlign: "right", padding: 3 }}>Daily</th></tr></thead>
                    <tbody>{ladderRows.map((row, idx) => (
                      <tr key={row.addr}><td style={{ padding: 3 }}>{idx + 1}</td><td style={{ padding: 3 }}>{row.addr.slice(0, 6)}…{row.addr.slice(-4)}</td><td style={{ padding: 3, textAlign: "right" }}>{row.plants}</td><td style={{ padding: 3, textAlign: "right" }}>{row.lands}</td><td style={{ padding: 3, textAlign: "right" }}>{row.superLands}</td><td style={{ padding: 3, textAlign: "right" }}>{row.daily}</td></tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>
            <section className={styles.infoCard}>
              <h2 className={styles.heading}>Coming Soon</h2>
              <ul className={styles.bulletList}>
                <li style={{ color: "#fbbf24" }}>🎁 Referrals — Earn rewards for inviting friends</li>
                <li style={{ color: "#fbbf24" }}>📦 Crate Openings — Mystery rewards and rare drops</li>
              </ul>
            </section>
          </>
        )}

        {activeTab === "mint" && (
          <section className={styles.infoCard} style={{ textAlign: "center", padding: 20 }}>
            <h2 style={{ fontSize: 18, margin: "0 0 16px", color: "#7cb3ff" }}>Mint NFTs</h2>
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
            <p style={{ marginTop: 12, fontSize: 11, color: "#f87171" }}>⚠️ Migrate to New Staking for Super Land support</p>
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
      </main>

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "linear-gradient(to top, #050812, #0a1128)", borderTop: "1px solid #1b2340", display: "flex", justifyContent: "space-around", padding: "8px 4px", zIndex: 50 }}>
        {[
          { key: "info", icon: "ℹ️", label: "INFO" },
          { key: "mint", icon: "🌱", label: "MINT" },
          { key: "stake", icon: "⚡", label: "STAKE" },
          { key: "crates", icon: "📦", label: "CRATES" },
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
                    <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={oldTotalAvailable > 0 && selectedOldAvailPlants.length + selectedOldAvailLands.length === oldTotalAvailable} onChange={() => { if (selectedOldAvailPlants.length + selectedOldAvailLands.length === oldTotalAvailable) { setSelectedOldAvailPlants([]); setSelectedOldAvailLands([]); } else { setSelectedOldAvailPlants(availablePlants); setSelectedOldAvailLands(availableLands); } }} />All</label>
                  </div>
                  <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                    {oldTotalAvailable === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No NFTs</span> : (
                      <>{availableLands.map((id) => <NftCard key={"oal-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedOldAvailLands.includes(id)} onChange={() => toggleId(id, selectedOldAvailLands, setSelectedOldAvailLands)} />)}{availablePlants.map((id) => <NftCard key={"oap-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedOldAvailPlants.includes(id)} onChange={() => toggleId(id, selectedOldAvailPlants, setSelectedOldAvailPlants)} />)}</>
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
                    <label style={{ fontSize: 10, display: "flex", alignItems: "center", gap: 3 }}><input type="checkbox" checked={newTotalAvailable > 0 && selectedNewAvailPlants.length + selectedNewAvailLands.length + selectedNewAvailSuperLands.length === newTotalAvailable} onChange={() => { if (selectedNewAvailPlants.length + selectedNewAvailLands.length + selectedNewAvailSuperLands.length === newTotalAvailable) { setSelectedNewAvailPlants([]); setSelectedNewAvailLands([]); setSelectedNewAvailSuperLands([]); } else { setSelectedNewAvailPlants(availablePlants); setSelectedNewAvailLands(availableLands); setSelectedNewAvailSuperLands(availableSuperLands); } }} />All</label>
                  </div>
                  <div style={{ display: "flex", overflowX: "auto", gap: 6, padding: "4px 0", minHeight: 80 }}>
                    {newTotalAvailable === 0 ? <span style={{ fontSize: 11, opacity: 0.5, margin: "auto" }}>No NFTs</span> : (
                      <>{availableSuperLands.map((id) => <NftCard key={"nasl-" + id} id={id} img={superLandImages[id] || SUPER_LAND_FALLBACK_IMG} name="Super Land" checked={selectedNewAvailSuperLands.includes(id)} onChange={() => toggleId(id, selectedNewAvailSuperLands, setSelectedNewAvailSuperLands)} />)}{availableLands.map((id) => <NftCard key={"nal-" + id} id={id} img={landImages[id] || LAND_FALLBACK_IMG} name="Land" checked={selectedNewAvailLands.includes(id)} onChange={() => toggleId(id, selectedNewAvailLands, setSelectedNewAvailLands)} />)}{availablePlants.map((id) => <NftCard key={"nap-" + id} id={id} img={plantImages[id] || PLANT_FALLBACK_IMG} name="Plant" checked={selectedNewAvailPlants.includes(id)} onChange={() => toggleId(id, selectedNewAvailPlants, setSelectedNewAvailPlants)} />)}</>
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
              <button type="button" className={styles.modalClose} onClick={() => { setUpgradeModalOpen(false); setSelectedLandForUpgrade(null); }}>✕</button>
            </header>
            <div style={{ marginTop: 12, fontSize: 12, lineHeight: 1.5, color: "#c0c9f4" }}>
              <p style={{ marginBottom: 10 }}>To mint a <b style={{ color: "#fbbf24" }}>Super Land NFT</b> and reap its benefits:</p>
              <ul style={{ marginLeft: 16, marginBottom: 10 }}>
                <li>Burn <b>1 × Land NFT</b></li>
                <li>Burn <b>2,000,000 $FCWEED</b></li>
              </ul>
              <p style={{ fontSize: 10, opacity: 0.8 }}>Super Land gives +12% boost and +3 plant capacity!</p>
            </div>
            {availableLands.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, marginBottom: 6, display: "block" }}>Select Land:</label>
                <select value={selectedLandForUpgrade || ""} onChange={(e) => setSelectedLandForUpgrade(e.target.value ? Number(e.target.value) : null)} style={{ width: "100%", padding: 8, borderRadius: 6, background: "#0a1128", border: "1px solid #1f2a4a", color: "#fff", fontSize: 12 }}>
                  <option value="">-- Select --</option>
                  {availableLands.map((id) => <option key={id} value={id}>Land #{id}</option>)}
                </select>
              </div>
            ) : <p style={{ marginTop: 12, fontSize: 11, color: "#f87171" }}>You don&apos;t own any Land NFTs to upgrade.</p>}
            <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <button type="button" className={styles.btnPrimary} disabled={!selectedLandForUpgrade || actionLoading} onClick={handleUpgradeLand} style={{ flex: 1, background: "linear-gradient(to right, #f59e0b, #fbbf24)", color: "#000" }}>{actionLoading ? "Processing…" : "Continue"}</button>
              <button type="button" onClick={() => { setUpgradeModalOpen(false); setSelectedLandForUpgrade(null); }} style={{ flex: 1, padding: 8, borderRadius: 999, border: "1px solid #374151", background: "transparent", color: "#9ca3af", cursor: "pointer" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
