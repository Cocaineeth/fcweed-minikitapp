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
  const [isPlaying, setIsPlaying] = useState(true); // try to autoplay by default
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const currentTrackMeta = PLAYLIST[currentTrack];

  // Best-effort autoplay + keep playing when track changes
  useEffect(() => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current
        .play()
        .catch((err) => {
          // Autoplay blocked – require a manual click
          console.warn("Autoplay blocked by browser", err);
          setIsPlaying(false);
        });
    } else if (!audioRef.current.paused) {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrack]);

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleNextTrack = () => {
    setCurrentTrack((prev) => (prev + 1) % PLAYLIST.length);
  };

  const handlePrevTrack = () => {
    setCurrentTrack((prev) => (prev - 1 + PLAYLIST.length) % PLAYLIST.length);
  };

  // Mini app ready
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

  // Detect if we are inside mini app
  useEffect(() => {
    const detect = async () => {
      try {
        const anySdk = sdk as any;
        if (anySdk.host?.getInfo) {
          await anySdk.host.getInfo();
          setUsingMiniApp(true);
        } else {
          setUsingMiniApp(false);
        }
      } catch {
        setUsingMiniApp(false);
      }
    };
    detect();
  }, []);

  const shortAddr = (addr?: string | null) =>
    addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : "Connect Wallet";

  // Helper for wallet_sendCalls on Farcaster mobile
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

  async function ensureWallet() {
    if (signer && provider && userAddress) {
      return { signer, provider, userAddress };
    }

    try {
      setConnecting(true);
      let p: ethers.providers.Web3Provider;

      if (usingMiniApp) {
        // Use Farcaster wallet provider
        const ethProvider = await sdk.wallet.getEthereumProvider();
        setMiniAppEthProvider(ethProvider as any);
        p = new ethers.providers.Web3Provider(ethProvider as any, "any");
      } else {
        // Regular browser path (MetaMask, CBW, etc)
        const anyWindow = window as any;
        if (!anyWindow.ethereum) {
          setMintStatus(
            "No wallet found. Open this in Farcaster / Base app, or install a browser wallet."
          );
          setConnecting(false);
          return null;
        }
        await anyWindow.ethereum.request({
          method: "eth_requestAccounts",
        });
        p = new ethers.providers.Web3Provider(anyWindow.ethereum, "any");
      }

      const s = p.getSigner();
      const addr = await s.getAddress();

      // Just sanity-check chain; don't try to switch chains inside mini app
      const net = await p.getNetwork();
      if (net.chainId !== CHAIN_ID) {
        if (usingMiniApp) {
          setMintStatus("Please switch your wallet to Base to mint.");
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
      setMintStatus(
        "Error reading USDC allowance. Double-check that you’re on Base and the USDC address is correct."
      );
      return false;
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

    try {
      setActionLoading(true);

      if (toUnstakePlants.length > 0) {
        const tx = await staking.unstakePlants(
          toUnstakePlants.map((id) => ethers.BigNumber.from(id))
        );
        await tx.wait();
      }

      if (toUnstakeLands.length > 0) {
        const tx2 = await staking.unstakeLands(
          toUnstakeLands.map((id) => ethers.BigNumber.from(id))
        );
        await tx2.wait();
      }

      setSelectedStakedPlants([]);
      setSelectedStakedLands([]);
      await refreshStaking();
    } catch (err) {
      console.error("Unstake selected error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleClaim() {
    const ctx = await ensureWallet();
    if (!ctx) return;

    const staking = new ethers.Contract(
      STAKING_ADDRESS,
      STAKING_ABI,
      ctx.signer
    );

    const pendingAmount =
      stakingStats && stakingStats.pendingFormatted
        ? parseFloat(stakingStats.pendingFormatted)
        : 0;

    if (!pendingAmount || pendingAmount <= 0) {
      setMintStatus("No pending rewards to claim yet.");
      return;
    }

    try {
      setActionLoading(true);
      const tx = await staking.claim();
      await tx.wait();
      await refreshStaking();
    } catch (err) {
      console.error("Claim error:", err);
    } finally {
      setActionLoading(false);
    }
  }

  const connected = !!userAddress;
  const pendingFloat = stakingStats
    ? parseFloat(stakingStats.pendingFormatted || "0")
    : 0;

  const pendingDisplay =
    pendingFloat > 0
      ? pendingFloat >= 1_000_000
        ? `${(pendingFloat / 1_000_000).toFixed(2)}M`
        : pendingFloat.toFixed(2)
      : "0.00";

  const totalAvailable = availablePlants.length + availableLands.length;

  const toggleId = (
    id: number,
    list: number[],
    setter: (v: number[]) => void
  ) => {
    if (list.includes(id)) {
      setter(list.filter((x) => x !== id));
    } else {
      setter([...list, id]);
    }
  };

  const stakeDisabled = !connected || actionLoading;
  const unstakeDisabled = !connected || actionLoading;
  const claimDisabled = !connected || actionLoading;

  return (
    <div
      className={styles.page}
      // Fallback: if autoplay was blocked, first tap starts music
      onPointerDown={() => {
        if (!isPlaying && audioRef.current) {
          audioRef.current
            .play()
            .then(() => setIsPlaying(true))
            .catch(() => {});
        }
      }}
    >
      <header className={styles.headerWrapper}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <div className={styles.brand}>
            <span className={styles.liveDot} />
            <span className={styles.brandText}>FCWEED</span>
          </div>

          {/* Clean wallet button */}
          <button
            type="button"
            disabled={connecting}
            onClick={() => {
              // best-effort connect when tapped
              void ensureWallet();
            }}
            className={styles.walletButton}
            style={{
              padding: "4px 10px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: connected
                ? "rgba(0, 200, 130, 0.18)"
                : "rgba(39, 95, 255, 0.55)",
              fontSize: 12,
              fontWeight: 500,
              color: "#fff",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {shortAddr(userAddress)}
          </button>
        </div>

        <div className={styles.headerRight}>
          <button
            className={styles.iconButton}
            aria-label="Twitter"
            type="button"
            onClick={() =>
              window.open("https://x.com/x420Ponzi", "_blank")
            }
          >
            𝕏
          </button>

          {/* Compact Farcaster Radio pill */}
          <div className={styles.radioPill}>
            <span className={styles.radioLabel}>Farcaster Radio</span>

            <div className={styles.radioTitleWrap}>
              <span className={styles.radioTitleInner}>
                {currentTrackMeta.title}
              </span>
            </div>

            <button
              type="button"
              className={styles.iconButtonSmall}
              onClick={handlePrevTrack}
              aria-label="Previous track"
            >
              ‹
            </button>
            <button
              type="button"
              className={styles.iconButtonSmall}
              onClick={handlePlayPause}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <button
              type="button"
              className={styles.iconButtonSmall}
              onClick={handleNextTrack}
              aria-label="Next track"
            >
              ›
            </button>
          </div>

          <audio
            ref={audioRef}
            src={currentTrackMeta.src}
            onEnded={handleNextTrack}
            autoPlay
            style={{ display: "none" }}
          />
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.heroCard}>
          <div className={styles.heroMedia}>
            <Image
              priority
              src="/hero.png"
              alt="x420 Ponzi Plants"
              width={320}
              height={320}
              className={styles.heroImage}
            />
            <div className={styles.heroTags}>
              <span className={styles.tag}>ERC-721</span>
              <span className={styles.tag}>Base</span>
              <span className={styles.tag}>x402</span>
            </div>
          </div>

          <div className={styles.heroMain}>
            <h1 className={styles.title}>FCWEED Farming on Base</h1>
            <p className={styles.subtitle}>
              Stake-to-earn Farming — Powered by FCWEED on Base
              <br />
              Collect Land &amp; Plant NFTs, stake them to grow yields, and
              boost rewards with expansion.
              <br />
              Every Land NFT unlocks more Plant slots and increases your{" "}
              <span className={styles.highlight}>Land Boost</span> for higher
              payouts.
            </p>

            <div className={styles.ctaRow}>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleMintLand}
                disabled={connecting}
              >
                Mint Land
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleMintPlant}
                disabled={connecting}
              >
                Mint Plant
              </button>
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={() => setStakingOpen(true)}
              >
                Staking
              </button>
            </div>

            {mintStatus && (
              <p
                style={{
                  marginTop: 8,
                  fontSize: 12,
                  opacity: 0.9,
                  maxWidth: 420,
                }}
              >
                {mintStatus}
              </p>
            )}

            <div className={styles.ctaRowSecondary}>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  window.open(
                    "https://element.market/collections/x420-land-1?search[toggles][0]=ALL",
                    "_blank"
                  )
                }
              >
                Trade Land
              </button>
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={() =>
                  window.open(
                    "https://element.market/collections/x420-plants?search[toggles][0]=ALL",
                    "_blank"
                  )
                }
              >
                Trade Plant
              </button>
            </div>
          </div>
        </section>

        {/* GIF section between hero and info card */}
        <section
          style={{
            margin: "18px 0",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <Image
            src="/fcweed-radio.gif"
            alt="FCWEED Radio Vibes"
            width={320}
            height={120}
            style={{
              borderRadius: 16,
              objectFit: "cover",
            }}
          />
        </section>

        <section className={styles.infoCard}>
          <h2 className={styles.heading}>How it Works</h2>
          <ul className={styles.bulletList}>
            <li>Connect your wallet on Base to begin.</li>
            <li>Mint Plant Bud NFTs and stake them for yield.</li>
            <li>Mint Land NFTs (all Lands are equal rarity).</li>
            <li>
              Each Land allows you to stake <b>+3 extra Plant Buds</b>.
            </li>
            <li>
              Each Land grants a <b>+2.5% token boost</b> to all yield earned.
            </li>
            <li>
              The more Land you stack — the stronger your multiplier will be.
            </li>
          </ul>

          <h2 className={styles.heading}>Coming Soon</h2>
          <ul className={styles.bulletList}>
            <li>Plant NFT artwork reveal.</li>
            <li>Reward token + staking UI polish.</li>
            <li>
              Stake, compound, and climb up the Crime Ladder (KOTH leaderboard).
            </li>
          </ul>
        </section>
      </main>

      <footer className={styles.footer}>
        <span>© 2025 FCWEED</span>
      </footer>

      {stakingOpen && (
        <div className={styles.modalBackdrop}>
          <div
            className={styles.modal}
            style={{
              maxWidth: "900px",
              width: "100%",
              height: "90vh",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            <header className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Grow Lab Statistics</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={refreshStaking}
                  disabled={loadingStaking}
                >
                  ⟳
                </button>
                <button
                  type="button"
                  className={styles.modalClose}
                  onClick={() => setStakingOpen(false)}
                >
                  ✕
                </button>
              </div>
            </header>

            <div className={styles.modalStatsGrid}>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Plants Staked</span>
                <span className={styles.statValue}>
                  {stakingStats ? stakingStats.plantsStaked : 0}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Lands Staked</span>
                <span className={styles.statValue}>
                  {stakingStats ? stakingStats.landsStaked : 0}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Capacity</span>
                <span className={styles.statValue}>
                  {stakingStats
                    ? `${stakingStats.capacityUsed}/${stakingStats.totalSlots}`
                    : "0/1"}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Land Boost</span>
                <span className={styles.statValue}>
                  {stakingStats
                    ? `+${stakingStats.landBoostPct.toFixed(1)}%`
                    : "+0.0%"}
                </span>
              </div>
              <div className={styles.statCard}>
                <span className={styles.statLabel}>Pending</span>
                <span
                  className={styles.statValue}
                  style={{ fontSize: 13, wordBreak: "break-all" }}
                >
                  {pendingDisplay}
                </span>
              </div>
            </div>

            <div
              className={styles.modalBody}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
                marginTop: 8,
                paddingBottom: 8,
                flex: 1,
              }}
            >
              <div>
                <div
                  className={styles.nftHeader}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span>Available NFTs ({totalAvailable})</span>
                  <label className={styles.selectAllRow}>
                    <input
                      type="checkbox"
                      checked={
                        totalAvailable > 0 &&
                        selectedAvailPlants.length +
                          selectedAvailLands.length ===
                          totalAvailable
                      }
                      onChange={() => {
                        if (
                          selectedAvailPlants.length +
                            selectedAvailLands.length ===
                          totalAvailable
                        ) {
                          setSelectedAvailPlants([]);
                          setSelectedAvailLands([]);
                        } else {
                          setSelectedAvailPlants(availablePlants);
                          setSelectedAvailLands(availableLands);
                        }
                      }}
                    />
                    <span style={{ marginLeft: 6 }}>Select all</span>
                  </label>
                </div>

                <div
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    gap: 10,
                    padding: "4px 2px 6px",
                  }}
                >
                  {totalAvailable === 0 ? (
                    <div className={styles.emptyState}>
                      <span>No unstaked NFTs for your wallet.</span>
                    </div>
                  ) : (
                    <>
                      {availableLands.map((id) => {
                        const img = landImages[id] || "/hero.png";
                        return (
                          <label
                            key={`al-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedAvailLands.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedAvailLands,
                                  setSelectedAvailLands
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Land #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Land
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}

                      {availablePlants.map((id) => {
                        const img = plantImages[id] || "/hero.png";
                        return (
                          <label
                            key={`ap-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedAvailPlants.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedAvailPlants,
                                  setSelectedAvailPlants
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Plant #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Plants
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              <div style={{ flex: 1 }}>
                <div
                  className={styles.nftHeader}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span>
                    Staked NFTs{" "}
                    {stakedPlants.length + stakedLands.length > 0
                      ? `(${stakedPlants.length + stakedLands.length})`
                      : ""}
                  </span>
                  <span style={{ fontSize: 12 }}>
                    Selected:{" "}
                    {selectedStakedPlants.length +
                      selectedStakedLands.length}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    overflowX: "auto",
                    gap: 10,
                    padding: "4px 2px 6px",
                  }}
                >
                  {stakedPlants.length === 0 && stakedLands.length === 0 ? (
                    <div className={styles.emptyState}>
                      <span>No NFTs currently staked.</span>
                    </div>
                  ) : (
                    <>
                      {stakedLands.map((id) => {
                        const img = landImages[id] || "/hero.png";
                        return (
                          <label
                            key={`sl-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedStakedLands.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedStakedLands,
                                  setSelectedStakedLands
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Land #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Land
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}

                      {stakedPlants.map((id) => {
                        const img = plantImages[id] || "/hero.png";
                        return (
                          <label
                            key={`sp-${id}`}
                            className={styles.nftRow}
                            style={{
                              minWidth: 170,
                              flexShrink: 0,
                              flexDirection: "column",
                              alignItems: "flex-start",
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedStakedPlants.includes(id)}
                              onChange={() =>
                                toggleId(
                                  id,
                                  selectedStakedPlants,
                                  setSelectedStakedPlants
                                )
                              }
                              style={{ marginBottom: 4 }}
                            />
                            <div
                              className={styles.nftThumbWrap}
                              style={{
                                padding: 4,
                                borderRadius: 14,
                                border:
                                  "1px solid rgba(255,255,255,0.18)",
                                background: "#050814",
                              }}
                            >
                              <img
                                src={img}
                                alt={`Plant #${id}`}
                                className={styles.nftThumb}
                                style={{
                                  width: 120,
                                  height: 120,
                                  borderRadius: 10,
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                            <div
                              className={styles.nftMeta}
                              style={{ marginTop: 6 }}
                            >
                              <div
                                className={styles.nftName}
                                style={{ fontSize: 13, fontWeight: 600 }}
                              >
                                x420 Plants
                              </div>
                              <div
                                className={styles.nftSub}
                                style={{ fontSize: 11, opacity: 0.75 }}
                              >
                                #{id}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </>
                  )}
                </div>
              </div>

              <div
                className={styles.actionRow}
                style={{
                  marginTop: "auto",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={stakeDisabled}
                  onClick={handleStakeSelected}
                  style={{
                    padding: "10px 22px",
                    fontSize: 14,
                    borderRadius: 999,
                    minWidth: 88,
                  }}
                >
                  Stake
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={unstakeDisabled}
                  onClick={handleUnstakeSelected}
                  style={{
                    padding: "10px 22px",
                    fontSize: 14,
                    borderRadius: 999,
                    minWidth: 88,
                  }}
                >
                  Unstake
                </button>
                <button
                  type="button"
                  className={styles.btnPrimary}
                  disabled={claimDisabled}
                  onClick={handleClaim}
                  style={{
                    padding: "10px 22px",
                    fontSize: 14,
                    borderRadius: 999,
                    minWidth: 88,
                  }}
                >
                  Claim
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
