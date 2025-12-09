"use client";

import { useEffect, useState, useRef } from "react";
import Image from "next/image";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { sdk } from "@farcaster/miniapp-sdk";
import { ethers } from "ethers";
import styles from "./page.module.css";

const CHAIN_ID = 8453;

const PLANT_ADDRESS = "0xD84890240C2CBB66a825915cD20aEe89C6b66dD5";
const LAND_ADDRESS = "0x798A8F4b4799CfaBe859C85889c78e42a57d71c1";
const STAKING_ADDRESS = "0x9dA6B01BFcbf5ab256B7B1d46F316e946da85507";
const TOKEN_SYMBOL = "FCWEED";

const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const USDC_DECIMALS = 6;

const PLANT_PRICE_USDC = ethers.utils.parseUnits("49.99", USDC_DECIMALS);
const LAND_PRICE_USDC = ethers.utils.parseUnits("199.99", USDC_DECIMALS);

const USDC_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
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

const STAKING_ABI = [
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

const usdcInterface = new ethers.utils.Interface(USDC_ABI);
const landInterface = new ethers.utils.Interface(LAND_ABI);
const plantInterface = new ethers.utils.Interface(PLANT_ABI);

type StakingStats = {
  plantsStaked: number;
  landsStaked: number;
  totalSlots: number;
  capacityUsed: number;
  landBoostPct: number;
  pendingFormatted: string;
  claimEnabled: boolean;
};

const PLAYLIST = [
  {
    title: "Kendrick Lamar - Untitled 05 (LoVibe Remix)",
    src: "/audio/track1.mp3",
  },
  { title: "Travis Scott - SDP Interlude", src: "/audio/track2.mp3" },
  { title: "Yeat - if we being real", src: "/audio/track3.mp3" },
];

export default function Home() {
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

  const [stakingOpen, setStakingOpen] = useState(false);
  const [stakingStats, setStakingStats] = useState<StakingStats | null>(null);
  const [availablePlants, setAvailablePlants] = useState<number[]>([]);
  const [availableLands, setAvailableLands] = useState<number[]>([]);
  const [stakedPlants, setStakedPlants] = useState<number[]>([]);
  const [stakedLands, setStakedLands] = useState<number[]>([]);
  const [loadingStaking, setLoadingStaking] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [landStakingEnabled, setLandStakingEnabled] = useState(false);

  const [selectedAvailPlants, setSelectedAvailPlants] = useState<number[]>([]);
  const [selectedAvailLands, setSelectedAvailLands] = useState<number[]>([]);
  const [selectedStakedPlants, setSelectedStakedPlants] =
    useState<number[]>([]);
  const [selectedStakedLands, setSelectedStakedLands] = useState<number[]>([]);

  const [plantImages, setPlantImages] = useState<Record<number, string>>({});
  const [landImages, setLandImages] = useState<Record<number, string>>({});

  const [mintStatus, setMintStatus] = useState<string>("");

  // ==== Farcaster Radio state ====
  const [currentTrack, setCurrentTrack] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  const handlePlayPause = () => setIsPlaying((prev) => !prev);
  const handleNextTrack = () =>
    setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
  const handlePrevTrack = () =>
    setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);

  // Mark mini app ready for the host
  useEffect(() => {
    if (!isMiniAppReady) {
      setMiniAppReady();
    }
    (async () => {
      try {
        await sdk.actions.ready();
      } catch {
        // ignore
      }
    })();
  }, [isMiniAppReady, setMiniAppReady]);

  const shortAddr = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

  // ---- wallet_sendCalls helper for Farcaster provider ----
  async function sendWalletCalls(to: string, data: string) {
    if (!usingMiniApp || !miniAppEthProvider) {
      throw new Error("wallet_sendCalls not available");
    }

    const req =
      miniAppEthProvider.request?.bind(miniAppEthProvider) ??
      miniAppEthProvider.send?.bind(miniAppEthProvider);

    if (!req) {
      throw new Error("Mini app provider missing request/send");
    }

    const chainIdHex = ethers.utils.hexValue(CHAIN_ID); // 0x2105

    return await req({
      method: "wallet_sendCalls",
      params: [
        {
          chainId: chainIdHex,
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
  }

  // ==== main wallet bootstrap – now tries Farcaster provider FIRST ====
  async function ensureWallet() {
    if (signer && provider && userAddress) {
      return { signer, provider, userAddress };
    }

    try {
      setConnecting(true);

      let p: ethers.providers.Web3Provider;
      let s: ethers.Signer;
      let addr: string;
      let isMini = false;
      let ethProv: any | null = null;

      // 1) Try Farcaster mini app wallet
      try {
        ethProv = await sdk.wallet.getEthereumProvider();
        if (ethProv) {
          isMini = true;
        }
      } catch {
        isMini = false;
      }

      if (isMini && ethProv) {
        setUsingMiniApp(true);
        setMiniAppEthProvider(ethProv);
        p = new ethers.providers.Web3Provider(ethProv as any, "any");
      } else {
        // 2) Fallback to normal browser wallet
        setUsingMiniApp(false);
        const anyWindow = window as any;
        if (!anyWindow.ethereum) {
          setMintStatus(
            "No wallet found. Open this in the Farcaster app or install a browser wallet."
          );
          setConnecting(false);
          return null;
        }
        await anyWindow.ethereum.request({ method: "eth_requestAccounts" });
        p = new ethers.providers.Web3Provider(anyWindow.ethereum, "any");
      }

      s = p.getSigner();
      addr = await s.getAddress();

      const net = await p.getNetwork();
      if (net.chainId !== CHAIN_ID) {
        if (isMini) {
          setMintStatus("Please switch your Farcaster wallet to Base to mint.");
        } else {
          const anyWindow = window as any;
          if (anyWindow.ethereum?.request) {
            try {
              await anyWindow.ethereum.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x2105" }],
              });
            } catch {
              // ignore
            }
          }
        }
      }

      setProvider(p);
      setSigner(s);
      setUserAddress(addr);
      setConnecting(false);

      return { signer: s, provider: p, userAddress: addr };
    } catch (err) {
      console.error("Wallet connect failed:", err);
      if (usingMiniApp) {
        setMintStatus(
          "Could not connect Farcaster wallet. Make sure the mini app has wallet permissions."
        );
      } else {
        setMintStatus("Wallet connect failed. Check your wallet and try again.");
      }
      setConnecting(false);
      return null;
    }
  }

  async function ensureUsdcAllowance(
    spender: string,
    required: ethers.BigNumber
  ): Promise<boolean> {
    const ctx = await ensureWallet();
    if (!ctx) return false;

    const { signer: s, provider: p, userAddress: addr } = ctx;

    setMintStatus("Checking USDC contract on Base…");
    const code = await p!.getCode(USDC_ADDRESS);
    if (code === "0x") {
      setMintStatus(
        "USDC token not found on this network. Please make sure you are on Base mainnet."
      );
      return false;
    }

    const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, s);

    // Balance check (shows the “You need at least … USDC” message)
    try {
      const bal = await usdc.balanceOf(addr);
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

    let current: ethers.BigNumber;
    try {
      current = await usdc.allowance(addr, spender);
    } catch (e) {
      console.error("USDC allowance() call reverted:", e);
      // On Farcaster mobile, some providers don't support this call yet.
      // Treat it as zero so we just request a fresh approval instead of erroring out.
      setMintStatus(
        "Could not read existing USDC allowance. We’ll ask you to approve USDC in your wallet now."
      );
      current = ethers.constants.Zero;
    }

    if (current.gte(required)) {
      return true;
    }

    setMintStatus("Requesting USDC approve transaction in your wallet…");

    try {
      if (usingMiniApp && miniAppEthProvider) {
        const data = usdcInterface.encodeFunctionData("approve", [
          spender,
          required,
        ]);
        await sendWalletCalls(USDC_ADDRESS, data);
      } else {
        const tx = await usdc.approve(spender, required);
        await tx.wait();
      }
      setMintStatus("USDC approve confirmed. Sending mint transaction…");
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
      const ctx = await ensureWallet();
      if (!ctx) return;

      const okAllowance = await ensureUsdcAllowance(
        LAND_ADDRESS,
        LAND_PRICE_USDC
      );
      if (!okAllowance) return;

      if (usingMiniApp && miniAppEthProvider) {
        const data = landInterface.encodeFunctionData("mint", []);
        setMintStatus("Opening Farcaster wallet to mint Land…");
        await sendWalletCalls(LAND_ADDRESS, data);
        setMintStatus(
          "Land mint submitted ✅ Check your Farcaster wallet / explorer for confirmation."
        );
      } else {
        const land = new ethers.Contract(LAND_ADDRESS, LAND_ABI, ctx.signer);
        const tx = await land.mint();
        setMintStatus("Land mint transaction sent. Waiting for confirmation…");
        await tx.wait();
        setMintStatus(
          "Land mint submitted ✅ Check your wallet / explorer for confirmation."
        );
      }
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
      const ctx = await ensureWallet();
      if (!ctx) return;

      const okAllowance = await ensureUsdcAllowance(
        PLANT_ADDRESS,
        PLANT_PRICE_USDC
      );
      if (!okAllowance) return;

      if (usingMiniApp && miniAppEthProvider) {
        const data = plantInterface.encodeFunctionData("mint", []);
        setMintStatus("Opening Farcaster wallet to mint Plant…");
        await sendWalletCalls(PLANT_ADDRESS, data);
        setMintStatus(
          "Plant mint submitted ✅ Check your Farcaster wallet / explorer for confirmation."
        );
      } else {
        const plant = new ethers.Contract(PLANT_ADDRESS, PLANT_ABI, ctx.signer);
        const tx = await plant.mint();
        setMintStatus("Plant mint transaction sent. Waiting for confirmation…");
        await tx.wait();
        setMintStatus(
          "Plant mint submitted ✅ Check your wallet / explorer for confirmation."
        );
      }
    } catch (err: any) {
      console.error("Mint Plant error:", err);
      const msg =
        err?.reason ||
        err?.error?.message ||
        err?.data?.message ||
        err?.message ||
        "Mint Plant failed";
      setMintStatus(`Plant mint failed: ${msg}`);
    }
  }

  function toHttpFromMaybeIpfs(uri: string): string {
    if (!uri) return "";
    if (uri.startsWith("ipfs://")) {
      const path = uri.slice("ipfs://".length);
      return `https://ipfs.io/ipfs/${path}`;
    }
    return uri;
  }

  async function loadOwnedTokens(
    nftAddress: string,
    owner: string,
    prov: ethers.providers.Provider
  ): Promise<number[]> {
    try {
      const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, prov);
      const balBn: ethers.BigNumber = await nft.balanceOf(owner);
      const bal = balBn.toNumber();
      if (bal === 0) return [];

      let maxId = 2000;
      try {
        const totalBn: ethers.BigNumber = await nft.totalSupply();
        const total = totalBn.toNumber();
        maxId = Math.min(total + 5, 2000);
      } catch {
        // ignore
      }

      const ids: number[] = [];
      const ownerLower = owner.toLowerCase();

      for (let tokenId = 0; tokenId <= maxId && ids.length < bal; tokenId++) {
        try {
          const who: string = await nft.ownerOf(tokenId);
          if (who.toLowerCase() === ownerLower) {
            ids.push(tokenId);
          }
        } catch {
          // non-existent tokenId
        }
      }

      return ids;
    } catch (e) {
      console.error("Failed to enumerate tokens for", nftAddress, e);
      return [];
    }
  }

  async function fetchNftImages(
    nftAddress: string,
    ids: number[],
    prov: ethers.providers.Provider
  ): Promise<Record<number, string>> {
    const out: Record<number, string> = {};
    if (ids.length === 0) return out;

    try {
      const nft = new ethers.Contract(nftAddress, ERC721_VIEW_ABI, prov);
      for (const id of ids) {
        try {
          const uri: string = await nft.tokenURI(id);
          const url = toHttpFromMaybeIpfs(uri);
          const res = await fetch(url);
          if (!res.ok) continue;
          const meta = await res.json();
          let img: string = meta.image || "";
          img = toHttpFromMaybeIpfs(img);
          if (img) out[id] = img;
        } catch (e) {
          console.error("Failed to fetch metadata", nftAddress, id, e);
        }
      }
    } catch (e) {
      console.error("fetchNftImages top-level error", nftAddress, e);
    }
    return out;
  }

  async function refreshStaking() {
    if (!stakingOpen) return;

    const ctx = await ensureWallet();
    if (!ctx) return;

    const { provider: p, userAddress: addr } = ctx;

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      p as ethers.providers.Provider
    );

    setLoadingStaking(true);
    try {
      const [
        user,
        pendingRaw,
        stakedPlantIds,
        stakedLandIds,
        landBps,
        claimEnabled,
        landEnabled,
      ] = await Promise.all([
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
      const capacityUsed = plantsStaked;
      const landBoostPct = (landsStaked * Number(landBps)) / 100;
      const pendingFormatted = ethers.utils.formatUnits(pendingRaw, 18);

      const plantOwned = await loadOwnedTokens(PLANT_ADDRESS, addr, p);
      const landOwned = await loadOwnedTokens(LAND_ADDRESS, addr, p);

      const stakedPlantNums = stakedPlantIds.map((x: any) => Number(x));
      const stakedLandNums = stakedLandIds.map((x: any) => Number(x));

      const stakedPlantSet = new Set(stakedPlantNums);
      const stakedLandSet = new Set(stakedLandNums);

      const availPlants = plantOwned.filter((id) => !stakedPlantSet.has(id));
      const availLands = landOwned.filter((id) => !stakedLandSet.has(id));

      setStakedPlants(stakedPlantNums);
      setStakedLands(stakedLandNums);
      setAvailablePlants(availPlants);
      setAvailableLands(availLands);
      setLandStakingEnabled(landEnabled);

      setStakingStats({
        plantsStaked,
        landsStaked,
        totalSlots,
        capacityUsed,
        landBoostPct,
        pendingFormatted,
        claimEnabled,
      });

      const allPlantIds = Array.from(
        new Set([...plantOwned, ...stakedPlantNums])
      );
      const allLandIds = Array.from(
        new Set([...landOwned, ...stakedLandNums])
      );

      const [plantImgs, landImgs] = await Promise.all([
        fetchNftImages(PLANT_ADDRESS, allPlantIds, p),
        fetchNftImages(LAND_ADDRESS, allLandIds, p),
      ]);

      setPlantImages(plantImgs);
      setLandImages(landImgs);
    } catch (err) {
      console.error("Failed to load staking state:", err);
    } finally {
      setLoadingStaking(false);
    }
  }

  useEffect(() => {
    if (!stakingOpen) return;
    refreshStaking();
    const id = setInterval(() => {
      refreshStaking();
    }, 20000);
    return () => clearInterval(id);
  }, [stakingOpen]);

  async function ensureCollectionApproval(
    collectionAddress: string,
    ctx: {
      signer: ethers.Signer;
      provider: ethers.providers.Provider;
      userAddress: string;
    }
  ) {
    const nft = new ethers.Contract(
      collectionAddress,
      ERC721_VIEW_ABI,
      ctx.signer
    );
    const approved: boolean = await nft.isApprovedForAll(
      ctx.userAddress,
      STAKING_ADDRESS
    );
    if (!approved) {
      const tx = await nft.setApprovalForAll(STAKING_ADDRESS, true);
      await tx.wait();
    }
  }

  async function handleStakeSelected() {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const toStakePlants = selectedAvailPlants;
    const toStakeLands = selectedAvailLands;

    if (toStakePlants.length === 0 && toStakeLands.length === 0) {
      setMintStatus("No NFTs selected to stake.");
      return;
    }

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer
    );

    try {
      setActionLoading(true);

      if (toStakePlants.length > 0) {
        await ensureCollectionApproval(PLANT_ADDRESS, ctx);
        const tx = await staking.stakePlants(
          toStakePlants.map((id) => ethers.BigNumber.from(id))
        );
        await tx.wait();
      }

      if (toStakeLands.length > 0 && landStakingEnabled) {
        await ensureCollectionApproval(LAND_ADDRESS, ctx);
        const tx2 = await staking.stakeLands(
          toStakeLands.map((id) => ethers.BigNumber.from(id))
        );
        await tx2.wait();
      }

      setSelectedAvailPlants([]);
      setSelectedAvailLands([]);
      await refreshStaking();
    } catch (err) {
      console.error("Stake selected error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnstakeSelected() {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const toUnstakePlants = selectedStakedPlants;
    const toUnstakeLands = selectedStakedLands;

    if (toUnstakePlants.length === 0 && toUnstakeLands.length === 0) {
      setMintStatus("No NFTs selected to unstake.");
      return;
    }

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer
    );


